/* ============================================
   REPORTES.JS — REPORTES, GRÁFICA DE 7 DÍAS Y CSV
   ============================================ */

/* ============ REPORTES ============ */
function reporteRango(tipo) {
  const btns = $$("#rangoBotones button");
  if (btns.length >= 3) {
    btns.forEach(b => { b.classList.remove("activo"); b.style.background = "transparent"; });
    if (tipo === "dia") { btns[0].classList.add("activo"); btns[0].style.background = "#fff"; }
    if (tipo === "semana") { btns[1].classList.add("activo"); btns[1].style.background = "#fff"; }
    if (tipo === "mes") { btns[2].classList.add("activo"); btns[2].style.background = "#fff"; }
  }

  const ahora = new Date();
  let desde = new Date();
  if (tipo === "dia") desde.setHours(0,0,0,0);
  if (tipo === "semana") { desde.setDate(ahora.getDate() - 6); desde.setHours(0,0,0,0); }
  if (tipo === "mes") desde.setMonth(ahora.getMonth() - 1);

  const ventas = DB.ventas.filter(v => new Date(v.fecha) >= desde && !v.cancelada);
  const gastos = DB.gastos.filter(g => new Date(g.fecha) >= desde);

  const totalV = ventas.reduce((s,v) => s + v.total, 0);
  const totalG = gastos.reduce((s,g) => s + g.monto, 0);

  let costoReal = 0;
  ventas.forEach(v => {
    v.items.forEach(it => {
      const prod = DB.productos.find(p => p.id === it.productoId);
      if (!prod || !prod.insumos) return;
      prod.insumos.forEach(ing => {
        const ins = DB.insumos.find(x => x.id === ing.insumoId);
        if (ins) costoReal += ins.costo * ing.cantidad * it.cantidad;
      });
    });
  });

  const ganancia = totalV - totalG - costoReal;

  const efectivoV = ventas.filter(v => v.metodo === "Efectivo").reduce((s,v) => s + v.total, 0);
  const tarjetaV = ventas.filter(v => v.metodo === "Tarjeta").reduce((s,v) => s + v.total, 0);
  const transfV = ventas.filter(v => v.metodo === "Transferencia").reduce((s,v) => s + v.total, 0);

  const porProd = {};
  ventas.forEach(v => v.items.forEach(it => {
    porProd[it.nombre] = porProd[it.nombre] || { qty: 0, total: 0 };
    porProd[it.nombre].qty += it.cantidad;
    porProd[it.nombre].total += it.precio * it.cantidad;
  }));

  const maxTotal = Math.max(...Object.values(porProd).map(p => p.total), 1);

  $("#reporteContenido").innerHTML = `
    <div class="cards">
      <div class="card verde">
        <h4>🛒 Total ventas</h4>
        <p class="big">${fmt(totalV)}</p>
        <small>${ventas.length} tickets</small>
      </div>
      <div class="card rojo">
        <h4>💸 Gastos</h4>
        <p class="big">${fmt(totalG)}</p>
      </div>
      <div class="card azul">
        <h4>📦 Costo mercancía</h4>
        <p class="big">${fmt(costoReal)}</p>
      </div>
      <div class="card destacado">
        <h4>💰 Ganancia neta</h4>
        <p class="big">${fmt(ganancia)}</p>
      </div>
    </div>

    <div class="cards">
      <div class="card verde">
        <h4>💵 Efectivo</h4>
        <p class="big">${fmt(efectivoV)}</p>
      </div>
      <div class="card azul">
        <h4>💳 Tarjeta</h4>
        <p class="big">${fmt(tarjetaV)}</p>
      </div>
      <div class="card morado">
        <h4>🏦 Transferencia</h4>
        <p class="big">${fmt(transfV)}</p>
      </div>
    </div>

    <h3 style="margin:16px 0 8px;font-size:16px;font-weight:800">🍗 Ventas por producto</h3>
    <div class="tabla-wrap">
      <table>
        <thead><tr><th>Producto</th><th>Cantidad</th><th>Total</th></tr></thead>
        <tbody>
          ${Object.entries(porProd).sort((a,b)=>b[1].total-a[1].total).map(([n,d]) => `
            <tr>
              <td data-label="Producto">${n}</td>
              <td data-label="Cantidad">
                <div style="display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;min-width:40px">
                    <div style="height:100%;width:${(d.total/maxTotal*100).toFixed(0)}%;background:linear-gradient(90deg,var(--naranja),var(--amarillo))"></div>
                  </div>
                  <span>${d.qty}</span>
                </div>
              </td>
              <td data-label="Total"><b>${fmt(d.total)}</b></td>
            </tr>
          `).join("") || `<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:16px">Sin ventas</td></tr>`}
        </tbody>
      </table>
    </div>

    ${tipo === "semana" ? renderGrafica7Dias() : ""}

    <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-secondary" onclick="exportarCSV()">📥 Exportar ventas a CSV</button>
    </div>
  `;
}

function exportarCSV() {
  const rows = [["ID","Fecha","Cajero","Productos","Subtotal","Descuento","Propina","Total","Método"]];
  DB.ventas.forEach(v => {
    rows.push([
      v.id, new Date(v.fecha).toLocaleString("es-MX"), v.usuario || "",
      v.items.map(i => `${i.cantidad}x ${i.nombre}`).join(" | "),
      v.subtotal, v.descuento || 0, v.propina || 0, v.total, v.metodo
    ]);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ventas_${hoy()}.csv`;
  a.click();
  toast("📥 CSV descargado");
}

/* ============ GRÁFICA 7 DÍAS ============ */
function renderGrafica7Dias() {
  const dias = [];
  const totales = [];
  const nombresDia = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0,0,0,0);
    const finDia = new Date(d);
    finDia.setHours(23,59,59,999);

    const ventasDia = DB.ventas.filter(v => {
      if (v.cancelada) return false;
      const f = new Date(v.fecha);
      return f >= d && f <= finDia;
    });

    const totalDia = ventasDia.reduce((s,v) => s + v.total, 0);
    dias.push({
      nombre: nombresDia[d.getDay()],
      fecha: d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }),
      total: totalDia,
      esHoy: i === 0
    });
    totales.push(totalDia);
  }

  const max = Math.max(...totales, 1);

  return `
    <div class="grafica-7dias">
      <h3>📊 Ventas últimos 7 días</h3>
      <div class="barras-7d">
        ${dias.map(d => {
          const altura = d.total > 0 ? Math.max((d.total / max) * 100, 8) : 4;
          return `
            <div class="barra-dia ${d.esHoy ? "hoy" : ""}">
              <div class="valor">${d.total > 0 ? "$" + Math.round(d.total) : ""}</div>
              <div class="barra" style="height:${altura}%"></div>
              <div class="dia-sem">${d.nombre}</div>
            </div>
          `;
        }).join("")}
      </div>
      <div style="text-align:center;font-size:11px;color:#64748b;margin-top:10px">
        Total semana: <b>${fmt(totales.reduce((s,t) => s + t, 0))}</b>
      </div>
    </div>
  `;
}
