# La voz: la línea `Voz:`

El usuario elige en el compositor de Sloth si manda él la voz o si la generas tú. Puedes generarla con una voz de Google
AI Studio (Gemini 3.8 Flash TTS, en su cuenta de Google), con una de Fish Audio o ElevenLabs (con su llave; puede ser
la suya, clonada) o con una de las voces de Sloth (`vc:`, con los créditos que le da Sloth; al usuario llámalas «voces de Sloth»). Lo elegido
llega en el primer mensaje:

- `Voz: genérala tú en AI Studio con la voz <Nombre> …` o `Voz: genérala tú con Fish Audio (o ElevenLabs), voz «…»: en
  generar_voz pon la voz fish:… …`: la generas tú, como se dice abajo. **No se la pidas.**
- `Voz: la manda el usuario; no la generes …`: pídesela como diga tu skill, aunque la marca o la skill traigan una
  voz de AI Studio.
- Sin la línea: lo que diga tu skill.

Donde tu skill diga «una voz de AI Studio» o «la de AI Studio», vale igual para Fish Audio, ElevenLabs y Voices
Cloning: el mismo `generar_voz`, el mismo archivo y los mismos pasos.

## Generarla

Con la herramienta `generar_voz` del MCP `voz` (en Claude, `mcp__voz__generar_voz`), en cuanto el guion esté listo.
Si tu skill trae un script que la pide a Sloth por la misma vía (`/api/voz/generar`), como `voz.py --studio` del
explicativo, usa solo el script: con los dos se pide dos veces. La herramienta lleva:

- `voz`: la que trae la línea, tal cual (`Fola`, o `fish:…` / `elevenlabs:…` / `vc:…` con su id).
- `texto`: lo que se narra, tal como lo leería el usuario: el guion que le darías para grabar, sin títulos,
  encabezados, notas ni indicaciones. O `archivo`: la ruta absoluta de ese guion (un `.md` se narra sin títulos ni
  encabezados).
- `salida`: `<carpeta del video>/fuentes/voz/ai-studio.wav`, en ruta absoluta. Se llama así con cualquiera de ellas.

En AI Studio, una frase tarda unos 5 s y un guion de 6 minutos unos 100 s. Si no acabó en 40 s, la herramienta te da
un id: sigue con lo que no necesita la voz y espérala con `estado_voz`. Cuando llega, **ese WAV es la voz del
usuario**: sigue el paso de tu skill para cuando llega su voz, con ese archivo. Si después corriges el guion, vuelve a
pedirla; si no cambió, sale al momento.

Las indicaciones van dentro del texto, y solo donde ayudan: en AI Studio como `<laugh>` o `<short pause>`; en Fish
Audio y ElevenLabs entre corchetes, al principio de la frase, como `[laughs]`, `[whispers]` o `[sighs]`.

AI Studio a veces lee un párrafo dos veces o se salta una frase. Si al transcribir o alinear falta o sobra un tramo,
pídela otra vez una sola vez; si se repite, díselo al usuario.

## Si falla

- **Sin cuenta conectada, o se fue la sesión (AI Studio), o sin llave (Fish Audio, ElevenLabs):** dile al usuario que
  la conecte en Opciones → Voz. Mientras, pídele su voz como siempre.
- **La cuota del día, sin saldo o sin créditos, u otro error:** dile el error tal cual y pídele su voz. Lo gratis de
  Fish Audio era hasta el 30 de noviembre de 2026. Los créditos de las voces de Sloth los da el creador de Sloth.
- **Una voz que no existe:** `voces` dice las que hay. Usa la más parecida del mismo proveedor y díselo.

Si el usuario eligió una voz, no la generes de otra forma (edge-tts, otro proveedor): o sale de donde eligió o la
manda él.

## En un estilo nuevo

Todo estilo con voz narrada sigue esta guía: su skill solo dice en qué paso está el guion y qué hace con la voz cuando
llega. Así lo tienen también los estilos que hace cada quien con «Nuevo estilo».
