(() => {
  const select = document.getElementById("businessSelect");
  const notice = document.getElementById("loadNotice");
  const experience = document.getElementById("businessExperience");
  const nameEl = document.getElementById("businessName");
  const metaEl = document.getElementById("businessMeta");
  const descriptionEl = document.getElementById("businessDescription");
  const offeringsEl = document.getElementById("offerings");
  const coverEl = document.getElementById("cover");
  const coverInitial = document.getElementById("coverInitial");
  const whatsappButton = document.getElementById("whatsappButton");
  const instagramButton = document.getElementById("instagramButton");
  const assistantButton = document.getElementById("assistantButton");
  const assistantPanel = document.getElementById("assistantPanel");
  const assistantTitle = document.getElementById("assistantTitle");
  const closeAssistant = document.getElementById("closeAssistant");
  const chatMessages = document.getElementById("chatMessages");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const shareUrl = document.getElementById("shareUrl");
  const copyLink = document.getElementById("copyLink");

  const categoryLabels = {
    comida: "Comida",
    hogar: "Hogar",
    belleza: "Belleza",
    moda: "Moda",
    servicios: "Servicios",
    tecnologia: "Tecnología"
  };
  const cityLabels = {
    "la-dorada": "La Dorada",
    "puerto-salgar": "Puerto Salgar"
  };

  let businesses = [];
  let currentBusiness = null;

  function safeHttpUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function whatsappUrl(value, businessName) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length < 10) return "";
    const text = encodeURIComponent(`Hola, vi ${businessName} en Local 💚 y quiero más información.`);
    return `https://wa.me/${digits}?text=${text}`;
  }

  function businessBetaUrl(business) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("negocio", business.id);
    return url.href;
  }

  function addMessage(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    chatMessages.appendChild(item);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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

  function renderBusiness(business) {
    currentBusiness = business;
    const profile = window.LocalProfileData?.parse(business.description) || {
      summary: business.description || "",
      offerings: []
    };

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

    const url = businessBetaUrl(business);
    shareUrl.value = url;
    assistantTitle.textContent = `Asistente de ${business.name}`;
    assistantPanel.hidden = true;
    chatMessages.innerHTML = "";
    addMessage(`Hola 👋 Soy el futuro Empleado Digital de ${business.name}. En esta beta estamos validando cómo se verá la experiencia antes de conectar pedidos, pagos y seguimiento reales.`);
    experience.hidden = false;

    const pageUrl = new URL(window.location.href);
    pageUrl.searchParams.set("negocio", business.id);
    window.history.replaceState({}, "", `${pageUrl.pathname}${pageUrl.search}`);
  }

  function mockReply(message) {
    if (!currentBusiness) return;
    const profile = window.LocalProfileData?.parse(currentBusiness.description) || { offerings: [], summary: "" };
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("pedido") || normalized.includes("compr") || normalized.includes("quiero")) {
      addMessage("En la siguiente etapa podré tomar tu pedido aquí mismo: elegir producto o servicio, cantidades, datos de entrega y dejarlo listo para que el negocio confirme el pago.");
      return;
    }
    if (normalized.includes("estado") || normalized.includes("segu") || normalized.includes("cómo va") || normalized.includes("como va")) {
      addMessage("El seguimiento será parte del mismo asistente. Cuando exista un pedido activo, podrás volver a este enlace y consultar si está esperando pago, confirmado, en preparación, listo o entregado.");
      return;
    }
    if (normalized.includes("ofrec") || normalized.includes("producto") || normalized.includes("servicio")) {
      if (profile.offerings?.length) {
        addMessage(`Según el perfil público de ${currentBusiness.name}, aquí encuentras: ${profile.offerings.join(", ")}. En la versión conectada consultaré productos, precios y disponibilidad reales.`);
      } else {
        addMessage(`Por ahora conozco que ${profile.summary || currentBusiness.name}. En la versión conectada el negocio podrá cargar su catálogo real.`);
      }
      return;
    }
    addMessage("Esta interfaz ya usa el perfil real del emprendimiento, pero todavía no estoy conectado a OpenAI ni al módulo de pedidos. Esa será la siguiente capa de la beta.");
  }

  async function loadBusinesses() {
    if (!window.yavoyDb) {
      notice.textContent = "No pudimos conectar con Local.";
      return;
    }

    const { data, error } = await window.yavoyDb
      .from("businesses")
      .select("id,name,category,city,description,image_url,instagram,whatsapp,phone,status")
      .eq("status", "active")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      notice.textContent = "No pudimos cargar los emprendimientos públicos.";
      return;
    }

    businesses = data || [];
    select.innerHTML = "";

    if (!businesses.length) {
      select.innerHTML = '<option value="">No hay emprendimientos visibles</option>';
      notice.textContent = "La comunidad no tiene perfiles públicos disponibles para esta prueba.";
      return;
    }

    businesses.forEach((business) => {
      const option = document.createElement("option");
      option.value = business.id;
      option.textContent = business.name;
      select.appendChild(option);
    });

    const requestedId = new URLSearchParams(window.location.search).get("negocio");
    const requested = businesses.find((business) => business.id === requestedId);
    const initial = requested || businesses[0];
    select.value = initial.id;
    notice.textContent = `${businesses.length} emprendimiento${businesses.length === 1 ? "" : "s"} disponible${businesses.length === 1 ? "" : "s"} para probar.`;
    renderBusiness(initial);
  }

  select.addEventListener("change", () => {
    const business = businesses.find((item) => item.id === select.value);
    if (business) renderBusiness(business);
  });

  assistantButton.addEventListener("click", () => {
    assistantPanel.hidden = false;
    assistantPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  closeAssistant.addEventListener("click", () => {
    assistantPanel.hidden = true;
  });

  document.querySelectorAll("[data-intent]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompts = {
        products: "¿Qué ofrecen?",
        order: "Quiero hacer un pedido",
        tracking: "Quiero consultar el estado de mi pedido"
      };
      const text = prompts[button.dataset.intent] || button.textContent;
      addMessage(text, "user");
      window.setTimeout(() => mockReply(text), 180);
    });
  });

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    addMessage(text, "user");
    chatInput.value = "";
    window.setTimeout(() => mockReply(text), 180);
  });

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
