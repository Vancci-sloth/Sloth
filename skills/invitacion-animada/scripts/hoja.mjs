// Hoja de contactos: varios instantes de la línea de tiempo en una sola imagen, con su instante debajo.
// Uso: node herramientas/hoja.mjs <invitacion> [t1 t2 …]
//   Sin tiempos, toma 12 instantes clave (el toque, la magia, el destello, el título, el final).
//   ANTES=historial/index-v1.html   compara: arriba la versión de antes, abajo la de ahora → antes-despues.jpg
//   CAM=side, HIDE=…                como en capturas.mjs
//   COLS=6                          columnas (sin ANTES)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TALLER, abrir, instantesClave, ir, uso } from "./navegador.mjs";

const [ruta, ...args] = process.argv.slice(2);
if (!ruta) uso("Uso: node herramientas/hoja.mjs <invitacion> [t1 t2 …]   (ANTES=historial/index-v1.html para comparar)");
const { CAM = "", HIDE = "", ANTES } = process.env;
const carpeta = ruta.split("/")[0];
const salida = join(TALLER, carpeta, "capturas");
mkdirSync(salida, { recursive: true });
const query = new URLSearchParams({ t: "0", ...(CAM && { cam: CAM }), ...(HIDE && { hide: HIDE }) }).toString();

const { browser, page } = await abrir(ruta, { query });
const tiempos = args.length ? args.map(Number) : await instantesClave(page, ANTES ? 8 : 12);
async function tomar() {
  await page.waitForTimeout(700);
  const fotos = [];
  for (const t of tiempos) {
    await page.evaluate((t) => window.__setT(t), t);
    fotos.push((await page.screenshot({ type: "jpeg", quality: 90 })).toString("base64"));
  }
  return fotos;
}
const filas = [{ nombre: ANTES ? "ahora" : "", fotos: await tomar() }];
if (ANTES) {
  const rutaAntes = existsSync(join(TALLER, carpeta, ANTES)) ? `${carpeta}/${ANTES}` : ANTES;
  await ir(page, rutaAntes, query);
  filas.unshift({ nombre: "antes", fotos: await tomar() });
}

// La hoja se arma en el mismo navegador: una cuadrícula de imágenes y una captura de página completa.
const cols = ANTES ? tiempos.length : Number(process.env.COLS ?? Math.min(6, tiempos.length));
const ancho = ANTES ? Math.min(270, Math.floor(1900 / tiempos.length)) : 270;
const celdas = filas.flatMap((f) => f.fotos.map((b64, i) => `<figure>${i === 0 && f.nombre ? `<b>${f.nombre}</b>` : ""}<img src="data:image/jpeg;base64,${b64}"><figcaption>t=${tiempos[i]}</figcaption></figure>`));
await page.setViewportSize({ width: cols * (ancho + 8) + 8, height: 400 });
await page.setContent(`<style>body{margin:0;background:#111;padding:4px;display:grid;grid-template-columns:repeat(${cols},${ancho}px);gap:8px 8px;font:13px system-ui;color:#ddd}
figure{margin:0;position:relative}img{width:${ancho}px;display:block;border-radius:4px}figcaption{text-align:center;padding:3px 0}
b{position:absolute;left:6px;top:6px;padding:2px 8px;border-radius:6px;background:#000a;color:#fff;font-size:14px}</style>${celdas.join("")}`);
const archivo = join(salida, ANTES ? "antes-despues.jpg" : "hoja.jpg");
writeFileSync(archivo, await page.screenshot({ type: "jpeg", quality: 88, fullPage: true }));
console.log(archivo);
await browser.close();
