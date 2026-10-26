---
name: ideas-vertical
description: Propone ideas de video vertical para TikTok e Instagram, con meta de ventas, a partir de la investigación que hizo Sloth en su nicho (outliers medidos contra su cuenta, guardados y compartidos por mil), con un método de demanda y empaque llevado al formato corto — primer cuadro, gancho de 3 segundos, variantes de lo que ya funcionó y riesgo dicho sin rodeos — y prepara una idea elegida para grabarla. La lanza la sección Ideas de Sloth en un canal de TikTok e Instagram; úsala también cuando pidan qué video corto o vertical hacer, ideas para TikTok, Reels o Shorts con evidencia, o preparar un video vertical para grabar.
---

# Ideas para video vertical

Trabajas en la carpeta de un canal vertical (TikTok e Instagram) de la sección Ideas de Sloth. La sección enseña al
usuario cada archivo que escribes, según aparece: escribe en la raíz de la carpeta y no crees subcarpetas.

Lo que ya está aquí:

- `canal.json`: el perfil. `formato: 'vertical'`, `handle` (su TikTok), `instagram` (su cuenta de Instagram), `publico` (a
  quién le habla y quién compra), `meta` (qué vende), `semillas` (lo que su público escribe en el buscador),
  `vecinos` (nichos con la misma intención) y `referencias` (`@cuenta` de TikTok o `instagram.com/cuenta`).
- `diagnostico.md`, si existe: lo que ya se vio en los números de su cuenta. Son pistas, no conclusiones.
- `resumen.json`: **léelo primero, entero.** Es la investigación ya contada por Sloth, solo con lo que trajo el perfil de
  hoy:
  - `criterios`: cómo se contó todo. Léelo antes que los números.
  - `muestra`: cuántas búsquedas, cuentas, videos medidos, outliers y videos con comentarios leídos (`conDestacados`)
    hay, cuántos se transcribieron (`transcritos`) y cuántos no tienen voz (`sinVoz`). `pasanSuMediana` es la base: la
    mitad de los videos pasa la mediana de su cuenta por definición. Si trae `sinInvestigar`, son términos o cuentas del
    perfil que no se pudieron leer: de ellos no hay evidencia, y dilo. `porIdioma` cuenta los videos medidos en español,
    en inglés, en otro idioma y sin saber.
  - `señales`: la mediana de guardados, compartidos y comentarios por cada mil vistas, en todos los videos medidos de los
    demás y en sus outliers. Es la base para decir que un video «se guarda mucho»: compáralo con estas medianas.
    `porIdioma` da las de los outliers en español y en inglés por separado: cada outlier se compara con los de su idioma.
  - `tusCuentas`: una por red, con su `mediana`, su `muestra`, sus `señales` y sus `videos`, del mejor al peor. De ahí
    salen el `piso` y tus outliers, que son la evidencia más fuerte que hay.
  - `busquedas`: cada frase dos veces, una por `red` (`'tiktok'` e `'instagram'`, ver «Las dos redes»), con su mediana,
    sus cuentas, el `feed` (los 6 primeros que enseña la red: contra eso compite el primer cuadro) y sus outliers. Las de
    `vecino: true` son nichos vecinos: de ahí salen formatos de gancho para `formatos.md`, no la demanda del tema. Las de
    `idioma: 'en'` son frases en inglés, otro vecino (ver «El idioma»), y aun así traen videos en español: mira el idioma
    de cada outlier.
  - `otrosOrigenes`: los outliers de las referencias.
  - `cuentas`: cada cuenta con su red, su idioma (el de la mayoría de sus videos), mediana, muestra (o `sinMedir`, si dio
    pocos videos), seguidores, de dónde salió y cuántos outliers tiene.
  - `comentariosBajos`: los outliers con comentarios inusualmente pocos, aparte.
  - `comentarios`: `{ id: ["♥91 texto", …] }`, los comentarios con más likes de los mejores outliers. Ahí se lee qué pide la
    gente, con sus palabras.
  - `formulas`: patrones sobre la **descripción** del video, no sobre el texto en pantalla. Dicen poco del gancho.
  - `ganchos`: lo mismo, pero sobre lo que se **dice** en los primeros 3 segundos (hasta acabar la frase), por tipo de
    gancho (pregunta, cifra, «si…», lista…), y en cuántas cuentas. «Comenta X» se busca en todo el video. Este sí habla
    del gancho: del dicho, no del que se ve.
  - `temas`: los videos agrupados por lo que dicen (descripción y transcripción, con un modelo multilingüe), aunque usen
    otras palabras u otro idioma. Por tema: su `nombre` (sus palabras distintivas, no un título), videos, medidos,
    outliers, cuántos pasan su mediana, en qué redes y en qué idiomas, sus mejores outliers y sus ejemplos.

  Cada outlier es una línea:
  `id · tiktok · en · 7.3× · 210 mil vistas · 38 guard/mil · 4.1 comp/mil · 1.2 com/mil · 45 s · 2026-10-02 · @cuenta · «descripción» · también de: …`.
  El idioma va tras la red (`es`, `en` u otro) y falta si no se sabe. Puede llevar `· pagado` (ver «Lo que no cuenta»).
  Termina en `· dice: «…»`, su gancho dicho, o en `· sin voz`; si no es en español, puede llevar además
  `· en español: N parecidos (0,84)` o `· nada parecido en español` (ver «Lo que viene del inglés»).
  Un outlier tiene 3× o más la mediana de su cuenta **y** al menos 10 mil vistas. La mediana de una cuenta sale de sus
  últimos 30 videos, sin los fijados ni los de menos de 3 días.
