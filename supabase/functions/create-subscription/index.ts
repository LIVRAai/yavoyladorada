import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MONTHLY_AMOUNT_COP = 29900;
const RETURN_URL = "https://yavoyladorada.vercel.app/retorno-pago.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function mapSubscriptionStatus(status: string | undefined) {
  if (status === "authorized") return "authorized";
  if (status === "paused") return "paused";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mercadoPagoToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");

  if (!supabaseUrl || !serviceRoleKey || !mercadoPagoToken) {
    return jsonResponse({ ok: false, error: "server_not_configured" }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return jsonResponse({ ok: false, error: "authentication_required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: { user }, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !user) return jsonResponse({ ok: false, error: "invalid_session" }, 401);
  if (!user.email) return jsonResponse({ ok: false, error: "user_email_required" }, 400);

  let payload: { business_id?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const businessId = payload.business_id?.trim();
  if (!businessId) return jsonResponse({ ok: false, error: "business_id_required" }, 400);

  const { data: business, error: businessError } = await admin
    .from("businesses")
    .select("id, owner_id, name, status")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError) {
    console.error("Error reading business", businessError);
    return jsonResponse({ ok: false, error: "business_lookup_failed" }, 500);
  }
  if (!business) return jsonResponse({ ok: false, error: "business_not_found" }, 404);
  if (business.owner_id !== user.id) return jsonResponse({ ok: false, error: "business_forbidden" }, 403);

  const { data: existingSubscription, error: existingSubscriptionError } = await admin
    .from("business_subscriptions")
    .select("mp_preapproval_id, status")
    .eq("business_id", businessId)
    .maybeSingle();

  if (existingSubscriptionError) {
    console.error("Error reading existing subscription", existingSubscriptionError);
    return jsonResponse({ ok: false, error: "subscription_lookup_failed" }, 500);
  }

  if (existingSubscription?.mp_preapproval_id && existingSubscription.status !== "cancelled") {
    const currentResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(existingSubscription.mp_preapproval_id)}`,
      { headers: { Authorization: `Bearer ${mercadoPagoToken}` } }
    );

    if (!currentResponse.ok) {
      console.error("Mercado Pago could not read existing subscription", currentResponse.status);
      return jsonResponse({ ok: false, error: "mercadopago_existing_subscription_lookup_failed" }, 502);
    }

    const currentSubscription = await currentResponse.json();
    if (currentSubscription.status !== "cancelled") {
      return jsonResponse({
        ok: true,
        reused: true,
        business_id: businessId,
        subscription_id: currentSubscription.id,
        status: currentSubscription.status,
        amount_cop: MONTHLY_AMOUNT_COP,
        init_point: currentSubscription.init_point || null
      });
    }
  }

  const mercadoPagoResponse = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mercadoPagoToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      reason: "Local 💚 - Membresía mensual",
      external_reference: businessId,
      payer_email: user.email,
      back_url: RETURN_URL,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: MONTHLY_AMOUNT_COP,
        currency_id: "COP"
      },
      status: "pending"
    })
  });

  const mercadoPagoData = await mercadoPagoResponse.json().catch(() => null);
  if (!mercadoPagoResponse.ok || !mercadoPagoData?.id) {
    console.error("Mercado Pago subscription creation failed", {
      status: mercadoPagoResponse.status,
      response: mercadoPagoData
    });
    return jsonResponse({
      ok: false,
      error: "mercadopago_subscription_creation_failed",
      mercadopago_status: mercadoPagoResponse.status,
      mercadopago_message: mercadoPagoData?.message || null
    }, 502);
  }

  const now = new Date().toISOString();
  const { error: subscriptionSaveError } = await admin
    .from("business_subscriptions")
    .upsert({
      business_id: businessId,
      provider: "mercadopago",
      mp_preapproval_id: mercadoPagoData.id,
      status: mapSubscriptionStatus(mercadoPagoData.status),
      amount_cop: MONTHLY_AMOUNT_COP,
      next_payment_date: mercadoPagoData.next_payment_date || null,
      updated_at: now
    }, { onConflict: "business_id" });

  if (subscriptionSaveError) {
    console.error("Error saving subscription", subscriptionSaveError);
    return jsonResponse({ ok: false, error: "subscription_persistence_failed" }, 500);
  }

  const { error: businessUpdateError } = await admin
    .from("businesses")
    .update({ status: "pending_payment", updated_at: now })
    .eq("id", businessId)
    .eq("owner_id", user.id);

  if (businessUpdateError) {
    console.error("Error updating business status", businessUpdateError);
    return jsonResponse({ ok: false, error: "business_status_update_failed" }, 500);
  }

  return jsonResponse({
    ok: true,
    reused: false,
    business_id: businessId,
    business_name: business.name,
    subscription_id: mercadoPagoData.id,
    status: mercadoPagoData.status,
    amount_cop: MONTHLY_AMOUNT_COP,
    init_point: mercadoPagoData.init_point || null
  });
});
