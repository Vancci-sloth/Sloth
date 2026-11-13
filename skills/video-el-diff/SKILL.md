---
name: video-el-diff
description: Hace un episodio de El Diff, un noticiero seco y burlón en español con el nombre, el sello y la despedida que elija el usuario, en vertical (TikTok) u horizontal (YouTube), o sus shorts. Saca el guion de un video o tema (o usa el que trae el usuario, con su voz), junta el material original y arma el video. Úsala cuando pidan otro video "como el que hiciste", un guion de El Diff o de su noticiero, shorts de un tema, armar el video con su audio, o vestir de El Diff un guion propio.
---

# El Diff

Escribes tres archivos y corres un comando. El guion (`guion.md`), los datos con su cita (`fuentes/datos.json`) y
`momentos.json`: qué se ve en cada palabra. El director arma solo las escenas (encuadra cada captura en su cita, la
resalta y la traduce, encadena las tomas de una página, acomoda rótulos y recortes, pone el logo y la despedida), y
`hacer.py` junta el material, hace la voz, mide, pone la portada y renderiza. **No escribas código ni abras la
plantilla**: lo que el episodio necesita se dice en `momentos.json`. Es el motor de
[`MOTOR.md`](../video-base/MOTOR.md) de video-base.

`<skill>` es esta carpeta y los scripts van con el `python` del sistema, desde la raíz del episodio.

## La marca

El noticiero es del usuario: su nombre, su sello y su despedida viven en `marca.json`, en la carpeta donde trabajas (la
que tiene una carpeta por episodio); `nuevo.py` la copia a `src/marca.json`. Sus campos, en
[`plantilla/src/marca.json`](plantilla/src/marca.json): `nombre` (como se dice: «Es <fecha>, y estás viendo <nombre>.»),
`logo`, `sello`, `lema`, `tema` (de qué son las noticias: guía el tema y las búsquedas), `despedida` e `invitacion` (las
dos últimas frases del guion, tal cual), `aprendido` (lo que funcionó en su canal, con sus números) y `voz_studio`.

Si no hay `marca.json`, pregúntale en un solo mensaje el nombre de su noticiero, su sello, de qué son sus noticias,
cómo se despide y a dónde invita al final; propón tú el `logo` y el `lema`, escríbelo y sigue. Si pide cambiar algo,
cambia `marca.json` (y `src/marca.json` del episodio abierto). En un lote no preguntes: va la de la plantilla, y al
entregar dile cómo poner la suya. Con varios noticieros, cada uno más es `marcas/<nombre>.json`; con la línea `Marca:`,
`nuevo.py --marca <nombre>`.

## Lo que el usuario pidió y no se negocia

- **Personalidad**: un noticiero seco y burlón, en español. Cómo se escribe: [`ESTILO.md`](ESTILO.md).
- **Material original para todo**: de una persona, esa persona; de una web, su captura; de un tuit, el tuit; si hay
  video oficial, el video. Los chistes llevan metraje encontrado (memes, películas), recortes y rótulos.
- **Cada dato es verdadero y sale de su fuente primaria**: su `cita` es el texto literal de la página, y eso es lo que
  se ve resaltado. Si la fuente dice otra cosa que el video del tema, gana la fuente y se lo dices al usuario.
- **Se renderiza una sola vez.** Lo que veas después va en lo que conviene que mire el usuario, con el segundo.
- Las rutas que le des al usuario van en un bloque de código.

## El ángulo

Lo que funcionó en el canal está en `aprendido` de la marca, y manda. Cuando te cuente cómo le fue a un episodio,
añádelo ahí con sus números. Sin eso: en TikTok pegan los que tienen algo que conoce quien no sigue el tema (un
producto de todos los días, o a quién le quita trabajo o dinero) y alguien concreto desmentido por algo suyo (su post,
su documentación, su anuncio). Las noticias de dentro de la burbuja (una ficha técnica, un ranking) no. Si el tema no
trae esas dos cosas, búscalas en lo que pasó alrededor esa semana y ponlas al frente. Con un guion del usuario no
aplica. Listo cuando dices el ángulo en una frase con su persona y su giro («pidió frenar a los hackers de IA; el
hacker era él»).

## momentos.json

Un momento por cada cosa que entra en pantalla: empieza en su `palabra` (de una a tres palabras seguidas de
`guion.md`, tal cual) y dura hasta el siguiente. Van en el orden en que se dicen: una palabra que se repite se toma
la primera vez después del momento anterior. **Corta en el sustantivo** (el nombre, la cifra, la fecha, el objeto),
nunca en un verbo ni un conector. La frase del logo y la despedida no llevan momento: las pone la marca.

