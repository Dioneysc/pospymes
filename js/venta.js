/* ============================================
   VENTA.JS — CATEGORÍAS, CARRITO, COBRO Y FINALIZACIÓN DE VENTA
   ============================================ */

/* ============ CAJA ============ */

function renderCategorias() {
  const cats = ["Todas", ...new Set(DB.productos.filter(p=>p.activo).map(p=>p.categoria))];
  $("#categorias").innerHTML = cats.map(c =>
    `<button class="${c===categoriaActiva?'activo':''}" data-c="${escapeHTML(c)}" onclick="cambiarCategoria(this.dataset.c)">${escapeHTML(c)}</button>`
  ).join("");
}

function cambiarCategoria(c) {
  categoriaActiva = c;
  const b = document.getElementById("buscarProducto");
  if (b) b.value = "";
  renderCategorias();
  renderCaja();
}

// Calcula el máximo teórico disponible, admitiendo cantidades fraccionarias según la receta.
// Los productos sin receta (por ejemplo, servicios) no muestran stock de insumos.
function stockDisponibleProducto(p) {
  if (!p || !Array.isArray(p.insumos) || !p.insumos.length) return null;
  const receta = p.insumos
    .map(g => ({ ins: DB.insumos.find(i => String(i.id) === String(g.insumoId)), cantidad: Number(g.cantidad) }))
    .filter(g => g.cantidad > 0);
  if (!receta.length || receta.some(g => !g.ins || !Number.isFinite(g.cantidad))) return null;
  return Math.max(0, Math.round(Math.min(...receta.map(g => (Number(g.ins.stock) || 0) / g.cantidad)) * 100) / 100);
}

