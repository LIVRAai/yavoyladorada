import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstName(value: unknown) {
  return normalizeName(value).split(" ")[0] || "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = clean(body?.action, 40);
    const businessId = clean(body?.business_id, 80);
    const phone = normalizePhone(body?.phone);

    if (!businessId) return json({ ok: false, error: "Falta el negocio." }, 400);
    if (!phone || phone.length < 7) return json({ ok: false, error: "Confirma un número de celular válido." }, 400);

    const { data: customer, error } = await db
      .from("local2_customers")
      .select("id,name,phone")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    if (action === "lookup_phone") {
      return json({ ok: true, found: Boolean(customer) });
    }

    if (action === "verify_name") {
      if (!customer) return json({ ok: true, found: false, verified: false });
      const suppliedName = normalizeName(body?.name);
      if (!suppliedName) return json({ ok: false, error: "Confirma tu nombre." }, 400);
      const verified = suppliedName === normalizeName(customer.name) || firstName(suppliedName) === firstName(customer.name);
      return json({
        ok: true,
        found: true,
        verified,
        customer_name: verified ? customer.name : null,
      });
    }

    return json({ ok: false, error: "Acción no soportada" }, 400);
  } catch (error) {
    console.error("local2-identity-api", error);
    return json({ ok: false, error: "No pudimos verificar tu información en este momento." }, 500);
  }
});
