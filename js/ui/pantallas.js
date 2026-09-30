// =============================================================
// Interfaz: Buscar, Inicio y Colección
// =============================================================
// Mensajes de estado y grillas de cada pantalla. Las tarjetas
// las arma cartas.js.
// =============================================================

import { $, crearErrorConexion, escribirMensaje } from './base.js';
import { dibujarGrilla } from './cartas.js';

// --- Búsqueda -------------------------------------------------

/** Texto de estado sobre la grilla: "Buscando…", "12 cartas", errores. */
export function mensajeEstado(texto, tipo = 'info') {
  escribirMensaje($('#estado'), texto, tipo);
}

/** Buscar sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorBusqueda(alReintentar) {
  mensajeEstado('');
  $('#filtros').hidden = true;
  $('#grilla').replaceChildren(crearErrorConexion(alReintentar));
}

/** Deshabilita el buscador mientras se espera la respuesta de la API. */
export function buscando(activo) {
  $('#btn-buscar').disabled = activo;
  $('#btn-buscar').textContent = activo ? 'Buscando…' : 'Buscar';
  $('#grilla').setAttribute('aria-busy', String(activo));
}

// --- Inicio ---------------------------------------------------

/** Texto de estado de "Agregadas recientemente". */
export function mensajeInicio(texto, tipo = 'info') {
  escribirMensaje($('#estado-inicio'), texto, tipo);
}

/** Inicio sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorInicio(alReintentar) {
  mensajeInicio('');
  $('#grilla-recientes').replaceChildren(crearErrorConexion(alReintentar));
}

/** Dibuja las cartas recientes (mismos parámetros que mostrarCartas). */
export function mostrarRecientes(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-recientes'), cartas, marcado, textoVacio);
}

/**
 * "Tu colección" en Inicio: cartas distintas, copias en total y
 * expansiones con al menos una carta. null = todavía no se sabe
 * (cargando o sin conexión): "—", que el lector de pantalla oye como
 * "sin datos".
 * @param {null | {cartas: number, copias: number, expansiones: number}} cifras
 */
export function mostrarResumenInicio(cifras) {
  const textos = {
    cartas: ['carta distinta', 'cartas distintas'],
    copias: ['copia en total', 'copias en total'],
    expansiones: ['expansión', 'expansiones'],
  };
  for (const [clave, [uno, varios]] of Object.entries(textos)) {
    const valor = document.querySelector(`[data-cifra="${clave}"]`);
    const texto = document.querySelector(`[data-cifra-texto="${clave}"]`);
    const n = cifras?.[clave];
    texto.textContent = n === 1 ? uno : varios;
    if (n === undefined) {
      const guion = document.createElement('span');
      guion.setAttribute('aria-hidden', 'true');
      guion.textContent = '—';
      const oculto = document.createElement('span');
      oculto.className = 'visualmente-oculto';
      oculto.textContent = 'sin datos';
      valor.replaceChildren(guion, oculto);
    } else {
      valor.textContent = n.toLocaleString('es');
    }
  }
}

// --- Mi colección ---------------------------------------------

/** Texto de estado de "Mi colección": "Cargando…", "12 cartas", errores. */
export function mensajeColeccion(texto, tipo = 'info') {
  escribirMensaje($('#estado-coleccion'), texto, tipo);
}

/** Colección sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorColeccion(alReintentar) {
  mensajeColeccion('');
  $('#grilla-coleccion').replaceChildren(crearErrorConexion(alReintentar));
}

/** Dibuja las cartas de "Mi colección" (mismos parámetros que mostrarCartas). */
export function mostrarColeccion(cartas, marcado, textoVacio) {
  // Solo en Colección: insignia con los acabados de tus copias
  dibujarGrilla($('#grilla-coleccion'), cartas, marcado, textoVacio, { acabados: true });
}

// --- Grilla de cartas -----------------------------------------

/**
 * Dibuja las cartas de la búsqueda en la grilla.
 *
 * @param {Array} cartas
 * @param {null | {
 *   misCartas: Map<string, {filaId: number, copias: number}>,
 *   alCambiar: (carta: object, tengo: boolean) => Promise<void>
 * }} marcado  null si no hay sesión: las cartas se ven sin botones.
 * @param {string} [textoVacio]  mensaje si no hay cartas que mostrar
 */
export function mostrarCartas(cartas, marcado = null, textoVacio = '') {
  dibujarGrilla($('#grilla'), cartas, marcado, textoVacio);
}
