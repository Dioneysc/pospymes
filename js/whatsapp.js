/* ============================================
   WHATSAPP.JS — COMPARTIR POR WHATSAPP
   ============================================ */

/* ============ COMPARTIR POR WHATSAPP ============ */
function compartirWhatsApp(ventaId) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return toast("Venta no encontrada");

  const n = DB.negocio;
  const fecha = new Date(v.fecha).toLocaleString("es-MX");

  // Construir el mensaje
  let texto = `*${n.nombre || "POS"}*\n`;
  if (n.slogan) texto += `${n.slogan}\n`;
  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `🧾 *Ticket #${String(v.id).padStart(6, "0")}*\n`;
  texto += `📅 ${fecha}\n`;
    texto += `👤 Cajero: ${v.usuario || "admin"}\n`;
  texto += `━━━━━━━━━━━━━━━\n`;

  v.items.forEach(it => {
    texto += `▪️ ${it.cantidad}x ${it.nombre}\n`;
    texto += `   ${fmt(it.precio * it.cantidad)}\n`;
  });

  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `Subtotal: ${fmt(v.subtotal)}\n`;
  if (v.descuento) texto += `Descuento: -${fmt(v.descuento)}\n`;
  if (v.propina) texto += `Propina: ${fmt(v.propina)}\n`;
  texto += `*TOTAL: ${fmt(v.total)}*\n`;
  texto += `💳 Pago: ${v.metodo}\n`;
  if (v.metodo === "Efectivo") {
    texto += `💵 Recibido: ${fmt(v.pagoCon)}\n`;
    texto += `💰 Cambio: ${fmt(v.cambio)}\n`;
  }
  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `¡Gracias por su preferencia! 🍗`;

  // Codificar para URL
  const textoCod = encodeURIComponent(texto);

  // Opciones: compartir a número específico o general
  const urlWhatsApp = `https://wa.me/?text=${textoCod}`;

  // Abrir WhatsApp
  window.open(urlWhatsApp, "_blank");

  toast("📤 Abriendo WhatsApp...");
}

/* Compartir con número específico (opcional) */
function compartirWhatsAppNumero(ventaId) {
  const v = DB.ventas.find(x => x.id === ventaId);
  if (!v) return;

  const numero = prompt("Número de WhatsApp (con código de país, ej: 521234567890):");
  if (!numero) return;

  const limpio = numero.replace(/\D/g, "");
  const n = DB.negocio;

  let texto = `*${n.nombre || "POS"}*\n`;
  texto += `🧾 Ticket #${String(v.id).padStart(6, "0")}\n`;
  texto += `━━━━━━━━━━━━━━━\n`;
  v.items.forEach(it => {
    texto += `${it.cantidad}x ${it.nombre} — ${fmt(it.precio * it.cantidad)}\n`;
  });
  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `*TOTAL: ${fmt(v.total)}*\n`;
  texto += `¡Gracias por su compra! 🍗`;

  const url = `https://wa.me/${limpio}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
}
