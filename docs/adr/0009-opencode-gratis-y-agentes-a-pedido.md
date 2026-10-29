# OpenCode, la versión gratis, y los agentes que se bajan al elegirlos

Fecha: 2026-10-29

## Contexto

Sloth solo trabajaba con Claude o con ChatGPT, y los dos piden un plan de pago (o una llave de API). Quien quería
probarla sin pagar no podía hacer nada. OpenCode 2 (`opencode serve`) trae modelos gratis, los de OpenCode Zen, que no
piden cuenta: el servidor los lista sin credenciales (`opencode/big-pickle`, `glm-5.3-flash-free`,
`deepseek-v4.1-flash-free`…, verificado con la 2.2.1). Son gratis «por tiempo limitado», el catálogo cambia solo, y
algunos usan lo que se les manda para mejorar el modelo (Big Pickle, MiMo, Flint) o lo guardan unos días.

Además, el instalador traía el programa de los dos agentes, aunque casi nadie usa los dos: Claude Code pesa 290 MB y
Codex 460 MB, y OpenCode serían otros 250 MB.

T3 Code, en el que se basa Sloth, ya integra OpenCode (`packages/provider-opencode`, versiones 1.x y 2.x). Sus notas
para un proveedor nuevo (`docs/internals/adding-a-provider.md`) y su adaptador de OpenCode 2 sirvieron de guía.

## Decisión

- **OpenCode es un tercer proveedor**, `server/opencode.ts`, que cumple el mismo `AgentRun` que Claude y Codex. Solo
  enseña los modelos gratis de Zen (proveedor `opencode`, costo 0): los de otros proveedores salían si el entorno traía
  su llave, y la versión gratis no debe cobrar nada.
- **Como en T3 Code, un solo servidor para todos los hilos.** Cada hilo es una sesión en su carpeta (`location`). Lo de
  cada hilo va en su sesión: las instrucciones de Sloth (`session.instructions.entry.put`), las reglas de permisos y su
  navegador, un MCP con nombre propio (`sloth-<hilo>-playwright`, con `mcp.add`) que las reglas dejan usar solo a ese
  hilo. Un servidor por hilo chocaría en la base SQLite que comparten (T3 Code reintenta al arrancar por `SQLITE_BUSY`).
- **Sus datos van en `data/opencode`** (las variables `XDG_*`), no en el OpenCode que tenga el usuario: OpenCode 2
  convierte la base de 1.x al abrirla, y no se debe tocar la suya. Sin formateadores, LSP ni copias de la carpeta del
  video (`snapshots`), y con título fijo, para no gastar una llamada al modelo gratis en ponerle nombre.
- **Sin permisos, como los otros dos**, salvo la pregunta interactiva (`question`), que dejaría el turno esperando una
  respuesta que la interfaz no sabe dar.
- **El programa de cada agente se baja al elegirlo** (`server/agentes.ts`), con el npm de Sloth, a
  `%APPDATA%\sloth\piezas\agentes`: al conectar la cuenta de Claude o de ChatGPT, al pulsar «Usar gratis» en OpenCode o
  con el primer mensaje de un hilo de ese agente (`conAgente`). Mirar una cuenta o pedir el catálogo no baja nada.
  `compilar` instala sin los opcionales de npm, que son justo esos programas. Un proveedor nuevo es una entrada más en
  `AGENTES`.
- **Lo que hay que saber de los modelos gratis va a la vista**, en la bienvenida y en Opciones: que Claude y ChatGPT
  piden un plan de pago, que OpenCode solo usa sus modelos gratis, que se saturan y qué hacen con lo que les mandas.

## Consecuencias

- Sin Claude ni ChatGPT, un hilo nuevo va con un modelo gratis de OpenCode (Big Pickle, si sigue en el catálogo).
  «Optimizado» se midió con Claude: con OpenCode, el hilo va en «Avanzado».
- Lo que las skills hacen con Codex (las imágenes de `image_gen`: portadas, poses) no sale con la versión gratis; las
  skills ya lo dicen y siguen sin ello.
- Las herramientas de Ideas corren dentro del servidor de Sloth: como con Codex, un hilo de OpenCode no las tiene.
- Quien actualiza desde una versión que traía los programas los baja una vez, la primera vez que usa cada agente.
- El adaptador se prueba con un turno grabado de OpenCode (`server/opencode.grabacion.json`), como pide T3 Code, no
  con eventos escritos a mano.
