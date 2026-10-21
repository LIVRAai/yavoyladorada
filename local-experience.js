/* Local Experience v3: native motion, navigation and accessible modals.
   No third-party animation dependency; honors reduced motion / touch devices. */
(() => {
  "use strict";
  const root = document.body;
  if (!root || !root.classList.contains("local-experience")) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let observer = null;
  let frame = 0;

  function icons(name) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const paths = {
      arrow: ["M5 12h14", "m13 6 6 6-6 6"],
      spark: ["m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3Z"],
      pin: ["M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z", "M12 10h.01"]
    };
    for (const d of paths[name] || paths.arrow) {
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
    }
    return svg;
  }

  function startReveals() {
    if (reduceMotion.matches || !("IntersectionObserver" in window)) return;
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("lx-visible");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px 28px 0px" });
    // Initialize observers before enabling the reveal state.
    document.querySelectorAll("[data-lx-reveal]").forEach((el) => observer.observe(el));
    root.classList.add("lx-motion-ready");
  }

  function enhanceCards() {
    document.querySelectorAll(".catalog-card:not([data-lx-enhanced])").forEach((card) => {
      card.dataset.lxEnhanced = "true";
      if (observer) {
        card.setAttribute("data-lx-reveal", "");
        observer.observe(card);
      }
    });
  }

  function initProgress() {
    const bar = document.createElement("div");
    bar.className = "lx-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    const update = () => {
      frame = 0;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const amount = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      bar.style.transform = "scaleX(" + amount.toFixed(4) + ")";
    };
    const request = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    update();
  }

  function initModalFocus() {
    const modal = document.getElementById("profileModal");
    if (!modal) return;
    const close = modal.querySelector(".modal-close");
    const dialog = modal.querySelector('[role="dialog"]');
    let previousFocus = null;
    let wasOpen = false;
    function update() {
      const nowOpen = modal.classList.contains("open") && modal.getAttribute("aria-hidden") === "false";
      if (nowOpen && !wasOpen) {
        previousFocus = document.activeElement;
        close?.focus({ preventScroll: true });
      } else if (!nowOpen && wasOpen) {
        if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
        previousFocus = null;
      }
      wasOpen = nowOpen;
    }
    const changes = new MutationObserver(update);
    changes.observe(modal, { attributes: true, attributeFilter: ["class", "aria-hidden"] });
    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Tab" || !wasOpen || !dialog) return;
      const controls = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
  }

  function init() {
    startReveals();
    initProgress();
    initModalFocus();
    enhanceCards();
    const grid = document.getElementById("catalogGrid");
    if (grid) {
      const changes = new MutationObserver(() => enhanceCards());
      changes.observe(grid, { childList: true });
    }
    reduceMotion.addEventListener?.("change", (event) => {
      if (event.matches) {
        root.classList.remove("lx-motion-ready");
        document.querySelectorAll("[data-lx-reveal]").forEach((el) => el.classList.add("lx-visible"));
        observer?.disconnect();
      }
    });
  }
  window.LocalExperience = Object.freeze({ enhanceCards, icon: icons });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();