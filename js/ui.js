// =============================================================
// Interfaz: todo lo que se dibuja en pantalla
// =============================================================
// Este archivo no llama a la API ni a Supabase: solo recibe datos
// y los muestra. Los elementos se crean con createElement y
// textContent (no con innerHTML) para que ningún texto externo
// pueda inyectar código en la página.
// =============================================================

const $ = (selector) => document.querySelector(selector);

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

/** Activa o desactiva todos los botones "Entrar con Google". */
export function activarBotonesGoogle(activos) {
  document.querySelectorAll('[data-accion="google"]').forEach((btn) => { btn.disabled = !activos; });
}

/** Mensaje bajo el formulario de login (éxito o error). */
export function mensajeLogin(texto, tipo = 'info') {
  const el = $('#mensaje-login');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = !texto;
}

// --- Tema claro / oscuro --------------------------------------
// La preferencia se guarda en localStorage ('pt-tema'). Sin nada
// guardado manda el sistema. El <head> aplica el tema guardado
// antes de pintar; aquí solo se maneja el botón.

const CLAVE_TEMA = 'pt-tema';
const temaOscuroSistema = window.matchMedia('(prefers-color-scheme: dark)');

function temaActual() {
  return document.documentElement.dataset.tema
    ?? (temaOscuroSistema.matches ? 'oscuro' : 'claro');
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
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento (modo privado estricto): el tema dura hasta recargar
    }
    pintarTema();
  });
  // Si no hay preferencia guardada y el sistema cambia, se sigue al sistema
  temaOscuroSistema.addEventListener('change', pintarTema);
  pintarTema();
}

// --- Navegación -----------------------------------------------

const VISTAS = ['inicio', 'buscar', 'coleccion'];

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

/** Los enlaces a Buscar llevan a la última búsqueda (#/buscar?q=…). */
export function actualizarEnlacesBuscar(texto) {
  const href = texto ? `#/buscar?q=${encodeURIComponent(texto)}` : '#/buscar';
  document.querySelectorAll('[data-enlace-buscar]').forEach((a) => a.setAttribute('href', href));
}

// --- Búsqueda -------------------------------------------------

