// Renderiza el video del proyecto (el directorio actual) como `npx remotion render`, pero codificando mientras dibuja.
//
//   node <skill>/scripts/render.cjs <salida.mp4> [--scale=0.5] [--crf=16] [--x264-preset=slow] [--pixel-format=yuv420p]
//                                   [--color-space=bt709] [--frames=0-1391 | --mitad=1|2]
//
// Antes de dibujar mira con qué dibuja el 3D Chrome y avisa si es por software (`tarjeta3D` de video-base/scripts/
// equipo.cjs); un solo Chrome hace eso y el render. Dice cuánto tardará, si ya se midió aquí, y cada 10 % cuánto falta.
//   node <skill>/scripts/render.cjs --empaqueta     (solo empaqueta: deja lista la caché de webpack, ~40 s la primera vez)
//
// Remotion solo codifica en paralelo si, tras reservar 1 GB por millón de píxeles (2 GB en 1080×1920), quedan 2 GB
// libres: unos 4 GB. Haciendo un video esta máquina tiene unos 3, así que dibujaba todo y codificaba después (76 de los
// 191 s del final de nuevo-8). Medido en nuevo-8: el codificador usa ~0.9 GB, y en paralelo el final tarda 125 s; la
// imagen difiere del render normal lo mismo que dos renders normales entre sí (PSNR 48.7 contra 48.4). Aquí basta
// con que queden 2 GB libres; con menos, decide Remotion.
//
// Renderiza a un nombre nuevo y luego lo pone en su sitio: Windows no deja reemplazar un archivo que otro tiene abierto
// (el monitor de Sloth enseñando el video, un ffprobe), y Remotion fallaba al final del render (nuevo-10 y nuevo-11).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const raiz = process.cwd();
const desde = createRequire(path.join(raiz, "package.json"));
const empaqueta = process.argv[2] === "--empaqueta";
const [salida, ...resto] = process.argv.slice(2);
if ((!salida && !empaqueta) || !fs.existsSync(path.join(raiz, "remotion.config.ts"))) {
  console.error("Uso: node render.cjs <salida.mp4> [opciones], desde la raíz del proyecto.");
  process.exit(1);
}
const op = Object.fromEntries(resto.map((a) => a.replace(/^--/, "").split("=")));

// Por su ruta: el paquete no lo exporta, y así es el mismo módulo que usa renderMedia.
const memoria = desde(path.join(path.dirname(desde.resolve("@remotion/renderer")), "prestitcher-memory-usage.js"));
const LIBRE = 2e9;
if (os.freemem() >= LIBRE) {
  const original = memoria.shouldUseParallelEncoding;
  memoria.shouldUseParallelEncoding = (a) => ({ ...original(a), hasEnoughMemory: true });
}
// Empaqueta en una carpeta de %TEMP% que se borra al terminar: la de `bundle()` lleva una copia de `public/` y se quedaba.
const { empaquetar } = require(path.join(os.homedir(), ".claude", "skills", "video-base", "scripts", "remotion.cjs"));
// Cuánto falta y, del final, cuánto tardó: en una computadora lenta el render es lo más largo y, sin decirlo, parece colgado.
const equipo = require(path.join(os.homedir(), ".claude", "skills", "video-base", "scripts", "equipo.cjs"));
const { openBrowser, renderMedia, selectComposition } = desde("@remotion/renderer");

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pone `nuevo` en lugar de `destino`. Si el destino está abierto, lo aparta (`_viejo-…`, que Sloth no enseña). */
const reemplaza = async (nuevo, destino) => {
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
  // Lo apartado y lo que dejaron renders que fallaron (de hace más de 10 min), si ya se deja borrar.
  for (const f of fs.readdirSync(carpeta)) {
    const ruta = path.join(carpeta, f);
    const viejo = f.endsWith(".remotion-in-progress") && Date.now() - fs.statSync(ruta).mtimeMs > 10 * 60_000;
    if (f.startsWith("_viejo-") || viejo) {
      try {
        fs.unlinkSync(ruta);
      } catch {}
    }
  }
};

(async () => {
  const { serveUrl, soltar } = await empaquetar(raiz);
  if (empaqueta) return soltar();
  // Lo mismo que remotion.config.ts: el 3D con la tarjeta de video (ANGLE). Un solo Chrome para todo.
  const chromiumOptions = { gl: "angle" };
  const navegador = await openBrowser("chrome", { chromiumOptions, logLevel: "error" });
  const base = { serveUrl, chromiumOptions, logLevel: "error", puppeteerInstance: navegador };
  await equipo.tarjeta3D(navegador, desde);
  const composition = await selectComposition({ ...base, id: "Video" });
  const n = composition.durationInFrames;
  const mitad = Math.floor(n / 2);
  const frames = op.frames ? op.frames.split("-").map(Number) : op.mitad === "1" ? [0, mitad - 1] : op.mitad === "2" ? [mitad, n - 1] : null;
  let aviso = 0;
  const destino = path.resolve(raiz, salida);
  const temporal = path.join(path.dirname(destino), `_render-${process.pid}.mp4`);
  const cuadros = frames ? frames[1] - frames[0] + 1 : n;
  const cuanto = !op.scale || Number(op.scale) === 1 ? equipo.estimado(cuadros) : "";
  console.log(`Render: ${cuadros} cuadros${cuanto ? `; en este equipo, ${cuanto}` : ""}.`);
  const inicio = Date.now();
  await renderMedia({
    ...base,
    composition,
    codec: "h264",
    outputLocation: temporal,
    scale: op.scale ? Number(op.scale) : 1,
    crf: op.crf ? Number(op.crf) : undefined,
    x264Preset: op["x264-preset"],
    pixelFormat: op["pixel-format"],
    colorSpace: op["color-space"],
    frameRange: frames,
    onProgress: ({ progress }) => {
      if (progress * 10 >= aviso + 1) {
        aviso = Math.floor(progress * 10);
        console.log(aviso < 10 ? `${aviso * 10} % (faltan ${equipo.falta(progress, inicio)})` : "100 %");
      }
    },
  });
  if (!frames && (!op.scale || Number(op.scale) === 1)) equipo.anotarRender(n, (Date.now() - inicio) / 1000);
  await navegador.close({ silent: true });
  soltar();
  await reemplaza(temporal, destino);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
