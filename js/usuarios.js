/* ============================================
   USUARIOS.JS — Roles, permisos, PIN de supervisor y bitácora
   Roles: admin · encargado · cajero
   - Cada función sensible se "envuelve" aquí: la verificación vive DENTRO de la función
     (no basta con ocultar botones).
   - Control dentro de la app: protege contra errores y abusos casuales del personal.
   ============================================ */

const ROLES = { admin: "Administrador", encargado: "Encargado", cajero: "Cajero" };
const ROL_ICONO = { admin: "👑", encargado: "🧑‍🍳", cajero: "🧾" };
const DESCUENTO_MAX_CAJERO = 10;   // % que un cajero puede dar sin autorización
const BITACORA_MAX = 1000;         // registros que se conservan

// permiso → roles que lo tienen
const PERMISOS = {
  cancelar_venta:     ["encargado", "admin"],
  eliminar_venta:     ["admin"],
  descuento_libre:    ["encargado", "admin"],
  gasto_registrar:    ["encargado", "admin"],
  gasto_eliminar:     ["admin"],
  historial_completo: ["encargado", "admin"],
  catalogo:           ["encargado", "admin"],   // productos, precios, recetas, inventario, categorías de gasto
  ver_reportes:       ["encargado", "admin"],
  caja_fuerte:        ["admin"],
  config_total:       ["admin"]                 // configuración, usuarios, respaldo, archivo, papelera, sincronización
};
// vista → permiso necesario (las no listadas son para todos los roles)
const VISTAS_PERMISO = { inventario: "catalogo", productos: "catalogo", panelVentas: "ver_reportes", reportes: "ver_reportes", papelera: "config_total" };

/* ---------- sesión y permisos ---------- */
function sesionActual() { try { return JSON.parse(sessionStorage.getItem("sesion") || "{}"); } catch (_) { return {}; } }
function usuarioActual() { const s = sesionActual(); return (s.id != null && DB.usuarios.find(u => u.id === s.id)) || s; }
const rolDe = u => (u && u.rol) || "admin"; // usuarios anteriores a esta versión no tenían rol: eran administradores
function rolActual() { const u = usuarioActual(); return u && (u.id != null || u.username) ? rolDe(u) : null; }
const puedeRol = (rol, permiso) => (PERMISOS[permiso] || []).includes(rol);
const puede = permiso => puedeRol(rolActual(), permiso);
const vistaPermitida = v => !VISTAS_PERMISO[v] || puede(VISTAS_PERMISO[v]);
const nombreActual = () => { const u = usuarioActual(); return u.nombre || u.username || "—"; };
const pad6 = id => String(id).padStart(6, "0");
function denegar() { toast("🔒 No tienes permiso para esta acción"); }

/* ---------- bitácora ---------- */
const BIT_CATS = { ventas: "🧾 Ventas", caja: "💰 Caja", inventario: "📦 Inventario", catalogo: "🍗 Catálogo", usuarios: "👥 Usuarios", sistema: "⚙️ Sistema" };
function registrarBitacora(cat, accion, detalle, extra) {
  try {
    const lista = LS.get("bitacora", []);
    const u = usuarioActual();
    lista.push({
      id: nuevoId(lista), fecha: new Date().toISOString(), cat, accion,
      detalle: String(detalle || "").slice(0, 240),
      usuario: u.nombre || u.username || "(sin sesión)", rol: (u.id != null || u.username) ? rolDe(u) : "",
      ...(extra || {})
    });
    if (lista.length > BITACORA_MAX) lista.splice(0, lista.length - BITACORA_MAX);
    LS.set("bitacora", lista);
  } catch (e) { console.warn("Bitácora:", e); }
}

/* ---------- autorización de supervisor ---------- */
const autorizaciones = {};           // permiso → { nombre, hasta }
let supFallos = 0, supBloqueo = 0;
const tokenVigente = permiso => { const t = autorizaciones[permiso]; return t && t.hasta > Date.now() ? t : null; };

async function verificarSupervisor(permiso, pass) {
  if (Date.now() < supBloqueo) return { bloqueado: true };
  for (const u of DB.usuarios) {
    if (u.activo === false || !puedeRol(rolDe(u), permiso)) continue;
    if (await verificarPassword(u, pass)) { supFallos = 0; return u; }
  }
  registrarBitacora("sistema", "Autorización de supervisor fallida", "Contraseña incorrecta");
  if (++supFallos >= 3) { supBloqueo = Date.now() + 30000; supFallos = 0; }
  return null;
}

