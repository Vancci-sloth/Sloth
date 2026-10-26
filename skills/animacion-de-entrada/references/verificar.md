# Revisar fotograma a fotograma y en vídeo

Una animación no se revisa abriendo la app y mirando: dura 3 s, va demasiado rápido y no se repite igual. Se revisa
**parando el tiempo**: cada animación CSS de la página puesta en el mismo instante, capturada y comparada. Todo con
Electron offscreen y FFmpeg.

Lanza siempre así (en Git Bash):

```
unset ELECTRON_RUN_AS_NODE
E="<proyecto>/node_modules/electron/dist/electron.exe"
"$E" scripts/fotogramas.cjs …
```

- Ventana offscreen (`webPreferences: { offscreen: true }`) e `invalidate()` antes de `capturePage()`: una ventana oculta
  normal se queda colgada al capturar.
- Usa un `timeout 60` delante de cada comando: si algo se cuelga, no bloquea la sesión.

## La página de prueba

Una página HTML suelta con el CSS de la entrada (por su ruta del repo, `file:///…/src/renderer/splash.css`) y el
marcado. Debajo pon una imitación de la primera pantalla de la app, para juzgar cómo se abre la salida:

```html
<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file:///C:/.../src/renderer/splash.css"></head>
<body style="margin:0;background:#f6f6f6;font:16px Segoe UI,sans-serif">
  <div style="max-width:720px;margin:0 auto;padding:2rem 1.5rem"><h1>Tus Canales</h1><p>La app debajo</p></div>
  <div class="splash" aria-hidden="true"> …el mismo marcado que en index.html… </div>
</body></html>
```

Genérala con el mismo script que mete el SVG en `index.html`, para que no se desincronicen.

## Fotogramas en un instante

```
"$E" fotogramas.cjs prueba.html f/f 300,600,950,1250,1450,1700,1950,2250,2500,2900,3100 \
  --ancho 760 --alto 560 --salida 2780 --anim-salida splash-iris,splash-se-acerca,splash-aro
```

- **Cómo para el tiempo:** pausa todas las animaciones (`document.getAnimations()`) y les pone `currentTime`.
- **La salida:** desde `--salida`, pone la clase de salida y avanza solo las animaciones de salida. Las demás se quedan
  en su último fotograma: así se ve la salida sobre el logo terminado.
- **Antes de capturar** espera a `document.fonts.ready`, y hace una captura de calentamiento que tira: la primera puede
  salir sin pintar.

## Hoja de contactos

```
"$E" hoja.cjs hoja.png f/f 300,600,950,1250,1450,1700,1950,2250 4 400
"$E" hoja.cjs detalle.png f/f 2340,2470,2560,2650 4 400 180,140,400,295   # ampliado: x,y,ancho,alto del fotograma
```

Míralas con Read.
- **Primero la línea de tiempo entera:** ¿se cuenta la historia?
- **Después los momentos delicados ampliados:** el arranque del trazo, el susto, el morph, el guiño, la salida.

Para mirar un fotograma suelto a lo grande, amplíalo con FFmpeg:

```
ffmpeg -y -loglevel error -i f/f-0.png -vf "crop=300:240:300:200,scale=600:-1" zoom.png
```

## El vídeo a 60 fps

```
T=$(node -e "console.log(Array.from({length:222},(_, i)=>Math.round(i*1000/60)).join(','))")   # 0–3,7 s
"$E" fotogramas.cjs prueba.html v/f "$T" --ancho 1100 --alto 760 --salida 2780 --anim-salida splash-iris,splash-se-acerca,splash-aro
cd v && i=0; for t in $(ls f-*.png | sed 's/f-\(.*\)\.png/\1/' | sort -n); do mv "f-$t.png" "$(printf 'g%03d.png' $i)"; i=$((i+1)); done
ffmpeg -y -loglevel error -framerate 60 -i g%03d.png \
  -vf "crop=1100:760:0:0,tpad=stop_mode=clone:stop_duration=0.8:start_mode=clone:start_duration=0.3" \
  -c:v libx264 -pix_fmt yuv420p -crf 16 "C:/dev/_<proyecto>-entrada/entrada-final.mp4"
```

