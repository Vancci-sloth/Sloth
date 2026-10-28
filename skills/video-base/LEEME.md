# video-base

Lo que comparten los estilos de vídeo: el lote, los errores ya vistos y los scripts. No es una skill (no tiene
`SKILL.md` ni card): la leen y la usan las skills de cada estilo, que se quedan solo con lo suyo.

- **La usan:** `reel-collage` y `video-explicativo` (sus scripts, `LOTE.md` y este archivo; `video-explicativo`, también
  las huellas), `video-documental` (`sloth.py`, `chrome.mjs`, la hoja, masterizar y comprobar), los estilos que hace
  cada quien con `crear-estilo` y los procesos de Python de Sloth (`sloth.py`).
- **`video-el-diff`** es un estilo propio que el usuario afina a mano: ni lo toques desde aquí ni le muevas nada. Solo
  toma prestados `chrome.mjs`, `recorte.py` y la portada (`PORTADA.md`, `portada.mjs`), así que un cambio en ellos
  también le llega.

| Archivo | Qué es |
|---|---|
| [LOTE.md](LOTE.md) | Lo que cambia cuando el vídeo es uno de un lote; solo se lee si el mensaje trae `Lote:` |
| [PORTADA.md](PORTADA.md) | La portada que todo vídeo vertical lleva de primer fotograma, en el estilo de su vídeo |
| `scripts/` | Las herramientas (abajo) |

`<base>` es esta carpeta, `video-base`, junto a las skills de cada estilo.

## Errores ya vistos

Una regla por línea, con su porqué. Las de un solo estilo van en su skill; las que piden un cambio en un script, mejor
en el script.

### Windows, Python y FFmpeg

- El Python de Sloth se lanza siempre con `-E -s -B -X utf8` (`scripts/sloth.py` ya lo hace). Sin `-B` reescribe sus
  `.pyc`, Sloth cree que el entorno se dañó y vuelve a bajar 4 GB. yt-dlp va como módulo (`-m yt_dlp`): el `.exe` no
  arranca.
- Los parches de varias líneas van en un `.py` o con la herramienta de edición, no en un heredoc de bash. Y al escribir
  un archivo desde Python en Windows, `newline="\n"`: si no, lo pasa a CRLF y el diff sale entero.
- FFmpeg dentro de un ciclo de la shell, con `-nostdin` (se come la entrada del ciclo).
- En `drawtext`, la ruta de la fuente en Windows se escapa: `C\:/Windows/Fonts/arial.ttf`.
- H.264 en `yuv420p` pide ancho y alto pares.
- Remotion saca `yuvj420p` (rango completo) aunque se le pida `--pixel-format=yuv420p`; hay reproductores que lo ven
  lavado. Hace falta además `--color-space=bt709`. `comprobar.mjs` lo marca.
- `loudnorm` solo no limita el true peak: un episodio salió a +0,7 dBTP. `masterizar.mjs` limita con sobremuestreo.

### El disco

- Un render deja gigas: un `bundle()` de Remotion copia `public/` entero a %TEMP% y no lo borra. Empaqueta con
  `remotion.cjs` (`empaquetar`), renderiza después de `comprobar_disco` (`espacio.py`) y no metas en `public/` lo que el
  video no usa (la grabación original va en `fuentes/`). Un video nuevo enlaza su `node_modules` (`enlazar_modulos`):
  nunca lo copies de otro, y no corras `npm install` dentro de un video, cambiaría el de todos. Si a un estilo le falta un
  paquete, va en el `package.json` y el `package-lock.json` de su plantilla.

### Chrome y la captura

- Nunca una ruta fija a Chrome con su versión: se rompe con la siguiente actualización. `chrome.mjs` lo busca solo, y
  `CHROME` lo fuerza.
- Espera a `document.fonts.ready` antes del primer fotograma, o el primero sale con la fuente de reserva.
- El agente de Chrome headless (`HeadlessChrome`) está bloqueado en x.com; Edge headless no baja de ~500 px de ancho.

### Revisar

- Hojas de contacto, no cuadros sueltos: un revisor que abrió 90 imágenes sueltas gastó la mitad de su costo en eso.
- Revisa cada momento cuando ya terminó de entrar (al 85–95 % de su tramo), no al 70 %: lo que aún se está dibujando
  parece un error y no lo es.
- El audio no lo oyes. Compruébalo por cifras (`masterizar.mjs`, `comprobar.mjs`) y, si hay voz,
  transcribiéndolo (`sloth.transcribir`). Dile al usuario qué no pudiste comprobar.

## Un estilo nuevo

