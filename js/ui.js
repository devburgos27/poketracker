// =============================================================
// Interfaz: todo lo que se dibuja en pantalla
// =============================================================
// Este archivo no llama a la API ni a Supabase: solo recibe datos
// y los muestra. Los elementos se crean con createElement y
// textContent (no con innerHTML) para que ningún texto externo
// pueda inyectar código en la página.
// =============================================================

const $ = (selector) => document.querySelector(selector);

// --- Sesión ---------------------------------------------------

/** Muestra el formulario de login o el correo del usuario conectado. */
export function mostrarSesion(usuario) {
  const conectado = Boolean(usuario);
  $('#form-login').hidden = conectado;
  $('#sesion-activa').hidden = !conectado;
  $('#usuario-email').textContent = usuario?.email ?? '';
  $('#aviso-login').hidden = conectado;
}

/** Mensaje bajo el formulario de login (éxito o error). */
export function mensajeLogin(texto, tipo = 'info') {
  const el = $('#mensaje-login');
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = !texto;
}

// --- Búsqueda -------------------------------------------------

/** Texto de estado sobre la grilla: "Buscando…", "12 cartas", errores. */
export function mensajeEstado(texto, tipo = 'info') {
  const el = $('#estado');
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

/** Deshabilita el buscador mientras se espera la respuesta de la API. */
export function buscando(activo) {
  $('#btn-buscar').disabled = activo;
  $('#btn-buscar').textContent = activo ? 'Buscando…' : 'Buscar';
  $('#grilla').setAttribute('aria-busy', String(activo));
}

// --- Grilla de cartas -----------------------------------------

/** Dibuja todas las cartas en la grilla. */
export function mostrarCartas(cartas) {
  const grilla = $('#grilla');
  grilla.replaceChildren(...cartas.map(crearTarjeta));
}

/** Crea la tarjeta de una carta. */
function crearTarjeta(carta) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'carta';

  // Botón con la imagen: al hacer clic se ve en grande
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'carta__imagen';
  boton.setAttribute('aria-label', `Ver ${carta.nombre} en grande`);
  boton.addEventListener('click', () => verEnGrande(carta));

  if (carta.imagenChica) {
    const img = document.createElement('img');
    img.src = carta.imagenChica;
    img.alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
    img.loading = 'lazy';      // solo se descarga cuando aparece en pantalla
    img.decoding = 'async';
    img.width = 245;           // tamaño aproximado de la imagen: evita saltos
    img.height = 342;
    boton.append(img);
  } else {
    // Algunas cartas aún no tienen imagen en la API
    const vacia = document.createElement('div');
    vacia.className = 'carta__sin-imagen';
    vacia.textContent = 'Imagen no disponible';
    boton.append(vacia);
    boton.disabled = true;
  }

  // Datos de la carta
  const info = document.createElement('div');
  info.className = 'carta__info';

  const set = document.createElement('p');
  set.className = 'carta__set';
  set.textContent = carta.nombreSet;
  set.title = carta.nombreSet; // nombre completo al pasar el mouse si se corta

  const detalle = document.createElement('p');
  detalle.className = 'carta__detalle';
  const numero = carta.totalSet ? `${carta.numero}/${carta.totalSet}` : carta.numero;
  const anio = carta.fechaSet ? carta.fechaSet.slice(0, 4) : '';
  detalle.textContent = [numero, anio].filter(Boolean).join(' · ');

  info.append(set, detalle);
  tarjeta.append(boton, info);
  return tarjeta;
}

// --- Vista ampliada -------------------------------------------

/** Abre la carta en alta resolución dentro de un <dialog>. */
function verEnGrande(carta) {
  const dialogo = $('#dialogo-carta');
  const img = $('#dialogo-imagen');
  img.src = carta.imagenGrande;
  img.alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;
  $('#dialogo-titulo').textContent = `${carta.nombre} · ${carta.nombreSet} ${carta.numero}`;
  dialogo.showModal();
}

/** Prepara el cierre del diálogo (botón y clic fuera de la carta). */
export function prepararDialogo() {
  const dialogo = $('#dialogo-carta');
  $('#dialogo-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close();
  });
}
