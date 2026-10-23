/* ============================================
   CONFIG-UI.JS — CONFIGURACIÓN, RESPALDO Y BORRADOS
   ============================================ */

/* ============ CONFIG ============ */
function cargarNegocio() {
  renderConfigMenuInferior();
  const elN = $("#cfgNombre");
  const elS = $("#cfgSlogan");
  const elD = $("#cfgDireccion");
  const elT = $("#cfgTelefono");
  if (elN) elN.value = DB.negocio.nombre || "";
  if (elS) elS.value = DB.negocio.slogan || "";
  if (elD) elD.value = DB.negocio.direccion || "";
  if (elT) elT.value = DB.negocio.telefono || "";
  actualizarPreviewLogoNegocio();
}

function obtenerLogoNegocio() {
  return LS.get("negocioLogoLocal", "");
}

function actualizarPreviewLogoNegocio() {
  const logo = obtenerLogoNegocio();
  const preview = $("#cfgLogoPreview");
  if (!preview) return;
  if (logo) {
    preview.src = logo;
    preview.style.display = "block";
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

function previsualizarLogoNegocio(evento) {
  const archivo = evento && evento.target && evento.target.files && evento.target.files[0];
  if (!archivo) return;
  if (!/^image\/(png|jpeg|webp)$/.test(archivo.type)) {
    evento.target.value = "";
    return toast("⚠️ Selecciona una imagen PNG, JPG o WebP");
  }
  if (archivo.size > 5 * 1024 * 1024) {
    evento.target.value = "";
    return toast("⚠️ La imagen debe pesar menos de 5 MB");
  }

  const lector = new FileReader();
  lector.onload = () => {
    const imagen = new Image();
    imagen.onload = () => {
      try {
        const max = 320;
        const escala = Math.min(1, max / Math.max(imagen.width, imagen.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(imagen.width * escala));
        canvas.height = Math.max(1, Math.round(imagen.height * escala));
        const contexto = canvas.getContext("2d");
        contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/webp", 0.82);
        LS.set("negocioLogoLocal", data);
        actualizarPreviewLogoNegocio();
        toast("🖼️ Logotipo cargado en esta terminal. Pulsa Guardar para aplicar los datos del negocio.");
      } catch (error) {
        toast("⚠️ No se pudo procesar la imagen");
      }
    };
    imagen.onerror = () => toast("⚠️ No se pudo abrir la imagen");
    imagen.src = lector.result;
  };
  lector.onerror = () => toast("⚠️ No se pudo leer el archivo");
  lector.readAsDataURL(archivo);
}

function eliminarLogoNegocio() {
  if (!confirm("¿Quitar el logotipo de esta terminal?")) return;
  LS.set("negocioLogoLocal", "");
  const selector = $("#cfgLogoNegocio");
  if (selector) selector.value = "";
  actualizarPreviewLogoNegocio();
  actualizarHeader();
  toast("Logotipo eliminado de esta terminal");
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


function crearObjetoRespaldo() {
  const extras = {
    cortes: LS.get("cortes", []),
    catsGasto: LS.get("catsGasto", []),
    cajaHoy: LS.get("cajaHoy", {
      fecha: hoy(),
      fondoInicial: null,
      retiros: [],
      depositos: []
    }),
    gastosPersonales: LS.get("gastosPersonales", []),
    cajaFuerteMovimientos: LS.get("cajaFuerteMovimientos", []),
    cajaFuerteSaldoAjuste: LS.get("cajaFuerteSaldoAjuste", 0),
    preventasPendientes: LS.get("preventasPendientes", []),
    negocioLogoLocal: LS.get("negocioLogoLocal", ""),
    modoOscuro: LS.get("modoOscuro", false),
    sonidoActivado: LS.get("sonidoActivado", true)
  };

  return {
    app: "POS Pollería Pro",
    version: 2,
    fechaExportacion: new Date().toISOString(),
    DB: JSON.parse(JSON.stringify(DB)),
    extras
  };
}

function guardarArchivoRespaldo(nombre, respaldo) {
  const contenido = JSON.stringify(respaldo, null, 2);

  // Android: guardar directamente el contenido mediante el puente nativo.
  if (window.Android && typeof window.Android.guardarArchivo === "function") {
    return !!window.Android.guardarArchivo(nombre, contenido);
  }

  // Navegadores web: descargar normalmente mediante Blob.
  const blob = new Blob([contenido], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return true;
}

function exportarBackup() {
  try {
    const respaldo = crearObjetoRespaldo();
    const nombre = `respaldo-pos-${hoy()}.json`;
    if (!guardarArchivoRespaldo(nombre, respaldo)) {
      throw new Error("El dispositivo no pudo guardar el archivo");
    }
    toast("✅ Respaldo exportado. Guárdalo fuera del dispositivo para mayor seguridad.");
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
          "Antes de restaurar, el sistema intentará guardar automáticamente una copia de los datos actuales.\n\n" +
          "¿Deseas continuar?"
        )
      ) {
        return;
      }

      // Crear respaldo preventivo antes de sobrescribir cualquier dato.
      const nombrePrevio = `respaldo-antes-de-restaurar-${hoy()}.json`;
      let respaldoPrevioGuardado = false;
      try {
        respaldoPrevioGuardado = guardarArchivoRespaldo(nombrePrevio, crearObjetoRespaldo());
      } catch (errorRespaldo) {
        console.error("No se pudo crear el respaldo preventivo:", errorRespaldo);
      }
      if (!respaldoPrevioGuardado) {
        if (!confirm("⚠️ No se pudo guardar automáticamente una copia de los datos actuales.\n\nPara evitar pérdida de información, cancela y exporta un respaldo manual.\n\n¿Deseas continuar de todos modos?")) return;
      }

      // Guardar los datos principales mediante la función habitual.
      DB = restaurado;
      guardar();

      // Restaurar datos adicionales; en respaldos antiguos, conservar los datos
      // locales que ese formato no incluía para no borrarlos accidentalmente.
      LS.set("cortes", Array.isArray(extras.cortes) ? extras.cortes : LS.get("cortes", []));
      LS.set("catsGasto", Array.isArray(extras.catsGasto) ? extras.catsGasto : LS.get("catsGasto", []));

      const caja = extras.cajaHoy;
      LS.set("cajaHoy", caja && typeof caja === "object"
        ? caja
        : LS.get("cajaHoy", { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [] }));

      LS.set("gastosPersonales", Array.isArray(extras.gastosPersonales)
        ? extras.gastosPersonales : LS.get("gastosPersonales", []));
      LS.set("cajaFuerteMovimientos", Array.isArray(extras.cajaFuerteMovimientos)
        ? extras.cajaFuerteMovimientos : LS.get("cajaFuerteMovimientos", []));
      LS.set("cajaFuerteSaldoAjuste", Number.isFinite(Number(extras.cajaFuerteSaldoAjuste))
        ? Number(extras.cajaFuerteSaldoAjuste) : LS.get("cajaFuerteSaldoAjuste", 0));
      LS.set("preventasPendientes", Array.isArray(extras.preventasPendientes)
        ? extras.preventasPendientes : LS.get("preventasPendientes", []));
      LS.set("negocioLogoLocal", typeof extras.negocioLogoLocal === "string"
        ? extras.negocioLogoLocal : LS.get("negocioLogoLocal", ""));
      LS.set("modoOscuro", typeof extras.modoOscuro === "boolean"
        ? extras.modoOscuro : LS.get("modoOscuro", false));
      LS.set("sonidoActivado", typeof extras.sonidoActivado === "boolean"
        ? extras.sonidoActivado : LS.get("sonidoActivado", true));

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



/* ============ MENÚ INFERIOR PERSONALIZABLE ============ */
const OPCIONES_MENU_INFERIOR = [
  { id: "inventario", label: "Inventario", icon: "📦" },
  { id: "corte", label: "Caja", icon: "💰" },
  { id: "reportes", label: "Reportes", icon: "📊" },
  { id: "preventas", label: "Preventas", icon: "📋" },
  { id: "pendientes", label: "Compras y pendientes", icon: "📝" },
  { id: "historial", label: "Historial", icon: "🧾" },
  { id: "productos", label: "Productos", icon: "🍗" },
  { id: "gastos", label: "Gastos", icon: "💸" },
  { id: "config", label: "Configuración", icon: "⚙️" }
];
const MENU_INFERIOR_PREDETERMINADO = ["inventario", "corte", "reportes"];
function obtenerMenuInferior() {
  // Compatibilidad con v87: antes la preferencia se guardaba como "menuInferior".
  let guardado = LS.get("menuInferiorPOS", null);
  if (!Array.isArray(guardado)) {
    const anterior = LS.get("menuInferior", null);
    if (Array.isArray(anterior)) {
      // En v87 "caja" (Venta) formaba parte del arreglo; en v93 es fija y no se guarda.
      guardado = anterior.filter(id => id !== "caja");
      LS.set("menuInferiorPOS", guardado);
    }
  }
  const validos = Array.isArray(guardado)
    ? guardado.filter((id, i, a) => OPCIONES_MENU_INFERIOR.some(o => o.id === id) && a.indexOf(id) === i)
    : MENU_INFERIOR_PREDETERMINADO.slice();
  return ["caja", ...validos];
}
function renderConfigMenuInferior() {
  const cont = document.getElementById("configMenuInferior");
  if (!cont) return;
  const seleccion = obtenerMenuInferior();
  cont.innerHTML = `<div class="menu-inferior-fijo"><span>🛒</span><span><b>Venta</b><small>Siempre visible</small></span><span class="menu-fijo-check">✓</span></div>` + OPCIONES_MENU_INFERIOR.map(o => `
    <label class="menu-inferior-opcion"><span class="menu-opcion-icono">${o.icon}</span><span class="menu-opcion-texto">${o.label}</span><input type="checkbox" value="${o.id}" ${seleccion.includes(o.id) ? "checked" : ""}><span class="menu-opcion-switch"></span></label>`).join("");
}
function guardarMenuInferior() {
  const cont = document.getElementById("configMenuInferior");
  if (!cont) return;
  const seleccion = [...cont.querySelectorAll('input[type="checkbox"]:checked')].map(el => el.value);
  LS.set("menuInferiorPOS", seleccion);
  if (typeof aplicarMenuInferior === "function") aplicarMenuInferior();
  toast("✅ Menú inferior actualizado");
}
function restablecerMenuInferior() {
  LS.set("menuInferiorPOS", MENU_INFERIOR_PREDETERMINADO);
  renderConfigMenuInferior();
  if (typeof aplicarMenuInferior === "function") aplicarMenuInferior();
  toast("Menú predeterminado restaurado");
}
