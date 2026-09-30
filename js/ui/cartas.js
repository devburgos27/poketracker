// =============================================================
// Interfaz: grilla y tarjeta de carta
// =============================================================
// Tarjeta de cada carta (imagen, datos, ×N, insignia de acabados) y
// los botones Tengo / Me falta. Tocar la imagen abre el detalle.
// =============================================================

import * as imagenes from '../imagenes.js';
import { confirmar } from './base.js';
import { crearImg, crearRespaldo, esperarImagen, textoIdioma } from './imagen.js';
import { textoAcabados } from './acabados.js';

export function dibujarGrilla(grilla, cartas, marcado, textoVacio, opciones = {}) {
  if (cartas.length === 0 && textoVacio) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio grilla__vacio';
    vacio.textContent = textoVacio;
    grilla.replaceChildren(vacio);
    return;
  }
  grilla.replaceChildren(...cartas.map((carta) => crearTarjeta(carta, marcado, cartas, opciones)));
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
    insignia.className = 'carta__acabado';
    insignia.setAttribute('aria-hidden', 'true');
    insignia.textContent = acabados.corto;
    boton.append(insignia);
  }

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
