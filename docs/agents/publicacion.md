# Comprobar y publicar Sloth

## Comprobación sin publicar

`Comprobar Sloth` (`.github/workflows/comprobar.yml`) se ejecuta al subir a `main`, en las PR hacia `main` y a mano
desde Actions. En Windows, Mac y Linux instala las dependencias y FFmpeg, corre `npm test`, `npm run comprobar-skills`
y `npm run compilar -- --sin-instalador`. Este último incluye `npm run typecheck`, arma la interfaz y el servidor,
comprueba sus paquetes, revisa que lo que se vende no lleve nada del creador ni React en modo desarrollo y empaqueta
Electron. También prueba el caso de secretos de Apple vacíos: Mac usa firma ad hoc.

No cambia la versión, no arranca la app ni sube archivos al cobro. Comprueba compilación y empaquetado; los instaladores
y la firma con certificado de Apple se hacen en `venta`. Para repetirlo en esta computadora, con FFmpeg en el PATH
(las pruebas de YouTube generan videos y extraen fotogramas):

```powershell
npm ci --no-audit --no-fund
npm test
npm run compilar -- --sin-instalador
```

Cada sistema se comprueba en el suyo. Antes de publicar, comprueba que los tres resultados de `Comprobar Sloth`
corresponden al commit de `main` que vas a subir y terminaron bien. Este workflow informa; no configura protección de
ramas ni bloquea por sí solo un push a `venta`.

## App instalada: este repo, rama venta

1. Actualiza `novedad.txt`: un renglón corto con lo que trae la versión, que se ve al pasar el cursor sobre «Actualizar».
2. Comprueba el diff completo entre `origin/venta` y `main`: se publicará todo lo que haya entrado a `main`.
3. Tras verificar la cuenta de GitHub indicada en `AGENTS.md`, `git push origin main:venta` inicia
   `.github/workflows/venta.yml`. Genera una versión común, compila los tres instaladores con `npm run compilar` y los
   sube al cobro con `npm run publicar`. No hace falta compilar localmente para publicar.
4. Comprueba los tres jobs y la versión que ofrece el cobro: `/version`, `/version?so=mac` y `/version?so=linux` en
   `https://api.sloth.vancci.org`. Verifica también los metadatos de `/actualizaciones/latest.yml`,
   `latest-mac.yml` y `latest-linux.yml`, y los enlaces de descarga de cada sistema.

La llave `PUBLICAR` del workflow autoriza la subida. Los secretos de Apple y el comportamiento sin firma están en
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

Aplica las migraciones cuando el cambio incluya alguna, antes de desplegar código que necesite esas columnas.
Comprueba la ruta afectada en `https://api.sloth.vancci.org`. Este despliegue es independiente de
`main` y `venta`; subir la app no actualiza el Worker. Los nombres de sus secretos están en la cabecera de su configuración.

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
