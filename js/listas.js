// =============================================================
// Colección y "Agregadas recientemente" (Inicio)
// =============================================================
// Las dos listas de tus cartas que vienen de Supabase. Comparten el
// descarte de respuestas viejas (ultimoPedido) y redibujar(), que saca
// de ambas las cartas que ya no tengo (quitar una carta se hace en el
// detalle). "Tu progreso" de Inicio es de objetivos.js.
// =============================================================

import { fechasDeSets } from './api.js';
import * as ui from './ui.js';
import * as filtrado from './filtros.js';
import { estado, guardarCambio } from './estado.js';

let filtrosColeccion = filtrado.leerFiltros(new URLSearchParams(), filtrado.COLECCION);

let cartasColeccion = [];  // lo que se ve en "Mi colección"

let textoColeccion = '';   // filtro por Pokémon de "Mi colección"

let cartasRecientes = [];  // "Agregadas recientemente" en Inicio

let ultimoPedido = 0;      // para descartar respuestas viejas de Supabase

// --- Inicio: agregadas recientemente --------------------------

const CANTIDAD_RECIENTES = 6;

async function cargarRecientes(reintento = false) {
  if (!estado.misCartas) {
    // Sin sesión, Inicio solo muestra la presentación; si no cargaron
    // las cartas, el aviso de arriba ofrece Reintentar
    ui.mensajeInicio(estado.cargandoSesion ? 'Cargando tus cartas…' : '');
    return;
  }
  const pedido = ++ultimoPedido;
  if (!reintento) ui.mensajeInicio('Cargando tus cartas…');

  try {
    const cartas = await estado.coleccion.listarRecientes(CANTIDAD_RECIENTES);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasRecientes = cartas;
    cartas.forEach((c) => estado.misCartas?.set(c.id, c.guardada));
    dibujarRecientes();
  } catch (error) {
    if (pedido !== ultimoPedido) return;
    console.error(error);
    ui.errorInicio(() => cargarRecientes(true));
  }
}

function dibujarRecientes() {
  ui.mensajeInicio('');
  ui.mostrarRecientes(
    cartasRecientes,
    { misCartas: estado.misCartas, alCambiar: cambiarDesdeLista },
    'Todavía no tienes cartas. Busca un Pokémon y agrega a tu colección las que tengas.',
  );
}

// --- Mi colección ---------------------------------------------

async function cargarColeccion(reintento = false) {
  if (!estado.misCartas) {
    // Sin sesión se ve la invitación a entrar; si no cargaron las
    // cartas, el aviso de arriba ofrece Reintentar
    ui.mensajeColeccion(estado.cargandoSesion ? 'Cargando tu colección…' : '');
    return;
  }
  const pedido = ++ultimoPedido;
  const texto = textoColeccion;
  if (!reintento) ui.mensajeColeccion('Cargando tu colección…');

  try {
    const cartas = await estado.coleccion.listarColeccion(texto);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasColeccion = cartas;
    // Por si se agregaron cartas desde otra pestaña o dispositivo
    cartas.forEach((c) => estado.misCartas?.set(c.id, c.guardada));
    dibujarColeccion();
    completarFechasColeccion();
  } catch (error) {
    if (pedido !== ultimoPedido) return;
    console.error(error);
    ui.mostrarFiltrosCartas('#filtros-coleccion', null);
    ui.errorColeccion(() => cargarColeccion(true));
  }
}

/** #/coleccion?set=sv04&orden=numero */
function hashColeccion(filtros) {
  const params = String(filtrado.escribirFiltros(new URLSearchParams(), filtros, filtrado.COLECCION));
  return params ? `#/coleccion?${params}` : '#/coleccion';
}

function dibujarColeccion() {
  const total = cartasColeccion.length;
  const conFiltros = filtrado.hayFiltros(filtrosColeccion);
  const visibles = filtrado.ordenar(
    filtrado.filtrar(cartasColeccion, filtrosColeccion),
    filtrosColeccion.orden,
    filtrado.COLECCION,
  );
  let vacio = 'Aún no tienes cartas. Busca un Pokémon y agrega a tu colección las que tengas.';
  if (total && conFiltros) vacio = filtrado.VACIO_CON_FILTROS;
  else if (textoColeccion) vacio = `No tienes cartas de "${textoColeccion}".`;

  ui.mostrarFiltrosCartas(
    '#filtros-coleccion',
    total ? filtrado.datosFiltros(cartasColeccion, filtrosColeccion, filtrado.COLECCION) : null,
    cambiarFiltrosColeccion,
  );
  ui.mostrarColeccion(visibles, { misCartas: estado.misCartas, alCambiar: cambiarDesdeLista }, vacio);

  if (total === 0) {
    ui.mensajeColeccion('');
  } else {
    const cartas = total === 1 ? 'carta' : 'cartas';
    const cuantas = conFiltros ? `${visibles.length} de ${total}` : total;
    ui.mensajeColeccion(textoColeccion
      ? `${cuantas} ${cartas} de "${textoColeccion}"`
      : `${cuantas} ${cartas} en tu colección`);
  }
}

