// =============================================================
// Punto de entrada: conecta la API, el login, las rutas y la interfaz
// =============================================================
// La búsqueda y el login se inician por separado: si Supabase
// no carga (sin internet, CDN caído), la búsqueda de cartas
// sigue funcionando igual.
//
// Rutas en el hash (el sitio sigue siendo estático):
//   #/inicio   #/buscar?q=joltik   #/coleccion
//   #/progreso   #/progreso?tipo=pokemon&clave=595
// Solo cuentan los hashes que empiezan con "#/". Los que trae
// Supabase al volver del login (#access_token=…, #error=…) no son
// rutas: con token, el router espera a que Supabase lo lea. En
// cualquier otro caso arranca de inmediato, sin esperar a supabase-js.
// =============================================================

import { SUPABASE_URL } from './config.js';
import { buscarCartas, buscarPorNumero, obtenerCarta, fechasDeSets } from './api.js';
import * as ui from './ui.js';
import * as objetivos from './objetivos.js';
import * as filtrado from './filtros.js';

// --- Estado de la pantalla -----------------------------------

let cartasActuales = [];   // resultado de la última búsqueda
let busquedaActual = '';   // texto de esa búsqueda ('' = ninguna)
let avisoBusqueda = '';    // "No encontramos la expansión «…»" ('' = ninguno)
let busquedaEnCurso = null; // texto que se está buscando ahora
let pedidoBusqueda = 0;    // para descartar respuestas de búsquedas viejas
// Últimas búsquedas (texto → { cartas, demasiadas }): Atrás/Adelante no repiten la consulta
const busquedasGuardadas = new Map();
const MAX_BUSQUEDAS_GUARDADAS = 10;
let filtro = 'todas';      // pestaña activa: 'todas' | 'tengo' | 'falta'
// Expansión, rareza y orden (vienen de la URL): ver filtros.js
let filtrosBusqueda = filtrado.leerFiltros(new URLSearchParams(), filtrado.BUSCAR);
let filtrosColeccion = filtrado.leerFiltros(new URLSearchParams(), filtrado.COLECCION);
// Cartas que tengo: id de carta → { filaId, copias, setId, nombreSet }; null = sin sesión
let misCartas = null;
let coleccion = null;      // módulo coleccion.js (se carga junto con el login)
// Aún no se sabe si hay sesión (hay una guardada o se vuelve de Google),
// o ya llegó el usuario y faltan sus cartas: las pantallas privadas
// dicen "Cargando…" en vez de invitar a entrar.
let cargandoSesion = hayTokenEnUrl() || haySesionGuardada();

let cartasColeccion = [];  // lo que se ve en "Mi colección"
let textoColeccion = '';   // filtro por Pokémon de "Mi colección"
let cartasRecientes = [];  // "Agregadas recientemente" en Inicio
let ultimoPedido = 0;      // para descartar respuestas viejas de Supabase

let rutaActual = null;     // vista visible: 'inicio' | 'buscar' | 'coleccion' | 'progreso'
let pantallaActual = null; // como rutaActual, pero distingue la lista y el detalle de Progreso

// --- Resultados de búsqueda -----------------------------------

const FILTROS = {
  todas: () => true,
  tengo: (c) => misCartas.has(c.id),
  falta: (c) => !misCartas.has(c.id),
};

const VACIO_POR_FILTRO = {
  tengo: 'Todavía no tienes ninguna de estas cartas.',
  falta: '¡Tienes todas estas cartas!',
};

const VACIO_CON_FILTROS = 'Ninguna carta coincide con los filtros.';

/** Datos para los selects de filtros (Buscar y Colección). */
function datosFiltros(cartas, filtros, config) {
  return {
    sets: filtrado.opcionesSet(cartas, filtros),
    rarezas: config.conRareza ? filtrado.opcionesRareza(cartas, filtros) : null,
    ordenes: config.ordenes.map((valor) => ({ valor, texto: filtrado.NOMBRES_ORDEN[valor] })),
    filtros,
    hayFiltros: filtrado.hayFiltros(filtros),
  };
}

