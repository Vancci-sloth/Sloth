// El render según esta computadora, y lo que tarda aquí, para Opciones → Tu equipo de Sloth (server/equipo.ts) y para
// decir cuánto falta. Lo medido va en `equipo.json`, junto a los modelos (%APPDATA%/youtube), el mismo archivo donde la
// voz apunta lo suyo (python/procesos/medidas.py de Sloth):
//
//   const equipo = require(path.join(process.env.SLOTH_SKILLS || path.join(os.homedir(), ".claude", "skills"), "video-base", "scripts", "equipo.cjs"));
//   await equipo.tarjeta3D(navegador, desde)  // con qué dibuja el 3D el Chrome de Remotion; avisa si es por software
//   equipo.estimado(cuadros)             // «unos 12 min» para tantos cuadros a tamaño completo, si ya se midió
//   equipo.anotarRender(cuadros, segundos)   // solo el render final, a tamaño completo
//   equipo.falta(parte, desde)           // «unos 4 min», de lo que lleva (0 a 1) desde `desde` (Date.now())
//
// Los cuadros por segundo se promedian con los de antes: un render con la máquina ocupada no lo mueve todo.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APPDATA = process.env.APPDATA || (process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".config"));
const EQUIPO = path.join(APPDATA, "youtube", "equipo.json");

const tiempo = (s) => (s < 90 ? `unos ${Math.max(5, Math.round(s / 5) * 5)} s` : `unos ${Math.round(s / 60)} min`);

function leer() {
  try {
    return JSON.parse(fs.readFileSync(EQUIPO, "utf8"));
  } catch {
    return {};
  }
}

function guardar(cambio) {
  try {
    const d = leer();
    d.render = { ...d.render, ...cambio };
    fs.mkdirSync(path.dirname(EQUIPO), { recursive: true });
    const temporal = `${EQUIPO}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(d, null, 1));
    fs.renameSync(temporal, EQUIPO);
  } catch {}
}

function anotarRender(cuadros, segundos) {
  if (cuadros < 60 || segundos <= 0) return;
  const antes = leer().render?.final?.cuadros;
  const ahora = cuadros / segundos;
  guardar({ final: { cuadros: Math.round((antes ? (antes + ahora) / 2 : ahora) * 100) / 100, fecha: new Date().toISOString().slice(0, 10) } });
}

/** «unos 12 min» para `cuadros` del render final, de lo medido aquí; "" si aún no se midió. */
function estimado(cuadros) {
  const medido = leer().render?.final?.cuadros;
  return medido ? tiempo(cuadros / medido) : "";
}

/**
 * Con qué dibuja el 3D el Chrome de Remotion (`navegador`, de openBrowser), del renderizador de WebGL. Si es por software
 * (SwiftShader: una tarjeta que Chrome no puede usar, un escritorio remoto), lo avisa: en el banco del 27 de octubre fue
 * un cuadro por segundo contra 9 con la tarjeta, y un video de 10 min serían horas. Lo apunta para Tu equipo.
 * `desde` es el `createRequire` del proyecto, para usar su @remotion/renderer.
 */
async function tarjeta3D(navegador, desde) {
  try {
    const dist = path.dirname(desde.resolve("@remotion/renderer"));
    // Por su ruta, como prestitcher-memory-usage en render.cjs: no lo exporta.
    const { getPageAndCleanupFn } = desde(path.join(dist, "get-browser-instance.js"));
    const { puppeteerEvaluateWithCatch } = desde(path.join(dist, "puppeteer-evaluate.js"));
    const { page, cleanupPage } = await getPageAndCleanupFn({
      passedInInstance: navegador, browserExecutable: null, chromiumOptions: {}, forceDeviceScaleFactor: undefined, indent: false,
      logLevel: "error", onBrowserDownload: () => ({ version: null, onProgress: () => {} }), chromeMode: "headless-shell",
      pageIndex: 0, onBrowserLog: null, onLog: () => {},
    });
    const { value } = await puppeteerEvaluateWithCatch({
      pageFunction: () => {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return "";
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      },
      frame: null, args: [], page, timeoutInMilliseconds: 20000,
    });
    await cleanupPage();
    const software = !value || /swiftshader|llvmpipe|software/i.test(value);
    guardar({ tarjeta: { nombre: value || "sin WebGL", software, fecha: new Date().toISOString().slice(0, 10) } });
    if (software)
      console.log("⚠ El 3D se está dibujando sin la tarjeta de video (por software): este render va a ir muy lento. " +
        "Dile al usuario cuánto falta (lo de abajo) y que, si su computadora tiene tarjeta, actualice su controlador.");
    return { nombre: value, software };
  } catch {
    return null;
  }
}

const falta = (parte, desde) => tiempo(((Date.now() - desde) / 1000) * ((1 - parte) / Math.max(parte, 0.01)));

module.exports = { anotarRender, estimado, falta, tarjeta3D, tiempo };
