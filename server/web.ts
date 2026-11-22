/**
 * Sloth en la web (ADR 0025): la misma interfaz de esta computadora, abierta desde el navegador de otro dispositivo (el
 * celular, otra computadora), con los mismos hilos, agentes y videos. Sloth sigue trabajando aquí; la web solo la enseña.
 *
 * - El túnel: un túnel rápido de Cloudflare (`cloudflared tunnel --url`, sin cuenta) lleva `https://<algo>.trycloudflare.com`
 *   a este servidor. cloudflared no viene en el instalador: se baja la primera vez que se enciende, a
 *   `%APPDATA%\sloth\piezas\cloudflared\<versión>`, comprobado con su SHA-256 (`CLOUDFLARED`). Su dirección cambia cada
 *   vez que arranca: se la dice al cobro (`PUT /web/<equipo>`, con la llave de esta computadora), que da la entrada fija
 *   (`enlaceEntrada`) y manda ahí a cada dispositivo.
 * - Quién entra: solo un dispositivo conectado desde aquí, con un código que da Opciones (`crearCodigo`: un enlace, o un
 *   código corto para escribir en la entrada), de un solo uso y por `VIDA_CODIGO`. La entrada (`ENTRADA`, su propio
 *   dominio) crea en ese navegador una llave ECDSA que no se puede sacar de él (WebCrypto, no exportable); aquí se guarda
 *   su parte pública. Para entrar, la entrada pide un reto de un solo uso (`GET /api/web/reto`) y firma el reto con el
 *   host de este túnel (`aFirmar`): la firma no sirve en otro túnel ni dos veces (`POST /api/web/entrar`). Entrar da una
 *   cookie de sesión de ese túnel (`COOKIE`). Quitar el dispositivo en Opciones lo saca al momento. El cobro solo sabe la
 *   dirección; quien maneja su Worker sirve la página de entrada, así que se confía en él como en la app misma.
 * - Lo que el navegador guarda (`localStorage`: avisos vistos, borradores, la bienvenida) es de cada dirección, y la del
 *   túnel cambia: cada dispositivo lo guarda aquí (`/api/web/guardado`) y la página de entrada lo pone de vuelta, encima
 *   de lo que guarda la ventana de esta computadora (`ESCRITORIO`): lo ya leído allá no vuelve a salir en la web.
 *
 * `confianza` decide qué pasa con una petición que llega por el túnel (su `Host`): el servidor solo atiende las que
 * traen la sesión, y sin ella, la entrada.
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash, createPublicKey, randomBytes, randomInt, timingSafeEqual, verify } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { cuerpo, json } from './http.ts'
import { guardar } from './disco.ts'
import {
  aFirmar,
  type CodigoWeb,
  COBRO_WEB,
  CODIGO_CORTO,
  type DispositivoWeb,
  ENTRADA,
  enlaceEntrada,
  type EstadoWeb,
  ID_EQUIPO,
  LARGO_CODIGO,
  LETRAS_CODIGO,
  limpiarCodigo,
  nombreDispositivo,
  TUNEL,
  VIDA_CODIGO
} from '../shared/web.ts'

/** La versión de cloudflared que se baja, con el SHA-256 de cada sistema (la página de su versión en GitHub). */
export const CLOUDFLARED = {
  version: '2026.10.7',
  archivos: {
    'win32-x64': { nombre: 'cloudflared-windows-amd64.exe', sha256: '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343' },
    // Windows en ARM corre el de x64.
    'win32-arm64': { nombre: 'cloudflared-windows-amd64.exe', sha256: '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343' },
    'darwin-x64': { nombre: 'cloudflared-darwin-amd64.tgz', sha256: '02f3edfd87684dd5b705607688e4eb4b323f6e777b81e7b3a85af556aa356848' },
    'darwin-arm64': { nombre: 'cloudflared-darwin-arm64.tgz', sha256: '3586ccf397e98e5f437e60e7c307ca6ac463e110580503af8bb8e6f9ebf831bd' },
    'linux-x64': { nombre: 'cloudflared-linux-amd64', sha256: '1f99fb518b83dec2ba8d870a7cc991d82a77e6196295a3d2754ba17ab9f91872' },
    'linux-arm64': { nombre: 'cloudflared-linux-arm64', sha256: '3df43aedc9ff291d1735b5cb576cb97e0b157488796db2e32b28aecabb445775' }
  } as Record<string, { nombre: string; sha256: string }>
}