function formatearCantidad(cantidad) {
  const n = Math.round((Number(cantidad) || 0) * 100) / 100;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function actualizarEtiquetasStockProductos() {
  document.querySelectorAll('#gridProductos .prod-btn[data-product-id]').forEach(btn => {
    const p = DB.productos.find(x => String(x.id) === btn.dataset.productId);
    const stock = stockDisponibleProducto(p);
    const etiqueta = btn.querySelector('.prod-stock');
    if (!etiqueta) return;
    if (stock === null) { etiqueta.remove(); return; }
    etiqueta.textContent = stock <= 0 ? 'Agotado' : `Stock: ${formatearCantidad(stock)}`;
    etiqueta.classList.toggle('sin-stock', stock === 0);
    etiqueta.classList.toggle('stock-bajo', stock > 0 && stock <= 3);
  });
}

/* ============ VISTA DE PRODUCTOS: tarjetas o lista (preferencia de cada dispositivo, no se sincroniza) ============ */
const ICONO_VISTA_LISTA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></svg>';
const ICONO_VISTA_TARJETAS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';

function vistaProductosActual() { return LS.get("vistaProductos", "tarjetas") === "lista" ? "lista" : "tarjetas"; }

// Orden visual local: solo guarda IDs; nunca modifica productos, precios ni inventario.
const CLAVE_ORDEN_PRODUCTOS_LOCAL = "ordenProductosLocal";
let ordenarProductosActivo = false;
let arrastreProducto = null;
function obtenerOrdenProductosLocal() {
  const orden = LS.get(CLAVE_ORDEN_PRODUCTOS_LOCAL, []);
  return Array.isArray(orden) ? orden.map(String) : [];
}
function guardarOrdenProductosLocal(ids) {
  const unicos = [...new Set(ids.map(String))];
  LS.set(CLAVE_ORDEN_PRODUCTOS_LOCAL, unicos);
}
function puedeReordenarProductos() {
  return categoriaActiva === "Todas" && !String(document.getElementById("buscarProducto")?.value || "").trim();
}
function prepararControlOrdenProductos() {
  const fila = document.querySelector(".busqueda-fila");
  if (!fila || document.getElementById("btnOrdenarProductos")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "btnOrdenarProductos";
  btn.className = "btn-ordenar";
  btn.innerHTML = '<span aria-hidden="true">↕</span><span class="btn-ordenar-texto">Ordenar</span>';
  btn.title = "Reordenar productos";
  btn.setAttribute("aria-label", "Reordenar productos");
  btn.addEventListener("click", alternarOrdenarProductos);
  const vista = document.getElementById("btnVistaProductos");
  fila.insertBefore(btn, vista || null);
}
function actualizarControlOrdenProductos() {
  prepararControlOrdenProductos();
  const btn = document.getElementById("btnOrdenarProductos");
  if (!btn) return;
  const permitido = puedeReordenarProductos();
  if (!permitido && ordenarProductosActivo) ordenarProductosActivo = false;
  btn.classList.toggle("activo", ordenarProductosActivo);
  btn.disabled = !permitido;
  btn.innerHTML = ordenarProductosActivo
    ? '<span aria-hidden="true">✓</span><span class="btn-ordenar-texto">Listo</span>'
    : '<span aria-hidden="true">↕</span><span class="btn-ordenar-texto">Ordenar</span>';
  btn.title = permitido ? (ordenarProductosActivo ? "Terminar de ordenar" : "Reordenar productos") : "Para ordenar, selecciona Todas y limpia la búsqueda";
  btn.setAttribute("aria-label", btn.title);
}
function alternarOrdenarProductos() {
  if (!puedeReordenarProductos()) {
    if (typeof toast === "function") toast("Para ordenar, selecciona Todas y limpia la búsqueda");
    return;
  }
  ordenarProductosActivo = !ordenarProductosActivo;
  actualizarControlOrdenProductos();
  renderCaja();
  if (typeof toast === "function") toast(ordenarProductosActivo ? "Arrastra el asa ↕ para cambiar el orden" : "Orden de productos guardado en este dispositivo");
}
function iniciarArrastreProducto(event, handle) {
  if (!ordenarProductosActivo || !puedeReordenarProductos() || arrastreProducto) return;
  event.preventDefault();
  event.stopPropagation();
  const item = handle.closest(".prod-btn");
  const grid = document.getElementById("gridProductos");
  if (!item || !grid || !grid.contains(item)) return;
  arrastreProducto = {
    id: item.dataset.productId,
    pointerId: event.pointerId,
    item,
    grid,
    ordenInicial: [...grid.querySelectorAll(".prod-btn[data-product-id]")].map(el => el.dataset.productId),
    movido: false
  };
  item.classList.add("arrastrando");
  // Los eventos se escuchan en document: el puntero puede salir del asa o de la tarjeta.
  document.addEventListener("pointermove", moverArrastreProducto, { passive: false });
  document.addEventListener("pointerup", terminarArrastreProducto);
  document.addEventListener("pointercancel", terminarArrastreProducto);
  try { handle.setPointerCapture?.(event.pointerId); } catch (_) {}
}
function moverArrastreProducto(event) {
  if (!arrastreProducto || event.pointerId !== arrastreProducto.pointerId) return;
  const { item: actual, grid } = arrastreProducto;
  const destino = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("#gridProductos .prod-btn");
  if (!destino || destino === actual || !grid.contains(destino) || destino.parentElement !== actual.parentElement) return;
  event.preventDefault();
  const r = destino.getBoundingClientRect();
  const horizontal = r.width > r.height * 1.2;
  const antes = horizontal ? event.clientX < r.left + r.width / 2 : event.clientY < r.top + r.height / 2;
  destino.parentElement.insertBefore(actual, antes ? destino : destino.nextSibling);
  arrastreProducto.movido = true;
}
function terminarArrastreProducto(event) {
  if (!arrastreProducto || (event && event.pointerId !== undefined && event.pointerId !== arrastreProducto.pointerId)) return;
  document.removeEventListener("pointermove", moverArrastreProducto);
  document.removeEventListener("pointerup", terminarArrastreProducto);
  document.removeEventListener("pointercancel", terminarArrastreProducto);
  const estado = arrastreProducto;
  const ordenFinal = [...estado.grid.querySelectorAll(".prod-btn[data-product-id]")].map(el => el.dataset.productId);
  estado.item.classList.remove("arrastrando");
  arrastreProducto = null;
  // Guardar solo si el orden realmente cambió; el botón Listo no depende del evento del asa.
  if (ordenFinal.length && ordenFinal.some((id, i) => id !== estado.ordenInicial[i])) {
    guardarOrdenProductosLocal(ordenFinal);
  }
}

function aplicarVistaProductos() {
  actualizarControlOrdenProductos();
  const lista = vistaProductosActual() === "lista";
  const grid = document.getElementById("gridProductos");
  if (grid) grid.classList.toggle("vista-lista", lista);
  const btn = document.getElementById("btnVistaProductos");
  if (btn) {
    const texto = lista ? "Ver en tarjetas" : "Ver en lista";   // el botón muestra la vista a la que se cambiaría
    btn.innerHTML = lista ? ICONO_VISTA_TARJETAS : ICONO_VISTA_LISTA;
    btn.title = texto; btn.setAttribute("aria-label", texto);
  }
}

function alternarVistaProductos() {
  LS.set("vistaProductos", vistaProductosActual() === "lista" ? "tarjetas" : "lista");
  aplicarVistaProductos();
}

function renderCaja() {
  aplicarVistaProductos();
  const busq = ($("#buscarProducto")?.value || "").toLowerCase();
  let prods = DB.productos.filter(p => p.activo);
  const ordenGuardado = obtenerOrdenProductosLocal();
  if (ordenGuardado.length) {
    const posiciones = new Map(ordenGuardado.map((id, i) => [id, i]));
    prods.sort((a, b) => (posiciones.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (posiciones.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
  }
  if (categoriaActiva !== "Todas") prods = prods.filter(p => p.categoria === categoriaActiva);
  if (busq) prods = prods.filter(p => p.nombre.toLowerCase().includes(busq));

  if (!DB.productos.length) {
    $("#gridProductos").innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:60px;margin-bottom:12px">🍗</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">Sin productos todavía</h3>
        <p style="font-size:13px;margin-bottom:16px">Agrega tus productos para empezar a vender</p>
        <button class="btn-primary" onclick="abrirFormProducto()" style="padding:12px 24px">
          + Agregar mi primer producto
        </button>
      </div>
    `;
    renderCarrito();
    return;
  }

  $("#gridProductos").innerHTML = prods.map(p => {
    const emojiSeguro = escapeHTML(p.emoji || "🍽️");
    const contenido = p.imagen
      ? `<img src="${escapeHTML(p.imagen)}" class="prod-imagen" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'prod-emoji',textContent:this.dataset.e}))" data-e="${emojiSeguro}">`
      : `<div class="prod-emoji">${emojiSeguro}</div>`;
    return `
      <button class="prod-btn${ordenarProductosActivo ? " modo-ordenar" : ""}" data-product-id="${escapeHTML(String(p.id))}" data-cat="${escapeHTML(p.categoria)}" onclick="if(!ordenarProductosActivo) agregarAlCarrito(${JSON.stringify(p.id)})">
        ${ordenarProductosActivo ? '<span class="asa-arrastre" role="button" tabindex="0" aria-label="Arrastrar para reordenar" title="Arrastrar para reordenar" onpointerdown="iniciarArrastreProducto(event,this)" onclick="event.preventDefault();event.stopPropagation()">⠿</span>' : ""}
        ${contenido}
        <span class="prod-nombre">${escapeHTML(p.nombre)}</span>
        <span class="prod-precio">${fmt(p.precio)}</span>
        ${stockDisponibleProducto(p) === null ? "" : `<span class="prod-stock${stockDisponibleProducto(p) === 0 ? " sin-stock" : stockDisponibleProducto(p) <= 3 ? " stock-bajo" : ""}">${stockDisponibleProducto(p) <= 0 ? "Agotado" : `Stock: ${formatearCantidad(stockDisponibleProducto(p))}`}</span>`}
      </button>
    `;
  }).join("") || `<p style="color:#94a3b8;padding:20px;grid-column:1/-1;text-align:center">Sin resultados</p>`;

  renderCarrito();
}

function filtrarProductos() { renderCaja(); }

function agregarAlCarrito(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!p) return;
  const ex = carrito.find(i => i.productoId === id);
  if (ex) {
    ex.cantidad++;
  } else {
    carrito.push({
      productoId: id,
      nombre: p.nombre,
      precio: p.precio,
      emoji: p.emoji || "🍽️",
      cantidad: 1
    });
  }
  renderCarrito();
  actualizarCarritoFlotante(); // ← fuerza actualización
}

