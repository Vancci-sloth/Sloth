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

1. Actualiza `novedad.txt`: un renglón corto con lo que trae la versión, que se ve al pasar el cursor sobre «Actualizar».
   Una versión puede llevar además su guía animada (`web/src/Novedades.tsx`, la 0.4.2 en
   `web/public/novedades/0.4.2.html`, que reemplaza a la de antes), que sale una vez al abrirla a quien actualizó. Su
   número en `Novedades.tsx` debe ser el que saldrá: `version-venta.mjs` sube solo la última cifra de la publicada, y un
   salto (0.5.0) se pone a mano en `package.json`.
2. Comprueba el diff completo entre `origin/venta` y `main`: se publicará todo lo que haya entrado a `main`. Guarda la
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
   Para esperar el flujo, `gh run watch <id> --exit-status` de fondo.
5. Cuando los cinco salieron bien, cuéntalo en Anuncios de la comunidad, sin preguntar: escribe el anuncio como lo
   escribe Vancci ([anuncios.md](anuncios.md)) y publícalo con `node scripts/anuncio.mjs <archivo>`. Luego, también
   sin preguntar, avisa a quien pidió en la comunidad lo que trae la versión: `node scripts/mejoras.mjs` enseña las
   mejoras que faltan (y lo pedido fuera de Mejoras, de `scripts/pedidos.json`); a cada una que resuelvan los commits del paso 2, un comentario en el mismo tono (que ya quedó, dónde
   se usa, que lo pruebe y le diga qué tal; sin `[para todos]`, que sin apoyo le llega en 7 días) con
   `node scripts/mejoras.mjs <id> <archivo>`, que también la marca hecha.

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
Los créditos mensuales de voz necesitan la migración `0024_voz_mensual.sql` y el Worker actualizado **antes** de publicar
la app. El script de publicación manda `vozMensual` y, al terminar de subir el `latest*.yml`, el Worker guarda la marca
`voz-mensual.json` en R2: ahí abre las voces aunque siga `VOZ_SOLO_CREADOR=1`. Hasta entonces siguen solo para el creador.
Cada diez minutos refresca a 100.000 los créditos de cada correo, una vez por mes natural de Ciudad de México, **SOLO a
quien paga activamente $15 USD o más** (`PRECIO_MENSUAL`; 299 MXN en los apoyos en pesos, o el anual) y a nadie más: ni
cuentas gratis, ni apoyos de menos (el monto que cada quien elige), ni lugares gratis de Fundador de por vida. Lo decidió
el creador el 7 de noviembre de 2026 y la regla es una sola, `daCreditos` en `licencias/src/voz-mensual.ts`, que usa
también la rifa. También lo hace al consultar `/voz`. Refrescar es sumar lo que falta para llegar a 100.000: lo
no usado no se acumula, nunca se quita lo que el creador dio de más, y no se recuperan meses anteriores. El correo lleva
la **clave de Sloth existente**, que se pega en Opciones → Voz → Voces de Sloth, y se reintenta sin repetir la entrega. Todo sale de las mismas llaves de socio y aparece en Administrador.
La rifa necesita la migración `0025_rifas.sql` y el Worker desplegado; con créditos, además, las voces ya abiertas.
Su sección y su ruleta llegan a la Administrador instalada con la siguiente versión de la app.
Un reparto en `enviando` o `revisar` requiere comprobar el movimiento en el proveedor antes de volver a sumarlo: su API
no documenta idempotencia para créditos. No se reintenta esa suma automáticamente.
Para guardar uno que el usuario copió, pásalo desde Git Bash: `tr -d ' \r\n' < /dev/clipboard | npm run licencias -- secret
put NOMBRE`. Desde PowerShell, la tubería le pone un BOM delante y la pasarela rechaza la llave. Una llave de Voices
Cloning (`pk_live_…`) va en el siguiente `VOICES_PK_LIVE_<n>` libre (mira `secret list`), nunca encima de una que ya
está: cada una es su cuenta, con sus usuarios (ADR 0018). Su saldo se ve en Administrador.

Cuando el usuario pida un link de Fundador, dale uno nuevo con `npm run fundador -- nuevo <para quién>`. Es de una sola
persona: la página ofrece los $15 (cada mes o una vez) hasta que alguien paga con él, aunque los 25 lugares públicos
estén ocupados. Sin link, la página enseña el de Fundador mientras quede alguno de los 25, y llenos, solo «Lo que
gustes» y $30. Con `lista` ves los que se han dado y quién usó cada uno, y con `revocar <código>` uno deja de servir.
Si alguien apoyó por transferencia, `npm run fundador -- dar <correo> [meses]` lo hace Fundador esos meses (1 si no se
dice) y le manda su clave por correo; si ya tenía uno así, se le suman. Con 0 meses, solo se le vuelve a mandar.

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
falta. El proyecto de Astro está dentro de `web/`: ahí se corre `npm ci` y `npm run build` antes de subir los cambios
al `main` de ese repo. Vercel despliega ese push.

Comprueba el despliegue de Vercel y la página publicada en `https://sloth.vancci.org`, incluidos los enlaces de descarga
y pago que hayas cambiado. Cambiar este repo o desplegar `licencias/` no modifica esa página.
