-- =============================================================
-- PokéTracker — Esquema de base de datos (Supabase / Postgres)
-- =============================================================
-- Esquema COMPLETO para un proyecto nuevo: deja la base igual a la
-- de producción después de todas las migraciones (sql/002_*.sql…).
-- Un proyecto que ya existe NO ejecuta este archivo: ejecuta las
-- migraciones que le falten.
--
-- Idea central: SOLO guardamos las cartas que el usuario TIENE.
-- "Me falta" se calcula en el frontend:
--     cartas que devuelve la API  −  cartas guardadas aquí
-- Marcar "Tengo"   → INSERT en coleccion + 1 copia en copias
-- Desmarcar        → DELETE en coleccion (sus copias se borran solas)
-- Cantidad de una carta = número de filas en copias.
-- =============================================================


-- 1) Tabla de la colección: una fila por carta que el usuario tiene
create table public.coleccion (
  -- Clave primaria numérica que se genera sola
  id              bigint generated always as identity primary key,

  -- Dueño de la fila. Por defecto toma el id del usuario logueado,
  -- así el frontend no necesita enviarlo. Si se borra el usuario,
  -- se borran sus cartas (on delete cascade).
  user_id         uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  -- Id de la carta según la API (ej: "sv5-65")
  id_carta        text not null,

  -- Datos "copiados" de la API para mostrar la vista "Tengo"
  -- sin tener que volver a consultarla
  nombre_pokemon  text not null,
  nombre_set      text,
  numero          text,
  imagen_url      text,

  -- Id del set según la API (ej: "sv5"). Nullable: las filas antiguas
  -- que no se pudieron calcular en la migración 002 quedan en null.
  set_id          text,

  created_at      timestamptz not null default now(),

  -- Un usuario no puede tener la misma carta registrada dos veces
  -- (las copias repetidas van en la tabla copias)
  constraint coleccion_usuario_carta_unica unique (user_id, id_carta)
);

-- Índice para que filtrar "mis cartas de Joltik" sea rápido
create index coleccion_usuario_pokemon_idx
  on public.coleccion (user_id, nombre_pokemon);


-- 2) Tabla de copias: una fila por copia física de una carta
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


-- 3) Seguridad: Row Level Security (RLS)
-- Con RLS activado, NADIE puede leer ni escribir la tabla
-- salvo lo que permitan explícitamente las reglas (policies) de abajo.
alter table public.coleccion enable row level security;
alter table public.copias enable row level security;

-- --- coleccion ---

-- Cada usuario solo VE sus propias cartas
create policy "ver mis cartas"
  on public.coleccion for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Cada usuario solo puede AGREGAR cartas a su nombre
create policy "agregar mis cartas"
  on public.coleccion for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Cada usuario solo puede BORRAR sus propias cartas
create policy "borrar mis cartas"
  on public.coleccion for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- (No hay policy de UPDATE a propósito: las filas de coleccion no se
--  editan, solo se crean o se borran. Lo que cambia son las copias.)

-- --- copias ---

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


-- 4) Permisos explícitos
-- Supabase da por defecto TODOS los permisos sobre las tablas de
-- "public" a anon y authenticated: se quitan y se dan solo los que
-- la app usa (RLS limita todo a las filas de cada usuario).
-- Los visitantes sin login (anon) no tocan las tablas.

-- coleccion: leer, agregar y borrar (las filas no se editan)
revoke all on public.coleccion from anon, authenticated;
grant select, insert, delete on public.coleccion to authenticated;

-- copias: además, UPDATE solo sobre idioma y condicion, así ni
-- siquiera se puede intentar mover una copia a otra carta.
revoke all on public.copias from anon, authenticated;
grant select, insert, delete on public.copias to authenticated;
grant update (idioma, condicion) on public.copias to authenticated;
