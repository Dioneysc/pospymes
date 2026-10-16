/* ============================================
   IMPRESION.JS — TICKET, IMPRESIÓN Y PDF
   ============================================ */

/* ============ TICKET ============ */
function mostrarTicketImpresion(v) {
  window._ventaActual = v;
  const n = DB.negocio;
  const itemsHTML = v.items.map(it => `
    <div class="fila">
      <span>${it.cantidad}x ${it.nombre}</span>
      <span>${fmt(it.precio * it.cantidad)}</span>
    </div>
  `).join("");

  abrirModal("🧾 Ticket de venta", `
    <div class="ticket-preview">
      <div class="centro bold grande">${n.nombre || "POS"}</div>
      <div class="centro">${n.slogan || ""}</div>
      <hr>
      <div>Ticket No. ${String(v.id).padStart(6, "0")}</div>
      <div>Fecha: ${new Date(v.fecha).toLocaleDateString("es-MX")} ${new Date(v.fecha).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})}</div>
      ${v.mesa ? `<div>Mesa: ${v.mesa}</div>` : ""}
      <hr>
      <div class="fila bold"><span>Cant.</span><span>Total</span></div>
      <hr>
      ${itemsHTML}
      <hr>
      <div class="fila"><span>Subtotal</span><span>${fmt(v.subtotal)}</span></div>
      ${v.descuento ? `<div class="fila"><span>Descuento</span><span>-${fmt(v.descuento)}</span></div>` : ""}
      ${v.propina ? `<div class="fila"><span>Propina</span><span>${fmt(v.propina)}</span></div>` : ""}
      <div class="fila bold grande"><span>TOTAL</span><span>${fmt(v.total)}</span></div>
      <hr>
      <div class="fila"><span>Forma de pago:</span><span>${v.metodo}</span></div>
      ${v.metodo === "Efectivo" ? `
        <div class="fila"><span>Efectivo</span><span>${fmt(v.pagoCon)}</span></div>
        <div class="fila"><span>Cambio</span><span>${fmt(v.cambio)}</span></div>
      ` : ""}
      <hr>
      <div class="centro">¡Gracias por su preferencia!</div>
      <div class="centro bold">${n.nombre || ""}</div>
      <div class="centro">${n.slogan || ""}</div>
      <div class="centro">${n.telefono || ""}</div>
    </div>

      <div class="ticket-acciones" style="grid-template-columns: 1fr 1fr 1fr;">
      <button class="btn-no-imprimir" onclick="cerrarModal()">✖️ Cerrar</button>
      <button class="btn-imprimir" onclick="imprimirVentaActual()">🖨️ Imprimir</button>
      <button class="btn-whatsapp" onclick="compartirWhatsApp(${v.id})">📤 WhatsApp</button>
    </div>
  `);
}

/* Imprime la venta actual (la última cobrada) */
function imprimirVentaActual() {
  if (!window._ventaActual) {
    return toast("⚠️ No hay venta reciente");
  }
  imprimirTicket(window._ventaActual);
}
/* ============ IMPRESIÓN (sin salir de la app) ============ */
// Antes se abría una ventana nueva (window.open): en la app instalada no había cómo volver y se perdía la sesión.
// Ahora el ticket se arma dentro de esta misma página (#zonaImpresion) y solo eso se imprime (ver @media print en venta.css).
function imprimirHTML(html, clase) {
  let zona = document.getElementById("zonaImpresion");
  if (!zona) {
    zona = document.createElement("div");
    zona.id = "zonaImpresion";
    document.body.appendChild(zona);
  }
  zona.className = clase || "";
  zona.innerHTML = html;
  const limpiar = () => { zona.innerHTML = ""; window.removeEventListener("afterprint", limpiar); };
  window.addEventListener("afterprint", limpiar);
  setTimeout(() => {
    try { window.print(); } catch (e) { toast("⚠️ No se pudo imprimir"); limpiar(); }
  }, 150);
}

function imprimirTicket(v) {
  const n = DB.negocio;
  const items = v.items.map(it =>
    `<div class="fila"><span>${it.cantidad}x ${escapeHTML(it.nombre)}</span><span>${fmt(it.precio * it.cantidad)}</span></div>`
  ).join("");

  imprimirHTML(`
    <div class="c b g">${escapeHTML(n.nombre || "POS")}</div>
    <div class="c">${escapeHTML(n.slogan || "")}</div>
    <div class="c">${escapeHTML(n.direccion || "")}</div>
    <div class="c">Tel: ${escapeHTML(n.telefono || "")}</div>
    <hr>
    <div>Ticket #${String(v.id).padStart(6, "0")}</div>
    <div>${new Date(v.fecha).toLocaleString("es-MX")}</div>
    ${v.mesa ? `<div>Mesa: ${escapeHTML(v.mesa)}</div>` : ""}
    <div>Cajero: ${escapeHTML(v.usuario || "admin")}</div>
    <hr>
    ${items}
    <hr>
    <div class="fila"><span>Subtotal:</span><span>${fmt(v.subtotal)}</span></div>
    ${v.descuento ? `<div class="fila"><span>Descuento:</span><span>-${fmt(v.descuento)}</span></div>` : ""}
    ${v.propina ? `<div class="fila"><span>Propina:</span><span>${fmt(v.propina)}</span></div>` : ""}
    <div class="fila b g"><span>TOTAL:</span><span>${fmt(v.total)}</span></div>
    <div class="fila"><span>Pago:</span><span>${v.metodo}</span></div>
    ${v.metodo === "Efectivo" ? `
      <div class="fila"><span>Recibido:</span><span>${fmt(v.pagoCon)}</span></div>
      <div class="fila b"><span>Cambio:</span><span>${fmt(v.cambio)}</span></div>
    ` : ""}
    <hr>
    <div class="c">¡Gracias por su preferencia!</div>
    <div class="c b">${escapeHTML(n.nombre || "")}</div>
    <div class="c">${escapeHTML(n.slogan || "")}</div>
  `, "ticket");
}
