// =============================================================
// Colección y "Agregadas recientemente" (Inicio)
// =============================================================
// Las dos listas de tus cartas que vienen de Supabase. Comparten el
// descarte de respuestas viejas (ultimoPedido) y redibujar(), que saca
// de ambas las cartas que ya no tengo (quitar una carta se hace en el
// detalle). "Tu progreso" de Inicio es de objetivos.js.
// Colección se dibuja desde su caché (cache-coleccion.js) y se revalida
// en segundo plano; el filtro por Pokémon filtra esa lista, sin pedidos.
// =============================================================

import { datosDeSets } from './api.js';
import * as ui from './ui.js';
import * as filtrado from './filtros.js';
import * as cacheColeccion from './cache-coleccion.js';
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
    // Se actualiza el mismo objeto de misCartas (no se reemplaza): lo
    // comparten la caché de Colección y las tarjetas ya dibujadas
    cartas.forEach((c) => {
      const actual = estado.misCartas?.get(c.id);
      if (actual) c.guardada = Object.assign(actual, c.guardada);
      else estado.misCartas?.set(c.id, c.guardada);
    });
    dibujarRecientes();
    completarDatosSets(cartasRecientes);
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

let pedidoColeccion = 0;   // revalidaciones de Colección (descarta respuestas viejas)

/**
 * Muestra Colección: al instante desde la caché si la hay, y la pide a
 * Supabase solo si hace falta (primera vez, al volver a la pestaña, más
 * de 5 min o "Actualizar"). Con caché, el pedido va en segundo plano.
 */
function cargarColeccion({ forzar = false } = {}) {
  if (!estado.misCartas) {
    // Sin sesión se ve la invitación a entrar; si no cargaron las
    // cartas, el aviso de arriba ofrece Reintentar
    ui.mensajeColeccion(estado.cargandoSesion ? 'Cargando tu colección…' : '');
    ui.mostrarResumenColeccion(null);
    return;
  }
  const guardada = cacheColeccion.leer(estado.usuarioId);
  if (guardada) {
    cartasColeccion = ordenarPorNombre(cacheColeccion.cartas());
    dibujarColeccion();
    completarDatosSets(cartasColeccion);
    if (!forzar && !cacheColeccion.hayQueRevalidar()) return;
  } else {
    ui.mensajeColeccion('Cargando tu colección…');
  }
  revalidarColeccion({ enSegundoPlano: Boolean(guardada) });
}

/**
 * Pide la colección completa a Supabase y reemplaza la caché. En segundo
 * plano solo se redibuja si algo cambió (así no se pierde el foco) y, si
 * falla, se sigue mostrando lo guardado. Si mientras tanto hubo un
 * cambio propio, la respuesta ya es vieja y se descarta.
 */
async function revalidarColeccion({ enSegundoPlano }) {
  const pedido = ++pedidoColeccion;
  const version = cacheColeccion.version();
  ui.actualizandoColeccion(true);
  try {
    const cartas = await estado.coleccion.listarColeccion();
    if (pedido !== pedidoColeccion) return; // llegó una respuesta más nueva
    if (cacheColeccion.version() !== version) {
      cacheColeccion.marcarPorRevalidar();
      return;
    }
    const antes = firma(cartasColeccion);
    // Lo que ya se sabía del set (total y año) no se vuelve a pedir
    const conocidas = new Map(cartasColeccion.map((c) => [c.id, c]));
    cartas.forEach((c) => {
      c.totalSet ??= conocidas.get(c.id)?.totalSet ?? null;
      c.fechaSet ||= conocidas.get(c.id)?.fechaSet ?? '';
    });
    cacheColeccion.reemplazar(estado.usuarioId, cartas);
    cartasColeccion = ordenarPorNombre(cartas);
    // misCartas al día con lo de otro dispositivo o pestaña: también las
    // que se quitaron allá (se cambia el mismo Map: lo usan otras pantallas)
    const ids = new Set(cartas.map((c) => c.id));
    [...estado.misCartas.keys()].forEach((id) => { if (!ids.has(id)) estado.misCartas.delete(id); });
    cartas.forEach((c) => estado.misCartas.set(c.id, c.guardada));
    if (!enSegundoPlano || firma(cartasColeccion) !== antes) {
      if (estado.rutaActual === 'coleccion') dibujarColeccion();
    }
    completarDatosSets(cartasColeccion);
  } catch (error) {
    if (pedido !== pedidoColeccion) return;
    console.error(error);
    if (enSegundoPlano) return; // queda lo guardado; se revalida la próxima vez
    ui.mostrarFiltrosCartas('#filtros-coleccion', null, null, { resumen: '#filtros-coleccion-resumen' });
    ui.errorColeccion(() => cargarColeccion({ forzar: true }));
  } finally {
    if (pedido === pedidoColeccion) ui.actualizandoColeccion(false);
  }
}

