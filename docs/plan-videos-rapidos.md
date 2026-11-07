# Videos rápidos: el plan, con el Explicativo de piloto

Plan acordado el 3 de noviembre de 2026. Que un video tarde menos de 10 minutos, sin perder calidad ni libertad. Se
prueba primero en `video-explicativo`, después lo que sirva se lleva a `video-base` y luego a El Diff, que se cambia
solo con el usuario viendo los cambios.

## Dónde estamos

Se midieron 12 videos explicativos de la app instalada con la hora de cada paso, sacada de las transcripciones de
Claude (`~/.claude/projects/*video-explicativo*`). Tardan de 13 a 82 minutos, con mediana de 36, y el agente hace
entre 125 y 290 vueltas. El modelo pensando es solo una cuarta parte del tiempo. El resto es esperar herramientas, en
fila.

Promedio por video (unos 39 min), según la herramienta que corría en cada momento:

| Fase | min | Qué pasa |
|---|---|---|
| Borradores y revisión | 6,3 | Dos renders a media resolución, fotos sueltas y otra vuelta en cada arreglo |
| Otro | 6,4 | Leer el código de la plantilla (14 archivos en el de El Niño) y scripts de datos de un solo uso |
| Modelos 3D | 4,3 | Buscar, usar y esperar a los subagentes |
| Render final | 4,2 | Debería ser uno de 2 min: se repite por cosas que se ven después |
| Voz y subtítulos | 4,1 | Se genera de 2 a 4 veces porque el guion cambia después |
| Portada | 3,7 | Con IA y reintentos; en un video fueron 17 min |
| Compilar y encuadre | 5,0 | `tsc` y `npm run encuadre`, que vuelve a empaquetar todo cada vez (80–105 s) |
| Escribir el mundo y las escenas | 1,9 | Lo creativo de verdad |
| Investigar | 1,0 | |

Lo creativo cuesta 2 minutos. Lo demás son ciclos lentos de probar y corregir, volver a aprender la plantilla y
repetir lo que ya estaba hecho.

## La forma nueva

1. **Un kit de piezas sueltas, no escenas cerradas.** Cámara, texto palabra por palabra, el personaje, una prueba, una
   cifra, un logo, una flecha. Cada una ya cumple lo de siempre: cabe en el cuadro, entra con la palabra (`en("…")`) y
   usa la paleta. El agente compone con ellas lo que quiera. Una hoja corta dice cómo se usa cada una, y así no tiene
   que leer el código.
2. **Libertad donde importa.** El gancho y el remate se hacen a mano, con código libre. El resto se arma con el kit, y
   lo que el kit no tenga también se escribe a mano.
3. **Lo bueno hecho a mano entra al kit**, como los modelos 3D: cada video libre hace más rápido al siguiente.
4. **Un ciclo de segundos.** El guion queda cerrado antes de la voz, cada cambio se ve en el motor en vivo, un solo
   comando dice en segundos lo que está mal y el render se hace una vez.

La revisión es una sola hoja que mira el agente al final. Lo demás lo revisa el usuario a mano en el estudio.

## Los pasos, en orden

Cada paso se mide antes de pasar al siguiente (ver «Cómo se mide»).

### 1. Medir

- `scripts/medir-videos.mjs`: la tabla de arriba, para cualquier estilo y para Claude o Codex. Es la vara del antes y el
  después.

### 2. Borrar

- **El juez de parecidos**: el subagente y `revision/parecidos.jpg`. `huellas.py revisar` se queda, porque es un script
  y tarda segundos.
- **Los borradores renderizados** (`final.py --borrador 1/2`): los reemplaza la hoja del motor en vivo (paso 4).
- **La portada con IA de primera**: va primero `portada_sin_ia.mjs`, y con IA solo si el usuario la pide.
- **De los documentos**: las reglas que un script puede comprobar pasan al comprobador y salen del texto, y también las
  historias de «en nuevo-9…». Hoy son SKILL.md (4.700 palabras), MUNDO.md (3.100), GUION.md (2.300) y LEEME.md (1.700).
  La meta es que el agente lea menos de 4.000 palabras antes de empezar.

### 3. Simplificar: el kit

- `KIT.md`: una línea por pieza (qué hace, sus props y un ejemplo), sacada del código para que nunca quede vieja. Un
  test falla si una pieza exportada no está en la hoja.
- Lo que ya hay entra al kit tal cual: `Prueba`, `Cifra`, `Barras`, `Calendario`, `Navegador`, `Plazo`, `Grafica`,
  `Post`, `Comentario`, `Boton`, `Cursor`, `Numero`, `Canal`, `Flecha`/`Ancla`, `Subrayado`, `Resaltado`, `Tecleo`,
  `Contador`, `Entra`/`Aparece`, `Personaje`, `Icono`/`Glifo`, `Insignia`, `Ficha` y `Pildora`.
- Lo que falta se saca de los videos reales: comparar los `src/escenas` de los 12 videos contra la plantilla, y lo que
  se escribió a mano dos veces o más es una pieza nueva.
- `kit.py guardar <pieza>`: sube una pieza hecha a mano al kit, como `modelos.py guardar`.

### 4. Acelerar: el ciclo de segundos

- **`revisar`**: un solo comando que corre el tipado, el encuadre (sin volver a empaquetar), las reglas medibles y la
  hoja de cuadros del motor en vivo, que ya se rearma en un segundo con cada cambio. Devuelve una lista corta. Meta:
  menos de 15 s. **Primero hay que probar** que se pueden sacar cuadros del motor sin ventana y con la GPU. Si no se
  puede, se usa el render a media resolución, pero solo de los segundos que cambiaron.
- **La voz, una vez**: el guion se cierra antes de generarla, con la duración ya calculada.
- **Un render**: `final.py` solo cuando `revisar` sale limpio.

### 5. Automatizar

- Cuando lo anterior funcione, `hacer.py` encadena lo mecánico: voz, alineado, subtítulos, `revisar` y final. Al agente
  le quedan el guion, el material, el gancho y el remate, y la mirada final.

## Lo hecho (3 de noviembre): pasos 1 a 4

- **Medir**: `npm run medir-videos`. Al contar bien las llamadas que corren a la vez, el modelo pensando y escribiendo
  es la mitad del tiempo (~14 de ~30 min en el explicativo, unos 8,7 s por vuelta): bajar las vueltas es la palanca
  principal, más que acelerar cada herramienta.
- **Borrado**: `huellas.py parecidos` y su subagente, `final.py --borrador`, `fotos.mjs`, `Grafica` y `Tecleo` (nadie los
  usó en 12 videos). La portada va primero sin IA. SKILL.md pasó de 4.711 a ~3.400 palabras: la marca y las imágenes
  nuevas se fueron a `MARCA.md` e `IMAGENES.md`, que solo se leen cuando hacen falta. MUNDO.md, de 3.114 a ~2.650.
  SKILL más LEEME siguen en ~5.100, no en 4.000: lo que queda son las reglas del usuario y lo que no se negocia.
