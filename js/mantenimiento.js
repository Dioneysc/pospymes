/* ============================================
   MANTENIMIENTO.JS — Almacenamiento, archivo histórico y respaldos
   1) Medidor de espacio usado (localStorage tiene ~5 MB por origen)
   2) Archivar ventas/gastos antiguos a un archivo, dejando un resumen mensual
   3) Respaldo automático al hacer el corte + recordatorio semanal
   ============================================ */

const MANT_LIMITE = 5 * 1024 * 1024;   // caracteres aproximados que admite localStorage (conservador)
const MANT_AVISO = 0.75;               // avisar al pasar de este porcentaje
const MANT_DIAS_RESPALDO = 7;          // recordar respaldo si han pasado estos días

const mantEtiqueta = k => ({
  ventas: "Ventas", gastos: "Gastos", productos: "Productos", insumos: "Insumos", cortes: "Cortes de caja",
  papelera: "Papelera", negocioLogoLocal: "Logotipo", syncMeta: "Sincronización", usuarios: "Usuarios",
  preventasPendientes: "Preventas", gastosPersonales: "Gastos personales", cajaFuerteMovimientos: "Caja fuerte",
  resumenHistorico: "Resumen histórico", bitacora: "Bitácora", movimientosInventario: "Movimientos de inventario"
}[k] || k);

/* ---------- 1) ALMACENAMIENTO ---------- */
function usoAlmacenamiento() {
  let total = 0; const partes = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), n = k.length + (localStorage.getItem(k) || "").length;
      total += n; partes.push([k, n]);
    }
  } catch (_) {}
  partes.sort((a, b) => b[1] - a[1]);
  return { total, partes, pct: Math.min(1, total / MANT_LIMITE) };
}
const mantMB = n => (n / 1048576).toFixed(2) + " MB";

