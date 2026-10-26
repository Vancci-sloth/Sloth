---
name: modelos-3d
description: La biblioteca de modelos 3D de los videos (three.js en Remotion), para no hacer dos veces el mismo. Antes de modelar cualquier objeto 3D, búscalo aquí y tráelo al proyecto; si no está o no alcanza, hazlo o mejóralo con el formato de la biblioteca y guárdalo para los siguientes videos. Se ve en Sloth, en «Modelos 3D».
---

# La biblioteca de modelos 3D

El usuario va a hacer muchos videos con 3D y no quiere que se desperdicie ninguno: **antes de hacer un modelo se busca
aquí, y lo que se hace se guarda aquí.** Cada modelo es un componente de React Three Fiber con su miniatura
(`modelos/<id>/vista.webp`, y `vista.webm` con la cámara que se mece) y su ficha (`modelo.json`: qué es, para qué sirve, sus etiquetas y de qué video salió). Sloth
los enseña en «Modelos 3D», en la barra de la izquierda.

Todo se hace con `scripts/modelos.py` (sin dependencias). Salvo `buscar`, se corre en la carpeta del proyecto del video:

```
python -B -X utf8 <esta skill>/scripts/modelos.py buscar caja regalo premio
python -B -X utf8 <esta skill>/scripts/modelos.py usar regalo boveda
python -B -X utf8 <esta skill>/scripts/modelos.py guardar caja-fuerte --nombre "…" --resumen "…" --categoria "…" …
```

## 1. Buscar

Al diseñar el mundo del video, por cada objeto que vayas a necesitar, `buscar` con varias palabras: la cosa, sus
sinónimos y lo que representa («caja regalo premio airdrop»). Sin palabras, lista todo. De cada uno dice qué exporta,
qué es y dónde está su vista: **mírala** (Read) antes de decidir. Si sirve, se usa; si casi sirve, se mejora (3); solo
si nada se le parece, se hace uno nuevo (4).

## 2. Usar

`usar <id>…` copia al proyecto el modelo a `src/modelos/<id>.tsx`, con los modelos que usa, `comun.tsx`, sus archivos a
`public/modelos/<id>/` y sus íconos a `public/iconos/`. Imprime el `import` (`from "../modelos/<id>"`). Lee su
comentario de cabecera y sus props: los colores con significado, las imágenes y los tiempos se le pasan desde el video.
Si el proyecto ya tiene una copia distinta, no la pisa (con `--pisa`, sí).

## 3. Mejorar uno que casi sirve

Si uno se parece (falta un color, otra forma de abrirse, una pieza más), mejora ese en vez de hacer otro: lo nuevo es
una prop con un valor por omisión que deja todo como estaba. Cámbialo en `src/modelos/<id>.tsx` del proyecto y
`guardar <id>` (sin `--nombre` ni lo demás: se queda su ficha; dale `--hace`, `--descripcion` o `--etiquetas` si ahora sirve para
más). Los videos ya hechos no se rompen: cada uno tiene su propia copia.

## 4. Uno nuevo

Se escribe directo en `src/modelos/<id>.tsx` del proyecto, con estas reglas, para que sirva en otro video:

- **El id**, en español, en minúsculas y con guiones (`caja-fuerte`). Exporta su componente con un nombre claro
  (`CajaFuerte`).
- **El comentario de cabecera** dice qué es, para qué sirve, cuánto mide y dónde está su origen («mide 1 de lado y se
  para en el piso, en el origen»). Mide de 1 a 2 metros, para que las escalas se parezcan de un video a otro.
- **Solo importa** `react`, `three` (y `three/examples/jsm/…`), `@react-three/fiber`, `remotion`, `./comun` y otros
  modelos (`./icono-3d`). Nada del video (`../tema`, `../mundo/guion`): lo que es de cada video le llega por props, con
  valores por omisión que se vean bien.
- **No se mueve solo.** Sus animaciones son funciones del cuadro (`useCurrentFrame`) y empiezan en el cuadro que le
  pasen (`abre`, `aparece`); sin él, quieto. Lo que pueda quedar de fondo usa `conGris` (pasa a gris y se apaga).
