/* ============================================
   CAJA.JS — CAJA FUERTE, ESTADO DE CAJA Y CORTE
   ============================================ */

/* ============ CAJA FUERTE ============ */

function initDia() {
  if (estadoCajaHoy.fecha !== hoy()) {
    estadoCajaHoy = { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [] };
    LS.set("cajaHoy", estadoCajaHoy);
  }
}

function abrirFondoInicial() {
  abrirModal("💵 Abrir caja del día", `
    <p style="color:#64748b;font-size:14px;margin-bottom:12px">Ingresa el fondo inicial en efectivo para dar cambio.</p>
    <label>Fondo inicial</label>
    <input id="fondoMonto" type="number" step="0.01" value="${estadoCajaHoy.fondoInicial || 500}">
    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarFondo()">Abrir caja</button>
    </div>
  `);
}

function guardarFondo() {
  const monto = +$("#fondoMonto").value || 0;
  estadoCajaHoy.fondoInicial = monto;
  LS.set("cajaHoy", estadoCajaHoy);
  cerrarModal();
  renderEstadoCaja();
  toast("✅ Caja abierta con fondo de " + fmt(monto));
}

function abrirCajaFuerte() {
  initDia();
  const retiros = estadoCajaHoy.retiros.reduce((s,r) => s + r.monto, 0);
  const depositos = estadoCajaHoy.depositos.reduce((s,d) => s + d.monto, 0);
  abrirModal("🔐 Caja fuerte", `
    <div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;border:1px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px">
        <span>Total retirado hoy:</span><b>${fmt(retiros)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:14px">
        <span>Total depositado hoy:</span><b>${fmt(depositos)}</b>
      </div>
    </div>

    <label>Tipo de movimiento</label>
    <select id="cfTipo">
      <option value="retiro">⬆️ Retiro (a caja fuerte)</option>
      <option value="deposito">⬇️ Depósito (a caja)</option>
    </select>
    <label>Monto</label>
    <input id="cfMonto" type="number" step="0.01">
    <label>Nota (opcional)</label>
    <input id="cfNota" placeholder="Motivo del movimiento">

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
      <button class="btn-primary" onclick="guardarCajaFuerte()">Registrar</button>
    </div>

    ${estadoCajaHoy.retiros.concat(estadoCajaHoy.depositos).length ? `
      <h4 style="margin-top:16px;font-size:13px;color:#64748b;text-transform:uppercase">Movimientos de hoy</h4>
      <div style="max-height:200px;overflow-y:auto;margin-top:8px">
        ${[...estadoCajaHoy.retiros.map((r,i)=>({...r,tipo:"retiro",idx:i})), ...estadoCajaHoy.depositos.map((d,i)=>({...d,tipo:"deposito",idx:i}))]
          .sort((a,b)=>new Date(b.hora)-new Date(a.hora))
          .map(m => `
            <div class="cat-item">
              <span style="flex:1">${new Date(m.hora).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})} · ${m.tipo==="retiro"?"⬆️":"⬇️"} ${m.nota||"—"}</span>
              <b style="color:${m.tipo==="retiro"?"#dc2626":"#059669"}">${m.tipo==="retiro"?"-":"+"}${fmt(m.monto)}</b>
              <button onclick="borrarMovimientoCajaFuerte('${m.tipo}',${m.idx})" style="background:transparent;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:4px">🗑️</button>
            </div>
          `).join("")}
      </div>
    ` : ""}
  `);
}

function guardarCajaFuerte() {
  const tipo = $("#cfTipo").value;
  const monto = +$("#cfMonto").value;
  const nota = $("#cfNota").value.trim();
  if (!monto || monto <= 0) return toast("Monto inválido");
  const mov = { monto, nota, hora: new Date().toISOString() };
  if (tipo === "retiro") estadoCajaHoy.retiros.push(mov);
  else estadoCajaHoy.depositos.push(mov);
  LS.set("cajaHoy", estadoCajaHoy);
  cerrarModal();
  renderEstadoCaja();
  toast(tipo === "retiro" ? "⬆️ Retiro registrado" : "⬇️ Depósito registrado");
}

function borrarMovimientoCajaFuerte(tipo, idx) {
  const arr = tipo === "retiro" ? estadoCajaHoy.retiros : estadoCajaHoy.depositos;
  const mov = arr[idx];
  if (!mov) return;
  if (!confirm(`¿Borrar ${tipo} de ${fmt(mov.monto)}${mov.nota ? " ("+mov.nota+")" : ""}?`)) return;
  arr.splice(idx, 1);
  LS.set("cajaHoy", estadoCajaHoy);
  cerrarModal();
  setTimeout(() => {
    abrirCajaFuerte();
    renderEstadoCaja();
    toast("🗑️ Movimiento eliminado");
  }, 150);
}

