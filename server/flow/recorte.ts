import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { MarcaImagen } from '../../shared/estilos-imagen.ts'

const ejecutar = promisify(execFile)

export async function quitarFondo(app: string, referencia: string, marcas: MarcaImagen[]) {
  const script = join(process.env.SLOTH_SKILLS ?? join(app, 'skills'), 'video-base', 'scripts', 'recorte.py')
  const carpeta = await mkdtemp(join(tmpdir(), 'vymotion-recorte-'))
  const salida = join(carpeta, 'sin-fondo.png')
  try {
    await ejecutar('python', ['-B', script, referencia, salida, '--lienzo', `--conservar=${JSON.stringify(marcas)}`], {
      cwd: app, windowsHide: true, timeout: 300_000, env: { ...process.env, OMP_NUM_THREADS: '2' }
    })
    return await readFile(salida)
  } catch (error) {
    const fallo = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean }
    if (fallo.code === 'ENOENT' || /No module named/i.test(fallo.stderr ?? ''))
      throw new Error('Para quitar el fondo, instala Python y sus paquetes en Opciones → Equipo → Herramientas de video.')
    if (fallo.killed) throw new Error('El recorte tardó demasiado. Vuelve a intentarlo.')
    const detalle = fallo.stderr?.trim().split(/\r?\n/).at(-1)?.slice(0, 240)
    throw new Error(detalle ? `No se pudo quitar el fondo. ${detalle}` : 'No se pudo quitar el fondo.')
  } finally {
    await rm(salida, { force: true }).catch(() => {})
    await rmdir(carpeta).catch(() => {})
  }
}
