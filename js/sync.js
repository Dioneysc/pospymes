/* ============================================
   SYNC.JS — Sincronización con Firebase (Firestore + Auth)
   La app sigue funcionando con localStorage (sin internet).
   Este módulo sube los cambios y baja los de otros dispositivos.
   Datos en: negocios/{uid}/{productos|insumos|ventas|gastos|usuarios|cortes|config}
   ============================================ */

const SYNC_COLS = ["productos", "insumos", "ventas", "gastos", "usuarios", "cortes"]; // listas de registros con id
const SYNC_CFG = ["negocio", "catsGasto", "cajaHoy"];                                   // valores únicos (carpeta config)
const SYNC_CLAVES = new Set([...SYNC_COLS, ...SYNC_CFG]);
const FB_VER = "10.12.2";

let syncMeta = LS.get("syncMeta", { activo: false, slot: 0, email: "", uid: "", synced: {}, cfgT: {}, ultima: 0 });
let SYNC_SLOT = syncMeta.slot || 0; // terminación de los IDs de este dispositivo (ver nuevoId en db.js)
let syncDb = null, syncUid = null, syncUnsubs = [];
let syncOcupado = false, syncRepetir = false, syncTimer = null, syncAplicando = false, uiTimer = null;

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
  "permission-denied": "Sin permiso: publica las reglas de Firestore (archivo firestore.rules)"
}[e.code] || e.message || String(e));

// Lectura / escritura de cada dato local
const leer = k => k === "negocio" ? DB.negocio : k === "catsGasto" ? CATS_GASTO : k === "cajaHoy" ? estadoCajaHoy
  : k === "cortes" ? LS.get("cortes", []) : DB[k];
function escribir(k, v) {
  if (k === "negocio") DB.negocio = v; else if (k === "catsGasto") CATS_GASTO = v;
  else if (k === "cajaHoy") estadoCajaHoy = v; else if (k !== "cortes") DB[k] = v;
  syncAplicando = true; try { LS.set(k, v); } finally { syncAplicando = false; }
}

// Cada vez que la app guarda algo sincronizable, se programa una subida
const _lsSet = LS.set;
LS.set = (k, v) => { _lsSet(k, v); if (!syncAplicando && SYNC_CLAVES.has(k)) programarSync(); };
function programarSync() {
  if (!syncMeta.activo || !syncDb) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(empujarCambios, 800);
}

// ---------- subir cambios locales ----------
async function empujarCambios() {
  if (!syncDb || !syncUid) return;
  if (syncOcupado) { syncRepetir = true; return; }
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
      for (const id of Object.keys(s)) if (!ids.has(id)) ops.push({ c, id, borrar: true });
      if (sello) { syncAplicando = true; LS.set(c, lista); syncAplicando = false; }
    }
    syncMeta.synced.config = syncMeta.synced.config || {};
    for (const k of SYNC_CFG) {
      const h = hashDe(leer(k));
      if (syncMeta.synced.config[k] !== h) { const t = Date.now(); ops.push({ c: "config", id: k, data: { valor: limpio(leer(k)), _t: t }, h, t }); }
    }
    for (let i = 0; i < ops.length; i += 400) {
      const lote = ops.slice(i, i + 400), b = syncDb.batch();
      lote.forEach(o => o.borrar ? b.delete(ref(o.c).doc(o.id)) : b.set(ref(o.c).doc(o.id), o.data));
      await Promise.race([b.commit(), esperar(15000, "Sin conexión")]);
      lote.forEach(o => {
        const s = (syncMeta.synced[o.c] = syncMeta.synced[o.c] || {});
        if (o.borrar) delete s[o.id]; else { s[o.id] = o.h; if (o.c === "config") syncMeta.cfgT[o.id] = o.t; }
      });
      guardarMeta();
    }
    syncMeta.ultima = Date.now(); guardarMeta(); pintarEstadoSync();
  } catch (e) {
    console.warn("Sync:", e); pintarEstadoSync("⚠️ Pendiente de subir: " + msgSync(e));
  } finally {
    syncOcupado = false;
    if (syncRepetir) { syncRepetir = false; programarSync(); }
  }
}

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
      const r = ch.doc.data(), h = hashDe(sinT(r));
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
    (await ref(c).get()).forEach(d => { const r = d.data(); lista.push(r); s[r.id] = hashDe(sinT(r)); });
    escribir(c, lista);
  }
  (await ref("config").get()).forEach(d => {
    const k = d.id, o = d.data();
    if (SYNC_CFG.includes(k) && o.valor !== undefined) { escribir(k, o.valor); syncMeta.synced.config[k] = hashDe(o.valor); syncMeta.cfgT[k] = o._t || 0; }
  });
  guardarMeta();
}

