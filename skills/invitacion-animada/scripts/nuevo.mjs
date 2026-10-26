// Arma una invitación nueva en el taller (C:\dev\invitaciones) y, la primera vez, el taller mismo:
// servidor, herramientas y playwright-core. Nunca sobrescribe una invitación que ya exista.
// Uso: node <skill>/scripts/nuevo.mjs <nombre> [--desde <origen>] [--taller <carpeta>]
//   origen: plantilla (por defecto), un ejemplo de la skill, otra invitación del taller o la ruta de un .html
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcion = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const desde = opcion("--desde") ?? "plantilla";
const taller = resolve(opcion("--taller") ?? (process.platform === "win32" ? "C:\\dev\\invitaciones" : join(homedir(), "dev", "invitaciones")));
const [nombre] = args;
const salir = (msg) => { console.log(msg); process.exit(1); };

if (!nombre || !/^[a-z0-9][a-z0-9-]*$/.test(nombre)) salir("Uso: nuevo.mjs <nombre> [--desde <origen>] [--taller <carpeta>]\nEl nombre va en minúsculas y con guiones: sirena-sofia");
// OneDrive sincronizaría node_modules y dejaría la PC lenta; el Escritorio y Documentos están dentro de OneDrive.
if (taller.split(sep).some((p) => /^(onedrive.*|desktop|escritorio|documents|documentos)$/i.test(p))) salir(`El taller no puede ir en ${taller}. Usa una carpeta en C:\\dev.`);

const candidatos = desde === "plantilla" ? [join(SKILL, "plantilla", "index.html")]
  : [join(SKILL, "ejemplos", desde, "index.html"), join(taller, desde, "index.html"), resolve(desde)];
const fuente = candidatos.find((f) => f.endsWith(".html") && existsSync(f));
const ejemplos = readdirSync(join(SKILL, "ejemplos"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
if (!fuente) salir(`No encuentro «${desde}». Opciones: plantilla, ${ejemplos.join(", ")}, una invitación del taller o la ruta de un .html`);
const destino = join(taller, nombre);
if (existsSync(join(destino, "index.html"))) salir(`Ya existe ${join(destino, "index.html")}: no la toco. Trabaja sobre esa o elige otro nombre.`);

// El taller: servidor (solo si falta) y herramientas (siempre las de esta versión de la skill).
const herr = join(taller, "herramientas");
mkdirSync(herr, { recursive: true });
if (!existsSync(join(taller, "server.mjs"))) copyFileSync(join(SKILL, "plantilla", "server.mjs"), join(taller, "server.mjs"));
for (const f of readdirSync(join(SKILL, "scripts"))) if (f.endsWith(".mjs") && f !== "nuevo.mjs") copyFileSync(join(SKILL, "scripts", f), join(herr, f));
if (!existsSync(join(herr, "package.json"))) writeFileSync(join(herr, "package.json"), JSON.stringify({ private: true, type: "module", dependencies: { "playwright-core": "1.64.0" } }, null, 2) + "\n");
if (!existsSync(join(herr, "node_modules", "playwright-core"))) {
  console.log("Instalando playwright-core en herramientas/ …");
  const r = spawnSync("npm install --no-audit --no-fund", { cwd: herr, stdio: "inherit", shell: true });
  if (r.status !== 0) salir("npm install falló en herramientas/.");
}

for (const d of ["historial", "capturas"]) mkdirSync(join(destino, d), { recursive: true });
copyFileSync(fuente, join(destino, "index.html"));

const nav = spawnSync(process.execPath, ["-e", "import('./navegador.mjs').then((m) => console.log(JSON.stringify(m.buscarChrome())))"], { cwd: herr, encoding: "utf8" });
const chrome = (() => { try { return JSON.parse(nav.stdout); } catch { return null; } })();
console.log(`Lista: ${join(destino, "index.html")}  (desde ${desde})`);
console.log(`Navegador para las herramientas: ${chrome?.executablePath ?? `${chrome?.channel ?? "msedge"} del sistema`}`);
if (spawnSync("ffmpeg", ["-version"]).status !== 0) console.log("Aviso: falta ffmpeg en el PATH; grabar.mjs lo necesita (winget install Gyan.FFmpeg).");
console.log(`Servidor: node server.mjs en ${taller} (en segundo plano). Dice su puerto; luego abre /${nombre}/`);
