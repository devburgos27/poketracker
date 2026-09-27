// =============================================================
// Cliente de Supabase
// =============================================================
// Se crea UNA sola vez y el resto de los archivos lo importan.
// La librería se carga desde un CDN, así no necesitamos npm
// ni ningún paso de "build".
// =============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
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
});