**Cuántos:** uno cada diez palabras, más o menos (un minuto son unos 18; seis minutos, unos 100). Una frase larga son
dos o tres: el primero pone la base (la captura con su cita) y los siguientes, sin base, le ponen encima lo que solo
tú puedes escribir: el `rotulo` con la cifra exacta o la fecha, el `sello` en el veredicto. **El director pone solo,
cada uno en su palabra, la pegatina de cada marca de `logos` la primera vez que la voz la nombra en una toma y el
óvalo en cada cifra de la cita que la voz dice**: no escribas momentos para eso (`--revisa` dice cuántos puso). Para
que caigan, pon en `logos` cada marca del guion con el id tal como se dice (`"openai"`, `"samsung"`) y escribe las
cifras del guion en dígitos, como en la cita.

```json
{
  "gancho": "TE CORRIERON / PARA PAGAR LA IA",
  "fuentes": {
    "fortune": { "url": "https://fortune.com/2026/10/26/…", "pie": "fortune.com · 26 oct 2026" },
    "blog": { "url": "https://blogs.microsoft.com/…", "pie": "blog de Microsoft · 26 oct 2026" }
  },
  "personas": { "nadella": { "nombre": "Satya Nadella", "placa": "SATYA NADELLA · CEO" } },
  "logos": { "microsoft": "sitio:microsoft.com", "openai": "sitio:openai.com" },
  "clips": { "bobs": { "url": "https://www.youtube.com/watch?v=…", "desde": 41, "hasta": 45, "que": "los Bobs de Office Space entrevistan" } },
  "momentos": [
    { "palabra": "Este lunes", "fuente": "fortune", "rotulo": "LUN 26 OCT", "logo": "microsoft",
      "cita": "Microsoft is offering buyouts to roughly 60,000 employees, or about 27% of its workforce",
      "es": "Microsoft ofrece dinero por irse a unos 60,000 empleados, cerca del 27 % de su plantilla" },
    { "palabra": "uno de cada cuatro", "rotulo": { "texto": "27 %", "color": "roja" }, "ovalo": "27%" },
    { "palabra": "para que se vayan", "titular": "LA SALIDA\nES POR ALLÁ", "color": "rojo", "persona": "nadella" },
    { "palabra": "en el blog", "fuente": "blog", "cita": "The Voluntary Exit Offer is new for us.",
      "es": "La Oferta de Salida Voluntaria es nueva para nosotros.", "sello": "VOLUNTARIA" },
    { "palabra": "dos Bobs", "clip": "bobs", "rotulo": { "texto": "RECURSOS HUMANOS", "tacha": "CONSULTORES" } },
    { "palabra": "todo bien", "meme": "This Is Fine", "logo": "microsoft" },
    { "palabra": "Básicamente", "diagrama": { "titulo": "A dónde se va el dinero",
        "nodos": [ { "id": "sueldos", "texto": "Tu sueldo", "en": "sueldos" },
                   { "id": "chips", "texto": "Centros de datos", "color": "rojo", "en": "chips" },
                   { "id": "ia", "texto": "OpenAI", "logo": "openai", "en": "OpenAI" } ],
        "flechas": [ { "de": "sueldos", "a": "chips", "texto": "$92,000 M", "en": "pasan" }, { "de": "chips", "a": "ia" } ],
        "cambios": [ { "id": "sueldos", "en": "recortan", "color": "gris", "texto": "Tu sueldo\n(ya no)" } ] } }
  ]
}
```

Un momento lleva **una base** (lo que llena la escena) y lo que va encima; **sin base, sigue la escena anterior** con
algo nuevo encima (así entra un rótulo en su palabra, sobre la misma captura).

- **`fuente` + `cita`**: la captura de la página, encuadrada en la cita, con el resaltador. La `cita` es texto literal
  de la página (cópiala de `fuentes/textos/` o de lo que te dio `citas.py`): la oración que lo dice, o la parte de
  ella que lo dice, de 200 caracteres como mucho (más, llena la pantalla de letra chica). En inglés lleva `es`, lo
  mismo en español y del mismo largo (de 80 a 125 % de sus caracteres): si es la oración entera, la traducción va en
  su lugar; si es un pedazo, en una nota abajo. Dos momentos seguidos de la misma página son una sola toma que baja de
  una cita a la otra. `sin_marca`: se ve sin resaltar. De un post de X, la `url` del post. `ocurrencia: 2` si la cita
  sale dos veces en la página.
