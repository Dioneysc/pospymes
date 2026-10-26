/* ============================================
   SYNC.JS — Sincronización con Firebase (Firestore + Auth)
   La app sigue funcionando con localStorage (sin internet).
   Este módulo sube los cambios y baja los de otros dispositivos.
   Datos en: negocios/{uid}/{productos|insumos|ventas|gastos|usuarios|cortes|config}
   ============================================ */

const SYNC_COLS = ["productos", "insumos", "ventas", "gastos", "usuarios", "cortes", "preventasPendientes", "gastosPersonales", "cajaFuerteMovimientos", "bitacora"]; // listas de registros con id
const SYNC_CFG = ["negocio", "catsGasto", "cajaHoy", "cajaFuerteSaldoAjuste", "menusPorUsuario"]; // valores únicos (carpeta config)
const SYNC_LOCAL_LISTS = new Set(["preventasPendientes", "gastosPersonales", "cajaFuerteMovimientos", "bitacora"]);
const SYNC_CLAVES = new Set([...SYNC_COLS, ...SYNC_CFG]);
const FB_VER = "10.12.2";

let syncMeta = LS.get("syncMeta", { activo: false, slot: 0, email: "", uid: "", synced: {}, cfgT: {}, ultima: 0 });
let SYNC_SLOT = syncMeta.slot || 0; // terminación de los IDs de este dispositivo (ver nuevoId en db.js)
let syncDb = null, syncUid = null, syncUnsubs = [];
let syncOcupado = false, syncRepetir = false, syncTimer = null, syncAplicando = false, uiTimer = null, syncUltimoError = "";

// ---------- utilidades ----------
const canon = v => Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
  : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}"
  : JSON.stringify(v);
// Los valores de configuración local pueden ser null/undefined durante una migración.
// Normalizar evita que el hash lance una excepción antes de llegar a Firestore.
const hashDe = v => { const s = canon(v); const texto = s === undefined ? "null" : s; let h = 5381; for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0; return h.toString(36) + "." + texto.length; };
const sinT = r => { const { _t, ...resto } = r; return resto; };
const limpio = o => JSON.parse(JSON.stringify(o)); // Firestore no admite undefined
const guardarMeta = () => LS.set("syncMeta", syncMeta);
const ref = n => syncDb.collection("negocios").doc(syncUid).collection(n);
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
const SYNC_LOCAL_VALUES = new Set(["cajaFuerteSaldoAjuste", "menusPorUsuario"]);
const leer = k => k === "negocio" ? DB.negocio : k === "catsGasto" ? CATS_GASTO : k === "cajaHoy" ? estadoCajaHoy
  : k === "cortes" || SYNC_LOCAL_LISTS.has(k) ? LS.get(k, [])
  : SYNC_LOCAL_VALUES.has(k) ? LS.get(k, k === "cajaFuerteSaldoAjuste" ? 0 : k === "menusPorUsuario" ? {} : null)
  : DB[k];
function escribir(k, v) {
  if (k === "negocio") DB.negocio = v; else if (k === "catsGasto") CATS_GASTO = v;
  else if (k === "cajaHoy") estadoCajaHoy = v;
  else if (k !== "cortes" && !SYNC_LOCAL_LISTS.has(k) && !SYNC_LOCAL_VALUES.has(k)) DB[k] = v;
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
      // No competir el commit contra un timeout: Promise.race no cancela la escritura
      // y podría marcar como fallido un lote que Firestore termina guardando después.
      await b.commit();
      lote.forEach(o => {
        const s = (syncMeta.synced[o.c] = syncMeta.synced[o.c] || {});
        if (o.borrar) delete s[o.id]; else { s[o.id] = o.h; if (o.c === "config") syncMeta.cfgT[o.id] = o.t; }
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

// ---------- recibir cambios de otros dispositivos ----------
function escucharNube() {
  detenerEscucha();
  [...SYNC_COLS, "config"].forEach(c => syncUnsubs.push(
    ref(c).onSnapshot(snap => aplicarRemoto(c, snap.docChanges()), e => {
      syncUltimoError = msgSync(e);
      pintarEstadoSync("⚠️ Firebase no confirmó lectura de " + c + ": " + syncUltimoError);
    })
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
  // Si la nube no tenía usuarios, escribir([]) dejaba el sistema sin acceso hasta recargar
  if (typeof actualizarPantallaLogin === "function") actualizarPantallaLogin(); // sin usuarios en la nube: el próximo ingreso pedirá crear contraseña
  guardarMeta();
}


async function conectarSync() {
  if (!FIREBASE_CONFIG.apiKey) {
    return toast("⚠️ Falta la configuración en js/firebase-config.js");
  }

  const slot = Number($("#syncSlot").value);
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) {
    return toast("⚠️ Selecciona un número de dispositivo válido (1 a 9).");
  }

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
    slot = Number(slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 9) throw new Error("Selecciona un número de dispositivo válido (1 a 9).");
    await cargarFirebase();
    iniciarFirebase();
const credencial =
  firebase.auth.GoogleAuthProvider.credential(idToken);

    const resultado = await firebase.auth().signInWithCredential(credencial);

    await finalizarConexion(resultado.user, slot);
  } catch (e) {
    console.warn("Error de autenticación nativa:", e);
    pintarEstadoSync();
    toast("❌ " + msgSync(e));
  }
};

// Detecta datos en todas las colecciones sincronizables, no solo en config.
// Evita tratar como nube vacía un negocio que tenga ventas/productos pero carezca de config.
async function hayDatosEnNube() {
  const colecciones = [...SYNC_COLS, "config"];
  const resultados = await Promise.all(colecciones.map(c => ref(c).limit(1).get()));
  return resultados.some(snap => !snap.empty);
}

// Se ejecuta cuando Google ya identificó al usuario (por popup o al volver de la redirección)
async function finalizarConexion(user, slot) {
  if (!Number.isInteger(Number(slot)) || Number(slot) < 1 || Number(slot) > 9) {
    throw new Error("Selecciona un número de dispositivo válido (1 a 9).");
  }
  slot = Number(slot);
  syncUid = user.uid; syncDb = firebase.firestore();
  const hayNube = await hayDatosEnNube();
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
    : (syncUltimoError ? `⚠️ Última sincronización no confirmada: ${syncUltimoError}`
    : (on ? `✅ Conectado (${syncMeta.email}) · Dispositivo ${syncMeta.slot} · Última sincronización confirmada: ${hora}`
    : "No conectado. Tus datos solo están en este dispositivo."));
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
