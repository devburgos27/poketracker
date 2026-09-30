// =============================================================
// Interfaz: acabados
// =============================================================
// Nombres de los acabados, la insignia de la miniatura en
// Colección y la vista por acabado del detalle (efecto CSS sobre
// la misma imagen; no son fotos de esa versión).
// =============================================================

import { $ } from './base.js';

/**
 * Textos de la insignia de acabados: corto ("Reverse +1 · Sello") y
 * largo, para lectores de pantalla ("acabados: Reverse holo, Holo; con
 * sello"). "Normal" no se muestra: es lo común. null si no hay nada.
 */
export function textoAcabados(guardada) {
  const especiales = (guardada?.acabados ?? []).filter((a) => a !== 'normal');
  const sello = Boolean(guardada?.sello);
  if (!especiales.length && !sello) return null;
  const corto = [];
  const largo = [];
  if (especiales.length) {
    corto.push(ACABADOS_CORTOS[especiales[0]] + (especiales.length > 1 ? ` +${especiales.length - 1}` : ''));
    largo.push(`acabados: ${especiales.map((a) => ACABADOS[a]).join(', ')}`);
  }
  if (sello) {
    corto.push('Sello');
    largo.push('con sello');
  }
  return { corto: corto.join(' · '), largo: largo.join('; ') };
}

// Acabados, en el orden de la base de datos (coleccion.ACABADOS)
export const ACABADOS = {
  normal: 'Normal', holo: 'Holo', reverse: 'Reverse holo',
  pokeball: 'Reverse Poké Ball', masterball: 'Reverse Master Ball', otro: 'Otro',
};
// Versión corta, para la insignia de la miniatura
const ACABADOS_CORTOS = {
  normal: 'Normal', holo: 'Holo', reverse: 'Reverse',
  pokeball: 'Poké Ball', masterball: 'Master Ball', otro: 'Otro acabado',
};

// --- Detalle: vista por acabado ---------------------------------
// Si tus copias tienen acabado, bajo la imagen aparece un botón por
// cada acabado registrado. Elegir uno superpone un efecto CSS propio
// sobre la misma imagen (brillo metálico en holo y reverse; círculos y
// destellos en Poké Ball y Master Ball), con una etiqueta que dice que
// es una simulación. No son fotos de esa versión de la carta.

// Acabados con efecto; "normal" y "otro" solo muestran la etiqueta
const EFECTOS = new Set(['holo', 'reverse', 'pokeball', 'masterball']);

let acabadoVisto = null;    // acabado elegido en la carta abierta
let acabadosMostrados = ''; // los botones dibujados ("normal,reverse")

export function mostrarVistasAcabado(copias) {
  const registrados = Object.keys(ACABADOS).filter((a) => copias.some((c) => c.acabado === a));
  if (!registrados.includes(acabadoVisto)) acabadoVisto = registrados[0] ?? null;

  const grupo = $('#detalle-acabados');
  grupo.hidden = registrados.length === 0;
  // Solo se vuelven a dibujar si cambió qué acabados hay: así el foco
  // no se pierde al guardar un cambio de copias
  const clave = registrados.join(',');
  if (clave !== acabadosMostrados) {
    acabadosMostrados = clave;
    grupo.replaceChildren(grupo.querySelector('legend'), ...registrados.map((acabado) => {
      const label = document.createElement('label');
      label.className = 'acabados__opcion';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'detalle-acabado';
      radio.value = acabado;
      radio.className = 'visualmente-oculto';
      radio.addEventListener('change', () => {
        acabadoVisto = acabado;
        aplicarEfecto();
      });
      const texto = document.createElement('span');
      texto.textContent = ACABADOS[acabado];
      label.append(radio, texto);
      return label;
    }));
  }
  grupo.querySelectorAll('input').forEach((radio) => { radio.checked = radio.value === acabadoVisto; });
  aplicarEfecto();
}

function aplicarEfecto() {
  const efecto = $('#detalle-efecto');
  const etiqueta = $('#detalle-efecto-etiqueta');
  const conEfecto = EFECTOS.has(acabadoVisto);
  efecto.hidden = !conEfecto;
  efecto.dataset.acabado = conEfecto ? acabadoVisto : '';
  // La etiqueta aparece con cualquier acabado distinto de normal; con
  // "otro" no hay efecto, así que no dice "Simulación"
  etiqueta.hidden = !acabadoVisto || acabadoVisto === 'normal';
  const prefijo = conEfecto ? 'Simulación' : 'Acabado';
  etiqueta.textContent = etiqueta.hidden ? '' : `${prefijo}: ${ACABADOS[acabadoVisto]}`;
}


/** Cada carta parte con su primer acabado registrado. */
export function reiniciarVistaAcabado() {
  acabadoVisto = null;
}
