// =============================================================
// Interfaz: todo lo que se dibuja en pantalla
// =============================================================
// Este archivo no llama a la API ni a Supabase: solo recibe datos
// y los muestra (para las cartas sin imagen, imagenes.js le dice qué
// imagen de respaldo probar). Los elementos se crean con createElement
// y textContent (no con innerHTML) para que ningún texto externo
// pueda inyectar código en la página.
// =============================================================

import * as imagenes from './imagenes.js';

const $ = (selector) => document.querySelector(selector);

/** Escribe un mensaje de estado ("Buscando…", "12 cartas", errores). */
function escribirMensaje(el, texto, tipo) {
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
  boton.className = 'boton boton--secundario sin-conexion__boton';
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

/**
 * Pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)".
 * Con conteos = null se ocultan (sin sesión o sin resultados).
 *
 * @param {null | {todas: number, tengo: number, falta: number}} conteos
 * @param {'todas'|'tengo'|'falta'} activo
 * @param {string} [selector]  grupo de pestañas (Buscar o detalle de un objetivo)
 */
export function mostrarFiltros(conteos, activo = 'todas', selector = '#filtros') {
  const filtros = $(selector);
  filtros.hidden = !conteos;
  if (!conteos) return;

  const nombres = { todas: 'Todas', tengo: 'Tengo', falta: 'Me falta' };
  filtros.querySelectorAll('[data-filtro]').forEach((btn) => {
    const clave = btn.dataset.filtro;
    btn.textContent = `${nombres[clave]} (${conteos[clave]})`;
    btn.setAttribute('aria-pressed', String(clave === activo));
  });
}

// --- Filtros de cartas (Buscar y Colección) -------------------

/**
 * Selects de expansión, rareza y orden, y "Limpiar filtros" si hay
 * alguno activo. Se redibujan con cada cambio (las cantidades dependen
 * de los demás filtros); el foco vuelve al mismo control.
 *
 * @param {string} selector
 * @param {null | {
 *   sets: Array<{valor: string, texto: string, cantidad: number}>,
 *   rarezas: null | Array<{valor: string, texto: string, cantidad: number}>,
 *   ordenes: Array<{valor: string, texto: string}>,
 *   filtros: {set: string, rareza: string, orden: string},
 *   hayFiltros: boolean,
 * }} datos  null los oculta (sin cartas). rarezas null: sin ese select
 * @param {(cambio: null | {set?: string, rareza?: string, orden?: string}) => void} alCambiar
 *   null = "Limpiar filtros"
 */
export function mostrarFiltrosCartas(selector, datos, alCambiar) {
  const caja = $(selector);
  const enfocado = caja.contains(document.activeElement) ? document.activeElement.dataset.campo : null;
  caja.hidden = !datos;
  if (!datos) {
    caja.replaceChildren();
    return;
  }

  const crearSelect = (campo, etiqueta, opciones, todas) => {
    const label = document.createElement('label');
    label.className = 'filtros-cartas__campo';
    const texto = document.createElement('span');
    texto.textContent = etiqueta;
    const select = document.createElement('select');
    select.dataset.campo = campo;
    if (todas) select.append(new Option(todas, ''));
    select.append(...opciones.map((o) => new Option(o.cantidad === undefined ? o.texto : `${o.texto} (${o.cantidad})`, o.valor)));
    select.value = datos.filtros[campo];
    select.addEventListener('change', () => alCambiar({ [campo]: select.value }));
    label.append(texto, select);
    return label;
  };

  const hijos = [crearSelect('set', 'Expansión', datos.sets, 'Todas las expansiones')];
  if (datos.rarezas) hijos.push(crearSelect('rareza', 'Rareza', datos.rarezas, 'Todas las rarezas'));
  hijos.push(crearSelect('orden', 'Ordenar por', datos.ordenes, null));
  if (datos.hayFiltros) {
    const limpiar = document.createElement('button');
    limpiar.type = 'button';
    limpiar.className = 'boton boton--texto filtros-cartas__limpiar';
    limpiar.dataset.campo = 'limpiar';
    limpiar.textContent = 'Limpiar filtros';
    limpiar.addEventListener('click', () => alCambiar(null));
    hijos.push(limpiar);
  }
  caja.replaceChildren(...hijos);

  if (enfocado) {
    // "Limpiar filtros" desaparece al usarlo: el foco pasa al primer select
    (caja.querySelector(`[data-campo="${enfocado}"]`) ?? caja.querySelector('select')).focus();
  }
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
  dibujarGrilla($('#grilla-coleccion'), cartas, marcado, textoVacio);
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
  tarjeta.dataset.id = carta.id;
  const copias = marcado?.misCartas.get(carta.id)?.copias ?? 0;

  // Botón con la imagen: abre el detalle de la carta
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'carta__imagen';
  const etiquetaCopias = copias > 1 ? ` (${copias} copias)` : '';
  boton.setAttribute('aria-label', `Ver detalle de ${carta.nombre}${etiquetaCopias}`);
  boton.addEventListener('click', () => alAbrirCarta(carta));

  ponerImagenTarjeta(boton, tarjeta, carta);

  // "×2" sobre la imagen cuando hay más de una copia
  // (el lector de pantalla ya lo oye en la etiqueta del botón)
  if (copias > 1) {
    const insignia = document.createElement('span');
    insignia.className = 'carta__copias';
    insignia.setAttribute('aria-hidden', 'true');
    insignia.textContent = `×${copias}`;
    tarjeta.append(insignia);
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

// --- Imagen de la carta y respaldo ----------------------------
// Orden: imagen de TCGdex en inglés → pokemontcg.io → TCGdex en otro
// idioma (con la etiqueta "Imagen en italiano", etc.) → recuadro con
// forma de carta. Las alternativas las decide imagenes.js.

function crearImg(src, carta) {
  const img = document.createElement('img');
  img.src = src;
  img.alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
  img.loading = 'lazy';      // solo se descarga cuando aparece en pantalla
  img.decoding = 'async';
  img.width = 245;           // tamaño aproximado de la imagen: evita saltos
  img.height = 342;
  return img;
}

// El servidor de imágenes de TCGdex a veces corta la conexión
// (ERR_CONNECTION_CLOSED) o responde 503 durante unos segundos, en
// cualquier idioma (visto el 2026-09-28). Cada imagen tiene un solo
// reintento tras 1 s. El parámetro ?reintento=1 hace que el navegador
// la pida de nuevo; los servidores lo ignoran.
const ESPERA_REINTENTO = 1000;
const conReintento = (src) => `${src}${src.includes('?') ? '&' : '?'}reintento=1`;
const esReintento = (src) => /[?&]reintento=1\b/.test(src);

/**
 * Espera a que una imagen termine de cargar, con un solo reintento si
 * falla. Sirve para <img> en la página y para new Image(); hay que
 * llamarla en el mismo paso en que se le pone el src.
 * @returns {Promise<'ok'|'reverso'|'error'>}  reverso: el genérico de pokemontcg.io
 */
function esperarImagen(img) {
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(imagenes.esReverso(img) ? 'reverso' : 'ok'));
    img.addEventListener('error', () => {
      if (esReintento(img.src)) {
        resolve('error');
        return;
      }
      setTimeout(() => { img.src = conReintento(img.src); }, ESPERA_REINTENTO);
    });
  });
}

