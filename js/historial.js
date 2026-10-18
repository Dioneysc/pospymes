/* ============================================
   HISTORIAL.JS — HISTORIAL DE TICKETS Y CANCELACIONES
   ============================================ */

/* ============ HISTORIAL ============ */
function renderHistorial() {
  let desde = $("#histDesde")?.value;
  let hasta = $("#histHasta")?.value;

  if (!desde && !hasta) {
    const ahora = new Date();
    const primerDia = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    desde = fechaLocal(primerDia);
    hasta = fechaLocal(ahora);
    const elD = $("#histDesde");
    const elH = $("#histHasta");
    if (elD) elD.value = desde;
    if (elH) elH.value = hasta;
  }

  let ventas = [...DB.ventas].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));

  if (desde) {
    const d = new Date(desde + "T00:00:00");
    ventas = ventas.filter(v => new Date(v.fecha) >= d);
  }
  if (hasta) {
    const h = new Date(hasta + "T23:59:59");
    ventas = ventas.filter(v => new Date(v.fecha) <= h);
  }

  const el = $("#listaHistorial");
  if (!el) return;

  if (!ventas.length) {
    el.innerHTML = `<p style="text-align:center;padding:30px;color:#94a3b8">Sin ventas en este rango</p>`;
    return;
  }

  el.innerHTML = ventas.map(v => {
    const cancelada = v.cancelada || false;
    const itemsTxt = v.items.map(i => `${i.cantidad}x ${i.nombre}`).join(", ");
    return `
      <div class="hist-item ${cancelada ? "cancelada" : ""}">
        <div class="hist-header">
          <div>
            <div class="hist-id">
              🧾 Ticket #${String(v.id).padStart(6, "0")}
              ${cancelada ? `<span class="badge-cancelada">Cancelada</span>` : ""}
            </div>
            <div class="hist-fecha">${new Date(v.fecha).toLocaleString("es-MX")}</div>
          </div>
          <div class="hist-total">${fmt(v.total)}</div>
        </div>
        <div class="hist-meta">
          <span>💳 ${v.metodo}</span>
          <span>👤 ${v.usuario || "admin"}</span>
          ${v.mesa ? `<span>🍽️ Mesa ${v.mesa}</span>` : ""}
        </div>
        <div class="hist-items">${itemsTxt}</div>
        <div class="hist-acciones">
          <button class="btn-mini" onclick='verTicketHistorial(${JSON.stringify(v).replace(/'/g, "&#39;")})'>👁️ Ver</button>
         <button class="btn-mini" onclick="reimprimirVenta(${v.id})">🖨️ Reimprimir</button>
          <button class="btn-mini" style="color:#25d366;border-color:#25d366" onclick="compartirWhatsApp(${v.id})">📤 WhatsApp</button>
          ${!cancelada ? `<button class="btn-mini" style="color:var(--rojo);border-color:var(--rojo)" onclick="abrirCancelarVenta(${v.id})">↩️ Cancelar</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
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
      ${v.mesa ? `<div>Mesa: ${v.mesa}</div>` : ""}
      <div>Cajero: ${v.usuario || "admin"}</div>
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
  const d = $("#histDesde");
  const h = $("#histHasta");
  if (d) d.value = "";
  if (h) h.value = "";
  renderHistorial();
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
