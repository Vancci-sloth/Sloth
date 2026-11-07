# El kit

Las piezas 2D y 3D de la plantilla, sacadas de su código por `scripts/kit.py hoja` (no se edita a mano: se cambia
el comentario de la pieza y se rehace). Un video no las usa a mano: las pone el director (`src/director`) desde
`momentos.json` (SKILL.md). Esta hoja es para lo único que se escribe a mano, una pieza que el director no tiene:
`src/piezas/<nombre>.tsx`, que exporta un componente y se usa con `"tarjeta": { "tipo": "pieza", "nombre": …,
"props": {…}, "w": …, "h": … }`. Recibe sus `props` y, además, `en` y `hasta`: los cuadros en que entra y sale.
Si sirve a otros videos, `kit.py guardar <nombre>`.

Los tiempos de una pieza propia salen de `en` o de `en("palabra")` (de `src/tiempo.ts`), nunca de cuadros escritos
a mano: si la voz cambia, todo se recorre solo.

## `src/tiempo.ts`

El tiempo: todo se ata a la palabra que lo dispara, nunca a cuadros escritos a mano.

- **`cuadro`** `(s: number)`: El cuadro de un segundo de la voz: solo para lo que no se ata a una palabra (el gancho en el 0).
- **`indice`** `(texto: string, n = 1): number`: Índice de la palabra de la voz donde empieza `texto`: una palabra o varias seguidas («pero primero», «dos mil quince»), sin importar tildes, mayúsculas ni signos. `n`, qué vez se dice: `en("estudio", 3)`. Si la voz no lo dice, el error lo dice al revisar.
- **`en`** `(texto: string, n = 1)`: Cuadro en que empieza a decirse `texto` (como en `indice`).
- **`fin`** `(texto: string, n = 1)`: Cuadro en que se termina de decir `texto`.
- **`resorte`** `(f: number, desde: number, rigidez = 80)`: Un resorte de 0 a 1 que empieza en el cuadro `desde`: para que algo gire, entre o cambie de estado en su palabra.
- **`fundido`** `(f: number, desde: number, hasta: number)`: 0 → 1 → 0: aparece en 5 cuadros desde `desde` y se va en los 5 antes de `hasta`.
- **`corre`** `(f: number, desde: number, hasta: number, de: number, a: number)`: Un valor que corre de `de` a `a` entre dos cuadros, frenando al llegar: un número, una escala, una posición.

## `src/mundo/encuadra.ts`

Las tomas: qué tiene que verse en cada idea; la cámara sale sola.

- **`Cosa`** `{ n: string; p: V3; r?: number; caja?: { w: number; h: number; origen?: [number, number]; desplaza?: [number, number] } }`: Algo que la toma tiene que enseñar: un objeto 3D (`r`, su radio) o una tarjeta 2D clavada en el mundo (`caja`, su tamaño en px como en EnMundo, qué punto de la caja va en `p` y cuánto se corre).
- **`Toma`** `{ n: string; en: number; dura?: number; az: number; el: number; arriba?: number; abajo?: number; cosas: Cosa[]; lejos?: number; deriva?: number; arco?: V3; fov?: number; empuja?: number; grua?: number }`: Una toma por idea: desde `en` la cámara va (en `dura` cuadros, 30 por omisión) a ver sus `cosas` desde el azimut `az` (0 es de frente desde +z, positivo desde la derecha) y la elevación `el` (cuánto desde arriba). `arriba`, dónde empieza la zona útil (575 si hay un índice fijo arriba); `lejos`, cuánto más lejos que la distancia justa (1.3 deja aire). `deriva`, `arco` y `fov`, como en `Plano`.
- **`INDICE`** `ZONA.indice`: Si hay un índice fijo arriba (1 · 2 · 3), lo de arriba empieza debajo de él: `arriba: INDICE`.
- **`cajaDe`** `(cam: THREE.PerspectiveCamera, c: Cosa)`: La caja en pantalla de una cosa: [x0, y0, x1, y1].
- **`zona`** `(t: Toma)`: La zona útil de una toma (en vertical, x de 90 a 990 e y de 500 a 1320).
- **`encuadra`** `(t: Toma): { pos: V3; mira: V3; d: number }`: La cámara de una toma: `pos`, `mira` y a qué distancia quedó.
- **`planosDe`** `(tomas: Toma[]): Plano[]`: Los planos de la cámara, uno por toma.