/* ============ CARRITO FLOTANTE (MÓVIL) ============ */
function actualizarCarritoFlotante() {
  const btn = document.getElementById("carritoFlotante");
  const count = document.getElementById("carritoFlotanteCount");
  const totalEl = document.getElementById("carritoFlotanteTotal");

  if (!btn) return;

  const cantidadTotal = carrito.reduce((s, i) => s + i.cantidad, 0);
  const totalMonto = Math.max(0, redondear2(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) - descuento));

  if (count) count.textContent = cantidadTotal;
  if (totalEl) totalEl.textContent = fmt(totalMonto);

  // Remover "oculto" SIEMPRE
  btn.classList.remove("oculto");

  // Mostrar solo en móvil con carrito
  if (carrito.length > 0 && window.innerWidth <= 900) {
    btn.classList.add("visible");
    btn.style.display = "flex";
  } else {
    btn.classList.remove("visible");
    btn.style.display = "none";
  }
}

function abrirCarritoModal() {
  const panel = document.getElementById("carritoPanel");
  const btn = document.getElementById("carritoFlotante");
  if (!panel) return;

  panel.classList.add("modal-abierto");
  if (btn) btn.classList.add("oculto");
  document.body.style.overflow = "hidden";
}

function cerrarCarritoModal() {
  const panel = document.getElementById("carritoPanel");
  const btn = document.getElementById("carritoFlotante");
  if (!panel) return;

  panel.classList.remove("modal-abierto");
  if (btn && carrito.length > 0) btn.classList.remove("oculto");
  document.body.style.overflow = "";
}

