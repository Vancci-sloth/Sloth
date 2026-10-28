# Cómo se escribe el guion

Español de México, en la voz de un instructor de supervivencia que no le ve nada raro a lo que enseña: frases cortas,
segunda persona, imperativo, sin una pausa. De 75 a 100 palabras, que con la voz a +25 % duran de 22 a 30 s (los de
referencia duran de 20 a 31 s). Cada frase se escribe pensando en su imagen, con la biblioteca de
`personaje/POSES.md` a la vista: si no hay recorte ni escenario posible para ella, se cambia la
frase; si solo falta la pose, se arma con la más parecida y se pide al entregar (ver "El personaje" en `SKILL.md`).

## El esqueleto

1. **El gancho** (dos o tres frases de `guion.json`, de 4 a 7 s de voz). La situación y la promesa. La voz cuenta con sus
   palabras lo que dice el comentario de la tarjeta; no lo lee:
   - el comentario: "Alguien preguntó qué haces en esta situación." / "Me preguntaron por qué nadie ayudaba a la
     ballena.";
   - la pregunta directa: "¿Atrapado en una escalera con dos leones?";
   - el ¿qué prefieres?: "¿Qué prefieres, X o Y? Obvio Y. La verdad no da tanto miedo."

   Y luego "Déjenme enseñarles." o minimizar: "No te preocupes. No es para tanto."
