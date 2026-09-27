// =============================================================
// Interfaz: todo lo que se dibuja en pantalla
// =============================================================
// Este archivo no llama a la API ni a Supabase: solo recibe datos
// y los muestra. Los elementos se crean con createElement y
// textContent (no con innerHTML) para que ningún texto externo
// pueda inyectar código en la página.
// =============================================================

const $ = (selector) => document.querySelector(selector);

/** Escribe un mensaje de estado ("Buscando…", "12 cartas", errores). */
function escribirMensaje(el, texto, tipo) {
  el.textContent = texto;
  el.dataset.tipo = tipo;
}

// --- Sin conexión ---------------------------------------------

/**
 * Estado "No pudimos conectar" con botón "Reintentar": el único
 * formato para errores de red (la app no reintenta sola).
 * Misma estructura que el estado vacío (.vacio).
 * Al tocar "Reintentar" el botón se desactiva y dice "Reintentando…";
 * quien llama reemplaza el estado cuando termina (bien o mal).
 *
 * @param {() => void} alReintentar
 * @param {{compacto?: boolean}} [opciones]  compacto: para espacios chicos
 * @returns {HTMLElement}
 */
export function crearErrorConexion(alReintentar, { compacto = false } = {}) {
  const caja = document.createElement('div');
  caja.className = `vacio grilla__vacio sin-conexion${compacto ? ' sin-conexion--compacto' : ''}`;
  caja.setAttribute('role', 'alert');

  const textos = document.createElement('div');
  textos.className = 'sin-conexion__textos';
  const titulo = document.createElement('p');
  titulo.className = 'sin-conexion__titulo';
  titulo.textContent = 'No pudimos conectar';
  const texto = document.createElement('p');
  texto.className = 'sin-conexion__texto';
  texto.textContent = 'Revisa tu conexión e inténtalo de nuevo.';
  textos.append(titulo, texto);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton--secundario sin-conexion__boton';
  const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icono.setAttribute('class', 'icono');
  icono.setAttribute('aria-hidden', 'true');
  const uso = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', '#icono-recargar');
  icono.append(uso);
  const etiqueta = document.createElement('span');
  etiqueta.textContent = 'Reintentar';
  boton.append(icono, etiqueta);
  boton.addEventListener('click', () => {
    boton.disabled = true;
    etiqueta.textContent = 'Reintentando…';
    alReintentar();
  });

  caja.append(textos, boton);
  return caja;
}

/** Aviso arriba de la pantalla (carga inicial). null lo oculta. */
export function mostrarAvisoConexion(alReintentar) {
  const aviso = $('#aviso-conexion');
  aviso.hidden = !alReintentar;
  aviso.replaceChildren(...(alReintentar ? [crearErrorConexion(alReintentar)] : []));
}

// --- Sesión ---------------------------------------------------

/**
 * Muestra lo que corresponde a visitantes o a usuarios conectados:
 * los elementos con data-solo="visitante" o data-solo="usuario".
 */
export function mostrarSesion(usuario) {
  const conectado = Boolean(usuario);
  document.querySelectorAll('[data-solo="visitante"]').forEach((el) => { el.hidden = conectado; });
  document.querySelectorAll('[data-solo="usuario"]').forEach((el) => { el.hidden = !conectado; });
  $('#usuario-email').textContent = usuario?.email ?? '';
}

/** Activa o desactiva todos los botones "Entrar con Google". */
export function activarBotonesGoogle(activos) {
  document.querySelectorAll('[data-accion="google"]').forEach((btn) => { btn.disabled = !activos; });
}

/** Mensaje bajo el formulario de login (éxito o error). */
export function mensajeLogin(texto, tipo = 'info') {
  const el = $('#mensaje-login');
  escribirMensaje(el, texto, tipo);
  el.hidden = !texto;
}

// --- Tema claro / oscuro --------------------------------------
// La preferencia se guarda en localStorage ('pt-tema'). Sin nada
// guardado manda el sistema. El <head> aplica el tema guardado
// antes de pintar; aquí solo se maneja el botón.

const CLAVE_TEMA = 'pt-tema';
const temaOscuroSistema = window.matchMedia('(prefers-color-scheme: dark)');

