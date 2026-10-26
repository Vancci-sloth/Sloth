# Cómo se escribe un guion de El Diff

Un noticiero seco y burlón, en español de México. Antes de escribir, lee completos los `guion.md` de los dos episodios
más recientes de la carpeta donde trabajas, para tener la voz en el oído; si aún no hay, el de
[`ejemplos/deepseek-guion.md`](ejemplos/deepseek-guion.md) (su nombre y su despedida son los de El Diff: los tuyos
salen de la marca). Lo de abajo es el estilo, medido plano por plano en diez episodios de referencia. Lo que se ve está
en [La imagen](ESCENAS.md#la-imagen).

## La esencia

El Diff es un noticiero, no un monólogo. Casi cada frase trae un dato concreto (una cifra, una fecha, un nombre, una
cita) y la burla va **montada** en ese dato: un adjetivo, un verbo, un apodo o la cola de la frase. Los mejores chistes
no se inventan: se **leen** en la fuente (la letra chica, la cita textual, la promesa de la propia empresa), y la
imagen enseña esa fuente mientras la voz la parafrasea. La voz es **seca**: dice lo absurdo con cara de póker, no se ríe
de su propio chiste ni le deja aire. Se burla del relato (lemas, comunicados, benchmarks propios, promesas) y explica la
técnica en serio. La imagen es la **segunda voz**: pone la prueba de lo que se dice y la otra mitad del humor.

El video del tema es una fuente más, no el guion. La historia se arma con el anuncio, el repo, el tuit, la noticia y el
contexto de esa semana, con una tesis que la recorre; el video del youtuber aporta lo que él probó y se ve. Contarlo
en orden, como un resumen, es lo que el usuario rechazó como plano.

## Largo

Lo pide Sloth en la línea `Duración: <n> minutos por video.` (en un plan de shorts es lo de cada short; si no, lo del
episodio, en vertical o en horizontal).
El usuario lee a unas 3 palabras por segundo, 180 por minuto: un short de 1 minuto son unas 180 palabras, uno de 3
unas 540, y un episodio de 10 minutos unas 1,800. Sin esa línea, el episodio es de unas 1,100 palabras (6 minutos). `python <skill>/scripts/largo.py <minutos>` cuenta lo que se narra y para si te pasas o te quedas corto más de
un 10 %: en el lote del 7 de octubre los guiones pedían 1,100 palabras y salieron de 1,225 a 1,379 sin que nada avisara.

## Estructura

1. **Arranque en frío**, del 15 al 25 % del episodio (en los de referencia, de 50 a 95 s antes del logo). Es un noticiero
   completo en corto, no un avance: dos o tres hechos encadenados en orden de tiempo, cada uno con su marca («La
   semana pasada…», «Luego, el domingo…», «Y ayer mismo…»), con sus cifras y sus nombres. La primera frase es una
   marca de tiempo y un hecho, sin saludo, y ya nombra a la persona y lo que prometió o hizo: en TikTok se decide en 3
   segundos (lo que retuvo en el canal del usuario, en `aprendido` de la marca). Lo que se ve en esos segundos (el
   rótulo de arriba y la primera imagen) adelanta el giro: «El 27 de
   septiembre, un usuario de X llamado chasm…» funcionó porque arriba decía JUEGOS FRANKENSTEIN y corría el clip del
   soldado de Call of Duty en patineta. Formas que funcionan:
   - el hecho con el espectador de cómplice: «Ayer, mientras tú veías por décima vez el video de Rumpelstiltskin, el
     laboratorio parisino Mistral lanzó…»;
   - una escena entre dos personas con nombre, lugar y emoción: «La semana pasada, Sam Altman miraba frustrado desde
     su búnker cómo Zuck presentaba Muse»;
   - el antecedente que fija la vara con que se va a juzgar la noticia: «En 1965, un matemático británico llamado I. J.
     Good escribió que la primera máquina ultrainteligente sería el último invento que necesitaríamos»;
   - el cliché del tema, subido un grado: «Ya sé que la IA cambia para siempre cada semana, pero esta vez cambió para
     siempre más de lo normal».

   Investiga lo que pasó alrededor del tema esa semana: ahí suele estar el mejor arranque. Cierra con la **tesis**:
   una lectura cínica que generaliza el caso, o un dilema cuya segunda opción es despectiva («¿es de verdad
   automejora recursiva, o solo más humo?»).
2. **«En el video de hoy…»**: tres promesas en una sola frase, cada una con un adjetivo que da pista, y la tercera la
   más rara («un modelo casi tan listo como…, una API que se parece sospechosamente a…, y un plan nuevo que en silencio
   castró al de 200 dólares»). Cada promesa se paga en el cuerpo.
3. **Logo**, siempre igual: «Es <día> de <mes> de <año>, y estás viendo <nombre>.», con el `nombre` de la marca. Usa la
   fecha en que se publicará; si no la sabes, la de hoy, y avisa al usuario para que la cambie al grabar.
4. **Cuerpo**: de cuatro a siete bloques, cada uno con su encabezado `## Nombre` en `guion.md` (se vuelve un párrafo de
   `guion.py` y una transición). Se entra a cada bloque con una **bisagra** de voz, una frase corta: «Lo que nos lleva
   a…», «Pero lo primero que hay que saber es…», «Entonces, al día siguiente…», «Ahora, ya sé lo que estás pensando.».
   - **Un hilo** recorre los bloques y se acerca al espectador en cada uno («OpenAI copia lo que funciona»: copió a
     un desarrollador, luego a una startup, luego a Notion… y tu app es la siguiente).
   - **El orden escala**: de la promesa a la sospecha, o del que más promete y menos tiene al que ya lo tiene. Cada
     bloque cierra en un anticlímax o en una frase seca.
   - **La técnica va en serio.** El mecanismo se explica en limpio, en orden, después de un «Básicamente,», con un solo
     ejemplo absurdo pero exacto, y sin chistes en la voz: de 10 a 45 s en que la imagen sigue bromeando sola.
5. **Cierre**, sin resumen ni moraleja. Antes, concede el matiz que juega en contra de tu burla («Ahora, para ser
   justos, eso pasa con todos los avances de matemáticas de este año.»). Luego, una de dos:
   - un veredicto práctico por perfil del espectador, con el último perfil de chiste: «Si solo tienes una PC gamer,
     Gemma 4. Si tienes tu propio data center y ningún departamento legal, Kimi K3. Y si eres patriota, los pesos de
     Beam salen a fin de mes.»;
   - el anticlímax: el detalle más trivial y verdadero de la historia («…y un post en su blog sobre comprarse una casa
     flotante»).

   La última frase cobra algo del arranque: una palabra, una persona o una cifra.
6. **Final**, siempre igual y cada frase su beat: la `despedida` de la marca y, si tiene, su `invitacion`.

## La voz

### El chiste montado en el dato

La mitad de los chistes va en la **cola** de una frase que ya informó, y la otra mitad **dentro** del dato. Si quitas el chiste, la frase sigue informando.

- **En la cola**, tras una coma o un «lo cual», «que», «y»: la frase avanza con datos y la última cláusula trae la
  burla cuando el oído ya se relajó. «…y empezó a preparar su salida a bolsa en Hong Kong, en la que, según me dicen, la
  fuerza de superinteligencia no tiene ningún interés en invertir.» «Jensen Huang respondió a esa pregunta como Nvidia
  responde a todo: con un chip nuevo.»
- **Dentro**, como adjetivo o epíteto («un desarrollador austriaco aburrido y recién jubilado llamado Peter
  Steinberger»), como verbo («intentó hacer un OpenAI», «le ruega al agente que…», «en silencio castró al plan de 200»),
  como adverbio («de alguna manera, el mejor modelo abierto de Estados Unidos sigue siendo Gemma 4») o como apodo
  («la gran pelea de los mediocres»).

### Los chistes se leen

Antes de inventar una comparación, busca el chiste en la fuente. Casi todos los buenos son un dato verdadero contado
con el adjetivo torcido:

- **La letra chica completa.** «Dicen que es el mejor modelo abierto del mundo… desarrollado en Estados Unidos o
  Europa», y la captura lo enseña resaltado.
- **El documento oficial leído al pie de la letra.** El decreto pide decir «SI» en lugar de «AI»: «su primera orden fue
  declarar que la IA es tonta y que el futuro es la SI».
- **La promesa del vendedor dicha tal cual, en racha, y la duda en la frase siguiente.** «Doscientas veces más rápido,
  cuatrocientas veces más barato y cero alucinaciones. Suena demasiado bien.»
- **La cita textual del protagonista, avisada y sin comentario.** «Matt escribió, y cito: "Bueno, ya que ahora soy
  pirata…"». El chiste lo dice él.
- **La versión oficial en la voz y la prueba en contra en la imagen**, mejor si es un documento de la propia empresa.
  «Zuck nos asegura que los humanos ya fueron reemplazados», sobre cuatro titulares de un call center.

Una analogía inventada («con el entusiasmo de alguien que recibe calcetines en Navidad») va solo donde la fuente no
da nada, y entonces con una imagen famosa detrás ([La imagen](ESCENAS.md#el-chiste-visual)).

### Mecanismos

| Mecanismo | Ejemplo |
|---|---|
| El discurso noble traducido a su motivo de dinero | «este descarado ataque a los ingresos recurrentes de OpenAI» |
| Vocabulario grave (penal, bélico, médico) para lo trivial | «el imperdonable crimen de la destilación»; «quirúrgicamente extirpado» |
| Un eufemismo seco ante un hecho fuerte | «le dijo a Claude que iba a hacer algo que la sociedad moderna suele ver con malos ojos» |
| Lista de tres en paralelo con la tercera fuera de escala | «costó 6,300 millones en GPUs, se comparó contra un modelo chino ya viejo, y 24 horas después lo humilló Mistral» |
| El ejemplo absurdo pero exacto, estirado dos o tres frases | «imagina que haces una app de citas para burros…» |
| El equivalente ridículo y exacto de una cifra | «quema 40 mil tokens para ponerle nombre a una variable» |
| Un precedente convertido en verbo | «intentó hacer un OpenAI» |
| El «según me dicen» que finge una fuente | «…en la que, según me dicen, la fuerza de superinteligencia no piensa invertir» |
| La frase hecha del protagonista junto a la fecha que la ridiculiza | «la primera vez que Facebook habló de una "oportunidad generacional", él estaba en la primaria» |
| El apodo que se vuelve sigla | «benchmarks de confía-en-mí-hermano» → «los BCMH» |
| El chiste interno de programadores, dicho sin explicar | «lo reescribió en Rust, como manda la ley» |

### Presentar a alguien

- **La primera vez**: una credencial o un epíteto, el nombre y una aposición con el dato más útil (una cifra, de dónde
  es, cómo se llama a sí mismo, o el detalle irónico que es verdad). «Reflection AI, la startup de 25 mil millones
  respaldada por Nvidia que se hace llamar el laboratorio abierto de frontera de Estados Unidos.» Puedes guardarte el
  nombre unos segundos: «uno de los mayores expertos del mundo en gritarle a videojuegos… nada menos que PewDiePie».
- A los famosos les basta el nombre («Trump», «Zuck»). A la gente común, la ciudad y lo que hizo: «un hombre en San
  Francisco».
- Después, un **apodo fijo** que se repite y vuelve como unidad de medida.

### La opinión

Va en los **verbos de habla** («asegura», «jura», «promete», «se hace llamar», «lo que llaman», «según») y en los
**adverbios** («por fin», «de alguna manera», «apenas», «en realidad», «todavía», «por suerte», «básicamente»). La
primera persona sale una o dos veces por episodio, en broma («según me dicen», «mi parte favorita»). La burla va
contra el poder y el relato; a las víctimas y a quien hizo el trabajo, respeto. Cuando el dato le da la razón al
burlado, se dice: «Y no se equivoca.»

### Las cifras

- **Redondas en la voz**, con «casi», «unos», «más de» o «apenas»; la exacta va en pantalla.
- **Como adjetivo**: «la empresa de 3 billones de dólares», «el proyecto de 90 mil estrellas».
- **En pareja o en escalera**, con la de referencia al final: «quería 20 mil ejemplos y juntó unos 300»; «de una
  valoración de 4 mil millones en noviembre a 50 mil millones ayer».
- Una grande lleva su equivalente ridículo y exacto; una chica, una comparación doméstica («menos estrellas que un
  motel de carretera»).

### La frase

- **Larga y encadenada** (mediana de 20 a 25 palabras), con tres datos unidos por comas y la cola al final. Después de
  una o dos largas, una **seca** de 4 a 10 palabras que juzga o cambia de bloque: «Bonita chamba, si te la dan.» «Que es
  justo lo que pasó.» El ritmo rápido lo pone la imagen, que cambia dentro de la frase.
- **Conectores de narración oral**: «Luego», «Entonces», «Y ayer mismo», «Lo que nos lleva a», «Lo que significa que»,
  «El detalle es que», «Ahora», «Por suerte», «Así que», «Básicamente», «Pero».
- **Dos registros en la misma frase**: coloquial y físico para la acción (soltó, se metió, recortó, castró, quemó),
  técnico y exacto para el contenido.
- **Sin aire para la risa**: el remate llega pegado, con coma, y la frase siguiente ya es otro dato. La exageración va
  en el registro, no en adjetivos de asombro ni en exclamaciones.
- **Frases hechas nativas** del español de México, no calcos del inglés.
- **Sin títulos antes de la cosa**: no se anuncia una parte con su etiqueta («Tres: la trampa. Le quedaban…», «El
  problema: …»); se cuenta directo. En una lista numerada, el número solo y enseguida lo que pasó.

### Escribir para la imagen

Cada cláusula termina en algo que se puede enseñar: un nombre, una cifra, una fecha, un objeto. Ahí corta la imagen.

- **Atribuye cada afirmación** con un verbo de publicación («publicó en su blog», «le dijo a TechCrunch», «escribió en
  Slack»): cada atribución es una captura con su frase resaltada.
- **Verbos que se dibujan** y metáforas con imagen literal: «quemar», «hacer de niñera», «le dieron la puerta», «cerró
  la llave».
- **Una cosa nombrable por cláusula** en las listas: cada una es una imagen.
- **Un ejemplo que vuelve**: plántalo en el arranque y repítelo, para que la imagen lo siembre y lo recoja.
- **El sustantivo que remata, al final de la cláusula**: «…y se fue a Burning Man», no «se fue a Burning Man y…».

## Un guion que no escribiste

Si el usuario trae su guion, o te pide El Diff con su propia manera de hablar, la voz es suya: sus palabras, su tono y
sus chistes se quedan, aunque no suenen a este estilo. El estilo entra por dos lados:

1. **La imagen, completa.** La prueba de cada dato, los rótulos, los recortes y el chiste visual no dependen de la voz
   ([La imagen](ESCENAS.md#la-imagen)). Con un guion serio, la imagen pone casi la mitad del humor del episodio.
2. **Cambios mínimos al guion, propuestos y aprobados.** Son de orden y de concreción, no de tono. Preséntalos como
   lista numerada, cada uno con la frase antes y después, y aplica solo los que apruebe:
   - lo vago por lo concreto: «hace poco» → «el martes»; «una empresa» → su nombre; «muchos» → la cifra;
   - la fuente de cada afirmación con un verbo de publicación;
   - las frases largas partidas para que cada tramo termine en un sustantivo que se pueda enseñar;
   - una marca de tiempo al empezar cada bloque, la frase de tres promesas tras el arranque, la línea de la fecha y la
     despedida de siempre;
   - una persona presentada con su credencial y su nombre la primera vez;
   - un verbo neutro por bloque cambiado por uno que se dibuje, si el autor lo acepta;
   - una palabra del arranque repetida en la última frase.

## Para revisar el guion

Al terminar, cuenta en `guion.md` sin la intro y el final. Son las medidas de referencia, no una cuota: si te alejas
mucho, revisa la frase que lo causa.

| Medida | Referencia |
|---|---|
| Datos concretos (cifras, fechas, nombres, citas) | de 10 a 19 por minuto |
| Chistes en la voz | de 4 a 8 por minuto, con dos datos por chiste |
| Frases sin dato ni chiste | menos de 1 de cada 10, y son bisagras o promesas |
| Frases que se pueden borrar sin perder información | ninguna |
| Arranque antes del logo | del 15 al 25 % |

## Episodio sobre un producto del usuario

Cuando el tema es la app del usuario y la meta es su lista de espera (episodio 4, Sloth):
- **La historia es una noche real de uso, con sus datos**: a qué hora pegó el link, qué escribió la app, qué error
  cachó, qué aprendió y cuánto costó. Funciona mejor que la lista de funciones.
- **El mejor gancho es algo que la app hizo mal o de más**. En el episodio 4 fue el patrocinador inventado con su
  código de descuento.
- **Cada función mencionada se ve funcionando en sus datos.** Lo que no tiene ejemplo o todavía no existe en el
  código (los pins sin versiones, el paquete con miniatura y título) se queda fuera. Comprueba en el código lo que
  dice su glosario.
- **La llamada a la acción va en el cierre**: "la lista de espera está en la descripción", sin URL, precio ni fecha
  de lanzamiento, y con un callback al gancho.
- **Los peros también van**: plataforma, versión y lo que falta. Es el tono del canal.

## Shorts

Un short cuenta un SMP ([`SHORTS.md`](SHORTS.md#el-smp)) con la misma voz, en menos tiempo:

1. **El gancho, en el primer segundo.** El dato más raro y concreto del SMP, dicho de entrada, con su protagonista. Es
   lo primero que se oye: el short empieza en el gancho.
2. **Los cinco puntos**, uno tras otro, cada uno con su dato y el chiste montado en él ([La voz](#la-voz)). Frases un
   poco más cortas que en el episodio (de 12 a 18 palabras), cada una terminada en algo que se puede enseñar.
3. **Un remate final** que cierre el SMP. Un callback al gancho funciona.
4. **La invitación** de la marca (`invitacion`), dicha con otras palabras en cada short. Sin ella, el short acaba en
   su remate.

El `sello` de la marca va chico en pantalla todo el short y hace de logo: el short va del gancho a la invitación sin la
fecha ni la despedida del episodio. Cada short se entiende solo, aunque el usuario publique otros del mismo plan.

## Exactitud

- Las opiniones y estimaciones del youtuber del tema van atribuidas: "según el youtuber". Lo que él probó y se ve en pantalla
  se cuenta como hecho, con el segundo del clip anotado en `material.md`.
- Si una cifra no se puede comprobar en una fuente que se pueda mostrar, se redondea a lo que sí se ve ("casi cien mil
  en tres días", que se lee en la gráfica, en vez de "95,386 en dos días", que solo decía un blog).
- Revisa que el youtuber no contradiga lo que crees: en DeepSeek, el youtuber ya conocía la versión web, y "nunca lo había
  usado" era falso.
- Escribe con ortografía normal: el usuario graba leyendo, no hace falta escribir la pronunciación. Los números pueden ir
  en cifras o en letra; `voz/adaptar.py` resuelve los dos.
- Lo inventado para el chiste se nota inventado: el ejemplo absurdo («imagina una app de citas para burros») y su
  maqueta en pantalla. Ningún dato real se apoya en algo fabricado.

## El gancho

El `GANCHO` de `guion.py` es el rótulo fijo de arriba durante todo el episodio vertical (el horizontal no lo lleva):
dos renglones, seis palabras como mucho, en mayúsculas, con el dato que hace parar el dedo. No repite la primera frase
de la voz; la contradice o la adelanta.
