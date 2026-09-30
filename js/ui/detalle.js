// =============================================================
// Interfaz: detalle de carta
// =============================================================
// El <dialog> con la imagen grande y los datos. Lo conecta todo:
// anterior / siguiente (detalle-navegacion.js), "Tus copias"
// (copias.js) y la vista por acabado (acabados.js). Los datos y las
// acciones los maneja detalle-carta.js (sin "ui/").
// =============================================================

import * as imagenes from '../imagenes.js';
import { $ } from './base.js';
import { prepararCartas } from './cartas.js';
import { ESPERA_REINTENTO, conReintento, crearRespaldo, esReintento, esperarImagen, textoIdioma } from './imagen.js';
import { mostrarPosicion, prepararNavegacion } from './detalle-navegacion.js';
import { prepararCopias, reiniciarCopias } from './copias.js';
import { reiniciarVistaAcabado } from './acabados.js';

/**
 * Conecta el detalle con detalle-carta.js.
 * @param {{
 *   alAbrir: (carta: object, lista: Array) => void,
 *   alMover: (paso: -1|1) => void,
 *   alCerrar: () => void,
 *   alSumar: () => void,
 *   alRestar: () => void,
 *   alCambiar: (copia: object, campo: 'idioma'|'condicion', valor: string|null) => void,
 *   alQuitar: (copia: object) => void,
 * }} acciones
 */
export function prepararDetalle(acciones) {
  prepararCartas({ alAbrir: acciones.alAbrir });
  prepararCopias(acciones);

  const dialogo = $('#dialogo-carta');
  $('#dialogo-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    // Clic en el fondo oscurecido: fuera del rectángulo del <dialog>. En
    // escritorio el <dialog> incluye los canales de las flechas, a los
    // lados del panel: un clic ahí (junto a una flecha) no lo cierra.
    if (e.target !== dialogo) return;
    const r = dialogo.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!dentro) dialogo.close();
  });
  dialogo.addEventListener('close', acciones.alCerrar);
  $('#copias-sumar').addEventListener('click', acciones.alSumar);
  $('#copias-restar').addEventListener('click', acciones.alRestar);

  $('#detalle-imagen').addEventListener('error', alFallarImagenDetalle);
  prepararNavegacion(dialogo, acciones.alMover);
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

/**
 * Abre el detalle con los datos que ya se tienen de la carta.
 * @param {{indice: number, total: number}} posicion  en la lista de la pantalla
 */
export function abrirDetalle(carta, posicion) {
  $('#detalle-anuncio').textContent = '';
  mostrarCartaDetalle(carta, posicion);
  $('#dialogo-carta').showModal();
}

/** Con el detalle abierto, pasa a otra carta de la lista. */
export function cambiarCartaDetalle(carta, posicion) {
  mostrarCartaDetalle(carta, posicion);
  // Transición breve (sin movimiento con prefers-reduced-motion)
  const cuerpo = $('#dialogo-carta .detalle__cuerpo');
  cuerpo.classList.remove('detalle__cuerpo--entrando');
  void cuerpo.offsetWidth; // reinicia la animación si se cambia rápido
  cuerpo.classList.add('detalle__cuerpo--entrando');
  // El título cambia sin mover el foco: se anuncia para lectores de pantalla
  $('#detalle-anuncio').textContent = `${carta.nombre}, ${posicion.indice + 1} de ${posicion.total}`;
}

/**
 * Tras cambiar de carta, si el control con el foco desapareció (una
 * copia de la carta anterior, "Seguir"…), el foco va a una flecha.
 * Se llama cuando detalle-carta.js terminó de dibujar la carta nueva.
 */
export function conservarFocoDetalle() {
  const dialogo = $('#dialogo-carta');
  if (dialogo.contains(document.activeElement) && document.activeElement !== dialogo) return;
  const flecha = [$('#detalle-siguiente'), $('#detalle-anterior')].find((b) => !b.hidden && !b.disabled);
  (flecha ?? $('#dialogo-cerrar')).focus();
}

function mostrarCartaDetalle(carta, posicion) {
  reiniciarVistaAcabado();
  cargarImagenDetalle(carta);
  mostrarDatosDetalle(carta);
  mostrarPosicion(posicion);
  reiniciarCopias();
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
