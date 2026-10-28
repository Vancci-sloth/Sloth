# El mundo 3D, pieza por pieza

Todo el video es un solo mundo 3D (three.js en Remotion) que una cámara recorre sin cortes, con lo 2D clavado en él,
el texto y el personaje (arriba y abajo en vertical; en horizontal, abajo y a la derecha: "Formato" de `SKILL.md`).
Lo que cambia en cada video son cuatro archivos: `src/mundo/guion.ts`,
`src/mundo/Escena3D.tsx`, `src/escenas/*.tsx` y `src/capitulos.ts`. El de Berachain, completo, está en
[`ejemplos/berachain/`](ejemplos/berachain/): míralo para ver cómo se usa cada pieza,
no como molde. El mapa, los capítulos, la pieza propia y el personaje de cada video salen de su enfoque
(`fuentes/huella.json`, ver "El enfoque" en [`GUION.md`](GUION.md)): si el mundo nuevo es el de Berachain con otros
objetos, está mal.

Antes de armar nada, relee "Las reglas de la imagen" de `SKILL.md`: cada decisión de aquí sale de ellas.

## 1. El mapa (`L` en guion.ts)

Metros, con el piso en y = 0 y la cámara mirando hacia −z. **En vertical cabe muy poco a lo ancho** (a 10 m de la
cámara se ven ~2.8 m de lado a lado), así que el mundo se acomoda en profundidad y la cámara vuelve a sitios ya vistos.
**En horizontal cabe el triple** (a 10 m, ~6 m junto al personaje y ~9 sin él): lo que se compara va lado a lado, y el
lugar tiene que llenar también los lados del cuadro (sus paredes, su horizonte), porque de lado se ve lo que en
vertical quedaba fuera (una cochera hecha para vertical, vista en horizontal, dejaba ver por encima de su pared el
bosque del otro capítulo). Eso es lo único
fijo: **el lugar sale del tema**.

- En Berachain fue una casa del protagonista adelante y un camino hacia el fondo (la cadena de bloques, el modelo
  `cadena`), con lo que se explica primero cerca y lo que salió mal más allá.
- Una historia pasa donde pasó (su cuarto, la oficina, un aeropuerto, un basurero, una mina), y el post sale en algo
  de ese lugar.
- Una comparación, dos lados de una mesa o dos carriles; un misterio, un tablero de pistas; un cómo se hace, un banco
  de trabajo; una caída, una escalera o una montaña que se baja.

Lo que el tema no pida, no va: si no hay camino, no hay cadena.

**El lugar se ve**: su piso (madera, pasto, baldosa, tierra), sus paredes o su horizonte y lo que hay en él, todo
quieto y de fondo según "Un foco". Si trae su propio piso, `REJILLA = false` en `src/tema.ts`. La cuadrícula vacía
con objetos sueltos encima es el lugar de los primeros videos.

## 2. Los tiempos (`T`) y los planos (`PLANOS`)

`T` son los cuadros en que la voz dice cada palabra que dispara algo: `en("pero primero")`, `en("vender", 2)` (la
segunda vez). Todo lo demás se escribe con `T`, nunca con cuadros a mano: si la voz cambia, todo se recorre solo.

Un `Plano` dice desde qué cuadro (`en`) la cámara va a dónde (`pos`), qué mira (`mira`), en cuántos cuadros llega
(`dura`, 30 por omisión) y, con `arco`, por qué punto curva el camino (para rodear algo en vez de cruzarlo). Mientras
sostiene un plano, la cámara rodea despacio lo que mira (`deriva`: 6° por omisión, un plano sí y otro no al lado
contrario; 0 la deja quieta), respira un poco y, al moverse rápido, el cuadro se desenfoca (el barrido). Un plano por
idea; empieza unos cuadros antes de la palabra para llegar a tiempo.

### Que se mueva

Con la misma cámara, el de Berachain se sintió vivo y el de SQUID quieto: los separaron los planos y lo que pasaba
dentro. Valen para cualquier tema:

