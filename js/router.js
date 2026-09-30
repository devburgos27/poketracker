// =============================================================
// Rutas en el hash (el sitio sigue siendo estático)
// =============================================================
//   #/inicio   #/buscar?q=joltik   #/coleccion
//   #/progreso   #/progreso?tipo=pokemon&clave=595
// Solo cuentan los hashes que empiezan con "#/". Los que trae
// Supabase al volver del login (#access_token=…, #error=…) no son
// rutas: con token, el router espera a que Supabase lo lea. En
// cualquier otro caso arranca de inmediato, sin esperar a supabase-js.
// =============================================================

import * as ui from './ui.js';
import * as objetivos from './objetivos.js';
import * as busqueda from './busqueda.js';
import * as listas from './listas.js';
import { estado } from './estado.js';

const TITULOS = {
  inicio: 'PokéTracker · Tu colección de cartas Pokémon',
  buscar: 'Buscar · PokéTracker',
  coleccion: 'Colección · PokéTracker',
  progreso: 'Progreso · PokéTracker',
};
const RUTA_POR_DEFECTO = '#/inicio';
// Ruta donde estaba el usuario antes de ir a Google (sessionStorage)
const CLAVE_RUTA_LOGIN = 'pt-ruta-login';

let routerIniciado = false;
let pantallaActual = null; // como estado.rutaActual, pero distingue la lista y el detalle de Progreso

/** Lee el hash: { vista, params }, o null si no es una ruta ("#/…"). */
function leerRuta() {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return null;
  const [camino, consulta = ''] = hash.slice(2).split('?');
  return { vista: camino, params: new URLSearchParams(consulta) };
}

/** Muestra la pantalla que pide la URL. */
export function mostrarRuta() {
  const ruta = leerRuta();
  if (!ruta) return; // #access_token=…, #error=…: no son rutas
  if (!Object.hasOwn(TITULOS, ruta.vista)) {
    window.location.replace(RUTA_POR_DEFECTO); // ruta desconocida
    return;
  }
  irA(ruta.vista, ruta.params);
}

function irA(vista, params) {
  // La lista y el detalle de Progreso cuentan como pantallas distintas
  const pantalla = vista === 'progreso' && params.has('clave') ? 'progreso-detalle' : vista;
  const primeraVez = pantallaActual === null;
  const pantallaNueva = pantalla !== pantallaActual;
  estado.rutaActual = vista;
  pantallaActual = pantalla;

  ui.mostrarVista(vista, TITULOS[vista]);
  if (vista === 'inicio') {
    listas.mostrarInicio();
    objetivos.mostrarInicio();
  } else if (vista === 'coleccion') {
    listas.mostrarColeccion(params);
  } else if (vista === 'progreso') {
    objetivos.mostrar(params);
  } else {
    busqueda.mostrar(params);
  }

  // En la carga inicial el foco queda donde lo pone el navegador
  if (pantallaNueva && !primeraVez) ui.enfocarTitulo(vista);
}

/** Vuelve a dibujar las cartas de la pantalla actual con misCartas. */
export function redibujarPantalla() {
  if (estado.rutaActual === 'buscar') {
    busqueda.dibujarBusqueda();
    return;
  }
  if (!estado.misCartas) return;
  // Las cartas que ya no tengo salen de Colección e Inicio
  listas.redibujar();
  if (estado.rutaActual === 'inicio') objetivos.redibujarInicio();
  else if (estado.rutaActual === 'progreso') objetivos.redibujar();
}

/** ¿La URL trae el token de la vuelta de Google (#access_token=…)? */
export function hayTokenEnUrl() {
  // Como parámetro, para no confundirlo con "#/buscar?q=access_token"
  return new URLSearchParams(window.location.hash.slice(1)).has('access_token');
}

/**
 * Arranca el router una sola vez: al cargar la página, o tras el
 * primer aviso de sesión si se vuelve de Google con el token.
 */
export function iniciarRouter() {
  if (routerIniciado) return;
  // Si Supabase todavía no leyó el token de la URL, no se toca
  if (hayTokenEnUrl()) return;
  routerIniciado = true;

  let rutaGuardada = null;
  try {
    rutaGuardada = sessionStorage.getItem(CLAVE_RUTA_LOGIN);
    sessionStorage.removeItem(CLAVE_RUTA_LOGIN);
  } catch {
    // Sin almacenamiento: se vuelve a Inicio
  }

  // Sin ruta en la URL (entró a la raíz o vuelve de Google):
  // la ruta de antes del login, o Inicio
  if (!leerRuta()) {
    const destino = rutaGuardada?.startsWith('#/') ? rutaGuardada : RUTA_POR_DEFECTO;
    history.replaceState(null, '', destino);
  }

  window.addEventListener('hashchange', () => {
    // Un enlace dentro del detalle de carta ("Ver progreso") o Atrás
    // cambian de pantalla: el detalle no debe quedar abierto encima
    ui.cerrarDetalle();
    mostrarRuta();
  });
  mostrarRuta();
}

/** Tras un cambio de sesión, vuelve a dibujar la pantalla actual. */
export function actualizarPantalla() {
  if (routerIniciado) mostrarRuta();
  else iniciarRouter();
}

/** Guarda la ruta actual para volver a ella después de Google. */
export function guardarRutaParaVolver() {
  if (!leerRuta()) return;
  try {
    sessionStorage.setItem(CLAVE_RUTA_LOGIN, window.location.hash);
  } catch {
    // Sin almacenamiento: al volver se irá a Inicio
  }
}
