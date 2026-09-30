// =============================================================
// Interfaz: "Tus copias" en el detalle
// =============================================================
// Contador − N +, una fila por copia (idioma, condición, acabado y
// sello), resumen y mensajes. Guardar lo hace detalle-carta.js.
// =============================================================

import { $, crearErrorConexion, escribirMensaje } from './base.js';
import { ACABADOS, mostrarVistasAcabado } from './acabados.js';

// Nombres en español de los códigos que guarda la base

const IDIOMAS = {
  en: 'Inglés', ja: 'Japonés', es: 'Español', ko: 'Coreano', de: 'Alemán',
  fr: 'Francés', pt: 'Portugués', it: 'Italiano', zh: 'Chino', otro: 'Otro',
};
const CONDICIONES = {
  NM: 'Excelente', LP: 'Muy buena', MP: 'Buena', HP: 'Regular', DMG: 'Dañada',
};
let accionesCopias = null;
let focoPendiente = null; // control que tenía el foco antes de guardar

/** Mensaje de "Tus copias" (errores al guardar). */
export function mensajeDetalle(texto, tipo = 'info') {
  const el = $('#estado-detalle');
  escribirMensaje(el, texto, tipo);
  el.hidden = !texto;
}

/** Copias del detalle sin conexión: versión compacta del estado. */
export function errorCopias(alReintentar) {
  mensajeDetalle('');
  const fila = document.createElement('li');
  fila.append(crearErrorConexion(alReintentar, { compacto: true }));
  $('#lista-copias').replaceChildren(fila);
}

/**
 * Dibuja "Tus copias": el contador − N + y la lista de copias.
 *
 * @param {null | Array<{id: number|null, idioma: string|null, condicion: string|null}>} copias
 *   null mientras se cargan
 * @param {boolean} [ocupado]  mientras se guarda: controles desactivados
 */
export function mostrarCopias(copias, ocupado = false) {
  // Al desactivar los controles se pierde el foco: se recuerda cuál
  // era para devolverlo cuando termine de guardar
  const activo = document.activeElement?.dataset?.foco;
  if (ocupado && activo) focoPendiente = activo;

  const cargando = copias === null;
  const cantidad = copias?.length ?? 0;
  $('#copias-cantidad').textContent = cargando ? '…' : String(cantidad);
  $('#copias-restar').disabled = ocupado || cargando || cantidad === 0;
  $('#copias-sumar').disabled = ocupado || cargando;

  if (cargando) mostrarResumenCopias([]);
  else mostrarResumenCopias(copias);
  mostrarVistasAcabado(cargando ? [] : copias);

  const lista = $('#lista-copias');
  if (cargando) {
    lista.replaceChildren();
  } else if (cantidad === 0) {
    const vacia = document.createElement('li');
    vacia.className = 'copias__vacia';
    vacia.textContent = 'Todavía no la tienes. Usa + para agregarla.';
    lista.replaceChildren(vacia);
  } else {
    lista.replaceChildren(...copias.map((copia, i) => crearFilaCopia(copia, i, ocupado)));
  }

  if (!ocupado && !cargando && focoPendiente) {
    const destino = $(`#dialogo-carta [data-foco="${focoPendiente}"]`);
    (destino && !destino.disabled ? destino : $('#copias-sumar')).focus();
    focoPendiente = null;
  }
}

function crearFilaCopia(copia, indice, ocupado) {
  const fila = document.createElement('li');
  fila.className = 'copia';

  const titulo = document.createElement('span');
  titulo.className = 'copia__titulo';
  titulo.textContent = `Copia ${indice + 1}`;

  const quitar = document.createElement('button');
  quitar.type = 'button';
  quitar.className = 'boton boton--texto copia__quitar';
  quitar.textContent = 'Quitar';
  quitar.setAttribute('aria-label', `Quitar copia ${indice + 1}`);
  quitar.dataset.foco = `quitar-${indice}`;
  quitar.disabled = ocupado;
  quitar.addEventListener('click', () => accionesCopias.alQuitar(copia));

  fila.append(
    titulo,
    crearSelector('Idioma', 'idioma', IDIOMAS, copia, indice, ocupado),
    crearSelector('Condición', 'condicion', CONDICIONES, copia, indice, ocupado),
    crearSelector('Acabado', 'acabado', ACABADOS, copia, indice, ocupado),
    crearCasillaSello(copia, indice, ocupado),
    quitar,
  );
  return fila;
}

/** Casilla "Sello promocional" de una copia. */
function crearCasillaSello(copia, indice, ocupado) {
  const label = document.createElement('label');
  label.className = 'copia__sello';
  const casilla = document.createElement('input');
  casilla.type = 'checkbox';
  casilla.checked = Boolean(copia.sello);
  casilla.disabled = ocupado;
  casilla.dataset.foco = `sello-${indice}`;
  casilla.addEventListener('change', () => accionesCopias.alCambiar(copia, 'sello', casilla.checked));
  const texto = document.createElement('span');
  texto.textContent = 'Sello promocional';
  label.append(casilla, texto);
  return label;
}

/**
 * "Acabados: 1 Normal, 2 Reverse holo, 1 sin indicar · Con sello: 1".
 * Solo si alguna copia tiene acabado o sello.
 */
function mostrarResumenCopias(copias) {
  const resumen = $('#copias-resumen');
  const conAcabado = copias.filter((c) => c.acabado);
  const conSello = copias.filter((c) => c.sello).length;
  resumen.hidden = conAcabado.length === 0 && conSello === 0;
  if (resumen.hidden) {
    resumen.textContent = '';
    return;
  }
  const partes = [];
  if (conAcabado.length) {
    const cuentas = Object.keys(ACABADOS)
      .map((a) => [a, copias.filter((c) => c.acabado === a).length])
      .filter(([, n]) => n > 0)
      .map(([a, n]) => `${n} ${ACABADOS[a]}`);
    const sinIndicar = copias.length - conAcabado.length;
    if (sinIndicar) cuentas.push(`${sinIndicar} sin indicar`);
    partes.push(`Acabados: ${cuentas.join(', ')}`);
  }
  if (conSello) partes.push(`Con sello: ${conSello}`);
  resumen.textContent = partes.join(' · ');
}

/** Un <select> con "Sin indicar" y las opciones en español. */
function crearSelector(etiqueta, campo, opciones, copia, indice, ocupado) {
  const label = document.createElement('label');
  label.className = 'copia__campo';

  const texto = document.createElement('span');
  texto.textContent = etiqueta;

  const select = document.createElement('select');
  select.dataset.foco = `${campo}-${indice}`;
  select.disabled = ocupado;
  select.append(
    new Option('Sin indicar', ''),
    ...Object.entries(opciones).map(([valor, nombre]) => new Option(nombre, valor)),
  );
  select.value = copia[campo] ?? '';
  select.addEventListener('change', () => accionesCopias.alCambiar(copia, campo, select.value || null));

  label.append(texto, select);
  return label;
}


/** Conecta "Tus copias" con detalle-carta.js (sumar, restar, cambiar, quitar). */
export function prepararCopias(acciones) {
  accionesCopias = acciones;
}

/** Al mostrar otra carta: sin mensaje, sin foco pendiente y "…" hasta que lleguen sus copias. */
export function reiniciarCopias() {
  mensajeDetalle('');
  focoPendiente = null;
  mostrarCopias(null);
}
