# Técnicas

Catálogo de las técnicas ya probadas en los ejemplos: qué logra cada una, cómo y dónde está. Para decidir qué
construir según el tema (estilo, protagonista, mecánica, extras), lee antes [disenar.md](disenar.md). Abreviaturas:

- **carroza**: `ejemplos/carroza-encantada/index.html`.
- **bosque**: `ejemplos/bosque-encantado/index.html`.
- **halloween**: `ejemplos/halloween/index.html`.
- **plantilla**: `plantilla/index.html`.

Busca cada sección por su encabezado (`// ---------- …`) o por el nombre de la función. Toma de la carroza la técnica que
necesites y adáptala. No la copies entera a ciegas: cada pieza depende de sus uniforms y de `update()`.

1. [Esqueleto](#1-esqueleto)
2. [Coreografía](#2-coreografía)
3. [Escenario por capas](#3-escenario-por-capas)
4. [El héroe que se transforma](#4-el-héroe-que-se-transforma)
5. [Cristal](#5-cristal)
6. [Oro dibujado con luz](#6-oro-dibujado-con-luz)
7. [Detalle sobre una superficie](#7-detalle-sobre-una-superficie)
8. [Partículas](#8-partículas)
9. [Destello y magia en el suelo](#9-destello-y-magia-en-el-suelo)
10. [Título y textos](#10-título-y-textos)
11. [Ambiente vivo](#11-ambiente-vivo)
12. [Sobres, sellos y criaturas](#12-sobres-sellos-y-criaturas)

## 1. Esqueleto

- **Un solo HTML.** Three.js 0.170 por CDN (`importmap`). Nada que compilar; se abre con cualquier servidor estático.
- **Cuadro 9:16 en `cqh`.** `#frame` tiene `aspect-ratio: 9/16` y `container-type: size`. Todo el texto se mide en `cqh`
  (alto del cuadro), así se ve idéntico en cualquier teléfono y en la PC.
- **Dos relojes.** `update(S, A)` es una función pura del tiempo:
  - `S` son los segundos de la secuencia;
  - `A` es el reloj ambiente, que nunca se detiene.
  - Antes del toque, `S` se queda en 0.95. El toque fija `playStart = now - TAP*1000`.
  - Todo lo que debe seguir vivo al terminar se mueve con `A`.
- **Determinista.** Como `update` solo depende de `(S, A)`, cualquier instante se reproduce exacto. De eso viven las
  herramientas:
  - `?t=3.2` congela ese instante;
  - `?auto` arranca sin toque;
  - `?cam=side` da la vista lateral;
  - `?hide=a,b` oculta piezas;
  - `?fixed` apaga la calidad adaptable;
  - `window.__setT(t)` dibuja el instante `t`.
- **Tramos con `seg` y curvas de ease.** `seg(S, a, b)` da 0→1 entre `a` y `b`. Encima van `easeInOutSine`,
  `easeOutBack` (para que algo "salte" al aparecer) y `pulse(S, c, w)` para destellos. Así cada pieza tiene su propio
  tramo y nada depende del cuadro anterior.
- **Textos del cliente.**
  - En la plantilla, el objeto `TEXTOS` arriba del script.
  - En la carroza, el HTML: `#intro`, `#title` (`.xv`, `.name` ×2, `.sub`) y `#hint`. El "XV" del escudo está pintado
    en un lienzo (busca `fillText("XV"`).

## 2. Coreografía

Los tiempos de la carroza (`TAP = 1.0`, `FLASH = 2.65`), sacados de su `update()`. Úsalos como molde de ritmo. En
otro tema cambia lo que pasa en cada tramo, no el ritmo (ver [disenar.md](disenar.md#5-el-ritmo)):

| Tramo | Qué pasa | Por qué funciona |
| --- | --- | --- |
| 0 – 1.0 | Calabaza que respira, "Érase una vez…", pista "TOCA LA CALABAZA" y anillo que late sobre ella | Invita a tocar; el anillo dice dónde |
| 1.0 | Onda en el punto del toque | Respuesta inmediata al dedo |
| 1.05 – 2.35 | Estela de varita en espiral; brillo interior que crece; círculo mágico que se dibuja en el suelo y gira cada vez más rápido | Anticipación: varias cosas suben a la vez hacia un clímax |
| 1.55 – 2.6 | Tiembla, se eleva, da tres vueltas; columna de luz | La tensión se nota en el objeto mismo |
| 2.65 | Destello, onda expansiva, estallido de chispas | Clímax corto (0.1 s de ancho) |
| 2.53 – 3.4 | Transformación de abajo arriba; el rabito se encoge | El cambio se lee como una ola, no como un corte |
| 2.85 – 4.2 | En cascada: ruedas (cada una 0.09 s después), chasis, filigrana, gemas, corona (salta con `easeOutBack`), vidrios, faroles | El oro se dibuja con luz pieza por pieza |
| 2.9 – 4.4 | El palacio enciende sus ventanas en cascada y los faroles del camino fila por fila | El mundo despierta con la magia |
| 2.75 – 4.6 | La cámara se aleja y sube para mostrar todo | Recompensa: ver la obra completa |
| 3.85 – 5.4 | Título: letras que se juntan, nombre revelado con máscara y brillo de oro, línea, subtítulo | El nombre llega cuando todo está quieto |
| 5.4 → ∞ | Fuegos artificiales, luciérnagas, destellos sobre la carroza, cintas mágicas, niebla, cámara que deriva | Ambiente vivo |

Reglas que salen de ahí:

- Escalona.
- Nada importante aparece de golpe.
- El clímax dura poco.
- El nombre llega al final, sobre una escena tranquila.

## 3. Escenario por capas

De atrás hacia adelante; cada capa da profundidad con poco costo.

### 3.1 Cielo

- **Qué es.** Un plano con un shader: degradado, dos capas de estrellas que titilan, luna con textura, nubes de fbm y
  una estrella fugaz.
- **Dónde.** Plantilla y carroza: `// ---------- cielo`.
- **Lo importante.** Lo caro (fbm de la luna y las nubes) va dentro de un `if`, solo donde se ve.

### 3.2 Fondo pintado: el castillo

- **Qué logra.** Muchísimo detalle por casi nada, porque se pinta una vez en un lienzo 2D al cargar.
- **Dónde.** Carroza, `paintCastle(layer, DS)`, `trimmedPlane`, `castleLayer`.
- **Cómo se pinta.** Espacio de diseño de 2048×1024, pintado a 1.5×. Por cada torre: siluetas, luces, ventanas,
  almenas, banderas.
- **La máscara.** Un segundo lienzo guarda en sus canales qué se enciende y cuándo:
  - R: cuánto brilla;
  - G: el orden de encendido, que hace la cascada con `uLights`;
  - B: los focos que titilan.
- **Dos capas con paralaje.** A z −10.5 y −12, la de atrás en otro tono, para que el castillo tenga profundidad al
  mover la cámara.
- **Recortar el plano.** `trimmedPlane` recorta la malla al contenido para no pintar píxeles transparentes, que
  cuestan igual.
- **Revisarlo.** Registra los lienzos en `window.__lienzos` y revísalos con `herramientas/lienzos.mjs`.
- **En la plantilla.** `paintHorizon()` hace lo mismo en pequeño: colinas, árboles y un pueblo encendido.

### 3.3 Niebla baja

- **Dónde.** `fogPlane()`, con dos o tres planos a distintas profundidades.
- **Cómo.** fbm que se desplaza con `A`, con una envolvente suave en los bordes.
- **Lo importante.** `discard` donde la envolvente es 0. Esconde la costura entre el suelo y el fondo.

### 3.4 Suelo mojado con reflejo

- **Base.** `Reflector` sin MSAA (`multisample: 0`), con su textura del tamaño de la pantalla × `reflScale`.
- **Encima, un plano con shader:**
  - adoquines de Voronoi: la junta tapa el reflejo y la piedra lo deja ver a medias;
  - pasto fuera del camino;
  - charcos de luz bajo cada farol y bajo la magia (`uMagicPos`, `uMagic`).
- **El reflejo se dibuja aparte.** `renderMirror` se separa del `onBeforeRender` y se llama en `renderFrame()` antes del
  posproceso. Si se dibujara dentro del render principal, Three.js recalcularía programas cada cuadro (ver
  `rendimiento.md`).
- **Capa 1.** Lo que no se ve en el reflejo se queda fuera de él: follaje, gemas, marcos, calcomanías del suelo y
  bokeh. La cámara principal ve ambas capas.
- **Fresnel barato.** La plantilla hace el suelo menos reflejante a los pies de la cámara y más a lo lejos, como el
  agua de verdad.

### 3.5 Jardín: follaje instanciado

- **Dónde.** Carroza, `// ---------- jardín`: `leafCards`, `finishCards`, `foliageMaterial` y los samplers (`coneSampler`,
  `ballSampler`, `hedgeSampler`, `spiralSampler`).
- **Hojas.** Miles de tarjetas con textura en un solo `InstancedMesh` por material. Cada hoja lleva la normal de la
  forma (`aN`), no la de la tarjeta: así el seto se ilumina como un volumen.
- **Material propio con luz por vértice, barato.** Imita a `MeshStandardMaterial`:
  - hemisférica, 3 direccionales y 5 puntuales;
  - GGX con rugosidad 0.78;
  - entorno en armónicos esféricos (`LightProbeGenerator.fromCubeRenderTarget` × 0.45).
- **Las luces.** `syncFoliage()` copia cada cuadro las luces de la escena a sus uniforms.
- **Cuidado.** Sin el especular GGX y sin el entorno las hojas salían oscuras. El brillo se igualó con el de
  `MeshStandard` (menos de 1 % de diferencia) comparando capturas.

### 3.6 Faroles

- **Dónde.** Carroza, `// ---------- faroles del camino`.
- **Cómo.** El hierro va en una malla combinada, el vidrio en un `InstancedMesh` con color por instancia y los halos en
  `quadBatch` (cuadros que miran a la cámara, todos en una malla con `setQuad`).
- **La cadena.** Se encienden fila por fila con `seg(S, FLASH + 0.2 + fila*0.16, …)`.

## 4. El héroe que se transforma

- **Una sola malla, dos superficies.** `pumpkinFn(u, v)` y `carriageFn(u, v)` dan la posición en la misma rejilla
  (u, v). Ver `// ---------- la calabaza que se vuelve carroza`.
- **Atributos.** La geometría guarda las dos posiciones y normales: `position`/`normal` y `aCar`/`nCar`, más `aPU` =
  (u, v).
- **La ola.** En `onBeforeCompile`, el vértice mezcla las dos con `dkM = clamp(uMorph*1.7 - v*0.7)`, suavizado: la
  transformación sube de abajo arriba. El fragmento mezcla los dos materiales con el mismo `vM`.
- **Normales numéricas.** `normalOf(fn, u, v)` las saca de la función por diferencias, así cualquier superficie
  paramétrica sirve.
- **Colocar cosas sobre la superficie.** `surfPt` y `surfUV(u, v, off)` dan un punto a cierta distancia de la superficie
  final; con eso se pegan adornos, puertas y gemas.
- **Cuidado: el orden de los índices.** Con el orden equivocado, la calabaza salió "al revés": se veía por dentro.
  `idx.push(a, d, b, a, c, d)` es el correcto para esta rejilla.
- **Otros héroes.** Sirve igual para un sobre que se vuelve carta, una flor que se abre o un cofre que se vuelve
  castillo. Basta con que ambas superficies se describan sobre la misma rejilla (u, v).

## 5. Cristal

- **Dónde.** El fragmento de `bodyMat`: `MeshPhysicalMaterial` + `onBeforeCompile`.
- **Facetas.** Celdas de Voronoi periódicas (40×14, sin costura alrededor), cada una con su escarcha.
- **El resto:**
  - vetas de grosor irregular entre facetas;
  - grano fino encima;
  - luz cálida interior según cuánto mira de frente la faceta y un núcleo a media altura (`uInner`);
  - destellos que titilan con `uTime`;
  - iridiscencia y clearcoat que suben con la transformación.
- **Lo que costó.** Primero salió blanco quemado y luego parecía mosaico. Quedó bien con el ámbar cálido, las vetas
  irregulares y la escarcha. Compara con la referencia a la misma escala antes de dar el material por bueno.

## 6. Oro dibujado con luz

- **Qué logra.** Cientos de piezas en una sola llamada de dibujo, y cada pieza aparece en su instante. Ver
  `// ---------- mallas combinadas`.
- **`mergeParts(parts)`.** Junta geometrías en una. Cada parte lleva:
  - `key`: el instante en que aparece completa;
  - o `when(q, Q)`: el instante de cada tramo, para tubos que se "dibujan" de punta a punta.
- **`revealUntil(mesh, S)`.** Busca por bisección cuántos índices ya tocan y ajusta `setDrawRange`. No cuesta nada por
  cuadro.
- **Herramientas de trazo:**
  - `tubeGeo(fn, segs, radio)` con `FnCurve` para cualquier curva;
  - `spiral2` para volutas;
  - `drawn(t0, t1, easeInOutSineInv)` reparte los tramos para que el trazo siga una curva de ease;
  - `beadAt` para perlas;
  - `meshMatrix` para colocar.
- **Material.** `goldMat`: metal 1, rugosidad 0.24 y un poco de emisivo que pulsa cuando el oro aparece.
- **Gemas.** `OctahedronGeometry` con `flatShading` y color por vértice. `gemMat` multiplica el emisivo por `vColor`
  para que cada gema brille de su color. Van en la capa 1.
- **En la plantilla.** El medallón de ejemplo usa todo esto.

## 7. Detalle sobre una superficie

- **Dónde.** Carroza, `makeWheel` y `chassis` (ruedas y chasis) y `// ---------- adornos sobre el cuerpo`.
- **Ruedas.** 20 rayos de sol, perlas, tachones, pétalos del cubo y la gema central.
- **Adornos del cuerpo.** Costillas cortadas en la puerta, perlas, marcos, ojiva, corazón, flor, aldaba, volutas,
  hojas de acanto, encaje y la cuna de abajo.
- **Ayudantes.** `onPanel` y `onDoor` dan sistemas de coordenadas locales sobre la superficie curva, y `curveOn` pega
  una curva 2D a ella.
- **Revisar cada adorno.** A 405×720 un detalle pequeño puede leerse mal: un escalón de la puerta parecía antenas y se
  quitó. Revisa la silueta con recortes (`RECORTE`, `DPR=3`).
- **Cuidado al girar.** Gira la pieza, no el grupo que la contiene: así la corona salió de lado.

## 8. Partículas

- **Un solo `Points`.** Varios tipos (`aKind`): estela, polvo, estallido, luciérnagas, fuegos artificiales, destellos y
  cintas mágicas (`COUNTS` en la carroza).
- **Todo el movimiento en el shader de vértices**, como función de `uS` y `uA`. JS solo actualiza unos uniforms.
- **Las apagadas no se dibujan.** Si una partícula tiene alfa menor a 0.003, tamaño 0 y fuera de pantalla: no se
  rasteriza.
- **Una estrella de luz.** Fragmento con núcleo, halo y rayos en cruz, en mezcla aditiva y sin escribir profundidad.
- **Cuidado con la estela.** Una espiral horizontal a la altura de la cámara se ve de canto, como una raya. Inclínala
  (la plantilla suma `0.28 * sin(a)` en y) y pásala por delante del héroe, no por detrás.

## 9. Destello y magia en el suelo

- **Un solo pulso.** `pulse(S, FLASH, 0.1)` mueve a la vez la luz mágica, el charco del suelo, el cielo, la niebla, el
  bloom (+0.25) y la exposición (+0.1–0.2).
- **El plano de destello.** Va pequeño y tenue (`flareU.uA = 0.35 * pulse(S, FLASH, 0.07)`). Un destello grande dejó la
  pantalla en blanco; mide el brillo con `capturas.mjs`.
- **Círculo mágico.** Un lienzo pintado que se revela en ángulo (`uReveal`) y gira. Después vienen la columna de luz y
  la onda expansiva. Ver `// ---------- círculo mágico en el suelo`.

## 10. Título y textos

- **HTML sobre el canvas, no texto en 3D.** Se lee nítido en cualquier pantalla.
- **Letras que se juntan.** Cada letra de "MIS XV AÑOS" es un `span` que se mueve con `transform`.
- **El nombre.**
  - Una máscara en degradado lo revela de izquierda a derecha.
  - El oro es un `background-clip: text` cuyo `background-position` corre: el brillo recorre las letras.
  - El resplandor es una copia fija detrás, para no repintarlo.
- **Pista y toque.** `screenOf(v)` lleva el anillo y la onda al punto de pantalla del héroe.
- **Legibilidad.** Doble sombra (oscura cerca y cálida lejos) y viñeta. Comprueba en las capturas que el título se lea
  sobre lo que tiene detrás en cada instante.

## 11. Ambiente vivo

Al terminar la secuencia, todo lo que deba moverse sigue con `A`:

- luciérnagas y chispas que flotan;
- destellos sobre el héroe;
- fuegos artificiales periódicos;
- ventanas que titilan;
- niebla que se desplaza;
- bokeh del primer plano;
- cámara que deriva unos centímetros;
- el anillo de la pista.

Para comprobarlo, dos capturas a `DURATION + 2` y `DURATION + 3` deben diferir.

## 12. Sobres, sellos y criaturas

Probadas en bosque y halloween.

- **Sobre pintado.** `velvet`, `goldStroke`, `drawFront`, `drawFlap` y `drawLining` dibujan el terciopelo, los filetes de
  oro y las volutas.
  - `surfaceSet` saca del mismo dibujo tres mapas: color, metal y rugosidad. Así el oro brilla y el terciopelo no.
  - `MeshPhysicalMaterial` con `sheen` le da el terciopelo.
  - `fitUV` normaliza las UV de `Shape`/`Extrude`, que vienen en coordenadas (x, y).
- **Solapa con bisagra.** `ShapeGeometry` con el borde de giro en el origen; se abre girando en x.
- **Sello que se disuelve o se quema.**
  - Hace `discard` donde un ruido está por debajo de `uDissolve` o `uBurn`.
  - El borde que queda brilla, dorado o como brasa.
  - Para quemar, primero oscurece cerca del borde.
- **Tarjeta con el texto pintado.** `fillText` sobre un lienzo. `fitFont` (halloween) achica la letra hasta que el
  nombre cabe.
- **Humo.** Un plano con shader de ruido en mezcla aditiva que sube y se ondula.
- **Mariposas y murciélagos.** Dos alas en planos con la bisagra en el origen (`wingGeo.translate`) que baten con
  `sin(A * frecuencia)`. Cada uno sigue una trayectoria (curva de Bézier o círculo alrededor de la luna) en función del
  tiempo, y mira a su siguiente punto con `lookAt`.
- **Araña.** Esferas con patas articuladas: un grupo por articulación (`root` y `knee`). Es el molde para cualquier
  bicho o personaje de juguete.
- **Relámpago.** Un término de destello dentro del shader del cielo.
- **Fondo desenfocado (bosque).** Bokeh hecho en un shader, sin modelar nada.
