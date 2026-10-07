// =============================================================
// Genera datos/pokemon.json: el nombre de cada Pokémon por su número
// de Pokédex (dexId)
// =============================================================
// Un objetivo de tipo Pokémon sigue un número de Pokédex: "Dark
// Charizard" y "Charizard ex" son el #6. Su nombre tiene que ser el del
// Pokémon ("Charizard"), no el de una carta. TCGdex no tiene un recurso
// con ese nombre (solo las cartas de cada número), así que se deduce de
// las cartas, una vez, y queda en una lista fija que la app descarga
// solo cuando la necesita (botón "Seguir" de Buscar y sugerencias).
//
// Regla, por número (solo cartas físicas con un único Pokémon):
//   el nombre de carta más corto que aparece dentro del nombre de más de
//   la mitad de sus cartas ("Charizard" está en "Dark Charizard",
//   "Charizard ex"…). Así no gana un dato mal cargado en TCGdex (una
//   "Lapras" marcada como #129, que es Magikarp). Si ninguno pasa, el
//   nombre más repetido. Algunos van a mano (CORRECCIONES).
// Los Pokémon que solo existen con su forma regional o de paradoja en
// las cartas quedan con ese nombre ("Galarian Obstagoon", "Iron
// Valiant"): es el que dice cada una de sus cartas.
//
// Volver a correrlo cuando salgan Pokémon nuevos (los números que no
// están en la lista no ofrecen "Seguir" en Buscar ni se sugieren).
//
// Uso (Node 18 o más nuevo, desde la raíz del proyecto):
//   node herramientas/generar-nombres-pokemon.mjs          → datos/pokemon.json
//   node herramientas/generar-nombres-pokemon.mjs --sql    → además, el VALUES
//     de la migración que corrige los objetivos guardados (por la salida)
// Dos pedidos a TCGdex: todas las cartas (~1,2 MB) y la lista de sets.
// =============================================================

import fs from 'node:fs';

const SALIDA = new URL('../datos/pokemon.json', import.meta.url);

// Número → nombre, cuando la regla no alcanza:
//   892: las cartas dicen "Rapid Strike Urshifu" o "Single Strike Urshifu"
//   1017: "Teal Mask Ogerpon", "Wellspring Mask Ogerpon"… (cuatro máscaras)
const CORRECCIONES = { 892: 'Urshifu', 1017: 'Ogerpon' };

async function graphql(query) {
  const r = await fetch('https://api.tcgdex.net/v2/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`TCGdex respondió ${r.status}`);
  const { data, errors } = await r.json();
  if (errors?.length) throw new Error(`TCGdex: ${errors[0].message}`);
  return data;
}

// Dentro de una carta TCGdex no entrega la serie del set: va aparte,
// como en la app (api.js), para dejar fuera TCG Pocket (juego de celular)
const [{ cards }, { sets }] = await Promise.all([
  graphql('{ cards { dexId name set { id } } }'),
  graphql('{ sets { id serie { id } } }'),
]);
const digitales = new Set(sets.filter((s) => s.serie?.id === 'tcgp').map((s) => s.id));

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** ¿El nombre de la carta contiene el nombre buscado como palabra? ("Charizard" en "Dark Charizard ex") */
const contiene = (carta, nombre) => new RegExp(`(^|[\\s'’])${escapar(nombre)}($|[\\s-])`, 'i').test(carta);

// número → nombres de sus cartas (con repeticiones)
const porNumero = new Map();
for (const c of cards) {
  if (!c?.name || digitales.has(c.set?.id) || c.dexId?.length !== 1) continue;
  const n = c.dexId[0];
  if (!porNumero.has(n)) porNumero.set(n, []);
  porNumero.get(n).push(c.name.trim());
}

const maximo = Math.max(...porNumero.keys());
const nombres = [];
const revisar = [];
for (let n = 1; n <= maximo; n++) {
  const cartas = porNumero.get(n);
  if (!cartas) {
    nombres.push(null);
    revisar.push(`#${n}: sin cartas`);
    continue;
  }
  const veces = new Map();
  cartas.forEach((c) => veces.set(c, (veces.get(c) ?? 0) + 1));
  const distintos = [...veces.keys()];
  const masRepetido = distintos.toSorted((a, b) => veces.get(b) - veces.get(a) || a.length - b.length)[0];
  const elegido = distintos
    .filter((nombre) => cartas.filter((c) => contiene(c, nombre)).length > cartas.length / 2)
    .toSorted((a, b) => a.length - b.length || veces.get(b) - veces.get(a) || a.localeCompare(b))[0];
  const nombre = CORRECCIONES[n] ?? elegido ?? masRepetido;
  nombres.push(nombre);
  if (!CORRECCIONES[n] && !elegido) revisar.push(`#${n}: ninguno en más de la mitad, queda "${nombre}"`);
}

// Si TCGdex respondió algo raro, no se pisa la lista buena
if (nombres.filter(Boolean).length < 1000) throw new Error(`Solo ${nombres.filter(Boolean).length} nombres: no se escribe ${SALIDA.pathname}`);
fs.writeFileSync(SALIDA, `${JSON.stringify({ generado: new Date().toLocaleDateString('sv'), nombres })}\n`);
console.log(`datos/pokemon.json: ${nombres.length} números (${nombres.filter(Boolean).length} con nombre)`);
if (revisar.length) console.log(`Revisar:\n  ${revisar.join('\n  ')}`);

if (process.argv.includes('--sql')) {
  const sql = (s) => `'${s.replace(/'/g, "''")}'`;
  const filas = nombres.map((nombre, i) => (nombre ? `  (${sql(String(i + 1))}, ${sql(nombre)})` : null)).filter(Boolean);
  console.log(`\n-- VALUES para la migración (${filas.length} filas)\n${filas.join(',\n')}`);
}
