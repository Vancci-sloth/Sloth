# Google Flow: imágenes y clips generados

Sloth genera en Google Flow con las cuentas de Google del usuario (la de la voz y las que agregó en Opciones), con el MCP
`flow` (en Claude, `mcp__flow__generar_video` y `mcp__flow__generar_imagen`). Reparte los pedidos entre ellas: si una se
queda sin créditos, el pedido pasa solo a otra sin gastar.

## La línea `Imágenes:`

El usuario elige en el compositor de Sloth con qué se hacen las imágenes del video. Lo elegido llega en el primer
mensaje y manda sobre lo que diga tu skill:

- `Imágenes: genéralas en Google Flow con <modelo> …`: toda imagen nueva (texturas, portada, ilustraciones) va con
  `generar_imagen` y ese `modelo`. No uses Codex ni mires `codex login status`.
- `Imágenes: con ChatGPT …`: con Codex, como diga tu skill.
- Sin la línea: lo que diga tu skill.

**Cada paso de tu skill sale igual que con Codex**, con estos cambios:

- El pedido es el mismo `.txt`, en inglés, sin lo que habla de `image_gen`, de copiar el PNG o de responder con el nombre
  del archivo: pásalo en `prompt`. `DESCRIBE AQUÍ` se rellena igual.
- Lo que tu skill pasa con `-i` va en `referencias`, en rutas absolutas (probado con tres). Sale el mismo personaje.
- `formato`: `1:1` para poses, bocas y texturas; `9:16` para la portada.
- Deja un JPEG, de 1024×1024 en `1:1` y 768×1376 en `9:16`, en `<nombre>.jpg`. Tu paso sigue con el PNG:
  `ffmpeg -nostdin -v error -y -i <nombre>.jpg <nombre>.png`.
- Míralo siempre: si algo no salió, pídelo otra vez diciendo qué corregir. Si lo demás quedó bien, pasa el intento fallido
  en `referencias` y pide solo ese cambio: conserva el título tal cual. Las imágenes no gastan créditos.

## Las herramientas

Los clips, cuando el usuario los pida o tu skill lo diga.

- `generar_imagen`: Nano Banana. `salida` es un `.jpg` en ruta absoluta.
- `generar_video`: 8 s con audio, 720p (Omni Flash, 360p). **Gasta los créditos del usuario:** Omni Flash 6, Lite 10,
  Fast 20, Quality 100. Una cuenta gratis tiene 50 al día. `salida` es un `.mp4` en ruta absoluta. Parte de una de estas:
  - **Solo texto.**
  - **`primerCuadro`** (y, si quieres, `ultimoCuadro`): el video empieza en esa imagen. Es lo más fiable para que los
    personajes y el lugar salgan iguales de un clip a otro: arma el cuadro con `generar_imagen` y las hojas de los
    personajes en `referencias` (gratis) y anímalo. El cuadro va en el mismo `formato` que el video.
  - **`referencias`** (hasta 3): sigue a esos personajes sin partir de una imagen. No va con `primerCuadro`.

Usa Veo 3.1 - Lite salvo que el usuario o tu skill pidan otro. Cada pedido da un resultado. Antes de un lote de clips,
llama a `estado_flow` sin `id`: dice cuántos créditos le quedan a cada cuenta y cuántos videos van hoy. Dile al usuario
cuántos clips son, cuánto gastan y si alcanzan. Cada video hecho dice también cuánto queda. Si un pedido cuesta más que `tope` (20), no se genera: no subas el tope sin que el
usuario lo pida.

Lo que se dice en el clip va en el prompt, entre comillas y con quién lo dice: Veo genera las voces con el movimiento de
la boca. Que quepa en 8 s: unas 20 palabras por clip.

Tarda cerca de un minuto. Si no acabó en 40 s, la herramienta te da un id: sigue con lo que no lo necesita y espéralo con
`estado_flow`. Lo que no depende de lo anterior pídelo seguido: con varias cuentas se generan hasta tres a la vez.

## Si falla

- **Sin cuenta conectada, o se fue la sesión:** dile al usuario que conecte la de la voz en Opciones → Voz o agregue una
  en Opciones → Google Flow.
- **Ninguna cuenta puede ahora** (sin créditos o frenadas): el error dice cuándo vuelven a probar. No gastó nada. Dile al
  usuario cuántos clips faltan, y que puede esperar o agregar cuentas en Opciones → Google Flow.
- **Pide confirmar los derechos de las imágenes:** dile al usuario que los confirme en Opciones → Google Flow (o en
  «Confirmar derechos», junto al menú Imágenes). Esa decisión no es tuya: no la saltes. Lo que no necesite imágenes
  (referencias o fotogramas) sigue.
- **Es su primera vez con una cuenta, o no dejó crear un proyecto:** que abra Flow con esa cuenta en Opciones → Google
  Flow y acepte su aviso.
- **Otro error de Flow:** dile el error tal cual. No repitas un video que falló sin decírselo: puede gastar otra vez.
