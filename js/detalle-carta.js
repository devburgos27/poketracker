// =============================================================
// Detalle de carta: datos, copias y anterior / siguiente
// =============================================================
// Lo que pasa detrás del <dialog> del detalle (lo dibuja ui/detalle.js):
// la foto de la lista para anterior / siguiente, la rareza que falta,
// y "Tus copias" (cargar y guardar, también si se cambia de carta
// mientras guarda).
// =============================================================

import { obtenerCarta } from './api.js';
import * as ui from './ui.js';
import * as objetivos from './objetivos.js';
import { estado, guardarCambio } from './estado.js';
import { redibujarPantalla } from './router.js';

// --- Detalle de carta: "Tus copias" ----------------------------
// Cada cambio se ve al instante y se revierte si Supabase falla,
// igual que "Agregar a mi colección" en las tarjetas.

/** Copia que se muestra pero aún no existe en la base. */
const copiaSinGuardar = () => ({ id: null, idioma: null, condicion: null, acabado: null, sello: false });

let detalle = null; // { carta, indice, copias, cambio, cerrado } de la carta abierta

// "Foto" de la lista de la pantalla al abrir el detalle (con sus
// filtros, pestaña y orden). Anterior / siguiente la recorren aunque la
// grilla cambie detrás (por ejemplo, al quitar una carta estando en "Tengo").
let listaDetalle = [];

// Guardados de copias en curso, por id de carta. Si se vuelve a una
// carta que todavía guarda, sus copias se leen cuando termina.
const guardandoCopias = new Map();

function abrirDetalle(carta, lista = [carta]) {
  listaDetalle = [...lista];
  const indice = Math.max(0, listaDetalle.findIndex((c) => c.id === carta.id));
  const d = nuevoDetalle(indice);
  ui.abrirDetalle(d.carta, { indice, total: listaDetalle.length });
  prepararCartaDetalle(d);
}

/** Anterior (-1) o siguiente (1), sin dar la vuelta en los extremos. */
function moverDetalle(paso) {
  const actual = detalle;
  if (!actual || actual.cerrado) return;
  const indice = actual.indice + paso;
  if (indice < 0 || indice >= listaDetalle.length) return;
  dejarCarta(actual);
  const d = nuevoDetalle(indice);
  ui.cambiarCartaDetalle(d.carta, { indice, total: listaDetalle.length });
  prepararCartaDetalle(d);
  ui.conservarFocoDetalle();
}

function nuevoDetalle(indice) {
  detalle = { carta: listaDetalle[indice], indice, copias: null, cambio: false, cerrado: false };
  return detalle;
}

function prepararCartaDetalle(d) {
  objetivos.mostrarSeguir('#detalle-seguir', objetivos.candidatoDeCarta(d.carta));
  completarDatos(d);
  if (estado.misCartas) cargarCopias(d);
  ui.precargarDetalle([listaDetalle[d.indice - 1], listaDetalle[d.indice + 1]]);
}

/**
 * La carta deja de verse (se cerró el detalle o se pasó a otra). Sus
 * guardados en curso siguen: al terminar actualizan la pantalla, pero
 * no el detalle (ver cambiarCopias).
 */
function dejarCarta(d) {
  d.cerrado = true;
  if (d.cambio) redibujarPantalla();
}

/** La colección no guarda la rareza: se pide a la API al abrir el detalle. */
async function completarDatos(d) {
  if (d.carta.rareza) return;
  try {
    const completa = await obtenerCarta(d.carta.id);
    if (d !== detalle || !completa) return;
    d.carta = { ...d.carta, rareza: completa.rareza, totalSet: d.carta.totalSet ?? completa.totalSet };
    // Al volver a esta carta ya no se pide de nuevo
    if (listaDetalle[d.indice]?.id === d.carta.id) listaDetalle[d.indice] = d.carta;
    ui.mostrarDatosDetalle(d.carta);
  } catch (error) {
    console.error(error); // sin rareza, el resto del detalle sirve igual
  }
}