/** Recuadro con forma de carta cuando no hay imagen: nombre, número y expansión. */
function crearRespaldo(carta) {
  const caja = document.createElement('div');
  caja.className = 'carta__sin-imagen respaldo';
  const lineas = [
    ['respaldo__nombre', carta.nombre],
    ['respaldo__numero', carta.totalSet ? `${carta.numero}/${carta.totalSet}` : carta.numero],
    ['respaldo__set', carta.nombreSet],
    ['respaldo__nota', 'Sin imagen'],
  ];
  caja.append(...lineas.filter(([, texto]) => texto).map(([clase, texto]) => {
    const p = document.createElement('p');
    p.className = clase;
    p.textContent = texto;
    return p;
  }));
  return caja;
}

/** "Imagen en español": la imagen es de la carta en otro idioma. */
function textoIdioma(idioma) {
  return `Imagen en ${imagenes.NOMBRES_IDIOMA[idioma] ?? idioma}`;
}

function ponerImagenTarjeta(boton, tarjeta, carta) {
  const respaldo = crearRespaldo(carta);
  if (carta.imagenChica) {
    const img = crearImg(carta.imagenChica, carta);
    boton.append(img);
    // Si no carga ni con el reintento (por ejemplo, sin conexión), el recuadro
    esperarImagen(img).then((resultado) => {
      if (resultado === 'error') img.replaceWith(respaldo);
    });
    return;
  }
  boton.append(respaldo);
  probarAlternativas(boton, tarjeta, carta, respaldo);
}

/**
 * Prueba las imágenes de respaldo en orden. Cada una va encima del
 * recuadro, invisible y con carga diferida (se descarga al acercarse a
 * la pantalla, como las demás). Si carga bien reemplaza al recuadro; si
 * falla (también tras el reintento) o es el reverso genérico de
 * pokemontcg.io, se quita y se prueba la siguiente.
 */
async function probarAlternativas(boton, tarjeta, carta, respaldo) {
  let falloDeRed = false;
  try {
    // La siguiente alternativa se busca solo si la anterior no sirvió
    for await (const alternativa of imagenes.alternativas(carta)) {
      if (!tarjeta.isConnected) return; // la grilla se redibujó
      const img = crearImg(alternativa.chica, carta);
      img.classList.add('carta__img-probando');
      boton.append(img);
      const resultado = await esperarImagen(img);
      if (resultado === 'error') falloDeRed = true;
      if (resultado === 'ok') {
        img.classList.remove('carta__img-probando');
        respaldo.remove();
        if (alternativa.idioma) {
          const etiqueta = document.createElement('p');
          etiqueta.className = 'carta__idioma';
          etiqueta.textContent = textoIdioma(alternativa.idioma);
          tarjeta.querySelector('.carta__info')?.prepend(etiqueta);
        }
        imagenes.recordar(carta.id, alternativa);
        return;
      }
      img.remove();
    }
  } catch (error) {
    // No se pudo consultar alguna alternativa (sin conexión): queda el recuadro
    console.error(error);
    falloDeRed = true;
  }
  // Si alguna falló por la red, no se anota como "sin imagen": al
  // redibujar (o en el detalle) se vuelve a probar
  if (!falloDeRed) imagenes.recordar(carta.id, null);
}

