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

En los estilos que hacen clips, la línea `Clips: genéralos en Google Flow con <modelo> …` dice el `modelo`, la
`resolucion` (en Omni) y el `tope` de cada `generar_video`. La eligió el usuario: manda sobre tu skill, y ese tope ya lo autorizó.

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
- `generar_video`: 8 s con audio, 720p. **Gasta los créditos del usuario:** Lite 10, Fast 20, Quality 100, Omni 1.2
  Flash 24 y Omni 1.1 Flash 12 (8 y 6 con `resolucion` `360p`, que se ve borroso: solo si el usuario la pide). Fast,
  Quality y Omni 1.1 se van de Flow el 5 de diciembre de 2026. Una cuenta gratis tiene 50 al día. `salida` es un `.mp4` en ruta absoluta. Parte de una de estas:
  - **Solo texto.**
  - **`primerCuadro`** (y, si quieres, `ultimoCuadro`): el video empieza en esa imagen. Es lo más fiable para que los
    personajes y el lugar salgan iguales de un clip a otro: arma el cuadro con `generar_imagen` y las hojas de los
    personajes en `referencias` (gratis) y anímalo. El cuadro va en el mismo `formato` que el video.
  - **`referencias`** (hasta 3): sigue a esos personajes sin partir de una imagen. No va con `primerCuadro`.

**Google Vids** (`modelo` `"Google Vids · Omni"`) hace el clip en Vids con las mismas cuentas y **no gasta créditos de
Flow**: usa el cupo de video de Vids de cada cuenta, que va aparte y que Vids no dice cuánto es. Sale en 720p, dura
`segundos` (de 3 a 15; sin él, 8) y toma hasta 3 `referencias` PNG o JPEG, que en el prompt se llaman «Imagen 1», «Imagen
2» e «Imagen 3». No acepta `primerCuadro`: pasa esa imagen en `referencias` y di en el prompt que el clip empieza en
«Imagen 1». Úsalo cuando el usuario lo pida (en el chat o con la línea `Clips:`), o si Flow se quedó sin créditos y el
usuario aceptó probar Vids.

Usa Veo 3.1 - Lite salvo que el usuario (en el chat o con la línea `Clips:`) o tu skill pidan otro. Cada pedido da un resultado. Antes de un lote de clips,
llama a `estado_flow` sin `id`: dice cuántos créditos le quedan a cada cuenta y cuántos videos van hoy. Dile al usuario
cuántos clips son, cuánto gastan y si alcanzan. Cada video hecho dice también cuánto queda. Si un pedido cuesta más que `tope` (20), no se genera: no subas el tope sin que el
usuario lo pida.

Lo que se dice en el clip va en el prompt, entre comillas y con quién lo dice: Veo genera las voces con el movimiento de
la boca. Que quepa en 8 s: unas 20 palabras por clip.

Tarda cerca de un minuto. Si no acabó en 40 s, la herramienta te da un id: sigue con lo que no lo necesita y espéralo con
`estado_flow`. Lo que no depende de lo anterior pídelo seguido: Sloth lo pone en fila y lo genera con calma (con
varias cuentas, hasta dos a la vez, con unos segundos entre pedidos), para que Google no lo vea como actividad rara.

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
- **Flow lo rechazó por «actividad inusual»:** si no gastó, Sloth ya lo pasó a otra cuenta, y solo te llega el error si
  ninguna pudo. Si el error dice que cobró o que no se supo, no lo repitas: dile al usuario qué clips faltan y cuánto
  se gastó. Con una sola cuenta, que espere a que se le quite (el error dice cuándo) o agregue otra.
- **Google Vids sin cupo:** el error dice qué cuentas no tienen y cuándo vuelven (el día 1). No gastó: puedes pasar a un
  modelo de Flow si el usuario lo acepta.
- **Otro error de Flow:** dile el error tal cual. Si dice «No gastó créditos», puedes pedirlo otra vez cambiando lo que
  Flow no aceptó. Si no, no lo repitas sin decírselo al usuario: puede gastar otra vez.

## Meta Muse, la otra opción

Si el usuario agregó cuentas de Meta (Opciones → Meta Muse), el MCP `meta` (en Claude, `mcp__meta__generar_imagen`,
`mcp__meta__generar_video` y `mcp__meta__estado_meta`) genera con Muse. Úsalo cuando el usuario lo pida o cuando Flow no
pueda (sin cuentas, o todas sin créditos): no reemplaza la línea `Imágenes:` ni la `Clips:`.

- `generar_imagen`: deja `.png`, `.jpg` o `.webp` según la extensión de `salida` (1152×2048 en 9:16). Junta o edita
  hasta 9 `referencias`.
- `generar_video`: 10 s con sonido, unos 700×1250 en 9:16. Lo dicho va entre comillas, unas 25 palabras. Con
  `primerCuadro`, anima esa imagen: lo fiable para que el personaje salga igual.
- No cobra por pedido: gasta el uso **semanal** de su plan (en el gratis, cerca del 1 % una imagen y del 9 % un video:
  unos 10 videos a la semana por cuenta). Sloth reparte entre sus cuentas y, si una gastó su semana, pasa sola a otra
  sin gastar. Antes de varios videos, `estado_meta` sin `id` dice cuánto lleva cada una; díselo al usuario.
- Tarda de 20 s (imagen) a un minuto (video). Con varias cuentas, hasta dos a la vez; lo que no depende de lo anterior
  pídelo seguido.
- **Si falla:** si ninguna cuenta puede (sin sesión o con la semana gastada), el error dice cuándo vuelven; que
  agregue otra o revise la sesión en Opciones → Meta Muse. Si Muse contestó sin el archivo (se negó
  o preguntó algo), el error trae lo que dijo: cambia el pedido, no lo repitas igual.
