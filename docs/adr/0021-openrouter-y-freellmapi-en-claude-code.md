# OpenRouter y FreeLLMAPI, en el Claude Code de Sloth

Fecha: 2026-11-17

## Contexto

Se pidió sumar OpenRouter y FreeLLMAPI a los agentes. OpenRouter es un enrutador de pago por uso con casi todos los
modelos (y unos cuantos gratis). FreeLLMAPI (github.com/tashfeenahmed/freellmapi) es un programa que cada quien instala
en su computadora y que junta los rangos gratis de muchos proveedores detrás de una sola llave. Los dos hablan la API
de Anthropic y documentan cómo usar Claude Code con ella (`ANTHROPIC_BASE_URL` y `ANTHROPIC_AUTH_TOKEN`). Pi ya llegaba
a OpenRouter, pero con otro programa que bajar y sin las skills con `/` ni los subagentes de Claude Code.

## Decisión

- **Los dos son el truco de DeepSeek** (ADR 0012): el mismo Claude Code, con otra dirección y la llave de cada quien.
  Lo común de los tres vive en `server/otra-api.ts` y `entornoClaudeCon` (`server/acceso.ts`); otro así es una entrada más.
- **Todos los alias van al modelo del hilo** (`opus`, `sonnet`, `haiku`, `fable`): no se cobra un modelo que nadie eligió,
  y FreeLLMAPI no tiene un «rápido» fijo. Las respuestas sueltas (`server/redactar.ts`) también van con ese modelo.
- **De OpenRouter solo salen los modelos que pueden llevar un hilo** (`sirve`, `server/openrouter.ts`): con herramientas,
  servidos por la API de Anthropic y con 200 000 tokens de ventana o más, que es lo que supone Claude Code. Quedan unos
  240 de 470: por eso el desplegable de modelos lleva un buscador (`buscar` en `Picker`).
- **El costo de OpenRouter sale de los precios de su catálogo**, no de Claude Code, que lo contaría a precio de Claude.
  FreeLLMAPI no cuesta: lo que gasta es la cuota gratis de cada proveedor, que lleva él.
- **Sloth no instala FreeLLMAPI ni guarda las llaves de sus proveedores**: guarda su dirección y su llave única. Sin
  dirección lo busca en esta computadora (el puerto de su app de escritorio y el de Docker); se puede escribir otra.

## Consecuencias

- Salen en beta. Claude Code está hecho para los modelos de Claude: OpenRouter solo garantiza que funcione con ellos, y
  FreeLLMAPI dice de sí mismo que es para experimentar. Un modelo chico puede fallar con las herramientas a medio video.
- FreeLLMAPI tiene que estar abierto mientras Sloth trabaja: cerrado, sus modelos no salen y Opciones lo dice.
- Si un hilo de OpenRouter arranca antes de leerse el catálogo (recién abierto Sloth), va como de 200 000 de ventana y
  ese turno no suma dólares; al leerse, lo siguiente ya sale bien.
- El esfuerzo se manda como a DeepSeek (`CLAUDE_CODE_EFFORT_LEVEL`); cómo lo traduce cada modelo es cosa de OpenRouter.
- OpenRouter no dice cuánto le entró a una llamada al empezarla (manda ceros) sino al acabarla: el círculo del contexto
  se llena con esa cifra (`reader`, `server/claude.ts`).
- Los modelos gratis se saturan seguido: Claude Code reintenta unos tres minutos y acaba con «429». El error del turno
  lleva qué hacer (`conConsejo`, `server/otra-api.ts`), igual con el 402 de quien no tiene saldo.
- Probado en Windows con una llave real de OpenRouter (cuenta gratis, 19-nov-2026): una respuesta suelta, hilos que
  escriben y leen un archivo con dos modelos gratis (uno con `[1m]` y esfuerzo), un hilo de la card «Nuevo estilo» en una
  copia de la app (cargó la skill y usó `Read`), un modelo de pago y el 429 de un modelo saturado.
- Probado con un FreeLLMAPI de verdad (su imagen de Docker en `:3001`, con OpenRouter y sus proveedores sin llave):
  Sloth lo encontró sin dirección, salieron 18 de sus 56 modelos disponibles, y contestaron una respuesta suelta, un
  hilo que escribe y lee un archivo con `auto` y un hilo de «Nuevo estilo» en la copia de la app con un modelo concreto.
  Su catálogo trae además `fusion` y los huecos `claude-…` (no dicen qué admiten) y muchos modelos de 3 000 tokens de
  ventana: no salen (`modelosDe`, `server/freellmapi.ts`). Detenido, Opciones lo avisa y el turno acaba a los tres
  minutos diciendo que está cerrado. No se probó su app de escritorio (`:31415`) ni un video entero con ninguno.
