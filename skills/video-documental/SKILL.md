---
name: video-documental
description: Convierte una grabación tuya hablando a cámara en un video documental, horizontal (16:9, para YouTube) o vertical (9:16, para TikTok, Reels y Shorts), con el estilo EDITOR V1 ("editor v1", "ev1", "el documental", "found footage"). La voz manda un torrente de material REAL encontrado en internet para cada frase (las páginas, fotos, películas y posts de la propia empresa, archivo de NASA, Wikimedia o dominio público, interfaces rehechas con datos reales), cada imagen recoloreada (teal, blanco y negro duro, ámbar, flashes en negativo) y animada con dispositivos medidos cuadro a cuadro en tres reels documentales; tú recortado delante de un mundo que cambia con una palabra roja enorme detrás de la cabeza; un clic en cada cambio y una cama musical que se corta bajo el remate. La imagen cambia cada 0,6–1,5 s. Úsala cuando alguien da una grabación y pide este estilo, o un montaje documental rápido de una toma a cámara.
---

# Documental (EDITOR V1)

Tú grabas; la edición busca las pruebas. Cada frase lleva una imagen real de lo que se nombra, encontrada en internet,
recoloreada para que sea de la película y animada con uno de los dispositivos de abajo. **La imagen cambia cada 0,6–1,5 s.**
La cara de quien habla es una imagen más del torrente, no la de siempre.

`<skill>` es esta carpeta y `<base>` es `video-base`, la carpeta junto a ella: Chrome,
masterizar, comprobar y la hoja de contacto. Lee su [`LEEME.md`](../video-base/LEEME.md) antes de empezar (los errores
ya vistos). Los scripts de Python van con `python -I -B -X utf8` (el del sistema: numpy, opencv, pillow y soundfile);
los que piden PyTorch o WhisperX se pasan solos al Python de Sloth.

> **De dónde sale.** Es la skill EDITOR V1 de NextPhase, que venía para HyperFrames. Aquí se dibuja con Remotion: los
> dispositivos (Python) siguen escribiendo HTML y una línea de tiempo de GSAP, pero en `src/edicion.json`, y
> `src/Edicion.tsx` la mueve cuadro a cuadro. Así se ve en vivo en el estudio de Sloth (cada `build.py` se ve al
> momento) y se renderiza con Remotion, con los mismos cuadros medidos. Tres reels (REF-1 historia de fundadores,
> 78,4 s; REF-2 teoría de juegos, 93,6 s; REF-3 origen de una empresa, 70,5 s) se desarmaron cuadro a cuadro:
> `reference/reference-log.md` tiene el método y cada cifra, `reference/edl/REF-1..3.md` los planos y
> `reference/edl/SOUND.md` el sonido. Las referencias son voz en off sin cara; aquí sale quien habla (~25–35 % del
> tiempo) y el recorte delante del mundo. Esa proporción es una decisión, no una medida. `reference/` está en inglés.

**Antes de construir nada, lee:** `reference/devices.md` (la biblioteca, primero) · `reference/look.md` (tratamientos,
letra, ritmo, la cara) · `reference/sound-design.md` + `reference/edl/SOUND.md` · `reference/sourcing.md` ·
`ejemplo/` (un armado real de 45 s; de la época de HyperFrames: sus rutas y su final son los de `plantilla/build.py`).

## La carpeta del video

- El proyecto va en la carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto, dentro del
  directorio donde te lanzó Sloth (`trabajo/video-documental`). Sin esa línea, `doc-<tema>`.
- **Horizontal o vertical, el mismo estilo.** Sin `Formato:` o con `Formato: horizontal`, 1920×1080 para YouTube. Con
  `Formato: vertical`, 1080×1920 para TikTok, Reels y Shorts: `nuevo.py ... --vertical` deja `formato.txt` en la
  carpeta, y de ahí leen el tamaño los dispositivos, `ev1_treat`, `ev1_clip`, `matte.py` y `terminar.py`. Ver
  «Vertical», abajo.
