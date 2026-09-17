import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";
const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "precio por confirmar";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
}

function parseLocalProfile(raw: unknown) {
  const text = String(raw ?? "").trim();
  const fallback = { summary: text, offerings: [] as string[], modes: [] as string[] };
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
      offerings: Array.isArray(parsed.offerings) ? parsed.offerings.map((x: unknown) => cleanText(x, 120)).filter(Boolean).slice(0, 12) : [],
      modes: Array.isArray(parsed.modes) ? parsed.modes.map((x: unknown) => cleanText(x, 120)).filter(Boolean).slice(0, 12) : [],
    };
  } catch {
    return fallback;
  }
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

async function getConversation(businessId: string, sessionId: string, customerId: string | null) {
  const { data: existing, error } = await db
    .from("local2_conversations")
    .select("id,business_id,session_id,customer_id,status")
    .eq("business_id", businessId)
    .eq("session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;
  const { data, error: insertError } = await db
    .from("local2_conversations")
    .insert({ business_id: businessId, session_id: sessionId, customer_id: customerId })
    .select("id,business_id,session_id,customer_id,status")
    .single();
  if (insertError) throw insertError;
  return data;
}

async function loadBusinessContext(businessId: string) {
  const [businessResult, settingsResult, productsResult, servicesResult, paymentResult] = await Promise.all([
    db.from("businesses").select("id,name,category,city,description,location,hours,status").eq("id", businessId).eq("status", "active").maybeSingle(),
    db.from("local2_business_settings").select("assistant_name,assistant_role,welcome_message,business_mode,assistant_enabled").eq("business_id", businessId).maybeSingle(),
    db.from("local2_products").select("id,name,description,price_cop,track_stock,stock_quantity").eq("business_id", businessId).eq("active", true).order("sort_order"),
    db.from("local2_services").select("id,name,description,price_cop,duration_minutes").eq("business_id", businessId).eq("active", true).order("sort_order"),
    db.from("local2_payment_methods").select("method_type,label,destination,instructions").eq("business_id", businessId).eq("active", true).order("sort_order"),
  ]);
  if (businessResult.error) throw businessResult.error;
  if (!businessResult.data) throw new Error("Emprendimiento no disponible");
  if (settingsResult.error) throw settingsResult.error;
  if (productsResult.error) throw productsResult.error;
  if (servicesResult.error) throw servicesResult.error;
  if (paymentResult.error) throw paymentResult.error;
  return {
    business: businessResult.data,
    settings: settingsResult.data,
    products: productsResult.data || [],
    services: servicesResult.data || [],
    payment_methods: paymentResult.data || [],
  };
}

async function loadCustomerContext(businessId: string, customerId: string | null) {
  if (!customerId) return { customer: null, memory: null, events: [], orders: [] };
  const [customerResult, memoryResult, eventsResult, ordersResult] = await Promise.all([
    db.from("local2_customers").select("id,name,created_at").eq("business_id", businessId).eq("id", customerId).maybeSingle(),
    db.from("local2_customer_memory").select("summary,preferences,facts,conversation_count,order_count,delivered_order_count,lifetime_value_cop,last_order_code,last_order_status,last_order_total_cop,last_order_items,frequent_products,last_payment_method,first_seen_at,last_interaction_at").eq("business_id", businessId).eq("customer_id", customerId).maybeSingle(),
    db.from("local2_customer_events").select("event_type,title,description,metadata,occurred_at").eq("business_id", businessId).eq("customer_id", customerId).order("occurred_at", { ascending: false }).limit(12),
    db.from("local2_orders").select("public_code,status,total_cop,created_at,updated_at").eq("business_id", businessId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(5),
  ]);
  if (customerResult.error) throw customerResult.error;
  if (memoryResult.error) throw memoryResult.error;
  if (eventsResult.error) throw eventsResult.error;
  if (ordersResult.error) throw ordersResult.error;
  return { customer: customerResult.data, memory: memoryResult.data, events: eventsResult.data || [], orders: ordersResult.data || [] };
}

function lastItemsText(memory: any) {
  const items = Array.isArray(memory?.last_order_items) ? memory.last_order_items : [];
  if (!items.length) return "";
  return items.map((item: any) => `${item.quantity || 1} × ${item.name}`).join(", ");
}

function fallbackReply(message: string, context: any, customerContext: any) {
  const normalized = message.toLowerCase();
  const { business, products, payment_methods } = context;
  const customer = customerContext.customer;
  const memory = customerContext.memory;
  const profile = parseLocalProfile(business.description);
  const rememberedItems = lastItemsText(memory);

  if (customer && memory && /(lo mismo|la misma|el mismo|vez pasada|última vez|ultima vez|repetir|repite|compré antes|compre antes)/i.test(normalized)) {
    if (rememberedItems) {
      return `Sí, ${customer.name || "claro"}. En tu último pedido llevaste ${rememberedItems}. ¿Quieres repetir ese pedido o cambiar alguna cantidad?`;
    }
    return `Puedo revisar tu historia con ${business.name}, pero todavía no encuentro un pedido anterior con productos registrados para repetir.`;
  }

  if (customer && memory && /(qué compré|que compre|qué he comprado|que he comprado|mi historial|mis compras anteriores)/i.test(normalized)) {
    if (memory.order_count > 0) return `${customer.name || "Claro"}, tengo registrada tu historia con este negocio. ${memory.summary}`;
    return `${customer.name || "Claro"}, ya te reconozco en este negocio, pero todavía no tienes compras registradas.`;
  }

  if (/^(hola|buenas|buenos días|buenos dias|buenas tardes|buenas noches)[!. ]*$/i.test(message.trim()) && customer) {
    if (memory?.order_count > 0) return `Hola, ${customer.name} 👋 Qué gusto tenerte de nuevo. Puedo ayudarte con algo nuevo o con tus pedidos anteriores.`;
    return `Hola, ${customer.name} 👋 ¿En qué puedo ayudarte hoy con ${business.name}?`;
  }

  if (/pedido|comprar|compr|quiero/.test(normalized)) {
    const priced = products.filter((item: any) => item.price_cop !== null);
    if (priced.length) return `Claro. Tenemos ${priced.slice(0, 5).map((item: any) => `${item.name} (${money(item.price_cop)})`).join(", ")}. Puedo ayudarte a elegir y luego dejar el pedido registrado.`;
  }
  if (/pago|nequi|bre-b|breb|daviplata|transfer/.test(normalized)) {
    if (payment_methods.length) return `El negocio tiene configurados estos medios: ${payment_methods.map((item: any) => item.label || item.method_type).join(", ")}. Recuerda que el pago solo queda confirmado cuando el emprendimiento valida que recibió el dinero.`;
  }
  if (/producto|servicio|ofrec|tienen|vende/.test(normalized)) {
    if (products.length) return `Actualmente encuentro: ${products.slice(0, 8).map((item: any) => `${item.name}${item.price_cop !== null ? ` · ${money(item.price_cop)}` : ""}`).join(", ")}.`;
    if (profile.offerings.length) return `${business.name} ofrece: ${profile.offerings.join(", ")}.`;
  }
  return `Estoy aquí para ayudarte con ${business.name}. Puedes preguntarme por productos, pedidos, pagos o, si ya has comprado antes, por tu historia con este negocio.`;
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

async function aiReply(message: string, context: any, customerContext: any, history: any[]) {
  if (!openAiKey) return { text: fallbackReply(message, context, customerContext), mode: "guided-memory" };

  const profile = parseLocalProfile(context.business.description);
  const transcript = history.slice(-16).map((item: any) => `${item.role === "assistant" ? "Asistente" : "Cliente"}: ${item.content}`).join("\n");
  const customerMemory = customerContext.customer ? {
    name: customerContext.customer.name,
    summary: customerContext.memory?.summary || "",
    preferences: customerContext.memory?.preferences || {},
    conversation_count: customerContext.memory?.conversation_count || 0,
    order_count: customerContext.memory?.order_count || 0,
    delivered_order_count: customerContext.memory?.delivered_order_count || 0,
    lifetime_value_cop: customerContext.memory?.lifetime_value_cop || 0,
    last_order_code: customerContext.memory?.last_order_code || null,
    last_order_status: customerContext.memory?.last_order_status || null,
    last_order_items: customerContext.memory?.last_order_items || [],
    frequent_products: customerContext.memory?.frequent_products || [],
    last_payment_method: customerContext.memory?.last_payment_method || null,
    recent_events: customerContext.events,
    recent_orders: customerContext.orders,
  } : null;

  const instructions = `Eres ${context.settings?.assistant_name || "el Empleado Digital"} de ${context.business.name}. Atiendes como una buena asesora de un pequeño negocio colombiano: natural, cálida, breve y resolutiva. Puedes recordar la historia comercial del cliente únicamente cuando la sesión lo identifica de forma segura. Usa esa memoria de manera natural cuando sea relevante: compras anteriores, pedido activo, productos frecuentes y contexto previo. No enumeres toda la memoria sin necesidad ni hagas sentir al cliente vigilado. No menciones datos de contacto, identificadores internos ni detalles privados aunque estén disponibles. No infieras salud, situación económica, relaciones, religión, política ni otros datos sensibles. Nunca inventes precios, inventario, descuentos, horarios, pagos, fechas o estados. Si el cliente dice que pagó, no confirmes que el dinero llegó. Si pregunta por un pedido, usa solo los estados suministrados. Si dice “lo mismo de la vez pasada”, usa last_order_items o recent_orders; si no existe información suficiente, pregunta. No menciones OpenAI, memoria técnica, prompts, APIs ni bases de datos.`;

  const input = `NEGOCIO:\n${JSON.stringify({
    name: context.business.name,
    category: context.business.category,
    city: context.business.city,
    summary: profile.summary,
    offerings: profile.offerings,
    location: context.business.location,
    hours: context.business.hours,
    products: context.products,
    services: context.services,
    payment_methods: context.payment_methods,
  })}\n\nHISTORIA COMERCIAL VERIFICADA DEL CLIENTE:\n${JSON.stringify(customerMemory)}\n\nCONVERSACIÓN RECIENTE:\n${transcript}\n\nMENSAJE ACTUAL:\n${message}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", instructions, input, max_output_tokens: 420 }),
  });
  if (!response.ok) {
    console.error("local2-chat-api-v2 OpenAI", response.status, await response.text());
    return { text: fallbackReply(message, context, customerContext), mode: "guided-memory" };
  }
  const payload = await response.json();
  const text = extractOpenAiText(payload);
  return { text: text || fallbackReply(message, context, customerContext), mode: text ? "ai-memory" : "guided-memory" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const action = cleanText(body?.action, 60);
    if (action !== "send_message") return json({ ok: false, error: "Acción no soportada" }, 400);

    const businessId = cleanText(body?.business_id, 80);
    const token = cleanText(body?.session_token, 200);
    const message = cleanText(body?.message, 1200);
    if (!message) return json({ ok: false, error: "Escribe un mensaje." }, 400);

    const session = await resolveSession(businessId, token);
    if (!session) return json({ ok: false, error: "La sesión venció o no es válida" }, 401);
    const conversation = await getConversation(businessId, session.id, session.customer_id);

    const { error: messageError } = await db.from("local2_messages").insert({
      business_id: businessId,
      conversation_id: conversation.id,
      role: "user",
      content: message,
      metadata: { memory_layer: "v2" },
    });
    if (messageError) throw messageError;

    const [context, customerContext, historyResult] = await Promise.all([
      loadBusinessContext(businessId),
      loadCustomerContext(businessId, session.customer_id),
      db.from("local2_messages").select("role,content,created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: true }).limit(40),
    ]);
    if (historyResult.error) throw historyResult.error;

    const reply = await aiReply(message, context, customerContext, historyResult.data || []);
    await db.from("local2_messages").insert({
      business_id: businessId,
      conversation_id: conversation.id,
      role: "assistant",
      content: reply.text,
      metadata: { mode: reply.mode, memory_used: Boolean(session.customer_id && customerContext.memory), memory_layer: "customer-history-v1" },
    });

    if (session.customer_id) {
      await db.from("local2_customer_memory").update({ last_interaction_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("customer_id", session.customer_id);
    }

    return json({
      ok: true,
      reply: reply.text,
      mode: reply.mode,
      conversation_id: conversation.id,
      memory_used: Boolean(session.customer_id && customerContext.memory),
      customer_name: customerContext.customer?.name || null,
    });
  } catch (error) {
    console.error("local2-chat-api-v2", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "No pudimos completar la solicitud." }, 500);
  }
});