/** #/buscar?q=joltik&set=sv04&orden=numero */
function hashBuscar(texto, filtros) {
  if (!texto) return '#/buscar';
  return `#/buscar?${filtrado.escribirFiltros(new URLSearchParams({ q: texto }), filtros, filtrado.BUSCAR)}`;
}

/** Las cartas de la búsqueda con expansión, rareza y orden aplicados. */
function cartasBusquedaFiltradas() {
  const filtradas = filtrado.filtrar(cartasActuales, filtrosBusqueda);
  return filtrado.ordenar(filtradas, filtrosBusqueda.orden, filtrado.BUSCAR);
}

/** Dibuja la grilla de búsqueda según la sesión, los filtros y la pestaña activa. */
function dibujarBusqueda() {
  const visibles = cartasBusquedaFiltradas();
  const vacioFiltros = filtrado.hayFiltros(filtrosBusqueda) ? VACIO_CON_FILTROS : '';
  ui.mostrarFiltrosCartas(
    '#filtros-busqueda',
    cartasActuales.length ? datosFiltros(cartasActuales, filtrosBusqueda, filtrado.BUSCAR) : null,
    cambiarFiltrosBusqueda,
  );
  if (!misCartas) {
    ui.mostrarFiltros(null);
    ui.mostrarCartas(visibles, null, vacioFiltros);
  } else {
    actualizarConteos(visibles);
    ui.mostrarCartas(
      visibles.filter(FILTROS[filtro]),
      { misCartas, alCambiar: cambiarDesdeBusqueda },
      visibles.length ? VACIO_POR_FILTRO[filtro] : vacioFiltros,
    );
  }
  mostrarResumen(visibles);
  objetivos.mostrarSeguir('#seguir-busqueda', objetivos.candidatoDeBusqueda(busquedaActual, cartasActuales));
}

/** Expansión, rareza u orden desde los selects (null = "Limpiar filtros"). */
function cambiarFiltrosBusqueda(cambio) {
  filtrosBusqueda = cambio ? { ...filtrosBusqueda, ...cambio } : { ...filtrosBusqueda, set: '', rareza: '' };
  // replaceState: no agrega una entrada al historial por cada select
  // (Atrás sigue yendo a la pantalla anterior) ni dispara hashchange
  const destino = hashBuscar(busquedaActual, filtrosBusqueda);
  history.replaceState(null, '', destino);
  ui.actualizarEnlaces('buscar', destino);
  dibujarBusqueda();
}

/**
 * Actualiza los números de las pestañas sin redibujar las cartas.
 * Cuentan solo las cartas que pasan los filtros de expansión y rareza.
 */
function actualizarConteos(visibles = cartasBusquedaFiltradas()) {
  if (!misCartas || cartasActuales.length === 0) {
    ui.mostrarFiltros(null);
    return;
  }
  const total = visibles.length;
  const tengo = visibles.filter(FILTROS.tengo).length;
  ui.mostrarFiltros({ todas: total, tengo, falta: total - tengo }, filtro);
}

/**
 * "20 cartas encontradas para "Joltik"" o, con filtros, "5 de 20 cartas…".
 * Si el texto de expansión no coincidió: el aviso y la cantidad.
 */
function mostrarResumen(visibles = cartasBusquedaFiltradas()) {
  const total = cartasActuales.length;
  if (total === 0) return;
  const cuantas = filtrado.hayFiltros(filtrosBusqueda) && visibles.length !== total ? `${visibles.length} de ${total}` : total;
  if (avisoBusqueda) {
    ui.mensajeEstado(`${avisoBusqueda} (${cuantas} ${total === 1 ? 'carta' : 'cartas'}).`);
    return;
  }
  const texto = total === 1 ? 'carta encontrada' : 'cartas encontradas';
  ui.mensajeEstado(`${cuantas} ${texto} para "${busquedaActual}"`);
}

/** Guarda "Tengo" / "Me falta" en Supabase y en misCartas. */
async function guardarCambio(carta, tengo) {
  if (tengo) {
    const guardada = await coleccion.marcarTengo(carta);
    misCartas?.set(carta.id, guardada);
  } else {
    await coleccion.marcarMeFalta(carta.id);
    misCartas?.delete(carta.id);
  }
}

