// =============================================================
// Instalar la app en el teléfono o el computador
// =============================================================
// "Instalar app" está en la cabecera (junto al tema) y en el pie (junto
// a Privacidad), con y sin sesión. Los dos se ven solo si se puede
// instalar:
// - Chrome y Edge (Android y escritorio) avisan con beforeinstallprompt.
//   Se guarda el evento (preventDefault: Chrome no muestra su propia
//   barra en Android) y el botón abre el diálogo del navegador.
// - iPhone/iPad no tienen ese evento: se instala desde Compartir →
//   Agregar a pantalla de inicio. El botón muestra esos pasos.
// Abierta como app instalada (display-mode: standalone, o
// navigator.standalone en iOS) no se ven, y con appinstalled desaparecen.
//
// No hay service worker: Chrome ya no lo exige para instalar (desde la
// versión 108 en Android y 112 en escritorio) y así nadie queda con una
// versión vieja guardada. El modo sin conexión es otro bloque.
// =============================================================

import * as ui from './ui.js';

const MODO_APP = window.matchMedia('(display-mode: standalone)');

let eventoInstalar = null; // beforeinstallprompt guardado, mientras se pueda usar
let instalada = false;     // llegó appinstalled en esta visita
let dispositivo = null;    // 'iPhone' | 'iPad' | null

const abiertaComoApp = () => MODO_APP.matches || navigator.standalone === true;

/** iPhone o iPad (el iPad con iPadOS 13+ dice ser un Mac, pero con pantalla táctil). */
function dispositivoIOS() {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  return null;
}

/** Muestra u oculta los botones según lo que se pueda hacer ahora. */
function actualizar() {
  const sePuede = !instalada && !abiertaComoApp() && (dispositivo !== null || eventoInstalar !== null);
  ui.mostrarInstalar(sePuede);
}

export function preparar() {
  dispositivo = dispositivoIOS();

  // El aviso de iOS del 13b guardaba si se cerró; ya no existe: se borra
  try {
    localStorage.removeItem('pt-instalar-aviso-cerrado');
  } catch {
    // Sin almacenamiento no hay nada que borrar
  }

  ui.prepararInstalar({
    alPedirInstalar: (boton) => {
      if (dispositivo) ui.mostrarPasosInstalar(boton, dispositivo);
      else instalar();
    },
  });

  // Si la abren como app (o se instala y el navegador la abre ahí), se ocultan
  MODO_APP.addEventListener('change', actualizar);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    eventoInstalar = e;
    actualizar();
  });

  window.addEventListener('appinstalled', () => {
    eventoInstalar = null;
    instalada = true;
    actualizar();
    ui.avisar('PokéTracker quedó instalada');
  });

  actualizar();
}

/** Abre el diálogo de instalación del navegador (el evento sirve una sola vez). */
async function instalar() {
  const evento = eventoInstalar;
  if (!evento) return;
  eventoInstalar = null;
  try {
    await evento.prompt();
    await evento.userChoice;
  } catch (error) {
    console.error('No se pudo abrir la instalación:', error);
  }
  // Instalada o no, este evento ya no sirve. Si la rechazó, el navegador
  // puede volver a mandar beforeinstallprompt más adelante y vuelven
  actualizar();
}
