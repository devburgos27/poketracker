// =============================================================
// Interfaz: imágenes de cartas
// =============================================================
// Crear la <img>, esperar a que cargue (con un reintento) y el
// recuadro con forma de carta cuando no hay imagen. Lo usan la
// tarjeta y el detalle.
// =============================================================

import * as imagenes from '../imagenes.js';

// --- Imagen de la carta y respaldo ----------------------------
// Orden: imagen de TCGdex en inglés → pokemontcg.io → TCGdex en otro
// idioma (con la etiqueta "Imagen en italiano", etc.) → recuadro con
// forma de carta. Las alternativas las decide imagenes.js.

export function crearImg(src, carta) {
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
export const ESPERA_REINTENTO = 1000;
export const conReintento = (src) => `${src}${src.includes('?') ? '&' : '?'}reintento=1`;
export const esReintento = (src) => /[?&]reintento=1\b/.test(src);

/**
 * Espera a que una imagen termine de cargar, con un solo reintento si
 * falla. Sirve para <img> en la página y para new Image(); hay que
 * llamarla en el mismo paso en que se le pone el src.
 * @returns {Promise<'ok'|'reverso'|'error'>}  reverso: el genérico de pokemontcg.io
 */
export function esperarImagen(img) {
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
export function crearRespaldo(carta) {
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
export function textoIdioma(idioma) {
  return `Imagen en ${imagenes.NOMBRES_IDIOMA[idioma] ?? idioma}`;
}
