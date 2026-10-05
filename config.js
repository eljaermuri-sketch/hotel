// config.js — configuración local de ESTA instalación del hotel.
// No subas este archivo a un repositorio público ni lo compartas fuera del equipo:
// contiene la URL y la anon/publishable key de tu proyecto de Supabase.
// (La anon key no es un secreto tan sensible como una service_role key —está
// protegida por las políticas de Row Level Security en Supabase— pero de todas
// formas conviene mantenerla fuera del código fuente versionado.)
window.HOTEL_CONFIG = {
  SUPABASE_URL: "https://gyiekcicjcrmboxedrur.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_zWx258_Y10qm2SHtuObFMA_AXDhGiV9",
  // CAPTCHA del inicio de sesión: "Site Key" de Cloudflare Turnstile (es pública).
  // Déjala vacía ("") para no usar CAPTCHA. La "Secret Key" NUNCA va aquí: se pega
  // en Supabase → Authentication → Bot and Abuse Protection.
  CAPTCHA_SITE_KEY: "0x4AAAAAAFOeIhoRpkyMV1yG",
};
