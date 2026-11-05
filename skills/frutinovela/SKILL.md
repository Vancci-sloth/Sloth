---
name: frutinovela
description: Hace una frutinovela, vertical (TikTok, Reels, Shorts) u horizontal (YouTube). Es una telenovela de un minuto o dos con frutas de cuerpo humano en 3D tipo Pixar, que hablan con sus propias voces, todo generado en Google Flow con las cuentas del usuario. Los mismos personajes en todos los clips, una historia de traición, familia o castigo que se tuerce, y un final que pide la siguiente parte. Úsala cuando pidan una frutinovela, una novela de frutas, otro capítulo o la parte 2 de una que ya se hizo.
---

# Frutinovela

`<skill>` es esta carpeta y `<base>` es `video-base`, junto a ella. Lee su [`LEEME.md`](../video-base/LEEME.md) (los
errores ya vistos) y su [`FLOW.md`](../video-base/FLOW.md) (las herramientas `generar_imagen` y `generar_video`, lo que
gastan y qué hacer si fallan) antes de empezar. Lo que se midió en los ejemplos está en
[`ejemplos/referencia.md`](ejemplos/referencia.md).

## La esencia

- **Personajes que se reconocen.** Cada uno es una fruta con cuerpo de persona, cara expresiva y su ropa de siempre.
  Salen idénticos en todos los clips, porque cada clip parte de un cuadro armado con sus hojas de personaje. Si un
  personaje cambia de cara o de ropa entre clips, el video se cae.
- **Drama de telenovela, dicho serio.** Infidelidad, hijos adoptados, la suegra, el dinero, el secreto, la traición, el
  castigo y el premio al bueno. Los personajes lo viven en serio. La gracia es que son frutas y que su fruta pesa en la
  historia: la piña con espinas, el plátano que se pela, la fresa que se mancha.
- **Hablan ellos, sin narrador.** Cada clip son 8 s de uno o dos personajes diciéndose algo. Veo genera las voces con la
  boca a tiempo, y las voces son las que dice el guion para cada personaje.
- **Cámara casi quieta.** Plano medio o entero, dos o tres personajes, un lugar por escena. Lo que se mueve es la cara y
  las manos. Es lo que Veo hace bien.
- **Gancho y cliffhanger.** El primer segundo ya es el conflicto, sin presentación. El último clip deja la pregunta
  abierta, y el video acaba ahí, en «Parte N».

## Lo que no se negocia

- **Gasta créditos del usuario.** Antes de pedir los clips, dile cuántos son, el modelo y el total. Ejemplo: 11 clips en
  Lite, 110 créditos. Las imágenes (hojas, lugares, cuadros) no gastan.
- **Ningún personaje ni historia de otro canal.** Los ejemplos se miden, no se copian: elenco, nombres y tramas son
  nuevos. El personaje con nombre de una marca o de una persona real no va.
- **Sin texto en lo generado.** Ni letreros, ni subtítulos, ni marcas de agua en los cuadros o los clips. Los
  subtítulos los pone `unir.py`.
- El proyecto va en la carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto (el estudio de Sloth
  la busca ahí). Sin la línea, `frutinovela-<tema>`.

## Formato

El mensaje trae `Formato: vertical` o `Formato: horizontal`; sin la línea, vertical. Lo común a todos los estilos está
en [`FORMATO.md`](../video-base/FORMATO.md).

- **`Formato: vertical`** (1080×1920): cuadros y clips en `9:16`. Los personajes se ven de cuerpo entero o de la rodilla
  para arriba, uno al lado del otro y al centro. Abajo queda aire para los subtítulos y la interfaz de TikTok. Lleva la
  portada de primer fotograma (paso 8).
- **`Formato: horizontal`** (1920×1080): cuadros y clips en `16:9`. Los personajes van a los tercios, frente a frente,
  con el lugar a lo ancho. Así entran tres personajes sin achicarse. `unir.py … --formato horizontal`. La portada no va
  dentro del video: `portada.png` es la miniatura de YouTube (en [`PORTADA.md`](../video-base/PORTADA.md), «En horizontal»).

Todo cuadro va en el formato del video: un cuadro vertical animado en horizontal sale recortado.

## El elenco

Los personajes viven en `personajes/`, en la carpeta donde arrancas (la de todas las frutinovelas). Así se usan otra vez
en la parte 2 sin rehacerlos. Cada uno lleva su hoja `personajes/<nombre>.jpg` y su renglón en
`personajes/ELENCO.md`: nombre, fruta, cómo se ve y qué ropa lleva, su voz (edad, tono, acento) y en qué capítulos sale.
Antes de inventar a uno, mira si ya está.

## Pasos

1. **Historia.** Un tema del usuario, una idea suya o, si no dio nada, una de las tramas de arriba con un giro propio.
   Si es otra parte de una que ya se hizo, lee su `guion.md` y su `ELENCO.md` y sigue desde su cliffhanger. Listo cuando
   puedes contar la historia en tres frases: el conflicto, el giro y la pregunta con que acaba.
2. **Guion.** En `guion.md` de la carpeta del proyecto: el título, la parte, el elenco de este capítulo y una tabla con
   una fila por escena. Cada fila lleva el número, el lugar, quién sale, el plano, lo que hacen y lo que dicen, entre
   comillas y con quién lo dice. Que sean de 8 a 14 escenas (de 64 a 112 s). En cada escena caben unas 20 palabras, de uno
   o dos personajes. Listo cuando el primer clip ya es el conflicto, cada escena empuja la historia y el último deja la
   pregunta.