- **No frena el render**: nada de `delayRender` propio. Las letras ya las carga el video (`tema.ts`, con su espera); un
  texto en un lienzo mira `document.fonts.check` y se vuelve a dibujar cuando llega la letra. En nuevo-10 uno esperaba
  una letra que nunca llegó y tumbó el borrador.
- **De buena calidad**: biseles (`RoundedBoxGeometry`, `bevel`), materiales con brillo (`clearcoat`), que dé sombra
  (`castShadow`). Si un objeto real tiene detalle que lo hace reconocible, que lo lleve.
- **Un escenario con piso propio** (una pantalla, un cuarto) lo pone a ras, entre 0.001 y 0.003 y con `polygonOffset`
  −1 como mucho, y la sombra del mundo (a 0.004) cae encima; o claramente encima, a 0.01 o más, con `receiveShadow`, y
  da sus propias sombras. En medio, o a ras con más `polygonOffset`, se pelea con la sombra y las sombras aparecen y
  se van de un cuadro a otro (`pantalla-inicio` en nuevo-10).
- **Sus archivos** (texturas, un `.glb`, un SVG) en `public/modelos/<id>/`, leídos con
  `staticFile("modelos/<id>/…")` y `useLoader` (`TextureLoader`, `GLTFLoader`, `SVGLoader`). Las texturas, con Codex
  (como las caras de la moneda); un `.glb` hecho fuera vale si su licencia deja usarlo. Un ícono de Phosphor no se
  modela: es `Icono3D` (`modelos.py iconos <nombre>` lo deja en public/iconos).
- **Su `Muestra`**: `export const Muestra: React.FC` con el modelo solo, en el estado que mejor lo explica (abierto, a
  medio llenar, con dos variantes al lado). Es su miniatura; si se anima, `--cuadro` dice qué cuadro sale.

`comun.tsx` no se cambia desde un video: lo que necesite un solo modelo va en su archivo. Si algo de verdad es común,
se cambia aquí y se vuelven a sacar las vistas de los modelos (`vista <id>…`) para ver que nada se rompió.

## 5. Guardar

En cuanto el modelo funciona en el video (no al final: otro video puede estar esperándolo):

```
python -B -X utf8 <esta skill>/scripts/modelos.py guardar <id> --nombre "Caja fuerte" --resumen "Caja fuerte que se abre" \
  --categoria "Objetos" --descripcion "Qué es y para qué sirve, en una o dos frases." \
  --hace "se abre; el candado se abre" --etiquetas "caja fuerte, bóveda, ahorro, bloqueado" [--cuadro 20]
```

Su ficha es lo que el usuario lee en Sloth para decidir si le sirve, así que cada campo dice algo distinto:

- `--resumen`: para qué sirve, en pocas palabras (45 letras como mucho). Va debajo del nombre en el cartel.
- `--categoria`: su tipo, uno de `categorias.json` (Protagonistas, Objetos, Logos e íconos, Medidores, Flujos,
  Escenarios, Señales). Si de verdad no cabe en ninguno, suma uno ahí con su «para».
- `--descripcion`: qué es y cómo se ve, en una o dos frases.
- `--hace`: lo que puede hacer en un video, separado por «;» y con verbos cortos («se abre», «se rompe en cubos»): es lo
  primero que se lee para saber si sirve.
- `--etiquetas`: las palabras con que alguien lo buscaría, en español y sin miedo a repetir: la cosa, sus sinónimos y
  lo que representó en el video.

Revisa que solo importe lo permitido, lo copia aquí con sus archivos, escribe su `modelo.json` (además: lo que
exporta, qué modelos usa, sus íconos, de qué video salió) y saca su vista con la tarjeta de video (necesita el
`node_modules` del proyecto). **Mira la vista**: si no se entiende qué es, cambia la `Muestra` o el `--cuadro` y
vuelve a guardar. Al mejorar uno, solo se pasa lo que cambió; `--hace` y `--etiquetas` se pasan enteros, con lo nuevo.

Lo guardado queda en el repo de Sloth (`skills/modelos-3d`) sin commit: al entregar el video, dile al usuario qué
modelos sumaste o mejoraste.
