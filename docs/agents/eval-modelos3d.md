# Eval de «Modelos 3D»

La biblioteca de modelos 3D (`web/src/Modelos3D.tsx`) contra Sketchfab, Poly Pizza, Poly Haven y Fab. La tarea es la
de quien la usa: ver qué hay, encontrar un modelo, mirarlo por todos lados y llevárselo a un video. Cada categoría
tiene una medida que se puede repetir, y se puntúa así (como en `eval-voz.md`):

- **10**: Sloth es mejor que las cuatro en esa medida.
- **8, 6, 4 o 2**: es mejor que tres, dos, una o ninguna.
- **1**: no lo tiene.

## Cómo se midió

- **Los dos scripts** usan el navegador, la ventana (1280×800) y el cálculo de legibilidad de `scripts/eval-voz-comun.mjs`:
  - **Sloth**: `node scripts/eval-modelos3d.mjs <puerto> --compilada`, sobre la copia del repo que corre, con la
    biblioteca llena (aquí, una copia de los 103 modelos de la Sloth instalada en `skills/modelos-3d/modelos`, que no
    entra al repo, con su `vuelta.webm` sacada). Guarda las capturas `data/navegador-capturas/m3d-*.png`. Con
    `--compilada`, la página nueva se mide con la interfaz armada como la de la app instalada
    (`scripts/eval-compilada.mjs`); sin él, con Vite en desarrollo, que pide cada módulo por separado.
  - **Las otras**: `node scripts/eval-modelos3d-ajenas.mjs sketchfab|polypizza|polyhaven|fab`, en sus páginas públicas
    y sin cuenta; aparte, `--solo escritura` (la búsqueda escrita como la gente) y `--solo navegar` (llegar a sus
    modelos desde su inicio). Donde piden entrar, eso es lo medido: hasta dónde llega sin cuenta.
- **Tiempos**: con la página quieta, desde que el ratón aprieta (un clic de persona: aprieta, 100 ms, suelta), entra
  o se pulsa la tecla, hasta el cuadro siguiente a que el resultado está pintado: la imagen cargada o el primer cuadro
  del video ya en pantalla, no solo su elemento.
- **Filtrar y pasar de modelo**: en tiempo KLM (Keystroke-Level Model), con el mismo paso mental (M, 1,35 s) para
  todos: una tecla es M + 0,28 s; apuntar y hacer clic, M + 1,3 s.
- **Legibilidad**: la razón WCAG del texto visible más bajo y su letra más chica, en la rejilla y en la ficha (la peor
  de las dos). No cuenta el texto encima de una foto o un video.
- **Las reglas de Sloth**, que no puntúan pero el eval comprueba: nada se sale de lado a 1280, 1024 y 390 px; ninguna
  cápsula (algo con borde o fondo y el radio de la mitad de su alto); ningún carácter haciendo de ícono (✕, ‹, ›…); y a
  390 px la ficha deja ver el modelo entero, cerrar y copiar. Y que no vuelva lo que la revisión encontró roto
  (`regresiones`): con la ficha abierta lo tecleado no va al buscador de atrás, con otra ventana abierta los números no
  filtran, la tecla C copia, tras pasar de modelo con → el siguiente se sigue girando, al pasar rápido de un modelo a
  otro el visor acaba en el último, Tab y Mayús+Tab desde el visor siguen en la ficha, y a 390 px el visor sale (cambiar
  de ancho no lo vuelve a cargar) sin tapar cerrar.
- **Corridas**: 11 de noviembre de 2026. Sloth, 20 o más del eval completo (las últimas 9 con todo en la interfaz
  compilada); cada una de las otras, 2 completas y una de cada medida aparte. Las revisiones independientes volvieron a
  correr los scripts (abajo). La computadora tenía otros
  hilos midiendo a la vez: los tiempos van en rangos.

## Resultados