- `investigacion.json`: lo que Sloth leyó de TikTok e Instagram, entero y grande. **No lo leas entero:** consúltalo solo
  para lo que el resumen no trae, con un script corto que imprima solo lo que buscas. Por ejemplo, todos los videos de una
  cuenta:

  ```
  node -e "const d=require('./investigacion.json'); for (const v of d.videos.filter(v => v.canal.includes('USUARIO')).sort((a,b)=>(b.x??0)-(a.x??0))) console.log((v.x??0).toFixed(1), v.red, v.idioma??'', v.vistas, v.guardados??'', v.compartidos??'', v.fecha??'', v.titulo)"
  ```

  - `terminos`: cada búsqueda, con su `red`, cuántos videos dio (`largos`), la mediana de sus vistas y `ids`, el feed en
    orden.
  - `canales`: cada cuenta, con su `red`, su `usuario`, su mediana, de cuántos videos sale (`videos`) y sus seguidores
    (`subs`).
  - `videos`: todos los videos leídos, no solo los buenos. `titulo` es la descripción, no el texto que se ve en el video.
    Llevan `red`, `idioma`, `url`, `x`, `fecha`, `likes`, `comentarios`, `guardados`, `compartidos`, `fijado` y, en los
    mejores outliers, `destacados` (los comentarios con más likes). `de` es la lista de búsquedas o referencias de donde
    salió (`'tu canal'` es tu TikTok; `'tu instagram'`, tu Instagram). La investigación se acumula de una vuelta a otra y
    guarda también lo que trajeron términos o referencias que ya no están en `canal.json`: **eso no cuenta**; usa solo
    los videos cuyo `de` nombre algo del `canal.json` de hoy. `gancho` es lo que dice en sus primeros 3 segundos;
    `sinVoz`, que se transcribió y no habla; sin `transcrito`, no hay transcripción (aún no, o no se pudo).
- `transcripciones/<id>.json`: lo que se dice en cada video, entero, sacado de su audio con el Whisper de Sloth:
  `segmentos` (`inicio` y `fin` en segundos, y `texto`) y el `texto` seguido. Léela con Read. Lo que se ve (el primer
  cuadro, el texto en pantalla) no está ahí. Un video `sinVoz` tiene el gancho en la imagen: no lo cuentes entre los
  ganchos dichos, y dilo.
