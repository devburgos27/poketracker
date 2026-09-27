// =============================================================
// Punto de entrada: conecta la API, el login, las rutas y la interfaz
// =============================================================
// La búsqueda y el login se inician por separado: si Supabase
// no carga (sin internet, CDN caído), la búsqueda de cartas
// sigue funcionando igual.
//
// Rutas en el hash (el sitio sigue siendo estático):
//   #/inicio   #/buscar?q=joltik   #/coleccion
// Solo cuentan los hashes que empiezan con "#/". Los que trae
// Supabase al volver del login (#access_token=…, #error=…) no son
// rutas: el router arranca después de que Supabase los procesa.
// =============================================================

import { buscarCartas, obtenerCarta } from './api.js';
import * as ui from './ui.js';

// --- Estado de la pantalla -----------------------------------

let cartasActuales = [];   // resultado de la última búsqueda
let busquedaActual = '';   // texto de esa búsqueda ('' = ninguna)
let busquedaEnCurso = null; // texto que se está buscando ahora
let pedidoBusqueda = 0;    // para descartar respuestas de búsquedas viejas
// Últimas búsquedas (texto → cartas): Atrás/Adelante no repiten la consulta
const busquedasGuardadas = new Map();
const MAX_BUSQUEDAS_GUARDADAS = 10;
let filtro = 'todas';      // pestaña activa: 'todas' | 'tengo' | 'falta'
// Cartas que tengo: id de carta → { filaId, copias }; null = sin sesión
let misCartas = null;
let coleccion = null;      // módulo coleccion.js (se carga junto con el login)

let cartasColeccion = [];  // lo que se ve en "Mi colección"
let textoColeccion = '';   // filtro por Pokémon de "Mi colección"
let cartasRecientes = [];  // "Agregadas recientemente" en Inicio
let ultimoPedido = 0;      // para descartar respuestas viejas de Supabase

let rutaActual = null;     // pantalla visible: 'inicio' | 'buscar' | 'coleccion'

// --- Resultados de búsqueda -----------------------------------

const FILTROS = {
  todas: () => true,
  tengo: (c) => misCartas.has(c.id),
  falta: (c) => !misCartas.has(c.id),
};

const VACIO_POR_FILTRO = {
  tengo: 'Todavía no tienes ninguna de estas cartas.',
  falta: '¡Tienes todas estas cartas!',
};

/** Dibuja la grilla de búsqueda según la sesión y la pestaña activa. */
function dibujarBusqueda() {
  if (!misCartas) {
    ui.mostrarFiltros(null);
    ui.mostrarCartas(cartasActuales);
  } else {
    actualizarConteos();
    ui.mostrarCartas(
      cartasActuales.filter(FILTROS[filtro]),
      { misCartas, alCambiar: cambiarDesdeBusqueda },
      VACIO_POR_FILTRO[filtro],
    );
  }
  mostrarResumen();
}

/** Actualiza los números de las pestañas sin redibujar las cartas. */
function actualizarConteos() {
  const total = cartasActuales.length;
  if (!misCartas || total === 0) {
    ui.mostrarFiltros(null);
    return;
  }
  const tengo = cartasActuales.filter(FILTROS.tengo).length;
  ui.mostrarFiltros({ todas: total, tengo, falta: total - tengo }, filtro);
}

/** "20 cartas encontradas para "Joltik"" */
function mostrarResumen() {
  const total = cartasActuales.length;
  if (total === 0) return;
  const texto = total === 1 ? 'carta encontrada' : 'cartas encontradas';
  ui.mensajeEstado(`${total} ${texto} para "${busquedaActual}"`);
}

/** Guarda "Tengo" / "Me falta" en Supabase y en misCartas. */
async function guardarCambio(carta, tengo) {
  if (tengo) {
    const guardada = await coleccion.marcarTengo(carta);
    misCartas?.set(carta.id, guardada);
  } else {
    await coleccion.marcarMeFalta(carta.id);
    misCartas?.delete(carta.id);
  }
}

