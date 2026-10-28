# La investigación y el guion

El guion lo lee el usuario en voz alta, así que se escribe para decirse: frases cortas, palabras de todos los días y
cada cifra en letra. Y cada cosa que dice tiene que poder verse: si una frase no tiene imagen, se cambia o se le busca.
La forma no es fija: la pide el tema (ver "El enfoque").

## Antes de empezar

Del usuario necesitas **el tema**; si falta, pregúntalo antes de investigar. Con una serie (la línea `Serie:`) no
falta: lo eliges tú (ver "Series" en `SKILL.md`). El cierre es el de la marca (ver "La marca" en `SKILL.md`).

## Investigar

En `fuentes/investigacion.md`, antes de escribir una sola frase, **en corto y sin prosa** (es la prueba de cada
dato, no un texto para leer; en los primeros videos se escribían 7.000 letras):

- **La fecha y la hora del corte** arriba («Corte de datos: 17 de octubre de 2026, 17:43 UTC»): lo que cambia (un
  precio, una cifra de usuarios) vale en ese momento.
- **La ficha**: qué es en dos frases, quién lo hizo, de dónde salió, y los nombres que van a salir (con su logo).
- **La historia con fechas**, una viñeta por hecho: cómo empezó, qué pasó, lo que dijeron los propios protagonistas,
  cómo está hoy.
- **Cada cifra, en una tabla** `| dato | valor | fuente (enlace) | marca |`, con su marca:
  - **[PRIMARIA]**: lo dice el propio protagonista (su sitio, su documentación, su cuenta oficial), un documento
    (un estudio, un registro oficial, un reporte) o un dato crudo de una fuente guardado en `fuentes/datos/`;
  - **[SECUNDARIA]**: solo lo dicen medios, y se nombra cuál;
  - **[DUDOSO]**: las fuentes chocan, o solo hay una débil;
  - **[NO ENCONTRADO]**: se buscó y no está.
  Las que salen de un cálculo tuyo dicen «cálculo» y su fórmula. Al video solo van las primarias y las secundarias de
  medios serios; una dudosa no se dice.
- **Las citas textuales**, con su enlace: son las pruebas del video (`Prueba`), y de cada una solo se enseña la frase
  que importa.

Dónde buscar depende del tema: la fuente oficial primero (el sitio y la cuenta del protagonista, sus documentos), luego
los registros públicos (estudios, organismos, la SEC para empresas), y los medios al final. Las series de datos, de su
fuente y guardadas con la fecha, a `fuentes/datos/`; lo que usa el video, a `src/datos/` como `[[ms, valor], …]`.
En crypto, por ejemplo: la documentación, el X y el foro del proyecto, el explorador de bloques, los precios de
Binance (`/api/v3/klines`) o CoinGecko (`/coins/<id>/market_chart`) y el dinero depositado de DefiLlama.

Los logos, todos en una llamada: `python -B -X utf8 <skill>/scripts/logos.py <nombre>[=x:<cuenta>|sitio:<dominio>|<url>]…`
los deja en `public/logos/<nombre>.png` (256 px) y en una hoja, `fuentes/logos/hoja.png`, para mirarlos de un vistazo.
Reddit ya viene en la plantilla.

## La duración

No hay un largo fijo: **dura lo que pide lo que hay que contar**. Primero decide qué tiene que entender el que lo ve y
qué cuenta para llegar ahí; el largo sale de eso. Luego, frase por frase: si quitarla no deja nada sin entender, se va.

- **El ritmo es fijo, el largo no.** La voz va a ~224 palabras por minuto (`acelerar.py` la acerca), o sea ~3.7
  palabras por segundo: cuenta las palabras del guion y divide. Berachain: 333 palabras, 90 s.
- **Más corto si alcanza.** Si el tema se explica en 40 s, son 40 s. El gancho y el cierre siempre van; lo que se acorta es
  el medio.
- **Más largo solo con más que contar.** Si el usuario pide más tiempo, o el tema da para más, se amplía con otro punto,
  más contexto, una comparación, una consecuencia o lo que sigue, cada uno con su prueba y su imagen. Nunca repitiendo,
  dando vueltas ni hablando más lento.
- **Si el usuario pide un largo** (p. ej. «menos de un minuto»), se cumple: se queda lo esencial y se dice qué quedó
  fuera.

Al darle el guion, dile cuánto va a durar.

## El enfoque: cada tema, su video

Antes de escribir, decide qué clase de video pide el tema y escríbelo en `fuentes/huella.json`. **Ningún video copia
la forma ni la imagen de otro cambiando los nombres**: si el guion nuevo se puede contar con la misma estructura que el
anterior, o se ve con los mismos colores, el mismo lugar y el mismo primer cuadro, está mal aunque la historia sea
otra. Qué choca con los videos ya hechos lo dice `huellas.py revisar` con la huella (abajo).

