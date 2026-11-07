import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { EstadoVoicesCloning, VozApi } from '../../shared/types.ts'
import { trozosParaVoz, wavDePcm } from '../../shared/voz.ts'
import { guardar } from '../disco.ts'
import { bytes, cuerpo, json as enviar } from '../http.ts'
import { COBRO } from '../licencia.ts'

/**
 * Voices Cloning (https://www.voicescloning.art), el proveedor de voz de Sloth, visto desde esta computadora. No hay
 * llave aquí: la del socio la guarda el cobro (`licencias/src/voz.ts`), que sabe quién eres (tu cuenta o tu apoyo, o el
 * creador con su llave de `publicar.txt`) y gasta tus créditos, no los de otro. Sus voces van como `vc:<voice_id>`.
 *
 * Sus voces se ven en el menú «Voz» de Sloth, como las demás: con el pase de una hora que da el cobro (`/voz/sesion`),
 * este servidor pide a su API (la misma que usa su ventana, `embed.js`) los proveedores, el catálogo con su búsqueda y
 * sus filtros, y clona tu voz (`/api/voz/vc/proveedores`, `/catalogo`, `/clonar`). La que eliges o clonas se guarda en
 * `data/voz/voices-cloning.json`. Su ventana queda para lo demás que ofrecen (diálogo, texto largo, transcribir). Generar es pedir el guion por
 * trozos (`MAX` letras) a `/voz/tts`; cada trozo llega en MP3, que ffmpeg pasa a PCM, y se juntan en el mismo WAV de 16
 * bits que dan los demás motores, así que las skills no cambian. Si un trozo tarda de más (504 con `task_id`), se espera
 * su tarea; si hay mucha demanda (429), lo que diga `Retry-After`.
 *
 * Y la sección Administrador del creador (`/api/admin*`, `web/src/Admin.tsx`): pasa al cobro tal cual, solo con su
 * llave. En cualquier otra computadora no existe.
 */

type Credencial = { clave: string; equipo: string } | { llave: string }

const NUBE = process.env.SLOTH_COBRO || COBRO
/** Lo que se pide de una vez: el cobro acepta 5.000 letras; un poco menos deja sitio a las frases enteras. */
const MAX = 4500
/** El PCM que se junta: mono, 44,1 kHz. */
const FRECUENCIA = 44_100
const RESPIRO = 0.3
/** Lo más que se espera una tarea que tardó. */
const ESPERA_TAREA = 10 * 60_000
const SIN_CUENTA = 'Para usar las voces de Sloth, crea tu cuenta gratis de Sloth (Opciones → Apoyo).'
const SIN_CONEXION = 'No hay conexión con Sloth para pedir sus voces. Revisa tu internet.'
/** Su API, la que usa su ventana, con el pase de sesión (`Authorization: Bearer et_…`). */
const VC = 'https://www.voicescloning.art'
/** Los proveedores que tiene dentro (`/api/v1/providers`), y lo que se puede pedir de su catálogo. */
const PROVEEDORES_VC = /^(elevenlabs|edge|minimax|vbee|fishaudio|clone)$/
const FILTROS_VC = ['gender', 'accent', 'age', 'category'] as const
/** El país de una voz por su `locale` (`es-MX`), como se dice de una voz: «mexicana». */
const PAISES: Record<string, [pais: string, de: string]> = {
  MX: ['México', 'mexicana'], AR: ['Argentina', 'argentina'], ES: ['España', 'de España'], CO: ['Colombia', 'colombiana'],
  CL: ['Chile', 'chilena'], PE: ['Perú', 'peruana'], VE: ['Venezuela', 'venezolana'], US: ['Estados Unidos', 'estadounidense'],
  BO: ['Bolivia', 'boliviana'], EC: ['Ecuador', 'ecuatoriana'], UY: ['Uruguay', 'uruguaya'], PY: ['Paraguay', 'paraguaya'],
  CR: ['Costa Rica', 'costarricense'], CU: ['Cuba', 'cubana'], DO: ['República Dominicana', 'dominicana'], GT: ['Guatemala', 'guatemalteca'],
  HN: ['Honduras', 'hondureña'], NI: ['Nicaragua', 'nicaragüense'], PA: ['Panamá', 'panameña'], PR: ['Puerto Rico', 'puertorriqueña'],
  SV: ['El Salvador', 'salvadoreña'], GQ: ['Guinea Ecuatorial', 'ecuatoguineana']
}
/** El nombre de una voz de Edge, que viene técnico («es-AR-ElenaNeural»): «Elena (Argentina)». Las demás, tal cual. */
/** Un error del cobro como lo lee el cliente: «las voces de Sloth», sin el nombre del socio. */
export function sinSocio(error: string): string {
  return error
    .replace(/(créditos de voz|usuario) de (las voces de )?Voices Cloning/g, '$1 de Sloth')
    .replace(/(las )?voces de Voices Cloning( en Sloth)?/g, 'las voces de Sloth')
    .replace(/Voices Cloning/g, 'las voces de Sloth')
    .replace(/(^|[.:] )las/g, (_, a: string) => `${a}Las`)
}

