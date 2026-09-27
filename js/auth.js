// =============================================================
// Login con Google (Supabase Auth)
// =============================================================
// Es la única forma de entrar: el usuario elige su cuenta en
// Google y vuelve a la app ya conectado. No hay contraseñas que
// guardar ni que recordar.
// =============================================================

import { supabase } from './supabase.js';

/**
 * Lleva al usuario a la pantalla de Google para elegir su cuenta.
 * Al aceptar, Google lo devuelve a esta misma página ya conectado.
 * Si el usuario no existe todavía, Supabase lo crea.
 */
export async function entrarConGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

/** Cierra la sesión del usuario actual. */
export async function cerrarSesion() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Avisa cada vez que el usuario entra o sale.
 * Se llama inmediatamente con el estado actual y luego ante cada cambio.
 *
 * @param {(usuario: object|null) => void} callback
 */
export function alCambiarSesion(callback) {
  supabase.auth.onAuthStateChange((_evento, sesion) => {
    // Limpia el token de la barra de direcciones después del login.
    // Va antes del callback: así el router nunca ve "#access_token=…".
    // (Se revisa como parámetro para no confundirlo con una ruta
    // como "#/buscar?q=access_token".)
    if (new URLSearchParams(window.location.hash.slice(1)).has('access_token')) {
      history.replaceState(null, '', window.location.pathname);
    }

    callback(sesion?.user ?? null);
  });
}
