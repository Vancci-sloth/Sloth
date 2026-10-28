---
name: ideas-youtube
description: Propone ideas de video largo para un canal de YouTube a partir de la investigación que hizo Sloth en su nicho (outliers medidos contra su canal), con un método de demanda y empaque — señales de demanda, empaque tomado de nichos vecinos, gancho de 4 P y riesgo dicho sin rodeos — y prepara una idea elegida para grabarla. La lanza la sección Ideas de Sloth; úsala también cuando pidan qué video hacer en un canal, ideas con evidencia, o preparar el esquema de una idea para grabar.
---

# Ideas para YouTube

Trabajas en la carpeta de un canal de la sección Ideas de Sloth. La sección enseña al usuario cada archivo que escribes,
según aparece: escribe en la raíz de la carpeta y no crees subcarpetas.

Lo que ya está aquí:

- `canal.json`: el perfil. `publico` (a quién le habla y quién compra), `meta` (para qué es el canal), `semillas` (lo que se
  buscó), `vecinos` (nichos con la misma intención), `referencias` y `handle` (el canal del usuario, si lo hay).
- `resumen.json`: **léelo primero, entero.** Es la investigación ya contada por Sloth, para que no la rehagas a mano, y
  solo con lo que trajo el perfil de hoy:
  - `criterios`: cómo se contó todo. Léelo antes que los números.
  - `muestra`: cuántas búsquedas, canales, videos medidos y outliers hay, de cuántos se leyó la fecha, cuántos se
    transcribieron (`transcritos`) y cuántos no tienen voz (`sinVoz`). `pasanSuMediana` es la base: la mitad de los
    videos pasa la mediana de su canal por definición. Si trae `sinInvestigar`, son términos o canales del perfil que no
    se pudieron leer: de ellos no hay evidencia, y dilo.
  - `tuCanal`: la mediana del canal del usuario y sus videos, del que mejor le fue al peor. De ahí sale el `piso`.
  - `busquedas`: cada búsqueda con su mediana, lo primero de su feed y sus outliers, del mayor `x` al menor. Cada outlier
    es una línea con su id, `x`, vistas, duración, fecha (o «sin leer»), comentarios por mil y si es viejo, y termina en
    `· dice: «…»`, lo que dice en sus primeros 30 segundos, o en `· sin voz`. Las de `vecino: true` son nichos vecinos:
    de ahí salen fórmulas de empaque para `formatos.md`, no la demanda del tema.
  - `otrosOrigenes`: los outliers de los canales de referencia.
  - `comentariosBajos`: los outliers con comentarios inusualmente bajos, aparte.
  - `canales`: cada canal con su mediana, de cuántos videos largos sale (`muestra`) y cuántos outliers tiene.
  - `formulas`: candidatos a fórmula de título por patrón, con cuántos pasan su mediana, cuántos son outliers, en
    cuántos canales, y los mejores y los peores.
  - `ganchos`: lo mismo, pero sobre lo que se dice en los primeros 30 segundos, por tipo de gancho (pregunta, cifra,
    «si…», lista…). «Comenta X» se busca en todo el video.
  - `temas`: los videos agrupados por lo que dicen (título y transcripción, con un modelo multilingüe), aunque usen
    otras palabras u otro idioma. Por tema: su `nombre` (sus palabras distintivas, no un título), videos, medidos,
    outliers, cuántos pasan su mediana, en qué idiomas, sus mejores outliers y sus ejemplos.
