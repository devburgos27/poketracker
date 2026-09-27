-- =============================================================
-- PokéTracker — Migración 002: copias por carta
-- =============================================================
-- Qué cambia:
--   - coleccion.set_id: el set de cada carta (para el progreso por
--     expansión del Bloque 7). Se rellena desde id_carta.
--   - Tabla copias: cada fila de coleccion puede tener varias copias,
--     cada una con su idioma y su condición (opcionales).
--     Cantidad de una carta = número de copias.
--   - Cada carta que ya estaba en coleccion recibe 1 copia sin detalles.
--
-- Es aditiva: no borra ni cambia columnas existentes. La versión
-- publicada de la app sigue funcionando mientras tanto (inserta en
-- coleccion sin copias; la app nueva trata esas filas como 1 copia).
--
-- Cómo ejecutarla (SQL Editor de Supabase):
--   1. Ejecutar SOLO el paso 0 y revisar el resultado.
--   2. Ejecutar desde "begin;" hasta "commit;" de una vez.
--      Si algo falla, Postgres deshace todo lo que va dentro.
--   3. Ejecutar las consultas de verificación del final.
-- =============================================================


-- -------------------------------------------------------------
-- 0) Revisión previa (solo lectura)
-- -------------------------------------------------------------
-- Filas donde set_id NO se puede calcular como
-- "id_carta sin el sufijo -numero". Lo esperado: 0 filas.
-- Si aparece alguna, esa fila queda con set_id = null (no se pierde
-- nada) y se puede corregir a mano después.
select id, id_carta, numero,
       left(id_carta, length(id_carta) - length(numero) - 1) as set_id_calculado
from public.coleccion
where numero is null
   or numero = ''
   or right(id_carta, length(numero) + 1) <> '-' || numero;


begin;

-- -------------------------------------------------------------
-- 1) Respaldo de la tabla actual
-- -------------------------------------------------------------
-- Va en un schema aparte, "respaldo", que la API de Supabase NO
-- expone (solo expone "public"). Así el respaldo no queda visible
-- para nadie desde la app. Se puede borrar cuando todo esté probado:
--   drop table respaldo.coleccion_2026_09_27;
create schema if not exists respaldo;
revoke all on schema respaldo from anon, authenticated;

create table respaldo.coleccion_2026_09_27 as
  table public.coleccion;


-- -------------------------------------------------------------
-- 2) coleccion.set_id
-- -------------------------------------------------------------
-- Id del set según la API (ej: "bw3" para la carta "bw3-40").
-- Nullable: las filas que no calzan en el paso 0 quedan en null.
alter table public.coleccion
  add column set_id text;

-- Se calcula con el número guardado (no con "lo que va después del
-- último guion"), porque hay números con letras como "TG01" o "SWSH001"
-- y sets con punto como "swsh12.5".
update public.coleccion
set set_id = left(id_carta, length(id_carta) - length(numero) - 1)
where numero is not null
  and numero <> ''
  and right(id_carta, length(numero) + 1) = '-' || numero;


-- -------------------------------------------------------------
-- 3) Tabla de copias
-- -------------------------------------------------------------
create table public.copias (
  id            bigint generated always as identity primary key,

  -- Dueño de la copia. Igual que en coleccion: lo completa auth.uid()
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  -- Carta a la que pertenece. Si se borra la carta de la colección
  -- ("Me falta"), se borran también todas sus copias.
  coleccion_id  bigint not null
                references public.coleccion (id) on delete cascade,

  -- Detalles opcionales (null = sin indicar).
  -- La app los muestra en español; aquí se guardan códigos estándar.
  idioma        text
                constraint copias_idioma_valido
                check (idioma in ('en', 'ja', 'es', 'ko', 'de', 'fr', 'pt', 'it', 'zh', 'otro')),

  -- NM = Near Mint (Excelente), LP = Lightly Played (Muy buena),
  -- MP = Moderately Played (Buena), HP = Heavily Played (Regular),
  -- DMG = Damaged (Dañada)
  condicion     text
                constraint copias_condicion_valida
                check (condicion in ('NM', 'LP', 'MP', 'HP', 'DMG')),

  created_at    timestamptz not null default now()
);

-- Para traer rápido las copias de una carta (y contar copias)
create index copias_coleccion_idx
  on public.copias (coleccion_id);


-- -------------------------------------------------------------
-- 4) Seguridad de copias: Row Level Security
-- -------------------------------------------------------------
alter table public.copias enable row level security;

-- Cada usuario solo VE sus propias copias
create policy "ver mis copias"
  on public.copias for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Solo puede AGREGAR copias a su nombre y a cartas de SU colección
-- (sin la subconsulta, alguien podría colgar copias de una carta ajena)
create policy "agregar mis copias"
  on public.copias for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.coleccion c
      where c.id = coleccion_id
        and c.user_id = (select auth.uid())
    )
  );

-- Solo puede EDITAR sus copias, y el resultado debe seguir siendo
-- suyo y de una carta suya
create policy "editar mis copias"
  on public.copias for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.coleccion c
      where c.id = coleccion_id
        and c.user_id = (select auth.uid())
    )
  );

-- Solo puede BORRAR sus propias copias
create policy "borrar mis copias"
  on public.copias for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- -------------------------------------------------------------
-- 5) Permisos explícitos de copias
-- -------------------------------------------------------------
-- Supabase da por defecto TODOS los permisos sobre tablas nuevas de
-- "public" a anon y authenticated. Se quitan y se dan solo los necesarios.
-- UPDATE va solo sobre idioma y condicion: aunque RLS lo impediría,
-- así ni siquiera se puede intentar mover una copia a otra carta.
revoke all on public.copias from anon, authenticated;
grant select, insert, delete on public.copias to authenticated;
grant update (idioma, condicion) on public.copias to authenticated;


-- -------------------------------------------------------------
-- 6) Una copia por cada carta que ya estaba en la colección
-- -------------------------------------------------------------
-- En el SQL Editor no hay usuario logueado (auth.uid() es null),
-- por eso user_id se copia explícitamente desde coleccion.
insert into public.copias (user_id, coleccion_id)
select user_id, id
from public.coleccion;

commit;


-- -------------------------------------------------------------
-- 7) Verificación (solo lectura, después del commit)
-- -------------------------------------------------------------
-- a) Mismo número de filas que antes, y todas con set_id
--    (salvo las que mostró el paso 0):
--   select count(*) as filas, count(set_id) as con_set_id from public.coleccion;
--   select count(*) from respaldo.coleccion_2026_09_27;
--
-- b) Cada carta tiene exactamente 1 copia (lo esperado: 0 filas):
--   select c.id, c.id_carta, count(p.id) as copias
--   from public.coleccion c
--   left join public.copias p on p.coleccion_id = c.id
--   group by c.id, c.id_carta
--   having count(p.id) <> 1;
--
-- c) Ninguna copia quedó con un dueño distinto al de su carta (0 filas):
--   select p.id from public.copias p
--   join public.coleccion c on c.id = p.coleccion_id
--   where p.user_id <> c.user_id;
--
-- d) Permisos de copias (lo esperado para authenticated:
--    SELECT, INSERT, DELETE; y UPDATE solo en idioma y condicion):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'copias' and grantee in ('anon', 'authenticated');
--   select grantee, column_name, privilege_type from information_schema.column_privileges
--   where table_name = 'copias' and grantee = 'authenticated' and privilege_type = 'UPDATE';
