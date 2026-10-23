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

function renderCaja() {
  const busq = ($("#buscarProducto")?.value || "").toLowerCase();
  let prods = DB.productos.filter(p => p.activo);
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
    const contenido = p.imagen
      ? `<img src="${p.imagen}" class="prod-imagen" loading="lazy" onerror="this.outerHTML='<div class=\\'prod-emoji\\'>${p.emoji||'🍽️'}</div>'">`
      : `<div class="prod-emoji">${p.emoji || "🍽️"}</div>`;
    const stockDisponible = typeof existenciaVisibleProducto === "function" ? existenciaVisibleProducto(p) : (p.stock === undefined || p.stock === null ? null : Number(p.stock));
    const stockVisible = stockDisponible !== null && Number.isFinite(Number(stockDisponible))
      ? `<span class="prod-stock-numero" aria-label="Existencia">${Number(stockDisponible).toLocaleString("es-MX", { maximumFractionDigits: 3 })}</span>`
      : "";
    return `
      <button class="prod-btn" data-cat="${p.categoria}" onclick="agregarAlCarrito(${p.id})">
        ${stockVisible}
        ${contenido}
        <span class="prod-nombre">${escapeHTML(p.nombre)}</span>
        <span class="prod-precio">${fmt(p.precio)}</span>
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

  if (!btn) {
    console.log("❌ Botón no existe");
    return;
  }

  const cantidadTotal = carrito.reduce((s, i) => s + i.cantidad, 0);
  const totalMonto = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) - descuento;

  if (count) count.textContent = cantidadTotal;
  if (totalEl) totalEl.textContent = fmt(totalMonto);

  // Remover "oculto" SIEMPRE
  btn.classList.remove("oculto");

  // Mostrar solo en móvil con carrito
  if (carrito.length > 0 && window.innerWidth <= 900) {
    btn.classList.add("visible");
    btn.style.display = "flex";
    console.log("✅ Botón flotante mostrado");
  } else {
    btn.classList.remove("visible");
    btn.style.display = "none";
    console.log("❌ Botón flotante oculto. Carrito:", carrito.length, "Ancho:", window.innerWidth);
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
          <b>${it.emoji || ""} ${escapeHTML(it.nombre)}</b>
          <div class="item-controles">
            <button onclick="cambiarCantidad(${i}, -1)">−</button>
            <span>${it.cantidad}</span>
            <button onclick="cambiarCantidad(${i}, 1)">+</button>
          </div>
        </div>
        <div class="item-precio">${fmt(it.precio * it.cantidad)}</div>
      </div>
    `).join("");
  }
  const sub = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const total = sub - descuento;

  const elDesc = $("#descuentoVal");
  const elTot = $("#total");
  const elTotCobrar = $("#totalCobrar");

  if (elDesc) elDesc.textContent = "-" + fmt(descuento);
  if (elTot) elTot.textContent = fmt(total);
  if (elTotCobrar) elTotCobrar.textContent = fmt(total);

  actualizarToggleValores();
  actualizarCarritoFlotante();
}

function cambiarCantidad(i, d) {
  carrito[i].cantidad += d;
  if (carrito[i].cantidad <= 0) carrito.splice(i, 1);
  if (!carrito.length) window._preventaEnProcesoId = null;
  renderCarrito();
}

function limpiarCarrito() {
  if (!carrito.length) return;
  if (!confirm("¿Vaciar el ticket?")) return;
  carrito = []; descuento = 0; propina = 0;
  window._preventaEnProcesoId = null;
  const campoNotaPedido = document.getElementById("notaPedido");
  if (campoNotaPedido) campoNotaPedido.value = "";

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
    descuento = 0;
    actualizarToggleValores();
    renderCarrito();
  } else {
    panel.classList.remove("oculto");
    btn.classList.add("activo");
  }
}

function aplicarDescuento(pct) {
  const sub = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  descuento = sub * (pct / 100);
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
  if (estadoCajaHoy.fondoInicial === null) {
    toast("⚠️ Abre la caja primero");
    return abrirFondoInicial();
  }
  const faltantes = stockFaltante();
  if (faltantes.length && !confirm("⚠️ Stock insuficiente:\n\n" + faltantes.join("\n") + "\n\n¿Vender de todos modos?")) return;
  const sub = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const total = sub - descuento;

  if (metodo === "Efectivo") {
    abrirModalPago(total);
  } else {
    finalizarVenta(metodo, total, total, 0);
  }
}

