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
  if (!document.querySelector('link[href="responsive.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "responsive.css";
    link.dataset.localResponsive = "true";
    document.head.appendChild(link);
  }

  if (!document.querySelector('link[href="membership.css"]')) {
    const membershipLink = document.createElement("link");
    membershipLink.rel = "stylesheet";
    membershipLink.href = "membership.css";
    membershipLink.dataset.localMembership = "true";
    document.head.appendChild(membershipLink);
  }

  const isExplorePage = window.location.pathname.includes("catalogo");
  if (!isExplorePage) return;

  // Las nuevas pantallas de catálogo ya integran su propia composición.
  // La capa legacy contiene un grid-template-columns: 1fr !important
  // que desplazaba el buscador debajo del hero en escritorio.
  const hasModernCatalog = document.body?.classList.contains("page-catalog")
    && document.body?.classList.contains("local-experience");
  if (!hasModernCatalog && !document.querySelector('link[data-local-explore="true"]')) {
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

  // Evita también insertar controles duplicados de la antigua experiencia.
  if (!hasModernCatalog && !document.querySelector('script[data-local-explore="true"]')) {
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

// Local Auth 2.0 — validate on server, avoid stale redirect loops and destructive
// logouts on temporary network errors. The publishable client key stays public.
(function setupLocalAuth() {
  let validationPromise = null;
  let lastValidation = 0;
  let cachedResult = { valid: false, user: null, session: null, invalidStoredSession: false, temporaryError: false };
  const newState = (extras = {}) => ({
    valid: false, user: null, session: null, invalidStoredSession: false, temporaryError: false, ...extras
  });

  function purgeStoredAuth() {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key && (key === LOCAL_AUTH_STORAGE_PREFIX || key.startsWith(LOCAL_AUTH_STORAGE_PREFIX + "-"))) {
          window.localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.warn("No fue posible acceder al almacenamiento de sesión de Local.", error);
    }
  }

  function resetCache() {
    lastValidation = 0;
    cachedResult = newState();
  }

  function isConfirmedInvalid(error) {
    if (!error) return false;
    const code = String(error.code || "").toLowerCase();
    const msg = String(error.message || "").toLowerCase();
    return ["refresh_token_not_found", "invalid_refresh_token", "session_not_found", "user_not_found"].includes(code)
      || /invalid refresh token|refresh token not found|session (?:not found|expired)|invalid jwt|jwt expired/.test(msg);
  }

  async function clearLocalSession() {
    // Auth defaults to global sign-out; never invalidate other devices here.
    try {
      if (window.yavoyDb) {
        await Promise.race([
          window.yavoyDb.auth.signOut({ scope: "local" }),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("Logout timed out")), 6000))
        ]);
      }
    } catch (error) {
      console.warn("La desconexión remota no se pudo confirmar; limpiamos esta sesión local.", error);
    } finally {
      purgeStoredAuth();
      resetCache();
      cachedResult = newState({ invalidStoredSession: true });
      window.dispatchEvent(new CustomEvent("local:auth-cleared"));
    }
    return cachedResult;
  }

  async function validate(options = {}) {
    if (!window.yavoyDb) return newState({ temporaryError: true });
    if (validationPromise) return validationPromise;
    if (!options.force && lastValidation && Date.now() - lastValidation < 12000) return cachedResult;

    validationPromise = (async () => {
      try {
        const sessionResult = await window.yavoyDb.auth.getSession();
        if (sessionResult.error) {
          if (isConfirmedInvalid(sessionResult.error)) return await clearLocalSession();
          resetCache();
          return newState({ temporaryError: true });
        }
        const session = sessionResult.data?.session || null;
        if (!session) {
          cachedResult = newState();
          lastValidation = Date.now();
          return cachedResult;
        }

        // getSession reads client storage; getUser verifies it against Auth.
        const userResult = await window.yavoyDb.auth.getUser();
        if (userResult.error || !userResult.data?.user) {
          if (isConfirmedInvalid(userResult.error)) return await clearLocalSession();
          resetCache();
          return newState({ temporaryError: true });
        }
        cachedResult = {
          valid: true, user: userResult.data.user, session,
          invalidStoredSession: false, temporaryError: false
        };
        lastValidation = Date.now();
        window.dispatchEvent(new CustomEvent("local:auth-ready", { detail: cachedResult }));
        return cachedResult;
      } catch (error) {
        console.warn("No se pudo validar la sesión de Local por un problema temporal.", error);
        resetCache();
        return newState({ temporaryError: true });
      }
    })();

    try { return await validationPromise; }
    finally { validationPromise = null; }
  }

  function getCachedUser() {
    return cachedResult.valid ? cachedResult.user : null;
  }

  window.LocalAuth = { validate, clearLocalSession, resetCache, getCachedUser };
  if (window.yavoyDb) {
    window.yavoyDb.auth.onAuthStateChange((event) => {
      if (["SIGNED_OUT", "SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)) resetCache();
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key && event.key.startsWith(LOCAL_AUTH_STORAGE_PREFIX)) resetCache();
  });
})();
