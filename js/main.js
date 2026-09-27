// =============================================================
// Punto de entrada: conecta la API, el login y la interfaz
// =============================================================
// La búsqueda y el login se inician por separado: si Supabase
// no carga (sin internet, CDN caído), la búsqueda de cartas
// sigue funcionando igual.
// =============================================================

import { buscarCartas } from './api.js';
import * as ui from './ui.js';

// --- Estado de la pantalla -----------------------------------

let cartasActuales = [];   // resultado de la última búsqueda
let busquedaActual = '';
let filtro = 'todas';      // pestaña activa: 'todas' | 'tengo' | 'falta'
let idsTengo = null;       // Set de ids de cartas que tengo; null = sin sesión
let coleccion = null;      // módulo coleccion.js (se carga junto con el login)

let cartasColeccion = [];  // lo que se ve en "Mi colección"
let textoColeccion = '';   // filtro por Pokémon de "Mi colección"
let ultimoPedido = 0;      // para descartar respuestas viejas de Supabase

// --- Resultados de búsqueda -----------------------------------

const FILTROS = {
  todas: () => true,
  tengo: (c) => idsTengo.has(c.id),
  falta: (c) => !idsTengo.has(c.id),
};

const VACIO_POR_FILTRO = {
  tengo: 'Todavía no tienes ninguna de estas cartas.',
  falta: '¡Tienes todas estas cartas!',
};

/** Dibuja la grilla de búsqueda según la sesión y la pestaña activa. */
function dibujarBusqueda() {
  if (!idsTengo) {
    ui.mostrarFiltros(null);
    ui.mostrarCartas(cartasActuales);
  } else {
    actualizarConteos();
    ui.mostrarCartas(
      cartasActuales.filter(FILTROS[filtro]),
      { idsTengo, alCambiar: cambiarDesdeBusqueda },
      VACIO_POR_FILTRO[filtro],
    );
  }
  mostrarResumen();
}

/** Actualiza los números de las pestañas sin redibujar las cartas. */
function actualizarConteos() {
  const total = cartasActuales.length;
  if (!idsTengo || total === 0) {
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

/** Guarda "Tengo" / "Me falta" en Supabase y en idsTengo. */
async function guardarCambio(carta, tengo) {
  if (tengo) {
    await coleccion.marcarTengo(carta);
    idsTengo?.add(carta.id);
  } else {
    await coleccion.marcarMeFalta(carta.id);
    idsTengo?.delete(carta.id);
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

document.querySelector('#form-busqueda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = e.target.pokemon.value.trim();
  if (!nombre) return;

  ui.buscando(true);
  ui.mensajeEstado(`Buscando cartas de ${nombre}…`);
  cartasActuales = [];
  busquedaActual = nombre;
  filtro = 'todas';
  dibujarBusqueda();

  try {
    cartasActuales = await buscarCartas(nombre);

    if (cartasActuales.length === 0) {
      ui.mensajeEstado(
        `No encontramos cartas de "${nombre}". Revisa que el nombre esté en inglés (ej: Pikachu, Joltik, Charizard).`,
        'error',
      );
    } else {
      dibujarBusqueda();
    }
  } catch (error) {
    console.error(error);
    ui.mensajeEstado(
      'No pudimos conectar con la base de cartas. Inténtalo de nuevo en un momento.',
      'error',
    );
  } finally {
    ui.buscando(false);
  }
});

document.querySelector('#filtros').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-filtro]');
  if (!boton || boton.dataset.filtro === filtro) return;
  filtro = boton.dataset.filtro;
  dibujarBusqueda();
});

ui.prepararDialogo();
ui.prepararSelectorTema();

// --- Navegación: Buscar / Mi colección ------------------------

function irA(vista) {
  ui.mostrarVista(vista);
  if (vista === 'coleccion') cargarColeccion();
  else dibujarBusqueda(); // refleja lo que se haya quitado en "Mi colección"
}

document.querySelector('#navegacion').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-vista]');
  if (boton) irA(boton.dataset.vista);
});

// --- Mi colección ---------------------------------------------

async function cargarColeccion() {
  const pedido = ++ultimoPedido;
  const texto = textoColeccion;
  ui.mensajeColeccion('Cargando tu colección…');

  try {
    const cartas = await coleccion.listarColeccion(texto);
    if (pedido !== ultimoPedido) return; // llegó una respuesta más nueva
    cartasColeccion = cartas;
    // Por si se agregaron cartas desde otra pestaña o dispositivo
    cartas.forEach((c) => idsTengo?.add(c.id));
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

  ui.mostrarColeccion(cartasColeccion, { idsTengo, alCambiar: cambiarDesdeColeccion }, vacio);

  if (total === 0) {
    ui.mensajeColeccion('');
  } else {
    const cartas = total === 1 ? 'carta' : 'cartas';
    ui.mensajeColeccion(textoColeccion
      ? `${total} ${cartas} de "${textoColeccion}"`
      : `${total} ${cartas} en tu colección`);
  }
}

async function cambiarDesdeColeccion(carta, tengo) {
  try {
    await guardarCambio(carta, tengo);
  } catch (error) {
    console.error(error);
    ui.mensajeColeccion('No se pudo quitar la carta. Inténtalo de nuevo.', 'error');
    throw error;
  }
  // "Me falta" la quita de la colección
  if (!tengo) {
    cartasColeccion = cartasColeccion.filter((c) => c.id !== carta.id);
    dibujarColeccion();
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

// --- Sesión ---------------------------------------------------
// Se carga con import() dinámico: si falla, solo se pierde el login.

// Va antes de iniciarLogin() para limpiar la URL antes de que
// Supabase intente leerla.
mostrarErrorDeRetorno();

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  document.querySelector('#btn-google').disabled = true;
  ui.mensajeLogin('El inicio de sesión no está disponible en este momento.', 'error');
});

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
    if (nuevoId === usuarioId) return;
    usuarioId = nuevoId;

    if (!usuario) {
      idsTengo = null;
      ultimoPedido++; // descarta una carga de "Mi colección" en curso
      cartasColeccion = [];
      textoColeccion = '';
      formColeccion.reset();
      ui.mostrarNavegacion(false);
      irA('buscar');
      return;
    }

    // setTimeout: Supabase recomienda no llamar a la base de datos
    // dentro de este aviso, porque puede quedar bloqueado.
    setTimeout(async () => {
      try {
        const ids = await coleccion.cargarIdsTengo();
        if (usuarioId !== nuevoId) return; // salió mientras cargaba
        idsTengo = ids;
        ui.mostrarNavegacion(true);
        dibujarBusqueda();
      } catch (error) {
        console.error(error);
        ui.mensajeLogin('No pudimos cargar tu colección. Recarga la página para intentarlo de nuevo.', 'error');
      }
    }, 0);
  });

  document.querySelector('#btn-google').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    ui.mensajeLogin('Abriendo Google…');

    try {
      // Si todo va bien, el navegador se va a Google y no vuelve aquí
      await entrarConGoogle();
    } catch (error) {
      console.error(error);
      ui.mensajeLogin('No se pudo abrir el inicio de sesión con Google. Inténtalo otra vez.', 'error');
      boton.disabled = false;
    }
  });

  // Si vuelve con "Atrás" desde Google, el navegador puede restaurar la
  // página tal como quedó (botón desactivado, "Abriendo Google…")
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.querySelector('#btn-google').disabled = false;
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
