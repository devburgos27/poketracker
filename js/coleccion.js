// =============================================================
// Colección del usuario (tabla "coleccion" en Supabase)
// =============================================================
// Solo se guardan las cartas que el usuario TIENE:
//   marcar "Tengo"    → INSERT
//   marcar "Me falta" → DELETE
// No se envía user_id: la tabla lo completa con auth.uid() y las
// reglas RLS impiden tocar filas de otros usuarios.
// =============================================================

import { supabase } from './supabase.js';

// Código de Postgres para "fila duplicada" (unique violation)
const YA_EXISTE = '23505';

/**
 * Devuelve los ids de todas las cartas que tiene el usuario.
 * @returns {Promise<Set<string>>}
 */
export async function cargarIdsTengo() {
  const { data, error } = await supabase.from('coleccion').select('id_carta');
  if (error) throw error;
  return new Set(data.map((fila) => fila.id_carta));
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
    .select('id_carta, nombre_pokemon, nombre_set, numero, imagen_url')
    .order('nombre_pokemon')
    .order('created_at');

  if (texto) consulta = consulta.ilike('nombre_pokemon', `%${texto}%`);

  const { data, error } = await consulta;
  if (error) throw error;
  return data.map(adaptarFila);
}

/** Convierte una fila de la tabla al formato "carta" de la app. */
function adaptarFila(fila) {
  // Se guarda la imagen chica (low.webp); la grande sale cambiando el sufijo
  const chica = fila.imagen_url ?? '';
  return {
    id: fila.id_carta,
    nombre: fila.nombre_pokemon,
    numero: fila.numero ?? '',
    rareza: '',
    nombreSet: fila.nombre_set ?? '',
    totalSet: null,
    fechaSet: '',
    imagenChica: chica,
    imagenGrande: chica.replace(/\/low\.webp$/, '/high.webp'),
  };
}

/**
 * Guarda una carta como "Tengo". Se copian nombre, set, número e
 * imagen para poder mostrar la colección sin volver a la API.
 */
export async function marcarTengo(carta) {
  const { error } = await supabase.from('coleccion').insert({
    id_carta: carta.id,
    nombre_pokemon: carta.nombre,
    nombre_set: carta.nombreSet,
    numero: carta.numero,
    imagen_url: carta.imagenChica,
  });
  // Si ya estaba guardada (por ejemplo, desde otra pestaña), da igual
  if (error && error.code !== YA_EXISTE) throw error;
}

/** Quita una carta de la colección ("Me falta"). */
export async function marcarMeFalta(idCarta) {
  const { error } = await supabase.from('coleccion').delete().eq('id_carta', idCarta);
  if (error) throw error;
}