- `portadas/<id>.jpg`: la portada de los outliers, de los primeros de cada búsqueda y de tus videos. Es casi siempre el
  primer cuadro, con el texto del gancho: lo único que deja ver lo que no se dice (ver «Ir más a fondo»).
- `estado.json`: lo que el usuario hizo con las ideas de antes (`elegidas[id].estado`: `elegida` o `descartada`).
- `ideas.json`, `demanda.md` y `formatos.md` de una vuelta anterior, si existen, y `anteriores/`.

Si no hay `resumen.json` (la skill se lanzó fuera de Sloth), saca esas cuentas tú de `investigacion.json`, con scripts. Si
tampoco hay `investigacion.json`, no hay evidencia: dilo, y pide que se investigue desde la sección Ideas de Sloth.

La carpeta de la app (el repo de Sloth) está tres niveles arriba de esta (`../../..`): ahí están `AGENTS.md`, que dice
qué es Sloth y qué vende, y `cards.json`, con los estilos de video.

Si existe `METODO.md` junto a esta skill, tiene el método completo, con su porqué y lo que cambia en vertical: léelo antes
de empezar.

## El idioma

Quien compra está en México y paga en pesos: **su demanda se lee en español.** Un outlier en inglés no prueba que su
comprador quiera el tema. El inglés es un **nicho vecino** (decisión 4 del método), y en vertical las modas suelen llegar
antes en inglés: lo que funciona allá y **aún no existe en español** es una oportunidad.

## Las dos redes

Cada frase del perfil se busca en TikTok y en Instagram. **Lee cada red por separado y después juntas:** un tema con
outliers en las dos es una señal más fuerte que en una sola; uno que solo funciona en una dice dónde publicarlo (el `red`
de la idea).

**En Instagram, las vistas solo cuentan donde se midieron.** Su búsqueda no da vistas: sus Reels traen likes y
comentarios, y las vistas llegan al medir la cuenta del autor con la API oficial, hasta 5 cuentas profesionales por
frase. La `mediana` de una búsqueda de Instagram sale solo de los Reels que quedaron con vistas; los que no se midieron
(cuenta personal) quedan fuera de todo cálculo. Entre ellos, los likes y los comentarios sirven para compararlos entre
sí, pero no son vistas: no los mezcles con medianas ni con ×.

## Las herramientas

Sloth le da al hilo cinco herramientas que leen en vivo. Nada de lo que traen se guarda en `investigacion.json`.

- `mcp__ideas__buscar_tiktok({ termino })`: los ~24 primeros videos de una búsqueda (vistas, guardados, compartidos y
  comentarios por mil, fecha, `@cuenta` con sus seguidores, descripción) y la mediana de vistas. Marca el idioma de cada
  video. Con una frase en inglés pide resultados en inglés, pero TikTok localiza por el país de la cuenta (México) y aun
  así cerca de la mitad sale en español.
- `mcp__ideas__buscar_instagram({ termino })`: lo mismo en Instagram, con likes y comentarios en vez de vistas. Busca con
  una cuenta de investigación de Instagram aparte, porque la API de Meta no deja buscar.
- `mcp__ideas__cuenta_tiktok({ usuario })`: los últimos 30 videos de una cuenta, cada uno con su × contra la mediana de
  la cuenta.
- `mcp__ideas__comentarios_tiktok({ usuario, video })`: los comentarios con más likes de un video.
- `mcp__ideas__cuenta_instagram({ usuario })`: los Reels de una cuenta profesional de Instagram. Solo funciona con el
  token de Meta; si falta, la herramienta lo dice.

Cada llamada abre TikTok o Instagram con una cuenta real, a ritmo de persona: es lenta. Haz **como mucho unas 10
llamadas por vuelta** (una entrevista, o una propuesta), en lo que el resumen deja abierto. Si no tienes estas
herramientas, sigue sin ellas y di qué quedó sin probar.

