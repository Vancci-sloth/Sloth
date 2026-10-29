import { NOMBRE_AGENTE, type Proveedor } from '../../shared/providers'
import type { AgentEvent } from '../../shared/types'

/** Lo que se dibuja: los eventos de la sesión juntados en bloques. */
export type Item =
  | { kind: 'user'; key: string; text: string; images: string[] }
  | { kind: 'text'; key: string; text: string; parent?: string; opciones?: string[] }
  | { kind: 'thinking'; key: string; text: string; parent?: string; at?: number }
  | { kind: 'tool'; key: string; id: string; name: string; input: any; output: string; done: boolean; error: boolean; parent?: string; subagente?: Subagente }
  | { kind: 'turn_end'; key: string; ok: boolean; error?: string; caida?: boolean; costUsd?: number; ms: number }
  | { kind: 'info'; key: string; text: string }

export type EstadoSubagente = Extract<AgentEvent, { t: 'subagent' }>['status']

/**
 * Un subagente, como en T3 Code: en el hilo es una fila que dice cómo va, y abierta enseña lo suyo. Cuelga de la
 * herramienta que lo lanzó, y su `id` es el de ella: el `parent` de lo que hace, que va en `items`.
 */
export interface Subagente {
  id: string
  titulo: string
  encargo: string
  modelo?: string
  esfuerzo?: string
  estado: EstadoSubagente
  /** Cuándo empezó y cuándo acabó. Los hilos de antes no lo guardaban. */
  desde?: number
  hasta?: number
  items: Item[]
}

/** La herramienta que lanza un subagente: `Agent` (antes `Task`) en Claude; en Codex, la que lo crea. */
const lanzaSubagente = (name: string, input: any) => (name === 'Agent' || name === 'Task') && (input?.tool === undefined || input.tool === 'spawnAgent')

/** Lo que se sabe de un subagente por sus avisos. `cortado`: el segundo plano se vació sin que avisara de su fin. */
type Aviso = { status: EstadoSubagente; desde?: number; hasta?: number; cortado?: boolean }

/**
 * Lo que va armado de los eventos de un hilo. Los eventos solo crecen por el final, así que cada vez se lee solo lo que
 * llegó. Un bloque que cambia se copia en vez de tocarse: el de antes sigue siendo el mismo objeto y su fila, memorizada
 * (`Timeline.tsx`), no se vuelve a dibujar.
 */
type Armado = {
  /** Cuántos eventos lleva leídos, y el último: si la lista ya no empieza igual, se arma de cero. */
  n: number
  ultimo?: AgentEvent
  bloques: Item[]
  /** Dónde está cada bloque que puede crecer (`text:<id>`, `tool:<id>`). */
  donde: Map<string, number>
  /** Las herramientas sin acabar, que el final del turno cierra. */
  abiertas: Set<number>
  /** Las herramientas que lanzan un subagente, en su orden. */
  lanzadores: number[]
  /** Sus ids, para saber qué cuelga de ellas. */
  idsLanzadores: Set<string>
  avisos: Map<string, Aviso>
  fondo: string[]
  turnStart: number
  /** El subagente de cada lanzador la vez anterior: si nada suyo cambió, va el mismo. */
  previos: Map<number, { bloque: Item; estado: EstadoSubagente; aviso?: Aviso; sub: Subagente; fila: Item }>
}

/** Por el primer evento de cada hilo: lo que lleva armado. */
const armados = new WeakMap<AgentEvent, Armado>()
/** Por la lista de eventos: lo que salió. El estudio y el chat piden la misma lista en el mismo dibujo. */
const salidas = new WeakMap<AgentEvent[], Item[]>()
/** El texto con sus opciones separadas, y la herramienta que un subagente parado dejó a medias, ya cerrada. */
const partidos = new WeakMap<Item, Item>()
const cerradas = new WeakMap<Item, Item>()
const NADA: Item[] = []

