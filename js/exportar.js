// =============================================================
// Exportar la colección a CSV
// =============================================================
// Una fila por copia física (no por carta). El archivo se arma y se
// descarga en el navegador: no pasa por ningún servidor.
//
// Formato (pensado para Excel en español, también abre en Google
// Sheets, Numbers y LibreOffice):
// - Separador punto y coma. Con configuración regional chilena (coma
//   decimal) Excel usa ";" como separador de listas: un archivo con
//   comas se abriría con todo en una sola columna. No se agrega la
//   línea "sep=;": hace que Excel ignore el BOM y rompe las tildes.
// - UTF-8 con BOM: sin él, Excel lo lee como Windows-1252 y "Pokémon"
//   se ve "PokÃ©mon". Saltos de línea CRLF.
// - Comillas (RFC 4180) en los valores con ; , " o saltos de línea; las
//   comillas internas se duplican.
// - Fórmulas: un texto que empieza con = + - @ (o tabulación / retorno)
//   lleva un apóstrofo adelante, así la planilla no lo ejecuta. Solo en
//   textos: los números (total, año) los genera la app.
// - Número como en la carta ("049/114"), siempre con un carácter
//   invisible adelante para que Excel no lo convierta en fecha ni en
//   número (ver numeroComoEnLaCarta).
// - Sin indicar = celda vacía. Sello: "Sí" o "No" (no es "sin indicar").
// - Fechas AAAA-MM-DD (en la hora local), que Excel reconoce como fecha.
// =============================================================

import { ACABADOS } from './ui/acabados.js';
import { CONDICIONES, IDIOMAS } from './ui/copias.js';

const SEPARADOR = ';';
const FIN_DE_LINEA = '\r\n';
const BOM = '\uFEFF';

const COLUMNAS = [
  'Nombre', 'Número', 'Total de la expansión', 'Expansión', 'Año',
  'Idioma', 'Condición', 'Acabado', 'Sello', 'Agregada',
];

/** Un valor como celda del CSV (vacío si no hay valor). */
function celda(valor) {
  if (valor == null || valor === '') return '';
  let texto = String(valor);
  if (typeof valor === 'string' && /^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  if (/[;,"\r\n]/.test(texto)) texto = `"${texto.replaceAll('"', '""')}"`;
  return texto;
}

// Separador de palabras (U+2060): no se ve ni ocupa espacio, pero con él
// adelante Excel ya no lee el valor como fecha, número ni fórmula
const INVISIBLE = '\u2060';

/**
 * El número tal como se imprime en la carta: "049/114" (con el total
 * de la expansión) o solo "049" si no se sabe el total. Los que tienen
 * letras ("TG05", "SWSH020") van solos: en la carta no llevan el total
 * de la expansión.
 *
 * Siempre lleva el carácter invisible adelante. Excel en español
 * convierte muchos de estos valores y no hay una regla segura para saber
 * cuáles: "1/12" → 01-dic, "4/82" (Dark Charizard) → abr-82, "049" → 49.
 * Con el carácter, todos quedan como texto, tal cual; buscar "4/82" en
 * la planilla igual los encuentra. Como ya no empieza con = + - @, la
 * protección contra fórmulas no le agrega el apóstrofo.
 */
function numeroComoEnLaCarta(numero, total) {
  if (!numero) return null;
  const texto = total && /^\d+$/.test(numero) ? `${numero}/${total}` : numero;
  return INVISIBLE + texto;
}

/** "2026-09-01T03:00:00Z" → "2026-08-31" en Chile (fecha local). */
function fechaLocal(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/**
 * Las filas del CSV: una por copia. Una carta sin copias guardadas (de
 * antes de que existieran las copias) cuenta como 1, como en la app,
 * con los datos de la copia vacíos y la fecha de la carta.
 * @param {Array} cartas  lo de coleccion.listarParaExportar()
 * @param {Map<string, {fecha: string, total: number|null}>} sets  api.datosDeSets()
 *   (vacío sin conexión: total y año quedan vacíos)
 * @returns {string[][]}
 */
export function filasColeccion(cartas, sets = new Map()) {
  const filas = [];
  for (const carta of cartas) {
    const set = sets.get(carta.set_id);
    const comunes = [
      carta.nombre_pokemon,
      numeroComoEnLaCarta(carta.numero, set?.total),
      set?.total ?? null,
      carta.nombre_set,
      set?.fecha ? Number(set.fecha.slice(0, 4)) : null,
    ];
    const copias = [...(carta.copias ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (copias.length === 0) {
      filas.push([...comunes, null, null, null, 'No', fechaLocal(carta.created_at)]);
      continue;
    }
    for (const c of copias) {
      filas.push([
        ...comunes,
        IDIOMAS[c.idioma] ?? c.idioma,
        CONDICIONES[c.condicion] ?? c.condicion,
        ACABADOS[c.acabado] ?? c.acabado,
        c.sello ? 'Sí' : 'No',
        fechaLocal(c.created_at ?? carta.created_at),
      ]);
    }
  }
  return filas;
}

/** El texto del archivo (con BOM): encabezados y una línea por fila. */
export function textoCsv(filas) {
  const lineas = [COLUMNAS, ...filas].map((fila) => fila.map(celda).join(SEPARADOR));
  return BOM + lineas.join(FIN_DE_LINEA) + FIN_DE_LINEA;
}

/** poketracker-coleccion-AAAA-MM-DD.csv (fecha de hoy, local). */
export const nombreArchivo = (hoy = new Date()) => `poketracker-coleccion-${fechaLocal(hoy.toISOString())}.csv`;

/** Descarga el texto como archivo, sin salir de la página. */
export function descargar(texto, nombre) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después: algunos navegadores leen el archivo tras el clic
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
