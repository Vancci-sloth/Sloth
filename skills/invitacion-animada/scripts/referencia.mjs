// Graba una invitación de referencia (la de la competencia, un demo) como la vería alguien en su teléfono:
// video, una captura cada medio segundo, el HTML y la lista de videos, imágenes y scripts que carga.
// Uso: node herramientas/referencia.mjs <url> <carpeta> [segundos]
//   TOQUE=x,y   toca ese punto (px de 405×720) a los 2 s, para las que se abren con un toque; TOQUE=centro
//   DE_NUEVO=1  vuelve a capturar una carpeta que ya tiene captura, solo si el dueño pide una nueva
// Solo mira: no llena formularios ni inicia sesión. Cada demo se visita una vez (un sitio ya nos bloqueó la IP),
// y si su sitio responde con error, se detiene sin grabar.
// El video sale de los cuadros que el navegador va pintando (screencast) y lo junta el ffmpeg del sistema,
// sin el ffmpeg propio de Playwright: instalarlo con "playwright install" borraría navegadores de otros proyectos.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { lanzar, uso } from "./navegador.mjs";

const [url, carpetaArg, segs = "12"] = process.argv.slice(2);
if (!url || !carpetaArg) uso("Uso: node herramientas/referencia.mjs <url> <carpeta> [segundos]   (TOQUE=centro o TOQUE=x,y)");
const carpeta = resolve(carpetaArg), cuadrosDir = join(carpeta, "cuadros");
if (existsSync(join(carpeta, "pagina.html")) && !process.env.DE_NUEVO) uso(`Ya está capturado en ${carpeta}: trabaja con esa captura.`);
mkdirSync(cuadrosDir, { recursive: true });
const browser = await lanzar({ extra: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({
  viewport: { width: 405, height: 720 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
const recursos = new Set();
page.on("response", (r) => { if (/\.(mp4|webm|mov|gif|png|jpe?g|webp|svg|json|js|glb|gltf|mp3|m4a)(\?|$)/i.test(r.url())) recursos.add(r.url()); });

// cada cuadro pintado llega con su instante; se guardan para armar el video con sus tiempos reales
const cdp = await ctx.newCDPSession(page), cuadros = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const archivo = `c${String(cuadros.length).padStart(5, "0")}.jpg`;
  writeFileSync(join(cuadrosDir, archivo), Buffer.from(data, "base64"));
  cuadros.push({ archivo, t: metadata.timestamp });
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 810, maxHeight: 1440 });

const respuesta = await page.goto(url, { waitUntil: "domcontentloaded" });
if (respuesta && !respuesta.ok()) {
  await browser.close();
  rmSync(cuadrosDir, { recursive: true, force: true });
  const s = respuesta.status();
  uso(`Su sitio respondió ${s}.` + (s === 403 ? " Seguramente bloqueó esta IP: trabaja con la captura que haya o pide al dueño que grabe la pantalla de su celular con el demo." : ""));
}
const toque = process.env.TOQUE === "centro" ? [202, 360] : process.env.TOQUE?.split(",").map(Number);
for (let i = 0; i < Number(segs) * 2; i++) {
  if (toque && i === 4) await page.touchscreen.tap(toque[0], toque[1]);
  await page.screenshot({ path: join(carpeta, `s${String(i).padStart(3, "0")}-${(i / 2).toFixed(1)}s.png`) });
  await page.waitForTimeout(500);
}
await cdp.send("Page.stopScreencast").catch(() => {});
const fin = Date.now() / 1000;
writeFileSync(join(carpeta, "pagina.html"), await page.content());
writeFileSync(join(carpeta, "recursos.txt"), [...recursos].join("\n"));
await browser.close();

if (cuadros.length && spawnSync("ffmpeg", ["-version"]).status === 0) {
  // lista para el concat de ffmpeg: cada cuadro dura hasta que llegó el siguiente
  const lineas = cuadros.flatMap((c, i) => [`file '${c.archivo}'`, `duration ${Math.max(0.001, (cuadros[i + 1]?.t ?? fin) - c.t).toFixed(4)}`]);
  writeFileSync(join(cuadrosDir, "lista.txt"), [...lineas, `file '${cuadros.at(-1).archivo}'`].join("\n"));
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "lista.txt",
    "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-crf", "20", join(carpeta, "video.mp4")], { cwd: cuadrosDir, stdio: "inherit" });
  if (r.status === 0) rmSync(cuadrosDir, { recursive: true, force: true });
} else console.log("Sin ffmpeg en el PATH: quedan los cuadros sueltos en", cuadrosDir);
console.log(carpeta);
