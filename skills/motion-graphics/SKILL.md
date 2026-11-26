---
name: motion-graphics
description: Hace un video de motion graphics, vertical (TikTok, Reels, Shorts) u horizontal (YouTube), al estilo de los carretes de estudio y los anuncios de marca: tipografía enorme sobre colores planos, cortes secos en el compás, figuras, tramas y un HUD técnico, con música al mismo BPM. Mete imágenes y clips generados en Google Flow y objetos de la biblioteca 3D, y admite narración. Úsala cuando pidan motion graphics, un carrete, un anuncio tipográfico, una pieza de marca o un video de tipografía cinética.
---

# Motion Graphics

Escribes **un archivo** y corres **un comando**: `momentos.json` (qué plano va en cada compás) y `scripts/hacer.py`.
El director (`kit/motion.js`) pone las duraciones, las curvas, los tamaños, los colores, las transiciones y el HUD;
la música se sintetiza al mismo BPM y los cortes caen en el compás. **No escribas código ni abras el kit**: todo lo
que el video necesita se dice en `momentos.json`. Si algo no cabe ahí, falta en el director: díselo al usuario.

`<skill>` es esta carpeta. Los scripts van con el `python` del sistema y desde la carpeta del video.

## El estilo (no se negocia)

El de los seis carretes de referencia, con sus números en [ESTILO.md](ESTILO.md): un campo de color plano por plano,
tipografía enorme condensada que entra con su estela, cortes secos de 0,07 s en la línea del compás (128 BPM,
1,875 s), figuras y tramas que cambian en cada corchea, y un HUD de marca, capítulo, tiempo y compás en los cuatro
márgenes. Dos planos seguidos nunca llevan el mismo fondo. Nada de eso se elige por video: solo el contenido.

Lo que el estilo dibuja (tipografía, figuras, tramas, paneles) es código y sale igual siempre. Lo que pide el tema
(una foto, una escena animada, un objeto) se genera: ver «Material generado». Las dos cosas van en la misma rejilla.

## Formato

VyMotion manda `Formato: vertical` o `Formato: horizontal` y va en `momentos.json` como `"formato"` (sin él,
vertical). En **vertical** (1080×1920) el contenido va en la banda central que la red no tapa, el titular reparte
hasta tres renglones y la portada es su primer cuadro. Con **`Formato: horizontal`** (1920×1080, para YouTube) el
contenido ocupa el 90 % del ancho, el titular va en uno o dos renglones y la portada es la miniatura de 1280×720,
que no entra en el video. Si piden el otro formato, es otro video.

## momentos.json

Un momento por plano, en orden. Cada uno dura `compases` (1 si no se dice; valen 0.5, 1, 1.5, 2 y 3). El video dura
la suma, entre 6 y 45 s. **El último plano es siempre `cierre`.**

```json
{
  "formato": "vertical",
  "paleta": "coral",
  "marca": "VyMotion",
  "sello": "Estudio de video",
  "portada": "Cada skill es una card",
  "momentos": [
    { "plano": "destello", "texto": "VyMotion 2.0" },
    { "plano": "frase", "texto": "Describes el trabajo y el agente lo hace", "compases": 1.5 },
    { "plano": "titular", "texto": "Cada skill es una card" },
    { "plano": "panel", "titulo": "Lo que hace sola", "filas": ["guion", "voz", "render", "portada"], "compases": 2 },
    { "plano": "cifra", "texto": "3,7 min", "pie": "un video entero" },
    { "plano": "cierre", "pie": "tu estudio en tu máquina" }
  ]
}
```

- **`paleta`**: `coral` (casi negro, coral, crema y azul: la de la referencia), `tinta` (papel gris y violeta, de
  producto), `neon` (gris claro, verde neón y magenta, de estudio) o `nieve` (blanco, azul y grafito, de anuncio).
- **`marca`** (hasta 18 letras) va en el HUD y en el cierre; **`sello`** es la línea chica de al lado;
  **`portada`** son las 2 a 5 palabras enormes de la portada (sin ella, el primer titular).
- **`fondo`** de un momento (`oscuro`, `acento`, `claro`, `apoyo`) cambia su campo de color. Casi nunca hace falta:
  cada plano trae el suyo y el director ya evita que dos seguidos se repitan.

| `plano` | Qué se ve | Qué le pones |
|---|---|---|
| `destello` | el asterisco de marca que estalla y su anillo | `texto` (una línea chica, 22 letras) |
| `titular` | la frase enorme, letra a letra con su estela | **`texto`** (30 letras), `pie` (en cursiva, 30) |
| `frase` | las palabras nacen sueltas, una por corchea, y caen en su bloque | **`texto`** (de 3 a 10 palabras, 64 letras) |
| `panel` | una tarjeta clara con filas y un punto corriendo por cada una con otra curva | **`titulo`** (26), **`filas`** (de 2 a 6, de 18 letras) |
| `formas` | una figura por corchea sobre el color, con sus satélites girando | **`figuras`**: de 2 a 8 de `circulo`, `cuadrado`, `triangulo`, `rombo`, `pentagono`, `play`, `cruz`, `estrella`, `anillo` |
| `trama` | el campo de arcos que se vuelve a tirar en cada corchea | `texto` (24 letras, encima) |
| `tarjetas` | un racimo de paneles oscuros que entran en perspectiva | **`tarjetas`** (de 2 a 6 títulos de 28 letras), `texto` (30, encima) |
| `cifra` | el número que sube en un pulso y su pie | **`texto`** (12 letras, con su unidad), `pie` (24) |
| `cierre` | asterisco, marca y su pie, con el anillo que se abre | `pie` (34 letras) |
| `imagen` | una imagen generada, metida en la paleta del plano | **`pide`** (en inglés, una frase), `trato`, `texto` (30, encima) |
| `clip` | una animación generada, cortada al compás | **`pide`** (en inglés), `sigue`, `trato`, `texto` |
| `modelo` | un objeto de la biblioteca 3D girando en su panel | **`modelo3d`** (el id), `texto` (debajo) |

