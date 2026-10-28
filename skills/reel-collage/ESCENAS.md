# Cómo se arman las escenas

El video es una composición de Remotion de 1080x1920 a 30 fps (`src/Reel.tsx`), con los tiempos de `public/voz.json`.
En `src/datos.ts`, `ini(i)` y `fin(i)` dan el fotograma de inicio y fin de la frase `i`; `palabra(i, "patea")`, el de
una palabra dentro de ella (por prefijo y sin acentos, la palabra como la dijo el TTS: "patéalo" se encuentra con
"patea"). El `Reel.tsx` de la plantilla trae un sketch de ejemplo con cada movimiento de abajo: cópialo y cámbialo.

Cómo lo resuelve la referencia, plano por plano: [`ejemplos/referencia.md`](ejemplos/referencia.md) (el cocodrilo:
el gancho, y la superficie y el fondo del lago como un solo lugar; el tigre sobre el elefante: lanzar, volar, aterrizar
en otro escenario).

## El gancho

- **El clip** (`public/clip.mp4`): la situación real, a pantalla completa y con su sonido. Suena solo los segundos de
  `"antes"` de `guion.json`, y bajo la voz al 25 %. Sin video (o si YouTube solo da 360p, que a pantalla completa se ve
  borroso), la página oficial en el celular: `scripts/captura.py <url> public/img/pagina.png 390` y `BAJA` en
  `Reel.tsx`, que la hace bajar sola como grabación de pantalla. Con una página, el comentario va en `y 240` y la página
  empieza 170 px más abajo, para no tapar el titular. Sin nada de eso, la foto real del tema.
- **El comentario** (`Comentario`): la tarjeta oscura de Instagram arriba (`y 300`), con usuario inventado, como lo
  escribe la gente: minúsculas, "💀😭", sin punto final. Si el gancho es un "¿qué prefieres?" o el clip ya trae su
  letrero ("WYD in this situation?"), eso ocupa su lugar.
- **Él** (`hablando`, o `selfie` cuando exista): abajo a la derecha, sobre el clip. Entra en seco con la primera palabra
  y rebota con el volumen de la voz.
- Dura las frases del gancho (`PRIMERA_DEL_SKETCH`). Fuera de ese comentario no se añade texto en todo el reel: ni
  título, ni subtítulos, ni stickers. El que ya traen un logo, un producto o una foto se queda.

## El sketch

- **Escenarios**: de 3 a 6 fotos reales verticales, una por lugar que nombra la voz (`ESCENARIOS` y `TOMAS`), con la
  cámara fija y corte seco de uno al otro. El primero vuelve a montar la situación del clip con recortes (el kayak en el
  lago, él sobre el elefante). Se piensan como un solo espacio: la superficie y el fondo del mar, un tramo de escalera y
  el de abajo, el parque y el coliseo. Él llega con el corte: ya está ahí.
- **La continuidad**: lo que sale volando por un borde entra al siguiente escenario por el borde opuesto, con la misma
  dirección y el mismo giro (la patada lo saca por la derecha, entra por la izquierda). Lo que se hunde sale por abajo y
  entra por arriba. El corte al escenario nuevo es el fotograma en que sale; si nada vuela, la palabra del lugar.
- **Recortes**: limpios, sin borde ni sombra (`Recorte`), apoyados por los pies en la línea de piso de su escenario.
  Escala real entre ellos (el elefante grande, él chico) y plano abierto: él, de pie, mide de 250 a 700 px de alto,
  menos cuando algo tiene que volar por la escena.
- **Poses**: una por acción, con corte seco, que entra en el verbo (`palabra(i, "patea")`), no al empezar la frase.
- **El movimiento**: todo lo que se avienta vuela, de verdad.
  - `arco(f, desde, hasta, de, a, altura, vueltas)`: un lanzamiento con gravedad y giro. Un vuelo dura de 0.4 a 1 s
    (12-30 fotogramas) y lo que aterriza se queda quieto. Lo que vuela gira sobre su centro (`origen="50% 50%"`).
  - `recorrido(f, claves)`: caminar, arrastrar, hundirse, subir nadando; la criatura que entra caminando lleva un rebote
    por paso.
  - `Grupo`: él con la criatura agarrada (la llave de muslos, cargarla sobre la cabeza, rodar escaleras abajo con ella)
    se mueven y giran como uno.
  - Él también vuela: la misma pose de pie, girada con `arco` y `origen="50% 50%"` en `Persona`, es el salto mortal
    o la caída desde el trampolín.
