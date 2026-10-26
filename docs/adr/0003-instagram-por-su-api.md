# Instagram por su API, desde la nube de Sloth

Fecha: 2026-10-08

## Contexto

Los videos verticales que Sloth programa en TikTok (ver `0002-publicar-en-redes-por-el-navegador.md`) también tenían que
salir en Instagram como Reels, con el mismo texto y a su propio ritmo. El usuario ya había creado una app de Meta
(«api de ins», caso de uso «Administrar mensajes y contenido en Instagram»).

Con la API de Instagram y el inicio de sesión de Instagram, una app sin publicar (en desarrollo) publica en la cuenta de
quien la creó sin pasar la revisión de Meta, y en público: lo contrario de TikTok. Pero tiene dos huecos:

- **No programa.** No hay hora de publicación, solo «publicar ya». La página de Instagram tampoco programa; Meta Business
  Suite sí, pero pide una página de Facebook unida a la cuenta y otro módulo de navegador frágil.
- **No acepta el archivo.** Con el inicio de sesión de Instagram no existe la subida reanudable (se probó el 2026-10-08:
  `upload_type=resumable` responde «The parameter video_url is required»): Instagram baja el video de una dirección
  pública.

La primera versión publicaba desde la computadora, a la hora, con un túnel rápido de Cloudflare para servir el video. Eso
obligaba a dejar la computadora encendida y el video en el disco hasta que saliera.

## Decisión

Instagram sale desde la nube de Sloth (`nube/`): un Worker de Cloudflare (`sloth-redes`) con un bucket R2. Al programar,
Sloth sube el video al bucket (en partes de 50 MB: un Worker no recibe más de 100 MB de una vez) y le deja al Worker el
texto y la hora. El cron del Worker corre cada minuto: 20 minutos antes de la hora le da a Instagram la dirección del
video (`/v/<ref>.mp4`, una ruta al azar que solo sirve ese archivo), a la hora lo publica, y borra el video del bucket.

Para Sloth, Instagram queda como TikTok: `programar` deja el video programado y de ahí sale solo. Sloth pregunta a la nube
cada pocos minutos qué pasó con lo programado (`estados()`): lo que salió queda como «publicado», y lo que falló, como
«Falló» (también en la barra lateral). «Reintentar» lo vuelve a dejar con otra hora sin subirlo de nuevo (`ref`), y
«Quitar» lo borra también de la nube, con su video; si la nube no responde, Sloth no olvida la `ref`.

El token de Instagram vive en el Worker (`privado/token.json`), que lo prueba al recibirlo y lo renueva una vez al día:
cada renovación le da otros 60 días, así que no caduca mientras el cron corra. Solo cuenta como renovado si Instagram da
un token nuevo; si falla, el de antes sigue sirviendo y se reintenta en 5 minutos, 10, 20… hasta cada 6 horas. El Worker
guarda cuándo caduca (si Instagram lo dice) y Opciones avisa una semana antes. Sloth habla con el Worker con un secreto
compartido: `SECRETO` en el Worker y `SLOTH_NUBE` / `SLOTH_NUBE_SECRETO` en las variables del usuario de Windows. Sin
`SECRETO` puesto, el Worker no deja pasar a nadie.

## Consecuencias

- La computadora puede estar apagada a la hora de cada Reel, y el video puede borrarse del disco en cuanto se programa. Si
  después falla, como ya no sale en la galería, se ve en Opciones → Redes, y se reintenta o se quita desde ahí.
- Hace falta una cuenta de Cloudflare con R2 activado (pide tarjeta; el plan gratis da 10 GB, y cada video se borra al
  salir). En otra computadora se escriben de nuevo `SLOTH_NUBE` y `SLOTH_NUBE_SECRETO`.
- El Worker vive en la cuenta de Cloudflare de Sloth y se despliega a mano con `npm run nube -- deploy`
  (`scripts/nube.mjs` le da a wrangler su propia sesión, sin tocar la de otras cuentas); cambiarlo no se aplica con
  «Reiniciar backend».
- Instagram pide el `moov` del MP4 al principio; si va al final, Sloth sube una copia que lo mueve, sin recodificar.
- Un fallo pasajero (la red, un 500 de Instagram) se reintenta en el minuto siguiente, hasta 5 veces. Si el cron publicó y
  no alcanzó a guardarlo, el siguiente ve el contenedor como `PUBLISHED` y no lo publica otra vez.
- Si después de publicar no puede borrar el video, lo publicado no se deshace: sigue en la cola como `publicado` y el
  minuto siguiente lo vuelve a borrar. Lo que ya salió no se vuelve a dejar (la nube responde `publicado` y no lo toca):
  «Reintentar» no lo publica dos veces.
- El video es público unos minutos antes de salir, en una dirección que nadie conoce.

## Cambio del 2026-10-24: cada quien con su nube y su app de Meta

La app que se vende publica en las redes, y cada cliente lo hace con sus propias credenciales: no hay una nube ni una
app de Meta compartidas (pasar la revisión de Meta y guardar los tokens de todos en la nube del dueño quedó descartado).

- La nube va en la cuenta de Cloudflare del cliente. Opciones → Redes → Instagram lo guía: crear la cuenta, activar R2
  y crear un token con un enlace que ya trae los permisos (Workers y R2). Al pegarlo, Sloth monta el Worker por la API
  de Cloudflare, sin wrangler (`server/redes/cloudflare.ts`): el bucket, el cron, la dirección en workers.dev y un
  secreto nuevo. Guarda el token (`SLOTH_CLOUDFLARE_TOKEN`) y la versión que subió, y al arrancar vuelve a subir el
  Worker si la app trae otro. El compilador mete el Worker armado en `__NUBE__`.
- Después pega el token de su propia app de Meta, en modo desarrollo: publica en público en su cuenta, sin revisión.
- La nube del dueño no lleva token y se sigue desplegando con `npm run nube -- deploy`: esto no la toca.
- Una dirección nueva de workers.dev tarda en responder (8 s en la prueba; en una cuenta nueva, a veces minutos):
  mientras, la nube responde 404 sin JSON, y Sloth dice que aún se está estrenando.
