/* ============================================
   HISTORIAL.JS — HISTORIAL DE TICKETS Y CANCELACIONES
   ============================================ */

/* ============ HISTORIAL ============ */
function renderHistorial(fechaSeleccionada) {
  const selector = $("#histFecha");
  if (fechaSeleccionada) window._fechaHistorialTickets = fechaSeleccionada;
  if (!window._fechaHistorialTickets) window._fechaHistorialTickets = hoy();
  const fechaActiva = window._fechaHistorialTickets;
  if (selector && selector.value !== fechaActiva) selector.value = fechaActiva;

  const ventas = [...DB.ventas]
    .filter(v => fechaLocal(new Date(v.fecha)) === fechaActiva)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const el = $("#listaHistorial");
  if (!el) return;
  if (!ventas.length) {
    const titulo = fechaActiva === hoy() ? "hoy" : new Date(fechaActiva + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    el.innerHTML = `<div style="text-align:center;padding:30px 16px;color:var(--texto-suave,#94a3b8);border:1px dashed var(--borde);border-radius:14px"><div style="font-size:28px;margin-bottom:8px">🧾</div><b>Sin tickets para ${escapeHTML(titulo)}</b><div style="font-size:12px;margin-top:5px">Selecciona otra fecha en el calendario para consultar el historial.</div></div>`;
    return;
  }
  const totalDia = ventas.filter(v => !v.cancelada).reduce((s, v) => s + (Number(v.total) || 0), 0);
  const tituloFecha = fechaActiva === hoy() ? "Hoy" : new Date(fechaActiva + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  el.innerHTML = `
    <section class="hist-grupo-fecha" style="margin-bottom:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 14px;margin-bottom:10px;background:var(--superficie,#f1f5f9);border:1px solid var(--borde);border-radius:12px">
        <div><b style="text-transform:capitalize">📅 ${escapeHTML(tituloFecha)}</b><div style="font-size:12px;color:var(--texto-suave);margin-top:3px">${ventas.length} ${ventas.length === 1 ? "ticket" : "tickets"}</div></div>
        <b>${fmt(totalDia)}</b>
      </div>
      ${ventas.map(v => {
        const cancelada = v.cancelada || false;
        const itemsTxt = (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(", ");
        return `
          <div class="hist-item ${cancelada ? "cancelada" : ""}">
            <div class="hist-header">
              <div><div class="hist-id">🧾 Ticket #${String(v.id).padStart(6, "0")} ${cancelada ? `<span class="badge-cancelada">Cancelada</span>` : ""}</div><div class="hist-fecha">${new Date(v.fecha).toLocaleString("es-MX")}</div></div>
              <div class="hist-total">${fmt(v.total)}</div>
            </div>
            <div class="hist-meta"><span>💳 ${escapeHTML(v.metodo || "—")}</span><span>👤 ${escapeHTML(v.usuario || "admin")}</span></div>
            <div class="hist-items">${escapeHTML(itemsTxt)}</div>
            <div class="hist-acciones">
              <button class="btn-mini" onclick='verTicketHistorial(${JSON.stringify(v).replace(/'/g, "&#39;")})'>👁️ Ver</button>
              <button class="btn-mini" style="color:#25d366;border-color:#25d366" data-venta-id="${escapeHTML(String(v.id))}" onclick="compartirWhatsApp(this.dataset.ventaId)">📤 WhatsApp</button>
              ${!cancelada ? `<button class="btn-mini" style="color:var(--rojo);border-color:var(--rojo)" onclick="abrirCancelarVenta(${JSON.stringify(v.id)})">↩️ Cancelar</button>` : ""}
              <button class="btn-mini" style="color:#dc2626;border-color:#dc2626" onclick="eliminarTicketHistorial(${JSON.stringify(v.id)})">🗑️ Eliminar</button>
            </div>
          </div>`;
      }).join("")}
    </section>`;
}