Aparte, `mcp__ideas__parecidos({ texto })` o `({ video: id })` busca en la investigación ya hecha, sin abrir ninguna red:
los videos que dicen algo más parecido, en las tres redes y en cualquier idioma. No cuenta en las 10.

## Armar el canal (entrevista)

Lo pide «Armar el canal con preguntas» o «No sé, pregúntame» junto a un campo. El usuario no sabe todavía qué poner: tu
trabajo es sacarle esa información con preguntas y dejarla en `canal.json`. Es el primer paso: entender al
público a fondo antes de buscar nada.

**Cómo preguntar:**

- **Una pregunta por mensaje**, corta y en lenguaje llano, sin jerga («nicho», «awareness», «outlier», «engagement»).
  Después de preguntar, termina tu turno y espera la respuesta.
- **Pon de 2 a 4 ejemplos para elegir** debajo de la pregunta, numerados. Sácalos de lo que ya sabes: lo que haya en
  `canal.json` y lo que vende si es Sloth (`AGENTS.md` de la app). Él puede contestar «la 2», mezclar o escribir otra cosa.
- **Si contesta «no sé», pregunta lo mismo desde otro lado**, con una situación concreta: «Piensa en la última persona
  que te escribió interesada: ¿qué hacía?».
- **Guarda cada respuesta en `canal.json` en cuanto la tengas**, sin esperar al final: la sección lo enseña en vivo.
  Conserva `id`, `creado` y `formato` tal cual; los demás campos son `nombre`, `handle`, `instagram`, `publico`, `meta`,
  `semillas` (lista), `vecinos` (lista) y `referencias` (lista).
- **Si te pidieron un campo concreto, empieza por ese.** Luego ofrece seguir con los que falten.

**Si hay otro canal de Ideas con perfil** (`../*/canal.json` con `publico` y `meta`), ofrece primero partir de su público
y su meta, como una de las opciones. Sus semillas, si las quiere, se vuelven a probar en las dos redes.

**Qué averiguar, en orden:**

1. **Qué vende** (`meta`): qué es, cuánto cuesta y dónde se compra. Si no vende nada, para qué son las cuentas.
2. **Quién compra** (`publico`): una persona concreta, no «todo el mundo». Qué hace, qué quiere lograr, qué ha intentado
   y por qué no le funcionó, y si ya sabe que existe algo como lo que vende o solo conoce el problema. Escríbelo en una o
   dos frases, como lo diría el usuario.
3. **Sus cuentas:** su TikTok (`handle`) y su Instagram (`instagram`), y el **nombre** del canal en Sloth, si aún dice
   «Canal nuevo».
4. **Lo que su público escribe en el buscador** (`semillas`). Propón de 6 a 8 frases de 2 a 5 palabras, como las
   escribiría esa persona y no como las diría un experto, y de 3 a 4 en inglés, como las escribiría quien busca eso en
   inglés (ver «El idioma»). Pruébalas en las dos redes antes de proponerlas, dentro de las mismas 10 llamadas: primero
   las de español, en `mcp__ideas__buscar_tiktok` y en `mcp__ideas__buscar_instagram`; las que no quepan se proponen sin
   medir, y lo dices. Enséñale una tabla corta, una fila por frase y red: videos, mediana de vistas y mediana de
   guardados por mil; en Instagram, de cuántos Reels medidos sale la mediana, y en las de inglés, cuántos videos salieron
   de verdad en inglés. Explica cuál pide más su público: la mediana dice cuánto se ve el tema; los guardados, cuánto lo
   quiere usar. Deja que quite o cambie. Las palabras sueltas («Tiktok», «IA») traen otros públicos: propón frases.
5. **Cuentas que ya ve o conoce** (`referencias`): pregunta cuáles, y escríbelas como `@cuenta` (TikTok) o
   `instagram.com/cuenta` (Instagram). Propón además de 2 a 3 cuentas en inglés del nicho, de las que salieron en inglés
   en esas búsquedas: Sloth lee enteras las referencias, y desde México es la forma fiable de ver el inglés.