export function buildTimeline(events: AgentEvent[]): Item[] {
  if (!events.length) return NADA
  const hecho = salidas.get(events)
  if (hecho) return hecho
  let a = armados.get(events[0])
  if (!a || a.n > events.length || events[a.n - 1] !== a.ultimo) {
    a = { n: 0, bloques: [], donde: new Map(), abiertas: new Set(), lanzadores: [], idsLanzadores: new Set(), avisos: new Map(), fondo: [], turnStart: 0, previos: new Map() }
    armados.set(events[0], a)
  }
  for (let i = a.n; i < events.length; i++) leer(a, events[i], i)
  a.n = events.length
  a.ultimo = events[events.length - 1]
  const items = colgarSubagentes(a, a.bloques.map(partido))
  salidas.set(events, items)
  return items
}

/** Suma un evento a lo armado. */
function leer(a: Armado, e: AgentEvent, i: number) {
  const { bloques, donde } = a
  const poner = (item: Item) => {
    bloques.push(item)
    return bloques.length - 1
  }
  switch (e.t) {
    case 'user':
      poner({ kind: 'user', key: `u${i}`, text: e.text, images: e.images ?? [] })
      break
    case 'turn_start':
      a.turnStart = e.at
      break
    case 'text':
    case 'thinking': {
      const key = `${e.t}:${e.id}`
      const k = donde.get(key)
      const found = k === undefined ? undefined : bloques[k]
      if (found && (found.kind === 'text' || found.kind === 'thinking')) bloques[k!] = { ...found, text: found.text + e.delta }
      else donde.set(key, poner(e.t === 'thinking' ? { kind: e.t, key, text: e.delta, parent: e.parent, at: e.at } : { kind: e.t, key, text: e.delta, parent: e.parent }))
      break
    }
    case 'tool': {
      let { id, name, input } = e
      // Los hilos de Codex de antes guardaron cada aviso de un subagente (`subAgentActivity`) como un paso: el primero de
      // cada uno es su fila, como la que hace ahora server/codex.ts, y los demás no se ven.
      if (name === 'subAgentActivity') {
        const s = (input ?? {}) as { agentThreadId?: string; agentPath?: string; model?: string | null; reasoningEffort?: string | null }
        id = `subagente:${s.agentThreadId}`
        if (donde.has(`tool:${id}`)) break
        name = 'Agent'
        input = { description: s.agentPath?.split('/').filter(Boolean).pop() || 'Subagente de Codex', model: s.model ?? undefined, effort: s.reasoningEffort ?? undefined }
      }
      const key = `tool:${id}`
      const k = poner({ kind: 'tool', key, id, name, input, output: '', done: false, error: false, parent: e.parent })
      donde.set(key, k)
      a.abiertas.add(k)
      if (lanzaSubagente(name, input)) a.lanzadores.push(k), a.idsLanzadores.add(id)
      break
    }
    case 'tool_update': {
      const k = donde.get(`tool:${e.id}`)
      const item = k === undefined ? undefined : bloques[k]
      // Uno que no trae nada (las salidas viejas que quita `historialLigero`) deja el bloque como estaba.
      if (item?.kind !== 'tool' || (e.output === undefined && !e.delta && !e.done && !e.error)) break
      const nuevo = { ...item }
      if (e.output !== undefined) nuevo.output = e.output
      if (e.delta) nuevo.output += e.delta
      if (e.done) nuevo.done = true
      if (e.error) nuevo.error = true
      bloques[k!] = nuevo
      if (nuevo.done) a.abiertas.delete(k!)
      break
    }
    case 'turn_end':
      poner({ kind: 'turn_end', key: `end${i}`, ok: e.ok, error: e.error, caida: e.caida, costUsd: e.costUsd, ms: a.turnStart ? e.at - a.turnStart : 0 })
      // Lo que quedó a medias cuando el turno acabó (cortado o con error) ya no va a terminar. Lo de un subagente sí
      // puede: trabaja aparte, y lo suyo se cierra con él.
      for (const k of a.abiertas) {
        const it = bloques[k]
        if (it.kind !== 'tool' || (it.parent && a.idsLanzadores.has(it.parent))) continue
        bloques[k] = { ...it, done: true }
        a.abiertas.delete(k)
      }
      break
    case 'info':
      poner({ kind: 'info', key: `i${i}`, text: e.text })
      break
    case 'subagent': {
      const aviso = a.avisos.get(e.id)
      if (e.status !== 'running') a.avisos.set(e.id, { ...aviso, status: e.status, hasta: e.at })
      // Si ya trabajaba, sigue contando desde que empezó; si había acabado o se cortó, vuelve a empezar.
      else if (aviso?.status !== 'running' || aviso.cortado) a.avisos.set(e.id, { status: 'running', desde: e.at })
      break
    }
    case 'background':
      a.fondo = e.tasks
      // Sin nada en segundo plano no queda ningún subagente vivo: el que no avisó de su fin se cortó con su proceso.
      if (!e.tasks.length) for (const [id, aviso] of a.avisos) if (aviso.status === 'running') a.avisos.set(id, { ...aviso, cortado: true })
      break
  }
}