/* ============ ESTADO DE CAJA ============ */
function renderEstadoCaja() {
  const elEstado = $("#estadoCaja");
  if (!elEstado) return;

  initDia();
  const hoyStr = hoy();
  const ventasHoy = DB.ventas.filter(v => fechaLocal(v.fecha) === hoyStr && !v.cancelada);
  const efectivoVentas = ventasHoy.filter(v => v.metodo === "Efectivo").reduce((s,v) => s + v.total, 0);
  const tarjetaVentas = ventasHoy.filter(v => v.metodo === "Tarjeta").reduce((s,v) => s + v.total, 0);
  const transfVentas = ventasHoy.filter(v => v.metodo === "Transferencia").reduce((s,v) => s + v.total, 0);
  const totalVentas = efectivoVentas + tarjetaVentas + transfVentas;
  const retiros = estadoCajaHoy.retiros.reduce((s,r) => s + r.monto, 0);
  const depositos = estadoCajaHoy.depositos.reduce((s,d) => s + d.monto, 0);
  const gastosEfectivo = DB.gastos.filter(g => fechaLocal(g.fecha) === hoyStr && g.metodo !== "Transferencia").reduce((s,g) => s + g.monto, 0);

  const fondo = estadoCajaHoy.fondoInicial || 0;
  const esperadoEnCaja = fondo + efectivoVentas + depositos - retiros - gastosEfectivo;

  elEstado.innerHTML = `
    ${estadoCajaHoy.fondoInicial === null ? `
      <div class="card" style="background:#fef3c7;border-left:4px solid var(--warn);margin-bottom:14px">
        <b>⚠️ Caja no abierta</b>
        <p style="color:#64748b;font-size:13px;margin:6px 0">Abre la caja con el fondo inicial.</p>
        <button class="btn-primary" onclick="abrirFondoInicial()" style="margin-top:8px">💵 Abrir caja</button>
      </div>
    ` : ""}

    <div class="estado-caja">
      <div class="card azul">
        <h4>Fondo inicial</h4>
        <p class="big">${fmt(fondo)}</p>
        <small><a href="#" onclick="abrirFondoInicial();return false" style="color:var(--naranja);font-weight:700;">editar</a></small>
      </div>
      <div class="card verde">
        <h4>Efectivo en ventas</h4>
        <p class="big">${fmt(efectivoVentas)}</p>
        <small>${ventasHoy.filter(v=>v.metodo==="Efectivo").length} tickets</small>
      </div>
      <div class="card">
        <h4>Tarjeta</h4>
        <p class="big">${fmt(tarjetaVentas)}</p>
      </div>
      <div class="card">
        <h4>Transferencia</h4>
        <p class="big">${fmt(transfVentas)}</p>
      </div>
      <div class="card rojo">
        <h4>Retiros caja fuerte</h4>
        <p class="big">-${fmt(retiros)}</p>
      </div>
      <div class="card">
        <h4>Gastos en efectivo</h4>
        <p class="big">-${fmt(gastosEfectivo)}</p>
      </div>
    </div>

    <div class="card destacado" style="padding:20px;text-align:center">
      <h4 style="font-size:11px;text-transform:uppercase;letter-spacing:.5px">💵 Efectivo esperado en caja</h4>
      <p style="font-size:36px;font-weight:800;margin:8px 0">${fmt(esperadoEnCaja)}</p>
      <small style="opacity:.9">Fondo + ventas efectivo + depósitos − retiros − gastos</small>
    </div>

    <div class="cards" style="margin-top:14px">
      <div class="card">
        <h4>Total ventas del día</h4>
        <p class="big">${fmt(totalVentas)}</p>
        <small>${ventasHoy.length} tickets</small>
      </div>
    </div>
  `;

  renderHistorialCortes();
}