- **El kit**: `KIT.md` sale del código con `kit.py hoja` (`comprobar-skills` falla si se queda vieja o si una pieza no
  tiene su comentario); `kit.py guardar` sube una pieza hecha a mano. Entraron las piezas más repetidas a mano en los
  12 videos: cualquier ícono de Phosphor por su nombre (7 videos editaban el registro), `Pildora` y `Numero` con
  ícono, logo o bandera, `Cifra` con nota y fuente, `Prueba` con ícono, `EnMundo` con `en`/`sale`, `Secuencia` e
  `Indicador`. Todos los íconos cuestan 0,4 s más de empaquetado en caliente.
- **El ciclo**: `revisar.py` tarda ~11 s en caliente (tipos, encuadre, ritmo, emojis, la frase del cierre y la hoja con
  lo que dice la voz en cada cuadro), contra ~90 s de los dos borradores. No usa el motor en vivo: `renderFrames` de
  Remotion con un solo empaquetado ya da 22 cuadros en ~4 s con la GPU, y es el mismo dibujo que el render. Llamar a
  `tsc` sin `npx` lo baja de 15 a 5 s. Lo que no mide es si el centro se queda quieto: con pares de cuadros costaba 1 s
  por segundo de video, así que sigue en `final.py`.
- **Visto de paso**: de unos 46 modelos 3D hechos en esos videos, solo 6 llegaron a la biblioteca. El paso 8 ahora pide
  guardarlos antes de entregar.

Medido el mismo día en la copia dev, con Claude Sonnet 5.5 en esfuerzo alto, uno tras otro:

| Pedido | Antes | Después |
|---|---|---|
| Tamal, 30 s | 18,2 min, 82 vueltas, 4 turnos (Codex) | 13,9 min, 50 vueltas, 1 turno, $1,65 |
| Agua, 20 s | 27,8 min, 204 vueltas (Codex) | 14,0 min, 58 vueltas, 1 turno, $1,78 |
| Estafas, 40 s | 24,4 min, 109 vueltas, $2,71 (Sonnet) | 20,9 min, 84 vueltas, $3,76 |

Ninguno renderizó borradores, y en ninguno se ve ya el tiempo de leer la plantilla. El usuario los vio: quedaron
decentes. Lo que salió de esos tres, ya arreglado:

- **La voz, tres veces en el de estafas**: el guion salió para 61 s y se recortó dos veces después de generarla
  (~3 min). La regla decía 3.7 palabras por segundo y la voz real, ya acelerada, va a 3.3–3.5: ahora
  `subtitulos.py --dura <s>` lo cuenta a 3.4 y dice cuántas palabras sobran o faltan antes de pedir la voz (para el de
  estafas dio 39 s; la voz duró 40.2).
- **El kit dependía del guion de cada video**: `escenas/comun.tsx` importaba `monedaEn` y `precioEn` por
  `PrecioPegado`, y al reescribir el guion sin moneda dejaba de compilar. `PrecioPegado` se fue a `escenas/index.tsx`,
  con el gancho de la moneda de ejemplo.
- **Lo hecho a mano sin guardar**: el del tamal dejó la olla, el metate y el vapor (3D) en `src/piezas/`, y el del agua
  su laboratorio sin guardar. `final.py` ahora dice qué modelos y piezas quedaron fuera de la biblioteca y del kit, y
  `kit.py guardar` rechaza lo 3D.
- **Costo**: el de estafas costó más ($3.76) por tres modelos 3D nuevos, que quedaron en la biblioteca y no se vuelven
  a pagar. Los 6 subagentes de lectura web duraron menos de un minuto cada uno. No se tocó.

Segunda medición del de estafas, con eso arreglado: 23,7 min, 69 vueltas, $4,18. La duración ya se ajustó antes de la
voz (dijo 42 s y se recortó a 39), pero salió más lento por dos cosas que también se arreglaron:

- **La voz leyó en alto «Corte de datos»** y hubo que repetirla: `textoParaVoz` (`shared/voz.ts`) decía hacer lo mismo
  que «Copiar» y no quitaba esa línea. Ahora «Copiar» usa la misma función.
- **Cuatro renders finales** porque el final salía quieto (31 %, 30 %, 25 %): `revisar.py` no lo medía. Ahora
  `revisar.py --movimiento` lo estima con un cuadro de cada tres (13–24 s): en los cuatro videos quedó a ±1 punto de lo
  quieto de `medir.py`, y el movimiento, por 1,4, a ±0,1 (en uno, 0,4 por debajo). La rapidez de la cámara sola no
  servía: lo quieto depende también de lo que entra y sale.

Tercera, con eso: 22,0 min y $3,51. La voz y el render ya salieron a la primera, pero se fueron ~6 min en leer el motor
(`Video.tsx`, `Mundo.tsx`, `encuadra.ts`) y en quitar la moneda de ejemplo, que la plantilla traía atada al guion, a la
escena y a las tomas. La plantilla ahora nace sin protagonista (la moneda es un modelo más de la biblioteca), y `KIT.md`
dice qué lee el motor de cada archivo del video.

Cuarta: **17,9 min, 67 vueltas, $2,26, una voz y un render** (antes de todo: 24,4 min, 109 vueltas, $2,71). Entender la
plantilla bajó de ~6 a ~2,4 min. Lo que más queda es darle movimiento: cuatro `revisar.py --movimiento` (~3 min), uno
repetido porque enseñaba «2.6 (≥ 2.6)» con ✗ (era 2,58: ahora van dos decimales). Una cámara más viva por defecto lo
bajaría, pero cambia cómo se ve: lo decide el usuario.

**Parpadeos** (vistos en el de estafas): eran dos cosas. La cámara entraba a la cúpula cruzando sus costillas a 2–3 m
por cuadro, y cada una salía enorme un solo cuadro (3,5–11 % de la pantalla); y la boca del perro abría o cerraba un
solo cuadro de 16 a 48 veces por video. La boca ahora abre con más voz de la que la cierra y dura al menos dos cuadros
(`Personaje.tsx`); la cámara no atraviesa el lugar ("Que no parpadee" en MUNDO.md), y `medir.py` marca con ✘ cualquier
cuadro suelto de más del 2 % (en los cuatro videos, solo los tres reales). Mirarlo con la geometría antes del render no
sirvió: de cerca, lo que se ve cae entre vértices.

Lo que quedaba de los 17,9 min, y lo que se hizo (sin medir todavía):

- **Afinar el movimiento (~3,5 min)**: la deriva por omisión pasó de 6° a 22°, la que el agente acabó poniendo a mano.
- **Esperar la voz (~2 min)**: `voz.py` hace toda la voz de fondo (AI Studio por `/api/voz/generar` o el audio del
  usuario, sin puntas, `alinear.py` y `acelerar.py`) y avisa; el mundo se escribe mientras. Antes eran cuatro o cinco
  llamadas y un `sleep 60`. Al final, la portada sale antes del render (`cuadros.cjs --ancho 1080`) y los modelos se
  guardan mientras renderiza.
