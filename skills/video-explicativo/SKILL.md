---
name: video-explicativo
description: Hace un video vertical explicativo (TikTok, Instagram, Shorts) sobre cualquier tema y para cualquier propósito. Un solo mundo 3D que la cámara recorre sin cortes, el texto palabra por palabra arriba y abajo el personaje del canal (el perro salchicha u otro), recortado como sticker, que habla y reacciona. Dura lo que pide lo que hay que contar, sin relleno. El usuario graba la voz y el cierre invita a donde él quiera (su Telegram, Instagram, WhatsApp…). Úsala cuando pidan explicar algo en un video vertical (un proyecto, una noticia, cómo funciona algo, una historia) o un video con el perro.
---

# Video explicativo

`<skill>` es esta carpeta y `<base>` es `video-base`, junto a ella (`~/.claude/skills/video-base`): masterizar,
comprobar y la hoja de contacto. Lee su [`LEEME.md`](../video-base/LEEME.md) antes de empezar (los errores ya vistos). Los scripts
van con el `python` del sistema (el que tiene rembg) y se corren desde la raíz del proyecto.

**Sirve para cualquier tema y cualquier propósito.** Hoy puede ser un proyecto de crypto y mañana cómo cazan los gatos,
una noticia de tecnología o la historia de una marca. El primer video fue de crypto (Berachain) y por eso el ejemplo y
algunas piezas de la plantilla hablan de monedas: tómalos como ejemplo, no como el tema del estilo. De qué habla el
canal, quién narra y a dónde invita el cierre lo dice la **marca** del usuario (ver "La marca").

## La esencia

Un video que explica algo en el tiempo que eso pide, tan claro que se entiende sin saber nada antes, y que termina llevando al que lo ve
a donde dice la marca. Tres palabras lo sostienen:

- **Un mundo.** Todo pasa en un solo mundo 3D que la cámara recorre de principio a fin, sin cortes: se acerca a un
  detalle, sale al conjunto y vuelve a sitios ya vistos. Cambiar de capítulo es repintar el mismo mundo entre sus dos
  fondos, que son de cada video.
- **Un foco.** En cada momento solo se mueve y tiene color lo que se está diciendo. Lo demás no está, o está de fondo:
  gris, quieto y apagado.
- **Una prueba.** Cada dato es verdadero y se ve con su fuente: el número pegado a lo que mide, la cita corta con su
  dato subrayado, el logo real de quien lo dijo.

El primer video, Berachain, está en [`ejemplos/berachain/`](ejemplos/berachain/): ábrelo cuando dudes cómo se resolvió
algo.

## Cada video es único

Lo fijo del estilo es poco: un mundo 3D en una sola toma, el texto palabra por palabra arriba, el personaje abajo y
"Las reglas de la imagen". Todo lo demás sale del tema y cambia de un video a otro: la forma del guion, cómo suena, el
lugar y cómo se recorre, sus colores, el protagonista y dónde está en el cuadro, el primer cuadro, cómo cambia de
capítulo, la pieza que solo tiene ese video y qué hace el personaje. Una historia de Reddit tiene que sentirse historia de
Reddit; una noticia, noticia. El de Berachain es un ejemplo de cómo se resolvió un tema, no el molde. Cómo se decide,
en "El enfoque" de [`GUION.md`](GUION.md).

- **Cada video arranca de la plantilla y de la biblioteca de modelos**, no del código de otro video. Lo que sirve a
  una serie entera vive en la plantilla (el post de Reddit, `src/piezas/reddit.tsx`).
- **Que no se parezca a otro lo comprueba un script**: `<base>/scripts/huellas.py` compara la huella de este video (lo
  que cuenta y cómo se ve) con la de todos los que ya se hicieron, y solo dice lo que choca. Va dos veces: en el
  enfoque (paso 3) y con el mundo armado (paso 8).

## Series

Las series son formatos fijos que sirven para cualquier nicho, cada una en su archivo de [`series/`](series/): qué es,
dónde buscar el tema y cómo elegirlo en el nicho de la marca, qué tiene que pasar en el video y temas de ejemplo. Sloth las
enseña al crear un video y, si el usuario elige una, el mensaje trae la línea
`Serie: <nombre> (series/<archivo>.md)`.

- Lee ese archivo antes de investigar. Manda sobre lo general de esta skill en el tema y en lo que tiene que pasar; la
  forma, el mundo y la imagen siguen siendo de cada video (ver "Cada video es único").
