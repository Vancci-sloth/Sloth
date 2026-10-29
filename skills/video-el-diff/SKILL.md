---
name: video-el-diff
description: Hace un episodio de El Diff, un noticiero seco y burlón en español con el nombre, el sello y la despedida que elija el usuario, por ahora en vertical para TikTok (el episodio entero), o sus shorts. Saca el guion de un video o tema (o usa el que trae el usuario, con su voz), junta el material original y arma el video con el audio que aporta el usuario. Úsala cuando pidan otro video "como el que hiciste", un guion de El Diff o de su noticiero, shorts de un tema, armar el video con su audio, o vestir de El Diff un guion propio.
---

# El Diff

Un episodio son dos fases separadas por algo que solo hace el usuario: grabar la narración. En la fase 1 le entregas
el guion; en la fase 2 (cuando llega su voz) armas el video con ella. `<skill>` es la carpeta de esta skill y los
scripts van con el `python` del sistema.

Episodios hechos, para copiar lo que funcionó: los de la carpeta donde trabajas (en Sloth, `trabajo/video-el-diff`), uno
por carpeta, y el de referencia en [`ejemplos/`](ejemplos/) (DeepSeek Harness).

## La marca

El noticiero es del usuario: su nombre, su sello y su despedida viven en `marca.json`, en la carpeta donde trabajas (la
que tiene una carpeta por episodio). `nuevo.py` lo copia a `src/marca.json` del episodio, de donde lo leen `guion.py` y el
video. El de [`plantilla/src/marca.json`](plantilla/src/marca.json) trae todos los campos:

- `nombre`: como se dice en la voz («Es <fecha>, y estás viendo <nombre>.»). `logo`: el renglón chico de arriba (puede
  ir vacío) y la palabra grande del recuadro. `sello`: la placa chica que va arriba en todo el video y en la portada.
- `tema`: de qué son las noticias; guía el tema, el ángulo y las búsquedas. `lema`: las dos líneas de diff bajo el logo,
  lo que quita (-) y lo que trae (+).
- `despedida` y `despedida_rotulo`: la frase final y lo que se lee en pantalla. `invitacion` e `invitacion_rotulo`: el
  último beat, a donde manda (su newsletter, su canal, otro video); vacía, el episodio acaba en la despedida.
- `aprendido`: lo que funcionó en su canal, con sus números (ver «El ángulo»).
- `voz_studio`: la voz de AI Studio con la que generas tú la narración (su nombre allí, p. ej. `Fola`; ver el paso 5);
  vacía, el usuario manda su voz. Si el mensaje trae la línea `Voz:`, manda ella
  ([`VOZ.md`](../video-base/VOZ.md) de video-base).

**Antes del paso 1**, si no hay `marca.json` en la carpeta donde trabajas, pregúntale al usuario en un solo mensaje el
nombre de su noticiero, su sello, de qué son sus noticias, cómo se despide y a dónde invita al final (newsletter, su
canal, nada). Propón tú el `logo` y el `lema` a partir de
eso, escríbelo y sigue. Si ya existe pero le falta un dato que vas a usar, pregunta solo ese. No vuelvas a preguntar:
si el usuario pide cambiar algo de su marca, cambia `marca.json` (y `src/marca.json` del episodio abierto). En un lote no
preguntes: sin `marca.json`, el episodio lleva la de la plantilla, y al entregar dile cómo poner la suya.

## Lo que el usuario pidió y no se negocia

