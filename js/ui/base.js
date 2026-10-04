// =============================================================
// Interfaz: piezas comunes
// =============================================================
// $(), mensajes de estado, el recuadro "No pudimos conectar" y la
// confirmación a pantalla completa. Lo usan todas las pantallas.
// =============================================================

import { abrirBurbuja, cerrarBurbuja, prepararBurbuja } from '../animaciones.js';

export const $ = (selector) => document.querySelector(selector);

/** Escribe un mensaje de estado ("Buscando…", "12 cartas", errores). */
export function escribirMensaje(el, texto, tipo) {
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

// --- Sin conexión ---------------------------------------------

/**
 * Estado "No pudimos conectar" con botón "Reintentar": el único
 * formato para errores de red (la app no reintenta sola).
 * Misma estructura que el estado vacío (.vacio).
 * Al tocar "Reintentar" el botón se desactiva y dice "Reintentando…";
 * quien llama reemplaza el estado cuando termina (bien o mal).
 *
 * @param {() => void} alReintentar
 * @param {{compacto?: boolean}} [opciones]  compacto: para espacios chicos
 * @returns {HTMLElement}
 */
export function crearErrorConexion(alReintentar, { compacto = false } = {}) {
  const caja = document.createElement('div');
  caja.className = `vacio grilla__vacio sin-conexion${compacto ? ' sin-conexion--compacto' : ''}`;
  caja.setAttribute('role', 'alert');

  const textos = document.createElement('div');
  textos.className = 'sin-conexion__textos';
  const titulo = document.createElement('p');
  titulo.className = 'sin-conexion__titulo';
  titulo.textContent = 'No pudimos conectar';
  const texto = document.createElement('p');
  texto.className = 'sin-conexion__texto';
  texto.textContent = 'Revisa tu conexión e inténtalo de nuevo.';
  textos.append(titulo, texto);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn btn-outline-secondary sin-conexion__boton';
  const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icono.setAttribute('class', 'icono');
  icono.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', '#icono-recargar');
  icono.append(uso);
  const etiqueta = document.createElement('span');
  etiqueta.textContent = 'Reintentar';
  boton.append(icono, etiqueta);
  boton.addEventListener('click', () => {
    boton.disabled = true;
    etiqueta.textContent = 'Reintentando…';
    alReintentar();
  });

  caja.append(textos, boton);
  return caja;
}

/** Aviso arriba de la pantalla (carga inicial). null lo oculta. */
export function mostrarAvisoConexion(alReintentar) {
  const aviso = $('#aviso-conexion');
  aviso.hidden = !alReintentar;
  aviso.replaceChildren(...(alReintentar ? [crearErrorConexion(alReintentar)] : []));
}

// --- Confirmación ---------------------------------------------

/**
 * Pregunta antes de una acción, a pantalla completa (reemplaza al
 * confirm() del navegador). Usa <dialog> con showModal(): el foco
 * queda atrapado adentro y Esc cancela.
 * El foco parte en "Cancelar" y, al cerrar, vuelve a donde estaba.
 *
 * @param {{titulo: string, mensaje: string, textoConfirmar?: string, peligro?: boolean}} opciones
 *   peligro: el botón de confirmar va en color de error
 * @returns {Promise<boolean>} true si confirmó
 */
export function confirmar({ titulo, mensaje, textoConfirmar = 'Aceptar', peligro = false }) {
  const dialogo = $('#dialogo-confirmar');
  const origen = document.activeElement;

  $('#confirmar-titulo').textContent = titulo;
  $('#confirmar-mensaje').textContent = mensaje;
  const aceptar = $('#confirmar-aceptar');
  aceptar.textContent = textoConfirmar;
  aceptar.classList.toggle('btn-danger', peligro);
  aceptar.classList.toggle('btn-primary', !peligro);

  dialogo.returnValue = '';
  abrirBurbuja(dialogo, origen);
  $('#confirmar-cancelar').focus();

  return new Promise((resolve) => {
    dialogo.addEventListener('close', () => {
      origen?.focus?.();
      resolve(dialogo.returnValue === 'si');
    }, { once: true });
  });
}

/** Botones y clic fuera del contenido del modal de confirmación. */
export function prepararConfirmacion() {
  const dialogo = $('#dialogo-confirmar');
  // La capa a pantalla completa es el propio <dialog>: se desvanece aparte
  prepararBurbuja(dialogo, { panel: $('#dialogo-confirmar .confirmar__contenido'), fondo: dialogo });
  $('#confirmar-aceptar').addEventListener('click', () => cerrarBurbuja(dialogo, 'si'));
  $('#confirmar-cancelar').addEventListener('click', () => cerrarBurbuja(dialogo, 'no'));
  // La capa es el propio <dialog>: un clic que no cae en el contenido cancela
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) cerrarBurbuja(dialogo, 'no');
  });
  // Esc cierra el <dialog> solo, sin returnValue: cuenta como cancelar
}
