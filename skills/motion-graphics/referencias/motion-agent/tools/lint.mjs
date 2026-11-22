#!/usr/bin/env node
// Linter estático L0: detecta lo que rompe el determinismo o el contrato, sin abrir el navegador.
//
//   node tools/lint.mjs projects/mi-pieza/index.html
//   node tools/lint.mjs examples/*/index.html --strict    # los avisos también fallan
//   node tools/lint.mjs <html> --json
import fs from 'node:fs';
import { parseArgs } from './lib/browser.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
if (!pos.length) {
  console.error('Uso: node tools/lint.mjs <archivo.html...> [--strict] [--json]');
  process.exit(2);
}

// Sustituye comentarios por espacios para conservar los números de línea y evitar falsos positivos.
function maskComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:"'`\\\w/])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));
}

// id, severidad, patrón, mensaje, pista
const RULES = [
  ['LEGACY_CONTRACT', 'error', /__SEEK|__DURATION/, 'Contrato v1 (__SEEK/__DURATION).', 'Usa window.__mg vía MG.register (ver skills/core-contract.md).'],
  ['RANDOM', 'error', /Math\.random\s*\(/, 'Math.random rompe el determinismo.', 'Usa MG.mulberry32(semilla) con la semilla derivada del fotograma.'],
  ['GSAP_RANDOM', 'error', /gsap\.utils\.random|["'`]random\(/, 'Aleatoriedad de GSAP no determinista.', 'Precalcula valores con mulberry32.'],
  ['REPEAT_INF', 'error', /repeat\s*:\s*-1/, 'repeat:-1 crea una timeline infinita.', 'Usa una timeline finita; repite el patrón con un bucle de duración conocida.'],
  ['CSS_TRANSITION', 'error', /(^|[;{\s"'])transition\s*:/m, 'transition de CSS corre con el reloj, no con seek(t).', 'Anima con GSAP/función de t, o cambia el estado sin transición.'],
  ['CSS_ANIMATION', 'error', /@keyframes|(^|[;{\s"'])animation(-name)?\s*:/m, 'Animaciones CSS corren con el reloj, no con seek(t).', 'Pásalas a la timeline o a render(t).'],
  ['DATE_NOW', 'error', /Date\.now\s*\(|new\s+Date\s*\(/, 'Date.now / new Date dependen del reloj.', 'Usa solo t del contrato.'],
  ['STORAGE', 'warn', /localStorage|sessionStorage/, 'Almacenamiento del navegador: estado oculto fuera de t.', 'Elimínalo de la composición.'],
  ['PERF_NOW', 'warn', /performance\.now\s*\(|requestAnimationFrame\s*\(/, 'Reloj/rAF: válido solo en la vista previa, nunca dentro de render(t).', 'Confirma que no afecta al fotograma.'],
  ['TIMERS', 'warn', /setTimeout\s*\(|setInterval\s*\(/, 'Temporizadores: no están sincronizados con seek(t).', 'Si cambian el fotograma, pásalos a la timeline.'],
  ['BACKDROP', 'warn', /backdrop-filter/, 'backdrop-filter se ve plano si un ancestro tiene filter (anti-patrón #7).', 'Usa fondo semitransparente con degradado, o comprueba el resultado en el render.'],
  ['WILL_CHANGE', 'warn', /will-change\s*:/, 'will-change puede hacer que el texto "baile" al hacer zoom (anti-patrón #17).', 'Quítalo salvo necesidad.'],
];

function lintFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const code = maskComments(src);
  const lines = code.split('\n');
  const issues = [];
  const add = (id, severity, line, msg, hint) => issues.push({ id, severity, line, msg, hint });

  for (const [id, sev, re, msg, hint] of RULES) {
    lines.forEach((ln, i) => {
      if (re.test(ln)) add(id, sev, i + 1, msg, hint);
    });
  }

  // Recursos remotos: no se renderizan (el render bloquea la red).
  const remote = /(?:src|href)\s*=\s*["']https?:\/\/[^"']+|url\(\s*["']?https?:\/\/[^)"']+|@import\s+(?:url\()?["']?https?:\/\//i;
  lines.forEach((ln, i) => {
    const m = ln.match(remote);
    if (m) {
      const fonts = /fonts\.(googleapis|gstatic)\.com/.test(ln);
      add('REMOTE', 'error', i + 1, 'Recurso remoto: el render bloquea la red y el resultado cambia.',
        fonts ? 'Descarga las fuentes: node tools/fetch-fonts.mjs "Familia:400,700" y enlaza runtime/fonts/fonts.css.' : 'Copia el recurso al repo (runtime/vendor, assets/) o embébelo (SVG/base64).');
    }
  });

  // Contrato.
  const usesRuntime = /MG\.register\s*\(/.test(code);
  const definesMg = /window\.__mg\s*=|__mg\s*=\s*\{/.test(code);
  if (!usesRuntime && !definesMg) add('NO_CONTRACT', 'error', 1, 'La composición no expone window.__mg.', 'Carga runtime/mg-runtime.js y llama a MG.register({duration,width,height,render}).');
  if (definesMg && !/document\.fonts/.test(code)) add('FONTS_READY', 'warn', 1, 'Contrato propio sin esperar document.fonts.ready.', 'Marca ready=true solo después de que carguen las fuentes (anti-patrón #18).');
  if (usesRuntime && !/mg-runtime\.js/.test(code)) add('RUNTIME_SRC', 'error', 1, 'Se usa MG pero no se carga mg-runtime.js.', 'Añade <script src="…/runtime/mg-runtime.js"></script>.');

  // Scripts externos sin versión exacta o con ruta absoluta.
  lines.forEach((ln, i) => {
    const m = ln.match(/<script[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (m && /gsap/i.test(m[1]) && !/\d+\.\d+\.\d+/.test(m[1])) add('GSAP_UNPINNED', 'error', i + 1, 'GSAP sin versión exacta en el nombre.', 'Usa runtime/vendor/gsap-3.12.5.min.js (versión fijada).');
  });

  return issues;
}

let errors = 0, warns = 0;
const report = {};
for (const f of pos) {
  const issues = lintFile(f);
  report[f] = issues;
  errors += issues.filter((x) => x.severity === 'error').length;
  warns += issues.filter((x) => x.severity === 'warn').length;
}

if (flags.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [f, issues] of Object.entries(report)) {
    const e = issues.filter((x) => x.severity === 'error').length;
    const w = issues.length - e;
    console.log(`\n${e ? '✗' : w ? '!' : '✓'} ${f}  (${e} errores, ${w} avisos)`);
    // Agrupa por regla para no inundar la salida.
    const byRule = new Map();
    for (const it of issues) {
      if (!byRule.has(it.id)) byRule.set(it.id, { ...it, lines: [] });
      byRule.get(it.id).lines.push(it.line);
    }
    for (const it of byRule.values()) {
      const where = it.lines.length > 6 ? `líneas ${it.lines.slice(0, 6).join(', ')}… (+${it.lines.length - 6})` : `línea${it.lines.length > 1 ? 's' : ''} ${it.lines.join(', ')}`;
      console.log(`  ${it.severity === 'error' ? 'ERROR' : 'aviso'} [${it.id}] ${it.msg} (${where})\n         → ${it.hint}`);
    }
  }
  console.log(`\nTotal: ${errors} errores, ${warns} avisos en ${pos.length} archivo(s).`);
}
process.exit(errors || (flags.strict && warns) ? 1 : 0);
