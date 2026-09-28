// =============================================================
// Genera datos/imagenes-alternativas.json
// =============================================================
// Algunas cartas no tienen imagen en TCGdex (en inglés). Este script
// busca, para cada una, una imagen de respaldo y la deja en una lista
// que la app descarga solo cuando aparece una carta sin imagen:
//
//   1. pokemontcg.io (images.pokemontcg.io): la misma carta en inglés.
//      El set se empareja por nombre (y fecha, si hay varios) o por id
//      igual. Se comprueba cada imagen con un pedido HEAD: el CDN
//      responde 404 con una imagen del reverso, así que no se puede
//      probar a ciegas desde la app.
//   2. TCGdex en otro idioma (español, francés, italiano, alemán,
//      portugués, en ese orden): la misma carta con el texto en ese idioma.
//
// Uso (Node 18 o más nuevo, desde la raíz del proyecto):
//   node herramientas/generar-imagenes.mjs
// Tarda alrededor de 1 minuto. Descarga ~13 MB (listas de TCGdex) y
// hace ~1000 pedidos HEAD a images.pokemontcg.io.
// =============================================================

import fs from 'node:fs';

const SALIDA = new URL('../datos/imagenes-alternativas.json', import.meta.url);
const IDIOMAS = ['es', 'fr', 'it', 'de', 'pt'];
const PEDIDOS_A_LA_VEZ = 12;

async function json(url, opciones) {
  for (let intento = 1; ; intento++) {
    try {
      const r = await fetch(url, opciones);
      if (!r.ok) throw new Error(`${r.status} en ${url}`);
      return await r.json();
    } catch (error) {
      // La API de pokemontcg.io falla a menudo: se reintenta
      if (intento === 4) throw error;
      console.warn(`  reintento ${intento} (${error.message})`);
      await new Promise((r) => setTimeout(r, 2000 * intento));
    }
  }
}

const graphql = (query) => json('https://api.tcgdex.net/v2/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
}).then((r) => r.data);

/** Igual que en la app: sin tildes, mayúsculas, apóstrofos ni símbolos. */
const normalizar = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');

/** Corre fn sobre cada elemento, n a la vez. */
async function enParalelo(elementos, n, fn) {
  const cola = [...elementos];
  const resultados = [];
  await Promise.all(Array.from({ length: n }, async () => {
    while (cola.length) {
      const e = cola.shift();
      resultados.push([e, await fn(e)]);
    }
  }));
  return resultados;
}

// --- 1) Cartas físicas sin imagen en inglés ----------------------
console.log('TCGdex: cartas y sets en inglés…');
const { cards, sets } = await graphql('{ cards { id localId image set { id } } sets { id name releaseDate serie { id } } }');
const serieDe = new Map(sets.map((s) => [s.id, s.serie?.id]));
const sinImagen = cards.filter((c) => c && !c.image && serieDe.get(c.set?.id) !== 'tcgp');
console.log(`  ${sinImagen.length} cartas físicas sin imagen, de ${cards.length}`);

// --- 2) pokemontcg.io -------------------------------------------
console.log('pokemontcg.io: sets…');
const setsPtcg = (await json('https://api.pokemontcg.io/v2/sets?pageSize=250&select=id,name,releaseDate')).data;
const porNombre = new Map();
for (const p of setsPtcg) porNombre.set(normalizar(p.name), [...(porNombre.get(normalizar(p.name)) ?? []), p]);
const setPtcg = new Map();
for (const s of sets) {
  const candidatos = porNombre.get(normalizar(s.name)) ?? [];
  if (candidatos.length) {
    const distancia = (p) => Math.abs(new Date(p.releaseDate.replaceAll('/', '-')) - new Date(s.releaseDate));
    setPtcg.set(s.id, [...candidatos].sort((a, b) => distancia(a) - distancia(b))[0].id);
  } else if (setsPtcg.some((p) => p.id === s.id)) {
    setPtcg.set(s.id, s.id); // mismo id con otro nombre (svp, sve)
  }
}

console.log('pokemontcg.io: comprobando imágenes…');
const candidatas = sinImagen.filter((c) => setPtcg.has(c.set.id));
const probadas = await enParalelo(candidatas, PEDIDOS_A_LA_VEZ, async (c) => {
  // Número tal cual y sin ceros a la izquierda ("025" → "25")
  for (const numero of new Set([c.localId, c.localId.replace(/^0+(?=\d)/, '')])) {
    try {
      const r = await fetch(`https://images.pokemontcg.io/${setPtcg.get(c.set.id)}/${encodeURIComponent(numero)}.png`, { method: 'HEAD' });
      if (r.ok) return numero;
    } catch {
      // sin respuesta: se considera que no está
    }
  }
  return null;
});
const pokemontcg = { sets: {}, cartas: {} };
for (const [c, numero] of probadas.sort((a, b) => a[0].id.localeCompare(b[0].id))) {
  if (!numero) continue;
  pokemontcg.cartas[c.id] = numero;
  pokemontcg.sets[c.set.id] = setPtcg.get(c.set.id);
}
console.log(`  ${Object.keys(pokemontcg.cartas).length} con imagen`);

// --- 3) TCGdex en otros idiomas ---------------------------------
const idiomas = { series: {}, cartas: {} };
const pendientes = new Map(sinImagen.map((c) => [c.id, c]));
for (const idioma of IDIOMAS) {
  console.log(`TCGdex (${idioma})…`);
  const lista = await json(`https://api.tcgdex.net/v2/${idioma}/cards`);
  for (const c of lista) {
    const carta = pendientes.get(c.id);
    if (!carta || !c.image) continue;
    idiomas.cartas[c.id] = idioma;
    idiomas.series[carta.set.id] = serieDe.get(carta.set.id);
    pendientes.delete(c.id);
  }
}
console.log(`  ${Object.keys(idiomas.cartas).length} con imagen en otro idioma`);

// --- 4) Guardar ---------------------------------------------------
const ordenado = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const datos = {
  generado: new Date().toISOString().slice(0, 10),
  pokemontcg: { sets: ordenado(pokemontcg.sets), cartas: pokemontcg.cartas },
  idiomas: { series: ordenado(idiomas.series), cartas: ordenado(idiomas.cartas) },
};
fs.mkdirSync(new URL('../datos/', import.meta.url), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(datos));
const conAlguna = new Set([...Object.keys(pokemontcg.cartas), ...Object.keys(idiomas.cartas)]).size;
console.log(`\nListo: ${conAlguna} de ${sinImagen.length} cartas sin imagen tienen respaldo (${(100 * conAlguna / sinImagen.length).toFixed(1)} %).`);
console.log(`Archivo: datos/imagenes-alternativas.json (${(fs.statSync(SALIDA).size / 1024).toFixed(1)} KB)`);