6. **Nichos vecinos** (`vecinos`): de 3 a 5 temas con la misma intención que su público, aunque sean de otra cosa. Por
   ejemplo, alguien que quiere vender con videos también ve «cómo crecer en tiktok» o «marketing para emprendedores».
   Explica en una frase por qué cada uno, y prueba los que quepan en las 10 llamadas.

Al terminar, enseña el perfil completo en pocas líneas y dile que ya puede pulsar «Investigar» en la sección Ideas.

## Proponer ideas

Lo pide el botón «Proponer ideas». Escribe tres archivos, en este orden.

### 1. `demanda.md`: qué temas tienen señales de demanda

Los temas que el público de `canal.json` ya elige ver, con su evidencia en español. Son señales, no pruebas: un outlier
dice que un video superó a su cuenta, no por qué. Por cada tema, en una sección `## Tema`:

- Los outliers que lo respaldan (descripción, `@cuenta`, red, `x`, vistas, guardados por mil y fecha), en cuántas
  cuentas distintas salió y en qué redes (ver «Las dos redes»). Un outlier suelto es una pista; varios del mismo tema en
  cuentas distintas son una señal más fuerte. Dilo así.
- La frase con la que el público lo pide: compara las medianas y los guardados por mil de los términos parecidos, en
  cada red.
- Si atrae al público que compra o solo a curiosos. Se ve en los guardados y compartidos por mil contra `señales`, y en
  lo que piden sus `comentarios`. Las vistas solas no lo dicen.

Empieza por `tusCuentas`: cada outlier tuyo es un tema con demanda probada en tu propio público. Luego, `temas` del
resumen: cada uno es un candidato, con su evidencia ya contada. Tú decides cuáles son de verdad un tema para este
público, juntas o partes los que haga falta y les pones nombre. Los outliers siguen siendo la prueba: un tema con muchos
videos y pocos que pasan su mediana (contra `muestra.pasanSuMediana`) es oferta, no demanda.

Después, una sección `## Lo que viene del inglés`: los temas y formatos con outliers en inglés, con su evidencia, y si
ya existen en español. Parte de lo que trae la línea de cada outlier: `· en español: N parecidos` dice que la
investigación ya tiene algo así en español (míralos con `mcp__ideas__parecidos({ video: id })` y di sus vistas y su `x`);
`· nada parecido en español`, que no lo encontró. Parecido es que dice lo mismo, no que lo haga igual: un formato puede
seguir sin existir en español aunque el tema exista. Confirma los «nada parecido» que vayas a proponer con
`mcp__ideas__buscar_tiktok` en español y di qué salió: «no hay nada así» o «ya existe, con estas vistas». Lo que aún no
existe es la oportunidad.

Cierra con una sección `## Lo que no cuenta`: los outliers que descartaste y por qué, con el dato. Descarta lo que no
parece orgánico, lo viejo en un tema que caduca y lo que es de otro público (un viral fuera de tema también).

- **Comentarios inusualmente bajos** (`comentariosBajos` del resumen; el umbral, en `criterios`): puede ser publicidad
  pagada (Spark Ads infla las vistas con pocos comentarios y pocos guardados), o una cuenta con los comentarios cerrados.
  Míralo antes de descartarlo, y si lo descartas, di el dato, no «es un anuncio».
- **Pagado** (`· pagado`): una colaboración pagada en Instagram. Sus vistas no son demanda orgánica: descártalo como
  demanda, con el dato.
- **Viejo en un tema que caduca:** en IA y tecnología, lo de hace más de 12 meses vale poco. Un formato de moda puede
  caducar antes que su tema: si todos sus outliers son de hace meses, dilo.

### 2. `formatos.md`: cómo empaquetarlo

En el feed no hay título ni miniatura: el empaque es **el primer cuadro y el texto en pantalla**, y la estructura del
video. Este archivo trata de formatos de gancho, de primer cuadro y de estructura que funcionan con un público de la misma
intención, de este nicho o de los vecinos.

