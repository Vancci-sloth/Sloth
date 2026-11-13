---
name: video-low-poly
description: Hace un video Low-Poly, vertical (TikTok, Reels, Shorts) u horizontal (YouTube), que explica un proceso que pasa en un lugar (un ciclo, un viaje, una cadena de suministro, cómo se alimenta un sistema) en un mundo en miniatura de papel facetado (mar, islote, costa, montes, río, pueblo, campo, bosque). Cada etapa brota en su lugar con su bandera de papel numerada, y una sola grúa de cámara las recorre y al final sale a ver el mundo entero. Lo cuenta la voz del usuario o una de AI Studio. Úsala cuando pidan el estilo Low-Poly, un video de papel facetado o explicar paso a paso un proceso en un mundo en miniatura (el ciclo del agua, del cafetal a tu taza, cómo llega la luz a tu casa).
---

# Low-Poly

Escribes dos archivos y corres un comando: `guion.md` (lo que dice la voz) y `momentos.json` (qué brota en cada palabra
y dónde). El director (`kit/low-poly.js`) arma el mundo, la cámara, las banderas y el sonido, y `scripts/hacer.py` hace
la voz, dibuja cada cuadro, mezcla y pone la portada. **No escribas código ni abras el kit**: todo lo que el video
necesita se dice en `momentos.json`. Si algo no cabe ahí, falta en el director: díselo al usuario.

`<skill>` es esta carpeta. Los scripts van con el `python` del sistema y desde la carpeta del video.

## El estilo (no se negocia)

Es el de la animación de referencia, con su kit de render (`kit/stage.js`) y su kit de sonido (`kit/sound.js`) tal
como vinieron: un mundo en miniatura de formas planas y facetadas, como papel doblado o piedra cortada; cada triángulo
de un solo tono, dentro de una paleta corta de arena, coral y crema contra agua turquesa y verdes salvia. Un sol bajo y
cálido de lado con sombras suaves, un cielo azul que llena las sombras y una bruma durazno que se traga lo lejano. Las
cosas crecen desplegándose faceta por faceta o brotan del suelo con un rebote; el mar respira, las nubes se van tierra
adentro. Una sola grúa de cámara con lente largo y foco corto, como una maqueta. Cada cuadro es el promedio de 64
dibujos: profundidad de campo, desenfoque de movimiento y sombras suaves de verdad. Nada de eso se cambia por video.

## Formato

Sloth manda `Formato: vertical` o `Formato: horizontal` y va en `momentos.json` como `"formato"` (sin él, vertical).
En **vertical** (1080×1920) la cámara, el lente y el acabado son los mismos que en horizontal (se aleja para que quepa), la bandera de un lugar
con cosas va encima de ellas, y lo de abajo (donde la red pone el texto) queda libre; la portada es su primer cuadro.
Con **`Formato: horizontal`** (1920×1080, para YouTube) los encuadres son los de la referencia y la portada es la
miniatura de 1280×720, que no entra en el video. Si piden el otro formato, es otro video.

## El guion

- **Un proceso con de tres a seis etapas que pasan en lugares distintos**, en orden, cada una consecuencia de la
  anterior. Si el tema no pasa en un lugar (una ley, una idea, una noticia), este no es su estilo: díselo y propón el
  explicativo.
- **Termina en el resultado**, no en un eslogan: el agua que vuelve al mar, el café en la taza.
- Frases cortas, una idea por frase, palabras de todos los días; las cifras en letra («cuarenta por ciento»). Cada dato
  es verdadero y de su fuente.
- Dura lo que pide: unas 2,8 palabras por segundo (`hacer.py --dura <s>` lo cuenta antes de pedir la voz).
- `guion.md`: `# Título de dos a cinco palabras` (va en la portada) y el texto en párrafos.

## La voz

La línea `Voz:` del mensaje dice si la generas tú en AI Studio o la manda el usuario ([VOZ.md](../video-base/VOZ.md)).
Con AI Studio, `hacer.py --studio <Voz>` la pide y la espera (no la pidas también con `generar_voz`). Sin `Voz:`, dale
el guion al usuario para que lo grabe y, con su audio, `hacer.py --audio <archivo>`. La voz se guarda: corregir un
momento no la paga otra vez; cambiar el guion, sí. Con voz, el kit de sonido deja fuera la música y el ambiente y baja
los efectos, para que la voz quede encima (así lo trae el kit).

