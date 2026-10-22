/* ============================================
   CAJA.JS — GASTOS PERSONALES, ESTADO DE CAJA Y CORTE
   ============================================ */

/* ============ GESTOR PERSONAL Y APERTURA DE CAJA ============ */

function initDia() {
  if (estadoCajaHoy.fecha !== hoy()) {
    estadoCajaHoy = { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [] };
    LS.set("cajaHoy", estadoCajaHoy);
  }
}

function abrirFondoInicial() {
  abrirModal("💵 Abrir caja del día", `
    <p style="color:#64748b;font-size:14px;margin-bottom:12px">Ingresa el fondo inicial en efectivo para dar cambio.</p>
    <label>Fondo inicial</label>
    <input id="fondoMonto" type="number" step="0.01" value="${estadoCajaHoy.fondoInicial || 500}">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarFondo()">Abrir caja</button>
    </div>
  `);
}

function guardarFondo() {
  const monto = +$("#fondoMonto").value || 0;
  estadoCajaHoy.fondoInicial = monto;
  LS.set("cajaHoy", estadoCajaHoy);
  cerrarModal();
  renderEstadoCaja();
  toast("✅ Caja abierta con fondo de " + fmt(monto));
}

// Caja Fuerte: movimientos personales separados de las ventas y gastos del negocio.
// Los gastos personales antiguos se conservan y aparecen como egresos en el historial.
function abrirCajaFuerte() { abrirGestorGastosPersonales(); }

function obtenerGastosPersonales() {
  const lista = LS.get("gastosPersonales", []);
  return Array.isArray(lista) ? lista : [];
}

function obtenerMovimientosCajaFuerte() {
  const lista = LS.get("cajaFuerteMovimientos", []);
  return Array.isArray(lista) ? lista : [];
}

// Filtros temporales del historial; no alteran ni eliminan movimientos guardados.
let filtroCajaFuerteFecha = "";

function fechaMovimientoCajaFuerte(fecha) {
  if (!fecha) return "";
  // Las fechas sin hora ya representan un día local; no convertirlas desde UTC.
  const texto = String(fecha);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return fechaLocal(d);
}

function cambiarFechaCajaFuerte(valor) {
  filtroCajaFuerteFecha = valor || hoy();
  abrirGestorGastosPersonales();
}

function limpiarFiltroCajaFuerte() {
  filtroCajaFuerteFecha = hoy();
  abrirGestorGastosPersonales();
}

function listarMovimientosCajaFuerte() {
  const antiguos = obtenerGastosPersonales().map(g => ({
    id: String(g.id), fecha: g.fecha, concepto: g.concepto || "Gasto personal",
    monto: Number(g.monto) || 0, tipo: "gasto", nota: g.nota || "", origen: "antiguo"
  }));
  const nuevos = obtenerMovimientosCajaFuerte().map(m => ({ ...m, origen: "nuevo" }));
  // Los gastos registrados con este método viven en DB.gastos: así se reflejan
  // en Caja Fuerte y también se sincronizan/resguardan con el resto del negocio.
  const gastosDesdeCajaFuerte = (DB.gastos || []).filter(g => g.metodo === "Caja Fuerte").map(g => ({
    id: String(g.id), gastoId: g.id, fecha: g.fecha, concepto: g.categoria || "Gasto del negocio",
    monto: Number(g.monto) || 0, tipo: "gasto", nota: g.nota || "Registrado desde Gastos",
    origen: "gasto-negocio"
  }));
  return [...antiguos, ...nuevos, ...gastosDesdeCajaFuerte].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}