/**
 * Par de botones "Tengo" / "Me falta". El que está presionado
 * (aria-pressed) indica el estado actual de la carta.
 * El cambio se muestra al instante y se revierte si alCambiar falla
 * (el mensaje de error lo muestra quien llama).
 */
function crearMarcado(carta, tarjeta, { misCartas, alCambiar }) {
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
    if (!tengo) tarjeta.querySelector('.carta__copias')?.remove(); // ya no hay copias
  };

  const cambiar = async (tengo) => {
    if (misCartas.has(carta.id) === tengo) return;
    // "Me falta" borra todas las copias: con más de una, se confirma
    const copias = misCartas.get(carta.id)?.copias ?? 0;
    if (!tengo && copias > 1) {
      const quitar = await confirmar({
        titulo: `¿Quitar ${carta.nombre} de tu colección?`,
        mensaje: `Se quitarán las ${copias} copias, con su idioma y condición.`,
        textoConfirmar: 'Quitar copias',
        peligro: true,
      });
      if (!quitar) return;
    }
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

  pintar(misCartas.has(carta.id));
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

// --- Detalle de carta ----------------------------------------
// Imagen grande, datos y "Tus copias". Los datos y las acciones los
// maneja main.js; aquí solo se dibuja.

const IDIOMAS = {
  en: 'Inglés', ja: 'Japonés', es: 'Español', ko: 'Coreano', de: 'Alemán',
  fr: 'Francés', pt: 'Portugués', it: 'Italiano', zh: 'Chino', otro: 'Otro',
};
const CONDICIONES = {
  NM: 'Excelente', LP: 'Muy buena', MP: 'Buena', HP: 'Regular', DMG: 'Dañada',
};

let alAbrirCarta = () => {};
let accionesCopias = null;
let focoPendiente = null; // control que tenía el foco antes de guardar

/**
 * Conecta el detalle con main.js.
 * @param {{
 *   alAbrir: (carta: object) => void,
 *   alCerrar: () => void,
 *   alSumar: () => void,
 *   alRestar: () => void,
 *   alCambiar: (copia: object, campo: 'idioma'|'condicion', valor: string|null) => void,
 *   alQuitar: (copia: object) => void,
 * }} acciones
 */
export function prepararDetalle(acciones) {
  alAbrirCarta = acciones.alAbrir;
  accionesCopias = acciones;

  const dialogo = $('#dialogo-carta');
  $('#dialogo-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close(); // clic fuera del contenido
  });
  dialogo.addEventListener('close', acciones.alCerrar);
  $('#copias-sumar').addEventListener('click', acciones.alSumar);
  $('#copias-restar').addEventListener('click', acciones.alRestar);

  $('#detalle-imagen').addEventListener('error', alFallarImagenDetalle);
}

/**
 * La imagen visible del detalle no cargó: el recuadro con forma de carta
 * (en vez del ícono de imagen rota) y un solo reintento tras 1 s.
 */
function alFallarImagenDetalle() {
  const src = $('#detalle-imagen').getAttribute('src');
  mostrarSinImagen();
  if (!src || esReintento(src)) return;
  const pedido = imagenPedida;
  setTimeout(() => {
    // Solo si sigue el recuadro (la grande pudo llegar mientras tanto)
    if (pedido === imagenPedida && !$('#detalle-imagen').getAttribute('src')) mostrarImagen(conReintento(src));
  }, ESPERA_REINTENTO);
}

let imagenPedida = 0; // para ignorar la imagen grande de una carta anterior

function mostrarImagen(src) {
  const img = $('#detalle-imagen');
  img.src = src;
  img.hidden = false;
  $('#detalle-sin-imagen').hidden = true;
}

function mostrarSinImagen() {
  const img = $('#detalle-imagen');
  img.hidden = true;
  img.removeAttribute('src');
  $('#detalle-sin-imagen').hidden = false;
}

/**
 * Imagen del detalle: primero la chica (ya está en caché por la
 * grilla) y, cuando la grande termina de cargar, se cambia por ella.
 * Si la grande falla, queda la chica; si fallan ambas, el recuadro con
 * forma de carta. Todas ocupan el mismo recuadro fijo.
 * Sin imagen en TCGdex: las mismas alternativas que en la grilla.
 */
