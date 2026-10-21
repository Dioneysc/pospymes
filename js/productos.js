/* ============================================
   PRODUCTOS.JS — PRODUCTOS E INVENTARIO SIMPLE
   ============================================ */

function modoInventarioProducto(p) {
  if (!p) return "ninguno";
  // Los productos que antes usaban recetas pasan a control simple, sin consumir insumos.
  if (p.modoInventario === "receta") return "ninguno";
  if (p.modoInventario === "derivado") return "derivado";
  if (p.modoInventario === "ninguno") return "ninguno";
  if (p.modoInventario === "producto") return p.stock === undefined || p.stock === null ? "ninguno" : "producto";
  if (p.stock !== undefined && p.stock !== null && Number.isFinite(Number(p.stock))) return "producto";
  return "ninguno";
}

function productoBaseInventario(p) {
  if (!p) return null;
  const modo = modoInventarioProducto(p);
  if (modo === "producto") return p;
  if (modo === "derivado") return DB.productos.find(x => String(x.id) === String(p.stockProductoId)) || null;
  return null;
}

function factorInventarioProducto(p) {
  return modoInventarioProducto(p) === "derivado" ? Math.max(0, Number(p.stockFactor) || 0) : 1;
}

function existenciaVisibleProducto(p) {
  const modo = modoInventarioProducto(p);
  if (modo === "producto") return Math.max(0, Number(p.stock) || 0);
  if (modo === "derivado") {
    const base = productoBaseInventario(p), factor = factorInventarioProducto(p);
    if (!base || factor <= 0 || base.stock === undefined || base.stock === null) return null;
    return Math.max(0, Number(base.stock) || 0) / factor;
  }
  return null;
}

function numeroCampoProducto(valor) {
  if (typeof valor === "number") return valor;
  const normalizado = String(valor ?? "").trim().replace(/,/g, ".");
  return normalizado === "" ? NaN : Number(normalizado);
}

