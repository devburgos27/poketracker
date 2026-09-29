# PokéTracker — Decisiones y avance

Actualizado: 2026-09-29

## Decisiones tomadas
- **Modelo de datos:** en Supabase se guardan SOLO las cartas que el usuario tiene. "Me falta" = cartas de la API − cartas guardadas. Marcar = INSERT, desmarcar = DELETE. Sin columna `estado`.
- **Copias** (Bloque 6, migración `sql/002_copias.sql`): tabla `copias` con FK a `coleccion` (on delete cascade). Cantidad = número de copias; idioma y condición van **por copia** (opcionales, códigos `en/ja/…/otro` y `NM/LP/MP/HP/DMG`; la app los muestra en español). `coleccion` sigue siendo una fila por carta y suma `set_id` (para progreso por expansión).
  - "Tengo" = fila en `coleccion` + 1 copia. Quitar la última copia = "Me falta" (borra la fila y, en cascada, sus copias).
  - Las copias se cuentan con el embed `copias(count)` en la misma consulta.
  - Transición: una fila sin copias cuenta como 1; la copia se crea en el primer cambio.
  - RLS de `copias`: solo el dueño; insert/update verifican que `coleccion_id` sea del mismo usuario. `UPDATE` solo sobre `idioma` y `condicion` (permiso por columna).
  - `sql/schema.sql` = estado final para proyectos nuevos; los existentes ejecutan las migraciones `sql/00N_*.sql`.
- **Login solo con Google** (desde 2026-09-27; antes también había enlace mágico por correo): Supabase Auth con flowType implicit, `signInWithOAuth`, redirectTo = página actual.
  - Si Google/Supabase vuelve con `#error=...` (por ejemplo, el usuario canceló), la app lo lee al cargar (antes de iniciar Supabase), muestra un mensaje genérico y limpia la URL. RLS: cada usuario ve, agrega y borra solo sus filas. Sin policy de UPDATE por ahora.
- **Temas claro/oscuro:** tokens CSS en `:root`; `data-tema="claro"|"oscuro"` en `<html>` fuerza uno, sin atributo manda el sistema. Preferencia en `localStorage` (`pt-tema`), aplicada con un script inline en el `<head>` para que no parpadee. Amarillo `#FFD60A` solo como fondo con texto oscuro; en tema claro el texto de marca es ámbar `#8A5A00`.
- **Navegación con rutas hash** (Bloque 5): `#/inicio` (por defecto y para rutas desconocidas), `#/buscar?q=texto`, `#/coleccion`. Router propio en `main.js`, sin librerías.
  - Solo cuentan los hashes que empiezan con `#/`: `#access_token=…` y `#error=…` son de Supabase. Desde el Bloque 10a el router arranca al cargar la página, sin esperar a supabase-js; solo si la URL trae `#access_token` espera al primer aviso de `onAuthStateChange` (mientras, la cabecera dice "Entrando con Google…"), y `auth.js` limpia el token de la URL antes de avisar. Si el login no carga, se quita el token y la app sigue como visitante.
  - Sesión pendiente (Bloque 10a): si existe la clave `sb-<proyecto>-auth-token` en localStorage (o se vuelve de Google), hasta que Supabase confirma la sesión y llegan las cartas, las pantallas privadas muestran su parte de usuario con "Cargando…" y la cabecera no muestra ni "Entrar con Google" ni "Salir" (`ui.mostrarSesionPendiente`). Sin esa clave se dibuja directo como visitante. Así no parpadea la invitación a entrar cuando sí hay sesión.
  - Antes de ir a Google se guarda la ruta en `sessionStorage` (`pt-ruta-login`); al volver se retoma (si no hay, Inicio).
  - Buscar solo cambia la URL y la ruta hace la consulta. Se guardan en memoria las últimas 10 búsquedas: Atrás/Adelante y volver a Buscar no repiten la consulta.
  - Barra con 3 ítems (Inicio, Buscar, Colección): fija abajo en móvil (≤ 720 px, respeta `safe-area-inset-bottom`), en la cabecera en escritorio. Progreso se agrega en el Bloque 7.
  - Colección sin sesión no redirige: muestra una invitación a entrar.