function eliminarTicketHistorial(id) {
  const venta = DB.ventas.find(v => String(v.id) === String(id));
  if (!venta) return toast("⚠️ Ticket no encontrado");
  const mensaje = venta.cancelada
    ? `¿Eliminar permanentemente el ticket cancelado #${String(venta.id).padStart(6, "0")} del historial?`
    : `¿Eliminar permanentemente el ticket #${String(venta.id).padStart(6, "0")} por ${fmt(venta.total)}?\n\nSe quitará de historial, reportes y cálculos de caja. Los insumos asociados a la venta se devolverán al inventario. Esta acción no se puede deshacer.`;
  if (!confirm(mensaje)) return;
  if (!venta.cancelada) {
    (venta.items || []).forEach(item => {
      const prod = DB.productos.find(p => String(p.id) === String(item.productoId));
      if (!prod || !Array.isArray(prod.insumos)) return;
      prod.insumos.forEach(ing => {
        const ins = DB.insumos.find(x => String(x.id) === String(ing.insumoId));
        if (ins) ins.stock = (Number(ins.stock) || 0) + (Number(ing.cantidad) || 0) * (Number(item.cantidad) || 0);
      });
    });
  }
  DB.ventas = DB.ventas.filter(v => String(v.id) !== String(id));
  guardar();
  renderHistorial();
  if (typeof renderEstadoCaja === "function") renderEstadoCaja();
  if (typeof reporteRango === "function") reporteRango("dia");
  if (typeof mostrarAlertaStock === "function") mostrarAlertaStock();
  toast(`🗑️ Ticket #${String(id).padStart(6, "0")} eliminado del historial`);
}

function verTicketHistorial(v) {
  const n = DB.negocio;
  const itemsHTML = v.items.map(it => `
    <div class="fila">
      <span>${it.cantidad}x ${it.nombre}</span>
      <span>${fmt(it.precio * it.cantidad)}</span>
    </div>
  `).join("");

  abrirModal("🧾 Ticket #" + String(v.id).padStart(6, "0"), `
    <div class="ticket-preview">
      <div class="centro bold grande">${n.nombre || "POS"}</div>
      <div class="centro">${n.slogan || ""}</div>
      <hr>
      <div>Ticket No. ${String(v.id).padStart(6, "0")}</div>
      <div>Fecha: ${new Date(v.fecha).toLocaleString("es-MX")}</div>
      <div>Cajero: ${v.usuario || "admin"}</div>
      ${v.notas ? `<div class="ticket-notas-preview"><strong>Nota:</strong> ${escapeHTML(v.notas).replace(/\n/g, "<br>")}</div>` : ""}
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
      ${v.cancelada ? `
        <hr>
        <div class="centro bold" style="color:#dc2626">*** CANCELADA ***</div>
        <div class="centro">Motivo: ${v.motivoCancelacion || "—"}</div>
        <div class="centro">${v.fechaCancelacion ? new Date(v.fechaCancelacion).toLocaleString("es-MX") : ""}</div>
      ` : ""}
      <hr>
      <div class="centro">¡Gracias por su preferencia!</div>
    </div>
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
      <button class="btn-primary" onclick='cerrarModal();reimprimirVenta(${v.id})'>🖨️ Reimprimir</button>
    </div>
  `);
}