function pedirSupervisor(permiso, detalle) {
  return new Promise(resolve => {
    abrirModal("🔐 Autorización de supervisor", `
      <p style="font-size:14px;margin-bottom:4px"><b>${escapeHTML(detalle || "Acción restringida")}</b></p>
      <p style="color:var(--texto-suave,#64748b);font-size:13px;margin-bottom:10px">Pide a un encargado o administrador que escriba su contraseña.</p>
      <input id="supPass" type="password" placeholder="Contraseña de supervisor" autocomplete="new-password">
      <div class="acciones">
        <button class="btn-secondary" id="supCancel">Cancelar</button>
        <button class="btn-primary" id="supOk">Autorizar</button>
      </div>`);
    const inp = document.getElementById("supPass");
    const fin = r => { cerrarModal(); resolve(r); };
    document.getElementById("supCancel").onclick = () => fin(null);
    const probar = async () => {
      const r = await verificarSupervisor(permiso, inp.value);
      if (r && r.bloqueado) return toast("⏳ Demasiados intentos. Espera unos segundos");
      if (!r) { inp.value = ""; inp.focus(); return toast("❌ Contraseña de supervisor incorrecta"); }
      fin(r);
    };
    document.getElementById("supOk").onclick = probar;
    inp.onkeydown = e => { if (e.key === "Enter") probar(); };
    setTimeout(() => inp.focus(), 60);
  });
}

/* ---------- envoltorio: verificación dentro de cada función ---------- */
const SIN_PIN = {}; // nombre de función → permiso (para ocultar sus botones)
function proteger(nombre, permiso, opc) {
  opc = opc || {};
  const orig = window[nombre];
  if (typeof orig !== "function" || orig._protegida) return;
  if (permiso && !opc.pin) SIN_PIN[nombre] = permiso;
  const envuelta = function (...args) {
    const correr = auth => {
      if (opc.pre && opc.pre(...args) === false) return;
      const antes = opc.antes ? opc.antes(...args) : undefined;
      const r = orig.apply(this, args);
      const fin = res => {
        try {
          if (opc.log) { const l = opc.log(args, antes, res); if (l) registrarBitacora(l[0], l[1], l[2], { ...(l[3] || {}), ...(auth ? { autorizadoPor: auth.nombre } : {}) }); }
          if (opc.despues) opc.despues(args, antes, auth);
          if (auth && opc.consumir && (!opc.exito || opc.exito(args, antes))) delete autorizaciones[permiso];
        } catch (e) { console.warn("Permisos:", e); }
        return res;
      };
      return r && typeof r.then === "function" ? r.then(fin) : fin(r);
    };
    if (!permiso || puede(permiso)) return correr(null);
    const tk = tokenVigente(permiso);
    if (opc.pin && tk) return correr(tk);
    if (opc.pin) {
      const detalle = typeof opc.detalle === "function" ? opc.detalle(...args) : (opc.detalle || "");
      return pedirSupervisor(permiso, detalle).then(sup => {
        if (!sup) return;
        autorizaciones[permiso] = { nombre: sup.nombre || sup.username, hasta: Date.now() + (opc.ttl || 180000) };
        registrarBitacora("sistema", "Autorización de supervisor", `${detalle} · autorizó ${sup.nombre || sup.username}`, { autorizadoPor: sup.nombre || sup.username });
        return correr(autorizaciones[permiso]);
      });
    }
    denegar(permiso);
  };
  envuelta._protegida = true;
  window[nombre] = envuelta;
}

