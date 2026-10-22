/* PAPELERA VISUAL — v95. Restauración disponible para registros sincronizables. */
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
  const items = typeof papeleraLocal === "function" ? papeleraLocal().slice().sort((a,b)=>(Number(b.eliminadoEn)||0)-(Number(a.eliminadoEn)||0)) : [];
  resumen.innerHTML = `<strong>${items.length}</strong> registro${items.length===1?"":"s"} en la papelera de este dispositivo`;
  if (!items.length) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--texto-secundario,#64748b)">✨ La papelera está vacía.</div>';
    return;
  }
  cont.innerHTML = items.map(item => {
    const reg = item.registro || {};
    const nombre = reg.nombre || reg.producto || reg.concepto || reg.cliente || (item.coleccion === "ventas" ? `Venta #${item.id}` : `${item.coleccion} #${item.id}`);
    const detalle = reg.total != null ? ` · Total: $${Number(reg.total).toFixed(2)}` : "";
    const restaurable = typeof SYNC_COLS !== "undefined" && SYNC_COLS.includes(item.coleccion);
    return `<article style="padding:12px;margin:8px 0;border:1px solid var(--borde,#e2e8f0);border-radius:12px;background:var(--superficie,#fff);display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div style="min-width:0;flex:1"><strong>${escaparPapelera(nombre)}</strong><div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:4px">${escaparPapelera(item.coleccion)} · ID ${escaparPapelera(item.id)}${escaparPapelera(detalle)}</div><div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:3px">Eliminado: ${escaparPapelera(fechaPapelera(item.eliminadoEn))}</div></div>
      ${restaurable ? `<button class="btn-primary" type="button" onclick="confirmarRestaurarPapelera('${escaparPapelera(item.clave)}')">↩ Restaurar</button>` : '<span class="hint">Solo consulta</span>'}
    </article>`;
  }).join("");
}
function confirmarRestaurarPapelera(clave) {
  if (typeof restaurarDePapelera !== "function") return toast("⚠️ La restauración no está disponible");
  const item = (typeof papeleraLocal === "function" ? papeleraLocal() : []).find(x => x.clave === clave);
  if (!item) { renderPapelera(); return toast("El registro ya no está en la papelera"); }
  if (!confirm(`¿Restaurar el registro ${item.coleccion} #${item.id}?`)) return;
  const ok = restaurarDePapelera(clave);
  if (ok) { renderPapelera(); toast("↩ Registro restaurado localmente. La sincronización se intentará cuando haya conexión."); }
  else toast("⚠️ No se pudo restaurar este registro");
}
window.renderPapelera = renderPapelera;
window.confirmarRestaurarPapelera = confirmarRestaurarPapelera;
