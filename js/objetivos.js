// =============================================================
// Objetivos y progreso
// =============================================================
// Un objetivo es algo que el usuario sigue: un Pokémon (por número de
// Pokédex, así "Joltik" incluye "N's Joltik") o una expansión.
// Progreso = cartas que tengo de la lista de TCGdex / total de la lista
// (se cuentan cartas distintas, no copias). En expansiones, la barra
// usa el set base y debajo va el master set.
//
// Este módulo guarda los objetivos del usuario, calcula el progreso y
// maneja la pantalla #/progreso, la sección "Tu progreso" de Inicio,
// las sugerencias y los botones "Seguir". Lo que viene de main.js
// (colección, sesión) llega por preparar().
// =============================================================

import { cargarListasObjetivos, obtenerCartasObjetivo, olvidarLista, datosCartasGuardados, pedirDatosCartas } from './api.js';
import * as ui from './ui.js';
import * as filtrado from './filtros.js';

/**
 * @type {null | {
 *   misCartas: () => Map<string, object>|null,
 *   coleccion: () => object,
 *   guardarCambio: (carta: object, tengo: boolean) => Promise<void>,
 *   alCambiarObjetivos: () => void,
 * }}
 */
let dep = null;

let objetivos = null;     // del usuario (más reciente primero); null = sin sesión o sin cargar
let errorCarga = false;   // no se pudieron cargar los objetivos
let cargaActual = 0;      // descarta cargas de una sesión anterior
const listas = new Map(); // "tipo:clave" → { ids, base, fecha, noDisponible? }
const sinDatos = new Set(); // "tipo:clave" que no llegaron y no tienen lista guardada

let enDetalle = false;    // qué se ve en #/progreso: lista o detalle
let pedidoLista = 0;
let pedidoDetalle = 0;
let pedidoInicio = 0;
let detalle = null;       // { tipo, clave, nombre, cartas, filtro, noDisponible }

const OBJETIVOS_EN_INICIO = 3;
const MAX_SUGERENCIAS = 5;
const estadoSugerencias = new Map(); // "tipo:clave" → { ocupado?, mensaje? }
let pidiendoDatosCartas = false;
let enfocarLuego = null;  // href del objetivo recién seguido desde una sugerencia

const claveDe = (o) => `${o.tipo}:${o.clave}`;

// Formato válido de la clave (igual que en la base de datos)
const FORMATOS = { pokemon: /^[0-9]{1,4}$/, expansion: /^[A-Za-z0-9._-]{1,40}$/ };
const claveValida = (tipo, clave) => Object.hasOwn(FORMATOS, tipo) && FORMATOS[tipo].test(clave ?? '');

const FILTROS = {
  todas: () => true,
  tengo: (c) => dep.misCartas().has(c.id),
  falta: (c) => !dep.misCartas().has(c.id),
};
const VACIO_POR_FILTRO = {
  tengo: 'Todavía no tienes ninguna carta de este objetivo. Usa «Agregar a mi colección» en las que tengas.',
  falta: '¡La tienes completa! ⚡',
};
// Vista del detalle de un objetivo si la URL no dice otra (&ver=)
const VISTA_OBJETIVO = 'falta';

/** Conecta el módulo con main.js. */
export function preparar(dependencias) {
  dep = dependencias;
  // Radios: 'change' llega con clic, toque y flechas del teclado
  document.querySelector('#filtros-objetivo').addEventListener('change', (e) => {
    const radio = e.target.closest('[data-filtro]');
    if (!radio || !detalle?.cartas || radio.dataset.filtro === detalle.filtro) return;
    detalle.filtro = radio.dataset.filtro;
    // La vista va en la URL (&ver=todas, &ver=tengo; "Me falta" es la de
    // base): se mantiene al recargar y al volver. replaceState, como los filtros
    const ver = String(filtrado.escribirVista(new URLSearchParams(), detalle.filtro, VISTA_OBJETIVO));
    history.replaceState(null, '', ui.enlaceObjetivo(detalle) + (ver ? `&${ver}` : ''));
    dibujarCartasDetalle();
  });
}

// --- Datos -----------------------------------------------------

