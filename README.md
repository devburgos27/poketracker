# PokéTracker

Mini sistema web para coleccionistas de cartas **Pokémon TCG**: busca un Pokémon, mira todas sus cartas con la imagen real y marca las que ya tienes para saber cuáles te faltan.

### 👉 [Abrir PokéTracker](https://poketracker-ten.vercel.app)

Buscar cartas no requiere cuenta. Para marcar las tuyas, entra con tu cuenta de Google.

## Tecnologías

HTML, CSS y JavaScript vanilla (módulos ES), con **Supabase** (PostgreSQL + Auth + Row Level Security) como backend y **TCGdex** como fuente de datos e imágenes de cartas.

No hay servidor propio ni paso de compilación: es un sitio estático.

## Cómo funciona

- **Cartas:** se consultan en vivo a la API GraphQL de TCGdex (gratis, sin API key). Todas esas llamadas están aisladas en `js/api.js`. Esto ya se puso a prueba: el proyecto partió con pokemontcg.io, que anunció su cierre para marzo de 2027, y migrar a TCGdex solo requirió reescribir ese archivo.
- **Colección:** bajo cada carta hay botones **Tengo** / **Me falta**. Al tocar una carta se abre su detalle, donde se registran las copias (cantidad, y opcionalmente idioma y condición de cada una). En Supabase se guardan **solo las cartas que el usuario tiene**. "Me falta" se calcula comparando las cartas de la API con las guardadas, así que los resultados de una búsqueda se pueden filtrar en "Todas", "Tengo" y "Me falta". La pestaña **Mi colección** lista todas tus cartas y se puede filtrar por Pokémon.
- **Navegación:** tres pantallas (Inicio, Buscar y Colección) con rutas en el hash (`#/buscar?q=joltik`), así el botón Atrás, recargar y compartir un enlace funcionan sin servidor. En móvil la navegación es una barra inferior.
- **Usuarios:** login con Google (Supabase Auth). Es la única forma de entrar: la app no maneja contraseñas.
- **Tema claro y oscuro:** sigue la preferencia del sistema y se puede cambiar con el botón ☀️/🌙 de la cabecera; la elección se guarda en el navegador.
- **Seguridad:** reglas RLS en la base de datos garantizan que cada usuario solo pueda ver y modificar sus propias cartas (ver `sql/schema.sql`).
- **Privacidad:** [`privacidad.html`](https://poketracker-ten.vercel.app/privacidad.html), enlazada al pie de la app, explica qué datos se guardan, para qué y cómo borrarlos.
- **Hosting:** Vercel, como sitio estático.

## Estructura

```
index.html
privacidad.html   política de privacidad
css/estilos.css
js/
  config.js     URL y llave pública de Supabase
  supabase.js   cliente de Supabase
  api.js        adaptador de la API de cartas
  auth.js       login con Google y sesión
  coleccion.js  listar, guardar y quitar cartas de tu colección
  ui.js         todo lo que se dibuja en pantalla
  main.js       punto de entrada
sql/
  schema.sql      esquema completo (proyectos nuevos)
  002_copias.sql  migración: copias por carta
  003_permisos_coleccion.sql  migración: solo los permisos que usa la app
```

## Correr en local

1. Clona el repo y abre la carpeta en VS Code.
2. Abre `index.html` con la extensión **Live Server** (`http://127.0.0.1:5500`).

Para usar tu propio proyecto de Supabase: ejecuta `sql/schema.sql` en el SQL Editor (ya incluye todas las migraciones), agrega tu URL local en *Authentication → URL Configuration* y reemplaza los valores de `js/config.js`.

## Créditos

Datos e imágenes de cartas: [TCGdex](https://tcgdex.dev). Pokémon y sus marcas pertenecen a Nintendo, Game Freak y The Pokémon Company. Proyecto personal sin fines comerciales.
