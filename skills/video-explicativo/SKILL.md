---
name: video-explicativo
description: Hace un video explicativo, vertical (TikTok, Instagram, Shorts) u horizontal (YouTube), sobre cualquier tema y para cualquier propósito. Un solo mundo 3D que la cámara recorre sin cortes, el texto palabra por palabra y el personaje del canal (el perro salchicha u otro), recortado como sticker, que habla y reacciona. Dura lo que pide lo que hay que contar, sin relleno. El usuario graba la voz y el cierre invita a donde él quiera (su Telegram, Instagram, WhatsApp, YouTube…). Úsala cuando pidan explicar algo en un video (un proyecto, una noticia, cómo funciona algo, una historia) o un video con el perro.
---

# Video explicativo

Escribes tres archivos y corres un comando. El guion (`guion.md`), sus pruebas (`fuentes/investigacion.md`) y
`momentos.json`: qué se ve en cada palabra. El director de la plantilla arma solo el mundo 3D, la cámara, el encuadre,
el texto, las poses, los sonidos y el cierre, y `hacer.py` hace la voz, renderiza, mide y pone la portada. **No escribas
código ni abras la plantilla**: todo lo que el video necesita se dice en `momentos.json`.

`<skill>` es esta carpeta y `<base>` es `video-base`, junto a ella. Los scripts van con el `python` del sistema.

## Lo que el usuario pidió y no se negocia

- **Cada dato es verdadero**, de su fuente primaria, con fecha de corte. Al video solo van cifras primarias o de medios
  serios; una dudosa no se dice.
- **La voz la graba el usuario**, o la generas en AI Studio si el mensaje trae `Voz:`. Ninguna otra voz sintética.
- **El cierre es el de la marca**: la última frase del guion es `cierre.frase` de `marca.json` (o de la marca de la
  línea `Marca:`), tal cual (si su red no es `ninguna`). La tarjeta del canal la pone el director.
- **El video informa, no aconseja.** Si el tema es de dinero, nada de «compra» o «vende».
- **Nada de emojis**, tampoco en los subtítulos: íconos de Phosphor o imágenes.
- **Ningún modelo 3D se hace dos veces**: los objetos salen de la biblioteca (`modelos.py lista`) o son íconos de
  Phosphor extruidos, y lo nuevo se guarda en la biblioteca (skill [`modelos-3d`](../modelos-3d/SKILL.md)).
- El proyecto va en la carpeta de la línea `Carpeta: <nombre>` (sin ella, `explicado-<tema>`), y en el formato de
  `Formato:` (sin ella, vertical). Con `Formato: horizontal` (1920×1080, para YouTube) es `nuevo.py <carpeta> --formato
  horizontal` y nada más: el director acomoda el texto abajo, el personaje a la derecha y el mundo a todo el ancho, y
  `hacer.py` deja `portada.png` como miniatura de YouTube (la generada con IA o el cuadro del titular a 1280×720; no entra en el video). Si
  piden el otro formato, es otro video.

## Para que lo vean

Lo que decide si alguien se queda es el guion: el mundo ya se mueve solo. Antes de pedir la voz, léelo como alguien que
va pasando videos y no sabe nada del tema, y ponle de 1 a 10: ¿se detendría?, ¿lo entiende a la primera?, ¿se ríe?,
¿se queda hasta el final?, ¿se lleva algo que no sabía? Lo que no llegue a 9, reescríbelo antes de pedir la voz: es lo
más barato de cambiar.

- **El gancho, en la primera frase**, de menos de diez palabras, sobre algo que todos conocen: el dato que no se cree,
  la promesa que suena demasiado bien. Nada de presentaciones («Hoy te cuento…», «¿Sabías que…?»). «Tu tamal lleva
  cal.» sirve; «Tu tamal lleva cal. Sí, la de pintar paredes.» detiene el dedo. Que contradiga lo que el que mira ya
  cree: «Tu cuchillo te hace llorar» (la culpa no es de la cebolla) detiene; «La cebolla es un arma química» repite
  lo que todos suponen y se pasa.
