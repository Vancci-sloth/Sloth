# Escenas de `guion.py`

`guion.py` es una lista de párrafos; cada párrafo es una lista de beats `(say, v)`. `say` es el tramo de la voz tal
como se lee, una frase o un pedazo de ella (de ahí salen los tiempos), y `v` es lo que se ve en ese tramo: una frase
larga se parte en varios beats, uno por imagen ([El corte en el sustantivo](#el-corte-en-el-sustantivo)). Los helpers
(`cap`, `clip`, `caja`, `marca`, `toma`, `foco`, `en_video`, `tar`, `extra`, `titular`, `emo`, `rotulo`, `pegado`,
`senal`, `bloque`) ya vienen en la plantilla, y un ejemplo de todo junto está en
[`ejemplos/vertical-guion.py`](ejemplos/vertical-guion.py). El componente de cada tipo está en `src/escenas/` y su
registro en `src/Video.tsx`. Mientras falte una captura en `public/`, su beat se escribe igual (sin marcas) y
`guion.py` avisa `FALTA`.

El video lleva solo la voz y la música: sin efectos de sonido, porque al usuario le estorban.

Todas las coordenadas son rectángulos `[x, y, ancho, alto]` en **píxeles de la imagen original** (un clip del video
del tema mide 1920x1080). En vertical la escena se ve en una zona de 1080x1156 ([El lienzo
vertical](#el-lienzo-vertical)); en horizontal, en toda la pantalla ([El lienzo horizontal](#el-lienzo-horizontal)).

## La imagen

La imagen es la **segunda voz** del episodio: enseña la prueba de lo que dice la voz y pone la otra mitad del humor.
Así se ve, medido en diez episodios de referencia:

| Medida | Referencia |
|---|---|
| Prueba real: captura de la fuente, clip del evento, demo | del 45 al 75 % del tiempo |
| Algo pegado encima (rótulo, recorte, 👉) | cerca de la mitad del tiempo |
| Memes, películas, caricaturas | cerca del 10 %, de 1 a 4 s cada uno |
| Stock | menos del 10 %, y solo literal a una palabra |
| Gráfico propio | del 5 al 15 %, solo para explicar un mecanismo |
| Algo nuevo en pantalla | cada 1.6 a 2.5 s |
| Rótulos | de 4 a 7 por minuto |
| Chistes que solo están en la imagen | de 3 a 6 por minuto |
| Corte contra el inicio de su palabra | mediana de 0.06 s |

### El corte en el sustantivo

Un beat no es una frase: es el tramo de la voz que va con una imagen. La imagen cambia al empezar el sustantivo que
importa (un nombre, una cifra, una fecha, un objeto) o la cláusula que lo trae, nunca en un verbo ni en un conector.
Una frase larga lleva de dos a cinco imágenes, y lo que se pega encima cae en su palabra.

- **Rápido** en las listas (una imagen por elemento, como un segundo cada una), en las rachas de nombres y en el
  arranque.
- **Quieto** cuando la voz lee un documento o explica un mecanismo: de 8 a 12 s en la misma imagen (un diagrama, hasta
  30), y aun así algo se mueve por dentro: el resaltado avanza con la voz, entra un rótulo, baja el 👉.

### La prueba

- **Cada afirmación lleva su fuente en pantalla**: la captura recortada a los renglones que dice la voz, como tarjeta
  sobre el fondo oscuro, quieta, con la frase resaltada en la palabra que la dice. Lo resaltado es lo que se oye.
- **La versión oficial en la voz, el documento que la desmiente en la imagen**, mejor si es de la propia empresa.
- **«Muchos» o «todos»** son de tres a cinco titulares que caen uno encima de otro.
- **Volver a la misma captura** cuando la voz vuelve al tema, con otra marca.
- **La frase más absurda del protagonista, textual**: la voz la cita («y cito») sobre su clip o su captura, con la
  frase resaltada. Lo mejor es que la diga él con su audio; la plantilla todavía no puede.

### Lo que va encima

Lo que se pega encima de la prueba en la palabra que lo dice (`encima=[...]`, ver [Encima](#encima-rótulos-recortes-y-el-)):

- **Rótulos**: la cifra (la exacta, cuando la voz redondea), el nombre difícil de oír, la fecha, el término técnico de lo
  que la voz cuenta con palabras llanas («EXPLOTAR VS EXPLORAR»), el apodo. Crema con contorno para nombrar, rojo para
  golpear, banda girada para la cifra que es la noticia, placa para el nombre de una persona. Un rótulo nunca copia la
  frase que se oye. Una ironía escrita (lo que la voz calla: «PROPÓSITOS LEGÍTIMOS DE ENTRENAMIENTO») cabe una o dos
  veces por minuto, siempre sobre un dato visible.
- **Recortes**: la persona que decide entra recortada en su nombre, desde una orilla o de golpe, y dura de 1 a 5 s. Con
  placa si el público no la reconoce, solo la primera vez; sin placa si es famosa o cuando vuelve. Una empresa gigante
  puede hablar con la cara de su CEO. Al particular de la noticia (el hombre de San Francisco) no se le pone cara: se
  enseña su tuit, o un recorte de stock que se nota que no es él.
- **El 👉** señala la cifra de una tabla y baja por un documento al ritmo de la voz. Es el único emoji: los demás
  adornan, y aquí nada adorna.

### El chiste visual

La mitad del humor del episodio está solo en la imagen, y casi todo es **metraje encontrado**: un meme, una escena
de película o de caricatura, un recorte, modificados con un logo o un rótulo encima. Por cada frase, busca su chiste
visual en este orden:

1. **El nombre propio por su otro sentido**: Reflection → He-Man frente al espejo; Moonshot → Stephen Curry tirando
   desde la Luna; Llama 4 → una llama gritando; Beam → un videojuego de rayos.
2. **El verbo figurado o la metáfora, literal o con la escena famosa que hace exactamente eso**: «le sellaron el
   destino» → Survivor; «a sus espaldas» → «¿Tú también, Bruto?»; «hacer de niñera» → niños en un sofá; «quemar
   tokens» → los rótulos ardiendo.
3. **El eufemismo o el adverbio irónico, con el meme de reacción que dice lo que la voz calla**: «algo que la sociedad
   suele ver con malos ojos» → una mujer apuntando con una pistola.
4. **La frase plana o seria, con la burla en la imagen**: «sigue siendo el mismo Gemini» → Scooby-Doo quitándole la
   máscara al villano y abajo el logo de Gemini; un clip ajeno rotulado con el nombre del producto.
5. **La frase seca y la bisagra, con una cara de reacción**: «Bonita chamba, si te la dan» → Roll Safe.
6. **El ejemplo absurdo, con su artefacto fabricado** con aspecto real: la app de citas para caballos con sus términos
   de servicio, la terminal que cobra 11 centavos, el correo «we made an oopsie». Solo para el ejemplo inventado,
   nunca como prueba de un dato real.

Y para todo el episodio:

- **La referencia pop entra un poco antes de la palabra que remata**, y se enseña por su frase célebre más que por la
  cara.
- **El meme se vuelve de la noticia** con el logo de la empresa, o la cara de su CEO, pegado sobre el personaje: el
  villano de Scooby-Doo con el logo de Gemini bajo la máscara, el call center con logos de Muse en cada cara.
- **Lo más fuerte se desvía**: si la voz compara con un terrorista o un dictador, sale una cara pop furiosa, no la
  violencia.
- **Un hilo visual**: el ejemplo del episodio se siembra en imágenes antes de que la voz lo nombre, y vuelve.
- **El callback se ve**: la misma imagen regresa cambiada (el fisicoculturista inflado con Photoshop que luego se
  desinfla).
- **El meme es exacto, no genérico**: una reacción de sorpresa cualquiera para cualquier sorpresa no es un chiste.

### Gráfico propio, tarjetas y transiciones

- **Un gráfico propio solo para el mecanismo**, como gag del episodio ([Las demás](#las-demás)), y se sostiene lo que
  dura la explicación.
- **Tarjetas de texto solo**, crema sobre negro y de menos de 1.5 s, únicamente para el tiempo y la estructura: «AYER…»,
  «EN 1965…», «EN EL VIDEO DE HOY…», «MIENTRAS TANTO…».
- **Corte seco** en el 90 % de los cambios. La interferencia, en los cambios de bloque; el glitch, para algo que
  irrumpe.

## Coordenadas por la frase

Lo que tiene texto se ubica solo con `ubicar.py` (en la raíz del proyecto). Una captura de `pagina.mjs` trae dentro el
texto de la página: la frase se busca con el texto de verdad y la traducción sale con la letra, el tamaño, el color y la
línea base del original. Un cuadro de video o una captura sin ese texto se lee con el OCR de Windows (en Mac y Linux,
RapidOCR).

- `python ubicar.py web/x.png` imprime todo el texto de la captura, renglón por renglón con su caja. Así se lee una
  captura como texto, sin abrirla como imagen. Sirve también para un cuadro de video: `clips/tema.mp4@946.2`.
- En `guion.py`:
  - `*marca_texto(img, "frase citada", en=..., mas=0)` pone el resaltador en cada renglón de la frase. Con `mas=10`
    alarga cada marca 10 px por lado, para texto chico de una interfaz.
  - `*marca_texto(img, "frase citada", en=..., es="la traducción")` además traduce: medio segundo después de
    pintarse el resaltador, el inglés se desenfoca y en su lugar aparece el español, con la letra, el tamaño y el
    color del original y el resaltador encima. Ver [Traducción](#traducción-de-lo-resaltado).
  - `caja_texto(img, "frase", en=..., pad=2)` pone una caja alrededor de la frase. `pad` va en píxeles de la imagen,
    y el componente le suma 8 px de pantalla.
  - `zona(img, "frase")` da un rectángulo para `vista` o `toma` centrado en la frase, con la forma de la pantalla (la
    zona en vertical, 16:9 en horizontal; `aspecto=` la cambia). Encuadra con ella y no con rectángulos en píxeles:
    si la captura se vuelve a sacar a otro ancho, el encuadre la sigue.

  **Copia la frase de la salida de `ubicar.py`.** Con el texto de la página es la de verdad ("$1.00"); con el OCR, como
  la leyó ("vO.2", "$o.15", "A1 is working"). Tolera diferencias pequeñas en frases largas, pero en una corta un
  carácter cambia todo; si no la encuentra, dice lo más parecido que vio. Si la frase aparece varias veces (casi igual
  de parecidas), se queda con la primera y avisa; con `ocurrencia=2` eliges la segunda. Una traducción que no quedaría limpia no se
  pone y se avisa ([Traducción](#traducción-de-lo-resaltado)).

La rejilla (`python <skill>/scripts/cuadros.py rejilla <imagen | video@seg> <png>`) queda para lo que no es texto: una
ballena, un botón con ícono, la zona de un juego.

Cualquier momento (`en` o `t`) es `en="palabra"` (empieza cuando la voz dice la primera palabra del beat que empieza
así, sin tildes ni mayúsculas) o `t=0.3` (fracción del beat). Las marcas y los sellos van en la palabra que citan.
`en` busca en el `say` del beat (con los tiempos que le dio la voz), no en lo que transcribió: si el guion dice "dos
millones", es `en="dos"`, no `en="2"`. Una palabra que no está en el `say` cae, sin avisar, a la mitad del beat.

## `captura`: el material original (casi todo el video)

`cap(img, ...)` para una imagen de `public/` y `clip(segundo, ...)` para el video del tema a pantalla completa
(`clip(seg, src="videos/otro.mp4")` para otro video).

| Clave | Qué hace |
|---|---|
| `vista` | El rectángulo que se ve al empezar. En horizontal **también fija la forma del marco**: escoge `vista` con la forma final que quieres ver. En vertical no hay marco: pasa por el encuadre de la zona |
| `camara=[toma(r, en=...)]` | Mueve la cámara a `r` en ese momento (`dura` en fotogramas, 14 por defecto). Es lo único que mueve la cámara |
| `marcas=[caja(r, en=...), marca(r, en=...)]` | `caja` dibuja un rectángulo rojo; `marca` pinta resaltador. Van sobre la imagen y siguen a la cámara |
| `fuente="github.com/..."` | La etiqueta de la fuente bajo el marco. Ponla en toda captura de una web o un post |
| `claro=True` | Para páginas de fondo blanco (el resaltador cambia de mezcla) |
| `video={"src", "r", "desde"}` | Un video encima de la imagen, en el rectángulo `r`: el video de un tuit sobre su captura |
| `foco=foco(r, en=..., dura=1.5, forma="rect")` | Congela el video (el de `video`, o el clip) `dura` segundos, oscurece todo menos `r` y le dibuja un contorno rojo (`forma="ovalo"` para un óvalo); luego el video sigue. `r` va en píxeles de la captura: `en_video(video["r"], r_medido_en_el_video, ancho, alto)` lo convierte |
| `extra=extra(img, en=..., recorte=)` | Una segunda captura que entra por abajo a la derecha (la frase que prueba algo de la primera). En vertical va a lo ancho de la zona; en horizontal, `ancho=` en px (1100) |
| `sigue=True` | El beat continúa la toma del anterior sobre la misma captura (ver abajo). Con `limpia=True` no hereda las marcas |
| `completo=True` | A pantalla completa sin marco (ya viene en `clip`) |
| `encuadre` | Solo vertical: `"ajusta"` (cabe a lo ancho) o `"cubre"` (llena la zona). Un clip con un diagrama o una diapositiva va en `"ajusta"`, con una `vista` en la parte que cita la voz |
| `importante` | Solo vertical: un rectángulo que el encuadre no puede dejar fuera, aunque no lleve marca |
| `etiqueta`, `sello`, `teclas`, `texto`, `velocidad` | Rótulo arriba a la izquierda, sello de goma `{texto, en, tam, color, arriba}`, teclas que se presionan `{"textos": ["Ctrl", "+"], "en": ...}`, texto de meme abajo `{texto, en}`, velocidad del clip |
| `rot` | Solo horizontal: giro del marco en grados |

### Cómo se ve una captura

- **Quieta.** La captura no se acerca sola: la cámara se mueve solo cuando hay una `toma`.
- **Una captura en beats seguidos es una sola toma.** El primer beat lleva su `vista`; los siguientes llevan
  `sigue=True` y una `toma` a la parte que se cita. Con `sigue`, el beat hereda la forma del marco, la fuente y
  `claro`, la cámara arranca donde la dejó el anterior, el video sigue en el segundo donde iba y las marcas del
  anterior siguen pintadas (no hay que repetirlas). Así se ve que la página se desplaza, sin otra entrada.
- **Tuit con video.** La `vista` empieza arriba, en el texto; la cámara baja al video con `toma(V)` y sube al texto
  con `toma(ARRIBA)`. El rectángulo del video se mide en una hoja de la captura (`cuadros.py rejilla
  tuits/x-<nombre>.png <png>`); `ubicar.py` no lo encuentra porque no es texto.
- **Encima del material va solo lo de [Encima](#encima-rótulos-recortes-y-el-)**: rótulos, recortes y el 👉, cada
  uno en su palabra. El `sello` de la captura es el de los episodios viejos; los nuevos usan `rotulo()`. Para señalar
  algo dentro de un video se usa `foco`; dentro de un texto, una marca.

### Traducción de lo resaltado

El público habla español: toda marca de resaltador sobre texto en inglés lleva `es=` (no hace falta en nombres
propios, cifras o código). Traduce corto y con tono natural de México, de un largo parecido al inglés. El español va
en el mismo lugar, con la letra (Segoe UI, o Georgia con `serif=True`), el tamaño y el color del original; si no
cabe, se achica. `peso=700` e `italica=True` imitan un titular en negritas o cursiva.

**Se traduce la oración entera, nunca un pedazo.** Un pedazo deja el resto de la oración en inglés pegado al español
("heels of DeepSeek lanzó su modelo"), y un español más corto deja un hueco antes del inglés que sigue en el renglón:
el 19 de octubre, 30 de 89 traducciones salieron así. Por eso `marca_texto` no pone una traducción que no queda
limpia (inglés suelto en la misma oración, un hueco o un renglón de más) y avisa `no se traduce`: márcala hasta el
punto y tradúcela entera, o déjala en inglés con su resaltador (la voz ya la dice en español). Lo que mejor se
traduce: un tuit corto, un titular, una oración suelta.

```python
*marca_texto(X, "THIS HAS GONE TOO FAR.", en="demasiado", es="ESTO YA LLEGÓ DEMASIADO LEJOS."),
*marca_texto(KOTAKU, "Inside Of Minecraft", en="Minecraft", es="dentro de Minecraft", peso=700, italica=True),
```

Sirve en fondo oscuro y claro y en frases de varios renglones: el español llena los mismos renglones (si la frase
empieza al final de un renglón, arranca en el siguiente) y no pasa de donde acaba la frase cuando el renglón sigue
con otro texto; si la frase cierra su renglón, puede seguir hasta el margen. `guion.py` avisa cuando una traducción
quedó a menos del 90 % del tamaño del inglés: acórtala. Ningún `no se traduce` se queda sin decidir: cada uno se
arregla (la oración entera) o se quita su `es=`. El cambio termina unos 1.2 s después de que empieza la
marca: ponla en una palabra que deje ese tiempo antes de que la cámara se vaya. Si el beat termina antes, el cambio
sigue en el beat siguiente cuando este lleva `sigue`.

## Las demás

- `titular(texto, color, emoji=, emoji2=, sello=)`: un rótulo grande para los remates. El tamaño se ajusta solo al
  texto; `\n` parte en renglones. Colores: `fuego`, `sol`, `rojo`, `verde`, `azul`, `crema`.
- `{"tipo": "tarjetas", "titulo": ..., "items": [tar(...)], "ya": n}`: dos a cuatro tarjetas que entran una por una
  (`en` de cada item). Un item es `tar("web/x.png", recorte=r)`, `tar(clip_=segundo, recorte=r)` o
  `tar(video="videos/x.mp4", desde=s)`, con `texto` de rótulo. `ya` es cuántas ya estaban visibles: así se arma
  "En el video de hoy..." agregando una tarjeta por beat.
- `{"tipo": "duelo", "izq": {...}, "der": {...}, "marcar": [...], "sello": {...}}`: dos contendientes con avatar,
  nombre y filas `{etiqueta, valor, color}`, con un sello de conclusión abajo. Para comparar precios o velocidades
  reales. Cada lado lleva `img`, `nombre`, `color` y `filas`. En horizontal el `sello` trae `tam` 230 y tapa el valor
  de la derecha: pon `tam` 90 (en vertical se ajusta solo). `titular(img=...)` es para una persona recortada: un logo
  ahí se sale de la pantalla.
- `{"tipo": "meme", "img": "img/distraido.jpg", "etiquetas": [{"texto", "x", "y", "rot", "rojo", "tarde"}]}`: memes de
  `public/img` con etiquetas en fracciones de la imagen. Hay distraido, drake, harold, pikachu, thisisfine, stonks,
  notstonks, mathlady, sudor, spiderman, patrick, wojak, gigachad y charlie.
- `{"tipo": "logo", "fecha": "6 OCT, 2026"}` y `{"tipo": "logo", "final": True}` para la entrada y la despedida, y
  `{"tipo": "logo", "invitacion": True}` para la invitación. El logo, su lema y los rótulos salen de `src/marca.json`.
- Primer beat de cada sección: `seccion=True` dentro de `v`.
- Las secciones que escribe otro agente (paso 3 del SKILL) entran con `*bloque("<n>")`: `fuentes/escenas/<n>.py` es una
  sola lista de párrafos, sin import ni asignaciones.
- **Gags propios del episodio**: el chiste que no se arma con metraje encontrado, un recorte y un rótulo (el artefacto
  fabricado del ejemplo absurdo: la app inventada, la terminal que cobra) lleva un componente nuevo en `src/escenas/`.
  Regístralo en `ESCENAS` de `src/Video.tsx`, y en `VERTICALES` si lee `useFormato()` ([Cómo se compone](#cómo-se-compone)).
  Los de episodios viejos (la junta de Zoom, el cartel de película) están en `src/escenas` de esos episodios, si
  existen en esta computadora (los primeros, en `C:\dev\el-diff-2`).

Emojis 3D en `public/emoji` (Fluent de Microsoft): la mano del 👉 y los de `emo()`. Para agregar uno:
`https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/<Nombre>/3D/<nombre>_3d.png`.

## Encima: rótulos, recortes y el 👉

`encima=[...]` en cualquier beat (`cap()`, `clip()` o cualquier `v`) pega cosas sobre la escena, cada una en su palabra
(`en`) o en una fracción del beat (`t`). Se quedan hasta el final del beat o hasta la palabra de `hasta`; no pasan al
beat siguiente aunque lleve `sigue`. `x` e `y` son el centro en fracciones de la escena (de 0 a 1). El componente es
`src/escenas/Encima.tsx`.

```python
cap(VALUACION, vista=V, marcas=[...], encima=[rotulo("MIL MILLONES", en="mil", estilo="banda", giro=-8, x=0.62, y=0.72)])
cap(WEB, vista=V, encima=[pegado("recortes/jensen.png", en="nvidia", x=0.82, alto=0.8)])
clip(0, src="videos/peleita.mp4", encima=[rotulo("LA GRAN PELEA", en="gran", y=0.14), rotulo("DE LOS MEDIOCRES", en="mediocres", estilo="rojo", y=0.3)])
cap(TABLA, vista=V, encima=[senal(0.42, 0.55, en="sesenta")])
```

| Helper | Claves |
|---|---|
| `rotulo(texto, en=, estilo=)` | `estilo`: `"crema"` (nombra), `"rojo"` (golpea), `"banda"` (letras oscuras sobre una banda; `color` `"roja"`, `"verde"`, `"amarilla"` o `"naranja"`; `tinta="crema"` para letras claras), `"placa"` (el nombre de una persona, bajo su recorte). `tam` en px (110), `giro` en grados (de −12 a 12 para lo que golpea, 0 para nombres y fechas), `x`, `y`, `hasta`, `minusculas=True` |
| `pegado(img, en=, entra=)` | Un PNG con transparencia de `public/recortes/` ([`MATERIAL.md`](MATERIAL.md#para-los-chistes)). `entra`: `"sube"` (anclado abajo, entra desde abajo), `"golpe"` (aparece en su lugar, con `y`), `"izquierda"` o `"derecha"` (entra deslizando). `alto` en fracción de la escena (0.75), `x` del centro, `espejo=True`, `giro`, `hasta` |
| `senal(x, y, en=, dir=)` | El 👉 que entra desde su lado y empuja hacia el punto. `dir`: `"derecha"`, `"izquierda"` o `"abajo"` |

- Lo que golpea entra con un golpe de 4 fotogramas en su palabra; un recorte entra en el nombre de quien es.
- La placa va debajo del recorte: `pegado("recortes/laskin.png", en="misha", x=0.3, alto=0.7)` y
  `rotulo("MISHA LASKIN", en="misha", estilo="placa", x=0.3, y=0.9, tam=64)`.
- Un rótulo o un recorte tapan lo que está debajo: ponlos donde no está lo citado, y comprueba en la revisión que la
  marca siga a la vista. En vertical, en un beat con marcas, el recorte va chico (`alto` de 0.3 como mucho) en una
  esquina de abajo (`x=0.15` o `0.85`, `entra="sube"`) y el rótulo arriba o abajo de la cita, nunca encima; si la cita
  baja hasta el borde, el recorte va en el beat siguiente, el que no lleva marcas. En el-diff-7, recortes de `alto` 0.5
  a 0.6 que entraban por la derecha taparon la cita en casi todos sus beats: fueron la mayoría de los arreglos.
- El metraje encontrado (el meme, la escena, la caricatura) es un clip: `clip(0, src="videos/<nombre>.mp4")`, bajado
  con `metraje.py` ([`MATERIAL.md`](MATERIAL.md#para-los-chistes)).

## Problemas conocidos

Todos pasaron en DeepSeek y se ven en la primera revisión:

- **El zoom no hace nada**: el marco tiene la forma de `vista`, y una toma más ancha que esa forma no puede acercar.
  En una página ancha, pon `vista` en la zona que importa, no la página entera.
- **`marca_texto` marca otra aparición de la frase**: si la frase sale dos veces en la captura (un commit y la
  descripción de un repo), `ubicar.py` toma la primera y solo lo avisa en stderr. Lee el aviso y pasa `ocurrencia=2`.
- **La marca se va de su lugar en un clip**: el clip avanza y lo marcado se mueve o desaparece. Usa el cuadro fijo de
  ese segundo (`cuadros.py rejilla ...@seg --guardar public/web/x.png`) con `cap()`.
- **El zoom deja fuera el rótulo del clip**: si el video del tema rotula cada resultado en pantalla (en el episodio 5,
  la pastilla con el nombre del modelo, abajo a la izquierda), un zoom o una `toma` lo cortan y ya no se sabe qué
  modelo es. Usa `foco` o un cuadro fijo con caja.
- **Texto diminuto o una tira**: una sola línea larga deja la zona vacía. Vuelve a sacarla desde su copia con lo de
  alrededor de la frase: `node <skill>/scripts/pagina.mjs <copia>.mhtml public/web/<x>.png --contexto`
  ([Capturas para el celular](MATERIAL.md#capturas-para-el-celular)).
- **Marca corrida**: la coordenada se midió a ojo. Usa `marca_texto` o `caja_texto` con la frase.
- **Clip que muestra otra cosa**: el editor del video del tema cortó o la pantalla cambió en esos segundos. Busca el
  segundo exacto con `cuadros.py hoja <video> <s1,s2,...>` y comprueba que dure todo el beat. También pasa en las
  tarjetas con clip (`tar(clip_=...)`): el clip sigue corriendo mientras la tarjeta está en pantalla.
- **Traducción que no se alcanza a ver**: la marca va tan tarde que la cámara se va (una `toma`) o el beat termina
  sin `sigue` antes de que cambie al español. Pon la marca en una palabra anterior o la `toma` más tarde.
- **Renglón cortado en el borde del marco** al bajar con `toma`: el marco tiene la forma de la `vista`, y la toma
  puede caer a media línea. Mueve la toma unos píxeles o hazla un poco más angosta para que el corte quede entre
  renglones.
- **Toma que no se centra**: una `toma` sobre algo pegado al borde de la imagen (la barra de abajo de un clip) no puede
  centrarlo, porque la cámara no sale de la imagen. Es normal que quede pegado al borde del marco.
- **Captura de una app de escritorio con letra diminuta**: en una pantalla entera la letra mide unos 13 px. Recorta
  la parte que se cita y escribe la `vista` a mano sobre lo citado, con la forma de la zona.
- **Clip de una vista previa que cae en negro**: el reproductor de una app tiene segundos vacíos entre planos, y el
  95 % del beat puede caer en uno. Revisa el tramo del clip cada medio segundo antes de elegir `desde`.
- **Sello encima de lo citado**: un `sello` va al centro (o arriba con `arriba`) y puede tapar el dato que dice la
  voz. Comprueba en la revisión que no tape la marca.

## El lienzo vertical

El episodio se ve en 1080x1920 (`FORMATO = "vertical"` en `guion.py`). De arriba abajo (`VERTICAL` en
`src/subtitulos.tsx`):

| Zona | px | Qué va |
|---|---|---|
| Arriba | 0-120 | Solo el fondo: ahí van las pestañas de la app |
| Gancho | 124-338 | El `sello` de la marca y el rótulo fijo de `GANCHO` en `guion.py`, dos renglones |
| Escena | 344-1500 | La escena, en una zona de 1080x1156 (`ZONA` en `Video.tsx`) |
| Subtítulos | 1500-1670 | La voz palabra por palabra, debajo de la escena para no tapar lo citado |
| Abajo | 1670-1920 | Solo el fondo: ahí van la descripción y los botones de la app |

`GANCHO` sigue la regla de "El gancho" en [`ESTILO.md`](ESTILO.md#el-gancho); sin él,
solo se ve el sello.

### Cómo se compone

- **Capturas para el celular.** Ya vienen angostas ([`MATERIAL.md`](MATERIAL.md#capturas-para-el-celular)): úsalas
  directo con `cap()` y `marca_texto`. La `vista` y cada `toma` tienen la forma de la zona, casi cuadrada (0.93), y
  `zona()` ya la da así. Una vista que abarca una sección de la página llena la zona con renglones que se leen; una
  tira de un renglón deja la zona vacía arriba y abajo.
- **El video del tema (16:9).** Si lo que importa es el cuadro entero (una tabla, una interfaz), lleva
  `encuadre="ajusta"`: cabe a lo ancho, en 1080x608, con la `vista` en la parte que cita la voz. Si importa una parte
  (una cara, un botón, una cifra), una `vista` de esa parte con la forma de la zona, que la llena. Para señalar algo
  dentro del video, `foco`.
- **Titulares y emojis** se acomodan solos: la letra al ancho de la zona y los emojis arriba o abajo del texto.
- **Gags propios:** que lean `useFormato()` y que estén en `VERTICALES` de `Video.tsx`; los demás se dibujan en 16:9,
  achicados a 1080x608.

### Cómo se dibuja cada escena

Con `useFormato()` (`{ vertical, W, H }`, en `piezas.tsx`) cada escena sabe que se dibuja en la zona de 1080x1156:

- **`captura` con `img`** (`CapturaVertical` en `Reales.tsx`): sin marco, a lo ancho de la zona. Cada rectángulo de
  cámara (`vista`, `inicio` y cada `toma`) pasa por `encuadre()` de `src/encuadre.ts`:
  - La toma se ajusta al ancho y la altura extra muestra más renglones arriba y abajo.
  - Si lo citado (las marcas de esa imagen en todo el episodio, con sus traducciones) se vería con renglones de
    menos de `LEGIBLE` = 40 px, la cámara se acerca a lo citado, sin dejarlo fuera.
  - Los renglones del OCR de la misma columna que lo citado se ven completos, aunque la letra quede más chica,
    mientras midan al menos `MIN_RENGLON` = 18 px; uno más largo se corta en la orilla. Los renglones los escribe
    `guion.py` en `src/lineas.json`, con `renglones()` de `ubicar.py`.
  - Las orillas donde la imagen sigue más allá de la zona se desvanecen, para que un renglón partido no se vea
    rebanado.

  Lo de encima se acomoda: la fuente abajo a la izquierda, la etiqueta arriba a la izquierda, el `extra` a lo ancho
  abajo, los emojis y el sello al 80 %. Un sello `arriba` va abajo, porque arriba taparía el encabezado de la captura,
  y siempre lleva fondo oscuro para leerse sobre páginas blancas.
- **`clip` y `video={...}` dentro de una captura**: la toma que cae en el video lo llena (recorte tipo cover),
  centrado en el `foco` si hay uno y si no en la toma, sin salir del video y sin dejar fuera lo marcado.
- **`titular`**: `renglonesVerticales()` (en `Basicas.tsx`) prueba todos los repartos de sus palabras en renglones
  y usa el que deja la letra más grande; a igual tamaño, el más parejo. Los emojis van en las esquinas de arriba del
  texto, el sello debajo y la persona (`img`), abajo.
- **`tarjetas`**: una o dos en columna, tres o cuatro en una rejilla de 2 columnas. El título va arriba y cada
  tarjeta es tan grande como cabe.
- **`duelo`**: un contendiente arriba del otro (avatar y nombre a la izquierda, cifras a la derecha), con el VS en
  medio y el sello abajo.
- **`meme`**: a lo ancho de la zona; las etiquetas van en fracciones de la imagen, así que quedan en su lugar.
- **`logo`**: centrado en la zona.
- **Respaldo**: los tipos que no están en `VERTICALES` de `Video.tsx` se dibujan en 1920x1080, escalados al ancho de
  la zona y centrados (1080x608).

Lo que encontró la revisión a 360 px en los episodios, y cómo se resolvió:

- Una tabla ancha (nombre a la izquierda, cifra a la derecha) no se lee: una `vista` en los nombres y una `toma` a
  las cifras en la palabra que dice la cifra.
- Un diagrama del video del tema recortado como cover pierde la mitad: va con `encuadre: "ajusta"` y tomas que
  siguen a la voz.
- Un sello amarillo sobre una página blanca no se leía: ahora lleva fondo oscuro.

### Dónde cambiar el diseño del vertical

El lienzo, en `VERTICAL` de `subtitulos.tsx` y en sus componentes `Gancho` y `Subtitulos`. El encuadre de las
capturas, en las constantes de `encuadre.ts` (`LEGIBLE`, `MIN_RENGLON`, `KMAX`, `PAD`).

Para la sincronía de los subtítulos, `python <skill>/scripts/sincronia.py out/el-diff-final.mp4 <seg> 2
revision/sinc.png 2` pone cuadros seguidos con la forma de onda de la voz debajo. Las cifras leídas en palabras le
llegan apretadas al alineador, y los subtítulos las reparten por letras hasta la palabra siguiente (`repartir`).

## El lienzo horizontal

Con `FORMATO = "horizontal"` (lo pone `nuevo.py --formato horizontal`) el episodio va en 1920x1080 y cada escena
llena la pantalla: sin `GANCHO`, sin subtítulos y sin portada. Una captura va en su marco con la forma de su `vista`,
con la fuente debajo; `zona()` da rectángulos de 16:9 y `encuadre`, `importante` y `lineas.json` no cuentan. La
revisión es la misma; las hojas van de 4x4 a 480x270.
