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

function clean(value: unknown, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveSession(businessId: string, token: string) {
  if (!businessId || !token) return null;
  const tokenHash = await sha256(token);
  const { data, error } = await db
    .from("local2_customer_sessions")
    .select("id,business_id,customer_id,expires_at")
    .eq("business_id", businessId)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function activeConversation(businessId: string, sessionId: string) {
  const { data, error } = await db
    .from("local2_conversations")
    .select("id,customer_id")
    .eq("business_id", businessId)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = clean(body?.action, 60);
    if (action !== "request_human") return json({ ok: false, error: "Acción no soportada" }, 400);

    const businessId = clean(body?.business_id, 80);
    const token = clean(body?.session_token, 220);
    const message = clean(body?.message, 1200) || "Quiero hablar con alguien";
    const contactPhone = normalizePhone(body?.contact_phone);
    const session = await resolveSession(businessId, token);
    if (!session) return json({ ok: false, error: "La sesión venció o no es válida" }, 401);
    if (!session.customer_id && contactPhone.length < 7) {
      return json({
        ok: false,
        needs_contact: true,
        error: "Déjame un celular de contacto para que el negocio pueda responderte.",
      }, 400);
    }

    const conversation = await activeConversation(businessId, session.id);
    if (!conversation) return json({ ok: false, error: "No encontramos una conversación activa." }, 404);

    const { data: existing, error: existingError } = await db
      .from("local2_handoffs")
      .select("id,status,created_at")
      .eq("business_id", businessId)
      .eq("conversation_id", conversation.id)
      .eq("status", "open")
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      return json({
        ok: true,
        handoff: existing,
        reply: "Tu solicitud ya está en la cola del negocio. No necesitas enviarla otra vez.",
        already_open: true,
      });
    }

    const { data: handoff, error: handoffError } = await db
      .from("local2_handoffs")
      .insert({
        business_id: businessId,
        conversation_id: conversation.id,
        session_id: session.id,
        customer_id: session.customer_id,
        contact_phone: session.customer_id ? null : contactPhone,
        reason: "customer_requested_human",
        last_customer_message: message,
      })
      .select("id,status,created_at")
      .single();
    if (handoffError) throw handoffError;

    await db.from("local2_messages").insert([
      {
        business_id: businessId,
        conversation_id: conversation.id,
        role: "user",
        content: message,
        metadata: { handoff: true, intent: "request_human" },
      },
      {
        business_id: businessId,
        conversation_id: conversation.id,
        role: "assistant",
        content: "Listo. Dejé tu solicitud para que el negocio la revise. Mientras tanto puedo seguir ayudándote por aquí.",
        metadata: { handoff: true, status: "open" },
      },
    ]);

    return json({
      ok: true,
      handoff,
      reply: "Listo. Dejé tu solicitud para que el negocio la revise. Mientras tanto puedo seguir ayudándote por aquí.",
      already_open: false,
    });
  } catch (error) {
    console.error("local2-handoff-api", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos escalar la conversación." }, 500);
  }
});
