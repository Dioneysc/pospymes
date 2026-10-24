/* ============================================
   PAPELERA.JS — Registros eliminados, recuperables 30 días
   Captura los borrados de cualquier colección sincronizable (ventas, productos,
   insumos, gastos, usuarios, cortes, preventas...) enganchándose a LS.set, de modo
   que funciona igual desde historial, inventario, importar respaldo, etc.
   La papelera es local a cada dispositivo y no se sincroniza.
   Debe cargarse DESPUÉS de sync.js (usa SYNC_COLS, leer y syncAplicando).
   ============================================ */
const PAPELERA_KEY = "papelera";
const PAPELERA_MAX = 500;
const PAPELERA_DIAS = 30;
const papeleraPrev = {}; // colección -> Map(id -> registro) tal como se guardó por última vez

function papeleraLocal() {
  const lista = LS.get(PAPELERA_KEY, []);
  const limite = Date.now() - PAPELERA_DIAS * 86400000;
  return (Array.isArray(lista) ? lista : []).filter(x => x && (Number(x.eliminadoEn) || 0) >= limite);
}

function papeleraAgregar(col, registros) {
  const ahora = Date.now();
  const lista = papeleraLocal();
  registros.forEach((reg, i) => lista.push({
    clave: `${col}:${reg.id}:${ahora}:${i}`,
    coleccion: col,
    id: reg.id,
    registro: JSON.parse(JSON.stringify(reg)),
    eliminadoEn: ahora
  }));
  const recientes = lista.length > PAPELERA_MAX
    ? lista.sort((a, b) => b.eliminadoEn - a.eliminadoEn).slice(0, PAPELERA_MAX)
    : lista;
  LS.set(PAPELERA_KEY, recientes);
}

// Compara la lista que se va a guardar con la anterior; lo que desapareció va a la papelera.
function papeleraObservar(col, nueva) {
  if (!papeleraPrev[col]) {
    let anterior = [];
    try { anterior = JSON.parse(localStorage.getItem(col) || "[]"); } catch (_) {}
    papeleraPrev[col] = new Map((Array.isArray(anterior) ? anterior : []).map(r => [String(r && r.id), r]));
  }
  const ahora = new Map(nueva.map(r => [String(r && r.id), r]));
  // Los cambios que llegan de la nube (syncAplicando) no se envían a la papelera local
  if (!(typeof syncAplicando !== "undefined" && syncAplicando)) {
    const borrados = [];
    papeleraPrev[col].forEach((reg, id) => { if (reg && !ahora.has(id)) borrados.push(reg); });
    if (borrados.length) papeleraAgregar(col, borrados);
  }
  papeleraPrev[col] = ahora;
}

(function enganchar() {
  const lsSetPrevio = LS.set;
  LS.set = (k, v) => {
    if (typeof SYNC_COLS !== "undefined" && SYNC_COLS.includes(k) && Array.isArray(v)) {
      try { papeleraObservar(k, v); } catch (e) { console.warn("Papelera:", e); }
    }
    lsSetPrevio(k, v);
  };
})();

function restaurarDePapelera(clave) {
  const lista = papeleraLocal();
  const item = lista.find(x => x.clave === clave);
  if (!item || typeof SYNC_COLS === "undefined" || !SYNC_COLS.includes(item.coleccion)) return false;
  const col = item.coleccion;
  const reg = JSON.parse(JSON.stringify(item.registro));
  const enDB = Array.isArray(DB[col]);
  const actual = enDB ? DB[col] : LS.get(col, []);
  if (actual.some(r => String(r.id) === String(reg.id))) reg.id = nuevoId(actual); // el id se reutilizó: evitar pisar el registro nuevo
  actual.push(reg);
  if (enDB) guardar(); else LS.set(col, actual);
  LS.set(PAPELERA_KEY, lista.filter(x => x.clave !== clave));
  if (typeof refrescarUI === "function") refrescarUI();
  return true;
}

/* ============ PANTALLA ============ */
function escaparPapelera(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function fechaPapelera(v) {
  const n = Number(v); const d = new Date(Number.isFinite(n) ? n : v);
  return Number.isNaN(d.getTime()) ? "Fecha desconocida" : d.toLocaleString();
}
function renderPapelera() {
  const resumen = document.getElementById("papeleraResumen");
  const cont = document.getElementById("listaPapelera");
  if (!resumen || !cont) return;
  const items = papeleraLocal().sort((a, b) => (Number(b.eliminadoEn) || 0) - (Number(a.eliminadoEn) || 0));
  resumen.innerHTML = `<strong>${items.length}</strong> registro${items.length === 1 ? "" : "s"} en la papelera de este dispositivo`;
  if (!items.length) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--texto-secundario,#64748b)">✨ La papelera está vacía.</div>';
    return;
  }
  cont.innerHTML = items.slice(0, 100).map(item => {
    const reg = item.registro || {};
    const nombre = reg.nombre || reg.username || reg.producto || reg.concepto || reg.categoria || reg.cliente
      || (item.coleccion === "ventas" ? `Venta #${item.id}` : `${item.coleccion} #${item.id}`);
    const detalle = reg.total != null ? ` · Total: $${Number(reg.total).toFixed(2)}` : (reg.monto != null ? ` · Monto: $${Number(reg.monto).toFixed(2)}` : "");
    return `<article style="padding:12px;margin:8px 0;border:1px solid var(--borde,#e2e8f0);border-radius:12px;background:var(--superficie,#fff);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div style="min-width:0;flex:1"><strong>${escaparPapelera(nombre)}</strong><div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:4px">${escaparPapelera(item.coleccion)} · ID ${escaparPapelera(item.id)}${escaparPapelera(detalle)}</div><div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:3px">Eliminado: ${escaparPapelera(fechaPapelera(item.eliminadoEn))}</div></div>
      <button class="btn-primary" type="button" onclick="confirmarRestaurarPapelera('${escaparPapelera(item.clave)}')">↩ Restaurar</button>
    </article>`;
  }).join("") + (items.length > 100 ? `<p class="hint" style="text-align:center">Se muestran los 100 más recientes de ${items.length}.</p>` : "");
}
function confirmarRestaurarPapelera(clave) {
  const item = papeleraLocal().find(x => x.clave === clave);
  if (!item) { renderPapelera(); return toast("El registro ya no está en la papelera"); }
  if (!confirm(`¿Restaurar el registro ${item.coleccion} #${item.id}?`)) return;
  if (restaurarDePapelera(clave)) { renderPapelera(); toast("↩ Registro restaurado"); }
  else toast("⚠️ No se pudo restaurar este registro");
}
function vaciarPapelera() {
  if (!papeleraLocal().length) return toast("La papelera ya está vacía");
  if (!confirm("¿Vaciar la papelera? Los registros eliminados ya no se podrán recuperar.")) return;
  LS.set(PAPELERA_KEY, []);
  renderPapelera();
  toast("🗑️ Papelera vaciada");
}
window.renderPapelera = renderPapelera;
window.confirmarRestaurarPapelera = confirmarRestaurarPapelera;
window.vaciarPapelera = vaciarPapelera;
