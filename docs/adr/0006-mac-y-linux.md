# Sloth en Mac y Linux

Fecha: 2026-10-23

Actualizado: 2026-10-24 (diálogo de carpetas, instalación de Python y OCR ya implementados); 2026-10-27 (la de Mac
pasa a Intel).

## Contexto

Sloth se vendía solo para Windows. El ADR 0004 la pasó a Electron para poder llevarla a Mac, y dejó escrito lo que
faltaba: los datos fuera de la app, Node, FFmpeg y Python de cada sistema, lo que las skills hacían con PowerShell y rutas
de Windows, y la firma de Apple.

## Decisión

Cada push a `venta` compila y publica tres instaladores (`.github/workflows/venta.yml`), cada uno en su sistema, con la
misma versión: el `.exe` de siempre, un `.dmg` para Mac con Intel (y su `.zip`, con el que se actualiza) y un
AppImage para Linux x64. El cobro los da en `/descargar`, `/descargar?so=mac` y `/descargar?so=linux`.

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
  si se corta, vuelve a instalar solo lo que falte. Ya no hace falta copiarlo de otra computadora.
- **Lo de Windows en el servidor** tiene su par: la Papelera (Finder, `gio trash`), «abrir en su carpeta» (`open -R`, `xdg-open`), la ventana donde se autoriza Claude (Terminal o la
  terminal de Linux), las llaves de Opciones (`%APPDATA%/sloth/variables.json`) y el id del equipo de la licencia.
- **Firma de Apple.** Sin cuenta de desarrollador, la de Mac sale con firma ad hoc: se abre la primera vez desde
  Configuración → Privacidad y seguridad → «Abrir de todos modos», y «Actualizar» abre la descarga en el navegador
  (electron-updater solo pone versiones nuevas en una app firmada). Con los secretos de Apple en GitHub (`CSC_LINK`,
  `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`), sale firmada y notarizada y se
  actualiza sola, sin tocar nada más.
- **Linux sin aislamiento de Chromium** solo donde no hay otra: Ubuntu 24.04 no deja a un AppImage crear el suyo, y
  Sloth no abriría. Un guion junto al ejecutable lo mira antes de abrirla (`linuxSinAislamiento` en scripts/compilar.mjs).

## Consecuencias

- No se ha abierto en un Mac de verdad: la compilación de GitHub dice si arma, no si funciona. La de Linux se armó y se
  abrió en un Ubuntu 24.04 (en un contenedor), y ahí bajó sola FFmpeg, Python y los paquetes.
- La de Mac es solo de Intel (x64), compilada en `macos-15-intel`: la de Apple Silicon no abría en los Mac con i5/i7, y
  la de Intel sí abre en los de Apple Silicon, con Rosetta (macOS la instala la primera vez). Una sola de Mac evita
  dos «últimas» en el cobro y dos `latest-mac.yml`. Cuando haga falta la nativa de ARM, será otra fila en el flujo y
  en el cobro. GitHub retira sus máquinas Intel en agosto de 2027: antes hay que tener la de ARM o una universal.
- Linux ARM queda fuera: sería otra máquina en el flujo.
- El Diff lee con OCR las capturas sin texto: en Windows usa el del sistema; en Mac y Linux, RapidOCR
  (`skills/video-el-diff/plantilla/ubicar.py`). Sloth instala RapidOCR con los paquetes de El Diff fuera de Windows
  (`PAQUETES` en server/requisitos.ts). Las capturas de `pagina.mjs` que ya traen texto evitan el OCR.
- Anclar a la barra de tareas sigue siendo solo de Windows; en Mac está el Dock, y en Linux, el icono junto al reloj.
