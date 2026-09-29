// =============================================================
// Adaptador de la API de cartas (TCGdex)
// =============================================================
// TODAS las llamadas a la API externa viven en este archivo.
// El resto de la app solo conoce las funciones exportadas y el
// formato "carta" que devuelven.
//
// Historia: el proyecto empezó con pokemontcg.io, pero esa API
// cierra el 2027-03-01 y ya respondía con errores. Gracias a este
// adaptador, el cambio a TCGdex solo tocó este archivo.
//
// TCGdex es gratuita, open source y no necesita API key.
// Docs: https://tcgdex.dev
// =============================================================

const GRAPHQL_URL = 'https://api.tcgdex.net/v2/graphql';

// Series que no son cartas físicas (TCG Pocket es un juego de celular)
const SERIES_DIGITALES = new Set(['tcgp']);

/** Hace una consulta GraphQL y devuelve "data" (o lanza el error). */
async function consultar(query, variables = {}) {
  const respuesta = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!respuesta.ok) {
    throw new Error(`La API respondió con un error (${respuesta.status}).`);
  }

  const { data, errors } = await respuesta.json();
  if (errors?.length) {
    throw new Error(errors[0].message);
  }
  return data;
}

// --- Sets: fecha y serie ---------------------------------------
// La lista de sets aporta dos datos que las cartas no traen:
//   - la fecha de lanzamiento (para ordenar de la más antigua a la más nueva)
//   - la serie (para excluir las cartas digitales de TCG Pocket)

const CAMPOS_SETS = 'sets { id releaseDate serie { id } }';
let infoSetsGuardada = null; // Promise<Map> de la sesión

/** Diccionario id de set → { fecha, serie }. */
function armarInfoSets(sets) {
  return new Map(sets.map((s) => [s.id, { fecha: s.releaseDate ?? '', serie: s.serie?.id }]));
}

/** La lista de sets, pedida una vez por sesión. */
function obtenerInfoSets() {
  infoSetsGuardada ??= consultar(`{ ${CAMPOS_SETS} }`).then((data) => armarInfoSets(data.sets));
  infoSetsGuardada.catch(() => { infoSetsGuardada = null; }); // si falló, se reintenta la próxima vez
  return infoSetsGuardada;
}

const esDigital = (setId, infoSets) => SERIES_DIGITALES.has(infoSets.get(setId)?.serie);

/**
 * Fecha de lanzamiento de cada set ("AAAA-MM-DD"), de la misma lista
 * pedida una vez por sesión. La usa Colección para ordenar por fecha.
 * @returns {Promise<Map<string, string>>}
 */
export async function fechasDeSets() {
  const infoSets = await obtenerInfoSets();
  return new Map([...infoSets].map(([id, info]) => [id, info.fecha]));
}

// --- Búsqueda --------------------------------------------------

// Una sola consulta trae las cartas y la lista de sets.
// dexId: número de Pokédex (para "Seguir" un Pokémon).
// Nota: no usamos "pagination" porque limita a 100 resultados;
// sin ella la API devuelve todas las cartas.
const CAMPOS_CARTA = 'id localId name image rarity dexId set { id name cardCount { official } }';
const CONSULTA = `
  query Buscar($nombre: String!) {
    cards(filters: { name: $nombre }) { ${CAMPOS_CARTA} }
    ${CAMPOS_SETS}
  }
`;

/**
 * Busca las cartas cuyo nombre contiene el texto indicado.
 * Ejemplo: buscarCartas('Joltik') → Joltik y también "N's Joltik".
 * No distingue mayúsculas de minúsculas.
 *
 * @param {string} nombre
 * @returns {Promise<Array<{
 *   id: string, nombre: string, numero: string, rareza: string, dexIds: number[],
 *   setId: string, nombreSet: string, totalSet: number|null, fechaSet: string,
 *   imagenChica: string, imagenGrande: string
 * }>>}
 */
export async function buscarCartas(nombre) {
  const limpio = nombre.trim();
  if (!limpio) return [];

  const data = await consultar(CONSULTA, { nombre: limpio });
  const infoSets = armarInfoSets(data.sets);
  infoSetsGuardada ??= Promise.resolve(infoSets); // de paso queda para los objetivos

  return data.cards
    .filter((c) => !esDigital(c.set.id, infoSets))
    .map((c) => adaptarCarta(c, infoSets.get(c.set.id)))
    .sort(compararCartas);
}