function renderCarrito() {
  const c = $("#carrito");
  if (!carrito.length) {
    c.innerHTML = `<div class="carrito-vacio">🛒 Agrega productos al ticket</div>`;
  } else {
    c.innerHTML = carrito.map((it, i) => `
      <div class="carrito-item">
        <div class="carrito-item-info">
          <b>${escapeHTML(it.emoji || "")} ${escapeHTML(it.nombre)}</b>
          <div class="item-controles">
            <button onclick="cambiarCantidad(${i}, -1)">−</button>
            <span role="button" title="Toca para editar la cantidad, admite decimales" onclick="editarCantidad(${i})" style="min-width:28px;text-align:center;cursor:pointer">${formatearCantidad(it.cantidad)}</span>
            <button onclick="cambiarCantidad(${i}, 1)">+</button>
          </div>
        </div>
        <div class="item-precio">${fmt(it.precio * it.cantidad)}</div>
      </div>
    `).join("");
  }
  const sub = redondear2(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0));
  if (!carrito.length) { descuento = 0; descuentoPct = 0; }
  else if (descuentoPct > 0) descuento = redondear2(sub * descuentoPct / 100);
  descuento = Math.min(Math.max(redondear2(descuento), 0), sub); // evita totales negativos si se quitan productos
  const total = redondear2(sub - descuento);

  const elDesc = $("#descuentoVal");
  const elTot = $("#total");
  const elTotCobrar = $("#totalCobrar");

  if (elDesc) elDesc.textContent = "-" + fmt(descuento);
  if (elTot) elTot.textContent = fmt(total);
  if (elTotCobrar) elTotCobrar.textContent = fmt(total);

  actualizarToggleValores();
  actualizarCarritoFlotante();
}

function editarCantidad(i) {
  if (!carrito[i]) return;
  const actual = formatearCantidad(carrito[i].cantidad);
  const entrada = prompt(`Cantidad de ${carrito[i].nombre} (puedes usar decimales, por ejemplo 0.5):`, actual);
  if (entrada === null) return;
  const cantidad = Number(String(entrada).trim().replace(",", "."));
  if (!Number.isFinite(cantidad) || cantidad < 0) {
    alert("Escribe una cantidad válida, igual o mayor que cero.");
    return;
  }
  if (cantidad === 0) carrito.splice(i, 1);
  else carrito[i].cantidad = Math.round(cantidad * 1000) / 1000;
  if (!carrito.length) { window._preventaEnProcesoId = null; reiniciarTipoPedido(); cerrarCarritoModal(); }
  renderCarrito();
  actualizarEtiquetasStockProductos();
}

function cambiarCantidad(i, d) {
  if (!carrito[i]) return;
  carrito[i].cantidad += d;
  if (carrito[i].cantidad <= 0) carrito.splice(i, 1);
  if (!carrito.length) { window._preventaEnProcesoId = null; reiniciarTipoPedido(); cerrarCarritoModal(); }
  renderCarrito();
}

function limpiarCarrito() {
  if (!carrito.length) return;
  if (!confirm("¿Vaciar el ticket?")) return;
  carrito = []; descuento = 0; descuentoPct = 0; propina = 0;
  window._preventaEnProcesoId = null;
  const campoNotaPedido = document.getElementById("notaPedido");
  if (campoNotaPedido) campoNotaPedido.value = "";
  reiniciarTipoPedido();

  const pD = $("#panelDescuento");
  const tD = $("#toggleDescuento");
  if (pD) pD.classList.add("oculto");
  if (tD) tD.classList.remove("activo");

  cerrarCarritoModal();
  renderCarrito();
}

