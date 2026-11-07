# Rendimiento de Sloth

Mide antes de cambiar y después de cambiar, en la app compilada: la de desarrollo corre Vite y tsx, y sus tiempos no dicen
nada de lo que recibe la gente. Varias ideas razonables de abajo no sirvieron: por eso están apuntadas.

## Cómo medir

- **Arranque:** `npm run compilar -- --sin-instalador` y luego
  `node scripts/medir-arranque.mjs dist/instalador/win-unpacked 5 <carpeta de hilos>`. Corre en otro puerto, en su carpeta,
  con los hilos copiados y sin nada que retome un agente. Para comparar dos versiones: copia cada `win-unpacked` a su
  carpeta, dales los mismos hilos y alterna (base, nueva, nueva, base…) varias rondas. Una a la vez: dos mediciones
  juntas se ensucian entre sí. En Mac y Linux, la carpeta es la de su ejecutable.
- **Linux desde Windows:** Docker con `node:24`, `xvfb` y `ffmpeg` (sin él fallan tres tests). Ahí el puerto de depuración
  de Electron acepta la conexión y no contesta: en vez de `medir-arranque`, añade a `index.html` una marca que avise por
  HTTP al montarse. Límites reales: `--cpus`, `--memory`, y `--device-read-bps`/`--device-read-iops` al crear el contenedor
  (escribir `io.max` desde dentro da error). En frío: `echo 3 > /proc/sys/vm/drop_caches` antes de cada arranque.
- **Dónde se va el tiempo del servidor:** `node --cpu-prof` sobre `app/server/index.mjs`, con un `--require` que llame a
  `process.exit` al ver «Sloth en». Lo que bloquea es lo que no suelta el hilo; suma por función, no por paquete.
- **Si se congela después de arrancar:** pregúntale al servidor cada 50 ms y apunta lo que pase de 100 ms. Para saber quién
  fue, envuelve `ChildProcess.prototype.spawn` y los `*Sync` de `fs` y `child_process` (con `syncBuiltinESMExports`) en un
  gancho al principio de `app/server/index.mjs`, y mide un `setInterval` de 10 ms. Electron no deja pasar `NODE_OPTIONS`.
- **Fluidez y calor de la interfaz:** Edge con `headless: true`, `--use-angle=d3d11 --ignore-gpu-blocklist` para usar la GPU
  real, `Performance.getMetrics` para el hilo principal y `SystemInfo.getProcessInfo` para la CPU de todos los procesos.
- **Una computadora lenta:** `Emulation.setCPUThrottlingRate` (4× y 6×). No simula un disco lento ni poca memoria.
- `percentCPUUsage` de Electron se reparte entre todos los núcleos: 3 % con 12 núcleos es un tercio de uno.
- Windows no pinta una ventana tapada: el primer pintado puede no llegar. Usa cuándo se monta `#root`.
- **Cuánto tarda un video y en qué:** `npm run medir-videos -- --estilo <skill> --fases`, de las transcripciones de Claude
  y de Codex, de esta copia y de la app instalada. El plan para bajarlo: `docs/plan-videos-rapidos.md`.

## Lo que ya se hizo (31 de octubre, Windows, 42 hilos reales)

| Qué                                        | Antes     | Después   |
| ------------------------------------------ | --------- | --------- |
| Sloth.exe hasta el servidor listo          | 1.230 ms  | 651 ms    |
| Sloth.exe hasta la interfaz montada        | 1.470 ms  | 867 ms    |
| Sloth.exe hasta tener los datos            | 1.765 ms  | 964 ms    |
| El servidor solo                           | 890 ms    | 520 ms    |
| Lo que baja el hilo mayor (13,1 MB)        | 9,71 MB   | 1,12 MB   |
| Abrirlo, en una máquina 4× más lenta       | 300 ms    | 105 ms    |
| Memoria tras abrirlo                       | 15,4 MB   | 5,9 MB    |
| MCP del navegador en un hilo que no lo usa | 662 ms, 114 MB | 281 ms, 49 MB |
| Página oculta con timers                   | 36 % de un núcleo | 0,6 % |
| La misma, con el agente conectado          | 1,36 s de CPU en 2,5 s | 0,06 s |
| Rutas de `/api` al recargar                | 160 ms    | 10 ms     |
| Parón del servidor al abrir                | 625 ms    | 94 ms     |

- Lanzar un programa suele detener de 150 a 300 ms a quien lo lanza, aunque sea asíncrono, sobre todo la primera vez de cada
  uno: lo demás del tiempo son 5 ms. No depende de la consola, del entorno ni de la carpeta; no se sabe si es el antivirus.
  Por eso `reg` va en un `Worker` (`server/registro.ts`), y los agentes, uno por uno y después de la interfaz (`pedirModelos`).
- Lo que corra en un `Worker` no use tuberías si el servidor puede lanzar algo a la vez: el programa nuevo hereda la tubería, y
  `spawnSync` caduca con `status` 0 aunque ya acabara. Le pasó a `reg`: tardaba 5 s y el id de la computadora salía otro.
- Con todos los núcleos ocupados, `reg` tarda 1,3 s de mediana (0,3 s libre), igual antes y después de estos cambios, y a veces
  llegó a caducar a los 5 s: por eso su tope es de 15 s. Un test con tiempos córrelo así antes de subirlo: tres de estos
  pasaban solo en esta máquina, de 12 núcleos. Mejor contar lo que pasó (vueltas, programas lanzados) que medir milisegundos.