async function cambiarDesdeBusqueda(carta, tengo) {
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    ui.mensajeEstado('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    throw error; // la tarjeta vuelve a su estado anterior
  }
  mostrarResumen();
  // En "Todas" la carta se queda donde está; en "Tengo" o "Me falta" sale de la vista
  if (filtro === 'todas') actualizarConteos();
  else dibujarBusqueda();
}

// --- Búsqueda por número y expansión --------------------------
// "025" solo, "Pikachu 025" (nombre + número), "025/182" (número y
// total impreso en la carta) y, detrás, texto de expansión:
// "pikachu 025 wizards", "joltik phantom forces". Las consultas están
// en api.js; la expansión se filtra en el navegador (filtros.js).

const MAX_POR_NUMERO = 100;
// Sin número, cuántas palabras del final se prueban como expansión
// ("Wizards Black Star Promos" = 4; "HS trainer Kit (Raichu)" = 4)
const MAX_PALABRAS_EXPANSION = 5;

/**
 * Qué pide el texto del buscador. numero null = búsqueda por nombre.
 * Con número, lo de antes es el nombre y lo de después, la expansión.
 * "Porygon2" es un nombre: el número tiene que ir separado por un espacio.
 * @returns {{nombre: string, numero: number|null, textoNumero: string,
 *   total: number|null, expansion: string, base: string}}
 *   base: el texto sin la expansión ("pikachu 025")
 */
