# Lo que aguanta la máquina: dos videos, tope de subagentes y de navegadores

Fecha: 2026-10-30

## Contexto

Con tres episodios de El Diff a la vez en el equipo del usuario (16 GB, RTX 3050), la voz de 6:54 que Sloth estimó en 40 s
tardó 22 min: 20 en la fila y 2 de trabajo. Medido ese día:

- Llegaron a 36 subagentes vivos a la vez, 42 GB comprometidos contra 15,6 físicos y 2 GB libres. `import torch` tardó 37 s
  con la memoria así y 2,4 s con sus DLL en caché. La GPU estaba libre y el procesador no llegaba al 100 %: el cuello de
  botella es la memoria, y solo se ve si se suma toda la máquina.
- Un `fuente.py` de otro hilo tomó el turno de la GPU para un clip de material, y la carga de Whisper agotó sus 15 min
  (`VOZ_ARRANQUE`). Luego el proceso de siempre cargó todo otra vez. Con todo eso, la voz seguía detrás.
- La fila no iba en orden: quien miraba primero ganaba. Una voz de las 14:55 pasó por delante de otra de las 14:49.
- Ningún límite miraba la máquina: un hilo suelto nunca se frena, y `procesos()` cuenta 4 navegadores por script.

Nada de esto es de un hilo: cada uno se porta bien por su cuenta. Por eso los límites son de toda la máquina.

## Decisión

- **Un aviso, no un tope, al pasar de dos videos a la vez** (`VIDEOS_SIN_AVISO`, `shared/limites.ts`). Un video es un hilo
  cuya card tiene etapas con `fase`, y trabaja si tiene un turno abierto o algo en segundo plano. Lo que pondría a trabajar
  uno de más (un hilo nuevo, un lote, un mensaje o la voz a un video quieto, «Empezar ya», «Haz otra versión») recibe un 409
  con `confirmar`; `api` pregunta (`AvisoVideos.tsx`) y, si sigue, repite el pedido con `masDeDos`. Primero fue un tope fijo
  de 2, con cola; se quitó tras la prueba de abajo: el lote tardó 62 % más, y a un equipo con más memoria solo lo frenaba.
- **Tope de subagentes** (`server/tope-agentes.ts`): uno por cada 2 GB (8 en 16 GB), y uno más no empieza con menos de
  1,5 GB libres. Un hook de `PreToolUse` retiene el lanzamiento, y también el `SendMessage` que despierta a uno que ya
  acabó: el modelo no tiene que saber nada. Solo Claude: Codex ya trae su propio tope (llegó a 5) y OpenCode no tiene por
  dónde frenarlo.
- **Tope de navegadores** (`turnoNavegador` en `video-base/scripts/chrome.mjs`): uno por cada 5 GB, hasta 4 (3 en 16 GB).
  `abrirChrome` pide sitio con un archivo por navegador en %TEMP%, con el pid de su dueño. Los render de Remotion no pasan
  por aquí: ya van de uno en uno.
- **Whisper se carga antes de hacer falta** (`server/voz-viva.ts`): al trabajar un video, Sloth lo carga con
  `sloth.py calentar-voz`, en cuanto hay turno de la GPU, y un ping por minuto lo mantiene mientras haya videos.
- **La fila de la GPU va en orden** (`_Fila` de `sloth.py`): primero la voz del usuario (`transcribir.py`), luego el material;
  entre iguales, quien llegó antes. Un archivo con candado por cada uno que espera: si muere, el siguiente lo quita.

## Consecuencias

- Quien confirma un tercer video acepta el riesgo: Sloth no intenta adivinar cuánto cabe en cada máquina.
- Whisper ocupa 2,6 GB de la tarjeta mientras trabaje un video, también durante el render. Ideas sigue cerrándolo antes de
  cargar el suyo, y entonces Sloth lo vuelve a cargar cuando ella suelta la GPU.
- Lanzar 12 subagentes tarda más: el agente queda retenido hasta que entra el último. Si tras 30 min no hay sitio, arranca
  igual; un navegador espera 15 min. Ambos topes se prefieren vencidos a un agente colgado.
- Los topes de 8 subagentes y 1,5 GB son estimaciones, no medidas: el pico malo fue de 36. Si con dos videos sigue faltando
  memoria, se bajan aquí.

## La prueba

El mismo 30 de octubre, tres episodios de 6-7 min con los datos de la instalada, en el mismo equipo. Sin `redes`, para no
publicar nada. Con el tope de entonces de 2 videos, 8 subagentes sin contar `SendMessage` y 4 navegadores:

- El tercer video esperó 48 min y arrancó solo, en el instante en que se liberó un sitio. Los tres salieron en 49, 84 y 45
  min, de punta a punta: 94 min el lote, contra 58 sin el tope (esa vez, con la voz mandada a mano).
- Transcribir la voz de 6:55 tardó 32 s y la de 6:38, 66 s, contra los 22 min de antes.
- Hubo 16 subagentes a la vez, no 8: 12 despertados con `SendMessage` en un momento. De ahí que ahora cuente.
- La memoria libre fue de 2,7 GB de media, y bajó de 0,5 GB en 5 de 193 lecturas, cuatro de ellas con 4 navegadores abiertos
  (la peor, 9 MB). Con 0 navegadores, 3,4 GB libres; con 4, 1,7. De ahí el tope de 3 en 16 GB, que aún no se ha medido.
