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
- `server/opencode.ts`: adaptador de OpenCode 2, la versión gratis (con la cuenta de OpenCode de cada quien, que se crea
  gratis y se conecta en `server/cuenta-opencode.ts`; primero sus modelos gratis de Zen y luego los de pago), hecho
  como el de T3 Code: un solo `opencode serve` para todos los hilos, con sus datos en `data/opencode`; cada hilo es una
  sesión en su carpeta, con las instrucciones de Sloth y su navegador (un MCP que solo él puede usar). Se prueba con un
  turno grabado (`opencode.grabacion.json`). Cada `conexion` se devuelve con `soltarConexion`: un minuto sin hilos ni
  consultas cierra el servidor, y un inicio de sesión lo conserva hasta autorizarse, cancelarse o vencer. ADR 0009 y 0010.
- `server/agentes.ts`: el programa de cada agente no viene en el instalador: se baja al elegirlo (bienvenida, Opciones o
  el primer mensaje de un hilo suyo, `conAgente`) a `%APPDATA%\sloth\piezas\agentes`. En el repo, Claude Code, Codex y
  OpenCode ya están en node_modules. Un proveedor nuevo es una entrada más en `AGENTES` y en `PROVEEDORES`
  (`shared/providers.ts`). «Actualizar los agentes», arriba a la derecha del hilo nuevo (`AvisoAgentes`), baja la versión
  más nueva de npm de Claude Code, Codex y OpenCode a `<agente>/versiones/<versión>` (`AL_DIA`); se usa siempre la más
  nueva, la de la app o la bajada.
- Los demás agentes, como en T3 Code (ADR 0012), cada uno con su cuenta y su catálogo en `server/proveedores.ts` y su fila
  en Opciones (`CuentaAgente`): DeepSeek es Claude Code con la API de DeepSeek (`server/deepseek.ts`); Grok,
  Antigravity y Gemini CLI hablan ACP (`server/acp.ts`, `grok.ts`, `antigravity.ts`, `gemini.ts`; Antigravity, con las cuentas de Google que conectes y un proceso por cuenta para todos sus hilos: al acabarse la cuota de una, el hilo sigue con la siguiente; Gemini, con llave de API, ADR 0013); Cursor corre su SDK en un puente aparte
  (`cursor.ts`, `cursor-puente.mjs`); Muse Code, su MSP (`muse.ts`); Pi, su RPC con una extensión que le pasa los MCP de
  Sloth (`pi.ts`). Lo que comparten (las instrucciones, la skill por su ruta, los MCP del hilo) está en
  `server/instrucciones.ts`; el JSON-RPC por líneas, en `server/rpc-lineas.ts`.
- `server/sessions.ts`: cada hilo es `data/sessions/<id>.json` (qué es) y `<id>.jsonl` (lo que pasó). Retoma la sesión
  del proveedor tras reiniciar, reparte los lotes según la máquina y cierra el proceso de un video del lote al acabar.
  Un chat de Claude, DeepSeek, Codex u OpenCode con su sesión guardada suelta el proceso a la media hora; los demás
  agentes lo conservan hasta comprobar que retoman. `npm run hilo -- <id>` (`scripts/hilo.mjs`) resume un hilo desde esos archivos.
  Una sesión de Antigravity que se desborda o se calla no se recupera, ni retomándola: el turno acaba con `relevo` y el hilo
  sigue en otra, con el resumen que Sloth saca de su historial (`relevar`, `server/relevo.ts`). `/compact` hace lo mismo.
  Elegir un modelo de otro agente en un hilo (`setModel`) lo pasa a ese agente con el mismo resumen, la skill y la ruta
  del historial, como el traspaso de T3 Code (`vieneDe`); el aviso de un límite de uso lo ofrece con «Seguir con…»; el de Claude dice además cuánto queda y deja entrar con otra cuenta (`LimiteClaude.tsx`).
- Lo que aguanta la máquina (ADR 0011): el aviso antes de pasar de dos videos a la vez (`shared/limites.ts`,
  `web/src/AvisoVideos.tsx`), el tope de subagentes de Claude (`server/tope-agentes.ts`), el de navegadores (`turnoNavegador` en `video-base/scripts/chrome.mjs`),
  Whisper cargado mientras trabaja un video (`server/voz-viva.ts`) y la fila de la GPU, con la voz primero (`sloth.py`).