- `investigacion.json`: lo que Sloth leyó de YouTube con yt-dlp, entero (más de 600 KB). **No lo leas entero:** consúltalo
  solo para lo que el resumen no trae, con un script corto que imprima solo lo que buscas. Por ejemplo, todos los videos
  de un canal:

  ```
  node -e "const d=require('./investigacion.json'); for (const v of d.videos.filter(v => v.canal.includes('NOMBRE')).sort((a,b)=>(b.x??0)-(a.x??0))) console.log((v.x??0).toFixed(1), v.vistas, v.fecha??'', v.titulo)"
  ```

  - `terminos`: cada búsqueda, con cuántos videos largos dio (4 min o más), la mediana de sus vistas y `ids`, el feed en
    orden.
  - `canales`: la mediana de vistas de sus últimos videos largos, y de cuántos sale (`videos`). `propio: true` es el del
    usuario.
  - `videos`: todos los videos leídos de esos canales, no solo los buenos. `x` es vistas ÷ mediana de los videos largos
    de su canal, sin redondear; solo lo llevan los videos largos de un canal medido. `de` es la lista de búsquedas o
    referencias de donde salió (`'tu canal'`, el del usuario). La investigación se acumula de una vuelta a otra y guarda
    también lo que trajeron términos o referencias que ya no están en `canal.json`: **eso no cuenta**, ni como
    evidencia ni en tus cuentas; usa solo los videos cuyo `de` nombre algo del `canal.json` de hoy. `fecha` (`'2026-09-14'`), `likes` y `comentarios` están cuando se pudieron leer; con
    `leido` y sin `fecha`, el video ya no está en YouTube. `gancho` es lo que dice en sus primeros 30 segundos;
    `sinVoz`, que se transcribió y no habla; sin `transcrito`, no hay transcripción (aún no, o no se pudo). Un outlier
    tiene `x` de 3 o más **y** al menos 1.000 vistas: en un canal con mediana diminuta (uno que saca 1 vista, o TEDx,
    que sube tantas charlas que las últimas tienen decenas) cualquier video parece outlier, y eso es ruido. Los
    suscriptores no entran en la cuenta.
- `transcripciones/<id>.json`: lo que se dice en cada video, entero, sacado de sus subtítulos: `segmentos` (`inicio` y
  `fin` en segundos, y `texto`) y el `texto` seguido. Con Read, la de un video largo pasa de mil líneas: imprímela con
  sus tiempos así (el segundo número, opcional, corta en ese segundo):

  ```
  node -e "const [id,hasta=1e9]=process.argv.slice(1), t=require('./transcripciones/'+id+'.json'); for (const s of t.segmentos) if (s.inicio<hasta) console.log(Math.floor(s.inicio/60)+':'+String(Math.floor(s.inicio%60)).padStart(2,'0'), s.texto)" ID 300
  ```

  Lo que se ve (la pantalla, el texto encima, la miniatura) no está ahí. Un video `sinVoz` tiene el gancho en la
  imagen: no lo cuentes entre los ganchos dichos, y dilo.
- `estado.json`: lo que el usuario hizo con las ideas de antes (`elegidas[id].estado`: `elegida` o `descartada`).
- `ideas.json`, `demanda.md` y `formatos.md` de una vuelta anterior, si existen.
- `rendimiento.json`, `studio.json` y `diagnostico.md`, si el canal es el que el usuario conectó en YouTube: cómo le fue
  a sus propios videos largos y lo que se concluyó de eso (ver «Diagnosticar tus videos»).

Si no hay `resumen.json` (la skill se lanzó fuera de Sloth), saca esas cuentas tú de `investigacion.json`, con scripts.

Sloth le da al hilo `mcp__ideas__parecidos({ texto })` o `({ video: id })`: los videos de la investigación que dicen algo
más parecido, en las tres redes y en cualquier idioma. Sirve para juntar la evidencia de un tema que se dice con otras
palabras y para ver si una idea ya existe. En `evidencia` van solo los ids de este `investigacion.json`. Si no tienes la
herramienta, sigue sin ella.

Si existe `METODO.md` junto a esta skill, tiene el método completo, con las fórmulas de título conocidas y su porqué:
léelo antes de empezar.

## Armar el canal (entrevista)

Lo pide «Armar el canal con preguntas» o «No sé, pregúntame» junto a un campo. El usuario no sabe todavía qué poner: tu
trabajo es sacarle esa información con preguntas y dejarla en `canal.json`. Es el primer paso: entender al
público a fondo antes de buscar nada.

**Cómo preguntar:**

- **Una pregunta por mensaje**, corta y en lenguaje llano, sin jerga («nicho», «awareness», «outlier»). Después de
  preguntar, termina tu turno y espera la respuesta.
- **Pon de 2 a 4 ejemplos para elegir** debajo de la pregunta, numerados. Sácalos de lo que ya sabes: lo que haya en
  `canal.json` y lo que vende si es Sloth (lee `AGENTS.md` en la carpeta de la app). Él puede contestar «la 2», mezclar o
  escribir otra cosa.
