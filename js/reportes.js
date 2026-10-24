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

let comparativaSemanalActiva = false;

function reporteRango(tipo) {
  comparativaSemanalActiva = false;
  const botonComparar = $("#btnCompararVentas");
  if (botonComparar) {
    botonComparar.classList.remove("activo");
    botonComparar.setAttribute("aria-pressed", "false");
  }
  const selectorRangoInicial = $("#rangoBotones");
  if (selectorRangoInicial) selectorRangoInicial.classList.remove("modo-comparar");
  const btns = $$("#rangoBotones button");
  const indices = { dia: 0, semana: 1, mes: 2 };
  const indiceActivo = Object.prototype.hasOwnProperty.call(indices, tipo) ? indices[tipo] : 0;
  const selectorRango = $("#rangoBotones");
  if (selectorRango) selectorRango.style.setProperty("--rango-index", String(indiceActivo));
  btns.forEach((b, i) => {
    const activo = i === indiceActivo;
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
  // Comparación contra un periodo anterior de duración equivalente.
  const duracion = hasta.getTime() - desde.getTime() + 1;
  const anteriorHasta = new Date(desde.getTime() - 1);
  const anteriorDesde = new Date(anteriorHasta.getTime() - duracion + 1);
  const ventasAnteriores = (DB.ventas || []).filter(v => {
    if (v.cancelada) return false;
    const f = new Date(v.fecha);
    return !Number.isNaN(f.getTime()) && f >= anteriorDesde && f <= anteriorHasta;
  });
  const totalAnterior = ventasAnteriores.reduce((s,v) => s + (Number(v.total)||0), 0);
  const diferenciaVentas = totalV - totalAnterior;
  const porcentajeCambio = totalAnterior ? (diferenciaVentas / totalAnterior) * 100 : null;
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
  const promedioTicket = ventas.length ? totalV / ventas.length : 0;
  contenedor.innerHTML = `
    <div class="panel-resumen-cabecera">
      <div><span class="panel-eyebrow">RESUMEN DEL NEGOCIO</span><h3>${periodo}</h3><p>${desde.toLocaleDateString("es-MX")} – ${hasta.toLocaleDateString("es-MX")}</p></div>
    </div>

    <div class="panel-metricas panel-metricas-principales">
      <article class="panel-metrica panel-metrica-principal">
        <span class="panel-metrica-icono">🛒</span><span class="panel-metrica-label">Ventas totales</span>
        <strong>${fmt(totalV)}</strong><small>${cantidadUnidades} unidades vendidas</small>
      </article>
      <article class="panel-metrica">
        <span class="panel-metrica-icono">🧾</span><span class="panel-metrica-label">Tickets cobrados</span>
        <strong>${ventas.length}</strong><small>En el periodo seleccionado</small>
      </article>
      <article class="panel-metrica">
        <span class="panel-metrica-icono">💳</span><span class="panel-metrica-label">Promedio por ticket</span>
        <strong>${fmt(promedioTicket)}</strong><small>Venta total ÷ tickets cobrados</small>
      </article>
    </div>

    <details class="panel-detalles-extra">
      <summary>Ver análisis detallado <span>Ganancia, gastos, pagos y productos</span></summary>
      <div class="panel-detalles-contenido">
        <div class="panel-metricas panel-metricas-secundarias">
          <article class="panel-metrica"><span class="panel-metrica-icono">📈</span><span class="panel-metrica-label">Comparativa con periodo anterior</span><strong class="${diferenciaVentas >= 0 ? "comparativa-positivo" : "comparativa-negativo"}">${diferenciaVentas >= 0 ? "+" : "−"}${fmt(Math.abs(diferenciaVentas))}</strong><small>${totalAnterior ? `${porcentajeCambio >= 0 ? "+" : ""}${porcentajeCambio.toFixed(1)}% vs. ${anteriorDesde.toLocaleDateString("es-MX")} – ${anteriorHasta.toLocaleDateString("es-MX")}` : "Sin ventas en el periodo anterior para comparar"}</small></article>
          <article class="panel-metrica"><span class="panel-metrica-icono">💰</span><span class="panel-metrica-label">Ganancia estimada</span><strong>${fmt(gananciaEstimada)}</strong><small>Ventas − gastos − costo de recetas</small></article>
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

        <div class="panel-seccion-titulo"><div><h3>🏆 Productos más vendidos</h3><p>Top 5 por cantidad de unidades</p></div></div>
        <div class="tabla-wrap panel-tabla-wrap"><table>
          <thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Importe</th></tr></thead>
          <tbody>${Object.entries(porProd).sort((a,b) => b[1].qty-a[1].qty || b[1].total-a[1].total).slice(0,5).map(([nombre,d],i)=>`
            <tr><td data-label="#">${i+1}</td><td data-label="Producto">${escapeHTML(nombre)}</td><td data-label="Unidades"><strong>${d.qty}</strong></td><td data-label="Importe">${fmt(d.total)}</td></tr>
          `).join("") || `<tr><td colspan="4" class="panel-sin-datos">Todavía no hay ventas en este periodo.</td></tr>`}</tbody>
        </table></div>

        <div class="panel-seccion-titulo"><div><h3>🍗 Todos los productos vendidos</h3><p>Ordenados por importe de venta</p></div></div>
        <div class="tabla-wrap panel-tabla-wrap"><table>
          <thead><tr><th>Producto</th><th>Unidades</th><th>Ventas</th></tr></thead>
          <tbody>${Object.entries(porProd).sort((a,b) => b[1].total-a[1].total).map(([nombre, d]) => `
            <tr><td data-label="Producto">${escapeHTML(nombre)}</td><td data-label="Unidades"><div class="panel-barra-celda"><div class="panel-barra-fondo"><div class="panel-barra-valor" style="width:${Math.max(0,Math.min(100,d.total/maxTotal*100)).toFixed(1)}%"></div></div><b>${d.qty}</b></div></td><td data-label="Ventas"><strong>${fmt(d.total)}</strong></td></tr>
          `).join("") || `<tr><td colspan="3" class="panel-sin-datos">Todavía no hay ventas en este periodo.</td></tr>`}</tbody>
        </table></div>
        ${tipo === "semana" ? renderGrafica7Dias() : ""}
        <div class="panel-acciones"><button class="btn-secondary" onclick="exportarCSV()">📥 Exportar ventas a CSV</button></div>
      </div>
    </details>
  `;
}


function mostrarComparativaSemanal() {
  comparativaSemanalActiva = true;
  const boton = $("#btnCompararVentas");
  if (boton) {
    boton.classList.add("activo");
    boton.setAttribute("aria-pressed", "true");
  }
  const selector = $("#rangoBotones");
  if (selector) selector.classList.add("modo-comparar");
  $$("#rangoBotones button").forEach(b => {
    b.classList.remove("activo");
    b.setAttribute("aria-pressed", "false");
  });
  renderComparativaSemanal();
}

function inicioSemanaLocal(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  const dia = d.getDay();
  d.setDate(d.getDate() - ((dia + 6) % 7)); // lunes como inicio de semana
  return d;
}

function obtenerVentasEntre(desde, hasta) {
  return (DB.ventas || []).filter(v => {
    if (v.cancelada) return false;
    const fecha = new Date(v.fecha);
    return !Number.isNaN(fecha.getTime()) && fecha >= desde && fecha <= hasta;
  });
}

function sumarTotalVentas(ventas) {
  return ventas.reduce((s, v) => s + (Number(v.total) || 0), 0);
}

function agruparProductosComparativa(ventas) {
  const productos = {};
  ventas.forEach(v => (Array.isArray(v.items) ? v.items : []).forEach(it => {
    const nombre = String(it.nombre || "Producto");
    if (!productos[nombre]) productos[nombre] = 0;
    productos[nombre] += Number(it.cantidad) || 0;
  }));
  return productos;
}

function renderComparativaSemanal() {
  const contenedor = $("#reporteContenido");
  if (!contenedor) return;
  const hoy = new Date();
  const estaDesde = inicioSemanaLocal(hoy);
  const estaHasta = new Date(estaDesde);
  estaHasta.setDate(estaHasta.getDate() + 7);
  estaHasta.setMilliseconds(-1);
  const pasadaDesde = new Date(estaDesde);
  pasadaDesde.setDate(pasadaDesde.getDate() - 7);
  const pasadaHasta = new Date(estaDesde.getTime() - 1);
  const ventasEsta = obtenerVentasEntre(estaDesde, estaHasta);
  const ventasPasada = obtenerVentasEntre(pasadaDesde, pasadaHasta);
  const totalEsta = sumarTotalVentas(ventasEsta);
  const totalPasada = sumarTotalVentas(ventasPasada);
  const diferencia = totalEsta - totalPasada;
  const porcentaje = totalPasada > 0 ? (diferencia / totalPasada) * 100 : null;
  const sube = diferencia >= 0;
  const claseCambio = sube ? "comparativa-positivo" : "comparativa-negativo";
  const flecha = sube ? "↑" : "↓";
  const textoPorcentaje = porcentaje === null
    ? (totalEsta > 0 ? "Nuevo periodo" : "Sin ventas previas")
    : `${sube ? "+" : ""}${porcentaje.toFixed(1)}%`;
  const nombresDia = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const dias = nombresDia.map((nombre, i) => {
    const actualDesde = new Date(estaDesde);
    actualDesde.setDate(actualDesde.getDate() + i);
    const actualHasta = new Date(actualDesde);
    actualHasta.setHours(23, 59, 59, 999);
    const anteriorDesde = new Date(pasadaDesde);
    anteriorDesde.setDate(anteriorDesde.getDate() + i);
    const anteriorHasta = new Date(anteriorDesde);
    anteriorHasta.setHours(23, 59, 59, 999);
    return {
      nombre,
      fecha: actualDesde.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
      actual: sumarTotalVentas(obtenerVentasEntre(actualDesde, actualHasta)),
      anterior: sumarTotalVentas(obtenerVentasEntre(anteriorDesde, anteriorHasta)),
      futuro: actualDesde > hoy
    };
  });
  const maxDia = Math.max(...dias.flatMap(d => [d.actual, d.anterior]), 1);
  const productosEsta = agruparProductosComparativa(ventasEsta);
  const productosPasada = agruparProductosComparativa(ventasPasada);
  const nombresProductos = [...new Set([...Object.keys(productosEsta), ...Object.keys(productosPasada)])];
  const topProductos = nombresProductos.map(nombre => ({
    nombre,
    actual: productosEsta[nombre] || 0,
    anterior: productosPasada[nombre] || 0
  })).sort((a, b) => (b.actual + b.anterior) - (a.actual + a.anterior) || b.actual - a.actual).slice(0, 5);
  const rangoTexto = `${estaDesde.toLocaleDateString("es-MX", {day:"2-digit",month:"short"})} – ${new Date(estaDesde.getTime() + 6*86400000).toLocaleDateString("es-MX", {day:"2-digit",month:"short",year:"numeric"})}`;
  const rangoAnteriorTexto = `${pasadaDesde.toLocaleDateString("es-MX", {day:"2-digit",month:"short"})} – ${pasadaHasta.toLocaleDateString("es-MX", {day:"2-digit",month:"short",year:"numeric"})}`;

  contenedor.innerHTML = `
    <div class="comparativa-cabecera">
      <div><span class="panel-eyebrow">COMPARATIVA SEMANAL</span><h3>Esta semana vs. semana pasada</h3><p>Semanas de lunes a domingo · ${rangoTexto}</p></div>
      <span class="comparativa-etiqueta">${ventasEsta.length} tickets esta semana</span>
    </div>
    <div class="comparativa-cards">
      <article class="comparativa-card"><span>Ventas de esta semana</span><strong>${fmt(totalEsta)}</strong><small>${rangoTexto}</small></article>
      <article class="comparativa-card"><span>Ventas de la semana pasada</span><strong>${fmt(totalPasada)}</strong><small>${rangoAnteriorTexto}</small></article>
      <article class="comparativa-card comparativa-card-cambio ${claseCambio}"><span>Diferencia</span><strong>${diferencia >= 0 ? "+" : "−"}${fmt(Math.abs(diferencia))}</strong><small>${flecha} ${textoPorcentaje}</small></article>
    </div>

    <section class="comparativa-panel">
      <div class="comparativa-titulo"><div><h3>Ventas por día</h3><p>Comparación de importes por cada día de la semana</p></div><div class="comparativa-leyenda"><span><i class="leyenda-naranja"></i>Esta semana</span><span><i class="leyenda-gris"></i>Semana pasada</span></div></div>
      <div class="comparativa-grafica" role="img" aria-label="Gráfica de barras comparando ventas diarias de esta semana y la semana pasada">
        ${dias.map(d => {
          const alturaActual = d.actual > 0 ? Math.max(d.actual / maxDia * 100, 3) : 0;
          const alturaAnterior = d.anterior > 0 ? Math.max(d.anterior / maxDia * 100, 3) : 0;
          return `<div class="comparativa-dia ${d.futuro ? "dia-futuro" : ""}"><div class="comparativa-barras"><div class="comparativa-barra-col"><span class="comparativa-valor">${d.actual ? fmt(d.actual) : "—"}</span><div class="comparativa-barra barra-actual" style="height:${alturaActual}%" title="Esta semana: ${fmt(d.actual)}"></div></div><div class="comparativa-barra-col"><span class="comparativa-valor">${d.anterior ? fmt(d.anterior) : "—"}</span><div class="comparativa-barra barra-anterior" style="height:${alturaAnterior}%" title="Semana pasada: ${fmt(d.anterior)}"></div></div></div><strong>${d.nombre}</strong><small>${d.fecha}</small></div>`;
        }).join("")}
      </div>
    </section>

    <section class="comparativa-panel">
      <div class="comparativa-titulo"><div><h3>Top 5 productos</h3><p>Unidades vendidas · comparación entre ambas semanas</p></div></div>
      <div class="tabla-wrap panel-tabla-wrap comparativa-tabla-wrap"><table>
        <thead><tr><th>Producto</th><th>Esta semana</th><th>Semana pasada</th><th>Cambio</th></tr></thead>
        <tbody>${topProductos.map(prod => {
          const cambio = prod.actual - prod.anterior;
          const clase = cambio >= 0 ? "comparativa-positivo" : "comparativa-negativo";
          const flechaProd = cambio > 0 ? "↑" : cambio < 0 ? "↓" : "→";
          const cambioTexto = cambio > 0 ? `+${cambio}` : String(cambio);
          return `<tr><td data-label="Producto">${escapeHTML(prod.nombre)}</td><td data-label="Esta semana">${prod.actual}</td><td data-label="Semana pasada">${prod.anterior}</td><td data-label="Cambio"><span class="comparativa-cambio-producto ${clase}">${flechaProd} ${cambioTexto}</span></td></tr>`;
        }).join("") || `<tr><td colspan="4" class="panel-sin-datos">No hay ventas de productos en estas semanas.</td></tr>`}</tbody>
      </table></div>
    </section>
    <div class="panel-acciones"><button class="btn-secondary" onclick="exportarCSV()">📥 Exportar ventas a CSV</button></div>
  `;
}

function exportarCSV() {
  const rows = [["ID","Fecha","Cajero","Productos","Subtotal","Descuento","Propina","Total","Método","Estado"]];
  DB.ventas.forEach(v => rows.push([
    v.id, new Date(v.fecha).toLocaleString("es-MX"), v.usuario || "",
    (v.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(" | "),
    v.subtotal || 0, v.descuento || 0, v.propina || 0, v.total || 0, v.metodo || "",
    v.cancelada ? "Cancelada" : "Activa"
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