Antes de escribirlo, **lee completas las transcripciones** de los 10 a 15 mejores outliers y de unos 5 videos normales
(`x` cerca de 1) de esas mismas cuentas, y mira sus portadas (ver «Ir más a fondo»): la transcripción dice el gancho
dicho; la portada, el que se ve. Este script los elige; pon al final los ids que descartaste en `demanda.md`:

```
node -e "const d=require('./investigacion.json'), c=require('./canal.json'), hoy=new Set([c.semillas,c.vecinos,c.referencias,'tu canal','tu instagram'].flat()), fuera=new Set(process.argv.slice(1)), vale=v=>v.transcrito&&!v.sinVoz&&!fuera.has(v.id)&&v.de.some(x=>hoy.has(x)), top=d.videos.filter(v=>vale(v)&&v.x>=3&&v.vistas>=10000).sort((a,b)=>b.x-a.x).slice(0,15), normal=[...new Set(top.map(v=>v.canalId))].map(id=>d.videos.filter(v=>vale(v)&&v.canalId===id&&v.x>0.7&&v.x<1.4).sort((a,b)=>Math.abs(a.x-1)-Math.abs(b.x-1))[0]).filter(Boolean).slice(0,5); for (const v of [...top,...normal]) console.log(v.id, v.x.toFixed(1)+'x', v.red, v.idioma??'', v.canal, '·', v.titulo.slice(0,80))" ID_DESCARTADO …
```

Compara cómo abren los que funcionan con los que no: qué dicen en el segundo 0, cuándo enseñan el resultado, cuándo
llega lo que se guarda. Es mirar dónde falló la fórmula. Cita sus palabras exactas, con su id y su segundo.

Por cada formato, en una sección `## Formato`:

- **Por qué funciona.** La psicología: qué teme o qué quiere el espectador en los primeros 3 segundos.
- **Su tasa de éxito en la investigación.** Empieza por `ganchos` del resumen, que cuenta lo dicho; `formulas` lee la
  descripción y dice menos. Cuántos videos con el patrón pasaron la mediana de su cuenta (`x` > 1), cuántos son
  outliers, en cuántas cuentas, y sus guardados por mil contra `señales`. Compárala con `muestra.pasanSuMediana`: un
  formato solo destaca si pasa clara de esa base. Mira sus ejemplos y, si no cuadra, cuéntalo tú en `investigacion.json`
  con un script. Si hay pocos, dilo: «2 de 2, muy poca muestra».
- **En qué idioma se probó:** español, inglés o los dos, con sus outliers en cada uno.
- **Lo que exige de la ejecución**, sacado de las transcripciones y las portadas: la duración de sus outliers, qué se
  enseña en el segundo 0 y qué tiene que existir ya (el resultado que se enseña primero tiene que ser real).

### 3. `ideas.json`: las ideas

De 5 a 8 ideas, de la más segura a la más arriesgada. Cada una es un tema de `demanda.md` empaquetado con un formato de
`formatos.md`. Las más seguras son **variantes de tus outliers** (los de `tusCuentas`): se conserva lo que funcionó y se
cambia una sola cosa. En resumen: si no te da nervios arruinar la idea, todavía no es la idea. Pocas y buenas.

