-- =============================================================
-- PokéTracker — Migración 006: acabado y sello por copia
-- =============================================================
-- Qué cambia:
--   Cada copia física puede registrar:
--   - acabado: 'normal', 'holo', 'reverse' (reverse holo), 'pokeball'
--     (reverse Poké Ball), 'masterball' (reverse Master Ball) u 'otro'.
--     Null = sin indicar. Las copias que ya existen quedan en null.
--   - sello: si tiene sello promocional (o logo de expansión).
--     Siempre true o false; las copias que ya existen quedan en false
--     (el default se aplica al agregar la columna, sin reescribir la tabla).
--
-- Permisos:
--   - UPDATE va por columna (migración 002: solo idioma y condicion). Se
--     agregan acabado y sello; coleccion_id y user_id siguen sin UPDATE.
--   - INSERT está concedido a toda la tabla (no por columna): ya cubre
--     las columnas nuevas, no hace falta cambiarlo. Las policies de
--     INSERT (dueño, carta propia y máximo 99 copias) siguen iguales.
--
-- Es aditiva: no borra ni cambia datos. La app publicada sigue
-- funcionando (no lee ni escribe estas columnas).
--
-- IMPORTANTE: ejecutar esta migración ANTES de publicar la versión de la
-- app que la usa. La app nueva pide estas columnas: sin ellas, la
-- colección no carga.
--
-- Cómo ejecutarla (SQL Editor de Supabase):
--   1. Ejecutar SOLO el paso 0 y revisar el resultado (una fila).
--   2. Ejecutar desde "begin;" hasta "commit;" de una vez.
--   3. Ejecutar el paso 2 (verificación: una fila).
-- =============================================================


-- -------------------------------------------------------------
-- 0) Revisión previa (solo lectura): UNA fila
-- -------------------------------------------------------------
-- Lo esperado:
--   columnas_nuevas_existentes = 0   (acabado y sello todavía no existen)
--   permisos_update            = 'condicion, idioma'
--   insert_de_tabla            = true (INSERT concedido a toda la tabla)
--   permisos_anon              = null
select
  (select count(*)
     from information_schema.columns
     where table_schema = 'public' and table_name = 'copias'
       and column_name in ('acabado', 'sello')) as columnas_nuevas_existentes,
  (select string_agg(column_name, ', ' order by column_name)
     from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'copias'
       and grantee = 'authenticated' and privilege_type = 'UPDATE') as permisos_update,
  has_table_privilege('authenticated', 'public.copias', 'insert') as insert_de_tabla,
  (select string_agg(privilege_type, ', ' order by privilege_type)
     from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'copias'
       and grantee = 'anon') as permisos_anon;


begin;

-- -------------------------------------------------------------
-- 1) Columnas nuevas y permiso de UPDATE
-- -------------------------------------------------------------
alter table public.copias
  -- Null = sin indicar. La app los muestra en español:
  -- Normal, Holo, Reverse holo, Reverse Poké Ball, Reverse Master Ball, Otro
  add column acabado text
    constraint copias_acabado_valido
    check (acabado in ('normal', 'holo', 'reverse', 'pokeball', 'masterball', 'otro')),

  -- Sello promocional o logo de expansión impreso en la carta
  add column sello boolean not null default false;

-- Igual que idioma y condicion: se pueden editar en una copia propia
-- (RLS "editar mis copias" sigue exigiendo dueño y carta propia)
grant update (acabado, sello) on public.copias to authenticated;

commit;


-- -------------------------------------------------------------
-- 2) Verificación (solo lectura, después del commit): UNA fila
-- -------------------------------------------------------------
-- Lo esperado:
--   acabado         = 'text, nullable, sin default'
--   sello           = 'boolean, not null, default false'
--   check_acabado   = true
--   permisos_update = 'acabado, condicion, idioma, sello'
--   insert_de_tabla = true
--   permisos_anon   = null
--   copias_sin_sello_ni_acabado = total de copias (todas quedan en null / false)
--
--   select
--     (select data_type || ', ' || case is_nullable when 'YES' then 'nullable' else 'not null' end
--             || ', ' || coalesce('default ' || column_default, 'sin default')
--        from information_schema.columns
--        where table_schema = 'public' and table_name = 'copias' and column_name = 'acabado') as acabado,
--     (select data_type || ', ' || case is_nullable when 'YES' then 'nullable' else 'not null' end
--             || ', ' || coalesce('default ' || column_default, 'sin default')
--        from information_schema.columns
--        where table_schema = 'public' and table_name = 'copias' and column_name = 'sello') as sello,
--     exists (select 1 from pg_constraint
--             where conrelid = 'public.copias'::regclass and conname = 'copias_acabado_valido') as check_acabado,
--     (select string_agg(column_name, ', ' order by column_name)
--        from information_schema.column_privileges
--        where table_schema = 'public' and table_name = 'copias'
--          and grantee = 'authenticated' and privilege_type = 'UPDATE') as permisos_update,
--     has_table_privilege('authenticated', 'public.copias', 'insert') as insert_de_tabla,
--     (select string_agg(privilege_type, ', ' order by privilege_type)
--        from information_schema.role_table_grants
--        where table_schema = 'public' and table_name = 'copias'
--          and grantee = 'anon') as permisos_anon,
--     (select count(*) || ' de ' || (select count(*) from public.copias)
--        from public.copias where acabado is null and not sello) as copias_sin_sello_ni_acabado;
--
-- Después, en la app con sesión: agregar una copia, elegir acabado y
-- marcar sello, recargar y ver que se mantienen (ver checklist).
