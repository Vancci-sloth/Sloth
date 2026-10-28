---
name: reel-collage
description: Hace un reel de comedia, vertical (TikTok, Reels, Shorts) u horizontal (YouTube), sobre cualquier tema o sobre un guion que traiga el usuario. Un experto muy serio enseña a resolver una situación con pasos físicos absurdos que se ven literales, con las poses recortadas del usuario sobre fotos reales. Úsala cuando pidan un reel de comedia, otro reel como el anterior o un sketch con sus fotos.
---

# Reel de comedia

`<skill>` es esta carpeta y `<base>` es `video-base`, la carpeta junto a ella: lo que comparten
los estilos de video (bajar y transcribir, masterizar, comprobar, la hoja de contacto). Lee su
[`LEEME.md`](../video-base/LEEME.md) antes de empezar (los errores ya vistos). Los scripts van con el `python` del sistema y se corren
desde la raíz del proyecto.

## La esencia

Alguien plantea una situación difícil (un clip real y un comentario: "¿y aquí qué haces?"). Él, con la calma de un
instructor, enseña cómo resolverla, y la solución es una cadena de acciones físicas absurdas que pasan en pantalla tal
como las dice. Remata con una frase tranquila que contradice o achica todo lo que se vio. Tres palabras la sostienen:

- **Literal.** Cada frase se ve mientras se dice: el verbo es una pose y un movimiento, el sustantivo es un recorte, el
  lugar es un escenario. Una frase que no se puede ver se cambia, o se le busca su imagen.
- **Seco.** La voz es de instructivo, tranquila y sin pausas: la locura está en lo que dice. La imagen también: fotos
  reales, recortes limpios, cámara fija, cortes secos, y al final él quieto.
