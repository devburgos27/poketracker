// =============================================================
// Filtros y orden de una lista de cartas (Buscar y Colección)
// =============================================================
// Todo en el navegador, sobre las cartas que ya llegaron: filtrar u
// ordenar no hace consultas nuevas. Los filtros viven en la URL
// (#/buscar?q=joltik&set=sv04&rareza=Rare&orden=numero) para que
// Atrás, recargar y compartir el enlace los mantengan.
//
// "set" y "rareza" son filtros (los quita "Limpiar filtros");
// "orden" solo cambia el orden. Colección no filtra por rareza
// porque no la guarda.
// =============================================================

/** Nombres de los órdenes, en el orden en que aparecen en el select. */
export const NOMBRES_ORDEN = {
  fecha: 'Fecha de la expansión',
  numero: 'Número',
  nombre: 'Nombre',
  rareza: 'Rareza',
};

// Rarezas de TCGdex de la más común a la más rara (lista de
// /v2/en/rarities, 2026-09-28). Las de TCG Pocket (diamantes,
// estrellas) no aparecen: esas cartas no se muestran. Una rareza
// desconocida va después de las conocidas; "Promo" y sin rareza, al final.
const RAREZAS = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Holo Rare', 'Rare PRIME', 'Rare Holo LV.X', 'LEGEND',
  'Holo Rare V', 'Holo Rare VMAX', 'Holo Rare VSTAR', 'Double rare', 'Radiant Rare', 'Amazing Rare',
  'ACE SPEC Rare', 'Classic Collection', 'Full Art Trainer', 'Ultra Rare', 'Shiny rare', 'Shiny rare V',
  'Shiny rare VMAX', 'Shiny Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Secret Rare',
  'Hyper rare', 'Mega Hyper Rare', 'Black White Rare', 'Crown',
];
const AL_FINAL = ['Promo', 'None', ''];

function posicionRareza(rareza) {
  const i = RAREZAS.indexOf(rareza);
  if (i !== -1) return i;
  return RAREZAS.length + 1 + AL_FINAL.indexOf(rareza); // desconocida: RAREZAS.length
}

// Cada orden desempata con el de fecha, así el resultado es estable
const porNumero = (a, b) => a.numero.localeCompare(b.numero, undefined, { numeric: true });
const porFecha = (a, b) => a.fechaSet.localeCompare(b.fechaSet) || a.setId.localeCompare(b.setId) || porNumero(a, b);
const COMPARADORES = {
  fecha: porFecha,
  numero: (a, b) => porNumero(a, b) || porFecha(a, b),
  nombre: (a, b) => a.nombre.localeCompare(b.nombre) || porFecha(a, b),
  rareza: (a, b) => posicionRareza(a.rareza) - posicionRareza(b.rareza) || porFecha(a, b),
};

/**
 * Configuración de cada pantalla.
 * base: el orden en que ya llegan las cartas (no hace falta ordenarlas).
 */
export const BUSCAR = { ordenes: ['fecha', 'numero', 'nombre', 'rareza'], base: 'fecha', conRareza: true };
export const COLECCION = { ordenes: ['nombre', 'fecha', 'numero'], base: 'nombre', conRareza: false };

/**
 * Lee los filtros de la URL. Un orden que no existe vuelve al de base.
 * @returns {{set: string, rareza: string, orden: string}}
 */
export function leerFiltros(params, config) {
  const orden = params.get('orden');
  return {
    set: params.get('set') ?? '',
    rareza: config.conRareza ? params.get('rareza') ?? '' : '',
    orden: config.ordenes.includes(orden) ? orden : config.base,
  };
}

/** Agrega los filtros activos a los parámetros de la URL (el orden de base no se escribe). */
export function escribirFiltros(params, filtros, config) {
  if (filtros.set) params.set('set', filtros.set);
  if (filtros.rareza) params.set('rareza', filtros.rareza);
  if (filtros.orden !== config.base) params.set('orden', filtros.orden);
  return params;
}

/** ¿Hay algún filtro (no orden) activo? */
export const hayFiltros = (f) => Boolean(f.set || f.rareza);

// "set" puede traer varias expansiones separadas por coma (set=basep,bwp):
// pasa cuando el texto de expansión de la búsqueda ("pikachu 025 promos")
// coincide con más de una. Los id de set no llevan comas.
const idsDeSet = (set) => (set ? set.split(',') : []);

