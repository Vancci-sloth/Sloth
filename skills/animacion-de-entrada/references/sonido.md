# El sonido a la medida

El código entero está en `ejemplo-sloth/splash-sound.ts`. Tiene el sintetizador (`Synth`), la partitura
(`composeSplash`) y cómo arranca y se despide (`playSplashSound`). Copia `Synth` tal cual y escribe la partitura de la
nueva animación.

## Principios

- **Sintetizado con Web Audio, sin archivos:** cada sonido se programa en el segundo exacto de su fotograma, pesa cero
  y se afina para la historia. No hay que buscar efectos ni licencias.
- **El reloj es el de la animación, no el del código.**
  - La animación CSS empieza cuando la página se pinta; el JS llega 20–170 ms después (medido en Sloth con
    `PerformanceNavigationTiming.domInteractive`).
  - El cero se calcula con la `startTime` de las animaciones de la entrada:

    ```ts
    function animationElapsed(): number {
      const started = document.getElementById('splash')?.getAnimations({ subtree: true })[0]?.startTime
      return performance.now() - (typeof started === 'number' ? started : 0)
    }
    composeSplash(context, context.currentTime - animationElapsed() / 1000)
    ```

  - Todo se programa como `cero + segundos del guion`, y suena en su sitio aunque arranque tarde.
- **Lo que ya pasó no rompe.**
  - Web Audio lanza `RangeError` con un tiempo de inicio negativo. En Sloth ese error, sin capturar, **impedía cargar la
    app**.
  - Por eso el sintetizador tiene un suelo (`floor = context.currentTime + 0.005`) y cada sonido decide qué hacer:
    - **Golpes:** si ya sonaron, nada.
    - **Continuos** (barridos, deslizamientos): entran desde donde van (`fit`). Si les quedan menos de 80 ms, nada.
    - **Sostenidos hasta un final** (zumbido, acorde, grave): entran desde ahora si no han acabado.
- **Nunca rompe la app.** Crear el `AudioContext` y componer van en un `try`: si falla, devuelve `null` y la entrada
  sigue en silencio.
- **Con «reducir el movimiento»** no suena (`matchMedia('(prefers-reduced-motion: reduce)')`).
- **Se despide con la entrada:** al saltarla o al salir, un soplo de aire y un fundido del máster en 0,7 s. Después,
  `context.close()`.
- **En Electron suena sin gesto del usuario:** no hace falta un clic para el `AudioContext`. La CSP no afecta a Web
  Audio.

## La cadena

`fuente → envolvente → seco ─┬→ máster (VOLUME) → compresor → salida`
`                            └→ reverberación (convolución) → húmedo 0,28 → máster`

- **Compresor:** umbral −18 dB, ratio 3, ataque 4 ms, liberación 200 ms. Junta los golpes y protege de los picos.
- **Sala:** una respuesta al impulso hecha a mano: ruido estéreo que decae con `(1 − t)³`, 1,8 s. Le da cuerpo cálido
  sin archivo.
- **Ruido:** un buffer de 2 s de ruido blanco en bucle, que arranca en un punto al azar en cada uso.
- **Envolventes exponenciales** (de 0,0001 a volumen a 0,0001). La lineal suena a clic.

## Los instrumentos (`Synth`)

| Método | Qué es | Cómo |
|---|---|---|
| `swoosh(t, dur, desde, hasta, q, vol)` | aire que barre: el pincel, una tapa, una cola | ruido → paso banda que barre en exponencial |
| `air(t, dur, corte, vol)` | chispas, soplos | ruido → paso alto, ataque de 10 ms |
| `glide(t, dur, desde, hasta, vol)` | un tono que se desliza | seno con rampa exponencial de frecuencia |
| `bloop(t, f, vol)` | una burbuja | seno que sube de 0,7·f a f en 45 ms, 220 ms |
| `pluck(t, f, vol, dur, tipo)` | nota pulsada | oscilador con ataque de 4 ms |
| `bell(t, f, vol, dur)` | campana de cristal | parciales 1, 2,76 y 5,4 con su nivel y su caída |
| `chord(t, fs, vol, dur)` | acorde brillante corto (el «!») | sierras → paso bajo que cae de 5000 a 900 Hz |
| `boing(t, vol)` | «¡boing!» | triángulo 360 → 1150 → 900 Hz con vibrato de 17 Hz que se apaga |
| `click(t, vol, corte)` | chasquido de tecla o golpe | 30 ms de ruido → paso alto |
| `thock(t, vol)` | el cuerpo de una tecla | seno 950 → 380 Hz en 40 ms |
| `thump(t, vol, desde)` | golpe grave | seno que cae a 42 Hz en 160 ms |
| `knock(t, vol)` | madera | ruido → paso banda de 1700 Hz, Q 5 |
| `dust(t, vol)` | polvo | ruido → paso bajo que cae de 1400 a 300 Hz, 0,5 s |
| `hum(t, fin, vol)` | zumbido de pantalla | senos a 110, 165 y 220,5 Hz, sostenidos |
| `pad(t, fin, fs, vol)` | el acorde que se queda | sierras desafinadas ±7 cents → paso bajo que se abre a 2600 Hz y vuelve a 1200 |
| `sub(t, fin, f, vol)` | el grave que lo sostiene | seno sostenido |
| `fadeOut(t, dur)` | despedida | rampa lineal del máster a 0 |

