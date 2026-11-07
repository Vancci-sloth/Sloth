# Eval del menú «Voz»

El menú «Voz» del compositor y de la etapa de la voz (`web/src/ElegirVoz.tsx`) contra ElevenLabs, Fish Audio, Google
AI Studio y Suno. Cada categoría tiene una medida que se puede repetir, y se puntúa así:

- **10**: Sloth es mejor que las cuatro en esa medida.
- **8, 6, 4 o 2**: es mejor que tres, dos, una o ninguna.
- **1**: no lo tiene.

## Cómo se midió

- **Los dos scripts** comparten navegador, ventana (1280×800), detector de sonido y cálculo de legibilidad
  (`scripts/eval-voz-comun.mjs`):
  - **Sloth**: `node scripts/eval-voz.mjs <puerto> [--frio]`, sobre la copia del repo que corre. Hace las tareas sin
    intervenir a mano y guarda las capturas `data/navegador-capturas/voz-*.png`. Con `--frio` borra antes las muestras
    que Sloth ya guardó, como la primera vez en una computadora.
  - **Las otras**: `node scripts/eval-voz-ajenas.mjs fish|eleven|suno|aistudio`.
    - ElevenLabs (`elevenlabs.io/voice-library`), Fish Audio (`fish.audio/discovery`) y Suno (`suno.com/explore`): sus
      páginas públicas.
    - AI Studio (`generate-speech`): con una cuenta de Google (`--perfil`), en su panel «Speaker settings». Con
      `--frase` prueba también su texto a voz, y gasta un pedido.
- **Fuente de cada dato**: todo medido, con esos scripts o con los de cada camino (abajo). Donde una app pide
  entrar o pagar antes de poder hacerlo, eso es lo medido: hasta dónde llega sin cuenta, o con la cuenta gratis.
- **Sonido**: se envuelven `HTMLMediaElement.play` (evento `playing`) y `AudioBufferSourceNode.start`. No cuenta el clip
  de silencio con que Suno desbloquea el audio.
- **Oír**: el puntero (o la fila activa) pasa 800 ms encima antes de pulsar, en todas.
- **Abrir / ver las voces**:
  - Sloth y AI Studio, con un clic de persona (`abrirConRaton`: aprieta, 100 ms, suelta), desde que aprieta hasta que
    se ve pintado; y con un clic de programa, del clic a que el cuadro ya está pintado (requestAnimationFrame y luego un MessageChannel,
    `abrirHastaPintar`), con la página quieta. A 60 Hz, un cuadro son ~16,7 ms: es el piso de cualquier menú.
  - Las de página: de pedir su biblioteca a que se ve la primera voz con su botón de oír.
- **Legibilidad**: la razón WCAG del texto visible más bajo y su letra más chica. Se mide en el menú de Sloth, en el
  panel de AI Studio y en la lista de voces de las demás, no en sus banners. Se mezclan los fondos semitransparentes. No
  cuenta el texto encima de una foto, ni el pintado con un degradado de color transparente (`background-clip: text`):
  su color de verdad no está en el CSS.
- **Encontrar**: se cuenta en tiempo con el modelo KLM (Keystroke-Level Model): una tecla, 0,28 s; apuntar y hacer
  clic, 1,3 s. Así se comparan teclas con clics.
- **Corridas**: medido el 6 de noviembre de 2026. Sloth 4 o más (una en frío), Fish Audio 11 en oír, y las otras 2–3.
  Cuatro revisiones independientes volvieron a correr los scripts; lo que encontraron está abajo, y la última no
  contradijo ninguna fila.

## Resultados