- **Si el usuario no dio un tema**, elígelo tú con "El tema, si no te dieron uno" de la serie, sin preguntar.
  **Primero el banco** (menos en Noticias, que caducan): `python -B -X utf8 <skill>/scripts/banco.py ver <serie>`
  enseña las candidatas que otros videos ya buscaron, leyeron y comprobaron, y si alguna ya se hizo. Si una cumple lo
  que pide la serie y no se hizo, `banco.py tomar <serie> <enlace>`, vuelve a leer su hilo y comprueba lo que diga
  `comprobado` que falta. Si ninguna sirve, busca, compara y decide; todos los candidatos en una sola llamada (cargar
  los vectores tarda): `python -B -X utf8 <base>/scripts/huellas.py buscar <skill> "<tema 1>" "<tema 2>" "<tema 3>"
  --serie "<serie>"`. **Las que leíste y no usaste, al banco** con `banco.py guardar` (su enlace, votos, el momento en
  que se tuerce y qué comprobaste): son el próximo video. Al darle el guion, dile por qué esa y otras dos opciones.
- **Si dio un tema**, haz ese, con lo que pide la serie.

## Lo que el usuario pidió y no se negocia

- **Lo único de collage es el personaje**: el narrador de la marca es una imagen recortada como sticker con borde
  blanco (el que trae la skill: la foto de un salchicha negro y fuego con sudadera naranja, cadena de oro y puro). Nada de papel,
  stickers ni letra de meme en el resto (lo único escrito a mano es el cartel que sostiene el personaje). Con
  `personaje: ninguno`, el video va sin narrador.
- **Las imágenes nuevas se hacen con Codex** (`codex exec` con su herramienta `image_gen`), nunca con Gemini: poses del
  personaje, bocas abiertas, las caras o texturas del protagonista. Solo con ChatGPT conectado; cómo, en "Imágenes con
  Codex".
- **La voz la graba el usuario.** Tú escribes el guion y se lo das para leer; no hay voz sintética.
- **El cierre es el de la marca.** La última frase del guion, en todos los videos y de cualquier tema, es `cierre.frase`
  de la marca, tal cual; en la imagen, la tarjeta `Canal`, que ya lee su red, su nombre y su foto. Con red `ninguna`,
  el video termina en su propio remate, sin invitar a nada.
- **El video informa, no aconseja.** Si el tema es de dinero, nada de «compra» o «vende» (el de Berachain dice «yo no
  te digo que compres ni que vendas»).
- **La duración la pone lo que hay que contar**, no un número fijo: el tiempo justo para que se entienda, y ni un
  segundo que no se gane su lugar. Si el usuario quiere un video más largo, se amplía con más que contar (otro punto,
  más contexto, una comparación, lo que sigue), nunca estirando lo mismo ni hablando más lento. Cómo se calcula, en
  "La duración" de [`GUION.md`](GUION.md).
- **Ningún modelo 3D se hace dos veces.** Antes de modelar un objeto se busca en la biblioteca
  ([`modelos-3d`](../modelos-3d/SKILL.md)) y, si está, se usa o se mejora; lo nuevo se guarda ahí para los siguientes
  videos y se le dice al usuario qué se sumó.
- **Cada dato es verdadero**, de su fuente primaria, con fecha de corte. Si una fuente choca con otra, gana la
  primaria y se dice en `fuentes/investigacion.md`.
- El proyecto va en la carpeta de la línea `Carpeta: <nombre>` del mensaje, con ese nombre exacto y sin añadirle nada
  (`nuevo.py <nombre>`): el panel de Sloth la busca así. Sin esa línea, `explicado-<tema>`. Va en la carpeta donde
  Sloth te lanza (`trabajo/video-explicativo`), junto a `marca.json`; `nuevo.py` lo decide.

## La marca

`marca.json`, en la carpeta de la card (la de los proyectos), es lo que hace suyos los videos: el `nicho` del canal
(de qué habla), cómo `habla` (su país, de tú o de usted), el `personaje` que narra (`perro`, uno propio o `ninguno`) y
el `cierre` (a qué red invita, con qué nombre, qué frase dice y qué foto lleva la tarjeta). Se lee y se guarda con
`python -B -X utf8 <skill>/scripts/marca.py` (`ver`, `guardar '<json>'`, `aplicar <proyecto>`; el formato, en su
cabecera). Es la misma para todos los videos: se pregunta una vez.