/* ============ CORTE ============ */
function abrirCorteDiario() {
  initDia();
  const hoyStr = hoy();
  const ventasHoy = DB.ventas.filter(v => fechaLocal(v.fecha) === hoyStr && !v.cancelada);
  const efectivoVentas = ventasHoy.filter(v => v.metodo === "Efectivo").reduce((s,v) => s + v.total, 0);
  const tarjetaVentas = ventasHoy.filter(v => v.metodo === "Tarjeta").reduce((s,v) => s + v.total, 0);
  const transfVentas = ventasHoy.filter(v => v.metodo === "Transferencia").reduce((s,v) => s + v.total, 0);
  const totalVentas = efectivoVentas + tarjetaVentas + transfVentas;
  const retiros = estadoCajaHoy.retiros.reduce((s,r) => s + r.monto, 0);
  const depositos = estadoCajaHoy.depositos.reduce((s,d) => s + d.monto, 0);
  const gastosDia = DB.gastos.filter(g => fechaLocal(g.fecha) === hoyStr);
  const gastosEfectivo = gastosDia.filter(g => g.metodo !== "Transferencia").reduce((s,g) => s + g.monto, 0);
  const fondo = estadoCajaHoy.fondoInicial || 0;
  const esperado = fondo + efectivoVentas + depositos - retiros - gastosEfectivo;

  abrirModal("📋 Corte de caja", `
    <div style="background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px;font-size:13px;border:1px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Fondo inicial:</span><b>${fmt(fondo)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>+ Ventas efectivo:</span><b>${fmt(efectivoVentas)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>+ Depósitos:</span><b>${fmt(depositos)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>− Retiros:</span><b>-${fmt(retiros)}</b></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span>− Gastos efectivo:</span><b>-${fmt(gastosEfectivo)}</b></div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0">
      <div style="display:flex;justify-content:space-between;font-size:15px"><b>Efectivo esperado:</b><b style="color:var(--naranja)">${fmt(esperado)}</b></div>
    </div>

    <h4 style="font-size:13px;margin-bottom:8px">Arqueo (conteo físico)</h4>
    <div class="arqueo-grid">
      <div>
        <label>Billetes $1000</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="1000" value="0" oninput="calcArqueo()"><span class="sub" id="s1000">$0</span></div>
        <label>Billetes $500</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="500" value="0" oninput="calcArqueo()"><span class="sub" id="s500">$0</span></div>
        <label>Billetes $200</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="200" value="0" oninput="calcArqueo()"><span class="sub" id="s200">$0</span></div>
        <label>Billetes $100</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="100" value="0" oninput="calcArqueo()"><span class="sub" id="s100">$0</span></div>
        <label>Billetes $50</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="50" value="0" oninput="calcArqueo()"><span class="sub" id="s50">$0</span></div>
      </div>
      <div>
        <label>Billetes $20</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="20" value="0" oninput="calcArqueo()"><span class="sub" id="s20">$0</span></div>
        <label>Monedas $10</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="10" value="0" oninput="calcArqueo()"><span class="sub" id="s10">$0</span></div>
        <label>Monedas $5</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="5" value="0" oninput="calcArqueo()"><span class="sub" id="s5">$0</span></div>
        <label>Monedas $2</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="2" value="0" oninput="calcArqueo()"><span class="sub" id="s2">$0</span></div>
        <label>Monedas $1</label>
        <div class="arqueo-fila"><input type="number" class="arqueo" data-v="1" value="0" oninput="calcArqueo()"><span class="sub" id="s1">$0</span></div>
      </div>
    </div>

    <div style="margin-top:14px;padding:14px;background:#f8fafc;border-radius:12px;border:1px solid var(--borde)">
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Contado:</span><b id="totalContado">$0.00</b></div>
      <div style="display:flex;justify-content:space-between;padding:4px 0"><span>Esperado:</span><b>${fmt(esperado)}</b></div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:6px 0">
      <div style="display:flex;justify-content:space-between;font-size:16px"><b>Diferencia:</b><b id="diferencia" style="color:var(--ok)">$0.00</b></div>
    </div>

    <label>Nota del corte (opcional)</label>
    <input id="corteNota" placeholder="Observaciones...">

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
      <button class="btn-primary" onclick="guardarCorte(${esperado}, ${efectivoVentas}, ${tarjetaVentas}, ${transfVentas}, ${totalVentas})">💾 Guardar corte</button>
    </div>
  `);

  window._esperadoCorte = esperado;
}

function calcArqueo() {
  let total = 0;
  $$(".arqueo").forEach(inp => {
    const v = +inp.dataset.v;
    const cant = +inp.value || 0;
    const sub = v * cant;
    total += sub;
    const span = $("#s" + v);
    if (span) span.textContent = fmt(sub);
  });
  $("#totalContado").textContent = fmt(total);
  const esp = window._esperadoCorte || 0;
  const dif = total - esp;
  const el = $("#diferencia");
  el.textContent = (dif >= 0 ? "+" : "") + fmt(dif);
  el.style.color = Math.abs(dif) < 0.01 ? "var(--ok)" : (dif > 0 ? "#3b82f6" : "var(--rojo)");
}