- **`clip`**: el id de `clips` (un tramo de un video: `url`, `desde` y `hasta` en segundos del original, de 1 a 4 s; o
  uno que ya está en la carpeta del noticiero: `python <skill>/scripts/metraje.py lista`), o `"tema@62"`: el video del
  tema, desde ese segundo.
- **`titular`**: texto enorme sobre negro (`\n` parte renglones), con `color` (`fuego`, `sol`, `rojo`, `verde`,
  `azul`, `crema`), `emoji` (uno de `plantilla/public/emoji`, sin `.png`) y `persona` debajo. Para el remate, la
  cifra que es la noticia o la bisagra; no para un dato que tiene fuente.
- **`meme`**: una plantilla que todos reconocen, por su nombre (`python <skill>/scripts/memes.py [palabras]` las
  lista), con `etiquetas` (`[{"texto", "x", "y"}]`, en fracciones de la imagen) si las lleva.
- **`diagrama`**: el mecanismo, dibujado: de 2 a 8 `nodos` (`id`, `texto` de dos o tres palabras, `color`, `logo`) y
  sus `flechas` (`de`, `a`, `texto`), cada pieza con `en`: la palabra de ese momento en que entra. `cambios` vuelve a
  pintar un nodo cuando la voz lo dice (se pone rojo al fallar, cambia su texto). Es **un solo momento**, largo, que
  dura lo que la explicación: va donde el guion dice «Básicamente,» y la voz explica en serio.
- **`imagen`**: una foto real, el id de `imagenes` (`{"<id>": {"url": "<la página o la imagen>"}}`).
- **`v`**: una escena de [`ESCENAS.md`](ESCENAS.md) tal cual (tarjetas que se apilan, un duelo de cifras). Solo
  entonces lee ESCENAS.md.
- **`rotulo`**: lo que la voz **no** dice: la cifra exacta cuando la voz redondea, el nombre difícil, la fecha, el
  término técnico, la ironía que la voz calla. Un texto (el director lo acomoda donde no tapa la cita; con dígitos va
  en banda) o `{"texto", "estilo": "crema" | "rojo" | "banda" | "placa", "color": "amarilla" | "roja" | "verde"}`, o
  una lista. Nunca copia la frase que se oye. Con `tacha`, primero sale ese texto, se tacha y lo cambia el de verdad
  («ACCIONISTAS» → «CORNUDOS»): el chiste que se escribe y no se dice.
- **`logo`**: el id de `logos` (`{"<id>": "sitio:<dominio>"}`, o `"x:<cuenta>"`, o la URL de la imagen), o una lista:
  la pegatina de la empresa cae en su nombre y se queda mientras dure la toma. **Cada marca que se nombra, su logo**;
  encima de un meme, lo vuelve de la noticia.
- **`sello`**: el veredicto en una o dos palabras, de golpe sobre la prueba («FALSO», «VOLUNTARIA»).
- **`ovalo`, `flecha`, `mano`, `cajas`**: palabras de la cita que se ve, tal cual (o una lista), que se rodean con
  un óvalo, se señalan con una flecha dibujada o con el 👉, o se enmarcan en rojo: la cifra, el nombre. Van en la
  palabra de su momento. Si salen dos veces en la captura, `{"texto": "…", "ocurrencia": 2}`.
- **`persona`**: el id de `personas`: su recorte entra en su nombre, con su `placa` la primera vez. Quien decide en la
  historia; al particular de la noticia no se le pone cara. `busca`, su nombre exacto en inglés si el de `nombre` no da
  con su foto (sale de Wikimedia Commons; mírala en la hoja). Sirve igual para un animal o un objeto del chiste.
- **`entra`**: `"flash"`, `"barrido"` o `"glitch"` en vez del corte seco, cuando cambia la idea. Una cada medio
  minuto, no en cada momento. Ya van solos: el parpadeo de un meme o un clip, la interferencia de cada sección, la
  captura de otra página que cae como un papel sobre la anterior, la primera toma de cada página que baja de su
  encabezado a la cita, y la cifra de un rótulo en banda, que cuenta hasta su número (`"corre": false` la deja quieta).
- **`gancho`** (vertical): el rótulo fijo de arriba, dos renglones separados por `/`, seis palabras como mucho, con
  el dato que para el dedo. No repite la primera frase: la contradice o la adelanta.
