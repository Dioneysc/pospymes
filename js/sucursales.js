/* Catálogo inicial de sucursales v97. Es una base de configuración sincronizable;
   todavía no aplica aislamiento de datos por sucursal en Firestore. */
(function () {
  const KEY = "sucursalesPOS";
  const defecto = [{ id: "principal", nombre: "Sucursal principal", activa: true }];
  const leerSucursales = () => {
    let a = LS.get(KEY, defecto);
    if (!Array.isArray(a) || !a.length) a = defecto;
    if (!a.some(x => x.id === "principal")) a.unshift(defecto[0]);
    return a;
  };
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function abrirSucursalesPOS() {
    if (typeof exigirAdminPOS === "function" && !exigirAdminPOS("Sucursales")) return;
    const rows = leerSucursales().map((s, i) => `<div style="display:grid;grid-template-columns:minmax(90px,1fr) minmax(130px,2fr) auto;gap:8px;align-items:center;margin:8px 0;padding:10px;border:1px solid var(--borde,#ddd);border-radius:9px">
      <code>${esc(s.id)}</code><input id="sucNom_${i}" value="${esc(s.nombre)}" maxlength="60" aria-label="Nombre de sucursal" ${s.id === "principal" ? "disabled" : ""}>
      <label style="font-size:12px;white-space:nowrap"><input id="sucAct_${i}" type="checkbox" ${s.activa ? "checked" : ""} ${s.id === "principal" ? "disabled" : ""}> Activa</label></div>`).join("");
    abrirModal("🏬 Catálogo de sucursales", `<p style="font-size:13px;color:var(--texto-secundario,#64748b)">Administra los nombres e identificadores de sucursal. Esta etapa identifica los registros con sucursalId. Aún no aplica aislamiento de lectura/escritura por sucursal en Firebase.</p>${rows}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><input id="sucNuevaId" maxlength="24" placeholder="ID (ej. centro)" style="min-width:100px;flex:1"><input id="sucNuevaNombre" maxlength="60" placeholder="Nombre de sucursal" style="min-width:140px;flex:2"><button class="btn-secondary" onclick="agregarSucursalPOS()">Agregar</button></div><div class="acciones"><button class="btn-secondary" onclick="ejecutarMigracionSucursalPOS()">Identificar datos antiguos</button><button class="btn-primary" onclick="guardarCatalogoSucursalesPOS()">Guardar cambios</button></div>`);
  }
  function guardarCatalogoSucursalesPOS() {
    if (typeof exigirAdminPOS === "function" && !exigirAdminPOS("guardar sucursales")) return;
    const a = leerSucursales().map((s, i) => ({...s, nombre: document.getElementById("sucNom_"+i)?.value.trim() || s.nombre, activa: s.id === "principal" ? true : !!document.getElementById("sucAct_"+i)?.checked}));
    LS.set(KEY, a); if (typeof programarSync === "function") programarSync();
    cerrarModal(); toast("✅ Catálogo de sucursales guardado. Aún falta activar el aislamiento de datos.");
  }
  function agregarSucursalPOS() {
    if (typeof exigirAdminPOS === "function" && !exigirAdminPOS("agregar sucursal")) return;
    const id = (document.getElementById("sucNuevaId")?.value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g,"-");
    const nombre = (document.getElementById("sucNuevaNombre")?.value || "").trim();
    if (!id || id === "principal" || !nombre) return toast("⚠️ Escribe un ID válido y el nombre de la sucursal.");
    const a = leerSucursales(); if (a.some(s => s.id === id)) return toast("⚠️ Ese ID ya existe.");
    a.push({id, nombre, activa:true}); LS.set(KEY,a); if (typeof programarSync === "function") programarSync();
    abrirSucursalesPOS(); toast("✅ Sucursal agregada al catálogo.");
  }
  window.leerSucursalesPOS = leerSucursales;
  window.abrirSucursalesPOS = abrirSucursalesPOS;
  window.guardarCatalogoSucursalesPOS = guardarCatalogoSucursalesPOS;
  window.agregarSucursalPOS = agregarSucursalPOS;
})();


/* v99: metadatos de sucursal para preparar una migración segura.
   No cambia la sucursal activa ni filtra datos; cada registro antiguo se identifica
   como principal para evitar asignaciones silenciosas a una sucursal equivocada. */