- **Habla el personaje**, con su actitud: el perro es un salchicha con puro y cadena de oro, de vuelta de todo, que se
  burla de lo que desmiente. **Un remate cada ocho o diez segundos**: las últimas palabras de una frase giran lo que
  venía (una comparación absurda, una exageración, el sarcasmo del perro), y el remate también enseña. «Te mandan un
  informe con gráficos. Gráficos, para tu pelo.» «El agua se hace juntando hidrógeno y oxígeno. Y una explosión.» Una
  broma que no sale del tema, o que lo estira, se va. El que hace reír es una escena que se puede dibujar, con alguien
  que todos tienen (tu tía, tu jefe) o algo que ya vivieron: «les pide dinero a tus contactos» informa; «y tu tía le
  deposita dos mil pesos a tu foto de perfil» hace reír y enseña lo mismo. «Con funda, el calor no sale» → «con funda
  es correr un maratón con chamarra». Su momento lo enseña (la cifra, los billetes que vuelan). Quién sale lo pide el
  tema (el compa del grupo, el mesero, tu mamá, el vecino), no estos ejemplos: «no al de tu tía» metida en el café,
  que no tenía que ver, no hizo gracia.
- **Una situación de allá, muy concreta**: del lugar y la gente de `habla` de la marca (en México: la salsa del
  domingo en el molcajete, el pozole del 15 de septiembre, la fila del Oxxo a las once), con su hora y quién está. «Tu
  cuchillo» enseña; «el cuchillo que heredaste de tu abuela, el que también corta el pan y abre las latas» se reconoce.
  La primera cebolla sacó 7 en «lo vería» y en «divierte» con el usuario: pidió «una situación más específica de
  México». **El humor es el de `habla`**: si dice humor negro, sin miedo a la muerte, la desgracia y la familia sin
  filtro (la abuela que te heredó el cuchillo y el trauma), nunca contra quien ya la pasa mal.
- **Una idea por frase, frases cortas**, palabras de todos los días, de tú (o como diga `habla` de la marca). Cada cifra
  en letra («sesenta y nueve por ciento»): la voz las dice y el alineador no sabe situar dígitos.
- **Nombra lo que enseñas**: «suelta la niacina», no «suelta la vitamina». El nombre es lo que se lleva y lo que
  repite; sin él, el tamal se quedó en 8 en «enseña». Uno por video, el que alguien repetiría en la mesa
  («capsaicina»); el del laboratorio («el receptor TRPV uno», «lo clonó») se dice con palabras de todos («un sensor
  de calor»).
- **No anuncies lo que vas a decir: dilo.** Nada de «Lo peor: …», «Dato curioso: …», «Ahora, la parte buena».
- **El giro**: lo que el que mira creía, y por qué no es así, con la prueba (quién lo dice y cuándo).
- **En cadena**: cada frase abre la pregunta que cierra la siguiente («Entonces cavas un escalón… pero en cuanto te
  asomas, te ven. Entonces…»), en segunda persona y con algo que el que mira ya vivió. Así se queda hasta el final.
- **El final vuelve al principio** (el gancho, ya resuelto) y se ve: su momento repite la tarjeta o la cosa del gancho
  (en el tamal, «las paredes ni se enteran» cayó en la olla de siempre y el chiste de la cal de pintar no volvió),
  luego «Mándaselo a quien…» (a alguien concreto: «a quien cree que una trinchera es solo una zanja») y la frase de la
  marca.

Los videos de este género que pegan y lo que tienen, en [`REFERENCIAS.md`](REFERENCIAS.md): la vara con que se
califica.
- **Dura lo que pide**: ~3.4 palabras por segundo (la voz ya acelerada). Si piden un largo, se cumple: 30 s son ~100 palabras con el cierre
  (`hacer.py --dura` lo cuenta antes de pedir la voz).

