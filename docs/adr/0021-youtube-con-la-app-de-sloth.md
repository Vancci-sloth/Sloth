# YouTube con la app de Google de Sloth, para quien apoya

Fecha: 2026-11-20

## Contexto

Hasta ahora, para subir a YouTube cada quien creaba su propio proyecto en Google Cloud, su cliente OAuth y lo importaba
en Opciones → YouTube (cinco pasos en consolas de Google). Desde el 2 de noviembre de 2026 los videos de un proyecto sin
auditar ya no quedan bloqueados en privado, pero una app de Google sin verificar solo admite 100 usuarios nuevos en toda
su vida y avisa «Google no ha verificado esta app». El creador quiere que quien apoya conecte su canal con un clic.

El repo es público, y las políticas de la API de YouTube (III.D.1) piden no poner las credenciales en un proyecto
abierto. La cuota (100 subidas al día de inicio) es del proyecto de Google, compartida por todos sus usuarios.

## Decisión

- **Una app de Google de Sloth, en el cobro.** El cliente OAuth de escritorio del proyecto de Sloth vive en el Worker
  (`YOUTUBE_CLIENT_ID` y `YOUTUBE_CLIENT_SECRET`, `licencias/src/youtube.ts`). La app arma la autorización con el id
  (`GET /youtube`) y el cobro canjea el código y renueva el permiso (`POST /youtube/token`). El cobro no guarda tokens.
- **Solo para quien apoya.** Antes de hablar con Google, el cobro mira `apoya` (lo mismo que da cada versión antes) o
  la llave del creador. Quien deja de apoyar ya no renueva el permiso: lo que programó en YouTube sale igual, y sigue
  subiendo con su propia app.
- **La app propia se queda**, para quien no apoya y como salida si la cuota compartida se acaba.
- **Al desconectar, Sloth le pide a Google que retire el permiso** (`/revoke`), como piden las políticas.

## Consecuencias

- Sin los dos secretos en el Worker, Opciones → YouTube se ve como antes: se puede publicar la app antes de tener el
  proyecto de Google listo.
- El permiso de quien apoya pasa por Cloudflare cada vez que se renueva. Lo dice el aviso de privacidad
  (`sloth.vancci.org/privacidad#youtube`).
- Hasta que Google verifique la app, solo 100 personas en total pueden conectarla, y ven el aviso de app sin verificar.
  Con más de 100 subidas al día entre todos, hace falta la auditoría de YouTube y pedir más cuota
  (`docs/agents/publicacion.md`, «YouTube con la app de Sloth»).