- **Rondas de hoja (~3 min)**: `revisar.py` mide las cajas 2D con su tamaño de verdad en los cuadros que saca
  (`mundo/Revisa.tsx`): ✗ si se salen de la zona, quedan bajo el perro o tapan un objeto 3D de su toma. En los cuatro
  videos dio seis avisos, todos de cosas que se ven en la hoja, y ninguno en el tamal ni el agua.

Quinta, con eso (el SMS falso de la AEMET): **17,5 min, 76 vueltas, un render**, sin ✘ ni parpadeos. La voz se hizo de
fondo (lanzada a los 3,8 min, lista a los 4,7) y el movimiento pasó al segundo `--movimiento` (antes, al cuarto). Lo
ganado se fue en tres cosas:

- **~2 min leyendo código** que KIT.md ya cuenta (el ejemplo de Berachain, `EnMundo`, `proyectar`, `encuadra.ts`).
- **~1 min por un aviso falso**: la pantalla de un celular, una caja 2D dentro de su celular 3D, contaba como que lo tapaba,
  y el agente la esquivó copiando `EnMundo` sin su marca. Ya no cuenta lo que cabe dentro de su objeto.
- **`revisar.py` a 30–55 s** en vez de 14–22, porque dos subagentes de modelos dibujaban sus vistas a la vez. El chequeo
  de cajas cuesta 0,2 s.

Arreglado (sin medir todavía): `guion.ts`, `Escena3D.tsx` y `escenas/index.tsx` de la plantilla traen en su cabecera un
ejemplo corto de cómo se escriben (lo que se iba a buscar a Berachain); `modelos.py usar` imprime la cabecera de cada
modelo (qué mide, su origen, sus props) y `voz.py`, cada palabra con su segundo; y `modelos.py vista` dibuja con
prioridad baja (en Windows se pide al lanzar node: bajar la del propio Python no pasa a sus hijos).

Sexta, con eso (el ahorrador de luz de enchufe): **13,1 min, 58 vueltas, un render**, sin ✘ (quieto 15 %, movimiento
2,55). Ya no abrió el ejemplo de Berachain ni el código del kit; `revisar.py` tardó de 10 a 33 s. Quedan dos esperas
pequeñas: pidió la voz con `generar_voz` y después con `voz.py --studio` (18 s de más), y esperó con `sleep` lo que
mandó de fondo con `nohup` (`voz.py`, `final.py`). Las dos vienen del texto: VOZ.md daba la herramienta y el script
como iguales, y «en segundo plano» no decía cómo. Ahora VOZ.md dice que con script se usa solo el script, y SKILL.md
que el segundo plano es el que avisa al terminar (`run_in_background` en Claude; Sloth le abre turno al acabar), no
`nohup` con `sleep`.

Séptima, con eso (el test del agua que sale marrón): **14,6 min, 69 vueltas, un render**, sin ✘ (40,7 s). Las dos
esperas se fueron: la voz se pidió una vez (`voz.py --studio`, 32 s) y `voz.py` y `final.py` fueron con
`run_in_background`, sin `nohup` ni `sleep`. Lo que subió viene de otro lado: escribió él los tres modelos nuevos en vez
de subagentes, abrió el código de un video anterior (~45 s), y `revisar.py --movimiento` falló dos veces por «parado
4.00 s» sin decir dónde, así que abrió `revisar.py` para buscar el tramo.

Arreglos: `revisar.py --movimiento` y `medir.py` dicen de qué segundo a qué segundo va lo parado, y SKILL.md («El kit
para el medio») dice que no se abre la plantilla ni otros videos (en una serie, solo el `guion.ts` y las escenas del
anterior). Los tres pedidos otra vez, todos sin ✘ y con un render:

| Pedido | Antes (Claude) | Ahora |
|---|---|---|
| Tamal, 30 s | 13,9 min, 50 vueltas | 12,9 min, 63 vueltas |
| Agua, 20 s | 14,0 min, 58 vueltas | **7,1 min, 48 vueltas** |
| Estafas, 40 s | 13,1–14,6 min, 58–69 vueltas | 19,4 min, 78 vueltas |

Los tres abrieron la plantilla (el de estafas, `comun.tsx`, `EnMundo.tsx`, `tiempo.ts`, `icono-3d.tsx`; el tamal y el
agua, `tiempo.ts`, `Personaje.tsx`, los dos `comun.tsx`, `Mundo.tsx` y el ejemplo de Berachain). El de estafas
pensó 11,6 min y `revisar.py` tardó hasta 62 s porque Google Fonts no contestaba (un `curl` a fonts.gstatic.com se quedó
en 15 s). Ninguno falló el movimiento, así que el aviso nuevo no se llegó a usar. En el del agua, `alinear.py` se cayó
cuando lo que le faltaba a Whisper llegaba al final del audio (`silencio()` con un tramo vacío): arreglado en la
plantilla.

Por qué abrían la plantilla: buscaban lo que `KIT.md` no decía. `kit.py` sacaba las funciones sin sus parámetros (el
`)` que las cierra bajaba la cuenta de paréntesis antes de mirarse), y faltaban `d0` y `K`, si `en()` acepta frases y
qué vez, `Ventana`, en qué va `giro`, cómo se escribe el cierre con `Canal`, `Tramo`, `useColores`, `sujeta` y `suave`.
Y la regla prohibía `tema.ts` y `capitulos.ts`, que el agente tiene que editar. Con eso en `KIT.md` y la regla nombrando
lo que no se abre (y dejando `tema.ts`, `capitulos.ts` y las poses de `personaje.json`), los tres otra vez:

| Pedido | Antes | Ahora | quieto, movimiento, parado | Renders |
|---|---|---|---|---|
| Tamal, 30 s | 12,9 min, 63 vueltas | 11,2 min, 49 vueltas | 6 %, 4.50, 1.4 s | 1 |
| Agua, 20 s | 7,1 min, 48 vueltas | 10,0 min, 47 vueltas | 10 %, 3.19, 1.1 s | 1 |
| Estafas, 40 s | 19,4 min, 78 vueltas | 19,2 min, 73 vueltas | 12 %, 2.69, 1.3 s | 2 |

Ninguno leyó ya un archivo entero del kit ni el ejemplo: solo la lista de `export` de `comun.tsx` y `ui.tsx` (por
`useColores`, ya en `KIT.md`) y, el agua, un `grep d0` en `EnMundo.tsx` mientras arreglaba una tarjeta chica. Los
`modelos/comun.tsx` que se leen son de los subagentes que modelan (skill modelos-3d). Lo que queda: el de estafas
renderizó dos veces porque el final salió con 2.39 de movimiento, cuando `revisar.py --movimiento` había estimado
2.61–2.63 (se pasó por 0.23, más que el ±0.1 de su cabecera), y con un parpadeo a los 21.53 s; y el tamal esperó a un subagente con un `until … sleep 15`
sobre el log de `final.py`.

