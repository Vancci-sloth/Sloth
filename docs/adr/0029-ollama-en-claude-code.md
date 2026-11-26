# Ollama, en el Claude Code de Sloth

Fecha: 2026-11-26

## Contexto

Se pidió Ollama (ollama.com): el programa con que cada quien corre modelos en su computadora y, con su cuenta de
Ollama, los de su nube (`…:cloud`). Escucha en `127.0.0.1:11434`, desde la 0.14 habla la API de Anthropic en esa misma
dirección (`/v1/messages`) y documenta cómo usar Claude Code con ella. No tiene llave.

Lo pidió la comunidad, y keradesarrollo lo propuso en su copia de Sloth (Anubis) como una entrada más de
`server/otra-api.ts`, con todos los modelos instalados. Antes de hacerlo se probó un Ollama de verdad (0.40.18 en
Windows, sin tarjeta):

- **Con su contexto de fábrica no da error: recorta.** Ollama abre cada modelo con 4 096 tokens si hay menos de 24 GB
  de VRAM. El primer pedido de Claude Code, sin nada de Sloth, medía 4 273 tokens; le llegaron 3 957 y contestó como
  si nada. Con las instrucciones, los MCP y la skill de un hilo, se queda sin leer casi todo.
- **Sloth no puede pedir otro contexto.** Un modelo cargado con `num_ctx` más grande se vuelve a cargar con el de
  fábrica en cuanto llega un pedido por `/v1/messages`, que no admite opciones. El contexto es del servidor de Ollama
  (el control de sus ajustes, o `OLLAMA_CONTEXT_LENGTH`) o del Modelfile de cada modelo.
- `/api/tags` dice, desde la 0.30, qué sabe hacer cada modelo y su ventana; `/api/ps`, con cuánto contexto quedó cada
  uno al cargarse. Cargar un modelo sin generar nada es un `POST /api/generate` sin `prompt`.
- Los de la nube salen en la lista con `remote_host`, aun sin cuenta; al usarlos sin ella, Ollama contesta 401.

## Decisión

- **Es el truco de DeepSeek** (ADR 0012 y 0021): el mismo Claude Code con otra dirección, una entrada más en
  `server/otra-api.ts`. Como FreeLLMAPI, Sloth no lo instala ni baja modelos: guarda dónde escucha, lo busca en esta
  computadora y deja escribir otra dirección. Sin llave: se guarda la que su guía manda poner (`LLAVE_OLLAMA`).
- **Solo salen los modelos que pueden llevar un hilo:** con herramientas y con 64 000 tokens de ventana o más, lo que
  pide la guía de Ollama para Claude Code. Por eso se conecta desde la 0.30, que es la que lo dice en su lista.
- **El contexto lo pone quien usa Ollama, y Sloth lo comprueba antes de cada mensaje** (`antes` en `OtraApi`,
  `antesDeOllama`): le pide a Ollama que cargue el modelo, que es lo que haría con el mensaje, y mira con cuánto
  quedó. Con menos de 64 000, el mensaje no se manda y el turno acaba diciendo dónde subirlo. De paso dice en claro
  lo que Claude Code diría tras minutos de reintentos: que Ollama está cerrado, que el modelo no cargó (con lo que
  dijo Ollama) o que uno de la nube pide la cuenta.
- **No se crean modelos derivados.** Sloth podría hacerse una copia de cada modelo con su `num_ctx` (`/api/create`)
  y no pedirle nada a nadie, pero dejaría modelos suyos en el Ollama de cada quien, que luego tendría que cuidar.
- **Los de esta computadora se compactan a 64 000**, lo que se exige, porque la ventana con que se cargó no se sabe
  al abrir el hilo. Los de la nube van con toda la suya.

## Consecuencias

- Sale en beta. Hacer un video pide un modelo capaz y 64 000 de contexto, que ocupan mucha memoria: en la computadora
  de la prueba (16 GB de RAM, una RTX 3050 de 6 GB) el único que cupo así fue `llama3.2:1b`, que dentro de Claude Code
  no llama herramientas. Para casi todos, lo que sirve de Ollama son sus modelos de la nube o una computadora grande.
- Quien no subió el contexto se entera en su primer mensaje, no antes: hasta cargar un modelo no se sabe.
- Ollama tiene que estar abierto mientras Sloth trabaja: cerrado, sus modelos no salen y Opciones lo avisa.
- Si alguien sube el contexto por encima de 64 000, Sloth compacta antes de lo que haría falta.
- El cobro lleva la lista de agentes (`shared/providers.ts`, por `shared/guia.ts`): hasta desplegarlo con la versión
  que traiga esto, la guía de un estilo compartido no conserva «ollama» entre los agentes con que se probó.
- Probado con el Ollama de verdad (26-nov-2026): encontrarlo sin dirección; el catálogo (de cinco modelos salieron
  tres: fuera el de embeddings y uno con herramientas y 40 960 de ventana); el aviso con el contexto de fábrica, sin que
  a Ollama le llegue el mensaje; con 64 000, un hilo y una respuesta suelta con `llama3.2:1b`; detenerlo mientras carga;
  uno de la nube sin cuenta; un modelo que no existe; y Ollama cerrado. Con `qwen3:1.7b` y Claude Code directo (no pasa
  el filtro de Sloth), un turno que piensa, llama a `Write` y crea el archivo.
- No se probó: un modelo de la nube con cuenta, un video entero, Mac ni Linux, ni la fila de Opciones en la ventana.
