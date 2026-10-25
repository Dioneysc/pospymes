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

function androidImprimirCorte(corte) {
    if (!EN_ANDROID || typeof Android === "undefined" || !Android.isConnected()) return false;

    const n = DB.negocio || {};
    const datos = {
        tipo: "corte",
        codigo: obtenerCodigoImpresora(),
        negocio: n.nombre || "POS",
        slogan: n.slogan || "",
        direccion: n.direccion || "",
        telefono: n.telefono || "",
        logo: typeof obtenerLogoNegocio === "function" ? (obtenerLogoNegocio() || "") : "",
        fecha: new Date(corte.fecha).toLocaleString("es-MX"),
        cajero: corte.usuario || "admin",
        fondo: Number(corte.fondo) || 0,
        ventas: {
            efectivo: Number(corte.ventas?.efectivo) || 0,
            tarjeta: Number(corte.ventas?.tarjeta) || 0,
            transf: Number(corte.ventas?.transf) || 0,
            total: Number(corte.ventas?.total) || 0,
            tickets: Number(corte.ventas?.tickets) || 0
        },
        gastos: Number(corte.gastos) || 0,
        gastosTransf: Number(corte.gastosTransf) || 0,
        gastosCajaFuerte: Number(corte.gastosCajaFuerte) || 0,
        retiros: Number(corte.retiros) || 0,
        depositos: Number(corte.depositos) || 0,
        esperado: Number(corte.esperado) || 0,
        contado: Number(corte.contado) || 0,
        diferencia: Number(corte.diferencia) || 0,
        nota: corte.nota || ""
    };

    try {
        return Android.printTicket(JSON.stringify(datos)) === true;
    } catch (e) {
        console.error("Error al imprimir corte:", e);
        return false;
    }
}

/* Tabla de caracteres de la impresora (acentos y ñ). Es un ajuste del dispositivo, no se sincroniza. */
function obtenerCodigoImpresora() {
    const c = LS.get("impresoraCodigo", "latin1");
    return ["latin1", "cp850", "cp1252", "ascii"].includes(c) ? c : "latin1";
}

function guardarCodigoImpresora(valor) {
    LS.set("impresoraCodigo", ["latin1", "cp850", "cp1252", "ascii"].includes(valor) ? valor : "latin1");
    toast("✅ Guardado. Imprime una prueba para comprobarlo");
}

function androidImprimirTicket(venta) {
    if (!EN_ANDROID) return false;
    if (!Android.isConnected()) return false;

    const n = DB.negocio;
    const ticket = {
        codigo: obtenerCodigoImpresora(),
        negocio: n.nombre || "POS",
        slogan: n.slogan || "",
        direccion: n.direccion || "",
        telefono: n.telefono || "",
        // El logotipo se guarda localmente en el navegador/WebView de este equipo.
        logo: typeof obtenerLogoNegocio === "function" ? (obtenerLogoNegocio() || "") : "",
        id: venta.id,
        fecha: new Date(venta.fecha).toLocaleString("es-MX"),
        cajero: venta.usuario || "admin",
        notas: venta.notas ? (venta.metodo === "PREVENTA PENDIENTE" ? venta.notas : "Nota: " + venta.notas) : "",
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
        // Si el puente devuelve false la impresión falló; si no devuelve nada (void) se da por enviada
        return Android.printTicket(JSON.stringify(ticket)) !== false;
    } catch (e) {
        console.error("Error al imprimir ticket:", e);
        return false;
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