// =============================================================
// Interfaz: avisos breves (toast)
// =============================================================
// "Siguiendo Joltik", "Agregada a tu colección"… Aparecen abajo al
// centro (en móvil, sobre la barra de navegación), los anuncia el
// lector de pantalla y se van solos. No llevan botones ni enlaces: lo
// que dicen ya se ve en la pantalla, así que no se pierde nada si
// desaparecen antes de leerlos.
//
// Accesibilidad: la región #avisos (role="status") existe desde que
// carga la página; cada aviso nuevo se agrega adentro y el lector lo
// lee sin mover el foco. Con un <dialog> modal abierto (detalle de
// carta) el resto de la página queda inerte y no se anunciaría: la
// región se mueve adentro del diálogo antes de agregar el aviso.
//
// Animación: la burbuja sube desde abajo con rebote y se va rápido
// (animaciones.js; con prefers-reduced-motion, sin movimiento).
// =============================================================

import { $ } from './base.js';
import { entrarAviso, salirAviso } from '../animaciones.js';

const DURACION = 4000;   // ms que queda visible
const MAXIMO = 3;        // avisos a la vez; el más viejo se va primero

// Ícono según el tipo (mismo trazo que los de la barra de navegación).
// El tipo no depende solo del color: cada uno tiene su forma.
//   exito (seguir, agregar): ✓ en círculo amarillo; en tema oscuro, el rayo
//   neutro (dejar de seguir, quitar): − en círculo gris
//   error: ! en círculo rojo
const ICONOS = {
  exito: ['icono-aviso-check aviso__claro', 'icono-aviso-rayo aviso__oscuro'],
  neutro: ['icono-aviso-menos'],
  error: ['icono-aviso-alerta'],
};

/**
 * Muestra un aviso breve.
 * @param {string} texto
 * @param {{tipo?: 'exito'|'neutro'|'error', duracion?: number, origen?: Element|null}} [opciones]
 *   origen: el control que lo provocó (hoy la burbuja siempre sube desde
 *   abajo, donde están los avisos)
 */
export function avisar(texto, { tipo = 'exito', duracion = DURACION, origen = null } = {}) {
  const { region, movida } = regionActual();

  const aviso = document.createElement('div');
  aviso.className = `aviso aviso--${tipo}`;
  const icono = document.createElement('span');
  icono.className = 'aviso__icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.append(...(ICONOS[tipo] ?? ICONOS.neutro).map((clases) => {
    const [id, clase] = clases.split(' ');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `icono${clase ? ` ${clase}` : ''}`);
    const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    uso.setAttribute('href', `#${id}`);
    svg.append(uso);
    return svg;
  }));
  const mensaje = document.createElement('span');
  mensaje.className = 'aviso__texto';
  aviso.append(icono, mensaje);
  region.append(aviso);
  while (region.children.length > MAXIMO) region.firstElementChild.remove();

  // El texto entra después del elemento (y un poco más tarde si la región
  // acaba de moverse): así el lector de pantalla lo anuncia
  setTimeout(() => {
    mensaje.textContent = texto;
    animarEntrada(aviso, origen);
  }, movida ? 150 : 30);
  setTimeout(() => animarSalida(aviso, origen).then(() => aviso.remove()), duracion);
}

/**
 * La región de avisos, adentro del <dialog> modal abierto si hay uno
 * (fuera de él la página es inerte) o al final de <body>.
 */
function regionActual() {
  const region = $('#avisos');
  const abiertos = [...document.querySelectorAll('dialog[open]')];
  const destino = abiertos[abiertos.length - 1] ?? document.body;
  const movida = region.parentElement !== destino;
  if (movida) destino.append(region);
  return { region, movida };
}

// --- Animación ---------------------------------------------------------

/** Hace aparecer el aviso: la burbuja sube desde abajo. */
function animarEntrada(aviso, origen) {
  aviso.classList.add('aviso--visible');
  entrarAviso(aviso);
}

/**
 * Hace desaparecer el aviso; se resuelve cuando termina la animación
 * (al instante con prefers-reduced-motion).
 * @returns {Promise<void>}
 */
function animarSalida(aviso, origen) {
  return salirAviso(aviso);
}
