/* ============================================
   MOVIMIENTOS.JS — INVENTARIO POR MOVIMIENTOS
   El stock ya no es "un número que cada dispositivo pisa": es la SUMA de movimientos
   (ventas, cancelaciones, entradas, salidas, ajustes). Los movimientos solo se agregan,
   así que dos teléfonos que venden sin internet nunca se sobrescriben al sincronizar.
   `insumo.stock` sigue existiendo como valor calculado para que el resto de la app funcione igual.
   Cada movimiento: { id, fecha, tipo, lineas:[{i:insumoId, d:delta}], usuario, ref, motivo }
   ============================================ */

const MOV_KEY = "movimientosInventario";
const MOV_TIPOS = { inicial: "Saldo inicial", entrada: "Entrada", salida: "Salida", venta: "Venta", cancelacion: "Cancelación", eliminacion: "Ticket eliminado", ajuste: "Ajuste", base: "Saldo acumulado" };
const redondear6 = n => Math.round(n * 1e6) / 1e6;

function leerMovimientos() { const l = LS.get(MOV_KEY, []); return Array.isArray(l) ? l : []; }

// Une líneas repetidas del mismo insumo
function agruparLineas(lineas) {
  const acc = new Map();
  (lineas || []).forEach(x => { if (x && x.i != null && Number.isFinite(Number(x.d))) acc.set(String(x.i), (acc.get(String(x.i)) || 0) + Number(x.d)); });
  return [...acc].map(([i, d]) => ({ i: isNaN(i) ? i : Number(i), d: redondear6(d) }));
}

// Registra un movimiento y actualiza el stock calculado en memoria. Quien lo llama debe hacer guardar().
function registrarMovimientoInventario(tipo, lineas, opc) {
  opc = opc || {};
  const validas = agruparLineas(lineas).filter(x => x.d !== 0 && DB.insumos.some(i => String(i.id) === String(x.i)));
  if (!validas.length) return null;
  const lista = leerMovimientos();
  // Un insumo que aún no tiene historial arranca con su stock actual como saldo inicial (antes de aplicar este cambio)
  const con = new Set(); lista.forEach(m => (m.lineas || []).forEach(x => con.add(String(x.i))));
  const iniciales = [];
  validas.forEach(x => {
    if (con.has(String(x.i))) return;
    const ins = DB.insumos.find(i => String(i.id) === String(x.i));
    iniciales.push({ id: "ini_" + x.i, fecha: new Date().toISOString(), tipo: "inicial", lineas: [{ i: x.i, d: redondear6(Number(ins.stock) || 0) }], usuario: "", ref: null, motivo: "Saldo inicial" });
  });
  const s = typeof sesionActual === "function" ? sesionActual() : {};
  const todos = lista.concat(iniciales);
  const mov = { id: nuevoId(todos), fecha: new Date().toISOString(), tipo, lineas: validas, usuario: String(s.nombre || s.username || "").slice(0, 60), ref: opc.ref != null ? opc.ref : null, motivo: String(opc.motivo || "").slice(0, 120) };
  todos.push(mov);
  LS.set(MOV_KEY, todos);
  validas.forEach(x => { const ins = DB.insumos.find(i => String(i.id) === String(x.i)); if (ins) ins.stock = redondear6((Number(ins.stock) || 0) + x.d); });
  return mov;
}

// Stock = suma de movimientos. Solo se recalculan los insumos que ya tienen historial.
function recalcularStock() {
  const suma = new Map();
  leerMovimientos().forEach(m => (m.lineas || []).forEach(x => suma.set(String(x.i), (suma.get(String(x.i)) || 0) + (Number(x.d) || 0))));
  let cambio = false;
  DB.insumos.forEach(i => {
    const k = String(i.id);
    if (!suma.has(k)) return;
    const nuevo = redondear6(suma.get(k));
    if (nuevo !== i.stock) { i.stock = nuevo; cambio = true; }
  });
  return cambio;
}

// Primera vez (o insumos nuevos recibidos sin historial): saldo inicial con id fijo "ini_<id>"
// para que dos dispositivos que migren a la vez generen EL MISMO registro y no se duplique el stock.
function migrarInventarioAMovimientos() {
  const lista = leerMovimientos();
  const con = new Set(); lista.forEach(m => (m.lineas || []).forEach(x => con.add(String(x.i))));
  const nuevos = DB.insumos.filter(i => !con.has(String(i.id))).map(i => ({
    id: "ini_" + i.id, fecha: new Date().toISOString(), tipo: "inicial",
    lineas: [{ i: i.id, d: redondear6(Number(i.stock) || 0) }], usuario: "", ref: null, motivo: "Saldo inicial"
  }));
  if (nuevos.length) LS.set(MOV_KEY, lista.concat(nuevos));
  return nuevos.length;
}

