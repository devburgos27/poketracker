// =============================================================
// Imágenes de respaldo para cartas sin imagen en TCGdex
// =============================================================
// Orden: imagen de TCGdex en inglés (la de siempre) → pokemontcg.io →
// TCGdex en otro idioma → recuadro con forma de carta (lo dibuja ui.js).
//
// Las dos alternativas salen de una lista precalculada
// (datos/imagenes-alternativas.json, se regenera con
// herramientas/generar-imagenes.mjs). Se descarga una vez, y solo
// cuando aparece una carta sin imagen. Solo se prueban imágenes que
// están en la lista: pokemontcg.io responde 404 con una imagen del
// reverso, así que probar a ciegas mostraría reversos (y errores
// rojos en la consola).
// =============================================================

const URL_LISTA = 'datos/imagenes-alternativas.json';

// El reverso genérico que entrega pokemontcg.io en vez de un 404 normal
const REVERSO = { ancho: 640, alto: 892 };

export const NOMBRES_IDIOMA = { es: 'español', fr: 'francés', it: 'italiano', de: 'alemán', pt: 'portugués' };

let lista = null; // Promise del JSON (una vez por sesión)
// id de carta → alternativa que cargó bien, o null si ninguna sirvió
const resueltas = new Map();

function cargarLista() {
  lista ??= fetch(URL_LISTA).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar ${URL_LISTA} (${r.status}).`);
    return r.json();
  });
  lista.catch(() => { lista = null; }); // si falló, se reintenta la próxima vez
  return lista;
}

/**
 * Imágenes posibles para una carta sin imagen, en orden de preferencia.
 * Si ya se sabe cuál sirve (o que ninguna), solo esa (o ninguna).
 *
 * @param {{id: string, setId: string, numero: string}} carta
 * @returns {Promise<null | Array<{chica: string, grande: string, idioma: string|null}>>}
 *   idioma: null si la imagen está en inglés. null (no un arreglo): la
 *   lista no se pudo descargar; no hay que anotar la carta como sin imagen
 */
export async function alternativas(carta) {
  if (resueltas.has(carta.id)) {
    const conocida = resueltas.get(carta.id);
    return conocida ? [conocida] : [];
  }
  if (!carta.setId) return []; // filas antiguas de la colección sin set_id

  let datos;
  try {
    datos = await cargarLista();
  } catch (error) {
    console.error(error); // sin lista: queda el recuadro de respaldo
    return null;
  }

  const opciones = [];
  const numeroPtcg = datos.pokemontcg.cartas[carta.id];
  const setPtcg = datos.pokemontcg.sets[carta.setId];
  if (numeroPtcg && setPtcg) {
    const base = `https://images.pokemontcg.io/${setPtcg}/${encodeURIComponent(numeroPtcg)}`;
    opciones.push({ chica: `${base}.png`, grande: `${base}_hires.png`, idioma: null });
  }
  const idioma = datos.idiomas.cartas[carta.id];
  const serie = datos.idiomas.series[carta.setId];
  if (idioma && serie && carta.numero) {
    const base = `https://assets.tcgdex.net/${idioma}/${serie}/${carta.setId}/${encodeURIComponent(carta.numero)}`;
    opciones.push({ chica: `${base}/low.webp`, grande: `${base}/high.webp`, idioma });
  }
  return opciones;
}

/** ¿La imagen cargada es el reverso genérico de pokemontcg.io (una imagen que falta)? */
export const esReverso = (img) => img.naturalWidth === REVERSO.ancho && img.naturalHeight === REVERSO.alto;

/** Anota qué alternativa sirvió (o null): el detalle y los redibujos no vuelven a probar. */
export function recordar(idCarta, alternativa) {
  resueltas.set(idCarta, alternativa);
}
