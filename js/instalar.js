// =============================================================
// Instalar la app en el teléfono o el computador
// =============================================================
// Chrome y Edge (Android y escritorio) avisan con beforeinstallprompt
// cuando la app se puede instalar: se guarda el evento y aparece
// "Instalar app", que abre el diálogo del navegador. Al guardarlo
// (preventDefault) Chrome no muestra su propia barra en Android: la
// invitación es solo nuestro botón.
//
// iPhone/iPad no tienen ese evento: se instala desde Compartir →
// Agregar a pantalla de inicio. Inicio muestra un aviso con esos pasos
// hasta que se cierra (queda guardado en localStorage) y el botón del
// menú de cuenta los muestra cuando se pide.
//
// Abierta como app instalada (display-mode: standalone, o
// navigator.standalone en iOS) no se muestra nada.
//
// No hay service worker: Chrome ya no lo exige para instalar (desde la
// versión 108 en Android y 112 en escritorio) y así nadie queda con una
// versión vieja guardada. El modo sin conexión es otro bloque.
// =============================================================

import * as ui from './ui.js';

const CLAVE_AVISO_CERRADO = 'pt-instalar-aviso-cerrado';
const MODO_APP = window.matchMedia('(display-mode: standalone)');

let eventoInstalar = null; // beforeinstallprompt guardado, mientras se pueda usar

const abiertaComoApp = () => MODO_APP.matches || navigator.standalone === true;

/** iPhone o iPad (el iPad con iPadOS 13+ dice ser un Mac, pero con pantalla táctil). */
function dispositivoIOS() {
  if (/iPhone|iPod/.test(navigator.userAgent)) return 'iPhone';
  if (/iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) return 'iPad';
  return null;
}

function avisoCerrado() {
  try {
    return localStorage.getItem(CLAVE_AVISO_CERRADO) === '1';
  } catch {
    return false;
  }
}

function recordarAvisoCerrado() {
  try {
    localStorage.setItem(CLAVE_AVISO_CERRADO, '1');
  } catch {
    // Sin almacenamiento: vuelve a aparecer la próxima vez, nada más
  }
}

export function preparar() {
  const ios = dispositivoIOS();

  ui.prepararInstalar({
    alPedirInstalar: (boton) => {
      if (ios) {
        ui.mostrarPasosMenu(boton.getAttribute('aria-expanded') !== 'true');
        return;
      }
      instalar(boton);
    },
    alCerrarAviso: recordarAvisoCerrado,
  });

  // Si la abren como app (o se instala y el navegador la abre ahí), se oculta todo
  MODO_APP.addEventListener('change', () => {
    if (abiertaComoApp()) ocultarTodo();
  });
  if (abiertaComoApp()) return;

  if (ios) {
    ui.prepararPasosMenu();
    ui.mostrarAvisoInstalar(!avisoCerrado(), { dispositivo: ios });
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    ui.mostrarBotonesInstalar(true);
  });

  window.addEventListener('appinstalled', () => {
    eventoInstalar = null;
    ui.mostrarBotonesInstalar(false);
    ui.avisar('PokéTracker quedó instalada');
  });
}

/** Abre el diálogo de instalación del navegador (el evento sirve una sola vez). */
async function instalar(boton) {
  const evento = eventoInstalar;
  if (!evento) return;
  eventoInstalar = null;
  boton.closest('[popover]')?.hidePopover();
  try {
    await evento.prompt();
    await evento.userChoice;
  } catch (error) {
    console.error('No se pudo abrir la instalación:', error);
  }
  // Instalada o no, este evento ya no sirve. Si la rechazó, el navegador
  // puede volver a mandar beforeinstallprompt más adelante y el botón vuelve
  ui.mostrarBotonesInstalar(false);
}

function ocultarTodo() {
  eventoInstalar = null;
  ui.mostrarBotonesInstalar(false);
  ui.mostrarAvisoInstalar(false);
}