function renderProductos() {
  const el = $("#listaProductos");
  if (!el) return;
  if (!DB.productos.length) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:60px;margin-bottom:12px">🍗</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">Sin productos todavía</h3>
        <p style="font-size:13px;margin-bottom:16px">Agrega tu primer producto</p>
        <button class="btn-primary" onclick="abrirFormProducto()" style="padding:12px 24px">+ Agregar producto</button>
      </div>`;
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Producto</th><th>Venta</th><th>Compra</th><th>Existencia</th><th>Mínimo</th><th>Unidad</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>${DB.productos.map(p => {
        const modo = modoInventarioProducto(p), stock = existenciaVisibleProducto(p);
        const minimo = Math.max(0, Number(p.stockMinimo) || 0);
        const bajo = stock !== null && minimo > 0 && stock <= minimo;
        const control = {producto:"Propio", derivado:"Por pieza", ninguno:"Sin stock"}[modo] || "Sin stock";
        return `<tr>
          <td data-label="Producto"><span style="font-size:22px;margin-right:5px">${p.emoji || "🍽️"}</span><b>${escapeHTML(p.nombre)}</b><div style="font-size:11px;color:#64748b">${escapeHTML(p.categoria || "General")} · ${control}</div></td>
          <td data-label="Venta"><b>${fmt(p.precio)}</b></td>
          <td data-label="Compra">${Number(p.precioCompra) > 0 ? fmt(p.precioCompra) : "—"}</td>
          <td data-label="Existencia">${stock === null ? "—" : `<b>${stock.toLocaleString("es-MX", {maximumFractionDigits:3})}</b>${bajo ? `<div style="font-size:10px;color:#b91c1c;font-weight:700">Stock bajo</div>` : ""}`}</td>
          <td data-label="Mínimo">${minimo.toLocaleString("es-MX",{maximumFractionDigits:3})}</td>
          <td data-label="Unidad">${escapeHTML(p.unidad || "pieza")}</td>
          <td data-label="Estado"><span class="badge ${p.activo?'ok':'danger'}">${p.activo?'Activo':'Inactivo'}</span></td>
          <td data-label="Acciones">
            <button class="btn-mini" onclick="abrirFormProducto(${p.id})" title="Editar producto e inventario">✏️</button>
            <button class="btn-mini" onclick="toggleProducto(${p.id})" title="Activar/Desactivar">${p.activo?'🚫':'✅'}</button>
            <button class="btn-mini" onclick="borrarProducto(${p.id})" title="Borrar">🗑️</button>
          </td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

function abrirFormProducto(id) {
  const existente = id ? DB.productos.find(x => String(x.id) === String(id)) : null;
  if (id && !existente) return toast("Producto no encontrado");
  const p = existente || { nombre:"", precio:"", precioCompra:"", categoria:"General", emoji:"🍽️", activo:true, stock:0, stockMinimo:0, unidad:"pieza", modoInventario:"producto" };
  const modo = modoInventarioProducto(p);
  const tieneStockPropio = !!(existente && modo === "producto" && p.stock !== undefined && p.stock !== null);
  const opcionesBase = DB.productos.filter(x => String(x.id) !== String(id || "") && modoInventarioProducto(x) === "producto");
  const precioCompra = p.precioCompra ?? p.costoPromedio ?? "";
  const unidades = ["pieza","kg","g","L","ml","paquete","bolsa","caja","docena","porción","unidad"];
  const unidadActual = p.unidad || "pieza";
  const unidadOpciones = unidades.includes(unidadActual) ? unidades : [...unidades, unidadActual];

  abrirModal(id ? "Editar producto" : "Nuevo producto", `
    <label>Nombre</label><input id="fpNombre" value="${escapeHTML(p.nombre)}" autocomplete="off">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label>Precio de venta ($)</label><input id="fpPrecio" type="number" min="0.01" step="0.01" value="${p.precio}" inputmode="decimal"></div>
      <div><label>Precio de compra por unidad ($)</label><input id="fpPrecioCompra" type="number" min="0" step="0.01" value="${precioCompra}" placeholder="Opcional" inputmode="decimal"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label>Unidad</label><select id="fpUnidad">${unidadOpciones.map(u=>`<option value="${escapeHTML(u)}" ${u===unidadActual?'selected':''}>${escapeHTML(u)}</option>`).join("")}</select></div>
      <div><label>Stock mínimo</label><input id="fpStockMinimo" type="number" min="0" step="0.001" value="${p.stockMinimo ?? 0}" inputmode="decimal"></div>
    </div>
    <label>Control de existencia</label>
    <select id="fpModoInventario" onchange="actualizarCamposInventarioProducto()">
      <option value="producto" ${modo==='producto'?'selected':''}>Controlar stock de este producto</option>
      <option value="derivado" ${modo==='derivado'?'selected':''}>Descontar de otro producto</option>
      <option value="ninguno" ${modo==='ninguno'?'selected':''}>No controlar stock</option>
    </select>
    <div id="fpGrupoStock" style="${modo==='producto'?'':'display:none'}">
      <label>${tieneStockPropio ? "Existencia actual" : "Existencia inicial"}</label>
      <input id="fpStock" type="number" min="0" step="0.001" value="${p.stock === undefined || p.stock === null ? "" : p.stock}" ${tieneStockPropio ? 'readonly' : ''} placeholder="Ej. 24,5" inputmode="decimal">
      <small style="display:block;color:#64748b;margin-top:4px">Puedes usar decimales, por ejemplo 24,5. ${tieneStockPropio ? "Para cambiar la cantidad directamente, usa Ajuste." : "Captura la cantidad real que tienes."}</small>
    </div>
    <div id="fpGrupoEntrada" data-disponible="${tieneStockPropio ? "true" : "false"}" style="${tieneStockPropio && modo==='producto'?'':'display:none'};border:1px solid #dbe5ed;border-radius:9px;padding:10px;margin-top:10px">
      <b style="display:block;margin-bottom:6px">Agregar stock ahora</b>
      <label>Cantidad que recibiste</label><input id="fpEntradaCantidad" type="number" min="0" step="0.001" value="0" inputmode="decimal">
      <div id="fpEntradaResumen" style="font-size:12px;color:#64748b;margin-top:6px">Costo total de la entrada: $0.00</div>
      <small style="display:block;color:#64748b;margin-top:4px">El costo total se calcula con el precio de compra por unidad.</small>
    </div>
    <div id="fpGrupoDerivado" style="${modo==='derivado'?'':'display:none'};margin-top:8px">
      <label>Descontar existencia de</label>
      <select id="fpStockProductoId">${opcionesBase.map(x=>`<option value="${x.id}" ${String(p.stockProductoId)===String(x.id)?'selected':''}>${escapeHTML(x.nombre)}</option>`).join("")}</select>
      <label>Cuánto consume cada unidad vendida</label><input id="fpStockFactor" type="number" min="0.001" step="0.001" value="${p.stockFactor === undefined || p.stockFactor === null ? "0.5" : p.stockFactor}" inputmode="decimal">
      <small style="display:block;color:#64748b;margin-top:4px">Medio pollo = 0,5; cuarto de pollo = 0,25.</small>
    </div>
    <label>Categoría</label><input id="fpCategoria" value="${escapeHTML(p.categoria || "General")}">
    <label>Emoji del producto</label><input id="fpEmoji" value="${p.emoji || "🍽️"}" maxlength="4" style="font-size:24px;text-align:center">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
      ${["🍗","🍖","🥤","🌶️","🥡","🔥","🌮","🐔","🥣","🍞","🌭","🍟","🧃","🍺","☕","🍰"].map(e => `<button type="button" onclick="document.getElementById('fpEmoji').value='${e}'" style="font-size:22px;padding:6px 10px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer">${e}</button>`).join("")}
    </div>
    <label>Activo</label><select id="fpActivo"><option value="true" ${p.activo?'selected':''}>Sí</option><option value="false" ${!p.activo?'selected':''}>No</option></select>
    <div class="acciones"><button class="btn-secondary" onclick="cerrarModal()">Cancelar</button><button class="btn-primary" onclick="guardarProducto(${id||0})">Guardar</button></div>
  `);
  ["fpEntradaCantidad","fpPrecioCompra"].forEach(campo => document.getElementById(campo)?.addEventListener("input", actualizarResumenEntradaFicha));
  actualizarResumenEntradaFicha();
}

function actualizarResumenEntradaFicha() {
  const cantidad = numeroCampoProducto(document.getElementById("fpEntradaCantidad")?.value || 0);
  const precio = numeroCampoProducto(document.getElementById("fpPrecioCompra")?.value || 0);
  const el = document.getElementById("fpEntradaResumen");
  if (!el) return;
  const total = Math.max(0, cantidad || 0) * Math.max(0, precio || 0);
  el.textContent = `Costo total de la entrada: ${fmt(total)}`;
}

function actualizarCamposInventarioProducto() {
  const modo = document.getElementById("fpModoInventario")?.value || "ninguno";
  const propio = document.getElementById("fpGrupoStock"), derivado = document.getElementById("fpGrupoDerivado"), entrada = document.getElementById("fpGrupoEntrada");
  if (propio) propio.style.display = modo === "producto" ? "block" : "none";
  if (derivado) derivado.style.display = modo === "derivado" ? "block" : "none";
  if (entrada) entrada.style.display = modo === "producto" && entrada.dataset.disponible === "true" ? "block" : "none";
}

function guardarProducto(id) {
  const nombre = $("#fpNombre").value.trim();
  const precio = numeroCampoProducto($("#fpPrecio").value);
  const precioCompraTexto = $("#fpPrecioCompra").value.trim();
  const precioCompra = precioCompraTexto === "" ? null : numeroCampoProducto(precioCompraTexto);
  const stockMinimo = numeroCampoProducto($("#fpStockMinimo").value || 0);
  const unidad = $("#fpUnidad").value || "pieza";
  const categoria = $("#fpCategoria").value.trim() || "General", emoji = $("#fpEmoji").value.trim() || "🍽️";
  const activo = $("#fpActivo").value === "true", modoInventario = $("#fpModoInventario").value;
  const anterior = id ? DB.productos.find(x => String(x.id) === String(id)) : null;
  if (!nombre || !Number.isFinite(precio) || precio <= 0) return toast("Completa el nombre y un precio de venta válido");
  if (precioCompra !== null && (!Number.isFinite(precioCompra) || precioCompra < 0)) return toast("Revisa el precio de compra");
  if (!Number.isFinite(stockMinimo) || stockMinimo < 0) return toast("El stock mínimo debe ser 0 o mayor");
  if (id && !anterior) return toast("Producto no encontrado");

  const data = { nombre, precio, precioCompra: precioCompra === null ? (anterior?.precioCompra ?? null) : precioCompra, unidad, stockMinimo, categoria, emoji, activo, modoInventario };
  let movimientoInicial = null;
  let movimientoCompra = null;

  if (modoInventario === "producto") {
    const stockTexto = $("#fpStock").value.trim();
    const stockActualConfigurado = !!(anterior && modoInventarioProducto(anterior) === "producto" && anterior.stock !== undefined && anterior.stock !== null);
    let stock = stockActualConfigurado ? Math.max(0, Number(anterior.stock) || 0) : numeroCampoProducto(stockTexto);
    if (!Number.isFinite(stock) || stock < 0) return toast("Indica la existencia real del producto");
    data.stockProductoId = null; data.stockFactor = null;

    if (stockActualConfigurado) {
      const cantidadEntrada = numeroCampoProducto($("#fpEntradaCantidad")?.value || 0);
      if (!Number.isFinite(cantidadEntrada) || cantidadEntrada < 0) return toast("La cantidad de entrada debe ser 0 o mayor");
      if (cantidadEntrada > 0) {
        if (precioCompra === null || !Number.isFinite(precioCompra) || precioCompra <= 0) return toast("Indica un precio de compra mayor que 0 para agregar stock");
        const costoTotal = cantidadEntrada * precioCompra;
        const antes = stock, nuevoStock = antes + cantidadEntrada;
        const costoAnterior = Number(anterior.costoPromedio ?? anterior.precioCompra ?? precioCompra) || 0;
        data.stock = nuevoStock;
        data.costoPromedio = nuevoStock > 0 ? ((antes * costoAnterior) + costoTotal) / nuevoStock : precioCompra;
        movimientoCompra = { entidadTipo:"producto", entidadId:anterior.id, nombre, tipo:"compra", cantidad:cantidadEntrada, costoTotal, costoUnitario:precioCompra, stockAntes:antes, stockDespues:nuevoStock, motivo:"Compra registrada desde la ficha del producto" };
      } else {
        data.stock = stock;
        data.costoPromedio = anterior.costoPromedio ?? (stock > 0 ? (anterior.precioCompra ?? precioCompra) : null);
      }
    } else {
      data.stock = stock;
      data.costoPromedio = anterior?.costoPromedio ?? (stock > 0 ? (precioCompra ?? null) : null);
      if (stock > 0) movimientoInicial = { entidadTipo:"producto", entidadId:id || null, nombre, tipo:"entrada", cantidad:stock, costoTotal:precioCompra ? stock * precioCompra : 0, stockAntes:0, stockDespues:stock, motivo:"Existencia inicial configurada" };
    }
  } else if (modoInventario === "derivado") {
    const baseId = Number($("#fpStockProductoId").value), factor = numeroCampoProducto($("#fpStockFactor").value);
    const base = DB.productos.find(x => String(x.id) === String(baseId));
    if (!base || String(base.id) === String(id) || modoInventarioProducto(base) !== "producto") return toast("Selecciona un producto base con existencia propia");
    if (!Number.isFinite(factor) || factor <= 0) return toast("La cantidad consumida debe ser mayor que cero");
    if (anterior && modoInventarioProducto(anterior) === "producto" && Number(anterior.stock) > 0 && !confirm("Al cambiar el control, la existencia propia de este producto dejará de utilizarse. ¿Deseas continuar?")) return;
    data.stock = null; data.stockProductoId = baseId; data.stockFactor = factor; data.costoPromedio = null;
  } else {
    if (anterior && modoInventarioProducto(anterior) === "producto" && Number(anterior.stock) > 0 && !confirm("Al desactivar el control de stock, la existencia actual dejará de utilizarse. ¿Deseas continuar?")) return;
    data.stock = null; data.stockProductoId = null; data.stockFactor = null; data.costoPromedio = null;
  }

  let productoGuardado;
  if (id) {
    Object.assign(anterior, data);
    productoGuardado = anterior;
  } else {
    productoGuardado = { id:nuevoId(DB.productos), ...data };
    DB.productos.push(productoGuardado);
  }
  if (movimientoInicial) {
    movimientoInicial.entidadId = productoGuardado.id;
    if (typeof registrarMovimientoInventario === "function") registrarMovimientoInventario(movimientoInicial);
  }
  if (movimientoCompra && typeof registrarMovimientoInventario === "function") registrarMovimientoInventario(movimientoCompra);
  guardar(); cerrarModal(); renderProductos(); renderCaja(); renderCategorias();
  if (typeof renderInventarioProductos === "function") renderInventarioProductos();
  if (typeof mostrarAlertaStock === "function") mostrarAlertaStock();
  toast(movimientoCompra ? "💾 Producto guardado y stock agregado" : "💾 Producto guardado");
}

function toggleProducto(id) {
  const p = DB.productos.find(x => String(x.id) === String(id));
  if (!p) return;
  p.activo = !p.activo;
  guardar(); renderProductos(); renderCaja();
}

function borrarProducto(id) {
  if (!confirm("¿Borrar producto? Los movimientos internos se conservarán.")) return;
  DB.productos = DB.productos.filter(x => String(x.id) !== String(id));
  guardar(); renderProductos(); renderCaja(); renderCategorias();
  if (typeof renderInventarioProductos === "function") renderInventarioProductos();
  toast("🗑️ Producto eliminado");
}