/* ---------- qué función se protege y qué se registra ---------- */
function instalarProtecciones() {
  const ventaDe = id => DB.ventas.find(v => String(v.id) === String(id));
  const cfSnap = () => LS.get("cajaFuerteMovimientos", []).length + "|" + LS.get("cajaFuerteSaldoAjuste", 0) + "|" + DB.gastos.length;

  // Ventas
  proteger("abrirCancelarVenta", "cancelar_venta", { pin: true, detalle: id => "Cancelar ticket #" + pad6(id) });
  proteger("confirmarCancelarVenta", "cancelar_venta", {
    pin: true, consumir: true, detalle: id => "Cancelar ticket #" + pad6(id),
    antes: id => { const v = ventaDe(id); return !!(v && v.cancelada); },
    exito: (a) => { const v = ventaDe(a[0]); return !!(v && v.cancelada); },
    log: (a, ya) => { const v = ventaDe(a[0]); return v && v.cancelada && !ya ? ["ventas", "Venta cancelada", `Ticket #${pad6(v.id)} · ${fmt(v.total)} · Motivo: ${v.motivoCancelacion || "—"}`] : null; },
    despues: (a, ya, auth) => { const v = ventaDe(a[0]); if (auth && v && v.cancelada && !ya) { v.autorizadoPor = auth.nombre; guardar(); } }
  });
  proteger("eliminarTicketHistorial", "eliminar_venta", {
    antes: id => { const v = ventaDe(id); return v ? { ...v } : null; },
    log: (a, v) => v && !ventaDe(a[0]) ? ["ventas", "Ticket eliminado", `#${pad6(v.id)} · ${fmt(v.total)}${v.cancelada ? " (ya cancelado)" : ""}`] : null
  });

  // Gastos
  proteger("abrirFormGasto", "gasto_registrar", {
    pin: true, detalle: "Registrar un gasto",
    despues: () => { if (!puede("caja_fuerte")) { const o = document.querySelector('#fgMetodo option[value="Caja Fuerte"]'); if (o) o.remove(); } }
  });
  proteger("guardarGasto", "gasto_registrar", {
    pin: true, consumir: true, detalle: "Registrar un gasto",
    pre: () => { const m = document.getElementById("fgMetodo"); if (m && m.value === "Caja Fuerte" && !puede("caja_fuerte")) { toast("🔒 Solo el administrador puede usar Caja Fuerte"); return false; } },
    antes: () => DB.gastos.length,
    exito: (a, n) => DB.gastos.length > n,
    log: (a, n) => { if (DB.gastos.length <= n) return null; const g = DB.gastos[DB.gastos.length - 1]; return ["caja", "Gasto registrado", `${g.categoria} · ${fmt(g.monto)} · ${g.metodo}${g.nota ? " · " + g.nota : ""}`]; }
  });
  proteger("borrarGasto", "gasto_eliminar", {
    antes: id => { const g = DB.gastos.find(x => String(x.id) === String(id)); return g ? { ...g } : null; },
    log: (a, g) => g && !DB.gastos.some(x => String(x.id) === String(a[0])) ? ["caja", "Gasto eliminado", `${g.categoria} · ${fmt(g.monto)}`] : null
  });
  ["irACategoriasGastos", "agregarCategoria", "borrarCategoria"].forEach(n => proteger(n, "catalogo"));

  // Catálogo e inventario
  ["abrirFormProducto", "abrirReceta", "agregarItemReceta", "actualizarCantidadReceta", "borrarItemReceta", "abrirFormInsumo", "abrirMovimiento"].forEach(n => proteger(n, "catalogo"));
  proteger("guardarProducto", "catalogo", {
    antes: id => ({ p: id ? JSON.parse(JSON.stringify(DB.productos.find(x => x.id === id) || null)) : null, n: DB.productos.length }),
    log: (a, b) => {
      if (a[0]) {
        const p = DB.productos.find(x => x.id === a[0]); if (!p || !b.p) return null;
        const c = [];
        if (p.precio !== b.p.precio) c.push(`precio ${fmt(b.p.precio)} → ${fmt(p.precio)}`);
        if (p.nombre !== b.p.nombre) c.push(`nombre "${b.p.nombre}" → "${p.nombre}"`);
        if (p.activo !== b.p.activo) c.push(p.activo ? "activado" : "desactivado");
        return c.length ? ["catalogo", "Producto modificado", `${p.nombre}: ${c.join(", ")}`] : null;
      }
      if (DB.productos.length > b.n) { const p = DB.productos[DB.productos.length - 1]; return ["catalogo", "Producto creado", `${p.nombre} · ${fmt(p.precio)}`]; }
      return null;
    }
  });
  proteger("toggleProducto", "catalogo", {
    antes: id => { const p = DB.productos.find(x => x.id === id); return p ? p.activo : null; },
    log: (a, ya) => { const p = DB.productos.find(x => x.id === a[0]); return p && ya !== null && p.activo !== ya ? ["catalogo", p.activo ? "Producto activado" : "Producto desactivado", p.nombre] : null; }
  });
  proteger("borrarProducto", "catalogo", {
    antes: id => { const p = DB.productos.find(x => x.id === id); return p ? { ...p } : null; },
    log: (a, p) => p && !DB.productos.some(x => x.id === a[0]) ? ["catalogo", "Producto eliminado", p.nombre] : null
  });
  proteger("guardarReceta", "catalogo", { log: a => { const p = DB.productos.find(x => x.id === a[0]); return p ? ["catalogo", "Receta actualizada", p.nombre] : null; } });
  proteger("guardarInsumo", "catalogo", {
    antes: () => JSON.stringify(DB.insumos),
    log: (a, ya) => JSON.stringify(DB.insumos) !== ya ? ["inventario", a[0] ? "Insumo modificado" : "Insumo creado", (DB.insumos.find(i => i.id === a[0]) || DB.insumos[DB.insumos.length - 1] || {}).nombre || ""] : null
  });
  proteger("aplicarMovimiento", "catalogo", {
    antes: () => { const el = id => document.getElementById(id); const id = +(el("mvInsumo") || {}).value; const i = DB.insumos.find(x => x.id === id); return i ? { id, nombre: i.nombre, stock: i.stock, tipo: (el("mvTipo") || {}).value, motivo: ((el("mvMotivo") || {}).value || "").trim() } : null; },
    log: (a, b) => { if (!b) return null; const i = DB.insumos.find(x => x.id === b.id); return i && i.stock !== b.stock ? ["inventario", "Movimiento de inventario", `${b.nombre}: ${b.stock} → ${i.stock} (${b.tipo})${b.motivo ? " · " + b.motivo : ""}`] : null; }
  });
  proteger("borrarInsumo", "catalogo", {
    antes: id => { const i = DB.insumos.find(x => x.id === id); return i ? { ...i } : null; },
    log: (a, i) => i && !DB.insumos.some(x => x.id === a[0]) ? ["inventario", "Insumo eliminado", i.nombre] : null
  });

  // Caja fuerte (solo administrador)
  ["abrirCajaFuerte", "abrirGestorGastosPersonales", "cambiarFechaCajaFuerte", "limpiarFiltroCajaFuerte", "abrirEditarSaldoCajaFuerte", "abrirFormularioCajaFuerte", "guardarGastoPersonal", "borrarGastoPersonal"].forEach(n => proteger(n, "caja_fuerte"));
  ["guardarSaldoCajaFuerte", "guardarMovimientoCajaFuerte", "borrarMovimientoCajaFuerte"].forEach(n => proteger(n, "caja_fuerte", {
    antes: () => cfSnap(), log: (a, ya) => cfSnap() !== ya ? ["caja", "Caja fuerte: " + ({ guardarSaldoCajaFuerte: "saldo ajustado", guardarMovimientoCajaFuerte: "movimiento registrado", borrarMovimientoCajaFuerte: "movimiento eliminado" }[n])  , ""] : null
  }));

  // Historial y reportes
  proteger("exportarHistorial", "historial_completo");
  proteger("exportarCSV", "ver_reportes");

  // Configuración (solo administrador)
  ["previsualizarLogoNegocio", "conectarSync", "sincronizarAhora", "alternarRespaldoAutoCorte"].forEach(n => proteger(n, "config_total"));
  proteger("guardarNegocio", "config_total", { antes: () => JSON.stringify(DB.negocio), log: (a, ya) => JSON.stringify(DB.negocio) !== ya ? ["sistema", "Datos del negocio modificados", DB.negocio.nombre || ""] : null });
  proteger("eliminarLogoNegocio", "config_total", { log: () => ["sistema", "Logotipo eliminado", ""] });
  proteger("exportarBackup", "config_total", { log: () => ["sistema", "Respaldo exportado", ""] });
  proteger("importarBackup", "config_total", { log: () => ["sistema", "Importación de respaldo solicitada", ""] });
  proteger("borrarProductosInsumos", "config_total", { antes: () => DB.productos.length + DB.insumos.length, log: (a, n) => DB.productos.length + DB.insumos.length < n ? ["sistema", "Productos e insumos borrados", `${n} registros`] : null });
  proteger("borrarVentasGastos", "config_total", { antes: () => DB.ventas.length + DB.gastos.length, log: (a, n) => DB.ventas.length + DB.gastos.length < n ? ["sistema", "Ventas y gastos borrados", `${n} registros`] : null });
  proteger("borrarTodo", "config_total", { log: () => ["sistema", "Borrado total solicitado", ""] });
  proteger("archivarVentasAntiguas", "config_total", { antes: () => DB.ventas.length + DB.gastos.length, log: (a, n) => DB.ventas.length + DB.gastos.length < n ? ["sistema", "Ventas antiguas archivadas", `${n - DB.ventas.length - DB.gastos.length} registros`] : null });
  proteger("desconectarSync", "config_total", { log: () => (typeof syncMeta !== "undefined" && !syncMeta.activo) ? ["sistema", "Sincronización desconectada", ""] : null });
  proteger("restaurarDePapelera", "config_total");
  proteger("confirmarRestaurarPapelera", "config_total", { antes: () => papeleraLocal().length, log: (a, n) => papeleraLocal().length < n ? ["sistema", "Registro restaurado de la papelera", ""] : null });
  proteger("vaciarPapelera", "config_total", { antes: () => papeleraLocal().length, log: (a, n) => papeleraLocal().length < n ? ["sistema", "Papelera vaciada", `${n} registros`] : null });
  ["abrirFormUsuario", "guardarUsuario", "abrirRestablecerPassword", "guardarPasswordUsuario", "alternarUsuarioActivo", "renderUsuarios", "renderBitacora"].forEach(n => proteger(n, "config_total"));

  // Sin permiso propio, pero con registro
  proteger("guardarCorte", null, {
    antes: () => LS.get("cortes", []).length,
    log: (a, n) => { const c = LS.get("cortes", []); if (c.length <= n) return null; const k = c[c.length - 1]; return ["caja", Math.abs(k.diferencia) >= 0.01 ? "Corte con diferencia" : "Corte de caja", `Esperado ${fmt(k.esperado)} · contado ${fmt(k.contado)} · diferencia ${fmt(k.diferencia)}`]; }
  });
  proteger("finalizarVenta", null, {
    antes: () => ({ n: DB.ventas.length, desc: descuento, pct: descuentoPct, tk: tokenVigente("descuento_libre") }),
    log: (a, b) => { if (DB.ventas.length <= b.n || !(b.desc > 0)) return null; const v = DB.ventas[DB.ventas.length - 1]; return ["ventas", "Descuento aplicado", `Ticket #${pad6(v.id)} · ${b.pct}% (−${fmt(b.desc)})${b.tk ? " · autorizó " + b.tk.nombre : ""}`, b.tk ? { autorizadoPor: b.tk.nombre } : undefined]; },
    despues: (a, b) => { if (DB.ventas.length > b.n) { if (b.tk && b.desc > 0) { const v = DB.ventas[DB.ventas.length - 1]; v.descuentoAutorizadoPor = b.tk.nombre; guardar(); } delete autorizaciones.descuento_libre; } }
  });
  proteger("limpiarCarrito", null, { despues: () => { delete autorizaciones.descuento_libre; } });

  // Descuento: el cajero llega hasta DESCUENTO_MAX_CAJERO %; más requiere supervisor
  const descOrig = window.aplicarDescuento;
  if (typeof descOrig === "function" && !descOrig._protegida) {
    window.aplicarDescuento = function (pct) {
      if (puede("descuento_libre") || (Number(pct) || 0) <= DESCUENTO_MAX_CAJERO || tokenVigente("descuento_libre")) return descOrig(pct);
      return pedirSupervisor("descuento_libre", `Descuento del ${pct}% (el cajero puede dar hasta ${DESCUENTO_MAX_CAJERO}%)`).then(sup => {
        if (!sup) return;
        autorizaciones.descuento_libre = { nombre: sup.nombre || sup.username, hasta: Date.now() + 600000 };
        registrarBitacora("sistema", "Autorización de supervisor", `Descuento del ${pct}% · autorizó ${sup.nombre || sup.username}`, { autorizadoPor: sup.nombre || sup.username });
        return descOrig(pct);
      });
    };
    window.aplicarDescuento._protegida = true;
  }

  // Cajero: solo ve el día de hoy en historial, cortes y gastos
  const restringirHoy = (nombre, antes, despues) => {
    const o = window[nombre]; if (typeof o !== "function") return;
    window[nombre] = function (...a) { if (puede("historial_completo")) { const r = o.apply(this, a); if (despues) despues(true); return r; } if (antes) antes(a); const r = o.apply(this, a); if (despues) despues(false); return r; };
  };
  restringirHoy("renderHistorial", a => { window._fechaHistorialTickets = hoy(); a[0] = undefined; }, ok => { const s = document.getElementById("histFecha"); if (s) s.disabled = !ok; });
  restringirHoy("renderHistorialCortes", a => { window._fechaHistorialCortes = hoy(); a[0] = undefined; });
  const rg = window.renderGastos;
  if (typeof rg === "function") window.renderGastos = function (...a) {
    if (puede("historial_completo")) return rg.apply(this, a);
    const real = DB.gastos; DB.gastos = real.filter(g => fechaLocal(g.fecha) === hoy());
    try { return rg.apply(this, a); } finally { DB.gastos = real; }
  };
}