- `cards.json`: las cards. `skill` es la carpeta en `SKILLS` (`server/skills.ts`): en la app que se vende,
  `~/.claude/skills`, enlazada también en `~/.codex/skills` y `~/.agents/skills` (`enlazarSkillsCodex`), para que Claude y
  Codex lean los mismos archivos; en el repo, `skills/` (su Claude usa su propia configuración, `data/claude`, y no toca la
  de la Sloth instalada). Los scripts de las skills la reciben en `SLOTH_SKILLS`. `cwd`, donde trabaja (`{app}` es la
  carpeta de Sloth; sin él, `<trabajo>/<id>`, de `carpetaTrabajo` en `server/trabajo.ts`: fuera del repo en desarrollo). `etapas` es el avance, leído de los archivos del hilo (`server/etapas.ts`) con los
  globs `listo`. Los videos terminados son los de la etapa «Video» (los `_*` son a medias); `server/reglas-repo.test.ts`
  comprueba que ningún glob cuente un borrador. Los estilos que cada quien hace con la card «Nuevo estilo» (skill
  `crear-estilo`) van en `data/tus-cards.json` y `skills/<id>`, que ninguna actualización toca. Si su card se pierde
  (un agente la puso en `cards.json`, que cada versión reemplaza, o no llegó a escribirla), la venta la devuelve al
  arrancar y al acabar cada turno de «Nuevo estilo», desde su hilo o rehecha con su SKILL.md
  (`server/estilos-perdidos.ts`). Son las únicas que la
  venta deja borrar (`tuya`); la skill sale a `data/skills-tuyas` (`guardarSkillTuya`). «Compartir» (en su card, junto a
  su nombre o en Comunidad → Estilos) abre `CompartirEstilo` (`web/src/Estilos.tsx`): una pantalla ya llena que lo
  empaqueta en un `.sloth-estilo` (`server/estilos.ts`, ADR 0017) y lo publica en Estilos, donde sale cuando el creador
  lo aprueba, o lo guarda como archivo; «Importar» o «Instalar» lo pone entre los tuyos, con su `origen`.
- Lo que el estudio ve en vivo: `server/claude.ts` saca los borradores de lo que escribe el agente (Write y los heredocs
  de Bash), el WebSocket los lleva a `web/src/App.tsx` y `Etapas.tsx` los dibuja.
- El estudio de video (`web/src/Estudio.tsx`): toda card cuyas etapas tengan `fase` se ve igual, con las cinco fases
  arriba, la elegida al centro, la línea de tiempo abajo y el chat a la derecha. En la fase Video (`Editor.tsx`), el motor
  en vivo (`server/motor.ts`, ADR 0005) reproduce sin renderizar cualquier proyecto de Remotion y se rehace solo con cada
  cambio; un clic en el cuadro, una escena o un tramo va al chat como referencia (`Referencia.tsx`).
  Los motores y los vigilantes de carpetas se liberan tras cinco minutos sin uso; los hilos a la vista conservan ambos, y
  los que trabajan, sus vigilantes. Las ondas de audio se calculan de una en una y se guardan en bytes, 32 archivos como máximo.
- La carpeta del video: un hilo de video nace con su carpeta nombrada por Sloth, y el mensaje lleva la línea
  `Carpeta: <nombre>`, que leen las skills. Con `lote`, varios enlaces pueden ser un video cada uno
  (`lote-MMDD-HHMM-NN`, ver `skills/video-base/LOTE.md`). Cambiar la carpeta desde el estudio usa una que ya existe.
  Todo estilo de video hace vertical y horizontal: el compositor manda la línea `Formato:` (`skills/video-base/FORMATO.md`).
  La marca del canal (tono, nicho, cierre) vive en la carpeta de trabajo de la card: `marca.json`, la de siempre, y una
  más por canal en `marcas/<nombre>.json`, con el mismo formato. Con dos o más, el compositor deja elegir en «Marca»
  (`marcasDe` en `server/skills.ts`) y manda la línea `Marca: <nombre>`; la leen `marca.py` del explicativo y `nuevo.py`
  de El Diff. Nada recuerda la última: sin elegir, va la de siempre.
