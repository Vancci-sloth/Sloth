import { createHash, randomBytes } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { Browser } from 'playwright-core'
import { A_LA_VEZ, AVISO_FRENADA, CALMA, type Descanso, descansoNuevo, elegirCuenta, espacioEntrePedidos, FORMATOS_IMAGEN, FORMATOS_VIDEO, type Motivo, MODELOS_IMAGEN, MODELOS_VIDEO, motivoDeAviso, esOmni, PAUSA_CUENTA, puede, RESOLUCIONES_OMNI, type Saldo, tipoDeArchivo, TOPE_CREDITOS, VIDEO_MAS_BARATO } from '../../shared/flow.ts'
import type { EstadoFlow, GastoFlow, SaldoFlow, TrabajoFlow } from '../../shared/types.ts'
import { VENTA } from '../../shared/venta.ts'
import { guardar } from '../disco.ts'
import { cuerpo, json } from '../http.ts'
import { type CuentaFlow, cuentasFlow, nombreNavegador } from './cuentas.ts'
import { generarEnFlow, leerSaldo, paginaFlow, ponerAportar, Rechazado, saldoEnFlow, SinEmpezar, URL_FLOW } from './pagina.ts'

/**
 * Las imágenes (Nano Banana) y los videos (Veo) de Google Flow, en las cuentas de Google del usuario, como los generaría
 * él a mano: Flow no tiene API. Los agentes los piden con el MCP `flow` (`mcp.mjs`), que habla con la API de aquí.
 *
 * Genera con la cuenta de la voz (`server/voz/`, en su Edge y en su turno) y con las que se agreguen en Opciones
 * (`cuentas.ts`, cada una en su Edge), hasta `A_LA_VEZ` a la vez. Cada pedido va a la cuenta libre que lleva más sin
 * generar (`elegirCuenta`), para gastar parejo. Si Flow no lo empieza (sin créditos, frenada, sin sesión) no gastó: la
 * cuenta descansa (`descansos`) y el pedido pasa a otra que no lo haya probado. Si ninguna puede, falla diciendo cuándo
 * vuelven. La sesión de Google no la tiene ningún agente. Lo generado queda en un proyecto de Flow para Sloth
 * (`proyectos`, uno por cuenta), y lo que dura cada pedido está en `pagina.ts`.
 *
 * Si Flow lo empieza y lo rechaza en su tarjeta por «actividad inusual», la cuenta descansa igual. El pedido pasa a otra
 * solo si se comprobó que no gastó (`Rechazado`); si gastó o no se supo, falla diciéndolo. Los pedidos van con ritmo
 * (`espacioEntrePedidos`, `PAUSA_CUENTA`), y tras una frenada, de uno en uno durante `CALMA`: todas las cuentas salen de
 * la misma conexión, y Google las ve juntas.
 *
 * Gasta los créditos del usuario, y por eso: cada pedido lee el costo antes de generar y no pasa de `tope`; si no cambió
 * nada desde el último archivo de esa ruta (`.huella`), no pide nada, y uno igual que ya está en fila no se repite.
 *
 * Lo que le queda a cada cuenta (`saldos`) se lee del menú de su cuenta en Flow tras cada video, y de todas al pedirlo
 * (`/api/flow/saldos`, desde Opciones). Con menos de lo que cuesta el video más barato, la cuenta descansa hasta que se
 * renueve. Lo gastado en videos se apunta por día y por cuenta (`uso`), para verlo en Opciones.
 *
 * `aportar` es «Ayudar a mejorar Flow»: que Google use lo generado para sus productos. Sale apagado aunque en Flow venga
 * encendido, y cada quien lo cambia en Opciones. Se pone en cada cuenta antes de su primer pedido; si no se puede, no se
 * genera.
 *
 * `derechos` es la fecha en que el usuario confirmó que tiene los derechos de las imágenes que manda (referencias y
 * fotogramas) y que cumple la política de Google. Al subir una imagen, Flow pide aceptar eso mismo, y solo con esta
 * confirmación Sloth acepta por él (`subir` en `pagina.ts`): sin ella, un pedido con imágenes no se hace.
 */

