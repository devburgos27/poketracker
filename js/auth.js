// =============================================================
// Login con enlace mágico (Supabase Auth)
// =============================================================
// El usuario escribe su correo, Supabase le envía un enlace y al
// hacer clic vuelve a la app ya conectado. No hay contraseñas que
// guardar ni que recordar.
// =============================================================

import { supabase } from './supabase.js';

/**
 * Envía el enlace mágico al correo indicado.
 * Si el correo no existe todavía, Supabase crea el usuario.
 */
export async function enviarEnlace(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Vuelve exactamente a la página donde está el usuario
      emailRedirectTo: window.location.origin + window.location.pathname,
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
    callback(sesion?.user ?? null);

    // Limpia el token de la barra de direcciones después del login
    if (window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname);
    }
  });
}
