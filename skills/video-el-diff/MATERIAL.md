# Cómo se junta el material original

Cada frase del guion se apoya en algo que se ve en pantalla y que viene de la fuente real; cada chiste, en metraje
encontrado, un recorte o un rótulo ([Para los chistes](#para-los-chistes)). Todo queda en `fuentes/material/` (`web/`,
`tuits/`, `videos/`, `personas/`, `memes/`), con `fuentes/capturas.resultado.json` y los índices del agente de captura (`fuentes/material/INDICE-<n>.md`), y `material.md` en la
raíz dice qué archivo respalda cada frase y qué imagen remata cada chiste. Ejemplo:
[`ejemplos/deepseek-material.md`](ejemplos/deepseek-material.md).

## Qué buscar por cada cosa que se menciona

| Se menciona | Se muestra |
|---|---|
| Una persona | Su foto (avatar del canal o de X) y la página que prueba quién es, por ejemplo la descripción de su canal. Si decide algo en la historia, también su recorte, para pegarlo encima ([Para los chistes](#para-los-chistes)) |
| Un lanzamiento | El anuncio oficial: el blog, el release de GitHub o el tuit de la cuenta oficial, con su fecha visible |
| Un tuit | La captura real del post en x.com y su JSON. Si el post trae video, el video va encima de la captura |
| Un precio o una cifra | La página oficial de precios o la fuente donde se lee, con la cifra resaltada |
| Un repo | La cabecera en GitHub (estrellas, licencia) y la gráfica de star-history |
| Un paper | La página de arXiv y la primera página del PDF |
| Algo que pasó en el video del tema | El clip de ese momento, o un cuadro fijo si hay que marcar algo en él |
| Una reseña o cita de un tercero | La captura de cada frase citada, recortada con `pagina.mjs --frase` |
| «Muchos», «todos», «internet reaccionó» | De tres a cinco titulares o tuits reales que lo prueban, para apilarlos |
| Una promesa de la empresa | La promesa, y el documento de la propia empresa que la contradice (la letra chica, los términos) |

## Recetas

- **Una app del usuario** (el episodio 4 fue sobre Sloth): ábrela con Playwright `_electron` sobre una **copia** de sus
  datos, nunca sobre los reales, y sin pulsar nada que gaste IA o lance trabajos, con los scripts en
  `fuentes/scripts/`. Graba la vista previa con `recordVideo`. Un `git log` o un archivo se enseñan como terminal o
  editor: la salida real del comando en una página HTML (fondo oscuro, letra monoespaciada), capturada con `pagina.mjs`.
  Las horas y cifras que solo están en su base de datos van como rótulo sobre la captura de ese momento, con la consulta
  guardada en `fuentes/material/datos/`.

- **Página web**: `node <skill>/scripts/pagina.mjs <url> <png> --frase "texto exacto"`. Recorta el bloque más chico
  que contiene la frase (el párrafo, la cita, el título; la fila entera si es un dato de una tabla), bajando por la
  página si carga al llegar, y sin lo fijo que la tape. `--frase` se repite: una carga, un recorte por frase
  (`<png>-1.png`, `-2.png`...). Imprime un JSON por frase con el texto tal como está en la página y cuántas veces sale, o
  «no está en la página». Con `--elemento "<selector>"`, ese elemento; sin ninguno, la ventana de `--ancho` x `--alto`.
  - Dentro del PNG guarda el texto de la página (cada palabra con su caja, su letra y su línea base): `ubicar.py` lo usa
    en vez del OCR. Por eso el PNG no se edita después: recortarlo con PIL borra ese texto. El recorte se elige con
    `--frase` o `--elemento`.
  - En `fuentes/paginas/<nombre>.mhtml` guarda la página entera. Para sacarla otra vez a otro ancho, sin internet y aunque
    la página cambie: `node <skill>/scripts/pagina.mjs fuentes/paginas/<nombre>.mhtml <png> --ancho 300` (3 a 4 s), con
    la misma frase de entonces; si eran varias, la del número del PNG (`<nombre>-2.png`). Sale solo `<png>`.
  - Al terminar dice a qué tamaño se verá la letra a lo ancho de 1080 px y avisa si queda chica para un celular. Los
    anchos que van, en [Capturas para el celular](#capturas-para-el-celular).
- **Post de Reddit**: sin sesión se lee su RSS, `https://www.reddit.com/r/<sub>/comments/<id>/.rss` (texto, autor,
  fecha y comentarios), con User-Agent de navegador y una petición por minuto (si da 429, espera). El `.json` y Jina
  dan 403, y old.reddit manda al login.
- **Post de X**: `python <skill>/scripts/tuit.py <url> fuentes/material/tuits <nombre>` (JSON, avatar, fotos y video) y
  la captura, `node <skill>/scripts/pagina.mjs <url> fuentes/material/tuits/x-<nombre>.png --ancho 380`,
  que va a `public/web/` con el mismo nombre. Recorta el post solo (del avatar a la barra de likes, sin la cabecera ni
  las respuestas). A 380 px CSS el texto baja en casi el doble de renglones que a 600 y la letra sale 1.5 veces más
  grande; por debajo de 380 x.com encima los números de la barra de likes. Con `--frase` sale solo el texto del post:
  si es corto queda en tira, y `--contexto` lo vuelve el post entero. x.com carga sin login; el tema claro u oscuro
  sigue al de Windows (o `--tema`).
- **Video de YouTube**: `python <skill>/scripts/fuente.py <url> <carpeta>`.
- **Cuadro del video del tema**: `cuadros.py rejilla fuentes/tema/video.mp4@<segundo> <rejilla.png> --guardar <png>`.
- **Gráfica de estrellas**: `https://api.star-history.com/svg?repos=<owner>/<repo>&type=Date`, renderizada con
  `pagina.mjs`.
- **Datos de GitHub** (estrellas, fechas exactas de releases): `gh api repos/<owner>/<repo>` y
  `gh api "repos/<owner>/<repo>/releases?per_page=100"`. La página de GitHub muestra fechas relativas ("3 days ago").

## Para los chistes

La mitad del humor está en la imagen ([El chiste visual](ESCENAS.md#el-chiste-visual)), y casi todo es material
encontrado. En `material.md`, cada chiste lleva su fila igual que un dato: la frase, la imagen que lo remata y el
archivo. Búscalo con el guion terminado, frase por frase, en el orden de [El chiste visual](ESCENAS.md#el-chiste-visual).

- **Una escena de película, caricatura, meme en video o noticiero**:
  `python <skill>/scripts/metraje.py buscar "<qué>"` lista candidatos de YouTube (en inglés y con el nombre del momento:
  «pulp fiction royale with cheese», «he-man mirror», «roll safe meme»), y
  `python <skill>/scripts/metraje.py bajar <url> <desde> <hasta> public/videos/<nombre>.mp4` baja solo ese tramo, listo
  para `clip(0, src="videos/<nombre>.mp4")`, con una hoja de cuadros para comprobar que es el momento.
  De 1 a 4 s bastan.
- **Un meme en imagen**: los de `public/img` (ver `meme` en [`ESCENAS.md`](ESCENAS.md#las-demás)); si no está, su
  plantilla en la web, capturada con `pagina.mjs --elemento img`.
- **El recorte de una persona, un animal o un objeto**: `python <skill>/scripts/imagen.py "<qué>" fuentes/material/personas`
  baja fotos con licencia libre de Wikimedia Commons (retratos oficiales, animales, objetos) y una hoja para elegir; la
  elegida se recorta con `python <skill>/../video-base/scripts/recorte.py <foto> public/recortes/<nombre>.png`. De una
  persona sirve también su avatar o una foto del anuncio. Para cada adjetivo, su foto: riendo en «engreído», sudando en
  «dimisión».
- **El artefacto del ejemplo absurdo** (la app inventada, la terminal, el correo): un componente en `src/escenas/` o una
  página HTML capturada con `pagina.mjs`, con aspecto real y contenido que se nota inventado.

Lo que no salga a la primera se cambia por otro chiste de la misma frase: un rótulo, un recorte de reacción, el nombre
por su otro sentido. Una frase sin chiste visual está bien si su prueba es buena.

## Capturas para el celular

Todo se captura para el celular desde la fase 1 (en los shorts, una sola vez, en el plan de [`SHORTS.md`](SHORTS.md)):
la zona de la escena mide 1080x1156, y una página capturada a lo ancho se ve ahí con letra de 5 a 8 px en un celular.
En el lote del 7 de octubre, cada episodio recapturó de 10 a 17 páginas en la fase 2 por eso.

- **Página web, PDF o documentación:** `pagina.mjs <url> <png> --frase "<lo citado>"` (400 px a escala 3, lo de
  siempre): una imagen de 1200 px de ancho que llena la zona con renglones de 40 px o más. Para la sección entera, que
  la frase empiece en su título. Una frase corta queda en tira (pocos renglones a lo ancho) y deja la zona medio vacía a
  cualquier ancho: sácala otra vez desde su copia con `--contexto`, que se lleva los párrafos de alrededor. Si la letra
  sale chica, más angosta (`--ancho 300 --escala 3.6`).
- **Post de X:** a 380 px, como en [Recetas](#recetas).
- **Una tabla o una gráfica ancha:** la parte que se cita (la fila, las dos columnas, las barras que compara), recortada
  a la forma de la zona; `--frase` con un dato saca la fila. Si hace falta todo el ancho, dos recortes en dos beats.
- **Una interfaz o una terminal:** el recorte de la zona que se cita, no la pantalla de 1920 entera.

El agente de captura recibe estas recetas junto con las de arriba, y comprueba cada captura en una hoja a 360 px de
ancho: lo citado tiene que leerse.

## El agente de pantalla

Para un video del tema de más de unos minutos, lánzalo en segundo plano (`model: "sonnet"`, `effort: "high"`) junto con el de
captura, en cuanto tengas la transcripción. Con menos esfuerzo se salta lo que dura poco y lo que solo se lee con OCR. Recorre el video con `cuadros.py hoja` (pasos de 2-3 s y luego 0.5 s donde hace
falta) y devuelve solo texto. En el episodio 5 costó $1.9 por 14 minutos de video. Dale:

- La lista numerada de momentos que vas a contar, con su minuto aproximado de la transcripción y el detalle que tiene
  que verse ("la tabla de surf partida en dos").
- Que devuelva una tabla por momento: `momento | qué se ve | desde–hasta | cómo se identifica | detalle visible (sí/no
  y dónde)`, con los rangos estables (sin transiciones), las tomas a cámara del youtuber y lo que no se distingue a esa
  resolución.

Los segundos de `material.md` salen de ese mapa, no de la transcripción: en el episodio 5 dos rangos copiados de la
transcripción enseñaban otra cosa (en 22 s, Youri a cámara en vez de la interfaz). Lo que el mapa no alcance a
distinguir (un conteo, una manecilla), compruébalo tú en el cuadro a 1080p, recortado.

## Capturas en lote y el agente de captura

Las páginas y los posts de X no llevan agente: van en una lista que `capturar.mjs` saca toda a la vez, en varios Edge.

    node <skill>/scripts/capturar.mjs fuentes/capturas.json --hoja revision/capturas.png

`fuentes/capturas.json` es `[{"url": ..., "png": "fuentes/material/web/<nombre>.png", "frase": "texto exacto"}]`
(`frase` puede ser una lista; un post va a `fuentes/material/tuits/x-<nombre>.png`; también valen `elemento`, `ancho`,
`alto`, `escala`, `tema` y `contexto` de `pagina.mjs`). Cada captura es la de `pagina.mjs`, al ancho del celular, y
la que sale mal se vuelve a sacar sola desde su copia: en tira, con `--contexto`; chica, más angosta (un post de X no
baja de 380). Al terminar dice de cada una si quedó bien, con
aviso, VACÍA (la página no cargó) o FALTA (la frase no está en la página: no la cambies por otra parte), y deja
`fuentes/capturas.resultado.json` y una hoja de contacto a 360 px. Mira la hoja: lo citado tiene que leerse. El 19 de
octubre tres agentes tardaron 12 minutos en 54 capturas; 12 páginas a la vez tardan unos 40 s.

El agente de captura queda para lo que necesita criterio: memes y clips (`metraje.py`), fotos de personas, el video y
las fotos de un post (`tuit.py`), una app. Lánzalo en segundo plano (`model: "sonnet"`, `effort: "medium"`, o lo que
diga `captura` en la línea `Subagentes:`) en cuanto sepas qué hace falta. Con `medium` hace lo mismo que con `high` por
un 40 % menos; con `low` llegó a capturar el canal equivocado. Lánzalos en cuanto tengas el ángulo (no al terminar el
guion), todos a la vez en un mismo mensaje y numerados: **uno por cada clip o meme de video**, uno para las fotos de
personas y los logos, y uno para lo demás (posts, apps, páginas que `capturar.mjs` no pudo). En el-diff-9 (25 de
octubre), uno solo con siete clips tardó 29 minutos, uno tras otro, y todo el episodio lo esperó. El de personas deja
también sus recortes en `public/recortes/` (`recorte.py` de video-base): en el-diff-9 los dejó sin recortar. Si después hace falta otra cosa, pídesela con `SendMessage`. Dale a
cada uno:

- La lista numerada de archivos que quieres, cada uno con su URL, lo que debe verse y el texto exacto que se va a
  resaltar.
- Estas reglas:
  - Las capturas son de la página real, nunca recreadas.
  - Cada archivo con el nombre exacto que se le pidió: `material.md` y la fase 2 lo buscan así (el 19 de octubre
    salieron con `-1`, `-2` y otros sufijos, y hubo que buscarlos).
  - Tiene que abrir cada PNG con Read para comprobar que muestra lo que se pidió, sin banners, muros de login ni
    páginas en blanco, y repetirlo si no.
  - Si `pagina.mjs` da un `aviso` (letra chica o en tira) con un arreglo, la saca otra vez desde su copia como dice el
    aviso antes de terminar. El 19 de octubre, rehacer las que quedaron anchas costó 5 minutos de la fase 2, con el usuario esperando.
  - Las recetas y scripts de este archivo: `pagina.mjs` entra a x.com y recorta por frase, sin Playwright ni scripts de
    captura propios.
  - En su índice, cada captura lleva la frase exacta que se ve en ella, comprobada con `python ubicar.py <png> "frase"`
    (con el texto de la página se escribe tal cual: "$1.00", no lo que leería el OCR). Si la frase que pedí no está en
    la página (`--frase` lo dice), que lo diga en vez de capturar otra parte.
  - Todo va en `fuentes/material/`, con su índice en `INDICE-<n>.md` (archivo, URL, qué prueba y cualquier diferencia
    contra lo que se le pidió), y al terminar escribe `fuentes/captura-<n>.listo`: la fase 2 empieza con lo que ya
    está y espera ese archivo para lo demás.
- Pídele que te reporte las diferencias entre lo que pediste y lo que dice la fuente. En DeepSeek el paper tenía 92
  páginas y no 88, y el precio de Ultrafast no estaba en openai.com sino en developers.openai.com. Esas diferencias
  corrigen el guion.

Cuando termine, revisa tú mismo las capturas clave en una hoja de contacto antes de darlas por buenas.
