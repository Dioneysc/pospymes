/* ============================================
   PREVENTA.JS — PEDIDOS PENDIENTES AISLADOS
   No registra ventas ni modifica caja o inventario.
   ============================================ */
function guardarPreventa() {
  if (!Array.isArray(carrito) || carrito.length === 0) {
    return toast("⚠️ Agrega productos al carrito antes de guardar una preventa");
  }

  const subtotal = redondear2(carrito.reduce((s, item) => s + (Number(item.precio) || 0) * (Number(item.cantidad) || 0), 0));
  const descuentoAplicado = Math.min(redondear2(Number(descuento) || 0), subtotal);
  const total = redondear2(subtotal - descuentoAplicado);
  const nota = (document.getElementById("notaPedido")?.value || "").trim().slice(0, 300);
  const sesion = JSON.parse(sessionStorage.getItem("sesion") || "{}");
  const preventas = LS.get("preventasPendientes", []);

  // Si el carrito viene de una preventa cargada, se actualiza esa misma en lugar de duplicarla
  const idEnProceso = Number(window._preventaEnProcesoId) || 0;
  const existente = idEnProceso
    ? preventas.find(p => Number(p.id) === idEnProceso && (p.estado || "Pendiente").toLowerCase() === "pendiente")
    : null;

  const pedido = {
    id: existente ? existente.id : nuevoId(preventas),
    fecha: existente ? existente.fecha : new Date().toISOString(),
    estado: "Pendiente",
    items: JSON.parse(JSON.stringify(carrito)),
    subtotal,
    descuento: descuentoAplicado,
    total,
    nota,
    usuario: existente ? (existente.usuario || sesion.nombre || "admin") : (sesion.nombre || "admin")
  };

  if (existente) preventas[preventas.indexOf(existente)] = pedido;
  else preventas.push(pedido);
  LS.set("preventasPendientes", preventas);
  window._preventaActual = pedido;

  // El pedido ya está guardado; limpiar el carrito para evitar duplicarlo
  // o incluir productos de esta preventa en la siguiente operación.
  carrito = [];
  descuento = 0;
  descuentoPct = 0;
  propina = 0;
  window._preventaEnProcesoId = null;

  const campoNotaPedido = document.getElementById("notaPedido");
  if (campoNotaPedido) campoNotaPedido.value = "";

  const panelDescuento = document.getElementById("panelDescuento");
  const toggleDescuento = document.getElementById("toggleDescuento");
  if (panelDescuento) panelDescuento.classList.add("oculto");
  if (toggleDescuento) toggleDescuento.classList.remove("activo");

  if (typeof cerrarCarritoModal === "function") cerrarCarritoModal();
  if (typeof renderCarrito === "function") renderCarrito();
  if (typeof renderListaPreventas === "function") renderListaPreventas();

  mostrarOpcionesPreventa(pedido);
}

/* Después de guardar, permite imprimir el pedido o compartirlo por WhatsApp. */
function mostrarOpcionesPreventa(pedido) {
  abrirModal("📅 Preventa #" + pedido.id + " guardada", `
    <div style="text-align:center;padding:8px 0 16px">
      <div style="font-size:42px;margin-bottom:8px">✅</div>
      <p style="margin:0 0 6px;font-weight:800">Pedido guardado como pendiente</p>
      <p style="margin:0;color:var(--texto-secundario,#64748b);font-size:13px">No se registró una venta ni se realizó un cobro.</p>
      <p style="margin:12px 0 0;font-size:18px;font-weight:900">Total: ${fmt(pedido.total)}</p>
    </div>
    <div class="ticket-acciones preventa-modal-acciones">
      <button class="btn-imprimir" onclick="imprimirPreventa(${pedido.id})">🖨️ Imprimir</button>
      <button class="btn-whatsapp" onclick="compartirPreventaWhatsApp(${pedido.id})">📤 WhatsApp</button>
    </div>
    <div class="acciones" style="margin-top:10px">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
    </div>
  `);
}

function obtenerPreventa(id) {
  const preventas = LS.get("preventasPendientes", []);
  return preventas.find(p => Number(p.id) === Number(id)) ||
    (window._preventaActual && Number(window._preventaActual.id) === Number(id) ? window._preventaActual : null);
}