function leerBusqueda(texto) {
  const partes = texto.match(/^(?:(.*?)\s+)?#?(\d{1,3})(?:\s*\/\s*(\d{1,3}))?(?:\s+(.+))?$/);
  if (!partes) return { nombre: texto, numero: null, textoNumero: '', total: null, expansion: '', base: texto };
  const [, nombre = '', textoNumero, textoTotal, expansion = ''] = partes;
  return {
    nombre,
    numero: Number(textoNumero),
    textoNumero,
    total: textoTotal ? Number(textoTotal) : null,
    expansion,
    base: [nombre, textoTotal ? `${textoNumero}/${textoTotal}` : textoNumero].filter(Boolean).join(' '),
  };
}

/** "pikachu 025" → "Pikachu 025"; "n's joltik" → "N's Joltik" */
const conMayusculas = (texto) => texto.replace(/(^|\s)\S/g, (letra) => letra.toUpperCase());

/**
 * Aplica el texto de expansión a las cartas de la base (nombre y número).
 * Si coincide con alguna, sets: sus ids (main las pone en el select); si
 * no, se muestran todas con un aviso.
 */
function conExpansion(cartas, base, expansion) {
  if (cartas.length === 0) return { cartas };
  const sets = filtrado.setsQueCoinciden(cartas, expansion);
  if (sets.length) return { cartas, base, sets };
  return { cartas, aviso: `No encontramos la expansión «${expansion}»; mostramos todas las de ${conMayusculas(base)}` };
}

/**
 * Por nombre. Si el nombre completo no trae cartas, se prueban quitando
 * palabras del final como texto de expansión ("joltik phantom forces" →
 * "joltik phantom" + "forces", luego "joltik" + "phantom forces"). Un
 * pedido por intento; se detiene en el primero que trae cartas.
 */
async function consultarPorNombre(texto) {
  const cartas = await buscarCartas(texto);
  const palabras = texto.split(/\s+/);
  if (cartas.length || palabras.length < 2) return { cartas };
  for (let quitar = 1; quitar < palabras.length && quitar <= MAX_PALABRAS_EXPANSION; quitar++) {
    const nombre = palabras.slice(0, -quitar).join(' ');
    const deNombre = await buscarCartas(nombre);
    if (deNombre.length) return conExpansion(deNombre, nombre, palabras.slice(-quitar).join(' '));
  }
  return { cartas: [] };
}

/**
 * Hace la búsqueda que pide el texto.
 * demasiadas: un número solo con más de 100 cartas (no se muestran).
 * base y sets: el texto de expansión coincidió (se aplica como filtro).
 * aviso: el texto de expansión no coincidió con ninguna.
 * @returns {Promise<{cartas: Array, demasiadas?: boolean, base?: string, sets?: string[], aviso?: string}>}
 */
async function consultarBusqueda(texto) {
  const busqueda = leerBusqueda(texto);
  if (busqueda.numero === null) return consultarPorNombre(texto);

  const soloNumero = !busqueda.nombre && busqueda.total === null;
  // Del 1 al 99, cada número está en más de 100 cartas (25 → 149,
  // 60 → 127, 99 → 108; medido el 2026-09-28): se responde sin consultar
  if (soloNumero && busqueda.numero < 100) return { cartas: [], demasiadas: true };
  const cartas = await buscarPorNumero(busqueda);
  if (soloNumero && cartas.length > MAX_POR_NUMERO) return { cartas: [], demasiadas: true };
  return busqueda.expansion ? conExpansion(cartas, busqueda.base, busqueda.expansion) : { cartas };
}

/** Mensaje cuando la búsqueda no trae cartas, según lo que se buscó. */
function mensajeSinResultados(texto) {
  const { numero, nombre, total } = leerBusqueda(texto);
  if (numero === null) {
    return `No encontramos cartas de "${texto}". Revisa que el nombre esté en inglés (ej: Pikachu, Joltik, Charizard).`;
  }
  if (nombre) return `No encontramos "${texto}". Revisa que el nombre esté en inglés y el número (ej: Pikachu 025).`;
  if (total !== null) return `No encontramos la carta ${texto}. Revisa el número y el total impresos en la carta (ej: 025/182).`;
  return `No encontramos cartas con el número ${texto}.`;
}

/** Deja una búsqueda terminada en pantalla. */
function mostrarBusqueda(texto, { cartas, demasiadas = false, base = '', sets = [], aviso = '' }) {
  if (sets.length) {
    // El texto de expansión encontró su expansión: queda como filtro en
    // el select y en la URL, y la búsqueda como su base
    // ("pikachu 025 wizards" → q=pikachu 025&set=basep). Así se ve qué
    // se filtró, y "Limpiar filtros" muestra todas las de la base.
    filtrosBusqueda = { ...filtrosBusqueda, set: sets.join(',') };
    busquedasGuardadas.set(base, { cartas });
    texto = base;
    const destino = hashBuscar(texto, filtrosBusqueda);
    history.replaceState(null, '', destino);
    ui.actualizarEnlaces('buscar', destino);
    formBusqueda.pokemon.value = texto;
  }
  cartasActuales = cartas;
  busquedaActual = texto;
  avisoBusqueda = aviso;
  filtro = 'todas';

  if (demasiadas) {
    ui.mensajeEstado(
      `Hay demasiadas cartas con el número ${leerBusqueda(texto).textoNumero}. Agrega el total impreso o el nombre: prueba con 025/182 o Pikachu 025.`,
      'error',
    );
  } else if (cartas.length === 0) {
    ui.mensajeEstado(mensajeSinResultados(texto), 'error');
  }
  dibujarBusqueda();
}

/**
 * Muestra la búsqueda que pide la URL (#/buscar?q=…).
 * Si ya está en memoria solo la dibuja: volver a Buscar
 * (con Atrás, Adelante o desde la barra) no repite la consulta.
 */
async function buscarDesdeRuta(texto, reintento = false) {
  formBusqueda.pokemon.value = texto;
  ui.actualizarEnlaces('buscar', hashBuscar(texto, filtrosBusqueda));
  if (texto === busquedaEnCurso) return; // ya se está buscando

  const pedido = ++pedidoBusqueda;
  busquedaEnCurso = null;
  ui.buscando(false); // por si quedó a medias una búsqueda anterior

  if (texto === busquedaActual) {
    dibujarBusqueda(); // refleja lo marcado desde otras pantallas
    return;
  }
  if (busquedasGuardadas.has(texto)) {
    mostrarBusqueda(texto, busquedasGuardadas.get(texto));
    return;
  }

  cartasActuales = [];
  busquedaActual = '';
  avisoBusqueda = '';
  filtro = 'todas';
  // En un reintento queda a la vista "Reintentando…" hasta que responda
  if (!reintento) {
    ui.mensajeEstado(texto ? `Buscando cartas de ${texto}…` : '');
    dibujarBusqueda();
  }
  if (!texto) return;

  busquedaEnCurso = texto;
  ui.buscando(true);
  try {
    const resultado = await consultarBusqueda(texto);
    if (pedido !== pedidoBusqueda) return; // el usuario ya pidió otra cosa

    busquedasGuardadas.set(texto, resultado);
    if (busquedasGuardadas.size > MAX_BUSQUEDAS_GUARDADAS) {
      // Un Map recuerda el orden de llegada: la primera es la más antigua
      busquedasGuardadas.delete(busquedasGuardadas.keys().next().value);
    }
    mostrarBusqueda(texto, resultado);
  } catch (error) {
    if (pedido !== pedidoBusqueda) return;
    console.error(error);
    ui.errorBusqueda(() => buscarDesdeRuta(texto, true));
  } finally {
    if (pedido === pedidoBusqueda) {
      busquedaEnCurso = null;
      ui.buscando(false);
    }
  }
}

// Buscar solo cambia la URL; la búsqueda la hace la ruta.
// Así Atrás, Adelante y recargar mantienen los resultados.
const formBusqueda = document.querySelector('#form-busqueda');

formBusqueda.addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = formBusqueda.pokemon.value.trim();
  if (!texto) return;

  // Una búsqueda nueva parte sin filtros ni orden
  const destino = hashBuscar(texto, filtrado.leerFiltros(new URLSearchParams(), filtrado.BUSCAR));
  // Misma URL: no habrá hashchange, así que se llama directo
  if (window.location.hash === destino) buscarDesdeRuta(texto);
  else window.location.hash = destino;
});

