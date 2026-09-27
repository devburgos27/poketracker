// =============================================================
// Colección del usuario (tablas "coleccion" y "copias" en Supabase)
// =============================================================
// Solo se guardan las cartas que el usuario TIENE:
//   marcar "Tengo"    → INSERT en coleccion + 1 copia
//   marcar "Me falta" → DELETE en coleccion (sus copias se borran solas)
// Cada copia puede llevar idioma y condición. Cantidad = nº de copias.
// No se envía user_id: las tablas lo completan con auth.uid() y las
// reglas RLS impiden tocar filas de otros usuarios.
// =============================================================

import { supabase } from './supabase.js';

// Código de Postgres para "fila duplicada" (unique violation)
const YA_EXISTE = '23505';

// Columnas necesarias para dibujar una carta guardada.
// copias(count) cuenta las copias en la misma consulta (sin pedir
// una consulta por carta).
const COLUMNAS_CARTA = 'id, id_carta, nombre_pokemon, nombre_set, numero, imagen_url, set_id, copias(count)';

// Columnas de una copia
const COLUMNAS_COPIA = 'id, idioma, condicion';

/**
 * Cuántas copias tiene una fila de coleccion.
 * Una fila sin copias (guardada por la versión anterior de la app,
 * entre la migración y el deploy) cuenta como 1 copia.
 */
function contarCopias(fila) {
  return Math.max(1, fila.copias?.[0]?.count ?? 0);
}

/**
 * Todas las cartas que tiene el usuario: id de carta → fila y copias.
 * @returns {Promise<Map<string, {filaId: number, copias: number}>>}
 */
export async function cargarMisCartas() {
  const { data, error } = await supabase.from('coleccion').select('id, id_carta, copias(count)');
  if (error) throw error;
  return new Map(data.map((fila) => [fila.id_carta, { filaId: fila.id, copias: contarCopias(fila) }]));
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
  let consulta = supabase
    .from('coleccion')
    .select(COLUMNAS_CARTA)
    .order('nombre_pokemon')
    .order('created_at');

  if (texto) consulta = consulta.ilike('nombre_pokemon', `%${texto}%`);

  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(adaptarFila);
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

/**
 * Convierte una fila de la tabla al formato "carta" de la app.
 * Además trae "guardada" ({ filaId, copias }) para saber cuántas
 * copias tiene sin otra consulta.
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
    guardada: { filaId: fila.id, copias: contarCopias(fila) },
  };
}

/**
 * Guarda una carta como "Tengo", con 1 copia sin detalles.
 * Se copian nombre, set, número e imagen para poder mostrar la
 * colección sin volver a la API.
 *
 * @returns {Promise<{filaId: number, copias: number}>}
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
  // cuenta como 1: el "Tengo" no se pierde, así que no se avisa error.
  try {
    await agregarCopias(data.id, 1);
  } catch (errorCopia) {
    console.error('No se pudo crear la primera copia:', errorCopia);
  }
  return { filaId: data.id, copias: 1 };
}

/** Fila y cantidad de copias de una carta que ya está en la colección. */
async function buscarMiCarta(idCarta) {
  const { data, error } = await supabase
    .from('coleccion')
    .select('id, copias(count)')
    .eq('id_carta', idCarta)
    .single();
  if (error) throw error;
  return { filaId: data.id, copias: contarCopias(data) };
}

/** Quita una carta de la colección ("Me falta"), con todas sus copias. */
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
 * @param {{idioma?: string|null, condicion?: string|null}} [datos]  para todas las copias nuevas
 * @returns {Promise<Array<{id: number, idioma: string|null, condicion: string|null}>>}
 */
export async function agregarCopias(filaId, cantidad, datos = {}) {
  const filas = Array.from({ length: cantidad }, () => ({ coleccion_id: filaId, ...datos }));
  const { data, error } = await supabase.from('copias').insert(filas).select(COLUMNAS_COPIA);
  if (error) throw error;
  return data;
}

/**
 * Cambia idioma y/o condición de una copia (null = sin indicar).
 * @param {number} id
 * @param {{idioma?: string|null, condicion?: string|null}} cambios
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
