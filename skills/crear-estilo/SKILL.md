---
name: crear-estilo
description: Crea un estilo de video nuevo dentro de Sloth, con su card, a partir de lo que el usuario cuenta o de videos de ejemplo, o cambia uno que ya hizo. Arma la skill del estilo junto a las de Sloth, reusando video-base y el estilo más parecido, y su card con sus etapas para que se vea en el estudio. La lanza la card «Nuevo estilo»; úsala también cuando pidan hacer su propio estilo, una card nueva o un formato de video que Sloth no trae.
---

# Nuevo estilo

Trabajas en la carpeta de las skills de Sloth (`<skills>`, donde arrancas). Ahí hay una carpeta por estilo y `video-base`,
lo que comparten. El estilo nuevo es otra carpeta ahí, `<skills>/<id>/`, y su card va en `<skills>/../data/tus-cards.json`.
Sloth la enseña en el inicio en cuanto ese archivo cambia, y enlaza la skill donde la buscan Claude y Codex.

**No cambies los estilos de Sloth** (`video-el-diff`, `video-explicativo`, `reel-collage`, `video-documental`,
`frutinovela`, `video-base`, `modelos-3d` y esta): cada versión de Sloth los vuelve a poner como venían. Para partir de uno, cópialo.

## Pasos

1. **Entender el video.** Lo que hace falta saber, y nada más: de qué van los videos, cuánto duran, de dónde sale la voz
   (la graba el usuario, una voz de AI Studio o una de `edge-tts`), si sale una persona o un personaje y cómo se ve. El formato no se
   pregunta: todo estilo hace los dos, vertical (TikTok, Reels, Shorts) y horizontal (YouTube), y el usuario elige uno
   en Sloth cada vez. Si sus ejemplos son de uno solo, el otro lo acomodas tú ([FORMATO.md](../video-base/FORMATO.md)). Si mandó ejemplos, bájalos fuera de las skills, a
   `<skills>/../trabajo/<id>/referencias`, con `python <skills>/video-base/scripts/fuente.py <url> <carpeta>`, y míralos
   en una hoja (`node <skills>/video-base/scripts/hoja.mjs <video> <png> --cada 0.5`). Lo que no esté claro, pregúntalo en
   un solo mensaje. Listo cuando puedes describir el estilo en tres líneas y el usuario está de acuerdo.
2. **Partir del más parecido.** Copia a `<skills>/<id>/` el estilo de Sloth que más se le parece, sin lo que juntó quien
   lo usa (`huellas/`, `series/banco/` y, del reel, `personaje/`):
   - `video-explicativo`: explica algo, un mundo 3D que la cámara recorre, la voz del usuario.
   - `reel-collage`: sketch de comedia con recortes de la persona sobre fotos reales y voz de `edge-tts`.
   - `video-documental`: una toma hablando a cámara, cubierta de material real que cambia cada segundo.
   - `video-el-diff`: noticiero seco con material original de una noticia.
   - `frutinovela`: personajes generados que hablan con sus voces, clip por clip en Google Flow, sin Remotion.
   `<id>` va en minúsculas y con guiones (`receta-rapida`), y no es el de ningún estilo que ya exista. En la copia,
   busca el nombre del original (`video-documental`, `reel-collage`…) en todos los archivos y cámbialo por `<id>`:
   algunos scripts se buscan a sí mismos por él, y si no, seguirían usando el original. `video-base` se queda igual.
   En cuanto está la copia, escribe su card (paso 4) con el título y la descripción que acordaron, y las `etapas` del
   original: así sale en el inicio desde ya, aunque el hilo se corte. Al final la ajustas a lo que quedó.
   Listo cuando la carpeta está y su card sale en el inicio de Sloth.
3. **Hacerlo suyo.** Reescribe `SKILL.md` para el estilo nuevo: arriba `name: <id>` y una `description` en español que
   diga qué hace y cuándo usarla. Pasos numerados, cada uno con su «Listo cuando…». El proyecto de cada video va en la
   carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto (la pone Sloth y su estudio la busca ahí).
   Cambia la plantilla de Remotion, los scripts y los textos de apoyo (guion, escenas) a lo que pide el estilo; quita lo
   que no use. Lo que ya resuelve `video-base` (bajar, transcribir, masterizar, comprobar, la portada) se usa desde ahí.
   **Siempre los dos formatos:** Sloth manda `Formato: vertical` o `Formato: horizontal` en el mensaje, la plantilla
   compone el que llegue (1080×1920 o 1920×1080) y `SKILL.md` lleva su sección «Formato», que dice qué hace con cada
   línea y cómo se acomoda en cada uno ([FORMATO.md](../video-base/FORMATO.md)).
   **La voz, como elija el usuario:** si el estilo lleva voz narrada, el mensaje puede traer la línea `Voz:` (mandarla
   él o generarla tú en AI Studio). `SKILL.md` dice en qué paso está el guion y remite a
   [VOZ.md](../video-base/VOZ.md) para lo demás.