3. **Personajes.** Los que falten, con `generar_imagen` en `formato` `9:16`, a `personajes/<nombre>.jpg`. Cada uno de
   cuerpo entero, de frente, de pie, con su ropa, sobre un fondo liso claro y sin texto. El pedido, en inglés: `3D
   animated character, Pixar style, a <fruit> with a human body, <rasgos>, wearing <ropa>, full body, front view,
   standing, neutral expression, plain light background, no text`. Míralos. Si uno no salió como dice `ELENCO.md`, pídelo
   otra vez diciendo qué corregir. Listo cuando cada personaje del capítulo tiene su hoja y su renglón en `ELENCO.md`.
4. **Lugares.** Cada lugar del guion, vacío, con `generar_imagen` en el formato del video, a `lugares/<lugar>.jpg` del
   proyecto: el mismo 3D tipo Pixar, con luz cálida y sin personas ni texto. Listo cuando cada lugar tiene su imagen.
5. **Cuadros.** El primer cuadro de cada escena, con `generar_imagen` en el formato del video y en `referencias` las
   hojas de quienes salen más la del lugar (cuatro como mucho), a `cuadros/esc-<NN>.jpg`. El pedido dice dónde está cada
   uno, hacia dónde mira, su gesto al empezar la escena, el plano, y que todo sea igual a las referencias y sin texto.
   Mira todos en una hoja (`node <base>/scripts/hoja.mjs cuadros revision/cuadros.png`). Si uno cambió de cara o de ropa
   o salió con texto, pídelo otra vez: no gasta. Listo cuando los personajes se ven iguales en todos.
6. **Clips.** Mira con `estado_flow` sin `id` cuánto les queda a sus cuentas. Dile al usuario cuántos clips son, cuánto
   gastan y si alcanzan (paso «Lo que no se negocia»), y pídelos todos seguidos,
   sin esperar uno para pedir el siguiente. Sloth los reparte entre sus cuentas con calma, dos a la vez. Usa `generar_video` con
   `primerCuadro` `cuadros/esc-<NN>.jpg`, el formato del video, el modelo, la resolución y el tope de la línea `Clips:` (sin ella,
   Veo 3.1 - Lite, salvo que el usuario pida otro) y
   `salida` `clips/esc-<NN>.mp4`. El prompt, en inglés, describe la acción. El diálogo va en español, entre comillas y
   con quién lo dice y cómo suena su voz (la de `ELENCO.md`). Al final, `static camera, no music, no subtitles, no text
   on screen`. Espera los pendientes con `estado_flow`. Listo cuando están todos los clips. Si una cuenta se quedó sin
   créditos, la herramienta ya pasó a otra. Si ninguna puede, dile al usuario cuántos faltan y cuándo vuelven sus
   cuentas, y para ahí.
7. **Montaje.** `python <skill>/scripts/unir.py <nombre> --formato <formato>` se corre desde la carpeta del proyecto.
   Transcribe cada clip y le corta el final muerto: Veo deja de 1 a 2 s en que nadie habla ni se mueve, y se corta a
   0,35 s de su última palabra. Luego une los clips en orden, masteriza el audio y pone los subtítulos
   (`--sin-subtitulos` si el usuario no los quiere). Si en un clip pasa algo tras la última palabra (un golpe, un grito,
   la cara del remate), ese corte se lo come: mide dónde acaba (el volumen cada medio segundo y una hoja del final del
   clip) y pasa `--hasta <NN>=<s>`. Mira `revision/transcripcion.txt` contra el guion y una hoja del video (`node <base>/scripts/hoja.mjs
   out/frutinovela-<nombre>.mp4 revision/hoja.png --cada 2`). Si un clip dice otra cosa, habla con la voz de otro, cambia a
   un personaje o trae texto, repítelo una vez con el prompt corregido. Repetirlo gasta otra vez: si sigue mal, déjalo y
   díselo al usuario. Al final, `node <base>/scripts/comprobar.mjs out/frutinovela-<nombre>.mp4 --duracion <s> --fps 30
   --tamano <1080x1920 o 1920x1080>`. Listo cuando pasa y cada escena dice lo del guion.
8. **Portada.** Según [`PORTADA.md`](../video-base/PORTADA.md): el personaje del conflicto, grande y con su cara del
   momento más fuerte, y de 2 a 5 palabras del drama («¡ME ENGAÑÓ!», «LA ADOPTARON»). Van tres cuadros del video de
   referencia, para que sea el mismo elenco. En vertical va de primer fotograma (`portada.mjs`). Entrega la ruta del
   video, el guion, los créditos gastados y con qué cuentas, y lo que no revisaste: el audio no lo oyes, solo lo
   transcribes.

## Las imágenes

Todo se hace con Flow, que también hace los clips. La línea `Imágenes:` del mensaje elige el modelo de Nano Banana
(sin ella, Nano Banana 2.1). Si dice ChatGPT, usa Flow de todos modos para las hojas, los lugares y los cuadros, y díselo
al usuario: los cuadros tienen que salir del mismo Flow que los anima, con las mismas referencias.
