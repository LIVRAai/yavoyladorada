(() => {
  const directory = document.getElementById("customerDirectory");
  const detail = document.getElementById("customerDetail");
  const search = document.getElementById("customerSearch");
  if (!directory || !detail || !search || !window.yavoyDb) return;

  const db = window.yavoyDb;
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
  const paymentLabels = { nequi: "Nequi", breb: "Bre-B", daviplata: "DaviPlata", bank_transfer: "Transferencia", cash: "Efectivo", other: "Otro" };

  let currentBusiness = null;
  let customers = [];
  let memories = new Map();
  let selectedCustomerId = null;

  function money(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function escapeText(value) {
    return String(value ?? "");
  }

  function renderDirectory() {
    const term = search.value.trim().toLowerCase();
    const filtered = customers.filter((customer) => {
      const haystack = `${customer.name || ""} ${customer.phone || ""} ${customer.email || ""}`.toLowerCase();
      return !term || haystack.includes(term);
    });

    directory.innerHTML = "";
    if (!filtered.length) {
      directory.innerHTML = '<div class="customer-empty">No encontramos clientes con ese criterio.</div>';
      return;
    }

    filtered.forEach((customer) => {
      const memory = memories.get(customer.id);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `customer-entry${selectedCustomerId === customer.id ? " active" : ""}`;
      const last = memory?.last_interaction_at ? `Última interacción: ${formatDate(memory.last_interaction_at)}` : "Sin actividad reciente";
      button.innerHTML = `<strong>${escapeText(customer.name || "Cliente")}</strong><span>${memory?.order_count || 0} pedido${Number(memory?.order_count || 0) === 1 ? "" : "s"} · ${last}</span>`;
      button.addEventListener("click", () => loadCustomerDetail(customer.id));
      directory.appendChild(button);
    });
  }

  async function saveOwnerNote(customerId, textarea, button) {
    button.disabled = true;
    const original = button.textContent;
    try {
      const { error } = await db
        .from("local2_customer_memory")
        .update({ owner_notes: textarea.value.trim() || null, updated_at: new Date().toISOString() })
        .eq("business_id", currentBusiness.id)
        .eq("customer_id", customerId);
      if (error) throw error;
      const memory = memories.get(customerId) || {};
      memory.owner_notes = textarea.value.trim() || null;
      memories.set(customerId, memory);
      button.textContent = "Guardado ✓";
    } catch (error) {
      console.error("Local2 customer note", error);
      button.textContent = "No se pudo guardar";
    } finally {
      window.setTimeout(() => { button.textContent = original; button.disabled = false; }, 1400);
    }
  }

  async function loadCustomerDetail(customerId) {
    selectedCustomerId = customerId;
    renderDirectory();
    const customer = customers.find((item) => item.id === customerId);
    const memory = memories.get(customerId) || {};
    detail.innerHTML = '<div class="customer-empty">Cargando historia…</div>';

    const [eventsResult, ordersResult] = await Promise.all([
      db.from("local2_customer_events")
        .select("id,event_type,title,description,metadata,occurred_at")
        .eq("business_id", currentBusiness.id)
        .eq("customer_id", customerId)
        .order("occurred_at", { ascending: false })
        .limit(60),
      db.from("local2_orders")
        .select("id,public_code,status,total_cop,created_at")
        .eq("business_id", currentBusiness.id)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

    if (eventsResult.error || ordersResult.error) {
      console.error(eventsResult.error || ordersResult.error);
      detail.innerHTML = '<div class="customer-empty">No pudimos cargar la historia de este cliente.</div>';
      return;
    }

    const events = eventsResult.data || [];
    const frequent = Array.isArray(memory.frequent_products) ? memory.frequent_products : [];
    const lastItems = Array.isArray(memory.last_order_items) ? memory.last_order_items : [];
    const contact = [customer?.phone, customer?.email].filter(Boolean).join(" · ") || "Sin dato de contacto visible";

    detail.innerHTML = `
      <div class="customer-detail-head">
        <div>
          <span class="eyebrow">Historia del cliente</span>
          <h3>${escapeText(customer?.name || "Cliente")}</h3>
          <div class="customer-contact">${escapeText(contact)}</div>
        </div>
        <span class="memory-badge">Memoria activa</span>
      </div>

      <div class="customer-memory-summary">${escapeText(memory.summary || "Todavía estamos construyendo la memoria comercial de este cliente.")}</div>

      <div class="customer-mini-stats">
        <div class="customer-mini-stat"><span>Conversaciones</span><strong>${memory.conversation_count || 0}</strong></div>
        <div class="customer-mini-stat"><span>Pedidos</span><strong>${memory.order_count || 0}</strong></div>
        <div class="customer-mini-stat"><span>Entregados</span><strong>${memory.delivered_order_count || 0}</strong></div>
        <div class="customer-mini-stat"><span>Compras entregadas</span><strong>${money(memory.lifetime_value_cop || 0)}</strong></div>
      </div>

      <div>
        <strong style="font-size:13px">Productos frecuentes</strong>
        <div class="memory-products" id="memoryProducts"></div>
      </div>

      <div class="owner-note-box">
        <label for="customerOwnerNote">Nota interna del negocio</label>
        <div class="owner-note-row">
          <textarea id="customerOwnerNote" maxlength="1000" placeholder="Ej. Prefiere entrega en la tarde. Esta nota no se muestra al cliente.">${escapeText(memory.owner_notes || "")}</textarea>
          <button id="saveCustomerNote" type="button" class="button primary">Guardar nota</button>
        </div>
      </div>

      <div class="customer-timeline">
        <h4>Historia</h4>
        <div class="timeline-list" id="customerTimeline"></div>
      </div>
    `;

    const productsEl = detail.querySelector("#memoryProducts");
    if (frequent.length) {
      frequent.forEach((item) => {
        const chip = document.createElement("span");
        chip.textContent = `${item.name} · ${item.quantity || 0} ud.`;
        productsEl.appendChild(chip);
      });
    } else if (lastItems.length) {
      lastItems.forEach((item) => {
        const chip = document.createElement("span");
        chip.textContent = `${item.name} · ${item.quantity || 1} ud.`;
        productsEl.appendChild(chip);
      });
    } else {
      productsEl.innerHTML = '<span>Sin productos frecuentes todavía</span>';
    }

    const timeline = detail.querySelector("#customerTimeline");
    if (!events.length) {
      timeline.innerHTML = '<div class="customer-empty">Todavía no hay eventos registrados.</div>';
    } else {
      events.forEach((event) => {
        const item = document.createElement("div");
        item.className = "timeline-item";
        const orderCode = event.metadata?.public_code ? ` · ${event.metadata.public_code}` : "";
        const status = event.metadata?.status ? ` · ${statusLabels[event.metadata.status] || event.metadata.status}` : "";
        item.innerHTML = `<strong>${escapeText(event.title || event.event_type)}${escapeText(orderCode)}</strong><p>${escapeText(event.description || "")}${escapeText(status)}</p><time>${formatDate(event.occurred_at)}</time>`;
        timeline.appendChild(item);
      });
    }

    const textarea = detail.querySelector("#customerOwnerNote");
    const saveButton = detail.querySelector("#saveCustomerNote");
    saveButton.addEventListener("click", () => saveOwnerNote(customerId, textarea, saveButton));
  }

  async function boot() {
    try {
      const { data: { user } } = await db.auth.getUser();
      if (!user) return;
      const { data: businessRows, error: businessError } = await db.from("businesses").select("id,name").eq("owner_id", user.id).limit(1);
      if (businessError || !businessRows?.length) return;
      currentBusiness = businessRows[0];

      const [customerResult, memoryResult] = await Promise.all([
        db.from("local2_customers").select("id,name,phone,email,created_at").eq("business_id", currentBusiness.id).order("created_at", { ascending: false }),
        db.from("local2_customer_memory").select("customer_id,summary,preferences,facts,owner_notes,conversation_count,order_count,delivered_order_count,lifetime_value_cop,last_order_code,last_order_status,last_order_total_cop,last_order_items,frequent_products,last_payment_method,first_seen_at,last_interaction_at,updated_at").eq("business_id", currentBusiness.id)
      ]);
      if (customerResult.error) throw customerResult.error;
      if (memoryResult.error) throw memoryResult.error;

      customers = customerResult.data || [];
      memories = new Map((memoryResult.data || []).map((row) => [row.customer_id, row]));
      customers.sort((a, b) => {
        const aDate = new Date(memories.get(a.id)?.last_interaction_at || a.created_at || 0).getTime();
        const bDate = new Date(memories.get(b.id)?.last_interaction_at || b.created_at || 0).getTime();
        return bDate - aDate;
      });
      renderDirectory();
      if (customers.length) await loadCustomerDetail(customers[0].id);
      else detail.innerHTML = '<div class="customer-empty">Cuando el Empleado Digital atienda clientes, su historia aparecerá aquí.</div>';
    } catch (error) {
      console.error("Local2 customer history", error);
      directory.innerHTML = '<div class="customer-empty">No pudimos cargar los clientes.</div>';
    }
  }

  search.addEventListener("input", renderDirectory);
  window.addEventListener("local2:refresh", boot);
  boot();
})();
