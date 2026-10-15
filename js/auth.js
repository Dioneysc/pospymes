/* ============================================
   AUTH.JS — LOGIN, LOGOUT Y SESIÓN
   ============================================ */

/* ============ LOGIN ============ */
function hacerLogin() {
  const u = $("#user").value.trim();
  const p = $("#pass").value;
  const user = DB.usuarios.find(x => x.username === u && x.password === p);
  if (!user) return toast("❌ Usuario o contraseña incorrectos");
  sessionStorage.setItem("sesion", JSON.stringify({ ...user, password: undefined }));
  entrarApp();
}

function logout() {
  sessionStorage.removeItem("sesion");
  $("#app").classList.add("oculto");
  $("#login").style.display = "flex";

  carrito = []; descuento = 0; propina = 0;
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
  if (estadoCajaHoy.fondoInicial === null) {
    setTimeout(() => abrirFondoInicial(), 600);
  }
}
