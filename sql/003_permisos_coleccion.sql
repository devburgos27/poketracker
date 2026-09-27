-- =============================================================
-- PokéTracker — Migración 003: permisos de coleccion
-- =============================================================
-- Qué cambia:
--   Supabase da por defecto TODOS los permisos sobre las tablas de
--   "public" a anon y authenticated. schema.sql solo se los quitó a
--   anon, así que authenticated conservaba UPDATE, TRUNCATE, TRIGGER
--   y REFERENCES sobre coleccion, que la app no usa.
--   UPDATE ya estaba bloqueado por RLS (no hay policy de update), pero
--   TRUNCATE no pasa por RLS. Aquí se deja solo lo que la app usa:
--   SELECT, INSERT y DELETE (igual que en copias).
--
-- Se usa "revoke all" + "grant" en vez de listar cada permiso, para
-- quitar también MAINTAIN, que Postgres 17 agrega a "todos los permisos".
-- Va dentro de una transacción: no hay un instante sin permisos.
--
-- No cambia datos, columnas ni policies. La app no necesita cambios.
--
-- Cómo ejecutarla (SQL Editor de Supabase):
--   1. Ejecutar SOLO el paso 0 y guardar el resultado (permisos de antes).
--   2. Ejecutar desde "begin;" hasta "commit;" de una vez.
--   3. Ejecutar el paso 2 (verificación).
-- =============================================================


-- -------------------------------------------------------------
-- 0) Permisos actuales (solo lectura)
-- -------------------------------------------------------------
-- Lo esperado ANTES: authenticated con DELETE, INSERT, REFERENCES,
-- SELECT, TRIGGER, TRUNCATE, UPDATE (y quizás MAINTAIN); anon sin nada.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'coleccion'
  and grantee in ('anon', 'authenticated')
group by grantee;


begin;

-- -------------------------------------------------------------
-- 1) Solo lo que la app usa
-- -------------------------------------------------------------
-- Los visitantes sin login (anon) no tocan la tabla.
-- Los usuarios logueados leen, agregan y borran sus cartas
-- (RLS limita eso a sus propias filas). Las filas de coleccion no se
-- editan: lo que cambia son las copias.
revoke all on public.coleccion from anon, authenticated;
grant select, insert, delete on public.coleccion to authenticated;

commit;


-- -------------------------------------------------------------
-- 2) Verificación (solo lectura, después del commit)
-- -------------------------------------------------------------
-- Lo esperado: una sola fila, authenticated | DELETE, INSERT, SELECT
-- (anon no aparece):
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type) as permisos
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and table_name = 'coleccion'
--     and grantee in ('anon', 'authenticated')
--   group by grantee;
--
-- Después, en la app con sesión: marcar Tengo, abrir el detalle,
-- agregar y quitar copias, y marcar Me falta (ver checklist).
