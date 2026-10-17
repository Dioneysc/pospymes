/* ============================================
   CONFIG-UI.JS — CONFIGURACIÓN, RESPALDO Y BORRADOS
   ============================================ */

/* ============ CONFIG ============ */
function cargarNegocio() {
  const elN = $("#cfgNombre");
  const elS = $("#cfgSlogan");
  const elD = $("#cfgDireccion");
  const elT = $("#cfgTelefono");
  if (elN) elN.value = DB.negocio.nombre || "";
  if (elS) elS.value = DB.negocio.slogan || "";
  if (elD) elD.value = DB.negocio.direccion || "";
  if (elT) elT.value = DB.negocio.telefono || "";
}

function guardarNegocio() {
  DB.negocio = {
    nombre: $("#cfgNombre").value.trim() || "POS",
    slogan: $("#cfgSlogan").value.trim() || "Sistema de venta",
    direccion: $("#cfgDireccion").value.trim(),
    telefono: $("#cfgTelefono").value.trim()
  };
  guardar();
  actualizarHeader();
  toast("💾 Datos guardados");
}

function importarBackup(e) {
    const file = e.target.files ? e.target.files[0] : null;
    if (!file) {
        return toast("⚠️ No se seleccionó ningún archivo");
    }

    const reader = new FileReader();
    reader.onload = function (ev) {
        try {
            const raw = JSON.parse(ev.target.result);
            const data = raw.DB || raw;

            // Validación básica de la estructura del respaldo
            if (!Array.isArray(data.productos) || !Array.isArray(data.ventas) || !Array.isArray(data.usuarios)) {
                throw new Error("El archivo no tiene el formato correcto del POS");
            }

            data.insumos = data.insumos || [];
            data.gastos = data.gastos || [];
            data.negocio = data.negocio || { nombre: "POS", slogan: "", direccion: "", telefono: "" };

            if (!confirm("⚠️ Esto reemplazará todos los datos actuales. ¿Deseas continuar?")) {
                e.target.value = ""; // Limpiar input
                return;
            }

            // Aplicar datos
            DB = data;
            guardar();

            if (raw.extras) {
                if (typeof LS !== "undefined") {
                    LS.set("cortes", raw.extras.cortes || []);
                    LS.set("catsGasto", raw.extras.catsGasto || []);
                    if (raw.extras.cajaHoy) LS.set("cajaHoy", raw.extras.cajaHoy);
                }
            }

            toast("✅ Respaldo importado correctamente");
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            console.error("Error importando respaldo:", err);
            toast("❌ Archivo inválido o dañado");
            e.target.value = ""; // Limpiar input
        }
    };

    reader.onerror = function () {
        toast("❌ Error al leer el archivo seleccionado");
    };

    reader.readAsText(file);
}

function borrarProductosInsumos() {
  if (!confirm("⚠️ Se borrarán TODOS los productos e insumos.\n\nLas ventas y gastos NO se borran.\n\n¿Continuar?")) return;
  if (!confirm("⚠️ Última confirmación. ¿Borrar productos e insumos definitivamente?")) return;
  DB.productos = [];
  DB.insumos = [];
  guardar();
  toast("🍗 Productos e insumos borrados");
  carrito = [];
  renderCaja();
  renderCategorias();
  renderInsumos();
  renderProductos();
  mostrarAlertaStock();
}

function borrarVentasGastos() {
  if (!confirm("⚠️ Se borrarán TODAS las ventas y gastos.\n\nLos productos e insumos NO se borran.\n\n¿Continuar?")) return;
  if (!confirm("⚠️ Última confirmación. ¿Borrar ventas y gastos definitivamente?")) return;
  DB.ventas = [];
  DB.gastos = [];
  LS.set("cortes", []);
  LS.set("cajaHoy", { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [] });
  estadoCajaHoy = LS.get("cajaHoy");
  guardar();
  toast("🧾 Ventas y gastos borrados");
  renderEstadoCaja();
  renderHistorialCortes();
}

function borrarTodo() {
  if (!confirm("⚠️ Esto borrará TODO. ¿Estás seguro?")) return;
  if (!confirm("⚠️ Última confirmación. ¿Borrar definitivamente?")) return;
  localStorage.clear();
  sessionStorage.clear();
  location.reload();
}

async function cambiarPassword() {
  const actual = $("#passActual").value;
  const nueva = $("#passNueva").value;
  const confirm = $("#passConfirm").value;

  if (!actual || !nueva || !confirm) return toast("⚠️ Completa todos los campos");
  if (nueva.length < 6) return toast("⚠️ Mínimo 6 caracteres");
  if (nueva !== confirm) return toast("❌ Las contraseñas no coinciden");

  const sesion = JSON.parse(sessionStorage.getItem("sesion") || "{}");
  const user = DB.usuarios.find(u => u.id === sesion.id);
  if (!user) return toast("⚠️ Usuario no encontrado");
  if (!(await verificarPassword(user, actual))) return toast("❌ Contraseña actual incorrecta");

  await fijarPassword(user, nueva);
  delete user.cambiarPass;
  guardar();
  sessionStorage.setItem("sesion", sesionSegura(user));

  $("#passActual").value = "";
  $("#passNueva").value = "";
  $("#passConfirm").value = "";

  toast("✅ Contraseña actualizada");
}
