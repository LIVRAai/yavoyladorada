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

(function loadMiEspacioRecovery() {
  const isMiEspacio = window.location.pathname.endsWith("/mi-negocio.html") || window.location.pathname.endsWith("mi-negocio.html");
  if (!isMiEspacio || document.querySelector('script[data-local-mi-espacio-recovery="true"]')) return;

  const recoveryScript = document.createElement("script");
  recoveryScript.src = "mi-espacio-recovery.js";
  recoveryScript.defer = true;
  recoveryScript.dataset.localMiEspacioRecovery = "true";
  document.head.appendChild(recoveryScript);
})();