/** Qué se ve de cada carta: si no cambió, no hace falta redibujar. */
const firma = (cartas) => cartas.map((c) => `${c.id}:${c.guardada?.copias}:${c.guardada?.acabados?.join('+')}:${c.guardada?.sello}`).join('|');

/**
 * Orden de base de Colección: por nombre y, con el mismo nombre, en el
 * orden en que llegaron (las agregadas en esta sesión, al final).
 */
const ordenarPorNombre = (cartas) => [...cartas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'en', { sensitivity: 'base' }));

/** #/coleccion?set=sv04&orden=numero */
function hashColeccion(filtros) {
  const params = String(filtrado.escribirFiltros(new URLSearchParams(), filtros, filtrado.COLECCION));
  return params ? `#/coleccion?${params}` : '#/coleccion';
}

function dibujarColeccion() {
  // El filtro por Pokémon ("joltik" también encuentra "N's Joltik") se
  // aplica aquí, sobre la lista guardada: sin pedidos a Supabase
  const texto = textoColeccion.toLowerCase();
  const delTexto = texto ? cartasColeccion.filter((c) => c.nombre.toLowerCase().includes(texto)) : cartasColeccion;
  const total = delTexto.length;
  const conFiltros = filtrado.hayFiltros(filtrosColeccion);
  const visibles = filtrado.ordenar(
    filtrado.filtrar(delTexto, filtrosColeccion),
    filtrosColeccion.orden,
    filtrado.COLECCION,
  );
  ui.mostrarResumenColeccion(cifrasColeccion());
  let vacio = 'Aún no tienes cartas. Busca un Pokémon y agrega a tu colección las que tengas.';
  if (total && conFiltros) vacio = filtrado.VACIO_CON_FILTROS;
  else if (textoColeccion) vacio = `No tienes cartas de "${textoColeccion}".`;

  ui.mostrarFiltrosCartas(
    '#filtros-coleccion',
    total ? filtrado.datosFiltros(delTexto, filtrosColeccion, filtrado.COLECCION) : null,
    cambiarFiltrosColeccion,
    { resumen: '#filtros-coleccion-resumen' },
  );
  ui.mostrarColeccion(visibles, { misCartas: estado.misCartas, alCambiar: cambiarDesdeLista }, vacio);

  // El total está en el resumen de arriba: aquí, solo lo filtrado
  if (total === 0 || (!conFiltros && !textoColeccion)) {
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
}

/**
 * La colección no guarda el total impreso ni la fecha de cada expansión
 * (B6): se toman de las listas de sets de TCGdex (pedidas una vez por
 * sesión, las mismas de la búsqueda), así la carta se ve "25/25 · 2021"
 * como en Buscar, y se puede ordenar por fecha. Quedan en la caché.
 * Sin conexión, la carta muestra solo su número.
 */
async function completarDatosSets(cartas) {
  if (cartas.every((c) => !c.setId || (c.fechaSet && c.totalSet != null))) return;
  try {
    const datos = await datosDeSets();
    let cambio = false;
    for (const c of cartas) {
      const d = datos.get(c.setId);
      if (!d) continue;
      if (!c.fechaSet && d.fecha) { c.fechaSet = d.fecha; cambio = true; }
      if (c.totalSet == null && d.total != null) { c.totalSet = d.total; cambio = true; }
    }
    if (!cambio) return;
    cacheColeccion.guardarDespues();
    if (cartas === cartasColeccion && estado.rutaActual === 'coleccion') dibujarColeccion();
    if (cartas === cartasRecientes && estado.rutaActual === 'inicio') dibujarRecientes();
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

// Filtra mientras se escribe, esperando 300 ms de pausa (la lista se
// redibuja entera; con muchas cartas, no en cada tecla)
let esperaFiltro;

const formColeccion = document.querySelector('#form-coleccion');

/** Filtro por Pokémon de "Mi colección", "Actualizar" y revalidar al volver. */
export function preparar() {
  formColeccion.addEventListener('input', (e) => {
    clearTimeout(esperaFiltro);
    esperaFiltro = setTimeout(() => {
      textoColeccion = e.target.value.trim();
      dibujarColeccion();
    }, 300);
  });

  formColeccion.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(esperaFiltro);
    textoColeccion = formColeccion.filtro.value.trim();
    dibujarColeccion();
  });

  ui.prepararActualizarColeccion(() => cargarColeccion({ forzar: true }));

  // Al volver a la pestaña, lo de otro dispositivo o pestaña pudo cambiar:
  // se revalida (ya, si se está en Colección). Al esconderla, se guarda
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cacheColeccion.persistir();
      return;
    }
    cacheColeccion.marcarPorRevalidar();
    if (estado.rutaActual === 'coleccion' && estado.misCartas) cargarColeccion();
  });
  window.addEventListener('pagehide', () => cacheColeccion.persistir());
}

