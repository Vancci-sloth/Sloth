// Cuánto cuesta cada cuadro en la GPU de esta PC, sin el tope de 60 fps, en los momentos clave.
// Uso: node herramientas/medir.mjs <invitacion> [ancho alto dpr]   (por defecto 405 720 2: un teléfono típico)
//   SW=1      GPU por software (SwiftShader): se porta como un teléfono modesto
//   PIEZAS=1  además, cuánto ahorra apagar cada pieza de window.__parts (la más cara, primero)
//   N=120     cuadros por medición
import { ALTO, ANCHO, abrir, instantesClave, uso } from "./navegador.mjs";

const [ruta, W = String(ANCHO), H = String(ALTO), DPR = "2"] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/medir.mjs <invitacion> [ancho alto dpr]   (SW=1, PIEZAS=1)");
const { browser, page } = await abrir(ruta, { query: "t=0", ancho: +W, alto: +H, dpr: +DPR, extra: ["--disable-gpu-vsync", "--disable-frame-rate-limit"] });
if (!(await page.evaluate(() => typeof window.__bench === "function"))) {
  console.log("Esta invitación no tiene window.__bench: cópialo de la plantilla (sección «ganchos para las herramientas»).");
  await browser.close(); process.exit(1);
}
await page.waitForTimeout(800);
const N = Number(process.env.N ?? 120);
const run = (t) => page.evaluate(([t, n]) => window.__bench(t, n), [t, N]);
console.log("lienzo", await page.evaluate(() => { const c = document.querySelector("canvas"); return `${c.width}×${c.height}`; }), process.env.SW ? "(SwiftShader)" : "");
const tiempos = (await instantesClave(page, 12)).filter((_, i) => [0, 2, 4, 5, 7, 11].includes(i));
let peor = 0;
for (const t of tiempos) {
  const r = await run(t);
  const info = await page.evaluate((t) => window.__info?.(t) ?? null, t);
  peor = Math.max(peor, r.frame);
  console.log(`t=${t}`.padEnd(8), `cuadro ${r.frame.toFixed(2)} ms`.padEnd(18), `update ${r.update.toFixed(2)} ms`.padEnd(18),
    info ? `${info.calls} llamadas de dibujo, ${(info.triangles / 1000).toFixed(0)}k triángulos` : "");
}
console.log(`peor: ${peor.toFixed(2)} ms por cuadro`);

if (process.env.PIEZAS) {
  const t = tiempos[tiempos.length - 2];
  const base = (await run(t)).frame;
  const claves = await page.evaluate(() => Object.keys(window.__parts ?? {}));
  const filas = [];
  for (const k of claves) {
    const alternar = (k, on) => { for (const o of [].concat(window.__parts[k])) { if (o.isObject3D) o.visible = on; else if ("enabled" in o) o.enabled = on; } };
    await page.evaluate(`(${alternar})(${JSON.stringify(k)}, false)`);
    filas.push([k, base - (await run(t)).frame]);
    await page.evaluate(`(${alternar})(${JSON.stringify(k)}, true)`);
  }
  console.log(`--- t=${t}: ${base.toFixed(2)} ms con todo. Lo que ahorra apagar cada pieza:`);
  for (const [k, ahorro] of filas.sort((a, b) => b[1] - a[1])) console.log(`  ${k}`.padEnd(20), `${ahorro.toFixed(2)} ms`);
}
await browser.close();
