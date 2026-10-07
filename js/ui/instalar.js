// =============================================================
// Interfaz: "Instalar app" (cabecera y pie) y los pasos de iOS
// =============================================================
// Dos botones con data-instalar: en la cabecera, junto al tema (con
// texto en escritorio, solo el ícono en móvil) y en el pie, junto a
// Privacidad. Parten ocultos y se muestran juntos, solo si se puede
// instalar. En iPhone/iPad no hay instalación desde la página: abren
// un <dialog> con los pasos de Safari. La lógica (cuándo se ven, qué
// hace el botón) está en instalar.js.
// =============================================================

import { $ } from './base.js';
import { prepararBurbuja, abrirBurbuja, cerrarBurbuja } from '../animaciones.js';

/**
 * Muestra u oculta los dos botones. Si uno tenía el foco y se oculta,
 * el foco pasa al vecino: el botón de tema o el enlace a Privacidad.
 */
export function mostrarInstalar(visibles) {
  document.querySelectorAll('[data-instalar]').forEach((boton) => {
    if (!visibles && boton === document.activeElement) {
      (boton.closest('.pie') ? boton.parentElement.querySelector('a') : $('#btn-tema')).focus();
    }
    boton.hidden = !visibles;
  });
}

/**
 * Pasos de Safari en iPhone/iPad. Al cerrar, el foco vuelve al botón
 * que lo abrió.
 * @param {HTMLElement} origen
 * @param {'iPhone'|'iPad'} dispositivo
 */
export function mostrarPasosInstalar(origen, dispositivo) {
  const dialogo = $('#dialogo-instalar');
  dialogo.querySelector('[data-dispositivo]').textContent = dispositivo;
  abrirBurbuja(dialogo, origen);
  $('#instalar-entendido').focus();
  dialogo.addEventListener('close', () => origen.focus(), { once: true });
}

/** @param {{alPedirInstalar: (boton: HTMLElement) => void}} acciones */
export function prepararInstalar({ alPedirInstalar }) {
  document.querySelectorAll('[data-instalar]').forEach((boton) => {
    boton.addEventListener('click', () => alPedirInstalar(boton));
  });
  const dialogo = $('#dialogo-instalar');
  // Como la confirmación: la capa es el propio <dialog> y se desvanece aparte
  prepararBurbuja(dialogo, { panel: dialogo.querySelector('.confirmar__contenido'), fondo: dialogo });
  $('#instalar-entendido').addEventListener('click', () => cerrarBurbuja(dialogo));
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarBurbuja(dialogo);
  });
}
