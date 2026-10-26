# Diseñar la pieza

Cada encargo es distinto: el tema, el estilo, la historia, la mecánica y hasta el formato cambian. Lo que se repite es el
método y el nivel. Antes de escribir código, decide estas ocho cosas y anótalas en `<nombre>/guion.md` (plantilla del
guion en [referencias.md](referencias.md#el-guion)).

Lo marcado como **idea** todavía no tiene ejemplo. Al construirlo, revísalo con más cuidado y, si sale bien, súmalo al
catálogo (paso 6 de la skill).

## 1. La historia en una frase

Qué pasa y cuál es el momento que sorprende. Ejemplos:

- **Carroza:** una calabaza se vuelve carroza de cristal y llega el nombre.
- **Bosque Encantado:** el sello se disuelve, el sobre se abre y sale la tarjeta entre mariposas.
- **Halloween:** el sello se quema, sale una carta maldita, vuelan murciélagos y baja una araña.

Si la frase no cabe en una línea, la pieza tiene demasiadas ideas: elige una.

## 2. El estilo

La plantilla es una noche cinematográfica. Para otro estilo, cambia esto:

| Estilo | Materiales y luz | Posproceso | Tipografía y paleta |
| --- | --- | --- | --- |
| Noche cinematográfica (carroza, sobres) | `MeshStandard`/`Physical`, luz cálida contra fría, reflejo, niebla | bloom 0.6, umbral 0.82, ACES | serif + caligráfica, oro sobre azul noche |
| Día luminoso (playa, jardín, boda en blanco) | cielo de día, sol direccional fuerte, hemisférica alta, sombra de contacto bajo el protagonista | bloom 0.2–0.35, umbral ~0.9 | colores claros; el texto lleva sombra oscura o panel |
| Caricatura, infantil | `MeshToonMaterial` con `gradientMap` de 3–4 tonos, contorno con la malla duplicada en `BackSide` y escalada 1.03 | bloom bajo | colores saturados, letra redonda (Fredoka, Baloo 2), rebotes con `easeOutBack` |
| Papel recortado, pop-up | planos con lienzos pintados y grano de papel, separados en profundidad, sombra como copia oscura desplazada | sin bloom | colores planos; las piezas se levantan girando sobre una bisagra |
| Acuarela, ilustración | lienzos pintados con bordes suaves y textura de papel, `MeshBasic` o luz muy suave | sin reflejo | tonos pastel |
| Neón, fiesta | fondo oscuro, tubos emisivos (`TubeGeometry`), suelo de rejilla en shader | bloom alto, umbral bajo | parpadeo de encendido; colores eléctricos |
| Minimalista elegante | poca geometría, mucho espacio, líneas de oro dibujadas con luz (`mergeParts`) | bloom suave | serif fina + caligráfica, cámara lenta |

Si el dueño trae una referencia, el estilo sale de ella ([referencias.md](referencias.md)).

## 3. El protagonista y cómo construirlo

Todo se hace con código, sin modelos descargados, salvo que el dueño los dé. Escoge según la forma:

| Forma | Cómo | Ejemplo |
| --- | --- | --- |
| Girada sobre un eje: jarrón, campana, copa, cuerpo | `LatheGeometry` con un perfil | — |
| Plana con grosor: monograma, corazón, sobre, silueta | `Shape` + `ExtrudeGeometry`, con bisel para el oro | el sobre de los ejemplos |
| Orgánica: calabaza, carroza, pétalo, concha | función paramétrica (u, v) con normales por diferencias | `pumpkinFn`, `carriageFn` |
| Trazos: filigrana, tallos, cintas, constelaciones | `TubeGeometry` sobre una curva, dibujada con luz (`mergeParts` + `drawn`) | ruedas, medallón |
| Muchas copias: pétalos, hojas, globos, estrellas | `InstancedMesh`, con el movimiento en el shader | hojas del jardín |
| Seres pequeños: mariposas, murciélagos, peces, aves | cuerpo y dos alas en planos con bisagra; trayectoria en función de `A` | mariposas, murciélagos |
| Lo lejano: castillo, ciudad, montañas, bosque | lienzo pintado en planos con paralaje | castillo, siluetas, `paintHorizon` |
| Fenómenos: agua, fuego, humo, nubes, aurora, relámpago | shader de ruido (fbm) en planos, mezcla aditiva; agua con `Reflector` | humo, cielo, relámpago |
| Texto en la escena | pintado en un lienzo (`fillText`) sobre un plano: cualquier fuente y acentos | tarjetas de los sobres |
| Personas, mascotas | **idea:** silueta pintada a contraluz, figura de juguete con formas simples, o el modelo GLTF que dé el dueño (`GLTFLoader`, comprimido) | la araña es una figura simple |
| Foto del cliente | **idea:** `TextureLoader` con el archivo en la carpeta de la invitación, en un marco o medallón; respeta su proporción y no la agrandes más de su resolución | — |

El detalle es lo que separa una pieza nuestra de la de la competencia: perlas, gemas, vetas, filetes, adornos en
cascada. Después de construir el protagonista, compáralo con la referencia en recortes grandes.

## 4. La mecánica de apertura

Probadas:

- **Transformación** de una forma en otra con una ola (la carroza).
- **Sobre con sello** que se disuelve o se quema, solapa que gira y tarjeta que sale (Bosque Encantado, Halloween).

Ideas:

- **Libro.** Páginas como planos con bisagra y una curva en el shader de vértices.
- **Telón.** Planos subdivididos con una onda que se recogen a los lados.
- **Puerta o portal.** Dos hojas que giran y luz que sale.
- **Cofre o regalo.** Tapa con bisagra y un moño de tubos que se deshace.
- **Flor que se abre.** Pétalos instanciados que giran escalonados.
- **Burbuja o globo que revienta** en partículas.
- **Constelación.** Estrellas que se unen con líneas dibujadas con luz y forman el nombre o un monograma.
- **Pergamino.** Un plano enrollado que se desenrolla en el shader de vértices.

La interacción, por defecto, es tocar para empezar, y ese toque también permite que suene la música. Para un video o una
pantalla sin toque, `?auto` ya arranca sola.

## 5. El ritmo

El molde de la carroza sirve casi siempre:

espera → toque → anticipación → clímax corto → revelado en cascada → título → ambiente vivo.

- **Temas tranquilos.** En una boda minimalista o un bautizo, el clímax puede ser suave: un trazo de oro que se cierra,
  una flor que termina de abrirse.
- **Duración.** Entre 4 y 7 s del toque al título, para que nadie se aburra.
- **Escalona.** Nada importante aparece de golpe.

## 6. Textos y tipografía

- El nombre es lo más grande. Lo demás lo acompaña.
- **Fuentes.** De Google Fonts, con `display=block`, cargadas con `document.fonts.load` antes del primer cuadro.
  Comprueba que tengan acentos y ñ.
- **Legibilidad.** Sombra doble, viñeta o un panel suave detrás. Compruébala en cada captura donde aparezca el texto.
- **Textos largos** (fecha, lugar, mensaje): más pequeños, debajo del título o en una segunda pantalla.

## 7. Extras que puede pedir

- **Fecha, hora y lugar** en la pantalla final.
- **Botones.** «Confirmar asistencia» (`https://wa.me/<número>?text=…`) y «Cómo llegar» (enlace de Google Maps).
  - Van en el HTML con `pointer-events: auto`; la capa `.ui` lo tiene apagado.
  - El clic de un botón no debe llegar al `frame` (`event.stopPropagation()`).
- **Música.** Un `<audio>` que empieza con el toque, porque los navegadores solo dejan sonar después de un gesto. Va en
  bucle y con un botón para silenciar. Para el video, júntala con ffmpeg:

  ```
  ffmpeg -i video.mp4 -i musica.mp3 -c:v copy -shortest final.mp4
  ```

- **Cuenta regresiva** al evento.

## 8. El formato

- Vertical 9:16 por defecto: se abre en el teléfono.
- **Horizontal** (la pantalla del salón) **o cuadrado:** cambia el `aspect-ratio` de `#frame`. La cámara se adapta sola
  en `resize()`. Corre las herramientas con `ANCHO` y `ALTO`, por ejemplo `ANCHO=720 ALTO=405`, y el video sale en ese
  formato.
