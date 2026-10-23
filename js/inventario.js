/* ============================================
   INVENTARIO.JS — CONTROL SIMPLE DE EXISTENCIAS
   Los movimientos se conservan internamente para mantener consistencia,
   pero no se muestra una pantalla de Kardex.
   ============================================ */

function asegurarMovimientosInventario() {
  if (!Array.isArray(DB.inventarioMovimientos)) DB.inventarioMovimientos = [];
}

function registrarMovimientoInventario(m) {
  asegurarMovimientosInventario();
  DB.inventarioMovimientos.push({ id:nuevoId(DB.inventarioMovimientos), fecha:new Date().toISOString(), ...m });
}

// Se conserva el nombre por compatibilidad con la navegación existente.
function renderInsumos() {
  renderInventarioProductos();
}

function renderInventarioProductos() {
  const el = $("#listaStockProductos"); if (!el) return;
  const productos = DB.productos.filter(p => modoInventarioProducto(p) === "producto" || modoInventarioProducto(p) === "derivado");
  if (!productos.length) {
    el.innerHTML = `<div style="padding:18px;color:#94a3b8;font-size:13px">Todavía no hay productos con stock controlado. Entra a Productos, edita un artículo y activa el control de existencia.</div>`;
    return;
  }
  el.innerHTML = `<table><thead><tr><th>Producto</th><th>Existencia</th><th>Mínimo</th><th>Unidad</th><th>Compra</th><th>Acciones</th></tr></thead><tbody>${productos.map(p => {
    const modo = modoInventarioProducto(p), stock = existenciaVisibleProducto(p), base = productoBaseInventario(p);
    const minimo = Math.max(0, Number(p.stockMinimo) || 0), bajo = stock !== null && minimo > 0 && stock <= minimo;
    return `<tr>
      <td data-label="Producto"><b>${p.emoji || "🍽️"} ${escapeHTML(p.nombre)}</b>${modo === "derivado" ? `<div style="font-size:11px;color:#64748b">Descuenta de: ${escapeHTML(base?.nombre || "Producto no disponible")}</div>` : ""}</td>
      <td data-label="Existencia"><b>${stock === null ? "—" : stock.toLocaleString("es-MX",{maximumFractionDigits:3})}</b>${bajo ? `<div style="font-size:10px;color:#b91c1c;font-weight:700">Stock bajo</div>` : ""}</td>
      <td data-label="Mínimo">${minimo.toLocaleString("es-MX",{maximumFractionDigits:3})}</td>
      <td data-label="Unidad">${escapeHTML(p.unidad || "pieza")}</td>
      <td data-label="Compra">${Number(p.precioCompra) > 0 ? fmt(p.precioCompra) : "—"}</td>
      <td data-label="Acciones"><button class="btn-mini" onclick="abrirFormProducto(${p.id})" title="Editar producto o agregar stock">✏️ / 📥</button>${modo === "producto" ? `<button class="btn-mini" onclick="abrirAjusteProducto(${p.id})" title="Ajustar existencia">↕</button>` : ""}</td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

// El registro de compras se realiza ahora desde el formulario del producto.
function abrirEntradaProducto(productoId) {
  abrirFormProducto(productoId);
}

function abrirAjusteProducto(id) {
  const p = DB.productos.find(x => String(x.id) === String(id));
  if (!p || modoInventarioProducto(p) !== "producto") return toast("Producto no disponible para ajuste");
  abrirModal("↕ Ajustar existencia", `<p style="font-size:13px;color:#64748b">${escapeHTML(p.nombre)} · actual: <b>${Number(p.stock || 0).toLocaleString("es-MX",{maximumFractionDigits:3})} ${escapeHTML(p.unidad || "pieza")}</b></p>
    <label>Nueva existencia real</label><input id="apStock" type="number" min="0" step="0.001" value="${Number(p.stock || 0)}" inputmode="decimal">
    <label>Motivo del ajuste</label><input id="apMotivo" maxlength="160" placeholder="Conteo físico, merma, corrección...">
    <div class="acciones"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" onclick="guardarAjusteProducto(${id})">Guardar ajuste</button></div>`);
}

function guardarAjusteProducto(id) {
  const p = DB.productos.find(x => String(x.id) === String(id));
  if (!p || modoInventarioProducto(p) !== "producto") return;
  const nuevo = numeroCampoProducto($("#apStock").value), motivo = $("#apMotivo").value.trim();
  if (!Number.isFinite(nuevo) || nuevo < 0 || !motivo) return toast("Indica una existencia válida y el motivo");
  const antes = Math.max(0, Number(p.stock) || 0), delta = nuevo - antes;
  p.stock = nuevo;
  registrarMovimientoInventario({ entidadTipo:"producto", entidadId:p.id, nombre:p.nombre, tipo:"ajuste", cantidad:delta, cantidadAbsoluta:Math.abs(delta), costoTotal:0, stockAntes:antes, stockDespues:nuevo, motivo });
  guardar(); cerrarModal(); renderInventarioProductos(); renderProductos(); renderCaja(); mostrarAlertaStock(); toast("✅ Existencia ajustada");
}

// Mantiene el registro interno para compatibilidad con respaldos y reversión de ventas.
// No se presenta en la interfaz porque el Kardex queda fuera por ahora.
function renderMovimientosInventario() { asegurarMovimientosInventario(); }