/** Texto de estado sobre la grilla: "Buscando…", "12 cartas", errores. */
export function mensajeEstado(texto, tipo = 'info') {
  const el = $('#estado');
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

/** Deshabilita el buscador mientras se espera la respuesta de la API. */
export function buscando(activo) {
  $('#btn-buscar').disabled = activo;
  $('#btn-buscar').textContent = activo ? 'Buscando…' : 'Buscar';
  $('#grilla').setAttribute('aria-busy', String(activo));
}

/**
 * Pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)".
 * Con conteos = null se ocultan (sin sesión o sin resultados).
 *
 * @param {null | {todas: number, tengo: number, falta: number}} conteos
 * @param {'todas'|'tengo'|'falta'} activo
 */
export function mostrarFiltros(conteos, activo = 'todas') {
  const filtros = $('#filtros');
  filtros.hidden = !conteos;
  if (!conteos) return;

  const nombres = { todas: 'Todas', tengo: 'Tengo', falta: 'Me falta' };
  filtros.querySelectorAll('[data-filtro]').forEach((btn) => {
    const clave = btn.dataset.filtro;
    btn.textContent = `${nombres[clave]} (${conteos[clave]})`;
    btn.setAttribute('aria-pressed', String(clave === activo));
  });
}

// --- Inicio ---------------------------------------------------

/** Texto de estado de "Agregadas recientemente". */
export function mensajeInicio(texto, tipo = 'info') {
  const el = $('#estado-inicio');
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

/** Dibuja las cartas recientes (mismos parámetros que mostrarCartas). */
export function mostrarRecientes(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-recientes'), cartas, marcado, textoVacio);
}

// --- Mi colección ---------------------------------------------

/** Texto de estado de "Mi colección": "Cargando…", "12 cartas", errores. */
export function mensajeColeccion(texto, tipo = 'info') {
  const el = $('#estado-coleccion');
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

/** Dibuja las cartas de "Mi colección" (mismos parámetros que mostrarCartas). */
export function mostrarColeccion(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-coleccion'), cartas, marcado, textoVacio);
}

// --- Grilla de cartas -----------------------------------------

/**
 * Dibuja las cartas de la búsqueda en la grilla.
 *
 * @param {Array} cartas
 * @param {null | {
 *   idsTengo: Set<string>,
 *   alCambiar: (carta: object, tengo: boolean) => Promise<void>
 * }} marcado  null si no hay sesión: las cartas se ven sin botones.
 * @param {string} [textoVacio]  mensaje si no hay cartas que mostrar
 */
export function mostrarCartas(cartas, marcado = null, textoVacio = '') {
  dibujarGrilla($('#grilla'), cartas, marcado, textoVacio);
}

function dibujarGrilla(grilla, cartas, marcado, textoVacio) {
  if (cartas.length === 0 && textoVacio) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio grilla__vacio';
    vacio.textContent = textoVacio;
    grilla.replaceChildren(vacio);
    return;
  }
  grilla.replaceChildren(...cartas.map((carta) => crearTarjeta(carta, marcado)));
}

/** Crea la tarjeta de una carta. */
function crearTarjeta(carta, marcado) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'carta';

  // Botón con la imagen: al hacer clic se ve en grande
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'carta__imagen';
  boton.setAttribute('aria-label', `Ver ${carta.nombre} en grande`);
  boton.addEventListener('click', () => verEnGrande(carta));

  if (carta.imagenChica) {
    const img = document.createElement('img');
    img.src = carta.imagenChica;
    img.alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
    img.loading = 'lazy';      // solo se descarga cuando aparece en pantalla
    img.decoding = 'async';
    img.width = 245;           // tamaño aproximado de la imagen: evita saltos
    img.height = 342;
    boton.append(img);
  } else {
    // Algunas cartas aún no tienen imagen en la API
    const vacia = document.createElement('div');
    vacia.className = 'carta__sin-imagen';
    vacia.textContent = 'Imagen no disponible';
    boton.append(vacia);
    boton.disabled = true;
  }

  // Datos de la carta
  const info = document.createElement('div');
  info.className = 'carta__info';

  const set = document.createElement('p');
  set.className = 'carta__set';
  set.textContent = carta.nombreSet;
  set.title = carta.nombreSet; // nombre completo al pasar el mouse si se corta

  const detalle = document.createElement('p');
  detalle.className = 'carta__detalle';
  const numero = carta.totalSet ? `${carta.numero}/${carta.totalSet}` : carta.numero;
  const anio = carta.fechaSet ? carta.fechaSet.slice(0, 4) : '';
  detalle.textContent = [numero, anio].filter(Boolean).join(' · ');

  info.append(set, detalle);
  if (marcado) info.append(crearMarcado(carta, tarjeta, marcado));
  tarjeta.append(boton, info);
  return tarjeta;
}

/**
 * Par de botones "Tengo" / "Me falta". El que está presionado
 * (aria-pressed) indica el estado actual de la carta.
 * El cambio se muestra al instante y se revierte si alCambiar falla
 * (el mensaje de error lo muestra quien llama).
 */
function crearMarcado(carta, tarjeta, { idsTengo, alCambiar }) {
  const grupo = document.createElement('div');
  grupo.className = 'marcado';
  grupo.setAttribute('role', 'group');
  grupo.setAttribute('aria-label', `¿Tienes ${carta.nombre} ${carta.numero}?`);

  const btnTengo = crearBotonMarcado('Tengo', 'marcado__tengo');
  const btnFalta = crearBotonMarcado('Me falta', 'marcado__falta');

  const pintar = (tengo) => {
    btnTengo.setAttribute('aria-pressed', String(tengo));
    btnFalta.setAttribute('aria-pressed', String(!tengo));
    tarjeta.classList.toggle('carta--tengo', tengo);
  };

  const cambiar = async (tengo) => {
    if (idsTengo.has(carta.id) === tengo) return;
    pintar(tengo);
    btnTengo.disabled = btnFalta.disabled = true;
    try {
      await alCambiar(carta, tengo);
    } catch {
      pintar(!tengo);
    } finally {
      btnTengo.disabled = btnFalta.disabled = false;
    }
  };

  btnTengo.addEventListener('click', () => cambiar(true));
  btnFalta.addEventListener('click', () => cambiar(false));

  pintar(idsTengo.has(carta.id));
  grupo.append(btnTengo, btnFalta);
  return grupo;
}

function crearBotonMarcado(texto, clase) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `marcado__boton ${clase}`;
  btn.textContent = texto;
  return btn;
}

// --- Vista ampliada -------------------------------------------

/** Abre la carta en alta resolución dentro de un <dialog>. */
function verEnGrande(carta) {
  const dialogo = $('#dialogo-carta');
  const img = $('#dialogo-imagen');
  img.src = carta.imagenGrande;
  img.alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
  $('#dialogo-titulo').textContent = `${carta.nombre} · ${carta.nombreSet} ${carta.numero}`;
  dialogo.showModal();
}

/** Prepara el cierre del diálogo (botón y clic fuera de la carta). */
export function prepararDialogo() {
  const dialogo = $('#dialogo-carta');
  $('#dialogo-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close();
  });
}
