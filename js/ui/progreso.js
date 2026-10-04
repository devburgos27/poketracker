// =============================================================
// Interfaz: progreso y objetivos
// =============================================================
// Barra de progreso, lista y detalle de objetivos, sugerencias,
// "Tu progreso" de Inicio y los botones Seguir. Los datos los
// maneja objetivos.js.
// =============================================================

import { $, crearErrorConexion, escribirMensaje } from './base.js';
import { dibujarGrilla } from './cartas.js';

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
function crearBarraProgreso(progreso, idEtiqueta) {
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
  buscar.className = 'btn btn-primary';
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
    enlace.className = 'tarjeta-lista tarjeta-lista--objetivo';
    enlace.href = enlaceObjetivo(objetivo);

    const tipo = document.createElement('span');
    tipo.className = 'tarjeta-lista__antetitulo';
    tipo.textContent = textoTipo(objetivo);
    const nombre = document.createElement('span');
    nombre.className = 'tarjeta-lista__nombre';
    nombre.id = idNombre;
    nombre.textContent = objetivo.nombre;
    const ver = document.createElement('span');
    ver.className = 'tarjeta-lista__ver';
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
    item.className = 'tarjeta-lista tarjeta-lista--sugerencia seguir seguir--izquierda';
    item.dataset.sugerencia = `${s.tipo}:${s.clave}`;

    // Compacta: ícono del tipo (rayo = Pokémon, cartas = expansión), el
    // nombre y debajo "Pokémon · #595 · tienes 2 cartas"
    const icono = crearIcono(s.tipo === 'pokemon' ? 'icono-rayo' : 'icono-coleccion');
    icono.classList.add('tarjeta-lista__icono');
    const datos = document.createElement('div');
    datos.className = 'tarjeta-lista__datos';
    const nombre = document.createElement('span');
    nombre.className = 'tarjeta-lista__nombre';
    nombre.textContent = s.nombre;
    const detalle = document.createElement('span');
    detalle.className = 'tarjeta-lista__detalle';
    detalle.textContent = `${textoTipo(s)} · tienes ${s.cantidad} ${s.cantidad === 1 ? 'carta' : 'cartas'}`;
    datos.append(nombre, detalle);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn btn-outline-secondary';
    boton.textContent = s.ocupado ? 'Guardando…' : 'Seguir';
    if (!s.ocupado) boton.setAttribute('aria-label', `Seguir ${s.nombre}`);
    // aria-disabled (no disabled) para no perder el foco del teclado
    if (s.ocupado) boton.setAttribute('aria-disabled', 'true');
    boton.addEventListener('click', () => {
      if (boton.getAttribute('aria-disabled') !== 'true') alSeguir(s);
    });

    item.append(icono, datos, boton);
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
  boton.className = 'btn btn-link';
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
  // Siguiendo: un solo recuadro con el estado, "Ver progreso" y "Dejar de seguir"
  caja.classList.toggle('seguir--siguiendo', Boolean(estado?.siguiendo));
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
    texto.prepend(crearIcono('icono-progreso'));
    hijos.push(texto);
    if (estado.enlace) {
      const ver = document.createElement('a');
      ver.className = 'seguir__enlace enlace-suelto';
      ver.href = estado.enlace;
      ver.textContent = 'Ver progreso';
      hijos.push(ver);
    }
    hijos.push(boton(estado.ocupado ? 'Guardando…' : 'Dejar de seguir', 'btn btn-link', estado.alDejar,
      estado.ocupado ? null : `Dejar de seguir ${estado.nombre}`));
  } else {
    const seguir = boton(estado.ocupado ? 'Guardando…' : `Seguir ${estado.nombre}`, 'btn btn-outline-secondary', estado.alSeguir);
    seguir.prepend(crearIcono('icono-progreso'));
    hijos.push(seguir);
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

/** Ícono de línea (<svg><use href="#…">), decorativo. */
function crearIcono(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icono');
  svg.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', `#${id}`);
  svg.append(uso);
  return svg;
}
