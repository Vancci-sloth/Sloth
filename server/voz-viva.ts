import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BANDERAS, motorSloth, rutaPythonSloth } from './requisitos.ts'

/** Lo más que se espera la respuesta: si está transcribiendo, contesta al acabar, y conectar ya dice que está vivo. */
const PACIENCIA = 5 * 60_000
let mirando = false

/**
 * Le dice a `voz_viva.py` que siga cargado, o lo carga si no está, cuando trabaja algún video (ADR 0011). Cargado antes de
 * que los agentes llenen la memoria tarda 46 s; con la memoria llena no llegó en 15 min, y todos los hilos esperaban detrás.
 * Con cada ping él cuenta otros 10 min; al acabar los videos deja de oírlos y se cierra. Solo donde transcribe Whisper.
 */
export async function mantenerVoz(skills: string) {
  if (mirando || motorSloth() !== 'whisper') return
  const python = rutaPythonSloth()
  if (!python) return
  mirando = true
  try {
    if (await vozResponde()) return
    await new Promise((fin) => {
      const script = join(skills, 'video-base', 'scripts', 'sloth.py')
      spawn(python, [...BANDERAS, script, 'calentar-voz'], { stdio: 'ignore', windowsHide: true }).once('error', fin).once('exit', fin)
    })
  } finally {
    mirando = false
  }
}

/** El mismo ping que `_pedir_voz` de sloth.py. */
function vozResponde(): Promise<boolean> {
  let puerto: number
  try {
    puerto = JSON.parse(readFileSync(join(tmpdir(), 'sloth-voz.json'), 'utf8')).puerto
  } catch {
    return Promise.resolve(false)
  }
  return new Promise((listo) => {
    const conexion = connect(puerto, '127.0.0.1')
    const fin = (vivo: boolean) => (clearTimeout(reloj), conexion.destroy(), listo(vivo))
    const reloj = setTimeout(() => fin(true), PACIENCIA)
    reloj.unref()
    conexion.once('connect', () => conexion.write('{"ping": true}\n'))
    conexion.once('data', () => fin(true))
    conexion.once('error', () => fin(false))
    conexion.once('close', () => fin(false))
  })
}