/* ---------- navegación y botones según el rol ---------- */
function aplicarPermisosUI() {
  document.querySelectorAll("[data-permiso]").forEach(el => { el.style.display = puede(el.dataset.permiso) ? "" : "none"; });
  document.querySelectorAll("[onclick]").forEach(el => {
    // El menú inferior se controla exclusivamente desde aplicarMenuInferior().
    // Evita que el observador de permisos oculte un icono después del primer clic.
    if (el.closest(".nav-inferior") && el.hasAttribute("data-menu")) return;
    const c = el.getAttribute("onclick") || "";
    let perm = null;
    const v = c.match(/cambiarVista\('(\w+)'\)/);
    if (v && VISTAS_PERMISO[v[1]]) perm = VISTAS_PERMISO[v[1]];
    else { const f = c.match(/^\s*(?:cerrarModal\(\);\s*)?([A-Za-z_$][\w$]*)\s*\(/); if (f && SIN_PIN[f[1]]) perm = SIN_PIN[f[1]]; }
    if (perm && !puede(perm)) { el.style.display = "none"; el.dataset.ocultoPorRol = "1"; }
    else if (el.dataset.ocultoPorRol) { el.style.display = ""; delete el.dataset.ocultoPorRol; }
  });
}

function instalarNavegacion() {
  const cv = window.cambiarVista;
  window.cambiarVista = function (nombre) {
    const u = usuarioActual();
    if (u && u.id != null && u.activo === false && typeof logout === "function") { toast("🚫 Tu usuario fue desactivado"); return logout(); }
    if (!vistaPermitida(nombre)) { toast("🔒 No tienes permiso para esa sección"); nombre = "caja"; }
    const r = cv(nombre);
    aplicarPermisosUI();
    if (nombre === "config" && puede("config_total")) { renderUsuarios(); renderBitacora(); }
    return r;
  };
  const am = window.aplicarMenuInferior;
  window.aplicarMenuInferior = function () {
    // Primero, ui.js aplica la selección guardada del administrador y mantiene Venta fija.
    if (typeof am === "function") am();
    const nav = document.querySelector(".nav-inferior"); if (!nav) return;
    const botones = [...nav.querySelectorAll("button[data-menu]")];
    // Importante: no volver a mostrar botones que el administrador quitó del menú.
    // Esta capa solo puede ocultar opciones no autorizadas; nunca agregar opciones.
    botones.forEach(b => {
      if (!vistaPermitida(b.dataset.menu)) b.style.display = "none";
    });
    // Venta es el acceso fijo y predeterminado, incluso si la configuración guardada está dañada.
    const venta = nav.querySelector('button[data-menu="caja"]');
    if (venta) {
      venta.style.display = "";
      nav.prepend(venta);
    }
    const visibles = botones.filter(b => b.style.display !== "none");
    nav.style.display = "flex";
    nav.style.flexWrap = "nowrap";
    nav.style.gridTemplateColumns = "none";
    nav.style.justifyContent = "space-around";
    nav.style.overflowX = "hidden";
    visibles.forEach(b => {
      b.style.flex = `1 1 0`;
      b.style.minWidth = "0";
      b.style.width = "auto";
    });
  };
  const ea = window.entrarApp;
  window.entrarApp = function () {
    const r = ea();
    const activa = document.querySelector(".vista.activa");
    if (activa && !vistaPermitida(activa.id)) cambiarVista("caja"); else aplicarPermisosUI();
    return r;
  };
  const om = window.abrirMenu;
  window.abrirMenu = function () { const r = om(); aplicarPermisosUI(); return r; };
  if (typeof MutationObserver !== "undefined" && document.body) {
    let pend = false;
    new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; aplicarPermisosUI(); }); })
      .observe(document.body, { childList: true, subtree: true });
  }
}

