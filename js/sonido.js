/* ============================================
   SONIDO.JS — SONIDO AL COBRAR
   ============================================ */

/* ============ SONIDO AL COBRAR ============ */

function toggleSonido() {
  sonidoActivado = !sonidoActivado;
  LS.set("sonidoActivado", sonidoActivado);
  actualizarToggleSonido();
  toast(sonidoActivado ? "🔊 Sonido activado" : "🔇 Sonido desactivado");
  if (sonidoActivado) reproducirSonido("test");
}

function actualizarToggleSonido() {
  const toggle = $("#toggleSonido");
  const texto = $("#sonidoTexto");
  if (toggle) toggle.classList.toggle("activo", sonidoActivado);
  if (texto) texto.textContent = sonidoActivado ? "🔊 Activado" : "🔇 Desactivado";
}

/* Genera un "ding" con Web Audio API (sin archivos externos) */
function reproducirSonido(tipo = "cobro") {
  if (!sonidoActivado) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (tipo === "cobro") {
      // Dos tonos: ding-ding
      const tono1 = ctx.createOscillator();
      const tono2 = ctx.createOscillator();
      const gain = ctx.createGain();

      tono1.connect(gain);
      tono2.connect(gain);
      gain.connect(ctx.destination);

      tono1.frequency.value = 880;
      tono2.frequency.value = 1320;

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      tono1.start(ctx.currentTime);
      tono2.start(ctx.currentTime + 0.12);

      tono1.stop(ctx.currentTime + 0.3);
      tono2.stop(ctx.currentTime + 0.5);
    } else {
      // Test: un solo tono
      const tono = ctx.createOscillator();
      const gain = ctx.createGain();
      tono.connect(gain);
      gain.connect(ctx.destination);
      tono.frequency.value = 660;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      tono.start(ctx.currentTime);
      tono.stop(ctx.currentTime + 0.3);
    }

    // Liberar el contexto después de usarlo
    setTimeout(() => ctx.close(), 1000);
  } catch (e) {
    console.warn("No se pudo reproducir sonido:", e);
  }
}
