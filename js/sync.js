/* ============================================
   SYNC.JS — Sincronización con Firebase (Firestore + Auth)
   La app sigue funcionando con localStorage (sin internet).
   Este módulo sube los cambios y baja los de otros dispositivos.
   Datos en: negocios/{uid}/{productos|insumos|ventas|gastos|usuarios|cortes|config}
   ============================================ */

const SYNC_COLS = ["productos", "insumos", "ventas", "gastos", "usuarios", "cortes", "preventasPendientes", "gastosPersonales", "cajaFuerteMovimientos", "movimientosInventarioPOS"]; // listas de registros con id
const SYNC_CFG = ["negocio", "catsGasto", "cajaHoyPorSucursal", "cajaFuerteSaldoAjuste", "menuInferiorPOS", "sucursalesPOS"]; // valores únicos (carpeta config)
const SYNC_LOCAL_LISTS = new Set(["preventasPendientes", "gastosPersonales", "cajaFuerteMovimientos", "movimientosInventarioPOS"]);
const SYNC_CLAVES = new Set([...SYNC_COLS, ...SYNC_CFG]);
const FB_VER = "10.12.2";

let syncMeta = LS.get("syncMeta", { activo: false, slot: 0, email: "", uid: "", synced: {}, cfgT: {}, ultima: 0 });
let SYNC_SLOT = syncMeta.slot || 0; // terminación de los IDs de este dispositivo (ver nuevoId en db.js)
let syncDb = null, syncUid = null, syncUnsubs = [];
// Tombstones y papelera recuperable: se conserva el registro eliminado en Firestore.
const papeleraLocal = () => LS.get("papeleraPOS", []);
function guardarEnPapelera(c, id, data, fecha) {
  if (!data || typeof data !== "object") return;
  const papelera = papeleraLocal();
  const clave = `${c}:${id}`;
  const idx = papelera.findIndex(x => x.clave === clave);
  const item = { clave, coleccion: c, id: String(id), eliminadoEn: fecha || Date.now(), registro: Object.fromEntries(Object.entries(data).filter(([k]) => !["_deleted", "_deletedAt", "_deletedBy"].includes(k))) };
  if (idx >= 0) papelera[idx] = item; else papelera.push(item);
  LS.set("papeleraPOS", papelera);
}
function restaurarDePapelera(clave) {
  const papelera = papeleraLocal(); const item = papelera.find(x => x.clave === clave);
  if (!item || !SYNC_COLS.includes(item.coleccion)) return false;
  const lista = leer(item.coleccion);
  if (!lista.some(x => String(x.id) === String(item.id))) lista.push(limpio(item.registro));
  escribir(item.coleccion, lista);
  if (syncMeta.tombstones) delete syncMeta.tombstones[clave];
  if (syncMeta.synced[item.coleccion]) delete syncMeta.synced[item.coleccion][item.id];
  LS.set("papeleraPOS", papelera.filter(x => x.clave !== clave)); guardarMeta(); programarSync(); refrescarUI(); return true;
}
window.restaurarDePapelera = restaurarDePapelera;
let syncOcupado = false, syncRepetir = false, syncTimer = null, syncAplicando = false, uiTimer = null, syncUltimoError = "";

