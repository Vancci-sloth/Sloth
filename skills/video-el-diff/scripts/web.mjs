/**
 * Lo común de los scripts que abren el episodio en un navegador sin ventana: render_web.mjs (el render), revisar.mjs
 * (un cuadro por beat) y reglas.mjs (la vista en vivo). Un servidor local para sus archivos, el episodio empaquetado con
 * el esbuild del proyecto y el Edge con HTML-in-canvas que dibuja cada cuadro igual que el render final.
 */
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { cpus, homedir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
export const { abrirChrome } = await import(pathToFileURL(join(AQUI, "..", "..", "video-base", "scripts", "chrome.mjs")).href);

/**
 * Cuántos navegadores a la vez para `n` trabajos. Más de 4 casi no gana (el render del episodio de Photon: 72 s con 4,
 * 76 con 3, 81 con 2, 103 con uno) y cada uno ocupa ~1 GB. Con más, pierde: 4500 cuadros de des-to en un Core 5 210H
 * de 12 hilos tardaron 82 y 104 s con 4, 116 y 128 con 6 y 173 con 8 (25 de octubre).
 */
export const procesos = (n) => Math.max(1, Math.min(4, Math.floor(cpus().length / 3), n));

const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4",
  ".webm": "video/webm", ".mov": "video/quicktime", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".otf": "font/otf" };

/**
 * Sirve la carpeta `raiz` (con Range: los clips y la voz se leen por pedazos) y las `rutas` fijas ({ "/app.js": código }).
 * Con `salida`, recibe archivos por POST /subir?a=<ruta>, solo dentro de esa carpeta. Devuelve { url, cerrar() }.
 */