## `src/mundo/EnMundo.tsx`

Lo 2D clavado en el mundo 3D: se mueve con la cámara.

- **`EnMundo`** `{ p: V3; d0?: number; origen?: [number, number]; desplaza?: [number, number]; en?: number; sale?: number; style?: React.CSSProperties; children: React.ReactNode; }`: Algo 2D (una tarjeta, una píldora, un número) clavado en el punto `p` del mundo. `origen`: qué punto de su caja va en `p` ([0.5, 1], el centro de abajo, para dejarlo encima de su objeto); `desplaza`: unos px de lado. Con `en` y `sale`, entra y sale solo. `d0`: la distancia en metros a la que se ve a su tamaño de diseño, la de la toma en que se lee (`encuadra(toma).d`); sin él no cambia de tamaño con la cámara. Una pantalla 2D sobre un modelo 3D (la del celular): ese `d0`, y de ancho el de la pantalla en metros × `K` / `d0` px (`import { K } from "./camara"`: a d m de la cámara, 1 m mide K / d px).

## `src/piezas/ui.tsx`

Cómo entra y sale cada cosa, y lo que marca un texto.

- **`useColores`** `()`: Los colores del capítulo en que está (oscuro o claro, de `COLORES` en tema.ts), para una pieza propia: `fondo`, `texto`, `tenue`, `tarjeta`, `tarjeta2`, `borde`, `sombra` y `solido` (`const c = useColores()`).
- **`sujeta`** `{ extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const`: Las opciones de `interpolate` para que no se pase de sus extremos: `interpolate(f, [a, b], [0, 1], sujeta)`.
- **`suave`** `Easing.bezier(0.2, 0.7, 0.2, 1)`: La curva con que entra lo de todos los videos: rápido al empezar y suave al llegar (`easing: suave`).
- **`chueco`** `(semilla: number, max = 3.5)`: Un giro de -max a max grados que depende de `semilla`, no del azar: el mismo en cada render (el perro chueco).
- **`useEntrada`** `(desde: number, rigidez = 140)`: 0 → 1 con un resorte que se asienta sin rebotar de más, desde el cuadro `desde`.
- **`Aparece`** `{ en: number; sale?: number; giro?: number; desde?: { x?: number; y?: number; escala?: number }; style?: React.CSSProperties; children: React.ReactNode; }`: Cómo entra una cosa: desenfocada, un poco más grande y girada, y se asienta en ~6 cuadros. `sale` la desvanece con desenfoque.
- **`Tarjeta`** `{ ancho?: number; style?: React.CSSProperties; children: React.ReactNode }`: La caja de una tarjeta, con el fondo, el borde y la sombra del tema: para armar una tarjeta propia.
- **`Fuente`** `{ children: React.ReactNode; style?: React.CSSProperties }`: El crédito chico bajo cada prueba: de dónde sale lo que se ve.
- **`Contador`** `{ de: number; a: number; desde: number; hasta: number; decimales?: number; prefijo?: string; sufijo?: string; style?: React.CSSProperties; }`: Un número que corre de `de` a `a` entre dos cuadros.
- **`Resaltado`** `{ en: number; color?: string; children: React.ReactNode }`: El marcador amarillo sobre una frase citada (el «porting» del README, 77 s).
- **`Pulso`** `{ x: number; y: number; desde: number; hasta?: number; color: string; radio?: number; cada?: number; grosor?: number }`: Ondas que salen de un punto cada `cada` cuadros, como un radar: lo que está pasando ahora.
- **`Subrayado`** `{ en: number; color?: string; grosor?: number; children: React.ReactNode }`: El subrayado rojo bajo el dato exacto que prueba lo que dice la voz (un círculo a mano no cierra y estorba). Se dibuja de izquierda a derecha en ~8 cuadros, apenas inclinado, como un plumón. Va en un tramo de una sola línea.
- **`Ancla`** `{ id: string; style?: React.CSSProperties; children: React.ReactNode }`: Marca algo para que una Flecha lo encuentre. El `id` es único en todo el video.
- **`Flecha`** `{ en: number; de: string; a: string; curva?: number; sale?: number; llega?: number; color?: string }`: La flecha roja de una prueba a lo que prueba. No lleva coordenadas a mano: busca en pantalla sus dos `Ancla` (`de` y `a`) cada cuadro y va de borde a borde, así apunta justo aunque las cosas floten y no entra a tapar su texto. Si una de las dos no está en pantalla, no se dibuja: nada apunta a la nada. Se dibuja desde `en` en ~10 cuadros.
- **`Entra`** `{ en: number; sale?: number; desde?: { y?: number; escala?: number }; children: React.ReactNode }`: Como Aparece, pero sin posición propia: para lo que va clavado en el mundo 3D (EnMundo) o dentro de otra caja.
- **`Secuencia`** `{ items: { en: number; nodo: React.ReactNode }[]; hasta: number; style?: React.CSSProperties }`: Una cosa a la vez en la pantalla: cada una entra en su `en` y sale cuando entra la siguiente (la última, en `hasta`). Para una lista de datos, de pasos o de nombres que se van diciendo. Va arriba de la zona de la escena; `style` la mueve.

