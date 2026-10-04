// =============================================================
// Animaciones
// =============================================================
// Un solo lugar para el movimiento de la app, con la Web Animations
// API (element.animate) y sin librerías. El resto llama a estas
// funciones; si el navegador no anima o la persona pidió menos
// movimiento (prefers-reduced-motion), no hacen nada y todo queda en
// su estado final, que es el que dibuja el CSS.
//
// Reglas:
// - Solo se animan transform y opacity: nada que recalcule el diseño.
// - Interacciones de 400 ms como máximo; la barra de progreso, 900 ms.
// - Nada bloquea: tocar la pantalla o una tecla termina al instante
//   lo que se esté moviendo (cortar(), más abajo).
// - Los menús de la cabecera (popover) se animan solo con CSS: también
//   tienen que animarse al cerrarse solos (Esc, tocar fuera), y eso no
//   pasa por aquí. Usan la misma curva (--curva-burbuja).
// =============================================================

const MENOS_MOVIMIENTO = window.matchMedia('(prefers-reduced-motion: reduce)');
const PUEDE_ANIMAR = typeof Element.prototype.animate === 'function';

/** ¿Se anima? Se pregunta cada vez: la preferencia puede cambiar con la página abierta. */
const conMovimiento = () => PUEDE_ANIMAR && !MENOS_MOVIMIENTO.matches;

// --- Curvas ---------------------------------------------------
// Rebote tipo resorte con linear(): la posición de un resorte
// amortiguado, muestreada en 48 puntos. amortiguacion < 1 rebota (más
// chica, más rebote); la envolvente llega a 0,15 % al final, así el
// último punto (1) no da un salto. Sin linear() (Safari < 17.2), una
// curva con un leve sobrepaso y sin oscilación.

function curvaResorte(amortiguacion, muestras = 48) {
  const w = 6.5 / amortiguacion;
  const wd = w * Math.sqrt(1 - amortiguacion ** 2);
  const posicion = (t) => 1 - Math.exp(-amortiguacion * w * t)
    * (Math.cos(wd * t) + ((amortiguacion * w) / wd) * Math.sin(wd * t));
  const puntos = Array.from({ length: muestras + 1 }, (_, i) => (i === muestras ? 1 : +posicion(i / muestras).toFixed(4)));
  return `linear(${puntos.join(', ')})`;
}

const HAY_LINEAR = window.CSS?.supports?.('transition-timing-function', 'linear(0, 1)') ?? false;
// Burbujas y avisos: rebote notorio (sobrepasa un 12 %)
const REBOTE = HAY_LINEAR ? curvaResorte(0.55) : 'cubic-bezier(0.34, 1.56, 0.64, 1)';
// Barra: rebote leve (sobrepasa un 3 %)
const REBOTE_SUAVE = HAY_LINEAR ? curvaResorte(0.75) : 'cubic-bezier(0.34, 1.2, 0.64, 1)';
document.documentElement.style.setProperty('--curva-burbuja', REBOTE);

const ENTRADA = 400;  // burbujas, avisos, pop
const FONDO = 200;    // fondo oscurecido
const SALIDA = 150;   // cierre: rápido y sin rebote
const BARRA = 900;
const CASCADA = 60;   // entre una barra y la siguiente

// --- Animaciones en curso y corte --------------------------------

const enCurso = new Set();

/** element.animate() registrado: cortar() lo termina al instante. */
function animar(el, keyframes, opciones) {
  const a = el.animate(keyframes, opciones);
  enCurso.add(a);
  const quitar = () => enCurso.delete(a);
  a.addEventListener('finish', quitar);
  a.addEventListener('cancel', quitar);
  return a;
}

/**
 * Tocar la pantalla o apretar una tecla termina lo que se esté moviendo
 * (queda en su estado final). Va en la fase de captura: corre antes que
 * el clic, así lo que ese clic abra empieza su propia animación.
 */
function cortar() {
  for (const a of [...enCurso]) {
    a.cortada = true;
    a.finish();
  }
}
window.addEventListener('pointerdown', cortar, true);
window.addEventListener('keydown', cortar, true);