/** Carga los objetivos del usuario (al entrar o al reintentar). */
export async function cargar() {
  const carga = ++cargaActual;
  errorCarga = false;
  try {
    const lista = await dep.coleccion().listarObjetivos();
    if (carga !== cargaActual) return;
    objetivos = lista;
  } catch (error) {
    if (carga !== cargaActual) return;
    console.error(error);
    objetivos = null;
    errorCarga = true;
  }
  dep.alCambiarObjetivos();
}

/** Al cerrar sesión. */
export function olvidar() {
  cargaActual++;
  objetivos = null;
  errorCarga = false;
  detalle = null;
  estadoSugerencias.clear();
  enfocarLuego = null;
}

/** El objetivo que el usuario sigue con ese tipo y clave (o null). */
function buscarObjetivo(tipo, clave) {
  return objetivos?.find((o) => o.tipo === tipo && o.clave === clave) ?? null;
}

/**
 * Progreso de una lista: cartas que tengo / total.
 * Expansiones: principal = set base; master = todas.
 */
function progresoDeLista(lista) {
  if (lista.noDisponible) return { estado: 'no-disponible' };
  const mias = dep.misCartas();
  const contar = (ids) => ({ tengo: ids.filter((id) => mias?.has(id)).length, total: ids.length });
  const master = contar(lista.ids);
  if (lista.base?.length) return { principal: contar(lista.base), master };
  return { principal: master };
}

/** Progreso de un objetivo; null = calculando (su lista no llegó). */
function progresoDe(o) {
  const lista = listas.get(claveDe(o));
  if (lista) return progresoDeLista(lista);
  return sinDatos.has(claveDe(o)) ? { estado: 'sin-datos' } : null;
}

// --- Pantalla #/progreso ---------------------------------------

/** Muestra la lista o el detalle según la ruta (#/progreso?tipo=…&clave=…). */
export function mostrar(params) {
  const tipo = params.get('tipo');
  const clave = params.get('clave');
  if (tipo !== null || clave !== null) {
    if (!claveValida(tipo, clave)) {
      window.location.replace('#/progreso'); // enlace roto o editado a mano
      return;
    }
    enDetalle = true;
    ui.mostrarVistaProgreso(true);
    mostrarDetalle(tipo, clave, { ver: filtrado.leerVista(params, VISTA_OBJETIVO) });
    return;
  }
  enDetalle = false;
  ui.mostrarVistaProgreso(false);
  mostrarLista();
}

/** Vuelve a dibujar con misCartas (por ejemplo, al cerrar el detalle de una carta). */
export function redibujar() {
  if (enDetalle) {
    if (!detalle) return;
    dibujarCabecera();
    if (detalle.cartas) dibujarCartasDetalle();
  } else {
    if (objetivos?.length) dibujarLista();
    dibujarSugerenciasProgreso(); // las cantidades cambian al agregar o quitar cartas
  }
}

/** href a enfocar en esa pantalla (una sola vez), o null. */
function tomarFoco(pantalla) {
  if (enfocarLuego?.pantalla !== pantalla) return null;
  const { href } = enfocarLuego;
  enfocarLuego = null;
  return href;
}

function dibujarLista() {
  ui.mostrarObjetivos(
    objetivos.map((o) => ({ objetivo: o, progreso: progresoDe(o) })),
    { enfocar: tomarFoco('progreso') },
  );
}