## `src/piezas/diagrama.tsx`

Las piezas chicas: píldoras, fichas, logos.

- **`Ficha`** `{ texto: string; color: string; tam?: number; img?: string; tinta?: string }`: La ficha redonda de una moneda, un token o un sello, con su texto o su imagen.
- **`ConSimbolo`** `{ icono?: NombreIcono; logo?: string; img?: string }`: Lo que va delante de un texto: un ícono de Phosphor (`icono`), un logo real redondo (`logo`, de public/logos) o una imagen redonda (`img`, de public: una bandera, una cara).
- **`Simbolo`** `ConSimbolo & { tam: number }`: El ícono, logo o imagen de `ConSimbolo`, solo, de `tam` px: para ponerlo delante de un texto en una pieza propia.
- **`Pildora`** `ConSimbolo & { children: React.ReactNode; color?: string; fondo?: string; tam?: number; apagado?: number; style?: React.CSSProperties }`: La píldora: un nombre, un lugar o una etiqueta, con su ícono, logo o bandera delante. `apagado` (0–1) la pasa a gris.
- **`useNegado`** `(en?: number)`: «No se puede»: desde `en`, lo que se intentó parpadea en rojo tres veces y se queda rojo (sin cruces ni bordes remarcados). Devuelve cuánto rojo lleva en este cuadro, de 0 a 1.
- **`Insignia`** `{ logo: string; tam?: number; color?: string; luz?: number; style?: React.CSSProperties }`: Un logo real, redondo (public/logos/<logo>.png), como el avatar de una cuenta: en vez de escribir el nombre.

## `src/piezas/iconos.tsx`