async function cargarImagenDetalle(carta) {
  const pedido = ++imagenPedida;
  $('#detalle-imagen').alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
  $('#detalle-sin-imagen').replaceChildren(...crearRespaldo(carta).childNodes);
  mostrarNotaImagen(null);

  if (carta.imagenChica) {
    mostrarImagen(carta.imagenChica);
    cargarGrande(carta.imagenGrande, pedido);
    return;
  }
  mostrarSinImagen();
  let falloDeRed = false;
  try {
    for await (const alternativa of imagenes.alternativas(carta)) {
      if (pedido !== imagenPedida) return; // se abrió otra carta
      const chica = new Image();
      chica.src = alternativa.chica;
      const resultado = await esperarImagen(chica);
      if (pedido !== imagenPedida) return;
      if (resultado === 'error') falloDeRed = true;
      if (resultado !== 'ok') continue; // falló (con reintento) o es el reverso: la siguiente
      imagenes.recordar(carta.id, alternativa);
      mostrarImagen(chica.src); // ya está en caché (con ?reintento=1 si hizo falta)
      mostrarNotaImagen(alternativa.idioma);
      cargarGrande(alternativa.grande, pedido);
      return;
    }
  } catch (error) {
    console.error(error); // sin conexión: queda el recuadro
    falloDeRed = true;
  }
  if (pedido === imagenPedida && !falloDeRed) imagenes.recordar(carta.id, null);
}

/**
 * La imagen grande se descarga aparte (con un reintento); decode()
 * espera a que esté lista para pintarse, así el cambio no deja un
 * instante en blanco. Si falla o es el reverso, se queda la chica.
 */
function cargarGrande(src, pedido) {
  if (!src) return;
  const grande = new Image();
  grande.src = src;
  esperarImagen(grande).then(async (resultado) => {
    if (resultado !== 'ok' || pedido !== imagenPedida) return;
    await grande.decode().catch(() => {});
    if (pedido === imagenPedida) mostrarImagen(grande.src);
  });
}

/** "Imagen en español" bajo la imagen del detalle (null la oculta). */
function mostrarNotaImagen(idioma) {
  const nota = $('#detalle-imagen-nota');
  nota.hidden = !idioma;
  nota.textContent = idioma ? textoIdioma(idioma) : '';
}

/** Abre el detalle con los datos que ya se tienen de la carta. */
export function abrirDetalle(carta) {
  cargarImagenDetalle(carta);
  mostrarDatosDetalle(carta);
  mensajeDetalle('');
  focoPendiente = null;
  mostrarCopias(null);
  $('#dialogo-carta').showModal();
}

/** Cierra el detalle (por ejemplo, al cerrar sesión). */
export function cerrarDetalle() {
  const dialogo = $('#dialogo-carta');
  if (dialogo.open) dialogo.close();
}

/** Nombre, expansión, número y rareza (se llama de nuevo si llega la rareza). */
export function mostrarDatosDetalle(carta) {
  $('#detalle-titulo').textContent = carta.nombre;

  const numero = carta.totalSet ? `${carta.numero}/${carta.totalSet}` : carta.numero;
  const anio = carta.fechaSet ? ` (${carta.fechaSet.slice(0, 4)})` : '';
  const datos = [
    ['Expansión', carta.nombreSet ? carta.nombreSet + anio : ''],
    ['Número', numero],
    ['Rareza', carta.rareza],
  ].filter(([, valor]) => valor);

  $('#detalle-datos').replaceChildren(...datos.flatMap(([nombre, valor]) => {
    const dt = document.createElement('dt');
    dt.textContent = nombre;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    return [dt, dd];
  }));
}

/** Mensaje de "Tus copias" (errores al guardar). */
export function mensajeDetalle(texto, tipo = 'info') {
  const el = $('#estado-detalle');
  escribirMensaje(el, texto, tipo);
  el.hidden = !texto;
}

/** Copias del detalle sin conexión: versión compacta del estado. */
export function errorCopias(alReintentar) {
  mensajeDetalle('');
  const fila = document.createElement('li');
  fila.append(crearErrorConexion(alReintentar, { compacto: true }));
  $('#lista-copias').replaceChildren(fila);
}

/**
 * Dibuja "Tus copias": el contador − N + y la lista de copias.
 *
 * @param {null | Array<{id: number|null, idioma: string|null, condicion: string|null}>} copias
 *   null mientras se cargan
 * @param {boolean} [ocupado]  mientras se guarda: controles desactivados
 */
export function mostrarCopias(copias, ocupado = false) {
  // Al desactivar los controles se pierde el foco: se recuerda cuál
  // era para devolverlo cuando termine de guardar
  const activo = document.activeElement?.dataset?.foco;
  if (ocupado && activo) focoPendiente = activo;

  const cargando = copias === null;
  const cantidad = copias?.length ?? 0;
  $('#copias-cantidad').textContent = cargando ? '…' : String(cantidad);
  $('#copias-restar').disabled = ocupado || cargando || cantidad === 0;
  $('#copias-sumar').disabled = ocupado || cargando;

  const lista = $('#lista-copias');
  if (cargando) {
    lista.replaceChildren();
  } else if (cantidad === 0) {
    const vacia = document.createElement('li');
    vacia.className = 'copias__vacia';
    vacia.textContent = 'Todavía no la tienes. Usa + para agregarla.';
    lista.replaceChildren(vacia);
  } else {
    lista.replaceChildren(...copias.map((copia, i) => crearFilaCopia(copia, i, ocupado)));
  }

  if (!ocupado && !cargando && focoPendiente) {
    const destino = $(`#dialogo-carta [data-foco="${focoPendiente}"]`);
    (destino && !destino.disabled ? destino : $('#copias-sumar')).focus();
    focoPendiente = null;
  }
}

