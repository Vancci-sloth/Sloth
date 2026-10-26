/**
 * Una imagen de cada beat (en la fracción indicada) para revisarlos sin ver el video entero. Se corre en la raíz del
 * episodio, por el atajo de la plantilla (`node revisar.mjs 0.95 [b05,b31]`), y deja revision/<beat>_<NN>.jpg a la
 * mitad del tamaño del video (540x960 en vertical), lo que juntan hojas.py y el editor de Sloth.
 *
 * Cada cuadro lo dibuja el mismo renderizador web que el render final (render_web.mjs), en un solo Edge que recorre los
 * beats en una página: 112 cuadros en unos 10 s. Con renderStill de Remotion eran 130 s (una pestaña por cuadro, que
 * volvía a abrir el clip del tema), y en las tarjetas con dos clips del mismo video salía otro momento que el del final.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { abrirEdge, pagina, servir } from "./web.mjs";

const RAIZ = resolve(".");
const fraccion = Number(process.argv[2] ?? 0.6);
const solo = process.argv[3] ? process.argv[3].split(",") : null;
let linea;
try {
  linea = JSON.parse(readFileSync(join(RAIZ, "src", "timeline.json"), "utf8"));
} catch (e) {
  console.error(`No pude leer src/timeline.json (vuelve a correr la línea del paso 4): ${e.message}`);
  process.exit(2);
}
const SALIDA = join(RAIZ, "revision");

const ENTRADA = `
import { renderStillOnWeb } from "@remotion/web-renderer";
import { ALTO, ANCHO, DURACION, FPS, Video } from "./src/Video";
const composition = { id: "ElDiff", component: Video, durationInFrames: DURACION, fps: FPS, width: ANCHO, height: ALTO };
window.cuadro = async ({ frame, a }) => {
  const r = await renderStillOnWeb({ composition, frame, inputProps: {}, scale: 0.5, allowHtmlInCanvas: true, logLevel: "error" });
  const q = await fetch("/subir?a=" + encodeURIComponent(a), { method: "POST", body: await r.blob({ format: "jpeg", quality: 0.8 }) });
  if (!q.ok) throw new Error("no se pudo guardar " + a + ": " + q.status);
};
`;

let servidor, c;
try {
  servidor = await servir({ raiz: join(RAIZ, "public"), rutas: pagina(RAIZ, ENTRADA), salida: SALIDA });
  c = await abrirEdge(servidor.url);
} catch (e) {
  servidor?.cerrar();
  console.error(e.message);
  process.exit(2);
}
const fallas = [];
try {
  for (const b of linea.beats) {
    if (solo && !solo.includes(b.id)) continue;
    const frame = Math.round((b.inicio + (b.fin - b.inicio) * fraccion) * linea.fps);
    try {
      await c.evaluar(`window.cuadro(${JSON.stringify({ frame, a: join(SALIDA, `${b.id}_${Math.round(fraccion * 100)}.jpg`) })})`);
      process.stdout.write(b.id + " ");
    } catch (e) {
      fallas.push(`${b.id}: ${String(e.message).split("\n")[0]}`);
    }
  }
  console.log("listo");
  if (fallas.length) {
    console.error(`No salieron (la escena truena al dibujarse):\n${fallas.join("\n")}`);
    process.exitCode = 1;
  }
} finally {
  await c.cerrar();
  servidor.cerrar();
}