/* ============ PANTALLA DE USUARIOS ============ */
const adminsActivos = excluirId => DB.usuarios.filter(u => rolDe(u) === "admin" && u.activo !== false && u.id !== excluirId).length;

function renderUsuarios() {
  const el = document.getElementById("listaUsuarios"); if (!el) return;
  const yo = usuarioActual();
  el.innerHTML = DB.usuarios.map(u => {
    const rol = rolDe(u), inactivo = u.activo === false;
    return `<div style="display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--borde,#e2e8f0);${inactivo ? "opacity:.55" : ""}">
      <span style="font-size:22px">${ROL_ICONO[rol] || "👤"}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700">${escapeHTML(u.nombre || u.username)}${u.id === yo.id ? " <small>(tú)</small>" : ""}</div>
        <div style="font-size:12px;color:var(--texto-suave,#64748b)">@${escapeHTML(u.username)} · ${ROLES[rol] || rol}${inactivo ? " · desactivado" : ""}${u.cambiarPass ? " · contraseña temporal" : ""}</div>
      </div>
      <button class="btn-mini" aria-label="Editar" onclick="abrirFormUsuario(${u.id})">✏️</button>
      <button class="btn-mini" aria-label="Restablecer contraseña" onclick="abrirRestablecerPassword(${u.id})">🔑</button>
      <button class="btn-mini" aria-label="${inactivo ? "Activar" : "Desactivar"}" onclick="alternarUsuarioActivo(${u.id})">${inactivo ? "▶️" : "⏸️"}</button>
    </div>`;
  }).join("") || `<p style="color:var(--texto-suave,#64748b);font-size:13px">Aún no hay usuarios.</p>`;
}

