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
let ultimoRangoReporte = "dia";
let origenComparativa = "panel";

function reporteRango(tipo, destino = "reportes") {
  ultimoRangoReporte = tipo;
  comparativaSemanalActiva = false;
  const vistaReportes = document.getElementById("reportes");
  if (vistaReportes) vistaReportes.classList.remove("comparativa-activa");
  const botonComparar = $("#btnCompararVentas");
  if (botonComparar) {
    botonComparar.classList.remove("activo");
    botonComparar.setAttribute("aria-pressed", "false");
  }
  const selectorRangoInicial = $("#rangoBotones");
  if (selectorRangoInicial) selectorRangoInicial.classList.remove("modo-comparar");
  const btns = $$(destino === "panelVentas" ? "#rangoPanelBotones button" : "#rangoBotones button");
  const indices = { dia: 0, semana: 1, mes: 2 };
  const indiceActivo = Object.prototype.hasOwnProperty.call(indices, tipo) ? indices[tipo] : 0;
  const selectorRango = $(destino === "panelVentas" ? "#rangoPanelBotones" : "#rangoBotones");
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
  const productosAnteriores = {};
  ventasAnteriores.forEach(v => (Array.isArray(v.items) ? v.items : []).forEach(it => {
    const nombre = String(it.nombre || "Producto");
    if (!productosAnteriores[nombre]) productosAnteriores[nombre] = { qty: 0, total: 0 };
    const cantidad = Number(it.cantidad) || 0;
    productosAnteriores[nombre].qty += cantidad;
    productosAnteriores[nombre].total += (Number(it.precio) || 0) * cantidad;
  }));
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

  const promedioTicket = ventas.length ? totalV / ventas.length : 0;
  const periodoDesde = desde.toLocaleDateString("es-MX");
  const periodoHasta = hasta.toLocaleDateString("es-MX");
  if (destino === "panelVentas") {
    const panel = $("#panelVentasContenido");
    if (!panel) return;
    panel.innerHTML = `
      <div class="panel-resumen-cabecera"><div><span class="panel-eyebrow">RESUMEN DEL NEGOCIO</span><h3>${periodo}</h3><p>${periodoDesde} – ${periodoHasta}</p></div></div>
      <div class="panel-metricas panel-metricas-principales">
        <article class="panel-metrica panel-metrica-principal"><span class="panel-metrica-icono">🛒</span><span class="panel-metrica-label">Ventas totales</span><strong>${fmt(totalV)}</strong><small>${cantidadUnidades} unidades vendidas</small></article>
        <article class="panel-metrica"><span class="panel-metrica-icono">🧾</span><span class="panel-metrica-label">Ventas cobradas</span><strong>${ventas.length}</strong><small>Operaciones pagadas</small></article>
        <article class="panel-metrica"><span class="panel-metrica-icono">💳</span><span class="panel-metrica-label">Promedio por venta</span><strong>${fmt(promedioTicket)}</strong><small>Total vendido ÷ ventas cobradas</small></article>
      </div>
      <div class="panel-metricas panel-metricas-secundarias">
        <article class="panel-metrica"><span class="panel-metrica-icono">💸</span><span class="panel-metrica-label">Gastos registrados</span><strong>${fmt(totalG)}</strong><small>${gastos.length} movimientos en el periodo</small></article>
        <article class="panel-metrica"><span class="panel-metrica-icono">📈</span><span class="panel-metrica-label">Vs. periodo anterior</span><strong class="${totalAnterior ? (diferenciaVentas >= 0 ? "comparativa-positivo" : "comparativa-negativo") : ""}">${totalAnterior ? `${diferenciaVentas >= 0 ? "+" : "−"}${fmt(Math.abs(diferenciaVentas))}` : "Sin base previa"}</strong><small>${totalAnterior ? `${diferenciaVentas >= 0 ? "↑" : "↓"} ${Math.abs(porcentajeCambio).toFixed(1)}% en ventas` : "Aún no hay ventas previas"}</small></article>
      </div>
    `;
    return;
  }
  const contenedor = $("#reporteContenido");
  if (!contenedor) return;
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

    <details class="panel-detalles-extra" open>
      <summary>📊 Análisis detallado <span>Presiona para contraer o ampliar</span></summary>
      <div class="panel-detalles-contenido">
        <section class="analisis-comparativa">
          <div class="analisis-comparativa-cabecera"><div><h3>Ventas: periodo actual vs. anterior</h3><p>Comparación rápida de importes</p></div><strong class="${totalAnterior ? (diferenciaVentas >= 0 ? "comparativa-positivo" : "comparativa-negativo") : ""}">${totalAnterior ? `${diferenciaVentas >= 0 ? "↑" : "↓"} ${Math.abs(porcentajeCambio).toFixed(1)}%` : "Sin base previa"}</strong></div>
          <div class="analisis-comparativa-fila"><span>Actual <b>${fmt(totalV)}</b></span><div class="analisis-comparativa-pista"><div class="analisis-comparativa-barra actual" style="width:${Math.max(totalV,totalAnterior)>0 ? (totalV/Math.max(totalV,totalAnterior)*100).toFixed(1) : 0}%"></div></div></div>
          <div class="analisis-comparativa-fila"><span>Anterior <b>${fmt(totalAnterior)}</b></span><div class="analisis-comparativa-pista"><div class="analisis-comparativa-barra anterior" style="width:${Math.max(totalV,totalAnterior)>0 ? (totalAnterior/Math.max(totalV,totalAnterior)*100).toFixed(1) : 0}%"></div></div></div>
          <div class="analisis-comparativa-pie"><span>Periodo anterior: ${anteriorDesde.toLocaleDateString("es-MX")} – ${anteriorHasta.toLocaleDateString("es-MX")}</span><b class="${diferenciaVentas >= 0 ? "comparativa-positivo" : "comparativa-negativo"}">${diferenciaVentas >= 0 ? "+" : "−"}${fmt(Math.abs(diferenciaVentas))}</b></div>
        </section>
        <div class="panel-metricas panel-metricas-secundarias">
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

        ${renderAnalisisProductos(porProd, productosAnteriores, periodo)}
        ${tipo === "semana" ? renderGrafica7Dias() : ""}
        <div class="panel-acciones"><button class="btn-secondary" onclick="exportarCSV()">📥 Exportar ventas a CSV</button></div>
      </div>
    </details>
  `;
  actualizarVistaAnalisisProductos();
}


// Vista unificada de productos: una gráfica comparativa y una sola tabla.
let analisisProductosDatos = null;
let analisisProductosVista = { metrica: "unidades", orden: "unidades", busqueda: "", mostrar: "todos" };

function renderAnalisisProductos(actuales, anteriores, periodo) {
  const nombres = new Set([...Object.keys(actuales || {}), ...Object.keys(anteriores || {})]);
  // Incluye también productos del catálogo aunque no se hayan vendido en estos periodos.
  (DB.productos || []).forEach(p => { if (p && p.nombre) nombres.add(String(p.nombre)); });
  analisisProductosDatos = [...nombres].map(nombre => ({
    nombre,
    actual: Number(actuales?.[nombre]?.qty) || 0,
    anterior: Number(anteriores?.[nombre]?.qty) || 0,
    importe: Number(actuales?.[nombre]?.total) || 0,
    importeAnterior: Number(anteriores?.[nombre]?.total) || 0
  }));
  analisisProductosVista = { metrica: "unidades", orden: "unidades", busqueda: "", mostrar: "todos" };
  return `<section class="analisis-productos-unificado">
    <div class="panel-seccion-titulo"><div><h3>🍗 Análisis de productos</h3><p>Más vendidos, comparación y catálogo en una sola vista · ${escapeHTML(periodo)}</p></div></div>
    <div class="analisis-productos-controles">
      <label>Mostrar <select id="analisisProductosMostrar" onchange="cambiarVistaAnalisisProductos('mostrar',this.value)"><option value="todos">Todos los productos</option><option value="top10">Top 10</option><option value="top5">Top 5</option></select></label>
      <label>Comparar <select id="analisisProductosMetrica" onchange="cambiarVistaAnalisisProductos('metrica',this.value)"><option value="unidades">Unidades</option><option value="importe">Importe vendido</option></select></label>
      <label>Ordenar <select id="analisisProductosOrden" onchange="cambiarVistaAnalisisProductos('orden',this.value)"><option value="unidades">Más vendidos</option><option value="importe">Mayor importe</option><option value="nombre">Nombre A–Z</option><option value="variacion">Mayor variación</option></select></label>
      <label class="analisis-productos-buscar">Buscar <input id="analisisProductosBuscar" type="search" placeholder="Nombre del producto…" oninput="cambiarVistaAnalisisProductos('busqueda',this.value)"></label>
    </div>
    <div id="analisisProductosGrafica" class="analisis-productos-grafica"></div>
    <div class="tabla-wrap panel-tabla-wrap"><table class="tabla-analisis-productos"><thead><tr><th>#</th><th>Producto</th><th>Actual</th><th>Anterior</th><th>Diferencia</th><th>Variación</th><th>Importe actual</th></tr></thead><tbody id="analisisProductosFilas"></tbody></table></div>
    <p class="analisis-productos-nota">La comparación utiliza el periodo actual y el periodo anterior de duración equivalente. Los productos sin ventas aparecen con cero unidades.</p>
  </section>`;
}

function cambiarVistaAnalisisProductos(campo, valor) {
  if (!analisisProductosDatos) return;
  analisisProductosVista[campo] = valor;
  actualizarVistaAnalisisProductos();
}

function actualizarVistaAnalisisProductos() {
  const vista = analisisProductosVista;
  const filtro = String(vista.busqueda || "").trim().toLocaleLowerCase("es-MX");
  let lista = analisisProductosDatos.filter(p => p.nombre.toLocaleLowerCase("es-MX").includes(filtro));
  const metricaActual = p => vista.metrica === "importe" ? p.importe : p.actual;
  lista.sort((a,b) => {
    if (vista.orden === "nombre") return a.nombre.localeCompare(b.nombre, "es-MX");
    if (vista.orden === "importe") return b.importe-a.importe || b.actual-a.actual;
    if (vista.orden === "variacion") return Math.abs(b.actual-b.anterior)-Math.abs(a.actual-a.anterior);
    return b.actual-a.actual || b.importe-a.importe;
  });
  if (vista.mostrar === "top5") lista = lista.slice(0,5);
  else if (vista.mostrar === "top10") lista = lista.slice(0,10);
  const graficasTop = [...lista].sort((a,b) => metricaActual(b)-metricaActual(a)).slice(0,10);
  const max = Math.max(1, ...graficasTop.map(metricaActual));
  const grafica = document.getElementById("analisisProductosGrafica");
  const filas = document.getElementById("analisisProductosFilas");
  if (!grafica || !filas) return;
  const actualLabel = vista.metrica === "importe" ? "Importe vendido" : "Unidades vendidas";
  grafica.innerHTML = `<div class="analisis-productos-grafica-titulo"><strong>${actualLabel} por producto</strong><span><i class="ap-leyenda-actual"></i> Actual <i class="ap-leyenda-anterior"></i> Anterior</span></div>` + (graficasTop.length ? graficasTop.map(p => {
    const a = vista.metrica === "importe" ? p.importe : p.actual;
    const b = vista.metrica === "importe" ? p.importeAnterior : p.anterior;
    const anchoA = Math.max(0, Math.min(100, a/max*100));
    const anchoB = Math.max(0, Math.min(100, b/max*100));
    const valor = n => vista.metrica === "importe" ? fmt(n) : `${n} uds.`;
    return `<div class="ap-barra-item"><div class="ap-barra-etiqueta"><span>${escapeHTML(p.nombre)}</span><b>${valor(a)}</b></div><div class="ap-barra-pista"><div class="ap-barra actual" style="width:${anchoA.toFixed(1)}%"></div></div><div class="ap-barra-pista ap-pista-anterior"><div class="ap-barra anterior" style="width:${anchoB.toFixed(1)}%"></div></div></div>`;
  }).join("") : `<p class="panel-sin-datos">No hay productos que coincidan con la búsqueda.</p>`);
  filas.innerHTML = lista.length ? lista.map((p,i) => {
    const actualValor = vista.metrica === "importe" ? p.importe : p.actual;
    const anteriorValor = vista.metrica === "importe" ? p.importeAnterior : p.anterior;
    const diferencia = actualValor-anteriorValor;
    const variacion = anteriorValor ? ((diferencia/anteriorValor)*100) : (actualValor ? null : 0);
    const clase = diferencia > 0 ? "comparativa-positivo" : diferencia < 0 ? "comparativa-negativo" : "";
    const variacionTexto = variacion === null ? "Nuevo" : `${variacion > 0 ? "+" : ""}${variacion.toFixed(1)}%`;
    return `<tr><td data-label="#">${i+1}</td><td data-label="Producto">${escapeHTML(p.nombre)}</td><td data-label="Actual"><strong>${vista.metrica === "importe" ? fmt(p.importe) : p.actual}</strong></td><td data-label="Anterior">${vista.metrica === "importe" ? fmt(p.importeAnterior) : p.anterior}</td><td data-label="Diferencia"><span class="${clase}">${diferencia > 0 ? "+" : diferencia < 0 ? "−" : ""}${vista.metrica === "importe" ? fmt(Math.abs(diferencia)) : Math.abs(diferencia)}</span></td><td data-label="Variación"><span class="${clase}">${variacionTexto}</span></td><td data-label="Importe actual"><strong>${fmt(p.importe)}</strong></td></tr>`;
  }).join("") : `<tr><td colspan="7" class="panel-sin-datos">No hay productos que coincidan con la búsqueda.</td></tr>`;
}


function mostrarComparativaSemanal(origen = "reportes") {
  origenComparativa = "reportes";
  comparativaSemanalActiva = true;
  const vistaReportes = document.getElementById("reportes");
  if (vistaReportes) vistaReportes.classList.add("comparativa-activa");
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

function volverAlPanelVentas() {
  comparativaSemanalActiva = false;
  const vistaReportes = document.getElementById("reportes");
  if (vistaReportes) vistaReportes.classList.remove("comparativa-activa");
  reporteRango(ultimoRangoReporte || "dia", "reportes");
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
    <div class="comparativa-volver"><button type="button" class="btn-secondary" onclick="volverAlPanelVentas()">← Volver a ${origenComparativa === "reportes" ? "Reportes" : "Panel de ventas"}</button></div>
    <div class="comparativa-cabecera">
      <div><span class="panel-eyebrow">COMPARATIVA</span><h3>Esta semana vs. semana pasada</h3><p>Semanas de lunes a domingo · ${rangoTexto}</p></div>
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
  const celda = c => { let s = String(c ?? ""); if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const csv = rows.map(r => r.map(celda).join(",")).join("\n");
  const ok = guardarArchivoTexto(`ventas_${hoy()}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
  if (ok) toast("📥 CSV descargado");
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
