/**
 * PROTOTIPO: renderiza el video del proyecto (el directorio actual) con el renderizador web de Remotion
 * (@remotion/web-renderer), como hace El Diff: cada Edge sin ventana pinta los cuadros en un canvas (HTML-in-canvas) y
 * la tarjeta los codifica en H.264 con WebCodecs. Sin capturas JPEG ni x264 en el procesador.
 *
 *   node <skill>/scripts/render_web.mjs <salida.mp4> [--frames=600-899 | --mitad=1|2] [--scale=0.5] [--bitrate=20]
 *                                       [--portada=portada.png] [--procesos=3] [--tramo=300] [--sin-tarjeta]
 *
 * `--bitrate` en Mb/s: con 20, el tramo más difícil de nuevo-4 sale con SSIM 0.994 y VMAF 99 contra los cuadros sin
 * pérdida (el render de siempre: 0.988 y 97.4, por sus capturas JPEG). Parte los cuadros en tramos de `--tramo` que los
 * Edge van tomando de una cola (unos pasajes del 3D cuestan el doble que otros: con un tramo fijo por Edge, uno acababa
 * 10 s después del otro), los pega sin recodificar y les pone la voz con FFmpeg.
 * Con `--portada`, la imagen va de primer cuadro (PORTADA.md de video-base), codificada por la misma tarjeta para pegarla
 * sin recodificar, y la voz se corre un cuadro, como hace portada.mjs; portada.mjs, con un H.264 que no es de x264,
 * recodificaría el video entero.
 * Sale con 2, sin empezar, si no hay Edge con HTML-in-canvas, si la página del video truena al cargar o si no hay
 * codificador H.264 en la tarjeta (con `--sin-tarjeta`, usa el del navegador): entonces, render.cjs.
 *
 * Por qué fallaba con el 3D: no era R3F. El <Audio> de "remotion" (Html5Audio) truena dentro del render web («not
 * supported in @remotion/web-renderer»), React desmonta todo el árbol y el delayRender que <ThreeCanvas> pidió al montarse
 * se queda huérfano hasta el tope (el mensaje del error sale en la consola, tapado por el del delayRender). Aquí un plugin
 * de esbuild cambia ese <Audio> por uno que no dibuja nada, sin tocar el proyecto; la voz (public/voz.wav, desde el
 * cuadro 0 en todos los explicativos) se pega después.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const { abrirEdge, servir } = await import(pathToFileURL(join(AQUI, "..", "..", "video-el-diff", "scripts", "web.mjs")).href);

const RAIZ = resolve(".");
const [salida, ...resto] = process.argv.slice(2);
if (!salida) {
  console.error("Uso: node render_web.mjs <salida.mp4> [--frames=a-b | --mitad=1|2] [--scale=0.5] [--bitrate=20] [--portada=portada.png], desde la raíz del proyecto.");
  process.exit(1);
}
const op = Object.fromEntries(resto.map((a) => a.replace(/^--/, "").split("=")));
// Más Edge no gana: se estorban en la tarjeta aunque esta va al 20-40 %. Con 12 hilos, 3 (4 fue más lento que 2); con 4, uno.
const PROCESOS = Number(op.procesos ?? Math.max(1, Math.min(3, Math.floor(cpus().length / 4))));
const TRAMO = Number(op.tramo ?? 300);
const BITRATE = Number(op.bitrate ?? 20) * 1e6;
const ESCALA = Number(op.scale ?? 1);
const PORTADA = op.portada ? resolve(RAIZ, op.portada) : null;
// En horizontal la portada es la miniatura de YouTube y no entra en el video (PORTADA.md de video-base).
const FORMATO = join(RAIZ, "src", "datos", "formato.json");
if (PORTADA && existsSync(FORMATO) && readFileSync(FORMATO, "utf8").includes('"horizontal"')) {
  console.error("Este video es horizontal: su portada.png es la miniatura de YouTube y no va en el video. Quita --portada.");
  process.exit(1);
}
const t0 = Date.now();
const marca = (que) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s  ${que}`);

// El <Audio> de "remotion" se cambia en el código del proyecto, no en el de los paquetes (que necesitan el de verdad).
const audioMudo = {
  name: "audio-mudo",
  setup(b) {
    b.onResolve({ filter: /^remotion$/ }, (args) => {
      if (args.namespace === "mudo" || /node_modules/.test(args.importer)) return undefined;
      return { path: "remotion", namespace: "mudo", pluginData: args.resolveDir };
    });
    b.onLoad({ filter: /.*/, namespace: "mudo" }, (args) => ({
      contents: `export * from "remotion"; export const Audio = () => null; export const Html5Audio = () => null;`,
      resolveDir: args.pluginData,
      loader: "js",
    }));
  },
};