- **Si contesta «no sé», no insistas igual.** Pregunta lo mismo desde otro lado, con una situación concreta: «Piensa en la
  última persona que te escribió interesada: ¿qué hacía?».
- **Guarda cada respuesta en `canal.json` en cuanto la tengas**, sin esperar al final: la sección lo enseña en vivo.
  Conserva `id` y `creado` tal cual; los demás campos son `nombre`, `handle`, `publico`, `meta`, `semillas` (lista),
  `vecinos` (lista) y `referencias` (lista).
- **Si te pidieron un campo concreto, empieza por ese.** Luego ofrece seguir con los que falten.

**Qué averiguar, en orden:**

1. **Para qué es el canal** (`meta`): qué vende o qué quiere lograr. Si vende algo, qué es y cuánto cuesta.
2. **Quién compra** (`publico`): una persona concreta, no «todo el mundo». Qué hace, qué quiere lograr, qué ha intentado
   y por qué no le funcionó, y si ya sabe que existe algo como lo que vende o solo conoce el problema. Escríbelo en una o
   dos frases, como lo diría el usuario.
3. **Su canal** (`handle`) y el **nombre** del canal en Sloth, si aún dice «Canal nuevo».
4. **Lo que su público escribe en YouTube** (`semillas`). Propón de 8 a 12 frases de 2 a 5 palabras, como las escribiría
   esa persona y no como las diría un experto. Pruébalas antes de proponerlas:

   ```
   python <carpeta de esta skill>/scripts/probar.py "frase 1" "frase 2" …
   ```

   Enséñale los números en una tabla corta (frase, videos largos, mediana) y explica cuál pide más su público. Deja que
   quite o cambie. Las palabras sueltas («Tiktok», «IA») traen otros públicos: no las propongas.
5. **Canales que ya ve o conoce** (`referencias`): pregunta cuáles, y busca su `@handle`.
6. **Nichos vecinos** (`vecinos`): de 3 a 5 temas con la misma intención que su público, aunque sean de otra cosa. Por
   ejemplo, alguien que quiere vender con videos también ve «crecer en youtube» o «marketing para emprendedores». Explica
   en una frase por qué cada uno, y pruébalos con el mismo script.

Al terminar, enseña el perfil completo en cinco líneas y dile que ya puede pulsar «Investigar» en la sección Ideas.

## Diagnosticar tus videos

Lo pide «Diagnosticar», en «Tus videos». Sloth acaba de dejar en `rendimiento.json` los videos largos del usuario de los
últimos 90 días, del más nuevo al más viejo: `vistas`, `visto` (qué % del video ve cada quien), `a30` y `a60` (cuántos
de cada 100 siguen a los 30 s y al minuto), `fuentes` (de dónde llegaron: `SUBSCRIBER` es el inicio y las suscripciones,
`RELATED_VIDEO` los sugeridos, `YT_SEARCH` la búsqueda), `busquedas` (qué escribieron) y `privado`. Lo de Analytics
tarda 2 o 3 días: un video sin `visto` aún no tiene datos, no es que le fuera mal. `audiencia` es el canal en 28 días.

1. **Lee en Studio lo que la API no da:** cuántas veces se vio la miniatura y cuántos de cada 100 entraron. Con el
   navegador (`mcp__navegador__browser_run_code_unsafe`), un solo bucle para todos los ids. Studio deja en la página los
   números del video anterior si no pasas por `about:blank` entre uno y otro:

   ```js
   async (page) => {
     const out = {}
     for (const id of ['ID1', 'ID2']) {
       await page.goto('about:blank')
       await page.goto(`https://studio.youtube.com/video/${id}/analytics/tab-reach_viewers/period-since_publish`)
       await page.getByText('Impresiones y cómo influyen').first().waitFor({ timeout: 30000 }).catch(() => {})
       await page.waitForTimeout(4000)
       const t = await page.evaluate(() => document.body.innerText)
       const i = t.indexOf('Impresiones y cómo influyen')
       out[id] = i < 0 ? null : t.slice(i, i + 400).replace(/\n+/g, ' | ')
     }
     return JSON.stringify(out, null, 1)
   }
   ```

   Si Studio pide iniciar sesión, pídele al usuario que entre en esa ventana y espera. Escribe `studio.json` así
   (`5.8 k` es 5800):
   `{ "medido": "2026-10-20", "videos": { "<id>": { "impresiones": 5800, "ctr": 4.1 } } }`.
2. **Mira las miniaturas** (`https://i.ytimg.com/vi/<id>/maxresdefault.jpg`) y los títulos: el % de clics depende de
   ellos, y la retención de si el video cumple lo que prometen.