function temaActual() {
  return document.documentElement.dataset.tema
    ?? (temaOscuroSistema.matches ? 'oscuro' : 'claro');
}

/** Sincroniza el botón y la barra del navegador con el tema activo. */
function pintarTema() {
  const oscuro = temaActual() === 'oscuro';
  $('#btn-tema').setAttribute('aria-pressed', String(oscuro));
  // Toma el fondo de la cabecera del CSS, así no se repiten colores aquí
  const fondo = getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', fondo);
}

/** Prepara el botón ☀️/🌙 de la cabecera. */
export function prepararSelectorTema() {
  $('#btn-tema').addEventListener('click', () => {
    const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = nuevo;
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Sin almacenamiento (modo privado estricto): el tema dura hasta recargar
    }
    pintarTema();
  });
  // Si no hay preferencia guardada y el sistema cambia, se sigue al sistema
  temaOscuroSistema.addEventListener('change', pintarTema);
  pintarTema();
}

// --- Navegación -----------------------------------------------

const VISTAS = ['inicio', 'buscar', 'coleccion'];

/**
 * Muestra una pantalla, marca su ítem en la barra y cambia el
 * título de la pestaña del navegador.
 * @param {'inicio'|'buscar'|'coleccion'} vista
 * @param {string} titulo
 */
export function mostrarVista(vista, titulo) {
  VISTAS.forEach((v) => { $(`#vista-${v}`).hidden = v !== vista; });
  document.querySelectorAll('#navegacion [data-ruta]').forEach((enlace) => {
    if (enlace.dataset.ruta === vista) enlace.setAttribute('aria-current', 'page');
    else enlace.removeAttribute('aria-current');
  });
  document.title = titulo;
}

/**
 * Al entrar a otra pantalla: vuelve arriba y pone el foco en su
 * título, para que el lector de pantalla anuncie dónde se está.
 */
export function enfocarTitulo(vista) {
  window.scrollTo(0, 0);
  // Inicio tiene un título para visitantes y otro con sesión: se usa el visible
  const titulo = [...$(`#vista-${vista}`).querySelectorAll('[data-titulo]')]
    .find((el) => el.offsetParent !== null);
  titulo?.focus({ preventScroll: true });
}

/** Los enlaces a Buscar llevan a la última búsqueda (#/buscar?q=…). */
export function actualizarEnlacesBuscar(texto) {
  const href = texto ? `#/buscar?q=${encodeURIComponent(texto)}` : '#/buscar';
  document.querySelectorAll('[data-enlace-buscar]').forEach((a) => a.setAttribute('href', href));
}

// --- Búsqueda -------------------------------------------------

/** Texto de estado sobre la grilla: "Buscando…", "12 cartas", errores. */
export function mensajeEstado(texto, tipo = 'info') {
  escribirMensaje($('#estado'), texto, tipo);
}

/** Buscar sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorBusqueda(alReintentar) {
  mensajeEstado('');
  $('#filtros').hidden = true;
  $('#grilla').replaceChildren(crearErrorConexion(alReintentar));
}

/** Deshabilita el buscador mientras se espera la respuesta de la API. */
export function buscando(activo) {
  $('#btn-buscar').disabled = activo;
  $('#btn-buscar').textContent = activo ? 'Buscando…' : 'Buscar';
  $('#grilla').setAttribute('aria-busy', String(activo));
}

/**
 * Pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)".
 * Con conteos = null se ocultan (sin sesión o sin resultados).
 *
 * @param {null | {todas: number, tengo: number, falta: number}} conteos
 * @param {'todas'|'tengo'|'falta'} activo
 */
export function mostrarFiltros(conteos, activo = 'todas') {
  const filtros = $('#filtros');
  filtros.hidden = !conteos;
  if (!conteos) return;

  const nombres = { todas: 'Todas', tengo: 'Tengo', falta: 'Me falta' };
  filtros.querySelectorAll('[data-filtro]').forEach((btn) => {
    const clave = btn.dataset.filtro;
    btn.textContent = `${nombres[clave]} (${conteos[clave]})`;
    btn.setAttribute('aria-pressed', String(clave === activo));
  });
}

// --- Inicio ---------------------------------------------------

/** Texto de estado de "Agregadas recientemente". */
export function mensajeInicio(texto, tipo = 'info') {
  escribirMensaje($('#estado-inicio'), texto, tipo);
}

