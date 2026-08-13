// ----------------------------
// Inicio de página: evita que el navegador restaure una sección anterior
// ----------------------------
(function resetInitialScrollPosition() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  const goToTop = () => {
    // Si la página quedó abierta con un #catalogo, #pedir, etc.,
    // limpiamos el hash solo durante la carga inicial.
    if (window.location.hash) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  // Algunos navegadores móviles restauran el scroll después de pintar la página.
  // Repetimos el ajuste únicamente durante el arranque para ganar esa carrera.
  goToTop();
  requestAnimationFrame(() => requestAnimationFrame(goToTop));
  window.addEventListener("load", goToTop, { once: true });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) goToTop();
  }, { once: true });
})();

// =====================================================
// YaVoy V1 — configuración rápida
// Cambia este número por el WhatsApp real de la central.
// Formato: código de país + número, sin +, espacios ni guiones.
// =====================================================
const YAVOY_WHATSAPP = "573000000000";

// Tarifas PROVISIONALES del MVP. Se pueden cambiar en un solo lugar.
const RATES = {
  sameCity: 6000,
  crossCity: 8000,
  compraExtra: 2000,
  mandadoExtra: 2000
};

const cityNames = {
  "la-dorada": "La Dorada",
  "puerto-salgar": "Puerto Salgar"
};

// ----------------------------
// Catálogo: búsqueda y filtros
// ----------------------------
const searchInput = document.getElementById("buscar");
const searchButton = document.getElementById("buscarBtn");
const cards = [...document.querySelectorAll(".business-card")];
const filterPills = [...document.querySelectorAll(".filter-pill")];
const categoryCards = [...document.querySelectorAll(".category-card")];
const cityFilter = document.getElementById("cityFilter");
const emptyState = document.getElementById("emptyState");
let currentFilter = "todos";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let filtersInitialized = false;

function smoothScrollTo(id) {
  document.getElementById(id)?.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start"
  });
}

function normalizeText(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function applyFilters(scroll = false) {
  const term = normalizeText(searchInput.value.trim());
  const city = cityFilter.value;
  let visible = 0;

  cards.forEach((card, index) => {
    const categories = (card.dataset.category || "").split(" ");
    const searchText = normalizeText(`${card.dataset.search || ""} ${card.textContent}`);
    const matchesCategory = currentFilter === "todos" || categories.includes(currentFilter);
    const matchesSearch = !term || searchText.includes(term);
    const matchesCity = city === "todas" || card.dataset.city === city;
    const shouldShow = matchesCategory && matchesSearch && matchesCity;

    if (shouldShow) {
      const wasHidden = card.style.display === "none";
      card.style.display = "";
      visible += 1;

      if (filtersInitialized && wasHidden && !prefersReducedMotion) {
        card.classList.remove("filter-enter");
        void card.offsetWidth;
        card.style.setProperty("--reveal-delay", `${Math.min(index * 24, 140)}ms`);
        card.classList.add("filter-enter");
        card.addEventListener("animationend", () => card.classList.remove("filter-enter"), { once: true });
      }
    } else {
      card.style.display = "none";
    }
  });

  emptyState.style.display = visible ? "none" : "block";
  if (scroll) smoothScrollTo("catalogo");
}

function setFilter(filter) {
  currentFilter = filter;
  filterPills.forEach((pill) => pill.classList.toggle("active", pill.dataset.filter === filter));
  applyFilters();
}

filterPills.forEach((pill) => pill.addEventListener("click", () => setFilter(pill.dataset.filter)));
categoryCards.forEach((card) => card.addEventListener("click", () => {
  setFilter(card.dataset.filter);
  smoothScrollTo("catalogo");
}));
cityFilter.addEventListener("change", () => applyFilters());
searchButton.addEventListener("click", () => applyFilters(true));
searchInput.addEventListener("input", () => applyFilters());
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyFilters(true);
});

// ----------------------------
// Perfil del negocio
// ----------------------------
const profileModal = document.getElementById("profileModal");
const profileTitle = document.getElementById("profileTitle");
const profileDescription = document.getElementById("profileDescription");
const profileLocation = document.getElementById("profileLocation");
const profileHours = document.getElementById("profileHours");
const profileCity = document.getElementById("profileCity");
const profileWhatsapp = document.getElementById("profileWhatsapp");
const profileInstagram = document.getElementById("profileInstagram");
const profileYavoy = document.getElementById("profileYavoy");
const reelFrame = document.getElementById("reelFrame");
const reelEmbed = document.getElementById("reelEmbed");
let activeProfileCard = null;