type Trabajo = TrabajoFlow & {
  prompt: string
  salida: string
  huella: string
  tope: number
  formato: string
  referencias: string[]
  cuadros: string[]
  /** Las cuentas donde Flow no lo empezó, y lo último que dijo. */
  probadas: string[]
  ultimo?: string
}
interface Ajustes {
  aportar?: boolean
  derechos?: string
  proyectos?: Record<string, string>
  descansos?: Record<string, Descanso>
  saldos?: Record<string, SaldoFlow>
  /** Por día (AAAA-MM-DD, del equipo) y por cuenta, los videos hechos y sus créditos. */
  uso?: Record<string, Record<string, GastoFlow>>
}
/** Lo que Flow toma de la voz (`voz()`): su cuenta de Google y su Edge. */
export interface Google {
  cuenta(): string | null
  enEdge<T>(fn: (b: Browser) => Promise<T>): Promise<T>
  abrirEnEdge(url: string): Promise<void>
}

const ESPERA_MAXIMA = 50_000
const SIN_CUENTA = 'No hay cuenta de Google conectada: que el usuario conecte una en Opciones → Voz o agregue una en Opciones → Google Flow.'
const SIN_DERECHOS = 'Para mandar imágenes a Flow (referencias o fotogramas), el usuario debe confirmar que tiene sus derechos, en Opciones → Google Flow. No se generó nada.'
const IMAGEN = /\.(png|jpe?g|webp)$/i
const POR_QUE: Record<Motivo, string> = { creditos: 'sin créditos de video', frenada: 'Flow la frenó por pedir mucho', sesion: 'perdió la sesión' }
const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const dia = (ms: number) => new Date(ms).toLocaleDateString('sv')
/** Los días de `uso` que se guardan. */
const DIAS_DE_USO = 62
const sumar = (a: GastoFlow, b: GastoFlow): GastoFlow => ({ videos: a.videos + b.videos, creditos: a.creditos + b.creditos })
const NADA: GastoFlow = { videos: 0, creditos: 0 }

