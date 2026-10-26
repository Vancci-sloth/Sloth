// Evalúa una expresión dentro de la invitación e imprime el resultado (y los errores de la página, si hay).
// Uso: node herramientas/consola.mjs <invitacion> "<expresión>" [query]
//   Ejemplos: "__info(3)"  ·  "__programs().length"  ·  "__quality()"  ·  "__tiempos"
import { abrir, uso } from "./navegador.mjs";

const [ruta, expr = "1", query = "t=1"] = process.argv.slice(2);
if (!ruta) uso('Uso: node herramientas/consola.mjs <invitacion> "<expresión>" [query]');
const { browser, page } = await abrir(ruta, { query });
page.on("console", (m) => { if (m.type() !== "error") console.log(`[${m.type()}]`, m.text()); });
console.log(JSON.stringify(await page.evaluate(expr), null, 2));
await browser.close();