function openProfile(card) {
  activeProfileCard = card;
  profileTitle.textContent = card.dataset.name || "Negocio";
  profileDescription.textContent = card.dataset.description || "";
  profileLocation.textContent = card.dataset.location || "Consultar ubicación";
  profileHours.textContent = card.dataset.hours || "Consultar horario";
  profileCity.textContent = `${card.dataset.cityLabel || "Catálogo"} · YaVoy`;

  const whatsapp = card.dataset.whatsapp || "";
  profileWhatsapp.style.display = whatsapp ? "" : "none";
  if (whatsapp) profileWhatsapp.href = `https://wa.me/${whatsapp}`;

  const instagram = card.dataset.instagram || "";
  profileInstagram.classList.toggle("is-hidden", !instagram);
  if (instagram) profileInstagram.href = instagram;

  const reel = card.dataset.reel || "";
  if (reel) {
    reelEmbed.src = reel;
    reelFrame.classList.add("has-reel");
  } else {
    reelEmbed.removeAttribute("src");
    reelFrame.classList.remove("has-reel");
  }

  profileModal.classList.add("is-open");
  profileModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("profile-open");

  requestAnimationFrame(() => {
    profileModal.querySelector(".profile-close")?.focus({ preventScroll: true });
  });
}

function closeProfile() {
  profileModal.classList.remove("is-open");
  profileModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("profile-open");
  reelEmbed.removeAttribute("src");
  reelFrame.classList.remove("has-reel");
}

document.querySelectorAll(".profile-button").forEach((button) => button.addEventListener("click", () => openProfile(button.closest(".business-card"))));
document.querySelectorAll("[data-close-profile]").forEach((element) => element.addEventListener("click", closeProfile));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && profileModal.classList.contains("is-open")) closeProfile();
});

// ----------------------------
// Solicitud YaVoy
// ----------------------------
const requestForm = document.getElementById("requestForm");
const serviceType = document.getElementById("serviceType");
const originCity = document.getElementById("originCity");
const destinationCity = document.getElementById("destinationCity");
const originInput = document.getElementById("origin");
const destinationInput = document.getElementById("destination");
const itemInput = document.getElementById("item");
const notesInput = document.getElementById("notes");
const estimateValue = document.getElementById("estimateValue");
const estimateDetail = document.getElementById("estimateDetail");
const selectedBusinessBox = document.getElementById("selectedBusinessBox");
const selectedBusinessName = document.getElementById("selectedBusinessName");
const clearBusiness = document.getElementById("clearBusiness");
let selectedBusiness = null;

function money(value) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}

function getEstimate() {
  let total = originCity.value === destinationCity.value ? RATES.sameCity : RATES.crossCity;
  const details = [originCity.value === destinationCity.value ? "Trayecto dentro de la misma ciudad" : "Trayecto entre La Dorada y Puerto Salgar"];

  if (serviceType.value === "compra") {
    total += RATES.compraExtra;
    details.push("incluye adicional por compra");
  }
  if (serviceType.value === "mandado") {
    total += RATES.mandadoExtra;
    details.push("incluye adicional por diligencia");
  }

  const nextValue = money(total);
  const changed = estimateValue.textContent !== nextValue;
  estimateValue.textContent = nextValue;
  estimateDetail.textContent = `${details.join(" · ")}. Valor sujeto a confirmación.`;

  if (changed && !prefersReducedMotion) {
    const estimateBox = estimateValue.closest(".estimate-box");
    estimateBox?.classList.remove("is-updating");
    if (estimateBox) {
      void estimateBox.offsetWidth;
      estimateBox.classList.add("is-updating");
      estimateBox.addEventListener("animationend", () => estimateBox.classList.remove("is-updating"), { once: true });
    }
  }

  return total;
}

[serviceType, originCity, destinationCity].forEach((element) => element.addEventListener("change", getEstimate));

function preloadBusiness(card) {
  selectedBusiness = card;
  serviceType.value = "catalogo";
  originCity.value = card.dataset.city || "la-dorada";
  originInput.value = `${card.dataset.name} · ${card.dataset.location || ""}`;
  itemInput.value = `Recoger pedido en ${card.dataset.name}`;
  selectedBusinessName.textContent = card.dataset.name;
  selectedBusinessBox.classList.remove("is-hidden");
  getEstimate();
  closeProfile();
  smoothScrollTo("pedir");
  setTimeout(() => destinationInput.focus({ preventScroll: true }), prefersReducedMotion ? 0 : 520);
}

