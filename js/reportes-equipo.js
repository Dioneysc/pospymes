/* ============================================
   REPORTES-EQUIPO.JS — Reporte por cajero y por tipo de pedido
   Se agrega al final de Reportes (solo lo ve quien tiene permiso de reportes).
   ============================================ */

function calcularReporteEquipo(desde, hasta) {
  const dentro = r => { const f = new Date(r.fecha); return !Number.isNaN(f.getTime()) && f >= desde && f <= hasta; };
  const porCajero = {};
  const fila = n => (porCajero[n] = porCajero[n] || { nombre: n, tickets: 0, total: 0, descuento: 0, cancelaciones: 0, montoCancelado: 0, cortes: 0, diferencia: 0, conDiferencia: 0 });
  const porTipo = {};

  (DB.ventas || []).filter(dentro).forEach(v => {
    const f = fila(String(v.usuario || "—"));
    if (v.cancelada) { f.cancelaciones++; f.montoCancelado += Number(v.total) || 0; return; }
    f.tickets++; f.total += Number(v.total) || 0; f.descuento += Number(v.descuento) || 0;
    const t = String(v.tipoPedido || "mostrador");
    porTipo[t] = porTipo[t] || { tipo: t, tickets: 0, total: 0 };
    porTipo[t].tickets++; porTipo[t].total += Number(v.total) || 0;
  });
  (LS.get("cortes", []) || []).filter(dentro).forEach(c => {
    const f = fila(String(c.usuario || "—"));
    const dif = Number(c.diferencia) || 0;
    f.cortes++; f.diferencia += dif; if (Math.abs(dif) >= 0.01) f.conDiferencia++;
  });
  return {
    cajeros: Object.values(porCajero).sort((a, b) => b.total - a.total),
    tipos: Object.values(porTipo).sort((a, b) => b.total - a.total)
  };
}

function htmlReporteEquipo(desde, hasta) {
  const r = calcularReporteEquipo(desde, hasta);
  if (!r.cajeros.length) return "";
  const totalTipos = r.tipos.reduce((s, t) => s + t.total, 0) || 1;
  const colorDif = d => Math.abs(d) < 0.01 ? "inherit" : d < 0 ? "#dc2626" : "#d97706";
  const tipoNombre = t => (typeof TIPOS_PEDIDO !== "undefined" && TIPOS_PEDIDO[t]) ? `${TIPOS_PEDIDO[t].icono} ${TIPOS_PEDIDO[t].nombre}` : t;
  return `
    <details class="panel-detalles-extra" open id="reporteEquipo">
      <summary>👥 Por cajero y por tipo de pedido <span>Quién vendió, canceló y cuadró la caja</span></summary>
      <div class="panel-detalles-contenido">
        <table>
          <thead><tr><th>Cajero</th><th>Tickets</th><th>Ventas</th><th>Descuentos</th><th>Cancelaciones</th><th>Diferencia de caja</th></tr></thead>
          <tbody>${r.cajeros.map(c => `<tr>
            <td data-label="Cajero"><b>${escapeHTML(c.nombre)}</b></td>
            <td data-label="Tickets">${c.tickets}</td>
            <td data-label="Ventas"><b>${fmt(c.total)}</b></td>
            <td data-label="Descuentos">${c.descuento ? fmt(c.descuento) : "—"}</td>
            <td data-label="Cancelaciones">${c.cancelaciones ? `${c.cancelaciones} · ${fmt(c.montoCancelado)}` : "—"}</td>
            <td data-label="Diferencia de caja" style="color:${colorDif(c.diferencia)}">${c.cortes ? `${c.diferencia > 0 ? "+" : ""}${fmt(c.diferencia)} <small>(${c.conDiferencia} de ${c.cortes} cortes)</small>` : "—"}</td>
          </tr>`).join("")}</tbody>
        </table>
        ${r.tipos.length ? `
        <h4 style="margin:16px 0 6px;font-size:14px">Por tipo de pedido</h4>
        <table>
          <thead><tr><th>Tipo</th><th>Tickets</th><th>Ventas</th><th>%</th></tr></thead>
          <tbody>${r.tipos.map(t => `<tr>
            <td data-label="Tipo">${escapeHTML(tipoNombre(t.tipo))}</td>
            <td data-label="Tickets">${t.tickets}</td>
            <td data-label="Ventas"><b>${fmt(t.total)}</b></td>
            <td data-label="%">${Math.round(t.total / totalTipos * 100)}%</td>
          </tr>`).join("")}</tbody>
        </table>` : ""}
      </div>
    </details>`;
}

// Se agrega al reporte existente sin tocar su plantilla
(function () {
  const base = window.reporteRango;
  if (typeof base !== "function") return;
  window.reporteRango = function (tipo, destino) {
    const r = base.apply(this, arguments);
    try {
      if ((destino || "reportes") === "reportes") {
        const cont = document.getElementById("reporteContenido");
        if (cont && typeof obtenerRangoReporte === "function") {
          const { desde, hasta } = obtenerRangoReporte(tipo);
          const html = htmlReporteEquipo(desde, hasta);
          if (html) cont.insertAdjacentHTML("beforeend", html);
        }
      }
    } catch (e) { console.warn("Reporte por cajero:", e); }
    return r;
  };
})();