- `quieto: true` en el momento donde la voz lee un documento entero o explica un mecanismo (más de 10 s).

**La imagen es la segunda voz**: enseña la prueba de lo que se dice y pone la otra mitad del humor. Lo que
`hacer.py --revisa` exige, medido en los Code Report de referencia ([`REFERENCIAS.md`](REFERENCIAS.md)): algo nuevo en
pantalla cada 2 o 3 s, de 4 a 7 rótulos por minuto, un chiste visual por minuto o más, y casi la mitad de la voz
sobre material real. Lo que no puede medir y decide si se ve:

- **Quédate en la prueba y haz que pase algo dentro**: una captura con su cita, y encima, palabra por palabra, el
  logo, el óvalo en la cifra, el rótulo, el sello. Vale más que cambiar de captura cada frase: en las referencias hay
  dos capas o más casi todo el tiempo.
- **La versión oficial en la voz, el documento que la desmiente en la imagen**, mejor si es de la propia empresa.
- **Un chiste visual por frase que lo pida**, en este orden: el nombre propio por su otro sentido (Reflection → el
  espejo), la metáfora con la escena famosa que hace eso («a sus espaldas» → Bruto), el eufemismo con el meme que dice
  lo que la voz calla, la frase seca con una cara de reacción. El meme exacto, no una sorpresa cualquiera; y se vuelve
  de la noticia con un rótulo o el logo encima.
- **«Muchos» o «todos»** son de tres a cinco titulares de fuentes distintas, uno por momento.
- **Abre con la prueba o el clip de la noticia**, no con un titular.
- **El callback se ve**: la imagen del arranque regresa en el cierre, cambiada (el mismo meme con otro rótulo). Y lo
  más fuerte se desvía: si la voz compara con un dictador, sale una cara pop furiosa, no la violencia.

Qué enseñar por cada cosa que se menciona y las recetas de lo raro (un post de Reddit, el video del tema, una app):
[`MATERIAL.md`](MATERIAL.md).

## Los pasos

1. **En un solo mensaje**: `python <skill>/scripts/nuevo.py <carpeta> --formato <vertical|horizontal>` (la carpeta de
   la línea `Carpeta:`, exacta; sin ella, `el-diff-N`; `--marca <nombre>` si hay línea `Marca:`) y, ya en esa carpeta,
   `node <skill>/scripts/preinvestigar.mjs <los enlaces del mensaje>` (lee lo que trajo el usuario y lo que eso
   enlaza) y `node <skill>/scripts/buscar.mjs "consulta" "consulta" …` (todas las búsquedas de una vez, en inglés y con
   los nombres propios; `--horas 72` para lo reciente). Buscan en el radar de Sloth y dejan cada página en
   `fuentes/textos/`. Si sale con el código 3 (Sloth cerrado), todo va por WebSearch y
   `node <skill>/scripts/leer.mjs <url> …`. Con un video de YouTube de tema, además y de fondo:
   `python <skill>/scripts/fuente.py <url> fuentes/tema` (lo baja y lo transcribe en `fuentes/tema/transcripcion.txt`).
   Con la línea `Serie:`, lee su archivo antes ([`SERIES.md`](../video-base/SERIES.md)): manda en el tema.
2. **Los datos.** Lee los dos o tres textos que sostienen el ángulo (no todos) y escribe `fuentes/datos.json`,
   `[{"dato": …, "claves": …}]`: cada dato que dirá el guion, con sus cifras en dígitos y, en `claves`, las palabras
   con que lo dice la fuente en su idioma. `python <skill>/scripts/citas.py` busca la cita literal de cada uno en todo
   lo leído (un segundo) y la deja en `fuentes/fichas/citas.json`, con su página. Si una cita no dice el dato, cámbiala
   por otra de su lista o corrige el dato: gana la fuente. Una ronda más de búsqueda solo para lo que salió SIN CITA.