/** Expansión u orden desde los selects (null = "Limpiar filtros"). Igual que en Buscar. */
function cambiarFiltrosColeccion(cambio) {
  filtrosColeccion = cambio ? { ...filtrosColeccion, ...cambio } : { ...filtrosColeccion, set: '' };
  const destino = hashColeccion(filtrosColeccion);
  history.replaceState(null, '', destino);
  ui.actualizarEnlaces('coleccion', destino);
  dibujarColeccion();
  completarFechasColeccion();
}

/**
 * La colección no guarda la fecha de cada expansión: para ordenar por
 * fecha se toma de la lista de sets de TCGdex (un pedido por sesión,
 * el mismo que usan la búsqueda y los objetivos). Solo se pide si se
 * eligió ese orden; sin conexión, las cartas quedan agrupadas por set.
 */
async function completarFechasColeccion() {
  if (filtrosColeccion.orden !== 'fecha' || cartasColeccion.every((c) => c.fechaSet || !c.setId)) return;
  const cartas = cartasColeccion;
  try {
    const fechas = await fechasDeSets();
    cartas.forEach((c) => { c.fechaSet ||= fechas.get(c.setId) ?? ''; });
    if (cartas === cartasColeccion && estado.rutaActual === 'coleccion') dibujarColeccion();
  } catch (error) {
    console.error(error);
  }
}

/**
 * "Agregar a mi colección" desde Colección o Inicio. Sus cartas ya están
 * en tu colección (la tarjeta dice "En tu colección ✓"), así que casi
 * nunca se usa. Quitar se hace en el detalle: al cerrarlo, la carta
 * sale de estas listas (redibujar).
 */
async function cambiarDesdeLista(carta, tengo) {
  const mensaje = estado.rutaActual === 'inicio' ? ui.mensajeInicio : ui.mensajeColeccion;
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    mensaje('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    throw error; // la tarjeta vuelve a su estado anterior
  }
}

// Filtra mientras se escribe, esperando 300 ms de pausa para no
// consultar a Supabase en cada tecla
let esperaFiltro;

const formColeccion = document.querySelector('#form-coleccion');

/** Filtro por Pokémon de "Mi colección". */
export function preparar() {
  formColeccion.addEventListener('input', (e) => {
    clearTimeout(esperaFiltro);
    esperaFiltro = setTimeout(() => {
      textoColeccion = e.target.value.trim();
      cargarColeccion();
    }, 300);
  });

  formColeccion.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(esperaFiltro);
    textoColeccion = formColeccion.filtro.value.trim();
    cargarColeccion();
  });
}

/** Inicio: "Agregadas recientemente" ("Tu progreso" lo muestra objetivos.js). */
export function mostrarInicio() {
  cargarRecientes();
}

/** Pantalla Colección que pide la ruta (#/coleccion?set=…&orden=…). */
export function mostrarColeccion(params) {
  filtrosColeccion = filtrado.leerFiltros(params, filtrado.COLECCION);
  ui.actualizarEnlaces('coleccion', hashColeccion(filtrosColeccion));
  cargarColeccion();
}

/**
 * Tras cambios en misCartas (por ejemplo, al cerrar el detalle): las
 * cartas que ya no tengo salen de Colección e Inicio, y se vuelve a
 * dibujar la lista de la pantalla actual.
 */
export function redibujar() {
  cartasColeccion = cartasColeccion.filter((c) => estado.misCartas.has(c.id));
  cartasRecientes = cartasRecientes.filter((c) => estado.misCartas.has(c.id));
  if (estado.rutaActual === 'coleccion') dibujarColeccion();
  else if (estado.rutaActual === 'inicio') dibujarRecientes();
}

/** Al cerrar sesión: descarta cargas en curso y vacía las listas. */
export function olvidar() {
  ultimoPedido++; // descarta cargas de Supabase en curso
  cartasColeccion = [];
  cartasRecientes = [];
  textoColeccion = '';
  formColeccion.reset();
}
