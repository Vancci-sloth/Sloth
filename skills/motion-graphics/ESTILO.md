# El estilo, con sus números

Lo que define el estilo, medido cuadro a cuadro sobre los seis videos de referencia (noviembre de 2026). **Esto no lo
lee el agente que hace un video**: lo aplica el director (`kit/motion.js`), donde cada número de aquí es una constante.
Está escrito para quien vaya a tocar el director.

## La rejilla

La referencia principal (un carrete de 15,0 s a 60 fps) lleva su propio reloj impreso en el HUD: **128 BPM**, «BAR n/8».
Sale la cuenta exacta: pulso 60/128 = **0,469 s**, compás de cuatro pulsos = **1,875 s**, ocho compases = 15,0 s.

Los cortes detectados (`select='gt(scene,0.1)'`) caen en la línea del compás: 1,88 · 3,75 · 5,63 · 7,50 · 11,25 ·
13,13 s. El tramo rápido del final no es otra cosa: 11,48 · 11,72 · 11,95 · 12,18 · 12,42 · 12,65, es decir cada
**0,234 s**, la corchea. De ahí las tres unidades del director:

| Unidad | Segundos a 128 BPM | Para qué |
|---|---|---|
| compás | 1,875 | lo que dura un plano (`compases`: 0.5, 1, 1.5, 2, 3) |
| pulso | 0,469 | el segundo golpe dentro de un plano (el pie de un titular, el anillo) |
| corchea | 0,234 | lo que cambia solo: una figura, una tirada de la trama, una palabra de la frase |

Un plano dura un compás salvo que se diga otra cosa; un video son de 6 a 12 planos y de 6 a 45 s. El director no deja
elegir ni duraciones ni curvas: por eso el montaje siempre cae en el ritmo y el agente no gasta turnos afinándolo.

## El corte

Medido en el paso al titular (1,80 → 2,25 s, 27 cuadros a 60 fps): el campo de color nuevo tapa al viejo en **4
cuadros, 0,067 s**, con un círculo que crece desde un punto; detrás, el contenido ya está entrando. En el cierre
(13,05 → 13,65 s) es el mismo círculo desde otro punto.

El director lo deja en **IRIS = 0,07 s** y alterna tres cortes, por número de plano: círculo, barrido diagonal y corte
seco. El punto del círculo (`foco`) recorre seis posiciones fijas, para que no salga siempre del centro.

## Las curvas

- **Entrada de un elemento: 0,30 s** con `1 - (1 - x)⁴` (entra rápido y frena). Las letras del titular salen de
  −14 % del ancho y se asientan ahí.
- **Desfase entre letras: 0,03 s** (en la referencia, seis letras acaban de entrar en ~22 cuadros a 60 fps).
- **Estela:** mientras una letra entra se dibuja 6 veces a lo largo de su recorrido, con alfa decreciente. Es el
  desenfoque de movimiento del estilo; no hay otro.
- **Figuras:** rebote (`back-out`, s = 1,70158) en 0,12 s, no entrada suave.
- **El iris:** exponencial (`1 - 2^(-10x)`), que es lo que hace que tape de golpe y no se vea crecer.
- **Lo ya asentado** deriva un 1,2 % del ancho por segundo. Sin eso el plano se ve congelado; con más, se ve flotando.

## Tamaño y márgenes (sobre 1080 px de lado corto)

| Qué | Valor |
|---|---|
| HUD al borde | 48 px; esquinas en L de 22 px y 2 px de trazo |
| Contenido al borde | 64 px (vertical) · 5 % del ancho (horizontal) |
| Letra del HUD | 15 px mono, espaciada 0,5 em (la marca, 0,62 em) |
| Caja del contenido | vertical: de 0,17 a 0,70 del alto · horizontal: de 0,14 a 0,80 |
| Titular | el mayor tamaño que entre en la caja, condensado al 94 %, hasta tres renglones en vertical y dos en horizontal |
| Celda de la trama | 92 px, trazo 0,17 de la celda |

El titular condensado al 94 % es lo que acerca Inter 900 a la grotesca estrecha de la referencia.

## La paleta

Muestreada un cuadro por segundo del carrete: casi negro `#121014`, coral `#EE4B38`, crema `#F0EDE6`, azul eléctrico
`#4140F2` y, de acento suelto, lima `#C4E83F`. De ahí salen las cuatro paletas del director (`coral`, `tinta`, `neon`,
`nieve`), todas con los mismos cuatro papeles: `oscuro`, `acento`, `claro`, `apoyo`. **Dos planos seguidos nunca
llevan el mismo fondo**: si coinciden, el director rota el del segundo. Es la mitad de por qué el montaje se lee como
motion graphics y no como una presentación.

## El HUD

Está en la referencia en los cuatro márgenes y no se quita: marca y sello arriba a la izquierda, capítulo
(`NN — nombre`) arriba a la derecha, tiempo (`00:00:SS:FF`) y fps abajo a la izquierda con la barra de avance, y BPM,
cuatro cuadritos de pulso y `COMPÁS n/N` abajo a la derecha. Es lo que hace que la pieza se lea como el carrete de un
estudio; también es el reloj que vuelve legible el ritmo cuando se revisa la hoja de cuadros.

## Lo generado, dentro del estilo

Una imagen o un clip que llega de un modelo no se pega encima: pasa por el mismo tratamiento que todo lo demás.

- **Duotono** (el de serie): el cuadro se pasa a grises (`grayscale(1) contrast(1.06)`), las luces se van al acento
  por `multiply` y las sombras al fondo del plano por `screen`. Queda en dos tintas de la paleta, como el resto.
- **Entrada de persiana**, no fundido: el cuadro se descubre de arriba abajo en los mismos 0,30 s, y se acerca un 5 %
  mientras dura el plano.
- **Los clips se dibujan por cuadros**, no reproduciendo el MP4: `material.py` los saca a JPG al tamaño y los fps del
  video. Buscar dentro de un video en Chrome no da siempre el mismo cuadro, y esto sí.
- **`sigue: true`** le da a Flow el último cuadro del plano anterior como primer cuadro: el corte al material no
  salta.
- **Los objetos 3D** vienen sobre negro y sin alfa (`vuelta.webm`, 640×640, yuv420p), así que van dentro de un panel
  oscuro sobre el campo de color, como las maquetas de interfaz de las referencias, en vez de recortarlos mal.

## Con voz

El estilo es de música. Con narración, el plano entra en la palabra que dice la voz pero **pegado a la corchea más
cercana** (0,234 s a 128 BPM): manda la voz, y el corte sigue cayendo en el ritmo. El video termina un compás entero
después de la última palabra. `scripts/test_plan.py` lo comprueba sin voz y sin render.

## Lo que se dejó fuera

De los seis de referencia, el quinto (un título de cine en blanco y negro, con 3D, polvo y volumetría) no entra: pide
un motor 3D y una semana de material. Los otros cinco son tipografía, color plano, figuras y maquetas de interfaz, que
es lo que hace este director.

## Cómo se midió

FFmpeg (en esta máquina, `%APPDATA%\sloth\piezas\bin\ffmpeg.exe`, que no está en el PATH):

    ffmpeg -i ref.mp4 -vf "select='gt(scene,0.1)',metadata=print:file=-" -an -f null -   # los cortes
    ffmpeg -ss 1.80 -t 0.45 -i ref.mp4 -vf "scale=300:-2,tile=9x3" -frames:v 1 z.png     # una transición cuadro a cuadro
    ffmpeg -i ref.mp4 -vf "fps=1,scale=1:1" -f rawvideo -pix_fmt rgb24 - | xxd -p -c3    # la paleta