- **supabase-js fijado en 2.117.2 y sin reintentos automáticos** (`db: { retry: false }`): desde esa versión postgrest-js repite cada lectura hasta 3 veces si falla (1 s, 2 s, 4 s); sin conexión eran 4 pedidos por consulta, que se acumulaban al navegar (29 en 10 s). Ahora: un intento y un mensaje con "Reintentar". La versión va fija para que el CDN no cambie el comportamiento sin aviso.
- **Confirmaciones:** `ui.confirmar()` con un `<dialog>` a pantalla completa (sin `confirm()`/`alert()` del navegador).
- **Objetivos y progreso** (Bloque 7b, migración `sql/004_objetivos.sql`): tabla `objetivos` (tipo `pokemon` por número de Pokédex, o `expansion` por id de set; `nombre` para mostrar). Máximo 30 por usuario.
  - La policy de INSERT cuenta con `privado.cantidad_objetivos()` (security definer, schema no expuesto por la API): una policy no puede consultar su propia tabla (Postgres lo rechaza por recursión infinita).
  - Progreso = intersección de `misCartas` con la lista de TCGdex (cartas distintas, no copias). Expansiones: barra = set base (`localId` numérico <= `cardCount.official`), debajo "Master set: X / Y".
  - Listas de TCGdex: un pedido con alias por cada 10 objetivos, solo ids, sin TCG Pocket; caché de 24 h en `localStorage` (`pt-obj:v1:…`). Dentro de `set { cards }` TCGdex entrega cartas resumidas: pedir `rarity` ahí hace fallar la consulta.
  - Lógica en `js/objetivos.js` (main.js le pasa la colección y la sesión). Navegación con 4 ítems; barra inferior hasta 960 px.
  - Porcentaje redondeado hacia abajo (20/21 = 95 %, nunca "100 %" sin estar completo). Con al menos 1 carta y redondeo 0 muestra "<1 %" (en voz, "menos de 1 %").
- **Inicio y sugerencias** (Bloque 7c):
  - Inicio con sesión: "Tu progreso" con los 3 objetivos más recientes (misma tarjeta y barra que Progreso) y "Ver todo". Si no sigue nada, las sugerencias; sin cartas, la sección no aparece.
  - Sugerencias (en Progreso siempre; en Inicio si no sigue nada): hasta 5, de la que más cartas tiene a la que menos, sin las que ya sigue. "Seguir" la agrega a la lista sin recargar; si el foco estaba en el botón, pasa al objetivo nuevo.
  - Expansiones: se agrupa `misCartas` por `set_id`. Para no hacer otra consulta, `cargarMisCartas` trae también `set_id` y `nombre_set` (sin columnas nuevas).
  - Pokémon: `coleccion` no guarda el dexId y no se agregan columnas. Se pide a TCGdex con alias (`c0: card(id: "…") { dexId name }`), en tandas de 50 (medido: 50 = 1,7 s; 200 = 5,4 s, crece por carta), la primera sola y el resto hasta 3 a la vez; si una falla, no se piden más. Se guarda sin vencimiento en `localStorage` (`pt-dex:v1`), porque los datos de una carta no cambian. Dentro de `set { cards }` el dexId llega null, así que no sirve agrupar por set.
  - Solo cuentan cartas con un único Pokémon (los Tag Team no suman). Nombre sugerido = el más corto entre sus cartas ("Joltik", no "N's Joltik"; "Pikachu", no "Pikachu V").
  - El pedido a TCGdex sale solo al entrar a Inicio o Progreso (no al redibujar): sin conexión es un pedido por visita, sin reintentos automáticos. Si falla, se sugieren igual las expansiones.
