/* ============================================
   INVENTARIO.JS — INSUMOS Y MOVIMIENTOS
   ============================================ */

/* ============ INVENTARIO ============ */
function insumosSucursalOperacionPOS() {
  return typeof registrosSucursalOperacionPOS === "function" ? registrosSucursalOperacionPOS(DB.insumos) : DB.insumos;
}

function renderInsumos() {
  const insumosVista = insumosSucursalOperacionPOS();
  if (!insumosVista.length) {
    $("#listaInsumos").innerHTML = `
      <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn-secondary" onclick="abrirHistorialMovimientosInventarioPOS()">📋 Historial de movimientos</button> <button class="btn-secondary" onclick="conciliarInventarioSucursalPOS()">🔎 Conciliar</button></div>
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
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button class="btn-secondary" onclick="abrirHistorialMovimientosInventarioPOS()">📋 Historial de movimientos</button> <button class="btn-secondary" onclick="conciliarInventarioSucursalPOS()">🔎 Conciliar</button></div>
    <table>
      <thead><tr><th>Insumo</th><th>Stock</th><th>Mínimo</th><th>Costo</th><th>Unidad</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${insumosVista.map(i => {
          const bajo = i.stock <= i.min;
          return `<tr>
            <td data-label="Insumo">${i.nombre}</td>
            <td data-label="Stock">${i.stock}</td>
            <td data-label="Mínimo">${i.min}</td>
            <td data-label="Costo">${fmt(i.costo)}</td>
            <td data-label="Unidad">${i.unidad}</td>
            <td data-label="Estado"><span class="badge ${bajo?'danger':'ok'}">${bajo?'⚠ Bajo':'OK'}</span></td>
            <td data-label="Acciones">
              <button class="btn-mini" onclick="abrirFormInsumo(${i.id})">✏️</button>
              <button class="btn-mini" onclick="abrirMovimiento(${i.id})">↕</button>
              <button class="btn-mini" onclick="borrarInsumo(${i.id})">🗑️</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function abrirFormInsumo(id) {
  const i = id ? insumosSucursalOperacionPOS().find(x => String(x.id) === String(id)) : { nombre: "", unidad: "kg", stock: 0, min: 0, costo: 0, sucursalId: typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal" };
  if (id && !i) return toast("🔒 El insumo no pertenece a la sucursal activa.");
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
  if (id) { const existente = insumosSucursalOperacionPOS().find(x => String(x.id) === String(id)); if (!existente) return toast("🔒 El insumo no pertenece a la sucursal activa."); Object.assign(existente, data, { sucursalId: existente.sucursalId || (typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal") }); }
  else DB.insumos.push({ id: nuevoId(DB.insumos), sucursalId: typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : (typeof sucursalActivaPOS === "function" ? sucursalActivaPOS() : "principal"), ...data });
  guardar(); cerrarModal(); renderInsumos(); toast("💾 Guardado");
}

function abrirMovimiento(insumoId) {
  if (!insumosSucursalOperacionPOS().length) return toast("No hay insumos en esta sucursal.");
  abrirModal("Movimiento de inventario", `
    <label>Insumo</label>
    <select id="mvInsumo">
      ${insumosSucursalOperacionPOS().map(i => `<option value="${i.id}" ${i.id===insumoId?'selected':''}>${i.nombre}</option>`).join("")}
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

async function aplicarMovimiento() {
  const id = +$("#mvInsumo").value;
  const tipo = $("#mvTipo").value;
  const cant = +$("#mvCantidad").value;
  const motivo = ($("#mvMotivo").value || "").trim();
  const ins = insumosSucursalOperacionPOS().find(x => String(x.id) === String(id));
  if (!ins) return toast("Insumo no encontrado en la sucursal activa");
  if (!Number.isFinite(cant) || cant <= 0) return toast("Ingresa una cantidad mayor que cero");
  const sucursalId = typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal";
  const usuarioActual = (() => { try { return JSON.parse(sessionStorage.getItem("sesion") || "{}").username || ""; } catch (_) { return ""; } })();
  const bitacora = LS.get("movimientosInventarioPOS", []);
  const movimiento = {
    id: nuevoId(bitacora), sucursalId, insumoId: ins.id, insumoNombre: ins.nombre,
    tipo, cantidad: cant, cantidadSolicitada: cant, motivo,
    fecha: new Date().toISOString(), usuario: usuarioActual
  };
  // Con internet y Firebase conectado, el stock y su movimiento se confirman juntos.
  // Si la transacción falla, no se cambia el stock local para evitar divergir silenciosamente.
  if (navigator.onLine && typeof window.movimientoInventarioAtomicoPOS === "function") {
    try {
      const resultado = await window.movimientoInventarioAtomicoPOS(movimiento);
      cerrarModal(); renderInsumos(); mostrarAlertaStock();
      toast(resultado.repetido ? "ℹ️ Este movimiento ya estaba registrado" : "✅ Movimiento confirmado en Firebase");
      return;
    } catch (error) {
      console.error("Movimiento atómico rechazado:", error);
      return toast("⚠️ No se aplicó el movimiento: " + (error.message || "error de sincronización"));
    }
  }
  const antes = Number(ins.stock) || 0;
  const aplicada = tipo === "entrada" ? cant : Math.min(antes, cant);
  if (tipo === "entrada") ins.stock = antes + cant;
  else ins.stock = Math.max(0, antes - cant);
  // Bitácora local y sincronizable: registra cada movimiento con sucursal y saldo resultante.
  bitacora.push({
    ...movimiento,
    cantidad: aplicada,
    cantidadSolicitada: cant,
    stockAntes: antes,
    stockDespues: Number(ins.stock) || 0,
    pendienteSync: true
  });
  LS.set("movimientosInventarioPOS", bitacora);
  guardar(); cerrarModal(); renderInsumos();
  mostrarAlertaStock();
  toast(tipo === "salida" && aplicada < cant ? "⚠️ Salida parcial: el stock no puede ser negativo" : "✅ Movimiento aplicado y registrado");
}

function abrirHistorialMovimientosInventarioPOS() {
  const suc = typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal";
  const lista = LS.get("movimientosInventarioPOS", []).filter(m => String(m.sucursalId || "principal") === String(suc)).slice().reverse().slice(0,100);
  const filas = lista.map(m => `<tr><td>${escapeHTML(new Date(m.fecha).toLocaleString())}</td><td>${escapeHTML(m.insumoNombre || "Insumo")}</td><td>${m.tipo === "entrada" ? "Entrada" : "Salida"}</td><td>${Number(m.cantidad || 0)}</td><td>${Number(m.stockAntes || 0)} → ${Number(m.stockDespues || 0)}</td><td>${escapeHTML(m.motivo || "—")}</td></tr>`).join("");
  abrirModal("📋 Historial de movimientos · " + suc, `<p style="font-size:12px;color:var(--texto-secundario,#64748b)">Últimos 100 movimientos de esta sucursal. El historial se guarda localmente y se incluye en la sincronización cuando Firebase está conectado.</p><div style="overflow:auto;max-height:60vh"><table><thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th>Cant.</th><th>Stock</th><th>Motivo</th></tr></thead><tbody>${filas || '<tr><td colspan="6">Sin movimientos registrados</td></tr>'}</tbody></table></div><div class="acciones"><button class="btn-secondary" onclick="conciliarInventarioSucursalPOS()">🔎 Conciliar inventario</button><button class="btn-secondary" onclick="cerrarModal()">Cerrar</button></div>`);
}

function borrarInsumo(id) {
  if (!confirm("¿Borrar insumo?")) return;
  if (!insumosSucursalOperacionPOS().some(x => String(x.id) === String(id))) return toast("🔒 El insumo no pertenece a la sucursal activa.");
  DB.insumos = DB.insumos.filter(x => String(x.id) !== String(id));
  guardar(); renderInsumos(); mostrarAlertaStock();
}


/* v105: descontar recetas al vender y registrar cada consumo de forma idempotente.
   El stock se busca dentro de la sucursal de la venta para evitar afectar otra sucursal. */
function registrarConsumoRecetaVentaPOS(venta) {
  if (!venta || venta.id == null || !Array.isArray(venta.items)) return { aplicado: 0, faltantes: [] };
  const sucursalId = String(venta.sucursalId || "principal");
  const procesadas = LS.get("consumosVentasProcesadasPOS", {});
  const ventaKey = `${sucursalId}:${venta.id}`;
  if (procesadas[ventaKey]) return { aplicado: 0, faltantes: [], repetido: true };

  const movimientos = LS.get("movimientosInventarioPOS", []);
  const existentes = new Set(movimientos.filter(m => m && m.referencia).map(m => String(m.referencia)));
  const faltantes = [];
  let aplicado = 0;

  venta.items.forEach(item => {
    const producto = DB.productos.find(p => String(p.id) === String(item.productoId));
    if (!producto || !Array.isArray(producto.insumos)) return;
    producto.insumos.forEach(receta => {
      const referencia = `venta:${ventaKey}:producto:${producto.id}:insumo:${receta.insumoId}`;
      if (existentes.has(referencia)) return;
      const insumo = DB.insumos.find(i => String(i.id) === String(receta.insumoId) && String(i.sucursalId || "principal") === sucursalId);
      if (!insumo) {
        faltantes.push(`No se encontró el insumo ${receta.insumoId} en la sucursal ${sucursalId}`);
        return;
      }
      const porUnidad = Number(receta.cantidad) || 0;
      const unidades = Number(item.cantidad) || 0;
      const solicitada = porUnidad * unidades;
      if (!Number.isFinite(solicitada) || solicitada <= 0) return;
      const antes = Number(insumo.stock) || 0;
      const aplicada = Math.min(antes, solicitada);
      insumo.stock = Math.max(0, antes - aplicada);
      movimientos.push({
        id: nuevoId(movimientos),
        referencia,
        sucursalId,
        ventaId: venta.id,
        productoId: producto.id,
        productoNombre: producto.nombre || item.nombre || "Producto",
        insumoId: insumo.id,
        insumoNombre: insumo.nombre,
        tipo: "consumo_venta",
        cantidad: aplicada,
        cantidadSolicitada: solicitada,
        stockAntes: antes,
        stockDespues: Number(insumo.stock) || 0,
        motivo: `Consumo por venta #${venta.id}`,
        fecha: venta.fecha || new Date().toISOString(),
        usuario: venta.usuario || ""
      });
      existentes.add(referencia);
      aplicado++;
      if (aplicada < solicitada) faltantes.push(`${insumo.nombre}: se requerían ${solicitada} ${insumo.unidad || "unidades"}, se descontaron ${aplicada}`);
    });
  });

  procesadas[ventaKey] = { fecha: Date.now(), movimientos: aplicado };
  LS.set("consumosVentasProcesadasPOS", procesadas);
  LS.set("movimientosInventarioPOS", movimientos);
  return { aplicado, faltantes };
}
window.registrarConsumoRecetaVentaPOS = registrarConsumoRecetaVentaPOS;


/* v106: conciliación de solo lectura por sucursal.
   No modifica stock automáticamente: presenta diferencias para revisión humana. */
function conciliarInventarioSucursalPOS() {
  const sucursalId = String(typeof sucursalOperacionPOS === "function" ? sucursalOperacionPOS() : "principal");
  const insumos = (DB.insumos || []).filter(i => String(i.sucursalId || "principal") === sucursalId);
  const productos = (DB.productos || []).filter(p => String(p.sucursalId || sucursalId) === sucursalId);
  const ventas = (DB.ventas || []).filter(v => String(v.sucursalId || "principal") === sucursalId);
  const movimientos = LS.get("movimientosInventarioPOS", []).filter(m => String(m.sucursalId || "principal") === sucursalId);
  const issues = [];
  const stockIds = new Set(insumos.map(i => String(i.id)));
  const stockPorId = new Map(insumos.map(i => [String(i.id), i]));

  insumos.forEach(i => {
    const stock = Number(i.stock);
    if (!Number.isFinite(stock)) issues.push({nivel:"error", titulo:`${i.nombre}: stock no numérico`, detalle:`Valor actual: ${String(i.stock)}`});
    else if (stock < 0) issues.push({nivel:"error", titulo:`${i.nombre}: stock negativo`, detalle:`Stock actual: ${stock}`});
    if (!Number.isFinite(Number(i.min)) || Number(i.min) < 0) issues.push({nivel:"aviso", titulo:`${i.nombre}: mínimo inválido`, detalle:`Mínimo configurado: ${String(i.min)}`});
  });

  const refs = new Map();
  const porInsumoYStockInicial = new Map();
  movimientos.forEach(m => {
    if (m.referencia) refs.set(String(m.referencia), (refs.get(String(m.referencia)) || 0) + 1);
    if (m.insumoId != null && !stockIds.has(String(m.insumoId))) {
      issues.push({nivel:"aviso", titulo:`Movimiento sin insumo asociado`, detalle:`Movimiento ${m.id ?? "?"}; insumo ${m.insumoNombre || m.insumoId}; fecha ${m.fecha || "sin fecha"}`});
    }
    if (m.tipo === "consumo_venta" && Number(m.cantidadSolicitada) > Number(m.cantidad)) {
      issues.push({nivel:"aviso", titulo:`Consumo incompleto en venta #${m.ventaId ?? "?"}`, detalle:`${m.insumoNombre || "Insumo"}: solicitado ${Number(m.cantidadSolicitada)}, descontado ${Number(m.cantidad)}`});
    }
    // Dos dispositivos pueden leer el mismo stock y escribir saldos distintos.
    // La coincidencia del saldo inicial en una ventana corta es una señal, no una prueba concluyente.
    if (m.insumoId != null && Number.isFinite(Number(m.stockAntes)) && m.stockAntes !== undefined) {
      const clave = `${m.sucursalId || "principal"}:${m.insumoId}:${Number(m.stockAntes)}`;
      if (!porInsumoYStockInicial.has(clave)) porInsumoYStockInicial.set(clave, []);
      porInsumoYStockInicial.get(clave).push(m);
    }
  });
  refs.forEach((n, ref) => { if (n > 1) issues.push({nivel:"error", titulo:"Movimiento duplicado", detalle:`La referencia ${ref} aparece ${n} veces.`}); });
  porInsumoYStockInicial.forEach(grupo => {
    if (grupo.length < 2) return;
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      const a = grupo[i], b = grupo[j];
      if (String(a.id) === String(b.id) || (a.referencia && a.referencia === b.referencia)) continue;
      const ta = Date.parse(a.fecha || ""), tb = Date.parse(b.fecha || "");
      if (Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) > 120000) continue;
      if (Number(a.stockDespues) === Number(b.stockDespues) && a.tipo === b.tipo && Number(a.cantidad) === Number(b.cantidad)) continue;
      issues.push({nivel:"aviso", titulo:"Posible conflicto entre dispositivos", detalle:`${a.insumoNombre || a.insumoId}: dos movimientos distintos parten del mismo stock (${Number(a.stockAntes)}). Movimientos ${a.id ?? "?"} y ${b.id ?? "?"}; revisa el historial y el stock físico.`});
    }
  });

  const ventasIds = new Set(ventas.map(v => String(v.id)));
  movimientos.filter(m => m.tipo === "consumo_venta" && m.ventaId != null && !ventasIds.has(String(m.ventaId))).forEach(m => {
    issues.push({nivel:"aviso", titulo:"Consumo sin venta local", detalle:`Movimiento ${m.id ?? "?"} referencia la venta #${m.ventaId}. Puede tratarse de datos aún no sincronizados.`});
  });

  productos.forEach(p => (Array.isArray(p.insumos) ? p.insumos : []).forEach(r => {
    const q = Number(r.cantidad);
    if (!Number.isFinite(q) || q <= 0) issues.push({nivel:"aviso", titulo:`Receta inválida: ${p.nombre || "Producto"}`, detalle:`Cantidad inválida para el insumo ${r.insumoId}.`});
    else if (!stockPorId.has(String(r.insumoId))) issues.push({nivel:"aviso", titulo:`Receta sin insumo en sucursal`, detalle:`${p.nombre || "Producto"} requiere el insumo ${r.insumoId}, que no está en ${sucursalId}.`});
  }));

  const errores = issues.filter(x => x.nivel === "error").length;
  const avisos = issues.filter(x => x.nivel !== "error").length;
  const filas = issues.map(x => `<tr><td><span class="badge ${x.nivel === "error" ? "danger" : "warning"}">${x.nivel === "error" ? "Error" : "Aviso"}</span></td><td>${escapeHTML(x.titulo)}</td><td>${escapeHTML(x.detalle)}</td></tr>`).join("");
  abrirModal("🔎 Conciliación de inventario · " + escapeHTML(sucursalId), `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="card" style="padding:10px;flex:1;min-width:100px"><strong>${insumos.length}</strong><div>Insumos</div></div>
      <div class="card" style="padding:10px;flex:1;min-width:100px"><strong>${movimientos.length}</strong><div>Movimientos</div></div>
      <div class="card" style="padding:10px;flex:1;min-width:100px"><strong>${errores}</strong><div>Errores</div></div>
      <div class="card" style="padding:10px;flex:1;min-width:100px"><strong>${avisos}</strong><div>Avisos</div></div>
    </div>
    <p style="font-size:12px;color:var(--texto-secundario,#64748b)">Revisión de solo lectura. No se cambió ninguna existencia. Los datos de otro dispositivo pueden aparecer como avisos mientras la sincronización esté pendiente.</p>
    <div style="overflow:auto;max-height:50vh"><table><thead><tr><th>Nivel</th><th>Hallazgo</th><th>Detalle</th></tr></thead><tbody>${filas || '<tr><td colspan="3">Sin inconsistencias detectadas en las verificaciones disponibles.</td></tr>'}</tbody></table></div>
    <div class="acciones"><button class="btn-primary" onclick="cerrarModal()">Cerrar</button></div>`);
}
window.conciliarInventarioSucursalPOS = conciliarInventarioSucursalPOS;