function crearFilaCopia(copia, indice, ocupado) {
  const fila = document.createElement('li');
  fila.className = 'copia';

  const titulo = document.createElement('span');
  titulo.className = 'copia__titulo';
  titulo.textContent = `Copia ${indice + 1}`;

  const quitar = document.createElement('button');
  quitar.type = 'button';
  quitar.className = 'boton boton--texto copia__quitar';
  quitar.textContent = 'Quitar';
  quitar.setAttribute('aria-label', `Quitar copia ${indice + 1}`);
  quitar.dataset.foco = `quitar-${indice}`;
  quitar.disabled = ocupado;
  quitar.addEventListener('click', () => accionesCopias.alQuitar(copia));

  fila.append(
    titulo,
    crearSelector('Idioma', 'idioma', IDIOMAS, copia, indice, ocupado),
    crearSelector('Condición', 'condicion', CONDICIONES, copia, indice, ocupado),
    quitar,
  );
  return fila;
}

/** Un <select> con "Sin indicar" y las opciones en español. */
function crearSelector(etiqueta, campo, opciones, copia, indice, ocupado) {
  const label = document.createElement('label');
  label.className = 'copia__campo';

  const texto = document.createElement('span');
  texto.textContent = etiqueta;

  const select = document.createElement('select');
  select.dataset.foco = `${campo}-${indice}`;
  select.disabled = ocupado;
  select.append(
    new Option('Sin indicar', ''),
    ...Object.entries(opciones).map(([valor, nombre]) => new Option(nombre, valor)),
  );
  select.value = copia[campo] ?? '';
  select.addEventListener('change', () => accionesCopias.alCambiar(copia, campo, select.value || null));

  label.append(texto, select);
  return label;
}

/** Devuelve el foco a la tarjeta de una carta (al cerrar el detalle). */
export function enfocarCarta(idCarta) {
  const vista = document.querySelector('main > div:not([hidden])');
  vista?.querySelector(`.carta[data-id="${CSS.escape(idCarta)}"] .carta__imagen`)?.focus();
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
  aceptar.classList.toggle('boton--peligro', peligro);

  dialogo.returnValue = '';
  dialogo.showModal();
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
  $('#confirmar-aceptar').addEventListener('click', () => dialogo.close('si'));
  $('#confirmar-cancelar').addEventListener('click', () => dialogo.close('no'));
  // La capa es el propio <dialog>: un clic que no cae en el contenido cancela
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close('no');
  });
  // Esc cierra el <dialog> solo, sin returnValue: cuenta como cancelar
}

// --- Progreso: barra ------------------------------------------

/** "57 %": redondeado hacia abajo, así 20 de 21 no dice "100 %". */
const porcentaje = (tengo, total) => (total ? Math.floor((tengo / total) * 100) : 0);

/**
 * El porcentaje como texto. Con al menos una carta nunca dice "0 %":
 * 1 de 266 es "<1 %" (en voz, "menos de 1 %").
 */
function textoPorcentaje(tengo, total) {
  const pct = porcentaje(tengo, total);
  if (tengo > 0 && pct === 0) return { visible: '<1 %', voz: 'menos de 1 %' };
  return { visible: `${pct} %`, voz: `${pct} %` };
}

/**
 * Barra de progreso accesible: role="progressbar" con los valores y la
 * cifra "12 / 21 · 57 %" siempre visible (no depende del color).
 *
 * @param {null | {estado: 'sin-datos'|'no-disponible'} | {
 *   principal: {tengo: number, total: number},
 *   master?: {tengo: number, total: number}
 * }} progreso  null = calculando
 * @param {string} idEtiqueta  id del elemento con el nombre del objetivo
 */
export function crearBarraProgreso(progreso, idEtiqueta) {
  const bloque = document.createElement('div');
  bloque.className = 'progreso';

  const barra = document.createElement('div');
  barra.className = 'progreso__barra';
  const relleno = document.createElement('div');
  relleno.className = 'progreso__relleno';
  barra.append(relleno);

  const cifra = document.createElement('p');
  cifra.className = 'progreso__cifra';
  bloque.append(barra, cifra);

  if (!progreso?.principal) {
    // Sin números todavía: la barra queda vacía y el texto explica por qué
    barra.setAttribute('aria-hidden', 'true');
    bloque.classList.add('progreso--sin-datos');
    cifra.textContent = {
      'sin-datos': 'Sin datos: no pudimos conectar con TCGdex.',
      'no-disponible': 'No disponible en TCGdex.',
    }[progreso?.estado] ?? 'Calculando…';
    return bloque;
  }

  const { tengo, total } = progreso.principal;
  const pct = porcentaje(tengo, total);
  const texto = textoPorcentaje(tengo, total);
  const completo = total > 0 && tengo === total;
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-labelledby', idEtiqueta);
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', String(total));
  barra.setAttribute('aria-valuenow', String(tengo));
  barra.setAttribute('aria-valuetext', `${tengo} de ${total} cartas, ${texto.voz}${completo ? ', completo' : ''}`);
  // Con al menos una carta se ve un poco de relleno, aunque sea < 1 %
  relleno.style.width = `${tengo > 0 ? Math.max(pct, 1) : 0}%`;
  bloque.classList.toggle('progreso--completo', completo);
  cifra.textContent = completo
    ? `✓ Completo · ${tengo} / ${total}`
    : `${tengo} / ${total} · ${texto.visible}`;

  if (progreso.master) {
    const master = document.createElement('p');
    master.className = 'progreso__master';
    master.textContent = `Master set: ${progreso.master.tengo} / ${progreso.master.total}`;
    bloque.append(master);
  }
  return bloque;
}

