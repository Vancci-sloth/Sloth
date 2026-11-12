// Arma el visor 3D de toda la biblioteca (visor.tsx) con esbuild: un trozo por modelo y lo común (React, three,
// Remotion) una sola vez, en <biblioteca>/visor, con su index.html, los archivos de cada modelo en public/ y lista.json
// con los que trae. Lo corre `modelos.py visor` desde un proyecto de prueba que ya tiene todos los modelos (`usar`) y el
// node_modules de los videos:
//
//   node out/_visor.mjs <carpeta del visor> <id>:<cuadro> [<id>:<cuadro>…]
//
// Se arma en una carpeta aparte, propia de este proceso, y luego reemplaza a la anterior: Sloth nunca sirve un visor a
// medias, y dos armados a la vez (un lote de vistas, o una vista y Sloth) no se pisan: queda el último.
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const [destino, ...pares] = process.argv.slice(2);
const modelos = pares.map((p) => {
  const [id, cuadro] = p.split(":");
  return { id, cuadro: Number(cuadro) || 0 };
});
const src = resolve("src/modelos");
writeFileSync(
  join(src, "_visor_lista.ts"),
  [
    "// Lo arma scripts/visor.mjs: cada modelo, su módulo (cargado al pedirlo) y el cuadro de su foto.",
    "export const MODELOS: Record<string, { carga: () => Promise<Record<string, unknown>>; cuadro: number }> = {",
    ...modelos.map(({ id, cuadro }) => `  ${JSON.stringify(id)}: { carga: () => import(${JSON.stringify(`./${id}`)}), cuadro: ${cuadro} },`),
    "};",
    "",
  ].join("\n"),
);

const nuevo = `${destino}.nuevo-${process.pid}`;
rmSync(nuevo, { recursive: true, force: true });
mkdirSync(nuevo, { recursive: true });
// Si algo falla, no queda la carpeta a medias.
process.on("exit", (codigo) => codigo && rmSync(nuevo, { recursive: true, force: true }));
await build({
  entryPoints: [join(src, "_visor.tsx")],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: join(nuevo, "js"),
  entryNames: "visor",
  chunkNames: "[name]-[hash]",
  jsx: "automatic",
  minify: true,
  target: "es2022",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
writeFileSync(
  join(nuevo, "index.html"),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visor</title>
<style>html, body, #raiz { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; } canvas { touch-action: none; }</style>
<script>window.remotion_staticBase = location.pathname.replace(/\\/[^/]*$/, "") + "/public";</script>
<script type="module" src="js/visor.js"></script>
</head>
<body><div id="raiz"></div></body>
</html>
`,
);
// Los archivos de los modelos (texturas, .glb, SVG) y sus íconos, donde los busca staticFile.
for (const d of ["modelos", "iconos"]) if (existsSync(join("public", d))) cpSync(join("public", d), join(nuevo, "public", d), { recursive: true });
writeFileSync(join(nuevo, "lista.json"), JSON.stringify({ ids: modelos.map((m) => m.id) }));

mkdirSync(dirname(destino), { recursive: true });
// El de antes se aparta y se borra después; si otro armado puso el suyo en medio, se vuelve a intentar.
for (let intento = 0; ; intento++) {
  const viejo = `${destino}.viejo-${process.pid}-${intento}`;
  try {
    if (existsSync(destino)) renameSync(destino, viejo);
    renameSync(nuevo, destino);
    rmSync(viejo, { recursive: true, force: true });
    break;
  } catch (error) {
    if (intento >= 5) throw error;
    await new Promise((ok) => setTimeout(ok, 200));
  }
}
// Lo que dejaron armados de antes que no acabaron de borrar (un archivo abierto en Windows, un reintento): se quita.
for (const n of readdirSync(dirname(destino))) if (n.startsWith(`${basename(destino)}.viejo-`)) rmSync(join(dirname(destino), n), { recursive: true, force: true });
console.log(`${destino}: ${modelos.length} modelos, ${(JSON.parse(readFileSync(join(destino, "lista.json"), "utf8")).ids.length)} en la lista`);