export function nombreVc(nombre: string): string {
  const m = /^[a-z]{2,3}-([A-Z]{2})-([A-Z][a-z]+)(?:Multilingual)?Neural$/.exec(nombre.trim())
  return m ? `${m[2]} (${PAISES[m[1]]?.[0] ?? m[1]})` : nombre.trim()
}
const correr = promisify(execFile)

class Fallo extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

interface Respuesta<T> {
  status: number
  datos: T & { error?: string; code?: string; task_id?: string | number }
  espera?: number
}

/** `carpeta`: `data/voz`. `credencial`: con qué se habla al cobro; `creador`: la llave del creador, si esta es su computadora. */
export function voicesCloning(carpeta: string, o: { credencial(): Credencial | undefined | Promise<Credencial | undefined>; creador(): { llave: string } | undefined }) {
  const archivo = join(carpeta, 'voices-cloning.json')
  let voces: VozApi[] = []
  try {
    voces = (JSON.parse(readFileSync(archivo, 'utf8')) as { voces?: VozApi[] }).voces ?? []
  } catch {
    // Aún no has elegido ninguna.
  }
  let info: Omit<EstadoVoicesCloning, 'voces' | 'disponible'> & { configurado: boolean } = { configurado: false, creador: false }
  let error = ''
  const guardarVoces = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivo, JSON.stringify({ voces }, null, 1)))

  async function pedir<T>(ruta: string, init: { metodo?: string; json?: unknown; con?: Credencial; espera?: number } = {}): Promise<Respuesta<T>> {
    const c = init.con ?? (await o.credencial())
    if (!c) throw new Fallo(401, SIN_CUENTA)
    const quien: Record<string, string> = 'llave' in c ? { authorization: `Bearer ${c.llave}` } : { 'x-sloth-clave': c.clave, 'x-sloth-equipo': c.equipo }
    let r: Response
    try {
      r = await fetch(`${NUBE}${ruta}`, {
        method: init.metodo ?? (init.json === undefined ? 'GET' : 'POST'),
        headers: { ...quien, ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
        signal: AbortSignal.timeout(init.espera ?? 30_000)
      })
    } catch {
      throw new Fallo(502, SIN_CONEXION)
    }
    const datos = ((await r.json().catch(() => ({}))) ?? {}) as Respuesta<T>['datos']
    // Al cliente las voces son de Sloth: un cobro de antes aún nombra al socio en sus errores (Administrador lo ve tal cual).
    if (!ruta.startsWith('/voz/admin') && typeof datos.error === 'string') datos.error = sinSocio(datos.error)
    const espera = Number(r.headers.get('retry-after'))
    return { status: r.status, datos, ...(Number.isFinite(espera) && espera > 0 ? { espera } : {}) }
  }

  /** El pase de una hora para su API, pedido al cobro y guardado hasta 5 minutos antes de que caduque. */
  let pase: { token: string; hasta: number } | undefined
  /** Sus proveedores con cuántas voces trae cada uno (`/api/v1/providers`), hasta `hasta`. */
  let proveedores: { lista: { id: string; nombre: string; voces: number; aviso?: string }[]; hasta: number } | undefined
  async function conPase(): Promise<string> {
    if (pase && pase.hasta - 5 * 60_000 > Date.now()) return pase.token
    const s = await pedirBien<{ token: string; expires_at?: string }>('/voz/sesion', { json: {} })
    pase = { token: s.token, hasta: (s.expires_at && Date.parse(s.expires_at)) || Date.now() + 50 * 60_000 }
    return pase.token
  }

  /** Su API con el pase. Si caducó antes de tiempo (401), se pide otro una vez. */
  async function suApi<T>(ruta: string, init: { form?: FormData } = {}): Promise<T> {
    for (let intento = 0; ; intento++) {
      let r: Response
      try {
        r = await fetch(`${VC}${ruta}`, { method: init.form ? 'POST' : 'GET', headers: { authorization: `Bearer ${await conPase()}` }, body: init.form, signal: AbortSignal.timeout(2 * 60_000) })
      } catch {
        throw new Fallo(502, 'No hay conexión con las voces de Sloth. Revisa tu internet.')
      }
      if (r.status === 401 && intento === 0) {
        pase = undefined
        continue
      }
      const datos = ((await r.json().catch(() => ({}))) ?? {}) as T & { error?: string }
      if (!r.ok) throw new Fallo(r.status, datos.error ?? `Las voces de Sloth respondieron ${r.status}.`)
      return datos
    }
  }

  async function pedirBien<T>(ruta: string, init?: Parameters<typeof pedir>[1]): Promise<T> {
    const r = await pedir<T>(ruta, init)
    if (r.status >= 400) throw new Fallo(r.status, r.datos.error ?? `El cobro de Sloth respondió ${r.status}.`)
    return r.datos
  }

  /** Vuelve a preguntar si se puede usar y cuántos créditos quedan. */
  async function refrescar() {
    try {
      const d = await pedirBien<{ disponible: boolean; creador: boolean; mensuales?: number; creditos?: number; usados?: number; hoy?: number; generaciones?: number; estado?: string }>('/voz')
      info = { configurado: d.disponible, creador: d.creador, mensuales: d.mensuales, creditos: d.creditos, usados: d.usados, hoy: d.hoy, generaciones: d.generaciones, estado: d.estado }
      error = ''
    } catch (e) {
      // Sin cuenta de Sloth no es un error: solo no se ofrece.
      error = e instanceof Fallo && e.status === 401 ? '' : mensaje(e)
      if (e instanceof Fallo && e.status === 401) info = { configurado: false, creador: false }
    }
  }
  // Al arrancar, cuando la licencia ya leyó su clave, y luego cada media hora.
  setTimeout(() => void refrescar(), 3000).unref()
  setInterval(() => void refrescar(), 30 * 60_000).unref()

  function estado(): EstadoVoicesCloning {
    const { configurado, ...resto } = info
    // Se ofrece al creador y a quien tiene (o tuvo) créditos: con 0 desde el alta, no le serviría de nada.
    const disponible = configurado && (info.creador || (info.creditos ?? 0) > 0 || (info.usados ?? 0) > 0 || voces.length > 0)
    return { disponible, ...resto, voces, ...(error ? { error } : {}) }
  }

  /** Un trozo, ya en PCM. Espera lo que tardó (504) y la demanda (429); lo demás falla con el porqué. */
  async function trozo(id: string, texto: string): Promise<Uint8Array> {
    for (let intento = 0; ; intento++) {
      const r = await pedir<{ audio_url?: string; credits_used?: number; credits_remaining?: number }>('/voz/tts', { json: { text: texto, voice_id: id }, espera: 6 * 60_000 })
      let listo = r.status === 200 ? r.datos : undefined
      if (r.status === 504 && r.datos.task_id !== undefined) listo = await tarea(String(r.datos.task_id))
      if (listo?.audio_url) {
        if (typeof listo.credits_remaining === 'number') info.creditos = listo.credits_remaining
        if (typeof listo.credits_used === 'number') info.usados = (info.usados ?? 0) + listo.credits_used
        return pcmDeMp3(await bajar(listo.audio_url))
      }
      const otraVez = r.status === 429 || r.status === 504 || (r.status === 200 && !listo?.audio_url)
      if (otraVez && intento < 3) {
        await espera(Math.min(60, r.espera ?? [5, 15, 30][intento]) * 1000)
        continue
      }
      throw new Fallo(r.status, r.datos.error ?? `Las voces de Sloth respondieron ${r.status}.`)
    }
  }

  /** Una tarea que tardó: se consulta cada 4 s hasta que acaba. Si falla (502, no se cobra), `undefined` para pedirla otra vez. */
  async function tarea(id: string) {
    const hasta = Date.now() + ESPERA_TAREA
    while (Date.now() < hasta) {
      await espera(4000)
      const r = await pedir<{ audio_url?: string; credits_used?: number; credits_remaining?: number }>(`/voz/tareas/${encodeURIComponent(id)}`)
      if (r.status === 200) return r.datos
      if (r.status !== 202) return
    }
  }

  return {
    estado,
    refrescar,
    /** Si una voz `vc:<id>` se puede generar aquí. */
    puede: () => info.configurado,

    /** El pase de la ventana de voces (1 h). Te da de alta la primera vez. */
    async sesion(): Promise<{ token: string; expires_at?: string }> {
      const s = await pedirBien<{ token: string; expires_at?: string }>('/voz/sesion', { json: {} })
      void refrescar()
      return s
    },

    /** La voz que elegiste (o clonaste): va primero en el menú, con cómo suena y su muestra si las da. */
    elegida(v: { voice_id?: unknown; name?: unknown; provider?: unknown; descripcion?: unknown; muestra?: unknown }, clonada = false) {
      const id = String(v.voice_id ?? '').trim()
      if (!id || id.length > 200) throw new Fallo(400, 'La ventana no dio el id de la voz.')
      const nombre = String(v.name ?? '').trim().slice(0, 80) || (clonada ? 'Mi voz' : id)
      const antes = voces.find((x) => x.id === id)
      const descripcion = clonada ? 'Tu voz clonada' : String(v.descripcion ?? '').trim().slice(0, 80) || String(v.provider ?? '').trim().slice(0, 60) || antes?.descripcion || ''
      const muestra = typeof v.muestra === 'string' && /^https:\/\/www\.voicescloning\.art\/api\/media\//.test(v.muestra) ? v.muestra : antes?.muestra
      const de = String(v.provider ?? '').trim().slice(0, 40) || antes?.de
      voces = [{ id, nombre, descripcion, propia: clonada || !!antes?.propia, ...(muestra ? { muestra } : {}), ...(de ? { de } : {}) }, ...voces.filter((x) => x.id !== id)].slice(0, 50)
      guardarVoces()
    },

    /** Quita una del menú (en Voices Cloning sigue igual). */
    quitar(id: string) {
      voces = voces.filter((x) => x.id !== id)
      guardarVoces()
    },

    nombre: (id: string) => voces.find((v) => v.id === id)?.nombre,

    /** La voz de un guion entero, como WAV, y cuánto dura. */
    async generar(id: string, texto: string): Promise<{ wav: Uint8Array; segundos: number }> {
      if (!info.configurado) await refrescar()
      if (!info.configurado) throw new Error(error || 'Las voces de Sloth no están disponibles en esta computadora: hace falta la cuenta de Sloth (Opciones → Apoyo). Mientras, pídele la voz al usuario.')
      const partes: Uint8Array[] = []
      for (const t of trozosParaVoz(texto, MAX)) partes.push(await trozo(id, t))
      void refrescar()
      const wav = wavDePcm(partes, FRECUENCIA, 1, 16, RESPIRO)
      return { wav, segundos: (wav.length - 44) / (FRECUENCIA * 2) }
    },

    /**
     * `/api/admin*`, solo en la computadora del creador. `GET /api/admin`: si lo es. Lo demás (`/api/admin/voz…`) va al
     * cobro (`/voz/admin…`) con su llave, tal cual.
     */
    async apiAdmin(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
      if (url.pathname !== '/api/admin' && !url.pathname.startsWith('/api/admin/')) return false
      const llave = o.creador()
      if (url.pathname === '/api/admin' && req.method === 'GET') return enviar(res, 200, { creador: !!llave })
      if (!llave) return enviar(res, 404, { error: 'No existe' })
      const m = /^\/api\/admin\/voz(\/[a-z]+)?$/.exec(url.pathname)
      if (!m) return enviar(res, 404, { error: 'No existe' })
      try {
        const metodo = req.method ?? 'GET'
        const r = await pedir<unknown>(`/voz/admin${m[1] ?? ''}${url.search}`, { con: llave, metodo, json: metodo === 'GET' ? undefined : await cuerpo(req), espera: 60_000 })
        if (metodo !== 'GET' && r.status < 400) void refrescar()
        return enviar(res, r.status, r.datos)
      } catch (e) {
        return enviar(res, e instanceof Fallo ? e.status : 500, { error: mensaje(e) })
      }
    },

    /**
     * `/api/voz/vc*`: sus proveedores y su catálogo (`GET`), clonar tu voz, el pase de su ventana, la voz elegida,
     * quitarla y volver a preguntar.
     */
    async api(req: IncomingMessage, res: ServerResponse, path: string, estadoVoz: () => unknown): Promise<boolean> {
      if (req.method === 'GET' && (path === '/api/voz/vc/proveedores' || path === '/api/voz/vc/catalogo')) {
        try {
          if (path === '/api/voz/vc/proveedores') {
            // El menú los pide al abrirse el compositor, para contar todas desde el principio: se guardan 10 minutos.
            if (!proveedores || proveedores.hasta < Date.now()) {
              const d = await suApi<{ providers?: { id: string; name: string; badge?: string; voice_count?: number }[] }>('/api/v1/providers?language=es')
              proveedores = { lista: (d.providers ?? []).map((p) => ({ id: p.id, nombre: p.name, voces: p.voice_count ?? 0, ...(p.badge ? { aviso: p.badge } : {}) })), hasta: Date.now() + 10 * 60_000 }
            }
            return enviar(res, 200, { proveedores: proveedores.lista })
          }
          const q = new URL(req.url ?? '', 'http://x').searchParams
          const proveedor = q.get('proveedor') ?? 'elevenlabs'
          if (!PROVEEDORES_VC.test(proveedor)) return enviar(res, 400, { error: 'Ese proveedor no está en las voces de Sloth.' })
          const p = new URLSearchParams({ provider: proveedor, page: String(Math.max(1, Number(q.get('pagina')) || 1)), per_page: '30' })
          if (proveedor !== 'clone') p.set('language', 'es')
          for (const f of FILTROS_VC) if (q.get(f)) p.set(f, q.get(f)!.slice(0, 40))
          if (q.get('q')?.trim()) p.set('q', q.get('q')!.trim().slice(0, 80))
          type V = { voice_id: string; name: string; provider?: string; locale?: string | null; gender?: string; age?: string; accent?: string; category?: string; description?: string; tier?: string; preview_url?: string }
          const d = await suApi<{ voices?: V[]; has_more?: boolean; total?: number }>(`/api/v1/voices?${p}`)
          const voz = (v: V): VozApi => ({
            id: v.voice_id,
            nombre: nombreVc(v.name),
            // Como las de Fish: unas palabras que el menú dice en español («male, young, mexicana»); el país, por su locale.
            descripcion: [v.gender, v.age, PAISES[v.locale?.split('-')[1] ?? '']?.[1] ?? v.accent, v.category].filter((x) => x && !/^(high_quality|standard|professional)$/.test(x)).join(', ').slice(0, 80),
            propia: proveedor === 'clone',
            ...(v.preview_url ? { muestra: v.preview_url } : {}),
            ...(v.provider ? { de: v.provider } : {})
          })
          return enviar(res, 200, { voces: (d.voices ?? []).map(voz), mas: !!d.has_more, total: d.total ?? 0 })
        } catch (e) {
          return enviar(res, e instanceof Fallo && e.status < 500 ? e.status : 502, { error: mensaje(e) })
        }
      }
      // Clonar tu voz con su API: la grabación (o el archivo) y su nombre. Queda la primera del menú.
      if (req.method === 'POST' && path === '/api/voz/vc/clonar') {
        try {
          const q = new URL(req.url ?? '', 'http://x').searchParams
          const audio = await bytes(req)
          if (audio.length < 1000) return enviar(res, 400, { error: 'Elige una grabación de tu voz.' })
          if (audio.length > 25e6) return enviar(res, 400, { error: 'La grabación pesa más de 25 MB: con un minuto basta.' })
          const f = new FormData()
          f.set('name', q.get('nombre')?.trim().slice(0, 80) || 'Mi voz')
          f.set('audio_file', new Blob([audio as Uint8Array<ArrayBuffer>], { type: String(req.headers['content-type'] ?? 'audio/webm') }), q.get('archivo') || 'voz.webm')
          const d = await suApi<{ voice_id?: string; name?: string }>('/api/v1/voices/clone', { form: f })
          this.elegida({ voice_id: d.voice_id, name: d.name ?? f.get('name') }, true)
          void refrescar()
          return enviar(res, 200, estadoVoz())
        } catch (e) {
          return enviar(res, e instanceof Fallo && e.status < 500 ? e.status : 502, { error: mensaje(e) })
        }
      }
      const m = /^\/api\/voz\/vc(?:\/(sesion|elegida|quitar))?$/.exec(path)
      if (!m || req.method !== 'POST') return false
      try {
        if (m[1] === 'sesion') return enviar(res, 200, await this.sesion())
        if (m[1] === 'elegida') {
          const d = await cuerpo<{ voz?: { voice_id?: unknown; name?: unknown; provider?: unknown; descripcion?: unknown; muestra?: unknown }; clonada?: boolean }>(req)
          this.elegida(d.voz ?? {}, !!d.clonada)
        }
        if (m[1] === 'quitar') this.quitar(String((await cuerpo<{ id?: string }>(req)).id ?? ''))
        if (!m[1]) await refrescar()
        return enviar(res, 200, estadoVoz())
      } catch (e) {
        return enviar(res, e instanceof Fallo && e.status < 500 ? e.status : 502, { error: mensaje(e) })
      }
    }
  }
}

