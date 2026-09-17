(() => {
  const select = document.getElementById("businessSelect");
  const notice = document.getElementById("loadNotice");
  const experience = document.getElementById("businessExperience");
  const nameEl = document.getElementById("businessName");
  const metaEl = document.getElementById("businessMeta");
  const descriptionEl = document.getElementById("businessDescription");
  const offeringsEl = document.getElementById("offerings");
  const catalogPreview = document.getElementById("catalogPreview");
  const coverEl = document.getElementById("cover");
  const coverInitial = document.getElementById("coverInitial");
  const whatsappButton = document.getElementById("whatsappButton");
  const instagramButton = document.getElementById("instagramButton");
  const assistantButton = document.getElementById("assistantButton");
  const assistantPanel = document.getElementById("assistantPanel");
  const assistantTitle = document.getElementById("assistantTitle");
  const sessionLabel = document.getElementById("sessionLabel");
  const closeAssistant = document.getElementById("closeAssistant");
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const sendButton = document.getElementById("sendButton");
  const shareUrl = document.getElementById("shareUrl");
  const copyLink = document.getElementById("copyLink");

  const identityPanel = document.getElementById("identityPanel");
  const identityForm = document.getElementById("identityForm");
  const customerName = document.getElementById("customerName");
  const customerPhone = document.getElementById("customerPhone");
  const customerEmail = document.getElementById("customerEmail");

  const orderPanel = document.getElementById("orderPanel");
  const orderForm = document.getElementById("orderForm");
  const orderProducts = document.getElementById("orderProducts");
  const orderNotes = document.getElementById("orderNotes");
  const orderNotice = document.getElementById("orderNotice");
  const createOrderButton = document.getElementById("createOrderButton");

  const paymentPanel = document.getElementById("paymentPanel");
  const paymentTitle = document.getElementById("paymentTitle");
  const paymentInstructions = document.getElementById("paymentInstructions");
  const paymentForm = document.getElementById("paymentForm");
  const paymentMethod = document.getElementById("paymentMethod");
  const payerName = document.getElementById("payerName");

  const trackingPanel = document.getElementById("trackingPanel");
  const trackingContent = document.getElementById("trackingContent");
  const refreshTracking = document.getElementById("refreshTracking");

  const categoryLabels = {
    comida: "Comida",
    hogar: "Hogar",
    belleza: "Belleza",
    moda: "Moda",
    servicios: "Servicios",
    tecnologia: "Tecnología"
  };
  const cityLabels = { "la-dorada": "La Dorada", "puerto-salgar": "Puerto Salgar" };
  const statusLabels = {
    new: "Pedido recibido",
    awaiting_payment: "Esperando pago",
    payment_reported: "Pago por confirmar",
    payment_confirmed: "Pago confirmado",
    preparing: "En preparación",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado"
  };
  const paymentTypeLabels = {
    nequi: "Nequi",
    breb: "Bre-B",
    daviplata: "DaviPlata",
    bank_transfer: "Transferencia",
    cash: "Efectivo",
    other: "Otro"
  };

  let businesses = [];
  let settingsByBusiness = new Map();
  let currentBusiness = null;
  let currentContext = null;
  let sessionState = null;
  let pendingAfterIdentity = null;
  let currentOrder = null;

  function safeHttpUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function whatsappUrl(value, businessName) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length < 10) return "";
    const text = encodeURIComponent(`Hola, vi ${businessName} en Local 💚 y quiero más información.`);
    return `https://wa.me/${digits}?text=${text}`;
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Precio por confirmar";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function businessBetaUrl(business, settings = null) {
    const url = new URL(window.location.href);
    const shareToken = url.searchParams.get("_vercel_share");
    url.search = "";
    url.hash = "";
    url.searchParams.set("negocio", settings?.slug || business.id);
    if (shareToken) url.searchParams.set("_vercel_share", shareToken);
    return url.href;
  }

  function sessionStorageKey() {
    return currentBusiness ? `local2:session:${currentBusiness.id}` : "";
  }

  function addMessage(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideFlows() {
    identityPanel.hidden = true;
    orderPanel.hidden = true;
    paymentPanel.hidden = true;
    trackingPanel.hidden = true;
  }

  async function api(action, payload = {}) {
    if (!window.yavoyDb) throw new Error("No pudimos conectar con Local.");
    const { data, error } = await window.yavoyDb.functions.invoke("local2-public-api", {
      body: { action, business_id: currentBusiness?.id, ...payload }
    });
    if (error) {
      console.error("Local 2.0 API", error);
      throw new Error("No pudimos completar esta acción. Intenta nuevamente.");
    }
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar esta acción.");
    return data;
  }

  async function ensureSession() {
    if (!currentBusiness) throw new Error("No hay un emprendimiento seleccionado.");
    if (sessionState?.businessId === currentBusiness.id && sessionState.sessionToken) return sessionState;

    sessionLabel.textContent = "Preparando tu sesión privada…";
    const key = sessionStorageKey();
    const savedToken = key ? localStorage.getItem(key) || "" : "";
    const data = await api("start_session", { session_token: savedToken });
    if (key) localStorage.setItem(key, data.session_token);
    sessionState = {
      businessId: currentBusiness.id,
      sessionToken: data.session_token,
      conversationId: data.conversation_id,
      customerId: data.customer_id || null,
      resumed: Boolean(data.resumed)
    };
    sessionLabel.textContent = data.resumed ? "Sesión privada recuperada ✓" : "Sesión privada activa ✓";
    return sessionState;
  }

  function renderOfferings(profile) {
    offeringsEl.innerHTML = "";
    const items = profile.offerings || [];
    items.forEach((item) => {
      const chip = document.createElement("span");
      chip.textContent = item;
      offeringsEl.appendChild(chip);
    });
    offeringsEl.hidden = !items.length;
  }

  function renderCatalogPreview(context) {
    catalogPreview.innerHTML = "";
    const products = context?.products || [];
    if (!products.length) {
      catalogPreview.hidden = true;
      return;
    }
    products.slice(0, 5).forEach((product) => {
      const row = document.createElement("div");
      row.className = "catalog-preview-item";
      const text = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = product.name;
      const detail = document.createElement("span");
      detail.textContent = product.description || "Producto del emprendimiento";
      text.append(strong, detail);
      const price = document.createElement("strong");
      price.textContent = product.price_cop === null ? "Por confirmar" : money(product.price_cop);
      row.append(text, price);
      catalogPreview.appendChild(row);
    });
    catalogPreview.hidden = false;
  }

  async function renderBusiness(business) {
    currentBusiness = business;
    currentContext = null;
    sessionState = null;
    currentOrder = null;
    pendingAfterIdentity = null;
    hideFlows();

    const profile = window.LocalProfileData?.parse(business.description) || { summary: business.description || "", offerings: [] };
    nameEl.textContent = business.name || "Emprendimiento";
    metaEl.textContent = `${categoryLabels[business.category] || "Emprendimiento"} · ${cityLabels[business.city] || business.city || "Local"}`;
    descriptionEl.textContent = profile.summary || "Este emprendimiento hace parte de Local 💚.";
    renderOfferings(profile);

    const image = String(business.image_url || "").trim();
    coverEl.style.backgroundImage = image ? `url("${image.replace(/"/g, "%22")}")` : "";
    coverInitial.hidden = Boolean(image);
    coverInitial.textContent = (business.name || "L").charAt(0).toUpperCase();

    const wa = whatsappUrl(business.whatsapp || business.phone, business.name);
    whatsappButton.hidden = !wa;
    if (wa) whatsappButton.href = wa;
    const instagram = safeHttpUrl(business.instagram);
    instagramButton.hidden = !instagram;
    if (instagram) instagramButton.href = instagram;

    const basicSettings = settingsByBusiness.get(business.id) || null;
    shareUrl.value = businessBetaUrl(business, basicSettings);
    assistantTitle.textContent = `${basicSettings?.assistant_name || "Asistente"} · ${business.name}`;
    assistantPanel.hidden = true;
    chatMessages.innerHTML = "";
    catalogPreview.hidden = true;
    assistantButton.disabled = true;
    assistantButton.textContent = "Preparando asistente…";
    experience.hidden = false;

    try {
      currentContext = await api("bootstrap");
      const settings = currentContext.settings || basicSettings;
      settingsByBusiness.set(business.id, settings || {});
      shareUrl.value = businessBetaUrl(business, settings);
      assistantTitle.textContent = `${settings?.assistant_name || "Asistente"} · ${business.name}`;
      renderCatalogPreview(currentContext);
      if (settings?.assistant_enabled) {
        assistantButton.disabled = false;
        assistantButton.textContent = "Hablar con nuestro asistente";
        addMessage(settings.welcome_message || `Hola 👋 Soy ${settings.assistant_name || "el asistente"} de ${business.name}. Puedo ayudarte con productos, pedidos y seguimiento.`);
      } else {
        assistantButton.disabled = true;
        assistantButton.textContent = "Empleado Digital no activo";
      }
    } catch (error) {
      console.error(error);
      assistantButton.disabled = true;
      assistantButton.textContent = "Asistente temporalmente no disponible";
    }

    const pageUrl = new URL(window.location.href);
    const currentShareToken = pageUrl.searchParams.get("_vercel_share");
    pageUrl.search = "";
    pageUrl.searchParams.set("negocio", settingsByBusiness.get(business.id)?.slug || business.id);
    if (currentShareToken) pageUrl.searchParams.set("_vercel_share", currentShareToken);
    window.history.replaceState({}, "", `${pageUrl.pathname}${pageUrl.search}`);
  }

  async function sendChat(text) {
    if (!text || !currentBusiness) return;
    addMessage(text, "user");
    sendButton.disabled = true;
    chatInput.disabled = true;
    try {
      const session = await ensureSession();
      const data = await api("send_message", { session_token: session.sessionToken, message: text });
      addMessage(data.reply || "¿En qué más puedo ayudarte?");
    } catch (error) {
      addMessage(error.message || "No pudimos responder en este momento.", "error");
    } finally {
      sendButton.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
    }
  }

  async function requestIdentity(nextAction) {
    pendingAfterIdentity = nextAction;
    await ensureSession();
    hideFlows();
    identityPanel.hidden = false;
    identityPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderOrderProducts() {
    orderProducts.innerHTML = "";
    const products = (currentContext?.products || []).filter((product) => product.price_cop !== null);
    if (!products.length) {
      orderNotice.hidden = false;
      orderNotice.textContent = "Este emprendimiento todavía está completando precios en su catálogo beta. Puedes seguir conversando con el asistente, pero aún no habilitamos el pedido directo.";
      createOrderButton.disabled = true;
      return false;
    }

    orderNotice.hidden = true;
    createOrderButton.disabled = false;
    products.forEach((product) => {
      const row = document.createElement("label");
      row.className = "order-row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.dataset.productId = product.id;
      const copy = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = product.name;
      const small = document.createElement("small");
      small.textContent = `${money(product.price_cop)}${product.track_stock && product.stock_quantity !== null ? ` · ${product.stock_quantity} disponibles` : ""}`;
      copy.append(strong, small);
      const qty = document.createElement("input");
      qty.type = "number";
      qty.min = "1";
      qty.max = "99";
      qty.value = "1";
      qty.dataset.quantityFor = product.id;
      qty.setAttribute("aria-label", `Cantidad de ${product.name}`);
      row.append(check, copy, qty);
      orderProducts.appendChild(row);
    });
    return true;
  }

  async function openOrderFlow() {
    try {
      const session = await ensureSession();
      if (!session.customerId) {
        await requestIdentity("order");
        return;
      }
      hideFlows();
      orderPanel.hidden = false;
      renderOrderProducts();
      orderPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      addMessage(error.message, "error");
    }
  }

  function renderPaymentMethods(order, methods) {
    currentOrder = order;
    paymentTitle.textContent = `Pedido ${order.public_code} · ${money(order.total_cop)}`;
    paymentInstructions.innerHTML = "";
    paymentMethod.innerHTML = "";
    (methods || []).forEach((method) => {
      const card = document.createElement("div");
      card.className = "payment-method-card";
      const strong = document.createElement("strong");
      strong.textContent = method.label || paymentTypeLabels[method.method_type] || method.method_type;
      const destination = document.createElement("span");
      destination.textContent = [method.destination, method.account_holder].filter(Boolean).join(" · ") || "Consulta las instrucciones del negocio";
      card.append(strong, destination);
      if (method.instructions) {
        const instructions = document.createElement("span");
        instructions.textContent = method.instructions;
        card.appendChild(instructions);
      }
      paymentInstructions.appendChild(card);

      const option = document.createElement("option");
      option.value = method.id;
      option.dataset.type = method.method_type;
      option.textContent = method.label || paymentTypeLabels[method.method_type] || method.method_type;
      paymentMethod.appendChild(option);
    });

    if (!(methods || []).length) {
      const card = document.createElement("div");
      card.className = "inline-notice";
      card.textContent = "El negocio todavía no configuró un medio de pago en la beta. Tu pedido quedó guardado y el emprendimiento podrá indicarte cómo pagar.";
      paymentInstructions.appendChild(card);
      paymentForm.hidden = true;
    } else {
      paymentForm.hidden = false;
    }
  }

  async function loadTracking() {
    try {
      const session = await ensureSession();
      if (!session.customerId) {
        await requestIdentity("tracking");
        return;
      }
      hideFlows();
      trackingPanel.hidden = false;
      trackingContent.innerHTML = '<div class="notice">Consultando tus pedidos…</div>';
      const data = await api("track_orders", { session_token: session.sessionToken });
      trackingContent.innerHTML = "";
      if (!data.orders?.length) {
        trackingContent.innerHTML = '<div class="inline-notice">Todavía no tienes pedidos registrados con este emprendimiento.</div>';
        return;
      }
      data.orders.forEach((order) => {
        const card = document.createElement("article");
        card.className = "tracking-card";
        const top = document.createElement("div");
        top.className = "tracking-card-top";
        const code = document.createElement("strong");
        code.textContent = order.public_code;
        const total = document.createElement("strong");
        total.textContent = money(order.total_cop);
        top.append(code, total);
        const status = document.createElement("span");
        status.className = "tracking-status";
        status.textContent = statusLabels[order.status] || order.status;
        const date = document.createElement("div");
        date.className = "notice";
        date.textContent = `Creado ${formatDate(order.created_at)}`;
        card.append(top, status, date);
        if (order.events?.length) {
          const events = document.createElement("div");
          events.className = "tracking-events";
          order.events.forEach((event) => {
            const item = document.createElement("span");
            item.textContent = `• ${event.description || statusLabels[event.status] || event.event_type} · ${formatDate(event.created_at)}`;
            events.appendChild(item);
          });
          card.appendChild(events);
        }
        trackingContent.appendChild(card);
      });
    } catch (error) {
      trackingContent.innerHTML = "";
      addMessage(error.message, "error");
    }
  }

  async function loadBusinesses() {
    if (!window.yavoyDb) {
      notice.textContent = "No pudimos conectar con Local.";
      return;
    }

    const [businessResult, settingsResult] = await Promise.all([
      window.yavoyDb
        .from("businesses")
        .select("id,name,category,city,description,image_url,instagram,whatsapp,phone,status")
        .eq("status", "active")
        .order("name", { ascending: true }),
      window.yavoyDb
        .from("local2_business_settings")
        .select("business_id,slug,assistant_enabled,assistant_name")
    ]);

    if (businessResult.error) {
      console.error(businessResult.error);
      notice.textContent = "No pudimos cargar los emprendimientos públicos.";
      return;
    }

    businesses = businessResult.data || [];
    (settingsResult.data || []).forEach((item) => settingsByBusiness.set(item.business_id, item));
    select.innerHTML = "";

    if (!businesses.length) {
      select.innerHTML = '<option value="">No hay emprendimientos visibles</option>';
      notice.textContent = "La comunidad no tiene perfiles públicos disponibles para esta prueba.";
      return;
    }

    businesses.forEach((business) => {
      const option = document.createElement("option");
      option.value = business.id;
      option.textContent = `${business.name}${settingsByBusiness.get(business.id)?.assistant_enabled ? " · Empleado activo" : ""}`;
      select.appendChild(option);
    });

    const requestedKey = new URLSearchParams(window.location.search).get("negocio");
    const requested = businesses.find((business) => {
      const settings = settingsByBusiness.get(business.id);
      return business.id === requestedKey || settings?.slug === requestedKey;
    });
    const initial = requested || businesses[0];
    if (requested) document.body.classList.add("direct-business");
    select.value = initial.id;
    notice.textContent = `${businesses.length} emprendimiento${businesses.length === 1 ? "" : "s"} disponible${businesses.length === 1 ? "" : "s"} para probar.`;
    await renderBusiness(initial);
  }

  select.addEventListener("change", async () => {
    document.body.classList.remove("direct-business");
    const business = businesses.find((item) => item.id === select.value);
    if (business) await renderBusiness(business);
  });

  assistantButton.addEventListener("click", async () => {
    assistantPanel.hidden = false;
    assistantPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    try { await ensureSession(); }
    catch (error) { addMessage(error.message, "error"); }
  });

  closeAssistant.addEventListener("click", () => { assistantPanel.hidden = true; });

  document.querySelectorAll("[data-intent]").forEach((button) => {
    button.addEventListener("click", async () => {
      const intent = button.dataset.intent;
      if (intent === "products") {
        await sendChat("¿Qué productos o servicios ofrecen?");
      } else if (intent === "order") {
        await sendChat("Quiero hacer un pedido");
        await openOrderFlow();
      } else if (intent === "tracking") {
        await loadTracking();
      }
    });
  });

  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    await sendChat(text);
  });

  identityForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const session = await ensureSession();
      const data = await api("identify_customer", {
        session_token: session.sessionToken,
        name: customerName.value,
        phone: customerPhone.value,
        email: customerEmail.value
      });
      sessionState.customerId = data.customer.id;
      identityPanel.hidden = true;
      addMessage(`Gracias, ${data.customer.name}. Tu sesión quedó asociada para que puedas volver y consultar tus pedidos.`);
      const next = pendingAfterIdentity;
      pendingAfterIdentity = null;
      if (next === "order") await openOrderFlow();
      if (next === "tracking") await loadTracking();
    } catch (error) {
      addMessage(error.message, "error");
    }
  });

  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const session = await ensureSession();
      const selected = [...orderProducts.querySelectorAll('input[type="checkbox"]:checked')].map((check) => {
        const qty = orderProducts.querySelector(`[data-quantity-for="${check.dataset.productId}"]`);
        return { product_id: check.dataset.productId, quantity: Number(qty?.value || 1) };
      });
      if (!selected.length) {
        orderNotice.hidden = false;
        orderNotice.textContent = "Selecciona al menos un producto.";
        return;
      }
      createOrderButton.disabled = true;
      createOrderButton.textContent = "Creando pedido…";
      const data = await api("create_order", {
        session_token: session.sessionToken,
        items: selected,
        notes: orderNotes.value
      });
      orderPanel.hidden = true;
      addMessage(`Listo. Tu pedido ${data.order.public_code} quedó registrado por ${money(data.order.total_cop)}. Ahora puedes realizar el pago con uno de los medios configurados por el negocio.`);
      renderPaymentMethods(data.order, data.payment_methods || []);
      paymentPanel.hidden = false;
      paymentPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      addMessage(error.message, "error");
    } finally {
      createOrderButton.disabled = false;
      createOrderButton.textContent = "Crear pedido";
    }
  });

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentOrder) return;
    try {
      const session = await ensureSession();
      const option = paymentMethod.selectedOptions[0];
      const data = await api("report_payment", {
        session_token: session.sessionToken,
        order_id: currentOrder.id,
        payment_method_id: paymentMethod.value || null,
        method_type: option?.dataset.type || null,
        payer_name: payerName.value
      });
      paymentPanel.hidden = true;
      addMessage(`Recibí tu reporte de pago para ${data.order.public_code}. El pago todavía está pendiente de confirmación por el emprendimiento. Puedes seguir el estado desde “Mis pedidos”.`);
      await loadTracking();
    } catch (error) {
      addMessage(error.message, "error");
    }
  });

  refreshTracking.addEventListener("click", loadTracking);

  copyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl.value);
      const original = copyLink.textContent;
      copyLink.textContent = "Copiado ✓";
      window.setTimeout(() => { copyLink.textContent = original; }, 1400);
    } catch {
      shareUrl.select();
      document.execCommand("copy");
    }
  });

  loadBusinesses();
})();