const ENTRADA = `
import { renderMediaOnWeb } from "@remotion/web-renderer";
import { AbsoluteFill, Img } from "remotion";
import { Video } from "./src/Video";
import { ALTO, ANCHO, FPS } from "./src/tema";
import { DURACION } from "./src/tiempo";
const Portada = () => <AbsoluteFill><Img src="/portada.png" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>;
window.meta = { DURACION, FPS, ANCHO, ALTO };
// ¿La tarjeta codifica H.264 de este tamaño?
window.tarjeta = async (escala) => {
  const w = Math.round(ANCHO * escala), h = Math.round(ALTO * escala);
  const r = await VideoEncoder.isConfigSupported({ codec: "avc1.640033", width: w, height: h, bitrate: 20e6, framerate: FPS, hardwareAcceleration: "prefer-hardware" }).catch(() => ({}));
  return r.supported === true;
};
window.renderizar = async ({ desde, hasta, bitrate, escala, a, portada, aceleracion }) => {
  const t0 = performance.now();
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "Video", component: portada ? Portada : Video, durationInFrames: portada ? 1 : DURACION, fps: FPS, width: ANCHO, height: ALTO },
    inputProps: {},
    frameRange: portada ? [0, 0] : [desde, hasta],
    container: "mp4",
    videoCodec: "h264",
    muted: true,
    scale: escala,
    hardwareAcceleration: aceleracion,
    videoBitrate: bitrate,
    allowHtmlInCanvas: true,
    pageResponsiveness: "disabled",
    logLevel: "error",
  });
  const r = await fetch("/subir?a=" + encodeURIComponent(a), { method: "POST", body: await getBlob() });
  if (!r.ok) throw new Error("no se pudo guardar " + a + ": " + r.status);
  return Math.round(performance.now() - t0);
};
for (const t0 = Date.now(); window.remotion_delayRenderHandles?.length && Date.now() - t0 < 60000; ) await new Promise((r) => setTimeout(r, 50));
await document.fonts.ready;
window.listo = true;
`;

const ANTES = `<script>
window.htmlEnCanvas = typeof CanvasRenderingContext2D.prototype.drawElementImage === "function";
window.errores = [];
addEventListener("error", (e) => errores.push(String(e.error?.stack ?? e.message)));
addEventListener("unhandledrejection", (e) => errores.push(String(e.reason?.stack ?? e.reason)));
</script>`;

