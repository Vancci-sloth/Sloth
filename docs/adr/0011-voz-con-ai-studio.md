# La voz con AI Studio, por su página y con la cuenta de cada quien

Fecha: 2026-10-29

## Contexto

Hasta ahora la voz la grababa el usuario, salvo El Diff, que tenía un script propio (`voz_studio.mjs`) que manejaba
Google AI Studio en un Edge aparte. Ningún otro estilo podía generarla, ni se podía elegir la voz desde Sloth.

AI Studio genera la voz con Gemini 3.8 Flash TTS («Generate speech»), en español, con más de 2.000 voces. Por la API,
la llave gratis da unos 10 pedidos al día; por la página, con la cuenta de Google del usuario, no hay tope publicado. Se
probó el 29 de octubre de 2026:

- Google no deja iniciar sesión dentro de una app de Electron, pero acepta en ella las cookies de Google copiadas de un
  Edge donde se entró: AI Studio abrió con la cuenta, generó y bajó el WAV en la página del navegador integrado.
- El WAV (24 kHz, mono) lo baja el botón Download desde un marco de otro proceso (`blob:null`), que no avisa por CDP:
  Electron lo recibe en `will-download` de la página.
- La cabecera del WAV dice el doble de bytes por segundo de los que lleva.

## Decisión

- **La voz la genera el servidor de Sloth, no el agente** (`server/voz/`), en una página propia del navegador integrado
  (`NAVEGADOR_VOZ`, perfil `persist:voz`): la sesión de Google no la tiene ningún agente. Se entra una vez en Edge
  (Chrome en Mac y Linux) y las cookies pasan a la página; si la página las pierde, se vuelven a pasar de Edge sin
  preguntar. Sin la ventana de Sloth, se genera en ese Edge, sin ventana.
- **Los agentes la piden con un MCP propio** (`server/voz/mcp.mjs`, JavaScript sin paquetes), igual para Claude, Codex
  y OpenCode. Cada herramienta espera como mucho 40 s (Codex corta a los 60) y da un id para seguir esperando.
- **Una voz a la vez, en fila**, y sin volver a pedir lo que no cambió (`.huella`).
- **El usuario elige al pedir el video**: en el compositor, «Voz» manda la línea `Voz:` (`shared/voz.ts`) con una voz de
  AI Studio o con que la manda él. Las skills la siguen con `video-base/VOZ.md`, así que sirve a todos los estilos, a
  los que vengan y a los que haga cada quien. La card dice si no hay qué elegir (`voz: false`, el documental) o cómo
  hace el estilo la suya (`voz.propia`, el reel con edge-tts).
- **WebMCP no sirve aquí**: son herramientas que publica el propio sitio, y AI Studio no publica ninguna.

## Consecuencias

- Si AI Studio cambia su página, la voz falla con una captura en `data/voz/error.png` y el agente pide la voz al
  usuario. Los botones se buscan por su texto en inglés, que no cambia con el idioma de la cuenta.
- Usar la página de forma automática no está dicho en los términos de Google: es una zona gris, con la cuenta de cada
  quien y a su ritmo (una voz a la vez).
- La cuota de la página no se conoce; si se acaba, el agente lo dice y pide la voz.