Los dos, arreglados. `revisar.py --movimiento` saca todos los cuadros en chico (juntos en un archivo: abrir 1.265 jpg
recién escritos costaba 17 s en Windows) y les pasa el código de `medir.py`; en seis videos el movimiento quedó entre 0.92
y 0.99 del final, nunca encima. Y Sloth frena en Claude (hook de `server/claude.ts`) un `sleep` de 5 s o más y, de fondo,
cualquier bucle que espere: el de estafas lanzó un vigilante con `sleep 4` que nunca encontró lo que buscaba y dejó el
hilo «trabajando» 15 min de más. Con eso: tamal 16,0 min, agua 8,8 y estafas 12,5 (65 vueltas), un render cada uno,
sin ✘ y sin esperas; el estimado, siempre por debajo del final (3.96 → 4.24, 3.37 → 3.65, 4.65 → 4.81).

## El director (5 de noviembre): el agente ya no programa el video

Meta del usuario: 5 minutos, 80 % menos de costo y que se vea en TikTok. El tiempo se iba en escribir el mundo a mano
(~25 KB de código por video, ~3 min), en las rondas de `revisar.py` (~3 min) y en los subagentes de modelos (2,4 M
tokens en el de estafas). Ahora el agente escribe tres archivos (`guion.md`, `fuentes/investigacion.md` y
`momentos.json`: qué cosa, qué tarjeta y qué pose en cada palabra) y corre `hacer.py` de fondo, que comprueba, trae los
modelos, hace los subtítulos y la voz, renderiza, mide y pone la portada. El director de la plantilla (`src/director`)
saca de `momentos.json` el mundo (una fila: cada cosa en su hueco, cada visita uno nuevo), las tomas, los capítulos,
las poses, las tarjetas, los sonidos y el cierre. Se borraron `MUNDO.md`, `GUION.md`, `revisar.py`, `cuadros.cjs`,
`render_web.mjs`, `encuadre.ts`, `Revisa.tsx` y el ejemplo de Berachain; SKILL.md bajó de 3.700 palabras (más las
~10.000 que había que leer) a ~2.100.

| Pedido | 4 de noviembre | 5 de noviembre |
|---|---|---|
| Tamal, 30 s | 16,0 min, $2,70 | 3,7 min, $0,49 |
| Agua, 20 s | 8,8 min, $1,34 | 2,8 min, $0,38 |
| Estafas, 40 s | 12,5 min, $3,46 | 5,0 min, $0,66 |

Lo que se aprendió en el camino, ya en el código: medir cada modelo en una copia quieta en el cuadro 0 (medido en el
cuadro de cada pestaña de Chrome, la olla que hierve cambiaba de tamaño y parpadeaba); una tarjeta más ancha que la
zona útil mandaba la cámara al fondo; rodear algo gris sobre fondo claro no cambia la imagen (por eso la cámara también
se acerca al sostener); volver al hueco viejo de una cosa cruzaba la fila entera en un viaje (parpadeos del 13 %); la
voz escribe distinto lo que no conoce («tamali»), así que `hacer.py` alinea guion y voz; y `--dura` cuenta las
palabras antes de pedir la voz (3.3 por segundo). Lo que más subió la calidad fue el guion con remates y la foto real
(`imagenes.py`, el og:image de la página de la noticia).

Lo que falta para que entretenga como un video que se comparte: el mundo es una fila de íconos sobre un piso vacío. El
usuario eligió seguir con el mundo 3D. Se probó un escenario de la biblioteca de fondo, repetido tras la fila, y se
quitó: sus paredes tapaban las cosas. Quedaron un círculo de luz del color `luz` bajo lo que se dice (sin luz de
verdad: cada luz que entra recompila los materiales, y el render pasó de 49 a 93 s), el golpe de cámara y del perro en
las poses de remate (`REMATES` de `Personaje.tsx`), de dos a tres fotos reales y un protagonista de la biblioteca que se
transforma. Después, el titular del gancho (`director/Titular.tsx`: la primera frase en mayúsculas enormes, palabra por palabra,
la última del color de la luz, en dos renglones como mucho), la foto encuadrada sola (con su cosa debajo las dos
salían chicas), dos fotos reales obligatorias en `hacer.py` (o `sin_fotos` con el porqué) y un reintento cuando AI
Studio cierra su página. Con eso, tamal 3,4 min y $0,39, y agua 3,6 min y $0,44; las estafas siguen en 7 min y ~$1,
casi todo eligiendo el tema de la serie (tres rondas de búsquedas). El mejor de la tanda anterior fue el de la pulsera antimosquitos (dos fotos, el logo de la OCU, «Tu muñeca,
protegidísima. El resto de ti, de buffet.»): 6,3 min y $0,76.

Con esfuerzo medio (mismo Sonnet 5.5), los tres en 2,9–4,3 min y $0,27–0,38 ($0,33 de media, 87 % menos que el 4 de
noviembre), con guiones igual de buenos: la card ya va así en «Optimizado» (`modelos` en `cards.json`); sin eso iba en
Opus high. El usuario mandó cinco explicativos de 3D que pegan (0,8–38,6 M vistas): lo que tienen y la vara con que se
califica están en `skills/video-explicativo/REFERENCIAS.md`. De ahí salieron `accion` (la cosa repite lo que hace: el
martillo que pega) y el contador vivo (`contador` y `cuenta`), y en el guion la cadena «entonces… pero…» y el
«Mándaselo a quien…». La tanda que los estrenaba se cortó: AI Studio respondió 429 (la cuota del día, tras ~25 voces).

El usuario pidió dirigirlo como un set de Blender: escenas, planos, luz y animaciones con sentido. El director ahora
tiene `escenas` (lugares con su `luz` y su `fondo`, cuyas cosas se quedan puestas en su `en` y la escena se arma),
`camara` en cada momento (plano general, medio, primero o detalle; ángulo; lente; dolly, alejar, órbita, grúa o
travelling; corte) y la guía en `skills/video-explicativo/CINE.md`; `hacer.py` exige escenas y planos en la mitad de los
momentos (con esfuerzo medio, dos de tres agentes se los saltaban siendo opcionales), y modelos-3d pide mirar un video
real de la acción antes de animarla. Con eso, el del agua (5 escenas, 15 planos) quedó en 8 en todo. Un primer plano
de un momento con foto apuntaba a la tarjeta (que no sale en ese plano) en vez de la cosa: arreglado.

En los primeros planos y los detalles el perro se va chico a la esquina de abajo (como la cámara del que reacciona) y la
toma usa el cuadro hasta abajo: en su sitio tapaba el tercio de abajo de esos planos. Lo de más de 1,8 m es escenografía
y no hace acciones (la mesa del tamal temblando parpadeaba hasta el 34 %), y el plano general encuadra también la
tarjeta del momento.

