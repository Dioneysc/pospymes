/* ============================================
   UI.JS — HEADER, NAVEGACIÓN, MENÚ Y ALERTA DE STOCK
   ============================================ */

/* ============ HEADER ============ */
function actualizarHeader() {
  const n = DB.negocio;
  const nombre = (n.nombre || "POS").toUpperCase();
  const slogan = n.slogan || "Sistema de venta";

  const elTopNombre = $("#topbarNombre");
  const elTopSlogan = $("#topbarSlogan");
  if (elTopNombre) elTopNombre.textContent = nombre;
  if (elTopSlogan) elTopSlogan.textContent = slogan;
  const elLogo = document.querySelector(".brand-logo");
  if (elLogo) {
    const logoLocal = typeof obtenerLogoNegocio === "function" ? obtenerLogoNegocio() : "";
    elLogo.src = logoLocal || "logo.png";
    elLogo.style.display = "block";
    elLogo.onerror = () => { elLogo.style.display = "none"; };
  }
  document.title = "🧮 " + nombre;

  const elLoginNombre = $("#loginNombre");
  const elLoginSlogan = $("#loginSlogan");
  if (elLoginNombre) elLoginNombre.textContent = "🍗 " + (n.nombre || "POS");
  if (elLoginSlogan) elLoginSlogan.textContent = slogan;
}

/* ============ NAVEGACIÓN ============ */
function cambiarVista(nombre) {
  if (typeof aplicarMenuInferior === "function") aplicarMenuInferior();
  $$(".vista").forEach(v => v.classList.remove("activa"));
  const target = $("#" + nombre);
  if (target) target.classList.add("activa");

  $$(".nav-inferior button").forEach(b => b.classList.remove("activo"));
  const btn = document.querySelector(`.nav-inferior button[data-view="${nombre}"]`);
  if (btn) btn.classList.add("activo");

  window.scrollTo(0, 0);

  if (nombre === "caja") { renderCaja(); renderCategorias(); }
  if (nombre === "inventario") renderInsumos();
  if (nombre === "corte") { initDia(); renderEstadoCaja(); }
  if (nombre === "panelVentas") reporteRango("dia", "panelVentas");
  if (nombre === "reportes") reporteRango("dia", "reportes");
  if (nombre === "gastos") { renderGastos(); renderCategoriasGastos(); }
  if (nombre === "productos") renderProductos();
  if (nombre === "config") { cargarNegocio(); if (typeof pintarEstadoSync === "function") pintarEstadoSync(); if (typeof renderConfigMenuInferior === "function") renderConfigMenuInferior(); }
  if (nombre === "papelera" && typeof renderPapelera === "function") renderPapelera();
  if (nombre === "historial") { renderHistorial(); }
  if (nombre === "preventas") { renderListaPreventas(); }
  if (nombre === "pendientes") { renderPendientes(); }

  mostrarAlertaStock();
}

function irConfig() { cambiarVista("config"); }

/* ============ MENÚ ============ */
function abrirMenu() {
  abrirModal("☰ Menú", `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('caja')" style="text-align:left;padding:14px;font-size:15px">🛒 Venta</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('inventario')" style="text-align:left;padding:14px;font-size:15px">📦 Inventario</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('corte')" style="text-align:left;padding:14px;font-size:15px">💰 Caja</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('reportes')" style="text-align:left;padding:14px;font-size:15px">📊 Reportes</button>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0">
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('preventas')" style="text-align:left;padding:14px;font-size:15px">📋 Lista de preventas</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('pendientes')" style="text-align:left;padding:14px;font-size:15px">📝 Compras y pendientes</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('historial')" style="text-align:left;padding:14px;font-size:15px">📅 Historial de tickets</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('productos')" style="text-align:left;padding:14px;font-size:15px">🍗 Productos</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('gastos')" style="text-align:left;padding:14px;font-size:15px">💸 Gastos</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('papelera')" style="text-align:left;padding:14px;font-size:15px">🗑️ Papelera</button>
      <button class="btn-secondary" onclick="cerrarModal();cambiarVista('config')" style="text-align:left;padding:14px;font-size:15px">⚙️ Configuración</button>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0">
      <button class="btn-danger" onclick="cerrarModal();logout()" style="padding:14px;font-size:15px">🚪 Cerrar sesión</button>
    </div>
  `);
}

/* ============ ALERTA STOCK ============ */
function revisarStockBajo() {
  return DB.insumos.filter(i => i.stock <= i.min);
}