/** Inicio sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorInicio(alReintentar) {
  mensajeInicio('');
  $('#grilla-recientes').replaceChildren(crearErrorConexion(alReintentar));
}

/** Dibuja las cartas recientes (mismos parámetros que mostrarCartas). */
export function mostrarRecientes(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-recientes'), cartas, marcado, textoVacio);
}

// --- Mi colección ---------------------------------------------

/** Texto de estado de "Mi colección": "Cargando…", "12 cartas", errores. */
export function mensajeColeccion(texto, tipo = 'info') {
  escribirMensaje($('#estado-coleccion'), texto, tipo);
}

/** Colección sin conexión: el estado "No pudimos conectar" en la grilla. */
export function errorColeccion(alReintentar) {
  mensajeColeccion('');
  $('#grilla-coleccion').replaceChildren(crearErrorConexion(alReintentar));
}

/** Dibuja las cartas de "Mi colección" (mismos parámetros que mostrarCartas). */
export function mostrarColeccion(cartas, marcado, textoVacio) {
  dibujarGrilla($('#grilla-coleccion'), cartas, marcado, textoVacio);
}

// --- Grilla de cartas -----------------------------------------

/**
 * Dibuja las cartas de la búsqueda en la grilla.
 *
 * @param {Array} cartas
 * @param {null | {
 *   misCartas: Map<string, {filaId: number, copias: number}>,
 *   alCambiar: (carta: object, tengo: boolean) => Promise<void>
 * }} marcado  null si no hay sesión: las cartas se ven sin botones.
 * @param {string} [textoVacio]  mensaje si no hay cartas que mostrar
 */
export function mostrarCartas(cartas, marcado = null, textoVacio = '') {
  dibujarGrilla($('#grilla'), cartas, marcado, textoVacio);
}

function dibujarGrilla(grilla, cartas, marcado, textoVacio) {
  if (cartas.length === 0 && textoVacio) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio grilla__vacio';
    vacio.textContent = textoVacio;
    grilla.replaceChildren(vacio);
    return;
  }
  grilla.replaceChildren(...cartas.map((carta) => crearTarjeta(carta, marcado)));
}

/** Crea la tarjeta de una carta. */
function crearTarjeta(carta, marcado) {
  const tarjeta = document.createElement('article');
  tarjeta.className = 'carta';
  tarjeta.dataset.id = carta.id;
  const copias = marcado?.misCartas.get(carta.id)?.copias ?? 0;

  // Botón con la imagen: abre el detalle de la carta
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'carta__imagen';
  const etiquetaCopias = copias > 1 ? ` (${copias} copias)` : '';
  boton.setAttribute('aria-label', `Ver detalle de ${carta.nombre}${etiquetaCopias}`);
  boton.addEventListener('click', () => alAbrirCarta(carta));

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
  }

  // "×2" sobre la imagen cuando hay más de una copia
  // (el lector de pantalla ya lo oye en la etiqueta del botón)
  if (copias > 1) {
    const insignia = document.createElement('span');
    insignia.className = 'carta__copias';
    insignia.setAttribute('aria-hidden', 'true');
    insignia.textContent = `×${copias}`;
    tarjeta.append(insignia);
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
  if (marcado) info.append(crearMarcado(carta, tarjeta, marcado));
  tarjeta.append(boton, info);
  return tarjeta;
}

/**
 * Par de botones "Tengo" / "Me falta". El que está presionado
 * (aria-pressed) indica el estado actual de la carta.
 * El cambio se muestra al instante y se revierte si alCambiar falla
 * (el mensaje de error lo muestra quien llama).
 */