// Último toque: de ahí sale la burbuja si quien la abre no dice el origen
let ultimoToque = { el: null, momento: 0 };
window.addEventListener('pointerdown', (e) => {
  ultimoToque = { el: e.target, momento: performance.now() };
}, true);

/** El elemento desde donde crece una burbuja: el indicado, lo último tocado o el foco. */
function origenDe(origen) {
  if (origen?.isConnected) return origen;
  if (performance.now() - ultimoToque.momento < 1000 && ultimoToque.el?.isConnected) return ultimoToque.el;
  const foco = document.activeElement;
  return foco && foco !== document.body ? foco : null;
}

/** transform-origin de `panel` en el centro de `origen` (o su centro). */
function puntoDeOrigen(panel, origen) {
  const el = origenDe(origen);
  const o = el?.getBoundingClientRect();
  if (!o || (!o.width && !o.height)) return '50% 50%';
  const p = panel.getBoundingClientRect();
  return `${o.left + o.width / 2 - p.left}px ${o.top + o.height / 2 - p.top}px`;
}

// --- Burbujas: <dialog> modales ----------------------------------
// Aparecen con scale 0,85 → 1 y opacidad, con rebote, creciendo desde
// lo que las abrió; el fondo oscurecido se desvanece aparte. Se cierran
// rápido, sin rebote, y recién al terminar se llama a close(): los
// listeners de "close" (foco, returnValue) siguen igual.

const burbujas = new WeakMap(); // <dialog> → { panel, fondo, cierre }

/**
 * Prepara un <dialog> para abrirse y cerrarse como burbuja. Esc también
 * cierra con la animación.
 * @param {HTMLDialogElement} dialogo
 * @param {{panel?: Element, fondo?: Element|'::backdrop'}} [opciones]
 *   panel: lo que crece (por defecto el <dialog>); fondo: lo que se
 *   desvanece (por defecto su ::backdrop)
 */
export function prepararBurbuja(dialogo, { panel = dialogo, fondo = '::backdrop' } = {}) {
  burbujas.set(dialogo, { panel, fondo, cierre: null });
  dialogo.addEventListener('cancel', (e) => {
    // Si el navegador no deja cancelarlo (Esc dos veces seguidas sin
    // otra interacción), se cierra solo, sin animación
    if (!conMovimiento() || !e.cancelable) return;
    e.preventDefault();
    cerrarBurbuja(dialogo);
  });
}

/** Anima la opacidad del fondo (el ::backdrop o un elemento). */
function animarFondo(dialogo, fondo, desde, hasta, opciones) {
  if (fondo === '::backdrop') {
    return animar(dialogo, { opacity: [desde, hasta] }, { ...opciones, pseudoElement: '::backdrop' });
  }
  return animar(fondo, { opacity: [desde, hasta] }, opciones);
}

/**
 * Abre el <dialog> (showModal) y lo anima. Si se estaba cerrando, el
 * cierre termina primero.
 * @param {Element|null} [origen]  desde dónde crece (si no, lo último tocado o el foco)
 */
export function abrirBurbuja(dialogo, origen = null) {
  terminarCierre(dialogo);
  if (!dialogo.open) dialogo.showModal();
  const burbuja = burbujas.get(dialogo);
  if (!burbuja || !conMovimiento()) return;
  const { panel, fondo } = burbuja;
  panel.style.transformOrigin = puntoDeOrigen(panel, origen);
  const crecer = animar(panel, { transform: ['scale(0.85)', 'none'] }, { duration: ENTRADA, easing: REBOTE });
  animar(panel, { opacity: [0, 1] }, { duration: FONDO, easing: 'ease-out' });
  animarFondo(dialogo, fondo, 0, 1, { duration: FONDO, easing: 'ease-out' });
  crecer.finished.catch(() => {}).then(() => { panel.style.transformOrigin = ''; });
}

/**
 * Cierra el <dialog> con la animación de salida y luego close(valor).
 * Sin movimiento, close(valor) al instante.
 */