Un momento con tarjeta en `primer` o `detalle` perdía la tarjeta sin aviso (en el tamal, el rodillo del gancho y el
candado de la vitamina): ahora la tarjeta gana y el plano pasa a medio. Los iconos van a 230 px (a 150 se perdían), y
el remate final repite la tarjeta o la cosa del gancho. Rehecho con su voz, el tamal sube a 9 en claro; divierte y
enseña siguen en 8 (el chiste es suave y no nombra la vitamina, la niacina).

Tanda con temas nuevos (esfuerzo medio, costo de los transcritos a precio de Sonnet, contra $3,50–5,92 de los del 4 de
noviembre con la misma cuenta): el pan 5,5 min y $0,60, el baño de pies «detox» 6,7 min y $1,35 (dos subagentes) y el
microondas $0,97 sin la voz (429). El pan, con el mejor guion («tu masa nace medio borracha», «eructos congelados»), se
quedó en 7 porque eran íconos sueltos: se saltó la pieza central. `hacer.py` ahora la exige (el 40 % de los momentos
enseña un modelo 3D), y con un 429 de AI Studio ya no reintenta. Rehecho con su pieza ($0,91 y 8,8 min más) salió peor:
el subagente hizo «la hogaza en la mesa», como el ejemplo del paso 1 decía, y escalada por su caja la mesa dejó el pan
diminuto. El ejemplo ahora pide el objeto mismo, sin mesa ni base; sin la mesa, la masa llena el cuadro, crece, se dora
y se abre, pero sigue siendo una bola lisa: un modelo de 4 minutos no llega a 9.

El usuario eligió una biblioteca pulida de lo que más se repite, y que lo que falte se haga al vuelo avisando que salió
menos pulido (paso 5 de SKILL.md). Primeros cinco, de ~18 min cada uno con un agente que itera mirando su vista:
`laptop`, `tarjeta-bancaria`, `candado` (9 a ojo), `billetes` (8,5) y `hogaza` (8). Con la hogaza pulida el pan sube
de 7 a 8–9: la masa burbujea, se dora con su greñado y se abre con su miga. Lo que le queda es del director: en plano
medio la cámara encuadra la cosa a su tamaño final, y la masa que aún no crece sale chica con aire alrededor (CINE.md
ahora dice ir en `primer` o `detalle` mientras tanto).

El microondas, con voz al fin, tumbaba el render: un momento en «sígueme en Instagram» caía dentro del cierre y su
tramo acababa antes de empezar. El director ahora ignora lo que cae en el cierre. Quedó en 7: el `detalle` apunta a lo
alto de la cosa (bien para la olla del tamal, mal para el microondas, que enseña su techo blanco), y la lasaña y el plato
que gira no se ven.

Tanda con la biblioteca pulida (6 nov, 01:00 UTC): el chip de la tarjeta, el pan de ayer y una estafa del Buen Fin.
Usaron `tarjeta-bancaria`, `candado`, `hogaza`, `laptop` y `celular` sin hacer piezas: 2,5, 2,5 y 3,8 min hasta la voz
(más ~1,3 min de render) y $0,60, $0,60 y $1,17, de 75 a 87 % menos. Los guiones, de 9 («robar un boleto ya picado», «una
piedra con alberca», «tus datos, en cambio, puntualísimos»). Los tres se pararon en el 429 de AI Studio. En vistas
mudas (tiempos a 3,3 palabras por segundo, sin entregar): el chip, 9 casi en todo; el pan de ayer, 8 (íconos sueltos
para el almidón y los cristales); el Buen Fin, 7, porque el `celular` viejo era negro sobre negro y la pantalla de la
`laptop` se blanqueaba con su reflejo. Se pulió el `celular` (pantalla de bloqueo con `mensaje`, `alerta`, `suena`, sin
`pointLight`) y se bajó el clearcoat de la laptop: el Buen Fin sube a ~8; el celular sigue chico en plano medio.

Con voz (6-nov, otra cuenta de AI Studio): lo que faltaba era del director y del pedido de cosas, no del guion.
- La cámara encuadraba cada cosa con una esfera, y lo alto y delgado quedaba en un tercio del cuadro aun en primer plano.
  Ahora `modelo.json` puede traer `caja` (ancho, alto, fondo; `modelos.py guardar --caja`), hacer.py la pasa en `CAJAS`
  y `radioDe` encuadra la silueta. Con un medio de algo alto, o un primer plano que su tarjeta pasa a medio, el perro se
  va a su esquina.
- En una escena con muchas cosas, lo de delante tapaba lo que se decía (el banco frente a la laptop). Ahora lo que queda
  entre la cámara y la cosa del paso se encoge hasta irse (`tapa`); apagado, quedaba su silueta negra.
- El agente usaba tres celulares para tres ideas y un celular como «la pantalla» que se compra, sin escribir el mensaje
  falso en su pantalla. Va en SKILL.md: un objeto, una cosa; si el modelo dice algo, se dice.
- La hogaza arrancaba en `dorado` 0, masa cruda: lo animado arranca en 0 si no va en `props`.
Dos pedidos nuevos con todo esto, a medium, del pedido al mp4: el celular que se calienta, 2,5 min y $0,66 (−86 %);
el código de WhatsApp, 3,3 min y $0,56 (−88 %).

«¿Me divierte?» se quedaba en 8: los remates informaban («les pide dinero a tus contactos»). Va en SKILL.md que el que
hace reír es una escena con alguien que todos tienen («y tu tía le deposita dos mil pesos a tu foto de perfil»). El
siguiente pedido, sin tocarlo, ya los escribió así («Y tu tía jura que fue el pozole. El pozole, pobrecito»), pero para
pasar la regla del 40 % de modelos estiró los de la biblioteca: un tamal en «el taco», un medidor en «tu reloj», un vaso
de agua en «la glucosa». La regla y el error de hacer.py ahora lo prohíben, y el que vino después hizo su pieza al vuelo
(la pierna del nervio, 4,4 min y $1,00, −79 %) y avisó, como se pidió; se ve menos pulida (un cilindro con una caja) y el
ícono de la silla no se lee. Lo que falta es la biblioteca: con la pieza ya pulida, el video baja a ~3 min y llega a 9.
Otros dos arreglos del director: el perro ya no vuelve a su sitio entre dos pasos seguidos en su esquina (los
«parpadea» del 3–5 %), y un plano `fijo` largo se parte como uno sin movimiento.

