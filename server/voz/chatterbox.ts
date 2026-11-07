import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EstadoChatterbox, VozApi } from '../../shared/types.ts'
import { segundosWav } from '../../shared/voz.ts'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'

/**
 * La voz con Chatterbox Multilingual (Resemble AI, MIT) en esta computadora: gratis, en español y en 22 idiomas más, y
 * clona una voz de una grabación de 10 a 20 s. Está **apagada** hasta que dices en Opciones → Voz dónde está el Python del
 * entorno donde lo instalaste (`pip install chatterbox-tts`; cómo, en `skills/video-base/VOZ.md`) o lo pones en
 * `SLOTH_CHATTERBOX_PYTHON`: Sloth no instala nada.
 *
 * Con ese Python corre `chatterbox-servidor.py`, un servidor pequeño en 127.0.0.1 que carga el modelo una vez (la
 * primera, lo baja: unos 3 GB) y se enciende solo cuando se pide una voz. Las voces son `chatterbox:base` (la del modelo)
 * y `chatterbox:<id>`, una grabación tuya en `data/voz/chatterbox/` que «Clonar tu voz» deja ahí.
 */

const AQUI = dirname(fileURLToPath(import.meta.url))
// Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el script a su lado.
const SCRIPT = VENTA ? join(AQUI, 'voz', 'chatterbox-servidor.py') : join(AQUI, 'chatterbox-servidor.py')
const AUDIO = /\.(wav|mp3|m4a|flac|ogg|opus)$/i
/** La primera vez baja el modelo: hasta 15 minutos para que responda. */
const ARRANQUE = 15 * 60_000

type F = typeof fetch

export interface OpcionesChatterbox {
  /** `data/voz`. */
  carpeta: string
  fetch?: F
  /** Cómo se lanza el servidor (en las pruebas, otra cosa). */
  lanzar?: (python: string, script: string, puerto: number) => ChildProcess | void
  /** Si el Python tiene `chatterbox` (en las pruebas, otra cosa). */
  probar?: (python: string) => Promise<boolean>
}

/** Si ese Python tiene el paquete `chatterbox`, sin importarlo (importarlo carga torch y tarda). */
const tienePaquete = (python: string) =>
  new Promise<boolean>((ok) =>
    execFile(python, ['-c', 'import importlib.util, sys; sys.exit(0 if importlib.util.find_spec("chatterbox") else 3)'], { windowsHide: true, timeout: 30_000 }, (e) => ok(!e))
  )