Si `marca.py ver` dice `Falta:`, pregúntaselo al usuario en un solo mensaje, antes de investigar:

- **De qué habla su canal**, si falta `nicho`. `habla` no se pregunta: sale de cómo escribe.
- **A dónde invita el final** de cada video: su Telegram, WhatsApp, Instagram, TikTok, YouTube, X, una página o a
  ningún lado; con qué nombre de cuenta o canal; y, si quiere, una foto para la tarjeta (sin ella va la cara del
  personaje). La frase la propones tú con eso («Si quieres más así, sígueme en Instagram: @cocina.facil.») y se la
  enseñas para que la cambie si quiere.
- **Quién narra**, al final del mensaje, con el bloque de opciones: «El perro salchicha», «Uno nuevo» (desde su foto o
  una descripción: [`personaje/NUEVO.md`](personaje/NUEVO.md)) o «Ninguno».

Lo que conteste va con `marca.py guardar` (una foto adjunta, con su ruta: la copia a `marca/`). Si después pide
cambiar algo («que el cierre sea a Instagram»), `guardar` y `aplicar <proyecto>` en el video que está haciendo.

## Las reglas de la imagen

Las corrigió el usuario viendo ocho versiones del video de prueba, y valen para cualquier tema. Revisa cada escena
contra esta lista antes de enseñarla.

**Palabras**

1. **Pocas palabras en el centro**: un número o una o dos palabras. Lo que se dice ya va arriba; el centro enseña.
2. **Imágenes en vez de nombres**: el logo real (de un fondo, un exchange, una empresa), un ícono o un objeto 3D. Un
   nombre escrito en una píldora es lo que hay que cambiar.
3. **Nada de emojis**, tampoco en los subtítulos: íconos SVG de Phosphor (`Glifo`, `Icono`, `Icono3D`) o imágenes.
4. **Fuera las etiquetas de cambio en rojo** («−94 %», «+43 %» sueltos): el número ya lo dice.
5. **Para marcar texto, subrayado**, no círculos: los círculos a mano no cierran.
6. **«No se puede» = el botón parpadea y se queda rojo**, sin cruces ni bordes remarcados.

**El mundo**

7. **Un solo mundo 3D por video** y una sola toma: nada de paradas en fila ni de cortar de una tarjeta a otra.
8. **Un protagonista de principio a fin** (lo que el video explica: en Berachain, su moneda): cada idea es algo que le
   pasa. Cambia de estado (se voltea, se pone gris, se deshace, se enciende), no de objeto.
9. **Que nunca se quede quieto**: un plano nuevo cada 3 o 4 s que cambie de lado, de distancia o de altura; meterse al
   detalle, salir al conjunto, volver a sitios ya vistos, rápido en cada giro de la historia. Cómo, en "Que se mueva"
   de [`MUNDO.md`](MUNDO.md).
10. **Solo se mueve lo que se está diciendo, y se mueve de verdad.** Cada cosa entra a escena al decirse, hace algo (cae,
    se llena, viaja, se rompe) y sale al dejar de decirse; lo que se queda de fondo está gris, quieto y medio fundido
    con el fondo. Nada flota, gira ni fluye por su cuenta.
11. **Un color, un significado**, igual en todo el video (`SIGNIFICA` en `src/tema.ts`). Lo decorativo usa colores que
    no significan nada (`DECORATIVOS`).
12. **Un indicador** que cambia con la historia (en Berachain, el precio; en otro tema, su número: la población, la
    velocidad, los usuarios). Dónde va lo pide el lugar: pegado al protagonista, o en una pantalla, un marcador o un
    letrero del mundo.
13. **3D sencillo, reutilizado y variado**: un logo extruido, un ícono en 3D, el protagonista que se reusa, bloques de
    colores sin texto.

**Pruebas y flechas**

14. **Nada apunta a la nada**: una flecha o un cable aparece cuando su destino ya está en pantalla.
15. **Cada flecha se corrobora**: apunta justo a lo que debe y no tapa información. `Flecha` busca sus dos `Ancla` en
    pantalla; aun así, mira cada una en una foto del cuadro en que termina de dibujarse.
16. **El material de apoyo, de alta calidad**: si vale la pena enseñarlo, que se vea hecho con cuidado (el calendario
    de mesa con hojas que se arrancan, no un cuadro con un número).