- Si trae `Idea: <canal>/<idea>` (de la sección Ideas), el título, el gancho y la evidencia de la idea guían el plan
  y la búsqueda; si aún no hay grabación, ayúdale a preparar qué decir (corto, con el gancho delante) y espera la toma.

## ⭐ Las ocho cosas que un primer borrador hace mal

Un primer borrador hecho con fotos fijas, capturas y clics sintéticos no se parecía en nada a las referencias. Los
desgloses cuadro a cuadro son la especificación; donde `devices.md` y los `edl/` no coinciden, ganan los `edl/`.

1. **Imagen en movimiento, no fotos.** El 75 % (REF-1), 62 % (REF-2) y 50 % (REF-3) del tiempo son clips.
   `scripts/find-footage.py` (Mixkit, archive.org Prelinger, Wikimedia Commons, NASA, YouTube) y `scripts/ev1_clip.py`
   (corta, recolorea, 30 fps constantes) están para eso.
2. **Metáforas y juegos de palabras en casi todas las líneas.** 15 % (REF-1) / 59 % del tiempo (REF-2) / 31 % (REF-3).
   «modelos nuevos» → coches de un salón de 1950; «se filtró» → un grifo que gotea; «nada» → una planta rodadora. En
   español, el juego es con lo que se dice en español. Los nombres, las empresas y las cifras siempre son lo real.
3. **Todo se mueve:** un zoom constante de 4–7,5 %/s en 62 de 79 planos (`broll(rate=…)`), los cortes nuevos abren
   desenfocados y se enfocan en ~9 cuadros (`focus_in=9`), golpes de zoom en la palabra fuerte (`punches=`), ventanas
   que crecen a saltos 40 % → 63 % → entera.
4. **Ritmo:** de ~60 (REF-1) a ~180 (REF-3) imágenes por minuto. Cuatro segundos quietos es un error.
5. **Los strobes van por forma**: todas las imágenes de una ráfaga comparten forma (todo círculos, todo billetes, todo
   hojas), 2–4 cuadros cada una, un clic cada una. Recortes de páginas al azar no son un strobe.
6. **Los subtítulos cambian de carácter:** 62 px de base, cursiva serif en la frase fuerte, 2,3× en negrita en la
   palabra clave, tinta sobre páginas claras (`captions(..., mode)`, `captions_switch`).
7. **Sonido en cada cambio, al nivel de las referencias:** clics solo 2–7 dB bajo la voz, 4–14 ms después de la imagen.
   Los dispositivos escriben las pistas; `sfx/ev1kit` está sintetizado con la duración, el ataque y el nivel medidos de
   cada sonido de las referencias. Nada de golpes en los flashes, ni whoosh en el muro, ni sonido de teclado.
8. **La cama lleva los cortes.** Suena desde el cuadro 0 ~5,5 LU bajo la voz, NO se agacha, SE CORTA bajo el remate
   (suena seco) y vuelve de golpe en la línea siguiente, baja bajo las tarjetas negras o de interfaz. Nunca un golpe
   ENCIMA de un nombre: tapa la consonante («Claude did.» se transcribió «Flaw dead»). Vuelve a transcribir el final
   para probar que no se tapó ninguna palabra.

## ⛔ Reglas duras

1. **Material real en cada momento.** La foto, la página, el post o la película de la propia empresa, una imagen o un
   clip de NASA, Wikimedia o dominio público, una interfaz rehecha con datos reales. Las únicas sin material son la
   tarjeta negra («nada.») y la máquina de escribir, y son raras. **Mira cada captura**: los muros de cookies, lo que
   aparece al hacer scroll y los controles de bots devuelven páginas en blanco creíbles (`scripts/capture.mjs` resuelve
   los dos primeros; una página con control de bots se descarta). Captura en el idioma del sistema: no fuerces inglés.