async function conectarSync() {
  if (!FIREBASE_CONFIG.apiKey) return toast("⚠️ Falta pegar tu configuración en js/firebase-config.js");
  const email = $("#syncEmail").value.trim(), pass = $("#syncPass").value, slot = +$("#syncSlot").value;
  if (!email || !pass) return toast("⚠️ Escribe el correo y la contraseña");
  try {
    pintarEstadoSync("Conectando...");
    await cargarFirebase(); iniciarFirebase();
    const cred = await firebase.auth().signInWithEmailAndPassword(email, pass);
    syncUid = cred.user.uid; syncDb = firebase.firestore();
    const hayNube = !(await ref("config").limit(1).get()).empty;
    const primera = !syncMeta.activo || syncMeta.uid !== syncUid;
    if (primera && hayNube) {
      if (!confirm("La nube ya tiene datos de este negocio.\n\n¿Reemplazar los datos de ESTE dispositivo por los de la nube?\n\nSe descargará un respaldo de lo que hay aquí antes de reemplazar.")) {
        await firebase.auth().signOut(); syncDb = null; syncUid = null; return pintarEstadoSync();
      }
      exportarBackup();
      await descargarTodo();
    } else if (primera) { syncMeta.synced = {}; syncMeta.cfgT = {}; }
    syncMeta = { ...syncMeta, activo: true, slot, email, uid: syncUid };
    SYNC_SLOT = slot; guardarMeta();
    escucharNube(); programarSync(); refrescarUI();
    $("#syncPass").value = "";
    toast("☁️ Sincronización activada"); pintarEstadoSync();
  } catch (e) { console.warn(e); pintarEstadoSync(); toast("❌ " + msgSync(e)); }
}

async function desconectarSync() {
  if (!confirm("¿Desconectar la sincronización en este dispositivo?\n\nTus datos locales se conservan; dejarán de subirse y bajarse.")) return;
  detenerEscucha();
  try { await firebase.auth().signOut(); } catch (e) {}
  syncMeta.activo = false; syncMeta.synced = {}; syncMeta.cfgT = {};
  syncDb = null; syncUid = null; guardarMeta(); pintarEstadoSync(); toast("☁️ Desconectado");
}

async function sincronizarAhora() {
  if (!syncDb) return toast("⚠️ No hay conexión con la nube todavía");
  await empujarCambios(); toast("🔄 Sincronizado");
}

function pintarEstadoSync(msg) {
  const est = document.getElementById("syncEstado");
  if (!est) return;
  const on = syncMeta.activo;
  const hora = syncMeta.ultima ? new Date(syncMeta.ultima).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "—";
  est.textContent = msg || (on ? `✅ Conectado (${syncMeta.email}) · Dispositivo ${syncMeta.slot} · Última sincronización: ${hora}`
    : "No conectado. Tus datos solo están en este dispositivo.");
  $("#syncForm").classList.toggle("oculto", on);
  $("#syncAcciones").classList.toggle("oculto", !on);
  if (syncMeta.email && !$("#syncEmail").value) $("#syncEmail").value = syncMeta.email;
  if (syncMeta.slot) $("#syncSlot").value = String(syncMeta.slot);
}

// Al abrir la app: si ya estaba conectada, reanudar (sin bloquear el arranque)
function iniciarSync() {
  pintarEstadoSync();
  window.addEventListener("online", programarSync);
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