function toggleDescuento() {
  const panel = $("#panelDescuento");
  const btn = $("#toggleDescuento");
  if (!panel || !btn) return;
  const visible = !panel.classList.contains("oculto");
  if (visible) {
    panel.classList.add("oculto");
    btn.classList.remove("activo");
    descuento = 0; descuentoPct = 0;
    actualizarToggleValores();
    renderCarrito();
  } else {
    panel.classList.remove("oculto");
    btn.classList.add("activo");
  }
}

function aplicarDescuento(pct) {
  const sub = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  descuentoPct = Math.min(Math.max(Number(pct) || 0, 0), 100);
  descuento = redondear2(sub * (descuentoPct / 100));
  if (pct === 0) {
    const panel = $("#panelDescuento");
    const btn = $("#toggleDescuento");
    if (panel) panel.classList.add("oculto");
    if (btn) btn.classList.remove("activo");
  }
  actualizarToggleValores();
  renderCarrito();
}

function actualizarToggleValores() {
  const btnDesc = $("#toggleDescuentoVal");
  if (btnDesc) btnDesc.textContent = descuento > 0 ? "-" + fmt(descuento) : "";

  const tDesc = $("#toggleDescuento");
  if (tDesc) tDesc.classList.toggle("activo", descuento > 0);
}

function cobrar(metodo) {
  if (!carrito.length) return toast("⚠️ Ticket vacío");
  if (!validarTipoPedido()) return;
  if (typeof almacenamientoDisponible === "function" && !almacenamientoDisponible()) return; // sin espacio, la venta se perdería al recargar
  initDia(); // si la app quedó abierta pasada la medianoche, la caja del día anterior ya no vale
  if (estadoCajaHoy.fondoInicial === null) {
    toast("⚠️ Abre la caja primero");
    return abrirFondoInicial();
  }
  const faltantes = stockFaltante();
  if (faltantes.length && !confirm("⚠️ Stock insuficiente:\n\n" + faltantes.join("\n") + "\n\n¿Vender de todos modos?")) return;
  const sub = redondear2(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0));
  const total = redondear2(sub - Math.min(descuento, sub));
  if (total <= 0) return toast("⚠️ El total a cobrar debe ser mayor que cero");

  if (metodo === "Efectivo") {
    abrirModalPago(total);
  } else {
    finalizarVenta(metodo, total, total, 0);
  }
}

function stockFaltante() {
  const need = {};
  carrito.forEach(it => {
    const p = DB.productos.find(x => x.id === it.productoId);
    (p && p.insumos || []).forEach(g => { need[g.insumoId] = (need[g.insumoId] || 0) + g.cantidad * it.cantidad; });
  });
  return Object.entries(need).map(([id, q]) => ({ ins: DB.insumos.find(x => x.id == id), q }))
    .filter(o => o.ins && o.ins.stock + 1e-9 < o.q)
    .map(o => `${o.ins.nombre}: hay ${o.ins.stock} ${o.ins.unidad}, faltan ${+(o.q - o.ins.stock).toFixed(2)}`);
}

function cobrarEfectivoRapido() { cobrar("Efectivo"); }

/* ============ MODAL PAGO ============ */
function abrirModalPago(total) {
  window._totalCobro = total;
  const sugerencias = new Set();
  sugerencias.add(total.toFixed(2));

  const siguientes = [100, 200, 500, 1000];
  for (const denom of siguientes) {
    const candidato = Math.ceil(total / denom) * denom;
    if (candidato > total && candidato <= total + 1000) {
      sugerencias.add(candidato.toFixed(2));
    }
  }
  [100, 200, 500, 1000].forEach(d => {
    if (d >= total) sugerencias.add(d.toFixed(2));
  });

  const botones = [...sugerencias].map(v => +v).sort((a, b) => a - b).slice(0, 8);

  abrirModal("💵 Cobro en efectivo", `
    <div class="modal-pago">
      <div style="text-align:center;margin-bottom:12px">
        <p style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Total a cobrar</p>
        <p style="font-size:36px;font-weight:800;color:var(--naranja);margin:4px 0">${fmt(total)}</p>
      </div>

      <label>¿Con cuánto paga?</label>
      <input id="pagoCon" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${total.toFixed(2)}" oninput="calcCambio()" onfocus="this.select()">

      <div class="billetes-grid">
        ${botones.map(b => `
          <button onclick="setPago(${b})" ${b === total ? 'style="background:#fff7ed;border-color:var(--naranja);font-weight:800"' : ''}>
            ${b === total ? '✅ ' : ''}$${b % 1 === 0 ? b : b.toFixed(2)}
          </button>
        `).join("")}
      </div>

      <div id="cambioBox" class="cambio-box">
        <p>Cambio</p>
        <div class="monto" id="cambioMonto">$0.00</div>
      </div>

      <div class="acciones">
        <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button class="btn-primary" id="btnConfirmarPago" onclick="confirmarPago()">✅ Cobrar</button>
      </div>
    </div>
  `);
  setTimeout(() => {
    if (window.innerWidth > 900) {
      const inp = $("#pagoCon");
      if (inp) { inp.focus(); inp.select(); }
    }
    calcCambio();
  }, 150);
}

