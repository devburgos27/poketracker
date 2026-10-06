// =============================================================
// Genera los íconos de la app instalada (iconos/*.png)
// =============================================================
// El mismo rayo de favicon.svg, dibujado a cada tamaño (no es el
// favicon agrandado: sale nítido). Tres variantes:
//   icono-192.png, icono-512.png  "any": baldosa redondeada con fondo
//                                 transparente (escritorio, Android viejo)
//   icono-maskable-512.png        "maskable": fondo a sangre y el rayo
//                                 dentro de la zona segura (círculo del
//                                 80 %), el launcher le pone su forma
//   apple-touch-icon.png (180)    iOS: cuadrado sin transparencia (iOS
//                                 redondea las esquinas y pinta de negro
//                                 lo transparente)
// El fondo es oscuro con un borde claro tenue, para que la baldosa se
// distinga tanto sobre fondos de pantalla claros como oscuros.
//
// Uso (Node 22 o más nuevo, desde la raíz del proyecto):
//   node herramientas/generar-iconos.mjs
// Dibuja cada SVG con Edge headless (CDP) y guarda la captura en PNG.
// Si Edge está en otra ruta: EDGE="C:/…/msedge.exe" node herramientas/generar-iconos.mjs
// =============================================================

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PUERTO = 9339;
const CARPETA = new URL('../iconos/', import.meta.url);

// Rayo de favicon.svg (viewBox de 32): caja de 5.3–24 × 3–29, centro 14.65, 16
const RAYO = 'M18.7 3 5.3 19h8l-2.7 10L24 13h-8z';

/**
 * SVG de 512 × 512.
 * @param {{redondeado: boolean, escala: number}} o  escala del rayo (unidades de 32 → 512)
 */
function svg({ redondeado, escala }) {
  const radio = redondeado ? 112 : 0;
  const borde = redondeado
    ? `<rect x="4" y="4" width="504" height="504" rx="${radio - 4}" fill="none" stroke="#ffffff" stroke-opacity=".1" stroke-width="8"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c2541"/>
      <stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <radialGradient id="halo" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#ffd60a" stop-opacity=".28"/>
      <stop offset="1" stop-color="#ffd60a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rayo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe14d"/>
      <stop offset=".55" stop-color="#ffd60a"/>
      <stop offset="1" stop-color="#ffb300"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${radio}" fill="url(#fondo)"/>
  ${borde}
  <circle cx="256" cy="256" r="${Math.round(escala * 15)}" fill="url(#halo)"/>
  <path transform="translate(256 256) scale(${escala}) translate(-14.65 -16)" fill="url(#rayo)" d="${RAYO}"/>
</svg>`;
}

const ICONOS = [
  // "any": el rayo ocupa ~60 % del alto de la baldosa
  { archivo: 'icono-192.png', tamano: 192, svg: svg({ redondeado: true, escala: 12 }) },
  { archivo: 'icono-512.png', tamano: 512, svg: svg({ redondeado: true, escala: 12 }) },
  // Zona segura: la caja del rayo (media diagonal de 16 unidades) mide
  // 16 × 10 = 160 px desde el centro, dentro del radio de 204,8 px
  { archivo: 'icono-maskable-512.png', tamano: 512, svg: svg({ redondeado: false, escala: 10 }) },
  { archivo: 'apple-touch-icon.png', tamano: 180, svg: svg({ redondeado: false, escala: 11.5 }) },
];

// --- CDP mínimo ------------------------------------------------

async function esperarEdge() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error('Edge no respondió en el puerto de depuración');
}

function conectar(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pendientes = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (!m.id || !pendientes.has(m.id)) return;
    const { resolver, rechazar } = pendientes.get(m.id);
    pendientes.delete(m.id);
    if (m.error) rechazar(new Error(m.error.message));
    else resolver(m.result);
  });
  const enviar = (method, params = {}, sessionId) => new Promise((resolver, rechazar) => {
    pendientes.set(++id, { resolver, rechazar });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return new Promise((r) => ws.addEventListener('open', () => r({ ws, enviar })));
}

// --- Generación -----------------------------------------------

const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-iconos-'));
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`,
  '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank',
], { stdio: 'ignore' });

try {
  const { ws, enviar } = await conectar(await esperarEdge());
  const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await enviar('Target.attachToTarget', { targetId, flatten: true });
  const s = (metodo, params) => enviar(metodo, params, sessionId);
  await s('Page.enable');
  await s('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  fs.mkdirSync(CARPETA, { recursive: true });

  for (const { archivo, tamano, svg: dibujo } of ICONOS) {
    await s('Emulation.setDeviceMetricsOverride', { width: tamano, height: tamano, deviceScaleFactor: 1, mobile: false });
    const html = `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${tamano}px;height:${tamano}px}</style>${dibujo}`;
    await s('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await s('Page.captureScreenshot', {
      format: 'png', clip: { x: 0, y: 0, width: tamano, height: tamano, scale: 1 },
    });
    fs.writeFileSync(new URL(archivo, CARPETA), Buffer.from(data, 'base64'));
    console.log(`  ${archivo} (${tamano} × ${tamano})`);
  }
  ws.close();
} finally {
  edge.kill(); // solo el Edge que abrió este script (por su proceso, no por nombre)
  await new Promise((r) => setTimeout(r, 500));
  fs.rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