function crearMarcado(carta, tarjeta, { misCartas, alCambiar }) {
  const grupo = document.createElement('div');
  grupo.className = 'marcado';
  grupo.setAttribute('role', 'group');
  grupo.setAttribute('aria-label', `¿Tienes ${carta.nombre} ${carta.numero}?`);

  const btnTengo = crearBotonMarcado('Tengo', 'marcado__tengo');
  const btnFalta = crearBotonMarcado('Me falta', 'marcado__falta');

  const pintar = (tengo) => {
    btnTengo.setAttribute('aria-pressed', String(tengo));
    btnFalta.setAttribute('aria-pressed', String(!tengo));
    tarjeta.classList.toggle('carta--tengo', tengo);
    if (!tengo) tarjeta.querySelector('.carta__copias')?.remove(); // ya no hay copias
  };

  const cambiar = async (tengo) => {
    if (misCartas.has(carta.id) === tengo) return;
    // "Me falta" borra todas las copias: con más de una, se confirma
    const copias = misCartas.get(carta.id)?.copias ?? 0;
    if (!tengo && copias > 1) {
      const quitar = await confirmar({
        titulo: `¿Quitar ${carta.nombre} de tu colección?`,
        mensaje: `Se quitarán las ${copias} copias, con su idioma y condición.`,
        textoConfirmar: 'Quitar copias',
        peligro: true,
      });
      if (!quitar) return;
    }
    pintar(tengo);
    btnTengo.disabled = btnFalta.disabled = true;
    try {
      await alCambiar(carta, tengo);
    } catch {
      pintar(!tengo);
    } finally {
      btnTengo.disabled = btnFalta.disabled = false;
    }
  };

  btnTengo.addEventListener('click', () => cambiar(true));
  btnFalta.addEventListener('click', () => cambiar(false));

  pintar(misCartas.has(carta.id));
  grupo.append(btnTengo, btnFalta);
  return grupo;
}

function crearBotonMarcado(texto, clase) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `marcado__boton ${clase}`;
  btn.textContent = texto;
  return btn;
}

// --- Detalle de carta ----------------------------------------
// Imagen grande, datos y "Tus copias". Los datos y las acciones los
// maneja main.js; aquí solo se dibuja.

const IDIOMAS = {
  en: 'Inglés', ja: 'Japonés', es: 'Español', ko: 'Coreano', de: 'Alemán',
  fr: 'Francés', pt: 'Portugués', it: 'Italiano', zh: 'Chino', otro: 'Otro',
};
const CONDICIONES = {
  NM: 'Excelente', LP: 'Muy buena', MP: 'Buena', HP: 'Regular', DMG: 'Dañada',
};

let alAbrirCarta = () => {};
let accionesCopias = null;
let focoPendiente = null; // control que tenía el foco antes de guardar

/**
 * Conecta el detalle con main.js.
 * @param {{
 *   alAbrir: (carta: object) => void,
 *   alCerrar: () => void,
 *   alSumar: () => void,
 *   alRestar: () => void,
 *   alCambiar: (copia: object, campo: 'idioma'|'condicion', valor: string|null) => void,
 *   alQuitar: (copia: object) => void,
 * }} acciones
 */
export function prepararDetalle(acciones) {
  alAbrirCarta = acciones.alAbrir;
  accionesCopias = acciones;

  const dialogo = $('#dialogo-carta');
  $('#dialogo-cerrar').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close(); // clic fuera del contenido
  });
  dialogo.addEventListener('close', acciones.alCerrar);
  $('#copias-sumar').addEventListener('click', acciones.alSumar);
  $('#copias-restar').addEventListener('click', acciones.alRestar);

  // Si la imagen visible no carga, el recuadro "Imagen no disponible"
  // en vez del ícono de imagen rota con el texto alternativo
  $('#detalle-imagen').addEventListener('error', mostrarSinImagen);
}

let imagenPedida = 0; // para ignorar la imagen grande de una carta anterior

function mostrarImagen(src) {
  const img = $('#detalle-imagen');
  img.src = src;
  img.hidden = false;
  $('#detalle-sin-imagen').hidden = true;
}

function mostrarSinImagen() {
  const img = $('#detalle-imagen');
  img.hidden = true;
  img.removeAttribute('src');
  $('#detalle-sin-imagen').hidden = false;
}

/**
 * Imagen del detalle: primero la chica (ya está en caché por la
 * grilla) y, cuando la grande termina de cargar, se cambia por ella.
 * Si la grande falla, queda la chica; si fallan ambas, el recuadro
 * "Imagen no disponible". Las dos ocupan el mismo recuadro fijo.
 */
