// =============================================================
// Colección del usuario (tablas "coleccion" y "copias" en Supabase)
// =============================================================
// Solo se guardan las cartas que el usuario TIENE:
//   "Agregar a mi colección" → INSERT en coleccion + 1 copia
//   "Quitar de mi colección" → DELETE en coleccion (sus copias se borran solas)
// "Me falta" no se guarda: es una vista (cartas de TCGdex − las guardadas).
// Cada copia puede llevar idioma y condición. Cantidad = nº de copias.
// No se envía user_id: las tablas lo completan con auth.uid() y las
// reglas RLS impiden tocar filas de otros usuarios.
// =============================================================

import { supabase } from './supabase.js';

// Código de Postgres para "fila duplicada" (unique violation)
const YA_EXISTE = '23505';

// Acabado y sello de cada copia, en la misma consulta que la carta (sin
// un pedido por carta): con ellos se cuentan las copias y se arma la
// insignia de acabados de Colección. Requiere la migración 006.
const COPIAS_RESUMEN = 'copias(acabado, sello)';

// Columnas necesarias para dibujar una carta guardada
const COLUMNAS_CARTA = `id, id_carta, nombre_pokemon, nombre_set, numero, imagen_url, set_id, ${COPIAS_RESUMEN}`;

// Columnas de una copia
const COLUMNAS_COPIA = 'id, idioma, condicion, acabado, sello';

// Orden en que se muestran los acabados (igual al check de la base)
export const ACABADOS = ['normal', 'holo', 'reverse', 'pokeball', 'masterball', 'otro'];

// Máximo de copias por carta (lo impone la base de datos, migración 005)
export const MAX_COPIAS = 99;

// Supabase corta cada respuesta en un máximo de filas ("Max rows" de la
// API, 1000 por defecto). Las listas completas se piden por páginas.
const TAMANO_PAGINA = 1000;

// Código de PostgREST para "rango fuera del total" (se borraron filas
// entre una página y la siguiente): significa que ya no hay más
const RANGO_FUERA = 'PGRST103';

/**
 * Trae todas las filas de una consulta, página por página.
 * Sigue el total que informa Supabase (count: 'exact'), así no depende
 * de que el límite por respuesta sea exactamente 1000.
 *
 * @param {() => object} crearConsulta  arma la consulta con
 *   select(..., { count: 'exact' }) y un orden estable (que termine en
 *   un campo único), para que las páginas no se pisen ni salten filas
 */
async function traerTodas(crearConsulta) {
  const filas = [];
  let total = Infinity;
  while (filas.length < total) {
    const { data, error, count } = await crearConsulta()
      .range(filas.length, filas.length + TAMANO_PAGINA - 1);
    if (error?.code === RANGO_FUERA) break;
    if (error) throw error;
    if (count != null) total = count;
    if (data.length === 0) break; // por si el total cambió mientras se pedía
    filas.push(...data);
  }
  return filas;
}

/**
 * Cuántas copias tiene una fila de coleccion.
 * Una fila sin copias (guardada por la versión anterior de la app,
 * entre la migración y el deploy) cuenta como 1 copia.
 */
function contarCopias(fila) {
  return Math.max(1, fila.copias?.length ?? 0);
}

/**
 * Acabados registrados en unas copias (sin repetir, en el orden de
 * ACABADOS) y si alguna tiene sello. Las copias sin acabado no cuentan.
 * @param {Array<{acabado?: string|null, sello?: boolean}>} copias
 * @returns {{acabados: string[], sello: boolean}}
 */
export function resumenAcabados(copias) {
  const presentes = new Set(copias.map((c) => c.acabado).filter(Boolean));
  return {
    acabados: ACABADOS.filter((a) => presentes.has(a)),
    sello: copias.some((c) => c.sello),
  };
}

/**
 * Lo que la app recuerda de cada carta guardada (en misCartas).
 * setId y nombreSet sirven para sugerir expansiones; '' en filas
 * antiguas sin set_id. acabados y sello, para la insignia de Colección.
 * @returns {{filaId: number, copias: number, setId: string, nombreSet: string, acabados: string[], sello: boolean}}
 */
function guardadaDe(fila) {
  return {
    filaId: fila.id,
    copias: contarCopias(fila),
    setId: fila.set_id ?? '',
    nombreSet: fila.nombre_set ?? '',
    ...resumenAcabados(fila.copias ?? []),
  };
}

/**
 * Todas las cartas que tiene el usuario: id de carta → fila, copias y set.
 * Paginada: el progreso de los objetivos depende de que esté completa.
 * @returns {Promise<Map<string, {filaId: number, copias: number, setId: string, nombreSet: string, acabados: string[], sello: boolean}>>}
 */
