/* ============================================
   CONFIG.JS — ESTADO GLOBAL DE LA APP
   ============================================ */

// Se carga después de utils.js y db.js (usa LS y hoy)
let carrito = [];
let descuento = 0;
let descuentoPct = 0;
let propina = 0;
let categoriaActiva = "Todas";
let CATS_GASTO = LS.get("catsGasto", []);
let estadoCajaHoy = LS.get("cajaHoy", { fecha: hoy(), fondoInicial: null, retiros: [], depositos: [] });
let sonidoActivado = LS.get("sonidoActivado", true);
