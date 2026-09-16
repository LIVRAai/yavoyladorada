(() => {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const select = document.getElementById("businessSelect");
  const identityForm = document.getElementById("identityForm");
  const customerName = document.getElementById("customerName");
  const customerPhone = document.getElementById("customerPhone");
  const customerEmail = document.getElementById("customerEmail");
  const sessionLabel = document.getElementById("sessionLabel");
  if (!form || !input || !messages || !select || !window.yavoyDb) return;

  const db = window.yavoyDb;
  const stateByBusiness = new Map();

  function state() {
    const businessId = select.value;
    if (!stateByBusiness.has(businessId)) {
      stateByBusiness.set(businessId, {
        phase: "unknown",
        phone: "",
        displayName: "",
        customerFound: false,
        pendingMessage: "",
        sessionToken: "",
        skipIdentity: false,
      });
    }
    return stateByBusiness.get(businessId);
  }

  function addBubble(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 20);
  }

  function maskedPhone(phone) {
    const digits = normalizePhone(phone);
    return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "celular confirmado";
  }

  function isAnonymousChoice(text) {
    return /^(seguir|continuar)\s+(sin\s+)?identificar(me)?$/i.test(text.trim()) || /^prefiero no$/i.test(text.trim());
  }

  function isContinueWithoutHistory(text) {
    return /^(seguir|continuar)\s+(sin\s+)?historial$/i.test(text.trim()) || /^no tengo (el )?c[oó]digo$/i.test(text.trim());
  }

  function wantsChangePhone(text) {
    return /cambiar\s+(el\s+)?(número|numero|celular)/i.test(text);
  }

  function setPlaceholder(text) {
    input.placeholder = text || "Escribe un mensaje...";
    input.focus();
  }

  async function invoke(name, body) {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) throw new Error("No pudimos completar la verificación. Intenta nuevamente.");
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar la verificación.");
    return data;
  }

  async function ensureSession(businessId) {
    const key = `local2:session:${businessId}`;
    const savedToken = localStorage.getItem(key) || "";
    const data = await invoke("local2-public-api", {
      action: "start_session",
      business_id: businessId,
      session_token: savedToken,
    });
    localStorage.setItem(key, data.session_token);
    const current = state();
    current.sessionToken = data.session_token;
    if (data.customer_id) current.phase = "identified";
    return data;
  }

  async function resolveBusinessSlug() {
    const { data, error } = await db
      .from("local2_business_settings")
      .select("slug")
      .eq("business_id", select.value)
      .maybeSingle();
    if (error || !data?.slug) throw new Error("No pudimos preparar la recuperación de tu historial.");
    return data.slug;
  }

  async function sendRememberedMessage(message) {
    const businessId = select.value;
    const current = state();
    const data = await invoke("local2-chat-api-v2", {
      action: "send_message",
      business_id: businessId,
      session_token: current.sessionToken,
      message,
    });
    addBubble(data.reply || "¿En qué más puedo ayudarte?");
    if (data.customer_name) sessionLabel.textContent = `Atendiendo a ${data.customer_name} ✓`;
  }

  async function waitUntilLinked(businessId, token) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const data = await invoke("local2-public-api", {
        action: "start_session",
        business_id: businessId,
        session_token: token,
      });
      if (data.customer_id) return data;
    }
    throw new Error("No pudimos terminar de asociar tu sesión. Intenta nuevamente.");
  }

  async function linkNewCustomer(name, phone) {
    if (!identityForm || !customerName || !customerPhone || !customerEmail) {
      throw new Error("No pudimos completar el registro del cliente.");
    }
    customerName.value = name;
    customerPhone.value = phone;
    customerEmail.value = "";
    identityForm.requestSubmit();
    const current = state();
    const linked = await waitUntilLinked(select.value, current.sessionToken);
    current.phase = "identified";
    sessionLabel.textContent = `Atendiendo a ${name} ✓`;
    return linked;
  }

  async function replayPending() {
    const current = state();
    setPlaceholder("Escribe un mensaje...");
    const pending = current.pendingMessage;
    current.pendingMessage = "";
    if (pending) await sendRememberedMessage(pending);
  }

  async function finishNewCustomer(name) {
    const current = state();
    await linkNewCustomer(name, current.phone);
    await replayPending();
  }

  async function continueWithoutHistory() {
    const current = state();
    current.skipIdentity = true;
    current.phase = "anonymous";
    sessionLabel.textContent = current.displayName ? `Atendiendo a ${current.displayName} · sin historial` : "Sesión sin historial";
    addBubble(current.displayName
      ? `Perfecto, ${current.displayName}. Podemos seguir. Por seguridad no usaré compras anteriores en este dispositivo hasta que recuperes tu historial.`
      : "Claro. Podemos seguir sin identificarte; simplemente no podré recordar tu historia cuando vuelvas.");
    await replayPending();
  }

  async function handleFirstMessage(text) {
    const businessId = select.value;
    const current = state();
    const session = await ensureSession(businessId);

    if (session.customer_id) {
      current.phase = "identified";
      addBubble(text, "user");
      await sendRememberedMessage(text);
      return;
    }

    messages.innerHTML = "";
    addBubble(text, "user");
    current.pendingMessage = text;
    current.phase = "awaiting_phone";
    addBubble("¡Hola! 👋 Antes de seguir, confírmame tu número de celular. Si ya has comprado aquí, intentaré reconocerte; si es tu primera vez, lo usaré para registrarte y recordar nuestra relación con este negocio. Si prefieres continuar sin identificarte, escribe “seguir sin identificarme”.");
    setPlaceholder("Escribe tu número de celular...");
  }

  async function handlePhone(text) {
    const current = state();
    if (isAnonymousChoice(text)) {
      await continueWithoutHistory();
      return;
    }

    const phone = normalizePhone(text);
    if (phone.length < 7) {
      addBubble("Ese número parece incompleto. Escríbeme tu celular, por ejemplo 3001234567.");
      setPlaceholder("Confirma tu celular...");
      return;
    }

    current.phone = phone;
    addBubble(`Celular ${maskedPhone(phone)}`, "user");
    const lookup = await invoke("local2-identity-api", {
      action: "lookup_phone",
      business_id: select.value,
      session_token: current.sessionToken,
      phone,
    });
    current.customerFound = Boolean(lookup.found);
    current.phase = "awaiting_name";

    if (lookup.found) {
      addBubble("Encontré un cliente registrado con ese celular 😊 Confírmame tu nombre. Si coincide, te explicaré cómo recuperar tu historial de forma segura en este dispositivo.");
    } else {
      addBubble("No encuentro un cliente registrado con ese número. ¿Cómo te llamas? Te registraré para que este dispositivo pueda reconocerte cuando vuelvas.");
    }
    setPlaceholder("Escribe tu nombre...");
  }

  async function handleName(text) {
    const current = state();
    if (isAnonymousChoice(text)) {
      await continueWithoutHistory();
      return;
    }
    if (wantsChangePhone(text)) {
      current.phase = "awaiting_phone";
      current.phone = "";
      current.displayName = "";
      addBubble("Perfecto. Escríbeme el número de celular correcto.");
      setPlaceholder("Escribe tu número de celular...");
      return;
    }

    const name = text.trim().replace(/\s+/g, " ").slice(0, 120);
    if (name.length < 2) {
      addBubble("Necesito al menos tu nombre para continuar.");
      return;
    }
    addBubble(name, "user");
    current.displayName = name;

    if (current.customerFound) {
      const verification = await invoke("local2-identity-api", {
        action: "verify_name",
        business_id: select.value,
        session_token: current.sessionToken,
        phone: current.phone,
        name,
      });
      if (!verification.verified) {
        addBubble("El nombre no coincide con el registrado para ese celular. Intenta con el nombre usado anteriormente o escribe “cambiar número”.");
        setPlaceholder("Confirma tu nombre o escribe cambiar número...");
        return;
      }

      current.displayName = verification.customer_name || name;
      current.phase = "awaiting_order_code";
      addBubble(`Perfecto, ${current.displayName} 😊 Te reconocí. Para proteger tus compras anteriores en un dispositivo nuevo, confírmame el código de uno de tus pedidos (por ejemplo L-AB12CD34). Si ahora no lo tienes, escribe “continuar sin historial” y podemos seguir conversando sin mostrar compras anteriores.`);
      setPlaceholder("Código de pedido o “continuar sin historial”…");
      return;
    }

    addBubble(`Mucho gusto, ${name} 😊 Te registraré para que cuando regreses desde este dispositivo podamos continuar donde quedamos.`);
    await finishNewCustomer(name);
  }

  async function handleOrderCode(text) {
    const current = state();
    if (isContinueWithoutHistory(text) || isAnonymousChoice(text)) {
      await continueWithoutHistory();
      return;
    }

    const code = text.trim().toUpperCase();
    if (!/^L-[A-Z0-9]{4,20}$/.test(code)) {
      addBubble("Ese código no parece un pedido de Local. Debe verse parecido a L-AB12CD34. También puedes escribir “continuar sin historial”.");
      return;
    }

    addBubble(code, "user");
    const slug = await resolveBusinessSlug();
    const recovery = await invoke("local2-recovery-api", {
      action: "recover_order",
      business_slug: slug,
      order_code: code,
      phone: current.phone,
      email: "",
      session_token: current.sessionToken,
    });

    current.phase = "identified";
    current.skipIdentity = false;
    current.displayName = recovery.customer?.name || current.displayName;
    sessionLabel.textContent = `Atendiendo a ${current.displayName || "cliente"} ✓`;
    addBubble(`Listo, ${current.displayName || "ya está"} ✓ Recuperé tu historial con este negocio de forma segura. Podemos continuar donde quedamos.`);
    await replayPending();
  }

  form.addEventListener("submit", async (event) => {
    const current = state();
    if (current.phase === "identified" || current.phase === "anonymous" || current.skipIdentity) return;

    const text = input.value.trim();
    if (!text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";

    try {
      if (current.phase === "unknown") {
        await handleFirstMessage(text);
      } else if (current.phase === "awaiting_phone") {
        await handlePhone(text);
      } else if (current.phase === "awaiting_name") {
        await handleName(text);
      } else if (current.phase === "awaiting_order_code") {
        await handleOrderCode(text);
      }
    } catch (error) {
      console.error("Local 2.0 conversational identity", error);
      addBubble(error?.message || "No pudimos completar la identificación. Intenta nuevamente.", "error");
    }
  }, true);

  select.addEventListener("change", () => {
    setPlaceholder("Escribe un mensaje...");
  });
})();