- **Filtros y orden** (Bloque 8, `js/filtros.js`): expansión, rareza (solo Buscar: Colección no la guarda) y orden, todo en el navegador sobre las cartas ya cargadas.
  - En la URL: `#/buscar?q=joltik&set=sv04&rareza=Rare&orden=numero`, `#/coleccion?set=sv04&orden=numero`. Al cambiar un select se usa `history.replaceState` (sin entrada nueva en el historial ni hashchange); los enlaces de la barra a Buscar y Colección llevan los filtros. Una búsqueda nueva parte sin filtros.
  - "Limpiar filtros" quita expansión y rareza; el orden se mantiene (no es un filtro). La pestaña Todas / Tengo / Me falta no va en la URL, como antes.
  - Las cantidades de cada select cuentan con el otro filtro aplicado; las pestañas cuentan solo las cartas que pasan los filtros. Un valor de la URL que no está en los resultados se muestra con "(0)" y "Limpiar filtros"; un orden desconocido vuelve al de base.
  - Orden de base (no reordena): Buscar = fecha de la expansión; Colección = nombre (como llega de Supabase). Todos desempatan por fecha, set y número.
  - Rareza: de la más común a la más rara, con una lista fija armada desde `/v2/en/rarities` (2026-09-28). Desconocidas después; Promo y sin rareza al final.
  - Colección ordenada por fecha: la fecha sale de la lista de sets de TCGdex (el mismo pedido por sesión de la búsqueda). Solo se pide al elegir ese orden.
- **Búsqueda por número** (Bloque 8b): "025", "Pikachu 025", "025/182" o "Pikachu 025/182" (el número va separado del nombre por un espacio: "Porygon2" es un nombre).
  - El filtro `localId` de TCGdex es "contiene" ("25" trae 125, 225, TG25) y no hay coincidencia exacta (`eq:25` devuelve 0, también en REST); `card(id)` también es aproximado (`sv04-25` trae `sv04-250`). El número exacto se filtra en `api.js`: solo `localId` numérico igual al buscado ("025" = 25). Medido 2026-09-28: "25" = 380 cartas / 80 KB (149 exactas); "1" = 2,1 MB.
  - "Pikachu 025": `cards(filters: { name, localId })` en una consulta.
  - "025/182": sets con ese total impreso (`cardCount.official`, lista pedida aparte una vez por sesión: con el total pesa ~20 KB y no se agrega a cada búsqueda), sus cartas (solo `id localId`) en un pedido con alias y luego los datos completos solo de las coincidencias (se confirma que el id devuelto sea el pedido). "1/102" = 7 KB. Si ningún set tiene ese total, responde sin consultar.
  - "025" solo: menor que 100 responde sin consultar "Hay demasiadas cartas…: prueba con 025/182 o Pikachu 025" (del 1 al 99 todos pasan de 100: 25 → 149, 60 → 127, 99 → 108). Desde 100 consulta y muestra el mismo mensaje si hay más de 100.
  - Números con letras (TG25, SV001) quedan fuera por ahora.
- **Texto de expansión en la búsqueda** (mejora de la 8b): "pikachu 025 wizards", "joltik 44 black", "joltik phantom forces".
  - Con número: lo de antes es el nombre, lo de después la expansión. Sin número: si el nombre completo no trae cartas, se quitan palabras del final (hasta 5) y se usan como expansión; un pedido por intento, se detiene en el primero con cartas. Sin pedidos extra en los demás casos: la expansión se filtra en el navegador.
  - Comparación "contiene" con el nombre y el id del set, sin tildes, mayúsculas, apóstrofos, símbolos ni espacios, y "and" = "&": "black and white", "champions path", "fire red", "sv04" y "pokémon go" encuentran su set.
  - Si coincide: la búsqueda queda como su base y el set como filtro, en el select y en la URL (`q=pikachu 025&set=basep`); así se ve qué se filtró y "Limpiar filtros" muestra todas las de la base. Varias coincidencias van juntas (`set=2014xy,2015xy,…`) en una opción "A + B + 8 más".
  - Si no coincide pero el nombre (y número) sí tienen cartas: se muestran todas con "No encontramos la expansión «wizards»; mostramos todas las de Pikachu 025 (4 cartas)."
  - Límite: un número siempre separa nombre y expansión ("joltik sv 04" busca el número 4); el id va junto ("joltik sv04").