/** El texto llega a trozos: el bloque de opciones se separa ya entero, o hasta donde llegó. */
function partido(item: Item): Item {
  if (item.kind !== 'text') return item
  let listo = partidos.get(item)
  if (!listo) {
    const { texto, opciones } = partirOpciones(item.text)
    listo = { ...item, text: texto }
    if (opciones.length) listo.opciones = opciones
    partidos.set(item, listo)
  }
  return listo
}

/**
 * Cada subagente cuelga de la herramienta que lo lanzó, con lo que hizo y cómo va. Sin sus avisos (un hilo de antes),
 * trabaja mientras su herramienta no acaba o mientras su título sigue en segundo plano. Lo de un subagente va siempre
 * después de quien lo lanzó: de atrás adelante, uno lanzado por otro ya está listo cuando se arma el que lo lanzó.
 */
function colgarSubagentes(a: Armado, items: Item[]): Item[] {
  if (!a.lanzadores.length) return items
  const hijos = new Map<string, number[]>()
  items.forEach((item, k) => {
    if ('parent' in item && item.parent && a.idsLanzadores.has(item.parent)) {
      const lista = hijos.get(item.parent)
      if (lista) lista.push(k)
      else hijos.set(item.parent, [k])
    }
  })
  // Si dos lanzadores dicen el mismo id, lo suyo cuelga del último.
  const ultimo = new Map<string, number>()
  for (const k of a.lanzadores) {
    const item = items[k]
    if (item.kind === 'tool') ultimo.set(item.id, k)
  }
  for (let j = a.lanzadores.length - 1; j >= 0; j--) {
    const k = a.lanzadores[j]
    const item = items[k]
    if (item.kind !== 'tool') continue
    const i = item.input ?? {}
    const titulo = toolSummary(item.name, i).detail || 'Subagente'
    const aviso = a.avisos.get(item.id)
    const estado: EstadoSubagente = aviso ? (aviso.cortado && aviso.status === 'running' ? 'stopped' : aviso.status) : !item.done || a.fondo.includes(titulo) ? 'running' : item.error ? 'failed' : 'completed'
    const suyos = (ultimo.get(item.id) === k ? (hijos.get(item.id) ?? []) : []).map((h) => {
      let hijo = items[h]
      // Lo que dejó a medias un subagente que ya no trabaja no va a terminar.
      if (hijo.kind === 'tool' && !hijo.done && estado !== 'running') {
        let cerrada = cerradas.get(hijo)
        if (!cerrada) cerradas.set(hijo, (cerrada = { ...hijo, done: true }))
        items[h] = hijo = cerrada
      }
      return hijo
    })
    const previo = a.previos.get(k)
    if (previo && previo.bloque === item && previo.estado === estado && previo.aviso === aviso && mismos(previo.sub.items, suyos)) {
      items[k] = previo.fila
      continue
    }
    const sub: Subagente = { id: item.id, titulo, encargo: String(i.prompt ?? ''), modelo: i.model, esfuerzo: i.effort, estado, desde: aviso?.desde, hasta: aviso?.hasta, items: suyos }
    const fila = { ...item, subagente: sub }
    a.previos.set(k, { bloque: item, estado, aviso, sub, fila })
    items[k] = fila
  }
  return items
}