function imprimirPreventa(id) {
  const pedido = obtenerPreventa(id);
  if (!pedido) return toast("⚠️ No se encontró la preventa");

  const nota = (pedido.nota || "").trim();
  const ticketAndroid = {
    ...pedido,
    notas: ["PREVENTA PENDIENTE", nota ? "Nota: " + nota : ""].filter(Boolean).join("\n"),
    metodo: "PREVENTA PENDIENTE",
    pagoCon: 0,
    cambio: 0,
    propina: 0
  };

  // En la terminal Android, utilizar la impresora Bluetooth nativa existente.
  if (typeof EN_ANDROID !== "undefined" && EN_ANDROID) {
    if (typeof Android !== "undefined" && Android.isConnected && Android.isConnected()) {
      const enviado = typeof androidImprimirTicket === "function" && androidImprimirTicket(ticketAndroid);
      if (enviado) {
        cerrarModal();
        toast("🖨️ Preventa enviada a la impresora");
      } else {
        toast("⚠️ No se pudo imprimir la preventa");
      }
    } else {
      toast("⚠️ No hay impresora Bluetooth conectada");
      if (typeof abrirModalImpresora === "function") abrirModalImpresora();
    }
    return;
  }

  // En navegador, imprimir un comprobante específico de preventa pendiente.
  const negocio = DB.negocio || {};
  const itemsHTML = (pedido.items || []).map(it => `
    <div class="fila"><span>${Number(it.cantidad) || 0}x ${escapeHTML(it.nombre || "Producto")}</span><span>${fmt((Number(it.precio) || 0) * (Number(it.cantidad) || 0))}</span></div>
  `).join("");
  const html = `
    <div class="c b g">${escapeHTML(negocio.nombre || "POS")}</div>
    <div class="c">${escapeHTML(negocio.slogan || "")}</div>
    <div class="c">${escapeHTML(negocio.direccion || "")}</div>
    <div class="c">Tel: ${escapeHTML(negocio.telefono || "")}</div>
    <hr>
    <div class="c b g">PREVENTA - PENDIENTE</div>
    <div>Pedido #${String(pedido.id).padStart(6, "0")}</div>
    <div>${new Date(pedido.fecha).toLocaleString("es-MX")}</div>
    <div>Cajero: ${escapeHTML(pedido.usuario || "admin")}</div>
    ${nota ? `<div><strong>Nota:</strong> ${escapeHTML(nota).replace(/\n/g, "<br>")}</div>` : ""}
    <hr>${itemsHTML}<hr>
    <div class="fila"><span>Subtotal:</span><span>${fmt(pedido.subtotal)}</span></div>
    ${pedido.descuento ? `<div class="fila"><span>Descuento:</span><span>-${fmt(pedido.descuento)}</span></div>` : ""}
    <div class="fila b g"><span>TOTAL:</span><span>${fmt(pedido.total)}</span></div>
    <hr><div class="c b">PEDIDO NO COBRADO</div>
    <div class="c">${escapeHTML(negocio.nombre || "")}</div>
  `;
  if (typeof imprimirHTML === "function") {
    cerrarModal();
    imprimirHTML(html, "ticket");
  } else {
    toast("⚠️ La función de impresión no está disponible");
  }
}

function compartirPreventaWhatsApp(id) {
  const pedido = obtenerPreventa(id);
  if (!pedido) return toast("⚠️ No se encontró la preventa");

  const negocio = DB.negocio || {};
  let texto = `*${negocio.nombre || "POS"}*\n`;
  if (negocio.slogan) texto += `${negocio.slogan}\n`;
  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `📅 *PREVENTA PENDIENTE #${String(pedido.id).padStart(6, "0")}*\n`;
  texto += `🕒 ${new Date(pedido.fecha).toLocaleString("es-MX")}\n`;
  texto += `👤 Cajero: ${pedido.usuario || "admin"}\n`;
  texto += `━━━━━━━━━━━━━━━\n`;
  (pedido.items || []).forEach(it => {
    texto += `▪️ ${it.cantidad}x ${it.nombre}\n`;
    texto += `   ${fmt((Number(it.precio) || 0) * (Number(it.cantidad) || 0))}\n`;
  });
  texto += `━━━━━━━━━━━━━━━\n`;
  texto += `Subtotal: ${fmt(pedido.subtotal)}\n`;
  if (pedido.descuento) texto += `Descuento: -${fmt(pedido.descuento)}\n`;
  texto += `*TOTAL: ${fmt(pedido.total)}*\n`;
  if (pedido.nota) texto += `📝 Nota: ${pedido.nota}\n`;
  texto += `⚠️ Pedido pendiente de cobro.\n`;
  texto += `━━━━━━━━━━━━━━━\n¡Gracias por su preferencia! 🍗`;

  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener");
  toast("📤 Abriendo WhatsApp para compartir la preventa...");
}


