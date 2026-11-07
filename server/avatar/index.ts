import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { type EstadoAvatar, type FlujoInfo, MOTORES, type MotorAvatar, type TrabajoAvatar, esMotor } from '../../shared/avatar.ts'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'
import { cuerpo } from '../http.ts'
import { escribir, leer } from '../opciones.ts'
import * as comfy from './comfy.ts'
import { FLUJOS, type FlujoDef, flujoDe, importarFlujo, leerFlujo, pesoPuesto, prepararFlujo } from './flujos.ts'
import * as hey from './heygen.ts'

/**
 * El motor de avatar: de la voz ya hecha (y un video o una imagen del personaje) saca el video del personaje hablando. Los
 * agentes lo piden con el MCP `avatar` (`mcp.mjs`: `motores`, `generar_avatar`, `estado_avatar`, `avatares_heygen`); la
 * línea `Avatar: <motor>` del primer mensaje (`shared/avatar.ts`) dice cuál eligió el usuario. Los motores:
 * - `sprites`: el de siempre (boca abierta y cerrada, con los scripts de cada skill). Aquí no se genera nada.
 * - `comfyui-local`: los labios con LatentSync 1.5 (o MuseTalk, de respaldo) en el ComfyUI del usuario (`comfy.ts`,
 *   `flujos.ts`). **Apagado** hasta que ComfyUI responde con sus nodos: Sloth no instala ni arranca nada.
 * - `heygen`: la API oficial de HeyGen (`heygen.ts`) con la llave del usuario, que gasta sus créditos.
 * Nada que gaste dinero corre solo: lo pide el agente, con su audio y su salida, cuando la línea lo dice.
 *
 * La llave de HeyGen va a las variables del usuario (`HEYGEN_API_KEY`, `server/opciones.ts`), como las de la voz: la leen
 * también las skills `heygen-*`. Lo demás (la dirección y la carpeta de ComfyUI, los flujos importados) va en `data/avatar/`.
 */

const ESPERA_MAXIMA = 50_000
const LLAVE_HEYGEN = 'HEYGEN_API_KEY'

interface Config {
  /** Donde escucha ComfyUI. */
  comfyUrl?: string
  /** Su carpeta (con `main.py`), para mirar los pesos en disco. */
  comfyCarpeta?: string
}

export interface OpcionesAvatar {
  /** `data/` de la app. */
  datos: string
  fetch?: typeof fetch
}