document.querySelector('#filtros').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-filtro]');
  if (!boton || boton.dataset.filtro === filtro) return;
  filtro = boton.dataset.filtro;
  dibujarBusqueda();
});

ui.prepararSelectorTema();

// --- Inicio: agregadas recientemente --------------------------

const CANTIDAD_RECIENTES = 6;

async function cargarRecientes(reintento = false) {
  if (!misCartas) {
    // Sin sesión, Inicio solo muestra la presentación; si no cargaron
    // las cartas, el aviso de arriba ofrece Reintentar
    ui.mensajeInicio(cargandoSesion ? 'Cargando tus cartas…' : '');
    return;
  }
  const pedido = ++ultimoPedido;
  if (!reintento) ui.mensajeInicio('Cargando tus cartas…');

  try {
    const cartas = await coleccion.listarRecientes(CANTIDAD_RECIENTES);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasRecientes = cartas;
    cartas.forEach((c) => misCartas?.set(c.id, c.guardada));
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
    { misCartas, alCambiar: cambiarDesdeLista },
    'Todavía no tienes cartas. Busca un Pokémon y marca las que tengas.',
  );
}

// --- Mi colección ---------------------------------------------

async function cargarColeccion(reintento = false) {
  if (!misCartas) {
    // Sin sesión se ve la invitación a entrar; si no cargaron las
    // cartas, el aviso de arriba ofrece Reintentar
    ui.mensajeColeccion(cargandoSesion ? 'Cargando tu colección…' : '');
    return;
  }
  const pedido = ++ultimoPedido;
  const texto = textoColeccion;
  if (!reintento) ui.mensajeColeccion('Cargando tu colección…');

  try {
    const cartas = await coleccion.listarColeccion(texto);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasColeccion = cartas;
    // Por si se agregaron cartas desde otra pestaña o dispositivo
    cartas.forEach((c) => misCartas?.set(c.id, c.guardada));
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
  let vacio = 'Aún no tienes cartas. Busca un Pokémon y marca las que tengas.';
  if (total && conFiltros) vacio = VACIO_CON_FILTROS;
  else if (textoColeccion) vacio = `No tienes cartas de "${textoColeccion}".`;

  ui.mostrarFiltrosCartas(
    '#filtros-coleccion',
    total ? datosFiltros(cartasColeccion, filtrosColeccion, filtrado.COLECCION) : null,
    cambiarFiltrosColeccion,
  );
  ui.mostrarColeccion(visibles, { misCartas, alCambiar: cambiarDesdeLista }, vacio);

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
    if (cartas === cartasColeccion && rutaActual === 'coleccion') dibujarColeccion();
  } catch (error) {
    console.error(error);
  }
}

