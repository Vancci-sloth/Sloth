// Saca la vista de cada modelo con un solo empaquetado y con la tarjeta de video (ANGLE): la foto (vista.webp) y el
// vaivén de la cámara (vista.webm, que Sloth reproduce al pasar el ratón), las dos con fondo transparente. Lo copia al
// proyecto y lo corre `modelos.py vista`, desde la carpeta del proyecto, para usar su node_modules:
//
//   node out/_vitrina.mjs <carpeta de modelos de la biblioteca> <id>:<cuadro> [<id>:<cuadro>…]
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Empaqueta en una carpeta de %TEMP% que se borra al terminar (video-base): la de `bundle()` se quedaba con una copia de public/.
const { empaquetar } = createRequire(import.meta.url)(join(process.env.SLOTH_SKILLS || join(homedir(), ".claude", "skills"), "video-base", "scripts", "remotion.cjs"));

const [destino, ...pares] = process.argv.slice(2);
const { serveUrl, soltar } = await empaquetar(process.cwd(), { entryPoint: resolve("src/modelos/_vitrina.tsx") });
const chromiumOptions = { gl: "angle" };
for (const par of pares) {
  const [id, cuadro] = par.split(":");
  const inputProps = { id, cuadro: Number(cuadro) };
  const composition = await selectComposition({ serveUrl, id, inputProps, chromiumOptions });
  const carpeta = join(destino, id);
  rmSync(join(carpeta, "vista.jpg"), { force: true }); // la de antes, con fondo
  await renderStill({ serveUrl, composition, inputProps, frame: 0, output: join(carpeta, "vista.webp"), imageFormat: "webp", overwrite: true, chromiumOptions });
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "vp9",
    imageFormat: "png",
    pixelFormat: "yuva420p",
    crf: 34,
    scale: 0.75,
    outputLocation: join(carpeta, "vista.webm"),
    overwrite: true,
    chromiumOptions,
  });
  console.log(carpeta);
}
soltar();