3. **Busca las comparaciones que enseñan algo:** el mismo video con dos empaques, temas con y sin búsqueda, los que
   pierden a la mitad antes de los 30 s, resubidas que compiten con su original, temas repetidos. Si `diagnostico.md` ya
   tiene un diagnóstico anterior, compara: qué de lo que se pidió se hizo y qué cambió.
4. **Escribe `diagnostico.md`**, con el nuevo arriba bajo `## <fecha>` y los anteriores debajo, tal cual (son la
   historia que se compara). Lleva «Lo que dicen los números» (de 3 a 6 puntos, cada uno con su cifra), «Desde el
   anterior» si lo hay, y «Para la siguiente tanda» (lo que hay que cambiar, concreto). Lenguaje llano: «de cada 100 que
   vieron la miniatura, entraron 4», no «CTR». La tabla ya se ve en la sección: no la copies. Con pocos videos o pocos
   días de datos, dilo.

No cambies nada en YouTube desde este hilo (privacidad, títulos, miniaturas): propónlo y el usuario decide.

## Proponer ideas

Lo pide el botón «Proponer ideas». Si hay `diagnostico.md`, léelo antes que nada: es lo que de verdad funcionó en este
canal, y pesa más que lo de fuera. Las ideas y su empaque siguen su «Para la siguiente tanda», y si una idea va contra
él, dilo en su riesgo. Escribe tres archivos, en este orden:

### 1. `demanda.md`: qué temas tienen señales de demanda

Los temas que el público de `canal.json` ya elige ver, con su evidencia. Son señales, no pruebas: un outlier dice que un
video superó a su canal, no por qué.

Parte de `temas` del resumen: cada uno es un candidato, con su evidencia ya contada. Tú decides cuáles son de verdad un
tema para este público, juntas o partes los que haga falta y les pones nombre. Los outliers siguen siendo la prueba: un
tema con muchos videos y pocos que pasan su mediana (contra `muestra.pasanSuMediana`) es oferta, no demanda.

Por cada tema, en una sección `## Tema`:

- Los outliers que lo respaldan (título, canal, `x`, vistas y fecha) y en cuántos canales distintos salió. Un outlier
  suelto es una pista; varios del mismo tema en canales distintos son una señal más fuerte. Dilo así.
- La palabra con la que el público lo pide: compara las medianas de los términos parecidos.
- Si atrae al público que compra o solo a curiosos.

Cierra con una sección `## Lo que no cuenta`: los outliers que descartaste y por qué, con el dato. Descarta lo que no
parece orgánico, lo viejo en un tema que caduca y lo que es de otro público.

- **Comentarios inusualmente bajos** (`comentariosBajos` del resumen): con 50 mil vistas o más y menos de 0,15
  comentarios por mil. Puede ser publicidad pagada, o un canal con los comentarios cerrados: míralo antes de descartarlo,
  y si lo descartas, di el dato, no «es un anuncio». Ejemplos: un video con 7 millones de vistas y 52 comentarios, uno
  con 219 mil y 7. Un video orgánico anda entre 0,4 y 30 comentarios por mil.
- **Viejo en un tema que caduca:** en IA y tecnología, lo de hace más de 12 meses vale poco. Si un video no tiene fecha
  («sin leer»), dilo: no se sabe si es viejo.

### 2. `formatos.md`: cómo empaquetarlo

Las fórmulas de título y miniatura, y las formas de abrir el video (el gancho dicho), que funcionan con un público de la
misma intención. Pueden salir de este nicho o de los vecinos, y en `METODO.md`, si existe, están las conocidas.

