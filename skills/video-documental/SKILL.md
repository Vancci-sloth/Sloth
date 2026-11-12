---
name: video-documental
description: Convierte una grabación tuya hablando a cámara en un video documental, horizontal (16:9, para YouTube) o vertical (9:16, para TikTok, Reels y Shorts), con el estilo EDITOR V1 ("editor v1", "ev1", "el documental", "found footage"). La voz manda un torrente de material REAL encontrado en internet para cada frase (las páginas, fotos, películas y posts de lo que se nombra, archivo de NASA, Wikimedia o dominio público), cada imagen recoloreada (teal, blanco y negro duro, ámbar, flashes en negativo) y animada con dispositivos medidos cuadro a cuadro en tres reels documentales; tú recortado con una palabra roja enorme detrás de la cabeza; un clic en cada cambio. La imagen cambia cada 0,6–1,5 s. Úsala cuando alguien da una grabación y pide este estilo, o un montaje documental rápido de una toma a cámara.
---

# Documental (EDITOR V1)

Tú grabas; la edición busca las pruebas. Escribes **un archivo** (`momentos.json`: qué se ve en cada palabra de la
grabación) y corres **un comando** (`hacer.py`), que baja y trata el material, arma la edición con el director, la
renderiza, la mide y pone la portada. **No escribas código ni abras `components/`, `reference/` ni la plantilla**: los
cortes, el empuje de cada imagen, las entradas, los subtítulos, la rejilla, los clics y el cierre los pone el director
con las medidas de las referencias. Lo tuyo es elegir qué se ve.

`<skill>` es esta carpeta. Los scripts van con `python -I -B -X utf8` (el del sistema).

## Lo que no se negocia

- **Material real en cada momento**: la página, la foto, el post o la película de lo que se nombra; un clip o una
  imagen de archivo, NASA, Wikimedia o un banco libre. Nada generado, nada inventado, ningún eslogan.
- **Nada de gente al azar**: una persona sale solo si la frase habla de ella. Para «la gente», «nosotras», un abrazo:
  manos, espaldas, siluetas, el lugar. `buscar.py` marca con `[gente]` los clips de banco donde sale alguien de frente.
- **Cada palabra en pantalla se dijo**: `grande` y `mega` son palabras de la grabación (`hacer.py` lo comprueba).
- **Comprueba cada dato al buscarlo**: si la grabación dice una cifra, la página que la enseña es la real.
- **Sin emojis en pantalla**: un post lleno de emojis no se enseña; se teclea su frase (`maquina`).
- **Los derechos se dicen al entregar**: `hacer.py` deja `FUENTES.md` y dice qué hay que revisar; repíteselo al usuario.
- **No se publica nada.** La música, si la hay, la trae el usuario.
- El proyecto va en la carpeta de la línea `Carpeta: <nombre>` (sin ella, `doc-<tema>`). Con `Formato: vertical`,
  1080×1920 (`nuevo.py … --vertical`); sin ella o con `Formato: horizontal`, 1920×1080, para YouTube. Es el mismo
  estilo: el director acomoda los subtítulos, las tarjetas y la palabra roja a cada cuadro. Si piden el otro formato, es
  otro video.
- Con `Idea: <canal>/<idea>` y sin grabación todavía, ayúdale a preparar qué decir (corto, con el gancho delante) y
  espera la toma: la etapa «Tu grabación» del estudio la recibe.

## Para que se vea como las referencias

Lo que decide si parece un documental o una presentación es lo que eliges, no el director:

- **Un momento por imagen, y casi cada sustantivo trae la suya.** Uno cada dos segundos o menos (`hacer.py` lo exige);
  las listas («Claude, ChatGPT, Gemini») son un momento por nombre o una `serie`.
- **Imagen en movimiento antes que fotos**: la mitad o más de los momentos de material llevan un clip.
- **Lo literal para lo que tiene nombre, la metáfora para lo demás.** Los nombres, las empresas, los sitios y las
  cifras son siempre lo real: su `pagina` con la `marca` en lo que se dice, su `post`, su `logo` (el logo va con `logo`
  y su dominio, nunca con una foto de un logo), su foto. Un clip de banco no enseña algo que tiene nombre. Casi todo
  sustantivo tiene además su artículo: `https://es.wikipedia.org/wiki/<Título>` como `pagina`, con la `marca` en su
  primera frase, es material real sin buscar nada («teletransportarnos» → el artículo «Teletransporte»). Y de quien
  habla la grabación (su grupo, su evento, su ciudad), sus fotos de verdad (`foto:` en `buscar.py`), antes que un
  banco. Lo abstracto se dice con un juego de palabras que se ve:
  «modelos nuevos» → coches de un salón de 1950; «se filtró» → un grifo que gotea; «nada» → una planta rodadora. El
  juego es con lo que se dice en español. Una metáfora cada dos o tres frases; sin ellas es un pase de diapositivas.
