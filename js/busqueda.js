// =============================================================
// Pantalla Buscar
// =============================================================
// Búsqueda por nombre, número y expansión (#/buscar?q=…), sus filtros,
// la vista Todas / Tengo / Me falta (en la URL) y el resumen. Buscar solo cambia
// la URL: la consulta la hace la ruta (router.js llama a mostrar()).
// =============================================================

import { buscarCartas, buscarPorNumero } from './api.js';
import * as ui from './ui.js';
import * as objetivos from './objetivos.js';
import * as filtrado from './filtros.js';
import { estado, guardarCambio } from './estado.js';

let cartasActuales = [];   // resultado de la última búsqueda

let busquedaActual = '';   // texto de esa búsqueda ('' = ninguna)

let avisoBusqueda = '';    // "No encontramos la expansión «…»" ('' = ninguno)

let busquedaEnCurso = null; // texto que se está buscando ahora

let pedidoBusqueda = 0;    // para descartar respuestas de búsquedas viejas

// Últimas búsquedas (texto → { cartas, demasiadas }): Atrás/Adelante no repiten la consulta
const busquedasGuardadas = new Map();

const MAX_BUSQUEDAS_GUARDADAS = 10;

let filtro = 'todas';      // vista: 'todas' | 'tengo' | 'falta' (en la URL: &ver=)

// Expansión, rareza y orden (vienen de la URL): ver filtros.js
let filtrosBusqueda = filtrado.leerFiltros(new URLSearchParams(), filtrado.BUSCAR);

// --- Resultados de búsqueda -----------------------------------

const FILTROS = {
  todas: () => true,
  tengo: (c) => estado.misCartas.has(c.id),
  falta: (c) => !estado.misCartas.has(c.id),
};

const VACIO_POR_FILTRO = {
  tengo: 'Todavía no tienes ninguna de estas cartas. Usa «Agregar a mi colección» en las que tengas.',
  falta: '¡Ya las tienes todas!',
};

/** #/buscar?q=joltik&set=sv04&orden=numero&ver=falta */
function hashBuscar(texto, filtros, ver = filtro) {
  if (!texto) return '#/buscar';
  const params = filtrado.escribirFiltros(new URLSearchParams({ q: texto }), filtros, filtrado.BUSCAR);
  return `#/buscar?${filtrado.escribirVista(params, ver, 'todas')}`;
}

/** Las cartas de la búsqueda con expansión, rareza y orden aplicados. */
function cartasBusquedaFiltradas() {
  const filtradas = filtrado.filtrar(cartasActuales, filtrosBusqueda);
  return filtrado.ordenar(filtradas, filtrosBusqueda.orden, filtrado.BUSCAR);
}

/** Dibuja la grilla de búsqueda según la sesión, los filtros y la pestaña activa. */
export function dibujarBusqueda() {
  const visibles = cartasBusquedaFiltradas();
  const vacioFiltros = filtrado.hayFiltros(filtrosBusqueda) ? filtrado.VACIO_CON_FILTROS : '';
  ui.mostrarFiltrosCartas(
    '#filtros-busqueda',
    cartasActuales.length ? filtrado.datosFiltros(cartasActuales, filtrosBusqueda, filtrado.BUSCAR) : null,
    cambiarFiltrosBusqueda,
    { resumen: '#filtros-busqueda-resumen' },
  );
  if (!estado.misCartas) {
    ui.mostrarFiltros(null);
    ui.mostrarCartas(visibles, null, vacioFiltros);
  } else {
    actualizarConteos(visibles);
    ui.mostrarCartas(
      visibles.filter(FILTROS[filtro]),
      { misCartas: estado.misCartas, alCambiar: cambiarDesdeBusqueda },
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
  if (!estado.misCartas || cartasActuales.length === 0) {
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

async function cambiarDesdeBusqueda(carta, tengo) {
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    ui.mensajeEstado('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    throw error; // la tarjeta vuelve a su estado anterior
  }
  mostrarResumen();
  actualizarConteos();
  // En "Me falta", la carta que agregué sale de la lista: solo esa
  // tarjeta, sin redibujar la grilla (el foco pasa a la siguiente)
  if (!FILTROS[filtro](carta) && ui.sacarDeGrilla('#grilla', carta.id) === 0) dibujarBusqueda();
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
 * Si coincide con alguna, sets: sus ids (mostrarBusqueda las pone en el select); si
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
    dibujarBusqueda(); // refleja lo agregado o quitado desde otras pantallas
    return;
  }
  if (busquedasGuardadas.has(texto)) {
    mostrarBusqueda(texto, busquedasGuardadas.get(texto));
    return;
  }

  cartasActuales = [];
  busquedaActual = '';
  avisoBusqueda = '';
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

    // Sin cartas no se guarda: si fue TCGdex fallando por un momento, al
    // volver a esta búsqueda se pregunta de nuevo
    if (resultado.cartas.length) busquedasGuardadas.set(texto, resultado);
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

/** Formulario de búsqueda y vista Todas / Tengo / Me falta. */
export function preparar() {
  formBusqueda.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = formBusqueda.pokemon.value.trim();
    if (!texto) return;

    // Una búsqueda nueva parte sin filtros ni orden
    const destino = hashBuscar(texto, filtrado.leerFiltros(new URLSearchParams(), filtrado.BUSCAR), 'todas');
    // Misma URL: no habrá hashchange, así que se llama directo
    if (window.location.hash === destino) buscarDesdeRuta(texto);
    else window.location.hash = destino;
  });

  // Radios: 'change' llega con clic, toque y flechas del teclado
  document.querySelector('#filtros').addEventListener('change', (e) => {
    const radio = e.target.closest('[data-filtro]');
    if (!radio || radio.dataset.filtro === filtro) return;
    filtro = radio.dataset.filtro;
    // Igual que los selects: replaceState, sin una entrada de historial por clic
    const destino = hashBuscar(busquedaActual, filtrosBusqueda);
    history.replaceState(null, '', destino);
    ui.actualizarEnlaces('buscar', destino);
    dibujarBusqueda();
  });
}

/** Muestra la pantalla Buscar que pide la ruta (#/buscar?q=…&set=…&ver=…). */
export function mostrar(params) {
  filtrosBusqueda = filtrado.leerFiltros(params, filtrado.BUSCAR);
  filtro = filtrado.leerVista(params, 'todas');
  buscarDesdeRuta(params.get('q')?.trim() ?? '');
}