2. **Los pasos** (de cuatro a seis). Cada uno es una acción física con su pose, en orden, unidos por los conectores del
   instructivo. Escalan: el primero casi suena razonable ("patéalo"), el último es el más grande y más absurdo ("avienta
   el elefante al trampolín más cercano"). Lleva al menos una **lógica falsa** y al menos una **utilería más cercana**.
3. **El remate** (una frase). Él ya ganó y lo dice con calma. Elige la forma que más contradiga o achique lo que se vio;
   si dudas, la reversa y los valores que no cuadran son los que más pegan, y el cierre de experto es para cuando el
   último paso ya fue el chiste más grande:

| Forma | Ejemplo de él | En español |
|---|---|---|
| Moraleja falsa | "Guys, this is why it's important to stay athletic." | "Banda, por eso es importante mantenerse en forma." |
| Consecuencia doméstica | "This will ruin your kayak, so take the croc's wallet so you can buy a new one. You're welcome, guys." | "Esto te va a arruinar el kayak, así que sácale la cartera al cocodrilo y cómprate otro. De nada, banda." |
| Reversa | "…then spear the seal, because we don't show mercy in this dojo." | Salvaste a la foca y al final la ensartas: "…porque en este dojo no hay piedad." |
| Valores que no cuadran | "We are caretakers of the earth and need to protect nature." | Después de golpear al tiburón: "Somos guardianes de la naturaleza." |
| Cierre de experto | "Anyway, guys, that's how you handle this situation." | "En fin, banda, así se resuelve esta situación." |
| El apodo | "This is why they used to call me Thunder Thighs back in high school." | "Por eso en la prepa me decían Codo Fuente." Un juego de palabras con dos sentidos, uno por cada paso; en el cielo, un emoji por palabra, cada uno en la palabra que lo nombra (`scripts/emoji.py`; en escena, `Recorte` con `escala={usePop(t)}`). |

**No anuncies lo que vas a decir: dilo.** Ni un paso ni el remate llevan título antes («Paso tres: la trampa.»): el
número, si va, va solo y enseguida la acción. Dicho en voz alta, nombrar algo antes de decirlo suena raro.

## Las herramientas de la voz

Son las que hacen que suene a él. Cada guion usa varias:

| Él dice | En español |
|---|---|
| Somebody was asking… Well, let me show you. | Alguien preguntó qué haces aquí. Déjenme enseñarles. |
| Don't panic. It's not that big of a deal. | No te asustes. No es para tanto. |
| Realistically, all you have to do is just… | Siendo realistas, nada más tienes que… |
| Once it gets close enough, … | En cuanto lo tengas cerca, … |
| This will stun it long enough for you to… | Esto lo va a aturdir el tiempo suficiente para… |
| After that, … / Immediately … | Después, … / Inmediatamente, … |
| Now, because the tiger is bigger than you, you're going to have to get something bigger than the tiger. | Ahora, como el tigre es más grande que tú, vas a necesitar algo más grande que el tigre. |
| …into the nearest wall / the nearest swordfish | …contra la pared más cercana / el pez espada más cercano |
| Just a simple headbutt into the elbow drop combo will finish it off. | Un simple combo de cabezazo y codazo desde arriba lo termina. |
| Guys, remember, if you have the high ground, you will always win. | Banda, recuerden: si tienen la ventaja de altura, siempre ganan. |

- **La lógica falsa**: una causa y su efecto dichos como física de manual ("esto hará que suelte a la foca"), o la
  lógica de tamaños.
- **La utilería más cercana**: "el X más cercano" trae el objeto absurdo como si siempre estuviera ahí, y con él un
  escenario nuevo.
- **La jerga de pelea dicha como técnica**: llave con los muslos, codazo desde arriba, clinch, rodillazos, patada
  voladora, combo. Escrita como la diría un entrenador, sin explicar.
- **El marco doméstico sobre lo salvaje**: la pensión alimenticia, la cartera del cocodrilo, "te voy a esterilizar", "en
  este dojo". Lo cotidiano aplicado a la criatura.
- **Los movimientos de firma**: él repite reel tras reel la llave de muslos y el codazo desde arriba. Este canal ya tiene
  los codazos (Codo Fuente, hechos con `rodillas` girada mientras no haya foto de `codazo`); repetir uno o dos
  movimientos de firma entre reels hace que la gente los espere.

## La criatura, en cualquier tema

El tema siempre trae una situación que la gente siente difícil, y esa situación tiene un cuerpo que se puede patear,
cargar y aventar: la criatura. Lo abstracto se vuelve un animal, una persona o un objeto real.

| Tema | La situación | La criatura |
|---|---|---|
| Un modelo de IA nuevo | "Si la IA te quiere quitar el trabajo" | El robot o el logo del modelo, de cuerpo entero |
| Un bug en producción | "Si te sale un bug un viernes a las 6" | Un escarabajo gigante |
| Una junta que pudo ser correo | "Si tu jefe te mete a una junta de dos horas" | El jefe (foto de stock) y la mesa de juntas |
| Las finanzas | "Si te llega el estado de cuenta" | La hoja de papel, de dos metros |

Un tema sin datos no los necesita. Un dato real del tema entra como cosa dentro de la acción, en media frase: el precio es la etiqueta que le arrancas, la
cifra es cuántos son, el producto es la utilería de un paso (como la lata de café del patrocinio en el de las mambas).

## El guion del usuario

Cuando el usuario trae su texto, la voz es la suya y la imagen es la de este estilo:

1. **Sus palabras se quedan**, con su tono (de maestro, de regaño, de chisme), y la duración es la de su texto. Lo
   cortas en frases de `guion.json`, una acción o una idea por frase, y le pones `dicho` donde el TTS lo necesite. Si
   dura más de 40 s, si algo no se puede ver o si un dato no es exacto, propón el cambio y espera su visto bueno; en un
   lote, sigue con sus palabras y dilo al entregar.
2. **La esencia la pone la imagen**: cada frase literal, en su verbo; cada idea con su criatura o su objeto; los
   escenarios cambian con lo que nombra; y la escalada va en la imagen aunque el texto no escale (cada imagen más grande
   que la anterior).
3. **Lo que explica en vez de actuar, él lo hace**: "X es más rápido que Y" es él corriendo contra Y cargando a X; una
   opinión es él haciéndosela a la criatura.
4. **El gancho y el final del estilo se quedan**: su primera frase va sobre el clip con el comentario, aunque explique
   (lo que explica se actúa después), y desde que termina la última acción él se queda quieto de frente. Si su texto no
   tiene una frase de cierre, propón una de la tabla del remate, marcada como propuesta, y entra a la voz solo con su
   visto bueno.
5. **Si su texto le habla a alguien dentro de la escena** (un regaño a la criatura, un diálogo con el culpable), es la
   variante actuada: ver "Actuado" en [`ESCENAS.md`](ESCENAS.md). Hablarle al público es el modo de siempre.

## Lo que va en `guion.md`

El texto, y debajo dos tablas. La de acciones es el contrato entre la voz y las escenas, una fila por frase de
`guion.json` (el # es su índice desde 0, el mismo de `ini(i)`); en Recortes van las criaturas y la utilería, no los
escenarios:

| # | Frase | Pose | Qué se mueve | Escenario | Recortes |
|---|---|---|---|---|---|
| 3 | En cuanto lo tengas cerca, patéalo contra la pared más cercana. | `patada` en "patéalo" (pedirla; mientras, `heroe`) | La criatura sale girando por la derecha y en el otro escenario choca con la pared | prado → pared | criatura |

La de fuentes: cada dato que se dice, su fuente primaria y su archivo; y cada foto de stock, su licencia y su enlace.

## Exactitud

- La cifra que se dice es la de la fuente primaria, y se ve en pantalla como cosa (la etiqueta, el número de criaturas).
- Atribuye con la precisión de la fuente: si un medio citó a **una** persona, el guion dice "un empleado", no "los
  empleados".

## La voz

`guion.json` tiene la forma de `plantilla/guion.json`. Lleva `"antes"`: los segundos que el clip del gancho suena solo
antes de la primera palabra, de 1 a 2.5 según lo que tarde en verse la situación (con un clip mudo, 0.5). En `frases`,
para cada una el `texto` (el guion) y, cuando hace falta, el `dicho`: cómo tiene que leerlo la voz para que suene
natural. `voz` y `rate` son los de `personaje/POSES.md` (la voz que eligió el usuario; sin ella, `es-MX-JorgeNeural` a
`+25%`); otro ritmo, solo si el usuario lo pide.

| Se escribe | Se le dicta al TTS |
|---|---|
| Gemini | Yémini |
| Google | Gúgol |
| Rust | Rost |
| Bloomberg | Blúmberg |
| DeepSWE | Dip Suí |
| GPT-6 | yi pi ti seis |
| C++ | C más más |
| 77.9 | setenta y siete punto nueve |
| tokens | tókens |

- Corta las frases largas en dos entradas de `guion.json`, para que cada acción tenga su frase. Si la transcripción del
  paso 4 junta dos palabras en la juntura, cambia una de ellas (en el primer reel, "usa su" se oyó "ibas a su"; quedó
  "aprovecha su").
- La voz va pegada, sin `pausa`: la acción de una frase se termina de ver mientras arranca la siguiente.