- **Renumera los fotogramas** a `g000…`: los nombres por ms no son correlativos.
- **`crop` a dimensiones pares:** la captura puede salir 1103×762, y libx264 exige pares.
- **`tpad`:** 0,3 s quietos al principio y 0,8 al final, para que se vea entero en un reproductor.
- **Para propuestas rápidas basta con 30 fps** (`seq -s, 0 33 3000`, `-framerate 30`).

**Revisar el vídeo entero de un vistazo**, con la hoja de `video-base` (la de todos los estilos de vídeo, con el tiempo
de cada cuadro encima):

```
node ~/.claude/skills/video-base/scripts/hoja.mjs entrada-final.mp4 hoja-video.png --cada 0.1 --recorte 270,110,560,440 --ancho 200 --columnas 8
```

Así salió en Sloth una media luna gris en los primeros fotogramas que no se veía a simple vista.

## Encontrar qué pinta una mancha

```
"$E" depurar.cjs prueba.html 0 420,250,80,140 .splash-s .splash-tinta-g-cabeza .splash-mesa .splash-reflejo .splash-cara
```

Para cada selector, lo oculta (`visibility: hidden`), pone el instante y mide el brillo máximo de la zona
(`x,y,ancho,alto` en px de la ventana). El que hace bajar el brillo es el culpable. En Sloth, el brillo de partida
(`.splash-reflejo`) bajaba de 214 a 77: su posición inicial asomaba por el borde del logo.

## Movimiento reducido

```
"$E" movimiento-reducido.cjs prueba.html reducido.png
```

Emula `prefers-reduced-motion: reduce` por el protocolo de DevTools. Hay que activarlo **después** de cargar y luego
recargar: antes del `loadFile` no se aplica. Debe salir el logo final quieto con su nombre.

## Vídeo con sonido

Graba el WAV (`sonido.md`) y mézclalo. El retraso de 300 ms es el mismo `tpad` del principio del vídeo:

```
ffmpeg -y -loglevel error -i entrada-final.mp4 -i entrada.wav -filter_complex "[1:a]adelay=300|300,apad[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "C:/dev/_<proyecto>-entrada/entrada-con-sonido.mp4"
ffprobe -v error -show_entries stream=codec_type,duration -of csv=p=0 entrada-con-sonido.mp4   # vídeo y audio, misma duración
```

Entrega también el WAV suelto, para que el usuario lo oiga aparte.

## Referencias en vídeo

Si el usuario enseña un vídeo de referencia, como un tuit con «el estilo morph/flat vector»:
- **Un tuit de X:** la API de fxtwitter da los metadatos y el mp4: `curl -s "https://api.fxtwitter.com/status/<id>"`.
  Busca `video.twimg.com` y descárgalo con `curl -sL -o x.mp4 "<url>"`. Para otros sitios, `yt-dlp`.
- **Una hoja de todo el vídeo:**

  ```
  node ~/.claude/skills/video-base/scripts/hoja.mjs x.mp4 xf/todo.png --cada 2 --ancho 320 --columnas 6
  ```

  Busca la sección que dijo (en Sloth, «06 形变动画», el morph).
- **Esa sección de cerca:**

  ```
  node ~/.claude/skills/video-base/scripts/hoja.mjs x.mp4 xf/morph.png --cada 0.4 --desde 58 --hasta 70 --recorte 520,150,1000,600 --ancho 320 --columnas 6
  ```

## En la app de verdad

- **Los e2e capturan la ventana real:** `window.screenshot({ path: test.info().outputPath('dibujandose.png') })` mientras
  dura, y otra después. Confirman que la entrada sale en la app empaquetada por Vite y no solo en la página de prueba.
- **Cuándo llega el código** (para el sonido), con un spec temporal que lee
  `performance.getEntriesByType('navigation')[0].domInteractive`. Bórralo después.