export function avatar(opts: OpcionesAvatar) {
  const f = opts.fetch ?? fetch
  const carpeta = join(opts.datos, 'avatar')
  const flujos = join(carpeta, 'flujos')
  const archivo = join(carpeta, 'config.json')
  let config: Config = {}
  try {
    config = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no se configuró: ComfyUI en su dirección de siempre.
  }
  const base = () => (config.comfyUrl || comfy.BASE_COMFY).replace(/\/+$/, '')
  const llaveHeygen = () => process.env[LLAVE_HEYGEN] || leer(LLAVE_HEYGEN)
  // Las skills de HeyGen avisan a HeyGen de cómo fue cada tarea con su CLI: aquí no, salvo que el usuario lo quiera.
  process.env.HEYGEN_NO_ANALYTICS ??= '1'

  const trabajos = new Map<string, TrabajoAvatar>()
  /** La GPU hace una cosa a la vez. */
  let fila: Promise<unknown> = Promise.resolve()
  const enFila = <T>(fn: () => Promise<T>) => {
    const r = fila.then(fn, fn)
    fila = r.catch(() => {})
    return r
  }

  // ── El estado ────────────────────────────────────────────────────────────────────────────────────────────────

  /** Qué le falta a un flujo, con ComfyUI respondiendo (`nodos`) o no. */
  function faltaDe(def: FlujoDef, nodos: Set<string> | null): string[] {
    const falta: string[] = []
    if (!nodos) falta.push(`ComfyUI abierto en ${base()}`)
    else for (const n of def.nodos) if (!nodos.has(n.clase)) falta.push(`el nodo ${n.clase} (${n.repo})`)
    if (config.comfyCarpeta) for (const p of def.pesos) if (!pesoPuesto(config.comfyCarpeta, p)) falta.push(`el peso ${p.destino}`)
    if (!leerFlujo(def.id, flujos)) falta.push('importar su flujo (formato API)')
    return falta
  }

  async function estado(): Promise<EstadoAvatar> {
    const stats = await comfy.detectar(base(), f)
    const nodos = stats ? await comfy.nodosDisponibles(base(), f).catch(() => null) : null
    const lista: FlujoInfo[] = FLUJOS.map((x) => {
      const falta = faltaDe(x, nodos)
      return { id: x.id, nombre: x.nombre, vramGB: x.vramGB, nota: x.nota, licencia: x.licencia, fuente: x.fuente, flujo: x.flujo, sinFlujo: !leerFlujo(x.id, flujos), listo: !falta.length, falta }
    })
    const listos = lista.filter((x) => x.listo)
    const llave = llaveHeygen()
    const detalles: Record<MotorAvatar, [boolean, string]> = {
      sprites: [true, 'Siempre disponible.'],
      'comfyui-local': [
        listos.length > 0,
        listos.length ? `Listo: ${listos.map((x) => x.nombre).join(' y ')}.` : stats ? `ComfyUI responde, pero a LatentSync le falta ${lista[0].falta.join(', ')}.` : `Apagado: no hay ComfyUI en ${base()}.`
      ],
      heygen: [!!llave, llave ? 'Llave puesta (cada video gasta créditos de HeyGen).' : 'Sin llave de HeyGen.']
    }
    return {
      motores: MOTORES.map((m) => ({ ...m, listo: detalles[m.id][0], detalle: detalles[m.id][1] })),
      comfy: { url: base(), carpeta: config.comfyCarpeta ?? null, corriendo: !!stats, version: stats?.version, gpu: stats?.gpu, vramLibreGB: stats?.vramLibreGB },
      flujos: lista,
      heygen: { llave: llave ? llave.slice(-4) : null }
    }
  }

  // ── Generar ──────────────────────────────────────────────────────────────────────────────────────────────────

  const absoluta = (ruta: string | undefined, que: string, ext?: RegExp) => {
    if (!ruta || !isAbsolute(ruta) || (ext && !ext.test(ruta))) throw new Error(`${que}: pasa una ruta absoluta${ext ? ` (${ext.source.replace(/[\\$()]/g, '')})` : ''}.`)
    return resolve(ruta)
  }
  const existente = (ruta: string | undefined, que: string) => {
    const r = absoluta(ruta, que)
    if (!existsSync(r)) throw new Error(`No encuentro ${que}: ${r}`)
    return r
  }

  interface Pedido {
    motor: string
    flujo?: string
    imagen?: string
    video?: string
    audio?: string
    guion?: string
    salida?: string
    avatarHeygen?: string
    vozHeygen?: string
    formato?: 'vertical' | 'horizontal'
  }

  async function correrComfy(t: TrabajoAvatar, p: Pedido) {
    const salida = absoluta(p.salida, 'salida', /\.mp4$/i)
    const audio = existente(p.audio, 'audio')
    if (!p.video && !p.imagen) throw new Error('Pasa un video del personaje (o una imagen, que se hace video quieto) y el audio.')
    const nodos = (await comfy.detectar(base(), f)) ? await comfy.nodosDisponibles(base(), f) : null
    // El pedido, o el primero listo: LatentSync antes que MuseTalk.
    const def = p.flujo ? flujoDe(p.flujo) : FLUJOS.find((x) => !faltaDe(x, nodos).length)
    if (!def) throw new Error(p.flujo ? `No conozco el flujo «${p.flujo}». Los hay: ${FLUJOS.map((x) => x.id).join(', ')}.` : `Ningún flujo de ComfyUI está listo: a LatentSync le falta ${faltaDe(FLUJOS[0], nodos).join(', ')}. Usa sprites.`)
    const falta = faltaDe(def, nodos)
    if (falta.length) throw new Error(`A ${def.nombre} le falta ${falta.join(', ')}. Usa sprites.`)
    const g = leerFlujo(def.id, flujos)!
    t.paso = 'Subiendo los archivos a ComfyUI…'
    let video = p.video ? existente(p.video, 'video') : undefined
    const imagen = p.imagen ? existente(p.imagen, 'imagen') : undefined
    if (!video && !g.mapeo.imagen && imagen) video = await imagenAVideo(imagen, audio, join(dirname(salida), '_entrada-avatar.mp4'))
    const prompt = prepararFlujo(g, {
      audio: await comfy.subirArchivo(audio, base(), f),
      ...(video && g.mapeo.video ? { video: await comfy.subirArchivo(video, base(), f) } : {}),
      ...(imagen && g.mapeo.imagen && !(video && g.mapeo.video) ? { imagen: await comfy.subirArchivo(imagen, base(), f) } : {})
    })
    t.paso = `En la cola de ComfyUI (${def.nombre}): puede tardar varios minutos por minuto de video.`
    const id = await comfy.encolar(prompt, base(), f)
    const salidas = await comfy.esperar(id, { base: base(), f, alAvanzar: () => (t.paso = `ComfyUI trabaja (${def.nombre})…`) })
    const hecho = comfy.elVideo(salidas)
    if (!hecho) throw new Error('ComfyUI terminó, pero el flujo no dejó un video (su nodo de salida debe ser VHS_VideoCombine o SaveVideo).')
    await comfy.bajar(hecho, salida, base(), f)
    t.archivo = salida
  }

  async function correrHeygen(t: TrabajoAvatar, p: Pedido) {
    const llave = llaveHeygen()
    if (!llave) throw new Error('No hay llave de HeyGen: que el usuario la ponga en Opciones → Avatar.')
    const salida = absoluta(p.salida, 'salida', /\.mp4$/i)
    if (!p.avatarHeygen) throw new Error('Falta avatar_heygen: el id de un avatar (herramienta avatares_heygen).')
    t.paso = 'Pidiendo el video a HeyGen (gasta créditos)…'
    const id = await hey.crearVideo(llave, { avatar: p.avatarHeygen, audio: p.audio ? existente(p.audio, 'audio') : undefined, guion: p.guion, voz: p.vozHeygen, formato: p.formato === 'horizontal' ? '16:9' : '9:16' }, f)
    for (let i = 0; i < 360; i++) {
      const e = await hey.estadoVideo(llave, id, f)
      t.paso = `HeyGen: ${e.estado} (video ${id})`
      if (e.estado === 'error') throw new Error(e.error)
      if (e.estado === 'lista' && e.url) {
        await hey.bajarVideo(e.url, salida, f)
        t.archivo = salida
        return
      }
      await new Promise((r) => setTimeout(r, 5000))
    }
    throw new Error(`HeyGen no terminó en 30 minutos. El video ${id} sigue en tu cuenta de HeyGen.`)
  }

  function pedir(p: Pedido): TrabajoAvatar {
    if (!esMotor(p.motor)) throw new Error(`No hay motor «${p.motor}». Los hay: ${MOTORES.map((m) => m.id).join(', ')}.`)
    const t: TrabajoAvatar = { id: randomBytes(6).toString('hex'), estado: 'en-fila', motor: p.motor }
    trabajos.set(t.id, t)
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    if (p.motor === 'sprites') return Object.assign(t, { estado: 'lista' as const, paso: 'sprites no se genera aquí: sigue con los scripts de tu skill, como siempre.' })
    const motor = p.motor
    void enFila(async () => {
      t.estado = 'generando'
      try {
        await (motor === 'comfyui-local' ? correrComfy(t, p) : correrHeygen(t, p))
        t.estado = 'lista'
      } catch (e) {
        t.estado = 'error'
        t.error = mensaje(e)
      }
    })
    return t
  }

  // ── La API ───────────────────────────────────────────────────────────────────────────────────────────────────

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/avatar')) return false
    const metodo = req.method ?? 'GET'
    const enviar = (status: number, datos: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(datos))
      return true
    }
    try {
      if (path === '/api/avatar' && metodo === 'GET') return enviar(200, await estado())
      if (path === '/api/avatar/heygen/llave' && metodo === 'POST') {
        const llave = (await cuerpo<{ llave?: string | null }>(req)).llave?.trim() || null
        // Se prueba antes de guardarla (no gasta créditos): una mala no se queda.
        if (llave) await hey.probar(llave, f)
        escribir(LLAVE_HEYGEN, llave)
        return enviar(200, await estado())
      }
      if (path === '/api/avatar/comfy' && metodo === 'POST') {
        const d = await cuerpo<{ url?: string; carpeta?: string }>(req)
        if (typeof d.url === 'string' && d.url.trim() && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(d.url.trim())) return enviar(400, { error: 'ComfyUI tiene que estar en esta computadora: http://127.0.0.1:<puerto>.' })
        if (typeof d.carpeta === 'string' && d.carpeta.trim() && !existsSync(join(d.carpeta.trim(), 'main.py'))) return enviar(400, { error: 'Esa carpeta no tiene main.py: elige la de ComfyUI (en el portable, la de adentro).' })
        if (typeof d.url === 'string') config.comfyUrl = d.url.trim() || undefined
        if (typeof d.carpeta === 'string') config.comfyCarpeta = d.carpeta.trim() || undefined
        mkdirSync(carpeta, { recursive: true })
        guardar(archivo, JSON.stringify(config, null, 1))
        return enviar(200, await estado())
      }
      if (path === '/api/avatar/flujo' && metodo === 'POST') {
        const d = await cuerpo<{ id?: string; json?: string }>(req)
        importarFlujo(d.id ?? '', d.json ?? '', flujos)
        return enviar(200, await estado())
      }
      if (path === '/api/avatar/heygen/avatares' && metodo === 'GET') {
        const llave = llaveHeygen()
        if (!llave) return enviar(409, { error: 'No hay llave de HeyGen.' })
        return enviar(200, { avatares: await hey.listarAvatares(llave, f) })
      }
      if (path === '/api/avatar/generar' && metodo === 'POST') return enviar(200, pedir(await cuerpo<Pedido>(req)))
      const t = /^\/api\/avatar\/trabajos\/(\w+)$/.exec(path)
      if (t && metodo === 'GET') {
        const trabajo = trabajos.get(t[1])
        if (!trabajo) return enviar(404, { error: 'No conozco ese trabajo: Sloth se reinició. Vuelve a pedirlo.' })
        const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
        while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await new Promise((r) => setTimeout(r, 500))
        return enviar(200, trabajo)
      }
    } catch (e) {
      return enviar(400, { error: mensaje(e) })
    }
    return false
  }

  return {
    api,
    /** Por qué no se puede reiniciar el servidor: cortaría un video a medias. */
    ocupado: (): string | null => ([...trabajos.values()].some((t) => t.estado === 'generando' || t.estado === 'en-fila') ? 'Sloth está generando un video de avatar. Espera a que termine.' : null)
  }
}

const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]

/** Un video quieto con la imagen y lo que dura el audio, para los flujos que piden video. Pide FFmpeg. */
function imagenAVideo(imagen: string, audio: string, salida: string): Promise<string> {
  mkdirSync(dirname(salida), { recursive: true })
  return new Promise((ok, mal) => {
    const p = spawn('ffmpeg', ['-y', '-loop', '1', '-i', imagen, '-i', audio, '-shortest', '-r', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', salida], { windowsHide: true, stdio: 'ignore' })
    p.on('error', () => mal(new Error('Este flujo pide un video y solo hay una imagen; para convertirla hace falta FFmpeg. Pasa un video del personaje.')))
    p.on('exit', (c) => (c === 0 ? ok(salida) : mal(new Error('FFmpeg no pudo hacer un video de la imagen.'))))
  })
}

/** El MCP `avatar` para los agentes (`mcp.mjs`): lo corre el Node de Sloth y habla con la API de este servidor. */
export function mcpAvatar(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  // Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el MCP a su lado.
  const script = VENTA ? join(aqui, 'avatar', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.SLOTH_URL) return {}
  return { avatar: { type: 'stdio', command: process.execPath, args: [script], env: { SLOTH_URL: process.env.SLOTH_URL } } }
}
