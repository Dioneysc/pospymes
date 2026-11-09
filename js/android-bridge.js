/* ============================================
   ANDROID-BRIDGE.JS
   Puente para impresión Bluetooth nativa
   Solo funciona si el POS corre dentro de la APK Android
   ============================================ */

// El canal seguro solo se habilita mediante WebMessageListener y origen autorizado.
const POS_NATIVE = window.POS_NATIVE || { available: false, call: () => Promise.reject(new Error("Canal nativo no disponible")) };
const EN_ANDROID = !!POS_NATIVE.available;
console.log("🤖 EN_ANDROID (canal seguro):", EN_ANDROID);
let impresoraConectada = false;
let impresoraNombre = "";

async function androidIsBluetoothAvailable() { return EN_ANDROID ? !!(await POS_NATIVE.call("isBluetoothAvailable")) : false; }
async function androidIsBluetoothEnabled() { return EN_ANDROID ? !!(await POS_NATIVE.call("isBluetoothEnabled")) : false; }
async function androidPedirActivarBluetooth() {
  if (!EN_ANDROID) return false;
  try {
    await POS_NATIVE.call("requestEnableBluetooth");
    // La petición nativa abre el diálogo del sistema. Esperar a que Android
    // regrese a primer plano y consultar el estado real sin cerrar el modal.
    const activado = await new Promise(resolve => {
      let terminado = false;
      let intentos = 0;
      const finalizar = valor => {
        if (terminado) return;
        terminado = true;
        window.removeEventListener("pos:app-resume", revisar);
        resolve(valor);
      };
      const revisar = async () => {
        intentos++;
        try {
          if (await androidIsBluetoothEnabled()) return finalizar(true);
        } catch (_) {}
        if (intentos >= 40) return finalizar(false);
        setTimeout(revisar, 400);
      };
      window.addEventListener("pos:app-resume", revisar);
      setTimeout(revisar, 500);
    });
    if (activado) {
      toast("✅ Bluetooth activado");
      await abrirModalImpresora();
    } else {
      toast("Bluetooth sigue apagado. Puedes intentarlo nuevamente.");
    }
    return activado;
  } catch (error) {
    console.error("No se pudo activar Bluetooth:", error);
    toast("No se pudo comprobar el estado de Bluetooth");
    return false;
  }
}
async function androidObtenerDispositivos() { return EN_ANDROID ? await POS_NATIVE.call("getPairedDevices") : []; }
async function androidConectarImpresora(address) { return EN_ANDROID ? !!(await POS_NATIVE.call("connectToPrinter", {address}, 30000)) : false; }
async function androidDesconectar() { return EN_ANDROID ? !!(await POS_NATIVE.call("disconnect")) : false; }
async function androidEstaConectada() { return EN_ANDROID ? !!(await POS_NATIVE.call("isConnected")) : false; }

function obtenerCodigoImpresora() { const c = LS.get("impresoraCodigo", "latin1"); return ["latin1", "cp850", "cp1252", "ascii"].includes(c) ? c : "latin1"; }
function guardarCodigoImpresora(valor) { LS.set("impresoraCodigo", ["latin1", "cp850", "cp1252", "ascii"].includes(valor) ? valor : "latin1"); toast("✅ Guardado. Imprime una prueba para comprobarlo"); }

async function androidImprimirCorte(corte) {
  if (!EN_ANDROID || !(await androidEstaConectada())) return false;
  const n = DB.negocio || {};
  const datos = { tipo:"corte", codigo:obtenerCodigoImpresora(), negocio:n.nombre||"POS", slogan:n.slogan||"", direccion:n.direccion||"", telefono:n.telefono||"", logo:typeof obtenerLogoNegocio==="function"?(obtenerLogoNegocio()||""):"", fecha:new Date(corte.fecha).toLocaleString("es-MX"), cajero:corte.usuario||"admin", fondo:Number(corte.fondo)||0, ventas:{ efectivo:Number(corte.ventas?.efectivo)||0, tarjeta:Number(corte.ventas?.tarjeta)||0, transf:Number(corte.ventas?.transf)||0, total:Number(corte.ventas?.total)||0, tickets:Number(corte.ventas?.tickets)||0 }, gastos:Number(corte.gastos)||0, gastosTransf:Number(corte.gastosTransf)||0, gastosCajaFuerte:Number(corte.gastosCajaFuerte)||0, retiros:Number(corte.retiros)||0, depositos:Number(corte.depositos)||0, esperado:Number(corte.esperado)||0, contado:Number(corte.contado)||0, diferencia:Number(corte.diferencia)||0, nota:corte.nota||"" };
  try { return (await POS_NATIVE.call("printTicket", {ticketJson:JSON.stringify(datos)}, 45000)) !== false; } catch(e) { console.error("Error al imprimir corte:",e); return false; }
}

