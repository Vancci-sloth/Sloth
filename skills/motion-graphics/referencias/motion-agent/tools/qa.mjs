#!/usr/bin/env node
// QA en navegador (L1–L3). Verifica el RENDER, no solo el código.
//
//   node tools/qa.mjs projects/mi-pieza/index.html
//   node tools/qa.mjs <html> --samples 60 --video out/mi-pieza.mp4
//
// Comprueba: contrato __mg · determinismo (mismo t → mismo píxel) · texto fuera del encuadre ·
// primer/último fotograma · errores de consola · red bloqueada · y, con --video, duración, color y
// segmentos congelados o negros.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { openComposition, parseArgs, num } from './lib/browser.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
if (!pos[0]) {
  console.error('Uso: node tools/qa.mjs <composicion.html> [--samples N] [--video out.mp4] [--json]');
  process.exit(2);
}
const input = pos[0];
const samples = num(flags.samples, 40);
const findings = []; // {level: 'error'|'warn'|'info', check, msg}
const add = (level, check, msg) => findings.push({ level, check, msg });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

const comp = await openComposition(input, { scale: 1 });
const { meta, page } = comp;

// ---------- 1. Contrato ----------
if (!(meta.duration > 0)) add('error', 'contrato', `duration inválida: ${meta.duration}`);
if (![24, 25, 30, 50, 60].includes(meta.fps)) add('warn', 'contrato', `fps poco habitual: ${meta.fps}`);
if (!Number.isInteger(meta.width) || !Number.isInteger(meta.height)) add('error', 'contrato', 'width/height deben ser enteros');
add('info', 'contrato', `${meta.width}x${meta.height} @ ${meta.fps} fps, ${meta.duration}s (${Math.round(meta.duration * meta.fps)} fotogramas)`);

// ---------- 2. Determinismo: seek(t) → A; seek(otro) → seek(t) → B; A debe == B ----------
const detTimes = Array.from({ length: 10 }, (_, i) => +(((i + 0.5) / 10) * meta.duration).toFixed(3));
detTimes.push(0, meta.duration);
let detFail = [];
let redondeos = 0;
for (const t of detTimes) {
  await comp.seek(t);
  const imagenA = await comp.frame();
  const a = sha(imagenA);
  await comp.seek(t === 0 ? meta.duration * 0.7 : t * 0.31);
  await comp.seek(t);
  const imagenB = await comp.frame();
  const b = sha(imagenB);
  if (a !== b) {
    // Chromium puede redondear un canal en unos pocos bordes 3D según su caché de rasterización.
    // Compara píxeles: como máximo 1/255 en el 0,1 % del cuadro; cambios de posición siguen fallando.
    const redondeo = await page.evaluate(async ([a, b]) => {
      const leer = async src => {
        const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const x = await leer(a), y = await leer(b);
      if (x.length !== y.length) return false;
      let distintos = 0;
      for (let i = 0; i < x.length; i += 4) {
        let cambio = false;
        for (let k = 0; k < 4; k++) {
          const d = Math.abs(x[i+k] - y[i+k]);
          if (d > 1) return false;
          cambio ||= d !== 0;
        }
        if (cambio && ++distintos > x.length / 4 * .001) return false;
      }
      return true;
    }, [imagenA.toString('base64'), imagenB.toString('base64')]);
    if (redondeo) redondeos++; else detFail.push(t);
  }
}
if (detFail.length) add('error', 'determinismo', `Fotogramas distintos para el mismo t en ${detFail.map((t) => t + 's').join(', ')}. Revisa estado fuera de la timeline, aleatoriedad, CSS animado o fuentes remotas.`);
else add('info', 'determinismo', `OK en ${detTimes.length} tiempos${redondeos ? `; ${redondeos} con redondeo de rasterización ≤1/255 en ≤0,1 % de píxeles` : ' (mismo t → mismo píxel)'}.`);

// ---------- 3. Estadísticas de fotograma (en la página, sin dependencias) ----------
async function frameStats(buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 96; c.height = 54;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, 96, 54);
    const d = x.getImageData(0, 0, 96, 54).data;
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; n++; }
    const mean = s / n;
    return { mean: +mean.toFixed(1), std: +Math.sqrt(Math.max(0, s2 / n - mean * mean)).toFixed(2) };
  }, buf.toString('base64'));
}
await comp.seek(0);
const first = await frameStats(await comp.frame());
await comp.seek(meta.duration);
const last = await frameStats(await comp.frame());
if (first.std < 1.5) add('warn', 'primer-fotograma', `Casi uniforme (media ${first.mean}). Válido si es un negro/blanco intencional.`);
if (last.std < 1.5) add('error', 'ultimo-fotograma', `Fotograma final vacío o uniforme (media ${last.mean}). Falta un estado final estable (anti-patrón #6).`);
else add('info', 'ultimo-fotograma', `Estado final con contenido (desviación ${last.std}).`);