El enfoque dice, cada cosa en una línea (va dentro de la huella, abajo):

- **El género**: qué es este video (abajo, los más comunes; se mezclan o se inventan otros).
- **De dónde sale su lenguaje**: cómo se cuenta y cómo se ve eso en su mundo real, y qué se toma de ahí. Una historia
  de Reddit se cuenta y se ve como una historia de Reddit (el post, su sub, el usuario, los votos, los comentarios, el
  EDIT); una noticia, como una noticia; un cómo funciona, como un plano o un manual; un récord, como una competencia.
- **La forma** del guion, parte por parte, con sus palabras de paso.
- **El registro**: cómo suena (con suspenso, de confidencia, de reportero, de profe, indignado, de chisme).
- **El mundo**: qué lugar es, con su ambiente (su piso, sus paredes o su horizonte), y cómo lo recorre la cámara (ver
  [`MUNDO.md`](MUNDO.md)); quién es el protagonista y dónde está en el cuadro.
- **Los colores**: los dos fondos y la luz, sacados del lugar (la sala de noche con la luz de la tele, la cámara fría
  en azul hielo, el escritorio con su lámpara). Van a `PALETA` en `src/tema.ts`.
- **El primer cuadro**: qué se ve en el segundo cero. Lo que pide la serie (el título del post) se puede enseñar de
  muchas maneras: en la pantalla de algo del mundo, en un celular, impreso, en una tarjeta.
- **La pieza propia**: lo que solo tiene este video (en Berachain, el calendario de mesa y la barra de confianza que
  se vacía).

Todo va en un solo archivo, `fuentes/huella.json`: la **huella**, cada cosa en pocas palabras (de tres a diez: lo
que la distingue, sin lo que tienen todos los videos, como el perro, el texto o «un piso vacío»; con frases largas,
todas se parecen), y en `enfoque` lo que la huella no dice, en una línea cada cosa. Nada de repetirlo en otro archivo:

```json
{"serie": "Historias de Reddit", "tema": "mandó un bitcoin a la cartera fría de Huobi por pegar mal la dirección",
 "forma": "caso sin resolver de ocho años", "apertura": "el post de Reddit en la ventanilla de la cámara fría",
 "lugar": "un frigorífico industrial", "protagonista": "un bitcoin que se congela",
 "pieza": "un portapapeles gigante", "paleta": ["#14233a", "#e3eef5"], "objetos": ["camara-fria", "portapapeles"],
 "enfoque": {"genero": "una historia, como expediente de un caso sin cerrar",
             "lenguaje": "el post, su sub, los votos y el EDIT; la ficha de un expediente",
             "partes": "el post · quién era · el pegado · ocho años de intentos · el EDIT · la lección",
             "registro": "de confidencia, en voz baja", "luz": "fría, de tubo, con vaho",
             "camara": "entra por la ventanilla y recorre los anaqueles; al final sale por la puerta"}}
```

`apertura` es el primer cuadro; `paleta`, los dos fondos de `PALETA`; `objetos`, los modelos de la biblioteca que más
se ven. `serie` va en `null` si no tiene. `python -B -X utf8 <base>/scripts/huellas.py revisar <skill>` la compara: el
tema, con todos los videos; lo demás, con los dos últimos, y con los anteriores si se parece a uno en tres cosas. Si
choca, cambia el enfoque, no las palabras de la huella. `--aunque "<por qué>"` la reserva igual: solo para lo que se
llama parecido y se ve distinto.

Al darle el guion al usuario, cuéntale el enfoque en dos o tres líneas.

### Los géneros más comunes

Cada uno con su forma. Lo que se queda en todos: un gancho con un dato o un momento que obliga a quedarse, y la frase
de cierre de la marca (si su red no es `ninguna`). Lo demás (el «pero primero», la lista numerada, el «hoy») va solo si el género
lo pide.

- **Explicar algo** (un proyecto, cómo funciona, por qué pasó). Es el de Berachain: el gancho (el dato que sorprende y
  una vuelta: «En 2024, los fondos pagaron tres dólares por cada BERA… Hoy vale dieciocho centavos.»), «Pero primero:
  ¿qué es…?» con algo conocido de comparación, cómo funciona paso a paso, el giro en unas pocas cosas numeradas con un
  índice 1 · 2 · 3 arriba («¿Entonces qué falló?»), cómo está hoy con sus números y el cierre («¿Revive o se apaga?»).
  El guion entero: [`ejemplos/berachain/guion.md`](ejemplos/berachain/guion.md).
