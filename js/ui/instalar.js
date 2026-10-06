// =============================================================
// Interfaz: "Instalar app" y el aviso para iPhone/iPad
// =============================================================
// Los botones (data-instalar) están en la presentación de Inicio para
// visitantes y en el menú de cuenta; parten ocultos y solo aparecen si
// se puede instalar. En iPhone/iPad no hay instalación desde la página:
// el aviso de Inicio y el botón del menú muestran los pasos de Safari.
// La lógica (cuándo se puede, qué hace el botón) está en instalar.js.
// =============================================================

import { $ } from './base.js';

/**
 * Muestra u oculta los botones "Instalar app". Si uno tenía el foco y
 * se oculta, el foco pasa a otro control de su grupo.
 */
export function mostrarBotonesInstalar(visibles) {
  document.querySelectorAll('[data-instalar]').forEach((boton) => {
    if (!visibles && boton === document.activeElement) {
      boton.parentElement.querySelector('a, button:not([data-instalar])')?.focus();
    }
    boton.hidden = !visibles;
  });
}

/**
 * iPhone/iPad: el botón del menú de cuenta pasa a mostrar y ocultar los
 * pasos de Safari (el de Inicio no se usa: está el aviso).
 */
export function prepararPasosMenu() {
  const boton = $('#menu-instalar');
  boton.setAttribute('aria-controls', 'menu-instalar-pasos');
  boton.hidden = false;
  mostrarPasosMenu(false);
}

/** Pasos de iOS dentro del menú de cuenta. */
export function mostrarPasosMenu(visibles) {
  $('#menu-instalar-pasos').hidden = !visibles;
  $('#menu-instalar').setAttribute('aria-expanded', String(visibles));
}

/**
 * Aviso de Inicio con los pasos para iPhone/iPad.
 * @param {boolean} visible
 * @param {{dispositivo?: string, enfocar?: boolean}} [opciones]
 */
export function mostrarAvisoInstalar(visible, { dispositivo, enfocar = false } = {}) {
  const aviso = $('#aviso-instalar');
  if (dispositivo) aviso.querySelector('[data-dispositivo]').textContent = dispositivo;
  aviso.hidden = !visible;
  if (visible && enfocar) $('#aviso-instalar-titulo').focus();
}

/**
 * @param {{alPedirInstalar: (boton: HTMLElement) => void, alCerrarAviso: () => void}} acciones
 */
export function prepararInstalar({ alPedirInstalar, alCerrarAviso }) {
  document.querySelectorAll('[data-instalar]').forEach((boton) => {
    boton.addEventListener('click', () => alPedirInstalar(boton));
  });
  $('#aviso-instalar-cerrar').addEventListener('click', () => {
    mostrarAvisoInstalar(false);
    // El foco iba en el botón que desapareció: pasa al título de Inicio
    [...document.querySelectorAll('#vista-inicio [data-titulo]')]
      .find((el) => el.offsetParent !== null)?.focus();
    alCerrarAviso();
  });
}
