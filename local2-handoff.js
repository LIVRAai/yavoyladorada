(() => {
  const db = window.yavoyDb;
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const select = document.getElementById("businessSelect");
  const quickActions = document.querySelector(".quick-actions");
  if (!db || !form || !input || !messages || !select) return;

  const stateByBusiness = new Map();

  function state() {
    const id = select.value;
    if (!stateByBusiness.has(id)) stateByBusiness.set(id, { awaitingPhone: false, pendingMessage: "" });
    return stateByBusiness.get(id);
  }

  function addBubble(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function isHandoffIntent(text) {
    return /(hablar con (alguien|una persona|un asesor|una asesora|el negocio)|quiero (un asesor|una asesora|hablar con alguien|hablar con una persona)|que me contacte(n)?|necesito ayuda humana|hablar con el dueño|hablar con la dueña|hablar con el propietario|hablar con la propietaria)/i.test(String(text || "").trim());
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 20);
  }

  async function invoke(name, body) {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) throw new Error("No pudimos dejar la solicitud. Intenta nuevamente.");
    if (!data?.ok) {
      const err = new Error(data?.error || "No pudimos dejar la solicitud.");
      err.needsContact = Boolean(data?.needs_contact);
      throw err;
    }
    return data;
  }

  async function ensureSession() {
    const businessId = select.value;
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

  async function createHandoff(message, contactPhone = "") {
    const session = await ensureSession();
    return invoke("local2-handoff-api", {
      action: "request_human",
      business_id: session.businessId,
      session_token: session.token,
      message,
      contact_phone: contactPhone,
    });
  }

  async function handleIntent(text, options = {}) {
    const echoUser = options.echoUser !== false;
    if (echoUser) addBubble(text, "user");
    const current = state();
    current.pendingMessage = text;

    try {
      const result = await createHandoff(text);
      current.pendingMessage = "";
      current.awaitingPhone = false;
      addBubble(result.reply || "Listo. Dejé tu solicitud para que el negocio la revise.");
      return { handled: true, result };
    } catch (error) {
      if (error?.needsContact) {
        current.awaitingPhone = true;
        addBubble("Claro. Para que el negocio pueda contactarte, déjame un número de celular. Esto solo se usará para esta solicitud y no abrirá tu historial de compras.");
        input.placeholder = "Escribe tu celular...";
        input.focus();
        return { handled: true, needsContact: true };
      }
      throw error;
    }
  }

  async function handlePhone(text) {
    const current = state();
    const phone = normalizePhone(text);
    if (phone.length < 7) {
      addBubble("Ese número parece incompleto. Escríbeme un celular válido, por ejemplo 3001234567.");
      return;
    }
    addBubble(`Celular •••• ${phone.slice(-4)}`, "user");
    const pending = current.pendingMessage || "Quiero hablar con alguien";
    const result = await createHandoff(pending, phone);
    current.pendingMessage = "";
    current.awaitingPhone = false;
    input.placeholder = "Escribe un mensaje...";
    addBubble(result.reply || "Listo. Dejé tu solicitud para que el negocio la revise.");
  }

  window.Local2Handoff = { isHandoffIntent, handleIntent };

  if (quickActions && !quickActions.querySelector('[data-intent="human"]')) {
    const humanButton = document.createElement("button");
    humanButton.type = "button";
    humanButton.dataset.intent = "human";
    humanButton.textContent = "Hablar con el negocio";
    humanButton.addEventListener("click", () => {
      input.value = "Quiero hablar con alguien del negocio";
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    quickActions.appendChild(humanButton);
  }

  form.addEventListener("submit", async (event) => {
    const text = input.value.trim();
    if (!text) return;
    const current = state();
    if (!current.awaitingPhone && !isHandoffIntent(text)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    try {
      if (current.awaitingPhone) await handlePhone(text);
      else await handleIntent(text, { echoUser: true });
    } catch (error) {
      console.error("Local 2.0 handoff", error);
      addBubble(error?.message || "No pudimos dejar la solicitud.", "error");
    }
  }, true);

  select.addEventListener("change", () => {
    stateByBusiness.clear();
    input.placeholder = "Escribe un mensaje...";
  });
})();
