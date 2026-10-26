# Sloth en Electron

Fecha: 2026-10-22

## Contexto

Hasta la 0.2.5, la app que se vende era un lanzador propio en C# (`Sloth.exe`, con la ventana en WebView2) y un instalador
propio (un zip pegado a un .exe). Cada versión nueva se bajaba entera: más de 300 MB, aunque cambiara una línea. Además,
el dueño quiere vender Sloth también en Mac, y nada de eso existe fuera de Windows.

## Decisión

La ventana, el instalador y las actualizaciones pasan a Electron, como T3 Code:

- `electron/main.ts` es Sloth.exe: levanta el servidor con su propio Node, enseña la interfaz y deja el icono junto al
  reloj. En el repo, `npm start` abre la misma ventana (`SLOTH_VENTANA`).
- electron-builder arma un instalador NSIS de un clic (`scripts/compilar.mjs`). Instala donde estaba la 0.2
  (`%LOCALAPPDATA%\Programs\Sloth`), con el mismo AppUserModelID (`Sloth.App`): lo anclado y los avisos siguen.
- electron-updater baja de cada versión nueva solo los pedazos de su instalador que cambiaron, con su mapa de bloques.
  Los sirve el cobro de Sloth (`licencias/`, `/actualizaciones/`), uno por petición
  (`useMultipleRangeRequest: false`).

Lo que no cambia: el servidor y las skills siguen igual, en `app\` junto a Sloth.exe, con su propio Node (las skills
corren `node`, `npm` y `npx`). Tus videos y tus hilos siguen en `app\trabajo` y `app\data`: el desinstalador que corre al
actualizar los deja (`customRemoveFiles` en scripts/instalador.nsh), así que pasar de la 0.2 a la 0.3 no mueve nada ni
rompe los hilos (guardan su carpeta con la ruta completa). Las skills viajan en `resources\skills` y la app las pone en
`app\skills` sin pisar lo que guardan de tus videos.

La barra de título lleva el color de Sloth con `accentColor` de Electron. Anclar a la barra de tareas lo ofrece la
bienvenida: Windows solo pregunta si lo pide la ventana de Sloth al frente (desde el instalador dice que no sin
preguntar), con TaskbarManager, que Sloth.exe llama con koffi (`electron/barra.ts`). En los Windows de antes lo hace
`ayudante.exe` (C#), que también quita el ancla al desinstalar.

## Consecuencias

- Cada actualización baja pocos MB en lugar del instalador entero, salvo cuando cambian Claude Code o Codex, que pesan
  cientos de MB cada uno. La primera vez desde la 0.2 se baja completa (la 0.2 no sabe bajar por pedazos).
- El instalador pesa más (Electron son unos 100 MB comprimidos) y Electron hay que actualizarlo: saca una versión mayor
  cada 8 semanas y solo mantiene las tres últimas.
- Mac queda posible, pero falta lo que Electron no resuelve: los datos fuera de la app (un .app firmado no se puede
  escribir), Node, FFmpeg y Python para Mac, lo que las skills hacen con PowerShell y rutas de Windows, y firmar y
  notarizar con una cuenta de Apple.
