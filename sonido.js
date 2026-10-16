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
      // Ka-ching tipo caja registradora
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const osc3 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      const gain2 = ctx.createGain();
      const gain3 = ctx.createGain();

      osc1.connect(gain1);
      osc2.connect(gain2);
      osc3.connect(gain3);
      gain1.connect(ctx.destination);
      gain2.connect(ctx.destination);
      gain3.connect(ctx.destination);

      // Tono 1: "ka" grave
      osc1.type = "sine";
      osc1.frequency.value = 700;
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      // Tono 2: "ching" agudo
      osc2.type = "sine";
      osc2.frequency.value = 1400;
      gain2.gain.setValueAtTime(0.25, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

      // Tono 3: armónico brillante
      osc3.type = "triangle";
      osc3.frequency.value = 2100;
      gain3.gain.setValueAtTime(0.1, ctx.currentTime + 0.1);
      gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.start(ctx.currentTime);
      osc2.start(ctx.currentTime + 0.1);
      osc3.start(ctx.currentTime + 0.1);

      osc1.stop(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.6);
      osc3.stop(ctx.currentTime + 0.5);
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
