// =============================================================
// Interfaz: cabecera y navegación
// =============================================================
// Lo que es de toda la página: sesión (Entrar con Google / Salir),
// tema (Automático / Claro / Oscuro) y qué pantalla se ve (títulos y enlaces).
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

// --- Tema: Automático / Claro / Oscuro ------------------------
// La preferencia se guarda en localStorage ('pt-tema'): 'claro',
// 'oscuro' o nada (= Automático, sigue al sistema). Las elecciones
// guardadas antes del selector de tres estados valen igual. El script
// del <head> pone data-bs-theme ("light" | "dark", el atributo de
// Bootstrap) antes de pintar; aquí se manejan el botón y su menú.

const CLAVE_TEMA = 'pt-tema';
const temaOscuroSistema = window.matchMedia('(prefers-color-scheme: dark)');

/** 'auto' | 'claro' | 'oscuro' */
let preferencia = leerPreferencia();

function leerPreferencia() {
  try {
    const guardada = localStorage.getItem(CLAVE_TEMA);
    return guardada === 'claro' || guardada === 'oscuro' ? guardada : 'auto';
  } catch {
    return 'auto';
  }
}

function guardarPreferencia() {
  try {
    if (preferencia === 'auto') localStorage.removeItem(CLAVE_TEMA);
    else localStorage.setItem(CLAVE_TEMA, preferencia);
  } catch {
    // Sin almacenamiento (modo privado estricto): la elección dura hasta recargar
  }
}

function temaActual() {
  return document.documentElement.dataset.bsTheme === 'dark' ? 'oscuro' : 'claro';
}

/** Pone el tema que corresponde a la preferencia y actualiza el botón y el menú. */
function aplicarTema() {
  const oscuro = preferencia === 'auto' ? temaOscuroSistema.matches : preferencia === 'oscuro';
  document.documentElement.dataset.bsTheme = oscuro ? 'dark' : 'light';
  pintarTema();
}

/** Botón ("Tema: automático (oscuro)"), radios del menú y barra del navegador. */
function pintarTema() {
  const texto = preferencia === 'auto' ? `Tema: automático (${temaActual()})` : `Tema: ${preferencia}`;
  const boton = $('#btn-tema');
  boton.setAttribute('aria-label', texto);
  boton.title = texto;
  boton.dataset.preferencia = preferencia;  // la "A" del respaldo sin popover
  document.querySelectorAll('#menu-tema input[name="tema"]').forEach((radio) => {
    radio.checked = radio.value === preferencia;
  });
  // Toma el fondo de la cabecera del CSS, así no se repiten colores aquí
  const fondo = getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fondo);
}

/**
 * Prepara el botón de tema y su menú (atributo popover: Esc y tocar
 * fuera lo cierran solos). El menú se abre con el foco en la opción
 * elegida; las flechas cambian el tema al instante. Elegir con el mouse
 * o el dedo, o con Enter, cierra el menú y devuelve el foco al botón.
 * Sin popover en el navegador, el botón alterna los tres estados.
 */
export function prepararSelectorTema() {
  const boton = $('#btn-tema');
  const menu = $('#menu-tema');

  // En Automático, si el sistema cambia, el tema cambia con él. (El
  // <head> ya lo hace si no hay nada guardado; esto cubre además el caso
  // sin almacenamiento, donde la elección solo vive en esta variable.)
  temaOscuroSistema.addEventListener('change', aplicarTema);

  if ('popover' in HTMLElement.prototype) prepararMenuTema(boton, menu);
  else prepararCicloTema(boton, menu);
  aplicarTema();
}

/**
 * Respaldo sin popover (Safari de iOS 16 y anteriores, Firefox < 125):
 * esos navegadores no abren el menú y tampoco lo ocultan. Se oculta
 * (también desde el CSS, antes de que corra esto) y el botón alterna
 * Automático → Claro → Oscuro. Una "A" en el botón marca Automático,
 * porque el sol o la luna solos no distinguen Automático de Claro u Oscuro.
 */
function prepararCicloTema(boton, menu) {
  const ORDEN = ['auto', 'claro', 'oscuro'];
  menu.hidden = true;
  boton.removeAttribute('popovertarget');
  boton.classList.add('selector-tema--ciclo');
  boton.addEventListener('click', () => {
    preferencia = ORDEN[(ORDEN.indexOf(preferencia) + 1) % ORDEN.length];
    guardarPreferencia();
    aplicarTema();
  });
}

/** Menú Automático / Claro / Oscuro con el popover nativo. */
function prepararMenuTema(boton, menu) {
  let conPuntero = false;

  // Bajo el botón y alineado a su borde derecho (el menú es absoluto
  // respecto a la página, así se desplaza con ella)
  menu.addEventListener('beforetoggle', (e) => {
    if (e.newState !== 'open') return;
    const r = boton.getBoundingClientRect();
    menu.style.setProperty('--menu-arriba', `${r.bottom + window.scrollY + 6}px`);
    menu.style.setProperty('--menu-derecha', `${document.documentElement.clientWidth - r.right - window.scrollX}px`);
  });
  menu.addEventListener('toggle', (e) => {
    if (e.newState === 'open') menu.querySelector('input:checked')?.focus();
  });

  const cerrar = () => {
    menu.hidePopover();
    boton.focus();
  };
  menu.addEventListener('pointerdown', () => { conPuntero = true; });
  menu.addEventListener('keydown', (e) => {
    conPuntero = false;
    if (e.key === 'Enter') {
      e.preventDefault();
      cerrar();
    }
  });
  menu.addEventListener('change', (e) => {
    preferencia = e.target.value;
    guardarPreferencia();
    aplicarTema();
    if (conPuntero) cerrar();
  });
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
