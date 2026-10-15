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

  // Si estamos en Android con impresora conectada, usar Bluetooth nativo
  if (typeof EN_ANDROID !== "undefined" && EN_ANDROID && typeof Android !== "undefined" && Android.isConnected()) {
    const result = androidImprimirTicket(window._ventaActual);
    if (result.success) {
      toast("🖨️ Imprimiendo...");
      return;
    } else {
      toast("⚠️ Error Bluetooth, usando método tradicional");
    }
  }

  // Fallback: método tradicional (ventana de impresión)
  imprimirTicket(window._ventaActual);
}
function imprimirTicket(v) {
  const n = DB.negocio;
  const items = v.items.map(it =>
    `<div class="fila"><span>${it.cantidad}x ${it.nombre}</span><span>${fmt(it.precio*it.cantidad)}</span></div>`
  ).join("");

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket ${v.id}</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 58mm; padding: 4mm; margin: 0 auto; background: #fff; color: #000; }
  .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 14px; }
  .fila { display: flex; justify-content: space-between; padding: 2px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  .btn-imprimir {
    display: block;
    margin: 20px auto;
    padding: 14px 24px;
    background: #f97316;
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
  }
  @media print {
    .btn-imprimir { display: none !important; }
    body { width: 100%; padding: 0; }
  }
</style>
</head>
<body>
  <div class="c b g">${n.nombre || "POS"}</div>
  <div class="c">${n.slogan || ""}</div>
  <div class="c">${n.direccion || ""}</div>
  <div class="c">Tel: ${n.telefono || ""}</div>
  <hr>
  <div>Ticket #${v.id}</div>
  <div>${new Date(v.fecha).toLocaleString("es-MX")}</div>
  ${v.mesa ? `<div>Mesa: ${v.mesa}</div>` : ""}
  <div>Cajero: ${v.usuario}</div>
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
  <div class="c b">${n.nombre || ""}</div>
  <div class="c">${n.slogan || ""}</div>

  <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir ahora</button>

  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        try { window.print(); } catch(e) {}
      }, 400);
    });
  <\/script>
</body>
</html>`;

  // Método 1: window.open
  let w = null;
  try {
    w = window.open("", "_blank");
  } catch(e) {
    w = null;
  }

  if (w && !w.closed) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    return;
  }

  // Método 2 (fallback): iframe invisible
  console.log("window.open bloqueado, usando iframe");
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  setTimeout(() => {
    try {
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch(e) {
          console.log("Error iframe print:", e);
          toast("⚠️ No se pudo imprimir");
        }
        setTimeout(() => iframe.remove(), 3000);
      }, 300);
    } catch(e) {
      console.log("Error escribiendo iframe:", e);
      toast("⚠️ No se pudo imprimir");
      iframe.remove();
    }
  }, 100);
}

/* Descarga el ticket como PDF (útil si no hay impresora) */
function descargarTicketPDF() {
  const contenido = document.getElementById("ticketPrintArea");
  if (!contenido) return;

  const n = DB.negocio;

  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Ticket_${Date.now()}.pdf</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    width: 58mm;
    padding: 4mm;
    margin: 0;
    background: #fff;
    color: #000;
  }
  .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 14px; }
  .fila { display: flex; justify-content: space-between; padding: 2px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
</style>
</head>
<body>
  ${contenido.innerHTML}
</body>
</html>`;

  const ventana = window.open("", "_blank");
  if (!ventana) {
    return toast("⚠️ Permite ventanas emergentes");
  }

  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();

  setTimeout(() => {
    try {
      ventana.focus();
      ventana.print();
      // El usuario debe elegir "Guardar como PDF" en el diálogo
    } catch(e) {
      console.log(e);
    }
  }, 500);
}