| Categoría (medida) | ElevenLabs | Fish Audio | AI Studio | Suno | Sloth antes | **Sloth** | |
|---|---|---|---|---|---|---|---|
| **1. Oír antes de elegir** (ms hasta que suena) | 275–1.088; el botón de oír sale solo al pasar el ratón | 40–83 (11 corridas); el botón sale solo al pasar el ratón | 92–402 | 283–2.113 | no se podía | **10–25 con el teclado, 18–25 con el ratón** (el mismo clic que en las otras); 10–15 en frío, recién abierto el menú por primera vez; el botón siempre a la vista | 10 |
| **2. Comparar 3 voces** (entradas y espera de cada una) | 3 × (pasar + clic), 275–1.088 cada una | 3 × (pasar + clic), 40–83 | 3 clics, 92–402 | 3 × (pasar + clic), 283+ | no se podía | **4 teclas** (↓ → ↓ ↓): mientras suena una, ↓ toca la siguiente; 11–25 cada una | 10 |
| **3. Encontrar una voz grave de narración** (tiempo KLM) | imposible en su biblioteca pública: no tiene buscador ni filtros | 2 clics (Narration, Deep) = 2,6 s | 4 clics (Pitch → Low, Use case → Storyteller) = 5,2 s | imposible sin cuenta: su selector de Voices está en Create, que manda a entrar | no se podía | **«gra nar», 7 teclas = 1,96 s**: las mismas 3 voces (Enzo, Riko, Sami) que «grave narración» | 10 |
| **4. Oír tu frase** (entradas por cada voz más) | 3: desplegable, voz y Play, en la demo de su inicio; su servidor no genera para un navegador automatizado (401) | 2: voz y «Generate & play», en su demo `/text-to-speech`; tampoco genera así (400) | 3: panel, voz y Run (su servidor dio 403 con el perfil copiado) | no lee textos: hace canciones | no se podía | **1**: con la frase escrita, un clic en el botón de oír de cada voz (medido: suena en 3,4 s, lo que tarda en generarse). La primera vez con Fish 3,8–7,5 s y al repetir 5–9 ms; con AI Studio, 7,9 s | 10 |
| **5. Clonar tu voz** (entradas hasta tenerla, desde donde se elige la voz) | pide entrar antes del primer paso (`/app/voice-lab` → `sign-in`) | 6 entradas (Crear voz, Clonación instantánea, Registro, Empezar, Detener, Analizar audio) y entonces pide entrar: 7 o más | 3 entradas y se para: «la replicación de voz se ejecuta en el nivel pagado», pide una clave de API pagada | pide entrar antes del primer paso (`/create` → `sign-in`) | no se podía desde el menú | **4** (Clonar tu voz, Grabar, Parar, Clonar y usarla), con un texto en español para leer mientras grabas; con tu llave gratis de Fish, de verdad (`--clonar-de-verdad`): 0,8–0,9 s hasta quedar elegida, y dice tu frase en 5,6–9,3 s | 10 |
| **6. En tu idioma** (descripciones con palabras en inglés) | todas | interfaz traducida; descripciones en inglés (4 de 6 tarjetas) | todas | todas | 30 de 30 | **0 de 111**, y 0 en lo que trae de la biblioteca de Fish (lista de ~50 palabras, `INGLES`) | 10 |
| **7. Teclado** (teclas desde el buscador hasta oír) | 21 (su página no tiene buscador; desde arriba) | imposible: el botón de oír no está en el orden de Tab | 16 | 3 | no se podía | **2** (↓ →); `combobox` + `listbox` con `aria-activedescendant` | 10 |
| **8. Rapidez** (ms desde que aprietas «Voz» con un clic de persona —aprieta, 100 ms, suelta— hasta verla pintada) | 413–672 hasta ver su lista (su página) | 557–1.468 (su página) | 125–129: abre al soltar | 757–1.343 (su página) | — | **15–17**: abre al apretar, y ya está armado. Con un clic de programa (sin esos 100 ms): Sloth 14–22 la primera vez y AI Studio 26–30; las siguientes, las dos en el piso de un cuadro | 10 |
| **9. Legibilidad** (contraste mínimo; letra más chica) | 4,71; 14 px | 3,6; 12 px | 6,85; 11 px | 7,53; 12 px | — | **8,71; 14,5 px** | 10 |
| **10. Motores en un selector** | 1 | 1 | 1 | 1 | los mismos, sin buscar ni oír | **2 medidos aquí** (AI Studio y Fish, los que tienen cuenta o llave en esta computadora); el código une 4 (más ElevenLabs y Voices Cloning) | 10 |