// --- Búsqueda por número ---------------------------------------
// El filtro localId de TCGdex es "contiene" ("25" trae 125, 225, TG25)
// y no hay coincidencia exacta (eq:25 devuelve 0, también en REST):
// el número exacto se filtra aquí. Medido el 2026-09-28: "25" = 380
// cartas (80 KB), 149 con número exacto; "1" = 2,1 MB. Por eso:
//   "Pikachu 025": nombre + número en una consulta (siempre chica).
//   "025/182": sets con ese total impreso, sus cartas (solo ids) y
//     luego los datos completos solo de las que coinciden.
//   "150" solo: la consulta por número (main.js no la hace si es < 100).
// Números con letras (TG25, SV001) no se buscan por ahora.

/** ¿El número de la carta (localId) es exactamente ese? "025" = 25; "TG25" no. */
const esNumero = (localId, numero) => /^\d+$/.test(localId ?? '') && Number(localId) === numero;

const CONSULTA_NUMERO = `
  query Numero($numero: String!) {
    cards(filters: { localId: $numero }) { ${CAMPOS_CARTA} }
    ${CAMPOS_SETS}
  }
`;
const CONSULTA_NOMBRE_NUMERO = `
  query NombreNumero($nombre: String!, $numero: String!) {
    cards(filters: { name: $nombre, localId: $numero }) { ${CAMPOS_CARTA} }
    ${CAMPOS_SETS}
  }
`;

let totalesGuardados = null; // Promise<Map id de set → total impreso> de la sesión

/** Total impreso (cardCount.official) de cada set físico, pedido una vez por sesión. */
function obtenerTotalesSets() {
  totalesGuardados ??= consultar('{ sets { id cardCount { official } serie { id } } }').then((data) => new Map(
    data.sets
      .filter((s) => !SERIES_DIGITALES.has(s.serie?.id))
      .map((s) => [s.id, s.cardCount?.official ?? null]),
  ));
  totalesGuardados.catch(() => { totalesGuardados = null; }); // si falló, se reintenta la próxima vez
  return totalesGuardados;
}

/**
 * Busca cartas por número, con nombre o total impreso opcionales.
 * Mismo formato y orden que buscarCartas().
 *
 * @param {{numero: number, nombre?: string, total?: number}} busqueda
 */
export async function buscarPorNumero({ numero, nombre = '', total = null }) {
  if (nombre || total === null) {
    const data = nombre
      ? await consultar(CONSULTA_NOMBRE_NUMERO, { nombre, numero: String(numero) })
      : await consultar(CONSULTA_NUMERO, { numero: String(numero) });
    const infoSets = armarInfoSets(data.sets);
    infoSetsGuardada ??= Promise.resolve(infoSets);
    return data.cards
      .filter((c) => esNumero(c.localId, numero) && !esDigital(c.set.id, infoSets))
      .filter((c) => total === null || c.set.cardCount?.official === total)
      .map((c) => adaptarCarta(c, infoSets.get(c.set.id)))
      .sort(compararCartas);
  }

  // "025/182": los sets con ese total, y de ellos las cartas con ese número
  const totales = await obtenerTotalesSets();
  const sets = [...totales].filter(([, t]) => t === total).map(([id]) => id);
  if (sets.length === 0) return [];
  const listas = await consultar(`{ ${sets.map((id, i) => `s${i}: set(id: ${JSON.stringify(id)}) { cards { id localId } }`).join(' ')} }`);
  const ids = sets.flatMap((_, i) => (listas[`s${i}`]?.cards ?? []).filter((c) => esNumero(c.localId, numero)).map((c) => c.id));
  if (ids.length === 0) return [];

  // Datos completos (rareza, imagen, set) solo de las coincidencias
  const [data, infoSets] = await Promise.all([
    consultar(`{ ${ids.map((id, i) => `c${i}: card(id: ${JSON.stringify(id)}) { ${CAMPOS_CARTA} }`).join(' ')} }`),
    obtenerInfoSets(),
  ]);
  return ids
    .map((id, i) => data[`c${i}`])
    // card(id) también es aproximado ("sv04-25" trae sv04-250): se confirma el id
    .filter((c, i) => c?.id === ids[i])
    .map((c) => adaptarCarta(c, infoSets.get(c.set.id)))
    .sort(compararCartas);
}

