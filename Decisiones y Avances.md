# PokéTracker — Decisiones y avance

Actualizado: 2026-09-27

## Decisiones tomadas
- **Modelo de datos:** en Supabase se guardan SOLO las cartas que el usuario tiene. "Me falta" = cartas de la API − cartas guardadas. Marcar = INSERT, desmarcar = DELETE. Sin columna `estado`.
- **Login solo con Google** (desde 2026-09-27; antes también había enlace mágico por correo): Supabase Auth con flowType implicit, `signInWithOAuth`, redirectTo = página actual.
  - Si Google/Supabase vuelve con `#error=...` (por ejemplo, el usuario canceló), la app lo lee al cargar (antes de iniciar Supabase), muestra un mensaje genérico y limpia la URL. RLS: cada usuario ve, agrega y borra solo sus filas. Sin policy de UPDATE por ahora.
- **Temas claro/oscuro:** tokens CSS en `:root`; `data-tema="claro"|"oscuro"` en `<html>` fuerza uno, sin atributo manda el sistema. Preferencia en `localStorage` (`pt-tema`), aplicada con un script inline en el `<head>` para que no parpadee. Amarillo `#FFD60A` solo como fondo con texto oscuro; en tema claro el texto de marca es ámbar `#8A5A00`.
- **Navegación con rutas hash** (Bloque 5): `#/inicio` (por defecto y para rutas desconocidas), `#/buscar?q=texto`, `#/coleccion`. Router propio en `main.js`, sin librerías.
  - Solo cuentan los hashes que empiezan con `#/`: `#access_token=…` y `#error=…` son de Supabase. El router arranca después del primer aviso de `onAuthStateChange` (o si el login no carga, o a los 3 s como respaldo), y `auth.js` limpia el token de la URL antes de avisar.
  - Antes de ir a Google se guarda la ruta en `sessionStorage` (`pt-ruta-login`); al volver se retoma (si no hay, Inicio).
  - Buscar solo cambia la URL y la ruta hace la consulta. Se guardan en memoria las últimas 10 búsquedas: Atrás/Adelante y volver a Buscar no repiten la consulta.
  - Barra con 3 ítems (Inicio, Buscar, Colección): fija abajo en móvil (≤ 720 px, respeta `safe-area-inset-bottom`), en la cabecera en escritorio. Progreso se agrega en el Bloque 7.
  - Colección sin sesión no redirige: muestra una invitación a entrar.
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

## Estructura
index.html · privacidad.html · css/estilos.css · js/{config, supabase, api, auth, coleccion, ui, main}.js · sql/schema.sql · README.md · .gitignore

## Avance
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
  - Límite conocido: Supabase devuelve como máximo 1000 filas por consulta (cargarIdsTengo y listarColeccion). Si una colección pasa de 1000 cartas, habrá que paginar.
- [x] Publicado en Vercel: https://poketracker-ten.vercel.app (2026-09-26). Configuración hecha:
  - [x] Google Cloud: origen autorizado de JavaScript https://poketracker-ten.vercel.app.
  - [x] Supabase: Site URL = https://poketracker-ten.vercel.app y Redirect URL https://poketracker-ten.vercel.app/** (se mantienen las de 127.0.0.1 y localhost para desarrollo).
  - [x] Google Auth Platform: marca completada (página principal, privacidad.html, dominio autorizado) y app publicada; ya no está en modo Prueba. Probado entrando con otra cuenta de Google en incógnito.
- [x] Bloque 5: rutas hash, barra de navegación (inferior en móvil), Inicio (presentación sin sesión; accesos rápidos y últimas 6 cartas con sesión), Colección con invitación a entrar.
- [x] Bloque 4: sistema de diseño (tokens de color, radio, espacio y tipografía), tema claro/oscuro con botón en la cabecera, pestañas unificadas (`.pestanas`), login solo con Google, privacidad.html con ambos temas.