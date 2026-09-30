# PokéTracker

Mini sistema web para coleccionistas de cartas **Pokémon TCG**: busca un Pokémon, mira todas sus cartas con la imagen real y agrega a tu colección las que ya tienes para saber cuáles te faltan.

### 👉 [Abrir PokéTracker](https://poketracker-ten.vercel.app)

Buscar cartas no requiere cuenta. Para guardar tu colección, entra con tu cuenta de Google.

## Tecnologías

HTML, CSS y JavaScript vanilla (módulos ES), con el CSS de **Bootstrap 5.3** (sin su JavaScript), **Supabase** (PostgreSQL + Auth + Row Level Security) como backend y **TCGdex** como fuente de datos e imágenes de cartas.

No hay servidor propio ni paso de compilación: es un sitio estático.

## Cómo funciona

- **Cartas:** se consultan en vivo a la API GraphQL de TCGdex (gratis, sin API key). Todas esas llamadas están aisladas en `js/api.js`. Esto ya se puso a prueba: el proyecto partió con pokemontcg.io, que anunció su cierre para marzo de 2027, y migrar a TCGdex solo requirió reescribir ese archivo.
- **Colección:** bajo cada carta hay un botón **Agregar a mi colección**, o el estado **En tu colección ✓** si ya la tienes. Para quitar una carta, en su detalle está **Quitar de mi colección** (pide confirmación y dice cuántas copias se borran). Al tocar una carta se abre su detalle (con flechas, ← → o deslizando se pasa a la carta anterior o siguiente de la lista), donde se registran las copias (cantidad, y opcionalmente idioma, condición, acabado —normal, holo, reverse, reverse Poké Ball o Master Ball— y sello promocional de cada una). En Supabase se guardan **solo las cartas que el usuario tiene**. "Me falta" no se guarda: es una vista que compara las cartas de la API con las guardadas. En Buscar y en el detalle de un objetivo se elige ver "Todas", "Tengo" o "Me falta" (con "Te faltan 12"), y la elección queda en la URL (`&ver=falta`). También se puede buscar por el número impreso en la carta: `Pikachu 025` (nombre y número) o `025/182` (número y total del set). Al final se puede agregar parte del nombre de la expansión (`Pikachu 025 wizards`, `joltik phantom forces`), y queda aplicada en el filtro de expansión. Los resultados se pueden filtrar por expansión y rareza, y ordenar por fecha, número, nombre o rareza; todo en el navegador y guardado en la URL, así un enlace compartido abre con los mismos filtros. La pestaña **Mi colección** lista todas tus cartas y se puede filtrar por Pokémon y por expansión, y ordenar.
- **Navegación:** cuatro pantallas (Inicio, Buscar, Colección y Progreso) con rutas en el hash (`#/buscar?q=joltik`), así el botón Atrás, recargar y compartir un enlace funcionan sin servidor. En móvil la navegación es una barra inferior.
- **Progreso:** puedes seguir un Pokémon (todas sus cartas, por número de Pokédex) o una expansión, y ver cuántas tienes con una barra de progreso. La lista de cartas de cada objetivo viene de TCGdex y se guarda un día en el navegador. Inicio muestra tus 3 objetivos más recientes. Si todavía no sigues nada, la app te sugiere las expansiones y los Pokémon de los que más cartas tienes (hasta 5), y los puedes seguir con un toque.
- **Cartas sin imagen:** cerca del 7 % de las cartas no tienen imagen en TCGdex. Para esas, la app usa la misma carta en [pokemontcg.io](https://pokemontcg.io) o, si no está, la versión de TCGdex en otro idioma con los mismos ids de carta (español, francés, italiano, alemán, portugués…), con una etiqueta como "Imagen en español". Si no hay en ninguna, muestra un recuadro con el nombre, el número y la expansión.
- **Usuarios:** login con Google (Supabase Auth). Es la única forma de entrar: la app no maneja contraseñas.
- **Tema claro y oscuro:** sigue la preferencia del sistema y se puede cambiar con el botón ☀️/🌙 de la cabecera; la elección se guarda en el navegador.
- **Seguridad:** reglas RLS en la base de datos garantizan que cada usuario solo pueda ver y modificar sus propias cartas (ver `sql/schema.sql`).
- **Privacidad:** [`privacidad.html`](https://poketracker-ten.vercel.app/privacidad.html), enlazada al pie de la app, explica qué datos se guardan, para qué y cómo borrarlos.
- **Hosting:** Vercel, como sitio estático.

## Estructura

```
index.html
privacidad.html   política de privacidad
favicon.svg       ícono de la pestaña (el rayo de la marca)
css/estilos.css
js/
  main.js           punto de entrada: arranque, login y conexión entre módulos
  router.js         rutas en el hash (#/buscar?q=…) y qué pantalla se ve
  estado.js         lo compartido: tus cartas en memoria y la pantalla actual
  busqueda.js       pantalla Buscar (nombre, número y expansión)
  listas.js         Colección y "Agregadas recientemente" de Inicio
  objetivos.js      objetivos, progreso y la pantalla Progreso
  detalle-carta.js  detalle de carta: copias y anterior / siguiente
  filtros.js        filtros por expansión y rareza, y orden (Buscar y Colección)
  imagenes.js       imágenes de respaldo para cartas sin imagen en TCGdex
  api.js            adaptador de la API de cartas (TCGdex)
  config.js         URL y llave pública de Supabase
  supabase.js       cliente de Supabase
  auth.js           login con Google y sesión
  coleccion.js      tu colección, copias y objetivos en Supabase
  ui.js             la interfaz: reúne lo de js/ui/
  ui/
    base.js         mensajes, "No pudimos conectar" y confirmación
    pagina.js       cabecera: sesión, tema y navegación
    pantallas.js    mensajes y grillas de Buscar, Inicio y Colección
    filtros.js      pestañas y selects de filtros
    cartas.js       tarjeta de carta y "Agregar a mi colección"
    imagen.js       carga de imágenes con reintento y recuadro sin imagen
    detalle.js      detalle de carta: imagen y datos
    detalle-navegacion.js  anterior / siguiente: flechas, teclado y deslizar
    copias.js       "Tus copias": idioma, condición, acabado y sello
    acabados.js     insignia de acabados y vista simulada por acabado
    progreso.js     barra, objetivos, sugerencias y Seguir
datos/
  imagenes-alternativas.json  imágenes de respaldo en pokemontcg.io (generada, fija)
herramientas/
  generar-imagenes.mjs  generó la lista de pokemontcg.io (no hace falta volver a correrlo)
sql/
  schema.sql      esquema completo (proyectos nuevos)
  002_copias.sql  migración: copias por carta
  003_permisos_coleccion.sql  migración: solo los permisos que usa la app
  004_objetivos.sql  migración: objetivos (Pokémon o expansiones que sigues)
  005_limites.sql    migración: límites de tamaño y cantidad
  006_acabado_copias.sql  migración: acabado y sello por copia
```

## Correr en local

1. Clona el repo y abre la carpeta en VS Code.
2. Abre `index.html` con la extensión **Live Server** (`http://127.0.0.1:5500`).

Para usar tu propio proyecto de Supabase: ejecuta `sql/schema.sql` en el SQL Editor (ya incluye todas las migraciones), agrega tu URL local en *Authentication → URL Configuration* y reemplaza los valores de `js/config.js`.

## Imágenes de respaldo

Cerca del 7 % de las cartas no tienen imagen en TCGdex (en inglés). Para esas, la app prueba en este orden:

1. **pokemontcg.io:** `datos/imagenes-alternativas.json` dice qué cartas tienen imagen allí. Se genera con un script porque pokemontcg.io responde con un reverso de carta (y no con un error) cuando una imagen no existe, así que no se puede probar a ciegas desde la app. La lista es fija: el servicio cierra y no agrega expansiones nuevas.
2. **TCGdex en otro idioma:** la app pregunta a la API de TCGdex en el momento, por expansión completa (un pedido sirve para todas sus cartas sin imagen), y guarda la respuesta 30 días en el navegador. Usa los idiomas con los mismos ids de carta que el inglés, en este orden: español, francés, italiano, alemán, portugués, español de México y portugués de Brasil, y se queda con el primero que tenga la imagen. Japonés, coreano y chino tienen otras expansiones y otros ids, así que no se usan.
3. **Recuadro** con el nombre, el número y la expansión.

No hay nada que mantener: las cartas nuevas con imagen en otro idioma aparecen solas.

`herramientas/generar-imagenes.mjs` solo sirve para rehacer la lista de pokemontcg.io, algo que ya no hace falta. Se conserva como registro de cómo se armó la lista; cuando pokemontcg.io cierre (anunciado para el 2027-03-01) se pueden borrar el script, la lista y esa opción de `js/imagenes.js`.

## Créditos

Datos e imágenes de cartas: [TCGdex](https://tcgdex.dev) y, cuando TCGdex no tiene la imagen, [pokemontcg.io](https://pokemontcg.io). Pokémon y sus marcas pertenecen a Nintendo, Game Freak y The Pokémon Company. Proyecto personal sin fines comerciales.
