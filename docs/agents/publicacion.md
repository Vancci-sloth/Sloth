# Comprobar y publicar Sloth

## Comprobación sin publicar

`Comprobar Sloth` (`.github/workflows/comprobar.yml`) se ejecuta al subir a `main`, en las PR hacia `main` y a mano
desde Actions. En Windows, Mac y Linux instala las dependencias y FFmpeg, corre `npm test`, `npm run comprobar-skills`
y `npm run compilar -- --sin-instalador` (en Windows, sin esa opción, para generar también el instalador). Compilar incluye `npm run typecheck`, arma la interfaz y el servidor,
comprueba sus paquetes, revisa que lo que se vende no lleve nada del creador ni React en modo desarrollo y empaqueta
Electron. También prueba el caso de secretos de Apple vacíos: Mac usa firma ad hoc.

No cambia la versión, no arranca la app ni sube archivos al cobro. En Windows ejecuta además el NSIS real dos veces
en una carpeta temporal del runner y comprueba que actualice conservando los datos (`scripts/comprobar-instalacion.mjs`).
Ese script solo permite el Windows desechable de GitHub: registra y desinstala Sloth y no se debe correr donde ya se usa.
Los instaladores de Mac y Linux y la firma con certificado de Apple se hacen en `venta`; Windows también repite allí
la prueba de instalación antes de subir nada al cobro.
Para repetir la comprobación sin instalar en esta computadora, con FFmpeg en el PATH
(las pruebas de YouTube generan videos y extraen fotogramas):

```powershell
npm ci --no-audit --no-fund
npm test
npm run compilar -- --sin-instalador
```

El instalador no trae el programa de Claude Code, Codex ni OpenCode (ADR 0009): `compilar` deja fuera los opcionales
de npm, que son justo esos programas, y la app los baja al elegir cada agente. En `dist/` no debe haber ninguna
carpeta `claude-agent-sdk-<sistema>` ni `codex-<sistema>`. Para probar la descarga, abre la app compilada en una
cuenta sin `%APPDATA%\sloth\piezas\agentes` y elige cada agente.

### Windows: error al escribir `app-64.7z\Uninstall Sloth.exe`

El destino de ese error es un archivo comprimido tratado como carpeta. Se reprodujo con el NSIS y las plantillas de
electron-builder 26.15.3 forzando que `Nsis7z` no cargue: su argumento queda en la pila, `Pop $R0` lo toma como el
directorio de salida y NSIS intenta escribir allí. Eso demuestra el mecanismo; las capturas no identifican qué
bloqueó el DLL en la computadora del cliente. No atribuirlo al antivirus o a los permisos sin el diagnóstico de esa PC.

`scripts/instalador-config.ts` usa ZIP y desactiva `differentialPackage`. Deben ir juntos: con esa versión del builder,
activar solo `useZip` crea un 7z que luego se intenta abrir como ZIP. Windows descarga el instalador completo; Mac y
Linux conservan las descargas por diferencias. `electron/instalador.test.ts` compila y ejecuta el extractor real,
simula el DLL incompatible y comprueba que se escriba en Sloth y se conserven los datos al actualizar.
También desactiva `preCompressedFileExtensions`: el builder excluye esos videos del ZIP y solo los repone desde
`resources`, pero en Windows los de Sloth van en `app/web`. La prueba usa ahora el empaquetado real de NSIS y comprueba
que lleguen los `.mp4` y `.webm`; armando el ZIP a mano no reproducía esa exclusión.

Para un cliente afectado: cancelar con «Anular», cerrar Sloth y el instalador, reiniciar y probar una descarga nueva
desde la página oficial. Es un intento de recuperación si fue transitorio, no un arreglo garantizado del instalador
anterior. Si persiste, instalar encima la versión corregida cuando esté publicada, en la misma carpeta, sin
desinstalar ni borrar `app/data`, `app/trabajo` o `app/skills`. No pulsar «Omitir»: dejaría incompleta la instalación.
Si Sloth ya no abre, se usa directamente ese instalador corregido. Para soporte, conservar la captura, la versión del
instalador, si fue desde «Actualizar» o manualmente y la versión de Windows (`winver`).

### Windows: la actualización llega a 100 % y vuelve a empezar