function exportarHistorial() {
  const rows = [["Ticket","Fecha","Cajero","Productos","Subtotal","Desc","Propina","Total","Método","Estado","Motivo cancelación"]];
  DB.ventas.forEach(v => {
    rows.push([
      v.id,
      new Date(v.fecha).toLocaleString("es-MX"),
      v.usuario || "",
      v.items.map(i => `${i.cantidad}x ${i.nombre}`).join(" | "),
      v.subtotal, v.descuento || 0, v.propina || 0, v.total, v.metodo,
      v.cancelada ? "Cancelada" : "Activa",
      v.motivoCancelacion || ""
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `historial_${hoy()}.csv`;
  a.click();
  toast("📥 Historial exportado");
}

function limpiarFiltroHistorial() {
  window._fechaHistorialTickets = hoy();
  const selector = $("#histFecha");
  if (selector) selector.value = window._fechaHistorialTickets;
  renderHistorial(window._fechaHistorialTickets);
}

/* ============ CANCELAR VENTA ============ */
function abrirCancelarVenta(id) {
  const v = DB.ventas.find(x => x.id === id);
  if (!v) return toast("⚠️ Venta no encontrada");
  if (v.cancelada) return toast("Ya está cancelada");

  abrirModal("↩️ Cancelar venta #" + String(v.id).padStart(6, "0"), `
    <div style="background:#fef3c7;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Fecha:</span><b>${new Date(v.fecha).toLocaleString("es-MX")}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Total:</span><b>${fmt(v.total)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Método:</span><b>${v.metodo}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Productos:</span><b>${v.items.length}</b></div>
    </div>

    <p style="color:#64748b;font-size:13px;margin-bottom:8px">Esta acción:</p>
    <ul style="color:#64748b;font-size:13px;margin-left:20px;margin-bottom:14px">
      <li>Devuelve los insumos al inventario</li>
      <li>Marca el ticket como cancelado</li>
      <li>No elimina el registro del historial</li>
    </ul>

    <label>Motivo de cancelación</label>
    <div class="motivo-grid">
      <button onclick="document.getElementById('motivoCancel').value='Cliente cambió de opinión'">Cliente cambió de opinión</button>
      <button onclick="document.getElementById('motivoCancel').value='Error de cobro'">Error de cobro</button>
      <button onclick="document.getElementById('motivoCancel').value='Producto en mal estado'">Producto en mal estado</button>
      <button onclick="document.getElementById('motivoCancel').value='Duplicado'">Duplicado</button>
    </div>
    <input id="motivoCancel" placeholder="Escribe o selecciona un motivo" style="margin-top:8px">

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-danger" onclick="confirmarCancelarVenta(${v.id})">↩️ Cancelar venta</button>
    </div>
  `);
}

function confirmarCancelarVenta(id) {
  const v = DB.ventas.find(x => x.id === id);
  if (!v) return toast("⚠️ Venta no encontrada");
  if (v.cancelada) return toast("⚠️ Esta venta ya fue cancelada");

  const motivo = $("#motivoCancel").value.trim() || "Sin motivo";

  if (!confirm(`¿Cancelar la venta #${v.id} por ${fmt(v.total)}?\n\nMotivo: ${motivo}`)) return;

  v.items.forEach(item => {
    const prod = DB.productos.find(p => p.id === item.productoId);
    if (!prod || !prod.insumos) return;
    prod.insumos.forEach(ing => {
      const ins = DB.insumos.find(x => x.id === ing.insumoId);
      if (ins) ins.stock += ing.cantidad * item.cantidad;
    });
  });

  v.cancelada = true;
  v.motivoCancelacion = motivo;
  v.fechaCancelacion = new Date().toISOString();
  v.usuarioCancelacion = JSON.parse(sessionStorage.getItem("sesion") || "{}").nombre || "admin";

  guardar();
  cerrarModal();
  toast(`✅ Venta #${v.id} cancelada · Insumos reintegrados`);
  renderHistorial();
  renderEstadoCaja();
  mostrarAlertaStock();
}

// Reimprime una venta existente tanto desde historial como desde la vista previa.
function reimprimirVenta(ventaId) {
  const venta = DB.ventas.find(v => String(v.id) === String(ventaId));
  if (!venta) return toast("⚠️ Venta no encontrada");

  if (typeof EN_ANDROID !== "undefined" && EN_ANDROID &&
      typeof Android !== "undefined" && typeof Android.isConnected === "function" && Android.isConnected()) {
    const enviado = androidImprimirTicket(venta);
    if (enviado) {
      toast("🖨️ Ticket enviado a la impresora");
      return;
    }
    toast("⚠️ No se pudo enviar por Bluetooth; se abrirá la impresión normal");
  }

  // Usa la misma zona de impresión que funciona al terminar una venta.
  imprimirTicket(venta);
}
