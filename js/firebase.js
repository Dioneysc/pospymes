/* ============================================
   FIREBASE.JS
   Configuración e inicialización de Firebase
   ============================================ */

// Configuración de tu proyecto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDpB-UUr-t-Z0eZIEHCkRQIVfhGZA7WhGk",
  authDomain: "pos-polleria-a767b.firebaseapp.com",
  projectId: "pos-polleria-a767b",
  storageBucket: "pos-polleria-a767b.firebasestorage.app",
  messagingSenderId: "634961065585",
  appId: "1:634961065585:web:24f550a49e338c2c7d0dd0"
};

// Variables globales de Firebase
let fbApp = null;
let fbDB = null;
let fbDisponible = false;

// ID único de este dispositivo (para evitar loops en la sincronización)
const ID_DISPOSITIVO = "disp_" + Math.random().toString(36).substr(2, 9);

// ============================================
// INICIALIZAR FIREBASE (versión módulo compatible)
// ============================================
async function inicializarFirebase() {
  try {
    console.log("🔥 Inicializando Firebase...");

    // Importar dinámicamente los módulos de Firebase
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
    const { getFirestore, doc, setDoc, getDoc, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

    // Inicializar
    fbApp = initializeApp(firebaseConfig);
    fbDB = getFirestore(fbApp);

    // Guardar funciones en global para usarlas después
    window._fb = {
      doc, setDoc, getDoc, onSnapshot,
      db: fbDB
    };

    fbDisponible = true;
    console.log("✅ Firebase inicializado");

    return true;
  } catch (error) {
    console.error("❌ Error inicializando Firebase:", error);
    fbDisponible = false;
    return false;
  }
}

// ============================================
// GUARDAR DATOS EN FIREBASE
// ============================================
async function guardarEnFirebase(coleccion, datos) {
  if (!fbDisponible) return false;

  try {
    const { doc, setDoc, db } = window._fb;

    // Cada tipo de dato se guarda como un documento único con el ID del dispositivo
    const docRef = doc(db, "pos_polleria", coleccion);

    await setDoc(docRef, {
      datos: datos,
      actualizadoEn: new Date().toISOString(),
      actualizadoPor: ID_DISPOSITIVO
    }, { merge: true });

    console.log(`☁️ ${coleccion} guardado en Firebase`);
    return true;
  } catch (error) {
    console.error(`❌ Error guardando ${coleccion}:`, error);
    return false;
  }
}

// ============================================
// CARGAR DATOS DESDE FIREBASE
// ============================================
async function cargarDeFirebase(coleccion) {
  if (!fbDisponible) return null;

  try {
    const { doc, getDoc, db } = window._fb;
    const docRef = doc(db, "pos_polleria", coleccion);
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      const data = snapshot.data();
      console.log(`☁️ ${coleccion} cargado desde Firebase`);
      return data.datos;
    }
    return null;
  } catch (error) {
    console.error(`❌ Error cargando ${coleccion}:`, error);
    return null;
  }
}

// ============================================
// ESCUCHAR CAMBIOS EN TIEMPO REAL
// ============================================
function escucharFirebase(coleccion, callback) {
  if (!fbDisponible) return null;

  try {
    const { doc, onSnapshot, db } = window._fb;
    const docRef = doc(db, "pos_polleria", coleccion);

    return onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();

        // Solo procesar si viene de OTRO dispositivo (evitar loops)
        if (data.actualizadoPor !== ID_DISPOSITIVO) {
          console.log(`🔄 ${coleccion} cambió en otro dispositivo`);
          callback(data.datos);
        }
      }
    });
  } catch (error) {
    console.error(`❌ Error escuchando ${coleccion}:`, error);
    return null;
  }
}

console.log("✅ firebase.js cargado");