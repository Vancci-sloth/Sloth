// Arma la vista en vivo (vivo/vivo.js): el video reproducido en el navegador, sin renderizar, para el editor de Sloth.
// Córrelo después de `python guion.py` o de cambiar algo en src/. Tarda un segundo. El Player de Remotion ya viene con
// @remotion/cli, así que también sirve en los episodios viejos.
import { build } from "esbuild";

await build({
  entryPoints: ["vivo/vivo.tsx"],
  outfile: "vivo/vivo.js",
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
console.log("vista en vivo: vivo/vivo.js");
