---
name: invitacion-animada
description: Crea invitaciones y tarjetas digitales animadas en 3D, de cualquier tema y estilo, con el nivel de la carroza encantada. Es un solo HTML vertical con Three.js que se abre con un toque, cuenta una pequeña historia, revela el nombre y sigue vivo, fluido en cualquier teléfono. Entrega video, imágenes y enlace. Úsala cuando pidan una invitación, tarjeta o anuncio animado para abrir en el teléfono (XV años, boda, cumpleaños, bautizo, infantil, Halloween…), superar la animación de un competidor o de un demo, o repetir o adaptar una que ya hicimos.
---

# Invitación animada

Cada encargo es distinto: puede ser una sirena, una boda en la playa, un cumpleaños de superhéroes o un libro que se
abre. El tema, el estilo, la historia y la mecánica cambian cada vez. Lo que se repite es el **método** y el **nivel**.

**El nivel lo pone la carroza encantada** ([`ejemplos/carroza-encantada/`](ejemplos/carroza-encantada/LEEME.md)), hecha
para superar la del demo de un sitio de invitaciones:

1. Una calabaza respira en el jardín de un palacio.
2. Al tocarla, una varita la envuelve en luz.
3. En un destello se vuelve una carroza de cristal con filigrana de oro que se dibuja pieza por pieza.
4. El palacio despierta y llega el nombre.

Mira su `hoja.jpg` antes de empezar. Los otros dos ejemplos son otra mecánica (un sobre con sello) en dos mundos
distintos:

- [Bosque Encantado](ejemplos/bosque-encantado/LEEME.md);
- [Halloween](ejemplos/halloween/LEEME.md).

Cada paso acaba en una condición comprobable. No pases al siguiente hasta cumplirla. Al dueño se le enseña en **video e
imágenes**, nunca solo con una descripción.

## Lo que el dueño ya pidió

Vale para todas las invitaciones:

- **Cambia solo lo que pidió.**
  - Antes de cada cambio, copia `index.html` a `historial/index-vN-<qué>.html`.
  - Lo que no mencionó se queda como estaba. Una vez se movió el humo sin que lo pidiera y hubo que regresarlo.
- **Brillo controlado y texto legible.** El destello dura un instante y el texto se lee en cada cuadro donde aparece.
- **Ambiente vivo.** Al terminar, los brillos y las partículas siguen moviéndose.
- **Fluida y con la misma calidad en cualquier teléfono.** La abren invitados con equipos de todo tipo.
- **Proyectos en `C:\dev`.** El taller es `C:\dev\invitaciones`.

## 0. Taller

`<skill>` es la carpeta de esta skill. Para un tema nuevo, parte de la plantilla:

```
node <skill>/scripts/nuevo.mjs <nombre>
```

Para adaptar algo que ya existe, usa `--desde`:

```
node <skill>/scripts/nuevo.mjs <nombre> --desde <origen>
```

El origen puede ser un ejemplo de la skill, otra invitación del taller o un `.html`.

- **Qué crea.** `C:\dev\invitaciones\<nombre>\index.html`. La primera vez arma también el taller: `server.mjs`,
  `herramientas/` y playwright-core. Nunca sobrescribe una invitación que ya exista.
- **El servidor.** Arráncalo en segundo plano desde el taller con `node server.mjs`. Dice su puerto y la dirección para
  el teléfono, y correrlo dos veces no abre otro.
- **Las herramientas.** Se corren desde el taller: `node herramientas/<herramienta>.mjs <nombre> …`. Cada una explica su
  uso en la cabecera.
- **El navegador.** Las herramientas usan el Chromium de Playwright que ya esté en la máquina; si no hay, usan Edge. Para
  otro, define `CHROME_PATH`.
  - No corras `playwright install`: borra los navegadores que otros proyectos usan, como el servidor de Pinterest y
    Sloth. Ya pasó una vez.

**Hecho cuando** `http://localhost:<puerto>/<nombre>/` muestra la invitación y `node herramientas/tirones.mjs <nombre>`
da 0 y 0.

## 1. Diseñar la pieza

Decide, con [disenar.md](references/disenar.md):

- la historia en una frase;
- el estilo;
- el protagonista y cómo construirlo;
- la mecánica de apertura;
- el ritmo;
- los textos y la tipografía;
- los extras (fecha, lugar, botones, música);
- el formato.

Si hay referencia (el demo de un competidor, una imagen, un pin), lee [referencias.md](references/referencias.md) antes
de abrirla: ahí se captura y se estudia. Anótalo todo en `<nombre>/guion.md`, con la tabla de tiempos.

Si solo cambian textos o colores de una que ya existe, salta este paso.