// --- Progreso: lista de objetivos ------------------------------

const TIPOS_OBJETIVO = { pokemon: 'Pokémon', expansion: 'Expansión' };

/** Enlace al detalle de un objetivo. */
export const enlaceObjetivo = (o) => `#/progreso?tipo=${o.tipo}&clave=${encodeURIComponent(o.clave)}`;

/** Muestra la lista (true) o el detalle (false) dentro de la pantalla Progreso. */
export function mostrarVistaProgreso(detalle) {
  $('#progreso-lista').hidden = detalle;
  $('#progreso-detalle').hidden = !detalle;
}

/** Texto de estado de la lista ("Cargando tus objetivos…"). */
export function mensajeProgreso(texto, tipo = 'info') {
  escribirMensaje($('#estado-progreso'), texto, tipo);
}

/** Sin objetivos: estado vacío con la telaraña y un acceso a Buscar. */
export function mostrarProgresoVacio() {
  mensajeProgreso('');
  $('#progreso-pie').hidden = true;
  const caja = document.createElement('div');
  caja.className = 'vacio';
  const titulo = document.createElement('p');
  titulo.className = 'vacio__titulo';
  titulo.textContent = 'Todavía no sigues nada.';
  const texto = document.createElement('p');
  texto.textContent = 'Sigue un Pokémon desde la búsqueda o una expansión desde el detalle de una carta.';
  const buscar = document.createElement('a');
  buscar.className = 'boton';
  buscar.href = '#/buscar';
  buscar.dataset.enlaceBuscar = '';
  buscar.textContent = 'Buscar cartas';
  caja.append(titulo, texto, buscar);
  $('#progreso-contenido').replaceChildren(caja);
}

/** No se pudieron cargar los objetivos: estado "No pudimos conectar". */
export function errorProgreso(alReintentar) {
  mensajeProgreso('');
  $('#progreso-pie').hidden = true;
  $('#progreso-contenido').replaceChildren(crearErrorConexion(alReintentar));
}

/** Aviso sobre la lista (listas de TCGdex que no llegaron). null lo quita. */
export function avisoProgreso(alReintentar) {
  $('#progreso-aviso').replaceChildren(...(alReintentar ? [crearErrorConexion(alReintentar, { compacto: true })] : []));
}

/** "Pokémon · #595" o "Expansión". */
const textoTipo = (o) => (o.tipo === 'pokemon' ? `${TIPOS_OBJETIVO.pokemon} · #${o.clave}` : TIPOS_OBJETIVO.expansion);

/**
 * Dibuja la lista de objetivos con su progreso.
 * @param {Array<{objetivo: object, progreso: object|null}>} items
 * @param {{enfocar?: string|null}} [opciones]  enfocar: href del objetivo
 *   que recibe el foco (el que se acaba de seguir desde una sugerencia)
 */
export function mostrarObjetivos(items, { enfocar = null } = {}) {
  mensajeProgreso('');
  dibujarListaObjetivos($('#progreso-contenido'), items, 'objetivo-nombre', enfocar);
}

/**
 * Lista de objetivos en un contenedor (Progreso o Inicio).
 * @param {string} prefijo  para los id de los nombres: no se repiten
 *   entre Progreso e Inicio, que están en la página a la vez
 */
function dibujarListaObjetivos(contenedor, items, prefijo, enfocar = null) {
  // Se redibuja cuando llega cada lista: el foco no debe perderse
  const enfocado = enfocar
    ?? (contenedor.contains(document.activeElement) ? document.activeElement.closest('a')?.getAttribute('href') : null);

  const lista = document.createElement('ul');
  lista.className = 'objetivos';
  lista.append(...items.map(({ objetivo, progreso }) => {
    const idNombre = `${prefijo}-${objetivo.id}`;
    const enlace = document.createElement('a');
    enlace.className = 'objetivo';
    enlace.href = enlaceObjetivo(objetivo);

    const tipo = document.createElement('span');
    tipo.className = 'objetivo__tipo';
    tipo.textContent = textoTipo(objetivo);
    const nombre = document.createElement('span');
    nombre.className = 'objetivo__nombre';
    nombre.id = idNombre;
    nombre.textContent = objetivo.nombre;
    const ver = document.createElement('span');
    ver.className = 'objetivo__ver';
    ver.setAttribute('aria-hidden', 'true');
    ver.textContent = 'Ver faltantes ›';

    enlace.append(tipo, nombre, crearBarraProgreso(progreso, idNombre), ver);
    const item = document.createElement('li');
    item.append(enlace);
    return item;
  }));
  contenedor.replaceChildren(lista);

  if (enfocado) contenedor.querySelector(`a[href="${CSS.escape(enfocado)}"]`)?.focus();
}