- **Tu cara es una imagen más**, del 25 al 35 % del tiempo, en tramos de 1,2 a 2,5 s, nunca dos seguidos: en lo que
  es opinión o va a cámara («honestamente», «yo», la pregunta). El resto del tiempo, la voz sigue y se ve el material.
- **La frase estrella lleva `mega`**: la palabra de la frase, roja y enorme, detrás de tu cabeza. Una o dos por video;
  es también la portada. Elige la palabra corta (de cuatro a siete letras) que resume el video, y que se diga al
  principio de su momento. Además, **`grande` en dos o más palabras** que importan (una cifra, el nombre, el remate).
- **Varias cosas a la vez, una vez o más**: `tarjetas` para una lista que se nombra, una `rafaga` para una cantidad o
  una palabra abstracta («miles», «todos»: de cuatro a seis imágenes de la misma forma, todo billetes, todo
  pantallas) o un `muro` («en todas partes»).
- **El negro pesa**: `negro` en «nada», «nadie», la frase antes del remate. Uno o dos.

`hacer.py` exige todo lo de esta lista que se puede contar, y una `pagina` o un `post` por lo menos.

## momentos.json

```json
{
  "material": {
    "precios": { "pagina": "https://claude.com/pricing", "marca": "$20" },
    "salon":   { "clip": "archive:DesignForDreaming", "desde": 212 },
    "marca":   { "logo": "anthropic.com" }
  },
  "momentos": [
    { "palabra": "Ahorita", "ve": "mixkit:9024" },
    { "palabra": "tres empresas", "ve": ["commons:File:Googleplex HQ (cropped).jpg", "marca", "https://x.com/AnthropicAI/status/1790000000000000000"], "forma": "tarjetas" },
    { "palabra": "modelos nuevos", "ve": "salon" },
    { "palabra": "miles de millones", "ve": ["commons:File:US $100 bill.jpg", "commons:File:50 USD Series 2004.jpg", "mixkit:22630", "mixkit:5063"], "forma": "rafaga", "grande": "miles de millones" },
    { "palabra": "veinte dólares", "ve": "precios" },
    { "palabra": "Pero yo", "ve": "cara", "mega": "edita" },
    { "palabra": "nada", "ve": "negro" },
    { "palabra": "la mejor", "ve": "mixkit:4421", "grande": { "texto": "la mejor", "tipo": "choque" } }
  ]
}
```

- **`palabra`**: de una a tres palabras seguidas de la grabación, tal como las enseñó `nuevo.py`, en el orden en que
  se dicen (si se repiten, es la primera vez después del momento anterior). El momento dura hasta la `palabra` del
  siguiente. El primero empieza en el cuadro 0.
- **`ve`**: lo que se ve. Una **referencia tal cual** (lo normal: una de `buscar.py`, `mixkit:…`, `commons:File:…`,
  `archive:…`, `nasa:…`; `yt:<id>`; la URL de una imagen, de un `.mp4`, de una página o de un post de X), el nombre de
  una cosa de `material`, una lista de ellas, o `cara` (tú, con la cámara cruda), `negro` (la tarjeta negra) o
  `maquina` (con `texto`: una cita real tecleada sobre negro).
- **`material`**: solo lo que pide algo más que su referencia, con un nombre corto (minúsculas y guiones):
  - `pagina`: la URL, con `marca`: el texto, tal cual está en la página, que se resalta (la captura baja hasta él;
    de teléfono si el video es vertical). `selector`: solo ese bloque, como tarjeta.
  - `logo`: el dominio de la marca. `post`: la URL de un post de X. `archivo`: una ruta del disco (lo que adjuntó el
    usuario, `Imagen adjunta:`).
  - `clip` y `foto`, cuando llevan `desde` (el segundo del clip donde pasa lo que se dice; sin él, un quinto adentro;
    `buscar.py --mira <ref>` lo enseña segundo a segundo; en `yt:` va siempre), `look` (`natural`, `mono`, `teal`,
    `warm`; en clips también `cold`, `archive`: sin él los reparte el director como en las referencias), `foco: [x, y]`
    (de 0 a 1: dónde está lo que importa; en vertical casi todo el material es horizontal y se recorta al centro) o
    `velocidad` (0.5: cámara lenta). Una `foto` puede ser también la URL de la página donde sale.
- **`forma`**, con una lista: sin ella, `serie` (una cosa por palabra, cortando en las palabras) · `rafaga` (2 a 4
  cuadros cada una) · `tarjetas` (de dos a cinco: caen una por palabra y estallan) · `muro` (cuatro o más, en una pared
  que la cámara barre: «todos», «en todas partes») · `triptico` (tres clips a la vez) · `mundo` (tú recortado delante
  de esas cosas, que cambian en las palabras: la frase estrella).