- **Imágenes de respaldo** (Bloque 9, `js/imagenes.js`): 1590 de 21 256 cartas físicas (7,5 %) no tienen imagen en TCGdex en inglés (medido 2026-09-28; Pikachu: 43 de 227).
  - Orden: TCGdex en inglés → pokemontcg.io (790 cartas) → TCGdex en otro idioma (456; es y fr, con etiqueta "Imagen en español/francés") → recuadro con forma de carta (nombre, número, expansión). Entre las dos alternativas se recuperan 1135 (71,4 %); quedan 455 con el recuadro.
  - Lista precalculada `datos/imagenes-alternativas.json` (24,6 KB), generada con `herramientas/generar-imagenes.mjs`; se descarga una vez y solo cuando aparece una carta sin imagen. Solo se prueban imágenes de la lista: pokemontcg.io responde 404 **con una imagen del reverso** (el navegador la dibuja como si hubiera cargado) y cada 404 sale rojo en la consola.
  - Si una imagen de pokemontcg.io llega con 640×892 (el reverso), se trata como faltante y se pasa a la siguiente opción (por si la lista queda vieja o el servicio cambia).
  - pokemontcg.io: `.png` chica en la grilla (~160 KB, 10 veces una de TCGdex) y `_hires.png` solo en el detalle. La imagen alternativa se prueba encima del recuadro, invisible y con `loading="lazy"`: solo se descarga al acercarse a la pantalla.
  - La API de pokemontcg.io falla a menudo (500) y el proyecto la dejó por su cierre anunciado para el 2027-03-01; el CDN de imágenes respondía bien el 2026-09-28. Si deja de responder, esas cartas pasan a la siguiente opción o al recuadro.
  - Reintento: el servidor de imágenes de TCGdex (assets.tcgdex.net) a veces corta la conexión (`ERR_CONNECTION_CLOSED`) o responde 503 durante unos segundos, en cualquier idioma (visto el 2026-09-28: 12 pedidos bien y luego todos 503, incluso el francés; a los segundos, todo 200 otra vez; una ráfaga de 100 imágenes después no lo reprodujo). Cada imagen (inglés, respaldo, chica o grande) tiene **un** reintento tras 1 s, con `?reintento=1` para que el navegador la pida de nuevo (ambos servidores lo ignoran). Si vuelve a fallar se pasa a la siguiente fuente. Una carta que falló por la red no se anota como "sin imagen": al redibujar se vuelve a probar.
  - TCGdex no permite pedir otro idioma por GraphQL (siempre responde en inglés), pero la URL de la imagen es predecible: `assets.tcgdex.net/{idioma}/{serie}/{set}/{número}`.
  - Descartado: imágenes de TCGplayer y Cardmarket (el campo `pricing` de TCGdex trae sus ids).
