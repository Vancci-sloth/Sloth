import { execFile, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { cpus, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import type { Equipo } from '../shared/types.ts'
import { BANDERAS, instalacionDe, instalarMejora, MODELOS, mejoraDelPythonSloth, motorSloth, rutaPythonSloth } from './requisitos.ts'
import { CABEN } from './sessions.ts'

/**
 * Opciones → Tu equipo: qué tiene esta computadora y cómo trabaja Sloth en ella. Nadie tiene que elegir nada para que
 * funcione igual de bien en una vieja que en una con NVIDIA; Sloth lo elige solo y aquí lo dice:
 * - la voz, con Whisper en la NVIDIA o con Parakeet en el procesador (`MotorVoz`, al instalar el Python de Sloth);
 * - cuántos videos de un lote van a la vez (`CABEN` de sessions.ts);
 * - y cuánto tarda cada cosa, de `equipo.json` (junto a los modelos), que escriben cada transcripción
 *   (`python/procesos/medidas.py`) y el render de cada estilo (`video-base/scripts/equipo.cjs`).
 *
 * Sin nada medido, la voz se mide sola la primera vez que se abre, si nada trabaja (`medir.py`, unos 30 s con 30 s de
 * ruido); «Medir otra vez» la repite.
 *
 * Si hay una mejora (Parakeet en una sin NVIDIA que se instaló antes de que existiera), el hilo nuevo la ofrece arriba
 * y se baja con un clic (`instalarMejora`).
 */

const EQUIPO = join(dirname(MODELOS), 'equipo.json')

/** El nombre del procesador, sin las marcas registradas ni la frecuencia: «Intel Core i5-4590». */
export function nombreProcesador(modelo: string): string {
  return modelo.replace(/\((R|TM|tm|r)\)/g, '').replace(/\s+(CPU\s*)?@.*$/, '').replace(/\s+\d+-Core Processor\s*$/, '').replace(/\s+/g, ' ').trim()
}

const correr = (exe: string, args: string[]) =>
  new Promise<string>((ok) => execFile(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 15_000 }, (e, s) => ok(e ? '' : s)))

/** La tarjeta de video: la NVIDIA con su memoria, o la que diga el sistema. Una sola vez por arranque: no cambia. */
let tarjeta: Promise<string | undefined> | undefined
function tarjetaDeVideo(): Promise<string | undefined> {
  tarjeta ??= (async () => {
    const nvidia = (await correr('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'])).split(/\r?\n/)[0]
    if (nvidia?.includes(',')) {
      const [nombre, mib] = nvidia.split(',').map((x) => x.trim())
      return /\dGB/i.test(nombre) ? nombre : `${nombre} (${Math.round(Number(mib) / 1024)} GB)`
    }
    if (process.platform === 'win32') {
      const nombres = await correr('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_VideoController).Name'])
      return nombres.split(/\r?\n/).map((x) => x.trim()).find((x) => x && !/Basic|Remote|Virtual/i.test(x))
    }
    if (process.platform === 'darwin') return /Chipset Model:\s*(.+)/.exec(await correr('system_profiler', ['SPDisplaysDataType']))?.[1].trim()
    return /(?:VGA|3D)[^:]*:\s*(.+)/.exec(await correr('lspci', []))?.[1].trim()
  })()
  return tarjeta
}

function medido(): Pick<Equipo, 'voz' | 'render' | 'tresD'> {
  try {
    const d = JSON.parse(readFileSync(EQUIPO, 'utf8'))
    return { voz: d.voz, render: d.render?.final, tresD: d.render?.tarjeta }
  } catch {
    return {}
  }
}

export function equipo(o: { app: string; ocupado: () => string | null }) {
  let midiendo = false
  let error: string | undefined
  let probado = false
  // Mirar la mejora es lanzar el Python de Sloth (~1 s) y el hilo nuevo la pide cada vez: se recuerda un minuto, y se
  // vuelve a mirar en cuanto termina de instalarse.
  let mejora: { hay: boolean; cuando: number; instalaba: boolean } | undefined

  async function hayMejora(): Promise<Equipo['mejora']> {
    const estado = instalacionDe('mejora')
    const instala = !!estado.estado
    if (!mejora || (mejora.instalaba && !instala) || Date.now() - mejora.cuando > 60_000) {
      mejora = { hay: !!(await mejoraDelPythonSloth(o.app))?.length, cuando: Date.now(), instalaba: instala }
    }
    mejora.instalaba = instala
    return mejora.hay || instala ? { ...estado } : undefined
  }

  /** Mide la voz con `medir.py`. Sin Python de Sloth o con algo trabajando, no. */
  function medir(): string | null {
    const python = rutaPythonSloth()
    if (!python) return 'Antes hay que descargar el Python de Sloth (Herramientas de video).'
    const ocupado = o.ocupado()
    if (ocupado) return ocupado
    if (midiendo) return null
    midiendo = true
    error = undefined
    const p = spawn(python, [...BANDERAS, 'medir.py'], { cwd: join(o.app, 'python', 'procesos'), windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    let errores = ''
    p.stderr.on('data', (d) => (errores += d))
    p.on('error', (e) => ((error = e.message), (midiendo = false)))
    p.on('exit', (codigo) => {
      midiendo = false
      if (codigo) error = errores.trim().split(/\r?\n/).pop() || `medir.py salió con ${codigo}`
    })
    p.stdin.end(JSON.stringify({ files: [], options: { modelos: MODELOS } }))
    return null
  }

  async function leer(): Promise<Equipo> {
    const instalado = motorSloth()
    const falta = await hayMejora()
    // Sin Parakeet todavía, uno sin NVIDIA transcribe con Whisper en el procesador.
    const motor = instalado === 'parakeet' && falta && !falta.estado ? 'whisper' : instalado
    const lo = medido()
    // Lo medido con otro motor (antes de cambiar de tarjeta) ya no dice nada de este.
    if (lo.voz?.motor !== motor) delete lo.voz
    // La primera vez que se mira sin nada medido, se mide sola (con Whisper no mide: ver medir.py).
    if (!probado && !lo.voz && motor?.startsWith('parakeet') && !o.ocupado()) {
      probado = true
      medir()
    }
    return {
      procesador: nombreProcesador(cpus()[0]?.model ?? ''),
      hilos: cpus().length,
      memoria: totalmem(),
      tarjeta: await tarjetaDeVideo(),
      motor,
      nvidia: instalado === 'whisper',
      ...lo,
      aLaVez: CABEN,
      mejora: falta,
      midiendo,
      error
    }
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    const enviar = (codigo: number, cuerpo: unknown) => {
      res.writeHead(codigo, { 'content-type': 'application/json' })
      res.end(JSON.stringify(cuerpo))
    }
    if (path === '/api/equipo' && req.method === 'GET') return enviar(200, await leer()), true
    if (path === '/api/equipo/medir' && req.method === 'POST') {
      const no = medir()
      return no ? enviar(409, { error: no }) : enviar(200, await leer()), true
    }
    if (path === '/api/equipo/mejorar' && req.method === 'POST') {
      instalarMejora(o.app)
      // Con Parakeet puesto, lo medido con Whisper ya no vale: se vuelve a medir sola.
      probado = false
      return enviar(200, await leer()), true
    }
    return false
  }

  return { api, ocupado: () => (midiendo ? 'Sloth está midiendo tu equipo. Espera unos segundos.' : null) }
}