function formatearFechaTicketCorta(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function androidImprimirTicket(venta) {
  if (!EN_ANDROID || !(await androidEstaConectada())) return false;
  const n=DB.negocio||{};
  const ticket={ codigo:obtenerCodigoImpresora(), negocio:n.nombre||"POS", slogan:n.slogan||"", direccion:n.direccion||"", telefono:n.telefono||"", logo:typeof obtenerLogoNegocio==="function"?(obtenerLogoNegocio()||""):"", id:venta.id, fechaCorta:formatearFechaTicketCorta(venta.fecha), cajero:venta.usuario||"admin", notas:[typeof lineaTipoPedido==="function"?lineaTipoPedido(venta):"",venta.notas?(venta.metodo==="PREVENTA PENDIENTE"?venta.notas:"Nota: "+venta.notas):""].filter(Boolean).join("\n"), items:(venta.items||[]).map(it=>({cantidad:it.cantidad,nombre:it.nombre,precio:it.precio})), subtotal:venta.subtotal, descuento:venta.descuento||0, propina:venta.propina||0, total:venta.total, metodo:venta.metodo, pagoCon:venta.pagoCon||0, cambio:venta.cambio||0 };
  try { return (await POS_NATIVE.call("printTicket", {ticketJson:JSON.stringify(ticket)}, 45000)) !== false; } catch(e) { console.error("Error al imprimir ticket:",e); return false; }
}

// ============================================
// UI — Modal de conexión
// ============================================

async function abrirModalImpresora() {
  if (!EN_ANDROID) {
    return abrirModal("⚠️ Solo en app Android", `
      <p style="color:#64748b;font-size:14px;margin-bottom:14px">
        La impresión nativa Bluetooth solo funciona dentro de la aplicación móvil.
        Estás usando la versión web.
      </p>
      <p style="color:#64748b;font-size:13px;margin-bottom:14px">
        Para imprimir desde el navegador, usa <b>RawBT</b>.
      </p>
      <div class="acciones">
        <button class="btn-primary" onclick="cerrarModal()">Entendido</button>
      </div>
    `);
  }

  // Verificar Bluetooth
  if (!(await androidIsBluetoothAvailable())) {
    return abrirModal("⚠️ Sin Bluetooth", `
      <p style="color:#64748b;font-size:14px">
        Este dispositivo no tiene Bluetooth disponible.
      </p>
      <div class="acciones">
        <button class="btn-primary" onclick="cerrarModal()">Cerrar</button>
      </div>
    `);
  }

  if (!(await androidIsBluetoothEnabled())) {
    return abrirModal("📶 Activar Bluetooth", `
      <p style="color:#64748b;font-size:14px;margin-bottom:14px">
        El Bluetooth está apagado. Actívalo para conectar la impresora.
      </p>
      <div class="acciones">
        <button class="btn-secondary" onclick="cerrarModal()">Cancelar</button>
        <button class="btn-primary" onclick="androidPedirActivarBluetooth()">Activar</button>
      </div>
    `);
  }

  // Obtener dispositivos emparejados
  const dispositivos = await androidObtenerDispositivos();
  const conectada = await androidEstaConectada();

  abrirModal("🖨️ Impresora Bluetooth", `
    <div style="background:${conectada ? '#d1fae5' : '#f1f5f9'};border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:32px">${conectada ? '✅' : '🖨️'}</div>
        <div style="flex:1">
          <b style="font-size:14px">${conectada ? 'Impresora conectada' : 'Sin impresora'}</b>
          <div style="font-size:12px;color:#64748b;margin-top:4px">
            ${conectada ? escapeHTML(impresoraNombre) : 'Selecciona una impresora emparejada'}
          </div>
        </div>
        ${conectada ? `<button class="btn-mini" onclick="desconectarImpresora()">Desconectar</button>` : ''}
      </div>
    </div>

    ${!conectada ? `
      <h4 style="font-size:13px;margin-bottom:10px;color:#64748b;text-transform:uppercase">
        Dispositivos emparejados (${dispositivos.length})
      </h4>

      ${dispositivos.length === 0 ? `
        <div style="text-align:center;padding:20px;color:#94a3b8">
          <p style="font-size:13px;margin-bottom:8px">No hay dispositivos emparejados</p>
          <p style="font-size:12px">Ve a Ajustes → Bluetooth y empareja tu impresora primero</p>
        </div>
      ` : `
        <div style="max-height:300px;overflow-y:auto">
          ${dispositivos.map(d => `
            <div class="cat-item" style="cursor:pointer" data-address="${escapeHTML(d.address)}" data-name="${escapeHTML(d.name)}" onclick="conectarImpresora(this.dataset.address, this.dataset.name)">
              <div style="flex:1">
                <b>${escapeHTML(d.name)}</b>
                <div style="font-size:11px;color:#64748b">${escapeHTML(d.address)}</div>
              </div>
              <span style="color:var(--naranja);font-weight:700">Conectar →</span>
            </div>
          `).join("")}
        </div>
      `}
    ` : `
      <div style="text-align:center;padding:20px">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <p style="color:#64748b;font-size:14px">Listo para imprimir</p>
        <div style="text-align:left;margin:14px 0 4px">
          <label style="font-size:12px;font-weight:700;color:#64748b">Acentos y ñ</label>
          <select id="selCodigoImpresora" onchange="guardarCodigoImpresora(this.value)" style="width:100%;margin-top:4px">
            ${[["latin1","Estándar (actual)"],["cp850","Latina CP850 (Epson y compatibles)"],["cp1252","Windows 1252 (muchas 58 mm)"],["ascii","Sin acentos (siempre se lee bien)"]]
              .map(([v, t]) => `<option value="${v}" ${obtenerCodigoImpresora() === v ? "selected" : ""}>${t}</option>`).join("")}
          </select>
          <p style="font-size:11px;color:#64748b;margin-top:6px">Imprime la prueba con cada opción y elige la que muestre bien «áéíóú ñ». Se guarda solo en este dispositivo.</p>
        </div>
        <button class="btn-primary" onclick="imprimirPrueba()" style="margin-top:10px">
          🖨️ Imprimir prueba
        </button>
      </div>
    `}

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
    </div>
  `);
}

async function conectarImpresora(address, nombre) {
  toast("🔄 Conectando...");

  setTimeout(async () => {
    const ok = await androidConectarImpresora(address);
    if (ok) {
      impresoraConectada = true;
      impresoraNombre = nombre;
      toast("✅ Impresora conectada");
      cerrarModal();
      const ticketPendiente = window._ticketPendienteImpresion || null;
      window._ticketPendienteImpresion = null;
      if (ticketPendiente) {
        // Reintentar solo la impresión: la venta ya está guardada y no se registra otra vez.
        try {
          const impreso = await androidImprimirTicket(ticketPendiente);
          if (impreso) {
            toast("🖨️ Ticket impreso correctamente");
            if (typeof mostrarTicketImpresion === "function") mostrarTicketImpresion(ticketPendiente);
          } else {
            toast("⚠️ No se pudo imprimir. Puedes reintentar desde el ticket.");
            if (typeof mostrarTicketImpresion === "function") mostrarTicketImpresion(ticketPendiente);
          }
        } catch (e) {
          console.error("Error al reintentar ticket:", e);
          if (typeof mostrarTicketImpresion === "function") mostrarTicketImpresion(ticketPendiente);
        }
      } else {
        setTimeout(() => abrirModalImpresora(), 300);
      }
    } else {
      toast("❌ No se pudo conectar");
    }
  }, 100);
}

async function desconectarImpresora() {
  if (!EN_ANDROID) return;
  await androidDesconectar();
  impresoraConectada = false;
  impresoraNombre = "";
  toast("🔌 Desconectada");
  cerrarModal();
  setTimeout(() => abrirModalImpresora(), 300);
}

async function imprimirPrueba() {
  if (!EN_ANDROID) return;

  const testTicket = {
    codigo: obtenerCodigoImpresora(),
    negocio: DB.negocio.nombre || "POS",
    slogan: DB.negocio.slogan || "",
    direccion: DB.negocio.direccion || "",
    telefono: DB.negocio.telefono || "",
    id: "TEST",
    fecha: new Date().toLocaleString("es-MX"),
    cajero: "admin",
    items: [
      { cantidad: 1, nombre: "Prueba: áéíóú ñ Ñ ¿¡? ü", precio: 0 }
    ],
    subtotal: 0,
    descuento: 0,
    propina: 0,
    total: 0,
    metodo: "Prueba",
    pagoCon: 0,
    cambio: 0
  };

  try {
    const ok = await POS_NATIVE.call("printTicket", {ticketJson:JSON.stringify(testTicket)}, 45000);
    if (ok !== false) {
      toast("✅ Impresión enviada");
    } else {
      toast("❌ Error al imprimir");
    }
  } catch (e) {
    toast("❌ Error: " + e.message);
  }
}

// ============================================
// CALLBACKS del dispositivo
// ============================================
window.onPrintSuccess = function(message) {
  console.log("✅ Print success:", message);
  toast("✅ Impresión exitosa");
};

window.onPrintError = function(message) {
  console.log("❌ Print error:", message);
  toast("❌ Error: " + message);
};

console.log("✅ android-bridge.js cargado");