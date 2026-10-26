/* ============================================
   CONFIG-UI.JS — CONFIGURACIÓN, RESPALDO Y BORRADOS
   ============================================ */

/* ============ CONFIG ============ */
function cargarNegocio() {
  if (typeof renderMantenimiento === "function") renderMantenimiento();
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
    pendientes: typeof leerPendientes === "function" ? leerPendientes() : [],
    resumenHistorico: LS.get("resumenHistorico", []),
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
    if (typeof registrarRespaldo === "function") registrarRespaldo();
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
  const repetida = $("#passConfirm").value;

  if (!actual || !nueva || !repetida) return toast("⚠️ Completa todos los campos");
  if (nueva.length < 6) return toast("⚠️ Mínimo 6 caracteres");
  if (nueva === "admin123") return toast("⚠️ Elige una contraseña distinta a la inicial");
  if (nueva !== repetida) return toast("❌ Las contraseñas no coinciden");

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
      if (Array.isArray(extras.resumenHistorico)) LS.set("resumenHistorico", extras.resumenHistorico);
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
      if (Array.isArray(extras.pendientes) && typeof guardarPendientes === "function") guardarPendientes(extras.pendientes);
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
const MENU_INFERIOR_OPCIONES = [
  { id: "caja", icono: "🛒", nombre: "Venta" },
  { id: "inventario", icono: "📦", nombre: "Inventario" },
  { id: "corte", icono: "💰", nombre: "Caja" },
  { id: "panelVentas", icono: "📈", nombre: "Panel" },
  { id: "reportes", icono: "📊", nombre: "Reportes" },
  { id: "preventas", icono: "📋", nombre: "Preventas" },
  { id: "pendientes", icono: "📝", nombre: "Pendientes" },
  { id: "historial", icono: "🧾", nombre: "Historial" }
];
const MENU_INFERIOR_DEFECTO = ["caja", "inventario", "corte", "panelVentas", "reportes"];
// Identidad estable del usuario (el id viaja con la sincronización)
function menuInferiorIdentidad(usuario) {
  const u = usuario || (typeof usuarioActual === "function" ? usuarioActual() : {});
  return u && u.id != null ? `id_${u.id}` : `user_${String(u && (u.username || u.nombre) || "admin").toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
}
// Clave antigua (v115-v117): solo existía en el dispositivo donde se configuró; se usa únicamente para migrar
const menuInferiorClaveUsuario = usuario => `menuInferiorPOS_usuario_${menuInferiorIdentidad(usuario)}`;
function menuInferiorUsuarioConfigurado() {
  const sel = document.getElementById("configMenuUsuario");
  if (sel && sel.value && typeof DB !== "undefined") {
    return DB.usuarios.find(u => String(u.id) === String(sel.value)) || (typeof usuarioActual === "function" ? usuarioActual() : {});
  }
  return typeof usuarioActual === "function" ? usuarioActual() : {};
}
function menuInferiorPorDefecto(usuario) {
  const rol = usuario && usuario.rol || "admin";
  const defaults = {
    admin: ["caja", "inventario", "corte", "panelVentas", "reportes"],
    encargado: ["caja", "inventario", "corte", "historial", "reportes"],
    cajero: ["caja", "preventas", "pendientes", "historial"]
  };
  return [...(defaults[rol] || MENU_INFERIOR_DEFECTO)];
}
// Todos los menús viven en UN valor sincronizado: { id_1: [...], id_3: [...] }.
// Leer NO escribe nada (antes creaba claves al consultar, incluso sin sesión).
function leerMenuInferior(usuario) {
  const u = usuario || (typeof usuarioActual === "function" ? usuarioActual() : {});
  const todos = LS.get("menusPorUsuario", {});
  let guardado = todos && !Array.isArray(todos) && Array.isArray(todos[menuInferiorIdentidad(u)]) ? todos[menuInferiorIdentidad(u)] : null;
  if (!guardado) {
    const porUsuarioAntiguo = LS.get(menuInferiorClaveUsuario(u), null);
    const globalAntiguo = LS.get("menuInferiorPOS", null);
    guardado = Array.isArray(porUsuarioAntiguo) ? porUsuarioAntiguo
      : ((u && u.rol || "admin") === "admin" && Array.isArray(globalAntiguo)) ? globalAntiguo
      : menuInferiorPorDefecto(u);
  }
  const validos = guardado.filter((id, i, arr) => MENU_INFERIOR_OPCIONES.some(o => o.id === id) && arr.indexOf(id) === i && id !== "caja");
  return ["caja", ...validos].slice(0, 5);
}
function guardarMenuInferiorUsuario(usuario, lista) {
  const actuales = LS.get("menusPorUsuario", {});
  const todos = actuales && !Array.isArray(actuales) && typeof actuales === "object" ? { ...actuales } : {};
  todos[menuInferiorIdentidad(usuario)] = ["caja", ...lista.filter(id => id !== "caja")].slice(0, 5);
  LS.set("menusPorUsuario", todos);
}
// Si el menú editado es el del usuario que tiene la sesión abierta, se refleja al instante
function aplicarMenuSiEsUsuarioActual(usuario) {
  const actual = typeof usuarioActual === "function" ? usuarioActual() : {};
  if (actual && usuario && menuInferiorIdentidad(actual) === menuInferiorIdentidad(usuario) && typeof aplicarMenuInferior === "function") aplicarMenuInferior();
}
function renderSelectorMenuInferior() {
  const sel = document.getElementById("configMenuUsuario");
  if (!sel) return;
  const previo = sel.value;
  const usuarios = (typeof DB !== "undefined" && Array.isArray(DB.usuarios)) ? DB.usuarios : [];
  sel.innerHTML = usuarios.map(u => `<option value="${u.id}">${escapeHTML(u.nombre || u.username || "Usuario")} · ${escapeHTML((typeof ROLES !== "undefined" && ROLES[u.rol]) || u.rol || "admin")}</option>`).join("");
  if (usuarios.some(u => String(u.id) === previo)) sel.value = previo;
  else if (usuarios.length) {
    const actual = typeof usuarioActual === "function" ? usuarioActual() : {};
    sel.value = String(usuarios.some(u => u.id === actual.id) ? actual.id : usuarios[0].id);
  }
}
function renderConfigMenuInferior() {
  const cont = document.getElementById("configMenuInferiorOpciones");
  if (!cont) return;
  if (typeof puede === "function" && !puede("config_total")) return; // solo el administrador configura menús
  renderSelectorMenuInferior();
  const usuario = menuInferiorUsuarioConfigurado();
  const seleccion = leerMenuInferior(usuario);
  cont.innerHTML = MENU_INFERIOR_OPCIONES.map(op => {
    const activo = seleccion.includes(op.id);
    const pos = seleccion.indexOf(op.id);
    const fijo = op.id === "caja";
    return `<div class="menu-inferior-fila ${activo ? "seleccionada" : ""}">
      <label class="menu-inferior-opcion"><span class="menu-opcion-icono">${op.icono}</span><span class="menu-opcion-texto">${op.nombre}</span><input type="checkbox" data-menu-config="${op.id}" ${activo ? "checked" : ""} ${fijo ? "disabled checked" : ""} onchange="cambiarSeleccionMenuInferior('${op.id}',this.checked)"><span class="menu-opcion-switch" aria-hidden="true"></span></label>
      <span class="menu-orden">${activo ? pos + 1 : "—"}</span>
      <button type="button" class="btn-mini" aria-label="Subir ${op.nombre}" ${!activo || pos <= 1 ? "disabled" : ""} onclick="moverMenuInferior('${op.id}',-1)">↑</button>
      <button type="button" class="btn-mini" aria-label="Bajar ${op.nombre}" ${!activo || pos < 1 || pos >= seleccion.length - 1 ? "disabled" : ""} onclick="moverMenuInferior('${op.id}',1)">↓</button>
    </div>`;
  }).join("");
}
function cambiarSeleccionMenuInferior(id, agregar) {
  const usuario = menuInferiorUsuarioConfigurado();
  let lista = leerMenuInferior(usuario);
  if (id === "caja") return renderConfigMenuInferior();
  if (agregar) { if (lista.length >= 5) { toast("Puedes elegir hasta 5 accesos, incluyendo Venta"); return renderConfigMenuInferior(); } if (!lista.includes(id)) lista.push(id); }
  else lista = lista.filter(x => x !== id);
  guardarMenuInferiorUsuario(usuario, lista);
  aplicarMenuSiEsUsuarioActual(usuario);
  renderConfigMenuInferior();
}
function moverMenuInferior(id, delta) {
  const usuario = menuInferiorUsuarioConfigurado();
  const lista = leerMenuInferior(usuario); const i = lista.indexOf(id); const j = i + delta;
  if (i < 1 || j < 1 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  guardarMenuInferiorUsuario(usuario, lista);
  aplicarMenuSiEsUsuarioActual(usuario);
  renderConfigMenuInferior();
}
// Los cambios ya se guardan al marcar/mover; este botón confirma y refleja el menú de inmediato
function guardarMenuInferior() {
  const usuario = menuInferiorUsuarioConfigurado();
  guardarMenuInferiorUsuario(usuario, leerMenuInferior(usuario));
  aplicarMenuSiEsUsuarioActual(usuario);
  toast("✅ Menú guardado para " + (usuario.nombre || usuario.username || "el usuario seleccionado"));
}
function restablecerMenuInferior() {
  if (!confirm("¿Restablecer el menú del usuario seleccionado a los accesos predeterminados de su rol?")) return;
  const usuario = menuInferiorUsuarioConfigurado();
  guardarMenuInferiorUsuario(usuario, menuInferiorPorDefecto(usuario));
  aplicarMenuSiEsUsuarioActual(usuario);
  renderConfigMenuInferior();
  toast("Menú restablecido para " + (usuario.nombre || usuario.username || "el usuario seleccionado"));
}
