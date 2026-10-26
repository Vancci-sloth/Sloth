/**
 * Renderiza tramos del episodio con el renderizador web de Remotion (@remotion/web-renderer), en Edge sin ventana. Lo
 * llama final.py desde la raíz del proyecto:
 *
 *     node <skill>/scripts/render_web.mjs <encargo.json>
 *
 * encargo.json: { bitrate, tramos: [{ nombre, desde, hasta, salida, tipo }] }. Cada tramo sale en un .mov con el video
 * en H.264 (lo codifica la tarjeta con WebCodecs) y el audio en PCM, sin pérdida, para normalizarlo después. Con
 * `tipo: "portada"`, un solo cuadro con portada.png (y su cuadro de silencio): sale con el mismo H.264 que los demás y
 * se pega delante sin recodificar. Sacar el audio aparte para masterizarlo mientras se renderiza no conviene: el
 * episodio de des-to solo en audio tardó 109 s en un Edge.
 *
 * Cada cuadro lo pinta el propio Edge en un canvas (HTML-in-canvas, `drawElementImage`), así que sale igual que en el
 * render de siempre, degradados, grano y mezclas incluidos; el render de siempre le toma una foto a cada cuadro y se la
 * pasa a FFmpeg. En el equipo del usuario, los 6.5 minutos del episodio de Photon tardaron 72 s con 4 Edge a la vez,
 * contra 6.8 min; VMAF 97.3 contra el de siempre, sin ninguna escena por debajo de 93, y la mezcla igual a 0.01 dB.
 * HTML-in-canvas es experimental en Chromium (se enciende con una bandera): si el Edge no lo trae, avisa y sale.
 *
 * Un tramo a medias se escribe con otro nombre y se renombra al terminar; si falla, se reintenta una vez. Si el primer
 * Edge no abre (no hay Edge, no trae HTML-in-canvas o la página del episodio truena), lo dice y sale con 2, sin empezar.
 */
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { abrirEdge, pagina, procesos, servir } from "./web.mjs";

const RAIZ = resolve(".");
const { bitrate = 20_000_000, tramos } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const PROCESOS = procesos(tramos.length);

// El episodio, empaquetado en memoria con el esbuild del proyecto: renderizar() hace un tramo y lo sube al servidor.
const ENTRADA = `
import { renderMediaOnWeb } from "@remotion/web-renderer";
import { AbsoluteFill, Img } from "remotion";
import { ALTO, ANCHO, DURACION, FPS, Video } from "./src/Video";
const Portada = () => <AbsoluteFill><Img src="/portada.png" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>;
window.renderizar = async ({ desde, hasta, bitrate, a, tipo }) => {
  const t0 = performance.now();
  const portada = tipo === "portada";
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "ElDiff", component: portada ? Portada : Video, durationInFrames: portada ? 1 : DURACION, fps: FPS, width: ANCHO, height: ALTO },
    inputProps: {},
    frameRange: portada ? [0, 0] : [desde, hasta],
    container: "mov",
    videoCodec: "h264",
    audioCodec: "pcm-s16",
    hardwareAcceleration: "prefer-hardware",
    videoBitrate: bitrate,
    allowHtmlInCanvas: true,
    pageResponsiveness: "disabled",
    logLevel: "error",
  });
  const r = await fetch("/subir?a=" + encodeURIComponent(a), { method: "POST", body: await getBlob() });
  if (!r.ok) throw new Error("no se pudo guardar " + a + ": " + r.status);
  return Math.round(performance.now() - t0);
};
`;

// Sirve la página, el paquete y public/, y recibe los tramos en out/.
let servidor, primero;
try {
  const rutas = pagina(RAIZ, ENTRADA);
  if (existsSync(join(RAIZ, "portada.png"))) rutas["/portada.png"] = readFileSync(join(RAIZ, "portada.png"));
  servidor = await servir({ raiz: join(RAIZ, "public"), rutas, salida: join(RAIZ, "out") });
  primero = await abrirEdge(servidor.url);
} catch (e) {
  servidor?.cerrar();
  console.error(e.message);
  process.exit(2);
}
const abrir = () => abrirEdge(servidor.url);

const parcial = (f) => f.replace(/(\.\w+)$/, ".parcial$1");
const cola = [...tramos].sort((x, y) => y.hasta - y.desde - (x.hasta - x.desde));
const fallas = [];
try {
  await Promise.all(Array.from({ length: PROCESOS }, async (_, i) => {
    let c = i ? await abrir() : primero;
    try {
      for (let t; (t = cola.shift());) {
        const cuadros = t.hasta - t.desde + 1;
        // El tope: 60 s más 5 cuadros por segundo, muy por debajo de lo normal (unos 30 por Edge con 4 a la vez).
        const tope = 60_000 + cuadros * 200;
        for (let intento = 1; ; intento++) {
          try {
            const pedido = JSON.stringify({ desde: t.desde, hasta: t.hasta, bitrate, a: parcial(t.salida), tipo: t.tipo });
            const trabajo = c.evaluar(`window.renderizar(${pedido})`);
            trabajo.catch(() => {}); // si gana el tope, su error llega después, al cerrar ese Edge
            const ms = await Promise.race([trabajo,
              new Promise((_, mal) => setTimeout(() => mal(new Error(`pasó de ${tope / 1000} s`)), tope).unref())]);
            renameSync(parcial(t.salida), t.salida);
            console.log(`${t.nombre}: ${cuadros} cuadros en ${(ms / 1000).toFixed(0)} s`);
            break;
          } catch (e) {
            rmSync(parcial(t.salida), { force: true });
            console.error(`${t.nombre}: falló (intento ${intento}): ${String(e.message).split("\n")[0]}`);
            // Otro Edge para el reintento: el que falló puede haber quedado a medias.
            await c.cerrar().catch(() => {});
            c = await abrir();
            if (intento === 2) {
              fallas.push(t.nombre);
              break;
            }
          }
        }
      }
    } finally {
      await c.cerrar();
    }
  }));
} finally {
  servidor.cerrar();
}
if (fallas.length) {
  console.error(`No salieron: ${fallas.join(", ")}`);
  process.exit(1);
}
