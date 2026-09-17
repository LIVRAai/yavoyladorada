(() => {
  const loadingNotice = document.getElementById("loadingNotice");
  const errorNotice = document.getElementById("errorNotice");
  const ownerApp = document.getElementById("ownerApp");
  const businessName = document.getElementById("businessName");
  const assistantState = document.getElementById("assistantState");
  const publicLink = document.getElementById("publicLink");
  const logoutButton = document.getElementById("logoutButton");

  const statCustomers = document.getElementById("statCustomers");
  const statOrders = document.getElementById("statOrders");
  const statPayments = document.getElementById("statPayments");
  const statActive = document.getElementById("statActive");

  const assistantForm = document.getElementById("assistantForm");
  const assistantEnabled = document.getElementById("assistantEnabled");
  const assistantName = document.getElementById("assistantName");
  const assistantRole = document.getElementById("assistantRole");
  const welcomeMessage = document.getElementById("welcomeMessage");
  const assistantNotice = document.getElementById("assistantNotice");

  const productList = document.getElementById("productList");
  const productForm = document.getElementById("productForm");
  const newProductName = document.getElementById("newProductName");
  const newProductPrice = document.getElementById("newProductPrice");

  const paymentMethodList = document.getElementById("paymentMethodList");
  const paymentMethodForm = document.getElementById("paymentMethodForm");
  const newPaymentType = document.getElementById("newPaymentType");
  const newPaymentLabel = document.getElementById("newPaymentLabel");
  const newPaymentDestination = document.getElementById("newPaymentDestination");

  const pendingPayments = document.getElementById("pendingPayments");
  const ordersList = document.getElementById("ordersList");
  const refreshOrders = document.getElementById("refreshOrders");

  const paymentTypeLabels = {
    nequi: "Nequi",
    breb: "Bre-B",
    daviplata: "DaviPlata",
    bank_transfer: "Transferencia",
    cash: "Efectivo",
    other: "Otro"
  };
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

  let currentUser = null;
  let currentBusiness = null;
  let settings = null;
  let products = [];
  let methods = [];

  function showError(message) {
    errorNotice.textContent = message;
    errorNotice.hidden = false;
  }

  function clearError() { errorNotice.hidden = true; }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function slugify(value) {
    return String(value || "negocio")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "negocio";
  }

  function updatePublicLink() {
    if (!currentBusiness) return;
    const url = new URL("local2-beta.html", window.location.href);
    const shareToken = new URL(window.location.href).searchParams.get("_vercel_share");
    url.searchParams.set("negocio", settings?.slug || currentBusiness.id);
    if (shareToken) url.searchParams.set("_vercel_share", shareToken);
    publicLink.href = url.href;
  }

  function renderAssistantState() {
    const enabled = Boolean(settings?.assistant_enabled);
    assistantEnabled.checked = enabled;
    assistantName.value = settings?.assistant_name || "Asistente";
    assistantRole.value = settings?.assistant_role || "Empleado Digital";
    welcomeMessage.value = settings?.welcome_message || "";
    assistantState.textContent = enabled ? `${settings?.assistant_name || "Empleado Digital"} está activo` : "Empleado Digital pausado";
    assistantState.classList.toggle("off", !enabled);
    updatePublicLink();
  }

  async function ensureSettings() {
    const { data, error } = await window.yavoyDb
      .from("local2_business_settings")
      .select("business_id,slug,assistant_enabled,assistant_name,assistant_role,welcome_message,business_mode")
      .eq("business_id", currentBusiness.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      settings = data;
      return;
    }

    const baseSlug = slugify(currentBusiness.name);
    let payload = {
      business_id: currentBusiness.id,
      slug: baseSlug,
      assistant_enabled: false,
      assistant_name: "Asistente",
      assistant_role: "Empleado Digital",
      business_mode: "mixed"
    };
    let result = await window.yavoyDb.from("local2_business_settings").insert(payload).select("business_id,slug,assistant_enabled,assistant_name,assistant_role,welcome_message,business_mode").single();
    if (result.error?.code === "23505") {
      payload.slug = `${baseSlug}-${currentBusiness.id.slice(0, 6)}`;
      result = await window.yavoyDb.from("local2_business_settings").insert(payload).select("business_id,slug,assistant_enabled,assistant_name,assistant_role,welcome_message,business_mode").single();
    }
    if (result.error) throw result.error;
    settings = result.data;
  }

  function renderProducts() {
    productList.innerHTML = "";
    if (!products.length) {
      productList.innerHTML = '<div class="empty">Todavía no tienes productos configurados para el Empleado Digital.</div>';
      return;
    }

    products.forEach((product) => {
      const row = document.createElement("div");
      row.className = "edit-row";
      const name = document.createElement("input");
      name.type = "text";
      name.value = product.name || "";
      name.maxLength = 140;
      const price = document.createElement("input");
      price.type = "number";
      price.min = "0";
      price.step = "1";
      price.placeholder = "Precio COP";
      price.value = product.price_cop === null ? "" : String(Math.round(Number(product.price_cop)));
      const activeLabel = document.createElement("label");
      activeLabel.className = "check";
      const active = document.createElement("input");
      active.type = "checkbox";
      active.checked = Boolean(product.active);
      activeLabel.append(active, document.createTextNode("Activo"));
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Guardar";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          clearError();
          const rawPrice = price.value.trim();
          const { data, error } = await window.yavoyDb
            .from("local2_products")
            .update({ name: name.value.trim(), price_cop: rawPrice ? Number(rawPrice) : null, active: active.checked })
            .eq("id", product.id)
            .eq("business_id", currentBusiness.id)
            .select("id,name,description,price_cop,active,sort_order")
            .single();
          if (error) throw error;
          Object.assign(product, data);
          save.textContent = "Guardado ✓";
          window.setTimeout(() => { save.textContent = "Guardar"; }, 1200);
        } catch (error) {
          showError("No pudimos guardar el producto.");
        } finally { save.disabled = false; }
      });
      row.append(name, price, activeLabel, save);
      productList.appendChild(row);
    });
  }

  async function loadProducts() {
    const { data, error } = await window.yavoyDb
      .from("local2_products")
      .select("id,name,description,price_cop,active,sort_order")
      .eq("business_id", currentBusiness.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    products = data || [];
    renderProducts();
  }

  function renderMethods() {
    paymentMethodList.innerHTML = "";
    if (!methods.length) {
      paymentMethodList.innerHTML = '<div class="empty">Agrega el medio que ya usas hoy: Nequi, Bre-B, DaviPlata, transferencia o efectivo.</div>';
      return;
    }
    methods.forEach((method) => {
      const row = document.createElement("div");
      row.className = "edit-row";
      const label = document.createElement("input");
      label.type = "text";
      label.value = method.label || paymentTypeLabels[method.method_type] || method.method_type;
      label.maxLength = 100;
      const destination = document.createElement("input");
      destination.type = "text";
      destination.value = method.destination || "";
      destination.placeholder = "Número o llave";
      const activeLabel = document.createElement("label");
      activeLabel.className = "check";
      const active = document.createElement("input");
      active.type = "checkbox";
      active.checked = Boolean(method.active);
      activeLabel.append(active, document.createTextNode("Activo"));
      const save = document.createElement("button");
      save.type = "button";
      save.textContent = "Guardar";
      save.addEventListener("click", async () => {
        save.disabled = true;
        try {
          const { data, error } = await window.yavoyDb
            .from("local2_payment_methods")
            .update({ label: label.value.trim() || null, destination: destination.value.trim() || null, active: active.checked })
            .eq("id", method.id)
            .eq("business_id", currentBusiness.id)
            .select("id,method_type,label,destination,active,sort_order")
            .single();
          if (error) throw error;
          Object.assign(method, data);
          save.textContent = "Guardado ✓";
          window.setTimeout(() => { save.textContent = "Guardar"; }, 1200);
        } catch {
          showError("No pudimos guardar el medio de pago.");
        } finally { save.disabled = false; }
      });
      row.append(label, destination, activeLabel, save);
      paymentMethodList.appendChild(row);
    });
  }

  async function loadMethods() {
    const { data, error } = await window.yavoyDb
      .from("local2_payment_methods")
      .select("id,method_type,label,destination,active,sort_order")
      .eq("business_id", currentBusiness.id)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    methods = data || [];
    renderMethods();
  }

  async function loadOperation() {
    const [customersResult, ordersResult, paymentsResult] = await Promise.all([
      window.yavoyDb.from("local2_customers").select("id,name,phone,email,created_at").eq("business_id", currentBusiness.id),
      window.yavoyDb.from("local2_orders").select("id,public_code,customer_id,status,total_cop,created_at,updated_at").eq("business_id", currentBusiness.id).order("created_at", { ascending: false }).limit(50),
      window.yavoyDb.from("local2_payments").select("id,order_id,status,amount_cop,payer_name,reported_at,method_type").eq("business_id", currentBusiness.id).order("reported_at", { ascending: false }).limit(50)
    ]);
    if (customersResult.error) throw customersResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (paymentsResult.error) throw paymentsResult.error;

    const customers = customersResult.data || [];
    const orders = ordersResult.data || [];
    const payments = paymentsResult.data || [];
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const pending = payments.filter((payment) => payment.status === "reported");
    const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));

    statCustomers.textContent = String(customers.length);
    statOrders.textContent = String(orders.length);
    statPayments.textContent = String(pending.length);
    statActive.textContent = String(activeOrders.length);

    pendingPayments.innerHTML = "";
    if (!pending.length) pendingPayments.innerHTML = '<div class="empty">No tienes pagos esperando confirmación.</div>';
    pending.forEach((payment) => {
      const order = orderMap.get(payment.order_id);
      const customer = order ? customerMap.get(order.customer_id) : null;
      const item = document.createElement("div");
      item.className = "attention-item";
      const title = document.createElement("strong");
      title.textContent = `${customer?.name || "Cliente"} · ${money(payment.amount_cop)}`;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = `${order?.public_code || "Pedido"} · ${paymentTypeLabels[payment.method_type] || payment.method_type || "Medio no indicado"} · ${formatDate(payment.reported_at)}`;
      const actions = document.createElement("div");
      actions.className = "item-actions";
      const confirm = document.createElement("button");
      confirm.className = "confirm";
      confirm.textContent = "Confirmar pago";
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        try {
          const { error } = await window.yavoyDb.rpc("local2_confirm_payment", { p_payment_id: payment.id });
          if (error) throw error;
          await loadOperation();
        } catch {
          showError("No pudimos confirmar el pago.");
          confirm.disabled = false;
        }
      });
      actions.appendChild(confirm);
      item.append(title, meta, actions);
      pendingPayments.appendChild(item);
    });

    ordersList.innerHTML = "";
    if (!orders.length) ordersList.innerHTML = '<div class="empty">Cuando el Empleado Digital cree pedidos, aparecerán aquí.</div>';
    orders.forEach((order) => {
      const customer = customerMap.get(order.customer_id);
      const card = document.createElement("div");
      card.className = "order-card";
      const title = document.createElement("strong");
      title.textContent = `${order.public_code} · ${customer?.name || "Cliente"}`;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = `${money(order.total_cop)} · ${formatDate(order.created_at)}`;
      const status = document.createElement("span");
      status.className = "status-chip";
      status.textContent = statusLabels[order.status] || order.status;
      const actions = document.createElement("div");
      actions.className = "item-actions";

      const transitions = [];
      if (order.status === "payment_confirmed") transitions.push(["preparing", "Empezar preparación"]);
      if (order.status === "preparing") transitions.push(["ready", "Marcar listo"]);
      if (order.status === "ready") transitions.push(["delivered", "Marcar entregado"]);
      if (!["delivered", "cancelled"].includes(order.status)) transitions.push(["cancelled", "Cancelar"]);
      transitions.forEach(([nextStatus, label]) => {
        const button = document.createElement("button");
        button.className = nextStatus === "cancelled" ? "secondary" : "confirm";
        button.textContent = label;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            const { error } = await window.yavoyDb.rpc("local2_set_order_status", { p_order_id: order.id, p_status: nextStatus });
            if (error) throw error;
            await loadOperation();
          } catch {
            showError("No pudimos actualizar el pedido.");
            button.disabled = false;
          }
        });
        actions.appendChild(button);
      });

      card.append(title, meta, status);
      if (transitions.length) card.appendChild(actions);
      ordersList.appendChild(card);
    });
  }

  async function loadBusiness() {
    const { data, error } = await window.yavoyDb
      .from("businesses")
      .select("id,owner_id,name,status")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    currentBusiness = data || null;
  }

  assistantForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    const submit = assistantForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const { data, error } = await window.yavoyDb
        .from("local2_business_settings")
        .update({
          assistant_enabled: assistantEnabled.checked,
          assistant_name: assistantName.value.trim() || "Asistente",
          assistant_role: assistantRole.value.trim() || "Empleado Digital",
          welcome_message: welcomeMessage.value.trim() || null
        })
        .eq("business_id", currentBusiness.id)
        .select("business_id,slug,assistant_enabled,assistant_name,assistant_role,welcome_message,business_mode")
        .single();
      if (error) throw error;
      settings = data;
      renderAssistantState();
      assistantNotice.textContent = "Configuración guardada. La página pública beta ya usa estos cambios.";
      assistantNotice.hidden = false;
      window.setTimeout(() => { assistantNotice.hidden = true; }, 2500);
    } catch {
      showError("No pudimos guardar la configuración del empleado.");
    } finally { submit.disabled = false; }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = newProductName.value.trim();
    if (!name) return;
    const rawPrice = newProductPrice.value.trim();
    const { error } = await window.yavoyDb.from("local2_products").insert({
      business_id: currentBusiness.id,
      name,
      price_cop: rawPrice ? Number(rawPrice) : null,
      active: true,
      sort_order: products.length + 1
    });
    if (error) { showError("No pudimos agregar el producto."); return; }
    newProductName.value = "";
    newProductPrice.value = "";
    await loadProducts();
  });

  paymentMethodForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await window.yavoyDb.from("local2_payment_methods").insert({
      business_id: currentBusiness.id,
      method_type: newPaymentType.value,
      label: newPaymentLabel.value.trim() || paymentTypeLabels[newPaymentType.value],
      destination: newPaymentDestination.value.trim() || null,
      active: true,
      sort_order: methods.length + 1
    });
    if (error) { showError("No pudimos agregar el medio de pago."); return; }
    newPaymentLabel.value = "";
    newPaymentDestination.value = "";
    await loadMethods();
  });

  refreshOrders.addEventListener("click", loadOperation);

  logoutButton.addEventListener("click", async () => {
    await window.yavoyDb?.auth.signOut();
    window.location.replace("login.html?next=mi-negocio-v2.html");
  });

  async function init() {
    if (!window.yavoyDb) {
      loadingNotice.textContent = "No pudimos conectar con Local.";
      return;
    }

    let authResult;
    if (window.LocalAuth?.validate) authResult = await window.LocalAuth.validate();
    else {
      const { data } = await window.yavoyDb.auth.getUser();
      authResult = { valid: Boolean(data?.user), user: data?.user || null };
    }
    if (!authResult?.valid || !authResult.user) {
      window.location.replace("login.html?next=mi-negocio-v2.html");
      return;
    }
    currentUser = authResult.user;

    try {
      await loadBusiness();
      if (!currentBusiness) {
        loadingNotice.textContent = "Primero necesitas crear tu perfil de emprendimiento en Local.";
        return;
      }
      await ensureSettings();
      businessName.textContent = currentBusiness.name;
      renderAssistantState();
      await Promise.all([loadProducts(), loadMethods(), loadOperation()]);
      loadingNotice.hidden = true;
      ownerApp.hidden = false;
    } catch (error) {
      console.error(error);
      loadingNotice.hidden = true;
      showError("No pudimos cargar Local 2.0 Beta para tu negocio.");
    }
  }

  init();
})();
