#!/usr/bin/env node
// Descarga fuentes de Google Fonts a runtime/fonts/ para que el render funcione sin red.
// (Necesita internet SOLO al ejecutarlo. Las fuentes quedan versionadas en el repo; revisa su licencia.)
//
//   node tools/fetch-fonts.mjs "Outfit:500,600,700,800,900" "JetBrains Mono:400,700"
//
// Genera runtime/fonts/<familia>.css y mantiene runtime/fonts/fonts.css con un @import por familia.
// Solo baja los subconjuntos latin y latin-ext (cubren ¿ ¡ ñ á é í ó ú ü).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'runtime', 'fonts');
fs.mkdirSync(dir, { recursive: true });
const specs = process.argv.slice(2);
if (!specs.length) { console.error('Uso: node tools/fetch-fonts.mjs "Familia:400,700" ...'); process.exit(2); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const spec of specs) {
  const [family, weightsRaw = '400'] = spec.split(':');
  const weights = weightsRaw.split(',').map((w) => w.trim()).filter(Boolean).sort();
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights.join(';')}&display=block`;
  console.log('→', family, weights.join(','));
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google Fonts respondió ${res.status} para ${family}`);
  const css = await res.text();

  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
  let out = `/* ${family} — generado por tools/fetch-fonts.mjs */\n`;
  for (const [, subset, face] of blocks) {
    if (!['latin', 'latin-ext'].includes(subset)) continue;
    const m = face.match(/url\((https:[^)]+\.woff2)\)/);
    if (!m) continue;
    const weight = (face.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
    const file = `${slug(family)}-${weight}-${subset}.woff2`;
    const bin = Buffer.from(await (await fetch(m[1])).arrayBuffer());
    fs.writeFileSync(path.join(dir, file), bin);
    out += `/* ${subset} */\n` + face.replace(m[1], file) + '\n';
  }
  fs.writeFileSync(path.join(dir, `${slug(family)}.css`), out);
}

const all = fs.readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'fonts.css').sort();
fs.writeFileSync(path.join(dir, 'fonts.css'), '/* Índice de fuentes locales (generado). */\n' + all.map((f) => `@import url("${f}");`).join('\n') + '\n');
console.log('Listo. Enlaza en tu HTML: <link rel="stylesheet" href="../../runtime/fonts/fonts.css">');