- `/api/cards/:id/cambios` leía 370 archivos en cada vista de una card, y todo lo demás esperaba. Ahora va sin detener el
  servidor, y lo que no cambió no se relee (`cambiosDe`). Si varias rutas tardan lo mismo a la vez, busca qué las detiene.
- Importar `playwright-core` costaba casi 400 ms de cada arranque: se carga al usarlo (`server/playwright.ts`). No importes
  nada pesado arriba de un módulo del servidor: todos se evalúan al abrir Sloth.
- El 76 % de lo que se bajaba al abrir un hilo eran salidas de herramientas, que solo se ven al abrir su fila: se piden
  entonces (`sinSalidasLargas`). Lo que sigue trabajando va entero.
- Con Playwright a demanda (`server/navegador-mcp.mjs`), el hilo que sí usa el navegador paga 1,1 s la primera vez.
- Estar conectado no es usar la página: despierta mientras dura una operación y 5 s más (`electron/actividad-navegador.ts`).
- Un chat quieto suelta su proceso a los 30 minutos y un cliente con más de 8 MiB sin leer se desconecta y relee el historial.
  No hay medida de la RAM que ahorra lo primero.
- Lo que queda antes del servidor (unos 350 ms) es Electron y Node.
- Liberar lo que ya nadie usa (1 de noviembre; probado con simulaciones, sin medida de RAM ni CPU en la app real):
  `opencode serve` se cierra a un minuto de quedarse sin hilos ni consultas, también cuando solo se abrió para listar
  modelos; los motores y los `fs.watch` de carpetas, a los cinco minutos; las ondas de audio van a un máximo de 32 archivos
  en bytes, con FFmpeg de uno en uno. Una página a la vista también descansa con Sloth minimizada o escondida.
- Para comparar: la memoria y la CPU de todo el árbol de procesos al abrir, tras acabar varios hilos y diez minutos después,
  con las mismas cuentas, videos y pestañas. Los bytes de una compilación no sustituyen esa medida.

En Linux (Docker, xvfb, 42 hilos reales, hasta la interfaz montada):

| Equipo                                       | Antes    | Después  |
| -------------------------------------------- | -------- | -------- |
| 12 núcleos, 7,7 GB                           | 668 ms   | 458 ms   |
| 2 núcleos, 4 GB                              | 700 ms   | 498 ms   |
| 2 núcleos, 4 GB, en frío                     | 1.252 ms | 1.051 ms |
| 2 núcleos, 4 GB, en frío, 50 MB/s y 120 IOPS | 25–39 s  | 25–38 s  |

- En frío con un disco tan lento, lo ganado no se nota: las dos versiones varían de 25 a 39 s, con arranques sueltos de
  100 a 170 s. Node vacío ya tarda 4,8 s y el servidor solo unos 10 s; lo demás es Electron con Chromium.

Lo que el agente abre en una página: Codex solo usaba el navegador de Sloth 1 de 6 veces (curl o `cua_repl`, igual antes de
estos cambios); con `USA_EL_NAVEGADOR`, 6 de 6. La prueba es una página cuyo código pone JavaScript, con cada dirección distinta.

## Lo que se midió y no vale la pena

- Partir el JS de la interfaz con `lazy()`: se monta en 25 ms, y en 90 ms con la CPU 6× más lenta, ya en caché. En frío, unos
  100–300 ms, solo la primera vez tras actualizar.
- La caché de compilación de Node en Playwright MCP: no ganó nada (1.087 ms sin ella, 1.233 con ella).
- Quitar `start.mjs`: el doble Node añade menos de lo que varía una medida.
- El `MutationObserver` del panel del navegador: 3 µs por cuadro.
- Copiar la lista de eventos y `buildTimeline` por lote: 0,44 ms en el hilo mayor. Paginar el historial: quitar las salidas
  ya lo deja en 1 MB.
- `writeSync` de los registros: 0,005 ms de mediana, 2 ms como máximo en este disco. T3 Code lo hace asíncrono por los
  discos lentos; aquí no se ha medido uno.
- Frenar páginas con solo animación o video: Chromium ya las detiene al esconderlas.
- Una fila de memoria para los renders (rama `t3/7d02d58e`): evita caídas con varios videos a la vez, pero 2 de 30 s tardan
  un 48 % más y su reserva con `os.freemem()` puede rechazar el render: en Mac esa cifra no cuenta la caché y se queda baja.
  Si se retoma, al vencer debe dejar pasar, como `turnoNavegador` (ADR 0011), no fallar.
- Limitar lo que devuelve el navegador al agente: la mediana es de 0,5 a 1,4 KB.

## Sin explicar

- La primera recarga tras abrir la app tardó varias veces de 2 a 11 s, con y sin estos cambios. El servidor no fue: en 40 s
  de preguntarle cada 50 ms, nunca pasó de 100 ms. Solo se vio al recargar por CDP. Al buscarlo no se repitió: 20
  recargas, por `Page.reload` y `location.reload`, con y sin el depurador, y la peor tardó 1,24 s.
- Por qué lanzar un programa detiene al que lo lanza, ver arriba.
- Una vez, Grok dijo que el MCP navegador «sigue conectándose» durante 30 s. No se repitió en 6 arranques con registro.
