# Sloth en Mac y Linux

Fecha: 2026-10-23

Actualizado: 2026-10-24 (diálogo de carpetas, instalación de Python y OCR ya implementados); 2026-10-27 (la de Mac
pasa a Intel); 2026-11-02 (vuelve la de Apple Silicon, aparte de la de Intel, y la firma de Apple); 2026-11-08 (firma en cada
publicación, con la notarización sin esperar a Apple más de 10 min).

## Contexto

Sloth se vendía solo para Windows. El ADR 0004 la pasó a Electron para poder llevarla a Mac, y dejó escrito lo que
faltaba: los datos fuera de la app, Node, FFmpeg y Python de cada sistema, lo que las skills hacían con PowerShell y rutas
de Windows, y la firma de Apple.

## Decisión

Cada push a `venta` compila y publica cinco instaladores (`.github/workflows/venta.yml`), cada uno en su máquina, con
la misma versión: el `.exe` de siempre, un `.dmg` para Mac con Intel, otro para Mac con Apple Silicon y otro para Mac
con macOS 12 (cada uno con su `.zip`, con el que se actualiza) y un AppImage para Linux x64. El cobro los da en
`/descargar`, `/descargar?so=mac` (que deja elegir entre las de Mac), `/descargar?so=mac-arm64`,
`/descargar?so=mac12` y `/descargar?so=linux`.