2. **Toda imagen encontrada se trata** (`scripts/ev1_treat.py`): el 58–68 % de los planos de las referencias llevan
   grade; el resto, al menos un empuje y viñeta. Nunca una captura cruda de borde a borde. **La cámara de quien habla es
   la excepción: CRUDA en cada plano de cara**: sin grade, sin blanco y negro, sin LUT, sin viñeta. El color lo pone el
   material encontrado. El RGB del recorte sale de la toma cruda.
3. **Cada palabra en pantalla se dijo.** Los subtítulos son las palabras de la toma en su inicio, ±1 cuadro. Los
   títulos son la cosa nombrada (un nombre real, una cifra real), nunca un eslogan.
4. **Comprueba cada dato al buscarlo.** Cifras y afirmaciones de la página real, citadas tal cual y con fecha. Si dos
   páginas oficiales no coinciden, di cuál usaste.
5. **Sin emojis en pantalla.** `capture.mjs` esconde las imágenes de emoji de los posts; una cita llena de emojis se
   vuelve a escribir con la máquina de escribir.
6. **Nada de gente al azar.** Una persona sale solo si es de quien habla la frase.
7. **Solo los tokens.** Colores y fuentes de `assets/tokens.css` (en cada video, `public/assets/ev1/`). Se animan
   transform, opacity y filter, nunca top/left/width/height.
8. **Los derechos se marcan antes del render.** Cada fuente va en la tabla de PLAN.md con su licencia; lo que no esté
   claro (la película de una empresa, una foto de prensa, el clip de alguien) se marca y decide el usuario. La música la
   trae el usuario.
9. **No se publica nada.** Render, mezcla, `out/final.mp4` para revisar, y para. Subirlo es cosa de Sloth y del usuario.

## El estilo en un párrafo

Imágenes reales de borde a borde, cada una cambiada: una sede en teal con semitono en las sombras, una página de precios
en blanco y negro duro, una aurora recoloreada roja, luego verde, luego azul. Una rejilla de tercios fina sobre las
fotos. Palabras blancas pequeñas que llegan de una en una al centro, justo cuando se dicen. De vez en cuando una palabra
crece: sans blanca, serif cursiva cromada, mayúsculas Didone rojas, o una palabra roja enorme detrás de la cabeza. Entre
imágenes: cajas blancas de un cuadro, negativos de dos, datamosh de cuatro, los paneles de una rejilla de 3×3 entrando
uno a uno con un clic cada uno. Debajo, una cama unos dB bajo la voz y clics que se sienten más que se oyen.

## Los dispositivos

`components/ev1_devices.py` (el núcleo medido) y `components/ev1_more.py` (los del primer video entero;
`from ev1_more import *` trae los dos). Cada dispositivo cae en la rejilla de cuadros, pone su z-index y escribe sus
sonidos. Las especificaciones completas, en `reference/devices.md`. Las rutas de imágenes y clips son de `public/`.