- `modelos` (`web/src/Modelos.tsx`): en «Optimizado», el modelo y el esfuerzo medidos para el hilo. Una card sin medir
  usa lo último que eligió el usuario a mano. En «Avanzado» se eligen. Los subagentes van siempre en el modelo y el
  esfuerzo del hilo: en Claude, Sloth los manda en la línea `Subagentes: todos = <alias> <esfuerzo>.` (las `tareas`
  medidas de la card ya no se usan). La excepción es el `guionista` del explicativo (`server/claude.ts`), que va en Opus.
- La galería: al elegir un estilo, sus videos terminados ocupan el sitio de las cards (`videosApi` en `etapas.ts`);
  «Mis videos» (`MisVideos.tsx`) los junta todos. Cada card enseña de fondo el más nuevo (`server/previas.ts`).
- `server/redes/` y `web/src/Redes.tsx`: los verticales terminados se programan al ritmo que eliges en «Mis videos» (`web/src/Ritmos.tsx`, las cuentas en `shared/ritmo.ts`; YouTube lleva el suyo).
  TikTok va por su página (ADR 0002), en la página `redes` del navegador integrado, con su propio perfil (sin la ventana
  de Sloth, en un Edge con `data/redes/perfil`);
  Instagram, por la nube (`nube/`, un Worker de Cloudflare con R2 y un cron, ADR 0003), que publica con la computadora
  apagada. La nube se despliega con `npm run nube -- deploy`, no con «Reiniciar backend». Cuando todo un video quedó
  programado, se borra lo regenerable de su carpeta (`out/partes`, `_bundle_rev`). Para mirar o mover la cola:
  `docs/agents/redes.md`.
- `server/voz/` y `web/src/Voz.tsx`: la voz de los videos con Google AI Studio (Gemini 3.8 Flash TTS), en la cuenta de
  Google de cada quien (Opciones → Voz). La genera el servidor en la página `voz` del navegador integrado, con su propio
  perfil; los agentes la piden con el MCP `voz` (`mcp.mjs`), y el menú «Voz» del compositor manda la línea `Voz:` que
  siguen las skills (`skills/video-base/VOZ.md`). ADR 0011. Fish Audio y ElevenLabs van por su API con la llave de cada
  quien (`server/voz/apis.ts`, voces `fish:<id>` y `elevenlabs:<id>`), también clonando la voz del usuario. Voices
  Cloning, el proveedor de Sloth (voces `vc:<id>`, `server/voz/voices-cloning.ts`, ADR 0018), va por el cobro
  (`licencias/src/voz.ts`), que guarda la llave del socio y los créditos de cada quien; su catálogo sale en el menú «Voz» con el pase del cobro. El menú
  «Voz» es `web/src/ElegirVoz.tsx`: buscar en español, oír la muestra (`server/voz/muestras.ts` la guarda) o tu frase
  (`/api/voz/probar`) y clonar grabando ahí. En los estilos con `musica` en su card (el explicativo), su pie enciende la
  música de fondo: la línea `Música: de fondo` (`lineaMusica`), que pone `skills/video-base/scripts/musica.py`. Su eval contra ElevenLabs, Fish Audio, AI Studio y Suno:
  `docs/agents/eval-voz.md` (`node scripts/eval-voz.mjs <puerto>`).
- Administrador (`web/src/Admin.tsx`, `/api/admin*`): solo en la computadora del creador, la que tiene su `admin.txt` (o `publicar.txt`).
  Saldo, usuarios, consumo y registro de Voices Cloning; dar, quitar y suspender.
- `server/flow/` y `web/src/Flow.tsx`: imágenes (Nano Banana) y videos (Veo) de Google Flow, con la cuenta de la voz (en
  su Edge y su turno, `voz().google`) y las que se agregan en Opciones (`cuentas.ts`, cada una en su Edge), hasta dos a la
  vez y con ritmo. `elegirCuenta`, el ritmo y los descansos están en `shared/flow.ts`. `pagina.ts` maneja la página, por sus iconos: texto,
  referencias («Ingredientes») o fotogramas. Los agentes piden con el MCP `flow` (`mcp.mjs`, `skills/video-base/FLOW.md`).
  Lee el costo antes de generar y no pasa del tope. «Ayudar a mejorar Flow» se apaga para todos y se cambia en Opciones →
  Google Flow. El menú «Imágenes» del compositor manda la línea `Imágenes:` (ChatGPT o un modelo de Flow). ADR 0014, 0015 y 0016.
