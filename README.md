# PokéTracker

Mini sistema web para coleccionistas de cartas **Pokémon TCG**: busca un Pokémon, mira todas sus cartas con la imagen real y marca las que ya tienes para saber cuáles te faltan.

> 🚧 En desarrollo. Hecho: login con Google o enlace mágico, búsqueda de cartas y marcar "Tengo" / "Me falta". Próximo: vista general con filtros.

## Tecnologías

HTML, CSS y JavaScript vanilla (módulos ES), con **Supabase** (PostgreSQL + Auth + Row Level Security) como backend y **TCGdex** como fuente de datos e imágenes de cartas.

No hay servidor propio ni paso de compilación: es un sitio estático.

## Cómo funciona

- **Cartas:** se consultan en vivo a la API GraphQL de TCGdex (gratis, sin API key). Todas esas llamadas están aisladas en `js/api.js`. Esto ya se puso a prueba: el proyecto partió con pokemontcg.io, que anunció su cierre para marzo de 2027, y migrar a TCGdex solo requirió reescribir ese archivo.
- **Colección:** en Supabase se guardan **solo las cartas que el usuario tiene**. "Me falta" se calcula comparando las cartas de la API con las guardadas.
- **Usuarios:** login sin contraseña con Supabase Auth: "Entrar con Google" como opción principal, o un enlace mágico por correo.
- **Seguridad:** reglas RLS en la base de datos garantizan que cada usuario solo pueda ver y modificar sus propias cartas (ver `sql/schema.sql`).

## Estructura

```
index.html
css/estilos.css
js/
  config.js     URL y llave pública de Supabase
  supabase.js   cliente de Supabase
  api.js        adaptador de la API de cartas
  auth.js       login (Google y enlace mágico) y sesión
  coleccion.js  guardar y quitar cartas de tu colección
  ui.js         todo lo que se dibuja en pantalla
  main.js       punto de entrada
sql/schema.sql  tabla y reglas de seguridad
```

## Correr en local

1. Clona el repo y abre la carpeta en VS Code.
2. Abre `index.html` con la extensión **Live Server** (`http://127.0.0.1:5500`).

Para usar tu propio proyecto de Supabase: ejecuta `sql/schema.sql` en el SQL Editor, agrega tu URL local en *Authentication → URL Configuration* y reemplaza los valores de `js/config.js`.

## Créditos

Datos e imágenes de cartas: [TCGdex](https://tcgdex.dev). Pokémon y sus marcas pertenecen a Nintendo, Game Freak y The Pokémon Company. Proyecto personal sin fines comerciales.