- **Personalidad**: un noticiero seco y burlón, en español. Cómo escribirlo: [`ESTILO.md`](ESTILO.md).
- **Material original para todo**: si hablas de una persona, se ve esa persona; de un ejemplo, ese ejemplo; de una
  web, la captura de esa web; de un tuit, el tuit real; si existe el video oficial, va el video. Los chistes llevan
  metraje encontrado (memes, películas, caricaturas), recortes y rótulos; los gráficos propios, solo el mecanismo que se
  explica. Cómo juntarlo: [`MATERIAL.md`](MATERIAL.md); cómo se ve: [La imagen](ESCENAS.md#la-imagen).
- Cada dato se verifica contra su fuente primaria. Si la fuente dice otra cosa que el video del tema, gana la fuente
  y se lo dices al usuario.
- Las rutas que le des al usuario van en un bloque de código: su app convierte una ruta suelta en un botón que la
  esconde.

## Gasto de tokens

Lo caro no es escribir, es releer el contexto en cada llamada. En el episodio 2 se leyeron 31 millones de tokens de
caché contra 170 mil escritos. Todo lo que entra al contexto se vuelve a pagar en cada llamada siguiente, y las
imágenes son lo que más entra. Por eso:

- **Contexto limpio para lo pesado.** Todo el estado vive en los archivos del proyecto (`guion.md`, `material.md`,
  `guion.py`), así que lo que más lee (escribir las escenas, revisar las hojas) va en subagentes con el contexto nuevo,
  y tú coordinas (ver [Fase 2](#fase-2-el-video)). Una sesión parada más de una hora pierde el caché y vuelve a
  escribir todo su contexto.
- **Texto antes que imagen.** Lee las capturas con `python ubicar.py <imagen>` y los videos con su transcripción. Abre
  una imagen solo para decidir algo visual.
- **Subagentes con `model: "sonnet"`** para lo mecánico y para lo visual en volumen: el agente de captura
  ([`MATERIAL.md`](MATERIAL.md)) y la primera revisión de las hojas (fase 2). Te devuelven texto, y sus imágenes no
  se quedan en tu contexto. Si el mensaje trae una línea `Subagentes:` (la pone Sloth: lo medido, o lo que eligió el
  usuario), lanza cada uno con el `model` y el `effort` que dice: `captura` es el agente de captura, `pantalla` el de
  pantalla, `revisión` el revisor de las hojas y `escenas` los que escriben las escenas (paso 3). Sin esa línea, los
  de esta skill (para `escenas`, Opus con `effort: "medium"`: con Sonnet, en el-diff-8 y el-diff-9, la revisión
  encontró el doble de clips en el segundo equivocado y hubo que arreglar y renderizar otra vez).
- **Opus para lo creativo**: el guion, los chistes, qué material va en cada frase y los gags.
- **El usuario está esperando el video.** Lo que no depende de otra cosa va a la vez: las herramientas independientes
  en un mismo mensaje, y los renders y las transcripciones en segundo plano mientras sigues con lo demás. El 19 de
  octubre, la mitad de la fase 2 fue trabajo que podía haberse hecho antes de que llegara la voz.
- **Scripts para lo repetido.** Si un paso ya tiene script, corre el script.

## En un lote

Si el mensaje trae `Lote: video 3 de 20. Carpeta: <nombre>` (lo pone Sloth), eres uno de varios episodios que hacen a
la vez otros agentes, cada uno en su hilo, y nadie mira el tuyo mientras trabajas:

- **Tema:** el video de la línea `Enlace:`.
- **Proyecto:** `python <skill>/scripts/nuevo.py <nombre> --formato <formato>`, con ese nombre exacto y no `el-diff-N`: el panel de Sloth lo
  busca así, y dos episodios que cuentan a la vez el siguiente N acaban en la misma carpeta.
- **Voz:** la fase 1 acaba pidiendo el audio al usuario. Mientras llega, prepara las escenas según la fase 2.
- **No preguntes** antes de entregar: lo que preguntarías, decídelo y dilo al entregar.
- **No escribas fuera de tu carpeta** ni toques lo de otros episodios: corren a la vez. Nada de `taskkill /IM ffmpeg.exe`
  ni de matar procesos por nombre (mataste los renders de otros), ni de borrar o recomprimir material para hacer
  espacio. Si un script dice que queda poco disco, dilo y para.

## Formato

El formato lo elige el usuario en Sloth al crear el video y llega en la línea `Formato: vertical` (TikTok, 1080x1920)
o `Formato: horizontal` (YouTube, 1920x1080); sin esa línea, vertical. Cada episodio se hace en ese formato y solo en
ese: `nuevo.py` lo pone en `FORMATO` de `guion.py` y se compone así desde el principio. Si en el hilo piden el otro
formato, no hagas una copia: dile que cree otro video en Sloth con el otro formato. Se entrega solo el episodio
(`out/el-diff-final.mp4`, paso 6), sin cortes: lo que trae seguidores es el episodio entero (19 de octubre de 2026).
El `GANCHO` (el rótulo fijo de arriba) y la portada como primer cuadro son del vertical.

- **Shorts** (pide shorts, el mensaje trae línea `Short:`, o es una idea de Ideas que empieza con «Un video
  vertical»): no son un episodio. Sigue [`SHORTS.md`](SHORTS.md) en lugar de las fases 1 y 2: un short en este mismo
  hilo, o, si pide varios o es un lote, un plan de SMP que aprueba el usuario y un hilo por short.

## Series

Las series son formatos fijos del canal, cada una en su archivo: qué es, dónde buscar el tema y cómo elegirlo, qué
tiene que pasar en el video y unos temas para empezar. Las de todos los estilos están en
[`video-base/series/`](../video-base/series/) y su uso, en [`SERIES.md`](../video-base/SERIES.md); las propias del
noticiero irían en [`series/`](series/) (aún no hay ninguna), y con el mismo nombre la suya manda. Sloth las enseña al
crear un video y, si el usuario elige una, el mensaje trae la línea `Serie: <nombre> (<archivo>; …)`, con la ruta desde
la carpeta de las skills.

- Lee ese archivo antes de buscar el tema. Manda sobre lo general de esta skill en el tema y en lo que tiene que pasar;
  el tono, el material y la imagen siguen siendo los de esta skill. Lo que la serie dice de otro estilo (un género del
  guion del explicativo, una pieza de su plantilla), tradúcelo a lo de El Diff.
- **Si el usuario no dio un tema**, elígelo tú con "El tema, si no te dieron uno" de la serie, sin preguntar, y al
  darle el guion dile por qué ese y otras dos opciones.
- **Si dio un tema**, haz ese, con lo que pide la serie.

## Fase 1: el guion

1. **Proyecto.** `python <skill>/scripts/nuevo.py <nombre> --formato <vertical|horizontal>` (el de la línea
   `Formato:`, ver [Formato](#formato)) desde la carpeta donde trabajas (en Sloth,
   `trabajo/video-el-diff`). Si el mensaje trae `Carpeta: <nombre>` (la pone Sloth, sola o en la línea `Lote:`), es ese
   nombre, exacto: el panel de Sloth lo busca así. Sin esa línea, `el-diff-N`, con N el siguiente número libre en
   esa carpeta. Copia la plantilla y la marca, y su `node_modules` es una unión a la carpeta que comparten todos los
   episodios (la primera vez en una computadora se instala, unos minutos): no corras `npm install` en el episodio,
   porque cambiaría la de todos. Listo cuando la carpeta existe con `node_modules`. Con `el-diff-N`, si `nuevo.py` dice que la carpeta ya existe, usa otro nombre: puede ser de otra sesión
   haciendo el mismo episodio. En el episodio 4, una sesión de Codex en `el-diff-4` reescribió `guion.md` encima del de
   Claude.
2. **Fuentes.** Lo primero, en el mismo comando que `nuevo.py` y desde la carpeta del episodio:
   `node <skill>/scripts/preinvestigar.mjs <los enlaces del mensaje>`. En segundos lee lo que trajo el usuario y lo que
   eso enlaza: un post de X con su cita, su hilo y sus respuestas; un repo con sus cifras y su README; las páginas.
   Los textos quedan en `fuentes/textos/` y el resumen en `fuentes/investigacion.md`: empieza leyendo ese resumen, no
   las páginas. `python <skill>/scripts/fuente.py <url> fuentes/tema` baja el video del tema y lo transcribe (si otro
   episodio ya lo bajó, lo enlaza de ahí); córrelo en segundo plano a la vez, y en cuanto termine, también de fondo,
   `python <skill>/scripts/material.py`: recodifica ese video para `public/`, unos 5 minutos que en el-diff-8 se
   comieron el arranque de las escenas por correrlo después. Mientras transcribe no esperes: con el
   resumen y el título del video, lanza ya la primera tanda de búsquedas del paso 3. En el de des-to, esperarla fueron 2
   minutos sin hacer nada. Mientras baja, tiene el turno de YouTube de toda la máquina y las descargas de los clips
   esperan: si el guion no va a usar ese video, no lo vuelvas a lanzar cuando falle (en el-diff-10 un reintento frenó
   los clips 10 minutos). Si la descarga falla o sale de menos de
   720p, reintenta una vez con otro cliente; si aun así avisa que quedó en 360p, no pruebes otros clientes a mano (en el
   lote del 8 de octubre eso acabó en 429): sigue con la transcripción y vuelve a correrlo antes de sacar clips, que lo
   intenta otra vez y solo cambia el video si sale mejor. Si el
   usuario da un video de referencia de estilo, va a `fuentes/estilo`. Lee la transcripción completa del tema y mira lo
   que hay en pantalla con `python <skill>/scripts/cuadros.py hoja fuentes/tema/video.mp4 <desde> <hasta> <paso> <png>`.
   En un video largo, el agente de pantalla de [`MATERIAL.md`](MATERIAL.md) hace este recorrido por ti. Listo cuando
   sabes en qué segundo pasa cada cosa que vas a contar.
   **El ángulo.** Lo que funcionó en el canal del usuario está en `aprendido` de la marca, y manda sobre lo de aquí.
   Cuando te cuente cómo le fue a un episodio (vistas, retención a los 3 s, lo que vio en TikTok Studio), añádelo ahí
   con sus números. Sin eso, el punto de partida: en TikTok pegan los que tienen dos cosas, algo que conoce quien no
   sigue el tema (un producto, un juego o una app de todos los días, o a quién le quita trabajo o dinero) y alguien
   concreto desmentido por algo suyo (su post, su documentación, su anuncio); las noticias de dentro de la burbuja (la
   ficha técnica de un producto, un ranking, un resumen de tres lanzamientos) no. Antes de investigar, busca esas dos
   cosas en el tema y arma el episodio sobre ellas: qué producto conocido toca y quién quedó desmentido por lo suyo.
   Si el tema no las trae, búscalas en lo que pasó alrededor, en la misma línea (el mismo producto, la misma empresa,
   el mismo pleito, esa semana), y pon eso al frente: el tema original queda como una parte. Si ni así aparecen, sigue
   con el tema. En un lote no te cambies a otro tema (otro episodio podría tomar el mismo): reencuádralo. Con un guion
   del usuario, esto no aplica. Listo cuando puedes decir el ángulo en una frase con su persona y su giro («pidió
   frenar a los hackers de IA; el hacker era él»).
3. **Investigación y material.** Nada de una búsqueda por turno: el 19 de octubre fueron 11 a 16 rondas seguidas, con
   el modelo pensando un minuto entre cada una, y las búsquedas mismas sumaron 3 minutos de 20. Por tandas:
   - **Buscar.** En un solo turno, lista los datos que el guion necesita y todas las búsquedas para hallar la fuente
     primaria de cada uno (repo, anuncio oficial, página de precios, paper, post, reseña), en inglés y con los nombres
     propios, y córrelas de una vez: `node <skill>/scripts/buscar.mjs "consulta" "consulta" ...` (`--horas 72` para lo
     reciente). Busca en el radar de Sloth, que ya leyó las noticias del tema del noticiero en las fuentes que eligió el
     usuario: 6 búsquedas tardan 0.1 s y lo hallado queda en `fuentes/textos/` en segundos. Lo que no esté (lo de hace meses, una biografía, un sitio que el radar no sigue): todas las WebSearch en
     un mismo mensaje y `node <skill>/scripts/leer.mjs <url> <url> ...`, también de una vez. Si sale con el código 3
     (Sloth cerrado), todo va por WebSearch.
   - **Citas.** Escribe `fuentes/datos.json`, `[{"dato": ..., "claves": ...}]`: cada dato con sus cifras en dígitos y,
     en `claves`, las palabras con que lo diría la fuente, en su idioma («bookmarks», «seed round», «300ms»). Luego
     `python <skill>/scripts/citas.py` busca la cita de cada uno en todo `fuentes/textos/` (en menos de un segundo; seis
     subagentes Haiku tardaban 2.5 minutos) y la deja en `fuentes/fichas/citas.json`, con dos más por si acaso. Lee cada
     par: si la cita no dice el dato, cámbiala por otra de la lista; un dato DUDOSA suele ser dos datos o decirse con
     otras palabras. Con datos nuevos, añádelos al final de `datos.json` y córrelo otra vez: solo busca los nuevos y lo que
     ya corregiste se queda.
   - **Verificar.** `python <skill>/scripts/verificar.py`: cada dato de `datos.json` tiene que tener su ficha, cada cita
     estar en el texto de su página y cada cifra del dato en su cita (un dato sin cifras, sus nombres y claves). Lo que
     falla casi siempre es que la fuente dice otra cosa (978 guardados, no 600; $101.96, no 102): corrige el dato en
     `datos.json` y vuelve a correr `citas.py`, que cambia su ficha. Solo lo que no está se vuelve a buscar.
   - **Capturas.** En cuanto sepas qué se va a ver, escribe la lista en `fuentes/capturas.json` y córrela en segundo
     plano: `node <skill>/scripts/capturar.mjs fuentes/capturas.json --hoja revision/capturas.png` saca todas a la vez,
     para el celular ([Capturas en lote](MATERIAL.md#capturas-en-lote-y-el-agente-de-captura)). Lo que necesita
     criterio (memes, clips, fotos de personas, el video de un post) va al agente de captura.
   Listo cuando `verificar.py` no se queja de ningún dato que va en el guion.
4. **Guion.** Escríbelo según [`ESTILO.md`](ESTILO.md) en `fuentes/borrador.md`, no en `guion.md`, y llena
   `material.md` (frase, fuente, archivo). Sloth enseña `guion.md` en cuanto existe y el usuario lo graba enseguida:
   el 19 de octubre grabó dos datos más fuertes que su fuente antes de que se verificaran. `guion.md` nace en la
   entrega.
   Si el usuario trae su guion o pide conservar su manera de hablar, no lo reescribes: sigue [Un guion que no
   escribiste](ESTILO.md#un-guion-que-no-escribiste), propón los cambios mínimos y espera su respuesta (en un lote, no
   cambies su texto y deja las propuestas para la entrega). Luego busca el chiste visual de cada frase según [Para los
   chistes](MATERIAL.md#para-los-chistes) y anótalo en `material.md` con su archivo. Listo cuando cada afirmación del
   borrador tiene su fila en `material.md` con un archivo que existe y que miraste, el guion pasa [Para revisar el
   guion](ESTILO.md#para-revisar-el-guion), cada dato del borrador dice lo mismo que su fuente (ni más fuerte ni más
   amplio), y `python <skill>/scripts/largo.py <minutos>` (los de la línea `Duración:`) no se queja.
   Cada dato del borrador sale de una ficha que pasó `verificar.py`; un dato nuevo lleva su ficha y otra pasada. No
   esperes a las capturas para entregar: el 19 de octubre el borrador esperó 10 minutos al agente de captura, y lo que
   corrigió (los «100 ms» de Levanto) estaba en el texto de la página. Si después aparece una diferencia, corrige
   `guion.md` y avísale al usuario antes de que grabe.
   Si la fila cita una frase de una captura, comprueba con `python ubicar.py <png> "frase"` que esa captura la trae:
   en el episodio 3, `material.md` citaba una frase de Vals que su captura no tenía.
5. **Entrega.** Primero copia `fuentes/borrador.md` a `guion.md`: así aparece en Sloth, ya verificado. Di el ángulo
   en una frase (y, si cambiaste el enfoque del tema, por qué), qué corregiste contra las
   fuentes y qué fecha dice el logo, y pídele su voz: la graba donde quiera (en el celular sirve) y la manda en
   cualquier formato de audio. No pegues el guion en
   el chat si trabajas dentro de Sloth (en su carpeta `trabajo`): lo lee en la etapa Guion del panel, y su botón
   «Copiar» lo copia sin el título ni los encabezados. Fuera de Sloth, pégalo completo **sin los encabezados `##`**. Lo graba (o lo genera) leyendo todo lo que ve: en el episodio 5 la voz leyó
   los 14 títulos. No hace falta escribir la pronunciación.
   **Con `Voz:` de AI Studio en el mensaje, o `voz_studio` en la marca y sin `Voz:`, la voz la generas tú**: no se
   la pidas. Al copiar `guion.md`, pídela con `generar_voz` (`archivo` el `guion.md`, que se narra sin títulos ni
   encabezados, y `salida` `fuentes/voz/ai-studio.wav`), como dice [`VOZ.md`](../video-base/VOZ.md): un guion de 6
   minutos tarda unos 2 minutos. Ese es el WAV de la fase 2. Si falla (sin cuenta conectada, la cuota del día), díselo
   y pídele la voz como siempre. Si corriges `guion.md` después, vuelve a pedirla: con el mismo texto sale al momento.
6. **Las escenas, sin esperar la voz.** En cuanto copias `guion.md`, haz las escenas (pasos 2 y 3 de la
   [Fase 2](#fase-2-el-video)), aunque las capturas no hayan terminado: la voz llega en unos 2 a 4 minutos. Lo que
   cambie después en el guion, o lo que pida el usuario, lo corrige otra vez el agente de ese bloque.

## Fase 2: el video

La voz llega adjunta, en el formato que sea (m4a del celular, mp3, wav…): en Sloth, el mensaje trae su ruta (en
`data\attachments` de Sloth). `voz.py` la convierte. Todo se corre en la raíz del proyecto.

La fase 2 la coordinas tú, en tu sesión: lo pesado va en subagentes con el contexto nuevo (los que escriben las
escenas y los revisores) y lo demás son scripts. Así salió el-diff-10 (25 de octubre) en 26 minutos de punta a punta,
con lo que no depende de otra cosa a la vez:

- **En cuanto copias `guion.md`** (paso 6 de la fase 1), en un mismo mensaje: la voz (`generar_voz`, o la que mande
  el usuario), `material.py` y `repartir.py` (pasos 2 y 3), los agentes de cada bloque, de fondo, y la portada (paso 6).
  Las capturas y los clips que aún no llegan salen como `FALTA` o en blanco: cuando lleguen, otra vez `material.py`.
- **Cuando llega el WAV:** `voz.py` (paso 1), de fondo, mientras escriben las escenas.
- **Con los bloques y la voz listos:** la línea del paso 4, la revisión del paso 5 con sus arreglos (los hace el agente
  de cada bloque) y `final.py` (paso 6), que ya pone la portada.

Espera lo que corre en segundo plano en tramos de 4 minutos como mucho
(`timeout 230 bash -c 'until <ya terminó>; do sleep 10; done'`): tu caché dura 5 minutos, y cada espera más larga
vuelve a pagar todo tu contexto.

1. **Voz.** `python <skill>/scripts/voz.py <audio> "Nombre1,Marca2,..."` (los nombres propios del guion como pistas).
   Transcribe con tiempos por palabra y nivela a -19.4 LUFS en `public/voz/narracion.wav`. Antes compara la voz con
   `guion.md`: si dice que el audio no es de este guion, para y díselo al usuario (en el lote del 7 de octubre, un
   episodio se armó entero con el audio de otro); la voz que ya había queda como estaba. Si avisa de un tramo repetido
   (AI Studio a veces lee un párrafo dos veces), córtalo de `fuentes/voz/original.wav` y vuelve a correr `voz.py` con
   él. Si la voz leyó los títulos de sección, lo avisa: córtalos con `python <skill>/scripts/quitar_titulos.py --cortar`
   y vuelve a correr `python <skill>/scripts/voz.py fuentes/voz/sin_titulos.wav "Nombre1,Marca2,..."`. Al final lista las
   oraciones que no empiezan después de una pausa. Las cifras llegan con letra ("noventa y nueve punto dos"), que el
   alineador sí sitúa. Si aun así alguna sale marcada `CIFRA` (voz.py volvió a los dígitos y lo dijo), quedó corrida
   hasta 2 s y el porcentaje de `adaptar.py` no lo detecta: corrige sus tiempos en `fuentes/voz/palabras.json` (guarda
   una copia antes); el inicio real es uno de los silencios que lista.
   Vuelve a correr `python <skill>/scripts/cifras.py` hasta que no quede ninguna `CIFRA`.
2. **Material a `public/`.** `python <skill>/scripts/material.py`, en segundos: las imágenes a `public/web/` (logos,
   memes y personas en sus carpetas), los videos recodificados a `public/videos/` y el del tema a
   `public/clips/tema.mp4` (lo más lento: córrelo en cuanto `fuente.py` lo baje, y otra vez si llega material nuevo).
   - Antes de usar un segundo de `material.md`, compruébalo con
     `python <skill>/scripts/cuadros.py hoja public/clips/tema.mp4 <s1,s2,...> <png>`. El editor del video corta, y un
     segundo de diferencia muestra otra pantalla.
   - Cada video de `public/` va recodificado (`material.py` y `metraje.py` lo hacen): sin eso, en el episodio 4
     `final.py` falló con "No frame found at position" en un clip sano.
   - Los cuadros fijos salen con
     `python <skill>/scripts/cuadros.py rejilla public/clips/tema.mp4@<segundo> --guardar public/web/<nombre>.png`.
3. **Escenas.** Escribe `guion.py` según [`ESCENAS.md`](ESCENAS.md): un beat por imagen, cortado en el sustantivo
   ([El corte en el sustantivo](ESCENAS.md#el-corte-en-el-sustantivo)), con los `say` seguidos iguales a lo que se lee.
   Los rótulos, los recortes y el 👉 van con `encima` en su palabra. Las marcas y la cámara sobre texto se ponen con la
   frase (`marca_texto`, `caja_texto`, `zona`), sin medir. En vertical, pon el `GANCHO` (el rótulo fijo de arriba,
   con la regla de "El gancho" en [`ESTILO.md`](ESTILO.md#el-gancho)). Lo que se escribe, con todas esas piezas, está
   en [`ejemplos/vertical-guion.py`](ejemplos/vertical-guion.py) (el arranque y el cierre de un episodio vertical).
   Escríbelo en tandas de unas 8 frases, en el orden del guion, y tras cada tanda corre `python guion.py`; una captura
   que aún no llega no lo detiene: su beat sale sin marcas y `guion.py` la lista como `FALTA`. Si la voz
   ya llegó, corre la línea del paso 4: así el usuario ve en el editor de Sloth cómo se va armando el video, en vivo.
   Mientras falten tandas, la última escena escrita se estira hasta el final de la voz y el porcentaje de
   `adaptar.py` sale bajo por fuerza: la comprobación del 90 % del paso 4 es con el guion completo.

   **En paralelo.** Un episodio son de 100 a 180 escenas. En des-to (24 de octubre), tres agentes de Opus tardaron 12
   minutos cada uno; en el-diff-7, diez tardaron de 2 a 6.5, pero escribir sus diez encargos tomó 2 minutos más. Así:
   - `python <skill>/scripts/repartir.py --gancho "LÍNEA 1 / LÍNEA 2"` parte el guion en bloques de unas 120
     palabras, deja `parrafos` de `guion.py` con un `*bloque("<n>")` por bloque (y el logo y el final, que salen de la
     marca) y escribe `fuentes/escenas/encargo.md`: lo que todos leen y quién escribe qué. No hace falta el encabezado
     de constantes: los bloques usan las rutas.
   - Lanza en un mismo mensaje un agente por bloque (`subagent_type: "general-purpose"`, con el `model` y el `effort`
     de `escenas`, `run_in_background: true`: mientras escriben haces la voz y la portada, y te avisan al terminar), cada
     uno con una sola línea: «Lee `<ruta>/fuentes/escenas/encargo.md`
     y escribe el bloque `<n>`». Si el cierre cobra algo del arranque, añade esa línea solo al del cierre.
   - Una sección larga queda en dos bloques con el mismo id de párrafo, y `guion.py` los junta.

   Con menos de unas 25 frases, escríbelo tú solo.
4. **Línea de tiempo.** `python guion.py && python voz/adaptar.py && python audio/sintetizar.py && node vivo.mjs`.
   `adaptar.py` imprime qué porcentaje de las palabras del guion encontró en la voz y avisa si es menos del 90 %: el
   `say` no coincide con lo que se grabó. `sintetizar.py` hace la música a lo que dura la voz (si ya está, no tarda nada). `vivo.mjs` arma en un segundo la vista en
   vivo: en el editor de Sloth, la etapa Escenas reproduce el video tal cual saldrá, sin renderizarlo, y el usuario lo
   mira mientras trabajas. Cada vez que cambies `guion.py` o algo de `src/`, vuelve a correr esta línea entera para que
   la vista se ponga al día.
5. **Revisión.** Primero lo que se mide: `node <skill>/scripts/reglas.mjs`. Recorre la vista en vivo sin renderizar (unos
   20 s un episodio de 6 min, en varios Chrome a la vez) y lista, por beat y segundo, lo citado chico, cortado o tapado (por la fuente, una etiqueta,
   un emoji o el sello), las marcas fuera de la zona, las capturas que dejan bandas vacías en vertical y el texto propio
   cortado o a ras del borde. Arréglalo y vuelve a correrlo hasta que no quede nada (o solo lo que es a propósito): una
   captura de `pagina.mjs` en tira se saca otra vez desde su copia con lo de alrededor (`--contexto`, lo dice la regla),
   y el encuadre va con `zona()`.

   Luego lo que necesita criterio. Corre `node revisar.mjs 0.95` y `python hojas.py 95`: en vertical, hojas de 6x2
   cuadros a 360x640, el tamaño de un celular, que es donde se tiene que leer todo; en horizontal, de 4x4 a 480x270.
   Solo entran los beats de ahora. Los cuadros salen en unos 10 s con el
   renderizador del final, así que se ven como en el video entregado. Al 95 % cada marca ya terminó de dibujarse:
   al 70 % muchas siguen a medio pintar y parecen errores. Esta revisión es antes de renderizar: el 19 de octubre, lo
   que no se leía en el celular se vio después del render y costó dos renders más.

   Lanza **un revisor por hoja**, todos a la vez en un mismo mensaje (con `model: "sonnet"`, `effort: "high"` o lo que
   diga `revisión` en la línea `Subagentes:`, y `run_in_background: false`: en segundo plano terminas tu turno
   esperándolos y no siempre vuelves). Uno solo tardó 5 minutos con diez hojas; uno por hoja, 30 s. A cada uno, una
   sola línea: «Lee `<skill>/REVISAR.md` y revisa la hoja `<n>` del proyecto `<ruta>`» ([`REVISAR.md`](REVISAR.md)
   tiene qué abrir y qué buscar). Un encargo largo por revisor tardaba un minuto en salir antes de que empezara el
   último. Acierta casi siempre pero no siempre: comprueba cada hallazgo en su cuadro completo (`revision/`) antes de
   corregirlo. Una imagen que se queda más de 12 s sin que nada cambie la ves tú en `guion.json`.

   Los arreglos los hace el agente de cada bloque, que ya tiene su contexto: a cada uno, con `SendMessage`, solo los
   hallazgos de sus beats (de `reglas.mjs` y de los revisores), todos a la vez; los arreglan en uno o dos minutos y
   corren `python guion.py`. Lo que es del material (una captura de otra parte de la página, un clip que no llegó) lo
   arreglas tú mientras tanto. Una sola ronda: después, la línea del paso 4 y `final.py`, sin volver a revisar. Al
   terminar, dile al usuario en dos listas qué se arregló y qué conviene que mire él en la vista en vivo, con el beat y
   el segundo.
6. **Final.** `python <skill>/scripts/final.py` en segundo plano. Renderiza el episodio en su formato por tramos en
   `out/partes/` con el renderizador web de Remotion, en varios Edge sin ventana (`render_web.mjs`), los une, lo deja a
   -14 LUFS con el pico por debajo de -1.5 dBTP (medidos en el archivo, lo imprime), deja `revision/final_hoja.png` y
   abre el Explorador. Cada tramo que no cambió se reutiliza: corregir una escena después del final es volver a correr
   `final.py`, que rehace solo sus tramos. Si otro episodio está renderizando, espera su turno (lo dice al empezar): no
   lo mates ni lo lances otra vez. Si avisa de la plantilla de antes, haz lo que dice. No entregues un defecto conocido
   por no renderizar.
   Solo en vertical, su portada es el primer cuadro, según [`PORTADA.md`](../video-base/PORTADA.md) de video-base, en
   `portada.png`. Hazla mientras renderiza, no después: en el episodio de des-to, la portada esperó al final y sumó
   casi 5 minutos. Con ChatGPT, lo que pide El Diff en el pedido: el `GANCHO` de título, en letra
   condensada gruesa, la primera línea blanca y la segunda roja, la placa chica con el `sello` de la marca arriba, sobre
   fondo oscuro, y lo que el episodio enseña (la captura o la cara de la noticia). Sin ChatGPT, `portada_sin_ia.mjs`
   pone un cuadro del video de fondo y el título encima en un solo color: el `GANCHO` en un renglón, y `--t` en un
   cuadro sin texto citado al centro. `final.py` la renderiza como un tramo de un cuadro y la pega sin recodificar (no
   uses `portada.mjs`): si ya existía al empezar, sale con ella; si no, vuelve a correr `final.py` cuando esté, que
   tarda unos 20 s (y lo mismo si cambias `portada.png`). Mira la hoja y entrega la ruta de `out\el-diff-final.mp4`,
   qué es material original y qué son gráficos propios. Si no viste el video completo, dilo.

## Al terminar

No le propongas al usuario cambios a la skill.

## Entorno

- El Python de Sloth solo se usa para yt-dlp y WhisperX, y siempre con `-E -s -B -X utf8`. `scripts/comun.py` lo busca
  donde lo busca video-base (`sloth.py`) y lo llama así: usa los scripts en vez de llamarlo a mano. Los procesos de
  transcripción están en `python\procesos` de Sloth (`SLOTH_PROCESOS`).
- Los parches de varias líneas van en un archivo `.py` dentro de `fuentes/scripts/`, escrito con la herramienta Write:
  un heredoc de bash con comillas mezcladas o con `\n` se rompe (pasó en casi todos los episodios del lote).
- Un script de Python que imprime emojis o acentos truena en la consola de Windows (cp1252): córrelo con `python -X utf8`.
- Los renders de `final.py` van de uno en uno en la máquina y paran si el disco no aguanta otro render. Antes barren
  lo que dejan cortados los episodios de antes del render web (`remotion-*` y `ed-rev-*` de %TEMP%); los perfiles de
  Edge los barre `chrome.mjs` de video-base.
- `revisar.mjs` del episodio encuentra la skill por la ruta que le escribió `nuevo.py` (o `VIDEO_EL_DIFF`).
- `ffmpeg` dentro de un ciclo de bash lleva `-nostdin`. `robocopy` sale con código 1 cuando copió bien.
- WebFetch no puede leer x.com (402) ni openai.com (403): léelas con `scripts/leer.mjs` (también lee PDFs) y
  captúralas con `scripts/pagina.mjs`; el video y las fotos de un post, con `scripts/tuit.py`.