4. **La card.** Va en `<skills>/../data/tus-cards.json` (un arreglo; créalo si no está y no toques las demás; si ya
   hay una con su `id`, cámbiala). La escribiste en el paso 2; ahora déjala como quedó el estilo: sus `etapas`, su
   `description` y lo demás. Nunca en `<skills>/../cards.json`: es de Sloth y cada versión lo reemplaza.

   ```json
   {
     "id": "<id>",
     "title": "Receta rápida",
     "description": "Una receta en 30 segundos: los ingredientes vuelan a la olla y tu voz cuenta los pasos.",
     "skill": "<id>",
     "version": "1.0",
     "basadoEn": "video-explicativo",
     "icon": "claqueta",
     "guia": {
       "das": "Solo el nombre del platillo; la voz la grabas cuando te da el guion.",
       "entrega": "Un video de 30 segundos, vertical u horizontal, con su portada.",
       "ejemplo": "Hazme la receta de unos chilaquiles rojos.",
       "herramientas": ["codigo", "tu-voz"],
       "agentes": ["claude"]
     },
     "etapas": [
       { "nombre": "Guion", "listo": "guion.md", "copiar": true, "fase": "guion" },
       { "nombre": "Tu voz", "listo": "fuentes/voz/original.wav", "espera": "Graba el guion y súbelo aquí.", "fase": "sonido" },
       { "nombre": "Video", "listo": "out/!(render*|borrador*|_*).mp4", "fase": "video" },
       { "nombre": "Portada", "listo": "portada.png", "fase": "entrega" }
     ]
   }
   ```

   - `etapas`: los pasos que el estudio enseña; `listo` es un glob dentro de la carpeta del video que existe cuando el
     paso está hecho. `fase` es una de `idea`, `guion`, `sonido`, `video`, `entrega`, en ese orden. La etapa «Video» no
     cuenta borradores ni partes (por eso no es `out/*.mp4`), y siempre hay una de `entrega` con su portada. `espera` es lo que
     le toca hacer al usuario; `copiar`, que el texto se lee en voz alta; `muestra`, qué se enseña si no es lo de `listo`.
   - `version`: la que se ve en su card. Un estilo nuevo es la `1.0`.
   - `basadoEn`: el estilo de Sloth que copiaste en el paso 2. Con él, Sloth instala los paquetes de Python que ese
     usa y sabe de dónde viene al compartirlo. Si copiaste uno instalado de la comunidad (su card tiene
     `origen.publicacion`), pon el `basadoEn` de aquel y además `"deComunidad": "<su origen.publicacion>"`: así, al
     compartir el tuyo, cuenta como su variante y su autor gana puntos.
   - `guia`: cómo se usa, para quien lo instale de la comunidad, donde es obligatoria; sale bajo el nombre del estilo y
     ya escrita al compartirlo. Cada campo, una oración en llano y con lo que quedó de verdad: `das` (lo que pone el
     usuario cada vez), `entrega` (qué video sale, de cuánto y en qué formatos), `ejemplo` (un mensaje real, listo
     para mandar) y, solo si hace falta algo aparte de Sloth, `necesita` (Google Flow con créditos, fotos suyas…).
     Y dos listas, iguales para todos los estilos: `herramientas`, con qué hace el video (`codigo`, `flow-imagenes`,
     `flow-clips`, `chatgpt`, `voz-ia`, `tu-voz`, `internet`, `modelos-3d`; solo `codigo` si no usa nada más), y
     `agentes`, con cuáles lo probaste de verdad (`claude`, `codex`, `opencode`…): el de las dos pruebas del paso 5.
   - `icon`: uno de trazo, nunca un emoji: `noticiero`, `pizarra`, `claqueta`, `risa`, `video`, `imagen`, `megafono`,
     `personas`, `foco`, `globo`, `escena`, `sonido`, `calendario`, `lapiz`.
   - `lote: { "prefijo": "<algo>-" }` si sirve hacer varios a la vez, uno por enlace.
   - El selector de formato (Vertical u Horizontal) sale solo en toda card con `etapas`: no lleva nada para eso. El de
     la voz (mandarla tú o una de AI Studio), también; si la voz es la grabación a cámara del usuario, `"voz": false`,
     y si el estilo hace la suya (edge-tts), `"voz": { "propia": "Voz de edge-tts" }`. Si hace sus clips con
     `generar_video` (Google Flow), `"clips": true`: el compositor deja elegir el modelo (`video-base/FLOW.md`). Si su
     final corre `musica.py --poner` de video-base con la línea `Música: de fondo`, `"musica": true`: el menú de la voz
     deja encenderla.

   Listo cuando el archivo es JSON válido, la card sale en el inicio de Sloth, sus `etapas` son las del estilo nuevo
   y su `guia` dice lo que el estilo pide y entrega.