// ---------- utilidades ----------
const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v);
const hashDe = v => { const s = canon(v); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + "." + s.length; };
const sinT = r => { const { _t, ...resto } = r; return resto; };
const limpio = o => JSON.parse(JSON.stringify(o)); // Firestore no admite undefined
const guardarMeta = () => LS.set("syncMeta", syncMeta);
const ref = n => syncDb.collection("negocios").doc(syncUid).collection(n);
const esperar = (ms, msg) => new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms));
const msgSync = e => ({
  "auth/invalid-credential": "Correo o contraseña incorrectos", "auth/wrong-password": "Contraseña incorrecta",
  "auth/user-not-found": "Ese correo no existe en tu proyecto de Firebase", "auth/invalid-email": "Correo inválido",
  "auth/network-request-failed": "Sin conexión a internet", "auth/too-many-requests": "Demasiados intentos, espera un momento",
  "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar", "auth/cancelled-popup-request": "Inicio de sesión cancelado",
  "auth/unauthorized-domain": `El dominio "${location.hostname}" no está autorizado: agrégalo en Firebase → Authentication → Configuración → Dominios autorizados`,
  "auth/invalid-api-key": "La apiKey de js/firebase-config.js no es válida", "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "La apiKey no es válida",
  "auth/web-storage-unsupported": "El navegador bloquea el almacenamiento (modo privado o cookies bloqueadas)",
  "auth/internal-error": "Error interno de Firebase: revisa que Google esté habilitado y que la apiKey no tenga restricciones que bloqueen este dominio",
  "auth/operation-not-allowed": "Activa Google en Firebase → Authentication → Método de acceso",
  "permission-denied": "Sin permiso: publica las reglas de Firestore (archivo firestore.rules)"
}[e.code] || e.message || String(e));

// Lectura / escritura de cada dato local
const leer = k => k === "negocio" ? DB.negocio : k === "catsGasto" ? CATS_GASTO : k === "cajaHoyPorSucursal" ? LS.get(k, {})
  : k === "cajaHoy" ? estadoCajaHoy : k === "sucursalesPOS" ? LS.get(k, [{ id: "principal", nombre: "Sucursal principal", activa: true }])
  : k === "cortes" || SYNC_LOCAL_LISTS.has(k) ? LS.get(k, []) : DB[k];
