# Las escenas, por dentro

Lo que el director (`scripts/director.py`) escribe en `guion.json` a partir de `momentos.json`, y lo que dibuja la
plantilla (`plantilla/src/escenas/`, registradas en `ESCENAS` de `src/Video.tsx`). Un episodio normal no necesita
leer esto: se pide todo desde `momentos.json` ([`SKILL.md`](SKILL.md#momentosjson)). Sirve para dos cosas: pedir con
`"v": {…}` en un momento una escena que el director no arma solo (tarjetas, un duelo), y cambiar cómo se ve algo.

`guion.json` es una lista de párrafos; cada párrafo, una lista de beats `{id, say, v}`: `say` es el tramo de la voz
(de ahí salen los tiempos, con `voz/adaptar.py`) y `v` lo que se ve en ese tramo. Todas las coordenadas son
rectángulos `[x, y, ancho, alto]` en **píxeles de la imagen original** (un clip mide 1920x1080). Cualquier momento
dentro de un beat es `"en": "palabra"` (cuando la voz dice la primera palabra del beat que empieza así, sin tildes ni
mayúsculas) o `"t": 0.3` (fracción del beat). El video lleva solo la voz y la música: sin efectos de sonido, porque al
usuario le estorban.

## `captura`: el material original

`{"tipo": "captura", "img": "web/x.png", "w", "h", …}` para una imagen de `public/` y
`{"tipo": "captura", "clip": "videos/x.mp4", "desde": <segundo>, "completo": true}` para un video.

| Clave | Qué hace |
|---|---|
| `vista` | El rectángulo que se ve al empezar. En horizontal también fija la forma del marco; en vertical pasa por el encuadre de la zona |
| `camara: [{"r", "en" o "t", "dura"}]` | Mueve la cámara a `r` en ese momento (`dura` en fotogramas, 14) |
| `empuje` | Lo que se acerca sola en 12 s (0.05; 0 la deja quieta). Sigue de un beat al que lo continúa |
| `marcas: [{"r", "tipo", "en" o "t"}]` | Sobre la imagen, siguen a la cámara: `marcador` (resaltador; con `es`, la traducción en su lugar), sin tipo (caja roja), `ovalo`, `flecha`, `mano` |
| `fuente` | La etiqueta de la fuente bajo la captura |
| `claro` | Página de fondo blanco (el resaltador cambia de mezcla) |
| `video: {"src", "r", "desde"}` | Un video encima de la imagen, en `r`: el video de un tuit sobre su captura |
| `foco: {"r", "en", "dura", "forma"}` | Congela el video `dura` segundos, oscurece todo menos `r` y le dibuja un contorno rojo |
| `extra: {"img", "w", "h", "en", "recorte"}` | Una segunda captura que entra por abajo a la derecha |
| `sigue: true` | El beat continúa la toma del anterior sobre la misma captura: hereda el marco, la fuente, la cámara donde quedó y las marcas (con `limpia: true`, no las hereda) |
| `encuadre` | Solo vertical: `"ajusta"` (cabe a lo ancho) o `"cubre"` (llena la zona) |
| `importante` | Solo vertical: un rectángulo que el encuadre no puede dejar fuera |
| `etiqueta`, `sello`, `teclas`, `texto`, `velocidad`, `rot` | Rótulo arriba a la izquierda, sello de goma `{texto, en, tam, color}`, teclas que se presionan, texto de meme abajo, velocidad del clip, giro del marco (horizontal) |

El texto de una captura se ubica solo con `ubicar.py` (en la raíz del episodio): una captura de `pagina.mjs` trae
dentro el texto de la página, y un cuadro de video se lee con el OCR. `python ubicar.py web/x.png` imprime todo su
texto, renglón por renglón con su caja. Lo usa el director para encuadrar (`zona`), resaltar y traducir
(`marca_texto`) y enmarcar (`caja_texto`).

**La traducción.** El público habla español: lo resaltado en inglés lleva su traducción. Si es la oración entera y
del largo del inglés (80 a 125 %), va **en su lugar**, con la letra, el tamaño y el color del original. Si la cita es
un pedazo de su oración o el español no llena sus renglones, el inglés se queda resaltado y el español va en una nota
abajo (`rotulo` con `estilo: "traduccion"`): una traducción a medias se lee como un error.

## Las demás

- `{"tipo": "titular", "texto", "color", "emoji", "emoji2", "sello", "img"}`: un rótulo enorme. El tamaño se ajusta al
  texto; `\n` parte renglones. Colores: `fuego`, `sol`, `rojo`, `verde`, `azul`, `crema`. `img`, el recorte de una
  persona debajo.
- `{"tipo": "tarjetas", "titulo", "items": [{"img", "w", "h", "recorte", "texto", "en"}], "ya": n}`: de dos a cuatro
  tarjetas que entran una por una. Un item también puede ser `{"clip", "desde"}` o `{"video", "desde"}`. `ya` es
  cuántas estaban visibles: así se arma «En el video de hoy…» sumando una tarjeta por momento.
- `{"tipo": "duelo", "izq": {…}, "der": {…}, "marcar": […], "sello": {…}}`: dos contendientes con `img`, `nombre`,
  `color` y `filas` `{etiqueta, valor, color}`, y un sello de conclusión. Para comparar precios o velocidades reales.
- `{"tipo": "meme", "img", "etiquetas": [{"texto", "x", "y", "rot", "rojo", "tarde"}]}`: una imagen con etiquetas en
  fracciones de la imagen.
- `{"tipo": "diagrama", "titulo", "nodos", "flechas", "cambios"}`: el mecanismo que se arma con la voz
  (`escenas/Diagrama.tsx`): una columna de hasta cuatro nodos, o dos en zigzag, en vertical; en fila, en horizontal.
- `{"tipo": "logo", "fecha"}`, `{"tipo": "logo", "final": true}` y `{"tipo": "logo", "invitacion": true}`: la tarjeta
  de la fecha, la despedida y la invitación. Las pone el director; el logo, su lema y los rótulos salen de
  `src/marca.json`.
- En cualquier `v`: `seccion: true` (la interferencia al empezar una sección) y `entra` (`flash`, `barrido`, `glitch`,
  o `papel`: la escena cae girada sobre la anterior, que se queda debajo 9 cuadros). En una captura, `recorre: true`:
  la toma empieza arriba de la página y baja a la cita. En un `rotulo`, `corre: <desde>`: su cifra cuenta hasta su número.

## `encima`: lo que se pega sobre cualquier escena

`encima: [...]`, cada cosa en su palabra (`en`) o fracción (`t`), hasta el final del beat o la palabra de `hasta`. `x`
e `y` son el centro en fracciones de la escena. El componente es `src/escenas/Encima.tsx`.

| Tipo | Claves |
|---|---|
| `rotulo` | `texto`, `estilo`: `crema` (nombra), `rojo` (golpea), `banda` (letras oscuras sobre una banda; `color` `roja`, `verde`, `amarilla`, `naranja`), `placa` (el nombre de una persona), `sello` (el veredicto, girado, de golpe), `traduccion` (la nota de una cita). `tam`, `giro`, `x`, `y`, `hasta`, `minusculas`, `tacha` (el texto que sale primero y se tacha) |
| `logo` | `img` (de `public/logos/`): la pegatina, con `x`, `y`, `giro`, `tam`; `quieto: true` si ya estaba en la toma |
| `pegado` | Un PNG con transparencia de `public/recortes/`. `entra`: `sube`, `golpe`, `izquierda`, `derecha`. `alto` en fracción de la escena, `x`, `espejo`, `giro` |
| `senal` | El 👉 que entra desde su lado y empuja hacia `(x, y)`. `dir`: `derecha`, `izquierda`, `abajo` |

El director acomoda todo esto: el primer rótulo abajo y el segundo arriba; el recorte, chico y en una esquina si hay
cita; las pegatinas, arriba. Y lo que aun así tapa lo citado (lo mide `reglas.mjs`) lo pasa al otro lado.

## El lienzo vertical

1080x1920. De arriba abajo (`VERTICAL` en `src/subtitulos.tsx`):

| Zona | px | Qué va |
|---|---|---|
| Arriba | 0-120 | Solo el fondo: ahí van las pestañas de la app |
| Gancho | 124-338 | El `sello` de la marca y el `gancho`, dos renglones |
| Escena | 344-1500 | La escena, en una zona de 1080x1156 (`ZONA` en `Video.tsx`) |
| Subtítulos | 1500-1670 | La voz palabra por palabra, debajo de la escena para no tapar lo citado |
| Abajo | 1670-1920 | Solo el fondo: ahí van la descripción y los botones de la app |

- **`captura` con `img`** (`CapturaVertical` en `Reales.tsx`): sin marco, a lo ancho de la zona. Cada rectángulo de
  cámara pasa por `encuadre()` de `src/encuadre.ts`: la toma se ajusta al ancho; si lo citado se vería con renglones
  de menos de `LEGIBLE` = 40 px, la cámara se acerca; los renglones de la columna de lo citado se ven completos
  (`src/lineas.json`, que escribe el director) y las orillas donde la imagen sigue se desvanecen.
- **Un clip**: llena la zona (recorte tipo cover) centrado en su foco o su toma; con `encuadre: "ajusta"`, entero a lo
  ancho (1080x608).
- **`titular`**: prueba todos los repartos de sus palabras en renglones y usa el que deja la letra más grande.
- **Respaldo**: un tipo que no esté en `VERTICALES` de `Video.tsx` se dibuja en 1920x1080, escalado al ancho de la zona.

Una captura se saca ya para el celular (`capturar.mjs`: 400 px de ancho a escala 3; un post de X, a 380): llena la zona
con renglones de 40 px o más. La que sale en tira (pocos renglones) se rehace sola con lo de alrededor.

## El lienzo horizontal

1920x1080: cada escena llena la pantalla, sin `gancho`, sin subtítulos y sin portada dentro del video. Una captura va
en su marco con la forma de su `vista`, con la fuente debajo.

## Dónde cambiar el diseño

El lienzo vertical, en `VERTICAL` de `subtitulos.tsx` y en sus componentes `Gancho` y `Subtitulos`. El encuadre de las
capturas, en las constantes de `encuadre.ts` (`LEGIBLE`, `MIN_RENGLON`, `KMAX`, `PAD`). Dónde cae cada cosa de encima,
en `encima()` de `scripts/director.py`. Para la sincronía de los subtítulos:
`python <skill>/scripts/sincronia.py out/el-diff-final.mp4 <seg> 2 revision/sinc.png 2`.

Emojis 3D en `public/emoji` (Fluent de Microsoft): la mano del 👉 y los de `titular`. Para agregar uno:
`https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/<Nombre>/3D/<nombre>_3d.png`.
