# La entrada de Sloth, de principio a fin

Sloth es una app de escritorio (Electron + React + Vite) para producir vídeos de YouTube. Su logo es un perezoso
dibujado con una sola línea que forma una «S». La entrada se hizo el 2 de octubre de 2026 y se fusionó en
el Sloth de antes como el PR #223 (issue #222).

## Los archivos

| Archivo | Qué es | En el repo |
|---|---|---|
| `splash.css` | la animación entera; los `@keyframes` del morph y de la tinta, generados, al final | `src/renderer/splash.css` |
| `index-entrada.html` | el SVG de la escena (va en `<body>` antes de `#root`) | `src/renderer/index.html` |
| `splash.ts` | cuándo se va, saltarla, despedir el sonido | `src/renderer/splash.ts` |
| `splash-sound.ts` | el sintetizador y la partitura | `src/renderer/splash-sound.ts` |
| `entrada.spec.ts` | los e2e: se va sola y suena, un clic pasa y la salta, una tecla la salta | `tests/e2e/entrada.spec.ts` |
| `generar-escena.mjs` | el script que arma el SVG y los `@keyframes` a partir de los trazos | (taller, fuera del repo) |
| `sloth-sobre-oscuro.png` | el logo, 512 px, crema con fondo transparente | `src/renderer/marca/` |
| `sloth-portatil.png` | el perezoso tecleando en un portátil, 1254 px, líneas claras sobre negro (lo dio el usuario) | `src/renderer/marca/` |

**Integración:**
- `main.tsx` llama a `startSplash()`. En la ventana de lectura llama a `dismissSplash({ now: true })`, porque esa
  ventana no la lleva.
- `App.tsx` llama a `dismissSplash()` con un efecto cuando ya tiene estado o error.
- `src/main/index.ts` silencia las ventanas de los tests (`setAudioMuted(true)`).
- `docs/marca.md` añade `sloth-portatil.png` y `AGENTS.md` anota que los e2e van en silencio.

## La historia (≈2,8 s y la salida)

| s | Qué pasa | Qué suena |
|---|---|---|
| 0–0,8 | La cabeza y la cola se dibujan con su línea, con una punta de pincel que brilla y tinta ámbar que se enfría a crema. Brotan los parches, la nariz y las pupilas; el teclado brota y la tapa se abre con rebote | dos barridos de pincel con un tono que sube y un «tic» al levantar el pincel; una burbuja por pieza; la bisagra |
| 0,8–1,15 | La pantalla se enciende y le ilumina la cara; las pupilas miran a la pantalla; teclea tres veces y suben un play, un punto y una barra | «ding» de cristal, zumbido de la pantalla, tres teclas con su burbuja |
| 1,15–1,5 | Susto: la cabeza se encoge, salta y aterriza (estirar y encoger), las pupilas se encogen, sale el «!» con sus rayas, fogonazo y la cámara tiembla | coge aire, «¡boing!», acorde del «!», un golpe grave |
| 1,4–1,7 | Cierra el portátil de golpe (antes se abre un poco más), polvo, onda, la cámara tiembla otra vez; el brazo se aparta | el aire que baja, golpe grave con madera, el polvo |
| 1,6–2,2 | La cola se recoge, el portátil se va hacia abajo; la cabeza, los parches y la nariz cambian de forma hasta el logo; el logo se centra | barrido que baja, luego barrido que sube con un arpegio, y el acorde que se queda con su grave |
| 2,1–2,5 | Un brillo cruza el logo; aparece «Sloth» letra a letra con el espaciado cerrándose | arpegio agudo rapidísimo con aire |
| 2,35–2,75 | Ladea la cabeza, sube la mejilla, guiña y sale un destello ✦ | «bwip» de la mejilla y el «tin» del guiño |
| 2,78 → | Salida: el logo se acerca y se desenfoca; un iris con aro ámbar abre la app desde el centro | un soplo y fundido |

Con una tecla o un clic se salta (en cuanto la app esté lista), y el clic llega a la app. Con «reducir el movimiento»
salen el logo y el nombre quietos y sin sonido.

## Cómo se llegó: las rondas con el usuario

1. **«Primero la animación de arranque.»**
   - Se vectorizó el logo y se montó la **propuesta 1, «trazo»**: la «S» se dibuja de una línea, brotan los ojos, la
     nariz y las pupilas, parpadea despacio y sube «Sloth» (~1,8 s).
   - El usuario enseñó un vídeo de X con estilos hechos por IA, y se hizo la **propuesta 2, «morph/flat vector»**: cae
     una gota ámbar, salpica y el fondo se llena; la gota pasa a ser un play, el play una cabeza y la cabeza se estira
     hasta la «S» (~2,2 s).
   - Las dos se entregaron como mp4.
2. **«Me gustó más la primera, pero que pase de mi dibujo del perezoso con portátil al logo: que se sorprenda, cierre
   la compu, cambie al logo y te guiñe.»**
   - Se vectorizó su dibujo.
   - Su cabeza, sus parches y su nariz caen casi encima de los del logo, así que el cambio pudo ser **un morph de
     verdad**, no un fundido.
   - Primera escena completa en ~2,4 s.
3. **«Hazla todavía más detallada y perfecta; esfuérzate al máximo.»** Se añadió:
   - la tinta caliente con punta de pincel;
   - la luz de la pantalla y los iconos que suben al teclear;
   - anticipación, estirar y encoger, y la cámara que tiembla;
   - polvo y onda al cerrar el portátil, la cola que se recoge, el brillo, el guiño con destello y mejilla;
   - el nombre que se enfoca, el grano de papel, la salida en iris y saltarla con tecla o clic.
