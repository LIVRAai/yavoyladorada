// YaVoy — Inicio / presentación
const YAVOY_WHATSAPP = "573000000000";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

(function resetInitialScrollPosition() {
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  if (window.location.hash) return;

  const goToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  goToTop();
  requestAnimationFrame(() => requestAnimationFrame(goToTop));
  window.addEventListener("load", goToTop, { once: true });
})();

const registerBusinessLink = document.getElementById("registerBusinessLink");
if (registerBusinessLink) {
  const message = "Hola YaVoy 👋 Quiero registrar mi negocio en el catálogo local. ¿Qué información necesitan?";
  registerBusinessLink.href = `https://wa.me/${YAVOY_WHATSAPP}?text=${encodeURIComponent(message)}`;
  registerBusinessLink.target = "_blank";
  registerBusinessLink.rel = "noopener";
}

function setupRevealAnimations() {
  const targets = [
    ...document.querySelectorAll(".section-heading"),
    ...document.querySelectorAll(".intro-copy, .intro-statement"),
    ...document.querySelectorAll(".step"),
    ...document.querySelectorAll(".audience-card"),
    ...document.querySelectorAll(".coverage-grid > div"),
    ...document.querySelectorAll(".coverage-cards > div"),
    ...document.querySelectorAll(".cta-box"),
    ...document.querySelectorAll(".footer-inner")
  ];

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });

  const counts = new Map();
  targets.forEach((el) => {
    el.classList.add("reveal-item");
    const parent = el.parentElement;
    const count = counts.get(parent) || 0;
    el.style.setProperty("--reveal-delay", `${Math.min(count * 70, 280)}ms`);
    counts.set(parent, count + 1);
    observer.observe(el);
  });
}

function setupHeaderMotion() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const update = () => header.classList.toggle("is-scrolled", window.scrollY > 18);
  update();
  window.addEventListener("scroll", update, { passive: true });
}

function setupMobileDockMotion() {
  const dock = document.querySelector(".mobile-dock");
  if (!dock) return;
  let lastY = window.scrollY;
  let ticking = false;
  const update = () => {
    const y = window.scrollY;
    const delta = y - lastY;
    if (!window.matchMedia("(max-width: 760px)").matches || prefersReducedMotion || y < 120 || delta < -7) {
      dock.classList.remove("is-hidden-by-scroll");
    } else if (delta > 9) {
      dock.classList.add("is-hidden-by-scroll");
    }
    dock.classList.toggle("is-emphasized", y > 240 && !dock.classList.contains("is-hidden-by-scroll"));
    lastY = y;
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}

setupRevealAnimations();
setupHeaderMotion();
setupMobileDockMotion();
