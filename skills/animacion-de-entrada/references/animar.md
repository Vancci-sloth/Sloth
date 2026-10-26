# Animar la entrada en CSS

El código real está en `ejemplo-sloth/splash.css` (las clases `splash-*`), `index-entrada.html` y `splash.ts`. Aquí van
las técnicas y por qué se hicieron así.

## Dónde vive

- **El SVG va dentro de `index.html`** (`<div id="splash" class="splash" aria-hidden="true">…</div>` antes del
  `#root`), y el CSS en un `<link rel="stylesheet" href="./splash.css">` en el `<head>`.
  - Corre desde el primer fotograma, sin esperar a React ni al bundle: no hay pantalla en blanco ni salto.
  - Las animaciones empiezan todas a la vez, cuando la página se pinta por primera vez: ese es el cero del guion.
- **Contenedor** `position: fixed; inset: 0; z-index: 2147483647`, con fondo propio (en Sloth un degradado radial
  oscuro).
  - **`pointer-events: none` y `user-select: none`:** la entrada es solo una imagen, y un clic durante ella llega a la
    app que ya carga debajo.
- **La tipografía del nombre** con su propio `@font-face` y `font-display: block`, para que el nombre no salga primero
  con otra letra. En Sloth, Lora de `./fonts/`.
- **Nada de JS para animar.** `splash.ts` solo decide cuándo se va. Así la entrada no depende de cuándo llegue el
  código.

## El guion

Escríbelo en la cabecera del CSS antes de animar, momento a momento con sus segundos. Todos los `animation-delay`
salen de ahí. El de Sloth:

> 0–0,8 se dibuja · 0,8–1,15 teclea · 1,15–1,5 se asusta · 1,4–1,7 cierra el portátil · 1,6–2,2 se convierte en el
> logo · 2,1–2,5 brillo y nombre · 2,35–2,75 guiño · 2,8 sale.

- **Duración:** unos 2,8 s hasta poder irse y ~3,3 s con la salida. Una entrada más larga cansa. La primera versión de
  Sloth duraba 1,8 s y era solo el logo; la buena cuenta una historia en menos de 3.
- **Curvas con nombre**, como variables en el contenedor, para que todo el movimiento hable igual:
  - `--entrada: cubic-bezier(0.22, 1, 0.36, 1)`: llega y frena.
  - `--rebote: cubic-bezier(0.34, 1.56, 0.64, 1)`: se pasa y vuelve. Para lo que brota.
  - `--cambio: cubic-bezier(0.65, 0, 0.35, 1)`: entra y sale suave. Para los morph.
  - `--trazo: cubic-bezier(0.6, 0.05, 0.3, 1)`: para la mano que dibuja.
- **Paleta** como variables (`--ambar`, `--ambar-vivo`, `--crema`, `--oscuro`), sacada de la marca.

## Dibujarse con su línea

La pieza (de grosor variable) va enmascarada por un trazo blanco gordo que recorre su **línea central**:

```html
<mask id="splash-trazo-cabeza" maskUnits="userSpaceOnUse" x="-30" y="-20" width="600" height="600">
  <use href="#splash-centro-cabeza" class="splash-trazo splash-trazo-cabeza" transform="matrix(...)" />
  <rect class="splash-revela" x="-30" y="-20" width="600" height="600" />
</mask>
<path class="splash-s" mask="url(#splash-trazo-cabeza)" d="…" />
```

```css
.splash-trazo { stroke: #fff; stroke-linecap: butt; stroke-dasharray: 1 1.2; stroke-dashoffset: 1.1; }
.splash-trazo-cabeza { stroke-width: 100; animation: splash-dibuja 0.62s var(--trazo) 0.05s forwards; }
@keyframes splash-dibuja { to { stroke-dashoffset: 0; } }
```

- **`pathLength="1"`** en la línea central: el guion y el hueco se miden en fracciones del recorrido (de 0 a 1), sea
  cual sea su largo.
- **`stroke-dasharray: 1 1.2; stroke-dashoffset: 1.1`:** el hueco es más largo que el trazo y empieza desplazado, así
  que al principio no asoma nada. Con `1 1` y `1.001` asomaba un punto en cada extremo.
- **`stroke-linecap: butt`**, nunca `round`: Chromium pinta el remate redondo en el arranque de la línea aunque el trazo
  aún no haya llegado, y se ve un punto antes de empezar.
- **`.splash-revela`:** un `rect` blanco dentro de la máscara que aparece en cuanto acaba de dibujarse. Así la máscara
  deja de recortar, y la pieza puede cambiar de forma (morph) sin salirse del trazo.