## De qué está hecho

La plantilla trae el motor y un ejemplo; lo de cada video es poco. Cómo se arma, pieza por pieza:
[`MUNDO.md`](MUNDO.md).

| Archivo | Qué es | ¿De cada video? |
|---|---|---|
| `src/mundo/guion.ts` | Los tiempos (`T`, atados a la voz), los lugares (`L`), los planos de la cámara, lo que le pasa al protagonista y el indicador | Sí |
| `src/mundo/Escena3D.tsx` | Qué hay en el mundo y en qué ventanas de tiempo está | Sí |
| `src/escenas/*.tsx` | Lo 2D de cada capítulo, clavado en el mundo (pruebas, números, botones) y las poses del personaje | Sí |
| `src/tema.ts` | Los colores del video (`PALETA`: sus dos fondos y su luz), si el piso lleva cuadrícula (`REJILLA`) y qué significa cada color (`SIGNIFICA`) | Sí |
| `src/capitulos.ts` | Con qué fondo empieza y dónde cambia | Sí |
| `subtitulos.txt`, `terminos.txt` | El texto de arriba, frase por frase, y los nombres que el transcriptor tiene que reconocer | Sí |
| `src/mundo/camara.ts`, `Mundo.tsx`, `EnMundo.tsx` | El motor 3D: la cámara, la luz, el piso, lo 2D clavado en el mundo | No |
| `src/modelos/` | Los modelos 3D, copiados de la biblioteca ([`modelos-3d`](../modelos-3d/SKILL.md)) con `comun.tsx` (`EnEscena`, `conGris`) | Los nuevos, y se guardan en la biblioteca |
| `src/piezas/`, `src/escenas/comun.tsx` | Texto de arriba, perro, tarjetas, íconos, flechas, subrayado, el precio pegado, el post de Reddit, el cierre al canal | No |
| `public/perro/`, `src/datos/marca.json` | Las poses del personaje, con boca cerrada y abierta ([`personaje/POSES.md`](personaje/POSES.md); la carpeta se llama `perro` sea cual sea), y la red, el nombre y la foto del cierre: los pone `marca.py aplicar` | No |

## Pasos

Los tiempos de los pasos son de una computadora con NVIDIA. En otra tardan más, sobre todo la voz y el render: sus
scripts dicen al empezar cuánto tardarán aquí y luego cuánto falta. Lánzalos en segundo plano y dile al usuario esa cifra.

1. **Proyecto y marca.** `python <skill>/scripts/nuevo.py <nombre>`, **en segundo plano** (tarda un minuto y medio:
   deja el proyecto empaquetado, con la marca aplicada, y el modelo de vectores de `huellas.py` cargado), y a la vez
   `marca.py ver`. Si a la marca le falta algo, pregúntalo ya ("La marca") y, con la respuesta guardada, `marca.py
   aplicar <proyecto>` cuando `nuevo.py` haya terminado. Mientras, lee la serie y empieza a buscar. Todo lo que no dependa de otra cosa va junto, en el mismo mensaje o en el mismo
   comando (las búsquedas, las lecturas, los logos): cada ida y vuelta cuesta de 12 a 16 s, y en un video eran 50.
   Listo cuando la carpeta tiene `node_modules` y `public/perro/`, y `marca.py ver` dice `Completa.` Su `node_modules`
   es un enlace al que comparten todos los videos del estilo: no corras `npm install` en el video, cambiaría el de todos.
2. **Investigación.** En `fuentes/investigacion.md`, en corto y sin prosa ("Investigar" en [`GUION.md`](GUION.md)):
   la ficha, la historia con fechas y la tabla de cifras, cada una con su fuente y su marca (**[PRIMARIA]**,
   **[SECUNDARIA]**, **[DUDOSO]**, **[NO ENCONTRADO]**), con la fecha y hora del corte. Los datos
   crudos (una serie de precios, de población, de usuarios) se bajan de su fuente a `fuentes/datos/` y lo que usa el
   video a `src/datos/`.
   Cómo y dónde buscar: [`GUION.md`](GUION.md). Listo cuando cada cifra que pensabas decir tiene su fuente.