| dispositivo | úsalo cuando la frase… | medido |
|---|---|---|
| `tile_reveal` | abre un capítulo o cambia de mundo | 9 paneles, 1 por cuadro, blanco 1 cuadro y luego la imagen, un clic cada uno (REF-1) |
| `cutout_world` + `scripts/matte.py` | nombra una lista de variantes; la frase estrella | quien habla se queda y el mundo cambia por tile reveal; `mega=`, la palabra roja enorme DETRÁS de la cabeza |
| `pop_collage` / `pop_shatter` | dice varias cosas | una tarjeta por palabra, una caja blanca 1 cuadro antes de cada una, luego se aleja y estalla (REF-2) |
| `seq` / `vseq` | una serie de fotos o clips cortados en las palabras | un empuje en cada imagen, un clic por corte |
| `strobe` | aterriza una palabra abstracta | imágenes de 2–3 cuadros, de la misma forma, un cuadrado que salta, un clic cada una (REF-2) |
| `wall3d` | «todos / en todas partes / cada ranking» | plano en perspectiva, barrido de 0,8–3,5 s, desenfoque al moverse, en silencio (REF-1) |
| `page_card` / `focus_card` / `paper_card` | cita una página, un post o un documento | enfoque que entra, marcador sobre cajas medidas con OCR o el DOM |
| `calendar` | «cada pocas semanas», una cadencia | las fechas reales, cada cosa cae en su día con un clic |
| `terminal` / `code_scroll` / `typewriter` | «la API», «el código», una frase citada | texto real que sube y para, marcadores que barren |
| `comment_box` | «dímelo en los comentarios» | una caja de comentarios genérica con el cursor; nunca comentarios inventados |
| `slap_caps` | se burla de los subtítulos automáticos | el cliché, hecho para este video, que el contexto deja claro |
| `silence_cut` / `edit_timeline` / `filmstrip` / `player_window` / `bed_wave` | el video habla de editarse a sí mismo | la onda y los silencios reales de la toma, los planos, pistas y canción de este armado (dos pasadas) |
| `triptych` | tres personas de una frase | tres paneles, cada uno enfoca al entrar |
| `frames` + `ev1_treat.glitch_frames` | «se rompió / se filtró / falla», un giro duro | datamosh de 3–4 cuadros, un sonido de glitch |
| `neg_flash` / `double_neg` / `white_flash` / `whip_out` | salir de un título, entrar en un capítulo, un arrastre rápido | negativos de 1–2 cuadros, un cuadro blanco, un zoom que acelera |
| `keyword(kind=key / title / shock / mega)` | la palabra de la frase | 132 px sans · 136 px serif cromada · 176 px Didone roja · 560 px roja detrás de la cabeza |
| `img_mark` / `svg_mark` | la marca de una empresa | su logo real, en sus colores |
| tarjeta negra (`keyword` sobre `ev1-black`) | «nada», «nadie», un silencio | una palabra pequeña sola sobre negro, la cama baja |
| `captions` / `captions_switch` | en cada momento | blancos palabra a palabra; tinta con halo de papel sobre páginas claras |

**Orden de capas:** fondo → paneles → palabra grande → **el recorte de quien habla** → subtítulos → acabado (rejilla y
viñeta) → flashes.

**Cada línea del PLAN es una escena:** `c.escena('<la línea, corta>', b, e)`. Es lo que el estudio enseña en la línea
de tiempo y lo que el usuario cita para pedir un cambio («la escena 4»), y de donde `cuadros.mjs` saca qué revisar.

## Vertical

Es el mismo estilo, con los mismos dispositivos, medidas, ritmo y sonido. Solo cambia lo que se queda sin ancho: 1080
es el lado corto en los dos formatos, así que la letra conserva su tamaño.

- **Los subtítulos** saltan a dos líneas si no caben, centrados en su sitio, al 63 % del alto: bajo la barbilla y por
  encima de la barra de abajo de la app. `.ev1-vertical` en `tokens.css`.
- **La palabra grande** (`keyword`, `slap_caps`) se encoge sola al ancho si no cabe (`fit_size`). La `mega` detrás
  de la cabeza queda de unos 280 px para una palabra de cinco letras; corta y en mayúsculas pega más.
- **El material se corta de pie.** `ev1_treat` y `ev1_clip` llenan 1080×1920: casi todo el material encontrado es
  horizontal, así que pon `focus=` en lo que importa. Una página a cuadro completo se captura como en el teléfono
  (`capture.mjs` con `"mobile": true, "w": 432, "h": 768, "dsf": 2.5`). Una página de escritorio va en tarjeta
  (`focus_card`, `paper_card`), que se encoge al ancho con sus marcadores.
- **Los dispositivos se acomodan:** `paper_card` pone las palabras arriba y abajo de la tarjeta, `triptych` apila
  los paneles, y las interfaces rehechas (`terminal`, `code_scroll`, `edit_timeline`, `calendar`, `comment_box`…)
  van a lo ancho del teléfono, con lo de arriba bajado ~230 px por la barra de la app. Las posiciones que pases tú
  (`pop_collage`, `pop_shatter`, `y=` de un `keyword`) son de este cuadro: piénsalas en 1080×1920.