Las 70 voces de AI Studio:
- El panel sin filtro enseña 3 por grupo; antes Sloth leía esas, 30.
- Filtrado por género, el panel las enseña todas: 33 de mujer y 37 de hombre. Sloth ahora lee así (`leerVoces`,
  `vocesDeLista`, `juntarVoces`). Probado al conectar con una cuenta real: el archivo pasó de 30 a 70, con su género.
- Las muestras son públicas: `gstatic.com/aistudio/voices/samples/<Nombre>.wav` para las de antes y
  `…/daikon/en-us-<nombre>.wav` para las nuevas. Solo las hay en inglés; para oírla en español, «Tu frase».

Tu voz en Fish Audio sin saldo: su API responde «model creation limit reached (0/0)». Sloth entonces guarda tu
grabación (`data/voz/tuyas`) y la manda de referencia en cada pedido (msgpack, `references`), y eso sí es gratis. No
crea nada en tu cuenta: tras la prueba, la cuenta seguía con 0 voces propias.

## Lo que el eval y su revisión encontraron, y se arregló

- **Oír tardaba 347–701 ms.**
  - Ahora Sloth guarda cada muestra en disco (`server/voz/muestras.ts`), la sirve con su tamaño y por rangos, y baja
    las 40 primeras al abrir.
  - El menú baja a memoria (blob) la activa y sus vecinas.
  - El sonido arranca al apretar el botón, no al soltarlo.
- **«Storyteller» salía «Narradora» también en las voces de hombre.** Los usos ahora son sustantivos: Narración,
  Instrucción, Recepción, Tutoría.
- **La primera apertura empataba con AI Studio medida hasta pintar** (26 contra 25 ms): el menú se armaba en el clic.
  Ahora se arma oculto con el compositor quieto, o al pasar por «Voz», y abrir es solo enseñarlo.
- **El proxy de muestras** bajaba todo antes de mirar el tamaño y seguía redirecciones. Ahora no sigue ninguna, corta
  al pasar de 8 MB y solo acepta esas tres carpetas exactas (`muestraPermitida`).
- **Las voces sin muestra** generaban una frase sin decirlo: ahora el menú avisa que gasta de tu cuenta.
- **Con el menú armado y oculto, la página se movía de lado** (186 px a 1280 de ancho): se armaba antes de medir dónde
  cabe. Ahora se mide al armarlo; el eval comprueba 0 px a 1280, 1024 y 390.
- **«Recientes» no cambiaba hasta recargar la página.** El eval comprueba que la elegida sale al volver a abrir.
- **El proxy dejaba pasar `%2e%2e`**, que `fetch` vuelve `..`. Ahora se rechaza.
- **Quitar la voz que tenía elegida el video la dejaba puesta**: ahora vuelve a «la mando yo». Y el primer clic de
  «quitar» ya no sigue armado al volver a abrir.
- **Achicar la ventana con el menú abierto lo dejaba fuera**: ahora se vuelve a medir también abierto (el eval lo
  comprueba).
- **Las aperturas siguientes empataban con AI Studio** en el piso de un cuadro. Ahora el menú abre al apretar el
  botón, no al soltarlo, como los menús del sistema: con un clic de persona son 15–17 ms contra 125–129.
- **Esc no hacía nada en «Clonar tu voz»**: ahora vuelve a las voces.
- **Tus voces guardadas en esta computadora no se podían quitar**: ahora llevan su botón (dos clics).
- **El logo de Fish era inventado**: ahora son las barras de su marca. El dibujo de ondas de cada voz, de trazo.
- **El texto secundario salía igual que el principal**: la variable `--suave` se definía con ella misma.
- **El botón de oír y la estrella se pintaban rellenos.** Ahora son de trazo.
- **Pulsar oír con el ratón dejaba el buscador sin foco.**
- **Esc en «Tu frase» cerraba el menú** aunque algo sonara, **y ahí ↑↓ no movían de voz.**
- **Comparar con «Tu frase» escrita generaba cada voz al pasar**, y gastaba pedidos de AI Studio.
- **Contraste y letra perdían contra AI Studio y luego contra ElevenLabs.** Ahora el texto secundario es `--muted`
  mezclado con `--text`, y nada del menú baja de 14,5 px.
