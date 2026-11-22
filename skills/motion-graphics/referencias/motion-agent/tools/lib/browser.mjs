// Abre una composición HTML en Chromium headless y expone seek() + frame().
// Sin red: cualquier petición http(s) se bloquea y se reporta (reglas §17.5 del KB).
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export async function openComposition(file, opts = {}) {
  const { scale = 1, timeout = 30000, settle = 'raf', query = 'render=1' } = opts;
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error('No existe: ' + abs);

  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ['--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  const blocked = [];
  const errors = [];
  await context.route(/^https?:/i, (route) => {
    blocked.push(route.request().url());
    return route.abort();
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
  });

  await page.goto(pathToFileURL(abs).href + '?' + query, { waitUntil: 'load', timeout });
  try {
    await page.waitForFunction(() => window.__mg && window.__mg.ready === true, null, { timeout });
  } catch {
    await browser.close();
    throw new Error('El contrato no se cumple: window.__mg.ready nunca fue true (¿falta MG.register o hay un error de JS?).\n' + errors.join('\n'));
  }

  const meta = await page.evaluate(() => ({
    duration: window.__mg.duration,
    fps: window.__mg.fps,
    width: window.__mg.width,
    height: window.__mg.height,
  }));

  // Ajusta el viewport al tamaño real de la pieza, con el factor de escala pedido.
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: meta.width, height: meta.height, deviceScaleFactor: scale, mobile: false,
  });
  await page.evaluate(() => window.__mg.seek(0));

  const raf = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));

  return {
    page, cdp, meta, blocked, errors,
    async seek(t) {
      await page.evaluate((x) => window.__mg.seek(x), t);
      // Las capas en perspectiva necesitan completar la pintura tras cambiar de visibilidad.
      // El primer RAF precede a la pintura; el segundo evita capturar el estado anterior.
      if (settle === 'raf') { await raf(); await raf(); }
    },
    /** Devuelve un Buffer con la captura del fotograma actual. */
    async frame({ format = 'png', quality = 85 } = {}) {
      const params = { format, fromSurface: true, captureBeyondViewport: false };
      if (format === 'jpeg') params.quality = quality;
      const { data } = await cdp.send('Page.captureScreenshot', params);
      return Buffer.from(data, 'base64');
    },
    async close() { await browser.close(); },
  };
}

/** Parser mínimo de argumentos: posicionales + --clave valor | --flag */
export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[k] = true;
      else { flags[k] = next; i++; }
    } else pos.push(a);
  }
  return { pos, flags };
}

export const num = (v, d) => (v === undefined || v === true ? d : Number(v));