/** Un puerto libre de 127.0.0.1. */
const puertoLibre = () =>
  new Promise<number>((ok, mal) => {
    const s = createServer()
    s.once('error', mal)
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
  })

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function chatterbox(opts: OpcionesChatterbox) {
  const f = opts.fetch ?? fetch
  const archivo = join(opts.carpeta, 'chatterbox.json')
  const voces = join(opts.carpeta, 'chatterbox')
  let config: { python?: string; idioma?: string } = {}
  try {
    config = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no lo configuraste.
  }
  const python = () => process.env.SLOTH_CHATTERBOX_PYTHON || config.python || null
  /** Lo último que se supo del Python: `null` mientras se mira. */
  let instalado: boolean | null = null
  let error = ''
  let servidor: { proceso?: ChildProcess; puerto: number } | null = null
  let encendiendo: Promise<number> | null = null

  async function revisar() {
    const p = python()
    instalado = null
    instalado = !!p && existsSync(p) && (await (opts.probar ?? tienePaquete)(p))
  }
  void revisar()

  const misVoces = (): VozApi[] => {
    const tuyas = existsSync(voces) ? readdirSync(voces).filter((a) => AUDIO.test(a)) : []
    return [
      { id: 'base', nombre: 'Chatterbox', descripcion: 'la voz del modelo', propia: false },
      ...tuyas.map((a) => ({ id: a.slice(0, -extname(a).length), nombre: a.slice(0, -extname(a).length), descripcion: 'clonada de tu grabación', propia: true }))
    ]
  }

  function estado(): EstadoChatterbox {
    const p = python()
    const listo = !!p && instalado === true
    const texto = !p
      ? 'Apagado: di en qué Python instalaste chatterbox-tts.'
      : !existsSync(p)
        ? `No encuentro ${p}.`
        : instalado === null
          ? 'Mirando ese Python…'
          : !instalado
            ? `${p} no tiene el paquete chatterbox: instálalo con pip install chatterbox-tts en ese entorno.`
            : servidor
              ? 'Encendido, con el modelo cargado.'
              : 'Listo. Se enciende solo al pedir una voz (la primera vez baja el modelo, unos 3 GB).'
    return { python: p, listo, texto, voces: listo ? misVoces() : [], encendido: !!servidor, ...(error ? { error } : {}) }
  }

  /** Pone (o quita, con `null`) el Python del entorno de Chatterbox. Lo comprueba antes de guardarlo. */
  async function configurar(ruta: string | null) {
    const p = ruta?.trim() || undefined
    if (p && (!isAbsolute(p) || !existsSync(p))) throw new Error(`No encuentro ${p}: pon la ruta completa del Python del entorno (…/bin/python, o …\\Scripts\\python.exe en Windows).`)
    if (p && !(await (opts.probar ?? tienePaquete)(p))) throw new Error(`${p} no tiene el paquete chatterbox. En ese entorno: pip install chatterbox-tts.`)
    apagar()
    config = { ...config, python: p }
    mkdirSync(opts.carpeta, { recursive: true })
    guardar(archivo, JSON.stringify(config, null, 1))
    error = ''
    await revisar()
  }

  const responde = async (puerto: number) => {
    try {
      return (await f(`http://127.0.0.1:${puerto}/salud`, { signal: AbortSignal.timeout(2500) })).ok
    } catch {
      return false
    }
  }

  /** El puerto del servidor, encendiéndolo si hace falta. */
  function encender(): Promise<number> {
    if (servidor) return Promise.resolve(servidor.puerto)
    encendiendo ??= (async () => {
      const p = python()
      if (!p || !instalado) throw new Error(estado().texto)
      if (!existsSync(SCRIPT)) throw new Error(`Falta ${SCRIPT}.`)
      const puerto = await puertoLibre()
      const lanzar = opts.lanzar ?? ((py, script, n) => spawn(py, [script, '--puerto', String(n)], { windowsHide: true, stdio: 'ignore' }))
      const proceso = lanzar(p, SCRIPT, puerto) ?? undefined
      let salio = false
      proceso?.once('exit', () => ((salio = true), servidor?.proceso === proceso && (servidor = null)))
      for (const fin = Date.now() + ARRANQUE; Date.now() < fin && !salio; await espera(1500))
        if (await responde(puerto)) return (servidor = { proceso, puerto }).puerto
      proceso?.kill()
      throw new Error(salio ? 'El servidor de Chatterbox se cerró al cargar el modelo (¿torch sin CUDA, o falta memoria?). Pruébalo a mano con ese Python.' : 'Chatterbox no respondió en 15 minutos.')
    })().finally(() => (encendiendo = null))
    return encendiendo
  }

  function apagar() {
    servidor?.proceso?.kill()
    servidor = null
  }
  process.once('exit', apagar)

  /** La grabación de una voz tuya, si existe. */
  const referencia = (id: string) => (existsSync(voces) ? readdirSync(voces).find((a) => AUDIO.test(a) && a.slice(0, -extname(a).length) === id) : undefined)

  /** La voz `id` (`base` o una tuya) diciendo `texto`: el WAV de 16 bits y cuánto dura. */
  async function generar(id: string, texto: string): Promise<{ wav: Uint8Array; segundos: number }> {
    const ref = id === 'base' ? undefined : referencia(id)
    if (id !== 'base' && !ref) throw new Error(`No hay una voz «${id}» de Chatterbox: clónala en Opciones → Voz, o usa chatterbox:base.`)
    try {
      const puerto = await encender()
      const r = await f(`http://127.0.0.1:${puerto}/tts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texto, idioma: config.idioma ?? 'es', referencia: ref && join(voces, ref) }),
        signal: AbortSignal.timeout(30 * 60_000)
      })
      if (!r.ok) {
        const motivo = ((await r.json().catch(() => null)) as { error?: string } | null)?.error
        throw new Error(`Chatterbox respondió ${r.status}${motivo ? `: ${motivo}` : ''}.`)
      }
      const wav = new Uint8Array(await r.arrayBuffer())
      const segundos = segundosWav(wav)
      if (!segundos) throw new Error('Chatterbox no devolvió un WAV.')
      error = ''
      return { wav, segundos }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      throw e
    }
  }

  /** «Clonar tu voz»: guarda la grabación; Chatterbox la imita cada vez, sin entrenar nada. Devuelve su id. */
  function clonar(nombre: string, audio: Uint8Array, nombreArchivo: string): string {
    const ext = AUDIO.test(nombreArchivo) ? extname(nombreArchivo).toLowerCase() : '.wav'
    const id = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mi-voz'
    if (id === 'base') throw new Error('«base» es la voz de Chatterbox: ponle otro nombre.')
    mkdirSync(voces, { recursive: true })
    const vieja = referencia(id)
    if (vieja) rmSync(join(voces, vieja))
    guardar(join(voces, `${id}${ext}`), audio)
    return id
  }

  function quitar(id: string) {
    const r = referencia(id)
    if (r) rmSync(join(voces, r))
  }

  return { estado, configurar, generar, clonar, quitar, apagar, revisar }
}
