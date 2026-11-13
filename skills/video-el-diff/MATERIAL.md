# El material original

Lo junta `hacer.py` con lo que dice `momentos.json`: las capturas de cada cita, los logos, los recortes, los memes y el
metraje, a la vez y sin agente. Esto es qué enseñar por cada cosa que se menciona, y las recetas de lo que no es una
página normal.

## Qué enseñar

| Se menciona | Se ve |
|---|---|
| Una persona | Su recorte (`persona`), y la página que prueba quién es o lo que dijo |
| Una empresa o un producto | Su logo (`logo`), en su nombre |
| Un lanzamiento | El anuncio oficial: el blog, el release de GitHub o el post de la cuenta oficial, con su fecha |
| Un tuit | El post real: `fuentes` con la `url` del post, y su texto de `cita` |
| Un precio o una cifra | La página oficial donde se lee, con la cifra en `cita`, en `ovalo` o en `cajas` |
| Un repo | Su cabecera en GitHub (estrellas, licencia) |
| Un paper | Su página de arXiv |
| Algo que pasó en el video del tema | `"clip": "tema@<segundo>"` |
| «Muchos», «todos», «internet reaccionó» | De tres a cinco titulares o posts reales, uno por momento |
| Una promesa de la empresa | La promesa, y el documento de la propia empresa que la contradice |
| Cómo funciona algo | Un `diagrama` |

## Recetas

- **Lo que ya se leyó** está en `fuentes/textos/` (`indice.json` dice qué archivo es cada URL). La `cita` se copia de
  ahí, tal cual.
- **Post de X**: `leer.mjs` lo lee por FxTwitter (el post, su cita, su hilo y las respuestas con sus likes) y
  `capturar.mjs` lo captura a 380 px, del avatar a la barra de likes. Su video y sus fotos:
  `python <skill>/scripts/tuit.py <url> fuentes/material/tuits <nombre>`.
- **Post de Reddit**: sin sesión se lee su RSS, `https://www.reddit.com/r/<sub>/comments/<id>/.rss`, con una petición
  por minuto. El `.json` y Jina dan 403.
- **Datos de GitHub** (estrellas, fechas exactas de releases): `gh api repos/<owner>/<repo>`. La página enseña fechas
  relativas («3 days ago»).
- **Gráfica de estrellas**: `https://api.star-history.com/svg?repos=<owner>/<repo>&type=Date`, como `imagen`.
- **El video del tema**: `python <skill>/scripts/fuente.py <url> fuentes/tema` lo baja y lo transcribe. Qué hay en
  pantalla en un tramo: `python <skill>/scripts/cuadros.py hoja fuentes/tema/video.mp4 <desde> <hasta> <paso> <png>`.
  El editor del video corta: comprueba el segundo antes de usarlo en `"clip": "tema@<segundo>"`.
- **Metraje** (una escena de película, una caricatura, un meme en video): `python <skill>/scripts/metraje.py lista`
  dice lo que ya hay en la carpeta del noticiero; `metraje.py buscar "<qué>"` lista candidatos de YouTube (en inglés y
  con el nombre del momento: «roll safe meme», «he-man mirror»). En `clips` va con su `url`, `desde` y `hasta`, de 1 a
  4 s; sin ver el video no se sabe el segundo: si no lo sabes, usa un `meme`.
- **Una app del usuario**: ábrela con Playwright `_electron` sobre una **copia** de sus datos, nunca sobre los reales,
  y sin pulsar nada que gaste IA. Sus capturas entran como `imagen`.

Lo que se baja para un episodio (recortes, logos, memes, metraje) se queda en la carpeta del noticiero y sirve al
siguiente. Lo inventado para un chiste se nota inventado: ningún dato real se apoya en algo fabricado.