/* ============================================
   LISTA DE PREVENTAS — consulta y acciones seguras
   Las preventas siguen almacenadas localmente en LS.
   ============================================ */
function renderListaPreventas() {
  const resumen = document.getElementById("resumenPreventas");
  const contenedor = document.getElementById("listaPreventasContenido");
  if (!resumen || !contenedor) return;

  const preventas = LS.get("preventasPendientes", []);
  const lista = Array.isArray(preventas) ? preventas.slice().sort((a, b) => {
    const fechaA = new Date(a.fecha || 0).getTime() || 0;
    const fechaB = new Date(b.fecha || 0).getTime() || 0;
    return fechaB - fechaA || (Number(b.id) || 0) - (Number(a.id) || 0);
  }) : [];
  const pendientes = lista.filter(p => (p.estado || "Pendiente").toLowerCase() === "pendiente");
  const totalPendiente = pendientes.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const busqueda = (document.getElementById("buscarPreventa")?.value || "").trim().toLocaleLowerCase("es-MX");
  const filtradas = pendientes.filter(p => {
    if (!busqueda) return true;
    const productos = (p.items || []).map(i => i.nombre || "").join(" ");
    const texto = [p.id, p.usuario, p.nota, productos, p.total].join(" ").toLocaleLowerCase("es-MX");
    return texto.includes(busqueda);
  });

  resumen.innerHTML = `
    <div style="flex:1;min-width:135px;background:var(--superficie,#fff);border:1px solid var(--borde);border-radius:14px;padding:13px">
      <div style="font-size:12px;color:var(--texto-secundario,#64748b);font-weight:700">PEDIDOS PENDIENTES</div>
      <div style="font-size:24px;font-weight:900;margin-top:3px">${pendientes.length}</div>
    </div>
    <div style="flex:1;min-width:135px;background:var(--superficie,#fff);border:1px solid var(--borde);border-radius:14px;padding:13px">
      <div style="font-size:12px;color:var(--texto-secundario,#64748b);font-weight:700">IMPORTE PENDIENTE</div>
      <div style="font-size:24px;font-weight:900;margin-top:3px">${fmt(totalPendiente)}</div>
    </div>`;

  if (!pendientes.length) {
    contenedor.innerHTML = `
      <div style="text-align:center;background:var(--superficie,#fff);border:1px solid var(--borde);border-radius:16px;padding:28px 18px">
        <div style="font-size:42px;margin-bottom:8px">📭</div>
        <h3 style="margin:0 0 8px">No hay preventas pendientes</h3>
        <p style="margin:0 0 16px;color:var(--texto-secundario,#64748b);font-size:13px">Cuando guardes un pedido con el botón Preventa, aparecerá aquí.</p>
        <button class="btn-primary" type="button" onclick="cambiarVista('caja')">🛒 Ir a venta</button>
      </div>`;
    return;
  }

  if (!filtradas.length) {
    contenedor.innerHTML = `<div style="text-align:center;padding:24px;color:var(--texto-secundario,#64748b)">No se encontraron preventas con “${escapeHTML(busqueda)}”.</div>`;
    return;
  }

  contenedor.innerHTML = filtradas.map(p => {
    const fecha = p.fecha && !Number.isNaN(new Date(p.fecha).getTime())
      ? new Date(p.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
      : "Fecha no disponible";
    const cantidadProductos = (p.items || []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0);
    const itemsHTML = (p.items || []).map(i => `
      <div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--borde,#e5e7eb);font-size:13px">
        <span>${Number(i.cantidad) || 0} × ${escapeHTML(i.nombre || "Producto")}</span>
        <strong style="white-space:nowrap">${fmt((Number(i.precio) || 0) * (Number(i.cantidad) || 0))}</strong>
      </div>`).join("");
    return `
      <article style="background:var(--superficie,#fff);border:1px solid var(--borde);border-radius:16px;padding:15px;margin-bottom:12px;box-shadow:0 3px 12px rgba(0,0,0,.035)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:900;font-size:17px">Preventa #${escapeHTML(String(p.id ?? "—"))}</div>
            <div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:4px">${escapeHTML(fecha)} · ${cantidadProductos} producto(s)</div>
          </div>
          <span style="background:#fef3c7;color:#92400e;padding:5px 9px;border-radius:20px;font-size:11px;font-weight:800">● PENDIENTE</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:13px">
          <span style="color:var(--texto-secundario,#64748b);font-size:13px">Total del pedido</span>
          <strong style="font-size:21px">${fmt(Number(p.total) || 0)}</strong>
        </div>
        ${p.nota ? `<div style="margin-top:10px;padding:9px 10px;background:var(--fondo,#f8fafc);border-radius:9px;font-size:13px"><strong>📝 Nota:</strong> ${escapeHTML(p.nota)}</div>` : ""}
        <details style="margin-top:12px">
          <summary style="cursor:pointer;font-weight:750;font-size:13px;padding:5px 0">Ver productos y detalle</summary>
          <div style="margin-top:7px">${itemsHTML}
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px"><span>Subtotal</span><span>${fmt(Number(p.subtotal) || 0)}</span></div>
            ${Number(p.descuento) > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px"><span>Descuento</span><span>-${fmt(Number(p.descuento))}</span></div>` : ""}
            <div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-top:7px">Atendió: ${escapeHTML(p.usuario || "admin")}</div>
          </div>
        </details>
        <div class="preventa-lista-acciones">
          <button class="btn-primary" type="button" onclick="prepararPreventaVenta(${Number(p.id) || 0})">🛒 Pasar a venta</button>
          <button class="btn-imprimir" type="button" onclick="imprimirPreventa(${Number(p.id) || 0})">🖨️ Imprimir</button>
          <button class="btn-whatsapp" type="button" onclick="compartirPreventaWhatsApp(${Number(p.id) || 0})">📤 WhatsApp</button>
          <button class="btn-danger" type="button" onclick="eliminarPreventa(${Number(p.id) || 0})">🗑️ Eliminar</button>
        </div>
      </article>`;
  }).join("");
}


/* Elimina una preventa pendiente del almacenamiento local tras confirmación. */
function eliminarPreventa(id) {
  const preventas = LS.get("preventasPendientes", []);
  if (!Array.isArray(preventas)) return toast("⚠️ No se pudo leer la lista de preventas");

  const pedido = preventas.find(p => Number(p.id) === Number(id));
  if (!pedido) return toast("⚠️ No se encontró la preventa");
  if ((pedido.estado || "Pendiente").toLowerCase() !== "pendiente") {
    return toast("⚠️ Solo se pueden eliminar preventas pendientes");
  }

  const confirmar = confirm("¿Eliminar la preventa #" + pedido.id + "? Esta acción no se puede deshacer.");
  if (!confirmar) return;

  const actualizadas = preventas.filter(p => Number(p.id) !== Number(id));
  LS.set("preventasPendientes", actualizadas);

  if (Number(window._preventaEnProcesoId) === Number(id)) {
    window._preventaEnProcesoId = null;
  }
  if (window._preventaActual && Number(window._preventaActual.id) === Number(id)) {
    window._preventaActual = null;
  }

  renderListaPreventas();
  toast("🗑️ Preventa #" + pedido.id + " eliminada");
}

/* Carga una preventa al carrito para cobrarla con el flujo de venta existente.
   No registra ni cobra nada hasta que el cajero complete el cobro normal. */
function prepararPreventaVenta(id) {
  const pedido = obtenerPreventa(id);
  if (!pedido || (pedido.estado || "Pendiente").toLowerCase() !== "pendiente") {
    return toast("⚠️ Esta preventa ya no está pendiente o no se encontró");
  }
  if (Array.isArray(carrito) && carrito.length && !confirm("¿Reemplazar el carrito actual con la preventa #" + pedido.id + "?")) return;

  carrito = JSON.parse(JSON.stringify(pedido.items || []));
  descuento = Number(pedido.descuento) || 0;
  descuentoPct = 0;
  propina = 0;
  window._preventaEnProcesoId = Number(pedido.id);
  const campoNota = document.getElementById("notaPedido");
  if (campoNota) campoNota.value = (pedido.nota || "").slice(0, 300);

  cambiarVista("caja");
  renderCarrito();
  toast("🛒 Preventa #" + pedido.id + " cargada. Cobra con el proceso normal para registrar la venta.");
}

/* Se llama únicamente cuando finaliza correctamente el cobro de una preventa cargada. */
function marcarPreventaConvertida(preventaId, ventaId) {
  const preventas = LS.get("preventasPendientes", []);
  if (!Array.isArray(preventas)) return;
  const pedido = preventas.find(p => Number(p.id) === Number(preventaId));
  if (!pedido) return;
  pedido.estado = "Convertida";
  pedido.ventaId = Number(ventaId) || ventaId || null;
  pedido.fechaConversion = new Date().toISOString();
  LS.set("preventasPendientes", preventas);
}
