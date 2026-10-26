/* ============================================
   APP.JS — PWA, EVENTOS GLOBALES E INICIALIZACIÓN
   ============================================ */

/* ============ SERVICE WORKER ============ */
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(reg => { console.log("✅ Service Worker registrado"); reg.update(); })
      .catch(err => console.log("SW error:", err));
  });
}

/* ============ PWA INSTALACIÓN ============ */
let deferredPrompt;
const btnInst = document.getElementById("btnInstalar");

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInst) btnInst.style.display = "block";
});

if (btnInst) {
  btnInst.addEventListener("click", async () => {
    if (!deferredPrompt) {
      const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (esIOS) {
        alert("Para instalar en iPhone/iPad:\n\n1. Toca Compartir ⬆️\n2. Elige 'Añadir a pantalla de inicio'\n3. Confirma");
      } else {
        alert("Tu navegador no soporta instalación directa.\n\nPrueba con Chrome.");
      }
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btnInst.style.display = "none";
  });
}

if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
  if (btnInst) btnInst.style.display = "none";
}

/* ============ ONLINE / OFFLINE ============ */
window.addEventListener("offline", () => {
  if (document.getElementById("offlineBadge")) return;
  const b = document.createElement("div");
  b.id = "offlineBadge";
  b.textContent = "📴 Sin conexión";
  b.style.cssText = "position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:8px 16px;border-radius:20px;font-size:12px;z-index:5000;box-shadow:0 4px 12px rgba(0,0,0,.2);";
  document.body.appendChild(b);
});

window.addEventListener("online", () => {
  const b = document.getElementById("offlineBadge");
  if (b) b.remove();
});

/* ============ ATAJOS ============ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    const modal = document.getElementById("modal");
    if (modal && !modal.classList.contains("oculto")) cerrarModal();
  }
  if (e.key === "Enter" && !e.shiftKey) {
    const modal = document.getElementById("modal");
    if (!modal || modal.classList.contains("oculto")) return;
    const target = e.target;
    if (target.tagName !== "INPUT" && target.tagName !== "SELECT") return;
    const acciones = document.querySelector("#modalBody .acciones");
    if (!acciones) return;
    const btnPrincipal = acciones.querySelector(".btn-primary, .btn-danger");
    if (btnPrincipal) {
      e.preventDefault();
      btnPrincipal.click();
    }
  }
});

/* ============ RESIZE (adaptar a cambios de pantalla) ============ */
window.addEventListener("resize", () => {
  if (window.innerWidth > 900) {
    // Si vuelve a desktop, cerrar el modal del carrito
    const panel = document.getElementById("carritoPanel");
    if (panel) panel.classList.remove("modal-abierto");
    document.body.style.overflow = "";
  }
  actualizarCarritoFlotante();
});

/* ============ INICIALIZACIÓN ============ */
document.addEventListener("DOMContentLoaded", () => {
  actualizarPantallaLogin();
  if (typeof iniciarSync === "function") iniciarSync();
  migrarPasswords().catch(e => console.warn("Migración de contraseñas:", e));
  initDia();
  aplicarModoGuardado();
  actualizarToggleSonido();
  const sesion = sessionStorage.getItem("sesion");
  if (sesion) entrarApp();
});
