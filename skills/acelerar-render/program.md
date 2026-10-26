# Programa del bucle

<!-- Tres partes. "Objetivo" y "Reglas fijas" las escribe el humano. "Cómo trabajar" y "Hábitos aprendidos" las
reescribe el bucle de fuera cada 10 rondas. Nadie toca los checks. -->

## Objetivo

Que los estilos de video rendericen en menos tiempo **en el equipo donde corre el bucle**, sin que el video se vea ni
se oiga peor. El score son segundos de reloj; menos es mejor.

El banco (`.autoloop/checks/banco.mjs`) tiene un caso por estilo en `.autoloop/checks/casos/<skill>/`, cada uno con su
referencia `ref.mp4`. Solo da score si cada video pasa la guardia: mismo códec, tamaño, fps, fotogramas, formato de
píxel y color que su referencia, VMAF ≥ 93 frente a ella y, si lleva audio, el mismo audio (SI-SDR ≥ 30 dB).

| Caso | Cómo se renderiza |
|---|---|
| `video-el-diff` | `video-el-diff/scripts/final.py` sobre la plantilla, con los datos de un short (683 cuadros) |
| `reel-collage` | `reel-collage/scripts/final.py` sobre un reel entero (1013 cuadros). Hoy, pendiente: no se mide (el motivo, en su `caso.json`) |

La fase (la última fila `lock` de `results.tsv`) dice el modo y el equipo: `<modo>@<equipo>`, a veces con `#n`.

- **`todos@…`**: el banco entero; el score es la media geométrica de los segundos de cada caso, así que bajar un 10 %
  pesa lo mismo en el caso de 1 s que en el de 60 s. Se ataca el código de render que comparten los videos.
- **`<skill>@…`** (por ejemplo `video-el-diff@…`): solo ese caso (`banco.mjs --estilo <skill>`); el score son sus
  segundos. Se ataca lo propio de ese estilo.

## Reglas fijas

- Solo cambias el código del proyecto. Nunca `.autoloop/checks/`, `.autoloop/config.json` ni este archivo.
- Trabajas solo en este worktree (`C:\dev\skills-render`). Nunca toques `~/.claude/skills` ni
  `%LOCALAPPDATA%\el-diff`: de ahí sacan sus videos el usuario y Sloth mientras el bucle corre.
- **Lo que puedes tocar depende del modo:**
  - `todos`: el código de render: `video-base/scripts/`, `video-el-diff/scripts/`, `video-el-diff/plantilla/` (cómo
    se renderiza, nunca cómo se ve) y `reel-collage/scripts/`. No toques `.autoloop/paginas/`.
  - Un estilo: solo lo suyo, nunca `video-base/`, para que acelerar un estilo no frene a otro.
    - `reel-collage`: `.autoloop/paginas/reel-collage/src/`, `reel-collage/scripts/` y `reel-collage/plantilla/`.
      La página del banco es solo un ejemplo: lo que acelera los videos de verdad es la regla. Cada cambio que hagas
      en `src/` va, en la misma ronda, como regla en `reel-collage/SKILL.md`.
    - `video-el-diff`: `video-el-diff/scripts/` y `video-el-diff/plantilla/` (cómo se renderiza, nunca cómo se ve).
- **La calidad no baja.** Misma resolución, fps, duración, códec, formato de píxel y color que la referencia de cada
  caso, y el mismo audio (frecuencia, canales, AAC al mismo bitrate, sonoridad). Nada de bajar la escala, saltarse
  fotogramas que cambian, recortar efectos, ni cambiar el guion, la voz o cómo se ve o se oye un video.
- **Nada ajustado a este equipo.** Lo que dependa de la máquina (cuántos Chrome o pestañas, si se usa la GPU, el
  codificador, los hilos) se calcula de ella (hilos, memoria, tarjeta) o se mide una vez y se guarda con la huella del
  equipo, como ya hace `video-el-diff/scripts/render_web.mjs` con los Edge. Ningún número que solo le sirva a este equipo. Si algo usa la
  GPU, vuelve solo a la CPU cuando no hay tarjeta o falla.
- **Cada render del banco es el primero de ese video.** Nada de cachés que sobrevivan entre un render y otro para
  ganarle al banco. Lo único que se guarda entre renders es la calibración del equipo, y solo elige ajustes.
- Las opciones que usan los `SKILL.md` siguen funcionando igual: `final.py [--recalibrar] [--sin-abrir]` de El Diff con `out/el-diff-final.mp4` y `revision/final_hoja.png`, y
  `final.py <nombre>` del reel con `out/reel-<nombre>.mp4`.
- Un cambio por ronda: una idea, pequeña y que se pueda medir. Si no sabes si mejora, pruébalo; para eso está el bucle.
- No instales dependencias nuevas.
- No cierres procesos por nombre (`taskkill /im chrome.exe`, `ffmpeg`, `node`, `python`): el usuario puede estar
  renderizando. Cierra solo los que lanzaste tú, por su PID.
- No corras el banco entero: lo corre el árbitro. Prueba tu cambio con un tramo corto, o con un solo caso
  (`node .autoloop/checks/banco.mjs --estilo <skill>`).
- Más simple gana: a igual puntuación, el cambio que borra código es mejor que el que lo añade.

## Cómo trabajar

1. Lee las últimas filas de `.autoloop/results.tsv` y, si la última ronda falló, el final de su log. No repitas una
   idea que ya se descartó.
2. Antes de cambiar algo, mide dónde se va el tiempo en un tramo corto (en Remotion, el bundle, cada pestaña, los videos
   de fondo, la mezcla de audio y el master). Ataca lo que más pesa.
3. Antes de añadir una forma nueva de hacer algo, busca todos los sitios donde ya se hace y haz que sigan la misma
   regla.
4. Comprueba tú mismo que el tramo corto sale bien (se abre, mismos fotogramas, se ve igual) antes de terminar, para
   no gastar una ronda en un error tonto.

## Hábitos aprendidos

- Medir con la máquina en reposo: un portátil baja su potencia con el calor, y el ruido parece del código.
