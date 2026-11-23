import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { BRIEF_VACIO, CONFIG_POR_DEFECTO, faltaEnBrief, IDIOMAS_PILOTO, MANUAL_MAX, TOPE_MAX, type BriefPiloto, type ConfigPiloto, type ModoPiloto, type TurnoPiloto, type VistaPiloto } from '../shared/piloto.ts'
import { fechaRitmo, horasDelRitmo, tocaElDia } from '../shared/ritmo.ts'
import type { Card, Ritmo } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { cuerpo, json } from './http.ts'

/**
 * El piloto (Redes → Piloto): videos verticales de una marca a partir de su brief, cada uno en su hilo (un lote de
 * `sessions.crearLote`, que arranca los que caben en la computadora). Dos modos, aparte a propósito:
 *
 * - **Manual**: «Hacer N videos ahora». Al terminar, cada video queda por revisar; se programa (o no) en Publicaciones,
 *   como cualquier otro. El manual nunca crea nada solo ni programa nada.
 * - **Automático**: apagado por defecto, y encenderlo pide decir que sí a que gasta tokens y créditos sin que nadie mire y
 *   que publica solo (`acepto`). Encendido, cada 10 minutos mira el ritmo de redes de hoy (`/api/redes/ritmo`, el mismo
 *   de la cola): si hoy toca y quedan horas por delante, pide los videos que falten hasta su tope diario, y cada uno, al
 *   terminar, entra a la cola de redes en el siguiente hueco del ritmo (`programarVideo` de `server/redes/`). Si lo
 *   apagas mientras se hacen, lo que acabe queda por revisar, como en el manual.
 *
 * El primer mensaje lleva el brief, la regla de no vender de frente y un gancho y un tema que rotan sin repetir los
 * últimos (`elegirRotando`). Todo vive en `data/piloto/piloto.json`: la configuración y los últimos videos.
 */

/** Cada cuánto mira el automático. */
export const CADA = 10 * 60_000
/** Una hora del ritmo a menos de esto ya no da tiempo de hacer su video: no cuenta. */
export const ANTELACION = 60 * 60_000
/** Un hilo quieto y sin video por tanto tiempo es un video que no salió. */
const SIN_VIDEO = 10 * 60_000
/** Cuántos videos se guardan en la lista. */
const TURNOS = 200

export interface HilosPiloto {
  /** Crea los hilos (un lote, un video por hilo) y devuelve sus ids en el mismo orden. */
  crear(p: { card: Card; videos: { title: string; text: string }[] }): string[]
  /** Si el hilo trabaja o espera su turno, y cuándo se movió por última vez; `undefined` si ya no existe. */
  estado(id: string): { trabajando: boolean; t: number } | undefined
}

export interface OpcionesPiloto {
  dir: string
  cards(): Card[]
  hilos: HilosPiloto
  /** La ruta del video vertical terminado de un hilo, si ya hay. */
  videoDe(card: Card, sesion: string): string | undefined
  /** El ritmo de redes y si hay una red conectada. Sin redes, `undefined`: el automático no enciende. */
  redes?: {
    ritmo(): { ritmo: Ritmo; conectada: boolean }
    /** Mete el video a la cola de redes, en el siguiente hueco del ritmo. Solo lo llama el automático. */
    programar(cardId: string, ruta: string): Promise<void>
  }
  /** El aviso antes de pasar de dos videos a la vez (`avisoDeVideos`), si toca. */
  aviso?(nuevos: number): string | undefined
  ahora?: () => number
}

interface Archivo {
  config: ConfigPiloto
  turnos: TurnoPiloto[]
}

/**
 * El que toca de una lista: el que nunca se usó, o el que se usó hace más tiempo. `usados` va del más viejo al más
 * nuevo. Así no se repite ninguno de los últimos mientras haya otro.
 */
export function elegirRotando(lista: string[], usados: string[]): string {
  const opciones = [...new Set(lista.map((x) => x.trim()).filter(Boolean))]
  let mejor = ''
  let cuando = Infinity
  for (const o of opciones) {
    const i = usados.lastIndexOf(o)
    if (i < cuando) (mejor = o), (cuando = i)
  }
  return mejor
}

/** Los estilos de video (cards con fases). */
const estilosDeVideo = (cards: Card[]) => cards.filter((c) => c.etapas?.some((e) => e.fase))

/** La card de ese id si es un estilo de video; si no, la del explicativo o el primer estilo de video. */
export function cardDelEstilo(cards: Card[], id: string): Card | undefined {
  const videos = estilosDeVideo(cards)
  return videos.find((c) => c.id === id) ?? videos.find((c) => c.id === 'video-explicativo') ?? videos[0]
}