**Sin voz** (si el usuario lo pide así, como la animación de referencia: de 7 a 12 s, solo imagen y sonido): en
`momentos.json`, `"voz": false` y cada momento con su `segundo` en vez de `palabra` (el primero en `0`; `dura`, si el
video debe durar más que el último momento y segundo y medio). `guion.md` solo lleva el `# Título`. El sonido es la
mezcla completa del kit (música, ambiente y efectos) a −15 LUFS, como la referencia. Las banderas cuentan la historia.
[`ejemplo/momentos.json`](ejemplo/momentos.json) es la animación de referencia (el ciclo del agua) escrita así: sale igual
que ella, byte a byte.

## momentos.json

Un momento por cosa que pasa, en la `palabra` que la dispara (de una a tres palabras de `guion.md`, seguidas y tal cual;
`vez: 2` si se repiten). El primer momento es el primer cuadro: su palabra es la primera del guion y lo que trae ya está
ahí desde el inicio.

```json
{
  "formato": "vertical",
  "momentos": [
    { "palabra": "El sol", "en": "mar", "bandera": "Evaporación", "entra": ["vapor"] },
    { "palabra": "se junta", "en": "cielo", "bandera": "Condensación", "entra": ["nube"] },
    { "palabra": "llueve", "en": "montaña", "bandera": "Precipitación", "entra": ["lluvia"] },
    { "palabra": "un río", "en": "rio", "bandera": "Recolección", "entra": ["rio"] },
    { "palabra": "otra vez", "en": "todo", "entra": ["anillo"] }
  ]
}
```

- **`en`**: el lugar del mapa donde pasa (sin él, el del momento anterior). La cámara va sola de cosa en cosa: llega
  justo antes de que brote, la enfoca y se queda quieta mientras crece; lo que viaja (el camión, el barco) lo sigue.
  Entre dos momentos que traen algo, mejor un segundo y medio de voz o más (un cultivo o un pueblo tardan algo más en
  verse enteros): con menos, la cámara se queda menos en lo de antes. Menos de tres cuartos de segundo entre dos
  lugares no deja verlo (`hacer.py` lo exige).
  - `mar`: el mar junto al islote · `cielo`: el cielo sobre la costa · `montaña`: el monte nevado y su ladera
  - `rio`: el río que baja del monte al mar · `costa`: el puerto junto a la playa · `llanura`: el llano del pueblo
  - `valle`: el campo al este · `bosque`: el bosque de pinos en la ladera
  - `todo`: el mundo entero. **El último momento va en `todo`**: la cámara sale a ver todas las etapas con el resultado.
- **`bandera`**: el nombre de la etapa (de una a tres palabras, 16 letras como mucho), en el momento en que empieza. Se
  clava en su lugar con su número, en orden, y es lo que se lee sin sonido. De tres a seis por video, una por etapa, y
  dos como mucho por lugar (la segunda va en el mismo poste, arriba). Sale en la palabra (o el `segundo`) de su momento:
  para que salga cuando ya se ve lo que nombra, va en un momento propio, más adelante, sin `entra` (en la referencia,
  «Condensación» sale 0,85 s después de que empieza la nube).
- **`entra`**: lo que brota ahí, de una a tres cosas (un nombre, o `{ "tipo": "camion", "a": "costa" }`). Se queda hasta
  el final: el mundo se va armando.

