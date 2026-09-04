// Local 💚 — propuesta de valor de la membresía dentro del journey privado.
(function enhanceMembershipCopy() {
  const path = window.location.pathname;

  function benefitsList() {
    const ul = document.createElement("ul");
    ul.className = "membership-mini-list";
    [
      "Perfil y visibilidad dentro de la comunidad Local 💚.",
      "Una Local Session mensual sobre ventas, marketing, servicio, finanzas, contenido o gestión.",
      "Recursos prácticos para aplicar lo aprendido en tu emprendimiento.",
      "Espacios de comunidad, preguntas, conexiones e iniciativas para miembros."
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

  function isPage(name) {
    return path.endsWith(`/${name}`) || path.endsWith(name);
  }

  if (isPage("registro.html")) {
    const intro = document.querySelector(".auth-intro");
    const eyebrow = intro?.querySelector(".eyebrow");
    const lead = intro?.querySelector(".lead");
    const button = document.getElementById("signupButton");
    const note = document.querySelector(".auth-note");

    if (eyebrow) eyebrow.textContent = "Paso 1 de 3 · Únete a Local";
    if (lead) lead.textContent = "Crea tu cuenta para presentar tu emprendimiento y empezar a hacer parte de la comunidad Local 💚.";
    if (button && !button.disabled) button.textContent = "Crear cuenta y continuar";

    if (note) {
      note.innerHTML = `
        <strong>Un beneficio para empezar 💚</strong>
        <p>Tendrás 8 días para conocer Local con tu perfil publicado, sin ingresar un medio de pago. Después decides si quieres continuar con la membresía.</p>`;
    }
    return;
  }

  if (isPage("negocio.html")) {
    const mainCard = document.querySelector(".business-main .split > section.card");
    const eyebrow = mainCard?.querySelector(".eyebrow");
    const lead = mainCard?.querySelector(".lead");
    const saveButton = document.getElementById("saveButton");
    const result = document.getElementById("result");

    if (eyebrow) eyebrow.textContent = "Paso 2 de 3 · Tu perfil";
    if (lead) lead.textContent = "Cuéntale a la comunidad quién eres, qué ofreces y cómo pueden encontrarte. Al guardar, tu emprendimiento quedará publicado en Local 💚.";
    if (saveButton && !saveButton.disabled) saveButton.textContent = "Publicar mi emprendimiento";

    const cards = [...document.querySelectorAll("aside.stack article.card")];
    if (cards[0]) {
      cards[0].innerHTML = `
        <span class="eyebrow">Tu presencia en Local</span>
        <h2>Un perfil para que te conozcan mejor.</h2>
        <p>Muestra con claridad qué haces, qué ofreces y cómo pueden contactarte desde la comunidad.</p>
        <div class="summary-list">
          <div class="summary-item"><span>Perfil</span><strong>Público</strong></div>
          <div class="summary-item"><span>Contacto</span><strong>Directo</strong></div>
          <div class="summary-item"><span>Historia</span><strong>Reel + información</strong></div>
        </div>`;
    }

    if (cards[1]) {
      cards[1].innerHTML = `
        <span class="eyebrow">Membresía Local 💚</span>
        <h3>Más que visibilidad.</h3>
        <p>Local combina presencia pública, aprendizaje mensual, recursos prácticos y espacios para conectar con otros emprendimientos.</p>`;
      cards[1].appendChild(benefitsList());
    }

    const keepBusinessCopyClean = () => {
      if (saveButton && /8 días|gratis/i.test(saveButton.textContent || "")) {
        saveButton.textContent = saveButton.disabled ? "Publicando tu perfil..." : "Publicar mi emprendimiento";
      }
      if (result && /8 días gratis/i.test(result.textContent || "")) {
        result.textContent = result.textContent.replace(/Tus 8 días gratis comienzan hoy\s*💚?/i, "Ya puedes verlo dentro de la comunidad Local 💚.");
      }
    };

    if (saveButton) new MutationObserver(keepBusinessCopyClean).observe(saveButton, { childList: true, characterData: true, subtree: true });
    if (result) new MutationObserver(keepBusinessCopyClean).observe(result, { childList: true, characterData: true, subtree: true });
    return;
  }

  if (isPage("mi-negocio.html")) {
    const emptyState = document.getElementById("emptyState");
    if (emptyState) {
      const lead = emptyState.querySelector(".lead");
      const button = emptyState.querySelector("a.button");
      if (lead) lead.textContent = "Tu cuenta está lista. Crea el perfil de tu emprendimiento para empezar a aparecer dentro de la comunidad Local 💚.";
      if (button) button.textContent = "Crear mi perfil";
    }

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

    const howItWorksCard = cards.find((card) => card.querySelector(".eyebrow")?.textContent.trim() === "Cómo funciona");
    if (howItWorksCard) {
      howItWorksCard.innerHTML = `
        <span class="eyebrow">Tu comunidad</span>
        <h3>Un espacio para mostrarte y seguir creciendo.</h3>
        <p>Mantén tu perfil actualizado, aprovecha las Local Sessions y utiliza los recursos de la comunidad para fortalecer tu emprendimiento.</p>`;
    }
  }
})();