// ---------- 4. Texto fuera del encuadre (muestreo con seek) ----------
const probe = () => page.evaluate(({ w, h }) => {
  const stage = document.getElementById('stage') || document.body;
  const sr = stage.getBoundingClientRect();
  const sx = sr.width / w; // por si el stage está escalado
  const out = [];
  const eff = (el) => { let o = 1; for (let e = el; e && e !== document.body; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; o *= parseFloat(cs.opacity); } return o; };
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim()) continue;
    seen.add(el);
    if (['SCRIPT', 'STYLE'].includes(el.tagName) || eff(el) < 0.05) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const l = (b.left - sr.left) / sx, t = (b.top - sr.top) / sx, rt = (b.right - sr.left) / sx, bt = (b.bottom - sr.top) / sx;
    const tol = 2;
    if (l < -tol || t < -tol || rt > w + tol || bt > h + tol) {
      out.push({ el: (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '')), text: n.textContent.trim().slice(0, 24), box: [l, t, rt, bt].map(Math.round) });
    }
  }
  return out;
}, { w: meta.width, h: meta.height });

const hits = new Map();
const nProbe = Math.max(2, samples);
for (let i = 0; i <= nProbe; i++) {
  const t = +((i / nProbe) * meta.duration).toFixed(3);
  await comp.seek(t);
  let issues = await probe();
  const custom = await page.evaluate((tt) => (window.__qa && typeof window.__qa.probe === 'function' ? window.__qa.probe(tt, true) : []), t).catch(() => []);
  for (const c of custom || []) issues.push({ el: 'custom', text: JSON.stringify(c).slice(0, 80), box: [] });
  for (const it of issues) {
    const k = it.el + '|' + it.text;
    if (!hits.has(k)) hits.set(k, { ...it, times: [] });
    hits.get(k).times.push(t);
  }
}
for (const h of hits.values()) {
  const a = h.times[0], b = h.times[h.times.length - 1];
  if (h.el === 'custom') { add('warn', 'sonda-propia', `window.__qa.probe reporta ${h.text} entre ${a}s y ${b}s (${h.times.length} muestras).`); continue; }
  add('warn', 'limites', `"${h.text}" (${h.el}) sale del encuadre entre ${a}s y ${b}s (${h.times.length} muestras)${h.box.length ? ' caja ' + h.box.join(',') : ''}. Puede ser una entrada/salida intencional; revisa con tools/sheet.mjs.`);
}
if (!hits.size) add('info', 'limites', `Sin texto visible fuera del encuadre en ${nProbe + 1} muestras.`);

// ---------- 5. Consola y red ----------
for (const e of [...new Set(comp.errors)]) add('error', 'consola', e);
for (const u of [...new Set(comp.blocked)]) add('error', 'red', `Petición remota bloqueada: ${u}`);
await comp.close();

// ---------- 6. Video (opcional) ----------
if (flags.video) {
  const v = String(flags.video);
  if (!fs.existsSync(v)) add('error', 'video', `No existe ${v}`);
  else {
    const probeOut = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,color_space,color_primaries,color_transfer:format=duration', '-of', 'json', v], { encoding: 'utf8' });
    try {
      const j = JSON.parse(probeOut.stdout);
      const s = j.streams[0];
      const dur = parseFloat(j.format.duration);
      if (Math.abs(dur - meta.duration) > 2 / meta.fps + 0.05) add('warn', 'video', `Duración ${dur.toFixed(2)}s ≠ ${meta.duration}s del contrato (¿render parcial?).`);
      else add('info', 'video', `Duración ${dur.toFixed(2)}s, ${s.width}x${s.height}.`);
      if (s.color_space !== 'bt709' || s.color_primaries !== 'bt709') add('warn', 'video', `Etiquetas de color: ${s.color_space}/${s.color_primaries} (esperado bt709).`);
    } catch { add('warn', 'video', 'No se pudo leer ffprobe.'); }
    const run = (vf) => spawnSync('ffmpeg', ['-hide_banner', '-i', v, '-vf', vf, '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    const fz = [...run('freezedetect=n=0.001:d=1.0').matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_duration: ([\d.]+)/g)];
    for (const m of fz) add('warn', 'congelado', `Imagen estática ${(+m[2]).toFixed(2)}s desde ${(+m[1]).toFixed(2)}s (revisa si es un hold intencional).`);
    const bk = [...run('blackdetect=d=0.1:pix_th=0.10').matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)];
    for (const m of bk) add('warn', 'negro', `Negro de ${m[1]}s a ${m[2]}s (revisa si es un corte intencional).`);
    if (!fz.length) add('info', 'congelado', 'Sin segmentos congelados > 1 s.');
  }
}

// ---------- Informe ----------
const errs = findings.filter((f) => f.level === 'error').length;
const warns = findings.filter((f) => f.level === 'warn').length;
const outDir = 'out';
fs.mkdirSync(outDir, { recursive: true });
const parent = path.basename(path.dirname(path.resolve(input)));
const stem = path.basename(input, '.html');
const base = (stem === 'index' ? parent : parent + '-' + stem) + '.qa.json';
fs.writeFileSync(path.join(outDir, base), JSON.stringify({ input, meta, findings }, null, 2));

if (flags.json) console.log(JSON.stringify({ input, meta, findings }, null, 2));
else {
  console.log(`\nQA · ${input}`);
  for (const f of findings) console.log(` ${f.level === 'error' ? '✗' : f.level === 'warn' ? '!' : '·'} [${f.check}] ${f.msg}`);
  console.log(`\nResultado: ${errs ? 'FALLA' : 'OK'} — ${errs} errores, ${warns} avisos. Informe: ${path.join(outDir, base)}`);
}
process.exit(errs ? 1 : 0);
