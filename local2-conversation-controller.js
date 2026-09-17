(() => {
  const db = window.yavoyDb;
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const select = document.getElementById("businessSelect");
  const orderQuick = document.querySelector('[data-intent="order"]');
  const trackingQuick = document.querySelector('[data-intent="tracking"]');
  if (!db || !form || !input || !messages || !select) return;

  const stateByBusiness = new Map();
  let bypassOrderQuick = false;
  let bypassTrackingQuick = false;

  const statusLabels = {
    new: "Pedido recibido",
    awaiting_payment: "Esperando pago",
    payment_reported: "Pago por confirmar",
    payment_confirmed: "Pago confirmado",
    preparing: "En preparación",
    ready: "Listo para entregar",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };

  function state() {
    const businessId = select.value;
    if (!stateByBusiness.has(businessId)) stateByBusiness.set(businessId, { cart: null, catalog: null });
    return stateByBusiness.get(businessId);
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function money(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
  }

  function addBubble(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function addCard(className = "conversation-card") {
    const card = document.createElement("div");
    card.className = className;
    messages.appendChild(card);
    messages.scrollTop = messages.scrollHeight;
    return card;
  }

  async function invoke(name, body) {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) throw new Error("No pudimos completar esta acción. Intenta nuevamente.");
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar esta acción.");
    return data;
  }

  async function ensureSession() {
    const businessId = select.value;
    if (!businessId) throw new Error("No hay un emprendimiento seleccionado.");
    const key = `local2:session:${businessId}`;
    const saved = localStorage.getItem(key) || "";
    const data = await invoke("local2-public-api", {
      action: "start_session",
      business_id: businessId,
      session_token: saved,
    });
    localStorage.setItem(key, data.session_token);
    return { businessId, token: data.session_token, customerId: data.customer_id || null };
  }

  async function loadCatalog() {
    const current = state();
    if (current.catalog) return current.catalog;
    const businessId = select.value;
    const data = await invoke("local2-public-api", { action: "bootstrap", business_id: businessId });
    current.catalog = data;
    return data;
  }

  function isTrackingIntent(text) {
    return /(mis pedidos|mi pedido|seguimiento|donde va mi|dónde va mi|estado de mi pedido|como va mi pedido|cómo va mi pedido)/i.test(String(text || ""));
  }

  function isConfirmOrder(text) {
    return /^(si[, ]*)?(confirmar|confirma|confirmo)\s+(el\s+)?pedido[.! ]*$/i.test(String(text || "").trim())
      || /^(sí|si)[, ]*(confirmar|confirmo)[.! ]*$/i.test(String(text || "").trim());
  }

  function isCancelOrder(text) {
    return /^(cancelar|cancela|no confirmar|olvidar)\s+(el\s+)?pedido[.! ]*$/i.test(String(text || "").trim());
  }

  function isOrderIntent(text) {
    const value = normalize(text);
    if (!value) return false;
    if (isConfirmOrder(text) || isCancelOrder(text)) return true;
    if (/\b(hacer|crear|armar) un pedido\b/.test(value)) return true;
    if (/\b(quiero|deseo|voy a|necesito) (comprar|pedir)\b/.test(value)) return true;
    if (/\b(dame|agrega|agregame|anade|anademe|me llevo)\b/.test(value)) return true;
    if (/\bquiero\s+\d+\b/.test(value)) return true;
    if (/\bquiero\s+(un|una|el|la)?\s*(aceite|kit|serum|tratamiento|producto|servicio)\b/.test(value)) return true;
    return false;
  }

  function requiresIdentity(text) {
    return isConfirmOrder(text) || isTrackingIntent(text);
  }

  const numberWords = new Map([
    ["un", 1], ["uno", 1], ["una", 1], ["dos", 2], ["tres", 3], ["cuatro", 4], ["cinco", 5],
    ["seis", 6], ["siete", 7], ["ocho", 8], ["nueve", 9], ["diez", 10],
  ]);

  function quantityBefore(text, index) {
    const before = normalize(String(text || "").slice(Math.max(0, index - 28), index));
    const match = before.match(/(?:^|\s)(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*$/);
    if (!match) return 1;
    if (/^\d+$/.test(match[1])) return Math.max(1, Math.min(99, Number(match[1])));
    return numberWords.get(match[1]) || 1;
  }

  function productScore(textNorm, productName) {
    const productNorm = normalize(productName);
    if (!productNorm) return { score: 0, index: -1 };
    const exactIndex = textNorm.indexOf(productNorm);
    if (exactIndex >= 0) return { score: 100, index: exactIndex };

    const productTokens = productNorm.split(" ").filter(Boolean);
    const textTokens = new Set(textNorm.split(" ").filter(Boolean));
    const weights = { kit: 5, aceite: 4, serum: 5, tratamiento: 5, cejas: 4, pestanas: 4, capilar: 4, cabello: 4, brillo: 3, nutricion: 3 };
    let score = 0;
    let anchor = -1;
    productTokens.forEach((token) => {
      if (!textTokens.has(token)) return;
      score += weights[token] || (token.length >= 6 ? 2 : 1);
      if (anchor < 0) anchor = textNorm.indexOf(token);
    });
    return { score, index: anchor };
  }

  function parseCart(text, products) {
    const textNorm = normalize(text);
    const candidates = (products || [])
      .filter((product) => product.price_cop !== null)
      .map((product) => ({ product, ...productScore(textNorm, product.name) }))
      .filter((item) => item.score >= 5)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) return [];

    const explicitTypes = ["kit", "aceite", "serum", "tratamiento"].filter((token) => textNorm.includes(token));
    let chosen = candidates;
    if (candidates.length > 1 && explicitTypes.length === 0) chosen = candidates.slice(0, 1);
    else chosen = candidates.filter((item, index) => item.score >= 8 || index === 0);

    const seen = new Set();
    return chosen.filter((item) => {
      if (seen.has(item.product.id)) return false;
      seen.add(item.product.id);
      return true;
    }).map((item) => ({
      product_id: item.product.id,
      name: item.product.name,
      price: Number(item.product.price_cop),
      quantity: quantityBefore(textNorm, Math.max(0, item.index)),
      track_stock: Boolean(item.product.track_stock),
      stock_quantity: item.product.stock_quantity,
    }));
  }

  function cartTotal(items) {
    return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  }

  function renderCatalogChoices(products) {
    const card = addCard("conversation-card catalog-choice-card");
    const title = document.createElement("strong");
    title.textContent = "Puedes pedirme algo así:";
    const example = document.createElement("span");
    example.textContent = "“Quiero 2 aceites para cejas” o “Dame 1 kit de pestañas”.";
    const choices = document.createElement("div");
    choices.className = "conversation-choice-list";

    (products || []).filter((p) => p.price_cop !== null).slice(0, 6).forEach((product) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${product.name} · ${money(product.price_cop)}`;
      button.addEventListener("click", () => submitText(`Quiero 1 ${product.name}`));
      choices.appendChild(button);
    });

    const visual = document.createElement("button");
    visual.type = "button";
    visual.className = "conversation-secondary-action";
    visual.textContent = "Prefiero usar el selector visual";
    visual.addEventListener("click", () => {
      if (!orderQuick) return;
      bypassOrderQuick = true;
      orderQuick.click();
    });

    card.append(title, example, choices, visual);
  }

  function renderCartSummary(items) {
    const total = cartTotal(items);
    const card = addCard("conversation-card cart-summary-card");
    const title = document.createElement("strong");
    title.textContent = "Así quedaría tu pedido";
    const list = document.createElement("div");
    list.className = "conversation-line-list";
    items.forEach((item) => {
      const row = document.createElement("span");
      row.textContent = `${item.quantity} × ${item.name} · ${money(item.price * item.quantity)}`;
      list.appendChild(row);
    });
    const totalEl = document.createElement("strong");
    totalEl.className = "conversation-total";
    totalEl.textContent = `Total: ${money(total)}`;
    const actions = document.createElement("div");
    actions.className = "conversation-card-actions";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "conversation-primary-action";
    confirm.textContent = "Confirmar pedido";
    confirm.addEventListener("click", () => submitText("Confirmar pedido"));
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancelar";
    cancel.addEventListener("click", () => submitText("Cancelar pedido"));
    actions.append(confirm, cancel);
    card.append(title, list, totalEl, actions);
  }

  function renderCreatedOrder(order, items, methods) {
    const card = addCard("conversation-card order-created-card");
    const top = document.createElement("div");
    top.className = "conversation-card-top";
    const code = document.createElement("strong");
    code.textContent = order.public_code;
    const status = document.createElement("span");
    status.textContent = statusLabels[order.status] || order.status;
    top.append(code, status);

    const list = document.createElement("div");
    list.className = "conversation-line-list";
    items.forEach((item) => {
      const row = document.createElement("span");
      row.textContent = `${item.quantity} × ${item.name}`;
      list.appendChild(row);
    });

    const total = document.createElement("strong");
    total.className = "conversation-total";
    total.textContent = money(order.total_cop);

    card.append(top, list, total);
    if ((methods || []).length) {
      const pay = document.createElement("div");
      pay.className = "conversation-payment-hint";
      pay.textContent = `Puedes pagar por ${methods.map((method) => method.label || method.method_type).join(", ")}. Cuando lo hagas, escribe “ya pagué” y te pediré el comprobante.`;
      card.appendChild(pay);
    }
  }

  function renderTracking(orders) {
    if (!orders?.length) {
      addBubble("Todavía no encuentro pedidos registrados en tu historial con este negocio.");
      return;
    }
    const card = addCard("conversation-card tracking-conversation-card");
    const title = document.createElement("strong");
    title.textContent = orders.length === 1 ? "Tu pedido" : "Tus pedidos recientes";
    card.appendChild(title);
    orders.slice(0, 5).forEach((order) => {
      const row = document.createElement("div");
      row.className = "conversation-tracking-row";
      const left = document.createElement("div");
      const code = document.createElement("strong");
      code.textContent = order.public_code;
      const status = document.createElement("span");
      status.textContent = statusLabels[order.status] || order.status;
      left.append(code, status);
      const total = document.createElement("strong");
      total.textContent = money(order.total_cop);
      row.append(left, total);
      card.appendChild(row);
    });
    if (trackingQuick) {
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "conversation-secondary-action";
      detail.textContent = "Ver línea de tiempo completa";
      detail.addEventListener("click", () => {
        bypassTrackingQuick = true;
        trackingQuick.click();
      });
      card.appendChild(detail);
    }
  }

  function submitText(text) {
    input.value = text;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  async function startOrder(text, { echoUser = true } = {}) {
    if (echoUser) addBubble(text, "user");
    const catalog = await loadCatalog();
    const products = catalog.products || [];
    const items = parseCart(text, products);

    if (!items.length) {
      addBubble("Claro. Dime qué producto quieres y cuántas unidades. No necesitas llenar un formulario si prefieres pedírmelo por aquí.");
      renderCatalogChoices(products);
      return { handled: true, needsIdentity: false };
    }

    const unavailable = items.find((item) => item.track_stock && item.stock_quantity !== null && item.quantity > Number(item.stock_quantity));
    if (unavailable) {
      addBubble(`Para ${unavailable.name} solo encuentro ${unavailable.stock_quantity} unidad${Number(unavailable.stock_quantity) === 1 ? "" : "es"} disponible${Number(unavailable.stock_quantity) === 1 ? "" : "s"}. Dime una cantidad menor y lo ajusto.`);
      return { handled: true, needsIdentity: false };
    }

    state().cart = items;
    renderCartSummary(items);
    addBubble("Si todo está bien, confirma el pedido. Te pediré tus datos únicamente al momento de registrarlo.");
    return { handled: true, needsIdentity: false };
  }

  async function confirmOrder(text, { echoUser = true } = {}) {
    const current = state();
    if (!current.cart?.length) {
      if (echoUser) addBubble(text, "user");
      addBubble("No tengo un pedido pendiente por confirmar. Dime qué producto quieres y la cantidad para empezarlo.");
      return { handled: true, needsIdentity: false };
    }

    const session = await ensureSession();
    if (!session.customerId) return { handled: false, needsIdentity: true };
    if (echoUser) addBubble(text, "user");

    const payloadItems = current.cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity }));
    const data = await invoke("local2-public-api", {
      action: "create_order",
      business_id: session.businessId,
      session_token: session.token,
      items: payloadItems,
      notes: "Pedido creado desde la conversación de Local 2.0",
    });

    const createdItems = current.cart.map((item) => ({ ...item }));
    current.cart = null;
    addBubble(`Listo. Registré tu pedido ${data.order.public_code}.`);
    renderCreatedOrder(data.order, createdItems, data.payment_methods || []);
    return { handled: true, order: data.order };
  }

  async function cancelOrder(text, { echoUser = true } = {}) {
    if (echoUser) addBubble(text, "user");
    state().cart = null;
    addBubble("Listo. Descarté ese pedido. No se registró ninguna compra.");
    return { handled: true };
  }

  async function trackOrders(text, { echoUser = true } = {}) {
    const session = await ensureSession();
    if (!session.customerId) return { handled: false, needsIdentity: true };
    if (echoUser) addBubble(text, "user");
    const data = await invoke("local2-public-api", {
      action: "track_orders",
      business_id: session.businessId,
      session_token: session.token,
    });
    renderTracking(data.orders || []);
    return { handled: true, orders: data.orders || [] };
  }

  async function handleIntent(text, options = {}) {
    if (isTrackingIntent(text)) return trackOrders(text, options);
    if (isConfirmOrder(text)) return confirmOrder(text, options);
    if (isCancelOrder(text)) return cancelOrder(text, options);
    if (isOrderIntent(text)) return startOrder(text, options);
    return { handled: false };
  }

  window.Local2ConversationController = {
    isOrderIntent,
    isTrackingIntent,
    requiresIdentity,
    handleIntent,
  };

  form.addEventListener("submit", async (event) => {
    const text = input.value.trim();
    if (!text || (!isOrderIntent(text) && !isTrackingIntent(text))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    try {
      const result = await handleIntent(text, { echoUser: true });
      if (result?.needsIdentity) {
        addBubble("Para completar esta acción necesito asociarla a tu sesión. Confirma tus datos y retomamos exactamente aquí.");
      }
    } catch (error) {
      console.error("Local 2.0 conversation controller", error);
      addBubble(error?.message || "No pudimos completar esta acción.", "error");
    }
  }, true);

  orderQuick?.addEventListener("click", (event) => {
    if (bypassOrderQuick) {
      bypassOrderQuick = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    submitText("Quiero hacer un pedido");
  }, true);

  trackingQuick?.addEventListener("click", (event) => {
    if (bypassTrackingQuick) {
      bypassTrackingQuick = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    submitText("Quiero ver mis pedidos");
  }, true);

  select.addEventListener("change", () => {
    stateByBusiness.clear();
  });
})();
