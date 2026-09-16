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

const BUCKET = "local2-payment-proofs";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function safeFileName(value: unknown) {
  const original = clean(value, 180) || "comprobante";
  const normalized = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(-120) || "comprobante";
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

async function requireSession(businessId: string, token: string) {
  const session = await resolveSession(businessId, token);
  if (!session) throw new Error("La sesión venció o no es válida");
  if (!session.customer_id) throw new Error("Necesito identificarte antes de registrar un pago.");
  return session;
}

async function getConversation(businessId: string, sessionId: string) {
  const { data, error } = await db
    .from("local2_conversations")
    .select("id")
    .eq("business_id", businessId)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function addConversationMessage(businessId: string, conversationId: string | null, role: string, content: string, metadata: Record<string, unknown> = {}) {
  if (!conversationId || !content) return;
  const { error } = await db.from("local2_messages").insert({
    business_id: businessId,
    conversation_id: conversationId,
    role,
    content,
    metadata,
  });
  if (error) throw error;
}

async function findOrderForCustomer(businessId: string, customerId: string, orderId = "") {
  let query = db
    .from("local2_orders")
    .select("id,public_code,business_id,customer_id,conversation_id,status,total_cop,created_at")
    .eq("business_id", businessId)
    .eq("customer_id", customerId);

  if (orderId) query = query.eq("id", orderId);
  else query = query.neq("status", "cancelled").order("created_at", { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function paymentMethods(businessId: string) {
  const { data, error } = await db
    .from("local2_payment_methods")
    .select("id,method_type,label,account_holder,destination,qr_url,instructions,sort_order")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

async function proofExists(path: string) {
  const parts = path.split("/");
  const file = parts.pop() || "";
  const folder = parts.join("/");
  if (!file || !folder) return false;
  const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 10, search: file });
  if (error) throw error;
  return Boolean((data || []).some((item) => item.name === file));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = clean(body?.action, 60);
    const businessId = clean(body?.business_id, 80);
    const token = clean(body?.session_token, 220);
    const session = await requireSession(businessId, token);

    if (action === "payment_intent") {
      const message = clean(body?.message, 1200) || "Ya pagué";
      const conversation = await getConversation(businessId, session.id);
      const order = await findOrderForCustomer(businessId, session.customer_id);

      await addConversationMessage(businessId, conversation?.id || null, "user", message, { intent: "payment_report" });

      if (!order) {
        const reply = "No encuentro un pedido activo para asociar el pago. Si acabas de hacer una compra, dime qué pedido necesitas revisar.";
        await addConversationMessage(businessId, conversation?.id || null, "assistant", reply, { intent: "payment_report", result: "no_order" });
        return json({ ok: true, reply, order: null, payment_methods: [] });
      }

      if (order.status === "payment_reported") {
        const reply = `Ya tengo un comprobante reportado para ${order.public_code}. Sigue pendiente de confirmación por el emprendimiento.`;
        await addConversationMessage(businessId, conversation?.id || null, "assistant", reply, { intent: "payment_report", result: "already_reported" });
        return json({ ok: true, reply, order, payment_methods: [] });
      }

      if (["payment_confirmed", "preparing", "ready", "delivered"].includes(order.status)) {
        const reply = `El pago del pedido ${order.public_code} ya figura confirmado. Su estado actual es ${order.status === "payment_confirmed" ? "pago confirmado" : order.status === "preparing" ? "en preparación" : order.status === "ready" ? "listo" : "entregado"}.`;
        await addConversationMessage(businessId, conversation?.id || null, "assistant", reply, { intent: "payment_report", result: "already_confirmed" });
        return json({ ok: true, reply, order, payment_methods: [] });
      }

      if (order.status !== "awaiting_payment") {
        const reply = `Tu pedido ${order.public_code} todavía no está listo para registrar un pago. Puedo ayudarte a revisar su estado.`;
        await addConversationMessage(businessId, conversation?.id || null, "assistant", reply, { intent: "payment_report", result: "not_payable" });
        return json({ ok: true, reply, order, payment_methods: [] });
      }

      const methods = await paymentMethods(businessId);
      const reply = methods.length
        ? `Perfecto. Para registrar el pago de ${order.public_code} por ${money(order.total_cop)}, envíame el comprobante. Puede ser una imagen o PDF. Cuando lo reciba quedará como “Pago por confirmar” hasta que el negocio valide el dinero.`
        : `Encontré tu pedido ${order.public_code} por ${money(order.total_cop)}, pero el negocio todavía no tiene un medio de pago configurado en Local. No voy a inventar uno.`;
      await addConversationMessage(businessId, conversation?.id || null, "assistant", reply, { intent: "payment_report", result: methods.length ? "needs_proof" : "no_payment_method" });
      return json({ ok: true, reply, order, payment_methods: methods });
    }

    if (action === "prepare_upload") {
      const orderId = clean(body?.order_id, 80);
      const fileName = safeFileName(body?.file_name);
      const mimeType = clean(body?.mime_type, 100).toLowerCase();
      const sizeBytes = Number(body?.size_bytes || 0);
      if (!ALLOWED_TYPES.has(mimeType)) return json({ ok: false, error: "El comprobante debe ser JPG, PNG, WEBP o PDF." }, 400);
      if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) return json({ ok: false, error: "El comprobante debe pesar máximo 8 MB." }, 400);

      const order = await findOrderForCustomer(businessId, session.customer_id, orderId);
      if (!order) return json({ ok: false, error: "Pedido no encontrado." }, 404);
      if (order.status !== "awaiting_payment") return json({ ok: false, error: "Este pedido ya no está esperando un comprobante de pago." }, 409);

      const path = `${businessId}/${order.id}/${crypto.randomUUID()}-${fileName}`;
      const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data?.token) throw error || new Error("No pudimos preparar la carga del comprobante.");
      return json({ ok: true, path, token: data.token, bucket: BUCKET });
    }

    if (action === "report_payment_with_proof") {
      const orderId = clean(body?.order_id, 80);
      const proofPath = clean(body?.proof_path, 500);
      const proofFileName = safeFileName(body?.proof_file_name);
      const proofMimeType = clean(body?.proof_mime_type, 100).toLowerCase();
      const proofSizeBytes = Number(body?.proof_size_bytes || 0);
      const paymentMethodId = clean(body?.payment_method_id, 80) || null;
      const payerName = clean(body?.payer_name, 160) || null;

      const order = await findOrderForCustomer(businessId, session.customer_id, orderId);
      if (!order) return json({ ok: false, error: "Pedido no encontrado." }, 404);
      if (order.status === "payment_reported") return json({ ok: false, error: "Este pedido ya tiene un pago pendiente de confirmación." }, 409);
      if (order.status !== "awaiting_payment") return json({ ok: false, error: "Este pedido ya no está esperando pago." }, 409);
      if (!proofPath.startsWith(`${businessId}/${order.id}/`)) return json({ ok: false, error: "El comprobante no corresponde a este pedido." }, 400);
      if (!ALLOWED_TYPES.has(proofMimeType) || !Number.isFinite(proofSizeBytes) || proofSizeBytes <= 0 || proofSizeBytes > MAX_FILE_SIZE) return json({ ok: false, error: "El comprobante no cumple los requisitos permitidos." }, 400);
      if (!(await proofExists(proofPath))) return json({ ok: false, error: "No encontramos el archivo del comprobante. Intenta adjuntarlo nuevamente." }, 400);

      let methodType = null as string | null;
      if (paymentMethodId) {
        const { data: method, error: methodError } = await db
          .from("local2_payment_methods")
          .select("id,method_type")
          .eq("id", paymentMethodId)
          .eq("business_id", businessId)
          .eq("active", true)
          .maybeSingle();
        if (methodError) throw methodError;
        if (!method) return json({ ok: false, error: "El medio de pago seleccionado ya no está disponible." }, 400);
        methodType = method.method_type;
      }

      const { data: payment, error: paymentError } = await db
        .from("local2_payments")
        .insert({
          business_id: businessId,
          order_id: order.id,
          payment_method_id: paymentMethodId,
          method_type: methodType,
          amount_cop: order.total_cop,
          status: "reported",
          payer_name: payerName,
          proof_path: proofPath,
          proof_file_name: proofFileName,
          proof_mime_type: proofMimeType,
          proof_size_bytes: proofSizeBytes,
        })
        .select("id,status,amount_cop,reported_at,proof_file_name")
        .single();
      if (paymentError) throw paymentError;

      await db.from("local2_orders").update({ status: "payment_reported" }).eq("id", order.id);
      await db.from("local2_order_events").insert({
        business_id: businessId,
        order_id: order.id,
        event_type: "payment_reported",
        status: "payment_reported",
        description: "Comprobante recibido. Pago pendiente de confirmación por el emprendimiento.",
      });

      const conversationId = order.conversation_id || (await getConversation(businessId, session.id))?.id || null;
      await addConversationMessage(businessId, conversationId, "user", `📎 Comprobante de pago: ${proofFileName}`, { type: "payment_proof", payment_id: payment.id, order_id: order.id });
      const reply = `Gracias. Ya recibí el comprobante de ${order.public_code} por ${money(order.total_cop)}. El pago quedó pendiente de confirmación por el emprendimiento. Te avisaré en el estado del pedido cuando sea validado.`;
      await addConversationMessage(businessId, conversationId, "assistant", reply, { intent: "payment_report", result: "proof_received", payment_id: payment.id });

      return json({ ok: true, payment, order: { ...order, status: "payment_reported" }, reply });
    }

    return json({ ok: false, error: "Acción no soportada" }, 400);
  } catch (error) {
    console.error("local2-payment-proof-api", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos procesar el comprobante." }, 500);
  }
});