function mostrarAlertaStock() {
  const bajos = revisarStockBajo();
  const el = document.getElementById("alertaStock");
  if (!el) return;

  if (bajos.length === 0) {
    el.style.display = "none";
    return;
  }

  el.style.display = "flex";
  el.innerHTML = `
    <span class="ico">⚠️</span>
    <span class="texto">Stock bajo: ${bajos.length} insumo${bajos.length>1?'s':''} por reabastecer</span>
    <span class="badge-count">${bajos.length}</span>
  `;
}

function verInsumosBajos() {
  const bajos = revisarStockBajo();
  if (bajos.length === 0) return toast("✅ Todo el stock está bien");
  abrirModal("⚠️ Insumos con stock bajo", `
    <p style="color:#64748b;font-size:13px;margin-bottom:12px">Estos insumos están en o por debajo del mínimo:</p>
    <div>
      ${bajos.map(i => `
        <div class="cat-item" style="background:#fef3c7;border-left:4px solid var(--warn)">
          <div style="flex:1">
            <b>${escapeHTML(i.nombre)}</b>
            <div style="font-size:12px;color:#64748b">Stock: ${i.stock} ${escapeHTML(i.unidad)} · Mínimo: ${i.min}</div>
          </div>
          <button class="btn-mini" onclick="cerrarModal();abrirMovimiento(${i.id})">↕ Reabastecer</button>
        </div>
      `).join("")}
    </div>
    <div class="acciones">
      <button class="btn-primary" onclick="cerrarModal();cambiarVista('inventario')">Ir a Inventario</button>
    </div>
  `);
}


/* Menú inferior: preferencias del administrador filtradas siempre por permisos del usuario. */
function aplicarMenuInferior() {
  const nav = document.querySelector(".nav-inferior");
  if (!nav) return;
  const rol = typeof rolActual === "function" ? rolActual() : "admin";
  if (!rol) return; // sin sesión (pantalla de acceso): no tocar la barra ni leer/escribir menús
  const predeterminados = {
    admin: ["caja", "inventario", "corte", "panelVentas", "reportes"],
    encargado: ["caja", "inventario", "corte", "historial", "reportes"],
    cajero: ["caja", "preventas", "pendientes", "historial"]
  };
  const mapa = {
    caja: ["🛒", "Venta"], inventario: ["📦", "Inventario"], productos: ["🍗", "Productos"],
    gastos: ["💸", "Gastos"], corte: ["💰", "Caja"],
    panelVentas: ["📈", "Panel"], reportes: ["📊", "Reportes"], preventas: ["📋", "Preventas"],
    pendientes: ["📝", "Pendientes"], historial: ["🧾", "Historial"]
  };
  const guardado = typeof leerMenuInferior === "function" ? leerMenuInferior(typeof usuarioActual === "function" ? usuarioActual() : { rol }) : (typeof LS !== "undefined" ? LS.get("menuInferiorPOS", null) : null);
  let menu = Array.isArray(guardado) ? guardado.filter((id, i, arr) => mapa[id] && arr.indexOf(id) === i).slice(0, 5) : [...(predeterminados[rol] || predeterminados.cajero)];
  if (!menu.includes("caja")) menu.unshift("caja");
  menu = ["caja", ...menu.filter(id => id !== "caja")].slice(0, 5);
  nav.querySelectorAll("button[data-menu]").forEach(btn => { btn.style.display = "none"; });
  menu.forEach(id => {
    if (typeof vistaPermitida === "function" && !vistaPermitida(id)) return;
    let btn = nav.querySelector(`button[data-menu="${id}"]`);
    if (!btn) { btn = document.createElement("button"); btn.dataset.view = id; btn.dataset.menu = id; btn.onclick = () => cambiarVista(id); }
    const [icono, texto] = mapa[id];
    btn.innerHTML = `<span class="ico">${icono}</span><span>${texto}</span>`;
    btn.style.display = ""; nav.appendChild(btn);
  });
  const visibles = [...nav.querySelectorAll("button[data-menu]")].filter(b => b.style.display !== "none");
  // La visibilidad de la barra la controla el CSS (body.app-autenticada); no poner display en línea
  nav.style.flexWrap = "nowrap"; nav.style.justifyContent = "space-around"; nav.style.overflowX = "hidden";
  visibles.forEach(btn => { btn.style.flex = "1 1 0"; btn.style.minWidth = "0"; btn.style.width = "auto"; });
  const vistaActiva = document.querySelector(".vista.activa")?.id || "caja";
  nav.querySelectorAll("button").forEach(b => b.classList.toggle("activo", b.dataset.menu === vistaActiva));
}
