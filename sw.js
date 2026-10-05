// sw.js — permite abrir la app del hotel aunque no haya internet.
// Guarda en el navegador la página, config.js y las librerías (Supabase, Excel, PDF).
// Estrategia "primero internet": si hay conexión siempre se usa la versión más
// nueva (y se actualiza la copia); si no hay conexión, se usa la copia guardada.
// Las consultas a Supabase (los datos) NUNCA se guardan aquí: de eso se encarga la
// propia app con su copia local en IndexedDB.

const CACHE = "hotel-panel-v1";
const PAGINA = new URL(self.location.href).searchParams.get("pagina") || "";

const ARCHIVOS = [
  "./",
  PAGINA ? "./" + PAGINA : null,
  "./config.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
].filter(Boolean);

function sePuedeGuardar(res) {
  return res && (res.ok || res.type === "opaque");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(ARCHIVOS.map((url) => {
        const externo = /^https?:/.test(url);
        return fetch(url, externo ? { mode: "no-cors" } : {})
          .then((res) => { if (sePuedeGuardar(res)) return cache.put(url, res); })
          .catch(() => { /* si uno falla, los demás se guardan igual */ });
      }))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  // Datos y sesión de Supabase: siempre directo a internet.
  if (/\.supabase\.(co|in)$/.test(url.hostname)) return;
  // Verificación de seguridad (CAPTCHA) del inicio de sesión: nunca desde la caché.
  if (url.hostname === "challenges.cloudflare.com") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (sePuedeGuardar(res)) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copia));
        }
        return res;
      })
      .catch(async () => {
        const guardado = await caches.match(req, { ignoreSearch: url.origin === self.location.origin });
        if (guardado) return guardado;
        if (req.mode === "navigate") {
          const pagina = (PAGINA && await caches.match("./" + PAGINA)) || await caches.match("./");
          if (pagina) return pagina;
        }
        return Response.error();
      })
  );
});
