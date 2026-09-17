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

const DEMO_PREFIX = "[DEMO LOCAL2]";
const GAIA_SLUG = "gaia-by-paula-rivera";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

async function getDemoBusiness() {
  const { data: setting, error: settingError } = await db
    .from("local2_business_settings")
    .select("business_id,slug,assistant_name,assistant_role,assistant_enabled,business_mode,welcome_message")
    .eq("slug", GAIA_SLUG)
    .maybeSingle();
  if (settingError) throw settingError;
  if (!setting) throw new Error("Piloto demo no disponible");

  const { data: business, error: businessError } = await db
    .from("businesses")
    .select("id,name,category,city,image_url,status")
    .eq("id", setting.business_id)
    .maybeSingle();
  if (businessError) throw businessError;
  if (!business) throw new Error("Negocio demo no disponible");
  return { business, setting };
}

async function loadSnapshot() {
  const { business, setting } = await getDemoBusiness();
  const businessId = business.id;

  const [ordersResult, productsResult, methodsResult, subscriptionResult] = await Promise.all([
    db.from("local2_orders")
      .select("id,public_code,status,total_cop,notes,estimated_ready_at,created_at,updated_at,customer:local2_customers(name,phone,email),items:local2_order_items(name_snapshot,quantity,unit_price_cop,subtotal_cop),payments:local2_payments(id,method_type,amount_cop,status,payer_name,reported_at,confirmed_at),events:local2_order_events(event_type,status,description,created_at)")
      .eq("business_id", businessId)
      .like("notes", `${DEMO_PREFIX}%`)
      .order("created_at", { ascending: false }),
    db.from("local2_products").select("id,name,price_cop,stock_quantity,track_stock,active").eq("business_id", businessId).order("sort_order"),
    db.from("local2_payment_methods").select("id,method_type,label,destination,instructions,active").eq("business_id", businessId).like("instructions", `${DEMO_PREFIX}%`).order("sort_order"),
    db.from("local2_assistant_subscriptions").select("status,amount_cop,trial_ends_at,next_payment_date").eq("business_id", businessId).maybeSingle(),
  ]);

  for (const result of [ordersResult, productsResult, methodsResult, subscriptionResult]) {
    if (result.error) throw result.error;
  }

  const orders = ordersResult.data || [];
  const totalPipeline = orders.filter((o: any) => o.status !== "cancelled").reduce((sum: number, o: any) => sum + Number(o.total_cop || 0), 0);
  const pendingPayments = orders.filter((o: any) => o.status === "payment_reported").length;
  const activeProduction = orders.filter((o: any) => ["payment_confirmed", "preparing", "ready"].includes(o.status)).length;

  return {
    ok: true,
    demo: true,
    business,
    settings: setting,
    subscription: subscriptionResult.data,
    products: productsResult.data || [],
    payment_methods: methodsResult.data || [],
    orders,
    metrics: {
      orders: orders.length,
      total_pipeline_cop: totalPipeline,
      pending_payments: pendingPayments,
      active_production: activeProduction,
    },
  };
}

async function requireDemoOrder(orderId: string) {
  const { business } = await getDemoBusiness();
  const { data: order, error } = await db.from("local2_orders")
    .select("id,public_code,business_id,status,total_cop,notes")
    .eq("id", orderId)
    .eq("business_id", business.id)
    .like("notes", `${DEMO_PREFIX}%`)
    .maybeSingle();
  if (error) throw error;
  if (!order) throw new Error("Pedido demo no encontrado");
  return order;
}

async function addEvent(order: any, eventType: string, status: string, description: string) {
  const { error } = await db.from("local2_order_events").insert({
    business_id: order.business_id,
    order_id: order.id,
    event_type: eventType,
    status,
    description: `${DEMO_PREFIX} ${description}`,
  });
  if (error) throw error;
}

