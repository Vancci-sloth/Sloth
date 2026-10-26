// Guarda como PNG los lienzos pintados a mano (window.__lienzos), para revisarlos sin el resto de la escena.
// Uso: node herramientas/lienzos.mjs <invitacion> [carpeta]   (por defecto <invitacion>/capturas/lienzos)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TALLER, abrir, uso } from "./navegador.mjs";

const [ruta, carpetaArg] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/lienzos.mjs <invitacion> [carpeta]");
const carpeta = carpetaArg ?? join(TALLER, ruta.split("/")[0], "capturas", "lienzos");
mkdirSync(carpeta, { recursive: true });
// con ?t= los lienzos no se liberan después de subirlos a la GPU
const { browser, page } = await abrir(ruta, { query: "t=0" });
const nombres = await page.evaluate(() => Object.keys(window.__lienzos ?? {}));
if (!nombres.length) console.log("No hay lienzos en window.__lienzos (regístralos con lienzos.<nombre> = canvas).");
for (const k of nombres) {
  const url = await page.evaluate((k) => window.__lienzos[k].toDataURL("image/png"), k);
  writeFileSync(join(carpeta, `${k}.png`), Buffer.from(url.split(",")[1], "base64"));
  console.log(join(carpeta, `${k}.png`));
}
await browser.close();
