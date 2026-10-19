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


function exportarBackup() {
  try {
    const extras = {
      cortes: LS.get("cortes", []),
      catsGasto: LS.get("catsGasto", []),
      cajaHoy: LS.get("cajaHoy", {
        fecha: hoy(),
        fondoInicial: null,
        retiros: [],
        depositos: []
      }),
      gastosPersonales: LS.get("gastosPersonales", [])
    };

    const respaldo = {
      app: "POS Pollería Pro",
      version: 1,
      fechaExportacion: new Date().toISOString(),
      DB: JSON.parse(JSON.stringify(DB)),
      extras
    };

    const contenido = JSON.stringify(respaldo, null, 2);
    const nombre = `respaldo-pos-Guardado-${hoy()}.json`;

    // Android: guardar directamente el contenido, no la URL blob.
    if (
      window.Android &&
      typeof window.Android.guardarArchivo === "function"
    ) {
      const guardado = window.Android.guardarArchivo(nombre, contenido);

      if (guardado) {
        toast("✅ Respaldo guardado en Descargas");
      } else {
        toast("❌ Android no pudo guardar el respaldo");
      }
      return;
    }

    // Navegadores web: descargar normalmente mediante Blob.
    const blob = new Blob(
      [contenido],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast("✅ Respaldo exportado correctamente");

  } catch (err) {
    console.error("Error exportando respaldo:", err);
    toast("❌ Error exportando: " + err.message);
  }
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
  
function importarBackup(e) {
  const input = e?.target;
  const archivo = input?.files?.[0];

  if (!archivo) {
    toast("⚠️ No se seleccionó ningún archivo");
    return;
  }

  const lector = new FileReader();

  lector.onload = function (evento) {
    try {
      const texto = evento.target.result;
      const respaldo = JSON.parse(texto);

      // Aceptar el formato actual del POS y respaldos DB directos.
      const datos = respaldo.DB || respaldo.data || respaldo;

      if (
        !datos ||
        typeof datos !== "object" ||
        !Array.isArray(datos.productos) ||
        !Array.isArray(datos.ventas) ||
        !Array.isArray(datos.usuarios)
      ) {
        throw new Error(
          "El JSON no contiene productos, ventas y usuarios con el formato esperado."
        );
      }

      // Preparar campos que podrían faltar en respaldos antiguos.
      const restaurado = {
        ...datos,
        productos: datos.productos,
        ventas: datos.ventas,
        usuarios: datos.usuarios,
        insumos: Array.isArray(datos.insumos) ? datos.insumos : [],
        gastos: Array.isArray(datos.gastos) ? datos.gastos : [],
        negocio:
          datos.negocio && typeof datos.negocio === "object"
            ? datos.negocio
            : {
                nombre: "POS",
                slogan: "",
                direccion: "",
                telefono: ""
              }
      };

      const extras =
        respaldo.extras && typeof respaldo.extras === "object"
          ? respaldo.extras
          : {};

      if (
        !confirm(
          "⚠️ Se reemplazarán los datos actuales del POS por los del respaldo.\n\n" +
          "Antes de continuar, asegúrate de conservar una copia de seguridad.\n\n" +
          "¿Deseas restaurar este respaldo?"
        )
      ) {
        return;
      }

      // Guardar los datos principales mediante la función habitual.
      DB = restaurado;
      guardar();

      // Restaurar datos adicionales.
      LS.set(
        "cortes",
        Array.isArray(extras.cortes) ? extras.cortes : []
      );

      LS.set(
        "catsGasto",
        Array.isArray(extras.catsGasto)
          ? extras.catsGasto
          : LS.get("catsGasto", [])
      );

      const caja = extras.cajaHoy;
      LS.set(
        "cajaHoy",
        caja && typeof caja === "object"
          ? caja
          : {
              fecha: hoy(),
              fondoInicial: null,
              retiros: [],
              depositos: []
            }
      );

      LS.set(
        "gastosPersonales",
        Array.isArray(extras.gastosPersonales)
          ? extras.gastosPersonales
          : []
      );

      estadoCajaHoy = LS.get("cajaHoy");

      toast("✅ Respaldo restaurado. Actualizando aplicación…");

      setTimeout(() => location.reload(), 800);

    } catch (error) {
      console.error("Error importando respaldo:", error);

      toast(
        "❌ No se pudo importar: " +
        (error.message || "archivo inválido")
      );

    } finally {
      if (input) input.value = "";
    }
  };

  lector.onerror = function () {
    toast("❌ No se pudo leer el archivo JSON");
    if (input) input.value = "";
  };

  lector.readAsText(archivo);
}

