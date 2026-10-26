---
name: animacion-de-entrada
description: Crea la animación de entrada (arranque, splash) de una app web o Electron a partir de su logo y otros dibujos de la marca. Los vectoriza pieza a pieza, los dibuja con su línea, los transforma uno en otro y los anima en CSS desde el primer fotograma. Les compone un sonido a medida con Web Audio y lo revisa todo fotograma a fotograma y en vídeo. Úsala cuando pidan una animación de entrada o de arranque, animar un logo, o ponerle sonido a una animación de interfaz.
---

# Animación de entrada

Así se hizo la entrada de Sloth (el Sloth de antes, PR #223). El perezoso con portátil se dibuja con su línea, teclea,
se asusta, cierra el portátil y se convierte en el logo, que guiña. Todo lleva un sonido sintetizado a la medida.

**El ejemplo completo está en [`ejemplo-sloth/`](ejemplo-sloth/LEEME.md).** Léelo antes de empezar: es la referencia de
calidad y tiene cada decisión con su porqué.

Cada paso acaba en una condición comprobable. No pases al siguiente hasta cumplirla. Lo que sale de cada paso se enseña
como **vídeo**, nunca como descripción: el usuario juzga lo que ve y oye.

## 0. Preparar el taller

- **Carpeta de trabajo:** `$TEMP/<proyecto>-entrada`. Nunca va en el repo ni en OneDrive. Copia ahí `scripts/` y ejecuta
  `npm i potrace pngjs svg-path-properties`. Los scripts `.mjs` resuelven esas dependencias desde la carpeta en la que
  los lanzas.
- **Electron:** el del proyecto (`node_modules/electron/dist/electron.exe`). Si falta `dist`, lanza
  `node node_modules/electron/install.js`.
  - Lanza siempre con `unset ELECTRON_RUN_AS_NODE`.
  - Usa ventanas offscreen: una ventana oculta normal se cuelga al capturar.
- **FFmpeg:** en el PATH, para los vídeos, las hojas de referencia y medir el sonido.
- **Entregables:** `C:\dev\_<proyecto>-entrada\`, fuera del repo. Ahí van los mp4 de cada propuesta, el final con sonido
  y el WAV.

**Hecho cuando** `node scripts/trazar-piezas.mjs <logo.png> x.json` lista las manchas del logo, y `fotogramas.cjs`
captura una página de prueba.

## 1. Entender la marca y la idea

- Lee la marca: el logo (PNG con fondo transparente, cuanto más grande mejor), la paleta y la tipografía. En Sloth
  estaban en `docs/marca.md`.
- Mira dónde se pinta lo primero. En Electron con Vite es el `index.html` del renderer.
- Si el usuario da referencias en vídeo, descárgalas y saca hojas de contacto con FFmpeg
  ([verificar.md](references/verificar.md#referencias-en-video)). Así encuentras el momento exacto que le gusta.
- Si da un dibujo nuevo, como el perezoso con portátil, guárdalo en la marca del repo y añádelo al documento de la
  marca.

**Hecho cuando** sabes:
- qué dibujos entran;
- con qué paleta;
- la historia en una frase (en Sloth: «se asusta, cierra el portátil, se convierte en el logo y guiña»).

## 2. Proponer en vídeo

Haz 1–3 prototipos rápidos de direcciones distintas, cada uno como mp4:
- en Sloth, primero «trazo» (la S se dibuja de una línea) y «morph» (una gota que se transforma hasta la S);
- el usuario pidió una mezcla con su dibujo, y esa fue la tercera.

Monta la favorita en la app y deja las demás como prototipo.

**Hecho cuando** el usuario elige una dirección o pide la mezcla.

## 3. Vectorizar pieza a pieza

Lo que se anima por separado (la línea, cada ojo, la pupila, la nariz, la tapa, el brazo…) tiene que ser su propio
trazo. Proceso y opciones en [vectorizar.md](references/vectorizar.md):

1. `trazar-piezas.mjs` sin `--pieza` lista las manchas con sus cajas.
2. Corta lo que se toca (`--corte`), nombra cada pieza por un punto dentro (`--pieza`) y parte las líneas que siguen de
   una pieza a otra (`--zona`).
3. Superpón los trazos de colores sobre el original con `capturar.cjs` y compáralo.

**Hecho cuando:**
- la superposición coincide con el original sin huecos ni rebabas;
- cada pieza que va a cambiar de forma tiene los mismos subtrazos (agujeros incluidos) que su pareja.

## 4. Líneas centrales y parejas de morph

- **Lo que se dibuja con su línea** (una «S», una cola) necesita su línea central: usa `centro.mjs`. El trazo que la
  descubre es al menos el doble de su medio grosor.
- **Si un dibujo se convierte en otro:**
  1. Ponlos en la misma escala con una matriz (en Sloth, el portátil de 1254 px sobre el logo de 512:
     `matrix(0.5145 0 0 0.5145 -64.3 -36.2)`). Comprueba superponiéndolos que los rasgos caen en su sitio.
  2. Prepara cada par con `morph.mjs`.

**Hecho cuando:**
- cada línea central va de extremo a extremo por dentro de su pieza;
- los fotogramas a mitad del morph no se retuercen.

## 5. Montar la escena y su guion

Sigue [animar.md](references/animar.md):
- La entrada es **CSS puro dentro de `index.html`**: arranca en el primer fotograma, antes de que cargue el framework.
- Escribe el guion (cada momento con sus segundos) en la cabecera del CSS antes de animar.
- Anima con principios de dibujo animado: anticipación, estirar y encoger, inercia, la cámara que tiembla.
- Genera con un script lo que sale de los datos (el SVG, los `@keyframes` del morph). En Sloth era
  `ejemplo-sloth/generar-escena.mjs`.

**Hecho cuando** cada momento del guion tiene su tiempo en el CSS, y la hoja de contactos de la línea de tiempo entera
cuenta la historia.

## 6. Integrarla en la app

Plantilla en `ejemplo-sloth/splash.ts`. Tiene que cumplir todo esto:
- Se va sola cuando la app está lista y la entrada ha acabado.
- Una tecla o un clic la saltan, y ese clic sigue llegando a la app: la entrada lleva `pointer-events: none`.
- Las ventanas de trabajo, como la de lectura de Sloth, no la llevan.
- Con «reducir el movimiento» sale el logo quieto.

Escribe los e2e del ejemplo (`ejemplo-sloth/entrada.spec.ts`): se va sola, un clic pasa y se la salta, y una tecla se la
salta.

**Hecho cuando** pasan los tipos, el build y esos e2e en la app de verdad.

## 7. Revisarla fotograma a fotograma

Usa [verificar.md](references/verificar.md):
1. Saca los fotogramas de cada momento clave con `fotogramas.cjs` y júntalos con `hoja.cjs`.
2. Amplía los detalles: el arranque del trazo, el guiño, la salida.
3. Graba el vídeo entero a 60 fps.
4. Si algo pinta donde no debe, `depurar.cjs` lo encuentra ocultando elementos uno a uno.

**Hecho cuando:**
- el vídeo sale limpio desde el primer fotograma (sin puntos, medias lunas ni saltos);
- la captura con movimiento reducido enseña el logo final.

## 8. El sonido

Si el usuario lo pide o encaja, sigue [sonido.md](references/sonido.md):
- se sintetiza con Web Audio (sin archivos), golpe a golpe sobre el reloj de la animación;
- nunca puede romper la carga de la app;
- en los tests suena en silencio.

**Hecho cuando:**
- `grabar-audio.cjs` + FFmpeg dan unos −20 LUFS y picos por debajo de −3 dBFS;
- el espectrograma enseña cada golpe en su momento;
- `oir-en-vivo.cjs` da «ok running» y «audible true»;
- el e2e comprueba que suena (`isCurrentlyAudible`);
- el mp4 con sonido está entregado.

## 9. Entregar

- **Al usuario:** el mp4 final (con sonido) y una tabla de momentos (qué pasa y qué suena), en su idioma. Termina con lo
  que le toca hacer.
- **En el repo:** documenta el dibujo nuevo en la marca, y en `AGENTS.md` que los e2e silencian el sonido.
- **Pruebas:** corre la suite entera, porque la entrada toca el arranque de todas las pruebas.
- **Itera** con lo que diga («más detallada», «falta sonido»), con un vídeo nuevo cada vez.

**Hecho cuando** el usuario la aprueba y `npm test` está en verde. El commit y el PR van cuando él lo pida.
