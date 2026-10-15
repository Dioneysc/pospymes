/* ============================================
   DB.JS — DATOS: LOCALSTORAGE, DB, GUARDAR Y SEED
   ============================================ */

/* ============ DATOS ============ */
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { console.warn("Dato dañado:", k); return def; } },
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
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

/* ============ SEED LIMPIO ============ */
function seed() {
  if (DB.usuarios.length) return;
  DB.usuarios = [{ id: 1, username: "admin", password: "admin123", rol: "admin", nombre: "Administrador" }];
  guardar();
}