La forma sale del tema: una historia se cuenta en orden y con tensión; una noticia, lo que pasó primero; un cómo se
hace, el resultado y los pasos; un misterio, la pregunta, las pistas y la respuesta; una estafa, la promesa, el truco y
la prueba que la desmiente. Con la línea `Serie:`, sigue [`SERIES.md`](../video-base/SERIES.md).

## momentos.json

Un momento por idea, cada 2 o 3 segundos de voz (una o dos frases; ninguno de más de 4 s, unas 13 palabras: si una idea
tarda más, se parte en dos con otra tarjeta o la misma cosa que cambia): en la `palabra` que lo dispara, entra su `cosa` (un
objeto 3D), su `tarjeta` (lo 2D, encima de la cosa) y la `pose` del personaje. La cámara va sola de una cosa a la otra;
lo ya dicho se queda atrás, gris. El primer momento es el primer cuadro y la portada: **el protagonista 3D haciendo
ya lo que sorprende** (la masa inflándose, el celular vibrando con el mensaje falso, la burbuja naciendo en el
nudillo), con `anima` o `accion` desde el cuadro cero, una tarjeta corta encima si hace falta (`cifra`, `boton`) y la
pose más fuerte que pida (`susto`, `reojo`, `lentes`). Una foto quieta de entrada no detiene a nadie: un revisor a
ciegas le dio 5 a 7 de «lo vería» a los cinco que abrían con foto. Cada remate, con su pose (`ladra`, `lentes`, `susto`,
`tapa`): con ellas la cámara se mete de cerca y el perro entra de golpe. El remate se ve en la escena (la cosa que cambia con su `anima`, la persona que lo vive), nunca en una foto ni un logo: hacer.py lo revisa. **De dos a tres fotos reales por video**,
después del gancho, como prueba (quién lo dice, la cosa real): sin ellas, todo es un ícono genérico.
- **Lo que dice la tarjeta es lo que dice la voz**: la misma cifra, en el mismo momento («la mitad» es `50 %`, no `38`;
  «más de setenta y cinco dólares» no es `$25+`). Una que no coincide se nota y tumba lo claro.

```json
{
  "paleta": { "oscuro": "#2a1d14", "claro": "#f3ead8", "luz": "#ffb347" },
  "cosas": {
    "sobre": { "modelo": "sobre-mechon", "tam": 1.5 },
    "revista": { "icono": "BookOpenText", "color": "regla" },
    "medico": { "icono": "Stethoscope", "color": "regla" }
  },
  "momentos": [
    { "palabra": "Mándanos un mechón", "cosa": "sobre", "pose": "reojo", "anima": { "mechon": 1 },
      "tarjeta": { "tipo": "boton", "texto": "Enviar mi mechón", "icono": "Scissors", "no": "No lo contestes" } },
    { "palabra": "dos mil dieciocho", "cosa": "revista", "pose": "lupa", "tema": "claro",
      "tarjeta": { "tipo": "prueba", "icono": "Newspaper", "fuente": "J Allergy Clin Immunol Pract · 2018",
                   "antes": "Análisis de pelo: ", "frase": "pruebas sin probar", "subraya": "sin probar" } },
    { "palabra": "ninguno", "cosa": "sobre", "gris": true, "pose": "pata",
      "tarjeta": { "tipo": "cifra", "valor": "0", "nota": "diagnósticos válidos", "color": "pierde" } },
    { "palabra": "ve al médico", "cosa": "medico", "pose": "feliz" }
  ]
}
```

- **`palabra`**: las palabras de `guion.md` (de una a tres, seguidas y tal cual se escriben ahí), en el orden en que se
  dicen; `vez: 2` si es la segunda vez que salen. Las cifras, en letra, como en el guion.