const CONSULTA_CARTA = `
  query Carta($id: ID!) {
    card(id: $id) { ${CAMPOS_CARTA} }
  }
`;

/**
 * Trae una sola carta por su id (ej: "bw3-40"), en el mismo formato
 * que buscarCartas(). Sirve para completar datos que la colección no
 * guarda, como la rareza. Devuelve null si la carta no existe.
 *
 * @param {string} id
 */
export async function obtenerCarta(id) {
  const data = await consultar(CONSULTA_CARTA, { id });
  return data.card ? adaptarCarta(data.card) : null;
}

// --- Objetivos: listas de cartas -------------------------------
// Un objetivo es un Pokémon (por número de Pokédex) o una expansión
// (por id del set). Para el progreso basta con los ids de sus cartas:
//   ids:  todas las cartas (en expansiones, el "master set")
//   base: solo expansiones, el set base: número (localId) numérico y
//         menor o igual a cardCount.official. null si no se puede calcular.
// Las listas se guardan 24 h en localStorage: cambian solo cuando sale
// un set nuevo, y así la pantalla Progreso no depende de la red.

const TANDA_OBJETIVOS = 10;               // objetivos por pedido
const VIGENCIA_LISTA = 24 * 60 * 60 * 1000; // 24 h
const listasEnMemoria = new Map();

const claveCache = (o) => `pt-obj:v1:${o.tipo}:${o.clave}`;

function leerListaGuardada(o) {
  try {
    const lista = JSON.parse(localStorage.getItem(claveCache(o)));
    return Array.isArray(lista?.ids) && typeof lista.fecha === 'number' ? lista : null;
  } catch {
    return null; // sin almacenamiento o dato roto: se pide de nuevo
  }
}

