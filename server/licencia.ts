/**
 * La clave de la app que se vende (`VENTA`): la de una cuenta gratis, con la que se entra a la comunidad, o la de un
 * apoyo, que quita el recordatorio (`web/src/Licencia.tsx`). Sloth abre sin ella. El apoyo se paga en la página de Sloth,
 * que da la clave; la cuenta se crea aquí (`/api/licencia/unirse`). El cobro es `licencias/`, un Worker de Cloudflare con
 * PayPal: aquí solo se le pregunta. Su respuesta llega firmada y se guarda en `data/licencia.json`. Sin
 * internet, vale hasta su `hasta` (una semana como mucho), y editar el archivo no la alarga. Se vuelve a preguntar al
 * abrir y cada 6 horas.
 */
import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import type { Licencia } from '../shared/types.ts'
import { guardar } from './disco.ts'

/** El Worker de `licencias/`. */
export const COBRO = 'https://api.sloth.vancci.org'
/** La llave con la que se comprueba lo que firma el cobro (la privada es su secreto `FIRMA`). */
const PUBLICA = createPublicKey({ key: Buffer.from('MCowBQYDK2VwAyEAlo09wigax6NbF1/ar4az15Aa70NhzL77nRXoqYH6p5M=', 'base64'), format: 'der', type: 'spki' })
const CADA = 6 * 3600_000
const SIN_CONEXION = 'No hay conexión con el cobro de Sloth. Revisa tu internet e intenta otra vez.'

/** `data/licencia.json`. `datos` es lo que firmó el cobro, en texto, tal cual. */
interface Archivo {
  clave?: string
  email?: string
  datos?: string
  firma?: string
  /** Solo si Windows no dio el id de esta computadora. */
  equipo?: string
}

/** Lo firmado (`firmada` en licencias/src/index.ts). */
interface Firmado extends Omit<Licencia, 'error'> {
  clave: string
  equipo: string
  hasta: string
}