5. **Probar.** Haz dos videos de prueba cortos (de 10 a 15 s) siguiendo la skill nueva, uno vertical y uno horizontal,
   en `<skills>/../trabajo/<id>/prueba-vertical` y `prueba-horizontal`: si pide la voz del usuario, usa una de
   `edge-tts` solo para probar. Arregla lo que falle en la skill, no en el video. Listo cuando salen los dos MP4, los
   miraste en una hoja y el horizontal se ve pensado para YouTube, no un vertical estirado.
6. **Pasarlo por la vara.** Repasa [lo que necesita todo estilo](../video-base/ESTILO.md), sus 30 requisitos uno por
   uno, y arregla el que no cumpla: es con lo que se aprueba si luego lo comparte. Listo cuando los cumple todos.
7. **Entregar.** Dile al usuario en pocas líneas qué hace su estilo, que ya tiene su card en el inicio (con su nombre)
   para usarlo como los demás, qué le va a pedir cada vez y dónde están las dos pruebas.

## Cambiar un estilo tuyo

Si pide cambiar uno que ya hizo (está en `tus-cards.json`), cambia su carpeta y su card; los de Sloth, nunca (cópialo
con otro `id` si quiere uno parecido). Sube su `version`: el segundo número si el cambio se nota en los videos
(`1.0` → `1.1`), y el primero si lo rehiciste a fondo (`1.4` → `2.0`). Si no tenía, era la `1.0`. Para borrarlo, que use la ✕ de su card: quita la card y guarda la skill en
`<skills>/../data/skills-tuyas/<fecha> estilo borrado <id>/`, de donde se recupera si se arrepiente.

## Compartir un estilo

Un estilo tuyo se comparte con «Compartir» en su card: en la comunidad (sección Estilos) o como archivo
`.sloth-estilo`, que otro instala con «Importar». Viaja solo su carpeta, sin `huellas/`, `series/banco/` ni, si partió
del reel, `personaje/`.

Lo que tiene que cumplir es [lo que necesita todo estilo](../video-base/ESTILO.md), nada más y nada menos. «Compartir»
dice antes de mandarlo lo que Sloth comprueba solo y no cumple: cuando te pidan arreglarlo, arregla eso sin cambiar lo
que el estilo hace, y repasa los demás requisitos. Si la card de un estilo de antes no trae su `guia` o su `version`,
escríbelas.

Para compartirlo hace falta además un video entero hecho con él en Sloth, con su hilo: de ese hilo sale su prueba (con
qué agente se hizo, cuánto costó y cuánto tardó), que nadie escribe. Las dos pruebas del paso 5 sirven.

Ya en la comunidad, Sloth lo lee solo: si cumple todo se aprueba y sale en la tienda; si le falta algo, lo dice en los
comentarios de su publicación y, arreglado, «Compartir» otra vez pone al día esa misma publicación. Lo que su autor
añade para conectarse a internet, lanzar otros programas o tocar archivos lo aprueba el creador de Sloth a mano: si se
puede hacer con lo que `video-base` ya trae, mejor.

Al terminar un estilo, dile en una línea que puede compartirlo en Comunidad → Estilos: la comunidad se reparte la mitad
de los apoyos con tarjeta según cuánta gente usa cada estilo (personas que hacen videos con él, sus videos y sus
variantes). Participar es opcional: si quiere su parte, pone su Binance ID en el recuadro del fondo, arriba de la
comunidad, y ahí le llega. El primer reparto es el 1 de enero de 2027.

## Adaptar un estilo instalado

Cuando piden adaptar un estilo instalado, el mensaje dice qué archivos de `video-base` cambiaron desde la Sloth donde se hizo.
Lee cómo son ahora y cambia la skill del estilo (`<skills>/<id>/`) para que use lo de ahora: nombres de scripts, sus
argumentos, lo que dice cada guía. `video-base` no se toca. Luego haz la prueba corta del paso 5, en vertical. Listo
cuando sale el MP4 y le dices al usuario en pocas líneas qué cambiaste.

## Reglas

- Todo lo que ve el usuario, en español.
- El material de otros se mide y se describe; no se copia a la skill (ni sus videos, ni sus cuadros, ni sus textos).
- Sencillo antes que completo: un estilo con cuatro etapas que funciona vale más que uno con diez a medias.
