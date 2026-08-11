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

function normalizeText(value = "") {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function applyFilters(scroll = false) {
  const term = normalizeText(searchInput.value.trim());
  const city = cityFilter.value;
  let visible = 0;

  cards.forEach((card) => {
    const categories = (card.dataset.category || "").split(" ");
    const searchText = normalizeText(`${card.dataset.search || ""} ${card.textContent}`);
    const matchesCategory = currentFilter === "todos" || categories.includes(currentFilter);
    const matchesSearch = !term || searchText.includes(term);
    const matchesCity = city === "todas" || card.dataset.city === city;
    const shouldShow = matchesCategory && matchesSearch && matchesCity;
    card.style.display = shouldShow ? "" : "none";
    if (shouldShow) visible += 1;
  });

  emptyState.style.display = visible ? "none" : "block";
  if (scroll) document.getElementById("catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
}

function setFilter(filter) {
  currentFilter = filter;
  filterPills.forEach((pill) => pill.classList.toggle("active", pill.dataset.filter === filter));
  applyFilters();
}

filterPills.forEach((pill) => pill.addEventListener("click", () => setFilter(pill.dataset.filter)));
categoryCards.forEach((card) => card.addEventListener("click", () => {
  setFilter(card.dataset.filter);
  document.getElementById("catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
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

  estimateValue.textContent = money(total);
  estimateDetail.textContent = `${details.join(" · ")}. Valor sujeto a confirmación.`;
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
  document.getElementById("pedir").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => destinationInput.focus(), 500);
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

getEstimate();
applyFilters();
