// Saca varios cuadros sueltos del video con un solo empaquetado y un solo navegador (`remotion still` empaqueta cada
// vez: ~1 min por cuadro). Para comprobar un arreglo en unos pocos momentos, 8 como mucho. Para ver el video entero
// está el borrador (`final.py --borrador`): cuesta lo mismo que 30 fotos y además mide el ritmo.
//
//   node scripts/fotos.mjs <carpeta> <segundo> [segundo…]     p. ej. node scripts/fotos.mjs out/fotos 9.5 12 20.5
//
// Deja <carpeta>/<segundo>.png. Luego: node ~/.claude/skills/video-base/scripts/hoja.mjs <carpeta> hoja.png
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

// Empaqueta en una carpeta de %TEMP% que se borra al terminar (video-base): la de `bundle()` se quedaba con una copia de public/.
const { empaquetar } = createRequire(import.meta.url)(join(process.env.SLOTH_SKILLS || join(homedir(), ".claude", "skills"), "video-base", "scripts", "remotion.cjs"));

const [carpeta, ...segundos] = process.argv.slice(2);
if (!carpeta || !segundos.length) {
  console.error("Uso: node scripts/fotos.mjs <carpeta> <segundo> [segundo…]");
  process.exit(1);
}
if (segundos.length > 8) {
  console.error(`Son ${segundos.length} momentos: para ver el video entero, python -B <skill>/scripts/final.py --borrador.`);
  process.exit(1);
}
mkdirSync(carpeta, { recursive: true });
const { serveUrl, soltar } = await empaquetar(process.cwd());
// El 3D con la tarjeta de video (ANGLE), no por software: 3.5 veces más rápido y se ve igual.
const chromiumOptions = { gl: "angle" };
const composition = await selectComposition({ serveUrl, id: "Video", chromiumOptions });
for (const s of segundos) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(s) * composition.fps));
  const output = join(carpeta, `${String(s).padStart(5, "0")}.png`);
  await renderStill({ serveUrl, composition, frame, output, scale: 0.5, chromiumOptions });
  console.log(output);
}
soltar();