// --- Sugerencias -----------------------------------------------

/**
 * Sugerencias para seguir: "Unified Minds · tienes 2 cartas [Seguir]".
 * Sin sugerencias, el contenedor se oculta.
 *
 * @param {string} selector
 * @param {Array<{tipo: string, clave: string, nombre: string, cantidad: number,
 *   ocupado?: boolean, mensaje?: string}>} items
 * @param {(sugerencia: object) => void} alSeguir
 * @param {{titulo?: string, texto?: string}} [textos]
 */
export function mostrarSugerencias(selector, items, alSeguir, { titulo = '', texto = '' } = {}) {
  const caja = $(selector);
  // Al redibujar (Guardando…, error) el foco vuelve al mismo botón
  const enfocada = caja.contains(document.activeElement)
    ? document.activeElement.closest('[data-sugerencia]')?.dataset.sugerencia
    : null;
  caja.hidden = items.length === 0;
  if (items.length === 0) {
    caja.replaceChildren();
    return;
  }

  const hijos = [];
  if (titulo) {
    const h = document.createElement('h3');
    h.className = 'seccion__titulo';
    h.textContent = titulo;
    hijos.push(h);
  }
  if (texto) {
    const p = document.createElement('p');
    p.className = 'sugerencias__texto';
    p.textContent = texto;
    hijos.push(p);
  }

  const lista = document.createElement('ul');
  lista.className = 'sugerencias';
  lista.append(...items.map((s) => {
    const item = document.createElement('li');
    item.className = 'sugerencia seguir seguir--izquierda';
    item.dataset.sugerencia = `${s.tipo}:${s.clave}`;

    const datos = document.createElement('div');
    datos.className = 'sugerencia__datos';
    const tipo = document.createElement('span');
    tipo.className = 'objetivo__tipo';
    tipo.textContent = textoTipo(s);
    const nombre = document.createElement('span');
    nombre.className = 'sugerencia__nombre';
    nombre.textContent = s.nombre;
    const cantidad = document.createElement('span');
    cantidad.className = 'sugerencia__cantidad';
    cantidad.textContent = ` · tienes ${s.cantidad} ${s.cantidad === 1 ? 'carta' : 'cartas'}`;
    const linea = document.createElement('span');
    linea.append(nombre, cantidad);
    datos.append(tipo, linea);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'boton boton--secundario';
    boton.textContent = s.ocupado ? 'Guardando…' : 'Seguir';
    if (!s.ocupado) boton.setAttribute('aria-label', `Seguir ${s.nombre}`);
    // aria-disabled (no disabled) para no perder el foco del teclado
    if (s.ocupado) boton.setAttribute('aria-disabled', 'true');
    boton.addEventListener('click', () => {
      if (boton.getAttribute('aria-disabled') !== 'true') alSeguir(s);
    });

    item.append(datos, boton);
    if (s.mensaje) {
      const mensaje = document.createElement('p');
      mensaje.className = 'seguir__mensaje';
      mensaje.setAttribute('role', 'status');
      mensaje.textContent = s.mensaje;
      item.append(mensaje);
    }
    return item;
  }));
  hijos.push(lista);
  caja.replaceChildren(...hijos);

  if (enfocada) caja.querySelector(`[data-sugerencia="${CSS.escape(enfocada)}"] button`)?.focus();
}

// --- Inicio: tu progreso ---------------------------------------

/**
 * Sección "Tu progreso" de Inicio: los 3 objetivos más recientes o,
 * si no sigue nada, sugerencias. null la oculta.
 *
 * @param {null
 *   | {mensaje: string}
 *   | {alReintentar: () => void}
 *   | {objetivos: Array<{objetivo: object, progreso: object|null}>, enfocar?: string|null}
 *   | {sugerencias: Array, alSeguir: (s: object) => void}} estado
 */
export function mostrarInicioProgreso(estado) {
  $('#inicio-progreso').hidden = !estado;
  $('#inicio-ver-todo').hidden = !estado?.objetivos;
  escribirMensaje($('#estado-inicio-progreso'), estado?.mensaje ?? '', 'info');

  const contenido = $('#inicio-progreso-contenido');
  if (estado?.objetivos) {
    dibujarListaObjetivos(contenido, estado.objetivos, 'inicio-objetivo-nombre', estado.enfocar);
  } else if (estado?.alReintentar) {
    contenido.replaceChildren(crearErrorConexion(estado.alReintentar, { compacto: true }));
  } else {
    contenido.replaceChildren();
  }

  mostrarSugerencias('#inicio-sugerencias', estado?.sugerencias ?? [], estado?.alSeguir, {
    texto: 'Todavía no sigues nada. Según tu colección, puedes empezar por:',
  });
}