Antes de escribirlo, **lee los primeros 5 minutos de las transcripciones** (con su script, arriba, cortado en el segundo
300) de los 10 a 15 mejores outliers y de unos 5 videos normales (`x` cerca de 1) de esos mismos canales: ahí están el
gancho, las 4 P y el arranque, y leerlas enteras pasaría de 100 mil tokens. Enteras se leen al preparar una idea. Este
script los elige; pon al final los ids que descartaste en `demanda.md`:

```
node -e "const d=require('./investigacion.json'), c=require('./canal.json'), hoy=new Set([c.semillas,c.vecinos,c.referencias,'tu canal'].flat()), fuera=new Set(process.argv.slice(1)), vale=v=>v.transcrito&&!v.sinVoz&&!fuera.has(v.id)&&v.de.some(x=>hoy.has(x)), top=d.videos.filter(v=>vale(v)&&v.x>=3&&v.vistas>=1000).sort((a,b)=>b.x-a.x).slice(0,15), normal=[...new Set(top.map(v=>v.canalId))].map(id=>d.videos.filter(v=>vale(v)&&v.canalId===id&&v.x>0.7&&v.x<1.4).sort((a,b)=>Math.abs(a.x-1)-Math.abs(b.x-1))[0]).filter(Boolean).slice(0,5); for (const v of [...top,...normal]) console.log(v.id, v.x.toFixed(1)+'x', v.canal, '·', v.titulo.slice(0,80))" ID_DESCARTADO …
```

Compara cómo abren los que funcionan con los que no: qué prometen, cuándo llega la prueba, cuándo el primer valor. Es
mirar dónde falló la fórmula. Cita sus palabras exactas, con su id y su minuto.

Por cada fórmula o gancho, en una sección `## Fórmula` o `## Gancho`:

- **Por qué funciona.** La psicología: qué teme o qué quiere el espectador cuando la ve o la oye.
- **Su tasa de éxito en la investigación.** Empieza por `formulas` del resumen (títulos) o `ganchos` (lo dicho): cuántos
  videos con el patrón pasaron la mediana de su canal (`x` > 1), cuántos son outliers y en cuántos canales. Compárala con
  `muestra.pasanSuMediana`: una fórmula solo destaca si pasa clara de esa base. El patrón es tosco: mira sus ejemplos, y
  si la fórmula no está o la cuenta no cuadra, cuéntala tú en `investigacion.json` con un script. Si hay pocos, dilo: «2
  de 2, muy poca muestra».
- **Lo que exige de la ejecución**, sacado de las transcripciones. Si la fórmula depende de cómo está hecho el video,
  dilo. Por ejemplo, «Hice N y aprendí» necesita de 20 a 40 puntos, y «Hice X en 7 días» es un reto con reloj.

### 3. `ideas.json`: las ideas

De 5 a 8 ideas, de la más segura a la más arriesgada. Cada una es un tema de `demanda.md` empaquetado con una fórmula de
`formatos.md`. En resumen: si no te da nervios arruinar la idea, todavía no es la idea. Pocas y buenas.

```json
{
  "generadas": 1760000000000,
  "terminosNuevos": ["términos que convendría buscar la próxima vez"],
  "ideas": [
    {
      "id": "i1",
      "tema": "el tema con demanda, en pocas palabras",
      "titulo": "el título que recomiendas",
      "titulos": [
        { "texto": "variante para el A/B de YouTube", "formato": "la fórmula", "porque": "por qué este público haría clic" }
      ],
      "miniatura": "qué se ve: tres elementos como máximo; el resultado que el público desea, dibujado; el texto, si lo hay",
      "evidencia": ["id de un video de investigacion.json", "…"],
      "termino": "la búsqueda de investigacion.json cuyo feed es la competencia directa",
      "ejecucion": "cómo se hace el video: pantalla con voz, cámara, reto, número de puntos…, y por qué",
      "gancho": { "promesa": "…", "prueba": "…", "plan": "…", "persona": "…" },
      "porque": "por qué debería funcionar con este canal",
      "riesgo": "qué podría fallar, y la evidencia en contra",
      "piso": 400,
      "techo": 60000,
      "cta": "lo que se regala para dar el siguiente paso, si la meta del canal es vender"
    }
  ]
}
```

- **`evidencia`** solo lleva ids que existen en `investigacion.json`. La interfaz dibuja cada uno con su miniatura y marca
  los que no encuentra.
