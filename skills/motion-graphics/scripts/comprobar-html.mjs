import {readFileSync} from 'node:fs';
import {openComposition} from '../referencias/motion-agent/tools/lib/browser.mjs';

const [html, archivo] = process.argv.slice(2);
const datos = JSON.parse(readFileSync(archivo, 'utf8'));
const composicion = await openComposition(html);
try {
  const [ancho, alto] = datos.formato === 'horizontal' ? [1920, 1080] : [1080, 1920];
  if (composicion.meta.width !== ancho || composicion.meta.height !== alto) {
    throw new Error(`La composición debe medir ${ancho} × ${alto}`);
  }
  if (Math.abs(composicion.meta.duration - datos.duracion) > 1 / composicion.meta.fps) {
    throw new Error('La duración HTML no coincide con momentos.json');
  }
} finally {
  await composicion.close();
}
