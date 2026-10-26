# Vectorizar un dibujo pieza a pieza

Para animar un dibujo hay que tenerlo en vectores, y cada parte que se mueve por su cuenta tiene que ser su propio trazo.
Se sacan del bitmap original (el logo de la marca, un dibujo del usuario) para que lo que se ve sea **el dibujo real**,
no una aproximación.

Herramientas: `potrace` (bitmap → Bézier), `pngjs` (leer y escribir píxeles) y `svg-path-properties` (muestrear
trazos).

## 1. Ver las manchas

```
node trazar-piezas.mjs logo.png listado.json
```

Sale cada mancha conexa con su número de píxeles y su caja. En el logo de Sloth salieron: la «S» con los parches unidos,
el parche izquierdo, las dos pupilas y la nariz. El parche derecho tocaba la «S».

- **Logo con fondo transparente:** la tinta es el alfa (`--canal alfa`, por defecto).
- **Dibujo plano de líneas claras sobre fondo oscuro**, como el perezoso con portátil (1254×1254): usa `--canal luz`.
  Si es tinta oscura sobre blanco, añade `--invertir`.

Para entender dónde se tocan dos piezas, mira el bitmap en ASCII alrededor de la zona:

```
node -e "const {PNG}=require('pngjs');const p=PNG.sync.read(require('fs').readFileSync('logo.png'));
for(let y=150;y<300;y+=3){let s=String(y).padStart(3)+' ';for(let x=380;x<480;x++)s+=p.data[(y*p.width+x)*4+3]>127?'#':'.';console.log(s)}"
```

## 2. Cortar, nombrar y partir

```
node trazar-piezas.mjs logo.png logo.json \
  --corte 441,250,449,348,2 \
  --pieza s=60,250 --pieza ojoIzq=120,220 --pieza ojoDer=400,215 --pieza nariz=255,250 \
  --pieza pupilaIzq=158,203 --pieza pupilaDer=353,203 --resto s --mascaras mascaras
```

- **`--corte x1,y1,x2,y2,ancho[,pieza]`:** borra una franja entre dos puntos para separar dos piezas que se tocan.
  - Con `pieza`, los píxeles borrados van a esa pieza y no queda una raya vacía.
  - Si van a cambiar de forma por separado, deja que la pieza de delante solape 3–4 px a la de detrás. En Sloth el parche
    derecho tapaba la unión con la «S». Así no se ve la costura.
- **`--pieza nombre=x,y`:** la mancha bajo ese punto se llama así. El punto tiene que caer en tinta: búscalo en el
  listado o en el ASCII.
- **`--zona nombre=x0,y0,x1,y1@de`:** parte una pieza que es una sola línea. En el portátil, la cola sigue hasta formar
  la pantalla y el teclado:

  ```
  node trazar-piezas.mjs portatil.png portatil.json --canal luz --corte 945,548,936,665,2,cabeza \
    --pieza cabeza=200,500 --pieza ojoDer=760,420 --pieza ojoIzq=330,500 --pieza pupilaIzq=432,465 \
    --pieza pupilaDer=811,463 --pieza nariz=620,550 --pieza cola=120,900 --pieza brazo=300,840 --pieza manzana=930,875 \
    --zona pantalla=652,0,1254,1032@cola --zona teclado=412,955,656,1032@cola --resto brazo --mascaras mascaras-portatil
  ```

- **`--resto`:** a dónde va lo que no nombra nadie, por ejemplo los dedos sueltos del brazo.
- **`--mascaras`:** guarda cada pieza como PNG (negro sobre blanco), para `centro.mjs`.

**Salida:** `{ancho, alto, piezas: {nombre: d}}`. Los trazos van con 1 decimal. Una pieza con agujero (el parche con el
hueco de la pupila) sale con dos subtrazos (`M…M…`) y se pinta con `fill-rule="evenodd"`.

## 3. Comprobar superponiendo

Pinta cada pieza de un color y semitransparente sobre el original, y captúralo:

```html
<body style="margin:0;background:#141210"><svg viewBox="0 0 512 512" width="560" height="560">
  <image href="logo.png" width="512" height="512" opacity=".35"/>
  <path d="…s…" fill="#f2e7cf" opacity=".85"/> <path d="…ojoIzq…" fill="#e8a33d" fill-rule="evenodd" opacity=".85"/> …
</svg></body>
```

```
electron capturar.cjs superpuesto.html superpuesto.png 300 560 560
```

Míralo con Read. Tiene que coincidir sin huecos ni rebabas.

**Para dos dibujos que van a transformarse uno en otro**, superpón los dos: uno de colores y el otro como contorno
magenta, con la matriz que los pone a la misma escala. Ajusta la matriz hasta que los rasgos que cambian (los ojos, la
nariz) caigan en su sitio. En Sloth, `matrix(0.5145 0 0 0.5145 -64.3 -36.2)`: escala por el tamaño de la cabeza y
desplazamiento por los ojos.

## 4. La línea central (para dibujarse con su línea)

Un trazo de grosor variable no se puede «dibujar» animando su borde. Se descubre con una máscara: un trazo blanco muy
gordo que avanza por su línea central. Esa línea sale del esqueleto de la pieza.

```
node centro.mjs mascaras/s.png 449,343 14 > centro-s.txt
```

- Calcula el esqueleto con adelgazamiento de Zhang-Suen, toma el camino más largo desde el extremo más cercano a
  `x,y` (por donde empieza a dibujarse) y lo suaviza a Bézier cada `paso` px.
- Por la salida de errores dice el medio grosor máximo. El `stroke-width` del trazo que descubre debe ser como mínimo
  el doble más un margen: en Sloth eran 24 px de medio grosor, y se usó 62 en el logo y 100 en la cabeza del portátil
  (que va a escala 0,51).
- **Si el esqueleto no tiene extremos (es un anillo):** corta la pieza para abrirla.
- **Si tiene ramas:** el camino más largo ignora las ramas cortas. Cuando hay varias partes (cabeza y cola), saca una
  línea por cada una.

**Compruébalo:** pinta la línea central encima de la pieza (`stroke="#f0f"`) y captúralo. Tiene que ir de extremo a
extremo por dentro.

## 5. Parejas de morph (de un dibujo a otro)

CSS solo interpola `d: path()` entre dos trazos con **los mismos comandos en el mismo orden**. `morph.mjs` rehace los dos
con N puntos muestreados a igual distancia y los alinea:
- mismo sentido de giro;
- el desfase con menos distancia total, para que no se retuerza.

```
node morph.mjs portatil.json logo.json morph.json --matriz 0.5145,-64.3,-36.2 --css splash-a-logo \
  --par cabeza:s:260 --par ojoIzq:ojoIzq:110,44 --par ojoDer:ojoDer:120,44 --par nariz:nariz:72 > morph.css
```

- **Puntos por subtrazo:** 260 para la «S» grande, 110 + 44 para un parche con su agujero, 72 para la nariz. Pocos
  deforman las curvas; muchos inflan el CSS (la «S» ya son unos 9 KB).
- **El SVG** lleva `d` = `desde` y la animación termina en `hasta` (`@keyframes … { to { d: path("…") } }`). Con
  `forwards`, se queda en el logo.
- **Si las piezas no tienen los mismos subtrazos** (uno tiene agujero y el otro no), dale un agujero mínimo al que no
  lo tiene, o haz un fundido solo de esa pieza.
- **Para un morph entre formas inventadas** (gota → play → cabeza → «S», la propuesta 2 de Sloth), es lo mismo:
  muestrea cada forma con N puntos y alinea cada una con la anterior, normalizadas por su centroide y su tamaño para que
  formas de distinto tamaño se alineen por el ángulo.

## Por qué a mano y no un vectorizador automático

Un vectorizador entero (potrace sobre todo el dibujo) da una sola mancha con agujeros: no se puede animar por partes, ni
dibujar con su línea, ni transformar en otra cosa. El trabajo está en **separar por lo que se mueve**. Por eso se nombra
cada pieza por un punto y se corta donde la historia lo pide.