function setPago(monto) {
  $("#pagoCon").value = monto;
  calcCambio();
}

function calcCambio() {
  const total = redondear2(window._totalCobro);
  const pago = +$("#pagoCon").value || 0;
  const cambio = redondear2(pago - total);
  const box = $("#cambioBox");
  const monto = $("#cambioMonto");
  const btn = $("#btnConfirmarPago");

  if (pago === 0 || isNaN(pago)) {
    box.classList.remove("falta-box");
    box.querySelector("p").textContent = "Cambio";
    monto.textContent = "$0.00";
    btn.disabled = false;
    return;
  }

  if (cambio < 0) {
    box.classList.add("falta-box");
    box.querySelector("p").textContent = "Falta";
    monto.textContent = fmt(Math.abs(cambio));
    btn.disabled = true;
  } else if (cambio === 0) {
    box.classList.remove("falta-box");
    box.querySelector("p").textContent = "Pago exacto";
    monto.textContent = "$0.00";
    btn.disabled = false;
  } else {
    box.classList.remove("falta-box");
    box.querySelector("p").textContent = "Cambio";
    monto.textContent = fmt(cambio);
    btn.disabled = false;
  }
}

function confirmarPago() {
  const btn = $("#btnConfirmarPago");
  if (btn && btn.disabled) return;
  if (btn) btn.disabled = true;

  const total = redondear2(window._totalCobro);
  let pago = redondear2(+$("#pagoCon").value);
  if (!pago || pago === 0) pago = total;
  const cambio = redondear2(pago - total);

  if (cambio < 0) {
    if (btn) btn.disabled = false;
    return toast("⚠️ Falta dinero");
  }

  cerrarModal();
  finalizarVenta("Efectivo", total, pago, cambio);
}

/* ============ FINALIZAR VENTA ============ */
// Costo de una unidad del producto con los costos de insumo de HOY, para guardarlo en la venta.
// null si el producto no tiene receta o falta algún costo (mismo criterio que usa el reporte).
function costoUnitarioReceta(prod) {
  const receta = prod && Array.isArray(prod.insumos) ? prod.insumos : [];
  if (!receta.length) return null;
  let total = 0;
  for (const ing of receta) {
    const ins = DB.insumos.find(x => String(x.id) === String(ing.insumoId));
    if (!ins || !Number.isFinite(Number(ins.costo))) return null;
    total += Number(ins.costo) * (Number(ing.cantidad) || 0);
  }
  return Math.round(total * 10000) / 10000;
}