/**
 * Las cartas que pasan los filtros.
 * @param {'set'|'rareza'} [ignorar]  para contar las opciones de un select
 *   con los demás filtros aplicados
 */
export function filtrar(cartas, filtros, ignorar = null) {
  const sets = idsDeSet(filtros.set);
  return cartas.filter((c) =>
    (ignorar === 'set' || !sets.length || sets.includes(c.setId)) &&
    (ignorar === 'rareza' || !filtros.rareza || c.rareza === filtros.rareza));
}

/**
 * Texto comparable: sin tildes, mayúsculas, apóstrofos, símbolos ni
 * espacios, y "&" igual que "and". Así "black and white" y
 * "black & white" encuentran "Black & White"; "champions path",
 * "Champion's Path"; y "fire red", "FireRed & LeafGreen".
 */
function normalizar(texto) {
  return texto
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, '');
}

/**
 * Las expansiones de estas cartas cuyo nombre o id contiene el texto
 * ("wizards" → basep; "sv04" → sv04; "black" → bw1 y las Black Star Promos
 * que haya entre las cartas). Sin coincidencias, [].
 * @returns {string[]} ids de set
 */
export function setsQueCoinciden(cartas, texto) {
  const buscado = normalizar(texto);
  if (!buscado) return [];
  const sets = new Set();
  for (const c of cartas) {
    if (c.setId && (normalizar(c.nombreSet).includes(buscado) || normalizar(c.setId).includes(buscado))) sets.add(c.setId);
  }
  return [...sets];
}

/** Ordena sin tocar el arreglo original. */
export function ordenar(cartas, orden, config) {
  if (orden === config.base) return cartas;
  return [...cartas].sort(COMPARADORES[orden]);
}

/**
 * Opciones del select de expansión: las presentes en las cartas, con
 * cantidad (contando los demás filtros), de la más antigua a la más
 * nueva. La elegida aparece aunque quede en 0 (enlace editado a mano).
 * @returns {Array<{valor: string, texto: string, cantidad: number}>}
 */
export function opcionesSet(cartas, filtros) {
  const sets = new Map();
  for (const c of filtrar(cartas, filtros, 'set')) {
    if (!c.setId) continue;
    const s = sets.get(c.setId) ?? { valor: c.setId, texto: c.nombreSet || c.setId, cantidad: 0, fecha: c.fechaSet };
    s.cantidad++;
    sets.set(c.setId, s);
  }
  const elegidos = idsDeSet(filtros.set);
  if (elegidos.length === 1 && !sets.has(filtros.set)) {
    const carta = cartas.find((c) => c.setId === filtros.set);
    sets.set(filtros.set, { valor: filtros.set, texto: carta?.nombreSet || filtros.set, cantidad: 0, fecha: '' });
  }
  const opciones = [...sets.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.texto.localeCompare(b.texto));
  if (elegidos.length > 1) {
    // Varias a la vez (desde el texto de la búsqueda): una opción que las
    // nombra todas, primero, para que se vea qué se filtró
    // Con más de 2 se nombran las 2 primeras: "A + B + 8 más"
    const incluidas = elegidos.map((id) => sets.get(id) ?? { texto: id, cantidad: 0 });
    const nombres = incluidas.slice(0, 2).map((s) => s.texto);
    if (incluidas.length > 2) nombres.push(`${incluidas.length - 2} más`);
    opciones.unshift({
      valor: filtros.set,
      texto: nombres.join(' + '),
      cantidad: incluidas.reduce((suma, s) => suma + s.cantidad, 0),
    });
  }
  return opciones;
}

/** Opciones del select de rareza, de la más común a la más rara. */
export function opcionesRareza(cartas, filtros) {
  const rarezas = new Map();
  for (const c of filtrar(cartas, filtros, 'rareza')) {
    if (!c.rareza) continue;
    rarezas.set(c.rareza, (rarezas.get(c.rareza) ?? 0) + 1);
  }
  if (filtros.rareza && !rarezas.has(filtros.rareza)) rarezas.set(filtros.rareza, 0);
  return [...rarezas]
    .map(([valor, cantidad]) => ({ valor, texto: valor, cantidad }))
    .sort((a, b) => posicionRareza(a.valor) - posicionRareza(b.valor) || a.valor.localeCompare(b.valor));
}