- **Escalada.** Cada paso es más grande que el anterior en tamaño, en violencia de caricatura y en absurdo, y cada uno se
  justifica con una lógica falsa ("esto lo aturde el tiempo suficiente para…", "como es más grande que tú, necesitas
  algo más grande").

Así se cruzan la voz y la imagen; es el contrato que cumplen el guion y las escenas:

| La voz | La imagen |
|---|---|
| El comentario o la pregunta del gancho | El clip real de la situación, con el comentario de Instagram encima |
| "Déjenme enseñarles", "no es para tanto" | Él a cámara, abajo a la derecha, sobre el clip |
| Una instrucción | Su pose y su movimiento, que empiezan en el verbo |
| "Esto lo va a…" (la consecuencia) | El resultado: la criatura vuela, choca, queda tirada |
| Un lugar, "el X más cercano" | Corte seco a ese escenario (cuando lo que vuela sale del cuadro, o en la palabra); entra por el borde opuesto |
| La lógica falsa | Lo que nombra aparece como utilería (el elefante, el trampolín) |
| El remate | Él quieto, de frente, junto a lo que quedó; el video corta en la última palabra |

La evidencia (once reels de referencia, transcritos y mirados cuadro a cuadro) está en
[`ejemplos/referencia.md`](ejemplos/referencia.md); ábrelo cuando dudes de cómo lo resolvía él.

## Lo que el usuario pidió y no se negocia

- **Lo haces solo, de punta a punta.** La voz es TTS (`scripts/voz.py`), la que eligió el usuario; el personaje sale de
  su biblioteca de poses (`personaje/POSES.md`). Al usuario solo se le piden las poses que falten y, en cada reel, su
  imagen de fondo. La primera vez, antes de nada, "El personaje" (abajo).
- **Lo real se ve con su material original**: el clip de la situación, el logo, el producto. Las criaturas, la utilería y
  los escenarios son recortes de fotos reales con licencia libre.
- **Un dato que se diga es verdadero**, de su fuente primaria. Si el video del tema dice otra cosa, gana la fuente y se lo
  dices al usuario.
- El proyecto es `reel-<tema>`, en la carpeta donde Sloth te lanza (`trabajo/reel-collage`: su panel de etapas lo
  busca ahí); `nuevo.py` lo crea. Si el mensaje trae `Carpeta: reel-<nombre>` (la pone Sloth, sola o en
  la línea `Lote:`), `<tema>` es ese `<nombre>`, exacto: el panel lo busca así. Las rutas que le des al usuario van en un
  bloque de código.

## Formato

El mensaje trae `Formato: vertical` o `Formato: horizontal` (lo elige el usuario en Sloth); sin esa línea, vertical. El
reel se hace en ese y solo en ese, compuesto así desde el principio: `nuevo.py <tema> --formato <formato>` lo deja en
`FORMATO` de `src/datos.ts`, de donde sacan su tamaño la composición y los scripts. Lo común a todos los estilos (nada
recortado ni con barras; el otro formato es otro video en Sloth), en [`FORMATO.md`](../video-base/FORMATO.md).

- **`Formato: vertical`** (1080×1920, TikTok, Reels y Shorts): todo apilado, como lo hace él: el comentario arriba, él
  abajo a la derecha y escenarios en fotos verticales. Lleva la portada de primer fotograma (paso 8).
- **`Formato: horizontal`** (1920×1080, YouTube): el mismo reel, a lo ancho. En el gancho, el clip a pantalla completa,
  el comentario arriba a la izquierda y él en el tercio derecho; en el sketch, escenarios en fotos horizontales, él en un
  tercio y la criatura en el otro, los recortes a tres cuartos de su alto del vertical (`ESCALA`) y lo que vuela sale
  por los lados. Sin portada dentro del video: `portada.png` es la miniatura de YouTube de
  [`PORTADA.md`](../video-base/PORTADA.md) («En horizontal»), no se corre `portada.mjs` y `final.py` no la pega.

Cada plano en los dos, en «El formato» de [`ESCENAS.md`](ESCENAS.md).

## De dónde sale el guion

- **Un tema o un enlace**: lo escribes tú, en la voz de [`GUION.md`](GUION.md).
- **Un guion o un texto del usuario**: se queda con sus palabras y su manera de hablar, y la esencia la pone la imagen.
  Cómo se hace: "El guion del usuario" en [`GUION.md`](GUION.md).

## En un lote

Si el mensaje trae `Lote: video 3 de 20. Carpeta: reel-<nombre>` (lo pone Sloth), eres uno de varios reels que hacen a
la vez otros agentes, cada uno en su hilo:

- el tema es el video de la línea `Enlace:`;
- el proyecto es `python <skill>/scripts/nuevo.py <nombre> --formato <formato>`, sin el `reel-` (lo pone `nuevo.py`) y
  con el formato del mensaje: la carpeta tiene que quedar con el nombre exacto de `Carpeta:`, que es donde la busca el
  panel de Sloth;
- vale [`LOTE.md`](../video-base/LOTE.md) de `video-base`: no preguntes ni escribas fuera de tu carpeta. Las poses que
  falten se piden al entregar, como siempre, y el fondo lo buscas tú con licencia libre (paso 5). Sin biblioteca de
  poses no hay reel: si está vacía, para y pide las fotos, lo único que se pregunta en un lote.

## Pasos

1. **Proyecto.** `python <skill>/scripts/nuevo.py <tema> --formato <formato>` (el de la línea `Formato:`; sin ella,
   `vertical`). Copia las poses de la biblioteca a `public/personaje/` y las suma a `src/poses.ts` (las que no trae la
   plantilla, con alto 650: ajústalo en el proyecto). Pídele al usuario,
   en el mismo mensaje en que le cuentas el plan, su **imagen de fondo**: la foto del lugar donde pasa el sketch (si no
   tiene, la buscas tú en el paso 5). Listo cuando la carpeta tiene `node_modules` y `public/personaje/`. Ese
   `node_modules` es un enlace al que comparten todos los reels: no corras `npm install` en el reel, cambiaría el de
   todos.
2. **Fuentes.** `python <base>/scripts/fuente.py <url> fuentes/tema` baja y transcribe el video del tema. Busca el
   **clip de la situación** para el gancho (el momento del video, el demo, la noticia en video; sin enlace, un clip de
   stock de la situación o una grabación de pantalla; si no hay video, la foto real) y recórtalo a sus 4-8 s clave en
   `public/clip.mp4`. Si el usuario manda otro reel de referencia, bájalo a
   `fuentes/estilo` y míralo en una hoja (`node <base>/scripts/hoja.mjs fuentes/estilo/video.mp4 revision/estilo.png
   --cada 0.5`). Listo cuando sabes qué situación cuenta el tema y tienes su clip.
3. **Guion.** Escríbelo según [`GUION.md`](GUION.md) en `guion.md` (el texto, la tabla de acciones y la de fuentes) y en
   `guion.json` (las frases para la voz). Listo cuando cada frase tiene su fila en la tabla de acciones (pose, qué se
   mueve, escenario) y los pasos escalan hasta el remate.
4. **Voz.** `python <skill>/scripts/voz.py --oir`. Listo cuando dura entre 20 y 32 s (o lo que pidió el usuario) y la
   transcripción trae cada nombre propio bien y ninguna palabra pegada entre dos frases.
5. **Material.** Un escenario por lugar (foto real del formato: vertical u horizontal; el primero, la imagen de fondo
   del usuario si la mandó), cada criatura y cada pieza de utilería. Cada original va a
   `fuentes/material/` y lo que entra al video, a `public/img/`: los recortes con
   `python <base>/scripts/recorte.py fuentes/material/<foto> public/img/<nombre>.png` (limpios, sin borde), los
   logos en SVG con `scripts/svg_png.py`, las capturas con `scripts/captura.py`.
   Lo que hay que buscar con licencia libre encárgaselo a un subagente con `model: "sonnet"`: qué foto (la criatura de
   cuerpo entero y de lado, el escenario con piso y en el formato del reel), licencias que valen (CC0, dominio público,
   Unsplash, Pexels; no CC-BY-SA), dónde buscar (Wikimedia Commons, Pexels, Met Museum Open Access), y que devuelva texto, no imágenes.
   Una persona que recibe los golpes es de dominio público o CC0, o no se le reconoce la cara: la licencia de Pexels no
   deja mostrar a alguien identificable de forma negativa. Los logos y productos del tema son material original.
   Listo cuando cada fila de la tabla de acciones tiene sus archivos y los miraste.
6. **Escenas.** Llena `src/Reel.tsx` según [`ESCENAS.md`](ESCENAS.md): el ejemplo que trae la plantilla enseña cada
   movimiento. Corre `npx tsc -p .`. Listo cuando compila y cada acción arranca en su verbo.
7. **Revisión.** `python <skill>/scripts/revisar.py <segundos>` con los segundos de cada lanzamiento, choque y corte de
   escenario, y mira `revision/hoja.png`; cada problema se busca primero en "Problemas conocidos" de `ESCENAS.md`.
   Listo cuando en cada celda se ve lo que dice la voz en ese momento, nada queda tapado o cortado, y lo que sale de un
   escenario entra al siguiente.
8. **Final.** `python <skill>/scripts/final.py <nombre>` renderiza, masteriza a −14 LUFS con el pico a −1 dBTP y
   pasa `comprobar.mjs`; si algo sale con ✘, arréglalo antes de entregar. Después, una hoja más con `revisar.py
   --sin-render` sobre el final (copia el MP4 a `out/borrador.mp4`) para confirmar que es la versión nueva. Luego su
   portada como primer cuadro ([`PORTADA.md`](../video-base/PORTADA.md) de la base): collage de fotos reales y él,
   recortado de su pose más seria (pásala de referencia con otro `-i`), frente a la situación del gancho. En
   horizontal, eso mismo es la miniatura de YouTube («En horizontal» de `PORTADA.md`), que no entra en el video.
   Entrega la ruta, el guion, qué es material real y qué recorte de stock, y lo que no revisaste: el audio no lo oyes,
   solo lo transcribes. No le propongas al usuario cambios a la skill al entregar.

## El personaje

Es el usuario, o quien él quiera: sus fotos son la biblioteca de poses, en `<skill>/personaje/` (un PNG por pose y
`POSES.md`). Sloth no trae ninguna: cada quien pone las suyas.

**La primera vez** (no hay `personaje/POSES.md`), antes de empezar el reel pídele en un solo mensaje:

- **Las fotos**, de cuerpo completo y con la misma ropa, con fondo liso o ya recortadas. Las de base: `hablando` (de la
  cintura para arriba, explicando con las manos, a cámara: el gancho), `parado` (de pie, tranquilo, de lado),
  `explicando` (de frente, manos abiertas), `sorprendido` (manos arriba, defendiéndose), `heroe` (mano en la cintura,
  presumiendo) y `cabeza` (solo la cara, de frente, seria). Las que más destraban después, si quiere: `patada`,
  `cargar` (brazos arriba sosteniendo algo), `aventar`, `agachado`, `correr`, `victoria`. Volar, caer o dar vueltas no
  piden foto: son estas mismas, giradas con `arco`.
- **La voz**: la de `edge-tts` que quiera, por ejemplo `es-MX-JorgeNeural` (hombre, México), `es-MX-DaliaNeural`
  (mujer, México), `es-ES-AlvaroNeural` o `es-AR-TomasNeural`; o de otro idioma si el reel va en otro idioma. Sin
  respuesta, `es-MX-JorgeNeural` a `+25%`.

Cuando las mande, `python <skill>/scripts/recortar.py <pose>=<foto> ... --guardar` las recorta y las guarda en la
biblioteca, y escribe `personaje/POSES.md`: arriba `Voz: <voz>, <rate>` (la que va en `guion.json`), y una tabla con
cada pose: archivo, qué es, hacia dónde mira, su alto en el video (el de `plantilla/src/poses.ts` si se llama igual; si
no, el que le diste en el proyecto) y para qué sirvió. Con `POSES.md` a la vista se escribe cada guion.

**Fotos nuevas.** El estilo vive de las poses: una por acción. Lo que pide otra foto es una acción con otra forma del
cuerpo (patear, cargar algo arriba, aventar). Cuando el guion pide una que no está en `POSES.md`, arma el video con la
más parecida y pídele al usuario la nueva al entregar: qué pose, hacia dónde mira, cuerpo completo, la misma ropa. Si
la manda, `recortar.py <pose>=<foto> --guardar` la recorta y la agrega a la biblioteca; súmala a `POSES.md` y al
`src/poses.ts` del proyecto (los siguientes reels la reciben solos de `nuevo.py`). No cambies `plantilla/`: se
reemplaza con cada versión de Sloth.
