// Capturas en instantes fijos de la línea de tiempo, con su brillo.
// Uso: node herramientas/capturas.mjs <invitacion> <t1> [t2 …]
//   CAM=side          vista lateral, para ver que nada atraviese nada
//   HIDE=points,sky   oculta piezas (?hide=), para ver la escena sin ellas
//   DPR=2             más resolución (por defecto 1: 405×720)
//   RECORTE=x,y,w,h   solo esa zona, en px de la ventana (405×720). Con DPR=3 sirve para revisar el detalle
//   SALIDA=<dir>      carpeta (por defecto <invitacion>/capturas)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TALLER, abrir, brillo, textoBrillo, uso } from "./navegador.mjs";

const [ruta, ...tiempos] = process.argv.slice(2);
if (!ruta || !tiempos.length) uso("Uso: node herramientas/capturas.mjs <invitacion> <t1> [t2 …]   (CAM=side, HIDE=…, DPR=2, RECORTE=x,y,w,h)");
const { CAM = "", HIDE = "", DPR = "1", RECORTE } = process.env;
const salida = process.env.SALIDA ?? join(TALLER, ruta.split("/")[0], "capturas");
mkdirSync(salida, { recursive: true });

const query = new URLSearchParams({ t: tiempos[0], ...(CAM && { cam: CAM }), ...(HIDE && { hide: HIDE }) }).toString();
const { browser, page } = await abrir(ruta, { query, dpr: Number(DPR) });
await page.waitForTimeout(700);   // que termine de desvanecerse la pantalla de carga
const clip = RECORTE && (([x, y, width, height]) => ({ x, y, width, height }))(RECORTE.split(",").map(Number));
const sufijo = (CAM ? `-${CAM}` : "") + (HIDE ? `-sin-${HIDE.replaceAll(",", "-")}` : "") + (clip ? `-recorte` : "");
for (const t of tiempos) {
  await page.evaluate((t) => window.__setT(t), Number(t));
  const png = await page.screenshot({ clip });
  const archivo = join(salida, `t${t}${sufijo}.png`);
  writeFileSync(archivo, png);
  console.log(`t=${t}`.padEnd(8), textoBrillo(await brillo(page, png)), " ", archivo);
}
await browser.close();
