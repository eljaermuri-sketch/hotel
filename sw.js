// sw.js — permite abrir la app del hotel aunque no haya internet.
// Guarda en el navegador la página, config.js y las librerías (Supabase, Excel, PDF).
// Estrategia "primero internet" para la página y sus archivos: si hay conexión
// siempre se usa la versión más nueva (y se actualiza la copia); si no hay
// conexión, se usa la copia guardada.
// Las consultas a Supabase (los datos) NUNCA se guardan aquí: de eso se encarga la
// propia app con su copia local en IndexedDB.
//
// Ahorro de espacio:
// - Las librerías se descargan en modo "cors". En modo "no-cors" el navegador las
//   guarda como respuestas "opacas" y, por seguridad, cuenta cada una como si
//   pesara varios MB (unos 9 MB cada una en Chrome): ~37 MB para 4 librerías que
//   en realidad pesan ~1,4 MB.
// - Solo se guardan los archivos de la app y las librerías de la lista; nada más.
// - Las librerías con versión fija no cambian nunca: se usan desde la copia y no
//   se vuelven a descargar ni a escribir en cada carga.

const CACHE = "hotel-gran-estacion-v3";
const PAGINA = new URL(self.location.href).searchParams.get("pagina") || "";

const LIBRERIAS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js",
];
// Con número de versión exacto (su contenido nunca cambia).
const LIBRERIAS_FIJAS = LIBRERIAS.filter((u) => /\/\d+\.\d+\.\d+\//.test(u));

const ARCHIVOS = [
  "./",
  PAGINA ? "./" + PAGINA : null,
  "./config.js",
  "./logo.svg",
].filter(Boolean);

function sePuedeGuardar(res) {
  return res && res.ok && res.type !== "opaque";
}

function descargarLibreria(url) {
  return fetch(url, { mode: "cors", credentials: "omit" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all([
        ...ARCHIVOS.map((url) => fetch(url).then((res) => { if (sePuedeGuardar(res)) return cache.put(url, res); })),
        ...LIBRERIAS.map((url) => descargarLibreria(url).then((res) => { if (sePuedeGuardar(res)) return cache.put(url, res); })),
      ].map((p) => p.catch(() => { /* si uno falla, los demás se guardan igual */ })))
    ).then(() => self.skipWaiting())
  );
});

// Al activarse borra las copias de versiones anteriores (incluida la v2, que
// guardaba las librerías en modo opaco y ocupaba decenas de MB).
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

  const mismoSitio = url.origin === self.location.origin;
  const libreria = LIBRERIAS.includes(req.url);
  // Cualquier otra cosa de otros sitios pasa directo, sin guardarse.
  if (!mismoSitio && !libreria) return;

  // Librerías con versión fija: primero la copia guardada.
  if (LIBRERIAS_FIJAS.includes(req.url)) {
    event.respondWith(
      caches.match(req.url).then((guardado) => guardado || descargarLibreria(req.url).then((res) => {
        if (sePuedeGuardar(res)) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req.url, copia));
        }
        return res;
      }))
    );
    return;
  }

  // Página, archivos de la app y supabase-js@2: primero internet.
  const pedir = libreria ? descargarLibreria(req.url) : fetch(req);
  // Los archivos propios se guardan sin "?…" para no acumular copias repetidas.
  const clave = mismoSitio ? url.origin + url.pathname : req.url;
  event.respondWith(
    pedir
      .then((res) => {
        if (sePuedeGuardar(res)) {
          const copia = res.clone();
          caches.open(CACHE).then((cache) => cache.put(clave, copia));
        }
        return res;
      })
      .catch(async () => {
        const guardado = await caches.match(clave) || await caches.match(req, { ignoreSearch: mismoSitio });
        if (guardado) return guardado;
        if (req.mode === "navigate") {
          const pagina = (PAGINA && await caches.match("./" + PAGINA)) || await caches.match("./");
          if (pagina) return pagina;
        }
        return Response.error();
      })
  );
});