Su skill dice lo suyo y usa de aquí lo que ya existe: si te ves copiando un párrafo o un script de otro estilo, va
aquí. Nace con su card en `cards.json` de Sloth, con sus `etapas`, cada una con su `fase` (`idea`, `guion`, `sonido`,
`video` o `entrega`: Idea · Guion · Sonido y voz · Video · Entrega, ver `FASES` en `shared/types.ts` de Sloth). `listo`
es el glob que la da por hecha y, si no dice otra cosa en `muestra`, lo que el panel enseña de ella. El video terminado
es el de la etapa «Video». Si es vertical, lleva su portada ([PORTADA.md](PORTADA.md)): su skill dice cómo se ve la
suya, su `final.py` la vuelve a poner si ya existe, y su card tiene la etapa «Portada» (fase `entrega`).

## Los scripts

Todos dicen cómo se usan si los corres sin argumentos. Node sin dependencias y FFmpeg en el PATH.

| Script | Qué hace |
|---|---|
| `masterizar.mjs crudo.wav audio.wav` | −14 LUFS y true peak ≤ −1 dBTP, 48 kHz 24 bits; falla si no lo clava |
| `comprobar.mjs video.mp4 --duracion 10 --fps 30 --tamano 1080x1920` | Códec, tamaño, fps, fotogramas, audio, sonoridad, pico, faststart, negros, arranque vacío |
| `hoja.mjs video.mp4 hoja.png [--n 16 \| --cada 0.25 \| --t …] [--zonas] [--recomprimir 3M]` | Hoja de contacto con tiempos; zonas seguras; prueba de recompresión |
| `hoja.mjs carpeta hoja.png` | Hoja de una carpeta de imágenes |
| `portada.mjs video.mp4 portada.png` | Pone la portada como primer fotograma, en un segundo y sin recodificar el vídeo (si no puede, recodifica); otra vez, la cambia |
| `portada_sin_ia.mjs video.mp4 portada.png --titulo "…"` | La portada sin cuenta de ChatGPT: un cuadro del vídeo y el título encima, en la zona que se ve |
| `chrome.mjs` (librería) | Busca Chrome o Edge (o el de `CHROME`) y lo abre sin ventana: `abrirChrome({ ancho, alto })` |
| `sloth.py`, `fuente.py` | El Python de Sloth (el transcriptor, yt-dlp) y bajar y transcribir un vídeo. `proceso()` dice antes cuánto tardará la voz en este equipo y luego cuánto falta, cada 10 %. WhisperX va de uno en uno en toda la máquina (`turno_gpu`), y las descargas de YouTube también (`turno_youtube`): los vídeos de un lote esperan ahí su turno. `vectorizar` usa el modelo de vectores ya cargado (`vectores_vivo.py`, que se va tras 10 min sin uso): un texto nuevo tarda menos de un segundo en vez de ~18. Un video de YouTube que otro vídeo ya bajó se enlaza de su carpeta en vez de bajarlo |
| `huellas.py buscar\|revisar\|parecidos\|cerrar <skill>` | Que ningún vídeo de un estilo salga igual a otro ya hecho: la huella de cada uno (lo que cuenta y cómo se ve, y su hoja de ocho cuadros) en `<skill>/huellas/`, comparada contra todas por el script, que solo dice lo que choca. Python del sistema con numpy y Pillow; los textos, con los vectores de Sloth |
| `espacio.py` (librería) | El disco: `enlazar_modulos` (un solo `node_modules` por plantilla, en %LOCALAPPDATA%/sloth-modulos, enlazado desde cada video: antes cada uno copiaba ~1 GB), `limpiar_temporales` (las `remotion-*` de %TEMP% que dejan los renders cortados) y `comprobar_disco` (para antes de renderizar sin espacio). Sloth hace lo mismo en Opciones → Espacio en disco |
| `equipo.cjs` (librería) | El render según este equipo: `tarjeta3D()` (avisa si Chrome dibuja el 3D por software), `estimado(cuadros)` y `falta(parte, desde)` para decir cuánto tardará, y `anotarRender()` del final, que Sloth enseña en Opciones → Tu equipo |
| `remotion.cjs` (librería) | `empaquetar(raiz)`: el `bundle()` de Remotion en una carpeta de %TEMP% que se borra al terminar (la de Remotion se quedaba, con una copia de `public/`). Todo script que empaquete usa este |
| `recorte.py foto.jpg salida.png [--borde]` | Quita el fondo con rembg (o respeta el alfa que traiga) y corta al contenido; con `--borde`, un borde blanco de tijera. También una carpeta entera |

## Cambiar la base

Un cambio aquí cambia todos los estilos que la usan. Pruébalo antes en un video de prueba de cada estilo que la usa.