async function mostrarLista({ forzar = false } = {}) {
  ui.avisoProgreso(null);
  limpiarMensajesSugerencias();
  dibujarSugerenciasProgreso(); // se ocultan mientras carga o si hay error
  if (!dep.misCartas()) {
    ui.mensajeProgreso('Cargando tu colección…');
    return;
  }
  if (errorCarga) {
    ui.errorProgreso(() => cargar());
    return;
  }
  if (!objetivos) {
    ui.mensajeProgreso('Cargando tus objetivos…');
    return;
  }
  completarDatosCartas();
  if (objetivos.length === 0) {
    ui.mostrarProgresoVacio();
    return;
  }

  const pedido = ++pedidoLista;
  const lista = objetivos;
  dibujarLista();
  if (!forzar) ui.mostrarPieProgreso(null);

  // Cada lista se dibuja apenas llega (primero las guardadas)
  const { fallidos } = await cargarListasObjetivos(lista, (o, datos) => {
    listas.set(claveDe(o), datos);
    sinDatos.delete(claveDe(o));
    if (pedido === pedidoLista && !enDetalle) dibujarLista();
  }, { forzar });
  if (pedido !== pedidoLista || enDetalle) return;

  const sinLista = fallidos.filter((o) => !listas.has(claveDe(o)));
  sinLista.forEach((o) => sinDatos.add(claveDe(o)));
  dibujarLista();
  ui.avisoProgreso(sinLista.length ? () => mostrarLista() : null);

  const fechas = lista.map((o) => listas.get(claveDe(o))?.fecha).filter(Boolean);
  ui.mostrarPieProgreso({
    fecha: fechas.length ? Math.min(...fechas) : null,
    sinConexion: fallidos.length > 0,
    alActualizar: () => mostrarLista({ forzar: true }),
  });
}

// --- Inicio: tu progreso ---------------------------------------

/** Al entrar a Inicio (o al cambiar los objetivos estando ahí). */
export function mostrarInicio() {
  limpiarMensajesSugerencias();
  dibujarInicio();
  if (!dep.misCartas() || !objetivos) return;
  if (objetivos.length === 0) {
    completarDatosCartas();
    return;
  }

  const pedido = ++pedidoInicio;
  const recientes = objetivos.slice(0, OBJETIVOS_EN_INICIO);
  // Mismas listas que Progreso (y la misma caché): cada una se dibuja al llegar
  cargarListasObjetivos(recientes, (o, datos) => {
    listas.set(claveDe(o), datos);
    sinDatos.delete(claveDe(o));
    if (pedido === pedidoInicio) dibujarInicio();
  }).then(({ fallidos }) => {
    fallidos.filter((o) => !listas.has(claveDe(o))).forEach((o) => sinDatos.add(claveDe(o)));
    if (pedido === pedidoInicio) dibujarInicio();
  });
}

/** Vuelve a dibujar "Tu progreso" con misCartas (tras cambios en la colección). */
export function redibujarInicio() {
  dibujarInicio();
}

function dibujarInicio() {
  if (!dep.misCartas()) {
    ui.mostrarInicioProgreso(null);
    return;
  }
  if (errorCarga) {
    ui.mostrarInicioProgreso({ alReintentar: () => cargar() });
    return;
  }
  if (!objetivos) {
    ui.mostrarInicioProgreso({ mensaje: 'Cargando tus objetivos…' });
    return;
  }
  if (objetivos.length) {
    ui.mostrarInicioProgreso({
      objetivos: objetivos.slice(0, OBJETIVOS_EN_INICIO).map((o) => ({ objetivo: o, progreso: progresoDe(o) })),
      enfocar: tomarFoco('inicio'),
    });
    return;
  }
  // No sigue nada: sugerencias. Sin cartas no hay sugerencias y la
  // sección no aparece (el estado vacío de Inicio ya invita a buscar).
  const items = itemsSugerencias();
  ui.mostrarInicioProgreso(items.length ? { sugerencias: items, alSeguir: (s) => seguirSugerencia(s, 'inicio') } : null);
}

// --- Sugerencias -----------------------------------------------
// Se arman con la colección: las expansiones por set_id (ya está en
// misCartas) y los Pokémon por dexId, que la colección no guarda: se
// pide a TCGdex por id de carta y queda guardado en el navegador
// (api.pedirDatosCartas). Se sugieren las que más cartas tienen y que
// aún no sigue.

/**
 * Hasta 5 sugerencias, de la que más cartas tiene a la que menos.
 * @returns {Array<{tipo: 'pokemon'|'expansion', clave: string, nombre: string, cantidad: number}>}
 */