function guardarLista(o, lista) {
  listasEnMemoria.set(claveCache(o), lista);
  try {
    localStorage.setItem(claveCache(o), JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (modo privado estricto): queda solo en memoria
  }
}

/** Borra la lista guardada de un objetivo (al dejar de seguirlo). */
export function olvidarLista(o) {
  listasEnMemoria.delete(claveCache(o));
  try {
    localStorage.removeItem(claveCache(o));
  } catch {
    // Sin almacenamiento: no había nada guardado
  }
}

/** Set base: número (localId) solo con dígitos y <= cardCount.official. */
function esDelSetBase(localId, oficial) {
  return /^\d+$/.test(localId) && Number(localId) <= oficial;
}

/** Parte de la consulta agrupada para un objetivo (con alias). */
function consultaDeLista(o, alias) {
  if (o.tipo === 'pokemon') {
    return `${alias}: cards(filters: { dexId: ${Number(o.clave)} }) { id set { id } }`;
  }
  return `${alias}: set(id: ${JSON.stringify(o.clave)}) { cardCount { official } cards { id localId } }`;
}

/**
 * Convierte la respuesta de un objetivo en { ids, base, fecha }.
 * Un set que no existe (null) o un Pokémon sin cartas queda con
 * noDisponible: true.
 */
function armarLista(o, dato, infoSets) {
  const fecha = Date.now();
  if (o.tipo === 'pokemon') {
    const ids = (dato ?? []).filter((c) => !esDigital(c.set?.id, infoSets)).map((c) => c.id);
    return ids.length ? { ids, base: null, fecha } : { ids: [], base: null, fecha, noDisponible: true };
  }
  if (!dato?.cards?.length) return { ids: [], base: null, fecha, noDisponible: true };
  const oficial = dato.cardCount?.official;
  return {
    ids: dato.cards.map((c) => c.id),
    base: oficial ? dato.cards.filter((c) => esDelSetBase(c.localId, oficial)).map((c) => c.id) : null,
    fecha,
  };
}

/**
 * Listas de cartas de varios objetivos.
 * Primero entrega lo guardado (aunque tenga más de 24 h) y después
 * pide a TCGdex lo que falta o venció, en tandas de 10 objetivos por
 * pedido (alias de GraphQL). Cada lista se entrega apenas llega.
 *
 * @param {Array<{tipo: string, clave: string}>} objetivos
 * @param {(objetivo: object, lista: {ids: string[], base: string[]|null, fecha: number, noDisponible?: boolean}) => void} alLlegar
 * @param {{forzar?: boolean}} [opciones]  forzar: pide todo de nuevo (botón "Actualizar")
 * @returns {Promise<{fallidos: object[]}>} objetivos que no se pudieron pedir (sin conexión)
 */
export async function cargarListasObjetivos(objetivos, alLlegar, { forzar = false } = {}) {
  const pendientes = [];
  for (const o of objetivos) {
    const guardada = listasEnMemoria.get(claveCache(o)) ?? leerListaGuardada(o);
    if (guardada) {
      listasEnMemoria.set(claveCache(o), guardada);
      alLlegar(o, guardada);
    }
    if (forzar || !guardada || Date.now() - guardada.fecha > VIGENCIA_LISTA) pendientes.push(o);
  }
  if (pendientes.length === 0) return { fallidos: [] };

  let infoSets;
  try {
    infoSets = await obtenerInfoSets();
  } catch (error) {
    console.error(error);
    return { fallidos: pendientes };
  }

  const fallidos = [];
  for (let i = 0; i < pendientes.length; i += TANDA_OBJETIVOS) {
    const tanda = pendientes.slice(i, i + TANDA_OBJETIVOS);
    try {
      const data = await consultar(`{ ${tanda.map((o, j) => consultaDeLista(o, `o${j}`)).join(' ')} }`);
      tanda.forEach((o, j) => {
        const lista = armarLista(o, data[`o${j}`], infoSets);
        guardarLista(o, lista);
        alLlegar(o, lista);
      });
    } catch (error) {
      console.error(error);
      fallidos.push(...tanda);
    }
  }
  return { fallidos };
}

/**
 * Todas las cartas de un objetivo, con imagen y datos (para su detalle).
 * De paso actualiza la lista guardada del objetivo.
 * Devuelve null si el set no existe o el Pokémon no tiene cartas.
 *
 * @param {{tipo: string, clave: string}} o
 * @returns {Promise<null | {nombre: string, cartas: Array, lista: object}>}
 */
export async function obtenerCartasObjetivo(o) {
  const infoSets = await obtenerInfoSets();

  if (o.tipo === 'pokemon') {
    const data = await consultar(`{ cards(filters: { dexId: ${Number(o.clave)} }) { ${CAMPOS_CARTA} } }`);
    const cartas = data.cards
      .filter((c) => !esDigital(c.set.id, infoSets))
      .map((c) => adaptarCarta(c, infoSets.get(c.set.id)))
      .sort(compararCartas);
    if (cartas.length === 0) return null;
    const lista = { ids: cartas.map((c) => c.id), base: null, fecha: Date.now() };
    guardarLista(o, lista);
    return { nombre: nombreMasComun(cartas), cartas, lista };
  }

  // Dentro de "set" TCGdex entrega cada carta resumida: pedir la rareza
  // aquí hace fallar toda la consulta. Llega después, en el detalle.
  const data = await consultar(`{ set(id: ${JSON.stringify(o.clave)}) {
    id name cardCount { official } cards { id localId name image }
  } }`);
  const set = data.set;
  if (!set?.cards?.length) return null;
  const oficial = set.cardCount?.official;
  const infoSet = infoSets.get(set.id);
  const cartas = set.cards
    .map((c) => adaptarCarta({ ...c, set: { id: set.id, name: set.name, cardCount: set.cardCount } }, infoSet))
    .sort(compararCartas);
  const lista = {
    ids: cartas.map((c) => c.id),
    base: oficial ? cartas.filter((c) => esDelSetBase(c.numero, oficial)).map((c) => c.id) : null,
    fecha: Date.now(),
  };
  guardarLista(o, lista);
  return { nombre: set.name, cartas, lista };
}

// --- Pokémon de cada carta (sugerencias) -----------------------
// La colección no guarda el número de Pokédex: para sugerir Pokémon se
// pide a TCGdex el dexId y el nombre de cada carta, varias por pedido
// con alias (c0: card(id: "…") { dexId name }). Los datos de una carta
// no cambian, así que se guardan sin vencimiento en localStorage.
// Medido el 2026-09-28: el tiempo crece con cada carta (50 = 1,7 s;
// 200 = 5,4 s). Por eso van en tandas de 50, hasta 3 pedidos a la vez.
// Dentro de set { cards } TCGdex no entrega dexId (llega null).

const CLAVE_DATOS_CARTAS = 'pt-dex:v1';
const TANDA_CARTAS = 50;
const PEDIDOS_A_LA_VEZ = 3;
let datosCartas = null; // Map id de carta → { dex: number[], nombre: string }

/**
 * Lo que ya se sabe de cada carta, sin pedir nada a la red.
 * Cartas sin Pokémon (Entrenador, Energía) quedan con dex = [].
 * @returns {Map<string, {dex: number[], nombre: string}>}
 */
export function datosCartasGuardados() {
  if (datosCartas) return datosCartas;
  datosCartas = new Map();
  try {
    // Formato compacto: { "bw3-40": [[603], "Eelektrik"], … }
    const guardado = JSON.parse(localStorage.getItem(CLAVE_DATOS_CARTAS)) ?? {};
    for (const [id, [dex, nombre] = []] of Object.entries(guardado)) {
      if (Array.isArray(dex) && typeof nombre === 'string') datosCartas.set(id, { dex, nombre });
    }
  } catch {
    // Sin almacenamiento o dato roto: se piden de nuevo
  }
  return datosCartas;
}

function guardarDatosCartas() {
  const compacto = Object.fromEntries([...datosCartas].map(([id, d]) => [id, [d.dex, d.nombre]]));
  try {
    localStorage.setItem(CLAVE_DATOS_CARTAS, JSON.stringify(compacto));
  } catch {
    // Sin almacenamiento: quedan solo en memoria
  }
}

/**
 * Pide a TCGdex el dexId y el nombre de las cartas que aún no se conocen.
 * La primera tanda va sola: si falla (sin conexión), no se piden las
 * demás. Una carta que TCGdex ya no tiene queda como "sin Pokémon".
 *
 * @param {Iterable<string>} ids
 * @param {() => void} alLlegar  después de cada tanda guardada
 * @returns {Promise<{fallo: boolean}>}
 */
export async function pedirDatosCartas(ids, alLlegar) {
  const conocidos = datosCartasGuardados();
  const faltan = [...new Set(ids)].filter((id) => !conocidos.has(id));
  const tandas = [];
  for (let i = 0; i < faltan.length; i += TANDA_CARTAS) tandas.push(faltan.slice(i, i + TANDA_CARTAS));
  let fallo = false;

  const pedirTanda = async (tanda) => {
    try {
      const partes = tanda.map((id, j) => `c${j}: card(id: ${JSON.stringify(id)}) { dexId name }`);
      const data = await consultar(`{ ${partes.join(' ')} }`);
      tanda.forEach((id, j) => {
        const c = data[`c${j}`];
        conocidos.set(id, { dex: c?.dexId ?? [], nombre: c?.name ?? '' });
      });
      guardarDatosCartas();
      alLlegar();
    } catch (error) {
      console.error(error);
      fallo = true;
    }
  };

  if (tandas.length) await pedirTanda(tandas.shift());
  // El resto, hasta 3 a la vez: cada pedido toma la siguiente tanda
  const pedidos = Array.from({ length: Math.min(PEDIDOS_A_LA_VEZ, tandas.length) }, async () => {
    while (tandas.length && !fallo) await pedirTanda(tandas.shift());
  });
  await Promise.all(pedidos);
  return { fallo };
}

/** El nombre que más se repite (ej: "Joltik" antes que "N's Joltik"). */
function nombreMasComun(cartas) {
  const cuenta = new Map();
  cartas.forEach((c) => cuenta.set(c.nombre, (cuenta.get(c.nombre) ?? 0) + 1));
  return [...cuenta].sort((a, b) => b[1] - a[1])[0][0];
}

// --- Formato propio --------------------------------------------

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
    dexIds: c.dexId ?? [],
    setId: c.set?.id ?? '',
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