3. **Enfoque y guion.** Primero el enfoque y su huella, juntos en `fuentes/huella.json` ("El enfoque" de
   [`GUION.md`](GUION.md)), y `python -B -X utf8 <base>/scripts/huellas.py revisar <skill>`: si algo choca, cambia
   el enfoque y vuelve a revisar. Después el guion en `guion.md` (lo que el usuario lee en voz alta). **En cuanto esté,
   dáselo para grabar**. Antes, tú mismo (son segundos) corre `python -B -X utf8 <skill>/scripts/subtitulos.py` (parte
   `guion.md` en renglones y pone las cifras como se ven y como se dicen) y escribe los nombres del tema en
   `terminos.txt`, uno por renglón: con eso ya se puede alinear la voz en cuanto llegue. Y lanza en segundo plano:
   - un subagente con tu mismo modelo para marcar los subtítulos, con este encargo: «en `<proyecto>`, marca
     `subtitulos.txt` según "Los subtítulos" de `<skill>/GUION.md`: negritas, una caja por frase, íconos, las cifras
     o fechas que el script no juntó y los cortes feos; luego los logos con
     `<skill>/scripts/logos.py <nombre>[=x:<cuenta>|sitio:<dominio>]…` (mira `fuentes/logos/hoja.png`). No cambies
     las palabras ni toques nada más»;
   - y los subagentes de los modelos 3D que ya sepas que faltan (paso 5).
   Listo cuando `revisar` reservó la huella, cada frase se gana su lugar (quitarla dejaría algo sin entender), las
   cifras van en letra, cierra con `cierre.frase` de la marca (si su red no es `ninguna`) y le dijiste el enfoque y
   cuánto va a durar.
   **Al darle el guion no termines el turno**: dile que lo grabe y sigue con lo que no necesita los tiempos de la voz
   (el paso 5, y del 6 la plantilla, `tema.ts`, los capítulos y el mapa del mundo, `L`). Su voz te llega como mensaje
   mientras trabajas; en nuevo-9 el turno se cerró y el video estuvo parado un minuto esperándola.
4. **Su voz.** Llega en cualquier formato (el m4a del celular, mp3, ogg, opus, un video): pásala a
   `fuentes/voz/original.wav` con `ffmpeg -nostdin -v error -y -i <audio> -vn -c:a pcm_s16le -ar 48000
   fuentes/voz/original.wav` (si trae silencio largo al principio o al final, recórtalo en el mismo comando). Si
   Sloth ya la dejó ahí, sigue. Luego, **en segundo plano** mientras sigues con lo de arriba,
   `python -I -B -X utf8 scripts/alinear.py fuentes/voz/original.wav` (la nivela, la transcribe, rehace solo lo que
   Whisper se saltó o cambió, y empareja los subtítulos; ~75 s) y
   `python -I -B -X utf8 scripts/acelerar.py fuentes/voz/original.wav fuentes/voz/voz-lenta.json` (la acerca a 224
   palabras por minuto acortando pausas y con `atempo` 1.12, sin volver a transcribir). No esperes al subagente de
   los subtítulos: si termina después, `python -I -B -X utf8 scripts/alinear.py --frases` empareja sus marcas sin
   volver a transcribir, y otra vez `acelerar.py` con las mismas opciones (segundos los dos). Si `alinear.py` avisa
   con ⚠ que faltan palabras seguidas, no las busques en el audio: pregúntale al usuario en seguida (en nuevo-10 la
   voz generada se saltó una frase y se perdieron minutos buscándola). Listo cuando
   `src/datos/voz.json` trae cada palabra del guion y cada frase de `subtitulos.txt` encontró su lugar.