- **Las tarjetas, encima de los subtítulos:** una `focus_card` centrada choca con la línea del 63 %; súbela con
  `y=` (~760). Un párrafo de una página oficial no se lee a 1080 de ancho: la captura entra un instante y la frase
  exacta se repite en grande sobre papel, con el marcador (una interfaz rehecha con datos reales).
- **La cámara** sale de pie (`cam_raw.mp4` a 1080×1920). La toma, en vertical, con el teléfono de pie.
- Prueba: `prueba.py --vertical`.

## Ritmo

Planos quietos con mediana de **0,79 s** (REF-1) / **0,56 s** (REF-2); 4–13 % del tiempo en ráfagas de strobe o flash;
los cortes caen en el inicio de una palabra. Para un video largo, la apertura y cada inicio de capítulo van al ritmo de
las referencias y el cuerpo respira a **1,2–2,0 s** con movimiento dentro (empuje, barrido, escritura).
`reference/look.md` §3.

## Sonido

`reference/sound-design.md`. Los dispositivos ponen los clics, trenes, golpes y glitches en `sfx-cues.txt`; nunca lo
edites a mano. Un video que repite un mismo clic 80 veces suena a metrónomo: rota `click_1..4` (ver `rotate_clicks()` en
el ejemplo). Cama: `scripts/bed-mix.py` → `work/premix.wav`, con `--under 5.5`, `--ramp a,b,-70,0.012` para cortarla
bajo un remate, `--ramp a,b,-8` bajo una tarjeta negra; el drop de la canción, en la línea DESPUÉS del remate. La
skill no trae música: una canción que el usuario tenga derecho a usar, en `public/assets/music/`. Los sonidos de `sfx/`
están hechos con código y son libres.

`build.py` junta al final la voz (o la premezcla) con los efectos en `public/sonido.wav`: es la única pista del
proyecto, la que suena en el estudio y la que lleva el render.

## Cómo se hace

Cada paso, desde la carpeta del video salvo el primero.

1. **El proyecto:** `python -I -B -X utf8 <skill>/scripts/nuevo.py <grabación> <nombre>` (con `--vertical` si el
   mensaje trae `Formato: vertical`). Deja la plantilla de
   Remotion, `public/assets/media/cam_raw.mp4` (la cámara cruda, 30 fps constantes, un cuadro clave por segundo, sin
   grade), `public/assets/media/vo.wav` (la voz), `build.py`, `PLAN.md` y `node_modules` (un enlace al que comparten
   todos los documentales: no corras `npm install` en el video, cambiaría el de todos). La grabación original queda en
   `fuentes/`, fuera de `public/`: Remotion copia `public/` entero cada vez que empaqueta. Si no hay grabación todavía,
   pídela: la etapa «Tu grabación» del estudio la recibe (en horizontal, con el celular de lado basta; en vertical, de pie).
2. **Transcribir:** `python -I -B -X utf8 <skill>/scripts/transcribir.py .` (el transcriptor de Sloth en español, con
   los nombres de `terminos.txt` como pistas) deja `work/tx/words.json` y `transcript.txt`, avisa de los tramos con voz
   y sin palabras y corre `snap-onsets.py` (la primera palabra después de cada pausa cae en el sonido, no 60–220 ms
   antes). Corrige a mano en `words.json` los nombres mal oídos, sin tocar los tiempos. Si la toma tiene arranques
   repetidos o pausas largas, córtalos primero y transcribe el archivo cortado: todo el tiempo sale del archivo sobre
   el que se construye.
3. **Plan y búsqueda** (`reference/sourcing.md`). Para cada línea, lo real (la página de la empresa →
   `scripts/capture.mjs`; una foto de la empresa o de archivo → `scripts/find-footage.py`; su propia película → un clip
   corto oficial; espacio y ciencia → NASA; cifras → la página real) y una metáfora donde la frase lo permita. Escribe
   la tabla de líneas y la de fuentes (con licencias y marcas) en `PLAN.md`. **Enséñale al usuario el plan y las
   marcas, y espera su visto bueno** antes de construir.