export function cerrarBurbuja(dialogo, valor) {
  if (!dialogo.open) return;
  const burbuja = burbujas.get(dialogo);
  if (burbuja?.cierre) return; // ya se está cerrando
  if (!burbuja || !conMovimiento()) {
    dialogo.close(valor);
    return;
  }
  const { panel, fondo } = burbuja;
  const opciones = { duration: SALIDA, easing: 'ease-in', fill: 'forwards' };
  const animaciones = [
    animar(panel, { transform: ['none', 'scale(0.95)'], opacity: [1, 0] }, opciones),
    animarFondo(dialogo, fondo, 1, 0, opciones),
  ];
  burbuja.cierre = { animaciones, valor };
  Promise.all(animaciones.map((a) => a.finished)).catch(() => {}).then(() => terminarCierre(dialogo));
}

/** Termina un cierre en curso: close() y fuera los estados finales retenidos (fill). */
function terminarCierre(dialogo) {
  const burbuja = burbujas.get(dialogo);
  if (!burbuja?.cierre) return;
  const { animaciones, valor } = burbuja.cierre;
  burbuja.cierre = null;
  if (dialogo.open) dialogo.close(valor);
  animaciones.forEach((a) => a.cancel());
}

// --- Avisos ------------------------------------------------------

/** El aviso sube desde abajo como burbuja, con rebote. */
export function entrarAviso(aviso) {
  if (!conMovimiento()) return;
  aviso.style.transformOrigin = '50% 100%';
  animar(aviso, { transform: ['translateY(16px) scale(0.85)', 'none'] }, { duration: ENTRADA, easing: REBOTE });
  animar(aviso, { opacity: [0, 1] }, { duration: FONDO, easing: 'ease-out' });
}

/**
 * El aviso se va (rápido, sin rebote). Se resuelve al terminar (al
 * instante sin movimiento); quien llama lo saca de la página.
 * @returns {Promise<void>}
 */
