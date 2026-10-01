// =============================================================
// Caché de "Mi colección" (A3)
// =============================================================
// Qué guarda: las cartas de la colección tal como las dibuja la
// pantalla Colección (id, nombre, número, expansión, imagen, total y
// año de la expansión) y el resumen de sus copias (cantidad, acabados,
// sello). Nada de la cuenta (ni correo ni tokens).
//
// Dónde y cuánto dura: en memoria mientras la página está abierta y en
// sessionStorage ('pt-col:v1:<id de usuario>'), así una recarga la
// muestra al instante. sessionStorage es de esa pestaña: no la ven
// otras pestañas y se borra al cerrarla. Además se borra al cerrar
// sesión (computadores compartidos). Una por usuario: si entra otra
// cuenta, no ve la caché de la anterior.
//
// Frescura: los cambios propios (agregar, quitar, copias) se aplican
// aquí al instante, así que nunca se ve una versión vieja de lo que
// hizo uno mismo. Lo que cambió en otro dispositivo o pestaña se trae
// revalidando en segundo plano (listas.js): la primera vez que se entra
// a Colección tras cargar la página, al volver a la pestaña después de
// dejarla y si pasaron más de 5 minutos. Mientras tanto se muestra lo
// guardado. Si llega un cambio propio durante una revalidación, esa
// respuesta se descarta (sería más vieja que lo local).
// =============================================================

const PREFIJO = 'pt-col:v1:';
const VIGENCIA = 5 * 60 * 1000;   // 5 min: después se revalida al entrar

/**
 * @type {null | {usuario: string, cartas: Map<string, object>, revisada: number,
 *   porRevalidar: boolean, version: number}}
 *   version: sube con cada cambio propio (descarta revalidaciones en curso)
 */
let cache = null;

/** La caché del usuario (de memoria o de sessionStorage), o null. */
export function leer(usuario) {
  if (!usuario) return null;
  if (cache?.usuario === usuario) return cache;
  try {
    const guardada = JSON.parse(sessionStorage.getItem(PREFIJO + usuario));
    if (Array.isArray(guardada?.cartas)) {
      // Viene de otra carga de la página: se muestra y se revalida
      cache = { usuario, cartas: new Map(guardada.cartas.map((c) => [c.id, c])), revisada: guardada.revisada ?? 0, porRevalidar: true, version: 0 };
      return cache;
    }
  } catch {
    // Sin almacenamiento o dato roto: como si no hubiera caché
  }
  return null;
}

/** Las cartas guardadas (en el orden en que llegaron), o null. */
export const cartas = () => (cache ? [...cache.cartas.values()] : null);

/** ¿Hay que pedir la colección de nuevo? */
export const hayQueRevalidar = () => !cache || cache.porRevalidar || Date.now() - cache.revisada > VIGENCIA;

/** Número de cambios propios: si cambió durante un pedido, su respuesta es vieja. */
export const version = () => cache?.version ?? 0;

/** Reemplaza todo con lo que llegó de Supabase. */
export function reemplazar(usuario, lista) {
  cache = { usuario, cartas: new Map(lista.map((c) => [c.id, c])), revisada: Date.now(), porRevalidar: false, version: cache?.usuario === usuario ? cache.version : 0 };
  persistir();
}

/** Carta agregada en esta sesión (guardada: la misma de misCartas). */
export function agregar(carta, guardada) {
  if (!cache) return invalidarGuardada();
  cache.cartas.set(carta.id, { ...carta, guardada });
  cambio();
}

/** Carta quitada en esta sesión. */
export function quitar(id) {
  if (!cache) return invalidarGuardada();
  cache.cartas.delete(id);
  cambio();
}

/** Cambiaron las copias de una carta: su resumen nuevo (cantidad, acabados, sello). */
export function cambiaronCopias(id, guardada) {
  if (!cache) return invalidarGuardada();
  const carta = cache.cartas.get(id);
  if (carta) carta.guardada = guardada;
  cambio();
}

/** Datos que se completan después (total y año de la expansión). */
export function guardarDespues() {
  if (cache) programarPersistencia();
}

/** Al volver a la pestaña: lo de otro dispositivo o pestaña puede haber cambiado. */
export function marcarPorRevalidar() {
  if (cache) cache.porRevalidar = true;
}

/**
 * Un cambio propio cuando la caché todavía no está en memoria (por
 * ejemplo, tras recargar, agregar desde Buscar antes de entrar a
 * Colección): la de sessionStorage quedó vieja y se descarta, así
 * Colección la pide de nuevo en vez de mostrar una versión sin el cambio.
 */
function invalidarGuardada() {
  borrar();
}

/** Al cerrar sesión: memoria y todas las copias en sessionStorage. */
export function borrar() {
  cache = null;
  clearTimeout(espera);
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(PREFIJO)).forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Sin almacenamiento: no había nada guardado
  }
}

function cambio() {
  cache.version++;
  programarPersistencia();
}

// Guardar en sessionStorage es serializar toda la colección: se agrupan
// los cambios seguidos (300 ms) y se guarda al esconder la página
let espera;
function programarPersistencia() {
  clearTimeout(espera);
  espera = setTimeout(persistir, 300);
}

/** Guarda ya (también al esconder o cerrar la página). */
export function persistir() {
  clearTimeout(espera);
  if (!cache) return;
  try {
    sessionStorage.setItem(PREFIJO + cache.usuario, JSON.stringify({ revisada: cache.revisada, cartas: [...cache.cartas.values()] }));
  } catch {
    // Sin espacio (colecciones enormes) o sin almacenamiento: queda en memoria
  }
}