- **Un plano nuevo cada 3 o 4 s** (Berachain, 2.7 por cada 10 s; SQUID, 1.7) y ninguno sostenido más de ~6 s (SQUID
  sostuvo hasta 9). Uno largo solo si es un acercamiento lento (el gancho de Berachain: 8 s entrando a la moneda) o si
  dentro pasa algo grande.
- **Cada plano cambia de verdad**: de lado (Berachain recorrió 80°; SQUID, 22°, siempre de frente), de distancia (de 4 a
  23 m de lo que mira; SQUID nunca bajó de 11) o de altura (de 2 a 12 m, con una cenital; SQUID, de 2.6 a 5.8). El mismo
  objeto de frente y a la misma distancia es la misma toma.
- **El mapa reparte sus sitios** a los lados, al fondo y a distintas alturas, y la mira viaja de uno a otro. Un objeto
  gigante al centro al que todo mira (el marcador de SQUID) deja el video en un solo plano.
- **Rápido y lento**: cada giro de la historia y cada cambio de capítulo, con un movimiento rápido (20–26 cuadros,
  cruzando el mapa o girando 30° o más; el barrido de Berachain llegó a 308 px por cuadro, el de SQUID a 71). Lo demás,
  más lento.
- **Lo que se dice actúa en 3D**: cae, se llena, viaja, se abre, se rompe, se arma (Berachain: 13 flujos y lluvias de
  fichas, la cadena que crece, el regalo y la bóveda que se abren). Un número que cambia en una pantalla no es moverse:
  con la cámara quieta, en SQUID lo de dentro se movió tres veces menos que en Berachain. El momento más fuerte lleva el
  movimiento más grande: en Berachain la moneda se deshace; la caída de SQUID fue un número con la cámara bajando
  despacio, y sus 10 s más quietos.
- **Desde el primer cuadro**: el gancho ya se mueve. SQUID pasó quietos sus primeros 5 s.

`encuadre.ts --revisa` mide el ritmo de los planos (✗ si no llega a lo de Berachain) y `final.py --borrador`, lo que de
verdad se movió, antes del render final.

**Las cámaras no se adivinan ni se copian: salen de las tomas.** En `TOMAS` de `guion.ts` va, por toma (`Toma` de
`encuadra.ts`), desde qué cuadro (`en`, `dura`), qué tiene que verse (objetos 3D con su radio, tarjetas 2D con su tamaño
en px) y desde dónde (azimut y elevación), más `lejos`, `deriva` o `arco` si hacen falta; `PLANOS = planosDe(TOMAS)` le
pone a cada una el `pos` y la `mira` que lo dejan todo en la zona útil (`ZONA.escena` de `src/tema.ts`: entre el texto
de arriba, o el índice con `arriba: INDICE`, y el perro; en horizontal, arriba a la izquierda del texto y del perro),
lo más cerca posible. Al cambiar una toma su plano cambia solo: antes cada video copiaba a mano los números que
imprimía `encuadre.ts` y se inventaba un script para hacerlo (nuevo-7, nuevo-8). Sin esto las tomas salían con la
cadena tapando todo o con lo importante cortado. Para revisarlas:

```
npm run encuadre [-- --revisa]
```