export function salirAviso(aviso) {
  if (!conMovimiento()) return Promise.resolve();
  const a = animar(aviso, { transform: ['none', 'scale(0.95)'], opacity: [1, 0] }, { duration: SALIDA, easing: 'ease-in', fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => {});
}

// --- Detalle de carta ----------------------------------------------

/**
 * Al pasar a otra carta: desplazamiento corto, sin rebote. La carta
 * nueva entra desde el lado de la flecha (siguiente: desde la derecha).
 * @param {-1|1} direccion
 */
export function deslizar(el, direccion) {
  if (!conMovimiento()) return;
  animar(el, {
    transform: [`translateX(${direccion * 24}px)`, 'none'],
    opacity: [0.4, 1],
  }, { duration: 200, easing: 'ease-out' });
}

/** La cifra del contador de copias da un salto breve al cambiar. */
export function saltar(el) {
  if (!conMovimiento()) return;
  animar(el, [
    { transform: 'none' },
    { transform: 'translateY(-3px) scale(1.25)', offset: 0.35 },
    { transform: 'none' },
  ], { duration: 260, easing: 'ease-out' });
}

/**
 * "Agregar a mi colección": la insignia que lo reemplaza hace un pop y
 * salen 6 chispas (dibujo propio: rombos de la marca) que se apagan.
 * @param {Element} el  lo que hace el pop
 * @param {Element} contenedor  donde van las chispas (position: relative)
 */
export function celebrar(el, contenedor) {
  if (!conMovimiento()) return;
  animar(el, { transform: ['scale(0.85)', 'none'] }, { duration: ENTRADA, easing: REBOTE });
  const r = el.getBoundingClientRect();
  const c = contenedor.getBoundingClientRect();
  const x = r.left + r.width / 2 - c.left;
  const y = r.top + r.height / 2 - c.top;
  for (let i = 0; i < 6; i++) {
    const chispa = document.createElement('span');
    chispa.className = 'chispa';
    chispa.setAttribute('aria-hidden', 'true');
    chispa.style.left = `${x}px`;
    chispa.style.top = `${y}px`;
    contenedor.append(chispa);
    // Alrededor de la insignia, más lejos a los lados (es ancha)
    const angulo = (i / 6) * 2 * Math.PI + Math.PI / 6;
    const dx = Math.cos(angulo) * (r.width / 2 + 10);
    const dy = Math.sin(angulo) * (r.height / 2 + 10);
    const a = animar(chispa, {
      transform: ['translate(-50%, -50%) rotate(45deg) scale(1)', `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(45deg) scale(0)`],
      opacity: [1, 0],
    }, { duration: ENTRADA, easing: 'ease-out', fill: 'forwards' });
    const quitar = () => chispa.remove();
    a.addEventListener('finish', quitar);
    a.addEventListener('cancel', quitar);
  }
}

// --- Barra de progreso -------------------------------------------
// El relleno corre con translateX (ver .progreso__relleno en el CSS: así
// la punta redondeada no se deforma), con un rebote leve; la cifra
// cuenta a la par y una chispa viaja en la punta. Se anima la primera
// vez que la barra entra en pantalla en esta visita; si después sube
// (agregaste una carta), solo el tramo nuevo; si no, se muestra directo.
// Las listas se redibujan cuando llega cada dato: si la barra de un
// objetivo se estaba animando, la nueva sigue desde el mismo punto.

/**
 * clave → { tengo, total, fase: 'pendiente'|'animando'|'lista',
 *   desde, inicio, retraso } (inicio y retraso: performance.now() y ms)
 */
const barras = new Map();
let observador = null;
const esperando = new Map(); // barra observada → arrancar()

/**
 * @param {HTMLElement} bloque  el .progreso (barra, relleno, chispa, cifra)
 * @param {{clave: string, tengo: number, total: number, completo: boolean,
 *   fraccion: (tengo: number) => number, texto: (tengo: number) => string}} datos
 *   clave: el objetivo y la pantalla (cada pantalla se anima una vez);
 *   fraccion: cuánto se llena con esas cartas (0 a 1); texto: la cifra
 *   mientras cuenta
 */
export function animarBarra(bloque, datos) {
  const { clave, tengo, total } = datos;
  const previo = barras.get(clave);
  const mismo = previo && previo.tengo === tengo && previo.total === total;

  if (!conMovimiento()) {
    barras.set(clave, { tengo, total, fase: 'lista' });
    return;
  }
  // Se estaba animando hacia este mismo valor: sigue en la barra nueva
  if (mismo && previo.fase === 'animando' && performance.now() < previo.inicio + previo.retraso + BARRA) {
    correrBarra(bloque, datos, previo.desde, previo.inicio, previo.retraso);
    return;
  }

  let desde;
  if (!previo) desde = 0;                                            // primera vez
  else if (previo.fase === 'pendiente') desde = previo.desde;         // todavía no se vio
  else if (previo.total === total && tengo > previo.tengo) desde = previo.tengo; // subió: el tramo nuevo
  else {
    barras.set(clave, { tengo, total, fase: 'lista' });               // igual o bajó: directo
    return;
  }

  barras.set(clave, { tengo, total, fase: 'pendiente', desde });
  // Hasta que se vea, queda en el valor de partida
  const relleno = bloque.querySelector('.progreso__relleno');
  relleno.style.setProperty('--p-ahora', datos.fraccion(desde));
  mostrarCifra(bloque, datos.texto(desde));
  esperarVisible(bloque, (retraso) => {
    const actual = barras.get(clave);
    if (actual?.fase !== 'pendiente' || actual.tengo !== tengo) return; // llegó otro valor
    const inicio = performance.now();
    barras.set(clave, { tengo, total, fase: 'animando', desde, inicio, retraso });
    correrBarra(bloque, datos, desde, inicio, retraso);
  });
}

/**
 * Llama a arrancar(retraso) cuando la barra entra en pantalla; las que
 * entran juntas, en cascada. Se observa la barra y no el bloque: en la
 * tarjeta de objetivo el bloque es display: contents (sin caja propia,
 * nunca "entraría").
 */
function esperarVisible(bloque, arrancar) {
  const barra = bloque.querySelector('.progreso__barra');
  observador ??= new IntersectionObserver((entradas) => {
    let orden = 0;
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      const fn = esperando.get(entrada.target);
      observador.unobserve(entrada.target);
      esperando.delete(entrada.target);
      fn?.(orden++ * CASCADA);
    }
  });
  esperando.set(barra, arrancar);
  observador.observe(barra);
  // Las barras de un redibujo anterior ya no están en la página. Se
  // revisa después de que termine el redibujo: mientras se arma la lista,
  // las barras nuevas todavía no están en la página y parecerían viejas
  if (!limpiezaPendiente) {
    limpiezaPendiente = true;
    queueMicrotask(() => {
      limpiezaPendiente = false;
      for (const vieja of esperando.keys()) {
        if (!vieja.isConnected) {
          observador.unobserve(vieja);
          esperando.delete(vieja);
        }
      }
    });
  }
}
let limpiezaPendiente = false;

