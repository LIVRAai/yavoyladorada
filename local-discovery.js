/* Local Discovery: real businesses only. Reuses the production LocalTrial catalog policy. */
(() => {
  "use strict";
  const grid = document.getElementById("lxDiscoveryGrid");
  const status = document.getElementById("lxDiscoveryStatus");
  if (!grid) return;

  const cities = { "la-dorada": "La Dorada", "puerto-salgar": "Puerto Salgar" };
  const categories = { comida:"Comida", hogar:"Hogar", belleza:"Belleza", moda:"Moda", servicios:"Servicios", tecnologia:"Tecnología" };
  const limit = 3;
  const safeDescription = (business) => {
    try { return window.LocalProfileData?.parse(business.description)?.summary || "Descubre la historia de este emprendimiento local."; }
    catch { return "Descubre la historia de este emprendimiento local."; }
  };
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof value === "string") node.textContent = value;
    return node;
  }

  function renderCard(business) {
    const a = element("a", "lx-story");
    const params = new URLSearchParams({ negocio: String(business.id) });
    a.href = "catalogo-dinamico.html?" + params.toString();
    a.setAttribute("aria-label", "Conocer " + (business.name || "emprendimiento"));
    // Cards created after load must never depend on the initial reveal observer.
    const media = element("div", "lx-story-media");
    const badge = element("span", "lx-story-badge", categories[business.category] || "Emprendimiento");
    const safeImage = window.YaVoyCoverImage?.isSafeImageSource(business.image_url) || "";
    if (safeImage) {
      const img = document.createElement("img");
      img.src = safeImage;
      img.alt = "Portada de " + (business.name || "emprendimiento");
      img.loading = "lazy";
      img.decoding = "async";
      const fallback = () => {
        img.remove();
        if (!media.querySelector(".lx-story-monogram")) {
          media.prepend(element("span", "lx-story-monogram", (business.name || "L").slice(0, 1).toUpperCase()));
        }
      };
      img.addEventListener("error", fallback, { once: true });
      media.appendChild(img);
    } else {
      media.appendChild(element("span", "lx-story-monogram", (business.name || "L").slice(0, 1).toUpperCase()));
    }
    media.appendChild(badge);
    const body = element("div", "lx-story-body");
    body.appendChild(element("span", "lx-story-city", cities[business.city] || business.city || "Nuestra región"));
    body.appendChild(element("h3", "lx-story-name", business.name || "Emprendimiento Local"));
    body.appendChild(element("p", "lx-story-copy", safeDescription(business)));
    const action = element("span", "lx-story-action");
    action.appendChild(element("span", "", "Conocer su historia"));
    if (window.LocalExperience?.icon) action.appendChild(window.LocalExperience.icon("arrow"));
    else action.appendChild(element("span", "", "↗"));
    body.appendChild(action);
    a.append(media, body);
    return a;
  }

  function showMessage(message) {
    const box = element("div", "lx-discovery-message");
    const p = element("p", "", message);
    const link = element("a", "", "Explorar la comunidad →");
    link.href = "catalogo-dinamico.html";
    box.append(p, link);
    grid.replaceChildren(box);
    status.textContent = "Explora los emprendimientos de la región.";
  }

  async function load() {
    if (!window.yavoyDb || !window.LocalTrial?.isCatalogVisible) {
      showMessage("Puedes conocer los emprendimientos de nuestra comunidad en el catálogo.");
      return;
    }
    try {
      const { data, error } = await window.yavoyDb.from("businesses")
        .select("id,name,category,city,description,image_url,status,manual_active,created_at,updated_at")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const eligible = (data || []).filter(b => window.LocalTrial.isCatalogVisible(b));
      const cards = eligible.slice(0, limit);
      if (!cards.length) {
        showMessage("Pronto podrás descubrir aquí las historias de nuestra comunidad.");
        return;
      }
      const rendered = cards.map(renderCard);
      grid.replaceChildren(...rendered);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        rendered.forEach((card, index) => {
          card.animate?.(
            [{ opacity: 0, transform: "translateY(22px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 680, delay: index * 95, easing: "cubic-bezier(.2,.8,.2,1)", fill: "both" }
          );
        });
      }
      status.textContent = cards.length + (cards.length === 1 ? " emprendimiento para descubrir" : " emprendimientos para descubrir");
      if (window.LocalExperience?.enhanceCards) window.LocalExperience.enhanceCards();
    } catch (error) {
      console.warn("Local Discovery: no se pudieron cargar historias", error);
      showMessage("La selección de emprendimientos no está disponible en este momento.");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once:true });
  else load();
})();