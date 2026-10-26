// La invitación corriendo de verdad (?auto), como la vería un invitado: cuadros por segundo y tirones.
// Uso: node herramientas/fluidez.mjs <invitacion> [cpuLento] [dpr]
//   cpuLento=4 simula el procesador de un teléfono de gama media; 6, uno de gama baja (por defecto 1)
//   SW=1    GPU por software (SwiftShader), además de lo anterior
//   FIJA=1  sin calidad adaptable, para medir la escena tal cual
//   MS      duración de la medición (por defecto la animación + 3 s) · ANCHO, ALTO tamaño de la ventana
import { abrir, uso } from "./navegador.mjs";

const [ruta, lento = "1", dpr = "2"] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/fluidez.mjs <invitacion> [cpuLento] [dpr]   (SW=1, FIJA=1)");
const { browser, page } = await abrir(ruta, {
  query: "auto" + (process.env.FIJA ? "&fixed" : ""), dpr: Number(dpr),
  // el freno de CPU va antes de cargar: así también cuenta la preparación
  antes: async (page) => (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(lento) }),
});
const ms = Number(process.env.MS ?? 0) || ((await page.evaluate(() => window.__tiempos?.DURATION ?? 6.5)) + 3) * 1000;
const r = await page.evaluate((ms) => new Promise((fin) => {
  const d = []; let last = 0; const t0 = performance.now();
  const f = (now) => { if (last) d.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else fin({ d, q: window.__quality?.() ?? null }); };
  requestAnimationFrame(f);
}), ms);
const d = r.d, media = d.reduce((a, b) => a + b, 0) / d.length, orden = [...d].sort((a, b) => a - b);
const p95 = orden[Math.floor(d.length * 0.95)], largos = d.filter((x) => x > 33).length;
console.log(`cpu ×${lento}, dpr ${dpr}${process.env.SW ? ", SwiftShader" : ""}: ${(1000 / media).toFixed(1)} fps de media, p95 ${p95.toFixed(1)} ms,`,
  `cuadros de más de 33 ms: ${largos} de ${d.length}`, r.q ? `· calidad al final ${JSON.stringify(r.q)}` : "");
await browser.close();