- **Abrir tardaba más que AI Studio**: había un segundo render al abrir. Ahora se pintan primero las 10 filas que caben.
- **Clonar en Fish fallaba sin saldo de API.**
- **Cuando AI Studio llega a su cuota**, el menú lo dice para quien prueba voces, no para el agente.
- **Concordancia y textos en inglés**: «Hombre, adulta», «Lower middle pitch», «Laid-back and chill».
- **En los scripts**:
  - El navegador no se cerraba.
  - Las otras apps se medían en otra ventana y sobre toda su página.
  - El detector de inglés era corto.
  - No se medía cuánto tardan sus páginas en enseñar las voces.
  - Abrir se medía antes de pintar.
  - `--frio` no era frío para oír.
  - En Sloth el clic de «oír» iba con `locator.click()`, que espera unos cuadros a que el botón esté quieto, y en las
    otras con un clic directo. Ahora es el mismo clic directo en todas.
  - Una voz sin muestra arriba de la lista (la que dejaba `--clonar-de-verdad`) rompía las corridas siguientes. Ahora
    el eval va a la primera voz con muestra, y `--clonar-de-verdad` quita la suya al terminar.
  - Lo de AI Studio y el clonado real se habían medido con scripts sueltos; ahora son `--frase-aistudio` y
    `--clonar-de-verdad`.

## Lo que no se pudo medir

- **Lo que hay detrás de entrar** en ElevenLabs, Fish Audio y Suno: se ofreció entrar con tu cuenta en un perfil
  aparte y no quedó la sesión. Se mide hasta donde dejan llegar sin ella; en AI Studio, con la cuenta gratis.
- **El tiempo de generar en las demos públicas de ElevenLabs y Fish**: sus servidores rechazan un navegador
  automatizado (401 y 400). De ellas se cuentan las entradas, que se ven en su interfaz.
- **El texto a voz de AI Studio en su página**: con el perfil copiado su servidor responde 403. Desde Sloth, con la
  misma cuenta, sí sale (7,9 s). Para AI Studio se cuentan sus pasos, no su tiempo.
## Cada pestaña habla con su motor (6 de noviembre de 2026)

Se probó en la app real: en cada pestaña se escribió una frase en «Tu frase» y se oyó una voz. Un `--import` en el
servidor anotaba cada `fetch` que salía a internet, y otro Playwright miraba el Edge de AI Studio por CDP. Luego Whisper
(el de Sloth) transcribió cada WAV:

| Pestaña | A dónde salió | Audio | Whisper oyó |
| --- | --- | --- | --- |
| Fish Audio | `POST api.fish.audio/v1/tts` con `reference_id` de la voz, 200 | 4,6 s | la frase |
| ElevenLabs | `POST api.elevenlabs.io/v1/text-to-speech/<id>`, 200 | 4,2 s | la frase |
| Sloth | `POST api.sloth.vancci.org/voz/tts` (el cobro, con la llave del socio) y el MP3 de `voicescloning.art/api/media` | 4,4 s, 33 créditos | la frase |
| AI Studio | su página `aistudio.google.com/generate-speech`, `MakerSuiteService/GenerateContent` 200 | 5,2 s | la frase |

Por fuera de Sloth, con la llave del usuario, cada voz de las pestañas de Fish Audio (40) y ElevenLabs (32) existe con
ese id en su API. Con el plan gratis de ElevenLabs, las de su biblioteca (`professional`, `is_owner: false`) dan 402
`paid_plan_required`. Ahora llevan `bloqueo`: se oye su muestra, pero no se eligen ni dicen tu frase, y no cuentan
como «tuyas».