```json
{
  "generadas": 1760000000000,
  "terminosNuevos": ["términos que convendría buscar en TikTok la próxima vez"],
  "ideas": [
    {
      "id": "i1",
      "tema": "el tema con demanda, en pocas palabras",
      "titulo": "el texto del primer cuadro: el gancho en pantalla",
      "titulos": [
        { "texto": "otra variante del gancho en pantalla", "formato": "el formato de gancho", "porque": "por qué este público se quedaría" }
      ],
      "miniatura": "lo que se ve en el primer cuadro: tres elementos como máximo, con el resultado ya enseñado",
      "evidencia": ["id de un video de investigacion.json", "…"],
      "termino": "la búsqueda de investigacion.json cuyo feed es la competencia directa",
      "ejecucion": "duración (15–60 s), la estructura por segundos (0–3 s …, 3–20 s …) y por qué ese estilo",
      "estilo": "el id de la card de cards.json con que se hace",
      "red": "tiktok | instagram | ambas",
      "gancho": { "promesa": "…", "prueba": "…", "plan": "…", "persona": "…" },
      "porque": "por qué debería funcionar con estas cuentas: qué se conserva de lo probado y qué es lo único que cambia",
      "riesgo": "qué podría fallar, y la evidencia en contra",
      "piso": 400,
      "techo": 200000,
      "cta": "Comenta X y te mando…: la palabra, y lo que recibe quien la comenta"
    }
  ]
}
```

- **`titulos`** son variantes del gancho para el laboratorio: el mismo video con otro texto en el primer cuadro, para
  publicar en días distintos o una en cada red.
- **`evidencia`** solo lleva ids que existen en `investigacion.json`. La interfaz dibuja cada uno con su portada y marca
  los que no encuentra. Lo que encontraste con las herramientas no está ahí: cítalo en `porque` o en `demanda.md` (con su
  `@cuenta`, vistas y fecha) y pon su término en `terminosNuevos`, para que la próxima vuelta lo mida.
- **`gancho`** son las 4 P en 3 segundos: promesa y persona de inmediato; la prueba es enseñar el resultado primero, y
  tiene que ser algo que el usuario de verdad tiene; el plan, apenas. Se apoya en cómo abren los outliers que leíste y
  viste, y `porque` dice en cuál, con sus palabras. Si su evidencia no está transcrita, o es `sinVoz` y su portada no
  enseña el gancho, no está comprobado: dilo en `riesgo`.
- **`estilo`** es el `id` de una card de `cards.json` que hace video (las que tienen `etapas`). Elígela por su
  `description` y por lo que la idea necesita enseñar. Si ninguna puede hacerlo (la idea pide su cara o su pantalla en
  vivo), déjalo fuera y dilo en `ejecucion`.
- **`piso`** son las vistas realistas en las cuentas del usuario: mira la `mediana` de su cuenta en `tusCuentas`, en la
  red de `red`; con `ambas`, la de la cuenta con la mediana más baja. Si no hay cuenta en esa red, o es nueva, va en
  cientos. No lo infles: el usuario decide con este número. Los seguidores no entran: en TikTok casi no limitan.
- **`techo`** es lo que sacaron los outliers comparables en español.
- **Una idea que trae algo del inglés** (tema, formato o gancho) lo dice en `porque`, y en `riesgo`, que en español no
  está probado.
- **`piso` y `techo` son estimaciones tuyas, no pronósticos:** nadie las ha calibrado contra los resultados de la cuenta.
  La interfaz las enseña así; no las presentes como seguras en `porque`.
- **`cta`** solo va si `canal.meta` es vender algo. Es «Comenta X y te mando…»: el video crea una necesidad que no puede
  cubrir solo, el regalo la cubre, y cada comentario con la palabra es alguien interesado que se puede contar. El producto
  entra como lo que hace posible el resultado, no como anuncio.
- **No repitas las ideas descartadas** de `estado.json`. Una idea que mejoras conserva su `id`; una nueva lleva un id que
  nunca se usó (mira también los de `anteriores/*/ideas.json`).
- **Las ideas elegidas no se quitan nunca.** Si `estado.json` marca una como `elegida`, sigue en `ideas.json` con su mismo
  `id`, aunque la investigación nueva la debilite: mejórala y dilo en su `riesgo`. No le des ese `id` a otra idea: es lo
  que la une a su hilo. Antes de cada vuelta, Sloth guarda la anterior en `anteriores/<fecha>/`, así que puedes reescribir
  el archivo sin miedo a perder nada; y si al terminar falta una elegida, Sloth la vuelve a poner como estaba.