| Categoría (medida) | Sketchfab | Poly Pizza | Poly Haven | Fab | Sloth antes | **Sloth** | |
|---|---|---|---|---|---|---|---|
| **1. Verlo moverse** (ms de que el puntero entra a un resultado a que el modelo se mueve en la rejilla) | 1.244–2.828, barriendo la tarjeta con el puntero; quieto no se mueve, y en la mitad no giró nunca | no se mueve | no se mueve | no se mueve | 252–318 | **134–246** (una de 326 con otros hilos midiendo) | 10 |
| **2. Girarlo a mano** (desde la rejilla: ms de que aprieta un resultado a que su modelo sigue un arrastre, y qué alcanza) | 1 clic, 982–5.574; su visor: todos los ejes, acercar y mover | 1 clic, 553–1.494; su visor, igual | 2 clics, 2.103–9.563, y a veces no sale el visor | 3 clics, 2.456–3.491, y solo si trae visor | no se podía | **1 clic, 143–192**, y su **visor 3D: todos los ejes, acercar la geometría y moverlo**, como las otras. El visor de un modelo que se ve en la rejilla o que tocó el ratón ya está preparado: sale en 64–94 ms en el eval y en 67–220 al abrir uno tras otro (también al volver a él tras desplazar la rejilla: 82 ms); uno que no estaba a la vista ni preparado, de 0,1 a 1,6 s según el modelo, y mientras tanto gira la vuelta en video. Responde al arrastre en 7–13 ms | 10 |
| **3. Encontrar en español** (de 14 búsquedas, en cuántas el primer resultado es el buscado: alcancía, camión, palmera, pulmones, reloj, maleta y 8 como las escribe la gente: camiones, palmeras, alcancia, pulmon, relojes, maletas, cajafuerte, pulmnes) | 11 (los 14 están entre sus 8 primeros) | 10 | 4 | 6 | 4 de las 6 palabras; de las 8 escritas, solo 2 salían en algún lugar | **14** | 10 |
| **4. Filtrar por tipo** (tiempo KLM) | 2 clics, 5,3 s | 2 clics, 5,3 s | 1 clic, 2,65 s | 2 clics, 5,3 s | 1 clic, 2,65 s | **1 tecla, 1,63 s** (1 son todos; 2, 3… cada tipo, en el orden de la barra; dicho en la cabeza de la sección); o 1 clic, como Poly Haven | 10 |
| **5. Abrir la ficha** (ms de que aprieta un resultado a ver pintado su modelo) | 2.569–16.931 hasta ver el modelo; su ventana sale en 127–154, con una miniatura borrosa | 419–1.158 | 291–1.453 | 525–1.309 | 131–199, hasta la ventana | **51–136**, hasta el primer cuadro de su giro (nítido) o su visor 3D, lo primero: abre al apretar, no al soltar | 10 |
| **6. Pasar al siguiente** (tiempo KLM desde una ficha) | 1 clic, 2,65 s; la tecla → no hace nada | volver y clic, 5,3 s | 5,3 s | 5,3 s | 1 tecla | **1 tecla (→), 1,63 s**; o 1 clic | 10 |
| **7. Usarlo** (entradas desde la rejilla hasta tenerlo para el video) | pide entrar en el paso 2 | 3, y Cloudflare para al navegador antes de bajar | 2, baja un .blend.zip | 7 (licencia, casilla, aceptar…) | 1 | **1**: copiar su nombre (o la tecla C), que es lo que se le pide al agente | 10 |
| **8. Teclado** (teclas desde el buscador, con resultados, hasta abrir el primero) | 9 | 32 | 4 | 19 | 16 (Tab ×15 y Enter) | **1** (Enter); ↓ baja a la rejilla y las flechas se mueven por ella | 10 |
| **9. Rapidez** (ms desde dentro: un clic de persona en el enlace a sus modelos, en su inicio, hasta ver la primera miniatura; en Sloth, en «Modelos 3D» de la barra) | 375–644 | 163–344, y esa miniatura queda fuera de la primera pantalla | 236–333 (1.531–2.260 la primera vez), también fuera de la primera pantalla | 2.014–2.249 | 126–609 (y sin clic de persona, con Vite) | **117–152 con la máquina libre** (120–229 con otros hilos midiendo a la vez), con la interfaz compilada | 10 |
| **10. Legibilidad** (contraste mínimo; letra más chica) | 2,85; 12 px | 3,34; 14 px | sin texto fuera de las fotos (la página: 1,77; 11,2 px) | 7,8; 12 px | 5,79; 11 px | **8,45; 14,5 px** | 10 |