- **Búsqueda pública:** buscar cartas no requiere login (sirve para visitantes del portafolio); marcar sí lo requerirá. El login se carga con import() dinámico: si Supabase falla, la búsqueda sigue funcionando.
- **Frontend:** HTML + CSS + JS vanilla con módulos ES, supabase-js v2 desde CDN (jsDelivr). Sin build. Debe abrirse con Live Server (no con doble clic / file://).
- **API de cartas: TCGdex (GraphQL)** — migrado desde pokemontcg.io el 2026-09-26 porque pokemontcg.io devolvía error 500, cerró registros y deja de funcionar el 2027-03-01. Todo aislado en `js/api.js`.
  - Endpoint: POST https://api.tcgdex.net/v2/graphql, sin API key, CORS abierto.
  - Una sola consulta: `cards(filters:{name})` + `sets { id releaseDate serie { id } }`. NO usar `pagination` (limita a 100).
  - El filtro de nombre es "contiene" y no distingue mayúsculas: "Joltik" incluye "N's Joltik"; "Pikachu" incluye V, VMAX, ex, etc.
  - Se excluye la serie `tcgp` (TCG Pocket, digital).
  - Imágenes: `image` + `/low.webp` (grilla) o `/high.webp` (ampliada). Algunas cartas no tienen imagen → reemplazo "Imagen no disponible".
  - Resultado verificado: Joltik = 20 cartas físicas (2011–2025), Pikachu = 227.
- **Variantes reverse holo:** ignoradas en v1 (TCGdex expone `variants` en el detalle de carta, posible mejora).
- **Hosting:** Vercel (estático): https://poketracker-ten.vercel.app

## Supabase
- Proyecto: `poketracker`, región São Paulo.
- Project URL: https://emkdrubdeqovbbrckamp.supabase.co
- Llave publishable en `js/config.js` (pública por diseño).
- Tabla `coleccion` creada con `sql/schema.sql`, RLS activo.
- Site URL: https://poketracker-ten.vercel.app. Redirect URLs: https://poketracker-ten.vercel.app/** más las de desarrollo (127.0.0.1 y localhost).
- Ojo: el correo integrado de Supabase tiene un límite bajo de envíos por hora.
- **Límites** (migración `005_limites.sql`, Bloque 10b): `coleccion` con largo máximo por columna (`id_carta` 1–40, `nombre_pokemon` 1–80, `nombre_set` ≤ 80, `numero` ≤ 20, `set_id` ≤ 40) e `imagen_url` vacía, null o de `https://assets.tcgdex.net/` (≤ 300). Hasta 20 000 cartas por usuario y 99 copias por carta, con `privado.cantidad_cartas()` y `privado.cantidad_copias(bigint)` en las policies de INSERT (mismo patrón que los 30 objetivos). Límites holgados: en todo TCGdex el máximo real es id 15, nombre 51, set 31, número 7, set_id 11, imagen 56. El conteo es de antes del INSERT: un insert de varias filas puede pasar el tope por esas filas (la app agrega 1 o 2 por vez). Al llegar a 99 copias, el detalle dice "Llegaste al máximo de 99 copias de esta carta."

## Estructura
index.html · privacidad.html · css/estilos.css · js/{config, supabase, api, auth, coleccion, ui, main}.js · sql/schema.sql · README.md · .gitignore

## Avance
- [ ] Bloque 10b: migración `005_limites.sql` (escrita y probada en PGlite por el camino original → 002 → 003 → 004 → 005, con el catálogo completo de TCGdex como datos; **la ejecuta el usuario**) y `schema.sql` al día (misma estructura que las migraciones, comparada en PGlite). Mensaje propio al llegar a 99 copias.
- [x] Bloque 10a: arranque sin pantalla en blanco. El router ya no espera a supabase-js (ni los 3 s de respaldo): un enlace a `#/buscar?q=pikachu` muestra resultados aunque Supabase tarde; con sesión guardada, las pantallas privadas dicen "Cargando…" sin mostrar la invitación a entrar. Al dejar de seguir un objetivo se borra su lista guardada (`pt-obj:v1:…`). Probado en Edge headless por CDP con supabase-js demorado 6 s y bloqueado (visitante, sesión guardada inválida, vuelta de Google con token). Plan de mejora en `docs/auditoria-fase1.md`.
- [x] Bloque 1: login con enlace mágico + búsqueda con grilla y vista ampliada (TCGdex).
- [x] Login real probado con Google y con enlace mágico.
- [x] Repo git + GitHub público: https://github.com/devburgos27/poketracker (primer commit a954e8b = bloque 1).
- [x] Bloque 2: `js/coleccion.js` + botones Tengo / Me falta (probado con login real).
  - Par de botones con `aria-pressed` bajo cada carta, solo con sesión. Cambio optimista: se revierte si Supabase falla.
  - La colección (ids) se carga una vez al entrar y se mantiene en memoria; resumen "Tienes X, te faltan Y".
  - `nombre_pokemon` guarda el nombre de la carta tal cual (ej. "N's Joltik"); `imagen_url` = imagen chica.
- [x] Bloque 3: filtros por estado y "Mi colección" (probado y funcionando).
  - Como Supabase solo guarda lo que tengo, "Me falta" solo existe dentro de una búsqueda. Por eso son dos partes:
  - **Filtro por estado en la búsqueda:** pestañas "Todas (N)" / "Tengo (N)" / "Me falta (N)" sobre la grilla, solo con sesión. Se filtra en el navegador; los conteos cambian al marcar; en "Tengo" o "Me falta" la carta marcada sale de la vista. Una búsqueda nueva vuelve a "Todas".
  - **Mi colección:** navegación "Buscar" / "Mi colección" (mostrar/ocultar secciones, sin router). `listarColeccion()` en coleccion.js, orden por `nombre_pokemon` y `created_at`. Filtro por Pokémon con `.ilike('nombre_pokemon', '%texto%')` y debounce de 300 ms, así "Joltik" incluye "N's Joltik". Misma tarjeta que la búsqueda; "Me falta" la quita de la colección.
  - `imagen_url` guarda la imagen chica (low.webp); la vista ampliada usa high.webp cambiando el sufijo.
  - Límite de 1000 filas por respuesta de Supabase: resuelto en el Bloque 7a. `cargarMisCartas` y `listarColeccion` piden por páginas (`traerTodas` en coleccion.js), siguiendo el total de `count: 'exact'`, con orden estable que termina en `id`.
- [x] Publicado en Vercel: https://poketracker-ten.vercel.app (2026-09-26). Configuración hecha:
  - [x] Google Cloud: origen autorizado de JavaScript https://poketracker-ten.vercel.app.
  - [x] Supabase: Site URL = https://poketracker-ten.vercel.app y Redirect URL https://poketracker-ten.vercel.app/** (se mantienen las de 127.0.0.1 y localhost para desarrollo).
  - [x] Google Auth Platform: marca completada (página principal, privacidad.html, dominio autorizado) y app publicada; ya no está en modo Prueba. Probado entrando con otra cuenta de Google en incógnito.
- [x] Bloque 9b: un reintento por imagen ante fallos intermitentes de assets.tcgdex.net, y favicon (`favicon.svg`, rayo amarillo sobre fondo oscuro) para quitar el 404 de favicon.ico. Probado con fallos simulados por CDP (Fetch.failRequest).
- [x] Bloque 9: imágenes de respaldo (pokemontcg.io y otros idiomas de TCGdex) con lista precalculada y script para regenerarla, recuadro con forma de carta, créditos en el pie y en privacidad.html. Probado en Edge headless por CDP: 0 errores de consola en el flujo normal; el reverso de 640×892 se trata como faltante.
- [x] Bloque 8b: búsqueda por número ("Pikachu 025", "025/182", "150"), con el número exacto filtrado en el navegador; ejemplo en la ayuda del buscador. Probado contra TCGdex en Node y en Edge headless.
- [x] Bloque 8a: filtros por expansión y rareza y orden en Buscar; expansión y orden en Colección (probado con módulos falsos en Edge headless).
- [x] Bloque 7c: "Tu progreso" en Inicio, sugerencias de expansiones y Pokémon a partir de la colección, "<1 %" en la barra, privacidad.html actualizada. Funcionalidad probada con módulos falsos en Edge headless; el estilo se revisa después.
- [x] Bloque 7b: migración `004_objetivos.sql` (probada en PGlite; la ejecuta el usuario), pantalla Progreso con detalle por objetivo, "Seguir" en búsqueda y en el detalle de carta, barra de progreso accesible.
- [x] Bloque 7a: migración `003_permisos_coleccion.sql` (authenticated queda solo con SELECT, INSERT y DELETE en `coleccion`; probada en PGlite, la ejecuta el usuario) y paginación de más de 1000 filas. Plan completo del Bloque 7 en `docs/plan-bloque-7.md`.
- [x] Bloque 6: migración `002_copias.sql` (escrita y probada en PGlite; la ejecuta el usuario), detalle de carta con "Tus copias" (− N +, idioma y condición por copia), insignia ×N en las tarjetas.
- [x] Bloque 5: rutas hash, barra de navegación (inferior en móvil), Inicio (presentación sin sesión; accesos rápidos y últimas 6 cartas con sesión), Colección con invitación a entrar.
- [x] Bloque 4: sistema de diseño (tokens de color, radio, espacio y tipografía), tema claro/oscuro con botón en la cabecera, pestañas unificadas (`.pestanas`), login solo con Google, privacidad.html con ambos temas.