- **`terminosNuevos`** son los términos que salen de las descripciones y los comentarios de los outliers, o de tus
  búsquedas con las herramientas, y que convendría buscar en la siguiente vuelta.

Al terminar, di en el chat cuál harías primero y por qué, en dos o tres frases.

### Ir más a fondo, si hace falta

Usa las herramientas en lo que el resumen deja abierto, dentro de las 10 llamadas:

- un término nuevo que se repite en los outliers: `mcp__ideas__buscar_tiktok`;
- lo que el resumen deja abierto en Instagram (un tema que solo salió en TikTok, una frase con pocos Reels medidos):
  `mcp__ideas__buscar_instagram`;
- algo que funciona en inglés, para ver si ya existe en español: `mcp__ideas__buscar_tiktok` con la frase en español;
- un outlier que no trae comentarios, para saber qué pide la gente: `mcp__ideas__comentarios_tiktok`;
- la cuenta de un outlier, para ver si el formato le funciona siempre o fue suerte: `mcp__ideas__cuenta_tiktok` (o
  `mcp__ideas__cuenta_instagram`).

Lo que dice un outlier está en su transcripción; el texto en pantalla y el primer cuadro no vienen en ningún dato, y la
descripción no es el gancho. **Mira su portada:** `portadas/<id>.jpg` es casi siempre el primer cuadro, a menudo con el
texto del gancho encima. Ábrela con Read (es una imagen) antes de escribir `formatos.md`, en los 8 a 12 mejores
outliers; en un `sinVoz`, es todo su gancho. Si no está, o no se ve gancho, lo que sabes del video sale de lo que dice,
su descripción y sus comentarios: dilo en `riesgo` y pon el outlier en `evidencia`, para que el usuario lo vea antes de
grabar.

## Preparar para grabar

Lo pide «Lo grabo yo» con el id de una idea. Escribe `esquema-<id>.md`, para un video de 15 a 60 segundos. Es lo que el
usuario abre antes de grabar.

Antes de escribirlo, **lee completas las transcripciones de la `evidencia` de la idea** y mira sus portadas. Saca de ellas
la estructura que funcionó: en qué segundo llega cada parte, dónde va el primer valor, dónde la llamada a la acción y cómo
cierra (y si empalma con el principio). El guion y la tabla se modelan sobre eso y citan los tiempos («el resultado, en
el segundo 1, como en ID»). Si un video de la evidencia no tiene transcripción, dilo arriba del esquema.

1. **El primer cuadro:** qué se ve y el texto en pantalla, en pocas palabras grandes, fuera de las zonas que tapa la
   interfaz (en 1080×1920: los 220 px de arriba, los 480 de abajo, los 160 de la derecha y los 80 de la izquierda).
   Sale de las portadas de la evidencia.
2. **Variantes del gancho:** tres textos para el primer cuadro, con su formato, para probar uno por día o uno en cada red.
3. **El guion entero, palabra por palabra.** En corto sí se escribe entero: cada segundo está contado. Mídelo contra la
   duración (a ritmo de habla normal caben de 2 a 3 palabras por segundo), y que el final empalme con el principio:
   TikTok repite el video solo.
4. **El texto en pantalla, segundo a segundo**, en una tabla: segundo, lo que se dice, el texto en pantalla y lo que se
   ve. El resultado se enseña en los primeros 3 segundos.
5. **La llamada a la acción**, si la hay: en qué segundo, la frase («Comenta X y te mando…»), qué se manda y cómo se
   contesta a quien comenta.
6. **La descripción y los hashtags**, una para TikTok y otra para Instagram. La descripción casi no cuenta en el feed,
   pero sí en el buscador: lleva la frase con que busca su público. Si hay llamada a la acción, la repite.
7. **Qué preparar antes de grabar:** cuentas, archivos y lo que tiene que estar ya hecho para enseñarlo primero.
8. **Con qué estilo de Sloth hacerlo, si no lo graba él:** la card (`estilo`) y el mensaje para pedírselo, con el guion y
   la duración.
