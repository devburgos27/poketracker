// =============================================================
// Interfaz: grilla y tarjeta de carta
// =============================================================
// Tarjeta de cada carta (imagen, datos, ×N, insignia de acabados) y
// su control de colección: "Agregar a mi colección" o "En tu colección ✓".
// Quitar una carta se hace en el detalle. Tocar la imagen abre el detalle.
// =============================================================

import * as imagenes from '../imagenes.js';
import { crearImg, crearRespaldo, esperarImagen, textoIdioma } from './imagen.js';
import { textoAcabados } from './acabados.js';

// Grilla → lista de sus cartas, tal como se ven. Es la que recorre el
// detalle (anterior / siguiente); sacarDeGrilla() la mantiene al día.
const listas = new WeakMap();

export function dibujarGrilla(grilla, cartas, marcado, textoVacio, opciones = {}) {
  if (cartas.length === 0 && textoVacio) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio grilla__vacio';
    vacio.textContent = textoVacio;
    grilla.replaceChildren(vacio);
    listas.delete(grilla);
    return;
  }
  const lista = [...cartas];
  listas.set(grilla, lista);
  grilla.replaceChildren(...lista.map((carta) => crearTarjeta(carta, marcado, lista, opciones)));
}

/**
 * Saca una carta de la grilla sin redibujar las demás (por ejemplo, la
 * que se agregó estando en "Me falta"). Si el foco quedaba en esa
 * tarjeta, pasa a la siguiente (o a la anterior).
 * @returns {number} cuántas cartas quedan en la grilla
 */
export function sacarDeGrilla(selector, idCarta) {
  const grilla = document.querySelector(selector);
  const lista = listas.get(grilla) ?? [];
  const i = lista.findIndex((c) => c.id === idCarta);
  if (i >= 0) lista.splice(i, 1);
  const tarjeta = grilla.querySelector(`.carta[data-id="${CSS.escape(idCarta)}"]`);
  if (tarjeta) {
    const teniaFoco = tarjeta.contains(document.activeElement) || document.activeElement === document.body;
    const vecina = tarjeta.nextElementSibling ?? tarjeta.previousElementSibling;
    tarjeta.remove();
    if (teniaFoco && vecina) (vecina.querySelector('.marcado__agregar') ?? vecina.querySelector('.carta__imagen'))?.focus();
  }
  return lista.length;
}

/**
 * Crea la tarjeta de una carta.
 * @param {Array} lista  las cartas de la grilla, tal como se ven: el
 *   detalle las recorre con "anterior" / "siguiente"
 * @param {{acabados?: boolean}} [opciones]  acabados: insignia con los
 *   acabados y el sello de tus copias (Colección)
 */
function crearTarjeta(carta, marcado, lista, opciones = {}) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'carta';
  tarjeta.dataset.id = carta.id;
  const guardada = marcado?.misCartas.get(carta.id);
  const copias = guardada?.copias ?? 0;
  const acabados = opciones.acabados ? textoAcabados(guardada) : null;

  // Botón con la imagen: abre el detalle de la carta
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'carta__imagen';
  const extras = [copias > 1 ? `${copias} copias` : '', acabados?.largo ?? ''].filter(Boolean);
  const etiquetaExtras = extras.length ? ` (${extras.join('; ')})` : '';
  boton.setAttribute('aria-label', `Ver detalle de ${carta.nombre}${etiquetaExtras}`);
  boton.addEventListener('click', () => alAbrirCarta(carta, lista));

  ponerImagenTarjeta(boton, tarjeta, carta);

  // "Reverse · Sello" sobre la imagen: acabados especiales y sello de
  // tus copias (el lector de pantalla lo oye en la etiqueta del botón)
  if (acabados) {
    const insignia = document.createElement('span');
    insignia.className = 'carta__acabado badge badge--neutra';
    insignia.setAttribute('aria-hidden', 'true');
    insignia.textContent = acabados.corto;
    boton.append(insignia);
  }

  // "×2" sobre la imagen cuando hay más de una copia
  // (el lector de pantalla ya lo oye en la etiqueta del botón)
  if (copias > 1) {
    const insignia = document.createElement('span');
    insignia.className = 'carta__copias badge badge--marca';
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
  if (marcado) info.append(crearControlColeccion(carta, tarjeta, marcado));
  tarjeta.append(boton, info);
  return tarjeta;
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
 * Control de colección de la tarjeta: "Agregar a mi colección" si no la
 * tengo (en tarjetas angostas se ve "+ Agregar"; el resto lo oculta el
 * CSS), o la insignia "En tu colección ✓" si la tengo (texto, no solo color). Agregar se muestra al instante y se revierte si
 * alCambiar falla (el mensaje de error lo muestra quien llama). Quitar
 * no está aquí: va en el detalle, con confirmación.
 */
function crearControlColeccion(carta, tarjeta, { misCartas, alCambiar }) {
  const control = document.createElement('div');
  control.className = 'marcado';

  const estadoTengo = document.createElement('p');
  estadoTengo.className = 'marcado__estado badge badge--exito';
  estadoTengo.textContent = 'En tu colección ✓';

  const agregar = document.createElement('button');
  agregar.type = 'button';
  agregar.className = 'btn btn-primary marcado__agregar';
  const mas = document.createElement('span');
  mas.className = 'marcado__mas';
  mas.setAttribute('aria-hidden', 'true');
  mas.textContent = '+';
  const resto = document.createElement('span');
  resto.className = 'marcado__resto';
  resto.textContent = ' a mi colección';
  agregar.append(mas, 'Agregar', resto);
  agregar.setAttribute('aria-label', `Agregar ${carta.nombre} ${carta.numero} (${carta.nombreSet}) a mi colección`);

  const pintar = (tengo) => {
    tarjeta.classList.toggle('carta--tengo', tengo);
    control.replaceChildren(tengo ? estadoTengo : agregar);
  };

  agregar.addEventListener('click', async () => {
    if (misCartas.has(carta.id)) return;
    pintar(true);
    try {
      await alCambiar(carta, true);
    } catch {
      pintar(false);
      agregar.focus();
      return;
    }
    // El botón ya no está: si la tarjeta sigue en la grilla, el foco
    // queda en su imagen (si salió de la lista, lo movió sacarDeGrilla)
    if (tarjeta.isConnected && (document.activeElement === document.body || !document.activeElement)) {
      tarjeta.querySelector('.carta__imagen')?.focus();
    }
  });

  pintar(misCartas.has(carta.id));
  return control;
}

let alAbrirCarta = () => {};

/** Qué hacer al tocar la imagen de una tarjeta (abrir el detalle). */
export function prepararCartas({ alAbrir }) {
  alAbrirCarta = alAbrir;
}
/** Devuelve el foco a la tarjeta de una carta (al cerrar el detalle). */
export function enfocarCarta(idCarta) {
  const vista = document.querySelector('main > div:not([hidden])');
  vista?.querySelector(`.carta[data-id="${CSS.escape(idCarta)}"] .carta__imagen`)?.focus();
}