4. **«Falta sonido, ¿le haces uno a la medida?»**
   - Se escribió el sintetizador y la partitura en La mayor pentatónica, sobre el reloj de la animación.
   - Se grabó offline, se midió y se mezcló con el vídeo.
5. **«Está buenísimo.»** Se cerró el ticket (issue #222, PR #223).

## Los fallos que salieron y cómo se arreglaron

Todos salieron revisando fotogramas, vídeos y medidas, no a ojo en la app:

- **La captura de una ventana oculta se colgaba.** Se resolvió con ventana offscreen e `invalidate()` antes de
  capturar.
- **Faltaba Electron en el worktree.** `npm ci` no ejecutó los scripts de instalación; se arregló con
  `node node_modules/electron/install.js` (y el de `esbuild`).
- **El portátil y la cola salían desplazados.** El `transform-origin` de CSS también movía el atributo `transform` del
  SVG. Se arregló con `.splash-logo [transform] { transform-box: view-box; transform-origin: 0 0; }`.
- **Un puntito en los extremos de las líneas antes de dibujarse.** Era el remate redondo de un trazo vacío. Se arregló
  con `stroke-dasharray: 1 1.2`, `stroke-dashoffset: 1.1` y `stroke-linecap: butt`.
- **Una media luna gris en los primeros fotogramas.** `depurar.cjs` señaló el brillo, cuya posición de partida asomaba
  por el borde del logo. Se movió a `x="-320"` y `translateX(940px)`.
- **El guiño salía con el arco del ojo doble.** El parche, la pupila, el párpado y la línea del ojo cerrado pasaron a un
  grupo (`.splash-ojo-der`) que se anima entero.
- **La salida se veía como una mancha borrosa sobre la app clara.** El borde del iris se dejó nítido (`- 1px`), con un
  aro ámbar con resplandor, y el logo se va antes de que se abra.
- **El marcado pesaba 63 KB** porque la línea central se repetía seis veces. Se definió una vez y se reutiliza con
  `<use>`, y bajó a 42 KB.
- **El sonido rompía la carga de la app.** Componer con un tiempo de inicio negativo lanza `RangeError`. Se arregló con
  el suelo y el ajuste de cada sonido (`fit`), y un `try` que devuelve `null`. Lo encontró `oir-en-vivo.cjs`.
- **Sonaba flojo** (−26 LUFS). Se subió `VOLUME` de 0,55 a 1,1: −19,9 LUFS y pico de −3,5 dBFS.
- **El sonido no caía en su fotograma** porque el código llega 20–170 ms tarde. Se ancló a la `startTime` de las
  animaciones (`animationElapsed`).
- **Los 117 e2e iban a sonar.** Se silencian las ventanas de los tests, y el e2e comprueba igualmente que suena con
  `isCurrentlyAudible()`.
- **libx264 rechazó 1103×762.** Se hizo `crop` a dimensiones pares.
- **Reducir el movimiento no se aplicaba.** La emulación se activó tras cargar y luego se recargó la página.
- **Comandos con comillas o acentos graves rotos en el heredoc de bash.** Se escribieron los scripts y los parches con
  la herramienta Write, o con un parche de reemplazos exactos en Node.

## Rehacerlo con los scripts de hoy

En el taller (`$TEMP/<proyecto>-entrada`, con `npm i potrace pngjs svg-path-properties`):

```
node trazar-piezas.mjs sloth-sobre-oscuro.png logo.json --corte 441,250,449,348,2 \
  --pieza s=60,250 --pieza ojoIzq=120,220 --pieza ojoDer=400,215 --pieza nariz=255,250 \
  --pieza pupilaIzq=158,203 --pieza pupilaDer=353,203 --resto s --mascaras mascaras-logo
node trazar-piezas.mjs sloth-portatil.png portatil.json --canal luz --corte 945,548,936,665,2,cabeza \
  --pieza cabeza=200,500 --pieza ojoDer=760,420 --pieza ojoIzq=330,500 --pieza pupilaIzq=432,465 \
  --pieza pupilaDer=811,463 --pieza nariz=620,550 --pieza cola=120,900 --pieza brazo=300,840 --pieza manzana=930,875 \
  --zona pantalla=652,0,1254,1032@cola --zona teclado=412,955,656,1032@cola --resto brazo --mascaras mascaras-portatil
node centro.mjs mascaras-portatil/cabeza.png 936,662 24 > centro-cabeza.txt
node centro.mjs mascaras-portatil/cola.png 200,655 24 > centro-cola.txt
node morph.mjs portatil.json logo.json morph.json --matriz 0.5145,-64.3,-36.2 --css splash-a-logo \
  --par cabeza:s:260 --par ojoIzq:ojoIzq:110,44 --par ojoDer:ojoDer:120,44 --par nariz:nariz:72 > morph.css
```

Después, `generar-escena.mjs` (adaptando los nombres de entrada) arma el SVG. Lo que no es dato (el guion, las curvas,
los momentos) se escribe a mano en `splash.css`.

**Vídeos y sonido entregados**, en `C:\dev\_sloth-entrada` (fuera del repo):
- `propuesta-1-trazo.mp4`
- `propuesta-2-morph.mp4`
- `propuesta-3-portatil.mp4`
- `entrada-final.mp4` (60 fps)
- `entrada-con-sonido.mp4`
- `entrada-sonido.wav`
