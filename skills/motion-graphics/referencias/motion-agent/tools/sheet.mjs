#!/usr/bin/env node
// Hoja de contactos: la forma de que el agente (o tú) "vea" la pieza sin reproducirla.
//
//   node tools/sheet.mjs projects/mi-pieza/index.html --every 0.5          # desde la composición (con etiqueta de tiempo)
//   node tools/sheet.mjs out/mi-pieza.mp4 --every 0.5                       # desde un MP4 (sin etiqueta)
//   node tools/sheet.mjs <html> --at 1.48,1.5,1.6,3.1                       # tiempos exactos (transiciones difíciles)
//   opciones: --cols 3 --rows 3 --width 480 --out out/sheets/nombre
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openComposition, parseArgs, num } from './lib/browser.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
if (!pos[0]) { console.error('Uso: node tools/sheet.mjs <composicion.html|video.mp4> [--every s | --at t1,t2] [--cols 3] [--rows 3] [--width 480] [--out prefijo]'); process.exit(2); }

const input = pos[0];
const cols = num(flags.cols, 3), rows = num(flags.rows, 3), width = num(flags.width, 480);
const perSheet = cols * rows;
const isVideo = /\.(mp4|mov|webm|mkv)$/i.test(input);
const stem = path.basename(isVideo ? input : path.dirname(path.resolve(input))).replace(/\.[^.]+$/, '');
const outPrefix = flags.out || path.join('out', 'sheets', stem);
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sheet-'));

const ff = (args) => { const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); };
const sheets = [];

if (isVideo) {
  const every = num(flags.every, 0.5);
  ff(['-i', input, '-vf', `fps=1/${every},scale=${width}:-1`, path.join(tmp, 'f%04d.png')]);
  const n = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).length;
  for (let s = 0; s * perSheet < n; s++) {
    const out = `${outPrefix}-${s + 1}.png`;
    ff(['-framerate', '1', '-start_number', String(s * perSheet + 1), '-i', path.join(tmp, 'f%04d.png'), '-frames:v', '1', '-vf', `tile=${cols}x${rows}:padding=4:color=gray`, out]);
    sheets.push(out);
  }
} else {
  const comp = await openComposition(input, { scale: 1 });
  const { duration } = comp.meta;
  const times = flags.at && flags.at !== true
    ? String(flags.at).split(',').map(Number)
    : Array.from({ length: Math.floor(duration / num(flags.every, 0.5)) + 1 }, (_, i) => +(i * num(flags.every, 0.5)).toFixed(3)).filter((t) => t <= duration);
  for (let i = 0; i < times.length; i++) {
    await comp.seek(times[i]);
    await comp.page.evaluate((t) => {
      let l = document.getElementById('__sheet_lbl');
      if (!l) { l = document.createElement('div'); l.id = '__sheet_lbl'; l.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;background:#000c;color:#ff0;font:700 28px monospace;padding:2px 8px;border-radius:4px'; document.body.appendChild(l); }
      l.textContent = 't=' + t.toFixed(2) + 's';
    }, times[i]);
    fs.writeFileSync(path.join(tmp, `f${String(i + 1).padStart(4, '0')}.png`), await comp.frame());
  }
  await comp.close();
  for (let s = 0; s * perSheet < times.length; s++) {
    const out = `${outPrefix}-${s + 1}.png`;
    ff(['-framerate', '1', '-start_number', String(s * perSheet + 1), '-i', path.join(tmp, 'f%04d.png'), '-frames:v', '1', '-vf', `scale=${width}:-1,tile=${cols}x${rows}:padding=4:color=gray`, out]);
    sheets.push(out);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hojas de contactos:\n' + sheets.map((s) => '  ' + s).join('\n'));