/** La cookie de la sesión de la web. Solo vale en el túnel, que es https. */
export const COOKIE = 'sloth_web'
/** Lo que dura una sesión: al cambiar el túnel se pierde antes, y la entrada da otra sin pedir nada. */
const VIDA_SESION = 30 * 24 * 3600_000
/** Lo más que se espera a que cloudflared dé su dirección y a que conteste por ella. */
const ESPERA_TUNEL = 90_000
/** Entre un túnel caído y el siguiente intento: crece hasta el último. */
const REINTENTOS = [3000, 10_000, 30_000, 60_000]
/** Lo más que pesa lo guardado de un dispositivo (su `localStorage`). */
const PESO_GUARDADO = 4 * 1024 * 1024
/**
 * Códigos equivocados que se aguantan en `VENTANA_FALLOS` desde una misma conexión, y de todas juntas, antes de dejar de
 * aceptar códigos un rato. Por conexión, así nadie deja sin conectar a los demás a propósito.
 */
const FALLOS = 20
const FALLOS_TODOS = 300
const VENTANA_FALLOS = 10 * 60_000
/** Lo que dura un reto para entrar, y cuántos se guardan a la vez. */
const VIDA_RETO = 2 * 60_000
const RETOS = 200
/** Lo más que se lee de una petición de entrar, que no trae sesión. */
const PESO_ENTRAR = 8 * 1024
/** Cada cuánto se anota a lo más que un dispositivo entró. */
const ANOTAR_VISTO = 10 * 60_000

/** Lo que guarda la ventana de Sloth en esta computadora: cada dispositivo nuevo arranca con eso. */
const ESCRITORIO = 'escritorio'
/** Las rutas del túnel que se atienden sin sesión: la página de entrada, su petición y el saludo de la entrada del cobro. */
const PUBLICAS = new Set(['/web/entrar', '/api/web/entrar', '/api/web/hola', '/api/web/reto'])

interface Dispositivo {
  id: string
  nombre: string
  /** La parte pública de su llave ECDSA P-256 (SPKI, en base64url). */
  publica: string
  creado: string
  visto: string
}

/** `data/web.json`. */
interface Archivo {
  encendida?: boolean
  /** Esta computadora ante el cobro, y su llave (solo ella puede cambiar su dirección). */
  equipo?: string
  llave?: string
  dispositivos?: Dispositivo[]
  /** El cloudflared que se dejó corriendo, para cerrarlo si el servidor se cayó sin cerrarlo. */
  pid?: number
}

/** Cómo se abre un túnel: el de verdad (`tunelDeCloudflare`) o uno de prueba. */
export type AbrirTunel = (puerto: number, avisar: (estado: 'bajando' | 'abriendo') => void) => Promise<Tunel>
export interface Tunel {
  url: string
  pid?: number
  /** Se resuelve cuando el túnel se cae. */
  cerrado: Promise<unknown>
  cerrar(): void
}

export interface OpcionesWeb {
  app: string
  puerto: number
  cobro?: string
  /** El origen de la página de entrada, al que se le deja preguntar al túnel (por defecto, `ENTRADA`). */
  entrada?: string
  abrirTunel?: AbrirTunel
  /** Comprueba que el túnel ya llega aquí (por defecto, pidiendo `/api/web/hola` por él). */
  llega?: (url: string, equipo: string) => Promise<boolean>
  /** Un dispositivo se quitó: se cierran sus WebSockets. */
  alQuitar?: (dispositivo: string) => void
}

const resumen = (s: string) => createHash('sha256').update(s).digest('hex')
const iguales = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const aleatorio = (n: number) => randomBytes(n).toString('base64url')
export const nuevoCorto = () => Array.from({ length: LARGO_CODIGO }, () => LETRAS_CODIGO[randomInt(LETRAS_CODIGO.length)]).join('')

/** La parte pública de una llave ECDSA P-256 en SPKI y base64url, si lo es. */
export function llavePublica(b64: unknown) {
  if (typeof b64 !== 'string' || b64.length > 200) return null
  try {
    const k = createPublicKey({ key: Buffer.from(b64, 'base64url'), format: 'der', type: 'spki' })
    return k.asymmetricKeyType === 'ec' && k.asymmetricKeyDetails?.namedCurve === 'prime256v1' ? k : null
  } catch {
    return null
  }
}

