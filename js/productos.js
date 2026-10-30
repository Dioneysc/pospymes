/* ============================================
   PRODUCTOS.JS — PRODUCTOS Y RECETAS
   ============================================ */

/* ============ PRODUCTOS ============ */
const MARGEN_MINIMO = 0.30; // por debajo de este margen (sobre el precio) se avisa

function renderProductos() {
  if (!DB.productos.length) {
    $("#listaProductos").innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:60px;margin-bottom:12px">🍗</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">Sin productos todavía</h3>
        <p style="font-size:13px;margin-bottom:16px">Agrega tu primer producto</p>
        <button class="btn-primary" onclick="abrirFormProducto()" style="padding:12px 24px">+ Agregar producto</button>
      </div>
    `;
    return;
  }

  const margenBajo = DB.productos.filter(p => p.activo && p.insumos && p.insumos.length && p.precio > 0 && (p.precio - calcularCostoReceta(p)) / p.precio < MARGEN_MINIMO);
  $("#listaProductos").innerHTML = `
    ${margenBajo.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:10px">
      ⚠️ <b>${margenBajo.length} producto${margenBajo.length === 1 ? "" : "s"} con margen menor al ${Math.round(MARGEN_MINIMO * 100)}%:</b> ${margenBajo.slice(0, 6).map(p => escapeHTML(p.nombre)).join(", ")}${margenBajo.length > 6 ? "…" : ""}. Revisa su precio o el costo de sus insumos.</div>` : ""}
    <table>
      <thead><tr><th>Emoji</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${DB.productos.map(p => {
          const tieneReceta = p.insumos && p.insumos.length > 0;
          const costo = calcularCostoReceta(p);
          const margen = p.precio - costo;
          const pctMargen = p.precio > 0 ? margen / p.precio * 100 : 0;
          const colorMargen = pctMargen < MARGEN_MINIMO * 100 ? "#dc2626" : pctMargen < 50 ? "#d97706" : "var(--verde)";
          return `
          <tr>
            <td data-label="Emoji" style="font-size:24px">${escapeHTML(p.emoji || "🍽️")}</td>
            <td data-label="Nombre">${escapeHTML(p.nombre)}</td>
            <td data-label="Categoría">
              ${escapeHTML(p.categoria)}
              ${tieneReceta ? `<span style="font-size:10px;color:var(--naranja);font-weight:700"> · 📋 ${p.insumos.length}</span>` : `<span style="font-size:10px;color:#94a3b8"> · sin receta</span>`}
            </td>
            <td data-label="Precio">
              <b>${fmt(p.precio)}</b>
              ${tieneReceta ? `
                <div style="font-size:10px;color:#64748b;margin-top:2px">
                  Costo: ${fmt(costo)} ·
                  <b style="color:${colorMargen}">${margen >= 0 ? "+" : ""}${fmt(margen)} (${Math.round(pctMargen)}%)</b>${pctMargen < MARGEN_MINIMO * 100 ? " ⚠️" : ""}
                </div>
              ` : ""}
            </td>
            <td data-label="Estado"><span class="badge ${p.activo?'ok':'danger'}">${p.activo?'Activo':'Inactivo'}</span></td>
            <td data-label="Acciones" class="acciones-producto">
              <button class="btn-mini btn-accion-producto" onclick="abrirFormProducto(${p.id})" title="Editar" aria-label="Editar producto">✏️</button>
              <button class="btn-mini btn-accion-producto" onclick="toggleProducto(${p.id})" title="Activar/Desactivar" aria-label="${p.activo ? 'Desactivar' : 'Activar'} producto">${p.activo?'🚫':'✅'}</button>
              <button class="btn-mini btn-accion-producto btn-receta-producto" onclick="abrirReceta(${p.id})" title="Editar receta" aria-label="Editar receta">📋</button>
              <button class="btn-mini btn-accion-producto" onclick="borrarProducto(${p.id})" title="Borrar" aria-label="Borrar producto">🗑️</button>
            </td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>`;
}

function abrirFormProducto(id) {
  const p = id ? DB.productos.find(x => x.id === id) : { nombre: "", precio: "", categoria: "General", emoji: "🍽️", activo: true };
  abrirModal(id ? "Editar producto" : "Nuevo producto", `
    <label>Nombre</label><input id="fpNombre" value="${escapeHTML(p.nombre)}">
    <label>Precio</label><input id="fpPrecio" type="number" step="0.01" value="${p.precio}">
    <label>Categoría</label><input id="fpCategoria" value="${escapeHTML(p.categoria)}">
    <label>Emoji del producto</label>
    <input id="fpEmoji" value="${escapeHTML(p.emoji || "🍽️")}" maxlength="4" style="font-size:24px;text-align:center">
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
      ${["🍗","🍖","🥤","🌶️","🥡","🔥","🌮","🐔","🥣","🍞","🌭","🍟","🧃","🍺","☕","🍰"].map(e =>
        `<button type="button" onclick="document.getElementById('fpEmoji').value='${e}'" style="font-size:22px;padding:6px 10px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer">${e}</button>`
      ).join("")}
    </div>
    <label>Activo</label>
    <select id="fpActivo"><option value="true" ${p.activo?'selected':''}>Sí</option><option value="false" ${!p.activo?'selected':''}>No</option></select>

    <section style="margin-top:16px;padding:12px;border:1px solid #dbeafe;border-radius:12px;background:var(--panel, #f8fafc)">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">📦 Control de inventario <span style="font-size:11px;color:#64748b;font-weight:400">(opcional)</span></div>
      <p style="font-size:12px;color:#64748b;margin:0 0 10px">Indica qué insumo se descuenta automáticamente cada vez que vendes este producto.</p>
      ${((p.insumos || []).length > 1) ? `
        <div style="padding:10px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px">
          Este producto ya tiene una receta de ${p.insumos.length} insumos. Se conservará sin cambios para evitar alterar la receta. Puedes administrarla desde el botón <b>Receta</b>.
        </div>
      ` : `
        <label style="font-size:12px">¿Descontar un insumo al vender?</label>
        <select id="fpControlInvActivo" onchange="actualizarCamposControlInventario()" style="margin-bottom:8px">
          <option value="false" ${!(p.insumos || []).length ? 'selected' : ''}>No, no controlar inventario automáticamente</option>
          <option value="true" ${(p.insumos || []).length === 1 ? 'selected' : ''}>Sí, descontar un insumo</option>
        </select>
        <div id="fpControlInvCampos" style="display:${(p.insumos || []).length === 1 ? 'block' : 'none'}">
          <label style="font-size:12px">Insumo que se descontará</label>
          <select id="fpControlInvInsumo" style="margin-bottom:8px">
            ${DB.insumos.map(i => `<option value="${i.id}" ${((p.insumos || [])[0] || {}).insumoId == i.id ? 'selected' : ''}>${escapeHTML(i.nombre)} (${escapeHTML(i.unidad)})</option>`).join("")}
          </select>
          <label style="font-size:12px">Cantidad por cada unidad vendida</label>
          <input id="fpControlInvCantidad" type="number" min="0.01" step="0.01" value="${(p.insumos || []).length === 1 ? p.insumos[0].cantidad : '1'}" style="margin-bottom:0">
          ${!DB.insumos.length ? `<p style="font-size:12px;color:#b45309;margin-top:8px">Primero registra los insumos en Inventario para poder asignarlos.</p>` : ''}
        </div>
      `}
    </section>
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarProducto(${id||0})">Guardar</button>
    </div>
  `);
}

function guardarProducto(id) {
  const nombre = $("#fpNombre").value.trim();
  const precio = +$("#fpPrecio").value;
  const categoria = $("#fpCategoria").value.trim() || "General";
  const emoji = $("#fpEmoji").value.trim() || "🍽️";
  const activo = $("#fpActivo").value === "true";
  if (!nombre || !Number.isFinite(precio) || precio <= 0) return toast("Escribe un nombre y un precio mayor que cero");
  let producto;
  if (id) {
    producto = DB.productos.find(x => x.id === id);
    if (!producto) { cerrarModal(); return toast("⚠️ El producto ya no existe (¿se borró en otro dispositivo?)"); }
    Object.assign(producto, { nombre, precio, categoria, emoji, activo });
  } else {
    producto = { id: nuevoId(DB.productos), nombre, precio, categoria, emoji, activo, insumos: [] };
    DB.productos.push(producto);
  }

  // El control sencillo reutiliza el mecanismo de consumo ya usado por las ventas.
  // Las recetas de varios insumos nunca se reemplazan desde este formulario.
  const controlActivo = document.getElementById("fpControlInvActivo");
  if (controlActivo && (!Array.isArray(producto.insumos) || producto.insumos.length <= 1)) {
    if (controlActivo.value === "true") {
      const selector = document.getElementById("fpControlInvInsumo");
      const campoCantidad = document.getElementById("fpControlInvCantidad");
      const insumoId = selector ? Number(selector.value) : NaN;
      const cantidad = campoCantidad ? Number(campoCantidad.value) : NaN;
      if (!DB.insumos.length || !Number.isFinite(insumoId) || !DB.insumos.some(i => Number(i.id) === insumoId)) {
        if (!id) DB.productos = DB.productos.filter(x => x !== producto);
        return toast("Selecciona un insumo registrado en Inventario");
      }
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        if (!id) DB.productos = DB.productos.filter(x => x !== producto);
        return toast("La cantidad por venta debe ser mayor que cero");
      }
      producto.insumos = [{ insumoId, cantidad }];
    } else if (Array.isArray(producto.insumos) && producto.insumos.length === 1) {
      // Proteger una asociación existente: pedir confirmación antes de quitarla.
      if (!confirm("Este producto ya descuenta un insumo al venderse. ¿Quieres quitar esa asociación de inventario?")) {
        return;
      }
      producto.insumos = [];
    }
  }
  guardar(); cerrarModal(); renderProductos(); renderCaja(); renderCategorias(); toast("💾 Guardado");
}

function actualizarCamposControlInventario() {
  const selector = document.getElementById("fpControlInvActivo");
  const campos = document.getElementById("fpControlInvCampos");
  if (selector && campos) campos.style.display = selector.value === "true" ? "block" : "none";
}

function toggleProducto(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!p) return;
  p.activo = !p.activo;
  guardar(); renderProductos(); renderCaja();
}

function borrarProducto(id) {
  if (!confirm("¿Borrar producto?")) return;
  DB.productos = DB.productos.filter(x => x.id !== id);
  guardar(); renderProductos(); renderCaja(); renderCategorias(); toast("🗑️ Borrado");
}

/* Refresca las vistas que dependen de una receta sin recargar la página. */
function refrescarVistasTrasCambioReceta() {
  if (typeof renderProductos === "function" && document.getElementById("listaProductos")) renderProductos();
  if (typeof renderCaja === "function" && document.getElementById("gridProductos")) renderCaja();
}

/* ============ RECETAS DE PRODUCTOS ============ */
function abrirReceta(productoId) {
  const p = DB.productos.find(x => x.id === productoId);
  if (!p) return toast("Producto no encontrado");

  window._recetaProductoId = productoId;

  if (!DB.insumos.length) {
    return abrirModal("⚠️ Sin insumos", `
      <p style="color:#64748b;font-size:14px;margin-bottom:16px">
        Antes de crear una receta, necesitas tener insumos registrados en el inventario.
      </p>
      <div class="acciones">
        <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button class="btn-primary" onclick="cerrarModal();cambiarVista('inventario')">Ir a Inventario</button>
      </div>
    `);
  }

  const receta = p.insumos || [];

  abrirModal("📋 Receta: " + p.nombre, `
    <p style="color:#64748b;font-size:13px;margin-bottom:14px">
      Define qué insumos consume este producto al venderse.
    </p>

    <div id="listaReceta" style="margin-bottom:14px">
      ${receta.length ? receta.map((r, i) => {
        const ins = DB.insumos.find(x => x.id === r.insumoId);
        if (!ins) return "";
        return `
          <div class="cat-item" style="background:#f8fafc">
            <div style="flex:1">
              <b>${escapeHTML(ins.nombre)}</b>
              <div style="font-size:11px;color:#64748b">${escapeHTML(ins.unidad)} · costo ${fmt(ins.costo)}/${escapeHTML(ins.unidad)}</div>
            </div>
            <input type="number" step="0.01" value="${r.cantidad}" onchange="actualizarCantidadReceta(${i}, this.value)" style="width:80px;padding:6px !important;margin:0 !important;text-align:center;font-size:14px !important;">
            <button onclick="borrarItemReceta(${i})" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:4px">🗑️</button>
          </div>
        `;
      }).join("") : `<p style="text-align:center;color:#94a3b8;font-size:13px;padding:20px 0">Sin insumos asignados todavía</p>`}
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">

    <h4 style="font-size:13px;margin-bottom:8px;color:#0f172a">➕ Agregar insumo</h4>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <select id="recetaInsumo" style="flex:1;margin:0 !important">
        ${DB.insumos.map(i => `<option value="${i.id}">${escapeHTML(i.nombre)} (${escapeHTML(i.unidad)})</option>`).join("")}
      </select>
      <input id="recetaCantidad" type="number" step="0.01" value="1" style="width:80px;margin:0 !important;text-align:center">
      <button class="btn-primary" onclick="agregarItemReceta(${productoId})" style="padding:10px 16px">+</button>
    </div>

    <div id="costoReceta" style="background:#fff7ed;border-radius:10px;padding:12px;font-size:13px;border-left:4px solid var(--naranja)">
      <div style="display:flex;justify-content:space-between;padding:3px 0">
        <span>Costo de la receta:</span>
        <b id="costoRecetaVal">${fmt(calcularCostoReceta(p))}</b>
      </div>
      <div style="display:flex;justify-content:space-between;padding:3px 0">
        <span>Precio de venta:</span>
        <b>${fmt(p.precio)}</b>
      </div>
      <hr style="border:none;border-top:1px dashed #e2e8f0;margin:6px 0">
      <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:14px">
        <b>Margen de ganancia:</b>
        <b style="color:var(--verde)">${fmt(p.precio - calcularCostoReceta(p))}</b>
      </div>
    </div>

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
      <button class="btn-primary" onclick="guardarReceta(${productoId})">💾 Guardar receta</button>
    </div>
  `);
}

function calcularCostoReceta(producto) {
  if (!producto.insumos) return 0;
  let total = 0;
  producto.insumos.forEach(r => {
    const ins = DB.insumos.find(x => x.id === r.insumoId);
    if (ins) total += ins.costo * r.cantidad;
  });
  return total;
}

function agregarItemReceta(productoId) {
  const p = DB.productos.find(x => x.id === productoId);
  if (!p) return;

  const insumoId = +$("#recetaInsumo").value;
  const cantidad = +$("#recetaCantidad").value;

  if (!cantidad || cantidad <= 0) return toast("Cantidad inválida");

  if (!p.insumos) p.insumos = [];

  const existente = p.insumos.find(r => r.insumoId === insumoId);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    p.insumos.push({ insumoId, cantidad });
  }

  guardar();
  refrescarVistasTrasCambioReceta();
  const scrollY = document.querySelector(".modal-contenido")?.scrollTop || 0;
  abrirReceta(productoId);
  setTimeout(() => {
    const mc = document.querySelector(".modal-contenido");
    if (mc) mc.scrollTop = scrollY;
  }, 50);
  toast("✅ Insumo agregado");
}

function actualizarCantidadReceta(idx, valor) {
  const p = DB.productos.find(x => x.id === window._recetaProductoId);
  const cantidad = Number(valor);
  if (!p || !p.insumos || !p.insumos[idx]) return;
  if (!Number.isFinite(cantidad) || cantidad <= 0) return toast("Cantidad inválida");
  p.insumos[idx].cantidad = cantidad;
  guardar();
  refrescarVistasTrasCambioReceta();
  const costo = document.getElementById("costoRecetaVal");
  if (costo) costo.textContent = fmt(calcularCostoReceta(p));
}

function borrarItemReceta(idx) {
  const productoId = window._recetaProductoId;
  const p = DB.productos.find(x => x.id === productoId);
  if (!p || !p.insumos) return;
  p.insumos.splice(idx, 1);
  guardar();
  refrescarVistasTrasCambioReceta();
  abrirReceta(productoId);
  toast("🗑️ Insumo quitado");
}

function guardarReceta(productoId) {
  const p = DB.productos.find(x => x.id === productoId);
  if (!p) return;

  guardar();
  cerrarModal();
  refrescarVistasTrasCambioReceta();
  toast("💾 Receta guardada");
}