function guardarCorte(esperado, efectivo, tarjeta, transf, total) {
  const contado = +$("#totalContado").textContent.replace(/[^0-9.-]/g, "");
  const nota = $("#corteNota").value.trim();
  const diferencia = contado - esperado;

  const corte = {
    id: nuevoId(LS.get("cortes", [])),
    fecha: new Date().toISOString(),
    dia: hoy(),
    fondo: estadoCajaHoy.fondoInicial || 0,
    ventas: { efectivo, tarjeta, transf, total, tickets: DB.ventas.filter(v => fechaLocal(v.fecha) === hoy() && !v.cancelada).length },
    gastos: DB.gastos.filter(g => fechaLocal(g.fecha) === hoy()).reduce((s,g) => s + g.monto, 0),
    retiros: estadoCajaHoy.retiros.reduce((s,r) => s + r.monto, 0),
    depositos: estadoCajaHoy.depositos.reduce((s,d) => s + d.monto, 0),
    esperado, contado, diferencia, nota,
    usuario: JSON.parse(sessionStorage.getItem("sesion") || "{}").nombre || "admin"
  };

  const cortes = LS.get("cortes", []);
  cortes.push(corte);
  LS.set("cortes", cortes);

  cerrarModal();
  toast(`✅ Corte guardado · Diferencia: ${fmt(diferencia)}`);
  renderEstadoCaja();
  renderHistorialCortes();
  mostrarAlertaStock();
  imprimirCorte(corte);
}

function renderHistorialCortes() {
  const cortes = LS.get("cortes", []).slice().reverse();
  const el = $("#historialCortes");
  if (!el) return;
  el.innerHTML = `
    <h3 style="margin-bottom:8px;font-size:15px;padding:12px 12px 0;font-weight:800">Historial de cortes</h3>
    <table>
      <thead><tr><th>Fecha</th><th>Ventas</th><th>Contado</th><th>Diferencia</th><th>Cajero</th><th></th></tr></thead>
      <tbody>
        ${cortes.length ? cortes.map(c => `
          <tr>
            <td data-label="Fecha">${new Date(c.fecha).toLocaleString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td>
            <td data-label="Ventas">${fmt(c.ventas.total)}</td>
            <td data-label="Contado">${fmt(c.contado)}</td>
            <td data-label="Diferencia"><span class="badge ${Math.abs(c.diferencia)<0.01?'ok':(c.diferencia>0?'warn':'danger')}">${(c.diferencia>=0?"+":"")+fmt(c.diferencia)}</span></td>
            <td data-label="Cajero">${c.usuario}</td>
            <td><button class="btn-mini" onclick='imprimirCorte(${JSON.stringify(c).replace(/'/g,"&#39;")})'>🖨️</button></td>
          </tr>
        `).join("") : `<tr><td colspan="6" style="text-align:center;padding:20px;color:#94a3b8">Sin cortes registrados</td></tr>`}
      </tbody>
    </table>
  `;
}

function imprimirCorte(c) {
  const n = DB.negocio;
  const html = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Corte</title>
<style>
  @page { size: 58mm auto; margin: 0; }
  body { font-family: 'Courier New', monospace; font-size: 11px; width: 58mm; padding: 4mm; margin: 0; }
  .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 13px; }
  .fila { display: flex; justify-content: space-between; padding: 2px 0; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
</style></head><body>
  <div class="c b g">${n.nombre || "POS"}</div>
  <div class="c">${n.slogan || ""}</div>
  <div class="c">CORTE DE CAJA</div>
  <hr>
  <div>Fecha: ${new Date(c.fecha).toLocaleString("es-MX")}</div>
  <div>Cajero: ${c.usuario}</div>
  <hr>
  <div class="b">VENTAS</div>
  <div class="fila"><span>Efectivo:</span><span>${fmt(c.ventas.efectivo)}</span></div>
  <div class="fila"><span>Tarjeta:</span><span>${fmt(c.ventas.tarjeta)}</span></div>
  <div class="fila"><span>Transferencia:</span><span>${fmt(c.ventas.transf)}</span></div>
  <div class="fila b"><span>TOTAL:</span><span>${fmt(c.ventas.total)}</span></div>
  <div class="fila"><span>Tickets:</span><span>${c.ventas.tickets}</span></div>
  <hr>
  <div class="b">EFECTIVO</div>
  <div class="fila"><span>Fondo inicial:</span><span>${fmt(c.fondo)}</span></div>
  <div class="fila"><span>Depósitos:</span><span>+${fmt(c.depositos)}</span></div>
  <div class="fila"><span>Retiros:</span><span>-${fmt(c.retiros)}</span></div>
  <div class="fila"><span>Gastos efectivo:</span><span>-${fmt(c.gastos)}</span></div>
  <div class="fila b"><span>Esperado:</span><span>${fmt(c.esperado)}</span></div>
  <div class="fila b"><span>Contado:</span><span>${fmt(c.contado)}</span></div>
  <div class="fila b g"><span>DIFERENCIA:</span><span>${fmt(c.diferencia)}</span></div>
  <hr>
  ${c.nota ? `<div>Nota: ${c.nota}</div><hr>` : ""}
  <div class="c">Firma: _____________</div>
</body></html>`;
  const w = window.open("", "_blank", "width=320,height=600");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 300);
}