/** Si `firma` (ECDSA con SHA-256, como la da WebCrypto: r||s) es de esa llave sobre ese texto. */
export function firmaValida(publica: ReturnType<typeof llavePublica>, texto: string, firma: unknown): boolean {
  if (!publica || typeof firma !== 'string' || firma.length > 200) return false
  try {
    return verify('sha256', Buffer.from(texto), { key: publica, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url'))
  } catch {
    return false
  }
}

/** El cuerpo de una petición sin pasar de `max` bytes; `null` si pasa. */
export async function leerHasta(req: IncomingMessage, max: number): Promise<Buffer | null> {
  const largo = Number(req.headers['content-length'])
  if (largo > max) return (req.resume(), null)
  const trozos: Buffer[] = []
  let n = 0
  for await (const t of req as AsyncIterable<Buffer>) {
    n += t.length
    if (n > max) return (req.destroy(), null)
    trozos.push(t)
  }
  return Buffer.concat(trozos)
}

/** Las cookies de una petición. */
export function cookies(req: Pick<IncomingMessage, 'headers'>): Record<string, string> {
  const fuera: Record<string, string> = {}
  for (const parte of (req.headers.cookie ?? '').split(';')) {
    const i = parte.indexOf('=')
    if (i > 0) fuera[parte.slice(0, i).trim()] = parte.slice(i + 1).trim()
  }
  return fuera
}

export function slothWeb(o: OpcionesWeb) {
  const archivo = join(o.app, 'data', 'web.json')
  const carpetaGuardado = join(o.app, 'data', 'web')
  const cobro = o.cobro ?? COBRO_WEB
  const entrada = o.entrada ?? ENTRADA
  const abrirTunel = o.abrirTunel ?? tunelDeCloudflare
  const llega = o.llega ?? llegaPorElTunel
  let a: Archivo = leer()
  // La primera vez, esta computadora se presenta ante el cobro con un id y una llave que solo ella tiene.
  if (!a.equipo || !ID_EQUIPO.test(a.equipo) || !a.llave) {
    a = { ...a, equipo: aleatorio(16), llave: aleatorio(32) }
    escribir()
  }
  let equipo = a.equipo!

  let estado: EstadoWeb['estado'] = 'apagada'
  let error = ''
  let tunel: Tunel | null = null
  /** El host del túnel mientras contesta: solo con él se atiende por la web. */
  let host: string | null = null
  /** Lo que lleva abriéndose, para no abrir dos. */
  let abriendo = false
  let intento = 0
  let reintento: ReturnType<typeof setTimeout> | undefined
  /** El cobro ya sabe la dirección de ahora. */
  let avisado = ''
  let reAviso: ReturnType<typeof setInterval> | undefined

  const sesiones = new Map<string, { dispositivo: string; vence: number }>()
  /** Los códigos de conectar que siguen sin usarse: su resumen, el corto y cuándo vencen. */
  const codigos: { hash: string; corto: string; vence: number }[] = []
  /** Los códigos equivocados de cada conexión (`cf-connecting-ip`), con su hora. */
  const fallos = new Map<string, number[]>()
  /** Los retos para entrar que siguen sin usarse, con cuándo vencen. */
  const retos = new Map<string, number>()
  const anotado = new Map<string, number>()

  function leer(): Archivo {
    try {
      return JSON.parse(readFileSync(archivo, 'utf8'))
    } catch {
      return {}
    }
  }
  function escribir() {
    mkdirSync(join(o.app, 'data'), { recursive: true })
    guardar(archivo, JSON.stringify(a, null, 2))
  }
  const dispositivos = () => a.dispositivos ?? []

  // Si el servidor se cayó sin cerrar su cloudflared, sigue corriendo con una dirección que ya nadie conoce.
  if (a.pid) {
    void cerrarSiEsCloudflared(a.pid)
    a.pid = undefined
    escribir()
  }

  async function encender() {
    if (abriendo || tunel || !a.encendida) return
    abriendo = true
    clearTimeout(reintento)
    error = ''
    estado = 'abriendo'
    try {
      const t = await abrirTunel(o.puerto, (e) => void (estado = e))
      if (!a.encendida) return t.cerrar()
      tunel = t
      a.pid = t.pid
      escribir()
      void t.cerrado.then(() => {
        if (tunel !== t) return
        caido('El túnel se cerró. Se vuelve a abrir solo.')
      })
      // Ya se atiende por él el saludo, con el que se comprueba que llega; sin sesiones aún, nada más.
      host = new URL(t.url).host
      // La dirección tarda unos segundos en llegar aquí desde Cloudflare.
      const desde = Date.now()
      while (!(await llega(t.url, equipo))) {
        if (tunel !== t) return
        if (Date.now() - desde > ESPERA_TUNEL) throw new Error('El túnel abrió, pero no llega a esta computadora. Revisa tu internet.')
        await new Promise((r) => setTimeout(r, 1500))
      }
      estado = 'lista'
      intento = 0
      void avisarAlCobro()
      clearInterval(reAviso)
      // Si el cobro no contestó, se le vuelve a decir; y cada tanto, para que no la dé por vieja.
      reAviso = setInterval(() => void avisarAlCobro(avisado !== t.url), 60_000)
      reAviso.unref?.()
    } catch (e) {
      caido(e instanceof Error ? e.message : String(e))
    } finally {
      abriendo = false
    }
  }

  function caido(motivo: string) {
    const t = tunel
    tunel = null
    host = null
    avisado = ''
    clearInterval(reAviso)
    t?.cerrar()
    sesiones.clear()
    if (!a.encendida) return
    estado = 'error'
    error = motivo
    const espera = REINTENTOS[Math.min(intento++, REINTENTOS.length - 1)]
    clearTimeout(reintento)
    reintento = setTimeout(() => void encender(), espera)
    reintento.unref?.()
  }

  function apagar() {
    clearTimeout(reintento)
    clearInterval(reAviso)
    const t = tunel
    tunel = null
    host = null
    avisado = ''
    t?.cerrar()
    sesiones.clear()
    estado = 'apagada'
    error = ''
    if (a.pid) {
      a.pid = undefined
      escribir()
    }
  }

  /** Le dice al cobro la dirección de ahora (o que se apagó, con `null`). Cada hora como mucho, si no cambió. */
  let ultimoAviso = 0
  async function avisarAlCobro(forzar = true) {
    const url = tunel && host ? tunel.url : null
    if (!forzar && Date.now() - ultimoAviso < 3600_000) return
    try {
      const r = await fetch(`${cobro}/web/${equipo}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ llave: a.llave, url, nombre: hostname().slice(0, 60) }),
        signal: AbortSignal.timeout(15_000)
      })
      // Otra llave tiene ya este id (se borró por no avisar en meses y alguien lo tomó): esta computadora estrena otro, y
      // sus dispositivos se conectan otra vez. A ese otro no le sirve: las firmas de los dispositivos son para este túnel.
      if (r.status === 403) {
        a = { ...a, equipo: aleatorio(16), llave: aleatorio(32), dispositivos: [] }
        equipo = a.equipo!
        escribir()
        sesiones.clear()
        return void (await avisarAlCobro())
      }
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `El cobro respondió ${r.status}`)
      ultimoAviso = Date.now()
      if (url) avisado = url
    } catch (e) {
      // El túnel sirve igual con el enlace de un código; lo fijo espera a que el cobro conteste.
      console.error('Sloth en la web: no se pudo avisar al cobro.', e instanceof Error ? e.message : e)
    }
  }

  /** Un código para conectar un dispositivo: el largo va en el enlace; el corto, en el cobro, para escribirlo a mano. */
  async function crearCodigo(): Promise<CodigoWeb> {
    const ahora = Date.now()
    for (let i = codigos.length - 1; i >= 0; i--) if (codigos[i].vence < ahora) codigos.splice(i, 1)
    // Cinco a la vez como mucho: el más viejo deja de valer.
    if (codigos.length >= 5) codigos.shift()
    const largo = aleatorio(24)
    const corto = nuevoCorto()
    const vence = ahora + VIDA_CODIGO
    codigos.push({ hash: resumen(largo), corto, vence })
    let cortoListo = false
    try {
      const r = await fetch(`${cobro}/web/${equipo}/codigo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ llave: a.llave, corto, vence: new Date(vence).toISOString() }),
        signal: AbortSignal.timeout(10_000)
      })
      cortoListo = r.ok
    } catch {}
    return { enlace: enlaceEntrada(equipo, largo), corto, vence: new Date(vence).toISOString(), cortoListo }
  }

  function estadoPara(req: IncomingMessage): EstadoWeb {
    const yo = sesionDe(req)?.dispositivo
    return {
      encendida: !!a.encendida,
      estado,
      error: error || undefined,
      equipo,
      enlace: enlaceEntrada(equipo),
      dispositivos: dispositivos()
        .map(({ id, nombre, creado, visto }): DispositivoWeb => ({ id, nombre, creado, visto, este: id === yo || undefined }))
        .sort((x, y) => y.visto.localeCompare(x.visto)),
      desdeLaWeb: !!yo
    }
  }

  function sesionDe(req: Pick<IncomingMessage, 'headers'>) {
    if (!host || req.headers.host !== host) return undefined
    const token = cookies(req)[COOKIE]
    const s = token ? sesiones.get(token) : undefined
    if (!s) return undefined
    if (s.vence < Date.now() || !dispositivos().some((d) => d.id === s.dispositivo)) {
      sesiones.delete(token!)
      return undefined
    }
    return s
  }

  /**
   * Una petición que llega por el túnel: `sesion` si viene de un dispositivo que entró, `publica` si es de la entrada,
   * `fuera` si es del túnel pero sin sesión (se le manda a entrar) y `null` si no es del túnel.
   */
  function confianza(req: Pick<IncomingMessage, 'headers' | 'method' | 'url'>): 'sesion' | 'publica' | 'fuera' | null {
    if (!host || req.headers.host !== host) return null
    const ruta = (req.url ?? '/').split('?')[0]
    const propio = `https://${host}`
    const origen = req.headers.origin
    // El saludo y el reto los pide la página de entrada, desde su dominio, antes de mandar aquí.
    if ((ruta === '/api/web/hola' || ruta === '/api/web/reto') && req.method === 'GET') return 'publica'
    // A la página de entrada se llega navegando desde el cobro: viene de otro sitio.
    if (ruta === '/web/entrar' && req.method === 'GET') return 'publica'
    if (origen && origen !== propio) return null
    const sitio = req.headers['sec-fetch-site']
    if (sitio && sitio !== 'same-origin' && sitio !== 'none') return null
    if (PUBLICAS.has(ruta)) return 'publica'
    const s = sesionDe(req)
    if (!s) return 'fuera'
    anotarVisto(s.dispositivo)
    return 'sesion'
  }

  function anotarVisto(id: string) {
    const ahora = Date.now()
    if (ahora - (anotado.get(id) ?? 0) < ANOTAR_VISTO) return
    anotado.set(id, ahora)
    const d = dispositivos().find((x) => x.id === id)
    if (!d) return
    d.visto = new Date(ahora).toISOString()
    escribir()
  }

  /** Lo que se contesta a quien llega por el túnel sin sesión: a entrar otra vez por el cobro. */
  function aEntrar(req: IncomingMessage, res: ServerResponse) {
    const destino = enlaceEntrada(equipo)
    const navega = req.method === 'GET' && (req.headers['sec-fetch-dest'] === 'document' || (req.headers.accept ?? '').includes('text/html'))
    if (navega && !(req.url ?? '').startsWith('/api/')) {
      res.writeHead(302, { location: destino, 'cache-control': 'no-store' })
      return void res.end()
    }
    json(res, 401, { error: 'Vuelve a entrar a tu Sloth desde la web.', entrar: destino })
  }

  /** Las rutas públicas del túnel. */
  async function publica(req: IncomingMessage, res: ServerResponse, url: URL) {
    const deLaEntrada = { 'content-type': 'application/json', 'access-control-allow-origin': new URL(entrada).origin, 'cache-control': 'no-store' }
    if (url.pathname === '/api/web/hola') {
      res.writeHead(200, deLaEntrada)
      return void res.end(JSON.stringify({ equipo }))
    }
    if (url.pathname === '/api/web/reto') {
      const ahora = Date.now()
      for (const [r, vence] of retos) if (vence < ahora || retos.size >= RETOS) retos.delete(r)
      const reto = aleatorio(24)
      retos.set(reto, ahora + VIDA_RETO)
      res.writeHead(200, deLaEntrada)
      return void res.end(JSON.stringify({ reto }))
    }
    if (url.pathname === '/web/entrar') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
      })
      return void res.end(paginaEntrar(enlaceEntrada(equipo)))
    }
    if (url.pathname === '/api/web/entrar' && req.method === 'POST') {
      const ahora = Date.now()
      const datos = await leerHasta(req, PESO_ENTRAR)
      let c: Record<string, unknown> = {}
      try {
        c = datos ? JSON.parse(datos.toString('utf8')) : {}
      } catch {}
      const id = typeof c.dispositivo === 'string' && ID_EQUIPO.test(c.dispositivo) ? c.dispositivo : null
      const reto = typeof c.reto === 'string' ? c.reto : ''
      const vence = retos.get(reto)
      // El reto vale una vez, con o sin acierto.
      retos.delete(reto)
      if (!id || !vence || vence < ahora) return void json(res, 400, { error: 'La entrada llegó incompleta o tardó demasiado. Vuelve a abrir tu Sloth desde la entrada.' })
      const texto = aFirmar(host!, reto)
      let d = dispositivos().find((x) => x.id === id)
      if (typeof c.codigo === 'string' && c.codigo) {
        // Solo un código corto se podría adivinar: tras muchos fallos desde una conexión (o de todas), los códigos se
        // cierran un rato. Los dispositivos ya conectados entran igual: su llave no se adivina.
        const quien = String(req.headers['cf-connecting-ip'] ?? 'local')
        for (const [k, l] of fallos) {
          const vivos = l.filter((t) => t > ahora - VENTANA_FALLOS)
          if (vivos.length) fallos.set(k, vivos)
          else fallos.delete(k)
        }
        const todos = [...fallos.values()].reduce((n, l) => n + l.length, 0)
        if ((fallos.get(quien)?.length ?? 0) >= FALLOS || todos >= FALLOS_TODOS)
          return void json(res, 429, { error: 'Demasiados códigos equivocados. Espera unos minutos y pide otro en tu computadora.' })
        const codigo = c.codigo
        const corto = limpiarCodigo(codigo)
        const i = codigos.findIndex((x) => x.vence > ahora && (iguales(x.hash, resumen(codigo)) || (CODIGO_CORTO.test(corto) && iguales(x.corto, corto))))
        const publica = llavePublica(c.publica)
        if (i < 0 || !publica || !firmaValida(publica, texto, c.firma)) {
          if (i < 0) fallos.set(quien, [...(fallos.get(quien) ?? []), ahora])
          return void json(res, 403, { error: 'Ese código ya no vale: se usa una sola vez y dura 10 minutos. Pide otro en Opciones de Sloth, en tu computadora.' })
        }
        codigos.splice(i, 1)
        const cuando = new Date(ahora).toISOString()
        const nombre = (typeof c.nombre === 'string' && c.nombre.trim().slice(0, 60)) || nombreDispositivo(req.headers['user-agent'] ?? '')
        a.dispositivos = [...dispositivos().filter((x) => x.id !== id), (d = { id, nombre, publica: c.publica as string, creado: cuando, visto: cuando })]
        escribir()
      } else if (!d || !firmaValida(llavePublica(d.publica), texto, c.firma)) {
        return void json(res, 403, { error: 'Este dispositivo ya no está conectado a tu Sloth. Conéctalo otra vez desde Opciones, en tu computadora.' })
      }
      const token = aleatorio(32)
      sesiones.set(token, { dispositivo: d.id, vence: ahora + VIDA_SESION })
      anotado.delete(d.id)
      anotarVisto(d.id)
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${VIDA_SESION / 1000}`
      })
      // Lo de la ventana de esta computadora va debajo: los avisos que ya leíste allá no salen otra vez aquí.
      return void res.end(JSON.stringify({ ok: true, guardado: { ...leerGuardado(ESCRITORIO), ...leerGuardado(d.id) } }))
    }
    json(res, 404, { error: 'No existe' })
  }

  const rutaGuardado = (id: string) => join(carpetaGuardado, `${id}.json`)
  function leerGuardado(id: string): Record<string, string> {
    try {
      return JSON.parse(readFileSync(rutaGuardado(id), 'utf8'))
    } catch {
      return {}
    }
  }

  function quitar(id: string) {
    if (!ID_EQUIPO.test(id)) return
    a.dispositivos = dispositivos().filter((d) => d.id !== id)
    escribir()
    rmSync(rutaGuardado(id), { force: true })
    for (const [t, s] of sesiones) if (s.dispositivo === id) sesiones.delete(t)
    o.alQuitar?.(id)
  }

  /** `/api/web*`, desde esta computadora o con sesión. */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const ruta = url.pathname
    const metodo = req.method
    if (ruta === '/api/web' && metodo === 'GET') return json(res, 200, estadoPara(req))
    if (ruta === '/api/web/encender' && metodo === 'POST') {
      const { encendida } = await cuerpo<{ encendida?: boolean }>(req)
      a.encendida = !!encendida
      escribir()
      if (a.encendida) void encender()
      else {
        apagar()
        void avisarAlCobro()
      }
      return json(res, 200, estadoPara(req))
    }
    if (ruta === '/api/web/codigo' && metodo === 'POST') {
      if (!a.encendida) return json(res, 409, { error: 'Enciende primero Sloth en la web.' })
      return json(res, 200, await crearCodigo())
    }
    if (ruta === '/api/web/quitar' && metodo === 'POST') {
      const { id } = await cuerpo<{ id?: string }>(req)
      if (typeof id === 'string') quitar(id)
      return json(res, 200, estadoPara(req))
    }
    if (ruta === '/api/web/guardado') {
      // Por aquí solo llega lo de esta computadora o una sesión de la web (`confianza`).
      const yo = sesionDe(req)?.dispositivo ?? ESCRITORIO
      if (metodo === 'GET') return json(res, 200, leerGuardado(yo))
      if (metodo === 'PUT' || metodo === 'POST') {
        const b = await leerHasta(req, PESO_GUARDADO)
        if (!b) return json(res, 413, { error: 'Es demasiado.' })
        let datos: unknown
        try {
          datos = JSON.parse(b.toString('utf8'))
        } catch {
          return json(res, 400, { error: 'No es JSON.' })
        }
        if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return json(res, 400, { error: 'No es JSON.' })
        const limpio = Object.fromEntries(Object.entries(datos).filter(([, v]) => typeof v === 'string'))
        mkdirSync(carpetaGuardado, { recursive: true })
        guardar(rutaGuardado(yo), JSON.stringify(limpio))
        return json(res, 200, { ok: true })
      }
    }
    return false
  }

  if (a.encendida) void encender()
  const alSalir = () => tunel?.cerrar()
  process.once('exit', alSalir)

  return {
    equipo,
    /** El host del túnel mientras contesta. */
    host: () => host,
    confianza,
    sesionDe,
    publica,
    aEntrar,
    api,
    /** Si hay algo que la web haga ahora (para no reiniciar a media entrada): nada, el túnel se vuelve a abrir solo. */
    cerrar() {
      process.off('exit', alSalir)
      apagar()
    }
  }
}

export type SlothWeb = ReturnType<typeof slothWeb>

/** Que el túnel ya lleve aquí: por él contesta `/api/web/hola` con el id de esta computadora. */
async function llegaPorElTunel(url: string, equipo: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/web/hola`, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    return r.ok && ((await r.json()) as { equipo?: string }).equipo === equipo
  } catch {
    return false
  }
}