- **`entra`**: `mosaico` (los nueve paneles; el primer momento ya entra así) · `enfoque` · `negativo` · `blanco` ·
  `glitch` («se rompió», «falla») · `corte`. Sin ella el director reparte cortes secos, enfoques y negativos.
- **`grande`**: la palabra de la frase encima de lo que se ve: `"grande": "tres"` o `{ "texto", "tipo" }` con `clave`
  (blanca), `titulo` (serif cromada, para abrir un capítulo) o `choque` (roja, mayúsculas). En `cara`, **`mega`**.
- En `cara`: `golpe` (la palabra donde la cámara se acerca de golpe). En cualquiera: `enfasis: "cursiva"` (la frase
  fuerte, en serif cursiva), `remate: true` (con música: se corta bajo esa frase y vuelve en la siguiente).
- Arriba, si hace falta: `corrige` (`{ "clod": "Claude" }`: un nombre que el transcriptor oyó mal, para los
  subtítulos; en `palabra` va como lo oyó) y `titulo`.

## Los pasos

Son cinco llamadas si sale a la primera; cada vuelta de más cuesta.

1. **El proyecto y lo dicho**: `python -I -B -X utf8 <skill>/scripts/nuevo.py <grabación> <carpeta>` (varias tomas
   seguidas, en su orden; `--vertical` si toca). Enseña lo dicho con sus segundos y, para esa duración, lo que
   `hacer.py` va a exigir (cuántos momentos, cuánta cara, cuántos clips). Sin grabación en el mensaje, pídela.
2. **El material, en un solo mensaje**: `python -I -B -X utf8 <skill>/scripts/buscar.py "<idea>" "<idea>" "foto:<idea>"…`
   desde la carpeta del proyecto, con todas las ideas a la vez y de sobra (de 12 a 18, en inglés, de dos o tres
   palabras; es la única búsqueda): a secas, clips de banco («dripping tap»); `foto:` para lo que tiene nombre o lugar
   («foto:Googleplex»); `archivo:` para las metáforas de época («archivo:car show 1950»); `nasa:` para el espacio y
   la Tierra. En el mismo mensaje, de dos a cuatro búsquedas web de las páginas reales de lo que se nombra (la de la
   empresa, la de la noticia, el post). Lo que imprimen `nuevo.py` y `buscar.py` es todo lo que hace falta: no abras
   `words.json` ni `busca.json`, y no bajes ni captures nada tú.
3. **Mira `revision/busca.jpg`**, una vez, y elige por lo que se ve, no por el título.
4. **En un solo mensaje**: `momentos.json` con Write, en la carpeta del proyecto, y
   `python -I -B -X utf8 <skill>/scripts/hacer.py` **en segundo plano** (`run_in_background`); termina tu mensaje: te
   avisa al acabar. No esperes con `sleep` ni lo vigiles. `hacer.py` lo revisa primero, en un segundo: **si dice ✗**,
   dice todo lo que falla de una vez; arréglalo con Edit y vuelve a lanzarlo en el mismo mensaje (lo ya bajado no se
   baja otra vez; una referencia que no bajó se cambia por otra de `busca.jpg`).
5. **Si dice ✓**, mira `revision/hoja.png` (un cuadro por segundo): que cada imagen sea lo que dice la frase, que
   nada salga en blanco y que la palabra roja se lea. Otro render solo si una imagen no es lo que se dice o no se ve,
   y todo en una vuelta. Un ✘ de la medida (ritmo, quieto) es del director: entrega y díselo al usuario. **Entrega**:
   la ruta de `out/final.mp4`, cuánto dura, lo que `hacer.py` marcó de derechos (está en `FUENTES.md`) y que el
   sonido no lo oíste (se comprobó que cada palabra se oye).

`hacer.py --revisa` hace solo la revisión, sin fondo, por si quieres comprobar un cambio antes de lanzarlo.

**Música**: si el usuario dio una canción, cópiala a `public/assets/music/` antes de `hacer.py`: va de cama bajo la voz,
baja en el negro y se corta en los momentos con `remate`.

Si el video necesita de verdad algo que no cabe en `momentos.json`, dilo al usuario: falta en el director.

## Quien cambia el director

`components/director.py` arma la edición con los dispositivos (`ev1_devices.py`, `ev1_more.py`), medidos cuadro a
cuadro en tres reels: `reference/` (en inglés) tiene el método, cada cifra y los planos; `ejemplo/` es un armado a mano
de 45 s. `scripts/material.py` baja y trata; `medir.py` compara cada video con lo medido en las referencias.
La primera vez en una computadora, `python -I -B -X utf8 <skill>/scripts/prueba.py` hace 7 s con los dispositivos de
verdad, sin grabación.