(function () {
  const CLAVE_ACTIVA = "sucursalActivaPOS";
  function sucursalActivaPOS() {
    const id = String(LS.get(CLAVE_ACTIVA, "principal") || "principal");
    const s = (window.leerSucursalesPOS ? window.leerSucursalesPOS() : []).find(x => x.id === id && x.activa);
    return s ? s.id : "principal";
  }
  function asignarSucursalRegistroPOS(registro, idSucursal) {
    if (!registro || typeof registro !== "object" || Array.isArray(registro)) return registro;
    return { ...registro, sucursalId: String(registro.sucursalId || idSucursal || "principal") };
  }
  function migrarRegistrosSucursalPOS(claves) {
    const resultado = { revisados: 0, etiquetados: 0 };
    (claves || ["productos", "insumos", "ventas", "gastos", "usuarios", "cortes", "preventasPendientes", "gastosPersonales", "cajaFuerteMovimientos"]).forEach(k => {
      const lista = LS.get(k, []);
      if (!Array.isArray(lista)) return;
      let cambio = false;
      const nueva = lista.map(r => {
        resultado.revisados++;
        if (r && typeof r === "object" && !r.sucursalId) {
          resultado.etiquetados++; cambio = true;
          return asignarSucursalRegistroPOS(r, "principal");
        }
        return r;
      });
      if (cambio) LS.set(k, nueva);
    });
    return resultado;
  }
  window.sucursalActivaPOS = sucursalActivaPOS;
  window.asignarSucursalRegistroPOS = asignarSucursalRegistroPOS;
  window.migrarRegistrosSucursalPOS = migrarRegistrosSucursalPOS;
})();

function ejecutarMigracionSucursalPOS() {
  if (typeof exigirAdminPOS === "function" && !exigirAdminPOS("identificar datos por sucursal")) return;
  if (!confirm("Los registros antiguos sin sucursal se marcarán como Sucursal principal. No se moverán ventas ni se activará todavía el aislamiento en Firebase. ¿Continuar?")) return;
  const r = window.migrarRegistrosSucursalPOS ? window.migrarRegistrosSucursalPOS() : {revisados:0, etiquetados:0};
  if (typeof programarSync === "function") programarSync();
  toast(`✅ Revisados: ${r.revisados}. Identificados como principal: ${r.etiquetados}. La separación segura requiere reglas Firebase y pruebas adicionales.`);
}


/* v102: alcance operativo por sucursal en caja e inventario.
   Esto es un filtro de interfaz/local; no sustituye reglas de seguridad de Firestore. */
(function () {
  function sucursalOperacionPOS() {
    try {
      const sesion = JSON.parse(sessionStorage.getItem("sesion") || "{}");
      // Caja queda ligada a su sucursal asignada. Administración opera la sucursal
      // seleccionada localmente (por defecto, la principal).
      if (sesion.rol !== "admin" && sesion.username !== "admin") return String(sesion.sucursalId || "principal");
    } catch (_) {}
    return typeof sucursalActivaPOS === "function" ? sucursalActivaPOS() : "principal";
  }
  function registrosSucursalOperacionPOS(lista) {
    const id = sucursalOperacionPOS();
    return (Array.isArray(lista) ? lista : []).filter(r => String((r && r.sucursalId) || "principal") === id);
  }
  window.sucursalOperacionPOS = sucursalOperacionPOS;
  window.registrosSucursalOperacionPOS = registrosSucursalOperacionPOS;
})();


/* v103: estado de caja aislado por sucursal en almacenamiento local.
   La sincronización envía el mapa cajaHoyPorSucursal como una configuración común.
   No sustituye las reglas de autorización de Firestore. */
(function () {
  const estadoVacio = () => ({ fecha: typeof hoy === "function" ? hoy() : new Date().toISOString().slice(0,10), fondoInicial: null, retiros: [], depositos: [] });
  function cargarEstadoCajaSucursalPOS() {
    const id = typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal";
    const mapa = LS.get("cajaHoyPorSucursal", {});
    const guardado = mapa && mapa[id];
    const actual = guardado && typeof guardado === "object" ? guardado : LS.get("cajaHoy", estadoVacio());
    estadoCajaHoy = actual && typeof actual === "object" ? actual : estadoVacio();
    LS.set("cajaHoy", estadoCajaHoy);
    return estadoCajaHoy;
  }
  window.cargarEstadoCajaSucursalPOS = cargarEstadoCajaSucursalPOS;
})();
