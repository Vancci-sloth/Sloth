#!/usr/bin/env node
// Render determinista: por cada fotograma hace __mg.seek(t), captura y envía a FFmpeg por stdin.
//
//   node tools/render.mjs projects/mi-pieza/index.html --out out/mi-pieza.mp4
//   node tools/render.mjs <html> --preview                 # rápido: mitad de tamaño, 30 fps, CRF alto
//   node tools/render.mjs <html> --scale 2                 # más resolución (deviceScaleFactor)
//   node tools/render.mjs <html> --from 2 --to 5           # solo un tramo
//   node tools/render.mjs <html> --audio mezcla.wav        # añade audio (AAC), recorta al más corto
//   node tools/render.mjs <html> --png-seq out/frames      # secuencia PNG en vez de MP4
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openComposition, parseArgs, num } from './lib/browser.mjs';

const { pos, flags } = parseArgs(process.argv.slice(2));
if (!pos[0]) {
  console.error('Uso: node tools/render.mjs <composicion.html> [--out x.mp4] [--fps N] [--scale N] [--from s] [--to s] [--crf N] [--preset p] [--preview] [--audio f] [--png-seq dir]');
  process.exit(2);
}

const input = pos[0];
const name = path.basename(path.dirname(path.resolve(input))) === 'projects' ? path.basename(input, '.html') : path.basename(path.dirname(path.resolve(input)));
const preview = !!flags.preview;
const scale = num(flags.scale, preview ? 0.5 : 1);
const out = flags.out || `out/${name}${preview ? '.preview' : ''}.mp4`;
const crf = num(flags.crf, preview ? 28 : 18);
const preset = flags.preset || (preview ? 'veryfast' : 'slow');
const pngSeq = flags['png-seq'];

const t0 = Date.now();
const comp = await openComposition(input, { scale });
const { meta } = comp;
const fps = num(flags.fps, preview ? Math.min(30, meta.fps) : meta.fps);
const from = num(flags.from, 0);
const to = Math.min(num(flags.to, meta.duration), meta.duration);
const total = Math.max(1, Math.round((to - from) * fps));
const W = Math.round(meta.width * scale);
const H = Math.round(meta.height * scale);

console.log(`[render] ${input}`);
console.log(`[render] ${W}x${H} @ ${fps} fps · ${from}s→${to}s · ${total} fotogramas · ${preview ? 'PREVIEW' : 'FINAL'}`);

let ff = null;
let ffDone = Promise.resolve();
if (pngSeq) {
  fs.mkdirSync(pngSeq, { recursive: true });
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', preview ? 'mjpeg' : 'png', '-i', '-'];
  if (flags.audio) args.push('-i', String(flags.audio));
  args.push(
    // RGB → YUV con matriz BT.709 explícita (el valor por defecto de swscale es BT.601) y dimensiones pares.
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart',
  );
  if (flags.audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push(out);
  ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  ffDone = new Promise((res, rej) => {
    ff.on('error', (e) => rej(new Error('No se pudo ejecutar ffmpeg: ' + e.message)));
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error('ffmpeg terminó con código ' + code))));
  });
  ff.stdin.on('error', () => {}); // si ffmpeg muere, el error llega por 'close'
}

try {
  for (let i = 0; i < total; i++) {
    const t = from + i / fps;
    await comp.seek(t);
    const buf = await comp.frame({ format: preview ? 'jpeg' : 'png', quality: 88 });
    if (pngSeq) {
      fs.writeFileSync(path.join(pngSeq, `f_${String(i).padStart(5, '0')}.png`), buf);
    } else if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    if (i % 30 === 0 || i === total - 1) {
      process.stdout.write(`\r[render] fotograma ${i + 1}/${total} (${(((i + 1) / total) * 100).toFixed(0)}%) t=${t.toFixed(2)}s   `);
    }
  }
  process.stdout.write('\n');
  if (ff) ff.stdin.end();
  await ffDone;
} finally {
  await comp.close();
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const log = {
  input, output: pngSeq || out, width: W, height: H, fps, from, to, frames: total, preview,
  seconds: Number(secs), blockedRequests: comp.blocked, pageErrors: comp.errors,
};
if (!pngSeq) fs.writeFileSync(out.replace(/\.mp4$/, '') + '.render.json', JSON.stringify(log, null, 2));

if (comp.blocked.length) console.warn(`[render] AVISO: se bloquearon ${comp.blocked.length} peticiones de red (fuentes/imágenes remotas no se renderizan):\n  - ${[...new Set(comp.blocked)].join('\n  - ')}`);
if (comp.errors.length) console.warn(`[render] AVISO: errores de JS/consola:\n  - ${[...new Set(comp.errors)].join('\n  - ')}`);
if (!pngSeq) console.log(`[render] listo en ${secs}s → ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
else console.log(`[render] listo en ${secs}s → ${pngSeq}/`);