export async function cargarMisCartas() {
  const filas = await traerTodas(() => supabase
    .from('coleccion')
    .select(`id, id_carta, set_id, nombre_set, ${COPIAS_RESUMEN}`, { count: 'exact' })
    .order('id'));
  return new Map(filas.map((fila) => [fila.id_carta, guardadaDe(fila)]));
}

/**
 * Lista las cartas del usuario, ordenadas por Pokémon y luego por
 * cuándo se agregaron. Si se indica un texto, filtra las que lo
 * contienen en el nombre ("jolt" → Joltik, N's Joltik), sin
 * distinguir mayúsculas.
 *
 * Devuelve las cartas en el mismo formato que api.js, así la
 * interfaz las dibuja con la misma tarjeta.
 *
 * @param {string} [texto]
 */
export async function listarColeccion(texto = '') {
  const filas = await traerTodas(() => {
    let consulta = supabase
      .from('coleccion')
      .select(COLUMNAS_CARTA, { count: 'exact' })
      .order('nombre_pokemon')
      .order('created_at')
      .order('id'); // desempate: orden estable entre páginas
    if (texto) consulta = consulta.ilike('nombre_pokemon', `%${texto}%`);
    return consulta;
  });
  return filas.map(adaptarFila);
}

/**
 * Las últimas cartas que agregó el usuario, de la más nueva a la
 * más antigua (para "Agregadas recientemente" en Inicio).
 *
 * @param {number} cantidad
 */
export async function listarRecientes(cantidad) {
  const { data, error } = await supabase
    .from('coleccion')
    .select(COLUMNAS_CARTA)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }) // desempate si se agregaron a la vez
    .limit(cantidad);

  if (error) throw error;
  return data.map(adaptarFila);
}

// Para "Exportar CSV": cada carta con todas sus copias y las fechas en
// que se agregaron (la caché de Colección solo tiene acabado y sello)
const COLUMNAS_EXPORTAR = 'id, nombre_pokemon, numero, nombre_set, set_id, created_at, copias(idioma, condicion, acabado, sello, created_at)';

/**
 * Toda la colección con el detalle de cada copia, en el orden de
 * Colección (Pokémon y luego cuándo se agregó). Paginada, como Colección.
 * @returns {Promise<Array<{id: number, nombre_pokemon: string, numero: string|null,
 *   nombre_set: string|null, set_id: string|null, created_at: string,
 *   copias: Array<{idioma: string|null, condicion: string|null, acabado: string|null,
 *   sello: boolean, created_at: string}>}>>}
 */
export async function listarParaExportar() {
  return traerTodas(() => supabase
    .from('coleccion')
    .select(COLUMNAS_EXPORTAR, { count: 'exact' })
    .order('nombre_pokemon')
    .order('created_at')
    .order('id'));
}

/**
 * Convierte una fila de la tabla al formato "carta" de la app.
 * Además trae "guardada" ({ filaId, copias, setId, nombreSet, acabados,
 * sello }) para saber cuántas copias tiene sin otra consulta.
 */
function adaptarFila(fila) {
  // Se guarda la imagen chica (low.webp); la grande sale cambiando el sufijo
  const chica = fila.imagen_url ?? '';
  return {
    id: fila.id_carta,
    nombre: fila.nombre_pokemon,
    numero: fila.numero ?? '',
    rareza: '',
    setId: fila.set_id ?? '',
    nombreSet: fila.nombre_set ?? '',
    totalSet: null,
    fechaSet: '',
    imagenChica: chica,
    imagenGrande: chica.replace(/\/low\.webp$/, '/high.webp'),
    guardada: guardadaDe(fila),
  };
}

/**
 * Agrega una carta a la colección, con 1 copia sin detalles.
 * Se copian nombre, set, número e imagen para poder mostrar la
 * colección sin volver a la API.
 *
 * @returns {Promise<{filaId: number, copias: number, setId: string, nombreSet: string, acabados: string[], sello: boolean}>}
 */
export async function marcarTengo(carta) {
  const { data, error } = await supabase
    .from('coleccion')
    .insert({
      id_carta: carta.id,
      nombre_pokemon: carta.nombre,
      nombre_set: carta.nombreSet,
      numero: carta.numero,
      imagen_url: carta.imagenChica,
      set_id: carta.setId || null,
    })
    .select('id')
    .single();

  // Si ya estaba guardada (por ejemplo, desde otra pestaña), se usa esa
  if (error?.code === YA_EXISTE) return buscarMiCarta(carta.id);
  if (error) throw error;

  // Si la copia no se guarda, la carta queda sin copias y la app la
  // cuenta como 1: la carta queda en la colección, así que no se avisa error.
  try {
    await agregarCopias(data.id, 1);
  } catch (errorCopia) {
    console.error('No se pudo crear la primera copia:', errorCopia);
  }
  return { filaId: data.id, copias: 1, setId: carta.setId ?? '', nombreSet: carta.nombreSet ?? '', acabados: [], sello: false };
}

