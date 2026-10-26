// Perfil de CPU de la invitación corriendo (?auto): qué funciones se comen el procesador, la más cara primero.
// Sirve cuando fluidez.mjs va lenta con cpuLento y medir.mjs dice que la GPU va sobrada.
// Uso: node herramientas/perfil.mjs <invitacion> [cpuLento]   (por defecto 4)
import { abrir, uso } from "./navegador.mjs";

const [ruta, lento = "4"] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/perfil.mjs <invitacion> [cpuLento]");
const { browser, page } = await abrir(ruta, { query: "auto&fixed", dpr: 2 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(lento) });
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
await page.waitForTimeout(6000);
const { profile } = await cdp.send("Profiler.stop");
// tiempo propio de cada función
const propio = new Map(), porId = new Map(profile.nodes.map((n) => [n.id, n]));
let total = 0;
profile.samples.forEach((id, i) => {
  const { callFrame: f } = porId.get(id), dt = profile.timeDeltas[i] ?? 0;
  const k = `${f.functionName || "(anónima)"}  ${f.url.split("/").pop()}:${f.lineNumber + 1}`;
  propio.set(k, (propio.get(k) ?? 0) + dt); total += dt;
});
for (const [k, v] of [...propio].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
await browser.close();