5. **Material.** Los logos reales, si falta alguno, con `logos.py` (todos en una llamada; Reddit ya viene en la
   plantilla y los logos de las redes del cierre los dibuja su tarjeta). Los objetos 3D que pide el guion, de la biblioteca: `modelos.py buscar` con varias palabras
   por cada uno, mira su vista y `usar` (la skill [`modelos-3d`](../modelos-3d/SKILL.md)). **Lo que no esté o haya
   que mejorar lo hacen subagentes, uno por modelo y todos a la vez, en segundo plano**, mientras tú sigues con el
   paso 6: hacer un modelo es probar y mirar su vista muchas veces, y en fila se comía doce minutos. Cada uno con tu
   mismo modelo (o el de la línea `Subagentes:` si el mensaje la trae) y este encargo: qué es y qué representa en el
   video, qué tiene que poder hacer y con qué props (`abre`, `lleno`, `gris`…), cuánto mide y dónde va su origen, y
   «sigue la skill modelos-3d (4 y 5): escríbelo en `src/modelos/<id>.tsx` de `<proyecto>`. **Primero, en unos 10
   minutos, una versión que compile con todas sus props, aunque sea sencilla**: el video se arma con ella mientras
   tanto. Luego afínala, guárdala con `modelos.py guardar` y mira su vista hasta que se entienda; no cambies sus props
   ni su tamaño, no toques nada más del proyecto y devuélveme su import, sus props y lo que no quedó bien». Tú
   escribes la escena contra esas props desde el principio y compilas con la primera versión, sin esperar la final.
   Un lugar entero (un hotel, una calle, una oficina) no es un modelo: se reparte en piezas, un subagente cada una (la
   fachada, el pasillo, la puerta), porque uno solo con todo fue el más lento (el hotel tardó 28 minutos).
   El protagonista, en 3D (ver "El protagonista" en [`MUNDO.md`](MUNDO.md)): si es una moneda, una medalla
   o un sello, sus dos caras con Codex (`texturas/pedido-moneda.txt` y `pedido-otra-cara.txt`) a
   `public/img/moneda_frente.png` y `moneda_atras.png`, que se le pasan a `Moneda` (mientras, lleva unas lisas; sin
   ChatGPT, en su cara va el logo real del tema). Las poses del personaje que falten, con Codex ("Poses nuevas"); sin
   ChatGPT, la más parecida de las que tiene. Listo cuando cada cosa que nombra el guion tiene su imagen o su modelo y
   los miraste.
6. **El mundo.** Arma `guion.ts`, `Escena3D.tsx`, los capítulos 2D y las poses según [`MUNDO.md`](MUNDO.md). Corre
   `npx tsc --noEmit -p .`, con la primera versión de cada modelo de los subagentes. Cuando llegue la final, compila y
   mírala en su lugar. Listo cuando compila, cada cosa entra en la palabra que la nombra y lo nuevo está guardado.
7. **Encuadre.** Las tomas van en `TOMAS` de `src/mundo/guion.ts` (qué tiene que verse en cada una y desde dónde) y
   `encuadra.ts` saca de ellas los planos, con la cámara más cercana que deja los objetos y las tarjetas entre el texto
   de arriba y el personaje: no copies cámaras a mano. `npm run encuadre -- --revisa` (vuelve a empaquetar cada vez) dice
   qué se sale y mide el ritmo de la cámara. Listo cuando la línea `ritmo` va toda en ✓ y no queda un ✗ grande; el video entero se mira en
   el borrador, no en fotos.
8. **Revisión, con un borrador.** El borrador es la primera vez que se ve el video entero, sin fotos antes (cuestan lo
   mismo y no miden nada), a media resolución y en dos mitades: `python -B <skill>/scripts/final.py --borrador 1`
   (~45 s) deja la hoja de la primera, un cuadro cada 2 s, en `revision/borrador-1.png`; lanza en seguida
   `final.py --borrador 2` en segundo plano y, mientras, mira la hoja 1 y anota sus arreglos (hazlos cuando termine:
   antes se colarían a medias en la segunda mitad). El 2 junta las mitades, mide el ritmo, deja `-2.png` y arma
   `revision/parecidos.jpg` con la pregunta para un subagente. Lánzalo en cuanto salga, sin el enfoque (juzga lo que
   ve, no lo que querías hacer), y mira las hojas enteras: cada momento cuando ya terminó de entrar, cada
   flecha cuando termina de dibujarse, nada tapado, cortado ni asomando antes de tiempo. Si el subagente dice que se
   parece, cambia lo que nombra (los colores, el lugar, los objetos, dónde está el protagonista, el primer cuadro).
   **Todos los arreglos de una vez, y los de ritmo con margen** (un 10 % mejor que el mínimo: nuevo-4 quedó en 2.47
   contra 2.5 y costó dos borradores más). Lo que arregles, compruébalo con `fotos.mjs` en esos segundos (8 como
   mucho); otro borrador solo si cambiaste planos, tiempos o lo que dijo el subagente. Listo cuando el borrador sale
   sin ✘, el subagente contestó que no se parece, cada celda cumple "Las reglas de la imagen" y nada queda tapado o
   cortado. **Hasta entonces no hay render final**: en el de Celsius se renderizó tres veces por cosas que se veían
   en el borrador.
   Mientras se renderiza el primer borrador, si es de una serie (menos Noticias) y su banco tiene menos de tres
   libres, lanza en segundo plano un subagente con tu mismo modelo: «llena el banco de `<serie>`: sigue "El tema, si
   no te dieron uno" de `<skill>/series/<serie>.md`, busca y lee historias que no estén ya en el banco ni hechas
   (`<skill>/scripts/banco.py ver <serie>` y `huellas.py buscar`), comprueba lo que se pueda y guarda tres con
   `banco.py guardar`; no toques ningún proyecto». Esos minutos de render son de espera: así el siguiente video no
   empieza a buscar de cero.
