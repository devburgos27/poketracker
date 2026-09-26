// =============================================================
// Adaptador de la API de cartas (TCGdex)
// =============================================================
// TODAS las llamadas a la API externa viven en este archivo.
// El resto de la app solo conoce la función buscarCartas() y el
// formato "carta" que devuelve.
//
// Historia: el proyecto empezó con pokemontcg.io, pero esa API
// cierra el 2027-03-01 y ya respondía con errores. Gracias a este
// adaptador, el cambio a TCGdex solo tocó este archivo.
//
// TCGdex es gratuita, open source y no necesita API key.
// Docs: https://tcgdex.dev
// =============================================================

const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql';

// Una sola consulta trae las cartas y la lista de sets.
// La lista de sets aporta dos datos que las cartas no traen:
//   - la fecha de lanzamiento (para ordenar de la más antigua a la más nueva)
//   - la serie (para excluir las cartas digitales de TCG Pocket)
// Nota: no usamos "pagination" porque limita a 100 resultados;
// sin ella la API devuelve todas las cartas.
const CONSULTA = `
  query Buscar($nombre: String!) {
    cards(filters: { name: $nombre }) {
      id
      localId
      name
      image
      rarity
      set { id name cardCount { official } }
    }
    sets { id releaseDate serie { id } }
  }
`;

// Series que no son cartas físicas (TCG Pocket es un juego de celular)
const SERIES_DIGITALES = new Set(['tcgp']);

/**
 * Busca las cartas cuyo nombre contiene el texto indicado.
 * Ejemplo: buscarCartas('Joltik') → Joltik y también "N's Joltik".
 * No distingue mayúsculas de minúsculas.
 *
 * @param {string} nombre
 * @returns {Promise<Array<{
 *   id: string, nombre: string, numero: string, rareza: string,
 *   nombreSet: string, totalSet: number|null, fechaSet: string,
 *   imagenChica: string, imagenGrande: string
 * }>>}
 */
export async function buscarCartas(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return [];

  const respuesta = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CONSULTA, variables: { nombre: limpio } }),
  });

  if (!respuesta.ok) {
    throw new Error(`La API respondió con un error (${respuesta.status}).`);
  }

  const { data, errors } = await respuesta.json();
  if (errors?.length) {
    throw new Error(errors[0].message);
  }

  // Diccionario id de set → { fecha, serie } para buscar rápido
  const infoSets = new Map(
    data.sets.map((s) => [s.id, { fecha: s.releaseDate ?? '', serie: s.serie?.id }]),
  );

  return data.cards
    .filter((c) => !SERIES_DIGITALES.has(infoSets.get(c.set.id)?.serie))
    .map((c) => adaptarCarta(c, infoSets.get(c.set.id)))
    .sort(compararCartas);
}

/**
 * Convierte una carta de TCGdex al formato propio de la app.
 */
function adaptarCarta(c, infoSet) {
  // TCGdex entrega la imagen como URL base; se le agrega calidad y formato.
  // Algunas cartas no tienen imagen todavía: en ese caso queda vacío.
  const base = c.image ?? '';
  return {
    id: c.id,
    nombre: c.name,
    numero: c.localId,
    rareza: c.rarity ?? '',
    nombreSet: c.set?.name ?? '',
    totalSet: c.set?.cardCount?.official ?? null,
    fechaSet: infoSet?.fecha ?? '',
    imagenChica: base ? `${base}/low.webp` : '',
    imagenGrande: base ? `${base}/high.webp` : '',
  };
}

/** Ordena por fecha del set y luego por número dentro del set. */
function compararCartas(a, b) {
  return (
    a.fechaSet.localeCompare(b.fechaSet) ||
    a.numero.localeCompare(b.numero, undefined, { numeric: true })
  );
}
