// =============================================================
// Interfaz: filtros de cartas
// =============================================================
// Vista Todas / Tengo / Me falta (Buscar y detalle de un objetivo:
// radios btn-check en un btn-group) y los selects de expansión, rareza y orden (Buscar y
// Colección; en Buscar, en móvil, dentro de una hoja inferior). Qué
// filtra cada uno lo decide filtros.js (sin "ui/").
// =============================================================

import { $ } from './base.js';
import { abrirBurbuja, cerrarBurbuja, prepararBurbuja } from '../animaciones.js';

/**
 * Pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)" y, debajo, el
 * conteo de la vista elegida ("Te faltan 12", "Tienes 3").
 * Con conteos = null se ocultan (sin sesión o sin resultados).
 *
 * @param {null | {todas: number, tengo: number, falta: number}} conteos
 * @param {'todas'|'tengo'|'falta'} activo
 * @param {string} [selector]  grupo de pestañas (Buscar o detalle de un
 *   objetivo); el conteo va en el elemento `${selector}-conteo`
 */
export function mostrarFiltros(conteos, activo = 'todas', selector = '#filtros') {
  const filtros = $(selector);
  const conteo = $(`${selector}-conteo`);
  filtros.hidden = !conteos;
  conteo.hidden = !conteos || activo === 'todas' || conteos[activo] === 0;
  if (!conteos) return;

  const nombres = { todas: 'Todas', tengo: 'Tengo', falta: 'Me falta' };
  filtros.querySelectorAll('[data-filtro]').forEach((radio) => {
    const clave = radio.dataset.filtro;
    filtros.querySelector(`label[for="${radio.id}"]`).textContent = `${nombres[clave]} (${conteos[clave]})`;
    radio.checked = clave === activo;
  });
  // Con 0 no se muestra: lo dice el estado vacío de la grilla
  const n = conteos[activo];
  const textos = {
    falta: n === 1 ? 'Te falta 1' : `Te faltan ${n}`,
    tengo: n === 1 ? 'Tienes 1' : `Tienes ${n}`,
  };
  conteo.textContent = conteo.hidden ? '' : textos[activo];
}

// --- Filtros de cartas (Buscar y Colección) -------------------

/**
 * Selects de expansión, rareza y orden, y "Limpiar filtros" si hay
 * alguno activo. Se redibujan con cada cambio (las cantidades dependen
 * de los demás filtros); el foco vuelve al mismo control.
 *
 * @param {string} selector
 * @param {null | {
 *   sets: Array<{valor: string, texto: string, cantidad: number}>,
 *   rarezas: null | Array<{valor: string, texto: string, cantidad: number}>,
 *   ordenes: Array<{valor: string, texto: string}>,
 *   filtros: {set: string, rareza: string, orden: string},
 *   hayFiltros: boolean,
 * }} datos  null los oculta (sin cartas). rarezas null: sin ese select
 * @param {(cambio: null | {set?: string, rareza?: string, orden?: string}) => void} alCambiar
 *   null = "Limpiar filtros"
 * @param {{resumen?: string}} [opciones]  resumen: contenedor del botón
 *   "Filtros (N)" y las insignias de móvil (sin él, los selects se ven
 *   siempre en la página)
 */
export function mostrarFiltrosCartas(selector, datos, alCambiar, { resumen = null } = {}) {
  if (resumen) mostrarResumenFiltros(resumen, selector, datos, alCambiar);
  const caja = $(selector);
  const enfocado = caja.contains(document.activeElement) ? document.activeElement.dataset.campo : null;
  caja.hidden = !datos;
  if (!datos) {
    caja.replaceChildren();
    return;
  }

  const crearSelect = (campo, etiqueta, opciones, todas) => {
    const label = document.createElement('label');
    label.className = 'filtros-cartas__campo';
    const texto = document.createElement('span');
    texto.textContent = etiqueta;
    const select = document.createElement('select');
    select.className = 'form-select';
    select.dataset.campo = campo;
    if (todas) select.append(new Option(todas, ''));
    select.append(...opciones.map((o) => new Option(o.cantidad === undefined ? o.texto : `${o.texto} (${o.cantidad})`, o.valor)));
    select.value = datos.filtros[campo];
    select.addEventListener('change', () => alCambiar({ [campo]: select.value }));
    label.append(texto, select);
    return label;
  };

  const hijos = [crearSelect('set', 'Expansión', datos.sets, 'Todas las expansiones')];
  if (datos.rarezas) hijos.push(crearSelect('rareza', 'Rareza', datos.rarezas, 'Todas las rarezas'));
  hijos.push(crearSelect('orden', 'Ordenar por', datos.ordenes, null));
  if (datos.hayFiltros) {
    const limpiar = document.createElement('button');
    limpiar.type = 'button';
    limpiar.className = 'btn btn-link filtros-cartas__limpiar';
    limpiar.dataset.campo = 'limpiar';
    limpiar.textContent = 'Limpiar filtros';
    limpiar.addEventListener('click', () => alCambiar(null));
    hijos.push(limpiar);
  }
  caja.replaceChildren(...hijos);

  if (enfocado) {
    // "Limpiar filtros" desaparece al usarlo: el foco pasa al primer select
    (caja.querySelector(`[data-campo="${enfocado}"]`) ?? caja.querySelector('select')).focus();
  }
}