Un video que se lee bien alterna: abre con `destello` o `titular`, mete una demostración (`panel`, `formas`,
`tarjetas`, `cifra`), respira con `trama` o `frase`, y cierra. De 6 a 12 planos.

## Material generado

- **`imagen`**: la genera Flow (`generar_imagen`, **sin créditos**) o ChatGPT, según la línea `Imágenes:` del mensaje.
- **`clip`**: lo genera Flow (`generar_video`) con lo de la línea `Clips:`, que llega como `--clips "<modelo>"`
  (y `--resolucion`, `--tope`). **Gasta créditos del usuario**: de 6 a 100 por clip según el modelo. Como mucho
  4 compases (un clip de Flow dura 8 s). Con `"sigue": true`, Flow lo anima desde el último cuadro del plano
  anterior: la pieza no salta al entrar al material.
- **`modelo`**: sale de `skills/modelos-3d` y no gasta nada. Búscalo antes con
  `python -B -X utf8 <skills>/modelos-3d/scripts/modelos.py buscar <palabras>`; si no está, el plano no es `modelo`.
- **`pide`** va **en inglés**, una frase con el sujeto y el encuadre. No escribas cómo se ve (luz, fondo, «no text»):
  eso lo pega el estilo solo. `trato`: `duotono` (el de serie: la imagen entra en la paleta), `completo` (a color) o
  `tarjeta` (dentro de un panel).
- `hacer.py --revisa` dice **antes de gastar** qué va a pedir y cuánto cuesta. Lo ya generado no se vuelve a pedir:
  cambiar una palabra de un `pide` es otro pedido, repetir el video no gasta nada.
- Si algo no sale (sin cuenta, sin créditos, el proveedor frena la cuenta), el plano se queda con su texto o con una
  trama del estilo y el video termina igual; `hacer.py` dice cuál y por qué, y no gastó nada.

## Voz

El estilo es de música, como sus referencias: **sin la línea `Voz:` en el mensaje, el video no lleva voz** y no
llamas a ningún proveedor. Con ella (o si el usuario la pide), `"voz": true` en `momentos.json`,
`guion.md` con lo que se dice y cada momento con su **`palabra`** (de una a tres palabras del guion, tal cual; `vez`
si se repite) en vez de `compases`. El plano entra cuando la voz la dice, **pegado a la corchea** para que el corte
siga cayendo en el ritmo, y la música se mete debajo sola. La línea dice de dónde sale ([VOZ.md](../video-base/VOZ.md)): `hacer.py --studio <Voz>` la genera en AI Studio y
`--audio <archivo>` usa la que mandó el usuario. Se guarda: corregir un plano no la vuelve a pedir; cambiar el guion, sí.

## Los pasos

1. Escribe `momentos.json` en la carpeta de la línea `Carpeta:` del mensaje (sin ella, `motion-<tema>`). Los textos
   en español, cortos y en el idioma del usuario; cada plano enseña lo que su texto dice.
2. `python -B -X utf8 <skill>/scripts/hacer.py --revisa` (menos de un segundo) hasta que diga ✓: dice todo lo que
   falla de una vez.
3. `python -B -X utf8 <skill>/scripts/hacer.py` **en segundo plano** y termina tu mensaje: te avisa al acabar. Un
   vertical de 20 s sin material tarda unos 40 s; con una imagen generada, unos tres minutos (lo que tarda el
   proveedor, mientras tanto se hacen la música y la portada). Súmale lo del mensaje: `--imagenes chatgpt` o
   `--imagenes "<modelo>"` (línea `Imágenes:`), `--clips "<modelo>" --resolucion <r> --tope <n>` (línea `Clips:`),
   `--studio <Voz>` o `--audio <archivo>` (línea `Voz:`), `--pista <archivo>` si el usuario mandó su música.
4. Mira `revision/hoja.png` y `portada.png`: que cada texto se lea entero y que ningún plano quede vacío. Otro render
   solo si algo de verdad no se ve, todo en una vuelta (la música y los cuadros que no cambiaron no se repiten).
   Para mirar un encuadre sin renderizar, `hacer.py --fotos` deja un cuadro por plano en `revision/fotos/`.
5. Entrega la ruta de `out/motion-graphics.mp4`, cuánto dura, el proceso en una línea, y que el audio no lo oíste.

[`ejemplo/momentos.json`](ejemplo/momentos.json) es el carrete de referencia escrito así.