**Rapidez con una página nueva**, que no puntúa porque Sloth es una app que ya está abierta: con su página en caché,
Sketchfab pinta su primera miniatura en 105–352, Poly Haven en 269–548, Poly Pizza en 449–535 y Fab en 2.346–3.078;
Sloth, con la interfaz compilada, en 150–280 (395–444 la primera). Ahí **Sketchfab es más rápida**: a Sloth le
falta arrancar la app entera (unos 80 ms de código y 85 de su primer render), no esta sección, cuya lista ya llega en
5 ms. Sin caché, Sloth es la más rápida, pero eso compara la computadora con internet. Y la ventaja de 9 sobre Poly
Pizza es corta (117–152 contra 163–258 en la corrida más rápida de Poly Pizza), aunque a Poly Pizza y a Poly Haven se
les cuenta una miniatura que no está a la vista.

**Fluidez**, que tampoco puntúa: al bajar 3000 px, 0 cuadros de más de 50 ms y el peor de 8–14 ms (Sketchfab, 0–2 y
28–90; las otras, de 0 a 5). Con el visor preparando modelos de fondo hubo una corrida con 4 cuadros lentos (el peor,
174 ms): ahora, mientras se desplaza la rejilla, el visor no prepara nada (`pausa`), y volvió a 0 y 7–8 ms.

**El visor 3D** es el modelo de verdad: su `Muestra`, con el mismo código de los videos (también los 21 modelos de
materiales propios, como el holograma de la carta o el vidrio), en una escena de three.js con la luz de la vitrina y una
cámara que se gira en todos los ejes, se acerca a la geometría y se mueve (`skills/modelos-3d/visor.tsx`). Se arma para
toda la biblioteca con esbuild (`modelos.py visor`, unos 5 s; un trozo por modelo y lo común una vez: 3,8 MB los 103), y
Sloth lo arma solo si le falta un modelo, así que una biblioteca guardada antes lo tiene al abrir la sección (si ya están
los módulos de los videos: armarlo no los baja). Hay uno solo mientras la sección está abierta (`web/src/Visor3D.tsx`):
un iframe de la otra dirección de la computadora (`127.0.0.1`), en su propio proceso, que no se vuelve a cargar (solo si
se vuelve a armar, y entonces se le pide otra vez lo último); se le dice qué modelo enseñar. Tiene montados, escondidos, hasta 16 modelos: el que se enseña, los carteles que se ven en la
rejilla tras 1,2 s quieta (siempre lo que se ve ahora: lo de pantallas de antes deja la cola) y el que el ratón tocó
350 ms; si sobran, se quita el que hace más que no se usa, y si vuelve a verse, se prepara otra vez. Con todo quieto (nadie arrastra ni desplaza la rejilla) los
prepara de uno en uno: compila sus materiales en paralelo, sube sus texturas y los dibuja una vez, escondidos, en el
mismo lienzo (así se compilan también las variantes de sombra, que solo salen al dibujar). Enseñar uno de esos es solo
encuadrarlo. Dibuja solo cuando algo cambia: quieto no gasta.
Al llegar, se le pide desde el ángulo en que va el giro y con el encuadre de la foto, y entonces se pone encima: no salta.
Mientras tanto (y si se arrastra en cuanto abre), la vuelta en video (`vuelta.webm`: 36 ángulos a 4 alturas) ya gira.

**Encontrar, con su sesgo**: las 6 palabras de base son de cosas que la biblioteca tiene, y lo que no tiene casi siempre
da cero resultados (en las otras, millones de modelos casi siempre traen algo); no siempre: una palabra a una letra de
otra que sí está se toma por error de dedo («barco» trae lo que tiene «marco»). Lo que mide es si encuentra lo que hay,
escrito como lo escribe la gente. Las 8 escritas y las de las dos primeras revisiones quedaron como pruebas de
`buscar3d.test.ts`, así que no sirven para medirla otra vez: la tercera revisión inventó 56 búsquedas nuevas (sinónimos,
plurales, errores de dedo, con artículos, de dos palabras) y el primer resultado acertó en 55. Falló «iglesia» (la
veladora y la catedral tienen esa etiqueta y empatan; gana la que va primero por tipo).

