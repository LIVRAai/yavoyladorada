(() => {
  const db = window.yavoyDb;
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const select = document.getElementById("businessSelect");
  const paymentPanel = document.getElementById("paymentPanel");
  const paymentForm = document.getElementById("paymentForm");
  const paymentTitle = document.getElementById("paymentTitle");
  const paymentInstructions = document.getElementById("paymentInstructions");
  const paymentMethod = document.getElementById("paymentMethod");
  const payerName = document.getElementById("payerName");
  const proofFile = document.getElementById("paymentProofFile");
  const proofHint = document.getElementById("paymentProofHint");
  if (!db || !form || !input || !messages || !select || !paymentPanel || !paymentForm || !proofFile) return;

  const BUCKET = "local2-payment-proofs";
  const MAX_BYTES = 8 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

  function addBubble(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
  }

  function money(value) {
    const amount = Number(value || 0);
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
  }

  function paymentIntent(text) {
    return /(^|\b)(ya\s+pagu[eé]|acabo\s+de\s+pagar|hice\s+el\s+pago|realic[eé]\s+el\s+pago|ya\s+transfer[ií]|te\s+pag[ué]e?|pago\s+hecho)(\b|$)/i.test(text.trim());
  }

  function sessionKey(businessId) {
    return `local2:session:${businessId}`;
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
    const key = sessionKey(businessId);
    const saved = localStorage.getItem(key) || "";
    const data = await invoke("local2-public-api", {
      action: "start_session",
      business_id: businessId,
      session_token: saved,
    });
    localStorage.setItem(key, data.session_token);
    return { businessId, token: data.session_token, customerId: data.customer_id || null };
  }

  function renderMethods(order, methods) {
    paymentPanel.hidden = false;
    paymentPanel.dataset.orderId = order.id;
    paymentPanel.dataset.orderCode = order.public_code;
    paymentTitle.textContent = `Comprobante · ${order.public_code} · ${money(order.total_cop)}`;
    paymentInstructions.innerHTML = "";
    paymentMethod.innerHTML = "";

    (methods || []).forEach((method) => {
      const card = document.createElement("div");
      card.className = "payment-method-card";
      const title = document.createElement("strong");
      title.textContent = method.label || method.method_type;
      const detail = document.createElement("span");
      detail.textContent = [method.destination, method.account_holder].filter(Boolean).join(" · ") || "Consulta las instrucciones del negocio";
      card.append(title, detail);
      if (method.instructions) {
        const instructions = document.createElement("span");
        instructions.textContent = method.instructions;
        card.appendChild(instructions);
      }
      paymentInstructions.appendChild(card);

      const option = document.createElement("option");
      option.value = method.id;
      option.textContent = method.label || method.method_type;
      paymentMethod.appendChild(option);
    });

    if (!(methods || []).length) {
      paymentForm.hidden = true;
    } else {
      paymentForm.hidden = false;
      proofFile.value = "";
      if (proofHint) proofHint.textContent = "JPG, PNG, WEBP o PDF · máximo 8 MB";
      paymentPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  async function resolveOrderFromPanel(session) {
    const explicitId = paymentPanel.dataset.orderId || "";
    const codeFromTitle = (paymentTitle.textContent.match(/L-[A-Z0-9]+/i) || [""])[0].toUpperCase();
    const tracking = await invoke("local2-public-api", {
      action: "track_orders",
      business_id: session.businessId,
      session_token: session.token,
    });
    const orders = tracking.orders || [];
    return orders.find((order) => order.id === explicitId) || orders.find((order) => String(order.public_code || "").toUpperCase() === codeFromTitle) || orders.find((order) => order.status === "awaiting_payment") || null;
  }

  proofFile.addEventListener("change", () => {
    const file = proofFile.files?.[0];
    if (!proofHint) return;
    if (!file) {
      proofHint.textContent = "JPG, PNG, WEBP o PDF · máximo 8 MB";
      return;
    }
    proofHint.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  });

  form.addEventListener("submit", async (event) => {
    const text = input.value.trim();
    if (!text || !paymentIntent(text)) return;

    try {
      const session = await ensureSession();
      if (!session.customerId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = "";
      addBubble(text, "user");

      const result = await invoke("local2-payment-proof-api", {
        action: "payment_intent",
        business_id: session.businessId,
        session_token: session.token,
        message: text,
      });
      addBubble(result.reply || "Envíame el comprobante para poder registrar el pago.");
      if (result.order?.status === "awaiting_payment" && result.payment_methods?.length) {
        renderMethods(result.order, result.payment_methods);
      }
    } catch (error) {
      event.preventDefault();
      event.stopImmediatePropagation();
      addBubble(error?.message || "No pudimos preparar el comprobante.", "error");
    }
  }, true);

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const submit = paymentForm.querySelector('button[type="submit"]');
    const file = proofFile.files?.[0];
    if (!file) {
      addBubble("Para registrar el pago necesito que adjuntes el comprobante.", "error");
      proofFile.focus();
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      addBubble("El comprobante debe ser una imagen JPG, PNG, WEBP o un PDF.", "error");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      addBubble("El comprobante debe pesar máximo 8 MB.", "error");
      return;
    }

    const originalText = submit?.textContent || "Enviar comprobante";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Subiendo comprobante…";
    }

    try {
      const session = await ensureSession();
      if (!session.customerId) throw new Error("Necesito identificarte antes de registrar el pago.");
      const order = await resolveOrderFromPanel(session);
      if (!order) throw new Error("No encuentro el pedido al que corresponde este comprobante.");
      if (order.status !== "awaiting_payment") throw new Error("Este pedido ya no está esperando pago.");

      const prepared = await invoke("local2-payment-proof-api", {
        action: "prepare_upload",
        business_id: session.businessId,
        session_token: session.token,
        order_id: order.id,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      const { error: uploadError } = await db.storage
        .from(prepared.bucket || BUCKET)
        .uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type });
      if (uploadError) throw new Error("No pudimos subir el comprobante. Intenta nuevamente.");

      if (submit) submit.textContent = "Registrando pago…";
      const result = await invoke("local2-payment-proof-api", {
        action: "report_payment_with_proof",
        business_id: session.businessId,
        session_token: session.token,
        order_id: order.id,
        payment_method_id: paymentMethod?.value || null,
        payer_name: payerName?.value || "",
        proof_path: prepared.path,
        proof_file_name: file.name,
        proof_mime_type: file.type,
        proof_size_bytes: file.size,
      });

      paymentPanel.hidden = true;
      paymentPanel.dataset.orderId = "";
      paymentPanel.dataset.orderCode = "";
      proofFile.value = "";
      if (payerName) payerName.value = "";
      addBubble(result.reply || `Gracias. El comprobante de ${order.public_code} quedó pendiente de confirmación.`);

      const trackingButton = document.querySelector('[data-intent="tracking"]');
      if (trackingButton) window.setTimeout(() => trackingButton.click(), 250);
    } catch (error) {
      addBubble(error?.message || "No pudimos registrar el comprobante.", "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = originalText;
      }
    }
  }, true);
})();
