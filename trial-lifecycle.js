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
        title: "Tu espacio sigue guardado en Local 💚.",
        text: "Reactiva tu membresía para recuperar la visibilidad de tu emprendimiento y volver a acceder a Local Sessions, recursos prácticos y espacios de comunidad.",
        cta: "Volver a Local 💚 — $29.900/mes",
        tone: "error"
      };
    }

    if (state.key === "expired") {
      return {
        badge: "Perfil no visible",
        badgeClass: "status-suspended",
        title: "Tu espacio sigue guardado en Local 💚.",
        text: "Activa la Membresía Local para volver a aparecer en la comunidad y mantener visibilidad, Local Sessions, recursos aplicables y espacios para conectar.",
        cta: "Continuar en Local 💚 — $29.900/mes",
        tone: "warning"
      };
    }

    if (state.key === "grace") {
      return {
        badge: "Membresía disponible",
        badgeClass: "status-pending",
        title: "Mantén tu emprendimiento visible y sigue creciendo.",
        text: "Activa tu membresía para conservar tu presencia en Local y seguir recibiendo Local Sessions mensuales, recursos prácticos y beneficios de comunidad.",
        cta: "Continuar en Local 💚 — $29.900/mes",
        tone: "warning"
      };
    }

    return {
      badge: "Publicado",
      badgeClass: "status-active",
      title: "Tu emprendimiento ya está visible en Local 💚.",
      text: "Completa tu perfil, compártelo y aprovecha tu presencia dentro de la comunidad.",
      cta: "",
      tone: "success"
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