Biblioteca (6-nov): `pierna-nervio` pulida, `plato-tacos`, `reloj-despertador`, `persona` (con `rol`: tía, ladrón,
jefe) y `cerebro-orexina` hecho cerebro de verdad, cada uno de 8 a 9 en «se reconoce». Lo que se arregló viendo los
siguientes ocho pedidos sin tocar:
- El director: los íconos y los modelos con `frente` (modelo.json) giran hacia la cámara (20° y 40° como mucho); dos
  cosas de una escena en el mismo sitio se apartan; `fijo` respira un poco; el titular entra al 125 % y no al 160 %
  («TU PIERNADORMIDA», «RETENIDOPAGA»); la portada toma su fondo cuando el titular ya se fue.
- hacer.py se niega a: una foto casi negra (y imagenes.py pone lo transparente sobre blanco: la adenosina salió
  negra), un celular que no enseña el mensaje del que habla el guion o que tiene la `alerta` prendida casi todo el
  video, un `mensaje` sin espacios y una `persona` tía o ladrón sin su `rol`.
- SKILL.md: quién sale en el remate lo pide el tema (la tía se colaba en todo); un ícono que no es el objeto (un
  matraz por hígado) tampoco va; la pieza central, compacta y de pie.
Los dos últimos, sin tocarlos: el bostezo (2,9 min, $0,54, −89 %: «bostezar con tu suegra ya es confianza») y el trabajo
por likes (3,3 min, $0,76, −84 %: «como trabajar de mesero y pagarle al restaurante»), de 9 en todo a ojo. De los
ocho, el promedio fue $0,86 (−82 %) y ninguno pasó de 5 min; con pieza al vuelo, uno llega a $1,17 (−75 %).

El audio, medido (voz.json y ebur128): todos a −14 LUFS con picos de −2 a −3 dBFS, bien para TikTok; lo que fallaba
era el tiempo del chiste. acelerar.py dejaba 0,18 s en toda pausa y, con el tempo, el remate llegaba 0,24 s después de
la frase (paquetería). Ahora tras un punto deja 0,30 (~0,38 medidos) y tras una coma 0,20: de 180 a 215 palabras por
minuto, y hacer.py cuenta 3,1 por segundo (30 s ≈ 93 palabras). Con 0,40 el bostezo cayó a 177 por minuto: lento.
`persona` con pelo de verdad (ya no casco) y la cabeza un poco más chica. Dos pedidos más sin tocar: el soporte técnico
falso (3,2 min, $0,74, −84 %, 9 en todo) y el hipo (4,1 min, $1,09, −77 %, con pieza al vuelo: el diafragma salió
abstracto, 8 en claro). Lo que queda abajo de 9 es casi siempre una pieza hecha al vuelo.

Piezas del cuerpo a la biblioteca: `pulmones-diafragma`, `estomago`, `corazon` y `articulacion` rehecha como dedo de
pie con el nudillo abierto. Los mismos dos temas otra vez, sin tocar: el hipo, 4,3 min y $0,53 (−89 %), con los
pulmones en vez de la cúpula abstracta; los dedos, 3,4 min y $0,67 (−86 %), con el dedo que ya se lee («Regañaban a
una burbuja»). Los dos de 9 en todo a ojo y con el audio medido. marca.py ya no responde «sin marca» si el agente
hizo `cd` a la carpeta de las skills: los dedos se habían parado a preguntarle al usuario el nicho y la red.

**Revisión a ciegas (6-nov).** Un agente aparte, sin ver mis notas, calificó nueve videos viejos y nuevos por su hoja, su
guion y su portada: ninguno llega a 9. Los nuevos, de 5 a 8; los viejos, de 4 a 7. Mis 9 eran de más: yo juzgaba lo
que había arreglado, no lo que ve el que va pasando. Lo que repitió en casi todos, y lo que se hizo:
- La portada llevaba de fondo un cuadro con subtítulos (y su recuadro de la palabra, que parece de editor) y el título
  de guion.md, que delata («El falso premio»). Ahora, en vertical, la portada es el cuadro del gancho con su titular
  entero; el titular sale completo en el primer medio segundo, y hasta con diez palabras.
- Cinco de nueve abrían con una foto quieta: el primer momento es ahora el protagonista 3D haciendo ya lo que sorprende
  (hacer.py lo exige) y las fotos van después, como prueba.
- Tarjetas que dicen otra cifra que la voz («38» por «la mitad», 35→50 por «sesenta años»): va en SKILL.md.
Lo que falta y no es de código: datos mal citados (Unger tronó más de sesenta años, no cincuenta), un solo chiste por
video, objetos que entran y se van en vez de una acción que no para, y un contador vivo. Es el siguiente paso.

Se probó un crítico a ciegas dentro de la skill (un subagente con el mismo modelo calificaba el guion antes de la voz) y
se quitó: la cebolla salió 5/6/4/5/7 para el revisor de fuera, peor que el premio sin crítico (6/7/7/5/5), y costó
$1,61 (−66 %) y 6,3 min. Un crítico del mismo modelo no ve lo que el de fuera sí. Lo que el revisor pide de verdad es
escritura (tres remates que se vean, una acción que no para, el dato sorprendente primero) y escenas que se arman con
una pieza que actúa; con Sonnet a medium no llega. Probar el guion con un modelo más fuerte es decisión de costo.

Después: el paso 5 y llevar lo que sirva a `video-base` y a El Diff.

## Cómo se mide

- Los mismos tres pedidos en la copia dev, antes y después de cada paso: «un video de 30 segundos sobre cómo se hace un
  tamal», «20 segundos sobre cómo se hace el agua» y «40 segundos de la serie Desmontando estafas».
- Se anotan el tiempo, las vueltas y el costo con `medir-videos.mjs`, y el usuario compara los videos lado a lado.
- **Meta: un video de 30 s en 10 minutos o menos, con 40 vueltas o menos, y que a ojo se vea igual o mejor.**

## Lo que no se toca

- Lo que el usuario pidió y no se negocia (SKILL.md): el personaje en collage, las imágenes con Codex, la voz suya o de
  AI Studio, el cierre de la marca, los datos verdaderos y que ningún modelo 3D se haga dos veces.
- El Diff, hasta que acabe el piloto.
- Los cambios sin commit que ya hay en el repo: se conservan.

Opus 5.5 a medium para escribir (6-nov, sin voz por el 429; revisor a ciegas, solo guion y momentos): la cebolla sube de
6,0 a 6,6 de media y el iPhone de 5,2 a 6,4, con datos correctos y mejores ganchos. A precio real (Opus $4/$20, Sonnet
5.5 $2/$10; costo.mjs cobraba los $3/$15 de antes, que da el mismo porcentaje contra la línea base del 4-nov): la cebolla
$0,67 (−79 %), el iPhone $1,35 (−57 %, con su pieza hecha al vuelo también en Opus). Ni así llega a 9: lo que falta, según
el revisor, es una escena que se va armando en vez de un objeto nuevo por idea, y eso es del director y de la skill.

