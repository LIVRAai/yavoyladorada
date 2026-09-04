// Local 💚 — conexión cliente con Supabase
//
// IMPORTANTE:
// - La URL del proyecto y la Publishable Key de Supabase son valores de cliente.
// - No coloques aquí service_role, secretos ni credenciales privadas.
// - Completa estos dos valores directamente en tu copia/repositorio; no los compartas por chat.

(function loadAnalyticsLayer() {
  if (!document.querySelector('script[src="/analytics.js"]')) {
    const analytics = document.createElement("script");
    analytics.src = "/analytics.js";
    document.head.appendChild(analytics);
  }

  if (!document.querySelector('script[src="/_vercel/insights/script.js"]')) {
    const insights = document.createElement("script");
    insights.src = "/_vercel/insights/script.js";
    insights.defer = true;
    document.head.appendChild(insights);
  }
})();

(function loadExperienceLayers() {
  if (!document.querySelector('link[data-local-responsive="true"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "responsive.css";
    link.dataset.localResponsive = "true";
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[data-local-membership="true"]')) {
    const membershipLink = document.createElement("link");
    membershipLink.rel = "stylesheet";
    membershipLink.href = "membership.css";
    membershipLink.dataset.localMembership = "true";
    document.head.appendChild(membershipLink);
  }

  if (!document.querySelector('script[data-local-membership="true"]')) {
    const membershipScript = document.createElement("script");
    membershipScript.src = "membership-copy.js";
    membershipScript.defer = true;
    membershipScript.dataset.localMembership = "true";
    document.head.appendChild(membershipScript);
  }

  const isExplorePage = window.location.pathname.includes("catalogo");
  if (!isExplorePage) return;

  if (!document.querySelector('link[data-local-explore="true"]')) {
    const exploreLink = document.createElement("link");
    exploreLink.rel = "stylesheet";
    exploreLink.href = "explore-ux.css";
    exploreLink.dataset.localExplore = "true";
    document.head.appendChild(exploreLink);
  }

  if (!document.querySelector('link[data-local-profile-mobile="true"]')) {
    const profileMobileLink = document.createElement("link");
    profileMobileLink.rel = "stylesheet";
    profileMobileLink.href = "profile-mobile.css";
    profileMobileLink.dataset.localProfileMobile = "true";
    document.head.appendChild(profileMobileLink);
  }

  if (!document.querySelector('link[data-local-mobile-close="true"]')) {
    const mobileCloseLink = document.createElement("link");
    mobileCloseLink.rel = "stylesheet";
    mobileCloseLink.href = "mobile-close-button-fix.css";
    mobileCloseLink.dataset.localMobileClose = "true";
    document.head.appendChild(mobileCloseLink);
  }

  if (!document.querySelector('script[data-local-explore="true"]')) {
    const exploreScript = document.createElement("script");
    exploreScript.src = "explore-ux.js";
    exploreScript.defer = true;
    exploreScript.dataset.localExplore = "true";
    document.head.appendChild(exploreScript);
  }
})();

const YAVOY_SUPABASE_URL = "https://upahrzjvpfjfmbcrjrco.supabase.co";
const YAVOY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_8j64gItbayvv0fieAmEZsg_cY2zTY2f";
const LOCAL_AUTH_STORAGE_PREFIX = "sb-upahrzjvpfjfmbcrjrco-auth-token";

function hasSupabaseConfiguration() {
  return (
    YAVOY_SUPABASE_URL &&
    YAVOY_SUPABASE_PUBLISHABLE_KEY &&
    !YAVOY_SUPABASE_URL.includes("PEGA_AQUI") &&
    !YAVOY_SUPABASE_PUBLISHABLE_KEY.includes("PEGA_AQUI")
  );
}

if (!window.supabase) {
  throw new Error("Supabase JS no está cargado. Incluye @supabase/supabase-js antes de supabase-client.js.");
}

window.YAVOY_SUPABASE_CONFIGURED = hasSupabaseConfiguration();

window.yavoyDb = window.YAVOY_SUPABASE_CONFIGURED
  ? window.supabase.createClient(
      YAVOY_SUPABASE_URL,
      YAVOY_SUPABASE_PUBLISHABLE_KEY
    )
  : null;

// Una sesión guardada en el navegador no implica que siga siendo válida en Supabase.
// Esta capa valida una sola vez contra Auth y elimina tokens dañados antes de redirigir.
(function setupLocalAuth() {
  let validationPromise = null;
  let hasValidated = false;
  let cachedResult = { valid: false, user: null, session: null, invalidStoredSession: false };

  function purgeStoredAuth() {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key && (key === LOCAL_AUTH_STORAGE_PREFIX || key.startsWith(`${LOCAL_AUTH_STORAGE_PREFIX}-`))) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn("No pudimos limpiar el almacenamiento local de sesión.", error);
    }
  }

  async function clearLocalSession() {
    // Quitamos primero el token persistido para impedir que una siguiente página
    // vuelva a considerarlo válido aunque el logout remoto falle.
    purgeStoredAuth();
    try {
      if (window.yavoyDb) await window.yavoyDb.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn("La sesión remota ya no era válida; se limpió localmente.", error);
    }
    purgeStoredAuth();
    cachedResult = { valid: false, user: null, session: null, invalidStoredSession: true };
    hasValidated = true;
    window.dispatchEvent(new CustomEvent("local:auth-cleared"));
    return cachedResult;
  }

  async function validate(options = {}) {
    const force = Boolean(options.force);
    if (!window.yavoyDb) return cachedResult;
    if (!force && hasValidated) return cachedResult;
    if (!force && validationPromise) return validationPromise;

    validationPromise = (async () => {
      let sessionResponse;
      try {
        sessionResponse = await window.yavoyDb.auth.getSession();
      } catch (error) {
        console.warn("No pudimos leer la sesión de Local.", error);
        return clearLocalSession();
      }

      const session = sessionResponse?.data?.session || null;
      if (sessionResponse?.error) {
        console.warn("La sesión guardada no se pudo recuperar.", sessionResponse.error);
        return clearLocalSession();
      }

      if (!session) {
        cachedResult = { valid: false, user: null, session: null, invalidStoredSession: false };
        hasValidated = true;
        return cachedResult;
      }

      let userResponse;
      try {
        userResponse = await window.yavoyDb.auth.getUser();
      } catch (error) {
        console.warn("No pudimos validar el usuario guardado.", error);
        return clearLocalSession();
      }

      const user = userResponse?.data?.user || null;
      if (userResponse?.error || !user) {
        console.warn("La sesión almacenada ya no corresponde a un usuario válido.", userResponse?.error || "Usuario ausente");
        return clearLocalSession();
      }

      cachedResult = { valid: true, user, session, invalidStoredSession: false };
      hasValidated = true;
      window.dispatchEvent(new CustomEvent("local:auth-ready", { detail: cachedResult }));
      return cachedResult;
    })();

    try {
      return await validationPromise;
    } finally {
      validationPromise = null;
    }
  }

  function resetCache() {
    hasValidated = false;
    cachedResult = { valid: false, user: null, session: null, invalidStoredSession: false };
  }

  function getCachedUser() {
    return cachedResult.valid ? cachedResult.user : null;
  }

  window.LocalAuth = {
    validate,
    clearLocalSession,
    resetCache,
    getCachedUser
  };
})();

(function loadMiEspacioRecovery() {
  const isMiEspacio = window.location.pathname.endsWith("/mi-negocio.html") || window.location.pathname.endsWith("mi-negocio.html");
  if (!isMiEspacio || document.querySelector('script[data-local-mi-espacio-recovery="true"]')) return;

  const recoveryScript = document.createElement("script");
  recoveryScript.src = "mi-espacio-recovery.js";
  recoveryScript.defer = true;
  recoveryScript.dataset.localMiEspacioRecovery = "true";
  document.head.appendChild(recoveryScript);
})();