function sugerencias() {
  const mias = dep.misCartas();
  if (!mias?.size || !objetivos) return [];
  const datos = datosCartasGuardados();
  const grupos = new Map();
  const sumar = (tipo, clave, nombre) => {
    const g = grupos.get(`${tipo}:${clave}`);
    if (!g) {
      grupos.set(`${tipo}:${clave}`, { tipo, clave, nombre, cantidad: 1 });
      return;
    }
    g.cantidad++;
    // Pokémon: el nombre más corto ("Joltik" antes que "N's Joltik" o "Pikachu V")
    if (nombre.length < g.nombre.length) g.nombre = nombre;
  };

  for (const [id, guardada] of mias) {
    if (guardada.setId && guardada.nombreSet) sumar('expansion', guardada.setId, guardada.nombreSet);
    // Cartas con varios Pokémon (Tag Team) no suman a ninguno
    const carta = datos.get(id);
    if (carta?.dex.length === 1 && carta.nombre) sumar('pokemon', String(carta.dex[0]), carta.nombre);
  }

  return [...grupos.values()]
    .filter((g) => claveValida(g.tipo, g.clave) && !buscarObjetivo(g.tipo, g.clave))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))
    .slice(0, MAX_SUGERENCIAS);
}

/** Sugerencias con su estado ("Guardando…", mensaje de error). */
function itemsSugerencias() {
  return sugerencias().map((s) => ({ ...s, ...estadoSugerencias.get(claveDe(s)) }));
}

/** Al volver a una pantalla, los mensajes de error anteriores se van. */
function limpiarMensajesSugerencias() {
  for (const [clave, estado] of estadoSugerencias) {
    if (!estado.ocupado) estadoSugerencias.delete(clave);
  }
}

function dibujarSugerenciasProgreso() {
  const listo = dep.misCartas() && objetivos;
  ui.mostrarSugerencias('#progreso-sugerencias', listo ? itemsSugerencias() : [], (s) => seguirSugerencia(s, 'progreso'), {
    titulo: 'Sugerencias',
    texto: 'Según las cartas que ya tienes.',
  });
}

function redibujarSugerencias() {
  dibujarSugerenciasProgreso();
  dibujarInicio();
}

/**
 * Pide a TCGdex el Pokémon de las cartas que aún no se conocen.
 * Solo al entrar a la pantalla (no al redibujar): sin conexión es un
 * pedido por visita, sin reintentos solos. Si falla, se sugieren
 * igual las expansiones y los Pokémon ya conocidos.
 */
async function completarDatosCartas() {
  const mias = dep.misCartas();
  if (!mias?.size || pidiendoDatosCartas) return;
  const carga = cargaActual;
  pidiendoDatosCartas = true;
  try {
    await pedirDatosCartas(mias.keys(), () => {
      if (carga === cargaActual) redibujarSugerencias();
    });
  } finally {
    pidiendoDatosCartas = false;
  }
}

/**
 * "Seguir" en una sugerencia: pasa a la lista sin recargar.
 * @param {object} s
 * @param {'progreso'|'inicio'} pantalla  donde se tocó
 */
async function seguirSugerencia(s, pantalla) {
  const clave = claveDe(s);
  const { MAX_OBJETIVOS } = dep.coleccion();
  const limite = `Llegaste al límite de ${MAX_OBJETIVOS} objetivos. Deja de seguir alguno para agregar otro.`;
  if (objetivos.length >= MAX_OBJETIVOS) {
    estadoSugerencias.set(clave, { mensaje: limite });
    redibujarSugerencias();
    return;
  }

  const carga = cargaActual;
  estadoSugerencias.set(clave, { ocupado: true });
  redibujarSugerencias();
  try {
    const nuevo = await dep.coleccion().seguirObjetivo(s);
    if (carga !== cargaActual) return; // cerró sesión mientras guardaba
    objetivos = [nuevo, ...objetivos.filter((o) => o.id !== nuevo.id)];
    estadoSugerencias.delete(clave);
    // La sugerencia desaparece: si tenía el foco (teclado), pasa al objetivo nuevo
    if (document.activeElement?.closest('[data-sugerencia]')) {
      enfocarLuego = { pantalla, href: ui.enlaceObjetivo(nuevo) };
    }
  } catch (error) {
    if (carga !== cargaActual) return;
    console.error(error);
    estadoSugerencias.set(clave, {
      mensaje: error.limite ? limite : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.',
    });
    redibujarSugerencias();
    return;
  }
  dep.alCambiarObjetivos();
}

