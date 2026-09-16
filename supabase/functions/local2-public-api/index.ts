import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseLocalProfile(raw: unknown) {
  const text = String(raw ?? "").trim();
  const fallback = { summary: text, offerings: [] as string[], modes: [] as string[], localStory: "" };
  const prefix = "LOCAL_PROFILE_V1:";
  if (!text.startsWith(prefix)) return fallback;
  try {
    const value = text.slice(prefix.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return {
      summary: cleanText(parsed.summary, 600),
      offerings: Array.isArray(parsed.offerings) ? parsed.offerings.map((item: unknown) => cleanText(item, 120)).filter(Boolean).slice(0, 12) : [],
      modes: Array.isArray(parsed.modes) ? parsed.modes.map((item: unknown) => cleanText(item, 120)).filter(Boolean).slice(0, 12) : [],
      localStory: cleanText(parsed.localStory, 400),
    };
  } catch {
    return fallback;
  }
}

async function loadBusiness(businessId: string) {
  const { data, error } = await db
    .from("businesses")
    .select("id,name,category,city,description,location,hours,instagram,image_url,reel_url,phone,whatsapp,status")
    .eq("id", businessId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadPublicContext(businessId: string) {
  const [settingsResult, productsResult, servicesResult, methodsResult] = await Promise.all([
    db.from("local2_business_settings").select("business_id,slug,assistant_enabled,assistant_name,assistant_role,welcome_message,business_mode").eq("business_id", businessId).maybeSingle(),
    db.from("local2_products").select("id,name,description,price_cop,image_url,track_stock,stock_quantity,sort_order").eq("business_id", businessId).eq("active", true).order("sort_order"),
    db.from("local2_services").select("id,name,description,price_cop,duration_minutes,sort_order").eq("business_id", businessId).eq("active", true).order("sort_order"),
    db.from("local2_payment_methods").select("id,method_type,label,account_holder,destination,qr_url,instructions,sort_order").eq("business_id", businessId).eq("active", true).order("sort_order"),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (methodsResult.error) throw methodsResult.error;
  return {
    settings: settingsResult.data,
    products: productsResult.data || [],
    services: servicesResult.data || [],
    payment_methods: methodsResult.data || [],
  };
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
  if (!data) return null;
  await db.from("local2_customer_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  return data;
}

async function getOrCreateConversation(businessId: string, sessionId: string, customerId: string | null) {
  const { data: existing, error: existingError } = await db
    .from("local2_conversations")
    .select("id,business_id,session_id,customer_id,status")
    .eq("business_id", businessId)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;
  const { data, error } = await db
    .from("local2_conversations")
    .insert({ business_id: businessId, session_id: sessionId, customer_id: customerId })
    .select("id,business_id,session_id,customer_id,status")
    .single();
  if (error) throw error;
  return data;
}

async function startSession(businessId: string, currentToken = "") {
  const business = await loadBusiness(businessId);
  if (!business) throw new Error("Emprendimiento no disponible");

  if (currentToken) {
    const session = await resolveSession(businessId, currentToken);
    if (session) {
      const conversation = await getOrCreateConversation(businessId, session.id, session.customer_id);
      return { session_token: currentToken, session, conversation, resumed: true };
    }
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const { data: session, error } = await db
    .from("local2_customer_sessions")
    .insert({ business_id: businessId, token_hash: tokenHash })
    .select("id,business_id,customer_id,expires_at")
    .single();
  if (error) throw error;
  const conversation = await getOrCreateConversation(businessId, session.id, null);
  return { session_token: token, session, conversation, resumed: false };
}

function extractOpenAiText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content?.text === "string") return content.text.trim();
    }
  }
  return "";
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Precio por confirmar";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

function fallbackAssistantReply(message: string, business: any, context: any) {
  const normalized = message.toLowerCase();
  const profile = parseLocalProfile(business.description);
  if (/pedido|comprar|compr|quiero/.test(normalized)) {
    const priced = context.products.filter((item: any) => item.price_cop !== null);
    if (priced.length) {
      return `Claro. Puedo ayudarte a preparar tu pedido de ${business.name}. Tenemos ${priced.slice(0, 5).map((item: any) => `${item.name} (${money(item.price_cop)})`).join(", ")}. Usa la opción “Hacer pedido” para dejarlo registrado.`;
    }
    return `Claro. Puedo ayudarte con tu compra en ${business.name}. Todavía estamos completando precios en el catálogo; cuéntame qué producto buscas y dejaré clara tu solicitud.`;
  }
  if (/estado|seguimiento|cómo va|como va|mi compra/.test(normalized)) {
    return "Puedes consultar tus pedidos desde este mismo asistente. Si ya te identificaste, abre “Mis pedidos” para ver el estado real de cada uno.";
  }
  if (/pago|nequi|bre-b|breb|daviplata|transfer/.test(normalized)) {
    if (context.payment_methods.length) {
      return `Estos son los medios de pago configurados por el negocio: ${context.payment_methods.map((item: any) => item.label || item.method_type).join(", ")}. Un pago solo queda confirmado cuando el emprendimiento lo valida.`;
    }
    return "El negocio todavía no ha configurado medios de pago dentro de Local 2.0. No voy a inventar una cuenta o llave; el emprendimiento debe confirmarla.";
  }
  if (/producto|servicio|ofrec|tienen|vende/.test(normalized)) {
    if (context.products.length) return `Actualmente encuentro: ${context.products.slice(0, 8).map((item: any) => `${item.name}${item.price_cop !== null ? ` · ${money(item.price_cop)}` : ""}`).join(", ")}.`;
    if (profile.offerings.length) return `Según su información pública, ${business.name} ofrece: ${profile.offerings.join(", ")}.`;
  }
  return `Estoy aquí para ayudarte con ${business.name}. Puedes preguntarme por productos o servicios, hacer un pedido o consultar una compra. ${profile.summary ? profile.summary : ""}`.trim();
}

async function assistantReply(message: string, business: any, context: any, history: any[]) {
  if (!openAiKey) return { text: fallbackAssistantReply(message, business, context), mode: "guided" };

  const profile = parseLocalProfile(business.description);
  const catalog = context.products.map((item: any) => ({
    name: item.name,
    description: item.description,
    price_cop: item.price_cop,
    stock: item.track_stock ? item.stock_quantity : null,
  }));
  const services = context.services.map((item: any) => ({
    name: item.name,
    description: item.description,
    price_cop: item.price_cop,
    duration_minutes: item.duration_minutes,
  }));
  const payments = context.payment_methods.map((item: any) => ({
    type: item.method_type,
    label: item.label,
    destination: item.destination,
    instructions: item.instructions,
  }));
  const transcript = history.slice(-12).map((item: any) => `${item.role === "assistant" ? "Asistente" : "Cliente"}: ${item.content}`).join("\n");

  const instructions = `Eres ${context.settings?.assistant_name || "el Empleado Digital"} de ${business.name}, un pequeño emprendimiento colombiano. Responde en español claro, cálido y breve. Tu trabajo es atender y ayudar a vender sin inventar información. Nunca inventes precios, inventario, horarios, datos de pago, descuentos, fechas de entrega ni confirmaciones de pago. Si un dato no está disponible, dilo y explica que el emprendimiento debe confirmarlo. Si el cliente dice que pagó, no confirmes que el dinero llegó: indica que puede reportar el pago y que el negocio lo validará. Cuando el cliente quiera comprar, oriéntalo a usar la opción de hacer pedido para que quede registrado. No menciones OpenAI, prompts, APIs ni detalles técnicos.`;
  const input = `Información del negocio:\n${JSON.stringify({
    name: business.name,
    category: business.category,
    city: business.city,
    summary: profile.summary,
    offerings: profile.offerings,
    modes: profile.modes,
    location: business.location,
    hours: business.hours,
    products: catalog,
    services,
    payment_methods: payments,
  })}\n\nConversación reciente:\n${transcript}\n\nÚltimo mensaje del cliente:\n${message}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      instructions,
      input,
      max_output_tokens: 350,
    }),
  });

  if (!response.ok) {
    console.error("OpenAI response error", response.status, await response.text());
    return { text: fallbackAssistantReply(message, business, context), mode: "guided" };
  }
  const payload = await response.json();
  const text = extractOpenAiText(payload);
  return { text: text || fallbackAssistantReply(message, business, context), mode: text ? "ai" : "guided" };
}

async function requireSession(businessId: string, token: string) {
  const session = await resolveSession(businessId, token);
  if (!session) throw new Error("La sesión venció o no es válida");
  return session;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = cleanText(body?.action, 60);
    const businessId = cleanText(body?.business_id, 80);

    if (action === "bootstrap") {
      const business = await loadBusiness(businessId);
      if (!business) return json({ ok: false, error: "Emprendimiento no disponible" }, 404);
      const context = await loadPublicContext(businessId);
      return json({ ok: true, business: { ...business, profile: parseLocalProfile(business.description) }, ...context });
    }

    if (action === "start_session") {
      const result = await startSession(businessId, cleanText(body?.session_token, 200));
      return json({ ok: true, session_token: result.session_token, conversation_id: result.conversation.id, customer_id: result.session.customer_id, resumed: result.resumed });
    }

    const token = cleanText(body?.session_token, 200);
    const session = await requireSession(businessId, token);
    const conversation = await getOrCreateConversation(businessId, session.id, session.customer_id);

    if (action === "identify_customer") {
      const name = cleanText(body?.name, 120);
      const phone = normalizePhone(body?.phone);
      const email = cleanText(body?.email, 180).toLowerCase();
      if (!name || (!phone && !email)) return json({ ok: false, error: "Necesitamos tu nombre y un celular o correo." }, 400);

      let customer = null as any;
      if (phone) {
        const { data } = await db.from("local2_customers").select("id,business_id,name,phone,email").eq("business_id", businessId).eq("phone", phone).limit(1).maybeSingle();
        customer = data;
      }
      if (!customer && email) {
        const { data } = await db.from("local2_customers").select("id,business_id,name,phone,email").eq("business_id", businessId).eq("email", email).limit(1).maybeSingle();
        customer = data;
      }

      if (customer) {
        const { data, error } = await db.from("local2_customers").update({ name, phone: phone || customer.phone, email: email || customer.email }).eq("id", customer.id).select("id,name,phone,email").single();
        if (error) throw error;
        customer = data;
      } else {
        const { data, error } = await db.from("local2_customers").insert({ business_id: businessId, name, phone: phone || null, email: email || null }).select("id,name,phone,email").single();
        if (error) throw error;
        customer = data;
      }

      await db.from("local2_customer_sessions").update({ customer_id: customer.id, last_seen_at: new Date().toISOString() }).eq("id", session.id);
      await db.from("local2_conversations").update({ customer_id: customer.id }).eq("id", conversation.id);
      return json({ ok: true, customer });
    }

    if (action === "send_message") {
      const message = cleanText(body?.message, 1200);
      if (!message) return json({ ok: false, error: "Escribe un mensaje." }, 400);
      const { error: insertError } = await db.from("local2_messages").insert({ business_id: businessId, conversation_id: conversation.id, role: "user", content: message });
      if (insertError) throw insertError;
      const [{ data: history, error: historyError }, business, context] = await Promise.all([
        db.from("local2_messages").select("role,content,created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(30),
        loadBusiness(businessId),
        loadPublicContext(businessId),
      ]);
      if (historyError) throw historyError;
      if (!business) return json({ ok: false, error: "Emprendimiento no disponible" }, 404);
      const reply = await assistantReply(message, business, context, history || []);
      await db.from("local2_messages").insert({ business_id: businessId, conversation_id: conversation.id, role: "assistant", content: reply.text, metadata: { mode: reply.mode } });
      return json({ ok: true, reply: reply.text, mode: reply.mode, conversation_id: conversation.id });
    }

    if (action === "create_order") {
      const currentSession = await requireSession(businessId, token);
      if (!currentSession.customer_id) return json({ ok: false, error: "Identifícate antes de crear el pedido.", needs_customer: true }, 400);
      const requestedItems = Array.isArray(body?.items) ? body.items.slice(0, 20) : [];
      if (!requestedItems.length) return json({ ok: false, error: "El pedido no tiene productos." }, 400);

      const ids = [...new Set(requestedItems.map((item: any) => cleanText(item?.product_id, 80)).filter(Boolean))];
      const { data: products, error: productError } = await db.from("local2_products").select("id,business_id,name,price_cop,active,track_stock,stock_quantity").eq("business_id", businessId).eq("active", true).in("id", ids);
      if (productError) throw productError;
      const byId = new Map((products || []).map((product: any) => [product.id, product]));
      const lines: any[] = [];
      let total = 0;
      for (const requested of requestedItems) {
        const product = byId.get(cleanText(requested?.product_id, 80));
        const quantity = Math.max(1, Math.min(99, Number.parseInt(String(requested?.quantity || 1), 10) || 1));
        if (!product || product.price_cop === null) return json({ ok: false, error: "Uno de los productos no está disponible para compra directa." }, 400);
        if (product.track_stock && product.stock_quantity !== null && product.stock_quantity < quantity) return json({ ok: false, error: `No hay suficientes unidades de ${product.name}.` }, 400);
        const unit = Number(product.price_cop);
        const subtotal = unit * quantity;
        total += subtotal;
        lines.push({ product_id: product.id, name_snapshot: product.name, unit_price_cop: unit, quantity, subtotal_cop: subtotal });
      }

      const { data: order, error: orderError } = await db.from("local2_orders").insert({
        business_id: businessId,
        customer_id: currentSession.customer_id,
        conversation_id: conversation.id,
        status: "awaiting_payment",
        subtotal_cop: total,
        total_cop: total,
        notes: cleanText(body?.notes, 800) || null,
        delivery_method: cleanText(body?.delivery_method, 80) || null,
        delivery_details: typeof body?.delivery_details === "object" && body.delivery_details ? body.delivery_details : {},
      }).select("id,public_code,status,total_cop,created_at").single();
      if (orderError) throw orderError;

      const { error: linesError } = await db.from("local2_order_items").insert(lines.map((line) => ({ ...line, business_id: businessId, order_id: order.id })));
      if (linesError) throw linesError;
      await db.from("local2_order_events").insert({ business_id: businessId, order_id: order.id, event_type: "created", status: "awaiting_payment", description: "Pedido recibido" });
      const { data: paymentMethods } = await db.from("local2_payment_methods").select("id,method_type,label,account_holder,destination,qr_url,instructions").eq("business_id", businessId).eq("active", true).order("sort_order");
      return json({ ok: true, order, items: lines, payment_methods: paymentMethods || [] });
    }

    if (action === "report_payment") {
      const currentSession = await requireSession(businessId, token);
      if (!currentSession.customer_id) return json({ ok: false, error: "No encontramos un cliente asociado a esta sesión." }, 400);
      const orderId = cleanText(body?.order_id, 80);
      const { data: order, error: orderError } = await db.from("local2_orders").select("id,public_code,business_id,customer_id,status,total_cop").eq("id", orderId).eq("business_id", businessId).eq("customer_id", currentSession.customer_id).maybeSingle();
      if (orderError) throw orderError;
      if (!order) return json({ ok: false, error: "Pedido no encontrado." }, 404);
      const paymentMethodId = cleanText(body?.payment_method_id, 80) || null;
      let methodType = cleanText(body?.method_type, 40) || null;
      if (paymentMethodId) {
        const { data: method } = await db.from("local2_payment_methods").select("id,method_type").eq("id", paymentMethodId).eq("business_id", businessId).maybeSingle();
        if (method) methodType = method.method_type;
      }
      const { data: payment, error: paymentError } = await db.from("local2_payments").insert({
        business_id: businessId,
        order_id: order.id,
        payment_method_id: paymentMethodId,
        method_type: methodType,
        amount_cop: order.total_cop,
        status: "reported",
        payer_name: cleanText(body?.payer_name, 160) || null,
      }).select("id,status,amount_cop,reported_at").single();
      if (paymentError) throw paymentError;
      await db.from("local2_orders").update({ status: "payment_reported" }).eq("id", order.id);
      await db.from("local2_order_events").insert({ business_id: businessId, order_id: order.id, event_type: "payment_reported", status: "payment_reported", description: "El cliente reportó el pago. Pendiente de confirmación." });
      return json({ ok: true, payment, order: { ...order, status: "payment_reported" } });
    }

    if (action === "track_orders") {
      const currentSession = await requireSession(businessId, token);
      if (!currentSession.customer_id) return json({ ok: true, orders: [] });
      const { data: orders, error: ordersError } = await db.from("local2_orders").select("id,public_code,status,total_cop,estimated_ready_at,created_at,updated_at").eq("business_id", businessId).eq("customer_id", currentSession.customer_id).order("created_at", { ascending: false }).limit(20);
      if (ordersError) throw ordersError;
      const orderIds = (orders || []).map((order: any) => order.id);
      let events: any[] = [];
      if (orderIds.length) {
        const { data, error } = await db.from("local2_order_events").select("id,order_id,event_type,status,description,created_at").in("order_id", orderIds).order("created_at", { ascending: true });
        if (error) throw error;
        events = data || [];
      }
      return json({ ok: true, orders: (orders || []).map((order: any) => ({ ...order, events: events.filter((event: any) => event.order_id === order.id) })) });
    }

    return json({ ok: false, error: "Acción no soportada" }, 400);
  } catch (error) {
    console.error("local2-public-api", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos completar la solicitud." }, 500);
  }
});