// Tras recibir datos de la nube (o importar un respaldo): el stock se recalcula con todos los movimientos
function alinearInventarioConMovimientos() {
  try {
    migrarInventarioAMovimientos();
    if (recalcularStock()) {
      const previo = typeof syncAplicando !== "undefined" ? syncAplicando : false;
      try { if (typeof syncAplicando !== "undefined") syncAplicando = true; LS.set("insumos", DB.insumos); }
      finally { if (typeof syncAplicando !== "undefined") syncAplicando = previo; }
    }
  } catch (e) { console.warn("Inventario:", e); }
}

// Insumos que hay que devolver al cancelar/eliminar una venta (positivo = devolver).
// Si el movimiento de esa venta aún existe se invierte tal cual; si no, se calcula con la receta actual.
function lineasInsumosDeVenta(venta) {
  const m = leerMovimientos().find(x => x.tipo === "venta" && String(x.ref) === String(venta.id));
  if (m) return (m.lineas || []).map(l => ({ i: l.i, d: -l.d }));
  const lineas = [];
  (venta.items || []).forEach(item => {
    const prod = DB.productos.find(p => String(p.id) === String(item.productoId));
    (prod && Array.isArray(prod.insumos) ? prod.insumos : []).forEach(ing => lineas.push({ i: ing.insumoId, d: (Number(ing.cantidad) || 0) * (Number(item.cantidad) || 0) }));
  });
  return agruparLineas(lineas);
}

// Compactar: los movimientos más viejos se suman en un único registro "base" para que la lista no crezca sin límite
function compactarMovimientos(dias) {
  const limite = Date.now() - (dias || 14) * 864e5;
  const lista = leerMovimientos();
  const viejos = lista.filter(m => m.id !== "base" && new Date(m.fecha).getTime() < limite);
  if (!viejos.length) return 0;
  const base = lista.find(m => m.id === "base") || { id: "base", tipo: "base", lineas: [], usuario: "", ref: null, motivo: "Saldo acumulado" };
  base.fecha = new Date().toISOString();
  base.lineas = agruparLineas((base.lineas || []).concat(...viejos.map(m => m.lineas || [])));
  const quitar = new Set(viejos.map(m => String(m.id)));
  const nueva = [base].concat(lista.filter(m => m.id !== "base" && !quitar.has(String(m.id))));
  window._sinPapelera = true; // es mantenimiento, no borrados del usuario
  try { LS.set(MOV_KEY, nueva); } finally { window._sinPapelera = false; }
  return viejos.length;
}

function eliminarMovimientosDeInsumo(id) {
  const lista = leerMovimientos()
    .map(m => ({ ...m, lineas: (m.lineas || []).filter(x => String(x.i) !== String(id)) }))
    .filter(m => m.lineas.length);
  window._sinPapelera = true;
  try { LS.set(MOV_KEY, lista); } finally { window._sinPapelera = false; }
}

/* ---------- historial de un insumo ---------- */
function verMovimientosInsumo(id) {
  const ins = DB.insumos.find(x => x.id === id); if (!ins) return;
  const filas = leerMovimientos().filter(m => (m.lineas || []).some(x => String(x.i) === String(id)))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 60);
  abrirModal("📜 Movimientos · " + ins.nombre, `
    <p style="font-size:13px;margin-bottom:8px">Stock actual: <b>${ins.stock} ${escapeHTML(ins.unidad)}</b></p>
    <div style="max-height:55vh;overflow-y:auto">
    ${filas.length ? filas.map(m => {
      const d = (m.lineas.find(x => String(x.i) === String(id)) || {}).d || 0;
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--borde,#e2e8f0);font-size:13px">
        <div><b>${escapeHTML(MOV_TIPOS[m.tipo] || m.tipo)}</b>${m.ref != null && m.tipo !== "inicial" ? ` · #${escapeHTML(String(m.ref))}` : ""}
          <div style="font-size:12px;color:var(--texto-suave,#64748b)">${new Date(m.fecha).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}${m.usuario ? " · " + escapeHTML(m.usuario) : ""}${m.motivo ? " · " + escapeHTML(m.motivo) : ""}</div></div>
        <b style="color:${d < 0 ? "#dc2626" : "#16a34a"};white-space:nowrap">${d > 0 ? "+" : ""}${d} ${escapeHTML(ins.unidad)}</b></div>`;
    }).join("") : `<p style="color:var(--texto-suave,#64748b);font-size:13px">Sin movimientos registrados.</p>`}
    </div>
    <div class="acciones"><button class="btn-secondary" onclick="cerrarModal()">Cerrar</button></div>`);
}

// Antes de que arranque la sincronización: dejar el inventario en el nuevo formato y coherente
document.addEventListener("DOMContentLoaded", () => { alinearInventarioConMovimientos(); });
