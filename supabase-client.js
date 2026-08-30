// YaVoy — conexión cliente con Supabase
//
// IMPORTANTE:
// - La URL del proyecto y la Publishable Key de Supabase son valores de cliente.
// - No coloques aquí service_role, secretos ni credenciales privadas.
// - Completa estos dos valores directamente en tu copia/repositorio; no los compartas por chat.

const YAVOY_SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
const YAVOY_SUPABASE_PUBLISHABLE_KEY = "PEGA_AQUI_TU_PUBLISHABLE_KEY";

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
