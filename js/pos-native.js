/* POS Native bridge v2.3 - cliente asíncrono para WebMessageListener.
 * Cliente único del canal nativo seguro; todas las operaciones son asíncronas.
 */
(function () {
  "use strict";
  const native = window.PosNative;
  const pending = new Map();
  let seq = 0;

  if (!native || typeof native.postMessage !== "function") {
    window.POS_NATIVE = {
      available: false,
      call: () => Promise.reject(new Error("Canal nativo seguro no disponible"))
    };
    return;
  }

  native.onmessage = function (event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    const item = pending.get(String(message.id));
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(String(message.id));
    if (message.ok) item.resolve(message.result);
    else item.reject(new Error(message.error || "Error nativo"));
  };

  function call(action, args = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = String(++seq) + "-" + Date.now();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Tiempo de espera agotado: " + action));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        native.postMessage(JSON.stringify({ id, action, args }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  window.POS_NATIVE = {
    available: true,
    call,
    ping: () => call("ping"),
    isBluetoothAvailable: () => call("isBluetoothAvailable"),
    isBluetoothEnabled: () => call("isBluetoothEnabled"),
    requestEnableBluetooth: () => call("requestEnableBluetooth"),
    getPairedDevices: () => call("getPairedDevices"),
    connectToPrinter: address => call("connectToPrinter", { address }, 30000),
    isConnected: () => call("isConnected"),
    disconnect: () => call("disconnect"),
    printText: text => call("printText", { text }, 30000),
    printTicket: ticketJson => call("printTicket", { ticketJson }, 45000),
    guardarArchivo: (name, content) => call("guardarArchivo", { name, content }, 30000),
    signInWithGoogle: slot => call("signInWithGoogle", { slot }, 120000)
  };
})();
