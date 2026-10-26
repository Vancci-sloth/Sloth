# Redes: trabajar con la cola de TikTok e Instagram

Cómo funciona está en la cabecera de `server/redes/index.ts` y en los ADR 0002 (TikTok por su página) y 0003 (Instagram
por la nube). Esto es lo que un hilo necesita para mirarla o moverla sin escribir scripts nuevos.

## Antes de programar

- Se publica lo de **El Diff**. Los de `video-explicativo` llevan el cierre de su propio canal: pregunta antes de
  programar uno en las cuentas del usuario.
- «Súbelos todos» se refiere a los de El Diff. Antes de encolar varios, enseña la lista (estilo y carpeta) y espera el sí.
- «Borrar los que ya subí» se refiere a los archivos del disco (a la Papelera), no a las publicaciones. Si no está claro,
  pregunta en una línea.

## Mirar y mover

`npm run redes` enseña la cola de cada red, de hoy en adelante, y lo que falló, con la `ref` de cada una. Las órdenes
están en la cabecera de `scripts/redes.ts`: `nube` (lo que espera en el Worker de Instagram), `quitar`, `reintentar` y
`deshacer`. Lo que cambia algo va por la API de Sloth, que también lo quita de la red.

- Mover una ya programada es `quitar` y volver a programarla: la API no cambia la hora de una publicación.
- Programar es `POST /api/redes/borradores` (los textos que escribe Claude) y después `POST /api/redes/programar`, con la
  `cardId` y las rutas. Cada una cae en el siguiente hueco libre del `RITMO`.
- Una hora fuera del `RITMO` (p. ej. hoy a las 17:00) no tiene API: `quitar` la que aún está en `cola`, parar el servidor,
  poner en `data/redes/redes.json` su `estado: "cola"` y su `cuando`, y arrancarlo otra vez; la sube con esa hora.
- La API está en `http://127.0.0.1:$PORT`. El puerto de la copia en que trabajas está en `$PORT`, y no siempre es 4848.
  La app instalada (la de venta) no trae redes: la cola vive en el Sloth del repo, que se arranca con
  `PORT=4849 node --import tsx server/index.ts` si la instalada ya ocupa el 4848.
- Los finales de El Diff pesan cerca de 1 GB. Varios a Instagram a la vez, o junto con una subida a TikTok, saturan la
  conexión y la nube responde «No llegué a la nube de Sloth: fetch failed»: reintenta de uno en uno (unos 11 minutos
  cada uno; 25 de octubre).

## Dónde mirar cuando algo falla

- `data/redes/redes.json`: cada publicación, con su `estado` y su `error`.
- `data/redes/fallos/*.png`: la captura de la página de TikTok en el momento del fallo. Cuando TikTok cambia su página,
  se rompen los selectores de `server/redes/tiktok.ts` (en octubre fue el de fecha y hora): empieza por la captura.
- Con la ventana de Sloth abierta, TikTok va en la página `redes` del navegador integrado, con su perfil
  (`persist:redes`), sin otra ventana: «Conectar» en Opciones → Redes la enseña ahí para iniciar sesión. Sin la ventana,
  va en un Edge con el perfil `data/redes/perfil` y el puerto CDP 9334. Las dos sesiones son aparte: la de una no vale
  en la otra. `POST /api/redes/tiktok/conectar` abre la página de iniciar sesión en el que toque. En la app, Google
  rechaza su inicio de sesión («el navegador no es seguro»): si la página va a `accounts.google.com`, Sloth la devuelve
  al login, abre Edge con ese perfil para ese paso y, al ver la cuenta ahí, pasa las cookies de la red a la app y cierra
  Edge (`conGoogle` y `pasarDeEdge`). TikTok Studio pone «¿Salir del sitio?», que la app no contesta y que cancela
  cada navegación: antes de mover la página va `sinAviso` (la ventana ya lo ignora sola). Su tour de novedades
  (`.react-joyride__overlay`) tapa la página la primera vez en un perfil y con cada novedad: lo cierra `cerrarTour`.
  Lo que sube se ve en Mis videos, a la derecha (`enNavegador`); en Opciones, solo mientras inicias sesión.
- La nube de quien usa la app que se vende está en su cuenta de Cloudflare, y Sloth la monta y la pone al día con su
  token (`server/redes/cloudflare.ts`, cambio del 2026-10-24 en el ADR 0003).
- La nube lee `SLOTH_NUBE` y `SLOTH_NUBE_SECRETO` de las variables del usuario, igual que el servidor
  (`leer()` de `server/opciones.ts`). Se despliega con `npm run nube -- deploy`. Borra de R2 cada video al publicarlo;
  lo que aún espera puede no tener otra copia, así que «limpiar la nube» nunca toca lo pendiente.