| Cosa | Qué es | Dónde |
|---|---|---|
| `vapor` | gotas que suben del agua o del suelo a su nube | mar, costa, rio, llanura, valle |
| `nube` | una nube que se despliega faceta por faceta | cualquiera menos todo |
| `lluvia` | su nube se oscurece y llueve (si no había nube, trae la suya) | cualquiera menos todo |
| `rio` | el agua se despliega río abajo y brotan los árboles de la orilla (sin él, el río ya corre) | rio |
| `anillo` | un anillo de luz que corre por el mar: el resultado, el ciclo que se cierra | mar, costa, rio, todo |
| `arboles`, `rocas` | una arboleda que brota árbol por árbol; unas rocas | costa, llanura, valle, rio, bosque, montaña |
| `casas` | un pueblo de cinco casas que brotan una por una | costa, llanura, valle, rio |
| `cultivo` | surcos verdes y ocres que se despliegan | costa, llanura, valle, rio |
| `molino` | un molino de viento con sus aspas girando | costa, llanura, valle, rio |
| `fabrica` | una fábrica con su chimenea echando humo | costa, llanura, valle, rio |
| `planta` | un brote que crece del suelo | costa, llanura, valle, rio, bosque |
| `faro` | un faro con su luz (en el mar, en el islote) | mar, costa |
| `barco` | un barco de papel que llega al puerto o, con `a`, va de un lugar al otro | mar, costa |
| `camion` | un camión por un camino que se despliega hasta `a` (costa, llanura o valle) | costa, llanura, valle |
| `puente` | un puente de tablas que se arma de orilla a orilla | rio |

  Cuatro cosas como mucho por lugar. Cada cosa enseña lo que dice la voz en ese momento: si ninguna lo enseña, el
  momento no trae cosa (solo la bandera o el cambio de lugar), y no se pone otra que «se parezca»: se hace su pieza.
- **`camara: "cerca"`**: ese momento se acerca a lo que entra (sin su bandera). Úsalo una o dos veces, en lo que importa.

## Piezas a la medida

El estilo cuenta con objetos del tema, como pide su referencia («change the story, the objects and the words; do not
change the look»): el cafeto con sus cerezas, el tostador, la taza que se llena. Lo que el tema necesita y la tabla no
trae se escribe en `piezas/<nombre>.js` del proyecto, una por objeto, y entra con `{ "pieza": "<nombre>" }` en `entra`;
se pone en su lugar y brota como las demás. Es lo único que se programa, y solo eso: el mundo, la cámara, las banderas,
la luz y el sonido los sigue poniendo el director. Se copia de [`ejemplo/piezas/`](ejemplo/piezas/) (`taza.js`,
`arbusto.js`):

```js
registrarPieza('taza', {
  radio: 0.7, alto: 1.5, escala: 1.4,          // lo que ocupa (para encuadrarla y despejarle el suelo) y su tamaño
  crear({ THREE, K, PAL, tone, jitter, facet, merge, faceted, mesh, unfold }) {
    // primitivas movidas (jitter), facetadas con un tono de PAL por triángulo (facet + tone), material faceted()
    return { objeto: grupo, update(t, t0) { /* lo que se mueve: solo función de t, sin Math.random ni relojes */ } }
  },
  sonido(k, t0, { pan }) { k.play('pop', t0, { pan }) },   // sonidos del kit (pop, tock, paper, tape, ding…)
})
```

Las reglas de la referencia valen para la pieza: formas simples bien facetadas antes que un modelo complicado que se ve
mal, solo colores de `PAL`, el material `faceted()` (con `glow` para lo que brilla, como la nube), y nada de texturas,
modelos bajados ni `Math.random` (`K.rng(semilla)`). Mírala en la hoja: si no se reconoce, se simplifica.

## Los pasos

1. Escribe `guion.md` (arriba) con los datos que hagan falta, buscados a la vez. Listo cuando lo leíste como alguien que
   no sabe nada del tema y se entiende a la primera.
2. Escribe `momentos.json` y corre `python -B -X utf8 <skill>/scripts/hacer.py --revisa` (un segundo, sin fondo) hasta
   que diga ✓: dice todo lo que falla de una vez. Listo con ✓.
3. Corre `python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz>` (o `--audio <archivo>`, o nada si la voz ya está)
   **en segundo plano** y termina tu mensaje: te avisa al acabar. Un video de 30 s tarda unos 5 minutos (el render son
   ~0,3 s por cuadro con la tarjeta). Si dice ✗, arregla lo que dice y vuelve a correrlo: la voz y el render que no
   cambiaron no se repiten.
4. Mira `revision/hoja.png` (un cuadro cada 1,5 s) y `portada.png`: que cada lugar enseñe lo que se dice y que su
   bandera se lea. Otro render solo si algo de verdad no se ve, todo en una vuelta.
5. Entrega la ruta de `out/<carpeta>.mp4`, cuánto dura, el proceso en una línea, y que el audio no lo oíste.

El proyecto va en la carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto (sin ella,
`low-poly-<tema>`).
