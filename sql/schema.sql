-- =============================================================
-- PokéTracker — Esquema de base de datos (Supabase / Postgres)
-- =============================================================
-- Idea central: SOLO guardamos las cartas que el usuario TIENE.
-- "Me falta" se calcula en el frontend:
--     cartas que devuelve la API  −  cartas guardadas aquí
-- Marcar "Tengo"   → INSERT de una fila
-- Desmarcar        → DELETE de esa fila
-- =============================================================


-- 1) Tabla de la colección
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

  created_at      timestamptz not null default now(),

  -- Un usuario no puede tener la misma carta registrada dos veces
  constraint coleccion_usuario_carta_unica unique (user_id, id_carta)
);

-- Índice para que filtrar "mis cartas de Joltik" sea rápido
create index coleccion_usuario_pokemon_idx
  on public.coleccion (user_id, nombre_pokemon);


-- 2) Seguridad: Row Level Security (RLS)
-- Con RLS activado, NADIE puede leer ni escribir la tabla
-- salvo lo que permitan explícitamente las reglas (policies) de abajo.
alter table public.coleccion enable row level security;

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

-- (No hay policy de UPDATE a propósito: en la v1 las filas no se editan,
--  solo se crean o se borran. Si más adelante agregamos "cantidad",
--  se suma una policy de update aquí.)


-- 3) Permisos explícitos
-- Los visitantes sin login (anon) no tocan la tabla.
-- Los usuarios logueados pueden leer, insertar y borrar
-- (y RLS limita eso a sus propias filas).
revoke all on public.coleccion from anon;
grant select, insert, delete on public.coleccion to authenticated;
