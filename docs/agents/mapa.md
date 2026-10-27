# Mapa de Sloth

Cada módulo explica lo suyo en su comentario de cabecera, y los campos de una card están en `Card` (`shared/types.ts`).
Este es el mapa:

- `server/index.ts`: un solo servidor Node (en `$PORT`; 4848 en la app instalada) con la API en `/api/*`, el WebSocket en `/ws` y Vite como
  middleware para la interfaz.
- `server/claude.ts`: Claude con `@anthropic-ai/claude-agent-sdk`, en streaming; la sesión sigue viva entre turnos y
  carga las skills y el CLAUDE.md del usuario. Lo traduce todo a `AgentEvent`, lo único que conoce la interfaz; otro
  proveedor sería otro adaptador que cumpla `AgentRun` (`server/agent.ts`).
- `server/codex.ts`: adaptador de Codex; usa `server/codex-rpc.ts` y traduce sus mensajes al mismo `AgentEvent`. Su
  costo es a precio de la API, con la tabla que `server/precios.ts` baja de LiteLLM con cada versión de Codex.
- `server/sessions.ts`: cada hilo es `data/sessions/<id>.json` (qué es) y `<id>.jsonl` (lo que pasó). Retoma la sesión
  del proveedor tras reiniciar, reparte los lotes según la máquina y cierra el proceso de un video del lote al acabar.
  `npm run hilo -- <id>` (`scripts/hilo.mjs`) resume un hilo desde esos archivos.
- `cards.json`: las cards. `skill` es la carpeta en `~/.claude/skills`, enlazada también en `~/.codex/skills` y
  `~/.agents/skills` (`enlazarSkillsCodex`): Claude y Codex leen los mismos archivos. `cwd`, donde trabaja (`{app}` es este repo; sin
  él, `trabajo/<id>`, fuera de git). `etapas` es el avance, leído de los archivos del hilo (`server/etapas.ts`) con los
  globs `listo`. Los videos terminados son los de la etapa «Video» (los `_*` son a medias); `server/reglas-repo.test.ts`
  comprueba que ningún glob cuente un borrador.
- Lo que el estudio ve en vivo: `server/claude.ts` saca los borradores de lo que escribe el agente (Write y los heredocs
  de Bash), el WebSocket los lleva a `web/src/App.tsx` y `Etapas.tsx` los dibuja.
- El estudio de video (`web/src/Estudio.tsx`): toda card cuyas etapas tengan `fase` se ve igual, con las cinco fases
  arriba, la elegida al centro, la línea de tiempo abajo y el chat a la derecha. En la fase Video (`Editor.tsx`), el motor
  en vivo (`server/motor.ts`, ADR 0005) reproduce sin renderizar cualquier proyecto de Remotion y se rehace solo con cada
  cambio; un clic en el cuadro, una escena o un tramo va al chat como referencia (`Referencia.tsx`).
- La carpeta del video: un hilo de video nace con su carpeta nombrada por Sloth, y el mensaje lleva la línea
  `Carpeta: <nombre>`, que leen las skills. Con `lote`, varios enlaces pueden ser un video cada uno
  (`lote-MMDD-HHMM-NN`, ver `skills/video-base/LOTE.md`). «Continuar un video» y cambiar la carpeta desde el estudio
  usan una que ya existe.
- `modelos` (`web/src/Modelos.tsx`): en «Optimizado», el modelo y el esfuerzo medidos para el hilo y sus subagentes
  (mediciones en `skills/acelerar-skill/bancos`; los de los subagentes van en la línea `Subagentes:`). Una card sin medir
  usa lo último que eligió el usuario a mano. En «Avanzado» se elige cada uno.
- La galería: al elegir un estilo, sus videos terminados ocupan el sitio de las cards (`videosApi` en `etapas.ts`);
  «Mis videos» (`MisVideos.tsx`) los junta todos. Cada card enseña de fondo el más nuevo (`server/previas.ts`).
- `server/redes/` y `web/src/Redes.tsx`: los verticales terminados se programan, 5 al día de 12:00 a 16:00 (`RITMO`).
  TikTok va por su página (ADR 0002), en la página `redes` del navegador integrado, con su propio perfil (sin la ventana
  de Sloth, en un Edge con `data/redes/perfil`);
  Instagram, por la nube (`nube/`, un Worker de Cloudflare con R2 y un cron, ADR 0003), que publica con la computadora
  apagada. La nube se despliega con `npm run nube -- deploy`, no con «Reiniciar backend». Cuando todo un video quedó
  programado, se borra lo regenerable de su carpeta (`out/partes`, `_bundle_rev`). Para mirar o mover la cola:
  `docs/agents/redes.md`.
