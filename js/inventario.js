/* ============================================
   INVENTARIO.JS — INSUMOS Y MOVIMIENTOS
   ============================================ */

/* ============ INVENTARIO ============ */
function renderInsumos() {
  if (!DB.insumos.length) {
    $("#listaInsumos").innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:60px;margin-bottom:12px">📦</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">Sin insumos todavía</h3>
        <p style="font-size:13px;margin-bottom:16px">Agrega los insumos que consumes</p>
        <button class="btn-primary" onclick="abrirFormInsumo()" style="padding:12px 24px">+ Agregar insumo</button>
      </div>
    `;
    return;
  }

  $("#listaInsumos").innerHTML = `
    <table>
      <thead><tr><th>Insumo</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Unidad</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${DB.insumos.map(i => {
          const bajo = i.stock <= i.min;
          return `<tr>
            <td data-label="Insumo">${escapeHTML(i.nombre)}</td>
            <td data-label="Stock">${i.stock}</td>
            <td data-label="Mínimo">${i.min}</td>
            <td data-label="Costo">${fmt(i.costo)}</td>
            <td data-label="Unidad">${escapeHTML(i.unidad)}</td>
            <td data-label="Estado"><span class="badge ${bajo?'danger':'ok'}">${bajo?'⚠ Bajo':'OK'}</span></td>
            <td data-label="Acciones">
              <button class="btn-mini" onclick="abrirFormInsumo(${i.id})">✏️</button>
              <button class="btn-mini" onclick="abrirMovimiento(${i.id})">↕</button>
              <button class="btn-mini" onclick="verMovimientosInsumo(${i.id})" title="Historial de movimientos">📜</button>
              <button class="btn-mini" onclick="borrarInsumo(${i.id})">🗑️</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function abrirFormInsumo(id) {
  const i = id ? DB.insumos.find(x => x.id === id) : { nombre: "", unidad: "kg", stock: 0, min: 0, costo: 0 };
  abrirModal(id ? "Editar insumo" : "Nuevo insumo", `
    <label>Nombre</label><input id="fiNombre" value="${escapeHTML(i.nombre)}">
    <label>Unidad (kg, L, pza...)</label><input id="fiUnidad" value="${escapeHTML(i.unidad)}">
    <label>Stock actual</label><input id="fiStock" type="number" step="0.01" value="${i.stock}">
    <label>Stock mínimo</label><input id="fiMin" type="number" step="0.01" value="${i.min}">
    <label>Costo por unidad</label><input id="fiCosto" type="number" step="0.01" value="${i.costo}">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarInsumo(${id||0})">Guardar</button>
    </div>
  `);
}

function guardarInsumo(id) {
  const data = {
    nombre: $("#fiNombre").value.trim(),
    unidad: $("#fiUnidad").value.trim() || "pza",
    stock: +$("#fiStock").value,
    min: +$("#fiMin").value,
    costo: +$("#fiCosto").value
  };
  if (!data.nombre) return toast("Falta nombre");
  if (![data.stock, data.min, data.costo].every(Number.isFinite) || data.stock < 0 || data.min < 0 || data.costo < 0)
    return toast("⚠️ Stock, mínimo y costo deben ser números válidos (no negativos)");
  const existente = id ? DB.insumos.find(x => x.id === id) : null;
  if (id && !existente) { cerrarModal(); return toast("⚠️ El insumo ya no existe (¿se borró en otro dispositivo?)"); }
  if (id) {
    // El stock ya no se pisa: la diferencia queda registrada como un ajuste (y así se sincroniza sin perderse)
    const { stock: nuevoStock, ...resto } = data;
    const delta = redondear6(nuevoStock - (Number(existente.stock) || 0));
    Object.assign(existente, resto);
    if (delta !== 0) registrarMovimientoInventario("ajuste", [{ i: id, d: delta }], { motivo: "Edición de stock" });
  } else {
    const nuevo = { id: nuevoId(DB.insumos), ...data, stock: 0 };
    DB.insumos.push(nuevo);
    if (data.stock > 0) registrarMovimientoInventario("inicial", [{ i: nuevo.id, d: data.stock }], { motivo: "Alta de insumo" });
  }
  guardar(); cerrarModal(); renderInsumos(); toast("💾 Guardado");
}

function abrirMovimiento(insumoId) {
  if (!DB.insumos.length) return toast("Agrega insumos primero");
  abrirModal("Movimiento de inventario", `
    <label>Insumo</label>
    <select id="mvInsumo">
      ${DB.insumos.map(i => `<option value="${i.id}" ${i.id===insumoId?'selected':''}>${escapeHTML(i.nombre)}</option>`).join("")}
    </select>
    <label>Tipo</label>
    <select id="mvTipo"><option value="entrada">Entrada (+)</option><option value="salida">Salida (−)</option></select>
    <label>Cantidad</label><input id="mvCantidad" type="number" step="0.01" value="1">
    <label>Motivo</label><input id="mvMotivo" placeholder="Compra, merma, ajuste...">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="aplicarMovimiento()">Aplicar</button>
    </div>
  `);
}

function aplicarMovimiento() {
  const id = +$("#mvInsumo").value;
  const tipo = $("#mvTipo").value;
  const cant = +$("#mvCantidad").value;
  const ins = DB.insumos.find(x => x.id === id);
  if (!ins) return toast("Insumo no encontrado");
  if (!Number.isFinite(cant) || cant <= 0) return toast("⚠️ Ingresa una cantidad mayor que cero");
  const delta = tipo === "entrada" ? cant : -Math.min(cant, Math.max(0, Number(ins.stock) || 0));
  if (delta === 0) return toast("⚠️ No hay stock para descontar");
  registrarMovimientoInventario(tipo === "entrada" ? "entrada" : "salida", [{ i: id, d: delta }], { motivo: ($("#mvMotivo").value || "").trim() });
  guardar(); cerrarModal(); renderInsumos();
  mostrarAlertaStock();
  toast("✅ Movimiento aplicado");
}

function borrarInsumo(id) {
  if (!confirm("¿Borrar insumo?")) return;
  DB.insumos = DB.insumos.filter(x => x.id !== id);
  eliminarMovimientosDeInsumo(id); // si no, un insumo nuevo con el mismo id heredaría este historial
  guardar(); renderInsumos(); mostrarAlertaStock();
}
