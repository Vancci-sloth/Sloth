// Graba la invitación cuadro a cuadro (sin saltos aunque la PC vaya lenta) y la junta en MP4 con ffmpeg.
// Uso: node herramientas/grabar.mjs <invitacion> [segundos] [fps]
//   Sin segundos: la animación completa y 3 s más del ambiente vivo del final.
//   DPR=2 (por defecto) graba a 810×1440. Sale en <invitacion>/<invitacion>.mp4 (SALIDA=<archivo> para otro).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { TALLER, abrir, uso } from "./navegador.mjs";

const [ruta, segArg, fpsArg = "30"] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/grabar.mjs <invitacion> [segundos] [fps]");
if (spawnSync("ffmpeg", ["-version"]).status !== 0) uso("Falta ffmpeg en el PATH (en Windows: winget install Gyan.FFmpeg).");
const carpeta = ruta.split("/")[0];
const { browser, page } = await abrir(ruta, { query: "t=0", dpr: Number(process.env.DPR ?? 2) });
const k = await page.evaluate(() => window.__tiempos ?? null);
const segundos = Number(segArg ?? (k ? k.DURATION + 3 : 9.5)), fps = Number(fpsArg);
await page.evaluate(() => window.__setT(0));
await page.waitForTimeout(1500);

const dir = mkdtempSync(join(tmpdir(), `grabar-${carpeta}-`));
const n = Math.round(segundos * fps), t0 = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__setT(t), i / fps);
  writeFileSync(join(dir, `f${String(i).padStart(5, "0")}.png`), await page.screenshot());
  if (i % fps === 0) process.stdout.write(`\r${(i / fps).toFixed(0)} / ${segundos} s`);
}
await browser.close();
console.log(`\r${n} cuadros en ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const archivo = process.env.SALIDA ?? join(TALLER, carpeta, `${carpeta}.mp4`);
mkdirSync(join(archivo, ".."), { recursive: true });
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "f%05d.png"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", archivo], { stdio: "inherit" });
if (r.status !== 0) { console.log(`ffmpeg falló; los cuadros siguen en ${dir}`); process.exit(1); }
rmSync(dir, { recursive: true, force: true });
console.log(archivo);