async function cambiarDesdeBusqueda(carta, tengo) {
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    ui.mensajeEstado('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
    throw error; // la tarjeta vuelve a su estado anterior
  }
  mostrarResumen();
  // En "Todas" la carta se queda donde está; en "Tengo" o "Me falta" sale de la vista
  if (filtro === 'todas') actualizarConteos();
  else dibujarBusqueda();
}

/** Deja una búsqueda terminada en pantalla. */
function mostrarBusqueda(texto, cartas) {
  cartasActuales = cartas;
  busquedaActual = texto;
  filtro = 'todas';

  if (cartas.length === 0) {
    ui.mensajeEstado(
      `No encontramos cartas de "${texto}". Revisa que el nombre esté en inglés (ej: Pikachu, Joltik, Charizard).`,
      'error',
    );
  }
  dibujarBusqueda();
}

/**
 * Muestra la búsqueda que pide la URL (#/buscar?q=…).
 * Si ya está en memoria solo la dibuja: volver a Buscar
 * (con Atrás, Adelante o desde la barra) no repite la consulta.
 */
async function buscarDesdeRuta(texto) {
  formBusqueda.pokemon.value = texto;
  ui.actualizarEnlacesBuscar(texto);
  if (texto === busquedaEnCurso) return; // ya se está buscando

  const pedido = ++pedidoBusqueda;
  busquedaEnCurso = null;
  ui.buscando(false); // por si quedó a medias una búsqueda anterior

  if (texto === busquedaActual) {
    dibujarBusqueda(); // refleja lo marcado desde otras pantallas
    return;
  }
  if (busquedasGuardadas.has(texto)) {
    mostrarBusqueda(texto, busquedasGuardadas.get(texto));
    return;
  }

  cartasActuales = [];
  busquedaActual = '';
  filtro = 'todas';
  ui.mensajeEstado(texto ? `Buscando cartas de ${texto}…` : '');
  dibujarBusqueda();
  if (!texto) return;

  busquedaEnCurso = texto;
  ui.buscando(true);
  try {
    const cartas = await buscarCartas(texto);
    if (pedido !== pedidoBusqueda) return; // el usuario ya pidió otra cosa

    busquedasGuardadas.set(texto, cartas);
    if (busquedasGuardadas.size > MAX_BUSQUEDAS_GUARDADAS) {
      // Un Map recuerda el orden de llegada: la primera es la más antigua
      busquedasGuardadas.delete(busquedasGuardadas.keys().next().value);
    }
    mostrarBusqueda(texto, cartas);
  } catch (error) {
    if (pedido !== pedidoBusqueda) return;
    console.error(error);
    ui.mensajeEstado(
      'No pudimos conectar con la base de cartas. Inténtalo de nuevo en un momento.',
      'error',
    );
  } finally {
    if (pedido === pedidoBusqueda) {
      busquedaEnCurso = null;
      ui.buscando(false);
    }
  }
}

// Buscar solo cambia la URL; la búsqueda la hace la ruta.
// Así Atrás, Adelante y recargar mantienen los resultados.
const formBusqueda = document.querySelector('#form-busqueda');

formBusqueda.addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = formBusqueda.pokemon.value.trim();
  if (!texto) return;

  const destino = `#/buscar?q=${encodeURIComponent(texto)}`;
  // Misma URL: no habrá hashchange, así que se llama directo
  if (window.location.hash === destino) buscarDesdeRuta(texto);
  else window.location.hash = destino;
});

document.querySelector('#filtros').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-filtro]');
  if (!boton || boton.dataset.filtro === filtro) return;
  filtro = boton.dataset.filtro;
  dibujarBusqueda();
});

ui.prepararSelectorTema();

// --- Inicio: agregadas recientemente --------------------------

const CANTIDAD_RECIENTES = 6;

