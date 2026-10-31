# DeepSeek, Grok, Antigravity, Cursor, Muse Code y Pi, como en T3 Code

Fecha: 2026-10-29

## Contexto

Sloth trabajaba con Claude, Codex y OpenCode. T3 Code, en el que se basa, ya integra además Grok, Antigravity, Cursor,
Muse Code y Pi (`packages/provider-*` y `apps/server/src/provider`), y se pidió sumarlos junto con DeepSeek. Cada uno
habla distinto: Grok y Antigravity, ACP por stdio; Cursor, un SDK de Node; Muse, su propio JSON-RPC (MSP); Pi, un RPC
por líneas. Ninguno estaba instalado en la computadora donde se hizo.

## Decisión

- **DeepSeek no es otro programa: es Claude Code con la API de DeepSeek** (`server/deepseek.ts`), compatible con la de
  Anthropic, como lo recomienda DeepSeek en su guía. Un hilo de DeepSeek tiene todo lo de uno de Claude: las skills con
  `/`, los subagentes (los alias `opus` y `sonnet` van al modelo del hilo, `haiku` a Flash), el navegador y la voz. Se paga
  con la llave de API de cada quien, que se guarda como las de Claude y Codex (`server/acceso.ts`). Los dólares no son
  los de Claude Code, que usaría los precios de Claude: salen de los tokens de cada modelo con la tabla de DeepSeek
  (`dolaresDeepSeek`), al doble en su hora pico. Los feriados chinos, que son valle, no se cuentan.
- **Cada agente con lo suyo, como en T3 Code**, pero solo lo que usa Sloth: sin permisos (se acepta todo una vez), sin
  modo plan, un proceso por hilo y las instrucciones de Sloth al principio del primer mensaje cuando el protocolo no las
  admite aparte. La skill va por su ruta, como con Codex.
- **Las versiones las fija Sloth** y van en el nombre de su carpeta: Grok 1.0.70 (el paquete de cada sistema, que viene
  comprimido con brotli), Pi 1.4.0 y el SDK de Cursor 1.2.0, de npm; Antigravity 1.4.1, el zip de Google con su huella
  (la que usa T3 Code: de la 1.4.2 a la 1.4.4 escriben una skill suya en cada carpeta); Muse, con el instalador de Meta en
  la carpeta de Sloth y sin tocar el PATH.
- **Cursor corre en un puente aparte** (`server/cursor-puente.mjs`), copiado junto al SDK que se baja: el SDK busca sus
  ayudantes (rg, el sandbox) desde el script que se corre, y T3 Code vio errores suyos que tumbaban el proceso.
- **Pi recibe los MCP de Sloth con una extensión** que escribe Sloth (`pi.registerMcpServer`, con sus herramientas a la
  vista del modelo): las ve con los mismos nombres que Claude (`mcp__navegador__…`).
- **Las cuentas son las de cada agente, donde las guarda siempre**: `grok login`, `muse login` y `/login` de Pi en su propia
  ventana (como `claude auth login`); Cursor y Antigravity, con un enlace en el navegador. Antigravity guarda la suya en
  `data/antigravity`, aparte del Gemini del usuario, como OpenCode. Pi no tiene `pi login`: una extensión le escribe
  `/login`, le da Enter y cierra la ventana al guardarse la cuenta, para que nadie tenga que saber el comando. Antigravity
  abre él mismo la página de Google tras unos 35 s de arranque: Sloth no abre pestaña, y el proceso del inicio de sesión
  se queda para el primer hilo, que así no vuelve a esperar.
- **Ninguno hereda las llaves que Sloth guarda para Claude y Codex** (`entornoSinLlaves`): Pi usaba la de Anthropic que
  veía en el entorno y cobraba en ella sin que se eligiera. A Pi se le pueden dar en Opciones («Usarlas en Pi»,
  `entornoAgente`): entonces ve las de Claude, ChatGPT y DeepSeek guardadas, se pague o no con ellas en su agente.

## Consecuencias

- DeepSeek, Grok, Antigravity y Pi salen en beta: lo dicen en Opciones y en el selector de modelos, y los errores se
  reportan en la Comunidad, en Ayuda.
- «Pedir una mejora» la redacta el agente del hilo, también estos: DeepSeek con Flash, sin herramientas; los demás, que no
  tienen una respuesta suelta, con uno de un momento en una carpeta vacía y el modelo del hilo (`redactarConAgente`).
  Tarda más que con Claude, pero usa la cuenta que ya funciona en ese hilo.
- Ninguno informa límites de plan a Sloth: el contexto del hilo los enseña vacíos.
- Lo probado de punta a punta en esta computadora: bajar los cinco programas con el código de Sloth, un turno de Pi con
  herramientas, sus MCP, tokens y costo, y que los demás acaben el turno pidiendo la cuenta. Un turno real de Grok,
  Antigravity, Cursor, Muse y DeepSeek espera a una cuenta o una llave; el cliente ACP se prueba con un agente de mentira
  que contesta como Grok (`server/acp.test.ts`).
- Antigravity es un solo archivo de PyInstaller que en cada arranque desempaca cientos de MB en su carpeta temporal
  (335 MB solo para empezar) y tarda unos 40 s. T3 Code abre uno por hilo; Sloth, uno para todos sus hilos, cada uno en
  su sesión de ACP (`compartido`), que se cierra 10 minutos después del último. Reusar una carpeta ya desempacada no se
  puede sin saltarse una protección de PyInstaller (GHSA-9fxf-4qw3-ghmr). Un turno que no corta al detenerlo se da por
  detenido sin cerrar el proceso, que cortaría a los demás hilos.