/** Fila, copias y set de una carta que ya está en la colección. */
async function buscarMiCarta(idCarta) {
  const { data, error } = await supabase
    .from('coleccion')
    .select(`id, set_id, nombre_set, ${COPIAS_RESUMEN}`)
    .eq('id_carta', idCarta)
    .single();
  if (error) throw error;
  return guardadaDe(data);
}

/** Quita una carta de la colección ("Quitar de mi colección"), con todas sus copias. */
export async function marcarMeFalta(idCarta) {
  const { error } = await supabase.from('coleccion').delete().eq('id_carta', idCarta);
  if (error) throw error;
}

// --- Copias ---------------------------------------------------

/**
 * Las copias de una carta, de la más antigua a la más nueva.
 * @param {number} filaId  id de la fila en coleccion
 * @returns {Promise<Array<{id: number, idioma: string|null, condicion: string|null}>>}
 */
export async function listarCopias(filaId) {
  const { data, error } = await supabase
    .from('copias')
    .select(COLUMNAS_COPIA)
    .eq('coleccion_id', filaId)
    .order('created_at')
    .order('id');
  if (error) throw error;
  return data;
}

/**
 * Agrega copias a una carta de la colección.
 * @param {number} filaId
 * @param {number} cantidad
 * @param {{idioma?: string|null, condicion?: string|null, acabado?: string|null, sello?: boolean}} [datos]  para todas las copias nuevas
 * @returns {Promise<Array<{id: number, idioma: string|null, condicion: string|null}>>}
 */
export async function agregarCopias(filaId, cantidad, datos = {}) {
  const filas = Array.from({ length: cantidad }, () => ({ coleccion_id: filaId, ...datos }));
  const { data, error } = await supabase.from('copias').insert(filas).select(COLUMNAS_COPIA);
  // 42501: la policy rechazó la fila; en una carta propia, solo pasa por el límite
  if (error?.code === '42501') throw Object.assign(new Error('Límite de copias'), { limite: true });
  if (error) throw error;
  return data;
}

/**
 * Cambia idioma, condición, acabado (null = sin indicar) o sello de una copia.
 * @param {number} id
 * @param {{idioma?: string|null, condicion?: string|null, acabado?: string|null, sello?: boolean}} cambios
 */
export async function actualizarCopia(id, cambios) {
  const { data, error } = await supabase.from('copias').update(cambios).eq('id', id).select('id');
  if (error) throw error;
  // 0 filas: la copia se borró en otra pestaña o dispositivo
  if (data.length === 0) throw new Error('La copia ya no existe.');
}

/** Quita una copia. Para quitar la última se usa marcarMeFalta(). */
export async function quitarCopia(id) {
  const { error } = await supabase.from('copias').delete().eq('id', id);
  if (error) throw error;
}

// --- Objetivos ------------------------------------------------
// Lo que el usuario sigue (un Pokémon o una expansión). El progreso no
// se guarda: se calcula en la app con la lista de TCGdex.

const COLUMNAS_OBJETIVO = 'id, tipo, clave, nombre, created_at';

// Máximo por usuario (lo impone también la base de datos)
export const MAX_OBJETIVOS = 30;

/**
 * Los objetivos del usuario, del más reciente al más antiguo.
 * Son pocos (máximo 30): no hace falta paginar.
 * @returns {Promise<Array<{id: number, tipo: string, clave: string, nombre: string, created_at: string}>>}
 */
export async function listarObjetivos() {
  const { data, error } = await supabase
    .from('objetivos')
    .select(COLUMNAS_OBJETIVO)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data;
}

/**
 * Empieza a seguir un objetivo. Si ya lo seguía (otra pestaña), devuelve
 * el que existe. Si llegó al límite, el error trae limite: true.
 * @param {{tipo: 'pokemon'|'expansion', clave: string, nombre: string}} objetivo
 */
export async function seguirObjetivo({ tipo, clave, nombre }) {
  const { data, error } = await supabase
    .from('objetivos')
    .insert({ tipo, clave, nombre: nombre.slice(0, 80) })
    .select(COLUMNAS_OBJETIVO)
    .single();

  if (error?.code === YA_EXISTE) {
    const existente = await supabase
      .from('objetivos')
      .select(COLUMNAS_OBJETIVO)
      .eq('tipo', tipo)
      .eq('clave', clave)
      .single();
    if (existente.error) throw existente.error;
    return existente.data;
  }
  // 42501: la policy rechazó la fila; para el dueño, solo pasa por el límite
  if (error?.code === '42501') throw Object.assign(new Error('Límite de objetivos'), { limite: true });
  if (error) throw error;
  return data;
}

/** Deja de seguir un objetivo (no toca la colección). */
export async function dejarDeSeguir(id) {
  const { error } = await supabase.from('objetivos').delete().eq('id', id);
  if (error) throw error;
}