/** Inicio: "Tu colección" y "Agregadas recientemente" ("Tu progreso" lo muestra objetivos.js). */
export function mostrarInicio() {
  dibujarResumen();
  cargarRecientes();
}

/**
 * Cifras de "Tu colección", de misCartas (sin pedir nada a Supabase):
 * cartas distintas, copias en total y expansiones con al menos una
 * carta. Las filas antiguas sin set_id cuentan por el nombre de su
 * expansión. Sin misCartas (cargando o sin conexión), "—".
 */
function dibujarResumen() {
  ui.mostrarResumenInicio(cifrasColeccion());
}

/** Cartas distintas, copias en total y expansiones (Inicio y Colección); null sin misCartas. */
function cifrasColeccion() {
  const cartas = estado.misCartas;
  if (!cartas) return null;
  let copias = 0;
  const expansiones = new Set();
  for (const c of cartas.values()) {
    copias += c.copias;
    if (c.setId || c.nombreSet) expansiones.add(c.setId || c.nombreSet);
  }
  return { cartas: cartas.size, copias, expansiones: expansiones.size };
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
  // La caché ya tiene lo agregado en otras pantallas (guardarCambio)
  const guardadas = cacheColeccion.leer(estado.usuarioId);
  cartasColeccion = guardadas ? ordenarPorNombre(cacheColeccion.cartas()) : cartasColeccion.filter((c) => estado.misCartas.has(c.id));
  cartasRecientes = cartasRecientes.filter((c) => estado.misCartas.has(c.id));
  if (estado.rutaActual === 'coleccion') {
    dibujarColeccion();
    completarDatosSets(cartasColeccion);
  }
  else if (estado.rutaActual === 'inicio') {
    dibujarResumen();
    dibujarRecientes();
  }
}

/** Al cerrar sesión: descarta cargas en curso y vacía las listas. */
export function olvidar() {
  ultimoPedido++; // descarta cargas de Supabase en curso
  pedidoColeccion++;
  cacheColeccion.borrar(); // privacidad: nada de la colección queda en el navegador
  cartasColeccion = [];
  cartasRecientes = [];
  textoColeccion = '';
  formColeccion.reset();
}