La 0.4.0 y la 0.4.1 de Windows salieron firmadas con el certificado de Apple, que `venta.yml` les pasaba a todos los
sistemas. Windows no confía en él, y electron-updater, que apunta al firmante en `resources\app-update.yml`, rechaza
cualquier versión nueva («not signed by the application owner» en `app\data\sloth.log`): la baja entera y vuelve a
empezar. Desde la 0.4.2 el certificado solo llega a Mac, `compilar` falla si la de Windows sale con firmante, y la app
deja de reintentar y dice que se instale a mano. Quien sigue en la 0.4.0 o la 0.4.1 de Windows solo sale de ahí bajando
el instalador de la página e instalándolo encima: conserva sus datos. Una firma de Windows de verdad (otro certificado)
debe dar estado `Valid`, o pasa lo mismo.

Cada sistema se comprueba en el suyo. Antes de publicar, comprueba que los tres resultados de `Comprobar Sloth`
corresponden al commit de `main` que vas a subir y terminaron bien. Este workflow informa; no configura protección de
ramas ni bloquea por sí solo un push a `venta`.

## App instalada: este repo, rama venta

Las Mac salen firmadas con el certificado de Apple (equipo de Moises Laska) y notarizadas, en cada push. El 7 de
noviembre de 2026 la 0.4.0 se quedó más de media hora en `notarytool` y salió con firma local: eran los primeros envíos
del equipo, que Apple revisa a mano (dos seguían «In Progress» 18 horas después; uno se aceptó). Por eso la
notarización (`scripts/notarizar.mjs`) espera a Apple 10 min como máximo: si acepta, la app lleva su ticket; si no
contesta, sale firmada sin ticket y abre a la primera en cuanto Apple acepte ese envío (el id queda en el resumen del
job), y mientras tanto el cobro sigue explicando «Abrir de todos modos» (`sinTicket`); si la rechaza, el job falla con
el motivo. Ver un envío: `xcrun notarytool info <id>` o `history`, en un Mac con
los secretos. Si `Completar Mac de Sloth` (`recuperar-mac.yml`, desde `main`) hace falta porque Windows ya salió,
publica solo las tres Mac con el número indicado, firmadas igual, sin repetir Windows o Linux. El cobro rechaza poner una
de firma local encima de una firmada: desde la primera firmada, todas deben serlo.
Pendiente al 8-nov-2026 ([#23](https://github.com/Vancci-sloth/Sloth/issues/23)): ninguna publicada va firmada aún, y
antes de la primera publicación con esto hay que desplegar el cobro, o ignora `sinTicket`. Ahí está también el estado de
los envíos a Apple.

Toda versión avisa lo que trae, sin excepción: su `novedad.txt` (paso 1) y su anuncio en la comunidad (paso 5). Las que
salen para todos (`[para todos]`) son de dos clases, y el aviso dice cuál es (pedido del creador, 18 de noviembre de 2026):

- **Normal:** trae cosas nuevas. Lleva su guía animada, la del creador bailando (paso 1), y el anuncio de siempre.
- **Express:** un arreglo urgente. Sin guía, y `Novedades.tsx` no se toca: solo avisa, claro y corto, qué fallaba y que
  ya quedó, en `novedad.txt` y en un anuncio titulado `ACTUALIZACION EXPRESS (…)` ([anuncios.md](anuncios.md)).

1. Actualiza `novedad.txt`: un renglón corto con lo que trae la versión, que se ve al pasar el cursor sobre «Actualizar».
   Una versión puede llevar además su guía animada (`web/src/Novedades.tsx`, la 0.5.0 en
   `web/public/novedades/0.5.0.html`, que reemplaza a la de antes), que sale una vez al abrirla a quien actualizó. Su
   número en `Novedades.tsx` debe ser el que saldrá: `version-venta.mjs` sube solo la última cifra de la publicada, y un
   salto (0.5.0) se pone a mano en `package.json`.
2. Comprueba el diff completo entre `origin/venta` y `main`: se publicará todo lo que haya entrado a `main`. Mira
   también las PR abiertas y `node scripts/mejoras.mjs`: lo que en la comunidad ya se contestó con «sale en la
   siguiente actualización» debe estar en `main` antes del push (la 0.5.2 iba a salir sin la #48, que traía 17). Guarda la
   lista de sus commits (`git log --no-merges --format="%s%n%b" origin/venta..main`): de ahí sale el anuncio del paso 5,
   y después del push ya no se puede sacar así. Si en ese diff hay cambios de `licencias/` que esperan esta versión
   (desde el 7 de noviembre de 2026, los mensajes de las voces con «Sloth» en vez del socio), despliega el cobro después
   del push, como dice «Cobro y comunidad»: `venta` no lo hace.
3. Tras verificar la cuenta de GitHub indicada en `AGENTS.md`, `git push origin main:venta` inicia
   `.github/workflows/venta.yml`. Genera una versión común, compila los tres instaladores con `npm run compilar` y los
   sube al cobro con `npm run publicar`. No hace falta compilar localmente para publicar.
   Quien apoya recibe cada versión 7 días antes (`ANTICIPO` en `licencias/`): los demás siguen con la anterior en la app,
   en `/version` y en `/descargar`. Un arreglo urgente sale para todos de inmediato con `[para todos]` en el mensaje del
   último commit que llega a `venta`, o con la opción `para_todos` al correr el workflow a mano. Ya publicada, el
   creador la da a todos antes de sus 7 días (cuando el chat de un live cumple su meta) con «Liberar para todos», arriba
   de la Comunidad en su Sloth: no compila nada, y las apps abiertas la ven en unos 5 minutos (`/ultima`).
4. Comprueba los cinco jobs y la versión que ofrece el cobro: `/version`, `/version?so=mac`, `/version?so=mac-arm64`,
   `/version?so=mac12` (la de macOS 12, ADR 0006) y `/version?so=linux` en `https://api.sloth.vancci.org` (sin apoyo, durante sus 7 días, dicen la anterior). Pedido sin llave, `/version` es
   lo que se le da a quien no apoya: si trae `nueva`, sigue con la anterior; si no, ya tiene esa. Qué arreglo le llegó
   a un cliente se mira ahí y en `git log origin/venta`, no en las fechas de los commits. Verifica también los metadatos
   de `/actualizaciones/latest.yml`, `latest-mac.yml`, `latest-arm64-mac.yml`, `latest-mac12-mac.yml` y `latest-linux.yml`, y los enlaces de
   descarga de cada sistema.
   Para esperar el flujo, `gh run watch <id> --exit-status` de fondo. Si los cinco salen bien, el job `release` deja
   la release `v<versión>` en GitHub con `novedad.txt` (`scripts/release-github.mjs`): compruébala en Releases.
5. Cuando los cinco salieron bien, cuéntalo en Anuncios de la comunidad, sin preguntar: escribe el anuncio como lo
   escribe Vancci ([anuncios.md](anuncios.md)) y publícalo con `node scripts/anuncio.mjs <archivo>`. Luego, también
   sin preguntar, avisa a quien pidió en la comunidad lo que trae la versión: `node scripts/mejoras.mjs` enseña las
   mejoras que faltan (y lo pedido fuera de Mejoras, de `scripts/pedidos.json`); a cada una que resuelvan los commits del paso 2, un comentario en el mismo tono (que ya quedó, dónde
   se usa, que lo pruebe y le diga qué tal; sin `[para todos]`, que sin apoyo le llega en 7 días) con
   `node scripts/mejoras.mjs <id> <archivo>`, que también la marca hecha.

### Si quien apoya dice que no le llega la versión nueva

La app busca la nueva en `/actualizaciones/latest*.yml` con su clave y su computadora (`x-sloth-clave`,
`x-sloth-equipo`, que le da `/api/licencia/credencial`). El cobro (`apoya`) da la nueva si esa clave vale en esa
computadora y **su correo** tiene un apoyo vigente, como la insignia de la comunidad: quien apoyó desde la tienda de
estilos sigue con la clave de su cuenta gratis. `licencias/src/anticipo.test.ts` lo prueba de punta a punta.

- El navegador no lleva la clave: durante los 7 días, `/descargar` y la página dan la anterior a todos, también a
  quien apoya. La nueva le llega por «Actualizar» en su Sloth (en una Mac sin firma de Apple o una Windows 0.4.0–0.4.1,
  que bajan a mano, primero la anterior y desde ella la nueva).
- La app pregunta al abrir, cada 6 horas, al minuto de escribir otra clave y cuando cambia `/ultima` (cada 5 min; cambia
  al subirse el instalador y otra vez al llegar su `latest.yml`). Quien apoya desde la tienda la ve en la siguiente.
- El cobro no guarda qué versión tiene cada quien. Sí se ve quién usa qué clave: `equipos.visto` se renueva cada vez
  que su Sloth pregunta por la licencia (`npm run licencias -- d1 execute sloth-licencias --remote --command "…"`).

La llave `PUBLICAR` del workflow autoriza la subida, y solo vive en los secretos de GitHub: con ella se reparte una
versión a todos. En la computadora del creador va otra, `ADMIN` (`%APPDATA%\sloth\licencias\admin.txt`), que administra
la comunidad, las voces y los apoyos a mano, pero no publica, porque ahí la leen sus agentes. Los secretos de Apple y el comportamiento sin firma están en
[ADR 0006](../adr/0006-mac-y-linux.md). La comprobación de empaquetado no demuestra que la app abra y funcione en una
máquina real: una prueba de arranque debe usar datos y carpeta de usuario aparte, porque Sloth enlaza las skills.

## Cobro y comunidad: licencias/

El Worker `sloth-licencias` sirve el apoyo (las suscripciones), las cuentas gratis, la comunidad, los instaladores y las
actualizaciones.
Su configuración está en `licencias/wrangler.jsonc`. Desde la raíz de este repo:

```powershell
npm run licencias -- d1 migrations apply sloth-licencias --remote
npm run licencias -- deploy
```

Despliega desde `origin/main` al día (un worktree aparte si tu checkout va atrás o tiene cambios sin guardar), con tu
cambio encima y subido a `main`: lo publicado suele llevar commits de otros hilos, y desplegar una copia atrasada los
borra. Si pasa, `npm run licencias -- deployments list` y `npm run licencias -- rollback <versión> -y` vuelven a la de antes.
Aplica las migraciones cuando el cambio incluya alguna, antes de desplegar código que necesite esas columnas.
Comprueba la ruta afectada en `https://api.sloth.vancci.org`. Este despliegue es independiente de
`main` y `venta`; subir la app no actualiza el Worker. Los nombres de sus secretos están en la cabecera de su configuración.

Si falla todo lo que toca la base (`/precio` da 500, la comunidad 503, no se puede apoyar ni crear cuenta) y lo de R2
sigue bien (`/version`, `/ultima`), lee el error en `npm run licencias -- tail --format json`. El 16 de noviembre de 2026
fue `D1_ERROR: … exceeded D1's free tier daily row read limit`: el plan gratis de Cloudflare da 5 millones de filas
leídas al día y se levanta a medianoche UTC (18:00 de México), o al pasar la cuenta a Workers Paid. Qué consultas las
gastan: `npm run licencias -- d1 insights sloth-licencias --timePeriod 2d --sort-type sum --sort-by reads --json`. Ese
día, la mayor parte de las filas eran de las que recorren `licencias` entera: los miembros y activos de la comunidad, los
conteos de `/precio`, y la insignia en los votos del roadmap y en `/creditos` (tres de cada cuatro filas). Desde
entonces se calculan a lo más cada 10 minutos y se leen de la tabla `guardado` (`licencias/src/guardado.ts`): lo que
sea igual para todos y recorra una tabla entera va ahí, no en una variable, porque cada copia del Worker vive poco.
Las consultas a mano (`d1 execute --remote`) siguen contestando aunque el Worker esté en el tope.
Las voces de Sloth se abren a todos con la marca `voz-mensual.json` en R2, que el Worker guarda cuando el script de
publicación (que manda `vozMensual`) termina de subir el `latest*.yml`; sin ella, con `VOZ_SOLO_CREADOR=1`, son solo del
creador.
**Los créditos de voz de cada mes ya no se dan** (decisión del creador, 15 de noviembre de 2026). En noviembre de 2026
se entregaron 100.000 a quien pagaba activamente el apoyo; desde esa fecha quien los recibió conserva su saldo, nadie
más los recibe y no se rellenan: el Worker ya no los entrega ni manda su correo, y la app ya no los anuncia (ni el
aviso a pantalla completa, ni Opciones → Voz, ni la tienda de estilos). No los prometas en anuncios, guías ni correos.
Los créditos ahora llegan solo por la rifa o porque el creador los da (Administrador o `/voz/admin/regalo`). Lo
entregado sigue en `voz_mensual` (migración 0024) y en Administrador → Créditos mensuales. La regla de quién paga el
apoyo sugerido o más (`daCreditos` en `licencias/src/voz-mensual.ts`) la sigue usando la rifa para dejarlos fuera.
La copia de cada Sloth (ADR 0020) necesita la migración `0031_respaldos.sql` y el Worker desplegado antes de publicar
la versión de la app que la sube; hasta entonces la app solo anota que no pudo y lo vuelve a intentar.
Sloth en la web (ADR 0025) necesita la migración `0036_web.sql` y el Worker desplegado antes de publicar la versión de
la app que la trae: sin ellos, el túnel abre pero la entrada `api.sloth.vancci.org/web` no sabe adónde mandar.
La entrada vive en su propio dominio, `web.sloth.vancci.org` (una ruta `custom_domain` más del mismo Worker en
`wrangler.jsonc`, que `deploy` crea). Comprueba con `curl https://web.sloth.vancci.org` (la página de entrada, 200).
La rifa necesita la migración `0025_rifas.sql` y el Worker desplegado; con créditos, además, las voces ya abiertas.
Su sección y su ruleta llegan a la Administrador instalada con la siguiente versión de la app.
Un reparto en `enviando` o `revisar` requiere comprobar el movimiento en el proveedor antes de volver a sumarlo: su API
no documenta idempotencia para créditos. No se reintenta esa suma automáticamente.
Para guardar uno que el usuario copió, pásalo desde Git Bash: `tr -d ' \r\n' < /dev/clipboard | npm run licencias -- secret
put NOMBRE`. Desde PowerShell, la tubería le pone un BOM delante y la pasarela rechaza la llave. Una llave de Voices
Cloning (`pk_live_…`) va en el siguiente `VOICES_PK_LIVE_<n>` libre (mira `secret list`), nunca encima de una que ya
está: cada una es su cuenta, con sus usuarios (ADR 0018). Su saldo se ve en Administrador.

Desde el 13 de noviembre de 2026 el apoyo es uno solo, de $10 USD (199 MXN), y la página enseña solo ese y «Lo que
gustes» (antes, $15 de Fundador y $30 de Donador PRO). A quien había pagado más se le dio lo pagado de más como tiempo
con `node scripts/bajar-apoyo.mjs 2026-11-14T02:40:00Z` (`licencias/src/bajar-apoyo.ts`), a 35 personas: las de Stripe
bajaron a $10 con el cobro aplazado; las de Mercado Pago, a 199 MXN y en pausa, y el cron las reanuda ese día
(`reanudar`). Las 11 de PayPal se cancelaron (`--cancelar-paypal`), con su folio y sus días: con la cuenta en revisión,
PayPal no deja cambiarlas ni pausarlas (`USER_ACCOUNT_RESTRICTED`), y si quieren seguir apoyan otra vez. Desde el
23 de noviembre, a quien apoyó con una suscripción de PayPal la licencia firmada le dice `cancelarPaypal`
(`cancelarPaypal()` en `licencias/src/index.ts`): su app le pide en grande que la cancele en su PayPal
(`web/src/AvisoPaypal.tsx`) y Opciones lo enseña como apoyo hasta su fecha, no como «Cancelado». Si el apoyo
vuelve a bajar, se cambia el precio, se despliega y se corre igual con la fecha del cambio (`--probar` primero).

Los términos piden avisar por correo 30 días antes de cambiarlos a quien apoya o tiene un lugar gratis. El aviso se
escribe en `AVISOS` (`licencias/src/aviso-correo.ts`, con un id como `terminos-2026-11-24`), se despliega el cobro y se
corre `node scripts/aviso-correo.mjs <id> --prueba [correo]` (solo a ese correo), `--probar` (a quiénes falta) y, sin
opción, a todos: `avisos_correo` (migración 0039) anota a quién le llegó, así que repetirlo sigue donde se quedó. El
24 de noviembre de 2026 salió `terminos-2026-11-24` (los términos y el aviso de privacidad al día; aplican el 24 de
diciembre).

Desde el 18 de noviembre de 2026 ese precio es una escalera (`licencias/src/escalera.ts`, migración 0032): por cada 50
personas que apoyan hoy (`apoyan` en `/precio`) el apoyo sube $5 USD ($100 MXN), y a quien entra con el precio del día
le baja $5 cada mes que paga, hasta $10 (199 MXN): con 50 personas, $15 el primer mes y $10 después; con 100, $20, $15
y $10. Los números son `PRECIO_CADA`, `PRECIO_SUBE` y `PRECIO_SUBE_MXN` en `wrangler.jsonc`; `PRECIO_MENSUAL` es el
piso, el de Fundador y lo que cuenta en `apoyan`. `/precio` da `mensual` (el de hoy), `base`, `paso` y `cada`. Quien
elige su monto en «Lo que gustes» no baja. La app de antes de esto (su tienda dice «$10 USD al mes» y no manda monto)
también cobra el precio del día, por decisión del creador: el monto y cómo baja se ven en la página de pago de Stripe.
Lo que más se le dice a la gente, porque es lo que vende: su precio se queda con cada quien mientras siga apoyando, y
quien cancela y vuelve entra con el precio de ese día. Va en la página, en el correo de la clave, en el aviso de cada
cobro, al cancelar (el correo y el aviso de la app) y en la tienda; al escribir anuncios o textos del apoyo, dilo también.
Cómo va cada una: `monto` es lo que cobra su siguiente mes, `piso` hasta dónde baja y `bajado` con qué mes bajó
(`d1 execute … "SELECT email, monto, piso, bajado, pagado_hasta FROM licencias WHERE piso IS NOT NULL"`). Si la pasarela
no deja cambiar el monto (PayPal en revisión), queda en el registro como «Bajar el apoyo del mes» y se reintenta en cada
lectura; el aviso de cobro dice siempre lo que de verdad se va a cobrar.

Cuando el usuario pida un link de Fundador, dale uno nuevo con `npm run fundador -- nuevo <para quién>`. Es de una sola
persona: quien apoya con $10 o más con él es Fundador aunque los 25 lugares públicos estén ocupados; sin link, lo es
mientras quede alguno de los 25. Con `lista` ves los que se han dado y quién usó cada uno, y con `revocar <código>` uno deja de servir.
Si alguien apoyó por transferencia, `npm run fundador -- dar <correo> [meses]` lo hace Fundador esos meses (1 si no se
dice) y le manda su clave por correo; si ya tenía uno así, se le suman. Con 0 meses, solo se le vuelve a mandar.

### YouTube con la app de Sloth

Quien apoya conecta su canal con la app de Google de Sloth ([ADR 0021](../adr/0021-youtube-con-la-app-de-sloth.md)):
el proyecto de Google Cloud de Sloth (`sloth-515321`, número 918300411652, creado el 20-nov-2026), con su cliente OAuth
de tipo «App de escritorio» (`Sloth`, en producción). Su id y su secreto van en el cobro
(`npm run licencias -- secret put YOUTUBE_CLIENT_ID` y `YOUTUBE_CLIENT_SECRET`, desde Git Bash como arriba). Sin los
dos, `/youtube` responde `{}` y la app solo ofrece la propia de cada quien. Comprueba con
`curl https://api.sloth.vancci.org/youtube`: debe traer `cliente`.

Lo que pide Google, en el proyecto de Sloth:

- Google Auth Platform → Público: «En producción». En «Prueba», el permiso caduca cada 7 días.
- Verificar la app (Centro de verificación): página de inicio y aviso de privacidad en `sloth.vancci.org` (dominio
  verificado en Search Console), la justificación de cada permiso (`SCOPES` en `server/youtube.ts`) y un video «No
  listado» del flujo de «Conectar canal» y de una subida. Sin verificar, son 100 usuarios en toda la vida del proyecto.
  La venta pide solo `youtube.force-ssl` (en Acceso a datos debe estar ese y nada más); un permiso nuevo es otra
  verificación y otra línea en `sloth.vancci.org/privacidad#youtube`, que tiene su resumen en inglés (`#google-en`) para
  los revisores. Su clave de prueba es la de `soporte@vancci.org` (`npm run fundador -- dar soporte@vancci.org 3`, que
  la vuelve a mandar con `0`). Lo que se guarda de la API vence a los 30 días (`VIGENCIA_YOUTUBE`, políticas III.E.4).
- Más de 100 subidas al día entre todos: auditoría y cuota en el
  [formulario de YouTube](https://support.google.com/youtube/contact/yt_api_form) (aparte `videos.insert`, con su cuenta).
  Una sola app de Sloth: varios proyectos para sumar cuota violan las políticas (III.D.1).

## Publicaciones de Instagram: nube/

El Worker `sloth-redes`, con R2 y su cron, se configura en `nube/wrangler.jsonc`. Desde la raíz:

```powershell
npm run nube -- deploy
```

Comprueba el despliegue de `sloth-redes` en Cloudflare y sus registros si cambiaste el cron. «Reiniciar backend»
solo afecta al servidor local. `scripts/nube.mjs` usa una sesión de Cloudflare propia de Sloth; si falta,
`npm run nube -- login` o `npm run licencias -- login` la abre. La cuenta de Cloudflare no va en el repo: es la variable
`SLOTH_CLOUDFLARE_CUENTA` (su id) de quien despliega.

## Página de venta: otro repo

`sloth.vancci.org` vive en **`Vancci-sloth/vancci-web`**, en `web/public/sloth/index.html`. Un checkout puede estar
atrasado o tener cambios sin guardar: consulta
`git status`, actualiza las referencias con `git fetch origin` y parte de `origin/main` en un worktree aparte si hace
falta. El proyecto de Astro está dentro de `web/`: ahí se corre `npm ci` y, con los cambios ya en el `main` de ese repo,
`npm run publicar`, que arma el sitio y lo sube a Cloudflare con la sesión de Sloth (la de `npm run licencias`). Subir a
`main` no publica nada: desde el 16 de noviembre de 2026 la página ya no está en Vercel, que la apagó
(`402 DEPLOYMENT_DISABLED`) y tiró `sloth.vancci.org` y `vancci.org`.

Son tres piezas, todas en la cuenta de Cloudflare de Sloth: el Worker `sloth-web` (`sloth.vancci.org`), el Worker
`vancci-web` (`vancci.org` y `www`) y el bucket de R2 `vancci-web-videos` (`videos.vancci.org`), a donde redirigen los
`.mp4`, porque los archivos de un Worker no se sirven por partes y sin eso Safari no reproduce un video. Los dos Workers
son solo archivos, sin código: así no gastan las 100.000 peticiones diarias del plan gratis, de las que el cobro ya usa
entre 60.000 y 80.000. No les pongas código (`main`) ni uses `wrangler pages` con esos nombres: `pages project create
sloth-web` reemplazó al Worker y dejó la página en 530 hasta volver a publicar. Si un dominio ya tiene registros DNS de
otro sitio, `wrangler deploy` no lo conecta (error 100117) y la sesión de wrangler no puede borrarlos: hace falta un
token con «DNS Write» o quitarlos en el panel. Los que había de Vercel quedaron en
`%APPDATA%\sloth\respaldos\dns-vancci-org-2026-11-16.json`.

Comprueba la página publicada en `https://sloth.vancci.org`, incluidos los enlaces de descarga y pago que hayas cambiado
y que un video conteste 206 a `curl -L -H "Range: bytes=0-1"`. Cambiar este repo o desplegar `licencias/` no modifica
esa página.

Lo que leen los buscadores de IA (ChatGPT, Perplexity, Gemini) está en la raíz: `/ias`, `/estilos`, `/preguntas`,
`llms.txt` y `llms-full.txt`, cada página con su JSON-LD. Al cambiar algo de Sloth que esas páginas cuentan (una IA,
un estilo, el precio, los requisitos), cámbialo también ahí y en la fecha del `sitemap.xml`. Después de publicar,
avisa a Bing (de donde busca ChatGPT) con IndexNow: un `POST https://api.indexnow.org/indexnow` con `host`
`sloth.vancci.org`, la llave del archivo `<llave>.txt` de `web/public/sloth/` (su `keyLocation`) y las URL cambiadas.

Con qué se paga lo dice el cobro (`/precio`): hasta que contesta, y si no contesta, la página ofrece solo tarjeta.
PayPal sale solo si el cobro lo da (sin `sinPaypal`). Si la página enseña algo raro en el pago, mira primero `/precio`.

## App del celular: movil/

La app de iOS y Android (ADR 0025) es un proyecto de Expo aparte, con su propio `package.json`: `cd movil && npm install`.
No entra en `npm run compilar` ni en el instalador de escritorio. Comprobarla:

- `cd movil && npx tsc --noEmit`, y `npm test` en la raíz, que corre `movil/src/*.test.ts` y `movil/src/local/*.test.ts`
  (el enlace del QR, el agente del celular y si `src/local/estilos.json` va al día: si no, `node scripts/estilos.mjs` en
  `movil/`; hazlo al cambiar una card de video o su SKILL.md).
- El agente del celular sin gastar: una API de Anthropic de mentira que conteste `/v1/models` y `/v1/messages` en
  streaming, y Metro con `EXPO_PUBLIC_ANTHROPIC_BASE_URL=http://<ip>:<puerto> npx expo start -c` (con `-c`: la variable
  se fija al armar). Sin ella, la app habla con la API real.
- `npx expo export --platform android --platform ios --output-dir <temporal>`: arma los dos paquetes de JavaScript con
  Metro, que es lo que falla si algo de `shared/` o `web/src/` importa un paquete que el celular no tiene.
- Para verla: Sloth abierta con Opciones → Tu celular encendido y `npx expo start --web` en `movil/` (la llave se escribe
  a mano; la cámara, el micrófono, la galería y compartir solo van en el celular). En Android, con Expo Go: un celular o
  el emulador `Sloth_Pixel` (el SDK está en `%LOCALAPPDATA%\Android\Sdk`; ábrelo con las herramientas de dispositivo de
  T3) y `npx expo start --android`. Así se probó todo el 21 de noviembre: conectar por la IP del Wi-Fi, el hilo, cómo va
  el video, ver, guardar en la galería y compartir, la comunidad, adjuntar de la galería y grabar la voz. Expo Go no
  abre el enlace `slothmovil://` del QR con la cámara: para eso, una compilación (`eas build --profile desarrollo`).

Compilar, con la cuenta de Expo de Vancci-sloth (`npx eas-cli@latest login`; la primera vez `eas init` escribe el
`projectId` en `app.json`):

- Android para probar o pasarla a quien sea: `eas build -p android --profile prueba` da un `.apk` que se instala directo.
- Tiendas: `eas build --profile tiendas` y `eas submit --profile tiendas`. iOS firma con la cuenta de Apple de Sloth
  (equipo MP48S4LXVU) y pide su sesión la primera vez; Google Play pide la cuenta de desarrollador y el primer `.aab`
  se sube a mano.
- Sube `version` en `movil/app.json` con cada cambio que se note; `tiendas` sube solo el número de compilación.

### La versión GAMMA de Android (desde el 21-nov-2026)

Por pedido del creador, la app del celular sale ya, como **SOLO VERSIÓN GAMMA**: una prueba súper temprana con fallos
continuos, y quien no quiera presenciarlos, que no la descargue. Lo dicen la app (`Gamma` en `movil/src/ui.tsx`: la
bienvenida, Inicio y Más) y la página de venta (`#celular`). Mientras sea gamma, todo texto sobre ella lo dice igual.

Se compila en Linux con `App del celular (Android)` (`.github/workflows/celular.yml`), sin EAS: en Windows no compila,
porque las rutas de C++ de React Native pasan de 260 caracteres (ni desde `C:\s\m` ni con `CMAKE_OBJECT_PATH_MAX`), y
activar las rutas largas pide administrador. En una PR que toca `movil/` deja el `.apk` como artefacto; corrido a mano
desde `main` con `gh workflow run celular.yml -f publicar=apk` lo sube encima del release `celular-gamma` (prerelease),
siempre con el mismo nombre: la página enlaza `releases/download/celular-gamma/Sloth-gamma.apk`.

Se firma con la llave de Sloth, en los secretos `SLOTH_ANDROID_KEYSTORE` (base64) y `SLOTH_ANDROID_CLAVE`; el original
está en `%APPDATA%\sloth\movil\` (`sloth-android.keystore` y su contraseña en `llave-android.json`). **Sin esa llave no
se puede actualizar la app ya instalada** (Android rechaza una firma distinta): respáldala. Antes de correrlo a mano,
prueba el artefacto de la PR en el emulador (`adb install -r`).

### Actualizar sin otro .apk

Desde la 0.1.1, la app trae `expo-updates`: lo que no es nativo (pantallas, textos, el agente, los estilos) le llega
sola, sin bajar nada, con `gh workflow run celular.yml -f publicar=actualizacion` desde `main`. La baja al abrir y se
pone la siguiente vez que se abre; Inicio avisa «Hay una versión nueva de Sloth lista» con «Reiniciar», y Más dice de
qué día es la que corre. Cada una va firmada (`movil/scripts/publicar-actualizacion.mjs`) con la llave del secreto
`SLOTH_CELULAR_ACTUALIZACIONES`; el original está en `%APPDATA%\sloth\movil\actualizaciones\` (respáldala con la otra)
y su certificado, que la app trae dentro, en `movil/certificados/certificate.pem` (vence en 2056). El cobro solo las
guarda y las sirve (`licencias/src/actualizar-celular.ts`, en R2 bajo `celular/`).

Una actualización solo llega a las apps con la misma `version` de `app.json` (`runtimeVersion` con la política
`appVersion`). Lo nativo no viaja así: un paquete nuevo con código nativo (`npx expo install` de algo que no es solo
JavaScript), un permiso, un plugin o un cambio de `app.json` fuera de lo que lee JavaScript. Para eso, sube `version` y
`android.versionCode` y saca otro `.apk`; publicar una actualización con código nativo nuevo sobre la versión de antes
truena en los celulares. Para deshacer una, revierte el commit y publica otra.

### El candado del celular: solo para quienes apoyan

Desde la 0.1.1, la app pregunta al cobro (`POST /celular`, `licencias/src/celular.ts`) al abrir y cada 6 horas. Con
`CELULAR_SOLO_APOYO` en `"1"` (`licencias/wrangler.jsonc`), solo abre con una clave de Sloth cuyo correo apoya hoy:
la que se escribe en el candado (`movil/src/pantallas/Candado.tsx`) o la de la computadora que el celular guardó al
conectarse; el creador entra con su llave. Para encenderlo o apagarlo, cambia ese valor y despliega el cobro: no hace
falta otra versión de la app. Solo cierra las copias que ya traen el candado; las 0.1.0 siguen abiertas. Sin internet,
lo último que dijo el cobro vale una semana. Cada clave abre hasta 2 celulares (`celulares`, migración 0037), aparte
de sus computadoras; para liberar uno, borra su fila.

El candado no ofrece pagar ni enlaza a la página: Google Play no deja mandar a pagar fuera de su cobro. Al subirla a
Google Play, deja a sus revisores una clave que apoye (en «Acceso a la app» de Play Console).
