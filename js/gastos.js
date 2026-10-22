/* ============================================
   GASTOS.JS — GASTOS Y CATEGORÍAS DE GASTO
   ============================================ */

/* ============ GASTOS ============ */

function guardarCats() { LS.set("catsGasto", CATS_GASTO); }

function renderGastos() {
  const gastos = [...DB.gastos].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
  if (!gastos.length) {
    $("#listaGastos").innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:#94a3b8">
        <div style="font-size:60px;margin-bottom:12px">💸</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">Sin gastos registrados</h3>
        <p style="font-size:13px;margin-bottom:16px">Aquí aparecerán tus gastos</p>
        <button class="btn-primary" onclick="abrirFormGasto()" style="padding:12px 24px">+ Registrar gasto</button>
      </div>
    `;
    return;
  }

  $("#listaGastos").innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th>Método</th><th>Monto</th><th>Acciones</th></tr></thead>
      <tbody>
        ${gastos.map(g => `
          <tr>
            <td data-label="Fecha">${new Date(g.fecha).toLocaleDateString("es-MX")}</td>
            <td data-label="Categoría">${g.categoria}</td>
            <td data-label="Nota">${g.nota || "—"}</td>
            <td data-label="Método">${g.metodo || "Efectivo"}</td>
            <td data-label="Monto">${fmt(g.monto)}</td>
            <td data-label="Acciones"><button class="btn-mini" onclick="borrarGasto(${g.id})">🗑️</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

function abrirFormGasto() {
  if (CATS_GASTO.length === 0) {
    return abrirModal("⚠️ Sin categorías", `
      <p style="color:#64748b;font-size:14px;margin-bottom:16px">
        Antes de registrar gastos, necesitas crear al menos una categoría.
      </p>
      <p style="color:#64748b;font-size:13px;margin-bottom:16px">
        Ejemplos: <b>Compra de pollo, Carbón, Gas, Sueldos, Renta, Luz</b>
      </p>
      <div class="acciones">
        <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button class="btn-primary" onclick="irACategoriasGastos()">Crear categorías</button>
      </div>
    `);
  }

  abrirModal("Nuevo gasto", `
    <label>Categoría</label>
    <select id="fgCategoria">${CATS_GASTO.map(c => `<option>${c}</option>`).join("")}</select>
    <label>Monto</label><input id="fgMonto" type="number" min="0.01" step="0.01" inputmode="decimal">
    <label>Método de pago</label>
    <select id="fgMetodo">
      <option value="Efectivo">💵 Efectivo (afecta caja)</option>
      <option value="Transferencia">🏦 Transferencia (no afecta caja)</option>
      <option value="Caja Fuerte">🔐 Caja Fuerte (descuenta de Caja Fuerte)</option>
    </select>
    <label>Nota (opcional)</label><input id="fgNota">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarGasto()">Guardar</button>
    </div>
  `);
}

function guardarGasto() {
  const monto = Number($("#fgMonto").value);
  if (!Number.isFinite(monto) || monto <= 0) return toast("Ingresa un monto mayor que cero");
  const metodo = $("#fgMetodo").value;
  DB.gastos.push({
    id: nuevoId(DB.gastos),
    sucursalId: typeof sucursalActivaPOS === "function" ? sucursalActivaPOS() : "principal",
    fecha: new Date().toISOString(),
    categoria: $("#fgCategoria").value,
    monto,
    metodo,
    nota: $("#fgNota").value.trim()
  });
  guardar(); cerrarModal(); renderGastos(); renderEstadoCaja();
  toast(metodo === "Caja Fuerte"
    ? "🔐 Gasto registrado en Caja Fuerte; no se descontó de la caja del negocio"
    : "💾 Gasto registrado");
}

function borrarGasto(id) {
  if (!confirm("¿Borrar gasto?")) return;
  DB.gastos = DB.gastos.filter(x => String(x.id) !== String(id));
  guardar(); renderGastos(); renderEstadoCaja();
}

/* ============ CATEGORÍAS GASTOS ============ */
function irACategoriasGastos() {
  cerrarModal();
  cambiarVista("gastos");
  const d = $("#seccionCategoriasGastos");
  if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
  setTimeout(() => { const i = $("#nuevaCategoria"); if (i) i.focus(); }, 300);
}

function renderCategoriasGastos() {
  const el = $("#listaCategoriasGastos");
  if (!el) return;
  const resumen = $("#resumenCategoriasGastos");
  if (resumen) resumen.textContent = `🏷️ Categorías de gasto (${CATS_GASTO.length})`;
  const det = $("#seccionCategoriasGastos");
  if (det && CATS_GASTO.length === 0) det.open = true;
  el.innerHTML = CATS_GASTO.map((c, i) => `
    <div class="cat-item">
      <span>${escapeHTML(c)}</span>
      <button onclick="borrarCategoria(${i})" title="Eliminar">🗑️</button>
    </div>
  `).join("") || `
    <p style="color:#94a3b8;font-size:13px;text-align:center;padding:16px 0">
      Sin categorías todavía.<br>
      <small>Agrega las que uses (Carbón, Gas, Sueldos, etc.)</small>
    </p>
  `;
}

function agregarCategoria() {
  const val = $("#nuevaCategoria").value.trim();
  if (!val) return toast("Escribe un nombre");
  if (CATS_GASTO.includes(val)) return toast("Ya existe");
  CATS_GASTO.push(val);
  guardarCats();
  $("#nuevaCategoria").value = "";
  renderCategoriasGastos();
  toast("✅ Categoría agregada");
}

function borrarCategoria(i) {
  if (!confirm(`¿Borrar "${CATS_GASTO[i]}"?`)) return;
  CATS_GASTO.splice(i, 1);
  guardarCats();
  renderCategoriasGastos();
  toast("🗑️ Categoría borrada");
}