class Rechazo extends Error {
  status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

export function licencia(app: string) {
  const archivo = join(app, 'data', 'licencia.json')
  let a: Archivo = leer()
  // De Windows cada vez: copiada a otra computadora, la licencia no vale ahí hasta volver a preguntar, y cuenta como otra.
  const equipo = equipoDeEstaComputadora() ?? a.equipo ?? nuevoEquipo()
  let error = ''

  void revisar()
  setInterval(() => void revisar(), CADA).unref()

  function leer(): Archivo {
    try {
      return JSON.parse(readFileSync(archivo, 'utf8'))
    } catch {
      return {}
    }
  }

  function escribir() {
    mkdirSync(dirname(archivo), { recursive: true })
    guardar(archivo, `${JSON.stringify(a, null, 2)}\n`)
  }

  function nuevoEquipo(): string {
    const nuevo = randomUUID()
    a.equipo = nuevo
    escribir()
    return nuevo
  }

  /** Lo firmado, si la firma es buena y es de esta clave y esta computadora. */
  function firmado(): Firmado | undefined {
    if (!a.datos || !a.firma) return
    try {
      if (!verify(null, Buffer.from(a.datos), PUBLICA, Buffer.from(a.firma, 'base64'))) return
      const d = JSON.parse(a.datos) as Firmado
      return d.clave === a.clave && d.equipo === equipo ? d : undefined
    } catch {
      return
    }
  }

  function activa(): boolean {
    const d = firmado()
    return !!d?.activa && Date.now() < Date.parse(d.hasta)
  }

  function estado(): Licencia {
    const d = firmado()
    return { activa: activa(), clave: a.clave, email: d?.email ?? a.email, plan: d?.plan, monto: d?.monto, estado: d?.estado, pagadaHasta: d?.pagadaHasta, folio: d?.folio, fundador: d?.fundador, error: error || undefined }
  }

  async function cobro<T>(ruta: string, cuerpo: object): Promise<T> {
    const r = await fetch(`${COBRO}${ruta}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(20_000)
    })
    const j = (await r.json().catch(() => ({}))) as T & { error?: string }
    if (!r.ok) throw new Rechazo(r.status, j.error ?? `El cobro de Sloth respondió ${r.status}.`)
    return j
  }

  /** Pregunta al cobro si la clave sigue activa y guarda lo que firme. Sin conexión, vale lo guardado. */
  async function revisar(): Promise<Licencia> {
    if (!a.clave) return estado()
    try {
      const { datos, firma } = await cobro<{ datos: string; firma: string }>('/licencia', { clave: a.clave, equipo })
      a = { ...a, datos, firma }
      error = ''
    } catch (e) {
      // Una clave que no existe se olvida; una que usan otras computadoras deja de valer aquí.
      if (e instanceof Rechazo && e.status === 404) a = { email: a.email, equipo: a.equipo }
      if (e instanceof Rechazo && e.status === 409) a = { ...a, datos: undefined, firma: undefined }
      error = e instanceof Rechazo ? e.message : activa() ? '' : SIN_CONEXION
    }
    escribir()
    return estado()
  }

  /** `/api/licencia*`. */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const ruta = url.pathname
    const metodo = req.method ?? 'GET'
    try {
      // `?fresco`: la suscripción en Opciones, recién leída.
      if (ruta === '/api/licencia' && metodo === 'GET') return enviar(res, 200, url.searchParams.has('fresco') ? await revisar() : estado())
      // La clave que dio la página al pagar, una de otra computadora o la de antes de reinstalar.
      if (ruta === '/api/licencia/clave' && metodo === 'POST') {
        const clave = String((await cuerpo<{ clave?: string }>(req)).clave ?? '').replace(/\s+/g, '').toUpperCase()
        const { datos, firma } = await cobro<{ datos: string; firma: string }>('/licencia', { clave, equipo })
        a = { clave, datos, firma, equipo: a.equipo }
        error = ''
        escribir()
        return enviar(res, 200, estado())
      }
      // La cuenta gratis, con su correo: el cobro da su clave, ya activa, y la manda también por correo.
      if (ruta === '/api/licencia/unirse' && metodo === 'POST') {
        const { email, terminos } = await cuerpo<{ email?: string; terminos?: string }>(req)
        const { clave } = await cobro<{ clave: string }>('/suscribir', { email, plan: 'gratis', equipo, acepto: true, terminos })
        const { datos, firma } = await cobro<{ datos: string; firma: string }>('/licencia', { clave, equipo })
        a = { clave, datos, firma, equipo: a.equipo }
        error = ''
        escribir()
        return enviar(res, 200, estado())
      }
      if (ruta === '/api/licencia/cancelar' && metodo === 'POST') {
        if (!a.clave) throw new Rechazo(400, 'No hay una suscripción en esta computadora.')
        const { datos, firma } = await cobro<{ datos: string; firma: string }>('/cancelar', { clave: a.clave, equipo })
        a = { ...a, datos, firma }
        error = ''
        escribir()
        return enviar(res, 200, estado())
      }
      // Para la ventana de Electron, al buscar la versión nueva: quien apoya la recibe antes (licencias/, `ANTICIPO`).
      if (ruta === '/api/licencia/credencial' && metodo === 'GET') return enviar(res, 200, credencial() ?? {})
      // Con un año pagado de una vez: el pago del siguiente.
      if (ruta === '/api/licencia/pago' && metodo === 'POST') {
        if (!a.clave) throw new Rechazo(400, 'No hay una suscripción en esta computadora.')
        return enviar(res, 200, await cobro<{ enlace: string }>('/pago', { clave: a.clave, equipo }))
      }
    } catch (e) {
      return enviar(res, e instanceof Rechazo && e.status < 500 ? e.status : 502, { error: e instanceof Rechazo ? e.message : SIN_CONEXION })
    }
    return false
  }

  /** Con qué entra a la comunidad (`server/comunidad.ts`): la clave y esta computadora, mientras esté activa. */
  const credencial = () => (activa() && a.clave ? { clave: a.clave, equipo } : undefined)

  return { api, credencial }
}

/**
 * El id del sistema de esta computadora, resumido: no cambia al reinstalar Sloth. En Windows, MachineGuid; en Mac, el
 * IOPlatformUUID; en Linux, /etc/machine-id.
 */
function equipoDeEstaComputadora(): string | undefined {
  try {
    const id =
      process.platform === 'win32'
        ? /MachineGuid\s+REG_SZ\s+(\S+)/.exec(execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }))?.[1]
        : process.platform === 'darwin'
          ? /"IOPlatformUUID" = "([^"]+)"/.exec(execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 }))?.[1]
          : readFileSync('/etc/machine-id', 'utf8').trim()
    return id ? createHash('sha256').update(`sloth:${id}`).digest('hex').slice(0, 32) : undefined
  } catch {
    return
  }
}

async function cuerpo<T>(req: IncomingMessage): Promise<T> {
  let texto = ''
  for await (const parte of req) texto += parte
  return (texto ? JSON.parse(texto) : {}) as T
}

function enviar(res: ServerResponse, status: number, datos: unknown): true {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(datos))
  return true
}