// --- Móvil: botón "Filtros (N)", insignias y hoja inferior -----
// En pantallas angostas (≤ 600 px) los selects no se ven en la página:
// arriba de la grilla hay un botón "Filtros" con cuántos hay activos y
// una insignia por cada filtro activo (y por el orden, si no es el de
// base), que lo quita al tocarla. El botón abre una hoja inferior
// (<dialog>) y los mismos selects se mueven adentro mientras está
// abierta: un solo juego de controles, con los mismos ids y el mismo
// código. Los cambios se aplican al instante, como en escritorio.

const MOVIL = window.matchMedia('(max-width: 600px)');
let hoja = null; // { caja, marcador, resumen } mientras está abierta

/** Texto de la opción elegida de un select ("Black & White", "Número"). */
const textoElegido = (opciones, valor) => opciones.find((o) => o.valor === valor)?.texto ?? valor;

/**
 * Botón "Filtros (N)" y las insignias de los filtros activos.
 * @param {string} selector  contenedor del resumen
 * @param {string} selectorCaja  los selects que abre la hoja
 */
function mostrarResumenFiltros(selector, selectorCaja, datos, alCambiar) {
  const caja = $(selector);
  // Al quitar una insignia se redibuja todo: el foco vuelve al mismo
  // lugar (la siguiente insignia o el botón)
  const enfocado = caja.contains(document.activeElement) ? document.activeElement.dataset.foco : null;
  caja.hidden = !datos;
  if (!datos) {
    caja.replaceChildren();
    return;
  }

  const activos = [];
  if (datos.filtros.set) activos.push({ campo: 'set', nombre: 'Expansión', texto: textoElegido(datos.sets, datos.filtros.set), valor: '' });
  if (datos.filtros.rareza) activos.push({ campo: 'rareza', nombre: 'Rareza', texto: datos.filtros.rareza, valor: '' });
  const cuantos = activos.length;
  if (datos.filtros.orden !== datos.base) {
    activos.push({ campo: 'orden', nombre: 'Orden', texto: textoElegido(datos.ordenes, datos.filtros.orden), valor: datos.base });
  }

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-outline-secondary filtros-resumen__boton';
  boton.dataset.foco = 'abrir';
  boton.setAttribute('aria-haspopup', 'dialog');
  boton.setAttribute('aria-label', cuantos ? `Filtros (${cuantos} ${cuantos === 1 ? 'activo' : 'activos'})` : 'Filtros');
  const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icono.setAttribute('class', 'icono');
  icono.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', '#icono-filtros');
  icono.append(uso);
  boton.append(icono, 'Filtros');
  if (cuantos) {
    const numero = document.createElement('span');
    numero.className = 'badge badge--marca filtros-resumen__cuantos';
    numero.setAttribute('aria-hidden', 'true');
    numero.textContent = String(cuantos);
    boton.append(numero);
  }
  boton.addEventListener('click', () => abrirHoja(selectorCaja, selector));

  const insignias = activos.map((a) => {
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'filtros-resumen__activo';
    quitar.dataset.foco = `quitar-${a.campo}`;
    quitar.setAttribute('aria-label', `Quitar ${a.nombre.toLowerCase()}: ${a.texto}`);
    const texto = document.createElement('span');
    // Expansión y rareza se reconocen por su valor ("Black & White",
    // "Rare"); el orden necesita su nombre. La etiqueta accesible dice todo
    texto.textContent = a.campo === 'orden' ? `${a.nombre}: ${a.texto}` : a.texto;
    const x = document.createElement('span');
    x.className = 'filtros-resumen__x';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '×';
    quitar.append(texto, x);
    quitar.addEventListener('click', () => alCambiar({ [a.campo]: a.valor }));
    return quitar;
  });
  caja.replaceChildren(boton, ...insignias);

  if (enfocado) {
    const destinos = [...caja.querySelectorAll('[data-foco]')];
    (destinos.find((b) => b.dataset.foco === enfocado) ?? destinos[destinos.length - 1] ?? boton).focus();
  }
}

/** Mueve los selects a la hoja inferior y la abre, con el foco en el primero. */
function abrirHoja(selectorCaja, selectorResumen) {
  const dialogo = $('#hoja-filtros');
  prepararHoja(dialogo);
  const caja = $(selectorCaja);
  const marcador = document.createComment('filtros');
  caja.before(marcador);
  $('#hoja-filtros-cuerpo').append(caja);
  hoja = { caja, marcador, resumen: selectorResumen };
  // Crece desde el botón "Filtros"
  abrirBurbuja(dialogo, $(`${selectorResumen} .filtros-resumen__boton`));
  caja.querySelector('select')?.focus();
}

let hojaPreparada = false;
function prepararHoja(dialogo) {
  if (hojaPreparada) return;
  hojaPreparada = true;
  prepararBurbuja(dialogo);
  $('#hoja-filtros-listo').addEventListener('click', () => cerrarBurbuja(dialogo));
  // Tocar el fondo (fuera del contenido) también cierra; Esc lo cierra solo
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarBurbuja(dialogo);
  });
  // Al cerrar, los selects vuelven a su lugar y el foco al botón "Filtros"
  // (el de ahora: pudo redibujarse con cada cambio)
  dialogo.addEventListener('close', () => {
    if (!hoja) return;
    hoja.marcador.replaceWith(hoja.caja);
    const resumen = hoja.resumen;
    hoja = null;
    $(`${resumen} .filtros-resumen__boton`)?.focus();
  });
  // Si la pantalla se ensancha (girar el teléfono), los selects vuelven a la página
  MOVIL.addEventListener('change', () => {
    if (!MOVIL.matches) cerrarBurbuja(dialogo);
  });
}
