# PokéTracker — Decisiones y avance

Actualizado: 2026-09-26

## Decisiones tomadas
- **Modelo de datos:** en Supabase se guardan SOLO las cartas que el usuario tiene. "Me falta" = cartas de la API − cartas guardadas. Marcar = INSERT, desmarcar = DELETE. Sin columna `estado`.
- **Login desde la v1:** Supabase Auth con flowType implicit. Opción principal: "Entrar con Google" (`signInWithOAuth`, redirectTo = página actual; Google ya configurado en Supabase). Segunda opción: enlace mágico por correo.
  - Si el enlace mágico ya se usó o expiró, Supabase vuelve con `#error=...&error_code=otp_expired`: la app lo lee al cargar (antes de iniciar Supabase), muestra "El enlace ya se usó o expiró. Pide uno nuevo." y limpia la URL. Otros errores muestran un mensaje genérico. RLS: cada usuario ve, agrega y borra solo sus filas. Sin policy de UPDATE por ahora.
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
- **Hosting:** Vercel (estático).

## Supabase
- Proyecto: `poketracker`, región São Paulo.
- Project URL: https://emkdrubdeqovbbrckamp.supabase.co
- Llave publishable en `js/config.js` (pública por diseño).
- Tabla `coleccion` creada con `sql/schema.sql`, RLS activo.
- Site URL: http://127.0.0.1:5500. Redirect: http://localhost:5500/** (agregar http://127.0.0.1:5500/** si hace falta, y la URL de Vercel al publicar).
- Ojo: el correo integrado de Supabase tiene un límite bajo de envíos por hora.

## Estructura
index.html · css/estilos.css · js/{config, supabase, api, auth, coleccion, ui, main}.js · sql/schema.sql · README.md · .gitignore

## Avance
- [x] Bloque 1: login con enlace mágico + búsqueda con grilla y vista ampliada (TCGdex).
- [x] Login real probado con Google y con enlace mágico.
- [x] Repo git + GitHub público: https://github.com/devburgos27/poketracker (primer commit a954e8b = bloque 1).
- [x] Bloque 2: `js/coleccion.js` + botones Tengo / Me falta (probado con login real).
  - Par de botones con `aria-pressed` bajo cada carta, solo con sesión. Cambio optimista: se revierte si Supabase falla.
  - La colección (ids) se carga una vez al entrar y se mantiene en memoria; resumen "Tienes X, te faltan Y".
  - `nombre_pokemon` guarda el nombre de la carta tal cual (ej. "N's Joltik"); `imagen_url` = imagen chica.
- [ ] Bloque 3: vista general con filtros por estado y por Pokémon.
  - Filtro por Pokémon: "contiene" sin distinguir mayúsculas (`ilike '%joltik%'`), así "Joltik" incluye "N's Joltik".
- [ ] Publicar en Vercel. Al publicar:
  - Agregar la URL de Vercel en Google Cloud (orígenes autorizados de JavaScript).
  - Agregar la URL de Vercel en Supabase (Authentication → URL Configuration → Redirect URLs).
  - Completar la marca en Google Auth Platform y publicar la app: hoy está en modo Prueba y solo entran los usuarios de prueba.