(() => {
  const statusNotice = document.getElementById("statusNotice");
  const dashboard = document.getElementById("dashboard");
  const businessName = document.getElementById("businessName");
  const assistantSummary = document.getElementById("assistantSummary");
  const subscriptionChip = document.getElementById("subscriptionChip");
  const metricOrders = document.getElementById("metricOrders");
  const metricValue = document.getElementById("metricValue");
  const metricPayments = document.getElementById("metricPayments");
  const metricProduction = document.getElementById("metricProduction");
  const ordersList = document.getElementById("ordersList");
  const assistantName = document.getElementById("assistantName");
  const assistantRole = document.getElementById("assistantRole");
  const assistantStatus = document.getElementById("assistantStatus");
  const productsList = document.getElementById("productsList");
  const paymentsList = document.getElementById("paymentsList");
  const refreshButton = document.getElementById("refreshButton");
  const resetButton = document.getElementById("resetButton");
  const toast = document.getElementById("toast");

  const statusLabels = {
    new: "Pedido recibido",
    awaiting_payment: "Esperando pago",
    payment_reported: "Pago por confirmar",
    payment_confirmed: "Pago confirmado",
    preparing: "En preparación",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  const paymentLabels = {
    nequi: "Nequi",
    breb: "Bre-B",
    daviplata: "DaviPlata",
    bank_transfer: "Transferencia",
    cash: "Efectivo",
    other: "Otro",
  };

  let snapshot = null;
  let busy = false;

  function money(value) {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "Sin fecha";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Sin fecha";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(d);
  }

  function firstRelation(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2600);
  }

  function preservePreviewAccess() {
    const share = new URLSearchParams(window.location.search).get("_vercel_share");
    if (!share) return;
    document.querySelectorAll('a[href^="local2-beta.html"]').forEach((link) => {
      const url = new URL(link.getAttribute("href"), window.location.href);
      url.searchParams.set("_vercel_share", share);
      link.href = url.href;
    });
  }

  async function api(action, payload = {}) {
    if (!window.yavoyDb) throw new Error("No pudimos conectar con Local.");
    const { data, error } = await window.yavoyDb.functions.invoke("local2-demo-api", {
      body: { action, ...payload },
    });
    if (error) {
      console.error(error);
      throw new Error("No pudimos completar la simulación.");
    }
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar la simulación.");
    return data;
  }

  function renderProducts(products) {
    productsList.innerHTML = "";
    (products || []).forEach((product) => {
      const row = document.createElement("div");
      row.className = "mini-row";
      const left = document.createElement("span");
      left.textContent = product.name;
      const right = document.createElement("strong");
      right.textContent = product.price_cop == null ? "Sin precio" : money(product.price_cop);
      row.append(left, right);
      productsList.appendChild(row);
    });
  }

  function renderPaymentMethods(methods) {
    paymentsList.innerHTML = "";
    (methods || []).forEach((method) => {
      const row = document.createElement("div");
      row.className = "mini-row";
      const left = document.createElement("span");
      left.textContent = method.label || paymentLabels[method.method_type] || method.method_type;
      const right = document.createElement("strong");
      right.textContent = method.destination || "DEMO";
      row.append(left, right);
      paymentsList.appendChild(row);
    });
  }

  function makeAction(label, action, orderId, soft = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `action-button${soft ? " soft" : ""}`;
    button.textContent = label;
    button.addEventListener("click", () => runAction(action, orderId, label));
    return button;
  }

  function renderOrders(orders) {
    ordersList.innerHTML = "";
    if (!orders?.length) {
      const empty = document.createElement("div");
      empty.className = "notice";
      empty.textContent = "No hay pedidos simulados.";
      ordersList.appendChild(empty);
      return;
    }

    orders.forEach((order) => {
      const customer = firstRelation(order.customer) || {};
      const payments = order.payments || [];
      const latestPayment = [...payments].sort((a, b) => new Date(b.reported_at || 0) - new Date(a.reported_at || 0))[0];
      const card = document.createElement("article");
      card.className = "order-card card";

      const top = document.createElement("div");
      top.className = "order-top";
      const title = document.createElement("div");
      const code = document.createElement("span");
      code.className = "order-code";
      code.textContent = order.public_code;
      const h3 = document.createElement("h3");
      h3.textContent = customer.name || "Cliente demo";
      const desc = document.createElement("p");
      desc.textContent = order.notes?.replace("[DEMO LOCAL2]", "").trim() || "Pedido simulado";
      title.append(code, h3, desc);
      const status = document.createElement("span");
      status.className = `status-pill status-${order.status}`;
      status.textContent = statusLabels[order.status] || order.status;
      top.append(title, status);

      const meta = document.createElement("div");
      meta.className = "order-meta";
      const metaData = [
        ["Total", money(order.total_cop)],
        ["Pago", latestPayment ? `${paymentLabels[latestPayment.method_type] || latestPayment.method_type} · ${latestPayment.status === "confirmed" ? "confirmado" : "reportado"}` : "Sin reporte"],
        ["Estimado", order.estimated_ready_at ? formatDate(order.estimated_ready_at) : "No definido"],
      ];
      metaData.forEach(([label, value]) => {
        const box = document.createElement("div");
        box.className = "meta-box";
        const span = document.createElement("span");
        span.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = value;
        box.append(span, strong);
        meta.appendChild(box);
      });

      const items = document.createElement("div");
      items.className = "items";
      (order.items || []).forEach((item) => {
        const row = document.createElement("div");
        row.className = "item-row";
        const left = document.createElement("span");
        left.textContent = `${item.quantity} × ${item.name_snapshot}`;
        const right = document.createElement("strong");
        right.textContent = money(item.subtotal_cop);
        row.append(left, right);
        items.appendChild(row);
      });

      const actions = document.createElement("div");
      actions.className = "order-actions";
      if (order.status === "awaiting_payment") actions.appendChild(makeAction("Simular: ya pagué", "report_payment", order.id, true));
      if (order.status === "payment_reported") actions.appendChild(makeAction("Confirmar pago", "confirm_payment", order.id));
      if (order.status === "payment_confirmed") actions.appendChild(makeAction("Empezar preparación", "advance_order", order.id));
      if (order.status === "preparing") actions.appendChild(makeAction("Marcar como listo", "advance_order", order.id));
      if (order.status === "ready") actions.appendChild(makeAction("Marcar entregado", "advance_order", order.id));

      const timeline = document.createElement("div");
      timeline.className = "timeline";
      [...(order.events || [])]
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
        .slice(-5)
        .forEach((event) => {
          const row = document.createElement("div");
          row.className = "timeline-row";
          row.textContent = `${formatDate(event.created_at)} · ${(event.description || statusLabels[event.status] || event.event_type).replace("[DEMO LOCAL2]", "").trim()}`;
          timeline.appendChild(row);
        });

      card.append(top, meta, items, actions, timeline);
      ordersList.appendChild(card);
    });
  }

  function render(data) {
    snapshot = data;
    businessName.textContent = data.business?.name || "GAIA BY PAULA RIVERA";
    assistantSummary.textContent = `${data.settings?.assistant_name || "Gaia"} está configurada como ${data.settings?.assistant_role || "Empleado Digital"}.`;
    assistantName.textContent = data.settings?.assistant_name || "Gaia";
    assistantRole.textContent = data.settings?.assistant_role || "Empleado Digital";
    assistantStatus.textContent = data.settings?.assistant_enabled ? "Activo ✓" : "Pausado";
    subscriptionChip.textContent = data.subscription?.status === "trial" ? `Prueba hasta ${formatDate(data.subscription.trial_ends_at)}` : (data.subscription?.status || "Demo");
    metricOrders.textContent = data.metrics?.orders ?? 0;
    metricValue.textContent = money(data.metrics?.total_pipeline_cop || 0);
    metricPayments.textContent = data.metrics?.pending_payments ?? 0;
    metricProduction.textContent = data.metrics?.active_production ?? 0;
    renderOrders(data.orders || []);
    renderProducts(data.products || []);
    renderPaymentMethods(data.payment_methods || []);
    dashboard.hidden = false;
    statusNotice.textContent = "Simulación cargada. Los botones solo modifican datos marcados como DEMO LOCAL2.";
  }

  async function load() {
    if (busy) return;
    busy = true;
    statusNotice.textContent = "Actualizando simulación…";
    try {
      render(await api("snapshot"));
    } catch (error) {
      statusNotice.textContent = error.message || "No pudimos cargar la simulación.";
    } finally {
      busy = false;
    }
  }

  async function runAction(action, orderId, label) {
    if (busy) return;
    busy = true;
    statusNotice.textContent = `${label}…`;
    try {
      const data = await api(action, { order_id: orderId });
      render(data);
      showToast(`${label} ✓`);
    } catch (error) {
      statusNotice.textContent = error.message || "No pudimos completar la acción.";
      showToast(error.message || "No pudimos completar la acción.");
    } finally {
      busy = false;
    }
  }

  refreshButton.addEventListener("click", load);
  resetButton.addEventListener("click", async () => {
    if (busy) return;
    const ok = window.confirm("¿Restablecer todos los pedidos demo a su estado inicial?");
    if (!ok) return;
    busy = true;
    statusNotice.textContent = "Restableciendo simulación…";
    try {
      render(await api("reset"));
      showToast("Simulación restablecida ✓");
    } catch (error) {
      statusNotice.textContent = error.message || "No pudimos restablecer la simulación.";
    } finally {
      busy = false;
    }
  });

  preservePreviewAccess();
  load();
})();
