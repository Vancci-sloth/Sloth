# Verificar

Nada se da por bueno sin mirarlo. Las herramientas sacan cualquier instante exacto (`update` es determinista), así que
revisar cuadro a cuadro es barato: hazlo después de cada capa y de cada cambio.

## Qué mirar y con qué

| Para ver | Comando (desde el taller) |
| --- | --- |
| Toda la animación de un vistazo | `node herramientas/hoja.mjs <inv>`: 12 instantes clave en `capturas/hoja.jpg` |
| Un instante concreto | `node herramientas/capturas.mjs <inv> 2.6 3.4` |
| Que nada atraviese nada | `CAM=side node herramientas/capturas.mjs <inv> …` |
| El detalle fino | `RECORTE=120,250,170,170 DPR=3 node herramientas/capturas.mjs <inv> 6` |
| La escena sin una pieza | `HIDE=points,fogs node herramientas/capturas.mjs <inv> …` |
| Un lienzo pintado | `node herramientas/lienzos.mjs <inv>` |
| Antes contra ahora | `ANTES=historial/index-v2-puerta.html node herramientas/hoja.mjs <inv>` → `antes-despues.jpg` |

Lee cada imagen que generes. Una captura que no miraste no cuenta como revisión.

## Brillo

`capturas.mjs` imprime, en cada captura, el brillo medio y qué parte está quemada (casi blanca). Valores de la carroza,
que el dueño aprobó:

| Momento | Brillo | Quemado |
| --- | --- | --- |
| Espera, antes del toque | 0.33 | 0 % |
| Magia subiendo | 0.54 – 0.57 | < 1 % |
| El destello (±0.1 s) | hasta 0.81 | hasta 20 % |
| Transformación | 0.64 – 0.66 | 1.5 – 5 % |
| Final, con el título | 0.40 | 0.4 % |

- Fuera del destello, lo quemado se queda por debajo del 5 %.
- Con el título en pantalla, por debajo del 1 %.
- Si una captura pasa de eso, baja la intensidad que la quema; para encontrar cuál, compara con `HIDE=`.

Esos números son de una escena de noche. En un tema claro (playa de día, boda en blanco), el fondo blanco ya cuenta como
quemado. Ahí compara cada momento con el cuadro en reposo del mismo tema y vigila que el destello no se coma el detalle
ni el texto.

## Lista para dar una capa por terminada

- [ ] Cada tiempo del guion se ve en la hoja de contactos, en su momento.
- [ ] Vista lateral (`CAM=side`) en los instantes de movimiento: nada atraviesa nada y nada flota sin querer.
- [ ] Recortes con `DPR=3` del héroe y de cada adorno nuevo: a tamaño de teléfono se lee lo que debe (un escalón de
      puerta parecía antenas).
- [ ] El título se lee sobre lo que tiene detrás en cada captura donde aparece.
- [ ] Brillo dentro de los rangos de arriba.
- [ ] Ambiente vivo: las capturas a `DURATION + 2` y `DURATION + 3` son distintas.
- [ ] La consola no muestra errores: las herramientas imprimen `[error en la página]` y `[consola]`.

## Comparar con la referencia

- Pon la referencia y lo nuestro lado a lado, a la misma altura y en un encuadre parecido:

  ```
  ffmpeg -y -i ref.png -i nuestra.png -filter_complex "[0]scale=-1:720[a];[1]scale=-1:720[b];[a][b]hstack" ref-vs-nueva.jpg
  ```

- Para el detalle, recorta la misma zona de las dos. Por ejemplo, la puerta o una rueda:

  ```
  ffmpeg -i ref.png -vf crop=w:h:x:y puerta.png
  ```

- Para el brillo de una zona, `signalstats` da el promedio (YAVG, 0–255):

  ```
  ffmpeg -i img.png -vf "crop=w:h:x:y,signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null -
  ```

  Así se igualó el brillo de las hojas.

## Ver en vivo

- **Navegador integrado.** Abre `http://localhost:<puerto>/<inv>/` en el navegador integrado, colócalo en lo que
  cambió y déjalo visible para el dueño. Si no está disponible, dilo en vez de saltártelo.
- **Teléfono.** El servidor imprime la dirección para el teléfono en el mismo wifi (`http://192.168.…:<puerto>/`).
  Dásela al dueño para que la pruebe en el suyo.
- **Video.** `node herramientas/grabar.mjs <inv>` graba cuadro a cuadro, sin saltos aunque la PC vaya lenta: sale
  `<inv>/<inv>.mp4` a 810×1440. Usa `?auto` solo para medir, no para grabar.