- **`cosas`**: cada una, `modelo` (un id de `modelos.py lista`) o `icono` (un nombre de Phosphor en PascalCase:
  `ShieldCheck`, `Syringe`), con `color` (por significado: `protagonista`, `segundo`, `dinero`, `pierde`, `regla`,
  `ajeno`, `apagado`; o `#rrggbb`), `tam` (metros: 1.6 un modelo, 1.1 un ícono), `props` (las del modelo al entrar) y
  `giro` (grados) y `sale: true` (se va al acabar su momento: lo de un chiste, que no se quede de escenografía). **Un protagonista** (lo que el video explica, mejor un modelo de la biblioteca que un ícono) que
  vuelve en la mitad de los momentos o más y cambia de estado (`anima`, `gris`), y cinco cosas como mucho en todo el
  video (hacer.py lo exige): una escena que se va armando, no un objeto por idea; verlo transformarse entretiene más
  que un ícono nuevo en cada idea. Un ícono es para lo que se nombra una vez. Un objeto es una sola cosa: el celular
  del mensaje y el de «llama a tu banco» son la misma, y un modelo no hace de otro objeto (un celular no es «la
  pantalla» que se compra). Antes de usar un modelo, di qué ve quien no sabe nada: si no diría lo que dice la voz, no
  sirve (el sueño de después de comer enseñó un tamal en «no del taco», un medidor en «tu reloj» y un vaso de agua en
  «la glucosa»). Usa el ícono de eso (`BowlFood`, `ClockAfternoon`, `Brain`, `Flask`) o, si es el protagonista, hazlo. Lo mismo un
  ícono: si Phosphor no tiene el objeto (un hígado), no va otro que se le parezca (un matraz), va la foto o la tarjeta.
  Lo mismo cada momento: enseña aquello de lo que habla la frase, no un símbolo suelto. «Doce mil quinientos millones
  perdidos en fraudes» con billetes flotando no se entendió (el usuario, 6-nov): es la estafa misma (la caja con el
  Android) con la cifra encima. Un ícono se ve entero, nunca en `detalle`, y contra su fondo: el director le sube el contraste, pero un modelo claro en una escena clara se pierde (la caja del iPhone): ahí va uno oscuro o la escena oscura. Si el modelo dice algo (`mensaje`, `de` y `hora` del celular; `alerta`; `pantalla`), dilo:
  el mensaje falso escrito en la pantalla explica más que la voz.
- **`anima`**: props del modelo que cambian en ese momento, con un resorte (`{ "abierto": 1 }`). **Cada cambio, cuando la voz lo dice y en ese orden**: el gancho no gasta lo que se explica después (los dedos traían la burbuja y los huesos separados desde el primer cuadro, y en «nace una burbuja» no pasó nada); mientras cambia, sin `accion` encima. hacer.py lo revisa; las que tiene cada
  modelo las dice `modelos.py lista`. Lo que animas arranca en 0 si la cosa no lo trae en `props`: si en ese modelo el 0
  no es como se ve siempre (la hogaza con `dorado` 0 es masa cruda), ponlo en `props`. **`gris: true`**: lo desmentido o lo que se acaba se queda gris desde ahí.
- **`tarjeta`**, una de:
  - `imagen`: `src` (en `public/`), `pie` (dos a cuatro palabras) y `fuente`. **Lo real se reconoce más que un ícono**:
    el producto, el anuncio, la página, la persona, el lugar. De dos a tres por video, de las páginas que ya
    leíste (la de una noticia o una tienda trae su foto):
    `python -B -X utf8 <skill>/scripts/imagenes.py <nombre>=<url de la página o de la imagen>…` (todas en una
    llamada, ~3 s) las deja en `public/img/<nombre>.jpg`. Si una no sale, va un ícono: no se inventan. La foto enseña la cosa (el estómago, el pájaro, el habanero), nunca el logo de quien lo dice: eso va en `fuente`; el logo de Scientific American en «nada apaga el eco» no enseñó nada. **La foto
    entra cuando el protagonista ya se vio**: nunca en los dos primeros momentos ni antes de unos 5 s (15 palabras), y
    se queda 2 s o más (6 palabras); mientras se ve, el director para y quita lo de detrás. En el del corazón entró a
    los 3 s y «al modelo 3D ya no se le permitió ver nada».
  - `cifra`: `valor` (corto y con su unidad: «0», «$200», «8 €», «69 %», «4 cm»), `nota`, `fuente`, `icono`, `color`; `cuenta: [0, 200]` la hace correr.
  - `prueba`: quién lo dijo (su `logo` real, con `logos.py`; si no tiene, un `icono`; y `fuente` con la fecha) y solo
    la frase que importa: `antes`, `frase`
    (subrayada en rojo cuando se dice `subraya`, o al entrar) y `despues`. Diez palabras como mucho.
  - `iconos`: `iconos` (de dos a cuatro) y `color`. `logos`: `logos` (de public/logos).
  - `boton`: `texto`, `icono`; con `no` (palabras del guion), ahí parpadea y se queda rojo: «no se puede».
  - `versus`: `a` ≠ `b`, dos palabras cada uno. `post`: un post de Reddit (`sub`, `fecha`, `titulo`, `votos`).