**Hecho cuando** el guion tiene las ocho decisiones y cada tiempo con su segundo. Si hubo referencia, dice también en
qué supera el nuestro a cada uno de sus tiempos.

## 2. Construir por capas

**De la plantilla se queda la infraestructura:**

- el cuadro y su CSS;
- renderer y posproceso;
- `mergeParts` y `revealUntil`;
- el sistema de partículas;
- la estructura del título y de la línea de tiempo;
- calidad adaptable, calentamiento y ganchos de las herramientas.

**Se reemplaza lo que se ve:** cielo, horizonte, suelo, niebla, el protagonista, los tipos de partícula, la paleta, las
fuentes y los textos (`TEXTOS`). La plantilla (`plantilla/vista.jpg`) es una noche con un medallón de oro: tómala como
andamio, no como diseño.

Construye en este orden:

1. Los tiempos (`TAP`, `FLASH`, `DURATION`) y la cámara, con un protagonista provisional.
2. El escenario, de atrás hacia adelante.
3. El protagonista y su mecánica.
4. El detalle: lo que la referencia tiene en recortes grandes (filigrana, perlas, gemas, texturas), apareciendo en
   cascada.
5. La magia y los efectos.
6. Los textos.
7. El ambiente vivo.

- **Revisa cada capa al terminarla.** Saca la hoja de contactos (`node herramientas/hoja.mjs <nombre>`) y mírala.
- **Busca la técnica antes de inventarla.** Las probadas están en [tecnicas.md](references/tecnicas.md), con dónde está
  cada una en los ejemplos.
- **Registra cada pieza nueva** en `DEBUG_HIDE` y en `window.__parts`, para poder esconderla y medirla.

**Hecho cuando** la hoja de contactos muestra cada tiempo del guion en su momento.

## 3. Revisar cuadro a cuadro

Sigue [verificar.md](references/verificar.md):

- la hoja de contactos;
- la vista lateral, para que nada atraviese nada;
- recortes del detalle;
- los números de brillo;
- la comparación lado a lado con la referencia.

Mira cada imagen que generes.

**Hecho cuando** pasa toda la lista de verificar.md y la comparación no muestra nada que la referencia tenga y la
nuestra no.

## 4. Fluidez

Corre las cinco medidas. Las metas, y qué hacer si alguna falla, están en [rendimiento.md](references/rendimiento.md).

- `medir.mjs <nombre>`;
- `tirones.mjs <nombre>`;
- `fluidez.mjs <nombre> 4`;
- `fluidez.mjs <nombre> 6`;
- `fluidez.mjs <nombre>` con `SW=1`.

**Hecho cuando** se cumple cada fila de la tabla de metas.

## 5. Entregar

1. Graba el video: `node herramientas/grabar.mjs <nombre>` → `<nombre>/<nombre>.mp4`. Si lleva música, júntala con
   ffmpeg ([disenar.md](references/disenar.md#7-extras-que-puede-pedir)).
2. Saca las imágenes:
   - `node herramientas/hoja.mjs <nombre>` → `capturas/hoja.jpg`;
   - si fue un cambio, también `ANTES=historial/<la copia> node herramientas/hoja.mjs <nombre>` →
     `capturas/antes-despues.jpg`.
3. Abre la invitación en el navegador integrado, en lo que cambió, y déjala visible. Si no hay navegador integrado,
   dilo.
4. Al dueño, en su idioma:
   - el video y las imágenes, enseñados, no solo con su ruta;
   - la dirección local y la del teléfono;
   - las medidas de fluidez en una línea.

**Hecho cuando** el dueño tiene el video, las imágenes, las dos direcciones y las medidas.

## 6. Lo nuevo, a la skill

Si resolviste algo que no estaba en [tecnicas.md](references/tecnicas.md), agrégalo ahí, para que la próxima invitación
lo encuentre:

- una mecánica marcada como idea en disenar.md;
- un estilo nuevo;
- un material;
- un truco de rendimiento.

Escribe qué logra, cómo y en qué archivo y función está. Si la pieza abre un estilo o una mecánica que no tienen ejemplo,
cópiala a `ejemplos/<nombre>/` con su `LEEME.md` y su `hoja.jpg`.

**Hecho cuando** lo nuevo tiene su entrada y su puntero, o no hubo nada nuevo.

## Cuando pida cambios

Vuelve al paso que toca, con la misma disciplina:

1. Copia a `historial/`.
2. Cambia solo lo pedido.
3. Revisa con la hoja en los mismos instantes (`ANTES=`).
4. Mide la fluidez otra vez si agregaste geometría o efectos.
5. Entrega el antes y después.
