/**
 * «Quitar fondo», en el editor de imágenes (`EditorImagen.tsx`): sin gastar nada, en esta computadora, con
 * `video-base/scripts/recorte.py` (rembg) y el Python de Sloth. Devuelve un PNG del mismo tamaño con el fondo transparente;
 * las zonas marcadas con «Conservar» se quedan como estaban.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { MarcaImagen } from '../../shared/estilos-imagen.ts'
import { rutaPythonSloth } from '../requisitos.ts'
import { SKILLS } from '../skills.ts'

const ejecutar = promisify(execFile)

export async function quitarFondo(app: string, referencia: string, marcas: MarcaImagen[]) {
  const script = join(SKILLS, 'video-base', 'scripts', 'recorte.py')
  const carpeta = await mkdtemp(join(tmpdir(), 'sloth-recorte-'))
  const salida = join(carpeta, 'sin-fondo.png')
  const python = rutaPythonSloth()
  try {
    await ejecutar(python ?? 'python', [...(python ? ['-E', '-s'] : []), '-B', '-X', 'utf8', script, referencia, salida, '--lienzo', `--conservar=${JSON.stringify(marcas)}`], {
      cwd: app, windowsHide: true, timeout: 300_000, env: { ...process.env, OMP_NUM_THREADS: '2' }
    })
    return await readFile(salida)
  } catch (error) {
    const fallo = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (fallo.code === 'ENOENT' || /No module named/i.test(fallo.stderr ?? ''))
      throw new Error('Para quitar el fondo hace falta el Python de Sloth con sus paquetes: bájalo en Opciones → Herramientas de video.')
    if (fallo.killed) throw new Error('Quitar el fondo tardó demasiado. Vuelve a intentarlo.')
    const detalle = fallo.stderr?.trim().split(/\r?\n/).at(-1)?.slice(0, 240)
    throw new Error(detalle ? `No se pudo quitar el fondo: ${detalle}` : 'No se pudo quitar el fondo.')
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {})
  }
}