- El navegador de cada hilo (`electron/navegador.ts`, el globo de `web/src/Navegador.tsx`): el Playwright MCP del agente
  (`server/navegador-agente.ts`) entra en él por CDP. Sin ventana, un Chrome con `data/navegador`; en lotes, uno limpio.
  Sus capturas y los logs de consola quedan en `data/navegador-capturas/`.
- `server/ideas/` y `web/src/Ideas.tsx`: Ideas, qué video hacer: largo en YouTube o vertical en TikTok e Instagram
  (`formato: 'vertical'`), en `trabajo/ideas/<id>/`. Investigar mide cada video contra su canal (outlier: 3× o más),
  transcribe lo dicho (`transcribir.ts`) y agrupa temas con vectores locales (`vectores.ts`); en vertical busca con
  cuentas desechables (`data/investigacion/perfil`, nunca las que publican) y mide Instagram con la API de Meta.
  «Proponer» abre `ideas-youtube` o `ideas-vertical` (con
  `mcp.ts`); «Hacer con…», un borrador de un estilo con la línea `Idea: <canal>/<idea>`.
- `server/radar/`: buscador propio de noticias tech, cada 5 minutos (`POST /api/radar/buscar`).
- La comunidad (`web/src/Comunidad.tsx`, `server/comunidad.ts`): un feed como el de Skool que vive en el Worker del cobro
  (`licencias/src/comunidad.ts`); cada quien entra con su cuenta gratis (o la clave de su apoyo) y tú, como creador, con la llave de `publicar.txt`.
  En su sección Mejoras, «Hacer con Sloth» abre esta card con `Mejora: <id>`; publicar una (la ven todos):
  `POST /api/mejoras {texto}`.
- `server/modelos3d.ts` y `web/src/Modelos3D.tsx`: «Modelos 3D» enseña la biblioteca `skills/modelos-3d` que usan los
  agentes (la de `~/.claude/skills`), que llenan los videos (solo se mira). Empieza vacía; la moneda de la plantilla
  va en `modelos-3d/plantilla`, sin enseñarse.
- `server/originales.ts` y `web/src/TusCambios.tsx`: en la app que se vende, «Con tus cambios (N)» bajo la card dice qué
  archivos de su skill (y de video-base) ya no son como los trae la versión, y vuelve a la original, entera o uno a uno.
  Lo que se pisa, también al actualizar (`prepararSkills`), se copia antes a `data/skills-tuyas`.
- `server/requisitos.ts`: lo que las skills necesitan fuera de Sloth. Cada card pide solo los paquetes de su skill
  (`PAQUETES` dice cuáles). Instala automáticamente el Python de Sloth en `%APPDATA%\youtube\piezas\python`,
  sus paquetes y los modelos; elige CUDA si hay una NVIDIA que lo aguante (`aguantaCuda`) y CPU si no. Una instalación
  interrumpida se puede reanudar. Si hay varios, Sloth y `sloth.py` usan el mismo (`elegirPython`).
- `server/espacio.ts` y `web/src/Espacio.tsx`: Opciones → Espacio en disco. Lo que dejan los videos y no hace falta
  (temporales de Remotion, pedazos de render, `node_modules` repetidos, cachés viejas); lo seguro lo borra solo cada
  6 horas si nada trabaja. Las skills evitan dejarlo con `espacio.py` y `remotion.cjs` de video-base.
- `python/procesos/`: lo que las skills corren con el Python de Sloth (transcribir la voz o un video ajeno), lanzado por
  `proceso()` de `sloth.py` o `comun.py`.
- `server/cuenta.ts`, `server/version.ts` y `server/opciones.ts`: la cuenta de Claude, la versión de Claude y de Codex
  («Actualizar»: Claude dentro del rango de package.json, Codex en cualquier 0.x) y las credenciales de YouTube e Instagram (en las variables de entorno del usuario).
- `web/src`: React. `api.ts` habla con el servidor; `eventos.ts` guarda los eventos fuera de `App`, `items.ts` los junta
  en bloques y `Timeline.tsx` los dibuja; `Composer.tsx` es el campo de texto.