const mismos = (x: Item[], y: Item[]) => x.length === y.length && x.every((item, i) => item === y[i])

/** Lo que se ve en el hilo: lo de cada subagente va dentro de su fila. Lo de uno que no se sabe cuál es, suelto. */
export function delHilo(items: Item[]): Item[] {
  const lanzados = new Set(items.flatMap((i) => (i.kind === 'tool' && i.subagente ? [i.id] : [])))
  return items.filter((i) => !('parent' in i && i.parent && lanzados.has(i.parent)))
}

export const ESTADO_SUBAGENTE: Record<EstadoSubagente, string> = { running: 'Trabajando', completed: 'Listo', failed: 'Falló', stopped: 'Detenido' }

/**
 * La segunda línea de su fila: lo último que hace, o en qué estaba si falló o se detuvo; si acabó bien, el principio
 * de su respuesta.
 */
export function lineaDeSubagente(s: Subagente): string {
  const llano = (t: string) => t.slice(0, 400).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_#>|]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim()
  if (s.estado === 'completed') {
    const respuesta = s.items.findLast((i) => i.kind === 'text' && i.text.trim())
    return respuesta?.kind === 'text' ? llano(respuesta.text) : ''
  }
  const ultimo = s.items.findLast((i) => i.kind !== 'thinking' || i.text.trim())
  if (ultimo?.kind === 'tool') {
    const { verb, detail } = toolSummary(ultimo.name, ultimo.input)
    return `${verb} · ${detail}`
  }
  if (ultimo?.kind === 'thinking') return 'Pensando…'
  return ultimo?.kind === 'text' ? llano(ultimo.text) : ''
}

/** Su modelo y su esfuerzo, como los pidió el agente: «Sonnet · medium», «GPT-6.1 Terra · high». */
export const modeloDeSubagente = (s: Subagente) => [s.modelo && nombreDeModelo(s.modelo), s.esfuerzo].filter(Boolean).join(' · ')
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const nombreDeModelo = (m: string) => {
  const gpt = /^gpt-([\d.]+)(?:-(.+))?$/i.exec(m)
  return gpt ? [`GPT-${gpt[1]}`, ...(gpt[2]?.split('-') ?? []).map(mayuscula)].join(' ') : mayuscula(m)
}

/**
 * Las preguntas cerradas del agente: Sloth le pide (`server/claude.ts`) que las cierre con un bloque `<opciones>`, una
 * respuesta por línea, y aquí se separa del texto para dibujarlo como botones. Cuenta el bloque que empieza en su propia
 * línea, fuera de un bloque de código; sin cerrar (aún se escribe), llega hasta el final. Ninguno se queda en el texto,
 * que markdown.ts enseñaría con las etiquetas escritas: el último son los botones, y uno de antes queda como lista.
 */
