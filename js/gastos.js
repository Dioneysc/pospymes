/* ============================================
   GASTOS.JS — GASTOS Y CATEGORÍAS DE GASTO
   ============================================ */

/* ============ GASTOS ============ */

function guardarCats() { LS.set("catsGasto", CATS_GASTO); }

/* ---------- Filtros por período, categoría y método ---------- */
let filtroGastos = { periodo: "mes", desde: "", hasta: "", categoria: "", metodo: "" };
const PERIODOS_GASTOS = [["hoy", "Hoy"], ["ayer", "Ayer"], ["7dias", "7 días"], ["mes", "Este mes"], ["mes_pasado", "Mes pasado"], ["todo", "Todo"], ["rango", "📅 Rango"]];
const METODOS_GASTO = [["Efectivo", "💵"], ["Transferencia", "🏦"], ["Caja Fuerte", "🔐"]];

const fechaCortaGasto = ymd => new Date(ymd + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

// Devuelve { desde, hasta, titulo } con fechas locales "AAAA-MM-DD" (null = sin límite)
function rangoGastos(f) {
  const h = hoy(), d = new Date();
  switch (f.periodo) {
    case "hoy": return { desde: h, hasta: h, titulo: "Hoy" };
    case "ayer": { d.setDate(d.getDate() - 1); const y = fechaLocal(d); return { desde: y, hasta: y, titulo: "Ayer" }; }
    case "7dias": { d.setDate(d.getDate() - 6); return { desde: fechaLocal(d), hasta: h, titulo: "Últimos 7 días" }; }
    case "mes": { d.setDate(1); return { desde: fechaLocal(d), hasta: h, titulo: "Este mes" }; }
    case "mes_pasado": {
      const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1), fin = new Date(d.getFullYear(), d.getMonth(), 0);
      return { desde: fechaLocal(ini), hasta: fechaLocal(fin), titulo: "Mes pasado" };
    }
    case "rango": {
      let a = f.desde || "", b = f.hasta || "";
      if (a && b && a > b) [a, b] = [b, a];
      return { desde: a || null, hasta: b || null, titulo: !a && !b ? "Elige las fechas" : `${a ? fechaCortaGasto(a) : "…"} – ${b ? fechaCortaGasto(b) : "…"}` };
    }
    default: return { desde: null, hasta: null, titulo: "Todo el historial" };
  }
}

function setPeriodoGastos(p) { filtroGastos.periodo = p; renderGastos(); }
function setFiltroGastos(campo, valor) { if (campo in filtroGastos) { filtroGastos[campo] = valor; renderGastos(); } }

// Tras registrar un gasto, que no quede escondido por el filtro activo
function asegurarGastoVisible(g) {
  const r = rangoGastos(filtroGastos), dia = fechaLocal(g.fecha);
  if ((r.desde && dia < r.desde) || (r.hasta && dia > r.hasta)) filtroGastos.periodo = "hoy";
  if (filtroGastos.categoria && filtroGastos.categoria !== g.categoria) filtroGastos.categoria = "";
  if (filtroGastos.metodo && filtroGastos.metodo !== (g.metodo || "Efectivo")) filtroGastos.metodo = "";
}

