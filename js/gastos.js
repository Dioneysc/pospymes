/* ============================================
   GASTOS.JS — GASTOS Y CATEGORÍAS DE GASTO
   ============================================ */

/* ============ GASTOS ============ */

function guardarCats() { LS.set("catsGasto", CATS_GASTO); }

function fechaLocalGasto(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function actualizarFiltroCategoriasGastos() {
  const select = $("#gastosCategoriaFiltro");
  if (!select) return;
  const seleccion = select.value;
  const categorias = [...new Set([...(CATS_GASTO || []), ...(DB.gastos || []).map(g => g.categoria).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, "es-MX"));
  select.innerHTML = `<option value="">Todas las categorías</option>${categorias.map(c =>
    `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`
  ).join("")}`;
  if (categorias.includes(seleccion)) select.value = seleccion;
}

function filtrarGastosHoy() {
  const hoy = fechaLocalGasto(new Date());
  if ($("#gastosDesde")) $("#gastosDesde").value = hoy;
  if ($("#gastosHasta")) $("#gastosHasta").value = hoy;
  renderGastos();
}

function limpiarFiltrosGastos() {
  if ($("#gastosDesde")) $("#gastosDesde").value = "";
  if ($("#gastosHasta")) $("#gastosHasta").value = "";
  if ($("#gastosCategoriaFiltro")) $("#gastosCategoriaFiltro").value = "";
  renderGastos();
}

function renderGastos() {
  const todos = [...(DB.gastos || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  actualizarFiltroCategoriasGastos();
  const desde = $("#gastosDesde")?.value || "";
  const hasta = $("#gastosHasta")?.value || "";
  const categoria = $("#gastosCategoriaFiltro")?.value || "";
  const rangoInvalido = desde && hasta && desde > hasta;
  const gastos = rangoInvalido ? [] : todos.filter(g => {
    const fecha = fechaLocalGasto(g.fecha);
    return fecha && (!desde || fecha >= desde) && (!hasta || fecha <= hasta) && (!categoria || g.categoria === categoria);
  });
  const total = gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const resumen = $("#resumenGastosFecha");
  if (resumen) {
    resumen.innerHTML = `
      <div style="flex:1;min-width:145px;padding:14px;border:1px solid var(--borde);border-radius:12px;background:var(--superficie,#f8fafc)">
        <div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-bottom:5px">${desde || hasta ? "Gastos del periodo" : "Todos los gastos"}</div>
        <div style="font-size:23px;font-weight:800;color:var(--peligro,#dc2626)">${fmt(total)}</div>
      </div>
      <div style="flex:1;min-width:120px;padding:14px;border:1px solid var(--borde);border-radius:12px;background:var(--superficie,#f8fafc)">
        <div style="font-size:12px;color:var(--texto-secundario,#64748b);margin-bottom:5px">Movimientos</div>
        <div style="font-size:23px;font-weight:800">${gastos.length}</div>
      </div>`;
  }
  const contenedor = $("#listaGastos");
  if (!contenedor) return;
  if (rangoInvalido) {
    contenedor.innerHTML = `<div style="text-align:center;padding:24px;color:#b91c1c">La fecha inicial no puede ser posterior a la fecha final.</div>`;
    return;
  }
  if (!gastos.length) {
    contenedor.innerHTML = `
      <div style="text-align:center;padding:32px 20px;color:#94a3b8">
        <div style="font-size:48px;margin-bottom:10px">💸</div>
        <h3 style="color:#64748b;font-size:16px;margin-bottom:8px">${todos.length ? "No hay gastos para estos filtros" : "Sin gastos registrados"}</h3>
        <p style="font-size:13px;margin-bottom:16px">${todos.length ? "Cambia las fechas o la categoría para ver otros movimientos." : "Aquí aparecerán tus gastos"}</p>
        ${todos.length ? `<button class="btn-secondary" onclick="limpiarFiltrosGastos()" style="padding:10px 18px">Ver todos</button>` : `<button class="btn-primary" onclick="abrirFormGasto()" style="padding:12px 24px">+ Registrar gasto</button>`}
      </div>`;
    return;
  }
  contenedor.innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th>Método</th><th>Monto</th><th>Acciones</th></tr></thead>
      <tbody>
        ${gastos.map(g => `
          <tr>
            <td data-label="Fecha">${new Date(g.fecha).toLocaleDateString("es-MX")}<br><small style="color:var(--texto-secundario,#64748b)">${new Date(g.fecha).toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit"})}</small></td>
            <td data-label="Categoría">${escapeHTML(g.categoria)}</td>
            <td data-label="Nota">${escapeHTML(g.nota || "—")}</td>
            <td data-label="Método">${escapeHTML(g.metodo || "Efectivo")}</td>
            <td data-label="Monto">${fmt(g.monto)}</td>
            <td data-label="Acciones"><button class="btn-mini" onclick="borrarGasto(${JSON.stringify(g.id)})" title="Borrar gasto">🗑️</button></td>
          </tr>
        `).join("")}
      </tbody>
      <tfoot><tr><th colspan="4" style="text-align:right">Total del resultado</th><th>${fmt(total)}</th><th></th></tr></tfoot>
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
    <select id="fgCategoria">${CATS_GASTO.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join("")}</select>
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