- **`pose`** (del perro; cambia en ese momento y se queda): `normal` explica · `ladea` pregunta · `arriba` enumera o
  lee · `lado` pasa a lo siguiente · `reojo` algo sospechoso · `lentes` descaro o un truco · `pata` niega o pone un
  límite · `tapa` vergüenza o dolor · `susto` un número que asusta · `triste` algo que se acaba · `feliz` algo bueno ·
  `ladra` un remate fuerte · `acostado` ya no tiene remedio · `lupa` se investiga · `llave` se desbloquea · `billetes`
  dinero que se paga. Una por idea, ni muy seguido ni de más. Un personaje propio tiene las suyas (las dice `hacer.py`
  si una no está).
- **`titular`** (arriba, junto a `paleta`): el gancho, enorme y palabra por palabra en el primer segundo, y la portada
  (en vertical su primer cuadro; en horizontal, la miniatura). Sin él va la primera frase del guion, entera en el primer
  medio segundo (por eso el gancho es una frase corta y sola), con la última palabra del color de la luz: que sea la que
  sorprende («Tu tamal lleva **cal**»). Si esa frase pasa de diez palabras, `hacer.py` para y pide `titular`.
- **`tema`**: `claro` u `oscuro`, el fondo desde ahí (en el giro). `paleta`: los dos fondos y la luz, sacados del
  lugar del tema (la oficina de correos en madera y kraft; el laboratorio en blanco y azul).
- **Dirígelo como un set: lee [`CINE.md`](CINE.md) antes de escribir los momentos.** `escenas` (dos a cuatro lugares,
  cada uno con su `luz` y su `fondo`) y en los momentos `escena` (dónde pasa desde ahí), `en` en las cosas (dónde va
  cada una dentro de su escena: se quedan puestas y la escena se arma) y `camara` (`plano`, `angulo`, `lente`,
  `movimiento`, `corte`). Un plano distinto en cada momento importante: sin `camara`, todo es un plano medio que va de
  objeto en objeto, y aburre.
- **`accion`**: lo que la cosa hace una y otra vez desde ese momento hasta que otro suyo pida otra (o `quieta`): `golpea` (el martillo, el sello, el
  metate), `late` (solo un corazón), `tiembla` (lo que hierve, lo que va a romperse), `gira` (una moneda, la
  Tierra) o `salta` (lo que de verdad salta). **Cada movimiento es lo que esa cosa hace en la vida real y lo que dice la
  voz en ese momento**; si no hay uno, ninguno: un celular que late, una gota que salta o un rayo que brinca detrás de
  una foto son «animaciones que no tienen que ver» (el usuario, 6-nov). Lo que ya actúa solo (`actua` en `modelos.py
  lista`: el cuchillo que pica, el corazón, el celular que suena) no lleva `accion`: cambia con `anima`. hacer.py lo
  revisa.
- **`contador`** (arriba: `{ "nota": "golpes" }`, con `color`, `prefijo`, `sufijo`, `decimales`) y **`cuenta`** en los
  momentos: un número vivo bajo el texto que corre de un valor al siguiente («GOLPES 99», la población que baja, los
  metros, los días). Uno por video si hay algo verdadero que se cuenta (el dinero que se va con cada cuota, las señales de
  alarma), desde el primer momento: es lo que más sube «entretiene». Uno inventado (lágrimas 0, 2, 4… 120) baja «enseña». Es un dato como cualquier otro: verdadero,
  o un ejemplo que la voz dice como ejemplo («si tienes diez mil en la cuenta…»).

