import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { tipoDeArchivo } from '../../shared/flow.ts'
import {
  A_LA_VEZ_META,
  type CuentaMeta,
  DESCANSO_META,
  elegirCuentaMeta,
  type EstadoMeta,
  FORMATOS_META,
  MAX_CUENTAS_META,
  MAX_IMAGENES_META,
  type MotivoMeta,
  type TrabajoMeta,
  URL_MUSE,
  type UsoMeta
} from '../../shared/meta.ts'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'
import { edgeDe, nombreNavegador } from '../flow/cuentas.ts'
import { cuerpo, json } from '../http.ts'
import { correoEnMeta, generarEnMuse, leerUso, paginaMuse, SinArchivoMeta, SinSesionMeta, SinUsoMeta } from './pagina.ts'

/**
 * Imágenes y videos de Meta Muse (muse.ai), con las cuentas de Meta del usuario, como los pediría él en su chat: Muse no
 * tiene API. Lo mismo que Google Flow (ADR 0014 y 0015): lo genera el servidor, cada cuenta en su Edge con su perfil
 * (`data/meta/cuentas/<id>/`, Chrome en Mac), y los agentes lo piden con el MCP `meta` (`mcp.mjs`). Ningún agente tiene
 * la sesión. ADR 0028.
 *
 * Hasta `A_LA_VEZ_META` pedidos a la vez, de cuentas distintas y con `ENTRE_PEDIDOS` entre uno y otro; cada uno en un chat
 * nuevo. Cada pedido va a la cuenta libre con menos usado de la semana (`elegirCuentaMeta`). Muse no cobra por pedido
 * sino por semana: cada pedido lee lo usado antes de pedir, y si la cuenta ya gastó su semana (o se le fue la sesión) no
 * pidió nada, así que descansa y el pedido pasa a otra que no lo haya probado. Si ninguna puede, falla diciendo por qué.
 * Si nada cambió desde el último archivo de esa ruta (`.huella`), no pide nada, y uno igual que ya está en fila no se
 * repite.
 *
 * Para agregar una cuenta se abre un Edge nuevo con ventana en muse.ai; Sloth solo mira por CDP si ya está su cookie de
 * sesión, sin tocar la página. Al cerrar la ventana lee lo usado y el correo (del Centro de cuentas de Meta), y queda.
 * Agregar una que ya estaba es volver a conectarla: se queda el perfil nuevo.
 */

type Trabajo = TrabajoMeta & { prompt: string; formato: string; imagenes: string[]; primerCuadro: boolean; salida: string; huella: string; probadas: string[]; ultimo?: string }
/** Lo que se guarda de cada cuenta en `cuentas.json`. */
type Guardada = { id: string; correo: string; uso?: UsoMeta; descansa?: { hasta: number; motivo: MotivoMeta } }

