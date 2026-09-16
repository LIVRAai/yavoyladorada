(() => {
  const quickActions = document.querySelector(".quick-actions");
  const assistant = document.getElementById("assistantPanel");
  if (!quickActions || !assistant || !window.yavoyDb) return;

  const style = document.createElement("style");
  style.textContent = `
    .recovery-panel{margin:8px 0 14px;padding:18px;border:1px solid #dce6df;border-radius:16px;background:#fbfdfc}
    .recovery-panel h3{margin:5px 0 7px}.recovery-panel p{margin:0 0 14px;color:#66746c;line-height:1.5}
    .recovery-form{display:grid;gap:10px}.recovery-form label{display:grid;gap:6px;font-size:12px;font-weight:800;color:#33443a}
    .recovery-form input{width:100%;border:1px solid #dce6df;border-radius:11px;padding:11px 12px;font:inherit;background:white}
    .recovery-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.recovery-result{margin-top:12px;padding:12px;border-radius:12px;background:#eaf5ee;color:#155137;line-height:1.5}
    .recovery-error{background:#fff0ee;color:#8f2e23}.recovery-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    @media(max-width:620px){.recovery-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Recuperar pedido";
  button.dataset.recovery = "true";
  quickActions.appendChild(button);

  const panel = document.createElement("section");
  panel.className = "recovery-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <span class="flow-kicker">Otro celular o navegador</span>
    <h3>Recuperar un pedido</h3>
    <p>Escribe el código del pedido y el celular o correo que usaste al comprar. No usamos tu documento como contraseña.</p>
    <form class="recovery-form" id="recoveryForm">
      <label>Código del pedido<input id="recoveryCode" maxlength="40" placeholder="Ej. L-AB12CD34" required></label>
      <div class="recovery-grid">
        <label>Celular<input id="recoveryPhone" inputmode="tel" maxlength="25" placeholder="300 123 4567"></label>
        <label>Correo<input id="recoveryEmail" type="email" maxlength="180" placeholder="correo@ejemplo.com"></label>
      </div>
      <button class="primary-button" type="submit">Recuperar mi pedido</button>
    </form>
    <div id="recoveryResult" class="recovery-result" hidden></div>
  `;
  const chatForm = document.getElementById("chatForm");
  assistant.insertBefore(panel, chatForm);

  const form = panel.querySelector("#recoveryForm");
  const codeInput = panel.querySelector("#recoveryCode");
  const phoneInput = panel.querySelector("#recoveryPhone");
  const emailInput = panel.querySelector("#recoveryEmail");
  const result = panel.querySelector("#recoveryResult");

  function requestedBusinessKey() {
    return new URLSearchParams(window.location.search).get("negocio") || "";
  }

  async function resolveBusiness() {
    const key = requestedBusinessKey();
    if (!key) throw new Error("No encontramos el emprendimiento.");
    let query = window.yavoyDb.from("local2_business_settings").select("business_id,slug");
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
    query = isUuid ? query.eq("business_id", key) : query.eq("slug", key);
    const { data, error } = await query.maybeSingle();
    if (error || !data) throw new Error("Este emprendimiento todavía no tiene recuperación de pedidos activa.");
    return data;
  }

  async function ensureToken(businessId) {
    const storageKey = `local2:session:${businessId}`;
    const saved = localStorage.getItem(storageKey) || "";
    const { data, error } = await window.yavoyDb.functions.invoke("local2-public-api", {
      body: { action: "start_session", business_id: businessId, session_token: saved }
    });
    if (error || !data?.ok) throw new Error(data?.error || "No pudimos preparar tu sesión.");
    localStorage.setItem(storageKey, data.session_token);
    return data.session_token;
  }

  button.addEventListener("click", () => {
    document.querySelectorAll(".flow-panel").forEach((el) => { el.hidden = true; });
    panel.hidden = false;
    result.hidden = true;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Buscando pedido…";
    result.hidden = true;
    result.classList.remove("recovery-error");
    try {
      if (!phoneInput.value.trim() && !emailInput.value.trim()) throw new Error("Escribe el celular o correo usado en la compra.");
      const business = await resolveBusiness();
      const token = await ensureToken(business.business_id);
      const { data, error } = await window.yavoyDb.functions.invoke("local2-recovery-api", {
        body: {
          action: "recover_order",
          business_slug: business.slug,
          order_code: codeInput.value,
          phone: phoneInput.value,
          email: emailInput.value,
          session_token: token,
        }
      });
      if (error || !data?.ok) throw new Error(data?.error || "No pudimos recuperar el pedido.");

      const labels = {
        awaiting_payment: "Esperando pago",
        payment_reported: "Pago por confirmar",
        payment_confirmed: "Pago confirmado",
        preparing: "En preparación",
        ready: "Listo",
        delivered: "Entregado",
        cancelled: "Cancelado"
      };
      result.innerHTML = `<strong>${data.order.public_code} recuperado ✓</strong><br>${data.customer?.name || "Cliente"} · ${labels[data.order.status] || data.order.status}<div class="recovery-actions"><button type="button" class="primary-button" id="continueRecovered">Continuar en mi sesión</button></div>`;
      result.hidden = false;
      result.querySelector("#continueRecovered").addEventListener("click", () => window.location.reload());
    } catch (error) {
      result.textContent = error.message || "No pudimos recuperar el pedido.";
      result.classList.add("recovery-error");
      result.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = "Recuperar mi pedido";
    }
  });
})();
