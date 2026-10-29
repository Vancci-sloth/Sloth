# Series

Las series son formatos fijos del canal que sirven para cualquier nicho y cualquier estilo, cada una en su archivo: qué
es, dónde buscar el tema y cómo elegirlo, qué tiene que pasar en el video y temas de ejemplo. Las de todos los estilos
están en [`series/`](series/) de la base; un estilo puede tener además las suyas en `<skill>/series/` (con el mismo
nombre, la suya manda). Sloth las enseña al crear un video y, si el usuario elige una, el mensaje trae la línea
`Serie: <nombre> (<archivo>)`, con la ruta desde la carpeta de las skills.

- Lee ese archivo antes de investigar. Manda sobre lo general del estilo en el tema y en lo que tiene que pasar; la
  forma, la imagen y el tono siguen siendo los del estilo. Lo que la serie dice de otro estilo (un género de su guion,
  una pieza de su plantilla), tradúcelo a lo que tenga el tuyo.
- **El nicho** es el del canal: el de la marca del estilo si la guarda (`nicho`); si no, el de lo que pidió el usuario o
  el de sus videos de antes. Si no hay de dónde sacarlo, elige uno general y dilo al darle el guion.
- **Si el usuario no dio un tema**, elígelo tú con "El tema, si no te dieron uno" de la serie, sin preguntar.
  **Primero el banco** (menos en Noticias, que caducan): `python -B -X utf8 <base>/scripts/banco.py ver <skill> <serie>`
  enseña las candidatas que otros videos del estilo ya buscaron, leyeron y comprobaron, y si alguna ya se hizo. Si una
  cumple lo que pide la serie y no se hizo, `banco.py tomar <skill> <serie> <enlace>`, vuelve a leer su fuente y
  comprueba lo que diga `comprobado` que falta. Si ninguna sirve, busca, compara y decide; todos los candidatos en una
  sola llamada (cargar los vectores tarda): `python -B -X utf8 <base>/scripts/huellas.py buscar <skill> "<tema 1>"
  "<tema 2>" "<tema 3>" --serie "<serie>"`. **Las que leíste y no usaste, al banco** con `banco.py guardar <skill>
  <serie> '<json>'` (su enlace, votos, el momento en que se tuerce y qué comprobaste): son el próximo video. Al darle el
  guion, dile por qué esa y otras dos opciones.
- **Si dio un tema**, haz ese, con lo que pide la serie.
- **Si el estilo parte de una grabación del usuario** y aún no la trae, la serie da el tema y el guion que va a grabar;
  si ya la trajo, dice qué tiene que pasar en el montaje.
- Mientras esperas un render, si el banco de la serie (menos Noticias) tiene menos de tres libres, lanza en segundo
  plano un subagente con tu mismo modelo: «llena el banco de `<serie>`: sigue "El tema, si no te dieron uno" de
  `<archivo de la serie>`, busca y lee historias que no estén ya en el banco ni hechas (`<base>/scripts/banco.py ver
  <skill> <serie>` y `huellas.py buscar`), comprueba lo que se pueda y guarda tres con `banco.py guardar`; no toques
  ningún proyecto». Así el siguiente video no empieza a buscar de cero.

Una serie nueva es un archivo más en `series/` (de la base si sirve a cualquier estilo, de la skill si es solo suya),
con la misma forma: el título en la primera línea `# `, que es el nombre que enseña Sloth.