## La partitura

- **Una tonalidad para todo.** Sloth va en **La mayor pentatónica** (La, Si, Do♯, Mi, Fa♯): cálida como la paleta
  ámbar, y cualquier nota casa con cualquier otra. Las frecuencias son constantes con nombre (`A4 = 440`,
  `CS5 = 554.37`…).
- **Cada momento de la animación tiene su sonido**, con los segundos del guion del CSS:
  - **Se dibuja:** dos `swoosh` (cabeza y cola) con un `glide` que sube por debajo. Al levantar el pincel, una
    `bell` aguda y suave.
  - **Brota la cara:** una `bloop` por pieza, subiendo por el acorde (La, Do♯, Mi, La y un La desafinado 0,6 % para
    las pupilas).
  - **Portátil:**
    - un `pluck` grave para el teclado y un `swoosh` para la bisagra;
    - un `click` y dos `bell` cuando se enciende el logo de la tapa;
    - un `hum` mientras la pantalla está encendida.
  - **Teclea:** tres veces `click` + `thock`, cada una con una `bloop` aguda por el icono que sube.
  - **Susto:**
    - un `swoosh` corto (coge aire) y un `boing`;
    - un `chord` (Mi, La, Do♯) para el «!»;
    - `air` y un `thump` leve.
  - **Portazo:**
    - un `swoosh` que baja (el aire que empuja la tapa);
    - `thump` grave, `click`, `knock` y `dust`, todo en el mismo instante que la tapa en el CSS (1,6 s).
  - **La cola se recoge:** un `swoosh` y un `glide` que bajan.
  - **Se convierte en el logo:**
    - un `swoosh` que sube y un arpegio de `pluck` (La, Do♯, Mi, La, Do♯, cada 60 ms);
    - el `pad` (La, Mi, La, Do♯, Mi, Si) y el `sub` a 110 Hz se quedan hasta la salida;
    - dos `bell` al llegar.
  - **El brillo cruza:** un arpegio rapidísimo y agudo de `pluck` (cada 35 ms) con `air`.
  - **El guiño:** una `bloop` (la mejilla) y tres `bell` (el destello y el «tin»).
- **Golpes como el punto de contacto visual:** el sonido de un golpe va en el fotograma en que se toca, no en el que
  empieza el movimiento. Lo que se mueve antes del golpe es aire (`swoosh`) que acaba en él.
- **Dinámica:** lo que es historia (el susto, el portazo, el logo) más fuerte; lo que es textura (tinta, zumbido,
  brillo) muy por debajo (volúmenes de 0,02–0,04 frente a 0,1–0,4).

## Medir lo que no se oye

El agente no puede oír, así que comprueba por medidas:

1. **Grabar sin tiempo real**, con el mismo código:

   ```
   npx esbuild src/renderer/splash-sound.ts --bundle --format=iife --global-name=Sonido --outfile=<taller>/sonido.js
   electron grabar-audio.cjs <taller>/sonido.js entrada.wav 4.4 2.78
   ```

2. **Sonoridad y picos** (EBU R128): `ffmpeg -i entrada.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"`.
   - **Objetivo:** **unos −20 LUFS** (como un sonido del sistema: se oye, no asusta) con **picos por debajo de
     −3 dBFS**.
   - En Sloth, `VOLUME = 0.55` daba −26 LUFS (flojo); con `1.1` dio −19,9 LUFS y −3,5 dBFS de pico.
3. **Espectrograma**, para ver que cada golpe cae en su sitio (líneas verticales en los tiempos del guion):
   `ffmpeg -i entrada.wav -lavfi "showspectrumpic=s=1400x500:legend=1:scale=log:fscale=log:color=fire" espectro.png`.
   Míralo con Read.
4. **En vivo y tarde a propósito:** `electron oir-en-vivo.cjs <taller>/sonido.js`. Debe decir `ok running` y
   `audible true`. Así salió el `RangeError` que rompía la app.
5. **Con el vídeo:** se mezcla con el mp4 final para entregarlo
   ([verificar.md](verificar.md#video-con-sonido)).

## En la app y en los tests

- **El punto de entrada** (`main.tsx`) llama a `startSplash()`, que llama a `playSplashSound()`. `leave()` de la entrada
  llama a `sound?.leave()`.
- **Los e2e no hacen ruido:** en el proceso principal, las ventanas de los tests (las que no se enseñan) se silencian:

  ```ts
  if (!HIDDEN_WINDOW) window.once('ready-to-show', () => window.show())
  // Los tests abren cientos de ventanas: sin silenciarlas, cada una tocaría el sonido de la entrada.
  else window.webContents.setAudioMuted(true)
  ```

  Anótalo en `AGENTS.md`, junto a cómo se lanzan los e2e.
- **El e2e comprueba que suena aunque esté silenciada:** Chromium sabe que suena.

  ```ts
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.isCurrentlyAudible())).toBe(true)
  ```

  Si falla, casi siempre es una excepción al componer: ejecuta `oir-en-vivo.cjs`.