function escribir(k, v) {
  if (k === "negocio") DB.negocio = v; else if (k === "catsGasto") CATS_GASTO = v;
  else if (k === "cajaHoy") estadoCajaHoy = v; else if (k === "cajaHoyPorSucursal") { LS.set(k, v); const id = typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal"; if (v && v[id]) { estadoCajaHoy = v[id]; LS.set("cajaHoy", estadoCajaHoy); } } else if (k === "sucursalesPOS") LS.set(k, v); else if (k !== "cortes" && !SYNC_LOCAL_LISTS.has(k)) DB[k] = v;
  syncAplicando = true; try { LS.set(k, v); } finally { syncAplicando = false; }
}

// Cada vez que la app guarda algo sincronizable, se programa una subida
const _lsSet = LS.set;
LS.set = (k, v) => {
  _lsSet(k, v);
  if (!syncAplicando && k === "cajaHoy") {
    const id = typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal";
    const mapa = LS.get("cajaHoyPorSucursal", {});
    mapa[id] = limpio(v);
    syncAplicando = true; try { _lsSet("cajaHoyPorSucursal", mapa); } finally { syncAplicando = false; }
    if (SYNC_CLAVES.has("cajaHoyPorSucursal")) programarSync();
  }
  if (!syncAplicando && SYNC_CLAVES.has(k)) programarSync();
};
function programarSync() {
  if (!syncMeta.activo || !syncDb) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(empujarCambios, 800);
}

// ---------- subir cambios locales ----------
async function empujarCambios() {
  if (!syncDb || !syncUid) return false;
  if (!navigator.onLine) { pintarEstadoSync("📴 Sin internet. Los cambios quedan guardados en este dispositivo y se enviarán al reconectar."); return false; }
  if (syncOcupado) { syncRepetir = true; return false; }
  syncOcupado = true;
  try {
    const ops = [];
    for (const c of SYNC_COLS) {
      const lista = leer(c), s = (syncMeta.synced[c] = syncMeta.synced[c] || {}), ids = new Set();
      let sello = false;
      for (const r of lista) {
        ids.add(String(r.id));
        const h = hashDe(sinT(r));
        if (s[r.id] !== h) { r._t = Date.now(); sello = true; ops.push({ c, id: String(r.id), data: limpio(r), h }); }
      }
      for (const id of Object.keys(s)) if (!ids.has(id) && !(syncMeta.tombstones || {})[`${c}:${id}`]) {
        // Convertir el borrado físico en una marca recuperable (tombstone).
        let anterior = null;
        try { const snap = await ref(c).doc(String(id)).get(); if (snap.exists) anterior = snap.data(); } catch (e) { throw e; }
        ops.push({ c, id, tumba: true, data: anterior || { id: isNaN(Number(id)) ? id : Number(id) } });
      }
      if (sello) { syncAplicando = true; LS.set(c, lista); syncAplicando = false; }
    }
    syncMeta.synced.config = syncMeta.synced.config || {};
    for (const k of SYNC_CFG) {
      const h = hashDe(leer(k));
      if (syncMeta.synced.config[k] !== h) { const t = Date.now(); ops.push({ c: "config", id: k, data: { valor: limpio(leer(k)), _t: t }, h, t }); }
    }
    for (let i = 0; i < ops.length; i += 400) {
      const lote = ops.slice(i, i + 400), b = syncDb.batch();
      lote.forEach(o => {
        if (o.tumba) b.set(ref(o.c).doc(o.id), { ...o.data, _deleted: true, _deletedAt: Date.now(), _deletedBy: syncUid });
        else if (o.borrar) b.delete(ref(o.c).doc(o.id));
        else b.set(ref(o.c).doc(o.id), o.data);
      });
      await Promise.race([b.commit(), esperar(15000, "Sin conexión")]);
      lote.forEach(o => {
        const s = (syncMeta.synced[o.c] = syncMeta.synced[o.c] || {});
        if (o.borrar) delete s[o.id]; else if (o.tumba) {
          syncMeta.tombstones = syncMeta.tombstones || {}; syncMeta.tombstones[`${o.c}:${o.id}`] = Date.now(); delete s[o.id];
        } else { s[o.id] = o.h; if (o.c === "config") syncMeta.cfgT[o.id] = o.t; }
      });
      guardarMeta();
    }
    syncMeta.ultima = Date.now(); syncUltimoError = ""; guardarMeta(); pintarEstadoSync();
    return true;
  } catch (e) {
    syncUltimoError = msgSync(e); console.warn("Sync:", e); pintarEstadoSync("⚠️ Pendiente de subir: " + syncUltimoError + ". Tus datos locales se conservan; se reintentará al reconectar.");
    return false;
  } finally {
    syncOcupado = false;
    if (syncRepetir) { syncRepetir = false; programarSync(); }
  }
}

// ---------- movimiento de inventario atómico (requiere conexión) ----------
// La transacción actualiza stock y bitácora como una sola operación. Si no hay red,
// la interfaz conserva el flujo local existente y deja la sincronización pendiente.
async function movimientoInventarioAtomicoPOS(mov) {
  if (!syncDb || !syncUid || !navigator.onLine || !syncMeta.activo) {
    throw new Error("Firebase no está conectado; el movimiento debe quedar pendiente localmente.");
  }
  if (!mov || !mov.id || !mov.insumoId || !mov.sucursalId) throw new Error("Faltan datos para registrar el movimiento.");
  const insRef = ref("insumos").doc(String(mov.insumoId));
  const movRef = ref("movimientosInventarioPOS").doc(String(mov.id));
  const resultado = await syncDb.runTransaction(async tx => {
    const opSnap = await tx.get(movRef);
    if (opSnap.exists) return { movimiento: opSnap.data(), repetido: true };
    const insSnap = await tx.get(insRef);
    if (!insSnap.exists) throw new Error("El insumo no existe en Firebase. Sincroniza y vuelve a intentar.");
    const ins = insSnap.data();
    if (String(ins.sucursalId || "principal") !== String(mov.sucursalId)) {
      throw new Error("El insumo pertenece a otra sucursal. No se modificó el inventario.");
    }
    const antes = Number(ins.stock);
    if (!Number.isFinite(antes) || antes < 0) throw new Error("El stock en Firebase no es válido. Concilia el inventario antes de continuar.");
    const cantidad = Number(mov.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    if (mov.tipo === "salida" && cantidad > antes) throw new Error("Stock insuficiente en Firebase. Actualiza el inventario antes de registrar la salida.");
    const despues = mov.tipo === "entrada" ? antes + cantidad : antes - cantidad;
    const actualizado = { ...ins, stock: despues, _stockActualizadoEn: Date.now() };
    const registro = { ...mov, cantidad, cantidadSolicitada: cantidad, stockAntes: antes, stockDespues: despues, atomico: true };
    tx.set(insRef, actualizado);
    tx.set(movRef, registro);
    return { insumo: actualizado, movimiento: registro, repetido: false };
  });
  // Reflejar el resultado confirmado en la copia local y evitar que el siguiente ciclo
  // de sincronización vuelva a escribir una versión local anterior.
  if (resultado.insumo) {
    const insumos = leer("insumos");
    const idx = insumos.findIndex(x => String(x.id) === String(mov.insumoId));
    if (idx >= 0) insumos[idx] = resultado.insumo;
    escribir("insumos", insumos);
    syncMeta.synced.insumos = syncMeta.synced.insumos || {};
    syncMeta.synced.insumos[String(mov.insumoId)] = hashDe(sinT(resultado.insumo));
  }
  const bitacora = leer("movimientosInventarioPOS");
  if (!bitacora.some(x => String(x.id) === String(mov.id))) bitacora.push(resultado.movimiento || mov);
  escribir("movimientosInventarioPOS", bitacora);
  syncMeta.synced.movimientosInventarioPOS = syncMeta.synced.movimientosInventarioPOS || {};
  syncMeta.synced.movimientosInventarioPOS[String(mov.id)] = hashDe(sinT(resultado.movimiento || mov));
  guardarMeta();
  return resultado;
}
window.movimientoInventarioAtomicoPOS = movimientoInventarioAtomicoPOS;

// v109: consumo de receta transaccional por venta. Todas las existencias y movimientos
// se confirman en una sola transacción Firestore; si falta stock, no descuenta parcialmente.
async function consumoRecetaVentaAtomicoPOS(venta) {
  if (!syncDb || !syncUid || !navigator.onLine || !syncMeta.activo) throw new Error("Firebase no está conectado.");
  if (!venta || venta.id == null || !Array.isArray(venta.items)) throw new Error("Venta inválida para consumir receta.");
  const sucursalId = String(venta.sucursalId || "principal");
  const productos = leer("productos");
  const totales = new Map();
  venta.items.forEach(item => {
    const producto = productos.find(p => String(p.id) === String(item.productoId));
    if (!producto || !Array.isArray(producto.insumos)) return;
    producto.insumos.forEach(r => {
      const q = Number(r.cantidad) * Number(item.cantidad);
      if (!r.insumoId || !Number.isFinite(q) || q <= 0) return;
      const k = String(r.insumoId);
      const actual = totales.get(k) || { insumoId: k, cantidad: 0, nombres: [] };
      actual.cantidad += q;
      actual.nombres.push(producto.nombre || item.nombre || "Producto");
      totales.set(k, actual);
    });
  });
  if (!totales.size) return { aplicado: 0, sinReceta: true };
  const consumos = [...totales.values()];
  const ventaKey = `${sucursalId}_${String(venta.id)}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const procesoRef = ref("consumosVentasProcesadasPOS").doc(ventaKey);
  const insRefs = consumos.map(c => ({ ...c, ref: ref("insumos").doc(String(c.insumoId)), movRef: ref("movimientosInventarioPOS").doc(`consumo_${ventaKey}_${c.insumoId}`) }));
  const resultado = await syncDb.runTransaction(async tx => {
    const procesoSnap = await tx.get(procesoRef);
    if (procesoSnap.exists) return { repetido: true, registros: procesoSnap.data().registros || [] };
    const snaps = [];
    for (const c of insRefs) snaps.push(await tx.get(c.ref));
    const registros = [];
    // Validar todos antes de escribir: no se permite consumo parcial.
    snaps.forEach((snap, i) => {
      const c = insRefs[i];
      if (!snap.exists) throw new Error(`No existe el insumo ${c.insumoId} en Firebase.`);
      const ins = snap.data();
      if (String(ins.sucursalId || "principal") !== sucursalId) throw new Error(`El insumo ${ins.nombre || c.insumoId} no pertenece a la sucursal ${sucursalId}.`);
      const antes = Number(ins.stock);
      if (!Number.isFinite(antes) || antes < c.cantidad) throw new Error(`Stock insuficiente para ${ins.nombre || c.insumoId}. Disponible: ${Number.isFinite(antes) ? antes : "inválido"}; requerido: ${c.cantidad}.`);
      registros.push({ c, ins, antes, despues: antes - c.cantidad });
    });
    registros.forEach(({c, ins, antes, despues}) => {
      const mov = { id: `consumo_${ventaKey}_${c.insumoId}`, referencia: `venta:${sucursalId}:${venta.id}:insumo:${c.insumoId}`, sucursalId, ventaId: venta.id, insumoId: ins.id ?? c.insumoId, insumoNombre: ins.nombre || "Insumo", tipo: "consumo_venta", cantidad: c.cantidad, cantidadSolicitada: c.cantidad, stockAntes: antes, stockDespues: despues, motivo: `Consumo por venta #${venta.id}`, fecha: venta.fecha || new Date().toISOString(), usuario: venta.usuario || "", atomico: true };
      tx.set(c.ref, { ...ins, stock: despues, _stockActualizadoEn: Date.now() });
      tx.set(c.movRef, mov);
    });
    tx.set(procesoRef, { ventaId: venta.id, sucursalId, procesadoEn: Date.now(), registros: registros.map(({c}) => c.insumoId) });
    return { repetido: false, registros: registros.map(({c, ins, antes, despues}) => ({ insumoId: c.insumoId, insumo: { ...ins, stock: despues }, movimiento: { id: `consumo_${ventaKey}_${c.insumoId}`, referencia: `venta:${sucursalId}:${venta.id}:insumo:${c.insumoId}`, sucursalId, ventaId: venta.id, insumoId: ins.id ?? c.insumoId, insumoNombre: ins.nombre || "Insumo", tipo: "consumo_venta", cantidad: c.cantidad, cantidadSolicitada: c.cantidad, stockAntes: antes, stockDespues: despues, motivo: `Consumo por venta #${venta.id}`, fecha: venta.fecha || new Date().toISOString(), usuario: venta.usuario || "", atomico: true } })) };
  });
  if (!resultado.repetido) {
    const insumos = leer("insumos"), movimientos = leer("movimientosInventarioPOS");
    resultado.registros.forEach(r => {
      const idx = insumos.findIndex(i => String(i.id) === String(r.insumoId) && String(i.sucursalId || "principal") === sucursalId);
      if (idx >= 0) insumos[idx] = r.insumo;
      if (!movimientos.some(m => String(m.id) === String(r.movimiento.id))) movimientos.push(r.movimiento);
      syncMeta.synced.insumos = syncMeta.synced.insumos || {};
      syncMeta.synced.insumos[String(r.insumoId)] = hashDe(sinT(r.insumo));
      syncMeta.synced.movimientosInventarioPOS = syncMeta.synced.movimientosInventarioPOS || {};
      syncMeta.synced.movimientosInventarioPOS[String(r.movimiento.id)] = hashDe(sinT(r.movimiento));
    });
    escribir("insumos", insumos); escribir("movimientosInventarioPOS", movimientos); guardarMeta();
  }
  const procesadas = LS.get("consumosVentasProcesadasPOS", {});
  procesadas[`${sucursalId}:${venta.id}`] = { fecha: Date.now(), atomico: true, movimientos: resultado.registros.length };
  LS.set("consumosVentasProcesadasPOS", procesadas);
  return { aplicado: resultado.registros.length, repetido: !!resultado.repetido };
}
window.consumoRecetaVentaAtomicoPOS = consumoRecetaVentaAtomicoPOS;

