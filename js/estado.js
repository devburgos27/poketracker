// =============================================================
// Estado compartido de la sesión
// =============================================================
// Lo que varias pantallas necesitan saber: las cartas del usuario en
// memoria, el módulo de Supabase y qué pantalla se ve. Es un objeto (no
// variables sueltas) para que cada módulo lea siempre el valor actual y
// main.js / router.js lo puedan cambiar.
// =============================================================

export const estado = {
  // Cartas que tengo: id de carta → { filaId, copias, setId, nombreSet, acabados, sello }; null = sin sesión
  misCartas: null,
  coleccion: null,      // módulo coleccion.js (se carga junto con el login)
  // Aún no se sabe si hay sesión (hay una guardada o se vuelve de Google),
  // o ya llegó el usuario y faltan sus cartas: las pantallas privadas
  // dicen "Cargando…" en vez de invitar a entrar.
  cargandoSesion: false,
  rutaActual: null,     // vista visible: 'inicio' | 'buscar' | 'coleccion' | 'progreso'
};

/** Guarda "Tengo" / "Me falta" en Supabase y en misCartas. */
export async function guardarCambio(carta, tengo) {
  if (tengo) {
    const guardada = await estado.coleccion.marcarTengo(carta);
    estado.misCartas?.set(carta.id, guardada);
  } else {
    await estado.coleccion.marcarMeFalta(carta.id);
    estado.misCartas?.delete(carta.id);
  }
}
