import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { CONFIG_POR_DEFECTO, IDIOMAS_PILOTO, validarConfig, type ConfigPiloto, type TurnoPiloto, type VistaPiloto } from '../shared/piloto.ts'
import type { Card, Model } from '../shared/types.ts'
import { guardar } from './disco.ts'

/**
 * «Piloto automático»: apagado por defecto. Con el brief de la marca (Opciones → Piloto automático), cada 10 minutos
 * Sloth mira los horarios de hoy y, por cada uno libre, crea UN hilo (un video por hilo) del estilo elegido. Todos van
 * como un lote (`sessions.crearLote`): esperan su turno y el repartidor arranca los que caben en la computadora. Si un
 * hilo del piloto aún trabaja, no se crea otro.
 *
 * - El primer mensaje lleva el brief, la regla de no vender de frente y un gancho y un tema que rotan sin repetir los
 *   últimos (`elegirRotando`).
 * - Al terminar el hilo, su video vertical entra a la cola de redes de Sloth (`server/redes/`) a la hora de su horario
 *   (`publicarSolo`) o queda «por revisar» en Opciones, con su botón para programarlo.
 * - Todo vive en `data/piloto/piloto.json` (`guardar()`): la configuración y los últimos turnos.
 *
 * Apagarlo: el interruptor de Opciones. Quitarlo: borrar este archivo, `shared/piloto.ts`, `web/src/Piloto.tsx` y las
 * líneas marcadas «piloto».
 */

/** Cada cuánto mira. */
export const CADA = 10 * 60_000
/** Un horario a menos de esto ya no da tiempo de hacer el video: se salta. */
export const MARGEN = 30 * 60_000
/** Un hilo quieto y sin video por tanto tiempo es un video que no salió. */
const SIN_VIDEO = 10 * 60_000
/** Cuántos turnos se guardan. */
const TURNOS = 200
/** Cómo se rellena el día si `videosPorDia` pasa de los horarios que hay. */
const RELLENO = ['13:00', '16:00', '21:00', '08:00', '11:00', '18:00', '15:00', '20:00', '09:00', '12:00', '17:00', '22:00']

export interface HilosPiloto {
  /** Crea los hilos (un lote, un video por hilo) y devuelve sus ids en el mismo orden. */
  crear(p: { cardId: string; modelo: string; esfuerzo?: string; videos: { title: string; text: string }[] }): string[]
  /** Si el hilo trabaja o espera su turno y cuándo se movió por última vez; `undefined` si ya no existe. */
  estado(id: string): { trabajando: boolean; t: number } | undefined
}

export interface OpcionesPiloto {
  dir: string
  cards(): Card[]
  modelos(): Model[]
  hilos: HilosPiloto
  /** La ruta del video vertical terminado de un hilo, si ya hay. */
  videoDe(cardId: string, sesion: string): string | undefined
  /** Mete el video a la cola de redes; `cuando` es `AAAA-MM-DD HH:MM` (hora local). */
  programar(cardId: string, ruta: string, cuando: string): Promise<void>
  ahora?: () => number
  /** La zona de los horarios; la de esta computadora si no se dice. */
  zona?: () => string
}

interface Archivo {
  config: ConfigPiloto
  turnos: TurnoPiloto[]
}

/* ---------- Horas en una zona ---------- */

/** La zona de esta computadora. */
export const zonaLocal = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function zonaValida(tz?: string | null): string {
  if (!tz) return zonaLocal()
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return zonaLocal()
  }
}