function abrirFormUsuario(id) {
  const u = id ? DB.usuarios.find(x => x.id === id) : null;
  if (id && !u) return toast("⚠️ Usuario no encontrado");
  const rol = u ? rolDe(u) : "cajero";
  abrirModal(u ? "✏️ Editar usuario" : "➕ Nuevo usuario", `
    <label>Nombre</label><input id="uNombre" value="${escapeHTML(u ? u.nombre || "" : "")}" placeholder="Ej. María López">
    <label>Usuario (para iniciar sesión, sin espacios)</label><input id="uUsuario" value="${escapeHTML(u ? u.username : "")}" autocapitalize="off" autocomplete="off">
    <label>Rol</label>
    <select id="uRol">${Object.keys(ROLES).map(r => `<option value="${r}" ${r === rol ? "selected" : ""}>${ROL_ICONO[r]} ${ROLES[r]}</option>`).join("")}</select>
    ${u ? "" : `<label>Contraseña temporal (mín. 6 caracteres)</label><input id="uPass" type="password" autocomplete="new-password"><p style="font-size:12px;color:var(--texto-suave,#64748b)">Se le pedirá cambiarla en su primer ingreso.</p>`}
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarUsuario(${id || "null"})">Guardar</button>
    </div>`);
}

async function guardarUsuario(id) {
  const nombre = document.getElementById("uNombre").value.trim();
  const username = document.getElementById("uUsuario").value.trim();
  const rol = document.getElementById("uRol").value;
  if (!nombre) return toast("⚠️ Escribe el nombre");
  if (!/^\S{3,30}$/.test(username)) return toast("⚠️ El usuario debe tener de 3 a 30 caracteres y no llevar espacios");
  if (!ROLES[rol]) return toast("⚠️ Rol no válido");
  if (DB.usuarios.some(x => x.id !== id && x.username.toLowerCase() === username.toLowerCase())) return toast("⚠️ Ya existe un usuario con ese nombre de acceso");

  if (id) {
    const u = DB.usuarios.find(x => x.id === id); if (!u) return;
    if (rolDe(u) === "admin" && rol !== "admin" && u.activo !== false && adminsActivos(id) === 0) return toast("⚠️ Debe quedar al menos un administrador activo");
    if (u.id === sesionActual().id && rolDe(u) === "admin" && rol !== "admin" && !confirm("Vas a quitarte el rol de administrador a ti mismo. Perderás acceso a esta pantalla.\n\n¿Continuar?")) return;
    const antes = `${u.nombre} (@${u.username}, ${rolDe(u)})`;
    Object.assign(u, { nombre, username, rol });
    guardar();
    if (u.id === sesionActual().id) sessionStorage.setItem("sesion", sesionSegura(u));
    registrarBitacora("usuarios", "Usuario modificado", `${antes} → ${nombre} (@${username}, ${rol})`);
  } else {
    const pass = document.getElementById("uPass").value;
    if (pass.length < 6) return toast("⚠️ La contraseña debe tener mínimo 6 caracteres");
    const u = { id: nuevoId(DB.usuarios), username, nombre, rol, cambiarPass: true };
    await fijarPassword(u, pass);
    DB.usuarios.push(u);
    guardar();
    registrarBitacora("usuarios", "Usuario creado", `${nombre} (@${username}, ${rol})`);
  }
  cerrarModal(); renderUsuarios(); toast("✅ Usuario guardado");
}

