/* ============================================
   DB.JS — DATOS: LOCALSTORAGE, DB Y GUARDAR
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
  set: (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      if (window._almacenamientoLleno) { window._almacenamientoLleno = false; if (typeof avisoAlmacenamiento === "function") avisoAlmacenamiento(false); }
    } catch (e) {
      window._almacenamientoLleno = true; // aviso permanente hasta que vuelva a guardarse algo
      toast("⚠️ No se pudo guardar: almacenamiento lleno");
      if (typeof avisoAlmacenamiento === "function") avisoAlmacenamiento(true);
    }
  }
};

let DB = {
  productos: LS.get("productos", []),
  insumos: LS.get("insumos", []),
  ventas: LS.get("ventas", []),
  gastos: LS.get("gastos", []),
  usuarios: LS.get("usuarios", []),
  negocio: LS.get("negocio", { nombre: "POS PyMes", slogan: "Sistema de venta", direccion: "", telefono: "" })
};

// Sin argumentos guarda todo (como siempre). Con nombres, guarda solo esas colecciones:
// guardar("ventas", "insumos") evita reescribir productos, usuarios, etc. en cada venta.
const DB_CLAVES = ["productos", "insumos", "ventas", "gastos", "usuarios", "negocio"];
function guardar(...claves) {
  const lista = claves.length ? claves.filter(k => DB_CLAVES.includes(k)) : DB_CLAVES;
  lista.forEach(k => LS.set(k, DB[k]));
}

function nuevoId(arr) {
  const max = arr.reduce((m, x) => Math.max(m, Number(x && x.id) || 0), 0); // reduce: evita el límite de argumentos de Math.max(...)
  const slot = typeof SYNC_SLOT !== "undefined" ? SYNC_SLOT : 0;
  if (!slot) return max + 1;                     // sin sincronización: consecutivo, como siempre
  return Math.floor(max / 10) * 10 + 10 + slot;  // con varios dispositivos: cada uno usa su terminación (1-9) y nunca chocan
}