/** Marcar desde Colección o Inicio: "Me falta" quita la carta de esas listas. */
async function cambiarDesdeLista(carta, tengo) {
  const mensaje = rutaActual === 'inicio' ? ui.mensajeInicio : ui.mensajeColeccion;
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    mensaje('No se pudo quitar la carta. Inténtalo de nuevo.', 'error');
    throw error;
  }
  if (!tengo) {
    cartasColeccion = cartasColeccion.filter((c) => c.id !== carta.id);
    cartasRecientes = cartasRecientes.filter((c) => c.id !== carta.id);
    if (rutaActual === 'inicio') {
      dibujarRecientes();
      objetivos.redibujarInicio(); // la carta ya no cuenta en "Tu progreso"
    } else {
      dibujarColeccion();
    }
  }
}

// Filtra mientras se escribe, esperando 300 ms de pausa para no
// consultar a Supabase en cada tecla
let esperaFiltro;
const formColeccion = document.querySelector('#form-coleccion');

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

// --- Detalle de carta: "Tus copias" ----------------------------
// Cada cambio se ve al instante y se revierte si Supabase falla,
// igual que Tengo / Me falta en las tarjetas.

/** Copia que se muestra pero aún no existe en la base. */
const copiaSinGuardar = () => ({ id: null, idioma: null, condicion: null });

let detalle = null; // { carta, copias, cambio, cerrado } de la carta abierta

function abrirDetalle(carta) {
  const d = { carta, copias: null, cambio: false, cerrado: false };
  detalle = d;
  ui.abrirDetalle(carta);
  objetivos.mostrarSeguir('#detalle-seguir', objetivos.candidatoDeCarta(carta));
  completarDatos(d);
  if (misCartas) cargarCopias(d);
}

/** La colección no guarda la rareza: se pide a la API al abrir el detalle. */
async function completarDatos(d) {
  if (d.carta.rareza) return;
  try {
    const completa = await obtenerCarta(d.carta.id);
    if (d !== detalle || !completa) return;
    d.carta = { ...d.carta, rareza: completa.rareza, totalSet: d.carta.totalSet ?? completa.totalSet };
    ui.mostrarDatosDetalle(d.carta);
  } catch (error) {
    console.error(error); // sin rareza, el resto del detalle sirve igual
  }
}

/**
 * Una carta guardada sin copias (marcada con la versión anterior de
 * la app, entre la migración y el deploy) cuenta como 1 copia. Esa
 * copia se crea de verdad en el primer cambio.
 */
function conCopiaImplicita(copias) {
  return copias.length ? copias : [copiaSinGuardar()];
}

async function cargarCopias(d) {
  const guardada = misCartas.get(d.carta.id);
  if (!guardada) {
    d.copias = [];
    ui.mostrarCopias(d.copias);
    return;
  }
  try {
    const copias = await coleccion.listarCopias(guardada.filaId);
    if (d !== detalle) return;
    d.copias = conCopiaImplicita(copias);
    ui.mostrarCopias(d.copias);
  } catch (error) {
    if (d !== detalle) return;
    console.error(error);
    ui.errorCopias(() => cargarCopias(d));
  }
}

/**
 * Aplica un cambio en "Tus copias".
 * @param {Array} nuevas  las copias como deben quedar
 * @param {() => Promise<Array|void>} guardar  lo guarda en Supabase; si
 *   devuelve un arreglo, son las copias con sus ids reales
 */