**Filtrar, con su atajo**: la primera vez, quien no conoce el atajo hace 1 clic, igual que en Poly Haven. Por eso el
atajo está escrito en la cabeza de la sección («Con el teclado, / busca y del 1 al 8 se elige el tipo»), no solo al
pasar el ratón.

**Lo que el eval no mide**, a propósito: importar un .glb (Sketchfab, Poly Pizza y Fab piden cuenta para subir; Sloth lo
hace sin agente, `Modelos3DAcciones.tsx`), borrar, renombrar o cambiar de tipo un modelo (en Sloth se le pide al
agente), y los polígonos, formatos y licencias, que en Sloth no aplican: cada modelo es código de React Three Fiber.
Y «usarlo» compara cosas distintas: en Sloth no hay archivo que bajar, hay un nombre que pedir. Tampoco se midió
cuánto más tarda guardar o importar un modelo ahora que también saca su vuelta (144 cuadros más): sacar las vistas de
los 103 llevó unos 17 s por modelo.

## Lo que el eval y sus revisiones encontraron, y se arregló

- **Teclado**: del buscador a la ficha eran 16 teclas. Ahora Enter abre el primero, ↓ baja a la rejilla, las flechas se
  mueven por ella y por las pestañas, y al cerrar la ficha el foco vuelve al cartel del último modelo visto (si ya no
  está a la vista, al buscador). La ficha toma el foco al abrir y Tab no sale de ella.
- **La búsqueda** no encontraba plurales, palabras juntas ni una letra de error, y ordenaba por tipo. La primera
  versión de `buscar3d.ts` sí, pero la revisión halló que contaba pedazos de en medio de una palabra («oro» daba La
  Llorona, «redes» el «cofre del» tesoro, «tres» el letrero) y que la letra de error empataba con palabras de verdad
  («coche» daba Canal de noche). Ahora cuenta la palabra o su principio, el plural solo si quedan 4 letras, y la letra de
  error solo si la palabra no está bien escrita en ningún modelo. Pesan el nombre, luego el resumen, las etiquetas, lo
  que hace y la descripción, y los demás campos donde también está desempatan («computadora» da la laptop antes que el
  perezoso que usa una).
- **No se podía girar**; luego, solo 48°; luego, la vuelta entera a una sola altura (la segunda revisión: los visores
  giran en dos ejes); luego, 4 alturas en video (la tercera: sigue sin ser un visor). Ahora la ficha tiene un visor 3D de
  verdad (arriba); la vuelta en video queda para el primer momento, mientras el visor carga: de lado da la vuelta sin tope, de arriba abajo pasa por 4 alturas, también con Mayús y las
  flechas, y la rueda acerca hacia donde está el ratón (en el tope deja desplazar la ficha, y en angosto, donde la ficha
  se desplaza, acerca solo con Ctrl). Un clic sin arrastrar no lo detiene, y un arrastre antes de que cargue el video
  ya no se pierde. Sola, la vuelta giraba a saltos de 10° (la tercera revisión): ahora, quieta, la ficha enseña el giro
  suave de la rejilla, y al arrastrar pasa a la vuelta en el ángulo en que iba. Con el dedo, en ancho los dos ejes son
  del modelo; en angosto, de arriba abajo desplaza la ficha. La revisión encontró que tras un arrastre y → el modelo siguiente ya no giraba (el salto en curso se quedaba
  marcado): ahora el modelo de la ficha es su propio componente con la `key` del modelo y empieza de cero.
- **Verlo moverse tardaba 252–318 ms.** Primero el video se creaba al entrar, pero la revisión vio que barrer la rejilla
  bajaba 1,6 MB de giros que nadie miraba: ahora se crea a los 100 ms de quedarse, y su aparición dura 120 ms y no 200.