export function flow(app: string, google: Google) {
  const carpeta = join(app, 'data', 'flow')
  const descargas = join(carpeta, 'descargas')
  const archivoAjustes = join(carpeta, 'ajustes.json')
  let ajustes: Ajustes = {}
  try {
    ajustes = JSON.parse(readFileSync(archivoAjustes, 'utf8'))
  } catch {
    // Aún no se usó.
  }
  const guardarAjustes = () => (mkdirSync(carpeta, { recursive: true }), guardar(archivoAjustes, JSON.stringify(ajustes, null, 1)))
  const otras = cuentasFlow(carpeta)

  /** Todas las cuentas con que genera: primero la de la voz. */
  function cuentas(): CuentaFlow[] {
    const voz = google.cuenta()
    const suya: CuentaFlow[] = voz ? [{ correo: voz, deLaVoz: true, enEdge: google.enEdge, abrir: google.abrirEnEdge }] : []
    return [...suya, ...otras.lista().filter((c) => c.correo !== voz)]
  }

  const trabajos = new Map<string, Trabajo>()
  const fila: Trabajo[] = []
  /** Las cuentas que están generando, cuándo empezó cada una su último pedido y cuándo acabó. */
  const ocupadas = new Set<string>()
  const usada = new Map<string, number>()
  const acabo = new Map<string, number>()
  /** Las cuentas donde ya se puso `aportar` desde que arrancó el servidor, con su valor. */
  const aplicado = new Map<string, boolean>()
  /** Cuándo puede empezar el siguiente pedido, y hasta cuándo se va con calma tras una frenada. */
  let siguiente = 0
  let calmaHasta = 0
  let despertar: NodeJS.Timeout | undefined

  // Una cuenta que acaba de generar cuenta como ocupada durante su pausa.
  const usos = (ahora: number) =>
    cuentas().map((c) => {
      const d = ajustes.descansos?.[c.correo]
      const ocupada = ocupadas.has(c.correo) || (acabo.get(c.correo) ?? 0) + PAUSA_CUENTA > ahora
      return { correo: c.correo, ocupada, usada: usada.get(c.correo) ?? 0, descansa: d && d.hasta > ahora ? d : undefined }
    })

  /** Sin créditos, descansa hasta que se renueven, si se sabe cuándo. Una frenada calma a todas: Google las ve juntas. */
  function descansar(correo: string, motivo: Motivo) {
    const ahora = Date.now()
    ajustes.descansos = { ...ajustes.descansos, [correo]: descansoNuevo(motivo, ahora, ajustes.descansos?.[correo], ajustes.saldos?.[correo]?.renueva) }
    if (motivo === 'frenada') calmaHasta = ahora + CALMA
    guardarAjustes()
  }

  /** Lo que se leyó que le queda: sin para un video, descansa; con, deja de descansar por créditos. */
  function apuntarSaldo(correo: string, s: Saldo | null) {
    if (!s) return
    const maximo = Math.max(ajustes.saldos?.[correo]?.maximo ?? 0, s.creditos)
    ajustes.saldos = { ...ajustes.saldos, [correo]: { ...s, leido: Date.now(), maximo } }
    if (s.creditos < VIDEO_MAS_BARATO) return descansar(correo, 'creditos')
    if (ajustes.descansos?.[correo]?.motivo === 'creditos') {
      const { [correo]: _, ...resto } = ajustes.descansos
      ajustes.descansos = resto
    }
    guardarAjustes()
  }

  /** `videos`: 0 si Flow lo rechazó y aun así cobró. */
  function apuntarUso(correo: string, creditos: number, videos = 1) {
    const hoy = dia(Date.now())
    const desde = dia(Date.now() - DIAS_DE_USO * 86_400_000)
    const uso = Object.fromEntries(Object.entries(ajustes.uso ?? {}).filter(([d]) => d >= desde))
    uso[hoy] = { ...uso[hoy], [correo]: sumar(uso[hoy]?.[correo] ?? NADA, { videos, creditos }) }
    ajustes.uso = uso
    guardarAjustes()
  }

  /** Lo que queda entre las cuentas cuyo saldo sigue valiendo: leído, y sin renovarse desde entonces. */
  const quedan = (ahora: number) =>
    cuentas().reduce((n, c) => {
      const s = ajustes.saldos?.[c.correo]
      return s && !(s.renueva && s.renueva <= ahora) ? n + s.creditos : n
    }, 0)

  /** Por qué ninguna cuenta puede con `t` ahora, dicho para el agente. */
  function porQueNinguna(t: Trabajo): string {
    const ahora = Date.now()
    const descansan = usos(ahora).filter((c) => !puede(c, t.tipo, ahora) && c.descansa)
    const vuelve = Math.min(...descansan.map((c) => c.descansa!.hasta))
    const cuales = descansan.map((c) => `${c.correo} (${POR_QUE[c.descansa!.motivo]})`).join(', ')
    const antes = t.ultimo ? `${t.ultimo} ` : ''
    return `${antes}Ninguna cuenta de Google puede generarlo ahora${cuales ? `: ${cuales}` : ''}.${descansan.length ? ` Vuelven a probar desde las ${hora(vuelve)}.` : ''} No se gastó nada. Para tener más, el usuario puede agregar cuentas en Opciones → Google Flow.`
  }

  async function generar(t: Trabajo, c: CuentaFlow) {
    t.estado = 'generando'
    t.cuenta = c.correo
    const bajada = join(descargas, t.id)
    try {
      await c.enEdge(async (b) => {
        const page = await paginaFlow(b)
        try {
          if ((t.referencias.length || t.cuadros.length) && !ajustes.derechos) throw new Error(SIN_DERECHOS)
          const aportar = ajustes.aportar === true
          if (aplicado.get(c.correo) !== aportar) {
            await ponerAportar(page, aportar)
            aplicado.set(c.correo, aportar)
          }
          const pedido = { tipo: t.tipo, prompt: t.prompt, formato: t.formato, modelo: t.modelo, resolucion: t.resolucion, tope: t.tope, referencias: t.referencias, cuadros: t.cuadros }
          const hecho = await generarEnFlow(b, page, ajustes.proyectos?.[c.correo], pedido, bajada, (proyecto) => {
            if (ajustes.proyectos?.[c.correo] === proyecto) return
            ajustes.proyectos = { ...ajustes.proyectos, [c.correo]: proyecto }
            guardarAjustes()
          })
          if (tipoDeArchivo(readFileSync(hecho.archivo)) !== t.tipo) throw new Error('Lo que bajó de Flow no es lo pedido (¿se fue la sesión?).')
          mkdirSync(dirname(t.salida), { recursive: true })
          copyFileSync(hecho.archivo, t.salida)
          guardar(`${t.salida}.huella`, t.huella)
          t.creditos = hecho.creditos
          if (t.tipo === 'video') {
            apuntarUso(c.correo, hecho.creditos)
            // En la misma página y antes de darlo por hecho: así el agente sabe cuánto queda.
            apuntarSaldo(c.correo, await leerSaldo(page).catch(() => null))
            t.quedan = quedan(Date.now())
          }
          t.archivo = t.salida
          t.estado = 'lista'
        } catch (e) {
          await page.screenshot({ path: join(carpeta, 'error.png') }).catch(() => {})
          throw e
        } finally {
          await page.close().catch(() => {})
        }
      })
    } catch (e) {
      const frenada = e instanceof Rechazado && AVISO_FRENADA.test(e.aviso)
      if (e instanceof Rechazado) {
        if (e.saldo) apuntarSaldo(c.correo, e.saldo)
        if (e.gasto) apuntarUso(c.correo, e.gasto, 0)
        if (frenada) descansar(c.correo, 'frenada')
      }
      if (e instanceof SinEmpezar) descansar(c.correo, e.sesion ? 'sesion' : motivoDeAviso(e.aviso, t.tipo))
      if (e instanceof SinEmpezar || (frenada && e.gasto === 0)) {
        // No gastó: el pedido vuelve al frente de la fila, para otra cuenta.
        t.probadas.push(c.correo)
        t.ultimo = `${c.correo}: ${mensaje(e)}`
        t.estado = 'en-fila'
        t.cuenta = undefined
        fila.unshift(t)
      } else {
        t.estado = 'error'
        t.error = e instanceof Rechazado ? `${mensaje(e)} ${cuantoGasto(e, frenada)}` : mensaje(e)
      }
    } finally {
      acabo.set(c.correo, Date.now())
      rmSync(bajada, { recursive: true, force: true })
    }
  }

  /** Lo que se le dice al agente de un pedido rechazado: si gastó y si puede pedirlo otra vez. */
  function cuantoGasto(e: Rechazado, frenada: boolean): string {
    const descanso = frenada ? ' Flow frenó esa cuenta: descansa un rato y los pedidos siguientes van más despacio.' : ''
    if (e.gasto === 0) return `No gastó créditos: se puede pedir otra vez cambiando lo que Flow no aceptó.${descanso}`
    if (e.gasto) return `Flow cobró ${e.gasto} créditos aunque no lo hizo. No lo pidas otra vez sin decírselo al usuario.${descanso}`
    return `No se pudo comprobar si gastó créditos. No lo pidas otra vez sin decírselo al usuario.${descanso}`
  }

  let leyendo = false
  const sinLeer = () => cuentas().filter((c) => !ajustes.saldos?.[c.correo])
  /** Lee lo que le queda a cada cuenta (`faltan`: solo a las que nunca se leyeron), `A_LA_VEZ` a la vez. No gasta. */
  async function leerSaldos(faltan: boolean) {
    const pendientes = faltan ? sinLeer() : cuentas()
    if (leyendo || !pendientes.length) return
    leyendo = true
    const una = async (c: CuentaFlow) => {
      try {
        const s = await c.enEdge(async (b) => {
          const page = await paginaFlow(b)
          try {
            return await saldoEnFlow(page)
          } finally {
            await page.close().catch(() => {})
          }
        })
        apuntarSaldo(c.correo, s)
      } catch (e) {
        if (e instanceof SinEmpezar && e.sesion) descansar(c.correo, 'sesion')
      }
    }
    try {
      await Promise.all(
        Array.from({ length: A_LA_VEZ }, async () => {
          for (let c = pendientes.shift(); c; c = pendientes.shift()) await una(c)
        })
      )
    } finally {
      leyendo = false
    }
  }

  /** Vuelve a repartir en `ms`, si hay algo en fila (una pausa o el espacio entre pedidos lo detuvo). */
  function repartirEn(ms: number) {
    clearTimeout(despertar)
    if (fila.length) despertar = setTimeout(repartir, Math.max(1000, ms)).unref()
  }

  /**
   * Reparte lo que hay en fila entre las cuentas libres, en orden y de uno en uno, con su espacio entre pedidos. Lo que
   * ninguna puede hacer, falla.
   */
  function repartir() {
    const ahora = Date.now()
    if (ahora < siguiente) return repartirEn(siguiente - ahora)
    const calma = calmaHasta > ahora
    for (const t of [...fila]) {
      if (ocupadas.size >= (calma ? 1 : A_LA_VEZ)) return
      const elegida = elegirCuenta(usos(ahora), t.tipo, ahora, t.probadas)
      if (elegida === 'esperar') continue
      fila.splice(fila.indexOf(t), 1)
      if (elegida === 'ninguna') {
        t.estado = 'error'
        t.error = porQueNinguna(t)
        continue
      }
      const c = cuentas().find((x) => x.correo === elegida)!
      ocupadas.add(c.correo)
      usada.set(c.correo, ahora)
      siguiente = ahora + espacioEntrePedidos(calma, Math.random())
      void generar(t, c).finally(() => {
        ocupadas.delete(c.correo)
        repartir()
      })
      return repartirEn(siguiente - ahora)
    }
    // Lo que queda espera a que acabe la pausa de alguna cuenta.
    repartirEn(5000)
  }

  function pedir(d: Pick<Trabajo, 'tipo' | 'prompt' | 'formato' | 'modelo' | 'resolucion' | 'salida' | 'tope' | 'referencias' | 'cuadros'>): Trabajo {
    // Sin resolución (Veo), la huella de siempre: lo ya hecho no se repite.
    const suma = createHash('sha1').update(`${d.tipo}\n${d.modelo}${d.resolucion ? ` ${d.resolucion}` : ''}\n${d.formato}\n${d.prompt}`)
    // Lo que importa de una imagen es lo que tiene, no dónde está. Los fotogramas, aparte: no son referencias.
    for (const r of d.referencias) suma.update(readFileSync(r))
    if (d.cuadros.length) suma.update('\nfotogramas\n')
    for (const r of d.cuadros) suma.update(readFileSync(r))
    const huella = suma.digest('hex')
    const igual = [...trabajos.values()].find((o) => o.salida === d.salida && o.huella === huella && (o.estado === 'en-fila' || o.estado === 'generando'))
    if (igual) return igual
    const t: Trabajo = { ...d, id: randomBytes(6).toString('hex'), estado: 'en-fila', huella, probadas: [] }
    trabajos.set(t.id, t)
    // Los de hace rato ya los recogió su agente.
    for (const id of [...trabajos.keys()].slice(0, -100)) trabajos.delete(id)
    if (existsSync(d.salida) && existsSync(`${d.salida}.huella`) && readFileSync(`${d.salida}.huella`, 'utf8') === huella) return Object.assign(t, { estado: 'lista', archivo: d.salida, creditos: 0 })
    fila.push(t)
    repartir()
    return t
  }

  const publico = ({ prompt: _p, salida: _s, huella: _h, tope: _t, formato: _f, referencias: _r, cuadros: _c, probadas: _pr, ultimo: _u, ...t }: Trabajo): TrabajoFlow => t
  const estado = (): EstadoFlow => {
    const ahora = Date.now()
    const hoy = dia(ahora)
    const deHoy = ajustes.uso?.[hoy] ?? {}
    const delMes = Object.entries(ajustes.uso ?? {}).filter(([d]) => d.startsWith(hoy.slice(0, 7)))
    return {
      cuentas: cuentas().map((c) => {
        const d = ajustes.descansos?.[c.correo]
        const saldo = ajustes.saldos?.[c.correo]
        return {
          correo: c.correo,
          deLaVoz: c.deLaVoz,
          generando: ocupadas.has(c.correo),
          ...(d && d.hasta > ahora ? { descansa: d } : {}),
          ...(saldo ? { saldo } : {}),
          hoy: deHoy[c.correo] ?? NADA
        }
      }),
      uso: { hoy: Object.values(deHoy).reduce(sumar, NADA), mes: delMes.flatMap(([, d]) => Object.values(d)).reduce(sumar, NADA) },
      quedan: quedan(ahora),
      leyendo,
      agregando: otras.agregando(),
      navegador: nombreNavegador(),
      enFila: fila.length + ocupadas.size,
      aportar: ajustes.aportar === true,
      derechos: !!ajustes.derechos,
      error: otras.error()
    }
  }

  /** Una imagen que manda el agente: ruta absoluta de un .png, .jpg o .webp que existe. */
  const imagenMala = (rutas: string[]) => rutas.find((r) => !isAbsolute(r) || !IMAGEN.test(r) || !existsSync(r))

  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/flow')) return false
    const metodo = req.method ?? 'GET'
    if (path === '/api/flow' && metodo === 'GET') return json(res, 200, estado())
    if (path === '/api/flow/ajustes' && metodo === 'POST') {
      const d = await cuerpo<{ aportar?: boolean; derechos?: boolean }>(req)
      if (d.aportar !== undefined) ajustes.aportar = d.aportar
      if (d.derechos !== undefined) ajustes.derechos = d.derechos ? new Date().toISOString() : undefined
      guardarAjustes()
      return json(res, 200, estado())
    }
    if (path === '/api/flow/abrir' && metodo === 'POST') {
      const { correo } = await cuerpo<{ correo?: string }>(req)
      const c = cuentas().find((x) => x.correo === correo) ?? cuentas()[0]
      if (!c) return json(res, 409, { error: SIN_CUENTA })
      if (ocupadas.has(c.correo)) return json(res, 409, { error: `${c.correo} está generando: ábrela cuando acabe.` })
      await c.abrir(URL_FLOW)
      return json(res, 200, estado())
    }
    if (path === '/api/flow/saldos' && metodo === 'POST') {
      const { faltan } = await cuerpo<{ faltan?: boolean }>(req)
      const habia = faltan ? sinLeer().length : cuentas().length
      void leerSaldos(faltan === true)
      return json(res, 200, { ...estado(), leyendo: leyendo || habia > 0 })
    }
    if (path === '/api/flow/cuentas/agregar' && metodo === 'POST') {
      otras.agregar(google.cuenta(), (correo) => {
        // Volver a conectarla la deja lista aunque descansara, y se vuelve a leer lo que le queda.
        const { [correo]: _d, ...descansos } = ajustes.descansos ?? {}
        const { [correo]: _s, ...saldos } = ajustes.saldos ?? {}
        ajustes.descansos = descansos
        ajustes.saldos = saldos
        guardarAjustes()
        void leerSaldos(true)
      })
      return json(res, 200, estado())
    }
    if (path === '/api/flow/cuentas/quitar' && metodo === 'POST') {
      const { correo } = await cuerpo<{ correo?: string }>(req)
      if (!correo) return json(res, 400, { error: 'Falta el correo.' })
      if (ocupadas.has(correo)) return json(res, 409, { error: `${correo} está generando: quítala cuando acabe.` })
      await otras.quitar(correo)
      return json(res, 200, estado())
    }
    if (path === '/api/flow/generar' && metodo === 'POST') {
      const d = await cuerpo<{ tipo?: string; prompt?: string; formato?: string; modelo?: string; resolucion?: string; salida?: string; tope?: number; referencias?: string[]; primerCuadro?: string; ultimoCuadro?: string }>(req)
      if (d.tipo !== 'imagen' && d.tipo !== 'video') return json(res, 400, { error: 'El tipo es imagen o video.' })
      const video = d.tipo === 'video'
      const modelos = video ? MODELOS_VIDEO : MODELOS_IMAGEN
      const formatos = video ? FORMATOS_VIDEO : FORMATOS_IMAGEN
      const modelo = d.modelo?.trim() || modelos[0]
      const formato = d.formato?.trim() || '9:16'
      if (!modelos.includes(modelo)) return json(res, 400, { error: `Flow no tiene ese modelo. Hay: ${modelos.join(', ')}.` })
      if (!formatos[formato]) return json(res, 400, { error: `Esa proporción no está. Hay: ${Object.keys(formatos).join(', ')}.` })
      const resolucion = esOmni(modelo) ? d.resolucion?.trim() || RESOLUCIONES_OMNI[0] : undefined
      if (resolucion && !RESOLUCIONES_OMNI.includes(resolucion)) return json(res, 400, { error: `Omni sale en ${RESOLUCIONES_OMNI.join(' o ')}.` })
      if (!resolucion && d.resolucion && d.resolucion !== '720p') return json(res, 400, { error: 'Solo Omni deja elegir la resolución: Veo sale en 720p.' })
      if (!d.prompt?.trim() || !d.salida || !isAbsolute(d.salida) || !(video ? /\.mp4$/i : /\.jpe?g$/i).test(d.salida))
        return json(res, 400, { error: `Pide el prompt y la ruta absoluta del ${video ? '.mp4' : '.jpg'} donde va.` })
      if (!cuentas().length) return json(res, 409, { error: SIN_CUENTA })
      const referencias = d.referencias ?? []
      const cuadros = video && d.primerCuadro ? [d.primerCuadro, ...(d.ultimoCuadro ? [d.ultimoCuadro] : [])] : []
      if (!video && (d.primerCuadro || d.ultimoCuadro)) return json(res, 400, { error: 'Los fotogramas son para generar_video.' })
      if (d.ultimoCuadro && !d.primerCuadro) return json(res, 400, { error: 'Para acabar en una imagen, pasa también primerCuadro.' })
      if (cuadros.length && referencias.length)
        return json(res, 400, { error: 'Flow hace un video desde fotogramas o con referencias, no las dos: pon a los personajes en el primer cuadro (generar_imagen con sus referencias) y anímalo.' })
      const mala = imagenMala([...referencias, ...cuadros])
      if (mala) return json(res, 400, { error: `No encuentro la imagen ${mala}: pasa la ruta absoluta de un .png, .jpg o .webp.` })
      if ((referencias.length || cuadros.length) && !ajustes.derechos) return json(res, 409, { error: SIN_DERECHOS })
      return json(res, 200, publico(pedir({ tipo: d.tipo, prompt: d.prompt.trim(), formato, modelo, resolucion, salida: resolve(d.salida), tope: d.tope ?? TOPE_CREDITOS, referencias, cuadros })))
    }
    const t = /^\/api\/flow\/trabajos\/(\w+)$/.exec(path)
    if (t && metodo === 'GET') {
      const trabajo = trabajos.get(t[1])
      if (!trabajo) return json(res, 404, { error: 'No conozco ese pedido: Sloth se reinició. Vuelve a pedirlo (si ya estaba hecho, sale al momento y sin gastar).' })
      const hasta = Date.now() + Math.min(ESPERA_MAXIMA, Number(new URL(req.url ?? '', 'http://x').searchParams.get('esperar') ?? 0) * 1000)
      while ((trabajo.estado === 'en-fila' || trabajo.estado === 'generando') && Date.now() < hasta) await new Promise((r) => setTimeout(r, 500))
      return json(res, 200, publico(trabajo))
    }
    return false
  }

  return {
    api,
    /** Por qué no se puede reiniciar el servidor: cortaría un pedido ya pagado o en fila, o la ventana donde entras con Google. */
    ocupado: () => (ocupadas.size || fila.length ? 'Sloth está generando en Google Flow. Espera a que termine.' : otras.agregando() ? 'Hay una ventana abierta para entrar con Google en Flow: termina o ciérrala.' : null)
  }
}

/** El MCP `flow` para los agentes (`mcp.mjs`): lo corre el Node de Sloth y habla con la API de este servidor. */
export function mcpFlow(): Record<string, McpStdioServerConfig> {
  const aqui = dirname(fileURLToPath(import.meta.url))
  // Compilada (`scripts/compilar.mjs`), el servidor va en un solo archivo, server/index.mjs, y el MCP a su lado.
  const script = VENTA ? join(aqui, 'flow', 'mcp.mjs') : join(aqui, 'mcp.mjs')
  if (!existsSync(script) || !process.env.SLOTH_URL) return {}
  return { flow: { type: 'stdio', command: process.execPath, args: [script], env: { SLOTH_URL: process.env.SLOTH_URL } } }
}

const mensaje = (e: unknown) => String(e instanceof Error ? e.message : e).split('\n')[0]