function cargarImagenDetalle(carta) {
  const pedido = ++imagenPedida;
  $('#detalle-imagen').alt = `${carta.nombre} — ${carta.nombreSet} ${carta.numero}`;

  if (carta.imagenChica) mostrarImagen(carta.imagenChica);
  else mostrarSinImagen();
  if (!carta.imagenGrande) return;

  // La grande se descarga aparte; decode() espera a que esté lista
  // para pintarse, así el cambio no deja un instante en blanco
  const grande = new Image();
  grande.src = carta.imagenGrande;
  grande.decode()
    .then(() => {
      if (pedido === imagenPedida) mostrarImagen(carta.imagenGrande);
    })
    .catch(() => {
      // Falló la grande: se queda la chica (o el recuadro si tampoco cargó)
    });
}

/** Abre el detalle con los datos que ya se tienen de la carta. */
export function abrirDetalle(carta) {
  cargarImagenDetalle(carta);
  mostrarDatosDetalle(carta);
  mensajeDetalle('');
  focoPendiente = null;
  mostrarCopias(null);
  $('#dialogo-carta').showModal();
}

/** Cierra el detalle (por ejemplo, al cerrar sesión). */
export function cerrarDetalle() {
  const dialogo = $('#dialogo-carta');
  if (dialogo.open) dialogo.close();
}

/** Nombre, expansión, número y rareza (se llama de nuevo si llega la rareza). */
export function mostrarDatosDetalle(carta) {
  $('#detalle-titulo').textContent = carta.nombre;

  const numero = carta.totalSet ? `${carta.numero}/${carta.totalSet}` : carta.numero;
  const anio = carta.fechaSet ? ` (${carta.fechaSet.slice(0, 4)})` : '';
  const datos = [
    ['Expansión', carta.nombreSet ? carta.nombreSet + anio : ''],
    ['Número', numero],
    ['Rareza', carta.rareza],
  ].filter(([, valor]) => valor);

  $('#detalle-datos').replaceChildren(...datos.flatMap(([nombre, valor]) => {
    const dt = document.createElement('dt');
    dt.textContent = nombre;
    const dd = document.createElement('dd');
    dd.textContent = valor;
    return [dt, dd];
  }));
}

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
    quitar,
  );
  return fila;
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

/** Devuelve el foco a la tarjeta de una carta (al cerrar el detalle). */
export function enfocarCarta(idCarta) {
  const vista = document.querySelector('main > div:not([hidden])');
  vista?.querySelector(`.carta[data-id="${CSS.escape(idCarta)}"] .carta__imagen`)?.focus();
}

// --- Confirmación ---------------------------------------------

/**
 * Pregunta antes de una acción, a pantalla completa (reemplaza al
 * confirm() del navegador). Usa <dialog> con showModal(): el foco
 * queda atrapado adentro y Esc cancela.
 * El foco parte en "Cancelar" y, al cerrar, vuelve a donde estaba.
 *
 * @param {{titulo: string, mensaje: string, textoConfirmar?: string, peligro?: boolean}} opciones
 *   peligro: el botón de confirmar va en color de error
 * @returns {Promise<boolean>} true si confirmó
 */
export function confirmar({ titulo, mensaje, textoConfirmar = 'Aceptar', peligro = false }) {
  const dialogo = $('#dialogo-confirmar');
  const origen = document.activeElement;

  $('#confirmar-titulo').textContent = titulo;
  $('#confirmar-mensaje').textContent = mensaje;
  const aceptar = $('#confirmar-aceptar');
  aceptar.textContent = textoConfirmar;
  aceptar.classList.toggle('boton--peligro', peligro);

  dialogo.returnValue = '';
  dialogo.showModal();
  $('#confirmar-cancelar').focus();

  return new Promise((resolve) => {
    dialogo.addEventListener('close', () => {
      origen?.focus?.();
      resolve(dialogo.returnValue === 'si');
    }, { once: true });
  });
}

/** Botones y clic fuera del contenido del modal de confirmación. */
export function prepararConfirmacion() {
  const dialogo = $('#dialogo-confirmar');
  $('#confirmar-aceptar').addEventListener('click', () => dialogo.close('si'));
  $('#confirmar-cancelar').addEventListener('click', () => dialogo.close('no'));
  // La capa es el propio <dialog>: un clic que no cae en el contenido cancela
  dialogo.addEventListener('click', (e) => {
    if (e.target === dialogo) dialogo.close('no');
  });
  // Esc cierra el <dialog> solo, sin returnValue: cuenta como cancelar
}