- **Abrir la ficha** esperaba a soltar el botón; ahora abre al apretar, como los menús del sistema (copiar no la abre),
  y no se cierra si sueltas fuera una selección de texto.
- **La lista tardaba unos 140 ms** en cada pedido (103 fichas leídas y 206 fechas de archivo). El servidor la guarda
  armada y la vuelve a armar cuando algo cambia en la biblioteca (`server/modelos3d.ts`, con su prueba). Si Sloth abre
  en esta sección, la lista se pide al cargar el código, y se arman primero los carteles que caben.
- **Legibilidad**: letra de 11 px y texto secundario en `--muted`. Ahora nada baja de 14,5 px (Poly Pizza llega a 14) y
  lo secundario es `--suave` (`--muted` mezclado con `--text`).
- **Cápsulas**: había unas 130. Ahora los tipos son pestañas de texto, el orden es texto con su icono (como el de
  Comunidad), el tipo del cartel es texto, las etiquetas son texto corrido y nada pasa de 12 px de radio.
- **Iconos de texto**: ✕, ‹ y › eran caracteres; ahora son de trazo (`Iconos.tsx`: copiar, ordenar, anterior,
  siguiente, girar).
- **La ficha cortaba «Copiar»** en una ventana de 800 px de alto. Ahora la columna se desplaza y cómo usarlo queda
  fijo al pie. Las flechas para pasar de modelo se ven siempre.
- **En angosto** (390 px) la ficha aplastaba el modelo y ponía el texto encima, las pestañas ocupaban cuatro filas y
  los botones partían su texto. Ahora el modelo va arriba, entero (y se desplaza de arriba abajo aunque se gire de
  lado), cerrar queda fijo en la esquina y las pestañas se desplazan de lado.
- **El visor 3D** (cuarta revisión): dibujaba sin parar con la ficha abierta (unos 0,64 núcleos quieto) y giraba solo sin
  fin; ahora dibuja solo cuando algo cambia y no gira solo. Abrirlo en cada ficha tardaba de 1 a 3 s: ahora es uno solo
  que cambia de modelo. Escondido detrás de la página, el navegador lo frenaba (un marco de otro sitio tapado no dibuja):
  ahora queda encima, transparente y sin recibir clics. Saltaba unos 30° al aparecer, y al pedirle el mismo modelo desde
  otro ángulo no lo giraba: ahora se reencuadra. Armar el visor podía bajar los módulos de los videos (~1 GB) sin avisar,
  y dos armados a la vez se pisaban: ahora no los baja y cada uno arma en su carpeta. Pedir una carpeta del visor tumbaba
  el servidor (`servir` la leía como archivo): ahora da 404, también en `servir` para todos. En angosto la rueda
  desplazaba la ficha el doble y el dedo de arriba abajo giraba el modelo en vez de desplazar: arreglado. Las teclas
  desde dentro del visor ya no actúan con un aviso de la app encima, y Mayús con las flechas lo gira también con el foco
  dentro.
- **El visor 3D** (quinta revisión): a 390 px tapaba el botón de cerrar (ahora le deja un hueco, como a las flechas, y el
  eval aprieta ese botón donde está); pasar rápido de modelo podía dejar el visor en el de antes (ahora compara con el
  último pedido, y el eval lo prueba con `cambioRapido`); el cofre salía con una mancha rosa un cuadro (ahora se va a
  su cuadro antes de enseñarlo); y la ficha entraba deslizándose, así que el visor se ponía encima un cuadro antes que
  ella: ahora solo aparece. Armar el visor dejaba carpetas viejas; ahora las borra, y no baja módulos si falta solo una
  parte.
