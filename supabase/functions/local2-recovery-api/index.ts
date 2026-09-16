import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveBusiness(slug: string) {
  const { data: settings, error } = await db.from("local2_business_settings")
    .select("business_id,slug,assistant_enabled")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!settings) return null;

  const { data: business, error: businessError } = await db.from("businesses")
    .select("id,name,status")
    .eq("id", settings.business_id)
    .eq("status", "active")
    .maybeSingle();
  if (businessError) throw businessError;
  return business ? { business, settings } : null;
}

async function resolveSession(businessId: string, token: string) {
  if (!token) return null;
  const hash = await sha256(token);
  const { data, error } = await db.from("local2_customer_sessions")
    .select("id,business_id,customer_id,expires_at")
    .eq("business_id", businessId)
    .eq("token_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function recoverOrder(body: any) {
  const slug = clean(body?.business_slug, 160).toLowerCase();
  const orderCode = clean(body?.order_code, 40).toUpperCase();
  const phone = normalizePhone(body?.phone);
  const email = clean(body?.email, 180).toLowerCase();
  const sessionToken = clean(body?.session_token, 220);

  if (!slug || !orderCode || (!phone && !email) || !sessionToken) {
    return json({ ok: false, error: "Necesitamos el código del pedido y el celular o correo usado en la compra." }, 400);
  }

  const resolved = await resolveBusiness(slug);
  if (!resolved) return json({ ok: false, error: "Emprendimiento no disponible." }, 404);
  const businessId = resolved.business.id;

  const session = await resolveSession(businessId, sessionToken);
  if (!session) return json({ ok: false, error: "La sesión actual no es válida. Recarga la página e intenta nuevamente." }, 401);

  const { data: order, error: orderError } = await db.from("local2_orders")
    .select("id,public_code,status,total_cop,estimated_ready_at,created_at,customer_id")
    .eq("business_id", businessId)
    .eq("public_code", orderCode)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) return json({ ok: false, error: "No encontramos un pedido con ese código." }, 404);

  const { data: customer, error: customerError } = await db.from("local2_customers")
    .select("id,name,phone,email")
    .eq("id", order.customer_id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (customerError) throw customerError;
  if (!customer) return json({ ok: false, error: "No encontramos el cliente asociado al pedido." }, 404);

  const phoneMatches = phone && normalizePhone(customer.phone) === phone;
  const emailMatches = email && String(customer.email || "").trim().toLowerCase() === email;
  if (!phoneMatches && !emailMatches) {
    return json({ ok: false, error: "Los datos no coinciden con los registrados para ese pedido." }, 403);
  }

  const now = new Date().toISOString();
  const { error: sessionError } = await db.from("local2_customer_sessions")
    .update({ customer_id: customer.id, last_seen_at: now })
    .eq("id", session.id)
    .eq("business_id", businessId);
  if (sessionError) throw sessionError;

  const { error: conversationError } = await db.from("local2_conversations")
    .update({ customer_id: customer.id, updated_at: now })
    .eq("session_id", session.id)
    .eq("business_id", businessId)
    .eq("status", "active");
  if (conversationError) throw conversationError;

  const { data: events, error: eventsError } = await db.from("local2_order_events")
    .select("event_type,status,description,created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (eventsError) throw eventsError;

  return json({
    ok: true,
    recovered: true,
    customer: { name: customer.name },
    order: { ...order, events: events || [] },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  try {
    const body = await req.json();
    const action = clean(body?.action, 60);
    if (action === "recover_order") return await recoverOrder(body);
    return json({ ok: false, error: "Acción no soportada" }, 400);
  } catch (error) {
    console.error("local2-recovery-api", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos recuperar el pedido." }, 500);
  }
});
