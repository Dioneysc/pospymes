/* ============================================
   ANDROID-BRIDGE.JS
   Puente para impresión Bluetooth nativa
   Solo funciona si el POS corre dentro de la APK Android
   ============================================ */

// Detectar si estamos dentro de la APK
const EN_ANDROID = typeof Android !== "undefined" && Android !== null;

console.log("🤖 EN_ANDROID:", EN_ANDROID);

// ============================================
// ESTADO
// ============================================
let impresoraConectada = false;
let impresoraNombre = "";

// ============================================
// FUNCIONES DE CONEXIÓN
// ============================================

function androidIsBluetoothAvailable() {
  if (!EN_ANDROID) return false;
  return Android.isBluetoothAvailable();
}

function androidIsBluetoothEnabled() {
  if (!EN_ANDROID) return false;
  return Android.isBluetoothEnabled();
}

function androidPedirActivarBluetooth() {
  if (!EN_ANDROID) return;
  Android.requestEnableBluetooth();
}

function androidObtenerDispositivos() {
  if (!EN_ANDROID) return [];
  try {
    const json = Android.getPairedDevices();
    return JSON.parse(json);
  } catch (e) {
    console.error("Error obteniendo dispositivos:", e);
    return [];
  }
}

function androidConectarImpresora(address) {
  if (!EN_ANDROID) return false;
  return Android.connectToPrinter(address);
}

function androidDesconectar() {
  if (!EN_ANDROID) return false;
  return Android.disconnect();
}

function androidEstaConectada() {
  if (!EN_ANDROID) return false;
  return Android.isConnected();
}

// ============================================
// IMPRESIÓN
// ============================================

function androidImprimirTicket(venta) {
  if (!EN_ANDROID) {
    return { success: false, error: "No estás en la app Android" };
  }

  if (!Android.isConnected()) {
    return { success: false, error: "No hay impresora conectada" };
  }

  // Construir JSON del ticket
  const n = DB.negocio;
  const ticket = {
    negocio: n.nombre || "POS",
    slogan: n.slogan || "",
    direccion: n.direccion || "",
    telefono: n.telefono || "",
    id: venta.id,
    fecha: new Date(venta.fecha).toLocaleString("es-MX"),
    mesa: venta.mesa || "",
    cajero: venta.usuario || "admin",
    items: venta.items.map(it => ({
      cantidad: it.cantidad,
      nombre: it.nombre,
      precio: it.precio
    })),
    subtotal: venta.subtotal,
    descuento: venta.descuento || 0,
    propina: venta.propina || 0,
    total: venta.total,
    metodo: venta.metodo,
    pagoCon: venta.pagoCon || 0,
    cambio: venta.cambio || 0
  };

  try {
    const result = Android.printTicket(JSON.stringify(ticket));
    return { success: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================
// UI — Modal de conexión
// ============================================

function abrirModalImpresora() {
  if (!EN_ANDROID) {
    return abrirModal("⚠️ Solo en app Android", `
      <p style="color:#64748b;font-size:14px;margin-bottom:14px">
        La impresión nativa Bluetooth solo funciona dentro de la app Android.
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
  if (!androidIsBluetoothAvailable()) {
    return abrirModal("⚠️ Sin Bluetooth", `
      <p style="color:#64748b;font-size:14px">
        Este dispositivo no tiene Bluetooth disponible.
      </p>
      <div class="acciones">
        <button class="btn-primary" onclick="cerrarModal()">Cerrar</button>
      </div>
    `);
  }

  if (!androidIsBluetoothEnabled()) {
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
  const dispositivos = androidObtenerDispositivos();
  const conectada = androidEstaConectada();

  abrirModal("🖨️ Impresora Bluetooth", `
    <div style="background:${conectada ? '#d1fae5' : '#f1f5f9'};border-radius:12px;padding:14px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:32px">${conectada ? '✅' : '🖨️'}</div>
        <div style="flex:1">
          <b style="font-size:14px">${conectada ? 'Impresora conectada' : 'Sin impresora'}</b>
          <div style="font-size:12px;color:#64748b;margin-top:4px">
            ${conectada ? impresoraNombre : 'Selecciona una impresora emparejada'}
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
            <div class="cat-item" style="cursor:pointer" onclick="conectarImpresora('${d.address}', '${d.name.replace(/'/g, "\\'")}')">
              <div style="flex:1">
                <b>${d.name}</b>
                <div style="font-size:11px;color:#64748b">${d.address}</div>
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
        <button class="btn-primary" onclick="imprimirPrueba()" style="margin-top:14px">
          🖨️ Imprimir prueba
        </button>
      </div>
    `}

    <div class="acciones">
      <button class="btn-secondary" onclick="cerrarModal()">Cerrar</button>
    </div>
  `);
}

function conectarImpresora(address, nombre) {
  toast("🔄 Conectando...");

  setTimeout(() => {
    const ok = androidConectarImpresora(address);
    if (ok) {
      impresoraConectada = true;
      impresoraNombre = nombre;
      toast("✅ Impresora conectada");
      cerrarModal();
      setTimeout(() => abrirModalImpresora(), 300);
    } else {
      toast("❌ No se pudo conectar");
    }
  }, 100);
}

function desconectarImpresora() {
  if (!EN_ANDROID) return;
  androidDesconectar();
  impresoraConectada = false;
  impresoraNombre = "";
  toast("🔌 Desconectada");
  cerrarModal();
  setTimeout(() => abrirModalImpresora(), 300);
}

function imprimirPrueba() {
  if (!EN_ANDROID) return;

  const testTicket = {
    negocio: DB.negocio.nombre || "POS",
    slogan: DB.negocio.slogan || "",
    direccion: DB.negocio.direccion || "",
    telefono: DB.negocio.telefono || "",
    id: "TEST",
    fecha: new Date().toLocaleString("es-MX"),
    mesa: "",
    cajero: "admin",
    items: [
      { cantidad: 1, nombre: "Ticket de prueba", precio: 0 }
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
    const ok = Android.printTicket(JSON.stringify(testTicket));
    if (ok) {
      toast("✅ Impresión enviada");
    } else {
      toast("❌ Error al imprimir");
    }
  } catch (e) {
    toast("❌ Error: " + e.message);
  }
}

// ============================================
// CALLBACKS desde Android
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