function finalizarVenta(metodo, total, pagoCon, cambio) {
  if (!carrito.length) return toast("⚠️ Ticket vacío");
  const sub = redondear2(carrito.reduce((s, i) => s + i.precio * i.cantidad, 0));
  total = redondear2(total); pagoCon = redondear2(pagoCon); cambio = redondear2(cambio);
  const sesion = JSON.parse(sessionStorage.getItem("sesion") || "{}");

  const venta = {
    id: nuevoId(DB.ventas),
    fecha: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(carrito.map(it => {
      const c = costoUnitarioReceta(DB.productos.find(p => p.id === it.productoId));
      return c === null ? { ...it } : { ...it, costoUnitario: c };   // el costo queda fijo: no cambia si luego sube el insumo
    }))),
    subtotal: sub,
    descuento: redondear2(descuento),
    propina: 0,
    notas: (document.getElementById("notaPedido")?.value || "").trim().slice(0, 300),
    total,
    metodo,
    pagoCon: metodo === "Efectivo" ? pagoCon : total,
    cambio: metodo === "Efectivo" ? cambio : 0,
    usuario: sesion.nombre || "admin",
    tipoPedido,
    cliente: tipoPedido === "mostrador" ? "" : leerClientePedido()
  };
  DB.ventas.push(venta);

  // Inventario por movimientos: un solo registro por venta (se suma al stock de cada insumo)
  const lineasInsumos = [];
  carrito.forEach(item => {
    const prod = DB.productos.find(p => p.id === item.productoId);
    if (!prod || !prod.insumos) return;
    prod.insumos.forEach(ing => lineasInsumos.push({ i: ing.insumoId, d: -(ing.cantidad * item.cantidad) }));
  });
  registrarMovimientoInventario("venta", lineasInsumos, { ref: venta.id });
  actualizarEtiquetasStockProductos();

  guardar("ventas", "insumos"); // una venta solo cambia estas dos colecciones
  const preventaIdFinalizada = Number(window._preventaEnProcesoId) || 0;
  if (preventaIdFinalizada && typeof marcarPreventaConvertida === "function") {
    marcarPreventaConvertida(preventaIdFinalizada, venta.id);
  }
  window._preventaEnProcesoId = null;
  carrito = []; descuento = 0; descuentoPct = 0; propina = 0;
  const campoNotaPedido = document.getElementById("notaPedido");
  if (campoNotaPedido) campoNotaPedido.value = "";
  reiniciarTipoPedido();

  const pD = $("#panelDescuento");
  const tD = $("#toggleDescuento");
  if (pD) pD.classList.add("oculto");
  if (tD) tD.classList.remove("activo");

  cerrarCarritoModal();
  renderCarrito();
  renderEstadoCaja();
  mostrarAlertaStock();
  reproducirSonido("cobro");
  mostrarTicketImpresion(venta);

  if (metodo === "Efectivo" && cambio > 0) {
    toast(`✅ Venta #${venta.id} · Cambio: ${fmt(cambio)}`);
  } else {
    toast(`✅ Venta #${venta.id} cobrada: ${fmt(total)}`);
  }
}


/* ============ TIPO DE PEDIDO ============ */
const TIPOS_PEDIDO = {
  mostrador: { icono: "🏪", nombre: "Mostrador" },
  llevar: { icono: "🥡", nombre: "Para llevar" },
  domicilio: { icono: "🛵", nombre: "Domicilio" }
};
let tipoPedido = "mostrador";

function seleccionarTipoPedido(t) {
  if (!TIPOS_PEDIDO[t]) t = "mostrador";
  tipoPedido = t;
  document.querySelectorAll("[data-tipo-pedido]").forEach(b => {
    const on = b.dataset.tipoPedido === t;
    b.classList.toggle("activo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const wrap = document.getElementById("clientePedidoWrap");
  if (wrap) wrap.classList.toggle("oculto", t === "mostrador");
  const c = document.getElementById("clientePedido");
  if (c) c.placeholder = t === "domicilio" ? "Nombre, teléfono y dirección (obligatorio)" : "Nombre o teléfono (opcional)";
}
const leerClientePedido = () => (document.getElementById("clientePedido")?.value || "").trim().slice(0, 120);
function reiniciarTipoPedido() {
  seleccionarTipoPedido("mostrador");
  const c = document.getElementById("clientePedido");
  if (c) c.value = "";
}
function validarTipoPedido() {
  if (tipoPedido === "domicilio" && !leerClientePedido()) {
    toast("🛵 Escribe nombre, teléfono y dirección para el domicilio");
    const c = document.getElementById("clientePedido");
    if (c) c.focus();
    return false;
  }
  return true;
}
// Texto corto para tickets, historial y WhatsApp ("" para mostrador)
function lineaTipoPedido(v) {
  const t = v && v.tipoPedido;
  if (!t || t === "mostrador" || !TIPOS_PEDIDO[t]) return "";
  return `${TIPOS_PEDIDO[t].icono} ${TIPOS_PEDIDO[t].nombre}${v.cliente ? " · " + v.cliente : ""}`;
}
function tipoPedidoHTML(v, clase) {
  const l = lineaTipoPedido(v);
  return l ? `<div class="${clase || "ticket-notas-preview"}"><strong>${escapeHTML(l)}</strong></div>` : "";
}
