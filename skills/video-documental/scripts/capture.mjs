#!/usr/bin/env node
// capture.mjs — real-media sourcing for Editor V1: web pages, docs, X post cards.
//
//   node capture.mjs <jobs.json> <outdir>
//
// jobs.json = [{ "name": "pricing", "url": "https://…",
//                "w": 1280, "h": 900,        viewport (logical px), default 1280x900
//                "dsf": 2,                   device scale, default 2 (crop ≤ half display width)
//                "mobile": true,             phone emulation (a vertical video's full-frame page: w 432, h 768, dsf 2.5)
//                "selector": "article",      optional: clip to this element's box
//                "pad": 16,                  optional padding around the selector box
//                "clip": [x,y,w,h],          optional: page-coord clip instead of selector
//                "wait": 2500,               ms after load, default 2500
//                "hide": ["header", …],      selectors to display:none before the shot
//                "full": true }]             full-page capture (tall), default false
//
// Why each step exists (all of them failed silently on earlier videos):
//  - consent walls render a plausible grey page → click Accept/Allow, then strip any
//    leftover position:fixed overlay bigger than 300x200 with z-index > 100
//  - scroll-reveal sites leave sections at opacity:0 → walk the page in 380px steps first
//  - Page.captureScreenshot's clip is PAGE coords → add scrollX/scrollY, captureBeyondViewport
//  - X embeds load emoji as <img> → hidden: no emojis on screen, ever
// Node 22+ has a global WebSocket; nothing to install. Look at every PNG afterwards.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { buscarChrome } = await import(pathToFileURL(join(process.env.SLOTH_SKILLS || join(homedir(), '.claude', 'skills'), 'video-base', 'scripts', 'chrome.mjs')).href);

const [jobsPath, outDir] = process.argv.slice(2);
if (!jobsPath || !outDir) { console.error('usage: node capture.mjs <jobs.json> <outdir>'); process.exit(1); }
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

// Chrome: el que encuentra video-base (CHROME si se puso, el headless shell, el de Sloth, Chrome instalado o Edge).
// Nunca una ruta fija: se rompe con la siguiente actualización.
const CHROME = buscarChrome();
if (!CHROME) { console.error('capture.mjs: no encontré Chrome ni Edge. Pon su ruta en CHROME.'); process.exit(1); }
const PORT = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'ev1cap-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); const l = await r.json();
      const p = l.find((t) => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable'); await send('Runtime.enable');

const CLEAN = `(() => {
  const re = /^(accept all|allow all( cookies)?|accept|i agree|agree|got it|ok|allow essential.*|reject all|decline optional cookies|aceptar( todo| todas| cookies)?|acepto|permitir( todas| todo)?( las cookies)?|rechazar( todo| todas)?|entendido|de acuerdo)$/i;
  for (const b of document.querySelectorAll('button,[role=button],a')) { const t=(b.innerText||'').trim(); if (re.test(t)) { try{b.click()}catch{} } }
  for (const el of document.querySelectorAll('body *')) { const s=getComputedStyle(el);
    if ((s.position==='fixed'||s.position==='sticky') && el.offsetWidth>300 && el.offsetHeight>200 && (+s.zIndex||0)>100) el.remove(); }
  for (const i of document.querySelectorAll('img[src*="emoji"], img.Emoji, img[alt*="emoji" i]')) i.style.display='none';
  return true; })()`;

for (const j of jobs) {
  const w = j.w || 1280, h = j.h || 900, dsf = j.dsf || 2;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: !!j.mobile });
  await send('Page.navigate', { url: j.url });
  await sleep(j.wait ?? 2500);
  await evalJs(CLEAN); await sleep(400);
  // walk the page so scroll-reveals fire, then come back to the top
  await evalJs(`(async()=>{const H=document.documentElement.scrollHeight;for(let y=0;y<H;y+=380){scrollTo(0,y);await new Promise(r=>setTimeout(r,160))}scrollTo(0,0);await new Promise(r=>setTimeout(r,400));return H})()`);
  await evalJs(CLEAN);
  if (j.hide) await evalJs(`(()=>{for(const s of ${JSON.stringify(j.hide)})for(const e of document.querySelectorAll(s))e.style.display='none';return 1})()`);
  let clip;
  if (j.selector) {
    const r = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(j.selector)});if(!e)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return [b.x+scrollX,b.y+scrollY,b.width,b.height]})()`);
    if (!r) { console.log('MISS selector', j.name, j.selector); continue; }
    const p = j.pad ?? 16; clip = { x: Math.max(0, r[0] - p), y: Math.max(0, r[1] - p), width: r[2] + 2 * p, height: r[3] + 2 * p, scale: 1 };
  } else if (j.clip) clip = { x: j.clip[0], y: j.clip[1], width: j.clip[2], height: j.clip[3], scale: 1 };
  else if (j.full) { const H = await evalJs('document.documentElement.scrollHeight'); clip = { x: 0, y: 0, width: w, height: Math.min(H, 12000), scale: 1 }; }
  await sleep(300);
  const shot = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  const data = shot.result?.data;
  if (!data) { console.log('FAIL', j.name); continue; }
  const buf = Buffer.from(data, 'base64'); writeFileSync(join(outDir, `${j.name}.png`), buf);
  console.log('OK', j.name, buf.length, 'bytes', clip ? `${Math.round(clip.width)}x${Math.round(clip.height)}@${dsf}x` : `${w}x${h}@${dsf}x`);
}
ws.close(); chrome.kill('SIGKILL');
await sleep(500);
try { rmSync(prof, { recursive: true, force: true }); } catch {}
