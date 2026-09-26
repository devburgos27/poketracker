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
let idsTengo = null;       // Set de ids de cartas que tengo; null = sin sesión
let alCambiarCarta = null; // guarda "Tengo" / "Me falta" (lo define el login)

/** Vuelve a dibujar la grilla con el estado actual. */
function dibujar() {
  const marcado = idsTengo ? { idsTengo, alCambiar: alCambiarCarta } : null;
  ui.mostrarCartas(cartasActuales, marcado);
  mostrarResumen();
}

/** "20 cartas encontradas para "Joltik" · Tienes 3, te faltan 17" */
function mostrarResumen() {
  const total = cartasActuales.length;
  if (total === 0) return;

  const texto = total === 1 ? 'carta encontrada' : 'cartas encontradas';
  let resumen = `${total} ${texto} para "${busquedaActual}"`;
  if (idsTengo) {
    const tengo = cartasActuales.filter((c) => idsTengo.has(c.id)).length;
    resumen += ` · Tienes ${tengo}, te faltan ${total - tengo}`;
  }
  ui.mensajeEstado(resumen);
}

// --- Búsqueda de cartas ---------------------------------------

document.querySelector('#form-busqueda').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = e.target.pokemon.value.trim();
  if (!nombre) return;

  ui.buscando(true);
  ui.mensajeEstado(`Buscando cartas de ${nombre}…`);
  cartasActuales = [];
  busquedaActual = nombre;
  dibujar();

  try {
    cartasActuales = await buscarCartas(nombre);

    if (cartasActuales.length === 0) {
      ui.mensajeEstado(
        `No encontramos cartas de "${nombre}". Revisa que el nombre esté en inglés (ej: Pikachu, Joltik, Charizard).`,
        'error',
      );
    } else {
      dibujar();
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

// Va antes de iniciarLogin() para limpiar la URL antes de que
// Supabase intente leerla.
mostrarErrorDeRetorno();

iniciarLogin().catch((error) => {
  console.error('No se pudo cargar el login:', error);
  // Desactiva el formulario para que no recargue la página al enviarlo
  document.querySelectorAll('#login input, #login button')
    .forEach((el) => { el.disabled = true; });
  ui.mensajeLogin('El inicio de sesión no está disponible en este momento.', 'error');
});

async function iniciarLogin() {
  const [{ entrarConGoogle, enviarEnlace, cerrarSesion, alCambiarSesion }, coleccion] = await Promise.all([
    import('./auth.js'),
    import('./coleccion.js'),
  ]);

  alCambiarCarta = async (carta, tengo) => {
    if (tengo) {
      await coleccion.marcarTengo(carta);
      idsTengo?.add(carta.id);
    } else {
      await coleccion.marcarMeFalta(carta.id);
      idsTengo?.delete(carta.id);
    }
    mostrarResumen();
  };

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
      dibujar();
      return;
    }

    // setTimeout: Supabase recomienda no llamar a la base de datos
    // dentro de este aviso, porque puede quedar bloqueado.
    setTimeout(async () => {
      try {
        const ids = await coleccion.cargarIdsTengo();
        if (usuarioId !== nuevoId) return; // salió mientras cargaba
        idsTengo = ids;
        dibujar();
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

/**
 * Si Supabase devolvió al usuario con un error en la URL
 * (#error=...&error_code=...), lo muestra y limpia la dirección.
 * Pasa, por ejemplo, con un enlace mágico ya usado o vencido.
 */
function mostrarErrorDeRetorno() {
  // Normalmente viene en el hash (#); por si acaso se revisa también la query (?)
  const params = new URLSearchParams(window.location.hash.slice(1));
  const query = new URLSearchParams(window.location.search);
  const fuente = params.has('error') ? params : query.has('error') ? query : null;
  if (!fuente) return;

  console.error('Error al volver del login:', fuente.get('error_description'));
  ui.mensajeLogin(
    fuente.get('error_code') === 'otp_expired'
      ? 'El enlace ya se usó o expiró. Pide uno nuevo.'
      : 'No se pudo iniciar sesión. Inténtalo de nuevo.',
    'error',
  );

  history.replaceState(null, '', window.location.pathname);
}

/** Mensajes de error de Supabase en palabras simples. */
function traducirErrorLogin(error) {
  if (error.status === 429) {
    return 'Se enviaron demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo.';
  }
  return 'No se pudo enviar el enlace. Revisa el correo e inténtalo otra vez.';
}
