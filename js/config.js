// =============================================================
// Configuración de Supabase
// =============================================================
// Estos dos valores son PÚBLICOS por diseño: cualquiera puede
// verlos en el navegador. La seguridad de los datos la dan las
// reglas RLS definidas en sql/schema.sql, no esta llave.
//
// NUNCA pongas aquí la llave "secret" ni la "service_role".
// =============================================================

export const SUPABASE_URL = 'https://emkdrubdeqovbbrckamp.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_N_53Ta_XRWv0rqgt8Npskw_cYuPRTPR';