async function cargarRecientes() {
  if (!misCartas) return; // sin sesión, Inicio solo muestra la presentación
  const pedido = ++ultimoPedido;
  ui.mensajeInicio('Cargando tus cartas…');

  try {
    const cartas = await coleccion.listarRecientes(CANTIDAD_RECIENTES);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasRecientes = cartas;
    cartas.forEach((c) => misCartas?.set(c.id, c.guardada));
    dibujarRecientes();
  } catch (error) {
    if (pedido !== ultimoPedido) return;
    console.error(error);
    ui.mensajeInicio('No pudimos cargar tus cartas recientes. Inténtalo de nuevo.', 'error');
  }
}

function dibujarRecientes() {
  ui.mensajeInicio('');
  ui.mostrarRecientes(
    cartasRecientes,
    { misCartas, alCambiar: cambiarDesdeLista },
    'Todavía no tienes cartas. Busca un Pokémon y marca las que tengas.',
  );
}

// --- Mi colección ---------------------------------------------

async function cargarColeccion() {
  if (!misCartas) return; // sin sesión se ve la invitación a entrar
  const pedido = ++ultimoPedido;
  const texto = textoColeccion;
  ui.mensajeColeccion('Cargando tu colección…');

  try {
    const cartas = await coleccion.listarColeccion(texto);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasColeccion = cartas;
    // Por si se agregaron cartas desde otra pestaña o dispositivo
    cartas.forEach((c) => misCartas?.set(c.id, c.guardada));
    dibujarColeccion();
  } catch (error) {
    if (pedido !== ultimoPedido) return;
    console.error(error);
    ui.mensajeColeccion('No pudimos cargar tu colección. Inténtalo de nuevo.', 'error');
  }
}

function dibujarColeccion() {
  const total = cartasColeccion.length;
  const vacio = textoColeccion
    ? `No tienes cartas de "${textoColeccion}".`
    : 'Aún no tienes cartas. Busca un Pokémon y marca las que tengas.';

  ui.mostrarColeccion(cartasColeccion, { misCartas, alCambiar: cambiarDesdeLista }, vacio);

  if (total === 0) {
    ui.mensajeColeccion('');
  } else {
    const cartas = total === 1 ? 'carta' : 'cartas';
    ui.mensajeColeccion(textoColeccion
      ? `${total} ${cartas} de "${textoColeccion}"`
      : `${total} ${cartas} en tu colección`);
  }
}

/** Marcar desde Colección o Inicio: "Me falta" quita la carta de esas listas. */
async function cambiarDesdeLista(carta, tengo) {
  const mensaje = rutaActual === 'inicio' ? ui.mensajeInicio : ui.mensajeColeccion;
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    mensaje('No se pudo quitar la carta. Inténtalo de nuevo.', 'error');
    throw error;
  }
  if (!tengo) {
    cartasColeccion = cartasColeccion.filter((c) => c.id !== carta.id);
    cartasRecientes = cartasRecientes.filter((c) => c.id !== carta.id);
    if (rutaActual === 'inicio') dibujarRecientes();
    else dibujarColeccion();
  }
}

// Filtra mientras se escribe, esperando 300 ms de pausa para no
// consultar a Supabase en cada tecla
let esperaFiltro;
const formColeccion = document.querySelector('#form-coleccion');

formColeccion.addEventListener('input', (e) => {
  clearTimeout(esperaFiltro);
  esperaFiltro = setTimeout(() => {
    textoColeccion = e.target.value.trim();
    cargarColeccion();
  }, 300);
});

formColeccion.addEventListener('submit', (e) => {
  e.preventDefault();
  clearTimeout(esperaFiltro);
  textoColeccion = formColeccion.filtro.value.trim();
  cargarColeccion();
});

// --- Detalle de carta: "Tus copias" ----------------------------
// Cada cambio se ve al instante y se revierte si Supabase falla,
// igual que Tengo / Me falta en las tarjetas.

/** Copia que se muestra pero aún no existe en la base. */
const copiaSinGuardar = () => ({ id: null, idioma: null, condicion: null });

let detalle = null; // { carta, copias, cambio, cerrado } de la carta abierta