const IMAGEN = /\.(png|jpe?g|webp)$/i
/** El tipo en que se guarda la imagen, por la extensión de `salida`; WebP, tal cual la da Muse. */
const COMO_IMAGEN: Record<string, string | undefined> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
const ESPERA_MAXIMA = 50_000
/** Lo más que espera a que entres y cierres la ventana. */
const PLAZO_ENTRAR = 10 * 60_000
/** Entre un pedido y el siguiente, para no parecer un programa. */
const ENTRE_PEDIDOS = 5000
const SESION = { dominio: /(^|\.)muse\.ai$/, nombre: /^hatch_sess$/ }
const SIN_CUENTA = 'No hay cuenta de Meta conectada: que el usuario agregue una en Opciones → Meta Muse.'
const POR_QUE: Record<MotivoMeta, string> = { uso: 'gastó su semana', sesion: 'sin sesión' }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function meta(app: string) {
  const carpeta = join(app, 'data', 'meta')
  const archivo = join(carpeta, 'cuentas.json')
  let lista: Guardada[] = []
  try {
    lista = JSON.parse(readFileSync(archivo, 'utf8'))
  } catch {
    // Aún no se agregó ninguna.
  }
  const guardarLista = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivo, JSON.stringify(lista, null, 1)))
  const perfil = (id: string) => join(carpeta, 'cuentas', id)
  const edges = new Map<string, ReturnType<typeof edgeDe>>()
  const edge = (id: string) => edges.get(id) ?? edges.set(id, edgeDe(perfil(id), URL_MUSE)).get(id)!
  const trabajos = new Map<string, Trabajo>()
  const fila: Trabajo[] = []
  /** Lo que hace cada cuenta ahora, por su id: generar, tener su ventana abierta o leer su uso. */
  const ocupadas = new Map<string, Trabajo>()
  const abiertas = new Set<string>()
  const leyendoIds = new Set<string>()
  const acabo = new Map<string, number>()
  let ultimoInicio = 0
  let pendiente: NodeJS.Timeout | undefined
  let agregando = false
  let error: string | undefined

  const libre = (c: Guardada) => !ocupadas.has(c.id) && !abiertas.has(c.id) && !leyendoIds.has(c.id)

  function descansar(c: Guardada, motivo: MotivoMeta) {
    c.descansa = { hasta: Date.now() + DESCANSO_META[motivo], motivo }
    guardarLista()
  }

  /** Apunta lo leído. Con semana de sobra o la sesión comprobada, deja de descansar. */
  function apuntarUso(c: Guardada, uso: UsoMeta | null) {
    if (!uso) return
    c.uso = uso
    if (uso.porcentaje < 100) c.descansa = undefined
    guardarLista()
  }

  async function borrarPerfil(id: string) {
    await edge(id).cerrar()
    edges.delete(id)
    // Cerrado, Edge tarda unos segundos más en soltar los archivos del perfil (EPERM).
    for (let i = 0; ; i++) {
      try {
        return rmSync(perfil(id), { recursive: true, force: true })
      } catch (e) {
        if (i >= 60) throw e
        await espera(500)
      }
    }
  }

  async function generar(t: Trabajo, c: Guardada) {
    t.estado = 'generando'
    t.cuenta = c.correo
    try {
      await edge(c.id).enEdge(async (b) => {
        const page = await paginaMuse(b)
        try {
          const como = t.tipo === 'imagen' ? COMO_IMAGEN[extname(t.salida).toLowerCase()] : undefined
          const hecho = await generarEnMuse(page, { tipo: t.tipo, prompt: t.prompt, formato: t.formato, primerCuadro: t.primerCuadro }, t.imagenes, como)
          apuntarUso(c, hecho.despues ?? hecho.antes)
          if (tipoDeArchivo(hecho.bytes) !== t.tipo) throw new Error('Lo que dio Muse no es lo pedido.')
          mkdirSync(dirname(t.salida), { recursive: true })
          guardar(t.salida, hecho.bytes)
          guardar(`${t.salida}.huella`, t.huella)
          t.archivo = t.salida
          t.texto = hecho.texto || undefined
          t.uso = hecho.despues ?? undefined
          if (hecho.antes && hecho.despues) t.gasto = hecho.despues.porcentaje - hecho.antes.porcentaje
          t.estado = 'lista'
        } catch (e) {
          await page.screenshot({ path: join(carpeta, 'error.png') }).catch(() => {})
          throw e
        } finally {
          await page.close().catch(() => {})
        }
      })
    } catch (e) {
      if (e instanceof SinUsoMeta || e instanceof SinSesionMeta) {
        // No pidió nada: la cuenta descansa y el pedido vuelve al frente de la fila, para otra.
        if (e instanceof SinUsoMeta) apuntarUso(c, e.uso)
        descansar(c, e instanceof SinUsoMeta ? 'uso' : 'sesion')
        t.probadas.push(c.correo)
        t.ultimo = `${c.correo}: ${mensaje(e)}`
        t.estado = 'en-fila'
        t.cuenta = undefined
        fila.unshift(t)
      } else {
        t.estado = 'error'
        // Sin el archivo, Muse pudo haber gastado: el agente no lo repite solo.
        t.error = e instanceof SinArchivoMeta ? `${e.message} Puede que haya gastado de la semana: no lo pidas otra vez sin cambiarlo.` : mensaje(e)
      }
    } finally {
      acabo.set(c.correo, Date.now())
    }
  }

  function porQueNinguna(t: Trabajo): string {
    if (!lista.length) return SIN_CUENTA
    const ahora = Date.now()
    const renglones = lista.map((c) => (c.descansa && c.descansa.hasta > ahora ? `${c.correo}: ${POR_QUE[c.descansa.motivo]}, vuelve a probar a las ${hora(c.descansa.hasta)}` : `${c.correo}: no pudo`))
    return `Ninguna cuenta de Meta puede ahora. ${renglones.join('; ')}.${t.ultimo ? ` Lo último: ${t.ultimo}` : ''} No se gastó nada.`
  }

  /** Reparte la fila entre las cuentas libres, de una en una y con espacio entre pedidos. */
  function repartir() {
    for (let i = 0; i < fila.length && ocupadas.size < A_LA_VEZ_META; ) {
      const falta = ultimoInicio + ENTRE_PEDIDOS - Date.now()
      if (falta > 0) {
        pendiente ??= setTimeout(() => {
          pendiente = undefined
          repartir()
        }, falta)
        return
      }
      const t = fila[i]
      const usos = lista.map((c) => ({ correo: c.correo, ocupada: !libre(c), porcentaje: c.uso?.porcentaje, descansa: c.descansa, acabo: acabo.get(c.correo) ?? 0 }))
      const elegida = elegirCuentaMeta(usos, Date.now(), t.probadas)
      if (elegida === 'esperar') {
        i++
        continue
      }
      fila.splice(i, 1)
      if (elegida === 'ninguna') {
        t.estado = 'error'
        t.error = porQueNinguna(t)
        continue
      }
      const c = lista.find((x) => x.correo === elegida)!
      ocupadas.set(c.id, t)
      ultimoInicio = Date.now()
      void generar(t, c).finally(() => {
        ocupadas.delete(c.id)
        repartir()
      })
    }
  }

  /** Lee el uso (y la sesión) de una cuenta, en un chat nuevo de su Edge sin ventana. No gasta. */
  async function leerCuenta(c: Guardada) {
    leyendoIds.add(c.id)
    try {
      const uso = await edge(c.id).enEdge(async (b) => {
        const page = await paginaMuse(b)
        try {
          return await leerUso(page)
        } finally {
          await page.close().catch(() => {})
        }
      })
      if (c.descansa?.motivo === 'sesion') c.descansa = undefined
      apuntarUso(c, uso)
      guardarLista()
    } catch (e) {
      if (e instanceof SinSesionMeta) descansar(c, 'sesion')
      throw e
    } finally {
      leyendoIds.delete(c.id)
      repartir()
    }
  }

  /** Las libres, de una en una; con `faltan`, solo las que nunca se leyeron. */
  async function leerTodas(faltan: boolean) {
    const errores: string[] = []
    for (const c of lista.filter((x) => libre(x) && (!faltan || !x.uso))) await leerCuenta(c).catch((e) => errores.push(`${c.correo}: ${mensaje(e)}`))
    error = errores.length ? errores.join(' · ') : undefined
  }

  /** Abre el Edge de `id` con ventana en muse.ai y espera a que la cierres. Dice si para entonces había sesión. */
  async function enVentana(id: string): Promise<boolean> {
    const e = edge(id)
    await e.abrir(URL_MUSE)
    let sesion = false
    // Sin pestañas dos veces seguidas es que cerraste la ventana: recién abierto, Edge puede tardar en enseñar la suya.
    for (let fin = Date.now() + PLAZO_ENTRAR, vacias = 0; Date.now() < fin && vacias < 2; ) {
      await espera(1500)
      const abiertasAhora = await e.paginas()
      vacias = abiertasAhora.length ? 0 : vacias + 1
      if (abiertasAhora.length) sesion ||= await e.tiene(SESION.dominio, SESION.nombre)
    }
    await e.cerrar()
    return sesion
  }

  async function agregar() {
    const id = randomBytes(4).toString('hex')
    try {
      if (!(await enVentana(id))) throw new Error(`No entraste a muse.ai en ${nombreNavegador()}, o cerraste la ventana antes. Vuelve a intentarlo.`)
      const { uso, correo } = await edge(id).enEdge(async (b) => {
        const page = await paginaMuse(b)
        try {
          const uso = await leerUso(page)
          return { uso, correo: await correoEnMeta(page) }
        } finally {
          await page.close().catch(() => {})
        }
      })
      const nombre = correo ?? `Cuenta de Meta ${id}`
      const vieja = lista.find((c) => c.correo === nombre)
      if (vieja && !libre(vieja)) throw new Error(`${nombre} está generando: vuelve a conectarla cuando acabe.`)
      if (vieja) await borrarPerfil(vieja.id)
      lista = [...lista.filter((c) => c !== vieja), { id, correo: nombre, ...(uso ? { uso } : {}) }]
      guardarLista()
    } catch (x) {
      await borrarPerfil(id).catch(() => {})
      throw x instanceof SinSesionMeta ? new Error('Entraste, pero muse.ai no abrió con tu cuenta. Vuelve a intentarlo y cierra la ventana cuando veas el chat de Muse.') : x
    }
  }

  /** Abre su muse.ai con ventana (para mirarlo o volver a entrar) y, al cerrarla, vuelve a leer su sesión y su uso. */
  async function abrir(c: Guardada) {
    abiertas.add(c.id)
    try {
      await enVentana(c.id)
    } finally {
      abiertas.delete(c.id)
    }
    await leerCuenta(c)
  }

  async function quitar(c: Guardada) {
    lista = lista.filter((x) => x !== c)
    guardarLista()
    await borrarPerfil(c.id)
  }

  function pedir(d: Pick<Trabajo, 'tipo' | 'prompt' | 'formato' | 'imagenes' | 'primerCuadro' | 'salida'>): Trabajo {
    const suma = createHash('sha1').update(`meta\n${d.tipo}\n${d.formato}\n${d.primerCuadro ? 'cuadro\n' : ''}${d.prompt}`)
    // Lo que importa de una imagen es lo que tiene, no dónde está.
    for (const r of d.imagenes) suma.update(readFileSync(r))
    const huella = suma.digest('hex')
    const igual = [...trabajos.values()].find((o) => o.salida === d.salida && o.huella === huella && (o.estado === 'en-fila' || o.estado === 'generando'))
    if (igual) return igual
    const t: Trabajo = { ...d, id: randomBytes(6).toString('hex'), estado: 'en-fila', huella, probadas: [] }
    trabajos.set(t.id, t)
    // Los de hace rato ya los recogió su agente.
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    if (existsSync(d.salida) && existsSync(`${d.salida}.huella`) && readFileSync(`${d.salida}.huella`, 'utf8') === huella) return Object.assign(t, { estado: 'lista' as const, archivo: d.salida, gasto: 0 })
    fila.push(t)
    repartir()
    return t
  }

  const publico = ({ prompt: _p, formato: _f, imagenes: _i, primerCuadro: _c, salida: _s, huella: _h, probadas: _pr, ultimo: _u, ...t }: Trabajo): TrabajoMeta => t
  const estado = (): EstadoMeta => {
    const ahora = Date.now()
    const cuentas: CuentaMeta[] = lista.map((c) => ({
      correo: c.correo,
      generando: ocupadas.has(c.id),
      abierta: abiertas.has(c.id),
      ...(c.uso ? { uso: c.uso } : {}),
      ...(c.descansa && c.descansa.hasta > ahora ? { descansa: c.descansa } : {})
    }))
    return { cuentas, agregando, leyendo: leyendoIds.size > 0, navegador: nombreNavegador(), enFila: fila.length + ocupadas.size, error }
  }

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/meta')) return false
    const metodo = req.method ?? 'GET'
    if (path === '/api/meta' && metodo === 'GET') return json(res, 200, estado())
    if (path === '/api/meta/cuentas/agregar' && metodo === 'POST') {
      if (agregando) return json(res, 200, estado())
      if (lista.length >= MAX_CUENTAS_META) return json(res, 409, { error: `Ya tienes ${MAX_CUENTAS_META} cuentas de Meta: quita una para agregar otra.` })
      agregando = true
      error = undefined
      void agregar()
        .then(() => leerTodas(true).catch(() => {}))
        .catch((x) => void (error = mensaje(x)))
        .finally(() => {
          agregando = false
          repartir()
        })
      return json(res, 200, estado())
    }
    if ((path === '/api/meta/abrir' || path === '/api/meta/cuentas/quitar') && metodo === 'POST') {
      const { correo } = await cuerpo<{ correo?: string }>(req)
      const c = lista.find((x) => x.correo === correo)
      if (!c) return json(res, 404, { error: 'No conozco esa cuenta de Meta.' })
      if (!libre(c)) return json(res, 409, { error: `${c.correo} está ocupada: vuelve a intentarlo cuando acabe.` })
      if (path === '/api/meta/cuentas/quitar') {
        await quitar(c)
        return json(res, 200, estado())
      }
      error = undefined
      void abrir(c).catch((x) => void (error = `${c.correo}: ${mensaje(x)}`))
      return json(res, 200, estado())
    }
    if (path === '/api/meta/uso' && metodo === 'POST') {
      const { faltan } = await cuerpo<{ faltan?: boolean }>(req)
      void leerTodas(faltan === true)
      return json(res, 200, { ...estado(), leyendo: lista.some(libre) })
    }
    if (path === '/api/meta/generar' && metodo === 'POST') {
      const d = await cuerpo<{ tipo?: string; prompt?: string; formato?: string; salida?: string; referencias?: string[]; primerCuadro?: string }>(req)
      if (d.tipo !== 'imagen' && d.tipo !== 'video') return json(res, 400, { error: 'El tipo es imagen o video.' })
      const video = d.tipo === 'video'
      const formato = d.formato?.trim() || '9:16'
      if (!FORMATOS_META.includes(formato)) return json(res, 400, { error: `Esa proporción no está. Hay: ${FORMATOS_META.join(', ')}.` })
      if (!d.prompt?.trim() || !d.salida || !isAbsolute(d.salida) || !(video ? /\.mp4$/i : IMAGEN).test(d.salida))
        return json(res, 400, { error: `Pide el prompt y la ruta absoluta del ${video ? '.mp4' : '.png, .jpg o .webp'} donde va.` })
      if (!video && d.primerCuadro) return json(res, 400, { error: 'El primer cuadro es para generar_video.' })
      if (!lista.length) return json(res, 409, { error: SIN_CUENTA })
      const imagenes = [...(d.primerCuadro ? [d.primerCuadro] : []), ...(d.referencias ?? [])]
      if (imagenes.length > MAX_IMAGENES_META) return json(res, 400, { error: `Muse acepta hasta ${MAX_IMAGENES_META} imágenes por pedido.` })
      const mala = imagenes.find((r) => !isAbsolute(r) || !IMAGEN.test(r) || !existsSync(r))
      if (mala) return json(res, 400, { error: `No encuentro la imagen ${mala}: pasa la ruta absoluta de un .png, .jpg o .webp.` })
      return json(res, 200, publico(pedir({ tipo: d.tipo, prompt: d.prompt.trim(), formato, imagenes, primerCuadro: !!d.primerCuadro, salida: resolve(d.salida) })))
    }
    const t = /^\/api\/meta\/trabajos\/(\w+)$/.exec(path)
    if (t && metodo === 'GET') {
      const trabajo = trabajos.get(t[1])
      if (!trabajo) return json(res, 404, { error: 'No conozco ese pedido: Sloth se reinició. Vuelve a pedirlo (si ya estaba hecho, sale al momento y sin gastar).' })
      const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
      while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await espera(500)
      return json(res, 200, publico(trabajo))
    }
    return false
  }

  return {
    api,
    /** Por qué no se puede reiniciar el servidor: cortaría un pedido a medias o una ventana donde entras a muse.ai. */
    ocupado: () =>
      ocupadas.size || fila.length ? 'Sloth está generando en Meta Muse. Espera a que termine.' : agregando || abiertas.size ? 'Hay una ventana de muse.ai abierta: termina o ciérrala.' : null
  }
}

/** El MCP `meta` para los agentes. Compilada, el servidor va en un solo archivo (server/index.mjs) y el MCP en `meta/`. */
export function mcpMeta(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const script = VENTA ? join(aqui, 'meta', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.SLOTH_URL) return {}
  return { meta: { type: 'stdio', command: process.execPath, args: [script], env: { SLOTH_URL: process.env.SLOTH_URL } } }
}
