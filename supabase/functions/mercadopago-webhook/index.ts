import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

function parseSignature(header: string | null) {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

async function hmacSha256Hex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function mapSubscriptionStatus(status: string | undefined) {
  if (status === "authorized") return "authorized";
  if (status === "paused") return "paused";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function withinGrace(graceEndsAt: string | null | undefined) {
  if (!graceEndsAt) return false;
  const date = new Date(graceEndsAt);
  return !Number.isNaN(date.getTime()) && Date.now() < date.getTime();
}

async function fetchMercadoPagoJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Mercado Pago resource fetch failed", { url, status: response.status, response: data });
    throw new Error(`mercadopago_fetch_failed_${response.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !mercadoPagoToken || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const url = new URL(req.url);
  const dataId = (url.searchParams.get("data.id") || url.searchParams.get("data_id") || "").toLowerCase();
  const requestId = req.headers.get("x-request-id") || "";
  const signatureParts = parseSignature(req.headers.get("x-signature"));
  if (!dataId || !requestId || !signatureParts) return jsonResponse({ ok: false, error: "invalid_webhook_signature_headers" }, 401);

  const manifest = `id:${dataId};request-id:${requestId};ts:${signatureParts.ts};`;
  const expectedSignature = await hmacSha256Hex(webhookSecret, manifest);
  if (!timingSafeEqualHex(expectedSignature, signatureParts.v1)) return jsonResponse({ ok: false, error: "invalid_webhook_signature" }, 401);

  let payload: { type?: string; action?: string; data?: { id?: string | number } };
  try { payload = await req.json(); }
  catch { return jsonResponse({ ok: false, error: "invalid_json" }, 400); }

  const topic = payload.type || url.searchParams.get("type") || "";
  const resourceId = String(payload.data?.id ?? dataId);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (topic === "subscription_preapproval") {
      const subscription = await fetchMercadoPagoJson(`https://api.mercadopago.com/preapproval/${encodeURIComponent(resourceId)}`, mercadoPagoToken);
      const businessId = String(subscription.external_reference || "");
      if (!businessId) return jsonResponse({ ok: true, ignored: "missing_external_reference" });

      const { data: business, error: businessError } = await admin
        .from("businesses")
        .select("id,status,trial_started_at,grace_ends_at")
        .eq("id", businessId)
        .maybeSingle();
      if (businessError) return jsonResponse({ ok: false, error: "business_lookup_failed" }, 500);
      if (!business) return jsonResponse({ ok: true, ignored: "unknown_business" });

      const now = new Date().toISOString();
      const mappedStatus = mapSubscriptionStatus(subscription.status);
      const record: Record<string, unknown> = {
        business_id: businessId,
        provider: "mercadopago",
        mp_preapproval_id: subscription.id,
        status: mappedStatus,
        amount_cop: subscription.auto_recurring?.transaction_amount ?? null,
        next_payment_date: subscription.next_payment_date ?? null,
        updated_at: now
      };
      if (subscription.preapproval_plan_id) record.mp_plan_id = subscription.preapproval_plan_id;

      const { error: subscriptionError } = await admin.from("business_subscriptions").upsert(record, { onConflict: "business_id" });
      if (subscriptionError) return jsonResponse({ ok: false, error: "subscription_update_failed" }, 500);

      const graceActive = Boolean(business.trial_started_at && withinGrace(business.grace_ends_at));
      let nextStatus: string | null = null;
      if (!graceActive) {
        if (subscription.status === "pending") nextStatus = "pending_payment";
        if (subscription.status === "paused" || subscription.status === "cancelled") nextStatus = "suspended";
      } else if (business.status !== "active") {
        nextStatus = "active";
      }

      if (nextStatus && business.status !== nextStatus) {
        const { error: statusError } = await admin.from("businesses").update({ status: nextStatus, updated_at: now }).eq("id", businessId);
        if (statusError) return jsonResponse({ ok: false, error: "business_status_update_failed" }, 500);
      }

      return jsonResponse({ ok: true, processed: topic, grace_active: graceActive });
    }

    if (topic === "subscription_authorized_payment") {
      const invoice = await fetchMercadoPagoJson(`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`, mercadoPagoToken);
      if (!invoice.preapproval_id) return jsonResponse({ ok: true, ignored: "authorized_payment_without_subscription" });

      const subscription = await fetchMercadoPagoJson(`https://api.mercadopago.com/preapproval/${encodeURIComponent(invoice.preapproval_id)}`, mercadoPagoToken);
      const businessId = String(subscription.external_reference || invoice.external_reference || "");
      if (!businessId) return jsonResponse({ ok: true, ignored: "missing_external_reference" });

      const { data: business, error: businessError } = await admin
        .from("businesses")
        .select("id,status,trial_started_at,grace_ends_at")
        .eq("id", businessId)
        .maybeSingle();
      if (businessError) return jsonResponse({ ok: false, error: "business_lookup_failed" }, 500);
      if (!business) return jsonResponse({ ok: true, ignored: "unknown_business" });

      const now = new Date().toISOString();
      const paymentStatus = invoice.payment?.status || null;
      const record: Record<string, unknown> = {
        business_id: businessId,
        provider: "mercadopago",
        mp_preapproval_id: subscription.id,
        status: mapSubscriptionStatus(subscription.status),
        amount_cop: subscription.auto_recurring?.transaction_amount ?? invoice.transaction_amount ?? null,
        next_payment_date: subscription.next_payment_date ?? null,
        updated_at: now
      };
      if (paymentStatus === "approved") record.last_payment_date = invoice.debit_date || invoice.last_modified || now;

      const { error: subscriptionError } = await admin.from("business_subscriptions").upsert(record, { onConflict: "business_id" });
      if (subscriptionError) return jsonResponse({ ok: false, error: "subscription_update_failed" }, 500);

      const graceActive = Boolean(business.trial_started_at && withinGrace(business.grace_ends_at));
      let nextStatus: string | null = null;
      if (paymentStatus === "approved") nextStatus = "active";
      else if (paymentStatus && graceActive) nextStatus = "active";
      else if (paymentStatus) nextStatus = "suspended";

      if (nextStatus && business.status !== nextStatus) {
        const { error: statusError } = await admin.from("businesses").update({ status: nextStatus, updated_at: now }).eq("id", businessId);
        if (statusError) return jsonResponse({ ok: false, error: "business_status_update_failed" }, 500);
      }

      return jsonResponse({ ok: true, processed: topic, payment_status: paymentStatus, grace_active: graceActive });
    }

    if (topic === "payment") return jsonResponse({ ok: true, acknowledged: "payment" });
    return jsonResponse({ ok: true, ignored: topic || "unknown_topic" });
  } catch (error) {
    console.error("Webhook processing failed", error);
    return jsonResponse({ ok: false, error: "webhook_processing_failed" }, 500);
  }
});
