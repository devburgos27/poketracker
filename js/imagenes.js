// =============================================================
// Imágenes de respaldo para cartas sin imagen en TCGdex
// =============================================================
// Orden: imagen de TCGdex en inglés (la de siempre) → pokemontcg.io →
// TCGdex en otro idioma → recuadro con forma de carta (lo dibuja ui.js).
//
// pokemontcg.io: sale de una lista precalculada
// (datos/imagenes-alternativas.json, hecha con
// herramientas/generar-imagenes.mjs). Ese CDN responde 404 con una
// imagen del reverso, así que no se puede probar a ciegas. El servicio
// cierra y no agrega expansiones nuevas: la lista no necesita
// actualizarse.
//
// Otros idiomas: se pregunta a la API de TCGdex en el momento, por
// expansión completa (un pedido sirve para todas sus cartas sin
// imagen) y se guarda 30 días en localStorage. Primero se pide la lista
// de expansiones de cada idioma, así nunca se pide una que no existe
// (un 404 sería un error rojo en la consola). Solo se usan idiomas con
// los mismos ids de carta que el inglés; japonés, coreano y chinos
// tienen otras expansiones y otros ids (medido el 2026-09-29).
// =============================================================

const URL_LISTA = 'datos/imagenes-alternativas.json';
const API = 'https://api.tcgdex.net/v2';

// El reverso genérico que entrega pokemontcg.io en vez de un 404 normal
const REVERSO = { ancho: 640, alto: 892 };

// En orden de cuántas cartas sin imagen en inglés (ni en pokemontcg.io)
// resuelven, medido el 2026-09-29: es 337, fr 8 más. it, de, pt, es-mx
// y pt-br hoy no agregan ninguna, pero quedan por si TCGdex suma imágenes.
const IDIOMAS = ['es', 'fr', 'it', 'de', 'pt', 'es-mx', 'pt-br'];

export const NOMBRES_IDIOMA = {
  es: 'español',
  fr: 'francés',
  it: 'italiano',
  de: 'alemán',
  pt: 'portugués',
  'es-mx': 'español de México',
  'pt-br': 'portugués de Brasil',
};

const VIGENCIA = 30 * 24 * 60 * 60 * 1000; // 30 días
const PREFIJO = 'pt-img:v1:';

let lista = null; // Promise del JSON (una vez por sesión)
// id de carta → alternativa que cargó bien, o null si ninguna sirvió
const resueltas = new Map();
// clave de localStorage → Promise de sus datos: muchas cartas de la
// misma expansión comparten un solo pedido
const pedidos = new Map();

function cargarLista() {
  lista ??= fetch(URL_LISTA).then((r) => {
    if (!r.ok) throw new Error(`No se pudo cargar ${URL_LISTA} (${r.status}).`);
    return r.json();
  });
  lista.catch(() => { lista = null; }); // si falló, se reintenta la próxima vez
  return lista;
}

function leerGuardado(clave) {
  try {
    const dato = JSON.parse(localStorage.getItem(clave));
    return typeof dato?.fecha === 'number' && Date.now() - dato.fecha < VIGENCIA ? dato : null;
  } catch {
    return null; // sin almacenamiento o dato roto: se pide de nuevo
  }
}

function guardar(clave, dato) {
  try {
    localStorage.setItem(clave, JSON.stringify(dato));
  } catch {
    // Sin almacenamiento o lleno: queda solo en memoria esta sesión
  }
}

/** Lo guardado (si tiene menos de 30 días) o el resultado de pedir(), una vez. */
function guardado(clave, pedir) {
  if (!pedidos.has(clave)) {
    const previo = leerGuardado(clave);
    const promesa = previo ? Promise.resolve(previo) : pedir().then((dato) => {
      const conFecha = { ...dato, fecha: Date.now() };
      guardar(clave, conFecha);
      return conFecha;
    });
    promesa.catch(() => pedidos.delete(clave)); // sin conexión: se reintenta después
    pedidos.set(clave, promesa);
  }
  return pedidos.get(clave);
}