const ffmpeg = (...args) => new Promise((ok, mal) => {
  const p = spawn("ffmpeg", ["-nostdin", "-y", "-v", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  p.on("close", (c) => (c ? mal(new Error(`ffmpeg: ${err}`)) : ok()));
});

const { build } = createRequire(join(RAIZ, "package.json"))("esbuild");
const app = (await build({
  stdin: { contents: ENTRADA, resolveDir: RAIZ, loader: "tsx" },
  bundle: true,
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  target: "chrome120",
  write: false,
  logLevel: "error",
  plugins: [audioMudo],
})).outputFiles[0].contents;
marca("empaquetado");

const temporal = mkdtempSync(join(tmpdir(), "render-web-"));
const rutas = { "/": `<!doctype html><meta charset="utf-8"><body style="margin:0">${ANTES}<script type="module" src="/app.js"></script>`, "/app.js": app };
if (PORTADA) rutas["/portada.png"] = readFileSync(PORTADA);
const servidor = await servir({ raiz: join(RAIZ, "public"), rutas, salida: temporal });
const edges = [];
try {
  // Todos a la vez; si ninguno abre (no hay Edge, no trae HTML-in-canvas o la página truena), sale con 2.
  const abiertos = await Promise.allSettled(Array.from({ length: PROCESOS }, () => abrirEdge(servidor.url)));
  edges.push(...abiertos.filter((x) => x.status === "fulfilled").map((x) => x.value));
  if (!edges.length) {
    console.error(abiertos[0].reason.message);
    servidor.cerrar();
    rmSync(temporal, { recursive: true, force: true });
    process.exit(2);
  }
  marca(`${edges.length} Edge abiertos`);
  // Sin la tarjeta, el H.264 lo haría el procesador dentro del navegador: no se ha medido, así que va el render de siempre.
  const conTarjeta = await edges[0].evaluar(`window.tarjeta(${ESCALA})`);
  if (!conTarjeta && !("sin-tarjeta" in op)) {
    console.error("La tarjeta de este equipo no codifica H.264 para Edge (WebCodecs): usa render.cjs.");
    await Promise.all(edges.splice(0).map((c) => c.cerrar()));
    servidor.cerrar();
    rmSync(temporal, { recursive: true, force: true });
    process.exit(2);
  }
  const { DURACION, FPS } = await edges[0].evaluar("window.meta");
  const mitad = Math.floor(DURACION / 2);
  const [a, b] = op.frames ? op.frames.split("-").map(Number) : op.mitad === "1" ? [0, mitad - 1] : op.mitad === "2" ? [mitad, DURACION - 1] : [0, DURACION - 1];
  const n = b - a + 1;
  // Tramos de unos TRAMO cuadros, en orden; la portada, si va, es uno más de un cuadro, al final de la cola.
  const k = Math.max(edges.length, Math.round(n / TRAMO));
  const tramos = Array.from({ length: k }, (_, i) => ({ desde: a + Math.round((n * i) / k), hasta: a + Math.round((n * (i + 1)) / k) - 1, a: join(temporal, `parte-${String(i + 1).padStart(3, "0")}.mp4`) }));
  const portada = PORTADA && { desde: 0, hasta: 0, portada: true, a: join(temporal, "parte-000.mp4") };
  const cola = [...tramos, ...(portada ? [portada] : [])];
  // La voz del mismo pedazo (corrida un cuadro si va la portada y con silencio hasta el final del video, como la deja
  // Remotion), a AAC mientras los Edge dibujan: el AAC de FFmpeg va en un solo hilo y los 2 min de nuevo-4 tardaban
  // 5.4 s, que al final eran casi todo lo que tardaba en salir el video.
  const voz = join(temporal, "voz.m4a");
  const audio = ffmpeg("-ss", String(a / FPS), "-t", String(n / FPS), "-i", join(RAIZ, "public", "voz.wav"),
    "-af", `${PORTADA ? `adelay=delays=${(1000 / FPS).toFixed(3)}:all=1,` : ""}apad`, "-t", String((n + (PORTADA ? 1 : 0)) / FPS),
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", voz);
  audio.catch(() => {});
  const aceleracion = conTarjeta ? "prefer-hardware" : "no-preference";
  await Promise.all(edges.map(async (c) => {
    for (let t; (t = cola.shift());) await c.evaluar(`window.renderizar(${JSON.stringify({ ...t, bitrate: BITRATE, escala: ESCALA, aceleracion })})`);
  }));
  marca(`${k} tramos dibujados${conTarjeta ? "" : " (sin la tarjeta: el codificador del navegador)"}`);
  // Los Edge se cierran mientras FFmpeg pega: cerrar uno tarda hasta segundos (borrar su perfil).
  const cierres = edges.splice(0).map((c) => c.cerrar());

  // Sin recodificar nada: los tramos (mp4) uno tras otro, con los tiempos puestos de nuevo cuadro a cuadro (setts): el
  // último cuadro de cada mp4 dura 1 tic y, pegados tal cual, el tramo siguiente se adelantaba un cuadro. El color,
  // marcado BT.709 de rango limitado como el render de siempre: Edge marca la transferencia como sRGB.
  const lista = join(temporal, "lista.txt");
  writeFileSync(lista, [...(portada ? [portada] : []), ...tramos].map((t) => `file '${t.a.replaceAll("\\", "/")}'\n`).join(""));
  const destino = resolve(RAIZ, salida);
  const nuevo = join(dirname(destino), `_render-${process.pid}.mp4`);
  await audio;
  await ffmpeg("-f", "concat", "-safe", "0", "-i", lista, "-i", voz, "-map", "0:v", "-map", "1:a", "-c", "copy",
    "-bsf:v", `setts=ts=N/(${FPS}*TB):duration=1/(${FPS}*TB),h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1:video_full_range_flag=0`,
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-video_track_timescale", "90000",
    ...(PORTADA ? ["-metadata", "comment=sloth-portada"] : []),
    // El índice (moov) delante de los datos, en un hueco reservado al principio: con +faststart FFmpeg reescribía el
    // archivo entero al final (3-7 s de los 440 MB del video de nuevo-4). Ese índice ocupó ~100 KB: unos 11 bytes por
    // cuadro y por bloque de audio (1024 muestras); se reserva el doble y algo más.
    "-moov_size", String(65536 + 24 * Math.ceil(n + 1 + ((n + 1) / FPS) * (48000 / 1024))), nuevo);
  renameSync(nuevo, destino);
  marca(`listo: ${destino}`);
  await Promise.all(cierres);
} finally {
  await Promise.all(edges.map((c) => c.cerrar().catch(() => {})));
  servidor.cerrar();
  rmSync(temporal, { recursive: true, force: true });
}