4. **Tratar** cada foto y cada clip (`work/prep.py`, como el del ejemplo: `ev1_treat.treat(...)`,
   `ev1_clip.make(...)`, todo a 30 fps constantes) en `public/assets/...`, y apuntarlos en `work/assets.json` con su
   ruta relativa a `public/` (`"hq": "assets/img/hq.jpg"`). El recorte de quien habla para las líneas estrella:
   `python -I -B -X utf8 <skill>/scripts/matte.py --plate public/assets/media/cam_raw.mp4 --start S --dur D --out
   public/assets/media/matte_a.webm` (va con el Python de Sloth y su GPU).
5. **Construir** `build.py`: un bloque por línea del PLAN, sobre los inicios de las palabras (`find`, `span`), un
   dispositivo cada uno y su `c.escena(...)`. `python -I -B -X utf8 build.py`. El usuario lo ve en vivo en el estudio.
6. **Revisar:** `node <skill>/scripts/cuadros.mjs` saca un cuadro por escena al 90 % de su tramo (o `--t`, o
   `--cada 0.5 --desde a --hasta b` para un tramo rápido) y deja `revision/hoja-*.png`. **Mira cada cuadro**:
   subtítulos legibles sobre páginas claras, nada tapando los ojos, ninguna captura en blanco, ningún hueco magenta.
   Para verlo entero con sonido: `terminar.py . --borrador` (`out/borrador.mp4`, a la mitad de tamaño).
7. **Terminar:** `FINAL=1 python -I -B -X utf8 build.py` (no escribe si queda algún hueco) y
   `python -I -B -X utf8 <skill>/scripts/terminar.py .`: render, sonido a −14 LUFS / −1 dBTP, `out/final.mp4` y su
   comprobación.
8. **Verificar:** `python -I -B -X utf8 <skill>/scripts/transcribir.py . --comparar out/final.mp4`: una palabra que la
   cama o un golpe taparon sale aquí. Después entrégalo para revisar. No publiques nada.
9. **En vertical, la portada:** la de [`<base>/PORTADA.md`](../video-base/PORTADA.md), en `portada.png`, con la
   palabra roja y la cara cruda del video. `terminar.py` la vuelve a poner de primer fotograma en cada render final.

La primera vez en una computadora, `python -I -B -X utf8 <skill>/scripts/prueba.py` hace 7 s con los dispositivos de
verdad, sin grabación, y deja `out/prueba.mp4` y su hoja: si sale, todo lo que hace falta está.

## Archivos

- `SKILL.md` (este) · `reference/` (las medidas y las especificaciones, en inglés)
- `components/ev1_devices.py`, `components/ev1_more.py`: la biblioteca de dispositivos
- `plantilla/`: el proyecto de cada video (`src/Edicion.tsx` dibuja `src/edicion.json`; `build.py`, `PLAN.md`)
- `scripts/`: `formato.py`, `nuevo.py`, `transcribir.py`, `snap-onsets.py`, `capture.mjs`, `find-footage.py`, `clipsheet.py`,
  `ev1_treat.py`, `ev1_clip.py`, `matte.py`, `bed-mix.py`, `sonido.py`, `cuadros.mjs`, `terminar.py`, `prueba.py`,
  `synth-sfx.py`
- `assets/`: `tokens.css` y `fonts/` (Inter, Playfair Display, Bodoni Moda, Arimo, JetBrains Mono; todas SIL OFL, con
  su licencia al lado)
- `sfx/`: los sonidos sintetizados (`ev1kit/*`, `ev1/*`, `peaks.json`)
- `ejemplo/`: el armado de 45 s del autor (léelo para ver cómo se eligen las líneas; no se corre tal cual)