function abrirDetalle(carta) {
  const d = { carta, copias: null, cambio: false, cerrado: false };
  detalle = d;
  ui.abrirDetalle(carta);
  completarDatos(d);
  if (misCartas) cargarCopias(d);
}

/** La colección no guarda la rareza: se pide a la API al abrir el detalle. */
async function completarDatos(d) {
  if (d.carta.rareza) return;
  try {
    const completa = await obtenerCarta(d.carta.id);
    if (d !== detalle || !completa) return;
    d.carta = { ...d.carta, rareza: completa.rareza, totalSet: d.carta.totalSet ?? completa.totalSet };
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
  const guardada = misCartas.get(d.carta.id);
  if (!guardada) {
    d.copias = [];
    ui.mostrarCopias(d.copias);
    return;
  }
  try {
    const copias = await coleccion.listarCopias(guardada.filaId);
    if (d !== detalle) return;
    d.copias = conCopiaImplicita(copias);
    ui.mostrarCopias(d.copias);
  } catch (error) {
    if (d !== detalle) return;
    console.error(error);
    ui.mensajeDetalle('No pudimos cargar tus copias. Cierra y vuelve a abrir la carta.', 'error');
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

  try {
    d.copias = (await guardar()) ?? nuevas;
    d.cambio = true;
    const guardada = misCartas?.get(d.carta.id);
    if (guardada) guardada.copias = d.copias.length;
    if (d.cerrado) redibujarPantalla(); // se cerró mientras guardaba
  } catch (error) {
    console.error(error);
    d.copias = antes;
    if (d === detalle) ui.mensajeDetalle('No se pudo guardar el cambio. Inténtalo de nuevo.', 'error');
  }
  if (d === detalle && !d.cerrado) ui.mostrarCopias(d.copias);
}

/** "+": agrega una copia sin detalles (con 0 copias, es "Tengo"). */
function sumarCopia() {
  const d = detalle;
  const guardada = misCartas.get(d.carta.id);
  const nuevas = [...d.copias, copiaSinGuardar()];

  cambiarCopias(nuevas, async () => {
    if (!guardada) {
      await guardarCambio(d.carta, true);
      try {
        return conCopiaImplicita(await coleccion.listarCopias(misCartas.get(d.carta.id).filaId));
      } catch (error) {
        // La carta ya quedó guardada: no se revierte por no poder listar
        console.error(error);
        return [copiaSinGuardar()];
      }
    }
    // Se crea la nueva y, si la había, la copia implícita de una fila antigua
    const sinGuardar = nuevas.filter((c) => c.id === null).length;
    const creadas = await coleccion.agregarCopias(guardada.filaId, sinGuardar);
    return [...nuevas.filter((c) => c.id !== null), ...creadas];
  });
}

/** Quita una copia. Quitar la última es "Me falta". */
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
  cambiarCopias(nuevas, () => coleccion.quitarCopia(copia.id));
}

/** Cambia idioma o condición de una copia (valor null = sin indicar). */
function cambiarDatoCopia(copia, campo, valor) {
  const d = detalle;
  const editada = { ...copia, [campo]: valor };
  const nuevas = d.copias.map((c) => (c === copia ? editada : c));

  cambiarCopias(nuevas, async () => {
    if (copia.id !== null) {
      await coleccion.actualizarCopia(copia.id, { [campo]: valor });
      return undefined;
    }
    // Copia implícita de una fila antigua: se crea ahora, ya con el dato
    const [creada] = await coleccion.agregarCopias(misCartas.get(d.carta.id).filaId, 1, { [campo]: valor });
    return nuevas.map((c) => (c === editada ? creada : c));
  });
}

/** Al cerrar: si algo cambió, se redibuja la pantalla (×N, Tengo / Me falta). */
function alCerrarDetalle() {
  const d = detalle;
  if (!d) return;
  d.cerrado = true;
  if (d.cambio) redibujarPantalla();
  ui.enfocarCarta(d.carta.id);
}

/** Vuelve a dibujar las cartas de la pantalla actual con misCartas. */
function redibujarPantalla() {
  if (rutaActual === 'buscar') {
    dibujarBusqueda();
    return;
  }
  if (!misCartas) return;
  // Las cartas que ya no tengo salen de Colección e Inicio
  cartasColeccion = cartasColeccion.filter((c) => misCartas.has(c.id));
  cartasRecientes = cartasRecientes.filter((c) => misCartas.has(c.id));
  if (rutaActual === 'coleccion') dibujarColeccion();
  else if (rutaActual === 'inicio') dibujarRecientes();
}

ui.prepararDetalle({
  alAbrir: abrirDetalle,
  alCerrar: alCerrarDetalle,
  alSumar: sumarCopia,
  alRestar: () => quitarCopia(detalle.copias.at(-1)),
  alCambiar: cambiarDatoCopia,
  alQuitar: quitarCopia,
});

// --- Rutas ----------------------------------------------------

const TITULOS = {
  inicio: 'PokéTracker · Tu colección de cartas Pokémon',
  buscar: 'Buscar · PokéTracker',
  coleccion: 'Colección · PokéTracker',
};
const RUTA_POR_DEFECTO = '#/inicio';
// Ruta donde estaba el usuario antes de ir a Google (sessionStorage)
const CLAVE_RUTA_LOGIN = 'pt-ruta-login';

let routerIniciado = false;

/** Lee el hash: { vista, params }, o null si no es una ruta ("#/…"). */
function leerRuta() {
  const hash = window.location.hash;
  if (!hash.startsWith('#/')) return null;
  const [camino, consulta = ''] = hash.slice(2).split('?');
  return { vista: camino, params: new URLSearchParams(consulta) };
}

/** Muestra la pantalla que pide la URL. */
function mostrarRuta() {
  const ruta = leerRuta();
  if (!ruta) return; // #access_token=…, #error=…: no son rutas
  if (!Object.hasOwn(TITULOS, ruta.vista)) {
    window.location.replace(RUTA_POR_DEFECTO); // ruta desconocida
    return;
  }
  irA(ruta.vista, ruta.params);
}

function irA(vista, params) {
  const primeraVez = rutaActual === null;
  const pantallaNueva = vista !== rutaActual;
  rutaActual = vista;

  ui.mostrarVista(vista, TITULOS[vista]);
  // En la carga inicial el foco queda donde lo pone el navegador
  if (pantallaNueva && !primeraVez) ui.enfocarTitulo(vista);

  if (vista === 'inicio') cargarRecientes();
  else if (vista === 'coleccion') cargarColeccion();
  else buscarDesdeRuta(params.get('q')?.trim() ?? '');
}

/**
 * Arranca el router una sola vez. Se llama después del primer
 * aviso de sesión de Supabase (o si el login no carga).
 */
function iniciarRouter() {
  if (routerIniciado) return;
  // Si Supabase todavía no leyó el token de la URL, no se toca
  if (new URLSearchParams(window.location.hash.slice(1)).has('access_token')) return;
  routerIniciado = true;

  let rutaGuardada = null;
  try {
    rutaGuardada = sessionStorage.getItem(CLAVE_RUTA_LOGIN);
    sessionStorage.removeItem(CLAVE_RUTA_LOGIN);
  } catch {
    // Sin almacenamiento: se vuelve a Inicio
  }

  // Sin ruta en la URL (entró a la raíz o vuelve de Google):
  // la ruta de antes del login, o Inicio
  if (!leerRuta()) {
    const destino = rutaGuardada?.startsWith('#/') ? rutaGuardada : RUTA_POR_DEFECTO;
    history.replaceState(null, '', destino);
  }

  window.addEventListener('hashchange', mostrarRuta);
  mostrarRuta();
}

/** Tras un cambio de sesión, vuelve a dibujar la pantalla actual. */
function actualizarPantalla() {
  if (routerIniciado) mostrarRuta();
  else iniciarRouter();
}

/** Guarda la ruta actual para volver a ella después de Google. */
function guardarRutaParaVolver() {
  if (!leerRuta()) return;
  try {
    sessionStorage.setItem(CLAVE_RUTA_LOGIN, window.location.hash);
  } catch {
    // Sin almacenamiento: al volver se irá a Inicio
  }
}

// --- Sesión ---------------------------------------------------
// Se carga con import() dinámico: si falla, solo se pierde el login.

// Va antes de iniciarLogin() para limpiar la URL antes de que
// Supabase intente leerla.
mostrarErrorDeRetorno();

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  ui.activarBotonesGoogle(false);
  ui.mensajeLogin('El inicio de sesión no está disponible en este momento.', 'error');
  iniciarRouter(); // sin login, la app sigue funcionando como visitante
});

