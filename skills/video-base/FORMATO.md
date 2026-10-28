# El formato

Todo estilo de vídeo hace los dos formatos, con el mismo estilo: **vertical** (1080×1920, para TikTok, Reels y Shorts)
y **horizontal** (1920×1080, para YouTube). Lo elige el usuario en Sloth al crear el vídeo y llega en la línea
`Formato: vertical` o `Formato: horizontal` del mensaje. Sin esa línea, el que diga la skill del estilo.

- **Un vídeo, un formato.** Se compone en ese desde el principio: el tamaño de la composición, el encuadre de cada
  plano y dónde va cada cosa. Nunca se hace en uno y se recorta o se rellena al otro: un vertical recortado a 16:9
  pierde la cabeza y el texto, y un horizontal con barras se ve hecho a la carrera. Si en el hilo piden el otro
  formato, no hagas una copia: que cree otro vídeo en Sloth con el otro.
- **Qué cambia de lugar.** En vertical, todo se apila: texto arriba, protagonista al centro, personaje abajo. En
  horizontal, lo apilado va al lado: el personaje o la persona a un tercio (izquierda o derecha), el texto en el tercio
  de abajo o junto al personaje, y el mundo ocupa el ancho. La letra no se encoge: un horizontal se ve más chico (en
  el celular ocupa solo el ancho de la pantalla), así que el texto va del mismo tamaño en píxeles que en vertical, o
  más grande; la prueba es que se lea en la hoja a 480×270. La skill de cada estilo dice cómo se acomoda lo suyo en
  cada uno (su sección «Formato») y su plantilla compone los dos.
- **Lo que se ve.** Vertical: la interfaz de TikTok y Shorts tapa abajo y a la derecha. Horizontal: un margen del 5 %
  por lado. `hoja.mjs --zonas` pinta lo de cada uno.
- **Revisar.** Las hojas salen con 6 columnas en vertical y 4 en horizontal; un horizontal se mira a 480×270, donde se
  tiene que leer todo.
- **Comprobar.** `comprobar.mjs out/<video>.mp4 --tamano 1920x1080` en horizontal, `--tamano 1080x1920` en vertical.
- **La portada.** El vertical la lleva de primer fotograma; el horizontal no la lleva dentro: su `portada.png` es la
  miniatura de YouTube (1280×720), que Sloth ofrece al programarlo. Las dos, en [PORTADA.md](PORTADA.md).

En el repo de Sloth, `npm run comprobar-skills` falla si la skill de una card de vídeo no dice qué hace con
`Formato: horizontal`.