- **Recoger la línea** (la cola que se retrae): la animación inversa del mismo trazo, `stroke-dashoffset` de 0 a 1.1.

## La tinta caliente y la punta del pincel

Encima de lo que se dibuja, la tinta recién puesta sale ámbar y se enfría a crema:
- **Tinta:** tres tramos de la misma línea central (`<use>`), cada uno con un `stroke-dasharray` corto (`0.035 3`,
  `0.09 3`, `0.18 3`), más tenues cuanto más largos (`opacity` 1, 0,55, 0,25). Avanzan sincronizados con la máscara
  (sus `@keyframes splash-tinta-N` salen del generador: de `largo+0.1` a `largo-1`).
- **Recortes y apagado:** van recortados con `clip-path` a la forma de la pieza, y el grupo se apaga
  (`splash-se-apaga`) al terminar.
- **La punta del pincel:**
  - un punto (`stroke-dasharray: 0.0001 3`, `stroke-width: 26`, color `#fff6e3`) que viaja con `stroke-dashoffset`
    de 0,1 a −1;
  - un halo ámbar debajo, desenfocado con `feGaussianBlur stdDeviation="9"`;
  - se apaga al levantar el pincel.
- **Reutilizar con `<use>`:** la línea central se define una vez en `<defs>` (`<path id="splash-centro-cabeza"
  pathLength="1" d="…">`) y cada trazo la usa con `<use href="#…" class="…">`. El `<use>` hereda el `pathLength` y
  anima su propio guion. En Sloth el marcado bajó de 63 KB a 42 KB.

## Brotar, morph y cambiar de dibujo

- **Brotar** (los parches, la nariz, las pupilas, el teclado): `opacity 0 → 1` y `scale(0.3) → none` con `--rebote`,
  escalonados unos 60 ms entre piezas.
- **Origen de cada transformación:** `.splash-logo * { transform-box: fill-box; transform-origin: center; }`. Cada pieza
  se escala desde su propio centro, no desde el del SVG.
  - **Trampa:** lo que ya lleva un atributo `transform` de dibujo (el portátil, metido a la escala del logo con
    `matrix(...)`) se descoloca con eso. Se arregla con
    `.splash-logo [transform] { transform-box: view-box; transform-origin: 0 0; }`.
- **Morph:** cada pieza lleva en el SVG su forma de partida, y una animación la lleva a la del logo:

  ```css
  .splash-parche-izq { animation: splash-brota 0.5s var(--rebote) 0.32s forwards, splash-a-logo-izq 0.44s var(--cambio) 1.74s forwards; }
  @keyframes splash-a-logo-izq { to { d: path("…mismos comandos que el de partida…"); } }
  ```

  Las dos formas tienen que tener los mismos comandos (`morph.mjs`). Varias animaciones en una pieza van separadas por
  comas, cada una con su retraso.
- **Lo que no es del logo se va:** el portátil y la cola bajan y se funden (`splash-baja`). La cola se recoge por su
  línea.
- **Encuadrar:** el grupo de la escena (`.splash-encuadre`) se desplaza al final para que el logo quede centrado donde
  antes estaba el dibujo grande.

## Dibujo animado de verdad

Lo que hace que no parezca una transición de diapositivas:
- **Anticipación:** antes de saltar, la cabeza se encoge un instante; antes de cerrarse de golpe, la tapa se abre un
  poco más. El `splash-cierra` va de 0 % a 1 → 22 % a 1.06 → 72 % a 0.06, con curvas distintas por tramo
  (`animation-timing-function` dentro de cada fotograma clave).
- **Estirar y encoger:** el salto del susto es `scale(1.04, 0.95)` → `translateY(-26px) scale(0.97, 1.04)` →
  `scale(1.02, 0.98)`.
- **Inercia:** la tapa se abre con rebote (60 % a 1.08, 80 % a 0.97), y el brazo se aparta antes de irse.
- **La cámara:** un grupo (`.splash-camara`) que tiembla con `translate` de pocos px en el susto y en el golpe.
- **Acciones secundarias:**
  - la luz de la pantalla le ilumina la cara (un `radialGradient` ámbar que aparece y se corta al cerrar);
  - mientras teclea suben unos iconos (play, punto, barra);
  - del susto salen un «!» y unas rayitas (`pathLength="1"` y su guion);
  - del golpe salen polvo (círculos con `--dx`/`--dy` propios) y una onda (una elipse que crece y se apaga);
  - un fogonazo de luz acompaña el susto y la llegada del logo.
