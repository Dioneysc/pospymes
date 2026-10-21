/* PENDIENTES.JS — Compras y tareas locales a este dispositivo. */
const PENDIENTES_KEY = "pos_polleria_pendientes_v1";
function leerPendientes() {
  try {
    const datos = JSON.parse(localStorage.getItem(PENDIENTES_KEY) || "[]");
    return Array.isArray(datos) ? datos : [];
  } catch (_) { return []; }
}
function guardarPendientes(datos) {
  try { localStorage.setItem(PENDIENTES_KEY, JSON.stringify(datos)); return true; }
  catch (_) { toast("⚠️ No se pudo guardar la lista en este dispositivo"); return false; }
}
function renderPendientes() {
  const cont = document.getElementById("listaPendientes");
  if (!cont) return;
  const todos = leerPendientes();
  const abiertos = todos.filter(x => !x.completado);
  const resumen = document.getElementById("resumenPendientes");
  if (resumen) resumen.innerHTML = `
    <div class="card-config" style="flex:1;min-width:110px;padding:12px"><small>Pendientes</small><div style="font-size:24px;font-weight:800">${abiertos.length}</div></div>
    <div class="card-config" style="flex:1;min-width:110px;padding:12px"><small>Compras abiertas</small><div style="font-size:24px;font-weight:800">${abiertos.filter(x=>x.tipo==="compra").length}</div></div>
    <div class="card-config" style="flex:1;min-width:110px;padding:12px"><small>Completados</small><div style="font-size:24px;font-weight:800">${todos.filter(x=>x.completado).length}</div></div>`;
  const filtro = document.getElementById("filtroPendientes")?.value || "abiertos";
  const buscar = (document.getElementById("buscarPendiente")?.value || "").trim().toLocaleLowerCase("es");
  let lista = todos.filter(x => {
    if (filtro === "abiertos" && x.completado) return false;
    if (filtro === "hechos" && !x.completado) return false;
    if (filtro === "compras" && x.tipo !== "compra") return false;
    if (filtro === "tareas" && x.tipo !== "tarea") return false;
    return !buscar || `${x.nombre} ${x.detalle || ""} ${x.categoria || ""}`.toLocaleLowerCase("es").includes(buscar);
  }).sort((a,b) => Number(a.completado)-Number(b.completado) || (a.fechaLimite || "9999").localeCompare(b.fechaLimite || "9999") || b.actualizado-a.actualizado);
  if (!lista.length) {
    cont.innerHTML = '<div class="card-config" style="text-align:center;padding:24px;color:var(--texto-secundario,#64748b)">No hay elementos en esta lista. Pulsa <b>+ Agregar</b> para comenzar.</div>';
    return;
  }
  cont.innerHTML = lista.map(x => `<article class="card-config" style="margin-bottom:10px;padding:14px;${x.completado?'opacity:.68':''}">
    <div style="display:flex;align-items:flex-start;gap:10px">
      <input type="checkbox" aria-label="Marcar completado" ${x.completado?'checked':''} onchange="alternarPendiente('${x.id}',this.checked)" style="width:22px;height:22px;flex-shrink:0;margin-top:3px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;${x.completado?'text-decoration:line-through':''}">${escapeHTML(x.nombre)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><span class="badge">${x.tipo==='compra'?'🛒 Compra':'📌 Tarea'}</span>${x.categoria?`<span class="badge">${escapeHTML(x.categoria)}</span>`:''}${x.prioridad==='alta'?'<span class="badge" style="background:#fee2e2;color:#991b1b">Prioridad alta</span>':''}</div>
        ${x.detalle?`<div style="font-size:13px;color:var(--texto-secundario,#64748b);white-space:pre-wrap">${escapeHTML(x.detalle)}</div>`:''}
        <div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:5px">${x.cantidad?`Cantidad: ${escapeHTML(x.cantidad)}`:''}${x.fechaLimite?`${x.cantidad?' · ':''}Fecha: ${escapeHTML(x.fechaLimite)}`:''}</div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0"><button class="btn-secondary" type="button" onclick="abrirFormPendiente('${x.id}')" aria-label="Editar">✏️</button><button class="btn-danger" type="button" onclick="eliminarPendiente('${x.id}')" aria-label="Eliminar">🗑️</button></div>
    </div></article>`).join("");
}
function abrirFormPendiente(id) {
  const actual = id ? leerPendientes().find(x=>x.id===id) : null;
  const x = actual || {tipo:"compra",nombre:"",cantidad:"",categoria:"",detalle:"",prioridad:"normal",fechaLimite:""};
  abrirModal(actual ? "Editar pendiente" : "Agregar compra o pendiente", `
    <form onsubmit="event.preventDefault();guardarPendienteFormulario('${actual?actual.id:""}')">
      <label style="display:block;font-weight:700;margin:8px 0 5px">Tipo</label><select id="pendTipo" style="width:100%;padding:11px;border:1px solid var(--borde);border-radius:10px"><option value="compra" ${x.tipo==='compra'?'selected':''}>Compra</option><option value="tarea" ${x.tipo==='tarea'?'selected':''}>Pendiente / tarea</option></select>
      <label style="display:block;font-weight:700;margin:10px 0 5px">Nombre *</label><input id="pendNombre" required maxlength="100" value="${escapeHTML(x.nombre)}" placeholder="Ej. Pollo, carbón, bolsas" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--borde);border-radius:10px">
      <label style="display:block;font-weight:700;margin:10px 0 5px">Cantidad y unidad</label><input id="pendCantidad" maxlength="60" value="${escapeHTML(x.cantidad)}" placeholder="Ej. 20 kg, 2 sacos" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--borde);border-radius:10px">
      <label style="display:block;font-weight:700;margin:10px 0 5px">Categoría</label><input id="pendCategoria" maxlength="60" value="${escapeHTML(x.categoria)}" placeholder="Ej. Pollo, empaque, limpieza" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--borde);border-radius:10px">
      <label style="display:block;font-weight:700;margin:10px 0 5px">Prioridad</label><select id="pendPrioridad" style="width:100%;padding:11px;border:1px solid var(--borde);border-radius:10px"><option value="normal" ${x.prioridad==='normal'?'selected':''}>Normal</option><option value="alta" ${x.prioridad==='alta'?'selected':''}>Alta</option></select>
      <label style="display:block;font-weight:700;margin:10px 0 5px">Fecha límite (opcional)</label><input id="pendFecha" type="date" value="${escapeHTML(x.fechaLimite)}" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--borde);border-radius:10px">
      <label style="display:block;font-weight:700;margin:10px 0 5px">Notas (opcional)</label><textarea id="pendDetalle" maxlength="300" rows="2" placeholder="Detalles adicionales" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--borde);border-radius:10px">${escapeHTML(x.detalle)}</textarea>
      <div class="acciones"><button class="btn-secondary" type="button" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" type="submit">Guardar</button></div>
    </form>`);
}
function guardarPendienteFormulario(id) {
  const nombre = document.getElementById("pendNombre")?.value.trim();
  if (!nombre) return toast("Escribe un nombre para el elemento");
  const datos = leerPendientes();
  const anterior = datos.find(x=>x.id===id);
  const item = {id:id || (Date.now().toString(36)+Math.random().toString(36).slice(2,7)),tipo:document.getElementById("pendTipo").value,nombre,cantidad:document.getElementById("pendCantidad").value.trim(),categoria:document.getElementById("pendCategoria").value.trim(),prioridad:document.getElementById("pendPrioridad").value,fechaLimite:document.getElementById("pendFecha").value,detalle:document.getElementById("pendDetalle").value.trim(),completado:anterior?.completado || false,creado:anterior?.creado || Date.now(),actualizado:Date.now()};
  const siguiente = anterior ? datos.map(x=>x.id===id?item:x) : [item,...datos];
  if (guardarPendientes(siguiente)) { cerrarModal(); renderPendientes(); toast("✅ Guardado en este dispositivo"); }
}
function alternarPendiente(id, completado) {
  const datos=leerPendientes().map(x=>x.id===id?{...x,completado,actualizado:Date.now()}:x);
  if (guardarPendientes(datos)) renderPendientes();
}
function eliminarPendiente(id) {
  if (!confirm("¿Eliminar este elemento de la lista?")) return;
  if (guardarPendientes(leerPendientes().filter(x=>x.id!==id))) { renderPendientes(); toast("Elemento eliminado"); }
}