9. **Final.** Si algún subagente de modelos sigue afinando, pídele que entregue ya (`SendMessage`) y espera su versión
   antes del final: en nuevo-11 se renderizó, llegó la versión buena y hubo que renderizar otra vez (7 min).
   `python -B <skill>/scripts/final.py` (~2 min): renderiza una sola vez, directo a H.264 bt709, pasa
   `comprobar.mjs`, mide el ritmo y guarda la huella con su hoja. Si algo sale con ✘, arréglalo antes de entregar.
   Deja `out/<carpeta>.mp4`. Antes de entregar, su portada como primer cuadro ([`PORTADA.md`](../video-base/PORTADA.md)
   de la base, que dice también qué hacer sin ChatGPT): el mundo 3D del video y abajo el personaje (si la marca tiene),
   recortado como sticker con borde blanco, con la cara que dice el título (pásale su pose de referencia con otro
   `-i`), y el título en la letra sans redonda del texto de arriba, blanco con la palabra clave resaltada. Entrega la ruta, los modelos que sumaste a la biblioteca y lo que no
   revisaste: el audio no lo oyes, solo lo transcribes. No le propongas al usuario cambios a la skill al entregar.

## Imágenes con Codex

Codex usa la cuenta de ChatGPT del usuario. Antes de la primera imagen de cada video, `codex login status` (sale 0 si
hay sesión). Sin sesión no se genera ninguna: se usa lo que ya hay (las poses que tiene el personaje, el logo real en
vez de una textura) y se le dice al usuario una vez, en una frase llana, qué quedó sin hacer y que conectando ChatGPT
en Sloth (Opciones → Codex) sale completo.

Siempre Codex, con su `image_gen` (no dibuja con código ni con Gemini). El pedido va en un `.txt`, en inglés, y dice
qué archivo dejar:

```
codex exec --skip-git-repo-check -s workspace-write -C <carpeta> -i <referencia.png> - < pedido.txt
```

El pedido empieza con «Use your built-in image_gen tool (do not draw with code). Generate one image with image_gen,
then copy the PNG from $CODEX_HOME/generated_images/... into this working directory as <nombre>.png. Reply only with
the file name.» y sigue con la imagen. `-i` le pasa una referencia (la pose del personaje, la otra cara de la moneda) para
que salga igual. Tarda 30–85 s y se pueden lanzar varios a la vez. Si no copió el archivo, se vuelve a pedir. Pedidos
que funcionaron: `texturas/` del proyecto (las caras de una moneda o medalla), `personaje/pedidos/` (las poses y la
boca) y `ejemplos/berachain/texturas/`.

## Poses nuevas

El perro tiene 19 poses; uno propio, las que se le hicieron ([`personaje/POSES.md`](personaje/POSES.md)): elige la que
dice lo mismo que la frase. Si el guion pide una que no está (sostener algo nuevo, otro gesto) y hay ChatGPT:

1. Codex la hace con la foto base del personaje de referencia (el perro: `<skill>/personaje/perro.png`; uno propio:
   `personajes/<id>/base.png`) y `personaje/pedidos/pose.txt` (la misma foto, el mismo personaje, solo cambia la pose)
   a `perro/pose_<nombre>.png` del proyecto.
2. Codex le abre la boca (`personaje/pedidos/boca.txt`) a `perro/bocas/boca_<nombre>.png`, y
   `python -B scripts/bocas.py <nombre>` pega solo la boca sobre la pose, para que al hablar no tiemble.
3. `python -B scripts/perro.py` la recorta como sticker (cerrada y abierta con la misma silueta) y la suma a
   `src/datos/personaje.json`. Si sostiene algo, mide su `ancla` (dónde va lo que enseña).

Si sirve para otros videos, súmala a la biblioteca de su personaje ("Una pose nueva" en `POSES.md`).
