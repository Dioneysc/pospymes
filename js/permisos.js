/* PERMISOS LOCALES v96 — roles de interfaz y asignación inicial de sucursal.
   IMPORTANTE: los permisos de cliente NO sustituyen reglas de seguridad de Firebase.
*/
const ROLES_POS = {
  admin: { nombre: "Administración", vistas: ["caja","inventario","corte","reportes","preventas","pendientes","historial","productos","gastos","papelera","config"] },
  caja: { nombre: "Caja", vistas: ["caja","corte","preventas","pendientes","historial"] }
};
function sesionPOS() {
  try { return JSON.parse(sessionStorage.getItem("sesion") || "{}"); } catch (_) { return {}; }
}
function rolActualPOS() {
  const s = sesionPOS();
  if (s.rol === "admin" || s.username === "admin") return "admin";
  return s.rol === "caja" ? "caja" : "caja";
}
function esAdminPOS() { return rolActualPOS() === "admin"; }
function permisoVistaPOS(vista) {
  const cfg = ROLES_POS[rolActualPOS()] || ROLES_POS.caja;
  return cfg.vistas.includes(vista);
}
function exigirAdminPOS(accion) {
  if (esAdminPOS()) return true;
  toast("🔒 Solo Administración puede acceder a " + (accion || "esta función"));
  return false;
}
function normalizarUsuarioPOS(u) {
  if (!u.rol) u.rol = u.username === "admin" ? "admin" : "caja";
  if (!u.sucursalId) u.sucursalId = "principal";
  return u;
}
function abrirUsuariosPermisosPOS() {
  if (!exigirAdminPOS("Usuarios y permisos")) return;
  DB.usuarios.forEach(normalizarUsuarioPOS);
  const filas = DB.usuarios.map(u => `<div style="border:1px solid var(--borde,#e2e8f0);border-radius:10px;padding:12px;margin:8px 0">
    <strong>${escaparPermisoPOS(u.nombre || u.username || ("Usuario " + u.id))}</strong><div style="font-size:12px;color:var(--texto-secundario,#64748b)">${escaparPermisoPOS(u.username || "")}</div>
    <label style="display:block;margin-top:8px">Rol</label><select id="rolPOS_${String(u.id).replace(/[^a-zA-Z0-9_-]/g,'_')}" ${u.username === "admin" ? "disabled" : ""}>
      <option value="admin" ${u.rol === "admin" ? "selected" : ""}>Administración</option><option value="caja" ${u.rol !== "admin" ? "selected" : ""}>Caja</option></select>
    <label style="display:block;margin-top:8px">Sucursal asignada</label><select id="sucPOS_${String(u.id).replace(/[^a-zA-Z0-9_-]/g,'_')}" ${u.username === "admin" ? "disabled" : ""}>${opcionesSucursalesPermisoPOS(u.sucursalId || "principal")}</select>
  </div>`).join("");
  abrirModal("👥 Usuarios y permisos", `<p style="font-size:13px;color:var(--texto-secundario,#64748b)">Define qué secciones muestra cada usuario y su sucursal asignada. La sucursal es una etiqueta preparatoria; el aislamiento real de datos y la seguridad del servidor aún requieren implementación y pruebas.</p>${filas || "<p>No hay usuarios registrados.</p>"}<div class="acciones"><button class="btn-primary" onclick="guardarUsuariosPermisosPOS()">Guardar cambios</button></div>`);
}
function escaparPermisoPOS(v) { return String(v == null ? "" : v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function opcionesSucursalesPermisoPOS(actual) {
  const lista = typeof leerSucursalesPOS === "function" ? leerSucursalesPOS() : LS.get("sucursalesPOS", [{id:"principal",nombre:"Sucursal principal",activa:true}]);
  const activas = (Array.isArray(lista) ? lista : []).filter(s => s && (s.activa || s.id === actual));
  if (!activas.some(s => s.id === "principal")) activas.unshift({id:"principal",nombre:"Sucursal principal",activa:true});
  if (actual && !activas.some(s => String(s.id) === String(actual))) activas.push({id:actual,nombre:`${actual} (asignación anterior)`,activa:false});
  return activas.map(s => `<option value="${escaparPermisoPOS(s.id)}" ${String(s.id) === String(actual) ? "selected" : ""}>${escaparPermisoPOS(s.nombre)}${s.activa ? "" : " (inactiva)"}</option>`).join("");
}
function guardarUsuariosPermisosPOS() {
  if (!exigirAdminPOS("guardar permisos")) return;
  const catalogo = typeof leerSucursalesPOS === "function" ? leerSucursalesPOS() : LS.get("sucursalesPOS", [{id:"principal",nombre:"Sucursal principal",activa:true}]);
  for (const u of DB.usuarios) {
    if (u.username === "admin") continue;
    const id = String(u.id).replace(/[^a-zA-Z0-9_-]/g,'_');
    const suc = document.getElementById("sucPOS_"+id);
    if (!suc) continue;
    const elegido = suc.value.trim() || "principal";
    const registro = (Array.isArray(catalogo) ? catalogo : []).find(x => String(x.id) === elegido);
    if (!registro || (!registro.activa && elegido !== (u.sucursalId || "principal"))) {
      toast("⚠️ La sucursal seleccionada no existe o está inactiva: " + elegido);
      return;
    }
  }
  DB.usuarios.forEach(u => {
    normalizarUsuarioPOS(u);
    if (u.username === "admin") { u.rol = "admin"; u.sucursalId = "principal"; return; }
    const id = String(u.id).replace(/[^a-zA-Z0-9_-]/g,'_');
    const rol = document.getElementById("rolPOS_"+id);
    const suc = document.getElementById("sucPOS_"+id);
    if (rol && ["admin","caja"].includes(rol.value)) u.rol = rol.value;
    if (suc) {
      const elegido = suc.value.trim() || "principal";
      u.sucursalId = elegido;
    }
  });
  guardar();
  const s = sesionPOS();
  const actualizado = DB.usuarios.find(u => String(u.id) === String(s.id));
  if (actualizado) sessionStorage.setItem("sesion", JSON.stringify({...actualizado,password:undefined,hash:undefined,salt:undefined,iter:undefined}));
  cerrarModal(); aplicarPermisosPOS(); toast("✅ Roles y sucursales guardados en este dispositivo");
  if (typeof programarSync === "function") programarSync();
}
function aplicarPermisosPOS() {
  const nav = document.querySelector(".nav-inferior");
  if (nav) nav.querySelectorAll("button[data-view]").forEach(b => { b.style.display = permisoVistaPOS(b.dataset.view) ? "" : "none"; });
  const configBtn = document.querySelector(".topbar button[onclick='irConfig()']");
  if (configBtn) configBtn.style.display = permisoVistaPOS("config") ? "" : "none";
}
window.abrirUsuariosPermisosPOS = abrirUsuariosPermisosPOS;
window.guardarUsuariosPermisosPOS = guardarUsuariosPermisosPOS;
window.aplicarPermisosPOS = aplicarPermisosPOS;
window.permisoVistaPOS = permisoVistaPOS;
window.exigirAdminPOS = exigirAdminPOS;