- **`piso`** son las vistas realistas para el canal del usuario. Si hay canal `propio` (`tuCanal` del resumen), mira su
  mediana; si es nuevo o muy chico, va en cientos, no en miles. No lo infles: el usuario decide con este número.
- **`techo`** es lo que sacaron los outliers comparables.
- **`piso` y `techo` son estimaciones tuyas, no pronósticos:** nadie las ha calibrado contra los resultados del canal. La
  interfaz las enseña así; no las presentes como seguras en `porque`.
- **`gancho`** son las 4 P, pensadas para este canal. La prueba tiene que ser algo que el usuario de verdad tiene. Se
  apoya en cómo abren los outliers que leíste, y `porque` dice en cuál, con sus palabras. Si su evidencia no está
  transcrita, el gancho no está comprobado: dilo en `riesgo`.
- **`cta`** solo va si `canal.meta` es vender algo. Es la llamada a la acción que regala: el video crea una necesidad que no
  puede cubrir solo, y el regalo la cubre. El producto entra como lo que hace posible el resultado, no como anuncio.
- **No repitas las ideas descartadas** de `estado.json`. Una idea que mejoras conserva su `id`; una nueva lleva un id que
  nunca se usó (mira también los de `anteriores/*/ideas.json`).
- **Las ideas elegidas no se quitan nunca.** Si `estado.json` marca una como `elegida`, sigue en `ideas.json` con su mismo
  `id`, aunque la investigación nueva la debilite: mejórala y dilo en su `riesgo`. No le des ese `id` a otra idea: es lo
  que la une a su hilo. Antes de cada vuelta, Sloth guarda la anterior en `anteriores/<fecha>/`, así que puedes reescribir
  el archivo sin miedo a perder nada; y si al terminar falta una elegida, Sloth la vuelve a poner como estaba.
- **`terminosNuevos`** es la rama de «recomendados» que Sloth no puede leer: los términos que salen de los títulos de los
  outliers y que convendría buscar en la siguiente vuelta.

Al terminar, di en el chat cuál harías primero y por qué, en dos o tres frases.

## Preparar para grabar

Lo pide «Lo grabo yo» con el id de una idea. Escribe `esquema-<id>.md`. Es lo que el usuario abre antes de grabar con su
pantalla y su voz.

Hay que mirar cómo está hecho el video que funcionó, no solo su título. Antes de escribir el esquema, **lee
las transcripciones de la `evidencia` de la idea** (con el script de `transcripciones/`): las 3 más fuertes completas y,
de las demás, los primeros 5 minutos (`ID 300`). Saca de ellas la estructura que funcionó: en qué minuto llega cada
parte, dónde va el primer valor, dónde la llamada a la acción y cómo cierra. El esquema se modela sobre eso y cita los
tiempos («el primer valor, en el 1:10, como en ID»). Si un video de la evidencia no tiene transcripción, dilo arriba del
esquema.

1. **Títulos para el A/B:** tres, con su fórmula. YouTube prueba hasta tres y gana el que da más tiempo de visualización.
2. **Miniatura:** el concepto y un prompt de imagen en inglés, con el texto de la imagen entre comillas y en español. Deja
   vacía la esquina de abajo a la derecha, donde YouTube pone la duración.
3. **Gancho escrito**, palabra por palabra y en menos de 60 segundos: promesa, prueba, plan y persona, sobre cómo abren
   los de la evidencia. Es lo único que va escrito entero.
4. **Esquema del resto, en puntos, no en guion.** Leer un guion a cámara se nota y mata el video. Por cada punto:
   - qué se ve en pantalla;
   - qué se enseña;
   - el dato o la prueba;
   - cómo se pasa al siguiente.

   El primer valor de verdad llega donde lo pone la evidencia, y antes del minuto 2.
5. **La llamada a la acción**, si la hay: en qué punto se crea la necesidad, qué se regala, la frase y la vuelta al tema.
6. **El cierre:** a qué video del canal manda al espectador. Escoge una de las ideas.
7. **La descripción para YouTube**, con capítulos aproximados y `[enlace]` donde vaya el del regalo.
8. **Qué preparar antes de grabar:** cuentas, archivos y lo que tiene que estar ya hecho para enseñarlo.
