---
name: crear-estilo
description: Crea un estilo de video nuevo dentro de Sloth, con su card, a partir de lo que el usuario cuenta o de videos de ejemplo, o cambia uno que ya hizo. Arma la skill del estilo junto a las de Sloth, reusando video-base y el estilo más parecido, y su card con sus etapas para que se vea en el estudio. La lanza la card «Nuevo estilo»; úsala también cuando pidan hacer su propio estilo, una card nueva o un formato de video que Sloth no trae.
---

# Nuevo estilo

Trabajas en la carpeta de las skills de Sloth (`<skills>`, donde arrancas). Ahí hay una carpeta por estilo y `video-base`,
lo que comparten. El estilo nuevo es otra carpeta ahí, `<skills>/<id>/`, y su card va en `<skills>/../data/tus-cards.json`.
Sloth la enseña en el inicio en cuanto ese archivo cambia, y enlaza la skill donde la buscan Claude y Codex.

**No cambies los estilos de Sloth** (`video-el-diff`, `video-explicativo`, `reel-collage`, `video-documental`,
`video-base`, `modelos-3d` y esta): cada versión de Sloth los vuelve a poner como venían. Para partir de uno, cópialo.

## Pasos

1. **Entender el video.** Lo que hace falta saber, y nada más: de qué van los videos, si son verticales (TikTok, Reels,
   Shorts) u horizontales (YouTube), cuánto duran, de dónde sale la voz (la graba el usuario o una voz de `edge-tts`),
   si sale una persona o un personaje y cómo se ve. Si mandó ejemplos, bájalos fuera de las skills, a
   `<skills>/../trabajo/<id>/referencias`, con `python <skills>/video-base/scripts/fuente.py <url> <carpeta>`, y míralos
   en una hoja (`node <skills>/video-base/scripts/hoja.mjs <video> <png> --cada 0.5`). Lo que no esté claro, pregúntalo en
   un solo mensaje. Listo cuando puedes describir el estilo en tres líneas y el usuario está de acuerdo.
2. **Partir del más parecido.** Copia a `<skills>/<id>/` el estilo de Sloth que más se le parece, sin lo que juntó quien
   lo usa (`huellas/`, `series/banco/` y, del reel, `personaje/`):
   - `video-explicativo`: vertical que explica algo, un mundo 3D que la cámara recorre, la voz del usuario.
   - `reel-collage`: sketch de comedia con recortes de la persona sobre fotos reales y voz de `edge-tts`.
   - `video-documental`: una toma hablando a cámara, cubierta de material real que cambia cada segundo.
   - `video-el-diff`: noticiero seco con material original de una noticia.
   `<id>` va en minúsculas y con guiones (`receta-rapida`), y no es el de ningún estilo que ya exista. En la copia,
   busca el nombre del original (`video-documental`, `reel-collage`…) en todos los archivos y cámbialo por `<id>`:
   algunos scripts se buscan a sí mismos por él, y si no, seguirían usando el original. `video-base` se queda igual.
3. **Hacerlo suyo.** Reescribe `SKILL.md` para el estilo nuevo: arriba `name: <id>` y una `description` en español que
   diga qué hace y cuándo usarla. Pasos numerados, cada uno con su «Listo cuando…». El proyecto de cada video va en la
   carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto (la pone Sloth y su estudio la busca ahí).
   Cambia la plantilla de Remotion, los scripts y los textos de apoyo (guion, escenas) a lo que pide el estilo; quita lo
   que no use. Lo que ya resuelve `video-base` (bajar, transcribir, masterizar, comprobar, la portada) se usa desde ahí.
4. **La card.** Añádela a `<skills>/../data/tus-cards.json` (un arreglo; créalo si no está y no toques las demás), al
   final, cuando la skill ya existe:

   ```json
   {
     "id": "<id>",
     "title": "Receta rápida",
     "description": "Una receta en 30 segundos: los ingredientes vuelan a la olla y tu voz cuenta los pasos.",
     "skill": "<id>",
     "icon": "claqueta",
     "etapas": [
       { "nombre": "Guion", "listo": "guion.md", "copiar": true, "fase": "guion" },
       { "nombre": "Tu voz", "listo": "fuentes/voz/original.wav", "espera": "Graba el guion y súbelo aquí.", "fase": "sonido" },
       { "nombre": "Video", "listo": "out/*.mp4", "fase": "video" },
       { "nombre": "Portada", "listo": "portada.png", "fase": "entrega" }
     ]
   }
   ```

   - `etapas`: los pasos que el estudio enseña; `listo` es un glob dentro de la carpeta del video que existe cuando el
     paso está hecho. `fase` es una de `idea`, `guion`, `sonido`, `video`, `entrega`, en ese orden. `espera` es lo que
     le toca hacer al usuario; `copiar`, que el texto se lee en voz alta; `muestra`, qué se enseña si no es lo de `listo`.
   - `icon`: uno de trazo, nunca un emoji: `noticiero`, `pizarra`, `claqueta`, `risa`, `video`, `imagen`, `megafono`,
     `personas`, `foco`, `globo`, `escena`, `sonido`, `calendario`, `lapiz`.
   - `horizontal: true` si también hace videos horizontales; `lote: { "prefijo": "<algo>-" }` si sirve hacer varios a
     la vez, uno por enlace.

   Listo cuando el archivo es JSON válido y la card sale en el inicio de Sloth.
5. **Probar.** Haz un video de prueba corto (de 10 a 15 s) siguiendo la skill nueva, en
   `<skills>/../trabajo/<id>/prueba`: si pide la voz del usuario, usa una de `edge-tts` solo para probar. Arregla lo que
   falle en la skill, no en el video. Listo cuando sale el MP4 y lo miraste en una hoja.
6. **Entregar.** Dile al usuario en pocas líneas qué hace su estilo, qué le va a pedir cada vez y dónde está la prueba.

## Cambiar un estilo tuyo

Si pide cambiar uno que ya hizo (está en `tus-cards.json`), cambia su carpeta y su card; los de Sloth, nunca (cópialo
con otro `id` si quiere uno parecido). Para borrarlo, que use la ✕ de su card: quita la card y guarda la skill en
`<skills>/../data/skills-tuyas/<fecha> estilo borrado <id>/`, de donde se recupera si se arrepiente.

## Reglas

- Todo lo que ve el usuario, en español.
- El material de otros se mide y se describe; no se copia a la skill (ni sus videos, ni sus cuadros, ni sus textos).
- Sencillo antes que completo: un estilo con cuatro etapas que funciona vale más que uno con diez a medias.
