# El motor: un video desde `momentos.json`

Los estilos que lo siguen (el explicativo, el documental y El Diff) se hacen igual: el agente escribe **qué se ve en cada
palabra** y un comando hace todo lo demás de fondo. Así un video tarda minutos y no se programa: el del explicativo
pasó de 16 min y $2,70 a 3,7 min y $0,49 (`docs/plan-videos-rapidos.md`). Un estilo nuevo, o uno que se rehace, nace con
este contrato; lo que cambia de un estilo a otro es su director y su material, no cómo se pide.

## El contrato

1. **El agente solo escribe `momentos.json`**, en la raíz del proyecto, y el texto del que sale: `guion.md` si la voz
   se va a generar (el explicativo) o nada si ya está dicha (el documental parte de la grabación). Nunca código de la
   plantilla: lo que el video necesite y no quepa en `momentos.json` falta en el director, y se dice.
2. **Cada momento se ancla a lo dicho** con `palabra` (de una a tres palabras seguidas, tal como se dicen) y `vez` si se
   repite (sin ella, la primera vez después del momento anterior), en el orden en que se dicen. Lo demás del momento
   (qué se ve y cómo) es de cada estilo.
3. **`<skill>/scripts/hacer.py --revisa`** lo comprueba en un segundo, sin fondo, y dice **todo lo que falla de una
   vez**: cada ✗ suelto le cuesta al agente una vuelta. Lo que un script puede comprobar no se deja como regla en el
   SKILL.md.
4. **`<skill>/scripts/hacer.py`**, de fondo, hace el resto (material, voz, edición, render, medida, portada). Dice sus
   pasos con su segundo (`[  12 s] render…`), para en el primer ✗ diciendo qué arreglar, no repite lo que ya está hecho
   (la voz del mismo guion, el material ya bajado) y termina en **`✓ listo: <mp4>`** con lo que hay que mirar.
5. **Deja `revision/hoja.png`** (el video de un vistazo, lo único que el agente mira) y **`revision/tiempos.json`** (los
   segundos de máquina de cada paso).
6. **Un director determinista** pone lo que no se decide en cada video (cámara, cortes, encuadre, sonidos, subtítulos):
   lo mismo de entrada da el mismo video. Por eso se puede volver a dibujar un video ya hecho con el director cambiado
   y compararlo con el de antes.

## Lo común: `scripts/momentos.py`

`normal`, `palabras_de` y `busca` (comparar palabras sin acentos ni signos), `anclar` (cada momento en su palabra, con
sus errores), `leer`, `parar` (todos los ✗ juntos), `guardar`, `Reloj` (los pasos, `✓ listo` y `tiempos.json`), y lo
que mira quien cambia un director: `hoja`, `tiras` (dos cuadros por segundo: con uno cada 1,5 s no se ve el
movimiento) y `pares` (el antes y el después lado a lado).

## Lo de cada estilo

| | Explicativo | Documental | El Diff |
|---|---|---|---|
| De qué parte | un tema: escribe `guion.md` | tu grabación: `nuevo.py` la transcribe | un tema o un video: escribe `guion.md` y los datos con su cita |
| Qué pone un momento | `cosa` 3D, `tarjeta`, `pose`, `camara` | `ve` (material real), `forma`, `entra`, `grande` | `fuente` y `cita`, `clip`, `meme`, `diagrama`, `titular`; encima, `rotulo`, `logo`, `sello`, `ovalo` |
| De dónde sale lo que se ve | la biblioteca de modelos 3D y fotos | internet: `buscar.py` y las URL, que baja `material.py` | la página de cada cita (`capturar.mjs`), logos, memes y recortes, que baja `hacer.py` |
| Su director | `plantilla/src/director` (React) | `components/director.py` (los dispositivos medidos) | `scripts/director.py`, que escribe `guion.json` para la plantilla |