/**
 * Una carta guardada sin copias (marcada con la versión anterior de
 * la app, entre la migración y el deploy) cuenta como 1 copia. Esa
 * copia se crea de verdad en el primer cambio.
 */
function conCopiaImplicita(copias) {
  return copias.length ? copias : [copiaSinGuardar()];
}

async function cargarCopias(d) {
  // Si esta carta todavía guarda un cambio (se volvió a ella), se espera
  // a que termine: así no se leen copias viejas
  await guardandoCopias.get(d.carta.id);
  if (d !== detalle) return;
  const guardada = estado.misCartas?.get(d.carta.id);
  if (!guardada) {
    d.copias = [];
    ui.mostrarCopias(d.copias);
    return;
  }
  try {
    const copias = await estado.coleccion.listarCopias(guardada.filaId);
    if (d !== detalle) return;
    d.copias = conCopiaImplicita(copias);
    ui.mostrarCopias(d.copias);
  } catch (error) {
    if (d !== detalle) return;
    console.error(error);
    ui.errorCopias(() => cargarCopias(d));
  }
}

/**
 * Aplica un cambio en "Tus copias".
 * @param {Array} nuevas  las copias como deben quedar
 * @param {() => Promise<Array|void>} guardar  lo guarda en Supabase; si
 *   devuelve un arreglo, son las copias con sus ids reales
 */
async function cambiarCopias(nuevas, guardar) {
  const d = detalle;
  const antes = d.copias;
  d.copias = nuevas;
  ui.mensajeDetalle('');
  ui.mostrarCopias(d.copias, true);

  const id = d.carta.id;
  const guardado = guardarCopias(d, antes, nuevas, guardar);
  guardandoCopias.set(id, guardado);
  await guardado;
  if (guardandoCopias.get(id) === guardado) guardandoCopias.delete(id);
  // Si ya se pasó a otra carta (o se cerró), el detalle no se toca
  if (d === detalle && !d.cerrado) ui.mostrarCopias(d.copias);
}