async function pedirJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} en ${url}`);
  return r.json();
}

/** Ids de las expansiones que existen en un idioma. */
const setsDelIdioma = (idioma) => guardado(`${PREFIJO}sets:${idioma}`, async () => ({
  ids: (await pedirJson(`${API}/${idioma}/sets`)).map((s) => s.id),
}));

/**
 * Qué cartas de una expansión tienen imagen en un idioma. Para ocupar
 * poco en localStorage se guardan solo sus números (localId) y la
 * dirección común; las que no siguen ese patrón van completas en "otras".
 */
const imagenesDelSet = (idioma, setId) => guardado(`${PREFIJO}${idioma}:${setId}`, async () => {
  const set = await pedirJson(`${API}/${idioma}/sets/${encodeURIComponent(setId)}`);
  const base = `https://assets.tcgdex.net/${idioma}/${set.serie?.id}/${setId}`;
  const numeros = [];
  const otras = {};
  for (const c of set.cards ?? []) {
    if (!c.image) continue;
    if (c.image === `${base}/${c.localId}`) numeros.push(c.localId);
    else otras[c.localId] = c.image;
  }
  return { base, numeros, otras };
});

/** Dirección base de la imagen de una carta en un idioma, o null. */
async function imagenEnIdioma(idioma, carta, numero) {
  const { ids } = await setsDelIdioma(idioma);
  if (!ids.includes(carta.setId)) return null;
  const set = await imagenesDelSet(idioma, carta.setId);
  if (set.otras[numero]) return set.otras[numero];
  // Igual a como la entrega la API (se comparó así al guardarla)
  return set.numeros.includes(numero) ? `${set.base}/${numero}` : null;
}

/**
 * Imágenes posibles para una carta sin imagen, en orden de preferencia,
 * de a una: la siguiente solo se busca si la anterior no sirvió, así
 * que no se pregunta por otro idioma si ya se vio una.
 * Si ya se sabe cuál sirve (o que ninguna), solo esa (o ninguna).
 * Si algo no se pudo consultar (sin conexión), termina con un error:
 * la carta no debe anotarse como sin imagen.
 *
 * @param {{id: string, setId: string}} carta
 * @returns {AsyncGenerator<{chica: string, grande: string, idioma: string|null}>}
 *   idioma: null si la imagen está en inglés
 */
export async function* alternativas(carta) {
  if (resueltas.has(carta.id)) {
    const conocida = resueltas.get(carta.id);
    if (conocida) yield conocida;
    return;
  }
  // Filas antiguas de la colección sin set_id: no se sabe qué buscar
  if (!carta.setId || !carta.id.startsWith(`${carta.setId}-`)) return;
  // El número tal como está en el id (igual en todos los idiomas)
  const numero = carta.id.slice(carta.setId.length + 1);
  let fallo = null;

  try {
    const datos = await cargarLista();
    const numeroPtcg = datos.pokemontcg.cartas[carta.id];
    const setPtcg = datos.pokemontcg.sets[carta.setId];
    if (numeroPtcg && setPtcg) {
      const base = `https://images.pokemontcg.io/${setPtcg}/${encodeURIComponent(numeroPtcg)}`;
      yield { chica: `${base}.png`, grande: `${base}_hires.png`, idioma: null };
    }
  } catch (error) {
    fallo = error;
  }

  for (const idioma of IDIOMAS) {
    let imagen;
    try {
      imagen = await imagenEnIdioma(idioma, carta, numero);
    } catch (error) {
      // Sin conexión: no se sigue con los demás idiomas (cada uno sería
      // otro pedido fallido); al redibujar se vuelve a intentar
      fallo ??= error;
      break;
    }
    if (imagen) yield { chica: `${imagen}/low.webp`, grande: `${imagen}/high.webp`, idioma };
  }

  if (fallo) throw fallo;
}

/** ¿La imagen cargada es el reverso genérico de pokemontcg.io (una imagen que falta)? */
export const esReverso = (img) => img.naturalWidth === REVERSO.ancho && img.naturalHeight === REVERSO.alto;

/** Anota qué alternativa sirvió (o null): el detalle y los redibujos no vuelven a probar. */
export function recordar(idCarta, alternativa) {
  resueltas.set(idCarta, alternativa);
}