export async function servir({ raiz, rutas = {}, salida }) {
  const dentro = salida && resolve(salida) + sep;
  const servidor = http.createServer((pedido, respuesta) => {
    const url = new URL(pedido.url, "http://x");
    if (dentro && pedido.method === "POST" && url.pathname === "/subir") {
      const destino = resolve(url.searchParams.get("a") ?? "");
      if (!destino.startsWith(dentro)) return respuesta.writeHead(403).end();
      mkdirSync(dirname(destino), { recursive: true });
      const f = createWriteStream(destino);
      pedido.pipe(f);
      f.on("finish", () => respuesta.writeHead(200).end());
      f.on("error", () => respuesta.writeHead(500).end());
      return;
    }
    if (url.pathname in rutas) {
      const tipo = TIPOS[extname(url.pathname)] ?? "text/html";
      return respuesta.writeHead(200, { "Content-Type": tipo + "; charset=utf-8" }).end(rutas[url.pathname]);
    }
    const archivo = resolve(raiz, "." + decodeURIComponent(url.pathname));
    if (!archivo.startsWith(raiz + sep) || !existsSync(archivo) || !statSync(archivo).isFile()) return respuesta.writeHead(404).end();
    const tam = statSync(archivo).size;
    const cabeza = { "Content-Type": TIPOS[extname(archivo).toLowerCase()] ?? "application/octet-stream", "Accept-Ranges": "bytes" };
    const rango = /bytes=(\d*)-(\d*)/.exec(pedido.headers.range ?? "");
    if (rango) {
      const a = rango[1] ? Number(rango[1]) : tam - Number(rango[2]);
      const b = rango[1] && rango[2] ? Math.min(Number(rango[2]), tam - 1) : tam - 1;
      respuesta.writeHead(206, { ...cabeza, "Content-Range": `bytes ${a}-${b}/${tam}`, "Content-Length": b - a + 1 });
      createReadStream(archivo, { start: a, end: b }).pipe(respuesta);
    } else {
      respuesta.writeHead(200, { ...cabeza, "Content-Length": tam });
      if (pedido.method === "HEAD") respuesta.end();
      else createReadStream(archivo).pipe(respuesta);
    }
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${servidor.address().port}/`, cerrar: () => servidor.close() };
}

// Las letras de @remotion/google-fonts (estilo.ts) se bajan al importar, con un delayRender de la página que el render
// no espera: sin esto, el primer cuadro de un Edge salía con la letra de respaldo («EL 1%» en Times, en el episodio de
// Photon). document.fonts.ready no sirve: cada letra entra a document.fonts hasta que termina de bajar.
const ESPERA = `
for (const t0 = Date.now(); window.remotion_delayRenderHandles?.length && Date.now() - t0 < 60000; ) await new Promise((r) => setTimeout(r, 50));
await document.fonts.ready;
window.listo = true;
`;

// Antes del paquete, aparte: si el paquete truena al cargar (un timeline.json o una escena rotos), la página guarda su
// error, y el HTML-in-canvas se mira aunque el paquete no llegue a correr.
const ANTES = `<script>
window.htmlEnCanvas = typeof CanvasRenderingContext2D.prototype.drawElementImage === "function";
window.errores = [];
addEventListener("error", (e) => errores.push(String(e.error?.stack ?? e.message)));
addEventListener("unhandledrejection", (e) => errores.push(String(e.reason?.stack ?? e.reason)));
</script>`;

/**
 * La página del episodio para el Edge: `entrada` (TSX que importa de ./src y deja sus funciones en window) empaquetada
 * con el esbuild del proyecto, con la espera de las letras al final. Devuelve las rutas para servir().
 */
export function pagina(raiz, entrada) {
  const { buildSync } = createRequire(join(raiz, "package.json"))("esbuild");
  const app = buildSync({
    stdin: { contents: entrada + ESPERA, resolveDir: raiz, loader: "tsx" },
    bundle: true,
    format: "esm",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    target: "chrome120",
    write: false,
    logLevel: "error",
  }).outputFiles[0].contents;
  return { "/": `<!doctype html><meta charset="utf-8"><body style="margin:0">${ANTES}<script type="module" src="/app.js"></script>`, "/app.js": app };
}

/** Edge (el que trae HTML-in-canvas) o Chrome, también el instalado solo para el usuario; nunca el headless shell, que no lo tiene. */
function navegador() {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  const hay = [process.env.CHROME, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    join(local, "Microsoft", "Edge", "Application", "msedge.exe"), "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", join(local, "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/opt/microsoft/msedge/msedge", "/opt/google/chrome/chrome"].filter((p) => p && existsSync(p) && !/headless-shell/i.test(p));
  if (!hay.length) throw new Error("No encontré Edge ni Chrome. Instala Microsoft Edge o pon la ruta del navegador en la variable CHROME.");
  return hay[0];
}

/** Un Edge sin ventana con la página de pagina() lista. La tarjeta, si Edge compone con ella; si no, la CPU. */
export async function abrirEdge(url) {
  process.env.CHROME = navegador();
  const c = await abrirChrome({ ancho: 1280, alto: 720, gpu: "si-hay", extra: ["--enable-blink-features=CanvasDrawElement", "--force-device-scale-factor=1"] });
  const cargada = new Promise((r) => c.alEvento("Page.loadEventFired", r));
  await c.enviar("Page.navigate", { url });
  await cargada;
  const falla = async (mensaje) => {
    await c.cerrar();
    throw new Error(mensaje);
  };
  if (!(await c.evaluar("window.htmlEnCanvas === true")))
    await falla("Este Edge no trae HTML-in-canvas (drawElementImage): actualízalo. Hace falta Chromium 149 o más nuevo.");
  for (let i = 0; i < 300 && !(await c.evaluar("window.listo === true || errores.length > 0")); i++) await new Promise((r) => setTimeout(r, 100));
  const [error] = await c.evaluar("errores");
  if (error) await falla(`La página del episodio falló al cargar: ${error.split("\n").slice(0, 3).join(" ")}`);
  if (!(await c.evaluar("window.listo === true"))) await falla("La página del episodio no terminó de cargar en 30 s (las letras o los videos).");
  return c;
}
