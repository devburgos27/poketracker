// =============================================================
// Interfaz: anterior / siguiente en el detalle
// =============================================================
// Flechas, teclado (← →) y deslizar el dedo; indicador "3 de 20"
// y precarga de las cartas vecinas. Qué carta sigue lo decide
// detalle-carta.js (sin "ui/") con la foto de la lista.
// =============================================================

import { $ } from './base.js';


// Controles donde ← y → ya hacen algo (o se está eligiendo un valor)
const TECLAS_PROPIAS = 'select, input, textarea, #copias-sumar, #copias-restar';
// Tocar un control no es deslizar
const TOQUE_EN_CONTROL = 'select, input, textarea, button, a, label';
const DESLIZAR_MINIMO = 50; // px

export function prepararNavegacion(dialogo, alMover) {
  $('#detalle-anterior').addEventListener('click', () => alMover(-1));
  $('#detalle-siguiente').addEventListener('click', () => alMover(1));

  dialogo.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return; // Alt+← es "Atrás"
    if (e.target.closest(TECLAS_PROPIAS)) return;
    e.preventDefault();
    alMover(e.key === 'ArrowLeft' ? -1 : 1);
  });

  // Solo un gesto claramente horizontal: al menos 50 px de lado y el
  // doble de lo que se movió en vertical. Los listeners son pasivos: el
  // desplazamiento vertical del diálogo sigue igual.
  let inicio = null;
  dialogo.addEventListener('touchstart', (e) => {
    const toque = e.touches[0];
    inicio = e.touches.length === 1 && !e.target.closest(TOQUE_EN_CONTROL)
      ? { x: toque.clientX, y: toque.clientY }
      : null;
  }, { passive: true });
  dialogo.addEventListener('touchend', (e) => {
    if (!inicio) return;
    const toque = e.changedTouches[0];
    const dx = toque.clientX - inicio.x;
    const dy = toque.clientY - inicio.y;
    inicio = null;
    if (Math.abs(dx) >= DESLIZAR_MINIMO && Math.abs(dx) > 2 * Math.abs(dy)) {
      alMover(dx < 0 ? 1 : -1); // dedo hacia la izquierda: la siguiente
    }
  }, { passive: true });
  dialogo.addEventListener('touchcancel', () => { inicio = null; }, { passive: true });
}

/**
 * Flechas e indicador "3 de 20". Con una sola carta no se muestran.
 * En la primera y la última, la flecha de ese lado queda desactivada.
 */
export function mostrarPosicion({ indice, total }) {
  const anterior = $('#detalle-anterior');
  const siguiente = $('#detalle-siguiente');
  const posicion = $('#detalle-posicion');
  const conNavegacion = total > 1;
  anterior.hidden = !conNavegacion;
  siguiente.hidden = !conNavegacion;
  posicion.hidden = !conNavegacion;
  posicion.textContent = `${indice + 1} de ${total}`;

  // Si la flecha con el foco se desactiva (llegó al borde), el foco pasa
  // a la otra en vez de perderse
  const conFoco = document.activeElement;
  anterior.disabled = indice === 0;
  siguiente.disabled = indice === total - 1;
  if (conFoco?.disabled && (conFoco === anterior || conFoco === siguiente)) {
    (conFoco === anterior ? siguiente : anterior).focus();
  }
}

/**
 * Descarga de antemano las imágenes de las cartas vecinas, así el
 * cambio es inmediato. Las cartas sin imagen en TCGdex no se precargan:
 * sus alternativas se buscan al mostrarlas, como siempre.
 */
export function precargarDetalle(cartas) {
  for (const carta of cartas) {
    if (!carta?.imagenChica) continue;
    new Image().src = carta.imagenChica;
    new Image().src = carta.imagenGrande;
  }
}