const lista = (titulo: string, xs: string[]) => (xs.length ? `${titulo}:\n${xs.map((x) => `- ${x}`).join('\n')}` : '')

/** El primer mensaje de un video del piloto. */
export function primerMensaje(b: BriefPiloto, t: Pick<TurnoPiloto, 'modo' | 'gancho' | 'tema'>): string {
  return [
    `Un video vertical (9:16) del piloto de Sloth, modo ${t.modo === 'auto' ? 'automático' : 'manual'}. Nadie lo revisa mientras lo haces: decide tú y no preguntes; si algo falta, elige lo más sensato y sigue.`,
    `De qué trata la marca: ${b.marca}`,
    b.publico ? `Le habla a: ${b.publico}` : '',
    'Regla de oro: no vendas de frente. El video explica, emociona o entretiene a quien tiene ese problema; la marca sale sutil, solo al final (una línea o el logo, junto a la llamada a la acción). Nada de precios, promociones ni «contáctanos» en medio.',
    `Gancho (los primeros 3 segundos y el texto del primer cuadro): ${t.gancho || 'elígelo tú a partir del tema'}`,
    `Tema de este video: ${t.tema || 'elígelo tú de lo que vive esa persona'}`,
    [`Idioma: ${IDIOMAS_PILOTO[b.idioma] ?? b.idioma}.`, b.tono ? `Tono: ${b.tono}.` : '', b.cta ? `Llamada a la acción (al final, suave): ${b.cta}` : ''].filter(Boolean).join(' '),
    lista('Otros temas (no los uses en este video)', b.temas.filter((x) => x !== t.tema)),
    lista('Otros ganchos (no uses estos en este video)', b.ganchos.filter((x) => x !== t.gancho)),
    'No inventes datos: ningún número, cliente, testimonio o resultado que no venga de aquí.',
    'Voz: genérala tú; nadie la va a mandar. Usa la que dice tu skill y, si no dice ninguna, una que vaya con el tono (cómo, en video-base/VOZ.md).',
    t.modo === 'auto' ? 'No publiques nada: al terminar el render, Sloth mete el video a su cola de redes.' : 'No publiques nada: al terminar, el usuario lo revisa y decide si se programa.'
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Las horas del ritmo de hoy que aún dan tiempo de hacer su video. Si hoy no toca, ninguna. */
export function horasPorDelante(r: Ritmo, ahora: number): string[] {
  const hoy = fechaRitmo(new Date(ahora)).slice(0, 10)
  if (!tocaElDia(r, hoy)) return []
  const d = new Date(ahora)
  return horasDelRitmo(r).filter((h) => {
    const [hh, mm] = h.split(':').map(Number)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime() >= ahora + ANTELACION
  })
}

export function piloto(o: OpcionesPiloto) {
  const ahora = o.ahora ?? Date.now
  const hoy = () => fechaRitmo(new Date(ahora())).slice(0, 10)
  let ocupado = false
  mkdirSync(o.dir, { recursive: true })
  const ruta = join(o.dir, 'piloto.json')

  function leer(): Archivo {
    try {
      const a = JSON.parse(readFileSync(ruta, 'utf8')) as Partial<Archivo>
      return {
        config: { brief: { ...BRIEF_VACIO, ...a.config?.brief }, auto: { ...CONFIG_POR_DEFECTO.auto, ...a.config?.auto, encendido: a.config?.auto?.encendido === true } },
        turnos: Array.isArray(a.turnos) ? a.turnos : []
      }
    } catch {
      return { config: structuredClone(CONFIG_POR_DEFECTO), turnos: [] }
    }
  }
  function escribir(a: Archivo) {
    a.turnos = a.turnos.slice(-TURNOS)
    guardar(ruta, JSON.stringify(a, null, 2) + '\n')
  }
  function cambiarTurno(id: string, cambios: Partial<TurnoPiloto>) {
    const a = leer()
    const t = a.turnos.find((x) => x.id === id)
    if (!t) return
    Object.assign(t, cambios)
    escribir(a)
  }

  /** Crea `n` videos de un modo, cada uno en su hilo. Devuelve los nuevos. */
  function hacer(modo: ModoPiloto, n: number): TurnoPiloto[] {
    const a = leer()
    const b = a.config.brief
    const falta = faltaEnBrief(b)
    if (falta) throw new Error(falta)
    const card = cardDelEstilo(o.cards(), b.cardId)
    if (!card) throw new Error('No hay ningún estilo de video para el piloto.')
    if (card.bloqueada) throw new Error(`«${card.title}» está cerrado: vuelve a apoyar a Sloth o elige otro estilo.`)
    const usadosG = a.turnos.map((t) => t.gancho)
    const usadosT = a.turnos.map((t) => t.tema)
    const nuevos = Array.from({ length: n }, (): Omit<TurnoPiloto, 'sesion'> => {
      const gancho = elegirRotando(b.ganchos, usadosG)
      const tema = elegirRotando(b.temas, usadosT)
      usadosG.push(gancho)
      usadosT.push(tema)
      return { id: randomBytes(8).toString('hex'), modo, fecha: hoy(), cardId: card.id, gancho, tema, estado: 'haciendo', creado: ahora() }
    })
    const etiqueta = modo === 'auto' ? 'Piloto automático' : 'Piloto'
    const videos = nuevos.map((t) => ({ title: `${etiqueta} · ${t.gancho || t.tema || b.marca}`.slice(0, 80), text: primerMensaje(b, t) }))
    const ids = o.hilos.crear({ card, videos })
    const hechos = nuevos.map((t, i) => ({ ...t, sesion: ids[i] }))
    a.turnos.push(...hechos)
    escribir(a)
    return hechos
  }

  /** Manual: `n` videos ahora. Quedan por revisar al terminar; nada se programa. */
  function manual(n: number): TurnoPiloto[] {
    if (!Number.isInteger(n) || n < 1 || n > MANUAL_MAX) throw new Error(`De 1 a ${MANUAL_MAX} videos.`)
    return hacer('manual', n)
  }

  /** Por qué el automático no puede encenderse ahora (vacío si puede). */
  function noEnciende(c: ConfigPiloto): string | undefined {
    if (!o.redes) return 'Esta versión no publica en redes.'
    if (!o.redes.ritmo().conectada) return 'Conecta una red en Redes → Cuentas antes de encender el automático: no tendría dónde publicar.'
    return faltaEnBrief(c.brief)
  }

  /** Automático: los videos que faltan hoy, si está encendido. Devuelve cuántos pidió y, si ninguno, por qué. */
  function automatico(): { hechos: number; motivo?: string } {
    const a = leer()
    const c = a.config
    if (!c.auto.encendido) return { hechos: 0, motivo: 'apagado' }
    const no = noEnciende(c)
    if (no) return { hechos: 0, motivo: no }
    // Uno que aún trabaja (de hoy o de antes) frena los siguientes: si los hilos no acaban, no se apilan.
    if (a.turnos.some((t) => t.modo === 'auto' && t.estado === 'haciendo' && o.hilos.estado(t.sesion)?.trabajando)) return { hechos: 0, motivo: 'trabajando' }
    const hechosHoy = a.turnos.filter((t) => t.modo === 'auto' && t.fecha === hoy()).length
    const horas = horasPorDelante(o.redes!.ritmo().ritmo, ahora())
    const n = Math.min(c.auto.tope - hechosHoy, horas.length)
    if (n <= 0) return { hechos: 0, motivo: hechosHoy >= c.auto.tope ? 'tope' : 'sin_horas' }
    return { hechos: hacer('auto', n).length }
  }

  /** Lo que ya terminó: el del manual queda por revisar; el del automático entra a la cola, si sigue encendido. */
  async function entregar() {
    for (const t of leer().turnos.filter((x) => x.estado === 'haciendo')) {
      const h = o.hilos.estado(t.sesion)
      if (!h) {
        cambiarTurno(t.id, { estado: 'error', error: 'El hilo ya no existe.' })
        continue
      }
      if (h.trabajando) continue
      const card = o.cards().find((c) => c.id === t.cardId)
      const video = card && o.videoDe(card, t.sesion)
      if (!video) {
        if (ahora() - h.t > SIN_VIDEO) cambiarTurno(t.id, { estado: 'error', error: 'El hilo terminó sin dejar un video vertical. Ábrelo para ver qué pasó.' })
        continue
      }
      // Apagado a medio camino: lo que acabe ya no se publica solo.
      if (t.modo !== 'auto' || !leer().config.auto.encendido || !o.redes) {
        cambiarTurno(t.id, { estado: 'por_revisar', ruta: video })
        continue
      }
      try {
        await o.redes.programar(t.cardId, video)
        cambiarTurno(t.id, { estado: 'programado', ruta: video, error: undefined })
      } catch (e) {
        cambiarTurno(t.id, { estado: 'error', ruta: video, error: `No entró a la cola: ${e instanceof Error ? e.message : e}. Prográmalo desde Publicaciones.` })
      }
    }
  }

  /** Cada vuelta: entrega lo terminado y, si el automático está encendido, pide lo que falte hoy. */
  async function revisar() {
    if (ocupado) return
    ocupado = true
    try {
      await entregar()
      automatico()
    } catch (e) {
      console.error(`Piloto: ${e instanceof Error ? e.message : e}`)
    } finally {
      ocupado = false
    }
  }

  function vista(): VistaPiloto {
    const a = leer()
    const r = o.redes?.ritmo()
    return {
      config: a.config,
      ultimos: a.turnos.slice(-20).reverse(),
      estilos: estilosDeVideo(o.cards()).map((c) => ({ id: c.id, title: c.title })),
      hoy: {
        hechos: a.turnos.filter((t) => t.modo === 'auto' && t.fecha === hoy()).length,
        horas: r && tocaElDia(r.ritmo, hoy()) ? horasDelRitmo(r.ritmo) : [],
        conectada: !!r?.conectada
      }
    }
  }

  /** Guarda el brief (solo lo que viene). */
  function brief(cambios: Partial<BriefPiloto>): VistaPiloto {
    const a = leer()
    const b = a.config.brief
    const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    const lineas = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(texto).filter(Boolean))] : [])
    for (const k of ['marca', 'publico', 'cta', 'tono', 'cardId'] as const) if (k in cambios) b[k] = texto(cambios[k])
    for (const k of ['temas', 'ganchos'] as const) if (k in cambios) b[k] = lineas(cambios[k])
    if (cambios.idioma !== undefined) {
      if (!(cambios.idioma in IDIOMAS_PILOTO)) throw new Error('Ese idioma no está.')
      b.idioma = cambios.idioma
    }
    if (a.config.auto.encendido && faltaEnBrief(b)) throw new Error('Con el automático encendido, la marca no puede quedar vacía. Apágalo primero.')
    escribir(a)
    return vista()
  }

  /**
   * Enciende o apaga el automático, o cambia su tope. Encenderlo pide `acepto`: que se dijo que sí al aviso de que gasta
   * tokens y créditos sin que nadie mire y publica solo. Apagarlo no pide nada.
   */
  function auto(cambios: { encendido?: boolean; tope?: number; acepto?: boolean }): VistaPiloto {
    const a = leer()
    const c = a.config
    if (cambios.tope !== undefined) {
      if (!Number.isInteger(cambios.tope) || cambios.tope < 1 || cambios.tope > TOPE_MAX) throw new Error(`El tope va de 1 a ${TOPE_MAX} videos al día.`)
      c.auto.tope = cambios.tope
    }
    if (cambios.encendido === true && !c.auto.encendido) {
      if (cambios.acepto !== true) throw new Error('Para encender el automático hay que aceptar que gasta y publica solo.')
      const no = noEnciende(c)
      if (no) throw new Error(no)
      c.auto.encendido = true
    }
    if (cambios.encendido === false) c.auto.encendido = false
    escribir(a)
    return vista()
  }

  /** Quita un video de la lista (no el hilo ni el archivo). Uno que se hace no se quita. */
  function descartar(id: string): VistaPiloto {
    const a = leer()
    if (a.turnos.find((x) => x.id === id)?.estado === 'haciendo') throw new Error('Ese video aún se está haciendo.')
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
    const post = req.method === 'POST'
    try {
      if (path === '/api/piloto' && !post) return json(res, 200, vista())
      // Lo que la barra lateral enseña siempre: si el automático está encendido.
      if (path === '/api/piloto/encendido' && !post) return json(res, 200, { encendido: leer().config.auto.encendido })
      if (!post) return false
      const datos = await cuerpo<Record<string, unknown>>(req)
      if (path === '/api/piloto/brief') return json(res, 200, brief(datos as Partial<BriefPiloto>))
      if (path === '/api/piloto/auto') {
        const v = auto(datos)
        // Recién encendido, no espera 10 minutos para empezar.
        if (datos.encendido === true) void revisar()
        return json(res, 200, v)
      }
      if (path === '/api/piloto/descartar') return json(res, 200, descartar(String(datos.id)))
      if (path === '/api/piloto/manual') {
        const n = Number(datos.n)
        const aviso = datos.masDeDos ? undefined : o.aviso?.(n)
        if (aviso) return json(res, 409, { confirmar: true, error: aviso })
        manual(n)
        return json(res, 200, vista())
      }
    } catch (e) {
      return json(res, 400, { error: e instanceof Error ? e.message : String(e) })
    }
    return false
  }

  return { revisar, entregar, automatico, manual, vista, brief, auto, descartar, arrancar, api, leer }
}

export type Piloto = ReturnType<typeof piloto>
