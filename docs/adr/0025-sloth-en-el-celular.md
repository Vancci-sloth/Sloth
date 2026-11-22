# Sloth en el celular

Fecha: 2026-11-21

## Contexto

Se pidió Sloth para iOS y Android, con todo lo que se pueda. Lo que hace un video no cabe en un celular: los agentes
(Claude Code, Codex, OpenCode…) son programas de Node que corren comandos, las skills usan el Python de Sloth con
Whisper o Parakeet, FFmpeg, Remotion y un Chrome que dibuja cuadro por cuadro, y Flow y la voz van por un Edge con su
perfil. Nada de eso existe en iOS. En Android se podría intentar con Termux, pero sin GPU, con un Chrome que no corre
ahí, con el teléfono caliente y la batería en minutos, y solo en Android.

## Decisión

- **Dos modos, se elige en la bienvenida y se cambia en Más** (`movil/src/modo.ts`): «En este celular», sin
  computadora, y «Con mi computadora».
- **En este celular** (`movil/src/local/`): el agente es Claude por la API de Anthropic, con la llave de quien usa Sloth
  (en el llavero del teléfono; Opus 5.5 por defecto, Sonnet 5.5 o Haiku 5.5 a elegir), corriendo en el teléfono con el
  SDK oficial y un bucle propio con streaming (`agente.ts`). Los estilos de video viajan dentro de la app con su SKILL.md
  entero (`local/estilos.json`, de `scripts/estilos.mjs`; un test avisa si se quedó atrás). El agente sigue la skill en
  lo que no necesita programas: entiende el pedido, investiga con la búsqueda y la lectura web del servidor de
  Anthropic, y escribe el guion y lo demás en la carpeta del hilo, en el teléfono; adjuntas fotos (las ve) y tu voz
  grabada. Lo que pide correr scripts, renderizar o generar voz e imágenes lo dice y se detiene: «Seguir en la
  computadora» sube la carpeta del hilo a la Sloth de la computadora y abre allá el mismo pedido con lo ya hecho
  (`local/seguir.ts`). La comunidad funciona también sin la computadora, directo al cobro, con la cuenta que el
  celular guardó la última vez que estuvo conectado (`comunidadApi.ts`).
- **Con la computadora, el celular pide; la computadora hace.** La app de `movil/` (React Native con Expo, una sola para iOS y Android) es
  otra ventana de la misma Sloth: ve los estilos, abre hilos con las mismas opciones del compositor (formato, voz,
  música, clips, marca, modelo, lote) y las mismas líneas para la skill, sigue al agente en vivo, le contesta mientras
  trabaja, lo para, ve cómo va cada video por fases, reproduce lo terminado, lo guarda en la galería o lo comparte a
  TikTok, Instagram o WhatsApp, y lee y escribe en la comunidad. Adjunta fotos, videos y archivos, y graba tu voz con el
  micrófono (Sloth la pasa a WAV).
- **Una puerta aparte, con llave** (`server/celular.ts`). Sloth solo atiende a su propia ventana (`server/origen.ts`),
  y eso no cambia. El celular entra por el puerto de Sloth más uno (4849), que escucha en la red solo si lo enciendes
  en Opciones → Tu celular, y solo con la llave del QR (`Authorization: Bearer` o `?llave=` para videos e imágenes).
  Reenvía `/api` y `/ws` a Sloth como un script de esta computadora; la interfaz de escritorio y `/api/celular` no
  pasan, así que el celular no se puede apagar ni cambiar la llave. Cambiar la llave desconecta a los que tenían la
  de antes. Treinta intentos fallidos en 10 minutos desde una dirección y deja de contestarle un rato.
- **El QR es un enlace** (`slothmovil://conectar?d=<ip:puerto>,…&llave=…`): lo lee la app, y la cámara del celular
  también abre la app con él. Lleva todas las direcciones de la computadora (la de casa primero, luego Tailscale) y la
  app se queda con la primera que contesta. Fuera de casa funciona con una red privada como Tailscale; Sloth no abre
  nada a internet.
- **Lo que se comparte, se comparte.** La app usa los tipos de `shared/`, junta los eventos con `buildTimeline` de
  `web/src/items.ts`, elige el modelo con `shared/modelos.ts` y dibuja los iconos de `web/src/trazos.ts`: un cambio en
  cómo se lee un hilo se ve igual en los dos.

## Consecuencias

- En el modo computadora, la computadora tiene que estar prendida con Sloth abierta, y lo que se manda corre allá con
  sus cuentas y sus límites. En el modo celular paga la llave de la API de quien lo usa, a precio de la API (el costo se
  ve al final de cada turno), y el video final sigue necesitando la computadora: un teléfono no corre Remotion ni FFmpeg.
- El tráfico va sin TLS dentro de la red de casa (o cifrado por Tailscale fuera de ella). La llave viaja en cada
  pedido: quien la tenga entra como tú. Por eso la puerta está apagada hasta que la enciendes y la llave se cambia con
  un botón.
- Windows (y Mac) preguntan la primera vez si Sloth puede recibir conexiones: hay que decir que sí en redes privadas.
- Lo que solo se hace en la computadora sigue allá: conectar cuentas (Claude, Google, TikTok), instalar herramientas,
  el editor de escenas y el motor en vivo, Ideas, Redes y el Administrador.
- La app se compila con EAS (`docs/agents/publicacion.md`, «App del celular»); iOS necesita la cuenta de Apple.