export function partirOpciones(text: string): { texto: string; opciones: string[] } {
  if (!text.includes('<')) return { texto: text, opciones: [] }
  const fuera: string[] = []
  // Cada bloque, con el sitio del texto donde estaba.
  const bloques: { en: number; opciones: string[] }[] = []
  let abierto: string[] | null = null
  let codigo = false
  for (const l of text.split('\n')) {
    if (abierto) {
      const cierra = l.search(/<\/opciones>/i)
      if (cierra < 0) abierto.push(l)
      else {
        abierto.push(l.slice(0, cierra))
        bloques.push({ en: fuera.length, opciones: respuestas(abierto) })
        abierto = null
        // Lo que siga va en su propio párrafo.
        fuera.push('', l.slice(cierra + '</opciones>'.length).trim())
      }
      continue
    }
    if (/^\s*(```|~~~)/.test(l)) codigo = !codigo
    else if (!codigo && /^\s*<opciones>/i.test(l)) {
      const resto = l.replace(/^\s*<opciones>/i, '')
      const cierra = resto.search(/<\/opciones>/i)
      // Todo en una línea (`<opciones>Sí</opciones>`): un bloque de una sola respuesta.
      if (cierra >= 0) {
        bloques.push({ en: fuera.length, opciones: respuestas([resto.slice(0, cierra)]) })
        fuera.push('', resto.slice(cierra + '</opciones>'.length).trim())
      } else abierto = [resto]
      continue
    }
    fuera.push(l)
  }
  // Mientras se escribe, las etiquetas llegan a trozos: un `</opc` tras la última respuesta, o un `<opc` al final del
  // texto, aún no se sabe qué son, y no se enseñan.
  if (abierto) {
    const ultima = abierto.length - 1
    abierto[ultima] = abierto[ultima].replace(/<\/?[a-z]*$/i, (cola) => ('</opciones>'.startsWith(cola.toLowerCase()) ? '' : cola))
    bloques.push({ en: fuera.length, opciones: respuestas(abierto) })
  } else if (!codigo && fuera.length) {
    const ultima = fuera[fuera.length - 1].trim().toLowerCase()
    if (ultima.startsWith('<') && '<opciones>'.startsWith(ultima)) fuera.pop()
  }
  const ultimo = bloques.pop()
  // De atrás adelante, para que el sitio de cada uno siga valiendo.
  for (const b of bloques.reverse()) fuera.splice(b.en, 0, '', ...b.opciones.map((o) => `- ${o}`), '')
  return { texto: fuera.join('\n').trim(), opciones: ultimo?.opciones ?? [] }
}

/** Las respuestas de un bloque, una por línea, sin la viñeta o el número que a veces les pone el agente. */
const respuestas = (lineas: string[]) => lineas.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean)

/** Lo que se le manda al agente al pulsar «Reintentar». */
export const REINTENTAR = 'Sigue donde te quedaste.'

/**
 * Un turno que acabó mal, en palabras de todos los días: qué pasó y qué hacer. `reintentar`: pedirle que siga puede
 * bastar. `tuyo`: lo detuviste tú, no es un fallo. El error tal cual se ve al pasar el ratón. `agente`: el del hilo, que
 * nombra el plan y la cuenta (con Codex, los de ChatGPT). Con OpenCode, sus modelos gratis se saturan o se acaba el uso gratis.
 */
export function errorLlano(error = '', caida = false, agente: Proveedor = 'claude'): { titulo: string; ayuda: string; reintentar: boolean; tuyo?: boolean } {
  const nombre = NOMBRE_AGENTE[agente]
  // La caída la marca el servidor. Los hilos de antes de la marca traen la frase con que sessions.ts cierra el turno.
  if (caida || /^el servidor se cerró a mitad del turno/.test(error)) {
    return { titulo: 'Se cortó a mitad del trabajo', ayuda: 'Lo que ya hizo sigue en su carpeta. Pulsa «Reintentar» y sigue desde ahí.', reintentar: true }
  }
  if (/^lo detuviste/i.test(error)) return { titulo: 'Lo detuviste', ayuda: 'Dile qué cambiar, o pulsa «Reintentar» para que siga.', reintentar: true, tuyo: true }
  if (agente === 'opencode' && /^Conecta tu cuenta de OpenCode/.test(error)) {
    return { titulo: 'Falta tu cuenta de OpenCode', ayuda: 'Conéctala en Opciones: es gratis. Luego pulsa «Reintentar».', reintentar: true }
  }
  // El uso gratis se acaba en todos los modelos gratis a la vez: cambiar a otro gratis no sirve.
  if (agente === 'opencode' && /uso gratis|free usage/i.test(error)) {
    return { titulo: 'Se acabó tu uso gratis de OpenCode', ayuda: 'Vuelve solo, en unas horas o al día siguiente: OpenCode no dice cuándo. Es de tu computadora: cambiar de cuenta no lo repone. Mientras, elige abajo un modelo de pago de OpenCode, Claude o ChatGPT, y pulsa «Reintentar».', reintentar: true }
  }
  if (agente === 'opencode' && /modelo gratis|rate.?limit|too many requests|\b429\b/i.test(error)) {
    return { titulo: 'El modelo gratis está saturado', ayuda: 'Espera unos minutos y pulsa «Reintentar», o elige otro modelo gratis.', reintentar: true }
  }
  if (/hit your .*limit|usage limit|rate.?limit|out of usage|spend limit|credit balance|\b429\b/i.test(error)) {
    const cuando = reinicio(error)
    return { titulo: `Llegaste al límite de tu plan de ${nombre}`, ayuda: `${cuando ? `Se reinicia: ${cuando}.` : 'En Opciones ves cuándo se reinicia.'} Entonces pulsa «Reintentar».`, reintentar: true }
  }
  if (/\/login|not logged in|authenticat|oauth|\b401\b|invalid api key|credential/i.test(error)) {
    return { titulo: `Tu cuenta de ${nombre} se desconectó`, ayuda: 'Vuelve a conectarla en Opciones y pulsa «Reintentar».', reintentar: true }
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|network|fetch failed|connection error|socket hang up/i.test(error)) {
    return { titulo: 'No hay conexión a internet', ayuda: 'Revisa la conexión y pulsa «Reintentar».', reintentar: true }
  }
  if (/overload|API Error:? 5\d\d|ETIMEDOUT|timed? ?out|service unavailable|internal server error|bad gateway/i.test(error)) {
    return { titulo: `${nombre} no respondió`, ayuda: 'Suele ser pasajero: espera un momento y pulsa «Reintentar».', reintentar: true }
  }
  if (/prompt is too long|too many tokens|context (window|length)/i.test(error)) {
    return { titulo: 'La conversación ya es demasiado larga', ayuda: 'Abre un hilo nuevo y cuéntale dónde se quedó este.', reintentar: false }
  }
  if (/ENOSPC|no space left/i.test(error)) return { titulo: 'El disco está lleno', ayuda: 'Libera espacio y pulsa «Reintentar».', reintentar: true }
  // Casi siempre es que lo detuviste, en los hilos de antes de que el servidor lo dijera.
  if (error === 'error_during_execution') return { titulo: 'Se detuvo antes de terminar', ayuda: 'Si lo detuviste tú, dile qué cambiar. Si no, pulsa «Reintentar».', reintentar: true }
  return { titulo: 'Se detuvo por un error', ayuda: `${error ? `El error dice: «${error.slice(0, 160)}». ` : ''}Pulsa «Reintentar» o cuéntale qué pasó.`, reintentar: true }
}

/**
 * Cuándo se reinicia el límite, si el error lo dice. Claude: «· resets 5pm (America/Mexico_City)» o, en los de antes,
 * «|<segundos>». ChatGPT: «try again at Oct 27th, 2026 1:12 AM.», en la hora de esta computadora.
 */
function reinicio(error: string): string | undefined {
  const fecha = (d: Date) => d.toLocaleString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const segundos = /\|(\d{10})\b/.exec(error)?.[1]
  if (segundos) return fecha(new Date(Number(segundos) * 1000))
  const chatgpt = /try again at (.+?)\.?\s*$/i.exec(error)?.[1]
  if (chatgpt) {
    const d = new Date(chatgpt.replace(/(\d)(st|nd|rd|th)\b/, '$1'))
    return isNaN(d.getTime()) ? chatgpt : fecha(d)
  }
  return /\bresets? (?:at )?([^·(\n]+)/i.exec(error)?.[1].trim() || undefined
}

/** Lo que hace Codex con sus subagentes, aparte de lanzarlos. */
const CON_SUBAGENTES: Record<string, string> = {
  wait: 'Espera a sus subagentes',
  sendInput: 'Escribe al subagente',
  sendMessage: 'Escribe al subagente',
  followupTask: 'Le encarga más al subagente',
  resumeAgent: 'Retoma un subagente',
  closeAgent: 'Cierra un subagente',
  interruptAgent: 'Detiene un subagente',
  listAgents: 'Mira sus subagentes'
}

/** Una línea que dice qué hizo la herramienta, como en T3 Code: el verbo y su objeto. */
export function toolSummary(name: string, input: any): { verb: string; detail: string } {
  const i = input ?? {}
  const short = (p: string) => String(p ?? '').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~')
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return { verb: name === 'Bash' ? 'Comando' : 'PowerShell', detail: i.description ? `${i.description} · ${i.command}` : i.command }
    case 'Read':
      return { verb: 'Lee', detail: short(i.file_path) }
    case 'Write':
      return { verb: 'Escribe', detail: short(i.file_path) }
    case 'Edit':
      return { verb: 'Edita', detail: short(i.file_path) }
    case 'Grep':
      return { verb: 'Busca', detail: `${i.pattern}${i.path ? ` en ${short(i.path)}` : ''}` }
    case 'WebSearch':
      return { verb: 'Busca en la web', detail: i.query }
    case 'WebFetch':
      return { verb: 'Lee la web', detail: i.url }
    case 'Skill':
      return { verb: 'Skill', detail: i.skill ?? i.name }
    case 'Agent':
      // En Codex, `tool` dice qué hace con sus subagentes: solo `spawnAgent` lanza uno.
      if (i.tool && i.tool !== 'spawnAgent') return { verb: CON_SUBAGENTES[i.tool] ?? 'Subagentes', detail: i.prompt?.slice(0, 120) ?? '' }
      return { verb: 'Subagente', detail: i.description ?? i.prompt?.slice(0, 120) ?? '' }
    case 'SendMessage':
      return { verb: 'Escribe al subagente', detail: i.summary ?? i.message ?? '' }
    case 'TaskStop':
      return { verb: 'Detiene la tarea', detail: i.task_id ?? '' }
    case 'Monitor':
      return { verb: 'Vigila', detail: i.description ?? i.command ?? '' }
    case 'ScheduleWakeup': {
      if (i.stop) return { verb: 'Ya no vuelve', detail: 'cancela su aviso' }
      const s = Number(i.delaySeconds) || 0
      return { verb: 'Vuelve en', detail: `${s < 60 ? `${s} s` : `${Math.round(s / 60)} min`}${i.reason ? ` · ${i.reason}` : ''}` }
    }
    case 'ToolSearch':
      // `select:WebSearch,WebFetch` dice qué herramientas carga.
      return { verb: 'Carga herramientas', detail: String(i.query ?? '').replace(/^select:/, '').replaceAll(',', ', ') }
    default:
      // Las demás (las de un MCP, una nueva del SDK): su nombre sin el prefijo del MCP y el primer texto que llevan.
      return {
        verb: name.replace(/^mcp__.+?__/, ''),
        detail: typeof input === 'object' ? String(Object.values(i).find((v) => typeof v === 'string') ?? '') : String(input ?? '')
      }
  }
}

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`
}

export function compact(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `${Math.round(n / 1000)} k` : String(n)
}
