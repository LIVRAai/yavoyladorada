// Local 💚 — propuesta de valor de la membresía dentro del journey privado.
(function enhanceMembershipCopy() {
  const path = window.location.pathname;

  function benefitsList() {
    const ul = document.createElement("ul");
    ul.className = "membership-mini-list";
    [
      "Perfil y visibilidad dentro de la comunidad Local 💚.",
      "Una Local Session mensual: conferencia práctica sobre ventas, marketing, servicio, finanzas, contenido o gestión.",
      "Un recurso aplicable asociado a la sesión: plantilla, guía, checklist o material de trabajo.",
      "Acceso a espacios de comunidad, preguntas, conexiones e iniciativas para miembros."
    ].forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    });
    return ul;
  }

  function sessionsCallout() {
    const box = document.createElement("div");
    box.className = "local-sessions-callout";
    box.innerHTML = `
      <span class="local-sessions-mark" aria-hidden="true">🎓</span>
      <div>
        <strong>Local Sessions 💚 · una cada mes</strong>
        <p>Cada mes trabajaremos un tema específico para ayudarte a vender, comunicar, organizar o profesionalizar mejor tu emprendimiento.</p>
      </div>`;
    return box;
  }

  if (path.endsWith("/registro.html") || path.endsWith("registro.html")) {
    const note = document.querySelector(".auth-note");
    if (note) {
      note.innerHTML = `
        <strong>Empieza con 8 días gratis 💚</strong>
        <p>Publica tu emprendimiento y prueba Local sin pago inicial. Al terminar los 8 días podrás continuar por $29.900 al mes; tendrás 3 días adicionales para activar la membresía sin perder de inmediato tu visibilidad.</p>`;
      note.appendChild(benefitsList());
    }
    return;
  }

  if (path.endsWith("/negocio.html") || path.endsWith("negocio.html")) {
    const cards = [...document.querySelectorAll("aside.stack article.card")];
    const membershipCard = cards.find((card) => card.textContent.includes("Paso 3 de 3") && card.textContent.includes("Membresía"));
    if (membershipCard) {
      const title = membershipCard.querySelector("h2");
      const paragraph = membershipCard.querySelector("p");
      if (title) title.textContent = "Empieza gratis. Decide después de probar Local.";
      if (paragraph) paragraph.textContent = "Tu perfil se publica gratis durante 8 días. Después puedes continuar por $29.900 al mes para mantener la visibilidad y acceder a aprendizaje, recursos prácticos y comunidad.";
      const summary = membershipCard.querySelector(".summary-list");
      if (summary) {
        summary.innerHTML = `
          <div class="summary-item"><span>Primeros 8 días</span><strong>Gratis</strong></div>
          <div class="summary-item"><span>Después</span><strong>$29.900 COP / mes</strong></div>
          <div class="summary-item"><span>Periodo de gracia</span><strong>3 días</strong></div>`;
        if (!membershipCard.querySelector(".membership-mini-list")) membershipCard.insertBefore(benefitsList(), summary);
      }
    }
    return;
  }

  if (path.endsWith("/mi-negocio.html") || path.endsWith("mi-negocio.html")) {
    const cards = [...document.querySelectorAll("aside.stack article.card")];
    const membershipCard = cards.find((card) => card.querySelector(".eyebrow")?.textContent.trim() === "Membresía");
    if (membershipCard) {
      const paragraph = membershipCard.querySelector("p");
      if (paragraph) paragraph.textContent = "Local combina presencia pública, aprendizaje mensual y herramientas para seguir profesionalizando tu emprendimiento.";
      const summary = membershipCard.querySelector(".summary-list");
      if (summary && !membershipCard.querySelector(".membership-mini-list")) {
        membershipCard.insertBefore(benefitsList(), summary);
      }
      if (!membershipCard.querySelector(".local-sessions-callout")) membershipCard.appendChild(sessionsCallout());
    }
  }
})();
