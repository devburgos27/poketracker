// =============================================================
// Estado compartido de la sesión
// =============================================================
// Lo que varias pantallas necesitan saber: las cartas del usuario en
// memoria, el módulo de Supabase y qué pantalla se ve. Es un objeto (no
// variables sueltas) para que cada módulo lea siempre el valor actual y
// main.js / router.js lo puedan cambiar.
// =============================================================

import { avisar } from './ui/avisos.js';
import * as cacheColeccion from './cache-coleccion.js';

export const estado = {
  // Cartas que tengo: id de carta → { filaId, copias, setId, nombreSet, acabados, sello }; null = sin sesión
  misCartas: null,
  coleccion: null,      // módulo coleccion.js (se carga junto con el login)
  // Aún no se sabe si hay sesión (hay una guardada o se vuelve de Google),
  // o ya llegó el usuario y faltan sus cartas: las pantallas privadas
  // dicen "Cargando…" en vez de invitar a entrar.
  cargandoSesion: false,
  rutaActual: null,     // vista visible: 'inicio' | 'buscar' | 'coleccion' | 'progreso'
  usuarioId: null,      // id del usuario conectado (la caché de Colección es por usuario)
};

/** "Joltik 44/114": nombre y número de la carta para los avisos. */
const nombreCarta = (c) => [c.nombre, c.totalSet ? `${c.numero}/${c.totalSet}` : c.numero].filter(Boolean).join(' ');

/**
 * Agrega (tengo = true) o quita una carta de la colección, en Supabase y
 * en misCartas, con un aviso breve ("Joltik 44/114 agregada a tu
 * colección"). Todas las pantallas pasan por aquí: Buscar, Me falta, el
 * detalle de un objetivo, el detalle de carta (+ y "Quitar de mi
 * colección") y Colección. Si falla, avisa y relanza el error: quien
 * llama revierte la tarjeta y deja su mensaje en la pantalla.
 */
export async function guardarCambio(carta, tengo) {
  const origen = document.activeElement;
  const nombre = nombreCarta(carta);
  try {
    if (tengo) {
      const guardada = await estado.coleccion.marcarTengo(carta);
      estado.misCartas?.set(carta.id, guardada);
      cacheColeccion.agregar(carta, guardada);
    } else {
      await estado.coleccion.marcarMeFalta(carta.id);
      estado.misCartas?.delete(carta.id);
      cacheColeccion.quitar(carta.id);
    }
  } catch (error) {
    avisar(tengo ? `No se pudo agregar ${nombre}. Revisa tu conexión.` : `No se pudo quitar ${nombre}. Revisa tu conexión.`, { tipo: 'error', origen });
    throw error;
  }
  if (tengo) avisar(`${nombre} agregada a tu colección`, { origen });
  else avisar(`${nombre} quitada de tu colección`, { tipo: 'neutro', origen });
}
