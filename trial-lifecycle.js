// Local 💚 — ciclo de prueba gratuita y membresía.
(() => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const TRIAL_DAYS = 8;
  const GRACE_DAYS = 3;

  // Los emprendimientos creados antes de este lanzamiento conservan el
  // comportamiento anterior para no afectar miembros existentes.
  const ROLLOUT_AT = Date.parse("2026-09-03T23:30:00.000Z");

  function time(value) {
    const parsed = Date.parse(value || "");
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function profileFor(business) {
    return window.LocalProfileData?.parse(business?.description) || { membershipStartedAt: "" };
  }

  function isGrandfathered(business) {
    const createdAt = time(business?.created_at);
    return Boolean(createdAt && createdAt < ROLLOUT_AT);
  }

  function hasConfirmedPayment(business, subscription) {
    const profile = profileFor(business);
    return Boolean(profile.membershipStartedAt || subscription?.last_payment_date);
  }

  function boundaries(business) {
    const createdAt = time(business?.created_at) || Date.now();
    const trialEndsAt = createdAt + TRIAL_DAYS * DAY_MS;
    const graceEndsAt = trialEndsAt + GRACE_DAYS * DAY_MS;
    return { createdAt, trialEndsAt, graceEndsAt };
  }

  function ceilDays(milliseconds) {
    return Math.max(0, Math.ceil(milliseconds / DAY_MS));
  }

  function phase(business, subscription = null, now = Date.now()) {
    const dates = boundaries(business);
    const confirmed = hasConfirmedPayment(business, subscription);
    const grandfathered = isGrandfathered(business);
    const subscriptionStopped = ["paused", "cancelled"].includes(subscription?.status);

    if (business?.status === "suspended" || subscriptionStopped) {
      return { key: "suspended", confirmed, grandfathered, ...dates, daysRemaining: 0 };
    }

    if (confirmed || grandfathered) {
      return { key: "member", confirmed: true, grandfathered, ...dates, daysRemaining: 0 };
    }

    if (now < dates.trialEndsAt) {
      return {
        key: "trial",
        confirmed: false,
        grandfathered: false,
        ...dates,
        daysRemaining: ceilDays(dates.trialEndsAt - now),
        elapsedDays: Math.max(0, Math.floor((now - dates.createdAt) / DAY_MS))
      };
    }

    if (now < dates.graceEndsAt) {
      return {
        key: "grace",
        confirmed: false,
        grandfathered: false,
        ...dates,
        daysRemaining: ceilDays(dates.graceEndsAt - now),
        elapsedDays: TRIAL_DAYS + Math.max(0, Math.floor((now - dates.trialEndsAt) / DAY_MS))
      };
    }

    return {
      key: "expired",
      confirmed: false,
      grandfathered: false,
      ...dates,
      daysRemaining: 0,
      elapsedDays: Math.max(0, Math.floor((now - dates.createdAt) / DAY_MS))
    };
  }

  function isCatalogVisible(business, now = Date.now()) {
    if (!business || business.status !== "active") return false;
    if (isGrandfathered(business)) return true;
    const profile = profileFor(business);
    if (profile.membershipStartedAt) return true;
    const { graceEndsAt } = boundaries(business);
    return now < graceEndsAt;
  }

  function dashboardCopy(state) {
    if (state.key === "member") {
      return {
        badge: "Membresía activa",
        badgeClass: "status-active",
        title: "Sigues creciendo con Local 💚",
        text: "Tu emprendimiento está visible y mantienes tus beneficios de membresía: perfil público, Local Sessions, recursos prácticos y espacios de comunidad.",
        cta: "",
        tone: "success"
      };
    }

    if (state.key === "suspended") {
      return {
        badge: "Membresía pausada",
        badgeClass: "status-suspended",
        title: "Tu perfil está guardado y puedes volver cuando quieras.",
        text: "Reactiva tu membresía para recuperar la visibilidad de tu emprendimiento y volver a acceder a Local Sessions, recursos prácticos y espacios de comunidad.",
        cta: "Volver a Local 💚 — $29.900/mes",
        tone: "error"
      };
    }

    if (state.key === "expired") {
      return {
        badge: "Perfil oculto",
        badgeClass: "status-suspended",
        title: "Tu prueba terminó, pero tu espacio sigue guardado.",
        text: "Activa la Membresía Local para volver a aparecer en la comunidad y conservar cada mes visibilidad, una Local Session, recursos aplicables y espacios para conectar.",
        cta: "Volver a Local 💚 — $29.900/mes",
        tone: "warning"
      };
    }

    if (state.key === "grace") {
      const days = state.daysRemaining || 1;
      return {
        badge: "Periodo de gracia",
        badgeClass: "status-pending",
        title: `Tu perfil sigue visible por ${days} ${days === 1 ? "día" : "días"} más.`,
        text: "Activa tu membresía para mantener tu espacio publicado y seguir recibiendo Local Sessions mensuales, recursos prácticos y beneficios de comunidad.",
        cta: "Continuar en Local 💚 — $29.900/mes",
        tone: "warning"
      };
    }

    // La prueba cambia el argumento a medida que la persona conoce el producto.
    const days = state.daysRemaining || 1;
    if ((state.elapsedDays || 0) <= 2) {
      return {
        badge: "Prueba gratuita",
        badgeClass: "status-active",
        title: "Tu emprendimiento ya está visible en Local 💚.",
        text: `Te quedan ${days} ${days === 1 ? "día" : "días"} gratis. Completa tu perfil, compártelo y empieza a aprovechar la visibilidad dentro de la comunidad.`,
        cta: "",
        tone: "success"
      };
    }

    if ((state.elapsedDays || 0) <= 5) {
      return {
        badge: "Prueba gratuita",
        badgeClass: "status-active",
        title: "Local es más que una vitrina.",
        text: `Te quedan ${days} ${days === 1 ? "día" : "días"} gratis. La membresía también incluye una Local Session mensual, recursos aplicables y espacios para conectar con otros emprendimientos.`,
        cta: "",
        tone: "success"
      };
    }

    return {
      badge: "Prueba gratuita",
      badgeClass: "status-pending",
      title: `Tu prueba gratuita termina en ${days} ${days === 1 ? "día" : "días"}.`,
      text: "Cuando termine podrás activar tu membresía por $29.900 al mes para conservar tu perfil visible y continuar con Local Sessions, recursos prácticos y comunidad.",
      cta: "",
      tone: "warning"
    };
  }

  window.LocalTrial = {
    DAY_MS,
    TRIAL_DAYS,
    GRACE_DAYS,
    ROLLOUT_AT,
    boundaries,
    phase,
    isCatalogVisible,
    isGrandfathered,
    hasConfirmedPayment,
    dashboardCopy
  };
})();