document.querySelectorAll(".yavoy-button").forEach((button) => button.addEventListener("click", () => preloadBusiness(button.closest(".business-card"))));
profileYavoy.addEventListener("click", () => {
  if (activeProfileCard) preloadBusiness(activeProfileCard);
});

clearBusiness.addEventListener("click", () => {
  selectedBusiness = null;
  selectedBusinessBox.classList.add("is-hidden");
  selectedBusinessName.textContent = "";
  serviceType.value = "domicilio";
  originInput.value = "";
  itemInput.value = "";
  getEstimate();
});

requestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!requestForm.reportValidity()) return;

  const estimate = getEstimate();
  const serviceLabels = {
    domicilio: "Recoger y entregar",
    compra: "Comprar por mí",
    mandado: "Hacer un mandado",
    catalogo: "Traer algo de un negocio del catálogo"
  };

  const lines = [
    "Hola YaVoy 👋",
    "Quiero solicitar un servicio:",
    "",
    `*Tipo:* ${serviceLabels[serviceType.value]}`,
    selectedBusiness ? `*Negocio del catálogo:* ${selectedBusiness.dataset.name}` : null,
    `*Origen:* ${originInput.value}`,
    `*Ciudad origen:* ${cityNames[originCity.value]}`,
    `*Destino:* ${destinationInput.value}`,
    `*Ciudad destino:* ${cityNames[destinationCity.value]}`,
    `*Necesito:* ${itemInput.value}`,
    notesInput.value.trim() ? `*Indicaciones:* ${notesInput.value.trim()}` : null,
    "",
    `*Tarifa de referencia mostrada:* ${money(estimate)}`,
    "Entiendo que la central debe confirmar tarifa y disponibilidad antes de iniciar."
  ].filter(Boolean);

  window.open(`https://wa.me/${YAVOY_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
});

// Registro de comercios por WhatsApp
const registerBusinessLink = document.getElementById("registerBusinessLink");
const businessMessage = "Hola YaVoy 👋 Quiero registrar mi negocio en el catálogo local. ¿Qué información necesitan?";
registerBusinessLink.href = `https://wa.me/${YAVOY_WHATSAPP}?text=${encodeURIComponent(businessMessage)}`;
registerBusinessLink.target = "_blank";
registerBusinessLink.rel = "noopener";

// ----------------------------
// Motion system & microinteracciones
// ----------------------------
function setupRevealAnimations() {
  const revealTargets = [
    ...document.querySelectorAll(".section-heading"),
    ...document.querySelectorAll(".category-card"),
    ...document.querySelectorAll(".business-card"),
    ...document.querySelectorAll(".request-copy"),
    ...document.querySelectorAll(".request-form"),
    ...document.querySelectorAll(".step"),
    ...document.querySelectorAll(".coverage-grid > div"),
    ...document.querySelectorAll(".coverage-cards > div"),
    ...document.querySelectorAll(".cta-box"),
    ...document.querySelectorAll(".footer-inner")
  ];

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealTargets.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

  const groupedCounters = new Map();
  revealTargets.forEach((element) => {
    element.classList.add("reveal-item");
    const parent = element.parentElement;
    const count = groupedCounters.get(parent) || 0;
    element.style.setProperty("--reveal-delay", `${Math.min(count * 65, 260)}ms`);
    groupedCounters.set(parent, count + 1);
    observer.observe(element);
  });
}

function setupHeaderMotion() {
  const header = document.querySelector(".site-header");
  if (!header) return;

  const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 18);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

function setupMobileDockMotion() {
  const dock = document.querySelector(".mobile-dock");
  if (!dock) return;

  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    const delta = y - lastY;
    const isMobile = window.matchMedia("(max-width: 760px)").matches;

    if (!isMobile || prefersReducedMotion) {
      dock.classList.remove("is-hidden-by-scroll");
    } else if (y < 120 || delta < -7) {
      dock.classList.remove("is-hidden-by-scroll");
    } else if (delta > 9 && !document.body.classList.contains("profile-open")) {
      dock.classList.add("is-hidden-by-scroll");
    }

    dock.classList.toggle("is-emphasized", y > 240 && !dock.classList.contains("is-hidden-by-scroll"));
    lastY = y;
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });
}

function setupKeyboardFocus() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") document.body.classList.add("using-keyboard");
  }, { once: true });
}

getEstimate();
applyFilters();
filtersInitialized = true;
setupRevealAnimations();
setupHeaderMotion();
setupMobileDockMotion();
setupKeyboardFocus();