Una escena, no un objeto por idea (hacer.py: el protagonista en la mitad de los momentos o más, cuatro cosas como
mucho). Con Sonnet a medium, la cebolla y el iPhone otra vez: $0,51 (−89 %) y $0,64 (−87 %), 2 y 2,5 min hasta la voz. El
revisor a ciegas: la cebolla de 5,2 a 5,6 y el iPhone de 4,6 a 5,6 (el de Opus, 6,4 y 5,4 en esta vuelta: el revisor
mueve ±1 entre vueltas). Ayuda poco pero en la dirección buena, y el de los dedos, el mejor de todos, ya la cumplía: se
queda. Ninguno pasa de 7 en «entretiene»: lo que falta es una acción que no para con un contador vivo desde el primer
cuadro (el cuchillo que pica y las gotitas que suben), y eso pide piezas que actúen solas, no reglas.
Se probó exigir el `contador` en todo video: el de la cebolla inventó uno de lágrimas (0→120) y bajó «enseña»; el del
iPhone, con los pesos que se van en cada cuota, subió «entretiene» a 7, lo más alto hasta ahora. Queda como consejo
(si hay algo verdadero que se cuenta) y se exige solo que el protagonista haga algo en dos de cada tres de sus momentos.

Rediseño, primer paso (6-nov): `accion` sigue hasta que otro momento la cambie (o `quieta`), y una pieza que actúa todo
el video, `cebolla-picando` (el cuchillo pica dos veces por segundo; `filo` 0 aplasta y suelta cinco veces más
gotitas). Prototipo a mano de la cebolla con la receta del revisor: de 5/5/5/4/6 a 7/6/6/6/7 en la primera vuelta; en
la segunda, con dos tablas y el contador en 40×, el mismo revisor le dio 6/5/5/4/7 y dijo que «el cuchillo nunca
corta». Desde una hoja de cuadros cada 1,5 s el movimiento no se ve: el revisor no puede juzgar «entretiene» ni el
audio, y mueve ±1–2 entre vueltas. El 9 no se puede medir con hojas: hace falta que alguien vea el video.
Pendiente que sí vio bien: los subtítulos de dos renglones se enciman con el contador («cebolla.» sobre «40×»).
Con tiras de 4 cuadros por segundo el revisor ya ve el movimiento: el prototipo de la cebolla, 6/5/5/6/7 («el cuchillo
pica y el gas sube todo el tiempo: bien»). Arreglos del director de esta vuelta: los subtítulos de varios renglones
crecen hacia arriba si hay contador, y con una tarjeta sobre un modelo el perro se va a su esquina. Lo que pide para
subir (bolsitas de azufre y enzima que se mezclan, un ojo que llora, dos cuchillos con dos contadores) es una escena
hecha a la medida de cada tema: con piezas al vuelo no cabe en 5 min ni en −80 %.
Con las piezas que actúan (`duelo-cuchillos`: dos tablas que pican a la vez con su contador vivo +1 y +40 por corte;
`ojo-lagrima`) la cebolla llega a 7/6/6/7/8, la mejor nota de todas. Arreglo del director: al medir un modelo, la caja
crece con las partes que tocan la pieza mayor (el duelo se medía por una sola tabla y la otra quedaba fuera del cuadro).
Falta, según el revisor: la química vista sobre la cebolla (dos bolsitas que se rompen), el chiste de la abuela con su
imagen, el ajo en 3D con «0 lágrimas», quitar el corazón cuando acaba su chiste (lo de una escena se queda puesto) y el
cierre más corto. Cada vuelta sube ~0,4: es trabajo a la medida de cada video.
Vuelta 4 de la cebolla (química en la cebolla, ajo 3D con «0 lágrimas», etiqueta de la abuela, el corazón con `sale`):
6/5/6/6/7, menos que la vuelta 3 (7/6/6/7/8) con más piezas. El revisor no converge: cada vuelta pide cosas nuevas o
las que ya están (la etiqueta se lee de cerca y no en el plano ancho) y mueve ±1. Con hojas y tiras de cuadros, la
cebolla se queda entre 6 y 7; el 9 no se alcanza ni se puede medir sin que alguien vea el video con sonido.
Queda de esta vuelta: `sale: true` en una cosa (se va al acabar su momento), cinco cosas como mucho por video, y las
piezas `ajo`, `duelo-cuchillos` (`abuela`) y `cebolla-picando` (`quimica`, `mellas`, `etiqueta`).

«Las dos» (calidad y 5 min/−80 %): las piezas que actúan se marcan en modelo.json (`actua`: la prop que las mueve
solas; `modelos.py lista` lo dice y `guardar --actua` lo guarda), hacer.py exige encenderla desde el primer momento del
protagonista, y SKILL.md pide preferirlas. Arreglo de paso: `modelos.py lista` quitaba los espacios de los textos por
omisión (de ahí el «Tupaqueteestáretenido» del celular). Dos pedidos sin tocar, $0,71 y $0,70 (−85 %), 4,8 y 2,5 min
hasta la voz: los dos usaron su pieza encendida desde el primer cuadro, pero el revisor les dio 6/6/3/6/7 (cebolla, no
usó el duelo) y 4/5/6/4/4 (corazón: adrenalina de libro, sin número ni chiste escenificado). La misma cebolla armada a mano
con esas piezas llegó a 7/6/6/7/8: lo que separa es la escritura y la elección de escenas del agente, no las piezas.

## La pauta del usuario (6-nov, con sonido)

El usuario vio los cuatro con voz. La cebolla prototipo («me gustó mucho»): una sola pieza que actúa casi todo el video,
la química vista y el chiste de la abuela; pasa todos los chequeos de abajo. Lo que les vio a los otros, y que vale para
todo video:

1. **Cada animación dice lo que dice la voz.** Un movimiento sin motivo distrae: el celular que late, la gota de «lluvia
   de gotitas» que salta, el rayo que brinca. hacer.py: `late` solo en un corazón, `salta` nunca en un ícono, y lo que
   ya actúa solo (`actua`) no lleva `accion`.
2. **El modelo 3D se ve antes de la primera foto.** En el corazón entró a los 3 s, «al modelo 3D ya no se le permitió
   ver nada». hacer.py: la primera foto, desde el momento 3 y a los 15 palabras; cada foto, 6 palabras o más.
3. **La foto se ve sola.** Lo que estaba detrás (el rayo que saltaba bajo la adrenalina) llamaba la atención. El
   director: mientras hay foto, nada se mueve y lo que está bajo ella se va (`TRAMOS_FOTO`).
4. **Cada imagen es lo que dice el narrador, literal.** «Perdidos en fraudes» con billetes flotando no se entendió, y el
   contador («$6,000 pesos pagados») encima de la cifra («$12,500 M») menos. El director esconde el contador con una
   cifra (`TRAMOS_CIFRA`); la regla de enseñar la estafa misma va en SKILL.md (no se puede medir).
5. **Lo que se mueve, al ritmo de la vida real.** El timbre del celular cambiaba de lado en cada cuadro: «muy rápido, se
   siente raro». Ahora son dos zumbidos de 5 vaivenes por segundo cada 2 s, y la alerta parpadea una vez por segundo.
   Un ícono en `detalle` llena el cuadro de una mancha (el cerebro naranja): hacer.py lo para.