- El navegador de cada hilo (`electron/navegador.ts`, el globo de `web/src/Navegador.tsx`): el Playwright MCP del agente
  (`server/navegador-agente.ts`, lanzado a demanda por `server/navegador-mcp.mjs`) entra en él por CDP. Sin ventana, un Chrome con `data/navegador`; en lotes, uno limpio.
  Sus capturas y los logs de consola quedan en `data/navegador-capturas/`. Copia lo mejor del de T3 Code (`C:\dev\t3code`):
  pestañas (el agente solo usa la primera), tamaños fijos (`navegador-medidas.ts`) y bordes que se arrastran. T3 usa
  `<webview>` y Sloth una vista nativa: el tamaño fijo es `enableDeviceEmulation`, y por eso el relevo reescala los clics.
  Google no deja iniciar sesión dentro de la app: ese paso se da en Edge (Chrome en Mac; en Windows sin Edge, tu predeterminado si es Chrome, Brave o Vivaldi, o el que haya: `server/chromium.ts`) y la sesión pasa a sus páginas (`electron/google.ts`).
- `server/ideas/` y `web/src/Ideas.tsx`: Ideas, qué video hacer: largo en YouTube o vertical en TikTok e Instagram
  (`formato: 'vertical'`), en `trabajo/ideas/<id>/`. Investigar mide cada video contra su canal (outlier: 3× o más),
  transcribe lo dicho (`transcribir.ts`) y agrupa temas con vectores locales (`vectores.ts`); en vertical busca con
  cuentas desechables (`data/investigacion/perfil`, nunca las que publican) y mide Instagram con la API de Meta.
  «Proponer» abre `ideas-youtube` o `ideas-vertical` (con
  `mcp.ts`); «Hacer con…», un borrador de un estilo con la línea `Idea: <canal>/<idea>`.
- `server/radar/`: buscador propio de noticias tech, cada 5 minutos (`POST /api/radar/buscar`).
- La comunidad (`web/src/Comunidad.tsx`, `server/comunidad.ts`): un feed como el de Skool que vive en el Worker del cobro
  (`licencias/src/comunidad.ts`); cada quien entra con su cuenta gratis (o la clave de su apoyo) y tú, como creador, con la llave de `admin.txt`.
  Publicar una mejora (la ven todos): `POST /api/mejoras {texto}`. Un anuncio a nombre del creador, en su tono:
  `docs/agents/anuncios.md`. La rifa (`licencias/src/rifa.ts`): arriba de la comunidad «Participa en la rifa» (`Rifa.tsx`,
  solo quien usa Sloth gratis), en Administrador se arma y se sortea con la ruleta (`RifaAdmin.tsx`); el ganador recibe
  sus créditos de voz, un correo y el aviso a pantalla completa (`GanasteRifa.tsx`).
- `server/modelos3d.ts` y `web/src/Modelos3D.tsx`: «Modelos 3D» enseña la biblioteca `skills/modelos-3d` que usan los
  agentes (la de `SKILLS`), que llenan los videos. Empieza vacía; la moneda de la plantilla
  va en `modelos-3d/plantilla`, sin enseñarse. Sus botones (`server/modelos3d-acciones.ts`, `web/src/Modelos3DAcciones.tsx`):
  «Importar .glb» corre `modelos.py importar` sin agente, en una carpeta temporal que se borra (Draco y Meshopt se
  abren; el decodificador de Draco va con el modelo); «Nuevo modelo» abre un hilo de `MODELO3D_CARD` (`shared/modelos3d.ts`,
  no sale en el inicio) en su propia carpeta, `<trabajo>/modelos-3d/<nombre>` (skill `modelos-3d`, §6).