// ---------- recibir cambios de otros dispositivos ----------
function escucharNube() {
  detenerEscucha();
  [...SYNC_COLS, "config"].forEach(c => syncUnsubs.push(
    ref(c).onSnapshot(snap => aplicarRemoto(c, snap.docChanges()), e => pintarEstadoSync("⚠️ " + msgSync(e)))
  ));
}
function detenerEscucha() { syncUnsubs.forEach(f => { try { f(); } catch (e) {} }); syncUnsubs = []; }

function aplicarRemoto(c, cambios) {
  if (!cambios.length) return;
  let hubo = false;
  if (c === "config") {
    syncMeta.synced.config = syncMeta.synced.config || {};
    cambios.forEach(ch => {
      const k = ch.doc.id, d = ch.doc.data();
      if (ch.type === "removed" || !SYNC_CFG.includes(k) || d.valor === undefined) return;
      const sh = syncMeta.synced.config[k], h = hashDe(d.valor);
      if (sh === h) return;                                            // ya está igual
      if (sh !== undefined && hashDe(leer(k)) !== sh) return;          // cambio local pendiente: gana el local
      if ((d._t || 0) <= (syncMeta.cfgT[k] || 0)) return;              // el remoto es más viejo
      escribir(k, d.valor); syncMeta.synced.config[k] = h; syncMeta.cfgT[k] = d._t || 0; hubo = true;
    });
  } else {
    let lista = leer(c);
    const s = (syncMeta.synced[c] = syncMeta.synced[c] || {});
    const pos = new Map(lista.map((r, i) => [String(r.id), i])), quitar = new Set();
    cambios.forEach(ch => {
      const id = ch.doc.id, i = pos.get(id);
      if (ch.type === "removed") {
        if (i !== undefined && hashDe(sinT(lista[i])) === s[id]) { quitar.add(i); hubo = true; } // solo si no tiene cambios locales
        delete s[id]; return;
      }
      const r = ch.doc.data();
      if (r && r._deleted === true) {
        guardarEnPapelera(c, id, r, r._deletedAt);
        if (i !== undefined) {
          if (hashDe(sinT(lista[i])) === s[id]) { lista.splice(i, 1); hubo = true; }
          else return; // conservar una edición local pendiente; no pisarla
        }
        syncMeta.tombstones = syncMeta.tombstones || {}; syncMeta.tombstones[`${c}:${id}`] = r._deletedAt || Date.now();
        delete s[id]; return;
      }
      const h = hashDe(sinT(r));
      if (s[id] === h) return;                                         // ya está igual
      if (i !== undefined) {
        if (hashDe(sinT(lista[i])) !== s[id]) return;                  // cambio local pendiente: gana el local
        lista[i] = r;
      } else { lista.push(r); pos.set(id, lista.length - 1); }
      s[id] = h; hubo = true;
    });
    if (quitar.size) lista = lista.filter((_, i) => !quitar.has(i));
    if (hubo) escribir(c, lista);
  }
  if (hubo) { guardarMeta(); refrescarUI(); }
}

