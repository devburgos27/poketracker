-- =============================================================
-- PokéTracker — Migración 004: objetivos
-- =============================================================
-- Qué cambia:
--   Tabla nueva "objetivos": lo que cada usuario sigue para ver su
--   progreso. Un objetivo es un Pokémon (por número de Pokédex, así
--   "Joltik" incluye "N's Joltik") o una expansión (por id del set).
--   El progreso NO se guarda: la app lo calcula comparando la lista
--   de cartas de TCGdex con las cartas de la colección.
--
-- Además crea el schema "privado" con una función que usa la policy
-- del límite de 30 objetivos (ver paso 2).
--
-- Es aditiva: no toca coleccion ni copias. La versión publicada de la
-- app sigue funcionando (no usa esta tabla).
--
-- Cómo ejecutarla (SQL Editor de Supabase):
--   1. Ejecutar SOLO el paso 0 (lo esperado: tabla_existente = null).
--   2. Ejecutar desde "begin;" hasta "commit;" de una vez.
--   3. Ejecutar el paso 5 (verificación: una fila).
-- =============================================================


-- -------------------------------------------------------------
-- 0) Revisión previa (solo lectura)
-- -------------------------------------------------------------
-- Lo esperado: null (la tabla todavía no existe)
select to_regclass('public.objetivos') as tabla_existente;


begin;

-- -------------------------------------------------------------
-- 1) Tabla de objetivos
-- -------------------------------------------------------------
create table public.objetivos (
  id          bigint generated always as identity primary key,

  -- Dueño del objetivo. Igual que en coleccion: lo completa auth.uid()
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,

  -- 'pokemon': todas las cartas de un Pokémon (por número de Pokédex)
  -- 'expansion': todas las cartas de un set
  tipo        text not null
              constraint objetivos_tipo_valido
              check (tipo in ('pokemon', 'expansion')),

  -- Pokémon: número de Pokédex (ej: '595' = Joltik)
  -- Expansión: id del set según la API (ej: 'sv04' = Paradox Rift)
  clave       text not null,

  -- Nombre para mostrar sin consultar la API (ej: 'Joltik')
  nombre      text not null
              constraint objetivos_nombre_largo
              check (char_length(nombre) between 1 and 80),

  created_at  timestamptz not null default now(),

  -- No se puede seguir dos veces lo mismo
  constraint objetivos_usuario_unico unique (user_id, tipo, clave),

  -- Formato de la clave según el tipo
  constraint objetivos_clave_pokemon
    check (tipo <> 'pokemon' or clave ~ '^[0-9]{1,4}$'),
  constraint objetivos_clave_expansion
    check (tipo <> 'expansion' or clave ~ '^[A-Za-z0-9._-]{1,40}$')
);
-- (El unique ya crea un índice que empieza por user_id: sirve para
--  traer los objetivos de un usuario sin otro índice.)


-- -------------------------------------------------------------
-- 2) Función para el límite de 30
-- -------------------------------------------------------------
-- Cuántos objetivos tiene el usuario que hace el pedido. Lo usa la
-- policy de INSERT para el límite de 30: una policy no puede consultar
-- su propia tabla (Postgres lo rechaza por "recursión infinita"), así
-- que el conteo va en una función "security definer" (corre con los
-- permisos de su dueño, sin RLS) que solo cuenta las filas de auth.uid().
-- Vive en el schema "privado", que la API de Supabase NO expone: no se
-- puede llamar desde la app, solo la usa la policy.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated;

create function privado.cantidad_objetivos()
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select count(*)::integer
  from public.objetivos
  where user_id = (select auth.uid());
$$;

revoke all on function privado.cantidad_objetivos() from public, anon;
grant execute on function privado.cantidad_objetivos() to authenticated;


-- -------------------------------------------------------------
-- 3) Seguridad: Row Level Security
-- -------------------------------------------------------------
alter table public.objetivos enable row level security;

-- Cada usuario solo VE sus propios objetivos
create policy "ver mis objetivos"
  on public.objetivos for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Solo puede AGREGAR objetivos a su nombre, y hasta 30 en total.
-- (No es a prueba de dos pedidos exactamente simultáneos; para uso
--  personal basta.)
create policy "agregar mis objetivos"
  on public.objetivos for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select privado.cantidad_objetivos()) < 30
  );

-- Solo puede BORRAR ("dejar de seguir") sus propios objetivos
create policy "borrar mis objetivos"
  on public.objetivos for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- (Sin policy de UPDATE a propósito: un objetivo no se edita,
--  se sigue o se deja de seguir.)


-- -------------------------------------------------------------
-- 4) Permisos explícitos
-- -------------------------------------------------------------
-- Se quitan los que Supabase da por defecto y se dan solo los que la
-- app usa. anon (sin login) no toca la tabla.
revoke all on public.objetivos from anon, authenticated;
grant select, insert, delete on public.objetivos to authenticated;

commit;


-- -------------------------------------------------------------
-- 5) Verificación (solo lectura, después del commit): UNA fila
-- -------------------------------------------------------------
-- Lo esperado:
--   rls_activo = true
--   policies   = 'agregar mis objetivos, borrar mis objetivos, ver mis objetivos'
--   permisos_authenticated = 'DELETE, INSERT, SELECT'
--   permisos_anon = null
--   restricciones = 'objetivos_clave_expansion, objetivos_clave_pokemon,
--     objetivos_nombre_largo, objetivos_pkey, objetivos_tipo_valido,
--     objetivos_user_id_fkey, objetivos_usuario_unico'
--   funcion_segura = true  (security definer, con search_path fijo)
--   funcion_anon = false   (anon no puede ejecutarla)
--
--   select
--     (select relrowsecurity from pg_class where oid = 'public.objetivos'::regclass) as rls_activo,
--     (select string_agg(policyname, ', ' order by policyname)
--        from pg_policies where schemaname = 'public' and tablename = 'objetivos') as policies,
--     (select string_agg(privilege_type, ', ' order by privilege_type)
--        from information_schema.role_table_grants
--        where table_schema = 'public' and table_name = 'objetivos' and grantee = 'authenticated') as permisos_authenticated,
--     (select string_agg(privilege_type, ', ' order by privilege_type)
--        from information_schema.role_table_grants
--        where table_schema = 'public' and table_name = 'objetivos' and grantee = 'anon') as permisos_anon,
--     (select string_agg(conname, ', ' order by conname)
--        from pg_constraint where conrelid = 'public.objetivos'::regclass) as restricciones,
--     (select prosecdef and proconfig is not null
--        from pg_proc where oid = 'privado.cantidad_objetivos()'::regprocedure) as funcion_segura,
--     has_function_privilege('anon', 'privado.cantidad_objetivos()', 'execute') as funcion_anon;