- `server/originales.ts` y `web/src/TusCambios.tsx`: en la app que se vende, «Con tus cambios (N)» bajo la card dice qué
  archivos de su skill (y de video-base) ya no son como los trae la versión, y vuelve a la original, entera o uno a uno.
  Lo que se pisa, también al actualizar (`prepararSkills`), se copia antes a `data/skills-tuyas`.
- `server/anteriores.ts` y `web/src/EstiloCambio.tsx`: cuando una versión cambia a fondo un estilo de Sloth, su card en
  `cards.json` lleva `cambio` (la fecha, qué cambió para quien hace videos, el enlace a los dos lado a lado y lo de la
  card de antes que ya no es igual). Al actualizar se guarda el de antes. Al abrir Sloth, todos ven un aviso a pantalla
  completa hasta pulsar «Leí toda la especificación»; quien tenía el de antes elige luego «Guardar también el de antes»,
  que lo pone entre sus estilos como `<skill>-<fecha>`, o «Usar solo el nuevo». El de Sloth se actualiza siempre.
  Cada estilo lleva su `version`, a la vista en su card: el segundo número sube con un cambio que se nota, el primero
  con uno a fondo (el del `cambio`, que dice en `antes.version` la de antes; lo comprueba `reglas-repo.test.ts`).
  El aviso enseña el mismo video con los dos (`cambio.comparacion`), con los archivos en `web/public/cambios/<card>/`. Al rehacer un estilo, pon el
  `cambio` y deja la comparación lista antes de publicar.
- `server/requisitos.ts`: lo que las skills necesitan fuera de Sloth. Cada card pide solo los paquetes de su skill
  (`PAQUETES` dice cuáles), siempre ya compilados; si tu Python de Windows no los tiene (uno recién salido), baja el suyo. Instala automáticamente el Python de Sloth en `%APPDATA%\youtube\piezas\python`,
  sus paquetes y los modelos; elige CUDA y Whisper si hay una NVIDIA que lo aguante (`aguantaCuda`) y, si no, CPU y
  Parakeet (`MotorVoz`, ADR 0007). Una instalación interrumpida se puede reanudar. Si hay varios, Sloth y `sloth.py`
  usan el mismo (`elegirPython`).
- `server/equipo.ts` y `web/src/Equipo.tsx`: Opciones → Tu equipo. Qué eligió Sloth para esta computadora y cuánto
  tarda aquí la voz y el render, de lo que midió (`equipo.json`, junto a los modelos). Si puede ir más rápido (Parakeet
  sin NVIDIA), el hilo nuevo lo ofrece arriba.
- `server/espacio.ts` y `web/src/Espacio.tsx`: Opciones → Espacio en disco. Lo que dejan los videos y no hace falta
  (temporales de Remotion, pedazos de render, `node_modules` repetidos, cachés viejas); lo seguro lo borra solo cada
  6 horas si nada trabaja. Las skills evitan dejarlo con `espacio.py` y `remotion.cjs` de video-base. «Cambiar de disco…»
  (`electron/mudanza.ts`) lleva los videos, la IA local, los agentes y `sloth-modulos` a otra carpeta y deja enlaces en
  su sitio, con las mismas rutas; el instalador de Windows deja elegir la carpeta (`scripts/instalador.nsh`).
- `python/procesos/`: lo que las skills corren con el Python de Sloth (transcribir la voz o un video ajeno), lanzado por
  `proceso()` de `sloth.py` o `comun.py`. Con NVIDIA transcribe Whisper, ya cargado en `video-base/scripts/voz_viva.py`
  (ADR 0008); sin ella, Parakeet y `alineador.py` (`parakeet.py` dice cuál y por qué).
- `server/cuenta.ts`, `server/version.ts` y `server/opciones.ts`: la cuenta de Claude, la versión de Claude y de Codex
  (la que trae Sloth: se ponen al día al subirlas en package.json y publicar) y las credenciales de YouTube e Instagram (en las variables de entorno del usuario).
  `server/acceso.ts`: si Claude y Codex pagan con la suscripción o con una llave de API (Opciones → Agentes), guardada en
  `data/agentes.json`.
- `web/src`: React. `api.ts` habla con el servidor; `eventos.ts` guarda los eventos fuera de `App`, `items.ts` los junta
  en bloques y `Timeline.tsx` los dibuja; `Composer.tsx` es el campo de texto.
