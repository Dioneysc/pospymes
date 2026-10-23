/* ============================================
   AUTH.JS — LOGIN, LOGOUT Y SESIÓN
   ============================================ */

/* ============ CONTRASEÑAS (PBKDF2-SHA256 con sal) ============ */
const PASS_ITER = 100000;
const hayCrypto = () => !!(window.crypto && crypto.subtle);
const aB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function hashPassword(pass, salt, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deB64(salt), iterations: iter || PASS_ITER }, key, 256);
  return aB64(bits);
}

// Guarda la contraseña como hash. Sin crypto.subtle (página no segura) se conserva el formato anterior.
async function fijarPassword(user, pass) {
  if (!hayCrypto()) { user.password = pass; delete user.hash; delete user.salt; delete user.iter; return; }
  user.salt = aB64(crypto.getRandomValues(new Uint8Array(16)));
  user.iter = PASS_ITER;
  user.hash = await hashPassword(pass, user.salt, user.iter);
  delete user.password;
}

async function verificarPassword(user, pass) {
  if (user.hash) return hayCrypto() && (await hashPassword(pass, user.salt, user.iter)) === user.hash;
  return user.password === pass; // formato antiguo, se convierte al abrir la app
}

// Convierte contraseñas en texto plano (versiones anteriores o respaldos viejos) a hash
async function migrarPasswords() {
  if (!hayCrypto()) return;
  let cambio = false;
  for (const u of DB.usuarios) {
    if (u.password && !u.hash) { await fijarPassword(u, u.password); cambio = true; }
  }
  if (cambio) guardar();
}

// La sesión nunca guarda contraseña ni hash
const sesionSegura = u => JSON.stringify({ ...u, password: undefined, hash: undefined, salt: undefined, iter: undefined });

/* ============ LOGIN ============ */
let intentosFallidos = 0, bloqueadoHasta = 0;

async function hacerLogin() {
  if (Date.now() < bloqueadoHasta) return toast("⏳ Demasiados intentos. Espera unos segundos");
  const u = $("#user").value.trim();
  const p = $("#pass").value;
  const user = DB.usuarios.find(x => x.username === u);
  if (!user || !(await verificarPassword(user, p))) {
    if (++intentosFallidos >= 5) { bloqueadoHasta = Date.now() + 30000; intentosFallidos = 0; }
    return toast("❌ Usuario o contraseña incorrectos");
  }
  intentosFallidos = 0;
  if (!user.hash && user.password) { await fijarPassword(user, p); guardar(); }
  sessionStorage.setItem("sesion", sesionSegura(user));
  $("#pass").value = "";
  entrarApp();
}

/* ============ CAMBIO DE CONTRASEÑA INICIAL ============ */
function abrirCambioInicial() {
  abrirModal("🔑 Cambia tu contraseña inicial", `
    <p style="color:#64748b;font-size:13px;margin-bottom:10px">Estás usando la contraseña por defecto. Elige una nueva para proteger tu sistema.</p>
    <label>Nueva contraseña (mín. 6 caracteres)</label><input id="ciNueva" type="password" autocomplete="new-password">
    <label>Repítela</label><input id="ciConfirm" type="password" autocomplete="new-password">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal();pedirFondoSiFalta()">Después</button>
      <button class="btn-primary" onclick="guardarCambioInicial()">Guardar</button>
    </div>
  `);
}

async function guardarCambioInicial() {
  const n = $("#ciNueva").value, c = $("#ciConfirm").value;
  if (n.length < 6) return toast("⚠️ Mínimo 6 caracteres");
  if (n === "admin123") return toast("⚠️ Elige una contraseña distinta a la inicial");
  if (n !== c) return toast("❌ Las contraseñas no coinciden");
  const s = JSON.parse(sessionStorage.getItem("sesion") || "{}");
  const user = DB.usuarios.find(x => x.id === s.id);
  if (!user) return;
  await fijarPassword(user, n);
  delete user.cambiarPass;
  guardar();
  sessionStorage.setItem("sesion", sesionSegura(user));
  cerrarModal();
  toast("✅ Contraseña actualizada");
  pedirFondoSiFalta();
}

function pedirFondoSiFalta() {
  if (estadoCajaHoy.fondoInicial === null) setTimeout(() => abrirFondoInicial(), 300);
}

function logout() {
  sessionStorage.removeItem("sesion");
  $("#app").classList.add("oculto");
  $("#login").style.display = "flex";

  carrito = []; descuento = 0; descuentoPct = 0; propina = 0;
  const pD = $("#panelDescuento");
  const pP = $("#panelPropina");
  const tD = $("#toggleDescuento");
  const tP = $("#togglePropina");
  if (pD) pD.classList.add("oculto");
  if (pP) pP.classList.add("oculto");
  if (tD) tD.classList.remove("activo");
  if (tP) tP.classList.remove("activo");
  renderCarrito();
}

function entrarApp() {
  const s = JSON.parse(sessionStorage.getItem("sesion") || "{}");
  $("#login").style.display = "none";
  $("#app").classList.remove("oculto");
  seed();
  actualizarHeader();
  renderCaja();
  renderCategorias();
  cargarNegocio();
  initDia();
  mostrarAlertaStock();
  if (s.cambiarPass) setTimeout(abrirCambioInicial, 600);
  else if (estadoCajaHoy.fondoInicial === null) {
    setTimeout(() => abrirFondoInicial(), 600);
  }
}
