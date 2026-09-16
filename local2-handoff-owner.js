(() => {
  const db = window.yavoyDb;
  const app = document.getElementById("ownerApp");
  if (!db || !app) return;

  const section = document.createElement("section");
  section.className = "card handoff-card";
  section.innerHTML = `
    <div class="section-head">
      <div>
        <span class="eyebrow">Atención humana</span>
        <h2>Solicitudes del cliente</h2>
        <p class="section-copy">Aquí aparecen las personas que pidieron hablar directamente con el negocio.</p>
      </div>
      <button id="refreshHandoffs" class="button ghost small" type="button">Actualizar</button>
    </div>
    <div id="handoffList" class="attention-list"><div class="empty">Cargando solicitudes…</div></div>
  `;

  const history = document.querySelector(".customer-history-card");
  if (history) app.insertBefore(section, history);
  else app.appendChild(section);

  const list = section.querySelector("#handoffList");
  const refresh = section.querySelector("#refreshHandoffs");

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function phoneLink(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits.length >= 7 ? `https://wa.me/${digits}` : "";
  }

  async function getOwnedBusiness() {
    const { data: auth } = await db.auth.getUser();
    const user = auth?.user;
    if (!user) return null;
    const { data, error } = await db.from("businesses").select("id,name").eq("owner_id", user.id).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function load() {
    list.innerHTML = '<div class="empty">Cargando solicitudes…</div>';
    try {
      const business = await getOwnedBusiness();
      if (!business) {
        list.innerHTML = '<div class="empty">No encontramos un negocio asociado a esta cuenta.</div>';
        return;
      }

      const { data: handoffs, error } = await db
        .from("local2_handoffs")
        .select("id,customer_id,contact_phone,status,last_customer_message,created_at")
        .eq("business_id", business.id)
        .eq("status", "open")
        .order("created_at", { ascending: true });
      if (error) throw error;

      const customerIds = [...new Set((handoffs || []).map((x) => x.customer_id).filter(Boolean))];
      let customers = [];
      if (customerIds.length) {
        const result = await db.from("local2_customers").select("id,name,phone,email").in("id", customerIds).eq("business_id", business.id);
        if (result.error) throw result.error;
        customers = result.data || [];
      }
      const byCustomer = new Map(customers.map((customer) => [customer.id, customer]));

      list.innerHTML = "";
      if (!(handoffs || []).length) {
        list.innerHTML = '<div class="empty">No hay clientes esperando atención humana.</div>';
        return;
      }

      handoffs.forEach((handoff) => {
        const customer = handoff.customer_id ? byCustomer.get(handoff.customer_id) : null;
        const contact = customer?.phone || handoff.contact_phone || "";
        const item = document.createElement("article");
        item.className = "attention-item handoff-item";

        const title = document.createElement("strong");
        title.textContent = customer?.name || "Cliente sin historial asociado";

        const meta = document.createElement("div");
        meta.className = "item-meta";
        meta.textContent = `${formatDate(handoff.created_at)}${contact ? ` · ${contact}` : ""}`;

        const message = document.createElement("p");
        message.className = "handoff-message";
        message.textContent = handoff.last_customer_message || "Solicitó hablar con el negocio.";

        const actions = document.createElement("div");
        actions.className = "item-actions";
        const wa = phoneLink(contact);
        if (wa) {
          const contactButton = document.createElement("a");
          contactButton.className = "button primary small";
          contactButton.href = wa;
          contactButton.target = "_blank";
          contactButton.rel = "noopener noreferrer";
          contactButton.textContent = "Contactar por WhatsApp";
          actions.appendChild(contactButton);
        }

        const resolve = document.createElement("button");
        resolve.className = "secondary";
        resolve.type = "button";
        resolve.textContent = "Marcar atendido";
        resolve.addEventListener("click", async () => {
          resolve.disabled = true;
          const { error: updateError } = await db
            .from("local2_handoffs")
            .update({ status: "resolved", resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", handoff.id)
            .eq("business_id", business.id);
          if (updateError) {
            resolve.disabled = false;
            resolve.textContent = "Error · reintentar";
            return;
          }
          item.remove();
          if (!list.children.length) list.innerHTML = '<div class="empty">No hay clientes esperando atención humana.</div>';
        });
        actions.appendChild(resolve);

        item.append(title, meta, message, actions);
        list.appendChild(item);
      });
    } catch (error) {
      console.error("Local 2.0 owner handoffs", error);
      list.innerHTML = '<div class="empty">No pudimos cargar las solicitudes de atención.</div>';
    }
  }

  refresh.addEventListener("click", load);
  window.setTimeout(load, 600);
})();