/** La cifra visible mientras cuenta; el lector de pantalla oye siempre el valor final. */
function mostrarCifra(bloque, visible) {
  const cifra = bloque.querySelector('.progreso__cifra');
  cifra.dataset.final ??= cifra.textContent;
  const ojo = document.createElement('span');
  ojo.setAttribute('aria-hidden', 'true');
  ojo.textContent = visible;
  const voz = document.createElement('span');
  voz.className = 'visualmente-oculto';
  voz.textContent = cifra.dataset.final;
  cifra.replaceChildren(ojo, voz);
}

function restaurarCifra(bloque) {
  const cifra = bloque.querySelector('.progreso__cifra');
  if (cifra.dataset.final === undefined) return;
  cifra.textContent = cifra.dataset.final;
  delete cifra.dataset.final;
}

/**
 * Relleno, chispa y cifra de `desde` al valor final. inicio y retraso
 * dicen cuándo empezó (para seguir una animación en una barra redibujada).
 */
function correrBarra(bloque, datos, desde, inicio, retraso) {
  const relleno = bloque.querySelector('.progreso__relleno');
  const chispa = bloque.querySelector('.progreso__chispa');
  const posicion = (f) => `translateX(${(f - 1) * 50}%)`; // el relleno mide el doble de la barra
  relleno.style.removeProperty('--p-ahora');

  const opciones = { duration: BARRA, delay: retraso, fill: 'backwards' };
  const llenar = animar(relleno, { transform: [posicion(datos.fraccion(desde)), posicion(datos.fraccion(datos.tengo))] },
    { ...opciones, easing: REBOTE_SUAVE });
  const brillar = animar(chispa, [
    { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 },
  ], opciones);
  // Seguir una animación ya empezada (la barra se redibujó)
  const transcurrido = performance.now() - inicio;
  if (transcurrido > 0) llenar.currentTime = brillar.currentTime = transcurrido;

  // La cifra cuenta con la misma duración (sin rebote: los números no retroceden)
  mostrarCifra(bloque, datos.texto(desde));
  const ojo = bloque.querySelector('.progreso__cifra [aria-hidden]');
  const contar = () => {
    if (llenar.playState !== 'running' && llenar.playState !== 'pending') return;
    const t = Math.min(Math.max((llenar.currentTime - retraso) / BARRA, 0), 1);
    const avance = 1 - (1 - t) ** 3;
    ojo.textContent = datos.texto(Math.round(desde + (datos.tengo - desde) * avance));
    requestAnimationFrame(contar);
  };
  requestAnimationFrame(contar);

  llenar.finished.catch(() => {}).then(() => {
    restaurarCifra(bloque);
    const estado = barras.get(datos.clave);
    if (estado?.fase === 'animando' && estado.tengo === datos.tengo) estado.fase = 'lista';
    // Al llegar a 100 %: un solo pulso de brillo (no si se cortó tocando algo)
    if (datos.completo && !llenar.cortada && bloque.isConnected && conMovimiento()) {
      animar(bloque.querySelector('.progreso__pulso'), { opacity: [0, 0.8, 0] }, { duration: ENTRADA, easing: 'ease-out' });
    }
  });
}