const formatos = new Map<string, Intl.DateTimeFormat>()
function partes(t: number, tz: string) {
  let f = formatos.get(tz)
  if (!f) formatos.set(tz, (f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })))
  const p = Object.fromEntries(f.formatToParts(t).map((x) => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

/** El día (`AAAA-MM-DD`) y la hora (`HH:MM`) de un instante en una zona. */
export function enZona(t: number, tz: string): { fecha: string; hora: string } {
  const p = partes(t, tz)
  const dos = (x: number) => String(x).padStart(2, '0')
  return { fecha: `${p.y}-${dos(p.m)}-${dos(p.d)}`, hora: `${dos(p.h)}:${dos(p.mi)}` }
}

/** El instante (ms) de un día y una hora en una zona, con su horario de verano. */
export function instanteDe(fecha: string, hora: string, tz: string): number {
  const [y, m, d] = fecha.split('-').map(Number)
  const [h, mi] = hora.split(':').map(Number)
  const comoUtc = Date.UTC(y, m - 1, d, h, mi)
  const desfase = (t: number) => {
    const p = partes(t, tz)
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(t / 1000) * 1000
  }
  let t = comoUtc - desfase(comoUtc)
  const otro = desfase(t)
  if (comoUtc - otro !== t) t = comoUtc - otro
  return t
}

export function sumarDia(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/* ---------- Qué toca hoy ---------- */

const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))

/** Los horarios de un día: los tuyos, tantos como `videosPorDia` (si faltan, se rellena lejos de los que hay). */
export function horariosDelDia(c: Pick<ConfigPiloto, 'horarios' | 'videosPorDia'>): string[] {
  const n = Math.min(6, Math.max(1, c.videosPorDia || 1))
  const lista = [...new Set(c.horarios)].sort().slice(0, n)
  for (const h of RELLENO) {
    if (lista.length >= n) break
    if (lista.every((x) => Math.abs(minutos(x) - minutos(h)) >= 60)) lista.push(h)
  }
  return lista.sort()
}

export interface Horario {
  fecha: string
  hora: string
  instante: number
}

type Dia = Pick<TurnoPiloto, 'fecha' | 'hora'>

/** Los horarios de hoy que siguen libres (sin turno) y aún dan tiempo: cuántos videos faltan para hoy. */
export function faltanHoy(c: Pick<ConfigPiloto, 'horarios' | 'videosPorDia'>, turnos: Dia[], ahora: number, tz: string): Horario[] {
  const { fecha } = enZona(ahora, tz)
  const tomados = new Set(turnos.map((t) => `${t.fecha} ${t.hora}`))
  return horariosDelDia(c)
    .map((hora) => ({ fecha, hora, instante: instanteDe(fecha, hora, tz) }))
    .filter((h) => !tomados.has(`${h.fecha} ${h.hora}`) && h.instante >= ahora + MARGEN)
}

/** El siguiente horario libre, de hoy o de los dos días que siguen («Hacer uno ahora»). */
export function siguienteLibre(c: Pick<ConfigPiloto, 'horarios' | 'videosPorDia'>, turnos: Dia[], ahora: number, tz: string): Horario | undefined {
  const tomados = new Set(turnos.map((t) => `${t.fecha} ${t.hora}`))
  const hoy = enZona(ahora, tz).fecha
  for (let dia = 0; dia < 3; dia++) {
    const fecha = sumarDia(hoy, dia)
    for (const hora of horariosDelDia(c)) {
      const instante = instanteDe(fecha, hora, tz)
      if (!tomados.has(`${fecha} ${hora}`) && instante >= ahora + MARGEN) return { fecha, hora, instante }
    }
  }
  return undefined
}

/**
 * El que toca de una lista: el que nunca se usó, o el que se usó hace más tiempo. `usados` va del más viejo al más
 * nuevo. Así no se repite ninguno de los últimos mientras haya otro.
 */
export function elegirRotando(lista: string[], usados: string[]): string {
  const opciones = [...new Set(lista.map((x) => x.trim()).filter(Boolean))]
  if (!opciones.length) return ''
  let mejor = opciones[0]
  let cuando = Infinity
  for (const o of opciones) {
    const i = usados.lastIndexOf(o)
    if (i < cuando) (mejor = o), (cuando = i)
  }
  return mejor
}

/** La card de ese id si es un estilo de video (etapas con `fase`); si no, la del explicativo o el primer estilo de video. */
export function cardDelEstilo(cards: Card[], id: string): Card | undefined {
  const videos = cards.filter((c) => c.etapas?.some((e) => e.fase))
  return videos.find((c) => c.id === id) ?? videos.find((c) => c.id === 'video-explicativo') ?? videos[0]
}

/** Un modelo de Claude Sonnet, o de Claude, o el primero. */
export function modeloPorDefecto(modelos: Model[]): Model | undefined {
  return modelos.find((m) => /sonnet/i.test(m.id) && !m.id.includes(':')) ?? modelos.find((m) => !m.id.includes(':')) ?? modelos[0]
}

const lista = (titulo: string, xs: string[]) => (xs.length ? `${titulo}:\n${xs.map((x) => `- ${x}`).join('\n')}` : '')

/** El primer mensaje de un video del piloto. */
export function primerMensaje(c: ConfigPiloto, t: Pick<TurnoPiloto, 'fecha' | 'hora' | 'gancho' | 'tema'>): string {
  const idioma = IDIOMAS_PILOTO[c.idioma] ?? c.idioma
  return [
    `Un video vertical (9:16) del piloto automático de Sloth. Nadie lo revisa mientras lo haces: decide tú y no preguntes; si algo falta, elige lo más sensato y sigue.`,
    `Marca: ${c.marca}`,
    c.publico ? `Le habla a: ${c.publico}` : '',
    'Regla de oro: no vendas de frente. El video explica, emociona o entretiene a quien tiene ese problema; la marca sale sutil, solo al final (una línea o el logo, junto a la llamada a la acción). Nada de precios, promociones ni «contáctanos» en medio.',
    `Gancho (los primeros 3 segundos y el texto del primer cuadro): ${t.gancho || 'elígelo tú a partir del tema'}`,
    `Tema de este video: ${t.tema || 'elígelo tú de lo que vive esa persona'}`,
    [`Idioma: ${idioma}.`, c.tono ? `Tono: ${c.tono}.` : '', c.cta ? `Llamada a la acción (al final, suave): ${c.cta}` : ''].filter(Boolean).join(' '),
    lista('Otros temas (no los uses en este video)', c.temas.filter((x) => x !== t.tema)),
    lista('Otros ganchos (no uses estos en este video)', c.ganchos.filter((x) => x !== t.gancho)),
    'No inventes datos: ningún número, cliente, testimonio o resultado que no venga de aquí.',
    'Formato: vertical',
    'Voz: genérala tú; nadie la va a mandar. Usa la que dice tu skill y, si no dice ninguna, una que vaya con el tono (cómo, en video-base/VOZ.md).',
    'No publiques nada: al terminar el render, Sloth mete el video a su cola de redes.',
    `Piloto: ${t.fecha} ${t.hora}`
  ]
    .filter(Boolean)
    .join('\n\n')
}

/* ---------- El piloto ---------- */

export function piloto(o: OpcionesPiloto) {
  const ahora = o.ahora ?? Date.now
  const zonaDe = o.zona ?? zonaLocal
  let ocupado = false
  mkdirSync(o.dir, { recursive: true })
  const ruta = join(o.dir, 'piloto.json')

  function leer(): Archivo {
    try {
      const a = JSON.parse(readFileSync(ruta, 'utf8')) as Partial<Archivo>
      return { config: { ...CONFIG_POR_DEFECTO, ...a.config, encendido: a.config?.encendido === true }, turnos: Array.isArray(a.turnos) ? a.turnos : [] }
    } catch {
      return { config: { ...CONFIG_POR_DEFECTO }, turnos: [] }
    }
  }
  function escribir(a: Archivo) {
    a.turnos = a.turnos.slice(-TURNOS)
    guardar(ruta, JSON.stringify(a, null, 2) + '\n')
  }
  const cambiarTurno = (id: string, cambios: Partial<TurnoPiloto>) => {
    const a = leer()
    const t = a.turnos.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, cambios)
    escribir(a)
  }
  const cuandoDe = (t: Pick<TurnoPiloto, 'fecha' | 'hora'>) => `${t.fecha} ${t.hora}`

  /** Mete a la cola de redes el video de un turno. Si falla, el turno guarda el error y el video queda para reintentar. */
  async function meter(t: TurnoPiloto, video: string) {
    try {
      await o.programar(t.cardId, video, cuandoDe(t))
      cambiarTurno(t.id, { estado: 'programado', ruta: video, error: undefined })
    } catch (e) {
      cambiarTurno(t.id, { estado: 'error', ruta: video, error: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Lo que ya terminó: cada hilo con su video entra a la cola de redes o queda por revisar. */
  async function entregar() {
    for (const t of leer().turnos.filter((x) => x.estado === 'hilo' && x.sesion)) {
      const h = o.hilos.estado(t.sesion!)
      if (!h) {
        cambiarTurno(t.id, { estado: 'error', error: 'El hilo ya no existe.' })
        continue
      }
      if (h.trabajando) continue
      const video = o.videoDe(t.cardId, t.sesion!)
      if (video) {
        if (t.solo) await meter(t, video)
        else cambiarTurno(t.id, { estado: 'por_revisar', ruta: video })
      } else if (ahora() - h.t > SIN_VIDEO) cambiarTurno(t.id, { estado: 'error', error: 'El hilo terminó sin dejar un video vertical.' })
    }
  }

  /** Crea los hilos de los horarios que faltan para hoy (o, con `uno`, el del siguiente libre). Devuelve cuántos hizo. */
  function crear(opciones: { uno?: boolean } = {}): { hechos: number; motivo?: string } {
    const a = leer()
    const c = a.config
    if (!c.encendido && !opciones.uno) return { hechos: 0, motivo: 'apagado' }
    if (!c.marca.trim()) return { hechos: 0, motivo: 'sin_marca' }
    if (!opciones.uno && a.turnos.some((t) => t.estado === 'hilo' && t.sesion && o.hilos.estado(t.sesion)?.trabajando)) return { hechos: 0, motivo: 'trabajando' }
    const zona = zonaDe()
    const horarios = opciones.uno ? [siguienteLibre(c, a.turnos, ahora(), zona)].filter((h): h is Horario => !!h) : faltanHoy(c, a.turnos, ahora(), zona)
    if (!horarios.length) return { hechos: 0, motivo: 'al_dia' }
    const card = cardDelEstilo(o.cards(), c.cardId)
    if (!card) throw new Error('No hay ningún estilo de video para el piloto.')
    const modelo = c.modelo ?? modeloPorDefecto(o.modelos())?.id
    if (!modelo) throw new Error('No hay ningún modelo disponible para los hilos del piloto.')
    const usadosG = a.turnos.map((t) => t.gancho)
    const usadosT = a.turnos.map((t) => t.tema)
    const nuevos: TurnoPiloto[] = horarios.map((h) => {
      const gancho = elegirRotando(c.ganchos, usadosG)
      const tema = elegirRotando(c.temas, usadosT)
      usadosG.push(gancho)
      usadosT.push(tema)
      return { id: randomBytes(8).toString('hex'), fecha: h.fecha, hora: h.hora, instante: new Date(h.instante).toISOString(), cardId: card.id, gancho, tema, solo: c.publicarSolo, estado: 'hilo', creado: ahora() }
    })
    const videos = nuevos.map((t) => ({ title: `Piloto · ${t.hora} · ${t.gancho || t.tema || c.marca}`.slice(0, 80), text: primerMensaje(c, t) }))
    const ids = o.hilos.crear({ cardId: card.id, modelo, esfuerzo: c.esfuerzo, videos })
    nuevos.forEach((t, i) => (t.sesion = ids[i]))
    a.turnos.push(...nuevos)
    escribir(a)
    return { hechos: nuevos.length }
  }

  async function revisar() {
    if (ocupado) return
    ocupado = true
    try {
      await entregar()
      crear()
    } catch (e) {
      console.error(`Piloto: ${e instanceof Error ? e.message : e}`)
    } finally {
      ocupado = false
    }
  }

  function vista(): VistaPiloto {
    const a = leer()
    const zona = zonaDe()
    const estilos = o.cards().filter((c) => c.etapas?.some((e) => e.fase)).map((c) => ({ id: c.id, title: c.title }))
    const hoy = enZona(ahora(), zona).fecha
    const proximos: VistaPiloto['proximos'] = []
    for (const fecha of [hoy, sumarDia(hoy, 1)])
      for (const hora of horariosDelDia(a.config)) {
        const instante = instanteDe(fecha, hora, zona)
        const t = a.turnos.findLast((x) => x.fecha === fecha && x.hora === hora)
        proximos.push({ fecha, hora, estado: t ? t.estado : instante < ahora() + MARGEN ? 'pasado' : 'libre', ...(t ? { turno: t.id } : {}) })
      }
    return { config: a.config, zona, proximos, ultimos: a.turnos.slice(-10).reverse(), estilos }
  }

  /** Guarda la configuración (solo lo que viene). */
  function configurar(cambios: Partial<ConfigPiloto>): VistaPiloto {
    const errores = validarConfig(cambios)
    if (errores.length) throw new Error(errores.join(' '))
    const a = leer()
    const c = a.config
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const lineas = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(texto).filter(Boolean))] : [])
    if (cambios.encendido !== undefined) c.encendido = cambios.encendido === true
    for (const k of ['marca', 'publico', 'cta', 'tono', 'cardId'] as const) if (k in cambios) c[k] = texto(cambios[k])
    for (const k of ['temas', 'ganchos'] as const) if (k in cambios) c[k] = lineas(cambios[k])
    if (cambios.horarios) c.horarios = lineas(cambios.horarios).sort()
    if (cambios.idioma) c.idioma = cambios.idioma
    if (cambios.videosPorDia) c.videosPorDia = cambios.videosPorDia
    if (cambios.publicarSolo !== undefined) c.publicarSolo = cambios.publicarSolo === true
    for (const k of ['modelo', 'esfuerzo'] as const) if (k in cambios) (texto(cambios[k]) ? (c[k] = texto(cambios[k])) : delete c[k])
    if (c.encendido && !c.marca) throw new Error('Cuenta de qué trata la marca antes de encender el piloto.')
    escribir(a)
    return vista()
  }

  /** «Programar» un video por revisar (o que falló al meterlo), a su horario. */
  async function programar(id: string) {
    const t = leer().turnos.find((x) => x.id === id)
    if (!t?.ruta || (t.estado !== 'por_revisar' && t.estado !== 'error')) throw new Error('Ese video no está esperando.')
    await meter(t, t.ruta)
    const r = leer().turnos.find((x) => x.id === id)
    if (r?.estado === 'error') throw new Error(r.error)
    return vista()
  }

  /** Quita un turno de la lista (un video por revisar que no sirve). */
  function descartar(id: string) {
    const a = leer()
    a.turnos = a.turnos.filter((x) => x.id !== id)
    escribir(a)
    return vista()
  }

  let reloj: NodeJS.Timeout | undefined
  /** Empieza a mirar: al minuto de arrancar y cada `CADA`. */
  function arrancar() {
    if (reloj) return
    setTimeout(() => void revisar(), 60_000).unref()
    reloj = setInterval(() => void revisar(), CADA)
    reloj.unref()
  }

  /** Las rutas `/api/piloto…`. Devuelve si atendió la petición. */
  async function api(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/api/piloto')) return false
    const enviar = (status: number, data: unknown) => (res.writeHead(status, { 'content-type': 'application/json' }), res.end(JSON.stringify(data)), true)
    const post = req.method === 'POST'
    try {
      let datos: Record<string, unknown> = {}
      if (post) {
        let texto = ''
        for await (const parte of req) texto += parte
        datos = texto ? JSON.parse(texto) : {}
      }
      if (path === '/api/piloto' && !post) return enviar(200, vista())
      if (path === '/api/piloto' && post) return enviar(200, configurar(datos as Partial<ConfigPiloto>))
      if (path === '/api/piloto/ahora' && post) {
        const r = crear({ uno: true })
        return r.hechos ? enviar(200, vista()) : enviar(400, { error: r.motivo === 'sin_marca' ? 'Cuenta de qué trata la marca primero.' : 'No hay un horario libre en los próximos días.' })
      }
      if (path === '/api/piloto/programar' && post) return enviar(200, await programar(String(datos.id)))
      if (path === '/api/piloto/descartar' && post) return enviar(200, descartar(String(datos.id)))
    } catch (e) {
      return enviar(400, { error: e instanceof Error ? e.message : String(e) })
    }
    return false
  }

  return { revisar, entregar, crear, vista, configurar, programar, descartar, arrancar, api, leer }
}

export type Piloto = ReturnType<typeof piloto>