async function confirmPayment(orderId: string) {
  const order = await requireDemoOrder(orderId);
  if (order.status !== "payment_reported") throw new Error("Este pedido no tiene un pago pendiente de confirmación");

  const { data: payment, error: paymentError } = await db.from("local2_payments")
    .select("id,status")
    .eq("order_id", order.id)
    .eq("business_id", order.business_id)
    .eq("status", "reported")
    .order("reported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new Error("No encontramos el pago reportado");

  const now = new Date().toISOString();
  const { error: updatePaymentError } = await db.from("local2_payments")
    .update({ status: "confirmed", confirmed_at: now })
    .eq("id", payment.id);
  if (updatePaymentError) throw updatePaymentError;

  const { error: updateOrderError } = await db.from("local2_orders")
    .update({ status: "payment_confirmed", updated_at: now })
    .eq("id", order.id);
  if (updateOrderError) throw updateOrderError;

  await addEvent(order, "payment_confirmed", "payment_confirmed", "Pago confirmado por el negocio en la simulación.");
  return loadSnapshot();
}

async function reportDemoPayment(orderId: string) {
  const order = await requireDemoOrder(orderId);
  if (order.status !== "awaiting_payment") throw new Error("Este pedido no está esperando pago");

  const { data: method, error: methodError } = await db.from("local2_payment_methods")
    .select("id,method_type")
    .eq("business_id", order.business_id)
    .eq("active", true)
    .like("instructions", `${DEMO_PREFIX}%`)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (methodError) throw methodError;
  if (!method) throw new Error("No hay un medio de pago demo activo");

  const { error: paymentError } = await db.from("local2_payments").insert({
    business_id: order.business_id,
    order_id: order.id,
    payment_method_id: method.id,
    method_type: method.method_type,
    amount_cop: order.total_cop,
    status: "reported",
    payer_name: "Cliente DEMO",
  });
  if (paymentError) throw paymentError;

  const { error: updateError } = await db.from("local2_orders").update({ status: "payment_reported" }).eq("id", order.id);
  if (updateError) throw updateError;
  await addEvent(order, "payment_reported", "payment_reported", "El cliente reportó un pago simulado. Pendiente de validación.");
  return loadSnapshot();
}

async function advanceOrder(orderId: string) {
  const order = await requireDemoOrder(orderId);
  const next: Record<string, string> = {
    payment_confirmed: "preparing",
    preparing: "ready",
    ready: "delivered",
  };
  const nextStatus = next[order.status];
  if (!nextStatus) throw new Error("Este pedido no puede avanzar desde su estado actual");

  const descriptions: Record<string, string> = {
    preparing: "El pedido pasó a preparación.",
    ready: "El pedido quedó listo para entregar.",
    delivered: "El pedido fue marcado como entregado.",
  };
  const { error } = await db.from("local2_orders").update({ status: nextStatus }).eq("id", order.id);
  if (error) throw error;
  await addEvent(order, nextStatus, nextStatus, descriptions[nextStatus]);
  return loadSnapshot();
}

async function resetDemo() {
  const { business } = await getDemoBusiness();
  const { data: orders, error } = await db.from("local2_orders")
    .select("id,notes")
    .eq("business_id", business.id)
    .like("notes", `${DEMO_PREFIX}%`);
  if (error) throw error;

  for (const order of orders || []) {
    let status = "awaiting_payment";
    if (order.notes.includes("confirmación manual")) status = "payment_reported";
    else if (order.notes.includes("estado en preparación")) status = "preparing";
    else if (order.notes.includes("listo para entrega")) status = "ready";
    else if (order.notes.includes("completado")) status = "delivered";

    await db.from("local2_order_events").delete().eq("order_id", order.id);
    await db.from("local2_payments").delete().eq("order_id", order.id);
    await db.from("local2_orders").update({ status }).eq("id", order.id);

    await addEvent({ id: order.id, business_id: business.id }, "created", "awaiting_payment", "Pedido demo creado.");

    if (["payment_reported", "preparing", "ready", "delivered"].includes(status)) {
      const { data: method } = await db.from("local2_payment_methods")
        .select("id,method_type")
        .eq("business_id", business.id)
        .eq("active", true)
        .like("instructions", `${DEMO_PREFIX}%`)
        .order("sort_order")
        .limit(1)
        .maybeSingle();
      if (method) {
        await db.from("local2_payments").insert({
          business_id: business.id,
          order_id: order.id,
          payment_method_id: method.id,
          method_type: method.method_type,
          amount_cop: (await db.from("local2_orders").select("total_cop").eq("id", order.id).single()).data?.total_cop || 0,
          status: status === "payment_reported" ? "reported" : "confirmed",
          payer_name: "Cliente DEMO",
          confirmed_at: status === "payment_reported" ? null : new Date().toISOString(),
        });
      }
      await addEvent({ id: order.id, business_id: business.id }, status === "payment_reported" ? "payment_reported" : "payment_confirmed", status === "payment_reported" ? "payment_reported" : "payment_confirmed", status === "payment_reported" ? "Pago demo reportado; falta confirmarlo." : "Pago demo confirmado.");
    }
    if (["preparing", "ready", "delivered"].includes(status)) await addEvent({ id: order.id, business_id: business.id }, "preparing", "preparing", "Pedido en preparación.");
    if (["ready", "delivered"].includes(status)) await addEvent({ id: order.id, business_id: business.id }, "ready", "ready", "Pedido listo.");
    if (status === "delivered") await addEvent({ id: order.id, business_id: business.id }, "delivered", "delivered", "Pedido entregado.");
  }
  return loadSnapshot();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);
  try {
    const body = await req.json();
    const action = clean(body?.action, 60);
    if (action === "snapshot") return json(await loadSnapshot());
    if (action === "confirm_payment") return json(await confirmPayment(clean(body?.order_id, 80)));
    if (action === "report_payment") return json(await reportDemoPayment(clean(body?.order_id, 80)));
    if (action === "advance_order") return json(await advanceOrder(clean(body?.order_id, 80)));
    if (action === "reset") return json(await resetDemo());
    return json({ ok: false, error: "Acción demo no soportada" }, 400);
  } catch (error) {
    console.error("local2-demo-api", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos completar la simulación" }, 500);
  }
});
