// Saca la vista de cada modelo con un solo empaquetado y con la tarjeta de video (ANGLE): la foto (vista.webp) y el
// vaivén de la cámara (vista.webm, que VyMotion reproduce al pasar el ratón) y la vuelta entera (vuelta.webm, que se recorre
// arrastrando sobre la ficha), las tres con fondo transparente. Lo copia al
// proyecto y lo corre `modelos.py vista`, desde la carpeta del proyecto, para usar su node_modules:
//
//   node out/_vitrina.mjs <carpeta de modelos de la biblioteca> <id>:<cuadro> [<id>:<cuadro>…]
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// Empaqueta en una carpeta de %TEMP% que se borra al terminar (video-base): la de `bundle()` se quedaba con una copia de public/.
const { empaquetar } = createRequire(import.meta.url)(join(process.env.SLOTH_SKILLS || join(homedir(), ".claude", "skills"), "video-base", "scripts", "remotion.cjs"));

const [destino, ...pares] = process.argv.slice(2);
const revision = pares[0] === "--revision";
if (revision) pares.shift();
const { serveUrl, soltar } = await empaquetar(process.cwd(), { entryPoint: resolve("src/modelos/_vitrina.tsx") });
const chromiumOptions = { gl: "angle" };
for (const par of pares) {
  const [id, cuadro] = par.split(":");
  const inputProps = { id, cuadro: Number(cuadro) };
  const carpeta = join(destino, id);
  if (revision) {
    mkdirSync(carpeta, { recursive: true });
    const props = { ...inputProps, vuelta: true };
    const composition = await selectComposition({ serveUrl, id: `${id}--vuelta`, inputProps: props, chromiumOptions });
    // La primera vuelta de vitrina.tsx empieza a 28° y avanza 10° por cuadro, a la altura del modelo.
    for (const [nombre, frame] of [["frente", 33], ["tres-cuartos", 2], ["perfil", 6]]) {
      const output = join(carpeta, nombre + ".png");
      await renderStill({ serveUrl, composition, inputProps: props, frame, output, imageFormat: "png", overwrite: true, chromiumOptions });
      console.log(output);
    }
    continue;
  }
  const composition = await selectComposition({ serveUrl, id, inputProps, chromiumOptions });
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
  // La vuelta, a tamaño entero (en la ficha se puede acercar) y con un cuadro clave cada 6: saltar a un ángulo cualquiera
  // decodifica 5 cuadros como mucho, no los 144 (36 por vuelta, a cuatro alturas).
  const vuelta = await selectComposition({ serveUrl, id: `${id}--vuelta`, inputProps, chromiumOptions });
  await renderMedia({
    serveUrl,
    composition: vuelta,
    inputProps: { ...inputProps, vuelta: true },
    codec: "vp9",
    imageFormat: "png",
    pixelFormat: "yuva420p",
    crf: 44,
    outputLocation: join(carpeta, "vuelta.webm"),
    overwrite: true,
    chromiumOptions,
    ffmpegOverride: ({ args }) => [...args.slice(0, -1), "-g", "6", args[args.length - 1]],
  });
  console.log(carpeta);
}
soltar();
