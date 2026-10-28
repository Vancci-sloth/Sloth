# La portada

Todo vídeo vertical, de cualquier estilo, empieza con su portada: un solo fotograma (un trigésimo de segundo) que
TikTok, Reels y Shorts enseñan de portada y en la cuadrícula del perfil. Se hace al final, cuando el vídeo ya está
renderizado, y no se pregunta: va siempre. El vídeo horizontal no la lleva dentro: la suya es la miniatura de YouTube
([abajo](#en-horizontal-la-miniatura-de-youtube)).

## Cómo se ve

- **Del estilo del vídeo.** Sus colores, su letra, su personaje y su mundo: quien la ve en el perfil la reconoce como
  de la serie. Por eso Codex la hace mirando cuadros del propio vídeo (abajo), y lo que la skill del estilo diga de la
  suya (su personaje, su letra, su sello) gana sobre lo de aquí.
- **Se lee en miniatura.** En la cuadrícula del perfil mide unos 120 px de ancho: de 2 a 5 palabras enormes (la
  promesa o la pregunta del gancho, no la primera frase del guion), en español con sus acentos, con contraste fuerte
  (contorno o sombra). Un solo protagonista grande: la cara, el objeto o la escena que cuenta el vídeo. Nada de letra
  chica, logos sueltos ni marcos.
- **Dentro de lo que se ve.** En 1080×1920, el texto y el protagonista van entre los 300 y los 1350 px de alto y los
  120 y los 860 de ancho: arriba y abajo la cuadrícula recorta a 3:4, abajo tapan el texto y la música, y a la derecha
  los botones. Fuera de esa caja, solo fondo.

## Hacerla

En la raíz del proyecto, `portada.png` (si el proyecto entrega varios vídeos, uno por vídeo en
`portada/<nombre del vídeo>.png`).

Primero, `codex login status`: sale con 0 si hay una cuenta de ChatGPT conectada. **Sin ella** (sale con otro código,
o `codex` no está), la imagen no se genera: la portada es un cuadro del propio vídeo con el título encima, y se le dice
al usuario una vez, en llano, que con su cuenta de ChatGPT conectada (Opciones → Agentes) la portada sale mejor:

    node <base>/scripts/portada_sin_ia.mjs out/<video>.mp4 portada.png --titulo "<EL TÍTULO>" --t <s> [--fuente <la letra del estilo>] [--color <el de su título>]

`--t`, el segundo de su mejor momento: el protagonista grande y a la vista, sin texto del vídeo encima del centro.
Mírala (paso 4) y sigue en el paso 5. **Con ella:**

1. Tres cuadros del vídeo terminado de referencia, de su mejor momento:
   `ffmpeg -nostdin -v error -ss <s> -i out/<video>.mp4 -frames:v 1 -vf scale=540:-2 portada/ref-1.jpg` (y 2 y 3).
   Si la haces mientras renderiza, aún no hay vídeo: sácalos de los cuadros de la revisión (en El Diff,
   `revision/bNN_95.jpg`) con el mismo comando.
2. El pedido, en inglés, a `portada/pedido.txt`:

   ```
   Use your built-in image_gen tool (do not draw with code). Generate one image with image_gen, then copy the PNG from $CODEX_HOME/generated_images/... into this working directory as portada.png. Reply only with the file name.

   portada.png: a vertical 2:3 (1024x1536) cover image for a short video on TikTok and Instagram Reels. It must look like it belongs to the same video as the attached frames: same art style, colors, typography, characters and world. <LO QUE PIDE EL ESTILO, de su skill> <QUÉ SE VE: el protagonista y la escena, en una frase>. Big bold title text in Spanish, exactly: "<EL TÍTULO>" (keep every accent), huge, high contrast with a thick outline or shadow, readable at thumbnail size. Keep the title and the main subject inside the central area: between 20% and 66% of the height and between 20% and 75% of the width. The title in two or three lines, no wider than 55% of the image. The main subject complete (never cut by a straight edge), not too big: its bottom ends above 66% of the height. The edges are background only, no text near them. No other text, no logos, no watermarks, no borders, no UI.
   ```

3. `codex exec --skip-git-repo-check -s workspace-write -C portada -i portada/ref-1.jpg -i portada/ref-2.jpg -i portada/ref-3.jpg - < portada/pedido.txt`
   (tarda 30–85 s; varias se piden a la vez). Si no copió el archivo, no la pidas otra vez: en Windows el sandbox de
   Codex suele fallar al copiar («setup refresh had errors»), pero la imagen ya está en
   `~/.codex/generated_images/<id>/` (la más nueva): cópiala de ahí (25 de octubre). Muévela a `portada.png`.
4. **Mírala** entera y en chico (`-vf scale=120:-2`): que el título diga exactamente lo pedido, con sus acentos, que
   se lea en chico y que nada importante quede en los bordes. Si falla, pídela otra vez diciendo qué corregir: lo que
   más falla es el título o el protagonista demasiado grandes (se salen por arriba o bajan a la zona del texto).
5. `node <base>/scripts/portada.mjs out/<video>.mp4 portada.png`. La pone como primer fotograma, en el mismo archivo;
   correrlo otra vez cambia la portada, no suma otra. El `final.py` de cada estilo la vuelve a poner sola si
   `portada.png` ya existe, así que un render nuevo no la pierde. Codifica solo ese fotograma, con los mismos ajustes
   de x264 que el vídeo, y lo pega delante sin recodificar el resto (un segundo, sin segunda compresión); si el vídeo no
   lo deja, lo recodifica entero, como antes, y lo dice. El Diff no usa `portada.mjs`: su `final.py` la renderiza como
   un tramo más.

## En horizontal: la miniatura de YouTube

YouTube no enseña el primer fotograma: enseña la miniatura que se sube aparte. Así que en un vídeo horizontal
`portada.png` es esa miniatura, de 1280×720, y **no entra en el vídeo**: no se corre `portada.mjs` y el `final.py` del
estilo no la pega. Sloth la ofrece al programar el vídeo en YouTube. Se hace como la de arriba, con estos cambios:

- **Cómo se ve.** Del estilo del vídeo y legible en chico, igual que la vertical: en las listas de YouTube mide unos
  170 px de ancho. El título a un lado (de 2 a 5 palabras, no más de 45 % del ancho) y el protagonista al otro. Nada
  en el 5 % de cada borde ni en la esquina de abajo a la derecha, donde YouTube pone la duración.
- **Sin cuenta de ChatGPT:** `portada_sin_ia.mjs` con `--horizontal`.
- **Con ella:** los cuadros de referencia, a `scale=960:-2`. En el pedido, la segunda línea cambia por esta (lo demás,
  igual):

  ```
  portada.png: a horizontal 3:2 (1536x1024) thumbnail for a YouTube video. It must look like it belongs to the same video as the attached frames: same art style, colors, typography, characters and world. <LO QUE PIDE EL ESTILO> <QUÉ SE VE>. Big bold title text in Spanish, exactly: "<EL TÍTULO>" (keep every accent), huge, high contrast with a thick outline or shadow, readable at thumbnail size. The title on one side, in two or three lines, no wider than 45% of the image; the main subject on the other side, complete (never cut by a straight edge). Keep the title and the main subject between 15% and 85% of the height (the top and bottom get cropped to 16:9) and away from the bottom-right corner (YouTube covers it with the video length). The edges are background only. No other text, no logos, no watermarks, no borders, no UI.
  ```

  Y se recorta a 16:9: `ffmpeg -nostdin -v error -i <la generada>.png -vf "scale=1280:-2,crop=1280:720" portada.png`.
- **Mírala** entera y en chico (`-vf scale=240:-2`), como en el paso 4.
