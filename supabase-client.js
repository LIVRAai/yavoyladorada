// Local 💚 — conexión cliente con Supabase
//
// IMPORTANTE:
// - La URL del proyecto y la Publishable Key de Supabase son valores de cliente.
// - No coloques aquí service_role, secretos ni credenciales privadas.
// - Completa estos dos valores directamente en tu copia/repositorio; no los compartas por chat.

(function loadResponsiveLayer() {
  if (document.querySelector('link[data-local-responsive="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "responsive.css";
  link.dataset.localResponsive = "true";
  document.head.appendChild(link);
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