async function cambiarCopias(nuevas, guardar) {
  const d = detalle;
  const antes = d.copias;
  d.copias = nuevas;
  ui.mensajeDetalle('');
  ui.mostrarCopias(d.copias, true);

  try {
    d.copias = (await guardar()) ?? nuevas;
    d.cambio = true;
    const guardada = misCartas?.get(d.carta.id);
    if (guardada) guardada.copias = d.copias.length;
    if (d.cerrado) redibujarPantalla(); // se cerró mientras guardaba
  } catch (error) {
    console.error(error);
    d.copias = antes;
    if (d === detalle) ui.mensajeDetalle('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
  }
  if (d === detalle && !d.cerrado) ui.mostrarCopias(d.copias);
}

/** "+": agrega una copia sin detalles (con 0 copias, es "Tengo"). */
function sumarCopia() {
  const d = detalle;
  const guardada = misCartas.get(d.carta.id);
  const nuevas = [...d.copias, copiaSinGuardar()];

  cambiarCopias(nuevas, async () => {
    if (!guardada) {
      await guardarCambio(d.carta, true);
      try {
        return conCopiaImplicita(await coleccion.listarCopias(misCartas.get(d.carta.id).filaId));
      } catch (error) {
        // La carta ya quedó guardada: no se revierte por no poder listar
        console.error(error);
        return [copiaSinGuardar()];
      }
    }
    // Se crea la nueva y, si la había, la copia implícita de una fila antigua
    const sinGuardar = nuevas.filter((c) => c.id === null).length;
    const creadas = await coleccion.agregarCopias(guardada.filaId, sinGuardar);
    return [...nuevas.filter((c) => c.id !== null), ...creadas];
  });
}

/** Quita una copia. Quitar la última es "Me falta". */
function quitarCopia(copia) {
  const d = detalle;
  const nuevas = d.copias.filter((c) => c !== copia);

  if (nuevas.length === 0) {
    cambiarCopias([], async () => {
      await guardarCambio(d.carta, false);
      return [];
    });
    return;
  }
  cambiarCopias(nuevas, () => coleccion.quitarCopia(copia.id));
}

/** Cambia idioma o condición de una copia (valor null = sin indicar). */
function cambiarDatoCopia(copia, campo, valor) {
  const d = detalle;
  const editada = { ...copia, [campo]: valor };
  const nuevas = d.copias.map((c) => (c === copia ? editada : c));

  cambiarCopias(nuevas, async () => {
    if (copia.id !== null) {
      await coleccion.actualizarCopia(copia.id, { [campo]: valor });
      return undefined;
    }
    // Copia implícita de una fila antigua: se crea ahora, ya con el dato
    const [creada] = await coleccion.agregarCopias(misCartas.get(d.carta.id).filaId, 1, { [campo]: valor });
    return nuevas.map((c) => (c === editada ? creada : c));
  });
}

/** Al cerrar: si algo cambió, se redibuja la pantalla (×N, Tengo / Me falta). */
function alCerrarDetalle() {
  const d = detalle;
  if (!d) return;
  d.cerrado = true;
  if (d.cambio) redibujarPantalla();
  ui.enfocarCarta(d.carta.id);
}

/** Vuelve a dibujar las cartas de la pantalla actual con misCartas. */
function redibujarPantalla() {
  if (rutaActual === 'buscar') {
    dibujarBusqueda();
    return;
  }
  if (!misCartas) return;
  // Las cartas que ya no tengo salen de Colección e Inicio
  cartasColeccion = cartasColeccion.filter((c) => misCartas.has(c.id));
  cartasRecientes = cartasRecientes.filter((c) => misCartas.has(c.id));
  if (rutaActual === 'coleccion') dibujarColeccion();
  else if (rutaActual === 'inicio') {
    dibujarRecientes();
    objetivos.redibujarInicio();
  } else if (rutaActual === 'progreso') objetivos.redibujar();
}

objetivos.preparar({
  misCartas: () => misCartas,
  coleccion: () => coleccion,
  guardarCambio,
  // Al cargar los objetivos (o reintentar, o seguir una sugerencia):
  // se actualiza lo que los usa
  alCambiarObjetivos: () => {
    if (rutaActual === 'progreso') mostrarRuta();
    else if (rutaActual === 'buscar') dibujarBusqueda();
    else if (rutaActual === 'inicio') objetivos.mostrarInicio();
    if (detalle && !detalle.cerrado) {
      objetivos.mostrarSeguir('#detalle-seguir', objetivos.candidatoDeCarta(detalle.carta));
    }
  },
});

ui.prepararConfirmacion();
ui.prepararDetalle({
  alAbrir: abrirDetalle,
  alCerrar: alCerrarDetalle,
  alSumar: sumarCopia,
  alRestar: () => quitarCopia(detalle.copias.at(-1)),
  alCambiar: cambiarDatoCopia,
  alQuitar: quitarCopia,
});

// --- Rutas ----------------------------------------------------

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

/** Lee el hash: { vista, params }, o null si no es una ruta ("#/…"). */
function leerRuta() {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return null;
  const [camino, consulta = ''] = hash.slice(2).split('?');
  return { vista: camino, params: new URLSearchParams(consulta) };
}

/** Muestra la pantalla que pide la URL. */
function mostrarRuta() {
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
  rutaActual = vista;
  pantallaActual = pantalla;

  ui.mostrarVista(vista, TITULOS[vista]);
  if (vista === 'inicio') {
    cargarRecientes();
    objetivos.mostrarInicio();
  } else if (vista === 'coleccion') {
    filtrosColeccion = filtrado.leerFiltros(params, filtrado.COLECCION);
    ui.actualizarEnlaces('coleccion', hashColeccion(filtrosColeccion));
    cargarColeccion();
  } else if (vista === 'progreso') {
    objetivos.mostrar(params);
  } else {
    filtrosBusqueda = filtrado.leerFiltros(params, filtrado.BUSCAR);
    buscarDesdeRuta(params.get('q')?.trim() ?? '');
  }

  // En la carga inicial el foco queda donde lo pone el navegador
  if (pantallaNueva && !primeraVez) ui.enfocarTitulo(vista);
}

/** ¿La URL trae el token de la vuelta de Google (#access_token=…)? */
function hayTokenEnUrl() {
  // Como parámetro, para no confundirlo con "#/buscar?q=access_token"
  return new URLSearchParams(window.location.hash.slice(1)).has('access_token');
}

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

/**
 * Arranca el router una sola vez: al cargar la página, o tras el
 * primer aviso de sesión si se vuelve de Google con el token.
 */
function iniciarRouter() {
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
function actualizarPantalla() {
  if (routerIniciado) mostrarRuta();
  else iniciarRouter();
}

/** Guarda la ruta actual para volver a ella después de Google. */
function guardarRutaParaVolver() {
  if (!leerRuta()) return;
  try {
    sessionStorage.setItem(CLAVE_RUTA_LOGIN, window.location.hash);
  } catch {
    // Sin almacenamiento: al volver se irá a Inicio
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
if (cargandoSesion) ui.mostrarSesionPendiente();
if (hayTokenEnUrl()) ui.mensajeLogin('Entrando con Google…');
iniciarRouter(); // con token en la URL espera al primer aviso de sesión

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  cargandoSesion = false;
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
  coleccion = modColeccion;

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
      if (!usuario) cargandoSesion = false;
      iniciarRouter();
      return;
    }
    usuarioId = nuevoId;

    if (!usuario) {
      cargandoSesion = false;
      misCartas = null;
      objetivos.olvidar();
      ui.cerrarDetalle();
      ui.mostrarAvisoConexion(null);
      ultimoPedido++; // descarta cargas de Supabase en curso
      cartasColeccion = [];
      cartasRecientes = [];
      textoColeccion = '';
      formColeccion.reset();
      actualizarPantalla();
      return;
    }

    // Mientras llegan sus cartas, las pantallas privadas dicen "Cargando…"
    cargandoSesion = true;
    actualizarPantalla();

    // setTimeout: Supabase recomienda no llamar a la base de datos
    // dentro de este aviso, porque puede quedar bloqueado.
    setTimeout(() => cargarMisCartasDe(nuevoId), 0);
  });

  /** Carga las cartas del usuario; sin conexión, un intento y "Reintentar". */
  async function cargarMisCartasDe(id) {
    try {
      const cartas = await coleccion.cargarMisCartas();
      if (usuarioId !== id) return; // salió mientras cargaba
      misCartas = cartas;
      ui.mostrarAvisoConexion(null);
      objetivos.cargar(); // aparte: si falla, la colección igual funciona
    } catch (error) {
      console.error(error);
      if (usuarioId !== id) return;
      ui.mostrarAvisoConexion(() => cargarMisCartasDe(id));
    }
    cargandoSesion = false;
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
