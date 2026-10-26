// Empaquetar un proyecto de Remotion sin llenar el disco. `bundle()` de Remotion deja en %TEMP% una carpeta por llamada
// con una copia de todo `public/` (en Windows copia, no enlaza) y no la borra nunca: en un día de documentales fueron
// 5 de 1.15 GB. Esta la borra al acabar, aunque el proceso termine con un error o con Ctrl+C, y antes barre las que
// dejaron otros procesos que se cortaron (las `remotion-*` de más de 6 horas, como `limpiar_temporales` de espacio.py).
//
//   const { empaquetar } = require(join(homedir(), ".claude", "skills", "video-base", "scripts", "remotion.cjs"))
//   const { serveUrl, soltar } = await empaquetar(raiz, { entryPoint, publicDir })   // soltar() al terminar de renderizar
//
// Usa el @remotion/bundler del proyecto (`raiz`), el mismo que usa su renderer.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const HORAS = 6;
const vivas = new Set();

function borrar(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  } catch {}
  vivas.delete(dir);
}

// Al salir (bien o con error) se borra lo que quedó; con Ctrl+C o al cerrarlo Sloth, también.
process.on("exit", () => [...vivas].forEach(borrar));
for (const senal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(senal, () => {
    [...vivas].forEach(borrar);
    process.exit(130);
  });
}

/** Las carpetas de Remotion en %TEMP% que nadie toca hace más de `horas`: las de procesos que se cortaron. */
function barrerTemporales(horas = HORAS) {
  const limite = Date.now() - horas * 3600_000;
  const tmp = os.tmpdir();
  for (const nombre of fs.readdirSync(tmp)) {
    if (!nombre.startsWith("remotion-") && !nombre.startsWith("ed-rev-")) continue;
    const dir = path.join(tmp, nombre);
    try {
      const st = fs.statSync(dir);
      if (st.isDirectory() && st.mtimeMs < limite) borrar(dir);
    } catch {}
  }
}

/**
 * Empaqueta el proyecto en una carpeta propia de %TEMP% y devuelve `{ serveUrl, soltar }`: `soltar()` la borra (y se
 * borra sola al salir). `opciones` son las de `bundle()`; por defecto entra `src/index.ts` y su `public/`.
 */
async function empaquetar(raiz, opciones = {}) {
  barrerTemporales();
  const { bundle } = createRequire(path.join(raiz, "package.json"))("@remotion/bundler");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "remotion-webpack-bundle-"));
  vivas.add(outDir);
  try {
    const serveUrl = await bundle({
      entryPoint: path.join(raiz, "src", "index.ts"),
      rootDir: raiz,
      publicDir: path.join(raiz, "public"),
      ...opciones,
      outDir,
    });
    return { serveUrl, soltar: () => borrar(outDir) };
  } catch (e) {
    borrar(outDir);
    throw e;
  }
}

module.exports = { empaquetar, barrerTemporales };
