(() => {
  const db = window.yavoyDb;
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const messages = document.getElementById("chatMessages");
  const select = document.getElementById("businessSelect");
  const productsQuick = document.querySelector('[data-intent="products"]');
  if (!db || !form || !input || !messages || !select) return;

  const cache = new Map();

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Precio por confirmar";
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function addBubble(text, type = "bot") {
    const item = document.createElement("div");
    item.className = `message ${type}`;
    item.textContent = text;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }

  function isCatalogIntent(text) {
    const value = normalize(text);
    if (!value) return false;
    return /(catalogo|productos|que venden|que tienen|que ofrecen|muestrame|mostrar productos|ver productos|opciones|recomiendame|recomienda|busco algo|tienen algo|algo para|producto para)/i.test(value);
  }

  async function invoke(name, body) {
    const { data, error } = await db.functions.invoke(name, { body });
    if (error) throw new Error("No pudimos cargar el catálogo. Intenta nuevamente.");
    if (!data?.ok) throw new Error(data?.error || "No pudimos cargar el catálogo.");
    return data;
  }

  async function loadCatalog() {
    const businessId = select.value;
    if (!businessId) throw new Error("No hay un emprendimiento seleccionado.");
    if (cache.has(businessId)) return cache.get(businessId);
    const data = await invoke("local2-public-api", { action: "bootstrap", business_id: businessId });
    cache.set(businessId, data);
    return data;
  }

  function scoreProduct(query, product) {
    const q = normalize(query);
    if (!q || /^(catalogo|productos|ver productos|que venden|que tienen|que ofrecen|opciones)$/.test(q)) return 1;

    const haystack = normalize(`${product.name || ""} ${product.description || ""}`);
    const queryTokens = q
      .split(" ")
      .filter((token) => token.length >= 3)
      .filter((token) => !["quiero", "busco", "algo", "para", "tienen", "producto", "productos", "mostrar", "muestrame", "recomiendame", "recomienda"].includes(token));

    if (!queryTokens.length) return 1;
    let score = 0;
    queryTokens.forEach((token) => {
      if (haystack.includes(token)) score += token.length >= 6 ? 4 : 2;
    });
    if (haystack.includes(q)) score += 10;
    return score;
  }

  function selectProducts(query, products) {
    const active = (products || []).filter((product) => {
      if (product.track_stock && Number(product.stock_quantity) <= 0) return false;
      return true;
    });

    const ranked = active
      .map((product) => ({ product, score: scoreProduct(query, product) }))
      .sort((a, b) => b.score - a.score);

    const relevant = ranked.filter((entry) => entry.score > 0);
    return (relevant.length ? relevant : ranked).slice(0, 6).map((entry) => entry.product);
  }

  function submitOrder(product) {
    input.value = `Quiero 1 ${product.name}`;
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }

  function renderProductCard(product) {
    const card = document.createElement("article");
    card.className = "chat-product-card";

    if (product.image_url) {
      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = product.name || "Producto";
      image.loading = "lazy";
      card.appendChild(image);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "chat-product-image-fallback";
      fallback.textContent = (product.name || "P").trim().charAt(0).toUpperCase();
      card.appendChild(fallback);
    }

    const body = document.createElement("div");
    body.className = "chat-product-body";

    const name = document.createElement("strong");
    name.textContent = product.name || "Producto";
    body.appendChild(name);

    if (product.description) {
      const description = document.createElement("p");
      description.textContent = product.description;
      body.appendChild(description);
    }

    const footer = document.createElement("div");
    footer.className = "chat-product-footer";

    const price = document.createElement("strong");
    price.className = "chat-product-price";
    price.textContent = product.price_cop === null ? "Consultar precio" : money(product.price_cop);
    footer.appendChild(price);

    if (product.price_cop !== null) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-product-order";
      button.textContent = "Pedir";
      button.addEventListener("click", () => submitOrder(product));
      footer.appendChild(button);
    }

    body.appendChild(footer);
    card.appendChild(body);
    return card;
  }

  function renderCatalog(products, titleText) {
    const wrapper = document.createElement("div");
    wrapper.className = "chat-catalog-block";

    const title = document.createElement("div");
    title.className = "chat-catalog-title";
    const strong = document.createElement("strong");
    strong.textContent = titleText;
    const hint = document.createElement("span");
    hint.textContent = "Puedes preguntarme por cualquiera o tocar “Pedir”.";
    title.append(strong, hint);
    wrapper.appendChild(title);

    const rail = document.createElement("div");
    rail.className = "chat-product-rail";
    products.forEach((product) => rail.appendChild(renderProductCard(product)));
    wrapper.appendChild(rail);

    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
  }

  async function showProducts(query, { echoUser = true } = {}) {
    if (echoUser) addBubble(query, "user");
    const catalog = await loadCatalog();
    const products = selectProducts(query, catalog.products || []);

    if (!products.length) {
      addBubble("Este negocio todavía no tiene productos disponibles en el catálogo digital.");
      return;
    }

    const generic = /^(catalogo|productos|ver productos|que venden|que tienen|que ofrecen|opciones)$/i.test(normalize(query));
    if (generic) {
      addBubble("Claro 😊 Mira algunos productos disponibles. Si me dices qué estás buscando, puedo ayudarte a filtrar las opciones.");
      renderCatalog(products, "Productos disponibles");
    } else {
      addBubble(`Encontré ${products.length === 1 ? "esta opción" : "estas opciones"} que pueden servirte:`);
      renderCatalog(products, "Opciones para ti");
    }
  }

  window.Local2CatalogAssistant = { isCatalogIntent, showProducts };

  form.addEventListener("submit", async (event) => {
    const text = input.value.trim();
    if (!text || !isCatalogIntent(text)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = "";
    try {
      await showProducts(text, { echoUser: true });
    } catch (error) {
      console.error("Local 2.0 catalog assistant", error);
      addBubble(error?.message || "No pudimos mostrar el catálogo.", "error");
    }
  }, true);

  productsQuick?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      await showProducts("Ver productos", { echoUser: false });
    } catch (error) {
      console.error("Local 2.0 product quick action", error);
      addBubble(error?.message || "No pudimos mostrar el catálogo.", "error");
    }
  }, true);

  select.addEventListener("change", () => cache.clear());
})();
