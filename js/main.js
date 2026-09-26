// =============================================================
// Punto de entrada: conecta la API, el login y la interfaz
// =============================================================
// La búsqueda y el login se inician por separado: si Supabase
// no carga (sin internet, CDN caído), la búsqueda de cartas
// sigue funcionando igual.
// =============================================================

import { buscarCartas } from './api.js';
import * as ui from './ui.js';

// --- Búsqueda de cartas ---------------------------------------

document.querySelector('#form-busqueda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = e.target.pokemon.value.trim();
  if (!nombre) return;

  ui.buscando(true);
  ui.mensajeEstado(`Buscando cartas de ${nombre}…`);
  ui.mostrarCartas([]);

  try {
    const cartas = await buscarCartas(nombre);

    if (cartas.length === 0) {
      ui.mensajeEstado(
        `No encontramos cartas de "${nombre}". Revisa que el nombre esté en inglés (ej: Pikachu, Joltik, Charizard).`,
        'error',
      );
    } else {
      const texto = cartas.length === 1 ? 'carta encontrada' : 'cartas encontradas';
      ui.mensajeEstado(`${cartas.length} ${texto} para "${nombre}"`);
      ui.mostrarCartas(cartas);
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

ui.prepararDialogo();

// --- Sesión ---------------------------------------------------
// Se carga con import() dinámico: si falla, solo se pierde el login.

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  // Desactiva el formulario para que no recargue la página al enviarlo
  document.querySelectorAll('#form-login input, #form-login button')
    .forEach((el) => { el.disabled = true; });
  ui.mensajeLogin('El inicio de sesión no está disponible en este momento.', 'error');
});

async function iniciarLogin() {
  const { enviarEnlace, cerrarSesion, alCambiarSesion } = await import('./auth.js');

  alCambiarSesion((usuario) => {
    ui.mostrarSesion(usuario);
  });

  document.querySelector('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    if (!email) return;

    const boton = e.target.querySelector('button');
    boton.disabled = true;
    ui.mensajeLogin('Enviando enlace…');

    try {
      await enviarEnlace(email);
      ui.mensajeLogin(`Listo. Revisa ${email} y abre el enlace para entrar.`, 'exito');
      e.target.reset();
    } catch (error) {
      console.error(error);
      ui.mensajeLogin(traducirErrorLogin(error), 'error');
    } finally {
      boton.disabled = false;
    }
  });

  document.querySelector('#btn-salir').addEventListener('click', async () => {
    try {
      await cerrarSesion();
    } catch (error) {
      console.error(error);
    }
  });
}

/** Mensajes de error de Supabase en palabras simples. */
function traducirErrorLogin(error) {
  if (error.status === 429) {
    return 'Se enviaron demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo.';
  }
  return 'No se pudo enviar el enlace. Revisa el correo e inténtalo otra vez.';
}