- **Tus datos.** Un `.app` y un AppImage no se pueden escribir: el servidor viaja en `resources/sloth` y la app lo copia
  al estrenar cada versión a `~/Library/Application Support/Sloth` (Mac) o `~/.local/share/sloth` (Linux), donde viven
  también `data`, `trabajo` y `skills`, igual que en `app\` en Windows (`prepararApp` en electron/main.ts).
- **%APPDATA%.** Fuera de Windows, scripts/start.mjs lo pone en `~/Library/Application Support` o `~/.config`: el
  servidor, los agentes y los scripts de las skills buscan ahí el Python de Sloth y sus modelos igual en los tres.
- **FFmpeg y Python** no se instalan con winget: se bajan ya armados a `%APPDATA%/sloth/piezas/bin`, primero en el PATH
  (FFmpeg de Martin Riedl en Mac y de BtbN en Linux; Python de python-build-standalone, el mismo del Python de Sloth).
  El Python del sistema no se usa: en Mac no está y en Ubuntu no deja instalar paquetes con pip.
- **Python de Sloth y sus modelos.** `server/requisitos.ts` instala un Python propio en
  `%APPDATA%/youtube/piezas/python`, sus paquetes de transcripción y los modelos. Elige CUDA si hay NVIDIA y CPU si no;
  si se corta, vuelve a instalar solo lo que falte. Ya no hace falta copiarlo de otra computadora. En un Mac con Apple
  Silicon, la de Intel corre con Rosetta, pero el Python y FFmpeg se bajan de ARM (`ARQUITECTURA`): corren nativos
  y tienen torch; la de Apple Silicon ya es nativa entera, y baja sus agentes aparte (`piezas/agentes-arm64`), porque
  en esa carpeta la de Intel pudo dejar los suyos. En un Mac con Intel no hay torch 2.8 (el último para Intel es el 2.2), así que su Python de Sloth va
  sin torch: transcribe con Parakeet sin afinar los tiempos (`parakeet-solo`) y no tiene vectores (huellas compara por
  palabras). No se ha probado en un Mac de verdad.
- **Lo de Windows en el servidor** tiene su par: la Papelera (Finder, `gio trash`), «abrir en su carpeta» (`open -R`, `xdg-open`), la ventana donde se autoriza Claude (Terminal o la
  terminal de Linux), las llaves de Opciones (`%APPDATA%/sloth/variables.json`) y el id del equipo de la licencia.
- **Firma de Apple.** Sin cuenta de desarrollador, la de Mac sale con firma ad hoc: se abre la primera vez desde
  Configuración → Privacidad y seguridad → «Abrir de todos modos», y «Actualizar» abre la descarga en el navegador
  (electron-updater solo pone versiones nuevas en una app firmada). Con los secretos de Apple en GitHub (`CSC_LINK`,
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) salen firmadas y notarizadas. La
  notarización espera a Apple 10 min como máximo (`scripts/notarizar.mjs`): los primeros envíos de un equipo nuevo
  tardan días, y el 7 de noviembre de 2026 eso dejó la 0.4.0 con firma local. Sin respuesta a tiempo sale firmada sin
  ticket (el cobro la marca `sinTicket` y sigue explicando el paso de la primera vez), y abre a la primera cuando
  Apple acepte el envío. Con certificado se actualizan
  solas, sin tocar nada más; el cobro lo sabe (`firmada`) y deja de explicar el paso de la primera vez.
  macOS solo pone una versión nueva si la firma el mismo equipo de Apple que la instalada: cambiar de certificado deja
  sin actualizar a quien ya tiene una firmada, y una sin firma no se publica encima de una firmada (el cobro la
  rechaza). La 0.3.43 de Apple Silicon, que se armó a mano, la firmó una sola vez un colaborador (Developer ID
  `BV4282V244`) y no pasó por el cobro: quien la tenga baja a mano la siguiente.
- **Linux sin aislamiento de Chromium** solo donde no hay otra: Ubuntu 24.04 no deja a un AppImage crear el suyo, y
  Sloth no abriría. Un guion junto al ejecutable lo mira antes de abrirla (`linuxSinAislamiento` en scripts/compilar.mjs).

## Consecuencias

- No se ha abierto en un Mac de verdad: la compilación de GitHub dice si arma, no si funciona. La de Linux se armó y se
  abrió en un Ubuntu 24.04 (en un contenedor), y ahí bajó sola FFmpeg, Python y los paquetes.
- Dos de Mac: la de Intel (x64), en `macos-15-intel`, y la de Apple Silicon (arm64), en `macos-15`. La de ARM no abre
  en los Mac con i5/i7, y la de Intel en uno con M1 va con Rosetta y sin lo nativo. Cada una es un sistema en el
  cobro, con su última versión (`mac` y `mac-arm64`) y lo que lee su electron-updater (`latest-mac.yml` y
  `latest-arm64-mac.yml`): un job que falle no deja a medias el del otro. El canal de la de ARM (`latest-arm64`) va
  en `app-update.yml`, al compilar; ponerlo en `autoUpdater.channel` le dejaría instalar versiones más viejas (lo hace
  la 0.3.43, que se armó a mano: su primera actualización ya lo quita). GitHub retira sus máquinas Intel en agosto de
  2027: entonces la de Intel saldrá de la de ARM o será universal.
- La de macOS 12 (Monterey), desde el 5-nov-2026: Electron 44 y Node 24 ya no abren ahí («requiere macOS 13.0»), así
  que sale aparte con Electron 43 (`ELECTRON_MAC12` en scripts/compilar.mjs) y Node 22, en `macos-15-intel` con
  `SLOTH_MAC12=1`. Solo de Intel: todo Mac con Apple Silicon llega a macOS 13. Es otro sistema en el cobro (`mac12`,
  `Sloth-<versión>-mac12-x64.dmg`, su canal `latest-mac12` y `latest-mac12-mac.yml`), para que nunca se actualice a la de
  Intel, que ahí no abre. El servidor se arma para Node 22 y `comprobar.yml` corre las pruebas con él. Cada vez que se
  abre, un aviso a pantalla completa (`web/src/AvisoMacViejo.tsx`) dice que es probable que algunas funciones no anden:
  el programa de Claude pide macOS 13, y FFmpeg, Python y los demás agentes no se han probado ahí. Electron 43 deja de
  recibir parches el 5-ene-2027: la de macOS 12 se queda en él mientras haya quien la use. Cuando Node 22 deje de tener
  soporte (abril de 2027) o el servidor necesite algo de Node 24, se quita.
- Linux ARM queda fuera: sería otra máquina en el flujo.
- El Diff lee con OCR las capturas sin texto: en Windows usa el del sistema; en Mac y Linux, RapidOCR
  (`skills/video-el-diff/plantilla/ubicar.py`). Sloth instala RapidOCR con los paquetes de El Diff fuera de Windows
  (`PAQUETES` en server/requisitos.ts). Las capturas de `pagina.mjs` que ya traen texto evitan el OCR.
- Anclar a la barra de tareas sigue siendo solo de Windows; en Mac está el Dock, y en Linux, el lanzador de cada escritorio.
