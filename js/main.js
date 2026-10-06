// =============================================================
// Punto de entrada: arranca la app y maneja la sesión
// =============================================================
// La búsqueda y el login se inician por separado: si Supabase
// no carga (sin internet, CDN caído), la búsqueda de cartas
// sigue funcionando igual.
//
// Cada pantalla vive en su módulo: busqueda.js (Buscar), listas.js
// (Colección y recientes de Inicio), objetivos.js (Progreso y "Tu
// progreso"), detalle-carta.js (detalle de carta), instalar.js
// ("Instalar app") y router.js (rutas).
// Lo que comparten (cartas del usuario, pantalla actual) está en
// estado.js. Aquí se conectan entre sí y se maneja el login.
// =============================================================

import { SUPABASE_URL } from './config.js';
import * as ui from './ui.js';
import * as objetivos from './objetivos.js';
import * as busqueda from './busqueda.js';
import * as listas from './listas.js';
import * as detalleCarta from './detalle-carta.js';
import * as instalar from './instalar.js';
import { estado, guardarCambio } from './estado.js';
import { iniciarRouter, actualizarPantalla, mostrarRuta, guardarRutaParaVolver, hayTokenEnUrl } from './router.js';

estado.cargandoSesion = hayTokenEnUrl() || haySesionGuardada();

busqueda.preparar();
ui.prepararSelectorTema();
ui.prepararMenuCuenta();
listas.preparar();

objetivos.preparar({
  misCartas: () => estado.misCartas,
  coleccion: () => estado.coleccion,
  guardarCambio,
  // Al cargar los objetivos (o reintentar, o seguir una sugerencia):
  // se actualiza lo que los usa
  alCambiarObjetivos: () => {
    if (estado.rutaActual === 'progreso') mostrarRuta();
    else if (estado.rutaActual === 'buscar') busqueda.dibujarBusqueda();
    else if (estado.rutaActual === 'inicio') objetivos.mostrarInicio();
    detalleCarta.actualizarSeguir();
  },
});

ui.prepararConfirmacion();
detalleCarta.preparar();
instalar.preparar();

/**
 * ¿Hay una sesión de Supabase guardada en este navegador? Se mira
 * sin cargar supabase-js: si no hay, se sabe desde ya que es visitante.
 */
function haySesionGuardada() {
  // Misma clave que usa supabase-js por defecto: sb-<proyecto>-auth-token
  const clave = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  try {
    return localStorage.getItem(clave) !== null;
  } catch {
    return false; // sin almacenamiento tampoco hay sesión guardada
  }
}

// --- Sesión ---------------------------------------------------
// Se carga con import() dinámico: si falla, solo se pierde el login.

// Va antes de iniciarLogin() para limpiar la URL antes de que
// Supabase intente leerla, y antes del router para que no la pise.
mostrarErrorDeRetorno();

// La pantalla se dibuja ya, sin esperar a supabase-js (75 KB).
// Con una sesión guardada, las pantallas privadas dicen "Cargando…"
// hasta que Supabase la confirma; sin ella, se ve como visitante.
if (estado.cargandoSesion) ui.mostrarSesionPendiente();
if (hayTokenEnUrl()) ui.mensajeLogin('Entrando con Google…');
iniciarRouter(); // con token en la URL espera al primer aviso de sesión

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  estado.cargandoSesion = false;
  ui.mostrarSesion(null);
  ui.activarBotonesGoogle(false);
  ui.mensajeLogin('El inicio de sesión no está disponible en este momento.', 'error');
  // Sin Supabase nadie va a leer el token: se quita para que arranque el router
  if (hayTokenEnUrl()) history.replaceState(null, '', window.location.pathname);
  actualizarPantalla(); // sin login, la app sigue funcionando como visitante
});