- **Una historia** (de Reddit, de un foro, de alguien a quien le pasó algo). Se cuenta como un cuento, en orden y con
  tensión, no como una explicación: quién era y qué quería, la decisión o el descuido, el momento en que todo se tuerce
  (con la hora exacta, los segundos), lo que hizo después y cómo acabó. Lo técnico se explica dentro de la historia, en
  una frase, justo cuando hace falta, nunca en un «pero primero» aparte. Sin lista numerada salvo que la historia la
  traiga. Si es de Reddit: el título del post, citado, es el gancho, y la voz la cuenta como historia de otro, nunca en
  primera persona como si le hubiera pasado al usuario; los comentarios más votados son las reacciones, con sus votos;
  el EDIT o la actualización del autor es el giro final. En la imagen, el post rehecho (el sub, la hora, los votos)
  con el usuario tapado o cambiado, y los comentarios igual (`Post` y `Comentario` de `src/piezas/reddit.tsx`). Más
  en [`series/reddit.md`](series/reddit.md).
- **Una noticia**: lo que pasó, primero y en una frase; quién y cómo se supo; por qué importa al que lo ve; qué
  sigue. Registro de reportero, al día y con la hora del corte.
- **Una comparación** (X contra Y): las dos en escena todo el video, por rondas, cada una con su marcador; el ganador
  al final, o que decida el que lo ve.
- **Un cómo se hace**: el resultado primero, luego los pasos que se ven hacer, con lo que sale mal si se hace distinto.
- **Un misterio**: la pregunta primero, las pistas una por una (cada una descarta algo) y la respuesta al final.
- **Un perfil** (una persona, una marca): su momento más grande primero, luego cómo llegó ahí y dónde está hoy.
- **Una caída o un ascenso**: el antes y el después en el gancho, y el camino entre los dos con sus fechas.

## La voz

- **No anuncies lo que vas a decir: dilo.** Nada de ponerle título o etiqueta a una parte antes de contarla («Tres: la
  trampa. Le quedaban…», «El problema: …», «Dato curioso: …», «Ahora, la parte buena»). En una lista numerada, el
  número va solo y enseguida va la cosa: «Tres: le quedaban seiscientos dólares en Compound…». Dicho en voz alta,
  nombrar algo antes de decirlo suena raro.
- **Nada de «lo que…:» para aplazar un dato.** «Y lo que él vio antes de comprar: en el explorador solo había
  compras.», «Lo peor: …», «Y lo mejor de todo: …», «Todos le preguntaron lo mismo: …». Es relleno: hace esperar el
  dato sin añadir nada, y casi siempre repite algo que ya se dijo. Si el dato es nuevo, dilo directo; si ya se dijo,
  quita la frase. Repasa el guion entero buscando dos puntos antes de dárselo al usuario.
- **Las cifras, en letra** en `guion.md` («dieciocho centavos», «sesenta y nueve por ciento»): el alineador no sabe
  situar dígitos. En los subtítulos sí van en número.
- **Frases cortas**, de una idea. Un dato por frase.
- **Sin exagerar ni vender**: informa y deja la pregunta. Si el tema es de dinero, nada de consejo de inversión.
- **Los nombres del tema** (personas, marcas, lugares, términos técnicos) van en `terminos.txt`, uno por renglón: así el
  transcriptor los escribe bien.
- Habla como dice `habla` en la marca (cómo habla el usuario: su país, de tú o de usted).

## Los subtítulos

`subtitulos.txt` es el texto (arriba en vertical, abajo en horizontal), una frase por renglón, tal como se ve (máximo
dos renglones en pantalla; las mismas frases en los dos formatos). Lo
mecánico lo hace `python -B -X utf8 <skill>/scripts/subtitulos.py`: parte `guion.md` en renglones de unas 30 letras y
junta las cifras como se ven y como se dicen (`$10=diez_dólares`, `96%=noventa_y_seis_por_ciento`, `11:58=once_cincuenta_y_ocho`,
`2015=dos_mil_quince`). Luego se marca a mano, y se juntan las fechas o cifras que no juntó y se rehace un corte feo:

- `*palabra*` en negrita: lo que carga sentido. El resto va en gris.
- `[palabra]` con la caja de selección azul (y negrita): una por frase, la que importa.
- `{Icono}palabra` lleva un ícono delante: un nombre de Phosphor (`{LockSimpleOpen}liberó`) o una imagen de public
  (`{logos/berachain.png}Berachain`). **Nunca un emoji.**
- `visto=dicho_con_guiones` cuando lo que se ve no es lo que se dice: `[$3=tres_dólares]` se ve «$3» y aparece cuando
  la voz dice «tres». El guion bajo junta palabras en una sola ficha (`Proof_of_Liquidity`).

## Los archivos

- `guion.md`: el título, la línea del corte de datos y el texto que el usuario lee, en párrafos (el estudio de Sloth
  le pone «Copiar»).
- `subtitulos.txt` y `terminos.txt`.
- `fuentes/huella.json` (la huella y el enfoque), `fuentes/investigacion.md`, `fuentes/datos/`, `src/datos/` y
  `public/logos/`.
