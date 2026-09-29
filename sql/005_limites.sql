-- =============================================================
-- PokéTracker — Migración 005: límites de tamaño y de cantidad
-- =============================================================
-- Qué cambia:
--   Hoy coleccion acepta textos de cualquier largo, cualquier URL de
--   imagen y cartas y copias sin tope. Con su propio token, un usuario
--   podría llenar la base desde la consola (no afecta a otros usuarios,
--   pero consume la cuota del plan gratuito). Aquí se ponen límites
--   holgados que la app nunca alcanza:
--
--   - coleccion: largo máximo de cada texto e imagen_url solo de
--     https://assets.tcgdex.net/ (o vacía / null, cartas sin imagen).
--   - Hasta 20 000 cartas por usuario y 99 copias por carta, con el
--     mismo patrón que el límite de 30 objetivos (función en "privado"
--     que usa la policy de INSERT).
--
--   Largos máximos reales en todo el catálogo de TCGdex (23 736 cartas,
--   medido el 2026-09-29) contra el límite:
--     id_carta 15 / 40 · nombre_pokemon 51 / 80 · nombre_set 31 / 80
--     numero 7 / 20 · set_id 11 / 40 · imagen_url 56 / 300
--
-- Es aditiva: no borra ni cambia datos, columnas ni permisos. Solo
-- agrega restricciones y cambia las condiciones de las policies de
-- INSERT. La app publicada sigue funcionando igual.
--
-- Cómo ejecutarla (SQL Editor de Supabase):
--   1. Ejecutar SOLO el paso 0. Lo esperado: 0 filas.
--      Si aparece alguna, NO seguir: avisar (esa fila habría que
--      corregirla antes). Si igual se ejecuta el paso 2, falla y
--      Postgres deshace todo: no queda nada a medias.
--   2. Ejecutar desde "begin;" hasta "commit;" de una vez.
--   3. Ejecutar el paso 5 (verificación: una fila).
-- =============================================================


-- -------------------------------------------------------------
-- 0) Revisión previa (solo lectura): filas que NO cumplirían
-- -------------------------------------------------------------
-- Lo esperado: 0 filas. Cada fila muestra qué tabla, qué fila, de
-- qué usuario, qué límite no cumple y el comienzo del valor.
select 'coleccion' as tabla, id, user_id, 'id_carta: entre 1 y 40 caracteres' as problema, left(id_carta, 60) as valor
from public.coleccion where char_length(id_carta) not between 1 and 40
union all
select 'coleccion', id, user_id, 'nombre_pokemon: entre 1 y 80 caracteres', left(nombre_pokemon, 60)
from public.coleccion where char_length(nombre_pokemon) not between 1 and 80
union all
select 'coleccion', id, user_id, 'nombre_set: hasta 80 caracteres', left(nombre_set, 60)
from public.coleccion where char_length(nombre_set) > 80
union all
select 'coleccion', id, user_id, 'numero: hasta 20 caracteres', left(numero, 60)
from public.coleccion where char_length(numero) > 20
union all
select 'coleccion', id, user_id, 'set_id: hasta 40 caracteres', left(set_id, 60)
from public.coleccion where char_length(set_id) > 40
union all
select 'coleccion', id, user_id, 'imagen_url: vacía o https://assets.tcgdex.net/…, hasta 300', left(imagen_url, 60)
from public.coleccion
where imagen_url <> ''
  and not (char_length(imagen_url) <= 300 and starts_with(imagen_url, 'https://assets.tcgdex.net/'))
union all
select 'coleccion', null, user_id, 'más de 20 000 cartas', count(*)::text
from public.coleccion group by user_id having count(*) > 20000
union all
select 'copias', coleccion_id, user_id, 'más de 99 copias de una carta', count(*)::text
from public.copias group by coleccion_id, user_id having count(*) > 99;


begin;

