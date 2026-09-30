// =============================================================
// Interfaz: todo lo que se dibuja en pantalla
// =============================================================
// Punto de entrada de la interfaz: reúne lo que usan main.js y los
// demás módulos (import * as ui from './ui.js'). Cada parte vive en
// js/ui/, un archivo por área (ver el encabezado de cada uno).
//
// La interfaz no llama a la API ni a Supabase: solo recibe datos y
// los muestra (para las cartas sin imagen, imagenes.js le dice qué
// imagen de respaldo probar). Los elementos se crean con createElement
// y textContent (no con innerHTML) para que ningún texto externo
// pueda inyectar código en la página.
// =============================================================

export {
  crearErrorConexion,
  mostrarAvisoConexion,
  confirmar,
  prepararConfirmacion,
} from './ui/base.js';
export {
  mostrarSesion,
  mostrarSesionPendiente,
  activarBotonesGoogle,
  mensajeLogin,
  prepararSelectorTema,
  prepararMenuCuenta,
  mostrarVista,
  enfocarTitulo,
  actualizarEnlaces,
} from './ui/pagina.js';
export {
  mensajeEstado,
  errorBusqueda,
  buscando,
  mensajeInicio,
  errorInicio,
  mostrarRecientes,
  mensajeColeccion,
  errorColeccion,
  mostrarColeccion,
  mostrarCartas,
} from './ui/pantallas.js';
export {
  mostrarFiltros,
  mostrarFiltrosCartas,
} from './ui/filtros.js';
export {
  enfocarCarta,
  sacarDeGrilla,
} from './ui/cartas.js';
export {
  prepararDetalle,
  abrirDetalle,
  cambiarCartaDetalle,
  conservarFocoDetalle,
  cerrarDetalle,
  mostrarDatosDetalle,
} from './ui/detalle.js';
export {
  precargarDetalle,
} from './ui/detalle-navegacion.js';
export {
  mensajeDetalle,
  errorCopias,
  mostrarCopias,
} from './ui/copias.js';
export {
  crearBarraProgreso,
  enlaceObjetivo,
  mostrarVistaProgreso,
  mensajeProgreso,
  mostrarProgresoVacio,
  errorProgreso,
  avisoProgreso,
  mostrarObjetivos,
  mostrarSugerencias,
  mostrarInicioProgreso,
  mostrarPieProgreso,
  mostrarCabeceraObjetivo,
  mensajeObjetivo,
  mostrarCartasObjetivo,
  errorObjetivo,
  mostrarSeguir,
} from './ui/progreso.js';