/** Cierra el proceso `pid` si es un cloudflared (uno que quedó de antes); a otro programa con ese número no lo toca. */
async function cerrarSiEsCloudflared(pid: number) {
  const nombre = await new Promise<string>((ok) => {
    if (process.platform === 'win32')
      execFile('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], { windowsHide: true, timeout: 10_000 }, (_e, out) => ok(String(out ?? '')))
    else execFile('ps', ['-p', String(pid), '-o', 'comm='], { timeout: 10_000 }, (_e, out) => ok(String(out ?? '')))
  })
  if (!/cloudflared/i.test(nombre)) return
  try {
    process.kill(pid)
  } catch {}
}

/** Dónde va cloudflared: junto a los agentes, en las piezas de Sloth. */
function carpetaCloudflared() {
  return join(process.env.APPDATA ?? '', 'sloth', 'piezas', 'cloudflared', CLOUDFLARED.version)
}

/** El programa de cloudflared, bajado y comprobado la primera vez. */
export async function asegurarCloudflared(alBajar?: () => void): Promise<string> {
  const dir = carpetaCloudflared()
  const exe = join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared')
  if (existsSync(exe)) return exe
  const pieza = CLOUDFLARED.archivos[`${process.platform}-${process.arch}`]
  if (!pieza) throw new Error(`Sloth en la web aún no funciona en esta computadora (${process.platform} ${process.arch}).`)
  alBajar?.()
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED.version}/${pieza.nombre}`, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!r.ok) throw new Error(`No se pudo bajar el programa del túnel (GitHub respondió ${r.status}).`)
  const datos = Buffer.from(await r.arrayBuffer())
  if (createHash('sha256').update(datos).digest('hex') !== pieza.sha256) throw new Error('El programa del túnel llegó dañado. Se vuelve a intentar.')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  if (pieza.nombre.endsWith('.tgz')) {
    const tgz = join(dir, pieza.nombre)
    writeFileSync(tgz, datos)
    await new Promise<void>((ok, falla) => execFile('tar', ['-xzf', tgz, '-C', dir], (e) => (e ? falla(e) : ok())))
    rmSync(tgz, { force: true })
  } else writeFileSync(exe, datos)
  if (process.platform !== 'win32') chmodSync(exe, 0o755)
  if (!existsSync(exe)) throw new Error('El programa del túnel no se pudo desempacar.')
  return exe
}

/**
 * Un túnel rápido de Cloudflare hacia este servidor: `https://<algo>.trycloudflare.com`, sin cuenta. Con un archivo de
 * configuración vacío, porque uno de cloudflared en `~/.cloudflared` le impide abrir el rápido.
 */
export const tunelDeCloudflare: AbrirTunel = async (puerto, avisar) => {
  const exe = await asegurarCloudflared(() => avisar('bajando'))
  avisar('abriendo')
  const config = join(carpetaCloudflared(), 'vacio.yml')
  writeFileSync(config, '')
  const hijo: ChildProcess = spawn(exe, ['tunnel', '--no-autoupdate', '--config', config, '--url', `http://127.0.0.1:${puerto}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const cerrado = new Promise((ok) => {
    hijo.once('exit', ok)
    hijo.once('error', ok)
  })
  const url = await new Promise<string>((ok, falla) => {
    let visto = ''
    const reloj = setTimeout(() => falla(new Error('Cloudflare no dio la dirección del túnel. Revisa tu internet.')), ESPERA_TUNEL)
    const leer = (d: Buffer) => {
      visto = (visto + d.toString()).slice(-8000)
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(visto)
      if (m && TUNEL.test(m[0]) && !m[0].startsWith('https://api.')) {
        clearTimeout(reloj)
        ok(m[0])
      }
    }
    hijo.stdout?.on('data', leer)
    hijo.stderr?.on('data', leer)
    void cerrado.then(() => {
      clearTimeout(reloj)
      const linea = visto.split('\n').reverse().find((l) => /ERR|error/i.test(l))
      falla(new Error(`El túnel no abrió${linea ? `: ${linea.replace(/^.*?(ERR|error)\s*/i, '').trim().slice(0, 200)}` : '.'}`))
    })
  }).catch((e) => {
    hijo.kill()
    throw e
  })
  // Lo que escribe después ya no hace falta, pero hay que leerlo: con la tubería llena, cloudflared se para.
  hijo.stdout?.resume()
  hijo.stderr?.resume()
  return { url, pid: hijo.pid, cerrado, cerrar: () => void hijo.kill() }
}

/** La página del túnel donde se entra: pone la sesión con lo que trae el enlace del cobro y lo guardado del dispositivo. */
function paginaEntrar(volver: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sloth</title>
<style>
:root{color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f0e0c;color:#ede6d6;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:420px;padding:24px;text-align:center}
p{color:#9a907f}
a{color:#e8a33d}
</style></head>
<body><main><p id="m">Entrando a tu Sloth…</p></main>
<script>
(async () => {
  const m = document.getElementById('m')
  const p = new URLSearchParams(location.hash.slice(1))
  history.replaceState(null, '', location.pathname)
  const fallo = (t) => { m.textContent = t + ' '; const a = document.createElement('a'); a.href = ${JSON.stringify(volver)}; a.textContent = 'Volver a la entrada'; m.append(a) }
  if (!p.get('d') || !p.get('r') || !p.get('f')) return fallo('Abre tu Sloth desde su entrada.')
  try {
    const r = await fetch('/api/web/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: p.get('c') || undefined, dispositivo: p.get('d'), reto: p.get('r'), firma: p.get('f'), publica: p.get('p') || undefined, nombre: p.get('n') || undefined }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return fallo(j.error || 'No se pudo entrar.')
    try { for (const [k, v] of Object.entries(j.guardado || {})) localStorage.setItem(k, v) } catch {}
    const h = p.get('h') || ''
    location.replace('/' + (h.startsWith('#/') ? h : ''))
  } catch { fallo('No se pudo hablar con tu Sloth.') }
})()
</script></body></html>`
}
