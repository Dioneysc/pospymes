/* ============================================
   MODO-OSCURO.JS — MODO OSCURO
   ============================================ */

/* ============ MODO OSCURO ============ */
function toggleModoOscuro() {
  const activo = document.body.classList.toggle("modo-oscuro");
  LS.set("modoOscuro", activo);
  actualizarToggleModo();
  toast(activo ? "🌙 Modo oscuro activado" : "☀️ Modo claro activado");
}

function actualizarToggleModo() {
  const activo = document.body.classList.contains("modo-oscuro");
  const toggle = $("#toggleModoOscuro");
  const texto = $("#modoTexto");
  if (toggle) toggle.classList.toggle("activo", activo);
  if (texto) texto.textContent = activo ? "Modo oscuro activado" : "Modo oscuro";
}

function aplicarModoGuardado() {
  const guardado = LS.get("modoOscuro", false);
  if (guardado) document.body.classList.add("modo-oscuro");
  actualizarToggleModo();
}
