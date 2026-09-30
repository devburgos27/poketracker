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
// Animación: hoy es una transición CSS simple (aparece y sube unos
// pixeles; con prefers-reduced-motion, sin movimiento). La animación
// tipo burbuja del bloque 11.8 va en animarEntrada y animarSalida, que
// ya reciben el control que provocó el aviso (origen).
// =============================================================

import { $ } from './base.js';

const DURACION = 4000;   // ms que queda visible
const MAXIMO = 3;        // avisos a la vez; el más viejo se va primero

/**
 * Muestra un aviso breve.
 * @param {string} texto
 * @param {{tipo?: 'exito'|'info', duracion?: number, origen?: Element|null}} [opciones]
 *   tipo: exito lleva ✓; info, un punto. origen: el control que lo
 *   provocó (para la animación de 11.8; hoy no cambia nada)
 */
export function avisar(texto, { tipo = 'exito', duracion = DURACION, origen = null } = {}) {
  const { region, movida } = regionActual();

  const aviso = document.createElement('div');
  aviso.className = `aviso aviso--${tipo}`;
  const icono = document.createElement('span');
  icono.className = 'aviso__icono';
  icono.setAttribute('aria-hidden', 'true');
  icono.textContent = tipo === 'exito' ? '✓' : '•';
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

// --- Animación (punto de enganche del bloque 11.8) -------------------

/** Hace aparecer el aviso. 11.8: burbuja que sale desde `origen`. */
function animarEntrada(aviso, origen) {
  aviso.classList.add('aviso--visible');
}

/**
 * Hace desaparecer el aviso; se resuelve cuando termina la transición
 * (al instante con prefers-reduced-motion). 11.8: la burbuja se desinfla.
 * @returns {Promise<void>}
 */
function animarSalida(aviso, origen) {
  aviso.classList.remove('aviso--visible');
  const ms = parseFloat(getComputedStyle(aviso).transitionDuration) * 1000 || 0;
  return new Promise((listo) => setTimeout(listo, ms + 50));
}