// --- Detalle de un objetivo ------------------------------------

/** @param {{reintento?: boolean, ver?: 'todas'|'tengo'|'falta'}} [opciones]  ver: la vista de la URL */
async function mostrarDetalle(tipo, clave, { reintento = false, ver = null } = {}) {
  if (!dep.misCartas()) {
    ui.mensajeObjetivo('Cargando tu colección…');
    return;
  }
  const mismo = detalle?.tipo === tipo && detalle?.clave === clave;
  if (!mismo) {
    detalle = { tipo, clave, nombre: buscarObjetivo(tipo, clave)?.nombre ?? '', cartas: null, filtro: VISTA_OBJETIVO, noDisponible: false };
  }
  if (ver) detalle.filtro = ver; // la URL manda (al recargar o volver)
  dibujarCabecera();
  if (detalle.cartas) {
    dibujarCartasDetalle(); // ya estaban: no se vuelven a pedir
    return;
  }
  if (detalle.noDisponible) return;

  const pedido = ++pedidoDetalle;
  const d = detalle;
  if (!reintento) {
    ui.mensajeObjetivo('Cargando cartas…');
    ui.mostrarFiltros(null, 'falta', '#filtros-objetivo');
    ui.mostrarCartasObjetivo([], null, '');
  }
  try {
    const resultado = await obtenerCartasObjetivo({ tipo, clave });
    if (pedido !== pedidoDetalle || d !== detalle) return;
    if (!resultado) {
      d.noDisponible = true;
      listas.set(claveDe(d), { ids: [], base: null, fecha: Date.now(), noDisponible: true });
      dibujarCabecera();
      ui.mensajeObjetivo('Este objetivo ya no está disponible en TCGdex.');
      ui.mostrarCartasObjetivo([], null, '');
      return;
    }
    d.cartas = resultado.cartas;
    d.nombre ||= resultado.nombre;
    d.base = tipo === 'expansion' ? resultado.cartas.find((c) => c.totalSet)?.totalSet ?? null : null;
    listas.set(claveDe(d), resultado.lista);
    sinDatos.delete(claveDe(d));
    dibujarCabecera();
    dibujarCartasDetalle();
  } catch (error) {
    if (pedido !== pedidoDetalle || d !== detalle) return;
    console.error(error);
    ui.errorObjetivo(() => mostrarDetalle(tipo, clave, { reintento: true }));
  }
}

function dibujarCabecera() {
  const d = detalle;
  ui.mostrarCabeceraObjetivo({
    tipo: d.tipo,
    clave: d.clave,
    nombre: d.nombre,
    progreso: progresoDe(d),
    base: d.base ?? null,
  });
  mostrarSeguir('#objetivo-seguir', d.nombre ? { tipo: d.tipo, clave: d.clave, nombre: d.nombre } : null, { enlace: false });
}

function dibujarConteos() {
  const total = detalle.cartas.length;
  const tengo = detalle.cartas.filter(FILTROS.tengo).length;
  ui.mostrarFiltros({ todas: total, tengo, falta: total - tengo }, detalle.filtro, '#filtros-objetivo');
}

function dibujarCartasDetalle() {
  ui.mensajeObjetivo('');
  dibujarConteos();
  ui.mostrarCartasObjetivo(
    detalle.cartas.filter(FILTROS[detalle.filtro]),
    { misCartas: dep.misCartas(), alCambiar: cambiarDesdeObjetivo },
    VACIO_POR_FILTRO[detalle.filtro],
  );
}