function abrirRestablecerPassword(id) {
  const u = DB.usuarios.find(x => x.id === id); if (!u) return;
  abrirModal("🔑 Restablecer contraseña", `
    <p style="font-size:14px;margin-bottom:8px">Usuario: <b>${escapeHTML(u.nombre || u.username)}</b></p>
    <label>Nueva contraseña temporal (mín. 6 caracteres)</label><input id="rpPass" type="password" autocomplete="new-password">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarPasswordUsuario(${id})">Guardar</button>
    </div>`);
}
async function guardarPasswordUsuario(id) {
  const u = DB.usuarios.find(x => x.id === id); if (!u) return;
  const p = document.getElementById("rpPass").value;
  if (p.length < 6) return toast("⚠️ Mínimo 6 caracteres");
  await fijarPassword(u, p);
  u.cambiarPass = true;
  guardar();
  registrarBitacora("usuarios", "Contraseña restablecida", `${u.nombre || u.username} (@${u.username})`);
  cerrarModal(); renderUsuarios(); toast("✅ Contraseña restablecida. Deberá cambiarla al entrar");
}

function alternarUsuarioActivo(id) {
  const u = DB.usuarios.find(x => x.id === id); if (!u) return;
  const activando = u.activo === false;
  if (!activando) {
    if (u.id === sesionActual().id) return toast("⚠️ No puedes desactivar tu propio usuario");
    if (rolDe(u) === "admin" && adminsActivos(id) === 0) return toast("⚠️ Debe quedar al menos un administrador activo");
    if (!confirm(`¿Desactivar a ${u.nombre || u.username}? Ya no podrá iniciar sesión.`)) return;
  }
  u.activo = activando ? true : false;
  guardar();
  registrarBitacora("usuarios", activando ? "Usuario activado" : "Usuario desactivado", `${u.nombre || u.username} (@${u.username})`);
  renderUsuarios();
}

