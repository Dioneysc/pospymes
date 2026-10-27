/* ============================================
   IMPRESION.JS — TICKET, IMPRESIÓN Y PDF
   ============================================ */

/* ============ TICKET ============ */
function mostrarTicketImpresion(v) {
  window._ventaActual = v;
  const n = DB.negocio;
  const itemsHTML = v.items.map(it => `
    <div class="fila">
      <span>${it.cantidad}x ${escapeHTML(it.nombre)}</span>
      <span>${fmt(it.precio * it.cantidad)}</span>
    </div>
  `).join("");

  const logoNegocio = typeof obtenerLogoNegocio === "function" ? obtenerLogoNegocio() : "";
  abrirModal("🧾 Ticket de venta", `
    <div class="ticket-preview">
      ${logoNegocio ? `<div class="centro"><img src="${escapeHTML(logoNegocio)}" alt="Logotipo" style="max-width:90px;max-height:70px;object-fit:contain"></div>` : ""}
      <div class="centro bold grande">${escapeHTML(n.nombre || "POS")}</div>
      <div class="centro">${escapeHTML(n.slogan || "")}</div>
      ${n.direccion ? `<div class="centro">${escapeHTML(n.direccion)}</div>` : ""}
      ${n.telefono ? `<div class="centro">Tel: ${escapeHTML(n.telefono)}</div>` : ""}
      <hr>
      <div>Ticket No. ${String(v.id).padStart(6, "0")}</div>
      <div>Fecha: ${new Date(v.fecha).toLocaleDateString("es-MX")} ${new Date(v.fecha).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})}</div>
      ${tipoPedidoHTML(v)}${v.notas ? `<div class="ticket-notas-preview"><strong>Nota:</strong> ${escapeHTML(v.notas).replace(/\n/g, "<br>")}</div>` : ""}
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
      <div class="fila"><span>Forma de pago:</span><span>${escapeHTML(v.metodo)}</span></div>
      ${v.metodo === "Efectivo" ? `
        <div class="fila"><span>Efectivo</span><span>${fmt(v.pagoCon)}</span></div>
        <div class="fila"><span>Cambio</span><span>${fmt(v.cambio)}</span></div>
      ` : ""}
      <hr>
      <div class="centro">¡Gracias por su preferencia!</div>
      <div class="centro bold">${escapeHTML(n.nombre || "")}</div>
      <div class="centro">${escapeHTML(n.slogan || "")}</div>
    </div>

    <div class="ticket-acciones" style="grid-template-columns: 1fr 1fr 1fr;">
      <button class="btn-no-imprimir" onclick="cerrarModal()">✖️ Cerrar</button>
      <button class="btn-imprimir" onclick="imprimirVentaActual()">🖨️ Imprimir</button>
      <button class="btn-whatsapp" onclick="compartirWhatsApp(${v.id})">📤 WhatsApp</button>
    </div>
  `);
}
function imprimirVentaActual() {
    if (!window._ventaActual) {
        return toast("⚠️ No hay venta reciente");
    }

    // Si estamos en la app Android
    if (typeof EN_ANDROID !== "undefined" && EN_ANDROID) {
        if (typeof Android !== "undefined" && Android.isConnected && Android.isConnected()) {
            const enviado = androidImprimirTicket(window._ventaActual);
            if (enviado) {
                toast("🖨️ Impresión enviada");
                return;
            } else {
                toast("⚠️ Error al enviar ticket a la impresora");
                return;
            }
        } else {
            toast("⚠️ No hay impresora Bluetooth conectada");
            if (typeof abrirModalImpresora === "function") {
                abrirModalImpresora();
            }
            return;
        }
    }

    // Fallback tradicional para PC / Navegador web
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
    zona.hidden = true; // oculta aunque el CSS no haya cargado
    document.body.appendChild(zona);
  }
  zona.className = clase || "";
  zona.innerHTML = html;
  zona.hidden = false;
  document.body.classList.add("imprimiendo"); // el CSS de impresión solo actúa con esta clase

  // Limpieza: devuelve la pantalla a la normalidad al terminar (o al volver / tocar), aunque el navegador no avise
  let hecho = false, tope;
  const limpiar = () => {
    if (hecho) return;
    hecho = true;
    document.body.classList.remove("imprimiendo");
    zona.hidden = true;
    zona.innerHTML = "";
    window.removeEventListener("afterprint", limpiar);
    window.removeEventListener("focus", limpiar);
    document.removeEventListener("pointerdown", limpiar);
    clearTimeout(tope);
  };
  window.addEventListener("afterprint", limpiar);
  tope = setTimeout(limpiar, 120000);

  setTimeout(() => {
    try { window.print(); } catch (e) { toast("⚠️ No se pudo imprimir"); return limpiar(); }
    setTimeout(() => {
      if (hecho) return; // ya se limpió con afterprint: no dejar listeners huérfanos
      window.addEventListener("focus", limpiar);
      document.addEventListener("pointerdown", limpiar);
    }, 1500);
  }, 150);
}

function imprimirTicket(v) {
  const n = DB.negocio;
  const items = v.items.map(it =>
    `<div class="fila"><span>${it.cantidad}x ${escapeHTML(it.nombre)}</span><span>${fmt(it.precio * it.cantidad)}</span></div>`
  ).join("");

  const logoNegocio = typeof obtenerLogoNegocio === "function" ? obtenerLogoNegocio() : "";
  imprimirHTML(`
    ${logoNegocio ? `<div class="c"><img src="${escapeHTML(logoNegocio)}" alt="Logotipo" style="max-width:90px;max-height:70px;object-fit:contain"></div>` : ""}
    <div class="c b g">${escapeHTML(n.nombre || "POS")}</div>
    <div class="c">${escapeHTML(n.slogan || "")}</div>
    <div class="c">${escapeHTML(n.direccion || "")}</div>
    <div class="c">Tel: ${escapeHTML(n.telefono || "")}</div>
    <hr>
    <div>Ticket #${String(v.id).padStart(6, "0")}</div>
    <div>${new Date(v.fecha).toLocaleString("es-MX")}</div>
    <div>Cajero: ${escapeHTML(v.usuario || "admin")}</div>
    ${tipoPedidoHTML(v, "ticket-notas-impresion")}${v.notas ? `<div class="ticket-notas-impresion"><strong>Nota:</strong> ${escapeHTML(v.notas).replace(/\n/g, "<br>")}</div>` : ""}
    <hr>
    ${items}
    <hr>
    <div class="fila"><span>Subtotal:</span><span>${fmt(v.subtotal)}</span></div>
    ${v.descuento ? `<div class="fila"><span>Descuento:</span><span>-${fmt(v.descuento)}</span></div>` : ""}
    ${v.propina ? `<div class="fila"><span>Propina:</span><span>${fmt(v.propina)}</span></div>` : ""}
    <div class="fila b g"><span>TOTAL:</span><span>${fmt(v.total)}</span></div>
    <div class="fila"><span>Pago:</span><span>${escapeHTML(v.metodo)}</span></div>
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