function pintarFiltrosGastos(completo, todos) {
  const el = $("#filtrosGastos"); if (!el) return;
  if (!completo) { el.innerHTML = ""; return; }
  const f = filtroGastos, hoyStr = hoy();
  const cats = [...new Set([...CATS_GASTO, ...todos.map(g => g.categoria)].filter(Boolean))];
  el.innerHTML = `
    <div class="gastos-filtros">
      <div class="gastos-periodos" role="group" aria-label="Período">
        ${PERIODOS_GASTOS.map(([k, t]) => `<button type="button" class="gasto-chip${f.periodo === k ? " activo" : ""}" onclick="setPeriodoGastos('${k}')">${t}</button>`).join("")}
      </div>
      ${f.periodo === "rango" ? `
        <div class="gastos-selects">
          <label>Desde<input type="date" value="${escapeHTML(f.desde)}" max="${hoyStr}" onchange="setFiltroGastos('desde', this.value)"></label>
          <label>Hasta<input type="date" value="${escapeHTML(f.hasta)}" max="${hoyStr}" onchange="setFiltroGastos('hasta', this.value)"></label>
        </div>` : ""}
      <div class="gastos-selects">
        <label>Categoría
          <select onchange="setFiltroGastos('categoria', this.value)">
            <option value="">Todas</option>
            ${cats.map(c => `<option value="${escapeHTML(c)}"${f.categoria === c ? " selected" : ""}>${escapeHTML(c)}</option>`).join("")}
          </select>
        </label>
        <label>Método de pago
          <select onchange="setFiltroGastos('metodo', this.value)">
            <option value="">Todos</option>
            ${METODOS_GASTO.map(([m, i]) => `<option value="${m}"${f.metodo === m ? " selected" : ""}>${i} ${m}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>`;
}

function pintarResumenGastos(lista, titulo) {
  const el = $("#resumenGastos"); if (!el) return;
  if (!lista.length) { el.innerHTML = ""; return; }
  const monto = g => Number(g.monto) || 0;
  const total = redondear2(lista.reduce((s, g) => s + monto(g), 0));
  const porMetodo = {}, porCat = {};
  lista.forEach(g => {
    const m = g.metodo || "Efectivo", c = g.categoria || "Sin categoría";
    porMetodo[m] = (porMetodo[m] || 0) + monto(g);
    porCat[c] = (porCat[c] || 0) + monto(g);
  });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `
    <div class="gastos-resumen">
      <div class="gastos-total-linea">
        <div><small>${escapeHTML(titulo)}</small><div class="gastos-total-monto">${fmt(total)}</div></div>
        <span class="gastos-conteo">${lista.length} gasto${lista.length === 1 ? "" : "s"}</span>
      </div>
      <div class="gastos-metodos">
        ${METODOS_GASTO.filter(([m]) => porMetodo[m]).map(([m, i]) => `<span class="gasto-metodo">${i} ${m}: <b>${fmt(porMetodo[m])}</b></span>`).join("")}
      </div>
      ${cats.length > 1 ? `
        <div class="gastos-cats">
          ${cats.map(([c, v]) => { const pct = total > 0 ? Math.round(v / total * 100) : 0; return `
            <div class="gasto-cat">
              <span class="gasto-cat-nombre">${escapeHTML(c)}</span>
              <span class="gasto-cat-monto">${fmt(v)} <small>${pct}%</small></span>
              <div class="gasto-cat-barra"><i style="width:${Math.max(pct, 2)}%"></i></div>
            </div>`; }).join("")}
        </div>` : ""}
    </div>`;
}

function etiquetaDiaGasto(ymd) {
  const d = new Date(ymd + "T00:00:00");
  const txt = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });
  const base = txt.charAt(0).toUpperCase() + txt.slice(1);
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  return ymd === hoy() ? `Hoy · ${base}` : ymd === fechaLocal(ayer) ? `Ayer · ${base}` : base;
}

function renderGastos() {
  const completo = typeof puede !== "function" || puede("historial_completo");
  const todos = DB.gastos; // al cajero ya le llegan solo los de hoy (ver usuarios.js)

  if (!todos.length) {
    const f = $("#filtrosGastos"), r = $("#resumenGastos"); if (f) f.innerHTML = ""; if (r) r.innerHTML = "";
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

  const f = completo ? filtroGastos : { periodo: "hoy", categoria: "", metodo: "" };
  const r = rangoGastos(f);
  const lista = todos.filter(g => {
    const dia = fechaLocal(g.fecha);
    return (!r.desde || dia >= r.desde) && (!r.hasta || dia <= r.hasta)
      && (!f.categoria || g.categoria === f.categoria)
      && (!f.metodo || (g.metodo || "Efectivo") === f.metodo);
  }).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  pintarFiltrosGastos(completo, todos);
  pintarResumenGastos(lista, r.titulo);

  if (!lista.length) {
    $("#listaGastos").innerHTML = `
      <div style="text-align:center;padding:32px 20px;color:#94a3b8">
        <div style="font-size:44px;margin-bottom:8px">🔎</div>
        <h3 style="color:#64748b;font-size:15px;margin-bottom:6px">Sin gastos en este filtro</h3>
        ${completo ? `<button class="btn-secondary" onclick="filtroGastos.categoria='';filtroGastos.metodo='';setPeriodoGastos('todo')" style="margin-top:10px">Ver todo el historial</button>` : ""}
      </div>`;
    return;
  }

  const agrupar = new Set(lista.map(g => fechaLocal(g.fecha))).size > 1; // varios días → encabezado con subtotal por día
  const subtotal = {};
  lista.forEach(g => { const d = fechaLocal(g.fecha); subtotal[d] = (subtotal[d] || 0) + (Number(g.monto) || 0); });
  let diaActual = null;
  const filas = lista.map(g => {
    const dia = fechaLocal(g.fecha);
    const cab = agrupar && dia !== diaActual
      ? `<tr class="gasto-dia"><td colspan="6"><div><span>${escapeHTML(etiquetaDiaGasto(dia))}</span><b>${fmt(subtotal[dia])}</b></div></td></tr>` : "";
    diaActual = dia;
    return `${cab}
      <tr>
        <td data-label="Fecha">${new Date(g.fecha).toLocaleString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
        <td data-label="Categoría">${escapeHTML(g.categoria)}</td>
        <td data-label="Nota">${escapeHTML(g.nota || "—")}</td>
        <td data-label="Método">${escapeHTML(g.metodo || "Efectivo")}</td>
        <td data-label="Monto">${fmt(g.monto)}</td>
        <td data-label="Acciones"><button class="btn-mini" onclick="borrarGasto(${g.id})">🗑️</button></td>
      </tr>`;
  }).join("");

  $("#listaGastos").innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Categoría</th><th>Nota</th><th>Método</th><th>Monto</th><th>Acciones</th></tr></thead>
      <tbody>${filas}</tbody>
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
  const gasto = {
    id: nuevoId(DB.gastos),
    fecha: new Date().toISOString(),
    categoria: $("#fgCategoria").value,
    monto,
    metodo,
    nota: $("#fgNota").value.trim()
  };
  DB.gastos.push(gasto);
  asegurarGastoVisible(gasto);
  guardar("gastos"); cerrarModal(); renderGastos(); renderEstadoCaja();
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