/* ============ PANTALLA DE BITÁCORA ============ */
function renderBitacora() {
  const el = document.getElementById("listaBitacora"); if (!el) return;
  const sel = document.getElementById("bitFiltro");
  const filtro = sel ? sel.value : "";
  const lista = LS.get("bitacora", []).slice().reverse().filter(b => !filtro || b.cat === filtro).slice(0, 100);
  el.innerHTML = lista.length ? lista.map(b => `
    <div style="padding:8px 0;border-bottom:1px solid var(--borde,#e2e8f0);font-size:13px">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${escapeHTML(b.accion)}</b>
        <span style="color:var(--texto-suave,#64748b);white-space:nowrap;font-size:12px">${new Date(b.fecha).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
      ${b.detalle ? `<div>${escapeHTML(b.detalle)}</div>` : ""}
      <div style="font-size:12px;color:var(--texto-suave,#64748b)">${escapeHTML(BIT_CATS[b.cat] || b.cat)} · ${escapeHTML(b.usuario)}${b.rol ? " (" + escapeHTML(ROLES[b.rol] || b.rol) + ")" : ""}${b.autorizadoPor ? " · ✔ autorizó " + escapeHTML(b.autorizadoPor) : ""}</div>
    </div>`).join("")
    : `<p style="color:var(--texto-suave,#64748b);font-size:13px">Sin registros${filtro ? " en esta categoría" : ""}.</p>`;
}

/* ============ ARRANQUE ============ */
instalarProtecciones();
instalarNavegacion();
