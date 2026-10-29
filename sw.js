// IMPORTANTE: sube este número cada vez que publiques cambios (v130 → v131 …).
// Los archivos de la app se sirven desde la copia guardada de esta versión para abrir rápido;
// si el número no cambia, los dispositivos no se enteran de que hay archivos nuevos.
const VERSION = "v130";
const CACHE = `pos-polleria-${VERSION}`;

// Sin estos archivos la app no funciona: si falta alguno, la instalación falla y se conserva la versión anterior
const NUCLEO = [
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/componentes.css",
  "./css/venta.css",
  "./css/admin.css",
  "./css/modo-oscuro.css",
  "./js/utils.js",
  "./js/db.js",
  "./js/config.js",
  "./js/auth.js",
  "./js/ui.js",
  "./js/productos.js",
  "./js/inventario.js",
  "./js/movimientos.js",
  "./js/venta.js",
  "./js/preventa.js",
  "./js/impresion.js",
  "./js/android-bridge.js",
  "./js/whatsapp.js",
  "./js/gastos.js",
  "./js/caja.js",
  "./js/reportes.js",
  "./js/reportes-equipo.js",
  "./js/pendientes.js",
  "./js/historial.js",
  "./js/config-ui.js",
  "./js/modo-oscuro.js",
  "./js/sonido.js",
  "./js/firebase-config.js",
  "./js/sync.js",
  "./js/papelera.js",
  "./js/mantenimiento.js",
  "./js/usuarios.js",
  "./js/app.js"
];

// Imágenes: si alguna falta no se rompe la instalación
const OPCIONALES = ["./logo.png", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(NUCLEO.map(u => new Request(u, { cache: "reload" }))); // "reload": nunca una copia vieja de la caché del navegador
      await Promise.all(OPCIONALES.map(u => c.add(u).catch(() => console.warn("No se pudo cachear:", u))));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      // Eliminar únicamente cachés de esta aplicación; no tocar los de otras apps del mismo origen.
      .then(keys => Promise.all(keys.filter(k => k.startsWith("pos-polleria-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Copia guardada primero: la app abre al instante, con o sin internet y sin importar qué tan lenta esté la red.
// Las versiones nuevas se instalan en segundo plano (ver "install") y se usan la siguiente vez que abras la app.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // Librerías de Firebase: se guardan para poder abrir la sincronización sin internet
    if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) e.respondWith(cachePrimero(req));
    return; // WhatsApp, Firestore y otros sitios: no interceptar
  }
  e.respondWith(appPrimero(req));
});

async function cachePrimero(req) {
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(req);
  if (guardado) return guardado;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function appPrimero(req) {
  const cache = await caches.open(CACHE);
  // Es una app de una sola página: cualquier navegación (incluida la raíz "/") abre index.html
  const guardado = await cache.match(req.mode === "navigate" ? "./index.html" : req, { ignoreSearch: true });
  if (guardado) return guardado;
  // Lo que no esté guardado (algo que no está en la lista) se pide a la red
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}
