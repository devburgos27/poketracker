// =============================================================
// Cliente de Supabase
// =============================================================
// Se crea UNA sola vez y el resto de los archivos lo importan.
// La librería se carga desde un CDN, así no necesitamos npm
// ni ningún paso de "build".
//
// La versión va fija: con "@2" el CDN entrega siempre la última 2.x,
// y así llegaron sin aviso los reintentos automáticos de abajo.
// Para actualizar, cambiar el número y probar con la checklist.
// =============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Mantiene la sesión abierta aunque cierres el navegador
    persistSession: true,
    // Lee el token que viene en la URL al volver de Google
    detectSessionInUrl: true,
    // "implicit": el token vuelve en el hash (#access_token=...)
    flowType: 'implicit',
  },
  db: {
    // Sin reintentos automáticos: por defecto cada lectura se repite
    // hasta 3 veces si falla (1 s, 2 s, 4 s). Sin conexión eso son 4
    // pedidos por consulta, que se acumulan al navegar. La app hace un
    // intento y ofrece "Reintentar".
    retry: false,
  },
});