/** El audio de un trozo, de su enlace. Solo de Voices Cloning y por https. */
async function bajar(url: string): Promise<Uint8Array> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('Las voces de Sloth dieron un enlace de audio que no sirve.')
  }
  if (u.protocol !== 'https:' || !/(^|\.)voicescloning\.art$/.test(u.hostname)) throw new Error(`Las voces de Sloth dieron el audio en otro sitio (${u.hostname}).`)
  for (let intento = 0; ; intento++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(2 * 60_000) })
      if (!r.ok) throw new Error(`Las voces de Sloth no dieron el audio (${r.status}).`)
      return new Uint8Array(await r.arrayBuffer())
    } catch (e) {
      if (intento >= 2) throw e
      await espera(3000)
    }
  }
}

/** Un MP3 como PCM de 16 bits, mono, a `FRECUENCIA`, con ffmpeg. */
export async function pcmDeMp3(mp3: Uint8Array): Promise<Uint8Array> {
  const base = join(tmpdir(), `sloth-vc-${randomBytes(6).toString('hex')}`)
  try {
    writeFileSync(`${base}.mp3`, mp3)
    await correr('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', `${base}.mp3`, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '1', '-ar', String(FRECUENCIA), `${base}.pcm`], { timeout: 120_000 })
    return new Uint8Array(readFileSync(`${base}.pcm`))
  } catch (e) {
    throw new Error(`No se pudo leer el audio de las voces de Sloth con ffmpeg: ${mensaje(e)}`)
  } finally {
    rmSync(`${base}.mp3`, { force: true })
    rmSync(`${base}.pcm`, { force: true })
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
