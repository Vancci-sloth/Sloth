// Renderiza una imagen de cada beat (en la fracción indicada) para revisarlos sin ver el video entero:
//
//     node revisar.mjs 0.95 [b05,b31]
//
// Es un atajo: lo hace <skill>/scripts/revisar.mjs, con el renderizador web del render final.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// La carpeta de la skill: la pone nuevo.py al crear el episodio. VIDEO_EL_DIFF gana, y ~/.claude/skills queda de respaldo.
const SKILL = null;
const carpetas = [process.env.VIDEO_EL_DIFF, SKILL, join(homedir(), ".claude", "skills", "video-el-diff")].filter(Boolean);
const script = carpetas.map((c) => join(c, "scripts", "revisar.mjs")).find(existsSync);
if (!script) {
  console.error(`No encontré la skill video-el-diff en ${carpetas.join(", ")}: pon su carpeta en la variable VIDEO_EL_DIFF.`);
  process.exit(2);
}
await import(pathToFileURL(script).href);