El revisor a ciegas suma estas cinco preguntas a sus cinco notas, momento por momento: ¿qué se mueve y por qué?, ¿se vio
el 3D antes de la foto?, ¿algo compite con la foto?, ¿lo que se ve es lo que se oye?, ¿algo va más rápido que en la vida
real? Un «no» en cualquiera baja «claro» y «entretiene» a 6 como mucho.

El iPhone corregido le gustó «mucho más», con un pero: **el contraste**. La caja (`ajeno`, gris claro) en la escena clara
casi no se veía. El director ahora oscurece (o aclara, en fondo oscuro) el color de un ícono hasta 4.5:1 (7:1 si el fondo es claro, que la luz del día lo aclara) contra el fondo de
su escena (`conContraste` en Escena.tsx). Un modelo trae sus colores: en una escena clara, que no sea uno claro.

**La primera nota del usuario (6-nov, con sonido, tras la pauta y el contraste): lo vería 7, claro 10, divierte 7,
entretiene 8, enseña 9.** Es la primera medición que oye la voz. Claro y enseña ya llegan; lo que falta es el gancho
(«lo vería») y el humor (divierte), y un poco de ritmo (entretiene). La pauta y los chequeos atacaron lo claro: lo que
sigue es del guion y del primer segundo, no del director.
La nota fue de la primera cebolla (`cebolla-te-hace-llorar-2`). Qué le faltó, en sus palabras: «animaciones más
detalladas, o un mejor guion que me recordara a una situación más específica de México; a mí me gusta el humor negro».
Va a la skill (una situación de allá, concreta; el humor de `habla`; la pieza con el detalle de la acción real) y a su
marca: `habla` ahora dice «español de México, de tú, frases cortas; humor negro».
Prueba con la marca nueva (Sonnet medium, solo): `cebolla-te-hace-llorar-5`, 5,2 min y −82 %. Trajo el humor negro y
la salsa del domingo («más que en el velorio de tu abuelo»), pero perdió el gancho («La cebolla es un arma química») y el
dato del cuchillo, y los dos remates salieron sobre una foto de catálogo y el logo de Scientific American. hacer.py ahora
pide que un remate (pose `ladra`, `lentes` o `tapa`) no lleve foto, prueba ni logos; la primera cebolla lo pasa.
`te-truenan-dedos-4` (Sonnet solo, 4,3 min, −88 %): «estuvo muy bien, nada más que el dedo se movía mucho»; él habría
ido «creciendo la burbuja e ir moviendo los huesos, para mostrar de forma visual lo que dice el guion». El dedo traía
`separa` y `burbuja` en 1 desde el gancho, con `tiembla` encima, y en «se separan» y «nace una burbuja» no cambió nada.
hacer.py: un `anima` que no cambia nada es error, y `accion` con `anima` en el mismo momento de un modelo también.

**A/B del guion (6-nov, «por qué pica el chile», las dos con Sonnet medium y la pauta nueva).** A, el agente solo
(`pica-chile`): 6,0 min, $1,38 a la tarifa vieja del script (~$0,92 real), con la pieza del chile hecha al vuelo. B,
el guion de un subagente de Opus (`pica-chile-2`): 6,3 min, $1,23 contando el Opus a precio de Sonnet (más en
realidad). A es más claro y enseña más (los pájaros no tienen el sensor y siembran las semillas; «toma leche»). B trae
jerga («el TRPV uno», «¿quién lo clonó?») y un chiste forzado («llora como en su velorio»); los dos escenifican el
chiste con la persona. Se queda A: Opus para el guion no paga lo que cuesta. Regla nueva: un solo nombre técnico por
video, el que alguien repetiría. Los dos pasaron de 5 min y del −80 % por hacer la pieza del chile; con ella ya en la
biblioteca, el siguiente del tema baja (el de los dedos, con su pieza, fue 4,3 min y −88 %).
El B barato (Opus con un resumen de 12 líneas y esfuerzo bajo, «por qué te ruge el estómago», con la pieza ya en la
biblioteca): 4,8 min y $0,81 a precio real (Opus $0,26, Sonnet $0,55): −75 %. Buen guion («Como el camión de la basura,
pero puntual»; la junta de las nueve con el jefe, escenificada), pero dos fotos eran el logo de Scientific American:
regla nueva, la foto enseña la cosa y el logo va en `fuente`. El agente cerró su turno con hacer.py aún renderizando
(«el aviso llegará solo») y no volvió: no vio su video.
B barato con el ajo (pieza ya en la biblioteca): 8,3 min y $0,89 (−72 %). `--revisa` ya sirvió (cuatro revisiones en
20 s, sin fondo), pero el guion de Opus salió de 37,7 s para 30 y se rehízo con otra voz y otro render (+3 min). El
chequeo de lo largo que describía hacer.py no existía: ahora `--dura` lo para antes de la voz, con 3,4 palabras por
segundo (lo que dice la voz ya acelerada en los seis del 6-nov: 3,2 a 3,6; con 3,1 todo salía largo) y 12 % de margen.
B barato con `--revisa` y el chequeo de lo largo («por qué despiertas antes de la alarma», reloj y cerebro de la
biblioteca): 4,6 min, $0,76 (Opus $0,26, Sonnet $0,50): −76 %, y 29,3 s para 30. Gancho que contradice («No te despierta
la alarma. Te despierta el cortisol»), el 5:59 en tarjeta y el chiste del jefe escenificado. Para el −80 % faltan ~$0,12:
el subagente de Opus cuesta $0,26 por arrancar con su propio contexto, aunque escriba 100 palabras.

**El guionista (6-nov): las dos metas de tiempo y costo, cumplidas.** Un subagente `guionista` en `server/claude.ts`
(Opus, solo Write, tres vueltas) y el paso 3 de la skill que se lo pide. «Por qué te quedas sin aire cuando te ríes»,
pulmones de la biblioteca: **4,5 min y $0,58 a precio real (Opus $0,06, Sonnet $0,52): −82 %**, 32 s para 30. El Opus
general costaba $0,26 por arrancar con 38 mil tokens; el guionista, $0,06. Guion con gancho que contradice («Reírte no
te oxigena. Te vacía»), humor de la marca («Una metralleta, pero de babas»; el velorio de la abuela). Falta: en el
chiste, la persona sonríe quieta en vez de reírse en el velorio.
Segunda prueba, pedido normal («por qué se te acelera el corazón cuando ves a tu crush»): 5,0 min y $0,55 (−83 %), 31,8 s,
pero el agente no llamó al guionista y escribió él («si lo tienes» le dejó la puerta): ahora el paso 3 dice siempre,
con `subagent_type: "guionista"`. Las dos de esta noche cumplen tiempo y costo, con guionista y sin él.