/**
 * Pie de la lista: de cuándo son las listas de TCGdex y "Actualizar".
 * @param {null | {fecha: number|null, sinConexion: boolean, alActualizar: () => void}} datos
 */
export function mostrarPieProgreso(datos) {
  const pie = $('#progreso-pie');
  pie.hidden = !datos?.fecha;
  if (!datos?.fecha) return;
  const cuando = new Date(datos.fecha).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const texto = datos.sinConexion
    ? `Sin conexión: se muestran las listas de TCGdex del ${cuando}.`
    : `Listas de TCGdex del ${cuando}.`;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton--texto';
  boton.textContent = 'Actualizar';
  boton.addEventListener('click', () => {
    boton.disabled = true;
    boton.textContent = 'Actualizando…';
    datos.alActualizar();
  });
  pie.replaceChildren(document.createTextNode(texto + ' '), boton);
}

// --- Progreso: detalle de un objetivo -------------------------

/**
 * Cabecera del detalle: tipo, nombre, qué incluye y la barra.
 * @param {{tipo: string, clave: string, nombre: string, progreso: object|null, base?: number|null}} datos
 *   base: último número del set base (expansiones)
 */
export function mostrarCabeceraObjetivo({ tipo, clave, nombre, progreso, base = null }) {
  $('#objetivo-tipo').textContent = textoTipo({ tipo, clave });
  $('#objetivo-titulo').textContent = nombre || 'Cargando…';

  let incluye = '';
  if (tipo === 'pokemon' && nombre) incluye = `Incluye todas las cartas de ${nombre} (#${clave}).`;
  else if (tipo === 'expansion' && base) incluye = `La barra cuenta el set base (hasta el n.º ${base}). El master set suma las cartas secretas.`;
  $('#objetivo-incluye').textContent = incluye;
  $('#objetivo-incluye').hidden = !incluye;

  $('#objetivo-barra').replaceChildren(crearBarraProgreso(progreso, 'objetivo-titulo'));
}

/** Texto de estado del detalle ("Cargando cartas…", errores). */
export function mensajeObjetivo(texto, tipo = 'info') {
  escribirMensaje($('#estado-objetivo'), texto, tipo);
}

/** Cartas del objetivo (mismos parámetros que mostrarCartas). */
export function mostrarCartasObjetivo(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-objetivo'), cartas, marcado, textoVacio);
}

/** No se pudieron traer las cartas del objetivo. */
export function errorObjetivo(alReintentar) {
  mensajeObjetivo('');
  $('#filtros-objetivo').hidden = true;
  $('#grilla-objetivo').replaceChildren(crearErrorConexion(alReintentar));
}

// --- Seguir ----------------------------------------------------

/**
 * "Seguir Joltik" o "Siguiendo Joltik ✓ · Ver progreso · Dejar de seguir".
 * Mientras guarda, los botones quedan con aria-disabled (no disabled)
 * para no perder el foco del teclado.
 *
 * @param {string} selector  contenedor
 * @param {null | {
 *   nombre: string, siguiendo: boolean, ocupado?: boolean, mensaje?: string,
 *   enlace?: string|null, alSeguir: () => void, alDejar: () => void
 * }} estado  null lo oculta
 */
export function mostrarSeguir(selector, estado) {
  const caja = $(selector);
  const teniaFoco = caja.contains(document.activeElement);
  caja.hidden = !estado;
  if (!estado) {
    caja.replaceChildren();
    return;
  }

  const boton = (texto, clase, accion, etiqueta) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    if (estado.ocupado) b.setAttribute('aria-disabled', 'true');
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') !== 'true') accion();
    });
    return b;
  };

  const hijos = [];
  if (estado.siguiendo) {
    const texto = document.createElement('span');
    texto.className = 'seguir__estado';
    texto.textContent = `Siguiendo ${estado.nombre} ✓`;
    hijos.push(texto);
    if (estado.enlace) {
      const ver = document.createElement('a');
      ver.className = 'seguir__enlace';
      ver.href = estado.enlace;
      ver.textContent = 'Ver progreso';
      hijos.push(ver);
    }
    hijos.push(boton(estado.ocupado ? 'Guardando…' : 'Dejar de seguir', 'boton boton--texto', estado.alDejar,
      estado.ocupado ? null : `Dejar de seguir ${estado.nombre}`));
  } else {
    hijos.push(boton(estado.ocupado ? 'Guardando…' : `Seguir ${estado.nombre}`, 'boton boton--secundario', estado.alSeguir));
  }
  if (estado.mensaje) {
    const mensaje = document.createElement('p');
    mensaje.className = 'seguir__mensaje';
    mensaje.setAttribute('role', 'status');
    mensaje.textContent = estado.mensaje;
    hijos.push(mensaje);
  }
  caja.replaceChildren(...hijos);
  if (teniaFoco) caja.querySelector('button, a')?.focus();
}