// Si Supabase tarda demasiado en responder, la app no se queda en blanco
setTimeout(iniciarRouter, 3000);

async function iniciarLogin() {
  const [{ entrarConGoogle, cerrarSesion, alCambiarSesion }, modColeccion] = await Promise.all([
    import('./auth.js'),
    import('./coleccion.js'),
  ]);
  coleccion = modColeccion;

  let usuarioId = null;

  alCambiarSesion((usuario) => {
    ui.mostrarSesion(usuario);

    // Supabase avisa también al renovar el token: solo se recarga
    // la colección si de verdad cambió el usuario.
    const nuevoId = usuario?.id ?? null;
    if (nuevoId === usuarioId) {
      iniciarRouter(); // primer aviso sin sesión
      return;
    }
    usuarioId = nuevoId;

    if (!usuario) {
      misCartas = null;
      ui.cerrarDetalle();
      ultimoPedido++; // descarta cargas de Supabase en curso
      cartasColeccion = [];
      cartasRecientes = [];
      textoColeccion = '';
      formColeccion.reset();
      actualizarPantalla();
      return;
    }

    // setTimeout: Supabase recomienda no llamar a la base de datos
    // dentro de este aviso, porque puede quedar bloqueado.
    setTimeout(async () => {
      try {
        const cartas = await coleccion.cargarMisCartas();
        if (usuarioId !== nuevoId) return; // salió mientras cargaba
        misCartas = cartas;
      } catch (error) {
        console.error(error);
        ui.mensajeLogin('No pudimos cargar tu colección. Recarga la página para intentarlo de nuevo.', 'error');
      }
      actualizarPantalla();
    }, 0);
  });

  document.querySelectorAll('[data-accion="google"]').forEach((boton) => {
    boton.addEventListener('click', async () => {
      guardarRutaParaVolver();
      ui.activarBotonesGoogle(false);
      ui.mensajeLogin('Abriendo Google…');

      try {
        // Si todo va bien, el navegador se va a Google y no vuelve aquí
        await entrarConGoogle();
      } catch (error) {
        console.error(error);
        ui.mensajeLogin('No se pudo abrir el inicio de sesión con Google. Inténtalo otra vez.', 'error');
        ui.activarBotonesGoogle(true);
      }
    });
  });

  // Si vuelve con "Atrás" desde Google, el navegador puede restaurar la
  // página tal como quedó (botones desactivados, "Abriendo Google…")
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    ui.activarBotonesGoogle(true);
    ui.mensajeLogin('');
  });

  document.querySelector('#btn-salir').addEventListener('click', async () => {
    try {
      await cerrarSesion();
    } catch (error) {
      console.error(error);
    }
  });
}

/**
 * Si Supabase devolvió al usuario con un error en la URL
 * (#error=...), lo muestra y limpia la dirección.
 * Pasa, por ejemplo, si el usuario cancela en la pantalla de Google.
 */
function mostrarErrorDeRetorno() {
  // Normalmente viene en el hash (#); por si acaso se revisa también la query (?)
  const params = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const fuente = params.has('error') ? params : query.has('error') ? query : null;
  if (!fuente) return;

  console.error('Error al volver del login:', fuente.get('error_description'));
  ui.mensajeLogin('No se pudo iniciar sesión con Google. Inténtalo de nuevo.', 'error');

  history.replaceState(null, '', window.location.pathname);
}
