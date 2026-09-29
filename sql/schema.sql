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
  constraint coleccion_usuario_carta_unica unique (user_id, id_carta),

  -- Largos máximos (migración 005), holgados: en todo TCGdex el más
  -- largo es id 15, nombre 51, set 31, número 7, set_id 11, imagen 56.
  -- Un check con null pasa: las columnas nullable siguen aceptándolo.
  constraint coleccion_id_carta_largo
    check (char_length(id_carta) between 1 and 40),
  constraint coleccion_nombre_pokemon_largo
    check (char_length(nombre_pokemon) between 1 and 80),
  constraint coleccion_nombre_set_largo
    check (char_length(nombre_set) <= 80),
  constraint coleccion_numero_largo
    check (char_length(numero) <= 20),
  constraint coleccion_set_id_largo
    check (char_length(set_id) <= 40),

  -- Solo imágenes de TCGdex, o vacía (carta sin imagen). Así, si algún
  -- día se comparte una colección, no sirve para mostrar imágenes de
  -- terceros ni para rastrear a quien la mira. La barra final impide
  -- "assets.tcgdex.net.otro.com".
  constraint coleccion_imagen_url_valida
    check (
      imagen_url = ''
      or (char_length(imagen_url) <= 300
          and starts_with(imagen_url, 'https://assets.tcgdex.net/'))
    )
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

  -- Acabado (migración 006). Null = sin indicar. La app los muestra en
  -- español: Normal, Holo, Reverse holo, Reverse Poké Ball,
  -- Reverse Master Ball, Otro
  acabado       text
                constraint copias_acabado_valido
                check (acabado in ('normal', 'holo', 'reverse', 'pokeball', 'masterball', 'otro')),

  -- Sello promocional o logo de expansión impreso en la carta (006)
  sello         boolean not null default false,

  created_at    timestamptz not null default now()
);

-- Para traer rápido las copias de una carta (y contar copias)
create index copias_coleccion_idx
  on public.copias (coleccion_id);


-- 2b) Tabla de objetivos: lo que el usuario sigue para ver su progreso
-- (el progreso no se guarda: la app lo calcula con la lista de TCGdex)
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
-- (El unique ya crea un índice que empieza por user_id.)


-- 2c) Funciones para los límites de cantidad
-- (30 objetivos, 20 000 cartas y 99 copias por carta)
-- Cuántas filas tiene el usuario que hace el pedido. Las usan las
-- policies de INSERT para los límites: una policy no puede consultar
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

-- Cuántas cartas tiene el usuario que hace el pedido
create function privado.cantidad_cartas()
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select count(*)::integer
  from public.coleccion
  where user_id = (select auth.uid());
$$;

-- Cuántas copias tiene una carta del usuario que hace el pedido
-- (0 si la carta no es suya: la policy ya la rechaza por eso)
create function privado.cantidad_copias(carta bigint)
  returns integer
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select count(*)::integer
  from public.copias
  where coleccion_id = carta
    and user_id = (select auth.uid());
$$;

revoke all on function privado.cantidad_objetivos() from public, anon;
revoke all on function privado.cantidad_cartas() from public, anon;
revoke all on function privado.cantidad_copias(bigint) from public, anon;
grant execute on function privado.cantidad_objetivos() to authenticated;
grant execute on function privado.cantidad_cartas() to authenticated;
grant execute on function privado.cantidad_copias(bigint) to authenticated;


-- 3) Seguridad: Row Level Security (RLS)
-- Con RLS activado, NADIE puede leer ni escribir la tabla
-- salvo lo que permitan explícitamente las reglas (policies) de abajo.
alter table public.coleccion enable row level security;
alter table public.copias enable row level security;
alter table public.objetivos enable row level security;

-- --- coleccion ---

-- Cada usuario solo VE sus propias cartas
create policy "ver mis cartas"
  on public.coleccion for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Cada usuario solo puede AGREGAR cartas a su nombre, hasta 20 000.
-- (Como el de objetivos, el límite no es a prueba de pedidos
--  exactamente simultáneos; para uso personal basta.)
create policy "agregar mis cartas"
  on public.coleccion for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select privado.cantidad_cartas()) < 20000
  );

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
-- (sin la subconsulta, alguien podría colgar copias de una carta ajena),
-- hasta 99 por carta
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
    and privado.cantidad_copias(coleccion_id) < 99
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


-- --- objetivos ---

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

-- (Sin policy de UPDATE: un objetivo no se edita, se sigue o se deja.)


-- 4) Permisos explícitos
-- Supabase da por defecto TODOS los permisos sobre las tablas de
-- "public" a anon y authenticated: se quitan y se dan solo los que
-- la app usa (RLS limita todo a las filas de cada usuario).
-- Los visitantes sin login (anon) no tocan las tablas.

-- coleccion: leer, agregar y borrar (las filas no se editan)
revoke all on public.coleccion from anon, authenticated;
grant select, insert, delete on public.coleccion to authenticated;

-- copias: además, UPDATE solo sobre los datos de la copia (idioma,
-- condición, acabado y sello), así ni siquiera se puede intentar mover
-- una copia a otra carta.
revoke all on public.copias from anon, authenticated;
grant select, insert, delete on public.copias to authenticated;
grant update (idioma, condicion, acabado, sello) on public.copias to authenticated;

-- objetivos: leer, seguir y dejar de seguir
revoke all on public.objetivos from anon, authenticated;
grant select, insert, delete on public.objetivos to authenticated;
