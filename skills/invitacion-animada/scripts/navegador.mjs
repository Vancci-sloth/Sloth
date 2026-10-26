// Lo que comparten las herramientas: encontrar Chromium, abrir una invitación del taller en un "teléfono"
// de 405×720 y medir el brillo de una captura. Las herramientas viven en <taller>/herramientas.
// ANCHO y ALTO cambian el tamaño de la ventana para todas (p. ej. 720×405 para una pieza horizontal).
import { chromium } from "playwright-core";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TALLER = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const leerPuerto = () => { try { return readFileSync(join(TALLER, ".puerto"), "utf8").trim(); } catch { return "5199"; } };
export const BASE = process.env.BASE ?? `http://localhost:${process.env.PORT ?? leerPuerto()}`;

// Chromium de Playwright (el más nuevo); si no hay, Edge en Windows o Chrome en lo demás. CHROME_PATH manda.
export function buscarChrome() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH };
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "ms-playwright"),
    join(homedir(), "Library/Caches/ms-playwright"), join(homedir(), ".cache/ms-playwright")].filter(Boolean);
  const rutas = ["chrome-win64/chrome.exe", "chrome-win/chrome.exe", "chrome-linux64/chrome", "chrome-linux/chrome",
    "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"];
  for (const base of bases) {
    if (!existsSync(base)) continue;
    const builds = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => b.split("-")[1] - a.split("-")[1]);
    for (const b of builds) for (const r of rutas) if (existsSync(join(base, b, r))) return { executablePath: join(base, b, r) };
  }
  return { channel: process.platform === "win32" ? "msedge" : "chrome" };
}

// GPU de verdad. Con SW=1, GPU por software (SwiftShader): se porta como un teléfono modesto.
export const argsGPU = (sw = !!process.env.SW) => sw
  ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
  : [...(process.platform === "win32" ? ["--use-angle=d3d11"] : []), "--enable-gpu", "--ignore-gpu-blocklist"];

export const lanzar = ({ sw, extra = [] } = {}) => chromium.launch({ ...buscarChrome(), args: [...argsGPU(sw), ...extra] });

// Que el servidor que responde sea el de este taller y no otro que ocupó el puerto.
async function comprobarTaller() {
  const mismo = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
  let info = null;
  try { info = await (await fetch(`${BASE}/__taller`)).json(); } catch {}
  if (!info?.raiz) throw new Error(`Nadie responde como taller en ${BASE}. Arráncalo: node server.mjs (en ${TALLER})`);
  if (!mismo(info.raiz, TALLER)) throw new Error(`${BASE} es otro taller (${info.raiz}). Arranca el de ${TALLER}: node server.mjs`);
}

export const urlDe = (ruta, query = "") =>
  `${BASE}/${ruta.replace(/^\/+/, "")}${/\.html?$/.test(ruta) || ruta.endsWith("/") ? "" : "/"}${query ? "?" + query : ""}`;

// ruta: la carpeta de la invitación ("carroza") o un archivo ("carroza/historial/index-v1.html").
export async function ir(page, ruta, query = "") {
  await page.goto(urlDe(ruta, query), { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.__setT === "function", null, { timeout: 120000 });
}

export const ANCHO = Number(process.env.ANCHO ?? 405), ALTO = Number(process.env.ALTO ?? 720);

export async function abrir(ruta, { query = "", ancho = ANCHO, alto = ALTO, dpr = 1, sw, extra, antes } = {}) {
  if (!process.env.BASE) await comprobarTaller();
  const browser = await lanzar({ sw, extra });
  const page = await browser.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: dpr });
  page.on("pageerror", (e) => console.log("[error en la página]", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("[consola]", m.text()); });
  if (antes) await antes(page);
  await ir(page, ruta, query);
  return { browser, page };
}

// Instantes que vale la pena mirar. La plantilla publica window.__tiempos = { TAP, FLASH, DURATION };
// con solo DURATION se reparten parejo hasta un segundo después del final, y sin nada, en 9.5 s.
export async function instantesClave(page, n = 12) {
  const k = await page.evaluate(() => window.__tiempos ?? null);
  const parejo = (fin) => Array.from({ length: n }, (_, i) => +((i * fin) / (n - 1)).toFixed(2));
  if (!k?.DURATION) return parejo(9.5);
  if (k.TAP === undefined || k.FLASH === undefined) return parejo(k.DURATION + 1);
  const { TAP, FLASH, DURATION } = k;
  return [0.6, TAP + 0.3, (TAP + FLASH) / 2, FLASH - 0.3, FLASH - 0.05, FLASH + 0.1, FLASH + 0.4, FLASH + 0.9,
    FLASH + 1.6, (FLASH + 1.6 + DURATION) / 2, DURATION, DURATION + 2].slice(0, n).map((t) => +t.toFixed(2));
}

// Brillo de una captura (0–1): la media, y qué parte está quemada (casi blanca).
// Sirve para cuidar que el destello no ciegue y que el texto se lea.
export async function brillo(page, png) {
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(img.width, img.height).getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let s = 0, q = 0;
    for (let i = 0; i < d.length; i += 4) { const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; s += y; if (y > 0.96) q++; }
    return { media: s / (d.length / 4), quemado: q / (d.length / 4) };
  }, png.toString("base64"));
}
export const textoBrillo = (b) => `brillo ${b.media.toFixed(3)}  quemado ${(b.quemado * 100).toFixed(2)}%`;

// Para avisar con claridad cuando falta un argumento.
export function uso(texto) { console.log(texto.trim()); process.exit(1); }