/** Guarda un cambio de copias; si falla, vuelve a las de antes. Nunca lanza. */
async function guardarCopias(d, antes, nuevas, guardar) {
  try {
    d.copias = (await guardar()) ?? nuevas;
    d.cambio = true;
    const guardada = estado.misCartas?.get(d.carta.id);
    // Cantidad y acabados de la carta (×N e insignia de Colección)
    if (guardada) Object.assign(guardada, { copias: d.copias.length, ...estado.coleccion.resumenAcabados(d.copias) });
    if (d.cerrado) redibujarPantalla(); // se cerró o se pasó a otra carta mientras guardaba
  } catch (error) {
    console.error(error);
    d.copias = antes;
    const limite = error.limite ? `Llegaste al máximo de ${estado.coleccion.MAX_COPIAS} copias de esta carta.` : '';
    if (d === detalle && !d.cerrado) {
      ui.mensajeDetalle(limite || 'No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    } else if (detalle && !detalle.cerrado) {
      // Ya se ve otra carta: el aviso dice de cuál era el cambio
      const carta = `${d.carta.nombre} (${d.carta.nombreSet} ${d.carta.numero})`;
      ui.mensajeDetalle(`No se guardó el cambio en ${carta}. ${limite || 'Vuelve a esa carta e inténtalo de nuevo.'}`, 'error');
    }
  }
}

/** "+": agrega una copia sin detalles (con 0 copias, agrega la carta a la colección). */
function sumarCopia() {
  const d = detalle;
  const guardada = estado.misCartas.get(d.carta.id);
  const nuevas = [...d.copias, copiaSinGuardar()];

  cambiarCopias(nuevas, async () => {
    if (!guardada) {
      await guardarCambio(d.carta, true);
      try {
        return conCopiaImplicita(await estado.coleccion.listarCopias(estado.misCartas.get(d.carta.id).filaId));
      } catch (error) {
        // La carta ya quedó guardada: no se revierte por no poder listar
        console.error(error);
        return [copiaSinGuardar()];
      }
    }
    // Se crea la nueva y, si la había, la copia implícita de una fila antigua
    const sinGuardar = nuevas.filter((c) => c.id === null).length;
    const creadas = await estado.coleccion.agregarCopias(guardada.filaId, sinGuardar);
    return [...nuevas.filter((c) => c.id !== null), ...creadas];
  });
}

/**
 * Quita una copia. La interfaz no ofrece quitar la última (eso es
 * "Quitar de mi colección", con confirmación); si pasara, equivale a eso.
 */
function quitarCopia(copia) {
  const d = detalle;
  const nuevas = d.copias.filter((c) => c !== copia);

  if (nuevas.length === 0) {
    cambiarCopias([], async () => {
      await guardarCambio(d.carta, false);
      return [];
    });
    return;
  }
  cambiarCopias(nuevas, () => estado.coleccion.quitarCopia(copia.id));
}

/** Cambia idioma, condición, acabado (null = sin indicar) o sello de una copia. */
function cambiarDatoCopia(copia, campo, valor) {
  const d = detalle;
  const editada = { ...copia, [campo]: valor };
  const nuevas = d.copias.map((c) => (c === copia ? editada : c));

  cambiarCopias(nuevas, async () => {
    if (copia.id !== null) {
      await estado.coleccion.actualizarCopia(copia.id, { [campo]: valor });
      return undefined;
    }
    // Copia implícita de una fila antigua: se crea ahora, ya con el dato
    const [creada] = await estado.coleccion.agregarCopias(estado.misCartas.get(d.carta.id).filaId, 1, { [campo]: valor });
    return nuevas.map((c) => (c === editada ? creada : c));
  });
}

/**
 * "Quitar de mi colección": borra la carta con todas sus copias, después
 * de confirmar en el modal propio (dice cuántas copias se borran).
 */
async function quitarDeColeccion() {
  const d = detalle;
  if (!d?.copias?.length) return;
  const cantidad = d.copias.length;
  const confirmado = await ui.confirmar({
    titulo: `¿Quitar ${d.carta.nombre} (${d.carta.nombreSet} ${d.carta.numero}) de tu colección?`,
    mensaje: cantidad === 1
      ? 'Se borrará tu copia, con su idioma, condición, acabado y sello.'
      : `Se borrarán tus ${cantidad} copias, con su idioma, condición, acabado y sello.`,
    textoConfirmar: 'Quitar de mi colección',
    peligro: true,
  });
  // Mientras se confirmaba pudo cerrarse el detalle o cambiar de carta
  if (!confirmado || d !== detalle || d.cerrado) return;
  cambiarCopias([], async () => {
    await guardarCambio(d.carta, false);
    return [];
  });
}

/** Al cerrar: si algo cambió, se redibuja la pantalla (×N, colección, progreso). */
function alCerrarDetalle() {
  const d = detalle;
  if (!d) return;
  dejarCarta(d);
  ui.enfocarCarta(d.carta.id);
}

/** Conecta el <dialog> del detalle con los datos (ver ui/detalle.js). */
export function preparar() {
  ui.prepararDetalle({
    alAbrir: abrirDetalle,
    alMover: moverDetalle,
    alCerrar: alCerrarDetalle,
    alSumar: sumarCopia,
    alRestar: () => quitarCopia(detalle.copias.at(-1)),
    alCambiar: cambiarDatoCopia,
    alQuitar: quitarCopia,
    alQuitarTodo: quitarDeColeccion,
  });
}

/**
 * Los objetivos cambiaron (se cargaron o se siguió uno): el "Seguir" de
 * la expansión en el detalle abierto se actualiza.
 */
export function actualizarSeguir() {
  if (detalle && !detalle.cerrado) {
    objetivos.mostrarSeguir('#detalle-seguir', objetivos.candidatoDeCarta(detalle.carta));
  }
}