3. **El guion lo escribe el subagente `guionista`** (Opus: Agent con `subagent_type: "guionista"`, sin `model` ni
   `effort`), si tu lista de agentes lo trae; si no, lo escribes tú con [`ESTILO.md`](ESTILO.md). Pásale en unas doce
   líneas: el ángulo y la tesis; que lea entero `<skill>/ESTILO.md` y `<episodio>/fuentes/fichas/citas.json` (solo usa
   esos datos); la marca (`nombre`, `despedida` e `invitacion` tal cual, la fecha del logo) y lo de `aprendido`; las
   palabras (180 por minuto de la línea `Duración:`; sin ella, 1,100); y la ruta `<episodio>/guion.md` con su forma:
   `# Título`, el arranque en frío sin encabezado, la frase del logo, y cada bloque bajo su `## Nombre`. Con un guion
   del usuario no lo llames: sigue [Un guion que no escribiste](ESTILO.md#un-guion-que-no-escribiste).
   En cuanto exista `guion.md`: `python -B -X utf8 <skill>/scripts/hacer.py --solo-voz --studio <Voz> --dura <minutos>`
   (sin fondo: vuelve en un segundo), con la voz de la línea `Voz:` (o `voz_studio` de la marca). Si el guion se pasa
   o se queda corto dice ✗ y cuánto (cuenta todo lo que se narra, con la frase del logo, la despedida y la
   invitación): ajústalo **antes** de escribir los momentos, que cambiarlo después los desancla. Con ✓ deja haciéndose
   solas la voz y la copia de cada página de las fichas, que tardan lo que tú en los momentos: no las esperes.
4. **`momentos.json`**, con Write y en JSON directo (un script que lo genere o un heredoc tardan el doble y se rompen
   con las comillas); las URL de `fuentes`, copiadas de `fuentes/fichas/citas.json`. El primer momento después de la
   frase del logo lleva su base. Luego `python -B -X utf8 <skill>/scripts/hacer.py --revisa --dura <minutos>` (sin
   fondo, un segundo) hasta que diga ✓: dice todo lo que falla de una vez. Luego, **en segundo plano**:
   `python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz> --dura <minutos>` (la voz que ya pediste no se repite).
   Sin voz que generar: `hacer.py --sin-voz` de fondo (deja el material y las escenas listos), dile al usuario que su
   guion está en la etapa Guion y pídele el audio; cuando llegue, `hacer.py --audio <archivo>`. Termina tu mensaje: te
   avisa al acabar. No esperes con `sleep` ni lo vigiles.
5. **Si dice ✗**, arregla lo que dice en `momentos.json` y vuelve a correrlo de fondo, sin `--studio` si el guion no
   cambió (la voz y el material ya hechos no se repiten). **Si dice ✓**, mira `revision/hoja.png` y `portada.png`: que
   cada imagen sea la de su frase, que la persona sea quien dice su placa y que nada tape lo citado. Los ✘ que
   `hacer.py` deja dichos (una captura en tira, una cita chica) son de acomodo: no se arreglan con otro render; van en
   lo que conviene que mire el usuario.
6. **Entrega**: la ruta de `out\el-diff-final.mp4`, el ángulo en una frase, qué corregiste contra las fuentes, qué es
   material original y qué son gráficos propios, y lo que conviene que mire el usuario (con su segundo). Solo si él
   pide un cambio: `hacer.py --otra-vez`.

Si algo que el episodio necesita de verdad no cabe en `momentos.json`, díselo al usuario: falta en el director.

## Formato, lotes y shorts

- El formato llega en la línea `Formato:` (sin ella, vertical): `Formato: vertical` (TikTok, 1080x1920) o
  `Formato: horizontal` (YouTube, 1920x1080), que es `nuevo.py --formato horizontal` y nada más: el director acomoda
  cada escena a pantalla completa, sin subtítulos. Cada episodio se hace en uno y solo en ese; si piden el otro, es
  otro video. El `gancho` y la portada como primer cuadro son del vertical.
- **Lote** (`Lote: video 3 de 20. Carpeta: <nombre>`): el tema es el de la línea `Enlace:`; no preguntes (lo que
  preguntarías, decídelo y dilo al entregar); no escribas fuera de tu carpeta ni mates procesos por nombre; en un lote
  no te cambies de tema: reencuádralo.
- **Shorts** (pide shorts, o el mensaje trae `Short:`): sigue [`SHORTS.md`](SHORTS.md).

## Entorno

- El Python de Sloth solo se usa para yt-dlp y la transcripción: lo llaman los scripts (`scripts/comun.py`).
- `node_modules` del episodio es una unión a la carpeta que comparten todos: no corras `npm install` en él.
- Lo que se baja para un episodio (recortes, metraje, memes) se queda en la carpeta del noticiero y sirve al siguiente.
- WebFetch no puede leer x.com ni openai.com: `scripts/leer.mjs` sí (también PDFs).
- No le propongas al usuario cambios a la skill.