Íconos de Phosphor, cualquiera por su nombre (https://phosphoricons.com). Nunca emojis.

- **`NombreIcono`** `{ [K in keyof Todos]: Todos[K] extends Icon ? K : never }[keyof Todos]`: El nombre de un ícono de Phosphor como lo exporta su paquete, en PascalCase: "ShieldCheck", "Warning", "Syringe".
- **`esIcono`** `(nombre: string): nombre is NombreIcono`: Si `nombre` es un ícono de Phosphor que existe: para no adivinarlo antes de usarlo.
- **`Glifo`** `{ nombre: NombreIcono; tam: number; color?: string; peso?: IconWeight; style?: React.CSSProperties }`: El ícono suelto, del color de lo que lo rodea (o `color`).
- **`Icono`** `{ nombre: NombreIcono; tam?: number; color: string; apagado?: number }`: El ícono grande en su azulejo: degradado del color, brillo arriba, sombra del mismo color y el glifo en blanco.

## `src/piezas/tarjetas.tsx`

Las pruebas y los datos en su tarjeta.

- **`Partes`** `(string | { t: string; en: number; color?: string; subraya?: boolean })`: Texto con tramos marcados: ["texto normal", { t: "lo resaltado", en: cuadro }, …]. Con `subraya`, en vez del marcador lleva el subrayado rojo a mano: el dato exacto que prueba lo que dice la voz.
- **`Calendario`** `{ fechas: [number, string][]; ancho?: number }`: El calendario de mesa, hecho con cuidado: hojas de papel con su grosor, dos argollas de metal, el mes en rojo, el día grande y su nombre. En cada fecha de la lista la hoja de arriba se arranca: gira hacia arriba sobre las argollas, se oscurece y se va, y deja ver la siguiente con la sombra que le hacía.
- **`Barras`** `{ filas: { etiqueta: React.ReactNode; valor: number; color: string; en: number; texto?: (v: number) => string }[]; ancho?: number; max?: number; }`: Barras que comparan dos o más cifras; cada una crece en su cuadro y su número corre con ella.
- **`Cifra`** `{ valor: React.ReactNode; nota?: string; fuente?: string; icono?: NombreIcono; color?: string; tam?: number }`: El dato en su tarjeta: la cifra grande (un texto, o un `<Contador>` que corre), lo que mide debajo y, si va, de dónde sale. Con `icono`, el ícono del color de la cifra a su izquierda.
- **`colorDeRed`** `(red: Exclude<Red, "ninguna">)`: El color del botón de la red y el fondo de su tarjeta: para lo que acompaña a la tarjeta (el pulso, la píldora).
- **`TarjetaCierre`** `{ red: Exclude<Red, "ninguna">; clic: number; nombre: string; avatar?: string; sub?: string; ancho?: number }`: La tarjeta del cierre: la cuenta o el canal de `red` con su foto (`avatar`, en public; sin ella, el logo de la red), su nombre y el botón, que se pulsa en `clic`.
- **`Navegador`** `{ url: string; ancho?: number; children: React.ReactNode }`: Una ventana de navegador con su dirección, para una página web rehecha.
- **`Plazo`** `{ desde: number; hasta: number; inicio: string; fin: string; color: string; ancho?: number }`: Una barra de tiempo que se llena entre dos fechas (el año del reembolso).
- **`Prueba`** `{ logo?: string; icono?: NombreIcono; fuente: string; partes: Partes; ancho?: number; tam?: number }`: La prueba en corto: el logo de quien lo dijo (o, si no tiene, un `icono`: un libro, una ley), de dónde y cuándo, y solo la frase que importa (con su dato subrayado en rojo). En vez de la cita entera: el texto de arriba ya dice el resto.

## `src/piezas/reddit.tsx`

Un post de Reddit rehecho.

- **`Post`** `{ sub: string; fecha: string; votos?: [number, number, number]; comentarios?: [number, number, number]; etiqueta?: React.ReactNode; debajo?: React.ReactNode; ancho?: number; tam?: number; children: React.ReactNode; }`: Un post de Reddit. `children` es el título, citado (con su `Subrayado` si hace falta). `votos` y `comentarios`: [cuadro desde, cuadro hasta, total] en que corren sus cuentas (sin ellos, no se enseñan). `etiqueta`: lo de la derecha de la cabecera (una píldora «EN VIVO», «+1 año sin resolver»). `debajo`: lo que cuelga del post (los EDIT).
- **`Comentario`** `{ votos?: number; fecha?: string; ancho?: number; tam?: number; children: React.ReactNode }`: Un comentario: el usuario tapado, sus votos (o su fecha) y su texto.

## `src/escenas/comun.tsx`

Lo que comparten los capítulos: indicadores, botones, el cierre de la marca.

- **`Lectura`** `{ p: V3; texto: string; nota?: string; color?: string; visible: number }`: Lo que un `Indicador` enseña en un cuadro: dónde (un punto del mundo), qué y cuánto se ve (0–1).
- **`Indicador`** `{ de: (f: number) => Lectura | null; tam?: number; origen?: [number, number] }`: El indicador de cualquier tema (la temperatura, la población, el año, los usuarios), pegado a su objeto y cambiando con la historia: `de(f)` es una función de guion.ts que dice qué enseña en cada cuadro, o `null` cuando no está.
- **`Boton`** `{ no?: number; color?: string; clic?: number; tam?: number; children: React.ReactNode }`: Un botón que no se puede pulsar: en `no` parpadea y se queda rojo. Sin `no`, un botón normal (de `color`).
- **`Cursor`** `{ de: [number, number]; a: [number, number]; desde: number; hasta: number }`: El cursor que llega a un botón y lo pulsa.
- **`Numero`** `ConSimbolo & { color: string; tam?: number; children: React.ReactNode }`: Un número grande en su píldora, del color de lo que cuenta, con su ícono o logo delante.
- **`PantallaCanal`** `{ nombre?: string; avatar?: string }`: La pantalla del celular del personaje: el canal en chiquito (la pose `celular`, ver su ancla en datos/personaje.json). Sin red de cierre, la pantalla se queda apagada.
- **`Canal`** `{ nombre?: string; avatar?: string; pero: number; unete: number; enlace: number }`: El cierre: la tarjeta de la cuenta o el canal de `MARCA` (su red, su nombre y su foto) entra en `pero` («pero si quieres enterarte…»), el botón se pulsa en `unete` y en `enlace` sale dónde está («en mi perfil», o la página). Va fija en la pantalla, arriba del personaje en vertical y a su izquierda en horizontal (él enseña el canal en su celular). Sin red de cierre no dibuja nada. Va en el capítulo del cierre, con las palabras de la frase de la marca: `<Canal pero={en("pero si quieres")} unete={en("únete")} enlace={en("el enlace")} />`.
- **`Hueco`** `{ id: string; p: V3; radio: number }`: Un hueco invisible del tamaño de algo 3D (centro `p` y `radio` en metros), con su `Ancla`: para que una Flecha llegue a un objeto del mundo (el protagonista, el bloque que falta) sin coordenadas a mano. Va solo mientras la flecha lo necesita.

## `src/modelos/comun.tsx`

Lo 3D de todos los modelos: quién está en escena y cuándo.

- **`V3`** `[number, number, number]`: Un punto del mundo, en metros. El piso es y = 0.
- **`v3`** `(p: V3)`: El `V3` como vector de three, para sumar, restar o medir distancias.
- **`sujeta`** `{ extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const`: Las opciones de `interpolate` para que no se pase de sus extremos (como `sujeta` de piezas/ui).
- **`suave`** `Easing.bezier(0.2, 0.7, 0.2, 1)`: La curva de entrada de todos los videos (como `suave` de piezas/ui).
- **`azar`** `(i: number, k: number)`: Un número fijo entre 0 y 1 para cada (i, k): el mismo en cada render.
- **`conGris`** `(m: M)`: Un material que puede pasarse a gris (`gris`, 0 → 1) sin cambiar de textura —lo jubilado, lo detenido— y apagarse (`apaga`, 0 → 1): ya iluminado, se funde con el color `fondo`. Así queda lo que no es el foco: sin color y quieto, para que no se confunda con lo que se está diciendo.
- **`enCurva`** `(de: THREE.Vector3, a: THREE.Vector3, alto: number, t: number)`: Un punto de una curva de `de` a `a` que sube `alto` en medio (t de 0 a 1).
- **`Ventana`** `[entra: number, sale: number]`: Cuándo está en escena: [cuadro en que entra, cuadro en que sale], los dos con `en`. Varias, si sale y vuelve.
- **`presencia`** `(f: number, ventanas: Ventana[], fps = 30)`: Cuánto está en escena (0 → 1) lo que sale en estas ventanas: entra con un resorte y sale en 10 cuadros.
- **`EnEscena`** `{ ventanas: Ventana[]; pos: V3; escala?: number; giro?: number; children: React.ReactNode }`: Lo que está en escena solo en sus ventanas de tiempo: crece desde su `pos` al entrar y se encoge al salir. Quieto: no flota ni gira por su cuenta. Lo de adentro va en [0, 0, 0]: si va en su sitio del mundo, al entrar viaja desde el origen. `giro`: cuánto gira sobre su eje vertical, en radianes (Math.PI / 2, un cuarto de vuelta: lo que miraba a +z mira a +x).

## `src/modelos/icono-3d.tsx`

Un logo o un ícono extruido.

- **`Icono3D`** `{ icono: string; color?: string; degradado?: string; gris?: number; apaga?: number; fondo?: string; capa?: number }`: Un ícono de Phosphor (`modelos.py iconos <nombre>` lo deja en public/iconos) o un SVG de public, extruido, de 1 de alto. `color` lo pinta todo (un ícono); sin él, cada trazo con el suyo (un logo), y lo que viene en degradado toma `degradado`. `gris` (0–1) lo pasa a gris y `apaga` (0–1) lo funde con `fondo`. `capa`: cuánto va cada trazo delante del anterior (0.03; un logo de muchas piezas que no se enciman, 0.002). Mira a +z; se coloca, escala y gira con el `EnEscena` que lo envuelve.
