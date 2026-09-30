// =============================================================
// Interfaz: cabecera y navegación
// =============================================================
// Lo que es de toda la página: sesión (Entrar con Google / Salir),
// tema claro / oscuro y qué pantalla se ve (títulos y enlaces).
// =============================================================

import { $, escribirMensaje } from './base.js';

// --- Sesión ---------------------------------------------------

/**
 * Muestra lo que corresponde a visitantes o a usuarios conectados:
 * los elementos con data-solo="visitante" o data-solo="usuario".
 */
export function mostrarSesion(usuario) {
  const conectado = Boolean(usuario);
  document.querySelectorAll('[data-solo="visitante"]').forEach((el) => { el.hidden = conectado; });
  document.querySelectorAll('[data-solo="usuario"]').forEach((el) => { el.hidden = !conectado; });
  $('#usuario-email').textContent = usuario?.email ?? '';
}

/**
 * Hay una sesión guardada que Supabase todavía no confirma: las
 * pantallas muestran su parte de usuario (con "Cargando…") y la
 * cabecera no ofrece ni "Entrar con Google" ni "Salir". Así no
 * aparece la invitación a entrar por un instante cuando sí hay sesión.
 * El detalle de carta (fuera de <main>) sigue como visitante.
 */
export function mostrarSesionPendiente() {
  document.querySelectorAll('[data-solo="visitante"]').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('[data-solo="usuario"]').forEach((el) => { el.hidden = !el.closest('main'); });
  $('#usuario-email').textContent = '';
}

/** Activa o desactiva todos los botones "Entrar con Google". */
export function activarBotonesGoogle(activos) {
  document.querySelectorAll('[data-accion="google"]').forEach((btn) => { btn.disabled = !activos; });
}

/** Mensaje bajo el formulario de login (éxito o error). */
export function mensajeLogin(texto, tipo = 'info') {
  const el = $('#mensaje-login');
  escribirMensaje(el, texto, tipo);
  el.hidden = !texto;
}

// --- Tema claro / oscuro --------------------------------------
// La preferencia se guarda en localStorage ('pt-tema'). Sin nada
// guardado manda el sistema. El script del <head> pone data-bs-theme
// ("light" | "dark", el atributo de Bootstrap) antes de pintar y lo
// actualiza si el sistema cambia; aquí solo se maneja el botón.

const CLAVE_TEMA = 'pt-tema';
const temaOscuroSistema = window.matchMedia('(prefers-color-scheme: dark)');

function temaActual() {
  return document.documentElement.dataset.bsTheme === 'dark' ? 'oscuro' : 'claro';
}

/** Sincroniza el botón y la barra del navegador con el tema activo. */
function pintarTema() {
  const oscuro = temaActual() === 'oscuro';
  $('#btn-tema').setAttribute('aria-pressed', String(oscuro));
  // Toma el fondo de la cabecera del CSS, así no se repiten colores aquí
  const fondo = getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fondo);
}

/** Prepara el botón ☀️/🌙 de la cabecera. */
export function prepararSelectorTema() {
  $('#btn-tema').addEventListener('click', () => {
    const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.bsTheme = nuevo === 'oscuro' ? 'dark' : 'light';
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento (modo privado estricto): el tema dura hasta recargar
    }
    pintarTema();
  });
  // Si no hay preferencia guardada y el sistema cambia, el <head> ya
  // cambió data-bs-theme: aquí se actualizan el botón y la barra
  temaOscuroSistema.addEventListener('change', pintarTema);
  pintarTema();
}

// --- Navegación -----------------------------------------------

const VISTAS = ['inicio', 'buscar', 'coleccion', 'progreso'];

/**
 * Muestra una pantalla, marca su ítem en la barra y cambia el
 * título de la pestaña del navegador.
 * @param {'inicio'|'buscar'|'coleccion'} vista
 * @param {string} titulo
 */
export function mostrarVista(vista, titulo) {
  VISTAS.forEach((v) => { $(`#vista-${v}`).hidden = v !== vista; });
  document.querySelectorAll('#navegacion [data-ruta]').forEach((enlace) => {
    if (enlace.dataset.ruta === vista) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  });
  document.title = titulo;
}

/**
 * Al entrar a otra pantalla: vuelve arriba y pone el foco en su
 * título, para que el lector de pantalla anuncie dónde se está.
 */
export function enfocarTitulo(vista) {
  window.scrollTo(0, 0);
  // Inicio tiene un título para visitantes y otro con sesión: se usa el visible
  const titulo = [...$(`#vista-${vista}`).querySelectorAll('[data-titulo]')]
    .find((el) => el.offsetParent !== null);
  titulo?.focus({ preventScroll: true });
}

/**
 * Los enlaces a Buscar llevan a la última búsqueda con sus filtros
 * (#/buscar?q=…&set=…), y los de Colección a sus filtros.
 * @param {'buscar'|'coleccion'} vista
 * @param {string} href
 */
export function actualizarEnlaces(vista, href) {
  document.querySelectorAll(`[data-enlace-${vista}]`).forEach((a) => a.setAttribute('href', href));
}
