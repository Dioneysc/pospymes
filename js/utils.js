/* ============================================
   UTILS.JS — UTILIDADES: SELECTORES, FORMATO, FECHAS, TOAST Y MODAL
   ============================================ */

/* ============ UTILS ============ */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const redondear2 = n => Math.round((Number(n) || 0) * 100) / 100;
const fmt = n => "$" + (Number(n)||0).toFixed(2);
const fechaLocal = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const hoy = () => fechaLocal(new Date());
const escapeHTML = t => String(t ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

/* Descarga/guarda un archivo de texto. En la APK (WebView) las descargas blob: no funcionan,
   así que se usa el puente nativo; en navegador, descarga normal. */
function guardarArchivoTexto(nombre, contenido, mime) {
  if (window.Android && typeof window.Android.guardarArchivo === "function") {
    return !!window.Android.guardarArchivo(nombre, contenido);
  }
  const blob = new Blob([contenido], { type: mime || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function abrirModal(titulo, html) {
  $("#modalTitulo").textContent = titulo;
  $("#modalBody").innerHTML = html;
  $("#modal").classList.remove("oculto");
  document.body.style.overflow = "hidden";
}

function cerrarModal() {
  $("#modal").classList.add("oculto");
  document.body.style.overflow = "";
}