async function iniciarLogin() {
  const [{ entrarConGoogle, cerrarSesion, alCambiarSesion }, modColeccion] = await Promise.all([
    import('./auth.js'),
    import('./coleccion.js'),
  ]);
  estado.coleccion = modColeccion;

  let usuarioId = null;

  // Se mira antes de que Supabase limpie el token de la URL
  let entrandoConGoogle = hayTokenEnUrl();

  alCambiarSesion((usuario) => {
    ui.mostrarSesion(usuario);
    if (entrandoConGoogle) {
      entrandoConGoogle = false;
      ui.mensajeLogin(''); // quita "Entrando con Google…"
    }

    // Supabase avisa también al renovar el token: solo se recarga
    // la colección si de verdad cambió el usuario.
    const nuevoId = usuario?.id ?? null;
    if (nuevoId === usuarioId) {
      // Primer aviso sin sesión (o la guardada ya no sirve): visitante
      if (!usuario) estado.cargandoSesion = false;
      iniciarRouter();
      return;
    }
    usuarioId = nuevoId;
    estado.usuarioId = nuevoId;

    if (!usuario) {
      estado.cargandoSesion = false;
      estado.misCartas = null;
      objetivos.olvidar();
      ui.cerrarDetalle();
      ui.mostrarAvisoConexion(null);
      listas.olvidar();
      actualizarPantalla();
      return;
    }

    // Mientras llegan sus cartas, las pantallas privadas dicen "Cargando…"
    estado.cargandoSesion = true;
    actualizarPantalla();

    // setTimeout: Supabase recomienda no llamar a la base de datos
    // dentro de este aviso, porque puede quedar bloqueado.
    setTimeout(() => cargarMisCartasDe(nuevoId), 0);
  });

  /** Carga las cartas del usuario; sin conexión, un intento y "Reintentar". */
  async function cargarMisCartasDe(id) {
    try {
      const cartas = await estado.coleccion.cargarMisCartas();
      if (usuarioId !== id) return; // salió mientras cargaba
      estado.misCartas = cartas;
      ui.mostrarAvisoConexion(null);
      objetivos.cargar(); // aparte: si falla, la colección igual funciona
    } catch (error) {
      console.error(error);
      if (usuarioId !== id) return;
      ui.mostrarAvisoConexion(() => cargarMisCartasDe(id));
    }
    estado.cargandoSesion = false;
    actualizarPantalla();
  }

  document.querySelectorAll('[data-accion="google"]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      guardarRutaParaVolver();
      ui.activarBotonesGoogle(false);
      ui.mensajeLogin('Abriendo Google…');

      try {
        // Si todo va bien, el navegador se va a Google y no vuelve aquí
        await entrarConGoogle();
      } catch (error) {
        console.error(error);
        ui.mensajeLogin('No se pudo abrir el inicio de sesión con Google. Inténtalo otra vez.', 'error');
        ui.activarBotonesGoogle(true);
      }
    });
  });

  // Si vuelve con "Atrás" desde Google, el navegador puede restaurar la
  // página tal como quedó (botones desactivados, "Abriendo Google…")
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    ui.activarBotonesGoogle(true);
    ui.mensajeLogin('');
  });

  document.querySelector('#btn-salir').addEventListener('click', async () => {
    try {
      await cerrarSesion();
    } catch (error) {
      console.error(error);
    }
  });
}

/**
 * Si Supabase devolvió al usuario con un error en la URL
 * (#error=...), lo muestra y limpia la dirección.
 * Pasa, por ejemplo, si el usuario cancela en la pantalla de Google.
 */
function mostrarErrorDeRetorno() {
  // Normalmente viene en el hash (#); por si acaso se revisa también la query (?)
  const params = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const fuente = params.has('error') ? params : query.has('error') ? query : null;
  if (!fuente) return;

  console.error('Error al volver del login:', fuente.get('error_description'));
  ui.mensajeLogin('No se pudo iniciar sesión con Google. Inténtalo de nuevo.', 'error');

  history.replaceState(null, '', window.location.pathname);
}
