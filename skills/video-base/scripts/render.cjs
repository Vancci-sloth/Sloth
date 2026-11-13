// Renderiza la composición de un proyecto de Remotion (el directorio actual) con un solo Chrome, diciendo cuánto falta, y
// pone el resultado en su sitio aunque el estudio de Sloth tenga abierto el de antes. Es el render de los estilos del
// motor (MOTOR.md): lo que cambia de uno a otro es el nombre de su composición.
//
//   node <base>/scripts/render.cjs <salida.mp4> --id=Documental [--muted] [--crf=18] [--x264-preset=veryfast]
//        [--concurrency=8] [--scale=0.5] [--pixel-format=yuv420p] [--color-space=bt709] [--frames=0-299] [--3d]
//        [--antes=<módulo.cjs>] [--props=<json>]
//
// `--antes`: un módulo que exporta `async ({ serveUrl, raiz, op }) => {}` y corre con el paquete ya hecho, antes de
// dibujar. `--props`: las `inputProps` de la composición.
// `--3d`: antes de dibujar mira con qué dibuja el 3D Chrome y avisa si es por software (`tarjeta3D` de equipo.cjs).
// `--concurrency`: cuántas pestañas dibujan a la vez; sin él, la mitad de los núcleos (lo de Remotion). Con la máquina
// libre, dos tercios rinden más; con otro video renderizando, no.
// Empaqueta en una carpeta de %TEMP% que se borra al terminar (remotion.cjs). Renderiza a un nombre nuevo y luego lo
// pone en su sitio: Windows no deja reemplazar un archivo que otro tiene abierto.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const raiz = process.cwd();
const [salida, ...resto] = process.argv.slice(2);
if (!salida || salida.startsWith("--") || !fs.existsSync(path.join(raiz, "remotion.config.ts"))) {
  console.error("Uso: node render.cjs <salida.mp4> --id=<composición> [opciones], desde la raíz del proyecto.");
  process.exit(1);
}
const op = Object.fromEntries(resto.map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "1"]; }));
const desde = createRequire(path.join(raiz, "package.json"));
const { empaquetar } = require(path.join(__dirname, "remotion.cjs"));
const equipo = require(path.join(__dirname, "equipo.cjs"));
const { openBrowser, renderMedia, selectComposition } = desde("@remotion/renderer");

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pone `nuevo` en lugar de `destino`. Si el destino está abierto, lo aparta (`_viejo-…`, que Sloth no enseña). */
async function reemplaza(nuevo, destino) {
  const carpeta = path.dirname(destino);
  for (let vuelta = 0; ; vuelta++) {
    try {
      fs.renameSync(nuevo, destino);
      break;
    } catch (e) {
      if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || vuelta === 20) {
        throw new Error(`No pude poner el render en ${destino} (${e.code}): quedó en ${nuevo}. ¿Lo tiene abierto otro programa?`);
      }
    }
    try {
      if (fs.existsSync(destino)) fs.renameSync(destino, path.join(carpeta, `_viejo-${Date.now()}-${path.basename(destino)}`));
    } catch {}
    await espera(500);
  }
  for (const f of fs.readdirSync(carpeta)) {
    if (!f.startsWith("_viejo-")) continue;
    try {
      fs.unlinkSync(path.join(carpeta, f));
    } catch {}
  }
}

(async () => {
  const t0 = Date.now();
  const { serveUrl, soltar } = await empaquetar(raiz);
  // `--antes`: lo que el estilo prepara en el paquete ya hecho, antes de dibujar (el documental saca ahí los cuadros de
  // sus clips). Se borra con el paquete.
  if (op.antes) await require(path.resolve(op.antes))({ serveUrl, raiz, op });
  const inputProps = op.props ? JSON.parse(op.props) : undefined;
  const empaquetado = (Date.now() - t0) / 1000;
  const chromiumOptions = { gl: "angle" };
  const navegador = await openBrowser("chrome", { chromiumOptions, logLevel: "error" });
  const base = { serveUrl, chromiumOptions, logLevel: "error", puppeteerInstance: navegador };
  if (op["3d"]) await equipo.tarjeta3D(navegador, desde);
  const composition = await selectComposition({ ...base, id: op.id || "Video", inputProps });
  const frames = op.frames ? op.frames.split("-").map(Number) : null;
  const cuadros = frames ? frames[1] - frames[0] + 1 : composition.durationInFrames;
  const destino = path.resolve(raiz, salida);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = path.join(path.dirname(destino), `_render-${process.pid}.mp4`);
  console.log(`Render: ${cuadros} cuadros (empaquetado en ${empaquetado.toFixed(0)} s).`);
  const inicio = Date.now();
  let aviso = 0;
  await renderMedia({
    ...base,
    composition,
    inputProps,
    codec: "h264",
    outputLocation: temporal,
    muted: Boolean(op.muted),
    scale: op.scale ? Number(op.scale) : 1,
    crf: op.crf ? Number(op.crf) : undefined,
    x264Preset: op["x264-preset"],
    pixelFormat: op["pixel-format"],
    colorSpace: op["color-space"],
    concurrency: op.concurrency ? (/%$/.test(op.concurrency) ? op.concurrency : Number(op.concurrency)) : undefined,
    offthreadVideoThreads: op["video-threads"] ? Number(op["video-threads"]) : undefined,
    jpegQuality: op["jpeg-quality"] ? Number(op["jpeg-quality"]) : undefined,
    frameRange: frames,
    onProgress: ({ progress }) => {
      if (progress * 10 >= aviso + 1) {
        aviso = Math.floor(progress * 10);
        console.log(aviso < 10 ? `${aviso * 10} % (faltan ${equipo.falta(progress, inicio)})` : "100 %");
      }
    },
  });
  const segundos = (Date.now() - inicio) / 1000;
  console.log(`Render: ${cuadros} cuadros en ${segundos.toFixed(0)} s (${(cuadros / segundos).toFixed(1)} por segundo).`);
  await navegador.close({ silent: true });
  soltar();
  await reemplaza(temporal, destino);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