function abrirGestorGastosPersonales() {
  const movimientos = listarMovimientosCajaFuerte();
  const ingresos = movimientos.filter(m => m.tipo === "ingreso").reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const gastos = movimientos.filter(m => m.tipo !== "ingreso").reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const saldoMovimientos = ingresos - gastos;
  const ajusteSaldo = Number(LS.get("cajaFuerteSaldoAjuste", 0)) || 0;
  const saldo = saldoMovimientos + ajusteSaldo;
  if (!filtroCajaFuerteFecha) filtroCajaFuerteFecha = hoy();
  const fechaActiva = filtroCajaFuerteFecha;
  const movimientosFiltrados = movimientos.filter(m => fechaMovimientoCajaFuerte(m.fecha) === fechaActiva);
  const fechaTextoCajaFuerte = fechaActiva === hoy() ? "Hoy" : new Date(`${fechaActiva}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  abrirModal("🔐 Caja Fuerte", `
    <div class="cf-panel">
      <div class="cf-saldo">
        <div class="cf-saldo-etiqueta">Saldo actual</div>
        <div class="cf-saldo-cantidad">${fmt(saldo)}</div>
        <div style="font-size:11px;line-height:1.5;color:#d2e5dc;margin-top:-10px;margin-bottom:12px">
          Saldo por movimientos: ${fmt(saldoMovimientos)}<br>
          Ajuste manual: ${ajusteSaldo > 0 ? "+" : ""}${fmt(ajusteSaldo)}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:-8px;margin-bottom:12px">
          <button class="cf-boton" style="padding:7px 11px;background:#ffffff20;color:#fff;border:1px solid #ffffff55;font-size:12px" onclick="abrirEditarSaldoCajaFuerte(${saldo})">✏️ Editar saldo</button>
        </div>
        <div class="cf-resumen">
          <div><span>Ingresos</span><b class="cf-ingreso">+${fmt(ingresos)}</b></div>
          <div><span>Gastos</span><b class="cf-gasto">−${fmt(gastos)}</b></div>
        </div>
      </div>
      <p class="cf-ayuda">Dinero personal, separado de la caja del negocio.</p>
      <div class="cf-acciones">
        <button class="cf-boton cf-boton-ingreso" onclick="abrirFormularioCajaFuerte('ingreso')"><span>＋</span><b>Nuevo ingreso</b></button>
        <button class="cf-boton cf-boton-gasto" onclick="abrirFormularioCajaFuerte('gasto')"><span>−</span><b>Nuevo gasto</b></button>
      </div>
      <div class="cf-historial-cabecera"><div><b>Historial · ${escapeHTML(fechaTextoCajaFuerte)}</b><small>${movimientosFiltrados.length} ${movimientosFiltrados.length === 1 ? "movimiento" : "movimientos"} · ${movimientos.length} en total</small></div><span>📊</span></div>
      <div class="cf-filtros" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px;border:1px solid var(--borde,#e2e8f0);border-radius:12px">
        <label style="font-size:12px;font-weight:700;min-width:0;flex:1">Consultar fecha<input type="date" value="${escapeHTML(fechaActiva)}" max="${escapeHTML(hoy())}" onchange="cambiarFechaCajaFuerte(this.value)" style="display:block;box-sizing:border-box;width:100%;margin-top:4px;min-width:0;padding:9px;border:1px solid var(--borde);border-radius:9px;background:var(--fondo,#fff);color:var(--texto)"></label>
        <button class="btn-secondary" type="button" onclick="limpiarFiltroCajaFuerte()">Hoy</button>
      </div>
      <div class="cf-lista">
        ${movimientosFiltrados.length ? movimientosFiltrados.map(m => `
          <div class="cf-movimiento">
            <div class="cf-mov-icono ${m.tipo === 'ingreso' ? 'es-ingreso' : 'es-gasto'}">${m.tipo === 'ingreso' ? '↙' : '↗'}</div>
            <div class="cf-mov-info"><b>${escapeHTML(m.concepto || (m.tipo === 'ingreso' ? 'Ingreso personal' : 'Gasto personal'))}</b><small>${m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} · ${m.fecha ? new Date(m.fecha).toLocaleDateString('es-MX') : 'Sin fecha'}${m.nota ? ' · ' + escapeHTML(m.nota) : ''}</small></div>
            <b class="cf-mov-monto ${m.tipo === 'ingreso' ? 'cf-ingreso' : 'cf-gasto'}">${m.tipo === 'ingreso' ? '+' : '−'}${fmt(m.monto)}</b>
            <button class="cf-eliminar" onclick="borrarMovimientoCajaFuerte('${String(m.id).replace(/'/g,"\\'")}', '${m.origen}')" title="Eliminar movimiento" aria-label="Eliminar movimiento">×</button>
          </div>`).join('') : `<div class="cf-vacio"><span>📊</span><b>Sin movimientos para esta fecha</b><small>Selecciona otro día en el calendario o registra un movimiento nuevo.</small></div>`}
      </div>
      <div class="acciones"><button class="btn-secondary" onclick="cerrarModal()">Cerrar</button></div>
    </div>
  `);
}


function abrirEditarSaldoCajaFuerte(saldoActual) {
  abrirModal("✏️ Editar saldo actual", `
    <div class="cf-formulario">
      <p class="cf-form-ayuda">Ajusta el saldo mostrado sin modificar ni borrar los ingresos y gastos del historial. Los movimientos futuros seguirán sumando o restando a partir de este saldo.</p>
      <label>Nuevo saldo actual</label>
      <input id="cfNuevoSaldo" type="number" step="0.01" inputmode="decimal" value="${Number(saldoActual || 0).toFixed(2)}" placeholder="0.00">
      <div class="acciones">
        <button class="btn-secondary" onclick="abrirGestorGastosPersonales()">Cancelar</button>
        <button class="btn-primary" onclick="guardarSaldoCajaFuerte()">💾 Guardar saldo</button>
      </div>
    </div>
  `);
}

function guardarSaldoCajaFuerte() {
  const input = document.getElementById("cfNuevoSaldo");
  const nuevoSaldo = Number(input?.value);
  if (!Number.isFinite(nuevoSaldo)) return toast("Ingresa un saldo válido");
  const movimientos = listarMovimientosCajaFuerte();
  const ingresos = movimientos.filter(m => m.tipo === "ingreso").reduce((s, m) => s + (Number(m.monto) || 0), 0);
  const gastos = movimientos.filter(m => m.tipo !== "ingreso").reduce((s, m) => s + (Number(m.monto) || 0), 0);
  // Ajuste separado: no altera los movimientos históricos.
  const saldoAnterior = ingresos - gastos + (Number(LS.get("cajaFuerteSaldoAjuste", 0)) || 0);
  if (!confirm(`¿Confirmas cambiar el saldo de ${fmt(saldoAnterior)} a ${fmt(nuevoSaldo)}? El ajuste no crea un ingreso o gasto en el historial.`)) return;
  LS.set("cajaFuerteSaldoAjuste", nuevoSaldo - (ingresos - gastos));
  toast("✅ Saldo actual actualizado; el historial no se modificó");
  abrirGestorGastosPersonales();
}

function abrirFormularioCajaFuerte(tipo) {
  const esIngreso = tipo === "ingreso";
  abrirModal(esIngreso ? "＋ Nuevo ingreso" : "− Nuevo gasto", `
    <div class="cf-formulario">
      <p class="cf-form-ayuda">${esIngreso ? 'Registra el dinero que recibiste.' : 'Registra el dinero que utilizaste.'}</p>
      <label>Concepto</label><input id="cfConcepto" maxlength="80" placeholder="Ej. ahorro, compra, transporte" autocomplete="off">
      <label>Monto</label><input id="cfMonto" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00">
      <label>Nota (opcional)</label><input id="cfNota" maxlength="160" placeholder="Detalle adicional">
      <div class="acciones"><button class="btn-secondary" onclick="abrirGestorGastosPersonales()">Cancelar</button><button class="btn-primary" onclick="guardarMovimientoCajaFuerte('${tipo}')">${esIngreso ? '＋ Guardar ingreso' : '− Guardar gasto'}</button></div>
    </div>
  `);
}

function guardarMovimientoCajaFuerte(tipo) {
  const concepto = document.getElementById("cfConcepto")?.value.trim();
  const monto = Number(document.getElementById("cfMonto")?.value);
  const nota = document.getElementById("cfNota")?.value.trim() || "";
  if (!concepto) return toast("Escribe el concepto del movimiento");
  if (!Number.isFinite(monto) || monto <= 0) return toast("Ingresa un monto válido");
  const movimientos = obtenerMovimientosCajaFuerte();
  movimientos.push({
    id: (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
    fecha: new Date().toISOString(), concepto, tipo, monto, nota
  });
  LS.set("cajaFuerteMovimientos", movimientos);
  filtroCajaFuerteFecha = hoy();
  toast(tipo === "ingreso" ? "✅ Ingreso guardado" : "✅ Gasto guardado");
  abrirGestorGastosPersonales();
}

function borrarMovimientoCajaFuerte(id, origen) {
  if (origen === "gasto-negocio") {
    const gasto = (DB.gastos || []).find(g => String(g.id) === String(id) && g.metodo === "Caja Fuerte");
    if (!gasto) return toast("Gasto no encontrado");
    if (!confirm(`¿Eliminar también el gasto de ${gasto.categoria || "negocio"} por ${fmt(gasto.monto)}? Se quitará de Gastos, del reporte y de Caja Fuerte.`)) return;
    if (prompt('Para confirmar, escribe ELIMINAR:') !== 'ELIMINAR') return toast("Eliminación cancelada");
    DB.gastos = DB.gastos.filter(g => String(g.id) !== String(id));
    guardar();
    if (typeof renderGastos === "function") renderGastos();
    if (typeof renderEstadoCaja === "function") renderEstadoCaja();
    toast("🗑️ Gasto eliminado de Gastos y Caja Fuerte");
    abrirGestorGastosPersonales();
    return;
  }
  const esAntiguo = origen === "antiguo";
  const lista = esAntiguo ? obtenerGastosPersonales() : obtenerMovimientosCajaFuerte();
  const movimiento = lista.find(m => String(m.id) === String(id));
  if (!movimiento) return toast("Movimiento no encontrado");
  const tipo = esAntiguo ? "gasto" : movimiento.tipo;
  if (!confirm(`¿Eliminar este ${tipo === "ingreso" ? "ingreso" : "gasto"} por ${fmt(movimiento.monto)}?`)) return;
  if (prompt('Para confirmar, escribe ELIMINAR:') !== 'ELIMINAR') return toast("Eliminación cancelada");
  if (esAntiguo) LS.set("gastosPersonales", lista.filter(m => String(m.id) !== String(id)));
  else LS.set("cajaFuerteMovimientos", lista.filter(m => String(m.id) !== String(id)));
  toast("🗑️ Movimiento eliminado");
  abrirGestorGastosPersonales();
}

// Compatibilidad con registros anteriores que usaban esta función.
function guardarGastoPersonal() { guardarMovimientoCajaFuerte("gasto"); }
function borrarGastoPersonal(id) { borrarMovimientoCajaFuerte(id, "antiguo"); }

/* ============ RESUMEN DEL DÍA (una sola fuente para estado y corte) ============ */
// false = la caja fuerte NO afecta el corte. Pon true si quieres que depósitos y retiros vuelvan a sumar/restar.
const CORTE_INCLUYE_CAJA_FUERTE = false;

// Un movimiento es "del turno" si es de hoy y posterior al último corte (cada corte reinicia la caja)
const delTurno = fecha => fechaLocal(fecha) === hoy() && (!estadoCajaHoy.desde || new Date(fecha) > new Date(estadoCajaHoy.desde));

function resumenDia() {
  const ventasHoy = DB.ventas.filter(v => delTurno(v.fecha) && !v.cancelada);
  const sumaVentas = m => ventasHoy.filter(v => v.metodo === m).reduce((s, v) => s + v.total, 0);
  const efectivoVentas = sumaVentas("Efectivo");
  const tarjetaVentas = sumaVentas("Tarjeta");
  const transfVentas = sumaVentas("Transferencia");
  const gastosDia = DB.gastos.filter(g => delTurno(g.fecha));
  const gastosEfectivo = gastosDia.filter(g => g.metodo === "Efectivo" || !g.metodo).reduce((s, g) => s + g.monto, 0);
  const gastosTransf = gastosDia.filter(g => g.metodo === "Transferencia").reduce((s, g) => s + g.monto, 0);
  const gastosCajaFuerte = gastosDia.filter(g => g.metodo === "Caja Fuerte").reduce((s, g) => s + g.monto, 0);
  const retiros = estadoCajaHoy.retiros.reduce((s, r) => s + r.monto, 0);
  const depositos = estadoCajaHoy.depositos.reduce((s, d) => s + d.monto, 0);
  const fondo = estadoCajaHoy.fondoInicial || 0;
  const cajaFuerte = CORTE_INCLUYE_CAJA_FUERTE ? depositos - retiros : 0;
  const esperado = fondo + efectivoVentas + cajaFuerte - gastosEfectivo;
  return { ventasHoy, efectivoVentas, tarjetaVentas, transfVentas, totalVentas: efectivoVentas + tarjetaVentas + transfVentas,
           gastosEfectivo, gastosTransf, gastosCajaFuerte, retiros, depositos, fondo, esperado };
}

/* ============ ESTADO DE CAJA ============ */
function renderEstadoCaja() {
  const elEstado = $("#estadoCaja");
  if (!elEstado) return;

  initDia();
  const r = resumenDia();
  const { ventasHoy, efectivoVentas, tarjetaVentas, transfVentas, totalVentas, gastosEfectivo, gastosTransf, fondo } = r;
  const esperadoEnCaja = r.esperado;

  elEstado.innerHTML = `
    ${estadoCajaHoy.fondoInicial === null ? `
      <div class="card" style="background:#fef3c7;border-left:4px solid var(--warn);margin-bottom:14px">
        <b>⚠️ Caja no abierta</b>
        <p style="color:#64748b;font-size:13px;margin:6px 0">Abre la caja con el fondo inicial.</p>
        <button class="btn-primary" onclick="abrirFondoInicial()" style="margin-top:8px">💵 Abrir caja</button>
      </div>
    ` : ""}

    <div class="estado-caja">
      <div class="card azul">
        <h4>Fondo inicial</h4>
        <p class="big">${fmt(fondo)}</p>
        <small><a href="#" onclick="abrirFondoInicial();return false" style="color:var(--naranja);font-weight:700;">editar</a></small>
      </div>
      <div class="card verde">
        <h4>Efectivo en ventas</h4>
        <p class="big">${fmt(efectivoVentas)}</p>
        <small>${ventasHoy.filter(v=>v.metodo==="Efectivo").length} tickets</small>
      </div>
      <div class="card">
        <h4>Tarjeta</h4>
        <p class="big">${fmt(tarjetaVentas)}</p>
      </div>
      <div class="card">
        <h4>Transferencia</h4>
        <p class="big">${fmt(transfVentas)}</p>
      </div>
      <div class="card rojo">
        <h4>Gastos en efectivo</h4>
        <p class="big">${fmt(gastosEfectivo)}</p>
        <small>Salen de la caja</small>
      </div>
      <div class="card">
        <h4>Gastos por transferencia</h4>
        <p class="big">${fmt(gastosTransf)}</p>
        <small>No afectan la caja</small>
      </div>
    </div>

    <div class="card destacado" style="padding:20px;text-align:center">
      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">💵 Efectivo esperado en caja</h4>
      <p style="font-size:36px;font-weight:800;margin:8px 0">${fmt(esperadoEnCaja)}</p>
      <small style="opacity:.9">Fondo + ventas en efectivo − gastos en efectivo</small>
    </div>

    <div class="cards" style="margin-top:14px">
      <div class="card">
        <h4>${estadoCajaHoy.desde ? "Ventas desde el último corte" : "Total ventas del día"}</h4>
        <p class="big">${fmt(totalVentas)}</p>
        <small>${ventasHoy.length} tickets</small>
      </div>
    </div>
  `;

  renderHistorialCortes();
}

/* ============ CORTE ============ */
function abrirCorteDiario() {
  initDia();
  const r = resumenDia();
  const { efectivoVentas, tarjetaVentas, transfVentas, totalVentas, gastosEfectivo, gastosTransf, gastosCajaFuerte, retiros, depositos, fondo, esperado } = r;

  abrirModal("📋 Corte de caja", `
    <div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;border:1px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Fondo inicial:</span><b>${fmt(fondo)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>+ Ventas efectivo:</span><b>${fmt(efectivoVentas)}</b></div>
      ${CORTE_INCLUYE_CAJA_FUERTE ? `
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>+ Depósitos:</span><b>${fmt(depositos)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>− Retiros:</span><b>-${fmt(retiros)}</b></div>` : ""}
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Gastos efectivo:</span><b>${fmt(gastosEfectivo)}</b></div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0">
      <div style="display:flex;justify-content:space-between;font-size:15px"><b>Efectivo esperado:</b><b style="color:var(--naranja)">${fmt(esperado)}</b></div>
    </div>

    <div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;border:1px solid var(--borde)">
      <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700;margin-bottom:4px">Otros movimientos (no afectan el efectivo)</div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Ventas tarjeta:</span><b>${fmt(tarjetaVentas)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Ventas transferencia:</span><b>${fmt(transfVentas)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Gastos por transferencia:</span><b>${fmt(gastosTransf)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Gastos Caja Fuerte:</span><b>${fmt(gastosCajaFuerte)}</b></div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><b>Total ventas del día:</b><b>${fmt(totalVentas)}</b></div>
    </div>

    <h4 style="font-size:13px;margin-bottom:8px">Arqueo (conteo físico)</h4>
    <div class="arqueo-grid">
      <div>
        <label>Billetes $1000</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="1000" value="0" oninput="calcArqueo()"><span class="sub" id="s1000">$0</span></div>
        <label>Billetes $500</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="500" value="0" oninput="calcArqueo()"><span class="sub" id="s500">$0</span></div>
        <label>Billetes $200</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="200" value="0" oninput="calcArqueo()"><span class="sub" id="s200">$0</span></div>
        <label>Billetes $100</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="100" value="0" oninput="calcArqueo()"><span class="sub" id="s100">$0</span></div>
        <label>Billetes $50</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="50" value="0" oninput="calcArqueo()"><span class="sub" id="s50">$0</span></div>
      </div>
      <div>
        <label>Billetes $20</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="20" value="0" oninput="calcArqueo()"><span class="sub" id="s20">$0</span></div>
        <label>Monedas $10</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="10" value="0" oninput="calcArqueo()"><span class="sub" id="s10">$0</span></div>
        <label>Monedas $5</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="5" value="0" oninput="calcArqueo()"><span class="sub" id="s5">$0</span></div>
        <label>Monedas $2</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="2" value="0" oninput="calcArqueo()"><span class="sub" id="s2">$0</span></div>
        <label>Monedas $1</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="1" value="0" oninput="calcArqueo()"><span class="sub" id="s1">$0</span></div>
      </div>
    </div>

    <div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:12px;border:1px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Contado:</span><b id="totalContado">$0.00</b></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Esperado:</span><b>${fmt(esperado)}</b></div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0">
      <div style="display:flex;justify-content:space-between;font-size:16px"><b>Diferencia:</b><b id="diferencia" style="color:var(--ok)">$0.00</b></div>
    </div>

    <label>Nota del corte (opcional)</label>
    <input id="corteNota" placeholder="Observaciones...">

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarCorte(${esperado}, ${efectivoVentas}, ${tarjetaVentas}, ${transfVentas}, ${totalVentas})">💾 Guardar corte</button>
    </div>
  `);

  window._esperadoCorte = esperado;
}

function calcArqueo() {
  let total = 0;
  $$(".arqueo").forEach(inp => {
    const v = +inp.dataset.v;
    const cant = +inp.value || 0;
    const sub = v * cant;
    total += sub;
    const span = $("#s" + v);
    if (span) span.textContent = fmt(sub);
  });
  $("#totalContado").textContent = fmt(total);
  const esp = window._esperadoCorte || 0;
  const dif = total - esp;
  const el = $("#diferencia");
  el.textContent = (dif >= 0 ? "+" : "") + fmt(dif);
  el.style.color = Math.abs(dif) < 0.01 ? "var(--ok)" : (dif > 0 ? "#3b82f6" : "var(--rojo)");
}

function guardarCorte(esperado, efectivo, tarjeta, transf, total) {
  if (!confirm("El corte reinicia la caja: fondo inicial y movimientos de caja fuerte.\n\nLas ventas y gastos se conservan en Historial y Reportes.\n\n¿Guardar el corte?")) return;
  const contado = +$("#totalContado").textContent.replace(/[^0-9.-]/g, "");
  const nota = $("#corteNota").value.trim();
  const diferencia = contado - esperado;

  const corte = {
    id: nuevoId(LS.get("cortes", [])),
    fecha: new Date().toISOString(),
    dia: hoy(),
    fondo: estadoCajaHoy.fondoInicial || 0,
    ventas: { efectivo, tarjeta, transf, total, tickets: resumenDia().ventasHoy.length },
    gastos: resumenDia().gastosEfectivo,
    gastosTransf: resumenDia().gastosTransf,
    gastosCajaFuerte: resumenDia().gastosCajaFuerte,
    retiros: CORTE_INCLUYE_CAJA_FUERTE ? resumenDia().retiros : 0,
    depositos: CORTE_INCLUYE_CAJA_FUERTE ? resumenDia().depositos : 0,
    movCajaFuerte: { retiros: estadoCajaHoy.retiros, depositos: estadoCajaHoy.depositos },
    esperado, contado, diferencia, nota,
    usuario: JSON.parse(sessionStorage.getItem("sesion") || "{}").nombre || "admin"
  };

  const cortes = LS.get("cortes", []);
  cortes.push(corte);
  LS.set("cortes", cortes);

  // Reiniciar la caja: lo anterior queda en el corte, el Historial y los Reportes
  estadoCajaHoy = { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [], desde: new Date().toISOString() };
  LS.set("cajaHoy", estadoCajaHoy);

  cerrarModal();
  toast(`✅ Corte guardado · Diferencia: ${fmt(diferencia)} · Caja reiniciada`);
  renderEstadoCaja();
  window._fechaHistorialCortes = corte.dia;
  renderHistorialCortes();
  mostrarAlertaStock();
  imprimirCorte(corte);
}

function resumenResultadoCorte(corte) {
  const diferencia = Number.isFinite(Number(corte?.diferencia))
    ? Number(corte.diferencia)
    : (Number(corte?.contado) || 0) - (Number(corte?.esperado) || 0);
  if (Math.abs(diferencia) < 0.01) return { diferencia: 0, texto: "CAJA CUADRADA", clase: "ok" };
  return diferencia > 0
    ? { diferencia, texto: "SOBRANTE", clase: "warn" }
    : { diferencia, texto: "FALTANTE", clase: "danger" };
}

function renderHistorialCortes(fechaSeleccionada) {
  const todos = LS.get("cortes", []).slice().reverse();
  if (fechaSeleccionada) window._fechaHistorialCortes = fechaSeleccionada;
  if (!window._fechaHistorialCortes) window._fechaHistorialCortes = hoy();
  const fechaActiva = window._fechaHistorialCortes;
  const cortes = todos.filter(c => (c.dia || (c.fecha ? fechaLocal(c.fecha) : "")) === fechaActiva);
  const el = $("#historialCortes");
  if (!el) return;

  const fechaTexto = fechaActiva ? new Date(`${fechaActiva}T12:00:00`).toLocaleDateString("es-MX", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }) : "Selecciona una fecha";

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 12px 8px">
      <div>
        <h3 style="margin:0;font-size:15px;font-weight:800">Historial de cortes</h3>
        <small style="color:var(--texto-secundario,#64748b)">Consulta los cortes de un día específico</small>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <label for="fechaHistorialCortes" style="font-size:12px;font-weight:700;margin:0">Fecha</label>
        <input id="fechaHistorialCortes" type="date" value="${escapeHTML(fechaActiva)}" max="${escapeHTML(hoy())}"
          onchange="renderHistorialCortes(this.value)"
          style="width:auto;min-width:145px;padding:8px 10px;border:1px solid var(--borde);border-radius:9px;background:var(--card);color:var(--texto)">
        <button class="btn-mini" type="button" onclick="renderHistorialCortes('${hoy()}')" style="padding:8px 10px">Hoy</button>
      </div>
    </div>
    <div style="padding:0 12px 12px">
      <div style="font-size:13px;font-weight:800;text-transform:capitalize;margin-bottom:10px">${escapeHTML(fechaTexto)} · ${cortes.length} ${cortes.length === 1 ? "corte" : "cortes"}</div>
      ${cortes.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:10px">
          ${cortes.map(c => {
            const resultado = resumenResultadoCorte(c);
            const hora = c.fecha ? new Date(c.fecha).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"}) : "Hora no disponible";
            const diferenciaTexto = `${resultado.diferencia > 0 ? "+" : resultado.diferencia < 0 ? "−" : ""}${fmt(Math.abs(resultado.diferencia))}`;
            return `
              <article class="card" style="padding:14px;border:1px solid var(--borde);border-radius:12px;display:flex;flex-direction:column;gap:9px;min-width:0">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                  <div><div style="font-size:12px;color:var(--texto-secundario,#64748b)">Corte de las</div><div style="font-size:20px;font-weight:800">${escapeHTML(hora)}</div></div>
                  <span class="badge ${resultado.clase}">${resultado.texto}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <div style="padding:9px;background:var(--fondo,#f8fafc);border-radius:9px"><div style="font-size:11px;color:var(--texto-secundario,#64748b)">Ventas</div><strong>${fmt(c.ventas?.total || 0)}</strong></div>
                  <div style="padding:9px;background:var(--fondo,#f8fafc);border-radius:9px"><div style="font-size:11px;color:var(--texto-secundario,#64748b)">Efectivo esperado</div><strong>${fmt(c.esperado || 0)}</strong></div>
                  <div style="padding:9px;background:var(--fondo,#f8fafc);border-radius:9px"><div style="font-size:11px;color:var(--texto-secundario,#64748b)">Efectivo contado</div><strong>${fmt(c.contado || 0)}</strong></div>
                  <div style="padding:9px;background:var(--fondo,#f8fafc);border-radius:9px"><div style="font-size:11px;color:var(--texto-secundario,#64748b)">Diferencia</div><strong>${diferenciaTexto}</strong></div>
                </div>
                <div style="font-size:12px;color:var(--texto-secundario,#64748b)">Cajero: ${escapeHTML(c.usuario || "admin")}</div>
                ${c.nota ? `<div style="font-size:12px;overflow-wrap:anywhere">Nota: ${escapeHTML(c.nota)}</div>` : ""}
                <div style="display:flex;justify-content:flex-end;margin-top:auto;padding-top:3px">
                  <button class="btn-mini" aria-label="Imprimir corte" onclick='imprimirCorte(${JSON.stringify(c).replace(/'/g,"&#39;")})'>🖨️ Imprimir corte</button>
                </div>
              </article>`;
          }).join("")}
        </div>
      ` : `
        <div style="text-align:center;padding:24px 14px;border:1px dashed var(--borde);border-radius:12px;color:var(--texto-secundario,#94a3b8)">
          <div style="font-size:26px;margin-bottom:6px">🗓️</div>
          <strong style="display:block;color:var(--texto,#334155);margin-bottom:4px">No hay cortes para esta fecha</strong>
          <span style="font-size:12px">Selecciona otro día en el calendario para consultar su historial.</span>
        </div>
      `}
    </div>
  `;
}

function imprimirCorte(c) {
  // En Android, enviar el corte al puente nativo Bluetooth (window.print no imprime por esta ruta).
  if (typeof EN_ANDROID !== "undefined" && EN_ANDROID) {
    if (typeof androidImprimirCorte === "function" && typeof Android !== "undefined" && Android.isConnected && Android.isConnected()) {
      const enviado = androidImprimirCorte(c);
      if (enviado) {
        toast("🖨️ Corte enviado a la impresora");
      } else {
        toast("⚠️ No se pudo enviar el corte a la impresora");
      }
    } else {
      toast("⚠️ No hay impresora Bluetooth conectada");
      if (typeof abrirModalImpresora === "function") abrirModalImpresora();
    }
    return;
  }

  // En navegador de escritorio, conservar la impresión web tradicional.
  const n = DB.negocio || {};
  const resultado = resumenResultadoCorte(c);
  const logoNegocio = typeof obtenerLogoNegocio === "function" ? obtenerLogoNegocio() : "";
  imprimirHTML(`
    ${logoNegocio ? `<div class="c"><img src="${logoNegocio}" alt="Logotipo" style="max-width:90px;max-height:70px;object-fit:contain"></div>` : ""}
    <div class="c b g">${escapeHTML(n.nombre || "POS")}</div>
    ${n.slogan ? `<div class="c">${escapeHTML(n.slogan)}</div>` : ""}
    ${n.direccion ? `<div class="c">${escapeHTML(n.direccion)}</div>` : ""}
    ${n.telefono ? `<div class="c">Tel: ${escapeHTML(n.telefono)}</div>` : ""}
    <div class="c b">CORTE DE CAJA</div>
    <hr>
    <div>Fecha: ${new Date(c.fecha).toLocaleString("es-MX")}</div>
    <div>Cajero: ${escapeHTML(c.usuario)}</div>
    <hr>
    <div class="b">VENTAS</div>
    <div class="fila"><span>Efectivo:</span><span>${fmt(c.ventas.efectivo)}</span></div>
    <div class="fila"><span>Tarjeta:</span><span>${fmt(c.ventas.tarjeta)}</span></div>
    <div class="fila"><span>Transferencia:</span><span>${fmt(c.ventas.transf)}</span></div>
    <div class="fila b"><span>TOTAL:</span><span>${fmt(c.ventas.total)}</span></div>
    <div class="fila"><span>Tickets:</span><span>${c.ventas.tickets}</span></div>
    <hr>
    <div class="b">EFECTIVO</div>
    <div class="fila"><span>Fondo inicial:</span><span>${fmt(c.fondo)}</span></div>
    ${c.depositos || c.retiros ? `<div class="fila"><span>Depósitos:</span><span>+${fmt(c.depositos)}</span></div>
    <div class="fila"><span>Retiros:</span><span>-${fmt(c.retiros)}</span></div>` : ""}
    <div class="fila"><span>Gastos efectivo:</span><span>${fmt(c.gastos)}</span></div>
    ${c.gastosTransf ? `<div class="fila"><span>Gastos transf. (no caja):</span><span>${fmt(c.gastosTransf)}</span></div>` : ""}
    ${c.gastosCajaFuerte ? `<div class="fila"><span>Gastos Caja Fuerte (no caja):</span><span>${fmt(c.gastosCajaFuerte)}</span></div>` : ""}
    <div class="fila"><span>Efectivo esperado:</span><span>${fmt(c.esperado || 0)}</span></div>
    <div class="fila"><span>Efectivo contado:</span><span>${fmt(c.contado || 0)}</span></div>
    <hr>
    <div class="fila b"><span>RESULTADO:</span><span>${resultado.texto}</span></div>
    <div class="fila b g"><span>${resultado.texto === "CAJA CUADRADA" ? "Diferencia:" : resultado.texto + ":"}</span><span>${fmt(Math.abs(resultado.diferencia))}</span></div>
    <hr>
    ${c.nota ? `<div>Nota: ${escapeHTML(c.nota)}</div><hr>` : ""}
    <div class="c">Firma: _____________</div>
  `, "corte");
}