- **La sexta revisión** (después de lo de arriba): cruzar los 860 px volvía a cargar el visor (su dirección llevaba el
  ancho) y la ficha siguiente se quedaba en video, así que el eval apretaba cerrar a 390 px con el visor escondido; ahora
  el ancho se le dice aparte, y el eval comprueba que sale (`visorALaVista`). Cada vez que el visor contestaba, la
  rejilla le pedía una pausa y volvía a dibujar sus 103 carteles: ahora lo que se le pide no cambia. Con el foco en el
  visor, Mayús+Tab salía a la rejilla de atrás (la tecla no llega a su página): ahora dos bordes alrededor lo devuelven
  a la ficha, y el iframe no entra en el orden de Tab. Las texturas de los modelos quitados no se soltaban (al quitarlo
  ya no tiene hijos): ahora se apuntan al prepararlo. Lo quitado no se volvía a preparar al volver a verse: ahora sí
  (arriba). Y un armado del visor que falla ya no deja su carpeta, uno colgado se termina a los 5 minutos, y en angosto
  la pista ya no dice que la rueda acerca ni se corta.
- **Los archivos que el servidor manda se quedaban abiertos** si el navegador cortaba a medias (al saltar en un video, o
  al cambiar de modelo): `servir` usaba `.pipe`, que no cierra el archivo si se corta, y en Windows la carpeta ya no
  se dejaba renombrar; así se descubrió, porque el visor ya no se podía volver a armar con el servidor encendido. Ahora
  usa `pipeline` (también en `estaticos.ts` y los adjuntos), con su prueba (`server/servir.test.ts`).
- **Abrir un modelo que no se había abierto** tardaba de 0,3 a 1,6 s en el visor: compilar sus sombras, armar los
  lienzos de su código y subir sus texturas. Ahora eso se hace de fondo con los que se ven (arriba), y abrir uno de ellos
  es encuadrarlo.
- **Los números filtraban detrás de «Nuevo modelo»**; ahora no, con ninguna ventana a la vista. La tercera revisión halló
  que el aviso «el estilo cambió» no contaba como ventana (es `position: fixed` y se miraba `offsetParent`): ahora se
  mira si ocupa lugar en pantalla, y el eval lo comprueba con un aviso así. Tampoco la ficha hace caso al teclado con un
  aviso encima, ni a Alt con las flechas.
- **El foco se perdía** al pasar de modelo con las flechas de la escena, al tocar una etiqueta o el tipo, y al filtrar
  con el número cuando el cartel con foco se iba: ahora vuelve a la ficha, al buscador, a la pestaña o al primer cartel.
- **«Necesita» hacia un modelo de la plantilla** (`icono-3d`) cerraba la ficha: ahora va de nombre, sin enlace.
- **La búsqueda, con palabras nuevas** (las de la segunda revisión, que no se usaron al afinarla): «el dinosaurio» y «una
  tortuga» no daban nada (ahora los artículos no cuentan), «trex» tampoco (ahora junta desde 4 letras) y «engrane» daba
  la puerta de bóveda (ahora las de la misma familia cuentan, con poco peso).
- **El nombre para copiar no se alcanzaba con el teclado**: ahora es la tecla C sobre el cartel, o «Copiar» en la ficha.
- **En los scripts**: abrir la ficha se contaba al aparecer el elemento, no su primer cuadro; girar se medía tras 800
  ms de espera con el video ya cargado; el KLM ponía el paso mental solo a la tecla; «cajafuerte» aceptaba «bóveda» solo
  en Sloth; la rapidez comparaba un cambio de sección contra una página nueva; un clic del eval para quitar el foco
  caía en «Importar .glb»; y el servidor de la interfaz compilada no pasaba Host y Origin a la copia (403).

## Lo que no se pudo medir

- **Lo que hay detrás de entrar** en Sketchfab y Fab (descargar en Sketchfab pide cuenta) y la descarga de Poly Pizza
  (Cloudflare Turnstile no deja al navegador automatizado): se cuentan sus entradas hasta ahí.
- **La legibilidad de Poly Haven**: su rejilla no tiene texto fuera de las fotos (el título sale encima, al pasar el
  ratón), y el cálculo no cuenta texto sobre imágenes.
- **La resolución de los tiempos de las otras**: «moverse» depende de una captura (40–80 ms) y «girar» prueba un
  arrastre cada 0,6 s: son topes de arriba. Aun con 600 ms menos, ninguna llega a la de Sloth.