Las reglas de la imagen que siguen valiendo, y que el director no puede poner por ti: pocas palabras en lo que se ve
(un número o dos palabras: el texto de arriba ya dice el resto), imágenes en vez de nombres (un logo, un ícono, un
objeto), y nada de etiquetas de cambio sueltas («−94 %»): el número ya lo dice.

## Los pasos

1. **En un solo mensaje**: `python -B -X utf8 <skill>/scripts/nuevo.py <carpeta>` (con `--formato horizontal` si
   toca, `--marca <nombre>` si el mensaje trae la línea `Marca:` y `--musica` si trae `Música: de fondo`: `final.py`
   le pone entonces música sintetizada bajo la voz, que baja sola al hablar; `--imagenes chatgpt` o `--imagenes "<modelo>"`
   si trae `Imágenes: con ChatGPT…` o `Imágenes: genéralas en Google Flow con <modelo>…`, y un `--adjunta <ruta>` por
   cada `Imagen adjunta:`: `hacer.py` genera entonces la portada con eso, de fondo mientras renderiza; no la hagas tú)
   en segundo plano (con `run_in_background`);
   `python -B -X utf8 <skill>/scripts/marca.py ver` (con la misma `--marca`);
   `python -B -X utf8 <skill>/../modelos-3d/scripts/modelos.py lista`; y de dos a cuatro búsquedas web a la vez. Si a
   la marca le falta algo, pregúntalo ([`MARCA.md`](MARCA.md)).
   **La pieza central**: si la biblioteca no tiene el objeto que sostiene la historia (la olla del tamal, el aparato del
   baño de pies, la hogaza del pan), en cuanto sepas cuál es lanza **un** subagente en segundo plano que lo haga a
   medida, con tu mismo modelo: «sigue la skill modelos-3d (4 y 5): escríbelo en `src/modelos/<id>.tsx` de
   `<proyecto>`: <qué es y qué partes trae>. El objeto mismo llena su caja: sin mesa, piso ni base debajo (el mundo ya
   trae piso), porque el video lo escala por su caja y una mesa lo deja diminuto. Compacto, casi tan alto como ancho: lo
   largo va de pie (el video es vertical; la articulación de los dedos, dos huesos acostados, quedó una tira delgada). Con props de 0 a 1 para lo que cambia
   en la historia (<cuáles>), que se vean de frente a la cámara y a su tamaño, y una que la haga actuar sola todo el
   video mientras vale más de 0 (<la acción que no para: pica, late, gotea>; guárdala con `--actua`). Que la acción
   tenga el detalle de la vida real: lo que salta, se deshace o salpica al hacerla (las capas de la cebolla que se
   separan, el jugo, las gotitas), no solo el objeto que sube y baja. Primero, en unos 4 minutos, una versión
   que compile con todas sus props; luego guárdalo con `modelos.py guardar`. No toques nada más.» Úsalo como la cosa de tu escena principal, con sus props en `anima`.
   Es lo que más sube un video: con ella, la escena se arma frente al que mira; sin ella, son íconos sueltos.
   **Prefiere las piezas que actúan** (`modelos.py lista` dice «ACTÚA con `<prop>`»): de protagonista, encendidas desde
   el primer momento, el video tiene una acción que no para (el cuchillo que pica, el corazón que late). Si el tema pide
   comparar (con filo y sin filo, antes y después), una pieza que enseñe los dos lados a la vez con su contador
   (`duelo-cuchillos`) se lee sin sonido.
2. **Una lectura más, si hace falta** (la fuente primaria de la cifra que lo sostiene), todas a la vez. Con eso basta:
   no investigues más de dos rondas, y en una serie tampoco: el tema es el primero que cumpla lo que pide, del banco o
   de la primera ronda de búsquedas, no el mejor posible (elegir entre muchos se comía de 2 a 4 minutos y el doble de
   costo). La segunda ronda es solo para la fuente primaria y las fotos del que elegiste.