- **Las pupilas cuentan la historia:** miran a la pantalla (`translate` 5px 4px), y del susto vuelven al frente y se
  encogen.
- **El final con personalidad:** ladea la cabeza, sube la mejilla, guiña (un párpado del color del fondo del ojo que
  baja con `scale: 1 0 → 1 1`, y la línea del ojo cerrado) y sale un destello ✦ (un trazo en forma de estrella de cuatro
  puntas que gira y se apaga).
  - **Trampa:** el párpado, la pupila y el parche de un ojo van en un mismo grupo (`.splash-ojo-der`) que se anima
    entero. Si se animan por separado, se ve doble el arco del ojo.
- **El brillo que cruza el logo:**
  - un `rect` con degradado lineal blanco, inclinado (`skewX(-18deg)`), recortado a la forma del logo con `clipPath`,
    que cruza con `translateX`;
  - **Trampa:** su posición de partida tiene que quedar fuera del dibujo (en Sloth `x="-320"` y `translateX(940px)`); con
    `-150` asomaba en los primeros fotogramas como una media luna gris.
- **El nombre:**
  - cada letra sube con desenfoque (`translateY(16px)`, `blur(6px)` → nada), escalonadas 45 ms;
  - el espaciado se cierra (`letter-spacing` de 0.32em al suyo).
- **Ambiente:**
  - un halo ámbar que respira detrás (`::before`, `scale` 1 → 1.08 cada 3,2 s);
  - un grano de papel apenas visible (`::after` con `feTurbulence` en un SVG de datos, `opacity: 0.07`,
    `mix-blend-mode: overlay`).

## La salida: un iris que abre la app

```css
@property --splash-hueco { syntax: '<length>'; inherits: true; initial-value: 0px; }
.splash.saliendo {
  mask-image: radial-gradient(circle at 50% 46%, transparent calc(var(--splash-hueco) - 1px), #000 var(--splash-hueco));
  animation: splash-iris 0.5s cubic-bezier(0.6, 0, 0.25, 1) 0.16s forwards;
}
@keyframes splash-iris { to { --splash-hueco: 160vmax; } }
```

- **`@property`:** sin registrarla, una variable no se interpola y el agujero saltaría de golpe. Con `inherits: true`,
  la usa también el aro.
- **Borde nítido** (`- 1px`) y un **aro ámbar** con resplandor (`.splash-aro`, de `2 × hueco` de diámetro) que se apaga
  al abrirse. Con borde difuso, sobre una app clara se veía una mancha borrosa.
- **El logo y el nombre se van primero:** se acercan y se desenfocan (`scale(1.12)`, `blur(3px)`, 0,26 s), y el iris
  empieza 0,16 s después.

## Movimiento reducido

```css
@media (prefers-reduced-motion: reduce) {
  .splash *, .splash::before { animation-duration: 0.01s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
  /* lo que solo es adorno (guiño, destello, cámara, polvo, brillo, tecleo...) */ { animation: none !important; }
  .splash-aro { display: none; }
  .splash.saliendo { mask-image: none; animation: splash-se-funde 0.2s ease-out forwards !important; }
}
```

Las animaciones que dejan el estado final (los morph, el dibujo) se acortan a 0,01 s; las de adorno se quitan. Sale el
logo final quieto con su nombre, y se va con un fundido. El sonido tampoco suena (`sonido.md`).

## Cuándo se va (`splash.ts`)

Plantilla en `ejemplo-sloth/splash.ts`:
- **`startSplash()`:** lo llama el punto de entrada (`main.tsx`) al cargar. Arranca el sonido y escucha `keydown` y
  `pointerdown` (en captura) para saltarla.
- **`dismissSplash()`:** la llama la app cuando ya puede enseñarse (en Sloth, un efecto en `App` cuando hay estado o
  error). Espera a `ENTRANCE_MS` (2780) contado desde `performance.now()`, que empieza con la página. Si se la saltaron,
  se va ya.
- **`dismissSplash({ now: true })`:** la quita al momento. Es para ventanas que no la llevan, como la de lectura de
  Sloth.
- **`leave()`:**
  - añade `saliendo` y despide el sonido;
  - la quita del DOM en `animationend` del iris, o a los `EXIT_MS` (900) como red: en una ventana oculta los
    fotogramas se frenan y el evento puede no llegar.
- **Tamaño:** lo bastante grande para leerse en la ventana real (en Sloth, 280 px de logo en una ventana de ~1100×760).