-- -------------------------------------------------------------
-- 1) Largo de los textos e imagen de coleccion
-- -------------------------------------------------------------
-- char_length de un null es null, y un check con null pasa: las
-- columnas que aceptan null (todas menos id_carta y nombre_pokemon)
-- lo siguen aceptando.
-- Cada restricción revisa las filas que ya existen: si alguna no
-- cumple (ver paso 0), falla aquí y se deshace toda la migración.
alter table public.coleccion
  add constraint coleccion_id_carta_largo
    check (char_length(id_carta) between 1 and 40),
  add constraint coleccion_nombre_pokemon_largo
    check (char_length(nombre_pokemon) between 1 and 80),
  add constraint coleccion_nombre_set_largo
    check (char_length(nombre_set) <= 80),
  add constraint coleccion_numero_largo
    check (char_length(numero) <= 20),
  add constraint coleccion_set_id_largo
    check (char_length(set_id) <= 40),
  -- Solo imágenes de TCGdex (la app nunca guarda otra). Así, si algún
  -- día se comparte una colección, no sirve para mostrar imágenes de
  -- terceros ni para rastrear a quien la mira. La barra final de
  -- "https://assets.tcgdex.net/" impide "assets.tcgdex.net.otro.com".
  -- Vacía: carta sin imagen en TCGdex (así la guarda la app).
  add constraint coleccion_imagen_url_valida
    check (
      imagen_url = ''
      or (char_length(imagen_url) <= 300
          and starts_with(imagen_url, 'https://assets.tcgdex.net/'))
    );


-- -------------------------------------------------------------
-- 2) Funciones para los límites de cantidad
-- -------------------------------------------------------------
-- Igual que privado.cantidad_objetivos() (migración 004): una policy
-- no puede contar filas de su propia tabla, así que el conteo va en
-- una función "security definer" que solo cuenta filas de auth.uid().
-- El schema "privado" ya existe (004) y la API no lo expone.

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

revoke all on function privado.cantidad_cartas() from public, anon;
revoke all on function privado.cantidad_copias(bigint) from public, anon;
grant execute on function privado.cantidad_cartas() to authenticated;
grant execute on function privado.cantidad_copias(bigint) to authenticated;


-- -------------------------------------------------------------
-- 3) Policies de INSERT con el límite
-- -------------------------------------------------------------
-- "alter policy" cambia solo la condición: la policy no deja de
-- existir en ningún momento. Lo de antes se mantiene igual.
-- (Como el de objetivos, el límite no es a prueba de pedidos
--  exactamente simultáneos ni de varias filas en un mismo INSERT:
--  el conteo se hace antes de agregar. Para uso personal basta.)

-- Hasta 20 000 cartas por usuario
alter policy "agregar mis cartas"
  on public.coleccion
  with check (
    (select auth.uid()) = user_id
    and (select privado.cantidad_cartas()) < 20000
  );

-- Hasta 99 copias por carta
alter policy "agregar mis copias"
  on public.copias
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.coleccion c
      where c.id = coleccion_id
        and c.user_id = (select auth.uid())
    )
    and privado.cantidad_copias(coleccion_id) < 99
  );

commit;


-- -------------------------------------------------------------
-- 4) Qué ve la app al llegar a un límite
-- -------------------------------------------------------------
-- Texto largo o URL ajena: error 23514 (check_violation). La app nunca
-- los envía.
-- Límite de cartas o de copias: error 42501 (la policy rechaza la
-- fila), igual que el de 30 objetivos.


-- -------------------------------------------------------------
-- 5) Verificación (solo lectura, después del commit): UNA fila
-- -------------------------------------------------------------
-- Lo esperado:
--   restricciones = 'coleccion_id_carta_largo, coleccion_imagen_url_valida,
--     coleccion_nombre_pokemon_largo, coleccion_nombre_set_largo,
--     coleccion_numero_largo, coleccion_set_id_largo'
--   limite_cartas = true, limite_copias = true
--   funciones_seguras = true  (security definer, con search_path fijo)
--   funciones_anon = false    (anon no puede ejecutarlas)
--
--   select
--     (select string_agg(conname, ', ' order by conname)
--        from pg_constraint
--        where conrelid = 'public.coleccion'::regclass and contype = 'c') as restricciones,
--     (select with_check like '%cantidad_cartas()%20000%'
--        from pg_policies
--        where schemaname = 'public' and tablename = 'coleccion' and policyname = 'agregar mis cartas') as limite_cartas,
--     (select with_check like '%cantidad_copias(coleccion_id)%99%'
--        from pg_policies
--        where schemaname = 'public' and tablename = 'copias' and policyname = 'agregar mis copias') as limite_copias,
--     (select bool_and(prosecdef and proconfig is not null)
--        from pg_proc
--        where oid in ('privado.cantidad_cartas()'::regprocedure,
--                      'privado.cantidad_copias(bigint)'::regprocedure)) as funciones_seguras,
--     has_function_privilege('anon', 'privado.cantidad_cartas()', 'execute')
--       or has_function_privilege('anon', 'privado.cantidad_copias(bigint)', 'execute') as funciones_anon;
--
-- Después, en la app con sesión: marcar Tengo, abrir el detalle,
-- agregar y quitar copias, cambiar idioma y marcar Me falta (ver
-- checklist).