function stockFaltante() {
  const need = {}, nombres = {}, tipos = {};
  const faltantes = [];
  carrito.forEach(it => {
    const p = DB.productos.find(x => x.id === it.productoId);
    if (!p) return;
    const modo = typeof modoInventarioProducto === "function" ? modoInventarioProducto(p) : (p.stock !== undefined && p.stock !== null ? "producto" : "ninguno");
    if (modo === "producto") {
      const key = `producto_${p.id}`; need[key] = (need[key] || 0) + it.cantidad; nombres[key] = p.nombre; tipos[key] = "producto";
    } else if (modo === "derivado") {
      const base = productoBaseInventario(p), factor = factorInventarioProducto(p);
      if (base && factor > 0) { const key = `producto_${base.id}`; need[key] = (need[key] || 0) + factor * it.cantidad; nombres[key] = base.nombre; tipos[key] = "producto"; }
    }
  });
  Object.entries(need).forEach(([key, q]) => {
    const id = key.slice(8), prod = DB.productos.find(x => String(x.id) === String(id));
    if (prod && Number(prod.stock) + 0.000001 < q) {
      const unidad = prod.unidad ? ` ${prod.unidad}` : "";
      faltantes.push(`${prod.nombre}: hay ${Number(prod.stock)||0}${unidad}, faltan ${+(q - (Number(prod.stock)||0)).toFixed(3)}${unidad}`);
    }
  });
  return faltantes;
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
  const total = window._totalCobro;
  const pago = +$("#pagoCon").value || 0;
  const cambio = pago - total;
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

  const total = window._totalCobro;
  let pago = +$("#pagoCon").value;
  if (!pago || pago === 0) pago = total;
  const cambio = pago - total;

  if (cambio < 0) {
    if (btn) btn.disabled = false;
    return toast("⚠️ Falta dinero");
  }

  cerrarModal();
  finalizarVenta("Efectivo", total, pago, cambio);
}

/* ============ FINALIZAR VENTA ============ */
function finalizarVenta(metodo, total, pagoCon, cambio) {
  const sub = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const sesion = JSON.parse(sessionStorage.getItem("sesion") || "{}");

  const venta = {
    id: nuevoId(DB.ventas),
    fecha: new Date().toISOString(),
    items: JSON.parse(JSON.stringify(carrito)),
    subtotal: sub,
    descuento,
    propina: 0,
    notas: (document.getElementById("notaPedido")?.value || "").trim().slice(0, 300),
    total,
    metodo,
    pagoCon: metodo === "Efectivo" ? pagoCon : total,
    cambio: metodo === "Efectivo" ? cambio : 0,
    usuario: sesion.nombre || "admin"
  };
  DB.ventas.push(venta);

  asegurarMovimientosInventario();
  carrito.forEach(item => {
    const prod = DB.productos.find(p => p.id === item.productoId);
    if (!prod) return;
    const modo = typeof modoInventarioProducto === "function" ? modoInventarioProducto(prod) : (prod.stock !== undefined && prod.stock !== null ? "producto" : "ninguno");
    if (modo === "producto") {
      const antes = Math.max(0, Number(prod.stock) || 0), despues = Math.max(0, antes - item.cantidad);
      prod.stock = despues;
      registrarMovimientoInventario({entidadTipo:"producto", entidadId:prod.id, nombre:prod.nombre, tipo:"venta", cantidad:-item.cantidad, cantidadAplicada:antes-despues, cantidadSolicitada:item.cantidad, stockAntes:antes, stockDespues:despues, costoTotal:0, ventaId:venta.id, motivo:`Venta #${venta.id}`});
    } else if (modo === "derivado") {
      const base = productoBaseInventario(prod), factor = factorInventarioProducto(prod);
      if (base && factor > 0) {
        const antes = Math.max(0, Number(base.stock) || 0), solicitado = factor * item.cantidad, despues = Math.max(0, antes - solicitado);
        base.stock = despues;
        registrarMovimientoInventario({entidadTipo:"producto", entidadId:base.id, nombre:base.nombre, tipo:"venta", cantidad:-solicitado, cantidadAplicada:antes-despues, cantidadSolicitada:solicitado, stockAntes:antes, stockDespues:despues, costoTotal:0, ventaId:venta.id, motivo:`Venta de ${prod.nombre} · ticket #${venta.id}`});
      }
    }
  });

  guardar();
  const preventaIdFinalizada = Number(window._preventaEnProcesoId) || 0;
  if (preventaIdFinalizada && typeof marcarPreventaConvertida === "function") {
    marcarPreventaConvertida(preventaIdFinalizada, venta.id);
  }
  window._preventaEnProcesoId = null;
  carrito = []; descuento = 0; propina = 0;
  const campoNotaPedido = document.getElementById("notaPedido");
  if (campoNotaPedido) campoNotaPedido.value = "";

  const pD = $("#panelDescuento");
  const tD = $("#toggleDescuento");
  if (pD) pD.classList.add("oculto");
  if (tD) tD.classList.remove("activo");

  cerrarCarritoModal();
  renderCarrito();
  renderCaja();
  if (typeof renderInsumos === "function") renderInsumos();
  if (typeof renderProductos === "function") renderProductos();
  renderEstadoCaja();
  reproducirSonido("cobro");
  mostrarTicketImpresion(venta);

  if (metodo === "Efectivo" && cambio > 0) {
    toast(`✅ Venta #${venta.id} · Cambio: ${fmt(cambio)}`);
  } else {
    toast(`✅ Venta #${venta.id} cobrada: ${fmt(total)}`);
  }
}