Imprime el plano de cada toma y, con `--revisa`, qué se sale (✗) cuando la cámara ya llegó y si el ritmo llega ("Que se
mueva"). Siempre así: vuelve a empaquetar antes de correr. `node out/encuadre.cjs` solo mide los planos de la vez
anterior.

## 3. El protagonista (`monedaEn`) y su indicador (`precioEn`)

El protagonista es lo que el video explica, en 3D, de principio a fin. Qué usar:

- **Una moneda, una medalla o un sello** (`Moneda`, el modelo `moneda`): un cilindro de metal con una cara de cada
  lado (`frente` y `atras`, imágenes de Codex en `public/img`; `canto`, el color del canto de cada lado; `luz`, el de su
  brillo). Sirve para un token, una marca, una empresa, un premio: cualquier cosa que quepa en una cara.
- **Un logo o un ícono extruido** (`Icono3D`, el modelo `icono-3d`): para una marca o una cosa con un símbolo claro
  (un gato, un cohete).
- **Un objeto**: el que haya en la biblioteca (`modelos.py buscar`) o uno nuevo con su formato (skill `modelos-3d`).

Los nombres del código (`monedaEn`, `precioEn`) son del primer video; el patrón es el mismo con cualquier protagonista.
Su estado en cada cuadro lo da `monedaEn(f)`:

- `PASOS`: por dónde anda y a qué escala (0 = no está; si estaba en 0, aparece ya en su sitio nuevo).
- `giro`: sus vueltas, cada una un `resorte` en una palabra (con π enseña la cara de atrás: en Berachain, BGT).
- `brillo` (se enciende > 1, se apaga < 1), `gris` (jubilado), `candado` (0 → 1: no se puede vender).
- `rota`: se deshace en cubos con el color de su cara, que caen y se amontonan; con `vuelta`, los cubos vuelan a un
  punto (`destino`). Rebobinar es correr ese tiempo al revés (el «pero primero» de Berachain).

`precioEn(f)` dice qué número lleva y cuándo: el grande del gancho y, luego, cada vez que la historia habla de él. En
Berachain fue el precio, pegado debajo de la moneda (`PrecioPegado`); en otro tema, su número (la población, los
usuarios, la velocidad) y donde lo pida el lugar: pegado, o en una pantalla, un marcador o un letrero del mundo.
`PrecioPegado` lo escribe como dinero: si es otra cosa, cambia su formato.

## 4. Qué hay en escena y cuándo (`Escena3D.tsx`)

**Solo está lo que se está diciendo.** Cada actor va dentro de `EnEscena` con sus `ventanas` (`[entra, sale]`, en
`T`): entra con un resorte al decirse y sale cuando ya no. Si se vuelve a hablar de él, otra ventana: vuelve a su mismo
sitio. Nada flota ni gira por su cuenta. El escenario (la `Cadena` en Berachain) sí se queda, pero de fondo: solo avanza en sus
ventanas `corre` y el resto del tiempo está gris, quieto y medio fundido con el fondo.

`EnEscena` y `presencia` están en `src/modelos/comun.tsx`.

**Los modelos salen de la biblioteca** (la skill [`modelos-3d`](../modelos-3d/SKILL.md)):
`python -B -X utf8 <modelos-3d>/scripts/modelos.py buscar <palabras>` dice cuáles sirven, con su miniatura, y
`usar <id>` los copia a `src/modelos/`; el usuario los ve en Sloth, en «Modelos 3D». Los del primer video: `moneda`,
`fichas` (`Flujo`: fichas que viajan de uno a otro; `Lluvia`: fichas que caen, se amontonan y se van), `cadena`,
`disco` (un logo real como medalla), `icono-3d`, `panal` (algo que se llena y se vacía), `eter`, `regalo`, `boveda` y
`aro` (encierra varias cosas en el piso para darles un nombre). Lo que el tema necesite y no esté, se hace con el
formato de la biblioteca y se guarda ahí en cuanto funciona.

Los colores con significado se pasan desde el video, nunca van dentro del modelo: las fichas, con el de lo que llevan
(`color={SIGNIFICA.dinero} marca="$"`, `color={SIGNIFICA.pierde} marca="×"`); el panal, con `miel`; el aro, con
`color={SIGNIFICA.regla}`. Los íconos de `Icono3D` se traen con `modelos.py iconos <nombre>`.

## 5. Los colores y los temas

- **Un color, un significado** (`SIGNIFICA`): el protagonista, lo segundo en importancia, lo ajeno, el dinero, lo que
  se pierde, las reglas del sistema, lo apagado. Qué es cada uno en este video se escribe en el guion. Lo decorativo (los bloques) usa `DECORATIVOS`, que no significan nada.
  Si un significado nuevo hace falta, se suma ahí y se usa igual en todo el video.
- **Los colores del video** (`PALETA` en `src/tema.ts`): el fondo oscuro (con texto blanco encima), el claro (con
  texto negro) y la luz de contra, sacados del lugar. Las tarjetas, sus bordes, la cuadrícula y la niebla salen solos
  de ellos. El negro y blanco que trae la plantilla es el de los primeros videos.
- **Los capítulos** (`TEMAS` en `src/capitulos.ts`): con cuál de los dos empieza lo decide el enfoque, y alternan,
  cada cambio en la palabra que cambia de tema (en Berachain: «pero primero», «¿entonces qué falló?», «en julio»,
  «ahora dice»; en una historia, el momento en que todo se tuerce). El mismo mundo se repinta: fondo, piso, niebla y
  luces.

## 6. Lo 2D, clavado en el mundo (`src/escenas/`)

Un componente por capítulo (`CAPITULOS` en `index.tsx`). Lo que acompaña a un objeto va en `EnMundo` (`p`, un punto del
mundo; `origen`, qué punto de la caja va en él; `desplaza`, unos px para dejarlo al lado sin taparlo), así se mueve con
la cámara; y dentro, `Entra` con su `en` y su `sale`. Solo lo que es de la pantalla (el índice 1 · 2 · 3, el cierre)
va fijo con `Aparece`, colocado con `ZONA` y `ANCHO` de `src/tema.ts` (`left: ZONA.escena.izquierda`, `top:
ZONA.escena.arriba`), no con los números del vertical: así cae en su sitio en el formato del video. Una tarjeta más
alta que la zona del horizontal (de 70 a 720 px), como un post con su foto debajo, se arma a lo ancho: la foto al lado.

| Pieza | Para |
|---|---|
| `Prueba` (tarjetas.tsx) | Lo que dijo alguien: logo, fuente y fecha, y solo la frase, con `{ t, en, subraya: true }` en su dato |
| `Numero` (comun.tsx) | Un número en su píldora del color de lo que cuenta, con su `Glifo` |
| `PrecioPegado` | El indicador del protagonista |
| `Boton` con `no` | «No se puede»: parpadea y se queda rojo; con `color` y `clic`, uno que sí se pulsa (con `Cursor`) |
| `Post`, `Comentario` (reddit.tsx) | Un post de Reddit rehecho (el sub, el usuario tapado, los votos y comentarios que corren; `etiqueta` y `debajo` para lo de cada video, como los EDIT) y un comentario con sus votos |
| `Calendario` | El calendario de mesa: en cada fecha de la lista se arranca la hoja |
| `Barras`, `Plazo`, `Navegador`, `Grafica` | Comparar dos cifras, un plazo que se llena, una página rehecha, una gráfica con cursor |
| `Glifo`, `Icono` (iconos.tsx) | Íconos de Phosphor, suelto o en su azulejo de color. Nunca emojis |
| `Flecha` + `Ancla` | La flecha de una prueba a lo que prueba: busca sus dos `Ancla` en pantalla y va de borde a borde; si falta una, no se dibuja. A un objeto 3D se llega con `Hueco` (comun.tsx) |
| `Canal`, `PantallaCanal` | El cierre de la marca (su red, su nombre y su foto, de `src/datos/marca.json`; con red `ninguna` no dibujan nada): la tarjeta y el canal en el celular del personaje |

Las de Berachain que se pueden copiar: el índice 1 · 2 · 3 (`Indice` en `Fallas.tsx`), la barra de confianza que se
vacía, los botones de la billetera con el canje 1:1.

## 7. El personaje (`PERSONAJE` en `src/escenas/index.tsx`)

El gancho va sin él; entra cuando termina (en Berachain, en «pero primero») y cambia de pose en la palabra que la pide:
`{ desde: en("…"), pose }`. Qué hace lo pide el enfoque: explica, reacciona a la historia como quien la oye, se burla,
se asusta.
Las poses y para qué sirve cada una: [`personaje/POSES.md`](personaje/POSES.md). Las que sostienen algo llevan
`objeto: { nodo: … }` (el cartel con `Cartel`, el celular con `PantallaCanal`) y `sube: SUBE`. Habla solo: abre la
boca con el nivel de la voz (si su pose tiene boca abierta). Va abajo al centro en vertical y de pie en el tercio de la
derecha en horizontal (`ZONA.personaje`; `x` en un tramo lo mueve). Con `personaje: ninguno` en la marca, la plantilla
no lo dibuja: el mundo baja hasta el borde (en horizontal, texto y escena se centran a lo ancho) y lo que el personaje
enseñaba en su celular o su cartel va en el mundo.

## 8. Revisar y terminar

- `node scripts/fotos.mjs revision/<n> <segundos…>`: hasta 8 cuadros sueltos, en segundos, con la tarjeta de video,
  para comprobar un arreglo. Luego `node <base>/scripts/hoja.mjs revision/<n> revision/hoja-<n>.png`.
- `python -B <skill>/scripts/final.py --borrador 1`, luego `--borrador 2` en segundo plano: el video entero a media
  resolución en dos mitades (~45 s cada una; la hoja de la primera se mira mientras se hace la segunda), medido, en dos
  hojas y con la hoja de parecidos. `--borrador` solo hace las dos seguidas. Si `medir.py` sale con ✘ (quieto > 30 % en el borrador y 25 % en el final, movimiento < 2.5 o más de 4 s
  parado), falta movimiento: "Que se mueva".
- `python -B <skill>/scripts/final.py`: el render final (~2 min), una sola vez, cuando el borrador ya está bien.

## Problemas conocidos

- **Un cuadro suelto sale oscuro, sin el piso del lugar** (parpadeo en las tomas lejanas): el piso del lugar y el del
  mundo, a 1 mm, se pelean la profundidad. `Mundo.tsx` empuja el suyo atrás con `polygonOffset`; un piso propio va
  igual a ras (y ≥ 0.001), y cualquier cara pegada a otra se separa o lleva su `polygonOffset`.
- **Las sombras sobre el piso de un lugar aparecen y se van de un cuadro a otro** (nuevo-10, las apps sobre el
  celular): la sombra del mundo va a y = 0.004 y ese piso, a 0.002 pero empujado hacia la cámara, le ganaba unos cuadros
  sí y otros no. Un piso propio va a ras (0.001–0.003, `polygonOffset` −1 como mucho) o claramente encima (≥ 0.01, con
  `receiveShadow`); ver la regla en modelos-3d.
- **Un plano de lado sale con la cámara fuera de las paredes** (`npm run encuadre` da `|x|` mayor que medio ancho del
  lugar): un lugar angosto no deja ver de lado dos cosas separadas a lo ancho. Ponlas una detrás de otra en el mapa.
- **Lo 2D de algo que quedó arriba, fuera de cuadro, asoma encima del texto** (lo de una pantalla, un logo, al bajar la
  cámara): el 3D no lo tapa. Mételo en las `cosas` de su toma o desvanécelo según dónde cae (`proyectar`).
- **Todo sale cortado o tapado por la cadena**: el ancho vertical. Acomoda en profundidad y saca la cámara con
  su toma; no la muevas a ojo.
- **`EnEscena` escala alrededor de su `pos`**: el actor de adentro va en `[0, 0, 0]`. Si va en su posición del mundo,
  al entrar viaja desde el origen (le pasó al panal).
- **El lienzo 3D es otra raíz de React**: no ve los contextos de fuera. Por eso `Mundo` recalcula la cámara con los
  mismos `PLANOS`, y el tema lo lee de `temaEn(f)`.
- **La cara de la moneda o medalla sale de lado**: la tapa del cilindro gira la textura; `useCaras` la endereza (centro y π/2).
- **Las sombras se pierden** lejos del origen: la luz principal sigue a la `mira` de la cámara (ya en `Mundo.tsx`).
- **Render lento** (~25 min): Chrome hacía el 3D por software. `remotion.config.ts` pone ANGLE y `fotos.mjs` pasa
  `gl: "angle"`: ~2 min con la tarjeta de video, igual de nítido.
- **Palabras encimadas en los subtítulos**: se midieron antes de cargar la fuente; `Video` espera a `FUENTES`.
- **Whisper se salta tramos de la voz rápida**: por eso `acelerar.py` no vuelve a transcribir, traslada los tiempos.
- **Codex no copió la imagen**: se vuelve a pedir; a veces tarda más de un minuto.