/** "Agregar a mi colección" desde el detalle: la barra se actualiza al instante. */
async function cambiarDesdeObjetivo(carta, tengo) {
  try {
    await dep.guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    ui.mensajeObjetivo('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    throw error; // la tarjeta vuelve a su estado anterior
  }
  dibujarCabecera();
  dibujarConteos();
  // En "Me falta", la carta que agregué sale de la lista: solo esa
  // tarjeta, sin redibujar la grilla (el foco pasa a la siguiente)
  if (!FILTROS[detalle.filtro](carta) && ui.sacarDeGrilla('#grilla-objetivo', carta.id) === 0) dibujarCartasDetalle();
}

// --- Seguir ----------------------------------------------------

/**
 * Muestra "Seguir X" o "Siguiendo X ✓" en un contenedor.
 * Sin sesión, sin objetivos cargados o sin candidato, lo oculta.
 *
 * @param {string} selector
 * @param {null | {tipo: 'pokemon'|'expansion', clave: string, nombre: string}} candidato
 * @param {{enlace?: boolean}} [opciones]  enlace: agrega "Ver progreso"
 * @param {{ocupado?: boolean, mensaje?: string}} [extra]
 */
export function mostrarSeguir(selector, candidato, opciones = {}, extra = {}) {
  if (!candidato || !claveValida(candidato.tipo, candidato.clave) || !objetivos || !dep.misCartas()) {
    ui.mostrarSeguir(selector, null);
    return;
  }
  const actual = buscarObjetivo(candidato.tipo, candidato.clave);
  ui.mostrarSeguir(selector, {
    nombre: candidato.nombre,
    siguiendo: Boolean(actual),
    enlace: opciones.enlace === false ? null : ui.enlaceObjetivo(candidato),
    ...extra,
    alSeguir: () => seguir(selector, candidato, opciones),
    alDejar: () => dejarDeSeguir(selector, candidato, opciones),
  });
}

async function seguir(selector, candidato, opciones) {
  const { MAX_OBJETIVOS } = dep.coleccion();
  const limite = `Llegaste al límite de ${MAX_OBJETIVOS} objetivos. Deja de seguir alguno para agregar otro.`;
  if (objetivos.length >= MAX_OBJETIVOS) {
    mostrarSeguir(selector, candidato, opciones, { mensaje: limite });
    return;
  }
  mostrarSeguir(selector, candidato, opciones, { ocupado: true });
  try {
    const nuevo = await dep.coleccion().seguirObjetivo(candidato);
    objetivos = [nuevo, ...objetivos.filter((o) => o.id !== nuevo.id)];
  } catch (error) {
    console.error(error);
    mostrarSeguir(selector, candidato, opciones, {
      mensaje: error.limite ? limite : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.',
    });
    return;
  }
  mostrarSeguir(selector, candidato, opciones);
}

/** Dejar de seguir, sin confirmación: no borra nada de la colección. */
async function dejarDeSeguir(selector, candidato, opciones) {
  const actual = buscarObjetivo(candidato.tipo, candidato.clave);
  if (!actual) return;
  mostrarSeguir(selector, candidato, opciones, { ocupado: true });
  try {
    await dep.coleccion().dejarDeSeguir(actual.id);
    objetivos = objetivos.filter((o) => o.id !== actual.id);
    olvidarLista(actual); // si la vuelve a seguir, se pide de nuevo
  } catch (error) {
    console.error(error);
    mostrarSeguir(selector, candidato, opciones, { mensaje: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' });
    return;
  }
  mostrarSeguir(selector, candidato, opciones);
}

/**
 * Objetivo que se puede seguir desde una búsqueda: el Pokémon cuyo
 * nombre coincide EXACTO con lo buscado ("Joltik" sí; "jolt" no).
 * @returns {null | {tipo: 'pokemon', clave: string, nombre: string}}
 */
export function candidatoDeBusqueda(texto, cartas) {
  const buscado = texto.trim().toLowerCase();
  const exactas = cartas.filter((c) => c.nombre.toLowerCase() === buscado && c.dexIds?.length === 1);
  if (exactas.length === 0) return null;
  // El número de Pokédex más repetido entre las coincidencias exactas
  const cuenta = new Map();
  exactas.forEach((c) => cuenta.set(c.dexIds[0], (cuenta.get(c.dexIds[0]) ?? 0) + 1));
  const [dex] = [...cuenta].sort((a, b) => b[1] - a[1])[0];
  return { tipo: 'pokemon', clave: String(dex), nombre: exactas.find((c) => c.dexIds[0] === dex).nombre };
}

/** Objetivo que se puede seguir desde el detalle de una carta: su expansión. */
export function candidatoDeCarta(carta) {
  if (!carta.setId || !carta.nombreSet) return null;
  return { tipo: 'expansion', clave: carta.setId, nombre: carta.nombreSet };
}