function refrescarUI() {
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    const m = document.getElementById("modal");
    if (m && !m.classList.contains("oculto")) return; // no interrumpir un formulario abierto
    if (typeof actualizarHeader === "function") actualizarHeader();
    const v = document.querySelector(".vista.activa");
    if (v && typeof cambiarVista === "function") { const y = window.scrollY || 0; cambiarVista(v.id); window.scrollTo(0, y); }
  }, 400);
}

// ---------- conexión ----------
function cargarFirebase() {
  if (typeof firebase !== "undefined" && firebase.firestore) return Promise.resolve();
  return ["app", "auth", "firestore"].reduce((p, n) => p.then(() => new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${n}-compat.js`;
    s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar Firebase (¿sin internet?)"));
    document.head.appendChild(s);
  })), Promise.resolve());
}
function iniciarFirebase() { if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); }

async function descargarTodo() {
  syncMeta.synced = { config: {} }; syncMeta.cfgT = {};
  for (const c of SYNC_COLS) {
    const lista = [], s = (syncMeta.synced[c] = {});
    (await ref(c).get()).forEach(d => { const r = d.data(); if (r && r._deleted === true) { guardarEnPapelera(c, d.id, r, r._deletedAt); syncMeta.tombstones = syncMeta.tombstones || {}; syncMeta.tombstones[`${c}:${d.id}`] = r._deletedAt || Date.now(); return; } lista.push(r); s[r.id] = hashDe(sinT(r)); });
    escribir(c, lista);
  }
  (await ref("config").get()).forEach(d => {
    const k = d.id, o = d.data();
    if (SYNC_CFG.includes(k) && o.valor !== undefined) { escribir(k, o.valor); syncMeta.synced.config[k] = hashDe(o.valor); syncMeta.cfgT[k] = o._t || 0; }
  });
  guardarMeta();
}


async function conectarSync() {
  if (!FIREBASE_CONFIG.apiKey) {
    return toast("⚠️ Falta la configuración en js/firebase-config.js");
  }

  const slot = +$("#syncSlot").value;

  if (!/^https?:$/.test(location.protocol)) {
    return toast("⚠️ Abre la app desde HTTPS o localhost.");
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) {
    toast(`⚠️ Estás en ${location.hostname}: usa un dominio válido.`);
  }

  try {
    pintarEstadoSync("Abriendo Google...");
    await cargarFirebase();
    iniciarFirebase();

    // En Android, solicitar inicio de sesión nativo
    if (
      window.Android &&
      typeof window.Android.signInWithGoogle === "function"
    ) {
      window.Android.signInWithGoogle(String(slot));
      return;
    }

    // En navegador web, conservar el inicio de sesión habitual
    const auth = firebase.auth();
    auth.useDeviceLanguage();

    const proveedor = new firebase.auth.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: "select_account" });

    let cred;

    try {
      cred = await auth.signInWithPopup(proveedor);
    } catch (e) {
      if (
        ["auth/popup-blocked",
         "auth/operation-not-supported-in-this-environment"
        ].includes(e.code)
      ) {
        LS.set("syncPendiente", { slot });
        return auth.signInWithRedirect(proveedor);
      }

      throw e;
    }

    await finalizarConexion(cred.user, slot);

  } catch (e) {
    console.warn("Error de sincronización:", e);
    pintarEstadoSync();
    toast("❌ " + msgSync(e));
  }
}
window.onNativeGoogleToken = async function (idToken, slot) {
  try {
    await cargarFirebase();
    iniciarFirebase();
const credencial =
  firebase.auth.GoogleAuthProvider.credential(idToken);

    const resultado = await firebase.auth().signInWithCredential(credencial);

    await finalizarConexion(resultado.user, Number(slot) || 0);
  } catch (e) {
    console.warn("Error de autenticación nativa:", e);
    pintarEstadoSync();
    toast("❌ " + msgSync(e));
  }
};

// Se ejecuta cuando Google ya identificó al usuario (por popup o al volver de la redirección)
async function finalizarConexion(user, slot) {
  syncUid = user.uid; syncDb = firebase.firestore();
  const hayNube = !(await ref("config").limit(1).get()).empty;
  const primera = !syncMeta.activo || syncMeta.uid !== syncUid;
  if (primera && hayNube) {
    if (!confirm("La nube ya tiene datos de este negocio.\n\n¿Reemplazar los datos de ESTE dispositivo por los de la nube?\n\nSe descargará un respaldo de lo que hay aquí antes de reemplazar.")) {
      await firebase.auth().signOut(); syncDb = null; syncUid = null; return pintarEstadoSync();
    }
    exportarBackup();
    await descargarTodo();
  } else if (primera) { syncMeta.synced = {}; syncMeta.cfgT = {}; }
  syncMeta = { ...syncMeta, activo: true, slot, email: user.email || "", uid: syncUid };
  SYNC_SLOT = slot; guardarMeta();
  escucharNube(); programarSync(); refrescarUI();
  toast("☁️ Sincronización activada"); pintarEstadoSync();
}

async function desconectarSync() {
  if (!confirm("¿Desconectar la sincronización en este dispositivo?\n\nTus datos locales se conservan; dejarán de subirse y bajarse.")) return;
  detenerEscucha();
  try { await firebase.auth().signOut(); } catch (e) {}
  syncMeta.activo = false; syncMeta.synced = {}; syncMeta.cfgT = {};
  syncDb = null; syncUid = null; guardarMeta(); pintarEstadoSync(); toast("☁️ Desconectado");
}

async function sincronizarAhora() {
  if (!syncDb) return toast("⚠️ No hay sesión de nube activa todavía");
  if (!navigator.onLine) { pintarEstadoSync("📴 Sin internet. Los cambios quedan pendientes."); return toast("📴 Sin internet: los datos locales están guardados"); }
  const ok = await empujarCambios();
  if (ok) toast("✅ Sincronización completada");
  else toast("⚠️ No se confirmó la sincronización. Revisa el estado y vuelve a intentar.");
}

function pintarEstadoSync(msg) {
  const est = document.getElementById("syncEstado");
  if (!est) return;
  const on = syncMeta.activo;
  const hora = syncMeta.ultima ? new Date(syncMeta.ultima).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";
  const estadoBase = !navigator.onLine ? "📴 Sin internet. Los cambios locales están conservados y pendientes de sincronizar."
    : (on ? `✅ Conectado (${syncMeta.email}) · Dispositivo ${syncMeta.slot} · Última sincronización: ${hora}`
    : "No conectado. Tus datos solo están en este dispositivo.");
  est.textContent = msg || estadoBase;
  const dom = document.getElementById("syncDominio");
  if (dom) dom.textContent = location.hostname || location.protocol;
  $("#syncForm").classList.toggle("oculto", on);
  $("#syncAcciones").classList.toggle("oculto", !on);
  if (syncMeta.slot) $("#syncSlot").value = String(syncMeta.slot);
}

// Al abrir la app: si ya estaba conectada, reanudar (sin bloquear el arranque)
function iniciarSync() {
  pintarEstadoSync();
  window.addEventListener("online", () => { pintarEstadoSync("🌐 Internet recuperado. Sincronizando cambios pendientes..."); programarSync(); });
  window.addEventListener("offline", () => pintarEstadoSync("📴 Sin internet. Puedes seguir trabajando; los cambios se enviarán al reconectar."));
  const pend = LS.get("syncPendiente", null);
  if (pend && FIREBASE_CONFIG.apiKey) { // volvemos de iniciar sesión con Google por redirección
    LS.set("syncPendiente", null);
    cargarFirebase().then(async () => {
      iniciarFirebase();
      const r = await firebase.auth().getRedirectResult();
      if (r && r.user) await finalizarConexion(r.user, pend.slot);
    }).catch(e => { pintarEstadoSync(); toast("❌ " + msgSync(e)); });
    return;
  }
  if (!syncMeta.activo || !FIREBASE_CONFIG.apiKey) return;
  cargarFirebase().then(() => {
    iniciarFirebase();
    firebase.auth().onAuthStateChanged(u => {
      if (!syncMeta.activo) return;
      if (u && u.uid === syncMeta.uid) { syncUid = u.uid; syncDb = firebase.firestore(); escucharNube(); programarSync(); }
      else if (!u) pintarEstadoSync("⚠️ La sesión de la nube se cerró. Vuelve a conectar.");
    });
  }).catch(e => pintarEstadoSync("⚠️ " + msgSync(e) + " (la app funciona sin conexión)"));
}
