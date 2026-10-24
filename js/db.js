/* ============================================
   DB.JS — DATOS: LOCALSTORAGE, DB, GUARDAR Y SEED
   ============================================ */

/* ============ DATOS ============ */
const LS = {
  get: (k, def) => {
    let v = null;
    try { v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); }
    catch (e) {
      console.warn("Dato dañado:", k);
      // Conservar el valor original: si la app guarda encima, ya no habría forma de recuperarlo
      try { if (v !== null && localStorage.getItem(k + "__danado") === null) localStorage.setItem(k + "__danado", v); } catch (_) {}
      return def;
    }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("⚠️ No se pudo guardar: almacenamiento lleno"); } }
};

let DB = {
  productos: LS.get("productos", []),
  insumos: LS.get("insumos", []),
  ventas: LS.get("ventas", []),
  gastos: LS.get("gastos", []),
  usuarios: LS.get("usuarios", []),
  negocio: LS.get("negocio", { nombre: "POS PyMes", slogan: "Sistema de venta", direccion: "", telefono: "" })
};

function guardar() {
  LS.set("productos", DB.productos);
  LS.set("insumos", DB.insumos);
  LS.set("ventas", DB.ventas);
  LS.set("gastos", DB.gastos);
  LS.set("usuarios", DB.usuarios);
  LS.set("negocio", DB.negocio);
}

function nuevoId(arr) {
  const max = arr.length ? Math.max(...arr.map(x => x.id)) : 0;
  const slot = typeof SYNC_SLOT !== "undefined" ? SYNC_SLOT : 0;
  if (!slot) return max + 1;                     // sin sincronización: consecutivo, como siempre
  return Math.floor(max / 10) * 10 + 10 + slot;  // con varios dispositivos: cada uno usa su terminación (1-9) y nunca chocan
}

/* ============ SEED LIMPIO ============ */
function seed() {
  if (DB.usuarios.length) return;
  DB.usuarios = [{ id: 1, username: "admin", password: "admin123", rol: "admin", nombre: "Administrador", cambiarPass: true }];
  guardar();
}
