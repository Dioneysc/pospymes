/* ============================================
   REPORTES.JS — PANEL DE VENTAS, GANANCIA ESTIMADA Y CSV
   Lee DB existente; no crea ni modifica registros.
   ============================================ */

function fechaInicioLocal(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function obtenerRangoReporte(tipo) {
  const ahora = new Date();
  const desde = new Date(ahora);
  const hasta = new Date(ahora);
  hasta.setHours(23, 59, 59, 999);

  if (tipo === "dia") {
    desde.setHours(0, 0, 0, 0);
  } else if (tipo === "semana") {
    desde.setDate(ahora.getDate() - 6);
    desde.setHours(0, 0, 0, 0);
  } else if (tipo === "mes") {
    desde.setDate(1);
    desde.setHours(0, 0, 0, 0);
  }
  return { desde, hasta };
}

function reporteRango(tipo) {
  const btns = $$("#rangoBotones button");
  btns.forEach((b, i) => {
    const activo = (tipo === "dia" && i === 0) || (tipo === "semana" && i === 1) || (tipo === "mes" && i === 2);
    b.classList.toggle("activo", activo);
    b.setAttribute("aria-pressed", activo ? "true" : "false");
  });

  const { desde, hasta } = obtenerRangoReporte(tipo);
  const dentroDelRango = registro => {
    const fecha = new Date(registro.fecha);
    return !Number.isNaN(fecha.getTime()) && fecha >= desde && fecha <= hasta;
  };
  const ventas = (DB.ventas || []).filter(v => !v.cancelada && dentroDelRango(v));
  const gastos = (DB.gastos || []).filter(dentroDelRango);

  const totalV = ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const totalG = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  let costoRecetas = 0;
  let unidadesConReceta = 0;
  let unidadesSinReceta = 0;
  const porProd = {};
  let cantidadUnidades = 0;

  ventas.forEach(v => {
    (Array.isArray(v.items) ? v.items : []).forEach(it => {
      const cantidad = Number(it.cantidad) || 0;
      const precio = Number(it.precio) || 0;
      cantidadUnidades += cantidad;
      const nombre = String(it.nombre || "Producto");
      if (!porProd[nombre]) porProd[nombre] = { qty: 0, total: 0 };
      porProd[nombre].qty += cantidad;
      porProd[nombre].total += precio * cantidad;

      const prod = (DB.productos || []).find(p => String(p.id) === String(it.productoId));
      const receta = prod && Array.isArray(prod.insumos) ? prod.insumos : [];
      const recetaCompleta = receta.length > 0 && receta.every(ing =>
        (DB.insumos || []).some(ins => String(ins.id) === String(ing.insumoId) && Number.isFinite(Number(ins.costo)))
      );
      if (recetaCompleta) {
        unidadesConReceta += cantidad;
        receta.forEach(ing => {
          const ins = (DB.insumos || []).find(x => String(x.id) === String(ing.insumoId));
          if (ins) costoRecetas += (Number(ins.costo) || 0) * (Number(ing.cantidad) || 0) * cantidad;
        });
      } else {
        unidadesSinReceta += cantidad;
      }
    });
  });

  // Es una estimación: si un gasto ya incluye los mismos insumos calculados por receta,
  // restarlo en ambos conceptos duplicaría ese costo. La interfaz lo advierte explícitamente.
  const gananciaEstimada = totalV - totalG - costoRecetas;
  const maxTotal = Math.max(...Object.values(porProd).map(p => p.total), 1);
  const totalEfectivo = ventas.filter(v => v.metodo === "Efectivo").reduce((s, v) => s + (Number(v.total) || 0), 0);
  const totalTarjeta = ventas.filter(v => v.metodo === "Tarjeta").reduce((s, v) => s + (Number(v.total) || 0), 0);
  const totalTransferencia = ventas.filter(v => v.metodo === "Transferencia").reduce((s, v) => s + (Number(v.total) || 0), 0);
  const periodo = tipo === "dia" ? "Hoy" : tipo === "semana" ? "Últimos 7 días" : "Este mes";
  const cobertura = cantidadUnidades ? Math.round(unidadesConReceta / cantidadUnidades * 100) : 0;
  const tieneCostosIncompletos = unidadesSinReceta > 0;

  const contenedor = $("#reporteContenido");
  if (!contenedor) return;
  contenedor.innerHTML = `
    <div class="panel-resumen-cabecera">
      <div><span class="panel-eyebrow">RESUMEN DEL NEGOCIO</span><h3>${periodo}</h3><p>${desde.toLocaleDateString("es-MX")} – ${hasta.toLocaleDateString("es-MX")}</p></div>
      <div class="panel-tickets"><span>Tickets cobrados</span><strong>${ventas.length}</strong></div>
    </div>

    <div class="panel-metricas">
      <article class="panel-metrica panel-metrica-principal">
        <span class="panel-metrica-icono">💰</span><span class="panel-metrica-label">Ganancia estimada</span>
        <strong>${fmt(gananciaEstimada)}</strong><small>Ventas − gastos − costo de recetas</small>
      </article>
      <article class="panel-metrica"><span class="panel-metrica-icono">🛒</span><span class="panel-metrica-label">Ventas totales</span><strong>${fmt(totalV)}</strong><small>${cantidadUnidades} unidades vendidas</small></article>
      <article class="panel-metrica"><span class="panel-metrica-icono">💸</span><span class="panel-metrica-label">Gastos registrados</span><strong>${fmt(totalG)}</strong><small>${gastos.length} movimientos</small></article>
      <article class="panel-metrica"><span class="panel-metrica-icono">📦</span><span class="panel-metrica-label">Costo calculado de recetas</span><strong>${fmt(costoRecetas)}</strong><small>${cobertura}% de unidades con receta completa</small></article>
    </div>

    ${tieneCostosIncompletos ? `<div class="panel-aviso panel-aviso-amarillo"><strong>⚠️ Faltan costos de productos</strong><span>${unidadesSinReceta} unidad(es) vendidas no tienen una receta de costos completa. La ganancia mostrada puede ser mayor que la real. Completa las recetas en Productos.</span></div>` : ""}
    <div class="panel-aviso panel-aviso-info"><strong>Cómo interpretar la ganancia</strong><span>Esta cifra es estimada. Si registraste como gasto la compra de un insumo cuyo costo también se calcula mediante recetas, ese costo podría descontarse dos veces. Revisa los conceptos de gastos antes de tomarla como utilidad definitiva.</span></div>

    <div class="panel-seccion-titulo"><div><h3>💳 Formas de pago</h3><p>Importes de ventas cobradas en el periodo</p></div></div>
    <div class="panel-pagos">
      <div><span>💵 Efectivo</span><strong>${fmt(totalEfectivo)}</strong></div>
      <div><span>💳 Tarjeta</span><strong>${fmt(totalTarjeta)}</strong></div>
      <div><span>🏦 Transferencia</span><strong>${fmt(totalTransferencia)}</strong></div>
    </div>

    <div class="panel-seccion-titulo"><div><h3>🍗 Productos vendidos</h3><p>Ordenados por importe de venta</p></div></div>
    <div class="tabla-wrap panel-tabla-wrap"><table>
      <thead><tr><th>Producto</th><th>Unidades</th><th>Ventas</th></tr></thead>
      <tbody>${Object.entries(porProd).sort((a,b) => b[1].total-a[1].total).map(([nombre, d]) => `
        <tr><td data-label="Producto">${escapeHTML(nombre)}</td><td data-label="Unidades"><div class="panel-barra-celda"><div class="panel-barra-fondo"><div class="panel-barra-valor" style="width:${Math.max(0,Math.min(100,d.total/maxTotal*100)).toFixed(1)}%"></div></div><b>${d.qty}</b></div></td><td data-label="Ventas"><strong>${fmt(d.total)}</strong></td></tr>
      `).join("") || `<tr><td colspan="3" class="panel-sin-datos">Todavía no hay ventas en este periodo.</td></tr>`}</tbody>
    </table></div>

    ${tipo === "semana" ? renderGrafica7Dias() : ""}
    <div class="panel-acciones"><button class="btn-secondary" onclick="exportarCSV()">📥 Exportar ventas a CSV</button></div>
  `;
}

function exportarCSV() {
  const rows = [["ID","Fecha","Cajero","Productos","Subtotal","Descuento","Propina","Total","Método"]];
  DB.ventas.forEach(v => rows.push([
    v.id, new Date(v.fecha).toLocaleString("es-MX"), v.usuario || "",
    (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(" | "),
    v.subtotal || 0, v.descuento || 0, v.propina || 0, v.total || 0, v.metodo || ""
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ventas_${hoy()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("📥 CSV descargado");
}

function renderGrafica7Dias() {
  const dias = [];
  const nombresDia = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    const finDia = new Date(d);
    finDia.setHours(23,59,59,999);
    const ventasDia = DB.ventas.filter(v => {
      if (v.cancelada) return false;
      const f = new Date(v.fecha);
      return !Number.isNaN(f.getTime()) && f >= d && f <= finDia;
    });
    dias.push({ nombre: nombresDia[d.getDay()], fecha: d.toLocaleDateString("es-MX", {day:"2-digit",month:"short"}), total: ventasDia.reduce((s,v) => s + (Number(v.total)||0), 0), esHoy: i === 0 });
  }
  const max = Math.max(...dias.map(d => d.total), 1);
  return `<div class="grafica-7dias panel-grafica"><h3>📊 Ventas de los últimos 7 días</h3><div class="barras-7d">${dias.map(d => {
    const altura = d.total > 0 ? Math.max((d.total / max) * 100, 8) : 3;
    return `<div class="barra-dia ${d.esHoy ? "hoy" : ""}"><div class="valor">${d.total > 0 ? "$" + Math.round(d.total) : ""}</div><div class="barra" style="height:${altura}%"></div><div class="dia-sem">${d.nombre}</div></div>`;
  }).join("")}</div><div class="panel-total-semana">Total de los 7 días: <b>${fmt(dias.reduce((s,d) => s+d.total,0))}</b></div></div>`;
}