function renderMantenimiento() {
  const u = usoAlmacenamiento(), pct = Math.round(u.pct * 100);
  const color = u.pct >= 0.9 ? "#ef4444" : u.pct >= MANT_AVISO ? "#f59e0b" : "#10b981";
  const el = document.getElementById("mantAlmacenamiento");
  if (el) el.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
      <b>${mantMB(u.total)} de ~5 MB</b><span style="color:${color};font-weight:800">${pct}%</span>
    </div>
    <div style="height:10px;border-radius:99px;background:var(--borde,#e2e8f0);overflow:hidden">
      <div style="height:100%;width:${Math.max(2, pct)}%;background:${color}"></div>
    </div>
    <div style="font-size:12px;color:var(--texto-suave,#64748b);margin:8px 0 12px">
      ${u.partes.slice(0, 4).map(([k, n]) => `${escapeHTML(mantEtiqueta(k))}: ${mantMB(n)}`).join(" · ")}
    </div>
    ${u.pct >= MANT_AVISO ? `<div style="font-size:13px;font-weight:700;color:${color};margin-bottom:10px">⚠️ Te estás quedando sin espacio. Archiva ventas antiguas o vacía la papelera.</div>` : ""}`;

  const hist = LS.get("resumenHistorico", []).slice().sort((a, b) => b.mes.localeCompare(a.mes));
  const h = document.getElementById("mantResumenHistorico");
  if (h) h.innerHTML = hist.length ? `
    <div style="font-size:13px;font-weight:700;margin:14px 0 6px">📚 Resumen de ventas archivadas</div>
    <div style="overflow-x:auto"><table style="width:100%;font-size:12px;border-collapse:collapse">
      <tr style="text-align:left;color:var(--texto-suave,#64748b)"><th>Mes</th><th>Tickets</th><th>Ventas</th><th>Gastos</th></tr>
      ${hist.slice(0, 24).map(r => `<tr><td>${escapeHTML(r.mes)}</td><td>${r.tickets}</td><td>${fmt(r.ventas)}</td><td>${fmt(r.gastos)}</td></tr>`).join("")}
    </table></div>` : "";

  const ult = LS.get("ultimoRespaldo", null);
  const info = document.getElementById("mantRespaldoInfo");
  if (info) {
    const dias = ult ? Math.floor((Date.now() - new Date(ult)) / 864e5) : null;
    const viejo = dias === null || dias >= MANT_DIAS_RESPALDO;
    info.innerHTML = `<span style="color:${viejo ? "#f59e0b" : "#10b981"};font-weight:700">${
      dias === null ? "⚠️ Aún no has exportado ningún respaldo en este dispositivo"
      : dias === 0 ? "✅ Último respaldo: hoy" : `${viejo ? "⚠️" : "✅"} Último respaldo: hace ${dias} día${dias === 1 ? "" : "s"}`}</span>`;
  }
  const chk = document.getElementById("mantAutoCorte");
  if (chk) chk.checked = LS.get("respaldoAutoCorte", true) !== false;
  const mov = document.getElementById("mantMovInfo");
  if (mov && typeof leerMovimientos === "function") mov.textContent = `Movimientos de inventario guardados: ${leerMovimientos().length}`;
}

/* ---------- 2) ARCHIVAR VENTAS ANTIGUAS ---------- */
function resumirPorMes(ventas, gastos) {
  const m = {};
  const fila = k => (m[k] = m[k] || { mes: k, tickets: 0, ventas: 0, gastos: 0 });
  ventas.forEach(v => { if (v.cancelada) return; const f = fila(fechaLocal(v.fecha).slice(0, 7)); f.tickets++; f.ventas += Number(v.total) || 0; });
  gastos.forEach(g => { fila(fechaLocal(g.fecha).slice(0, 7)).gastos += Number(g.monto) || 0; });
  Object.values(m).forEach(f => { f.ventas = Math.round(f.ventas * 100) / 100; f.gastos = Math.round(f.gastos * 100) / 100; });
  return Object.values(m);
}

function archivarVentasAntiguas() {
  const meses = Number((document.getElementById("mantMeses") || {}).value) || 6;
  const limite = new Date(); limite.setHours(0, 0, 0, 0); limite.setDate(1); limite.setMonth(limite.getMonth() - meses);
  const viejas = DB.ventas.filter(v => new Date(v.fecha) < limite);
  const gViejos = DB.gastos.filter(g => new Date(g.fecha) < limite);
  if (!viejas.length && !gViejos.length) return toast("No hay ventas ni gastos con más de " + meses + " meses");

  const nube = typeof syncMeta !== "undefined" && syncMeta.activo;
  if (!confirm(
    `Se archivarán ${viejas.length} ventas y ${gViejos.length} gastos anteriores al ${limite.toLocaleDateString("es-MX")}.\n\n` +
    `1) Primero se guardará un ARCHIVO con todo ese detalle.\n2) Después podrás confirmar que se eliminen del sistema.\n\n` +
    (nube ? "⚠️ La sincronización está activa: al eliminarlos también se quitarán de la nube y de los demás dispositivos.\n\n" : "") +
    "¿Continuar?")) return;

  const resumen = resumirPorMes(viejas, gViejos);
  const archivo = {
    app: "POS Pollería Pro", tipo: "archivo-historico", version: 1,
    fechaExportacion: new Date().toISOString(), anterioresA: limite.toISOString(),
    ventas: viejas, gastos: gViejos, resumenMensual: resumen
  };
  let guardado = false;
  try { guardado = guardarArchivoRespaldo(`archivo-historico-hasta-${fechaLocal(limite).slice(0, 7)}.json`, archivo); } catch (e) { console.error(e); }
  if (!guardado) return toast("❌ No se pudo guardar el archivo. No se eliminó nada.");

  if (!confirm("✅ Archivo guardado.\n\nComprueba que esté en tu dispositivo (carpeta Descargas). Si ya lo tienes, se eliminarán esas " +
    viejas.length + " ventas y " + gViejos.length + " gastos del sistema.\n\n¿Eliminar ahora?")) {
    return toast("Archivo guardado. No se eliminó nada del sistema.");
  }

  const idsV = new Set(viejas.map(v => v.id)), idsG = new Set(gViejos.map(g => g.id));
  window._sinPapelera = true; // estos registros ya están en el archivo: no duplicarlos en la papelera
  try {
    DB.ventas = DB.ventas.filter(v => !idsV.has(v.id));
    DB.gastos = DB.gastos.filter(g => !idsG.has(g.id));
    guardar();
  } finally { window._sinPapelera = false; }

  const hist = LS.get("resumenHistorico", []);
  resumen.forEach(r => {
    const e = hist.find(x => x.mes === r.mes);
    if (e) { e.tickets += r.tickets; e.ventas = Math.round((e.ventas + r.ventas) * 100) / 100; e.gastos = Math.round((e.gastos + r.gastos) * 100) / 100; }
    else hist.push(r);
  });
  LS.set("resumenHistorico", hist);
  registrarRespaldo();
  toast(`📦 Archivadas ${viejas.length} ventas y ${gViejos.length} gastos`);
  renderMantenimiento();
  if (typeof refrescarUI === "function") refrescarUI();
}

/* ---------- 3) RESPALDOS ---------- */
function registrarRespaldo() { LS.set("ultimoRespaldo", new Date().toISOString()); renderMantenimiento(); }

function alternarRespaldoAutoCorte(on) { LS.set("respaldoAutoCorte", !!on); toast(on ? "💾 Respaldo automático al corte: activado" : "Respaldo automático al corte: desactivado"); }

// Se llama al guardar un corte. Nunca debe impedir el corte si algo falla.
function respaldoAutomatico(origen) {
  if (origen === "corte" && LS.get("respaldoAutoCorte", true) === false) return false;
  try {
    const d = new Date(), hhmm = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
    const ok = guardarArchivoRespaldo(`respaldo-pos-${hoy()}-${hhmm}-${origen}.json`, crearObjetoRespaldo());
    if (ok) { registrarRespaldo(); toast("💾 Respaldo automático guardado"); }
    return !!ok;
  } catch (e) { console.warn("Respaldo automático:", e); return false; }
}

// Al iniciar sesión (solo administrador, una vez por sesión)
function recordarRespaldo() {
  const s = JSON.parse(sessionStorage.getItem("sesion") || "{}");
  const rol = typeof rolActual === "function" ? rolActual() : s.rol;
  if (rol !== "admin" || sessionStorage.getItem("avisoRespaldo")) return;
  sessionStorage.setItem("avisoRespaldo", "1");
  try { if (typeof compactarMovimientos === "function" && leerMovimientos().length > 1500) compactarMovimientos(14); } catch (_) {} // mantiene liviana la lista de movimientos
  const ult = LS.get("ultimoRespaldo", null);
  if (ult || DB.ventas.length) {
    const dias = ult ? Math.floor((Date.now() - new Date(ult)) / 864e5) : null;
    if (dias === null || dias >= MANT_DIAS_RESPALDO) {
      if (confirm(`💾 ${dias === null ? "Aún no tienes un respaldo en este dispositivo" : "Hace " + dias + " días que no exportas un respaldo"}.\n\n¿Exportarlo ahora?`)) exportarBackup();
    }
  }
  const u = usoAlmacenamiento();
  if (u.pct >= MANT_AVISO) toast(`⚠️ Almacenamiento al ${Math.round(u.pct * 100)}%. Revisa Configuración → Almacenamiento.`);
}

/* ---------- Almacenamiento lleno ---------- */
function avisoAlmacenamiento(on) {
  let b = document.getElementById("avisoAlmacenamiento");
  if (!on) { if (b) b.remove(); return; }
  if (b || !document.body) return;
  b = document.createElement("div");
  b.id = "avisoAlmacenamiento"; b.setAttribute("role", "alert");
  b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;padding:10px 14px;font-size:13px;font-weight:700;text-align:center";
  b.textContent = "⚠️ Almacenamiento lleno: los últimos cambios NO se guardaron. Archiva ventas antiguas o exporta un respaldo (Configuración → Almacenamiento).";
  document.body.appendChild(b);
}
// Prueba real de escritura antes de cobrar: si no cabe, la venta se perdería al recargar
function almacenamientoDisponible() {
  try {
    const k = "__prueba_espacio__";
    localStorage.setItem(k, "x".repeat(20000)); localStorage.removeItem(k);
    if (window._almacenamientoLleno) { window._almacenamientoLleno = false; avisoAlmacenamiento(false); }
    return true;
  } catch (_) {
    window._almacenamientoLleno = true; avisoAlmacenamiento(true);
    toast("🚫 Sin espacio: no se puede cobrar. Archiva ventas antiguas o exporta un respaldo");
    return false;
  }
}
function compactarMovimientosManual() {
  const n = compactarMovimientos(14);
  if (!n) return toast("No hay movimientos con más de 14 días para compactar");
  if (typeof registrarBitacora === "function") registrarBitacora("inventario", "Movimientos de inventario compactados", n + " registros");
  renderMantenimiento();
  toast(`🧹 ${n} movimientos compactados (el stock no cambia)`);
}
