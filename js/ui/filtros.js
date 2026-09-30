// =============================================================
// Interfaz: filtros de cartas
// =============================================================
// Pestañas Todas / Tengo / Me falta (Buscar y detalle de un
// objetivo) y los selects de expansión, rareza y orden (Buscar y
// Colección). Qué filtra cada uno lo decide filtros.js (sin "ui/").
// =============================================================

import { $ } from './base.js';

/**
 * Pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)".
 * Con conteos = null se ocultan (sin sesión o sin resultados).
 *
 * @param {null | {todas: number, tengo: number, falta: number}} conteos
 * @param {'todas'|'tengo'|'falta'} activo
 * @param {string} [selector]  grupo de pestañas (Buscar o detalle de un objetivo)
 */
export function mostrarFiltros(conteos, activo = 'todas', selector = '#filtros') {
  const filtros = $(selector);
  filtros.hidden = !conteos;
  if (!conteos) return;

  const nombres = { todas: 'Todas', tengo: 'Tengo', falta: 'Me falta' };
  filtros.querySelectorAll('[data-filtro]').forEach((btn) => {
    const clave = btn.dataset.filtro;
    btn.textContent = `${nombres[clave]} (${conteos[clave]})`;
    btn.setAttribute('aria-pressed', String(clave === activo));
  });
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
 */
export function mostrarFiltrosCartas(selector, datos, alCambiar) {
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
    limpiar.className = 'boton boton--texto filtros-cartas__limpiar';
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