- **El impacto**: `temblor` y `Salpicadura` en el fotograma del choque: `polvo` o `arena` contra el piso, `agua` al caer
  al mar, `humo` (la nube roja bajo el agua), `sangre` en gotas, `chispas` contra metal.
- **Vencida**: el mismo recorte de la criatura girado de 90 a 180° (patas arriba), o su foto acostada. Una criatura
  simétrica (un logo) girada se ve igual: va inclinada y aplastada contra el piso (`Aplastada`). Se queda en el piso
  hasta el final.
- **Sacarle algo**: sacudirla de cabeza hasta que suelta lo que tiene (los tokens, el dinero) es un `Chorro` que cae y
  se apila a sus pies. Va antes de quien la sostiene en el orden de dibujo: el chorro cae detrás de él.
- **Híbridos y disfraces**: `personaje/cabeza.png` pegada sobre otro cuerpo (las crías mitad serpiente, la armadura):
  centro en el 50 % y el 6 % del alto, con el 70 % de su ancho.
- **Utilería**: recortes de fotos reales (el trampolín, la lata, el pez espada), sin rotular. Los logos en SVG se
  pasan a PNG con `scripts/svg_png.py`. Aparece con la acción que
  la usa (en "aviéntale el camión", con el verbo) o en el corte al escenario donde está.
- **El final**: desde el remate, él quieto, de frente o mirando a cámara, junto a lo que quedó. El reel corta en la última
  palabra (`COLA` de 0.2 s en `datos.ts`).

## Actuado

La variante en que él no narra un instructivo sino que actúa dentro de la escena: le habla a la criatura o al culpable
("¿Te puedo acariciar?", "¡Otra vez y te esterilizo!"), lo regaña y lo castiga. Lleva efectos de sonido en cada golpe
(látigo, golpe seco, rugido) y música solo en el clímax (la multitud que lo festeja). Los efectos con licencia libre
(CC0 de freesound o Pixabay) los busca el subagente del material; van en `public/sfx/` y se ponen en el fotograma del
impacto con `<Sequence from={t}><Audio src={staticFile("sfx/golpe.mp3")} /></Sequence>`.

## Las piezas (`src/piezas.tsx`)

- `Recorte`: un PNG apoyado por los pies en `(x, y)`, con `giro`, `escala`, `espejo` y `origen` (el punto de giro).
- `Grupo`: varios recortes con coordenadas relativas, que se mueven y giran juntos.
- `arco` y `recorrido`: dan `{x, y, giro, escala}` en el fotograma `f`; se pasan a `Recorte` o a `Grupo` con `{...}`.
- `Salpicadura`: gotas o nube de un impacto, por `tipo`.
- `Aplastada`: aplasta contra el piso lo que lleva adentro (la criatura vencida).
- `Chorro`: objetos que caen de algo que se sacude y se apilan en un montón.
- `temblor`: sacudida de cámara de un impacto.
- `usePop`: escala con rebote, para lo que aparece de golpe (las crías que nacen).
- `Comentario`: el comentario de Instagram del gancho.

## Problemas conocidos

- **Un tinte CSS con `mask-image` no carga en los primeros cuadros** y la armadura salió gris la mitad de su escena.
  Tiñe la imagen con PIL antes (en el reel de Gemini, el degradado: `0.15 * original + 0.85 * degradado * (0.35 +
  1.25 * luminancia)`).
- **El temblor deja bordes negros** si no escala: `temblor` ya escala 1.06.
- **Remotion a veces falla al mezclar el audio** ("remotion-audio-mixing … No such file or directory"). `final.py`
  reintenta y borra el crudo antes, porque un fallo dejó pasar el MP4 viejo al paso del audio.
- **`palabra()` busca por prefijo de la palabra que dijo el TTS**: "cargues" no empieza con "carga". Usa la raíz que
  comparten ("carg") o la forma exacta.
