# Dirigir el video como en un set

El mundo 3D es un escenario de Blender: hay lugares, profundidad, luz y una cámara con lentes. El director de la
plantilla hace lo que le digas en `momentos.json`; sin decirle nada, hace un plano medio tras otro, y eso es lo que
aburre. Aquí está cómo se dirige. La vara son los videos de [`REFERENCIAS.md`](REFERENCIAS.md).

## 1. Las escenas: dónde pasa

Una historia pasa en dos o cuatro lugares, no en una fila de objetos sueltos. Cada lugar es una **escena**
(`"escenas": { "cocina": { "luz": "vela", "fondo": "#2a160c" } }`) y los momentos dicen en cuál pasan
(`"escena": "cocina"`, y se queda hasta que otro momento pida otra).

- **Lo de una escena se queda puesto** y se va sumando: la olla, luego el metate al lado, luego la vaporera. La escena
  se arma frente al que mira, como la trinchera que se va cavando. Lo que no se está diciendo sigue ahí, un poco
  apagado: es la escenografía.
- **Dónde va cada cosa**: `"en": [x, z]` en metros desde el centro de la escena (x a la derecha, z hacia la cámara).
  Lo importante al centro (`[0, 0]`); lo que acompaña a los lados (`[-1.8, 0.2]`, `[1.8, 0.2]`); el fondo, atrás
  (`[0, -2.2]`). Algo delante y cerca (`[0.8, 1.6]`) da profundidad. Sin `en`, van alrededor del centro en el orden en
  que entran.
- **Una escena nueva es un corte** a otro lugar: el cambio de escena es el cambio de capítulo de la historia (de la
  casa a la página falsa, de la estafa a la prueba).
- **El fondo pone el ambiente** más que nada: la noche en azul marino, el neón en morado, la oficina en crema, el
  laboratorio en blanco frío. Que cada escena tenga el suyo, distinto de las otras.

## 2. Los planos: cómo se ve

Cada momento importante lleva su `camara`. La regla de cine: **cada plano cuenta algo que el anterior no**. Uno nuevo
cada 2–4 s.

| Plano (`plano`) | Qué enseña | Para |
|---|---|---|
| `general` | La escena entera, todo lo puesto | Situar (al entrar a una escena), el resultado, el cierre de una idea |
| `medio` | La cosa y su tarjeta | Explicar: es el plano de trabajo |
| `primer` | La cosa llena el cuadro (un momento con tarjeta se queda en `medio`) | Lo que importa, una emoción, el remate |
| `detalle` | Una parte de la cosa, muy cerca | La prueba: el número, la grieta, la cerradura |

Los planos encuadran la cosa a su tamaño de `tam`. Si una prop la achica (la masa que aún no `crece`), en `medio` o
`general` sale chica con aire alrededor: mientras esté a menos de la mitad, ve en `primer` o `detalle`.

| Ángulo (`angulo`) | Se siente |
|---|---|
| `frente` | Neutro, de testigo |
| `tres-cuartos` | Con volumen: el de casi siempre |
| `lado` | Perfil, para comparar o ver algo pasar |
| `picado` (desde arriba) | Pequeño, vulnerable, o ver un mapa del lugar |
| `contrapicado` (desde abajo) | Grande, amenazante, poderoso |
| `cenital` (encima) | Un plano de cómo está acomodado todo |

`picado` y `cenital` enseñan lo de arriba: sirven si lo que importa está arriba (la boca de una olla, una mesa puesta).
De una caja cerrada solo se ve el techo: el microondas fue varios segundos de su techo blanco en «el plato gira».

| Lente (`lente`) | Se siente |
|---|---|
| `angular` | Mucha profundidad, exagera lo cercano: energía |
| `normal` | Como lo ve el ojo |
| `tele` | Aplana y aísla: un detalle, tensión |

| Movimiento (`movimiento`) | Para |
|---|---|
| `fijo` | Que la acción sea lo que se mueve (el martillo pega) |
| `dolly` (se acerca) | Llevar la atención: «y ahí está el truco» |
| `alejar` | Revelar: al alejarse se ve el contexto (la cuenta vacía, la fila de víctimas) |
| `orbita` | Lucir una cosa, darle vueltas a una idea |
| `grua` (sube) | Pasar de lo cercano a lo general, un final |
| `travelling` | Acompañar de lado, recorrer |

`"corte": true` salta al plano sin viajar: para un remate o un golpe (el plano de antes era general y el corte va a un
primer plano).

**Una secuencia tipo**, para cada idea: `general` al entrar a la escena → `medio` al explicar → `primer` o `detalle`
en el dato o el remate (con `corte`) → `alejar` para cerrar. Variar ángulo y lente entre planos seguidos.

## 3. La luz

Cada escena con su `luz`: `estudio` (neutra), `dia` (blanca y alta, con cielo), `atardecer` (naranja y baja, con
contraluz morado), `noche` (azul baja, con un contraluz cálido, como una lámpara), `vela` (cálida y muy baja, oscuro
alrededor), `neon` (cian, con contraluz magenta). La luz dice el tono: la estafa de noche o en neón, la verdad de día.

## 4. Las animaciones

- **La cosa hace la acción mientras se habla de ella** (`accion`: `golpea`, `late`, `tiembla`, `gira`, `salta`), y lo
  que cambia de estado cambia con su prop (`anima`): la olla que hierve, la cuenta que se vacía, la trinchera que se cava.
- **Una animación tiene sentido dentro de la historia**: no tiembla por temblar; tiembla porque vibra el SMS.
- **Lo que existe se anima como en la vida real.** Si un modelo nuevo hace una acción que existe (el martillo que pega,
  el agua que hierve, la broca que perfora), quien lo modela mira primero un video real de esa acción para copiarle el
  ritmo, el peso y el rebote (skill `modelos-3d`).