3. **El guion lo escribe el subagente `guionista`** (Opus, solo escribe: Agent con `subagent_type: "guionista"`, sin
   `model` ni `effort`, aunque el mensaje traiga la línea `Subagentes:`: va en Opus a propósito, que es lo que mejora
   el guion), siempre que tu lista de agentes lo traiga; solo si no está, lo escribes tú. Pásale en unas doce
   líneas lo que necesita y nada más: los datos que vas a usar con su fuente, la marca (`habla` y la frase del cierre),
   los segundos y las palabras (3.4 por segundo), la ruta `<proyecto>/guion.md` con su formato (`# Título de dos a
   cinco palabras`, la línea `Corte de datos: …` y el texto en párrafos) y las reglas de «Para que lo vean» copiadas tal
   cual. Espéralo (unos 30 s): al usuario le gustó más su guion que el del agente solo (el chile, 6-nov), y con solo
   Write arranca con poco contexto (un subagente general cargaba 38 mil tokens para escribir 100 palabras).
   Luego, **en un solo mensaje**, con Write: `fuentes/investigacion.md` (la fecha del corte, cada cifra en una tabla `| dato |
   valor | fuente (enlace) |` y las citas textuales; corto), `terminos.txt` (los nombres del tema, uno por renglón, para el
   transcriptor) y `momentos.json`; los logos que pida, con `python -B -X utf8 <skill>/scripts/logos.py
   <nombre>=sitio:<dominio>…` (todos en una llamada), y sus imágenes con `imagenes.py`. Corre `python -B -X utf8
   <skill>/scripts/hacer.py --revisa` (sin fondo, un segundo) hasta que diga ✓: dice todo lo que falla de una vez, y
   cada ✗ con hacer.py de fondo te cuesta tres vueltas. Luego `python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz> --dura <los segundos que pidieron>`
   **en segundo plano** desde la carpeta del proyecto (sin `Voz:`, dale el guion al usuario para que lo grabe y, con su
   audio, `hacer.py --audio <archivo>`). Si lanzaste la pieza central, corre `hacer.py` cuando el subagente te avise
   que su primera versión compila. Termina tu mensaje: te avisa al terminar (~3 min). Mientras, no esperes con
   `sleep` ni lo vigiles.
4. **Si dice ✗**, arregla lo que dice y vuelve a correrlo de fondo, sin `--studio` si el guion no cambió (la voz se
   guarda). Si dice ✓, mira `revision/hoja.png` (un cuadro cada 1.5 s) y `portada.png`: que cada momento enseñe lo que
   se dice, que nada se tape ni se corte y que se entienda sin sonido. Otro render cuesta minuto y medio: solo si algo
   se tapa, se corta o queda vacío, y todo en una vuelta (lo que solo podría verse un poco mejor, no). Un
   ✘ de movimiento o de parpadeo es del director: no lo busques, entrega y díselo al usuario.
5. **Entrega**: la ruta de `out/<carpeta>.mp4`, el enfoque en una línea, cuánto dura y que el audio no lo oíste. Si
   hiciste la pieza central al vuelo, avísalo: «El <objeto> no estaba en la biblioteca: lo hice al vuelo y se ve
   menos pulido; si va a volver a salir, que se pula en Modelos 3D». Nunca dejes un video sin su pieza porque no estaba.

Si algo que el video necesita de verdad no cabe en `momentos.json` (una pieza 2D que no hay), escríbela en
`src/piezas/<nombre>.tsx` (las piezas del kit, en [`KIT.md`](KIT.md)) y úsala con
`"tarjeta": { "tipo": "pieza", "nombre": "<nombre>", "props": {…}, "w": <ancho px>, "h": <alto px> }`; recibe además
`en` y `hasta` (sus cuadros). Y díselo al usuario: falta en el director.
