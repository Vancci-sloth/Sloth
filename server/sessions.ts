import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { join } from 'node:path'
import { historialLigero } from '../shared/historial.ts'
import { leerHistorial, primerUsuario } from './historial.ts'
import type { AgentEvent, FileDraft, SessionMeta } from '../shared/types.ts'
import { proveedorDe } from '../shared/providers.ts'
import { llaveEnUso } from './acceso.ts'
import type { AgentRun, SkillRef } from './agent.ts'
import { startClaude } from './claude.ts'
import { startCodex } from './codex.ts'
import { guardar } from './disco.ts'

/**
 * Cuántos agentes trabajan a la vez mientras un lote espera: uno por cada 3 hilos de CPU (un render ya abre un Chrome por
 * cada 3) y por cada 4 GB de memoria. Y uno más no arranca con menos de 2 GB libres, que piden los renders; pero si no
 * trabaja ninguno, arranca igual: si no, un lote se quedaría esperando para siempre en una máquina con poca memoria.
 */
export const CABEN = Math.max(1, Math.min(Math.floor(cpus().length / 3), Math.floor(totalmem() / 4e9)))
const LIBRE = 2e9
/** Cuánto espera el hilo, con el segundo plano recién vacío, antes de decir que ya no queda nada (`avisarFondo`). */
const CALMA = 4000
/**
 * Un video del lote no arranca con menos de esto libre en el disco de su carpeta. Un render deja varios GB de temporales,
 * y con el disco lleno se cae todo: los renders, los agentes y este servidor, que ya no puede guardar los hilos.
 */
const DISCO = 15e9
/** Cuántas caídas seguidas se retoman solas. Más es que algo se rompe cada vez, y lo decide el usuario. */
const RETOMAS = 2
/**
 * Cuánto espera el proceso de un video del lote, tras un turno que acabó bien, antes de cerrarse (cada uno ocupa cientos
 * de MB). Con margen: al acabar el turno, Claude Code aún puede abrir otro él solo, por una tarea en segundo plano que
 * terminó mientras tanto. El siguiente mensaje lo retoma.
 */
const OCIOSO = 30_000
/**
 * Cuántos historiales de hilos quietos se quedan en memoria, los últimos que se leyeron. Los de los hilos que trabajan o
 * esperan se quedan siempre. Sin límite, mirar los videos de un estilo dejaba en memoria los de todos sus hilos.
 */
const EN_MEMORIA = 8
/** Cuánto se deja abierto el registro de un hilo sin eventos (`Sessions.anotar`). */
const QUIETO_REGISTRO = 60_000

/** Los bytes libres en el disco de `ruta`, o null si no se pueden saber. */
function libreEn(ruta: string): number | null {
  try {
    const s = statfsSync(ruta)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

/**
 * Un hilo de antes, sin lo que ya no se usa: el campo antiguo de proveedor, la cola de mensajes y el sufijo `[1m]`
 * del modelo (`claude-opus-5-5[1m]`), que pedía la ventana de un millón de tokens que el modelo ya trae sin él. La skill
 * de un video del lote que esperaba iba en `pendiente`. Se guarda así la próxima vez que cambie.
 */
function alDia(meta: SessionMeta & { provider?: string; queue?: unknown; pendiente?: { skill?: { name: string } } }): SessionMeta {
  const { provider: _, queue: __, ...resto } = meta
  if (resto.pendiente?.skill) {
    resto.skill ??= resto.pendiente.skill.name
    delete resto.pendiente.skill
  }
  return { ...resto, model: resto.model.replace('[1m]', '') }
}

type Mensaje = Extract<AgentEvent, { t: 'user' }>

/** Los mensajes del final del hilo que el agente no llegó a leer: después de ellos no hay nada suyo. */
function sinLeer(events: AgentEvent[]): Mensaje[] {
  const mensajes: Mensaje[] = []
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.t === 'user') mensajes.unshift(e)
    else if (e.t === 'text' || e.t === 'thinking' || e.t === 'tool' || e.t === 'tool_update') break
  }
  return mensajes
}

/**
 * Las sesiones viven en `data/sessions`: `<id>.json` con lo que es y `<id>.jsonl` con lo que pasó, un evento por
 * línea. Lo que está en disco es la verdad; el agente vivo se vuelve a abrir (retomando) cuando hace falta.
 */
export class Sessions {
  private metas = new Map<string, SessionMeta>()
  private events = new Map<string, AgentEvent[]>()
  private runs = new Map<string, AgentRun>()
  private compactarPendiente = new Set<string>()
  private compactando = new Set<string>()

  constructor(
    private dir: string,
    private push: (sessionId: string, from: number, events: AgentEvent[]) => void,
    private pushMeta: (meta: SessionMeta) => void,
    private pushRemoved: (id: string) => void,
    private pushDraft: (sessionId: string, draft: FileDraft) => void,
    private crearAgente: (opts: Parameters<typeof startCodex>[0]) => AgentRun = (opts) => (proveedorDe(opts.model) === 'codex' ? startCodex : startClaude)(opts)
  ) {
    mkdirSync(dir, { recursive: true })
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      let meta: SessionMeta
      try {
        meta = alDia(JSON.parse(readFileSync(join(dir, file), 'utf8')))
      } catch (error) {
        // Un hilo que no se puede leer no impide abrir los demás. Su archivo se queda donde está, para recuperarlo.
        console.error(`No se pudo leer el hilo ${file}, y se salta: ${error instanceof Error ? error.message : error}`)
        continue
      }
      this.metas.set(meta.id, meta)
      const cortado = meta.running
      // Los hilos de antes de guardar cómo acabó su último turno lo leen una vez de su historial.
      if (!cortado && meta.acaboBien === undefined) {
        const cierre = this.load(meta.id).findLast((e) => e.t === 'turn_end')
        if (cierre?.t === 'turn_end') (meta.acaboBien = cierre.ok), this.save(meta)
      }
      const tareas = meta.background ?? []
      const mensajes = cortado ? sinLeer(this.load(meta.id)) : []
      // Un turno que seguía abierto cuando el servidor se cayó ya no va a terminar: se cierra a la vista.
      if (cortado) this.emit(meta.id, { t: 'turn_end', at: Date.now(), ok: false, error: 'el servidor se cerró a mitad del turno.', caida: true })
      // Lo que corría en segundo plano murió con el servidor.
      if (tareas.length) this.emit(meta.id, { t: 'background', tasks: [] })
      this.retomar(meta, mensajes, cortado, tareas)
    }
    // La memoria se libera sin que nada lo avise: cada tanto se mira si ya cabe el siguiente video.
    setTimeout(() => this.repartir())
    setInterval(() => (this.repartir(), this.cerrarRegistros()), 20_000).unref()
  }

  list(): SessionMeta[] {
    return [...this.metas.values()].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  get(id: string): { meta: SessionMeta; events: AgentEvent[] } | null {
    const meta = this.metas.get(id)
    return meta ? { meta, events: this.load(id) } : null
  }

  /** Lectura para la pantalla: el disco se lee sin bloquear otros hilos y las salidas repetidas no viajan. */
  async historial(id: string): Promise<{ meta: SessionMeta; events: AgentEvent[] } | null> {
    const meta = this.metas.get(id)
    if (!meta) return null
    let events = this.events.get(id)
    if (!events) {
      const file = join(this.dir, `${id}.jsonl`)
      const leidos = await leerHistorial(file, join(this.dir, 'vistas', `${id}.json`))
      // Si empezó a trabajar durante la lectura, el registro vivo ya incluye los nuevos eventos.
      events = this.events.get(id) ?? leidos
      if (!this.metas.has(id)) return null
      this.events.set(id, events)
      this.soltar(id)
    }
    return { meta, events: historialLigero(events) }
  }

  /** Lo que es un hilo, sin leer su historial. */
  meta(id: string): SessionMeta | undefined {
    return this.metas.get(id)
  }

  /** Su primer mensaje, sin cargar el historial si no estaba ya: Ideas y Mejoras unen los hilos por él. */
  primerUsuario(id: string): Extract<AgentEvent, { t: 'user' }> | undefined {
    if (!this.metas.has(id)) return undefined
    const vivos = this.events.get(id)
    if (vivos) return vivos.find((e): e is Extract<AgentEvent, { t: 'user' }> => e.t === 'user')
    return primerUsuario(join(this.dir, `${id}.jsonl`))
  }

  /** Panel de etapas: la carpeta del hilo, que el usuario cambia por otra (`server/etapas.ts`). */
  setCarpeta(id: string, carpeta: string) {
    const meta = this.metas.get(id)
    if (!meta) return
    meta.carpeta = carpeta
    this.save(meta)
  }

  /** Si hay un agente trabajando, en su turno o en segundo plano. Reiniciar el servidor lo cortaría. */
  anyRunning(): boolean {
    return [...this.metas.values()].some((m) => m.running || m.background?.length)
  }

  /** Con `carpeta`, el hilo nace sabiendo dónde trabaja: la de su video, nuevo o que ya existe. */
  create(input: { cardId: string; title: string; model: string; effort?: string; cwd: string; carpeta?: string }): SessionMeta {
    const now = Date.now()
    const meta: SessionMeta = { id: now.toString(36) + Math.random().toString(36).slice(2, 6), ...input, createdAt: now, updatedAt: now, running: false }
    this.metas.set(meta.id, meta)
    this.events.set(meta.id, [])
    this.save(meta)
    return meta
  }

  send(id: string, text: string, skill?: SkillRef, images: string[] = []): void {
    if (text.trim() === '/compact' && !images.length) return this.compactar(id)
    if (this.compactando.has(id)) throw new Error('Espera a que termine la compactación.')
    const meta = this.metas.get(id)
    if (!meta) throw new Error('No existe esa sesión')
    // Escribirle a un video que esperaba lo arranca ya, y lo que escribiste le llega en ese primer turno.
    if (meta.pendiente) {
      this.empezar(meta)
      return this.steer(id, text, images)
    }
    this.emit(id, { t: 'user', text, at: Date.now(), ...(images.length ? { images } : {}) })
    this.turno(meta, text, skill, images)
  }

  /**
   * Abre un turno. La skill del primer mensaje se recuerda en el hilo: mientras el agente no haya respondido no hay sesión
   * que retomar, y lo que se le vuelva a mandar (tras una caída, o un video del lote que empieza) la tiene que pedir.
   */
  private turno(meta: SessionMeta, text: string, skill?: SkillRef, images: string[] = []) {
    if (skill) meta.skill = skill.name
    const pide = skill ?? (!meta.providerSessionId && meta.skill ? { name: meta.skill } : undefined)
    this.emit(meta.id, { t: 'turn_start', at: Date.now() })
    this.runFor(meta).send(text, pide, images)
  }

  /**
   * Un lote: un hilo por video, todos esperando, con su primer mensaje ya a la vista. `repartir` los arranca en orden
   * mientras quepan en la máquina.
   */
  crearLote(input: { cardId: string; model: string; effort?: string; cwd: string }, videos: { title: string; text: string; carpeta: string }[], skill?: SkillRef, images: string[] = []): SessionMeta[] {
    const lote = Date.now().toString(36)
    const metas = videos.map((v, i) => {
      const meta = this.create({ ...input, title: v.title })
      meta.lote = { id: lote, n: i + 1, de: videos.length, carpeta: v.carpeta }
      if (skill) meta.skill = skill.name
      meta.pendiente = { text: v.text, ...(images.length ? { images } : {}) }
      this.emit(meta.id, { t: 'user', text: v.text, at: Date.now(), ...(images.length ? { images } : {}) })
      return meta
    })
    this.repartir()
    return metas
  }

  /** «Empezar ya»: el video no espera su turno. */
  empezarYa(id: string) {
    const meta = this.metas.get(id)
    if (meta?.pendiente) this.empezar(meta)
  }

  /** Quita la pausa del lote: los que esperan vuelven a arrancar cuando quepan. */
  seguirLote(lote: string) {
    for (const meta of this.metas.values()) {
      if (meta.lote?.id !== lote || !meta.lote.pausa) continue
      delete meta.lote.pausa
      this.save(meta)
    }
    this.repartir()
  }

  private empezar(meta: SessionMeta) {
    const p = meta.pendiente
    if (!p) return
    delete meta.pendiente
    if (meta.lote) delete meta.lote.pausa
    this.turno(meta, p.text, undefined, p.images)
  }

  /**
   * Arranca los videos que esperan, del lote más viejo al más nuevo y en su orden, mientras quepan en la memoria y en el
   * disco. Cuenta todo agente que trabaja, de un lote o suelto, pero a un hilo suelto nunca lo frena.
   */
  private repartir() {
    const todos = [...this.metas.values()]
    let trabajan = todos.filter((m) => m.running || m.background?.length).length
    const esperan = todos.filter((m) => m.pendiente && !m.lote?.pausa).sort((a, b) => a.createdAt - b.createdAt || (a.lote?.n ?? 0) - (b.lote?.n ?? 0))
    // Los sueltos arrancan siempre, y cuentan: un lote no arranca si con ellos ya no cabe.
    for (const meta of esperan.filter((m) => !m.lote)) {
      trabajan++
      this.empezar(meta)
    }
    for (const meta of esperan.filter((m) => m.lote)) {
      if (trabajan >= CABEN || (trabajan > 0 && freemem() < LIBRE)) return
      const libre = libreEn(meta.cwd)
      if (libre !== null && libre < DISCO) {
        return this.pausar(meta.lote!.id, `Quedan ${(libre / 1e9).toFixed(1)} GB libres en el disco de los videos, y un render llena varios: libera espacio y dale «Seguir».`)
      }
      trabajan++
      this.empezar(meta)
    }
  }

  /**
   * Lo que una caída (del servidor o del proceso del agente) dejó a medias. Lo que le escribiste y el agente no llegó a
   * leer se le vuelve a mandar. Un video de un lote, que nadie mira mientras trabaja, además sigue solo donde se quedó.
   * Espera su turno como cualquier video del lote; un hilo suelto arranca ya.
   */
  private retomar(meta: SessionMeta, mensajes: Mensaje[], cortado: boolean, tareas: string[]) {
    if ((meta.retomas ?? 0) >= RETOMAS) return
    let text = ''
    if (mensajes.length) {
      const varios = mensajes.length > 1
      text = `(Sloth se cerró antes de que leyeras ${varios ? 'estos mensajes' : 'este mensaje'}. Te ${varios ? 'los' : 'lo'} vuelvo a mandar.)\n\n${mensajes.map((m) => m.text).join('\n\n')}`
    } else if (meta.lote && (cortado || tareas.length)) {
      const muerto = tareas.length ? `, y se cortó lo que corría en segundo plano (${tareas.join('; ')})` : ''
      text = `(Sloth se cerró a mitad de tu trabajo${muerto}.) Continúa donde te quedaste. Antes, mira en tu carpeta qué quedó a medias: un render o un subagente cortado no terminó.`
    }
    if (!text) return
    const images = mensajes.flatMap((m) => m.images ?? [])
    meta.retomas = (meta.retomas ?? 0) + 1
    meta.pendiente = { text, ...(images.length ? { images } : {}) }
    this.save(meta)
    setTimeout(() => this.repartir())
  }

  /**
   * Un video que acaba con error (se cortó, el proveedor falló, llegaste al límite) para el lote: los que esperan no
   * arrancan hasta que digas «Seguir». Así un límite de uso no quema la cola entera en errores.
   */
  private pausar(lote: string, motivo: string) {
    for (const meta of this.metas.values()) {
      if (!meta.pendiente || meta.lote?.id !== lote || meta.lote.pausa) continue
      meta.lote.pausa = motivo
      this.save(meta)
    }
  }

  /** Le habla al agente sin esperar a que acabe el turno: lo lee entre una herramienta y la siguiente. Sin turno en curso, abre uno. */
  steer(id: string, text: string, images: string[] = []) {
    if (text.trim() === '/compact' && !images.length) return this.compactar(id)
    if (this.compactando.has(id)) throw new Error('Espera a que termine la compactación.')
    const meta = this.metas.get(id)
    if (!meta) throw new Error('No existe esa sesión')
    if (!meta.running) return this.send(id, text, undefined, images)
    this.emit(id, { t: 'user', text, at: Date.now(), ...(images.length ? { images } : {}) })
    this.runFor(meta).steer(text, images)
  }

  async interrupt(id: string) {
    this.compactarPendiente.delete(id)
    await this.runs.get(id)?.interrupt()
  }

  /** /compact es una operación del proveedor. Si está trabajando, se ejecuta al quedar libre. */
  compactar(id: string) {
    const meta = this.metas.get(id)
    if (!meta) throw new Error('No existe esa sesión')
    if (this.compactando.has(id) || this.compactarPendiente.has(id)) return
    if (meta.running || meta.background?.length) {
      this.compactarPendiente.add(id)
      this.emit(id, { t: 'info', text: 'Se compactará el contexto cuando termine el trabajo en curso.' })
      return
    }
    const run = this.runFor(meta)
    if (!run.compact) throw new Error('Este agente no admite compactación manual.')
    this.compactando.add(id)
    this.emit(id, { t: 'info', text: `Compactando el contexto de ${proveedorDe(meta.model) === 'codex' ? 'Codex' : 'Claude'}…` })
    this.emit(id, { t: 'turn_start', at: Date.now() })
    try { run.compact() }
    catch (error) {
      this.emit(id, { t: 'turn_end', at: Date.now(), ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Cambia el modelo de las siguientes respuestas. Se cierra el agente y el siguiente mensaje lo retoma con el nuevo. */
  setModel(id: string, model: string, effort?: string) {
    const meta = this.metas.get(id)
    // Cerrar el agente mataría lo que corre en segundo plano.
    if (!meta || meta.running || meta.background?.length) return
    if (proveedorDe(meta.model) !== proveedorDe(model)) throw new Error('Para cambiar de Claude a Codex o al revés, abre un hilo nuevo. Cada proveedor conserva su propia conversación.')
    meta.model = model
    meta.effort = effort
    this.cerrar(id)
    this.save(meta)
  }

  /** Un hilo archivado no espera respuesta: si está quieto, su proceso se cierra. */
  archive(id: string, archived: boolean) {
    const meta = this.metas.get(id)
    if (!meta) return
    meta.archived = archived || undefined
    if (archived) this.cerrarQuieto(id)
    this.save(meta)
  }

  /** Le pone otro nombre. Sin tocar `updatedAt`: renombrarlo no lo sube en la lista ni lo marca como terminado. */
  rename(id: string, title: string) {
    const meta = this.metas.get(id)
    if (!meta) return
    meta.title = title
    this.save(meta)
  }

  /** Borra la sesión del disco. Con el agente trabajando no: se cortaría a medias. */
  remove(id: string) {
    const meta = this.metas.get(id)
    if (!meta) return
    if (meta.running || meta.background?.length) throw new Error('El agente sigue trabajando en este hilo. Detenlo antes de eliminarlo.')
    this.cerrar(id)
    this.cerrarRegistro(id)
    this.metas.delete(id)
    this.events.delete(id)
    rmSync(join(this.dir, `${id}.json`), { force: true })
    rmSync(join(this.dir, `${id}.jsonl`), { force: true })
    rmSync(join(this.dir, 'vistas', `${id}.json`), { force: true })
    this.pushRemoved(id)
  }

  /** Cierra el proceso del agente de un hilo. El siguiente mensaje abre otro que retoma la sesión (`providerSessionId`). */
  private cerrar(id: string) {
    this.runs.get(id)?.close()
    this.runs.delete(id)
  }

  /** Cierra el proceso de un hilo quieto: sin turno en curso ni nada en segundo plano, que se cortaría. */
  private cerrarQuieto(id: string) {
    const meta = this.metas.get(id)
    if (meta && !meta.running && !meta.background?.length) this.cerrar(id)
  }

  /** El reloj de cada video del lote que espera para cerrar su proceso (`OCIOSO`). */
  private relojes = new Map<string, ReturnType<typeof setTimeout>>()
  /** Los que dejaron un despertador (ScheduleWakeup, CronCreate): vive dentro del proceso, y cerrarlo lo perdería. */
  private despertadores = new Set<string>()

  /**
   * Cuando lo de segundo plano (subagentes, comandos, un Monitor) termina con el turno ya acabado, el hilo lo dice: el
   * agente suele cerrar su turno con «todo listo» mientras algo sigue, y sin esto había que preguntarle si ya acabó. Espera
   * `CALMA`: al terminar una tarea, Claude Code abre él solo un turno para leerla, y eso no es quedarse quieto. Solo con el
   * proceso del agente vivo: si se cerró o se reinició Sloth, lo de fondo se cortó, no terminó.
   */
  private avisarFondo(id: string, meta: SessionMeta, event: AgentEvent, habia: number) {
    if (event.t === 'turn_start' || (event.t === 'background' && event.tasks.length)) {
      clearTimeout(this.fondoVacio.get(id))
      this.fondoVacio.delete(id)
    }
    if (event.t !== 'background' || event.tasks.length || !habia || meta.running || !this.runs.has(id)) return
    clearTimeout(this.fondoVacio.get(id))
    const reloj = setTimeout(() => {
      this.fondoVacio.delete(id)
      if (!meta.running && !meta.background?.length && this.metas.has(id)) {
        this.emit(id, { t: 'info', text: 'Terminó lo que seguía en segundo plano: ya no queda nada trabajando en este hilo.' })
      }
    }, CALMA)
    reloj.unref()
    this.fondoVacio.set(id, reloj)
  }
  private fondoVacio = new Map<string, ReturnType<typeof setTimeout>>()

  /**
   * Cuenta el rato quieto de un video del lote. Cualquier cosa que haga anula el reloj, y se vuelve a armar cuando acaba
   * bien un turno o se le vacía el segundo plano: Claude Code puede abrir un turno él solo cuando termina una tarea.
   */
  private ocioso(id: string, meta: SessionMeta, event: AgentEvent) {
    clearTimeout(this.relojes.get(id))
    this.relojes.delete(id)
    if (event.t === 'turn_start') this.despertadores.delete(id)
    if (event.t === 'tool' && (event.name === 'ScheduleWakeup' || event.name === 'CronCreate') && !(event.input as { stop?: boolean } | null)?.stop) {
      this.despertadores.add(id)
    }
    const quieto = (event.t === 'turn_end' && event.ok) || (event.t === 'background' && !event.tasks.length && !meta.running && meta.acaboBien)
    if (!quieto || this.despertadores.has(id)) return
    const reloj = setTimeout(() => {
      this.relojes.delete(id)
      this.cerrarQuieto(id)
    }, OCIOSO)
    reloj.unref()
    this.relojes.set(id, reloj)
  }

  closeAll() {
    this.cerrarRegistros(true)
    for (const run of this.runs.values()) run.close()
    // Si Sloth no se reinicia después (una actualización que falló), el siguiente mensaje retoma la sesión.
    this.runs.clear()
  }

  private runFor(meta: SessionMeta): AgentRun {
    const live = this.runs.get(meta.id)
    if (live) return live
    // Un hilo de Codex sigue con la llave o con la cuenta con que empezó; los de antes de las llaves, con la cuenta.
    const conLlave = proveedorDe(meta.model) === 'codex' ? (meta.providerSessionId ? !!meta.conLlave : !!llaveEnUso('codex')) : undefined
    const run = this.crearAgente({
      cwd: meta.cwd,
      model: meta.model,
      effort: meta.effort,
      resume: meta.providerSessionId,
      lote: !!meta.lote,
      hilo: meta.id,
      conLlave,
      onEvent: (event) => this.emit(meta.id, event),
      onDraft: (draft) => this.pushDraft(meta.id, draft),
      // Un proceso muerto no recibe nada: se olvida, y el siguiente mensaje abre otro que retoma la sesión. Si se cayó,
      // lo que no leyó o lo que cortó sigue como tras una caída del servidor.
      onExit: (caida) => {
        if (this.runs.get(meta.id) === run) this.runs.delete(meta.id)
        if (caida && this.metas.has(meta.id)) this.retomar(meta, caida.turno ? sinLeer(this.load(meta.id)) : [], caida.turno, meta.background ?? [])
      },
      onProviderSession: (providerId) => {
        meta.providerSessionId = providerId
        meta.conLlave = conLlave || undefined
        this.save(meta)
      }
    })
    this.runs.set(meta.id, run)
    return run
  }

  private emit(id: string, event: AgentEvent) {
    // Un hilo borrado con su agente vivo: al cerrarse, el agente aún avisa de que se cerró, y ya no hay a quién.
    const meta = this.metas.get(id)
    if (!meta) return
    const habia = meta.background?.length ?? 0
    if (event.t === 'background') {
      if (event.tasks.join('\n') === (meta.background ?? []).join('\n')) return
      meta.background = event.tasks
      this.save(meta)
    }
    if (event.t === 'thinking') event.at ??= Date.now() // panel de etapas
    const list = this.load(id)
    list.push(event)
    this.anotar(id, JSON.stringify(event) + '\n')
    this.push(id, list.length - 1, [event])
    const running = event.t === 'turn_end' ? false : event.t === 'turn_start' ? true : meta.running
    if (event.t === 'turn_end' && event.ok) delete meta.retomas
    if (event.t === 'turn_end') meta.acaboBien = event.ok
    if (running !== meta.running || event.t === 'user') {
      meta.running = running
      meta.updatedAt = Date.now()
      this.save(meta)
    }
    if (event.t === 'turn_end') this.compactando.delete(id)
    if ((event.t === 'turn_end' || event.t === 'background') && !meta.running && !meta.background?.length && this.compactarPendiente.delete(id)) {
      setTimeout(() => {
        try { this.compactar(id) }
        catch (error) { this.emit(id, { t: 'info', text: `No se pudo compactar: ${error instanceof Error ? error.message : String(error)}` }) }
      })
    }
    // Una caída es de este hilo y se retoma sola; un error del proveedor (un límite de uso) le pasaría a todos.
    if (event.t === 'turn_end' && !event.ok && !event.caida && meta.lote) this.pausar(meta.lote.id, `«${meta.title}»: ${event.error ?? 'se detuvo'}`)
    // Nadie mira un video del lote mientras trabaja: si su turno acaba bien, su proceso se cierra en cuanto queda quieto.
    if (meta.lote) this.ocioso(id, meta, event)
    this.avisarFondo(id, meta, event, habia)
    // Un agente que deja de trabajar libera sitio.
    if (event.t === 'turn_end' || event.t === 'background') setTimeout(() => this.repartir())
  }

  /**
   * El historial de un hilo, del disco la primera vez. Quien lo quiera lo pide aquí cada vez, sin guardárselo: los de los
   * hilos quietos se sueltan (`soltar`), y una lista soltada ya no recibe lo nuevo.
   */
  private load(id: string): AgentEvent[] {
    let list = this.events.get(id)
    if (list) {
      // El más reciente al final: los primeros son los que se sueltan.
      this.events.delete(id)
      this.events.set(id, list)
    } else {
      const file = join(this.dir, `${id}.jsonl`)
      try {
        const fuente = statSync(file)
        const vista = JSON.parse(readFileSync(join(this.dir, 'vistas', `${id}.json`), 'utf8'))
        if (vista.version === 1 && vista.bytes === fuente.size && vista.mtime === fuente.mtimeMs && Array.isArray(vista.events)) {
          if (vista.terminado === false) escribir(() => appendFileSync(file, '\n'))
          list = vista.events as AgentEvent[]
          this.events.set(id, list)
          this.soltar(id)
          return list
        }
      } catch { /* La vista es regenerable; el registro original sigue siendo la fuente de verdad. */ }
      const texto = existsSync(file) ? readFileSync(file, 'utf8') : ''
      // Una línea a medias (se cortó al escribirla) se salta, en vez de perder el hilo entero. Si es la última, se cierra
      // para que lo siguiente no se pegue a ella.
      if (texto && !texto.endsWith('\n')) escribir(() => appendFileSync(file, '\n'))
      list = []
      for (const linea of texto.split('\n').filter(Boolean)) {
        try {
          list.push(JSON.parse(linea))
        } catch {
          console.error(`El hilo ${id} tiene una línea dañada, y se salta.`)
        }
      }
      this.events.set(id, list)
      this.soltar(id)
    }
    return list
  }

  /**
   * Suelta los historiales que llevan más tiempo sin leerse, hasta dejar `EN_MEMORIA`, salvo el que se acaba de leer. Los
   * de los hilos que trabajan o esperan no: les llegan eventos a cada rato. Lo que se suelta ya está en el disco, y se
   * vuelve a leer de ahí.
   */
  private soltar(leido: string) {
    let sobran = this.events.size - EN_MEMORIA
    for (const id of this.events.keys()) {
      if (sobran <= 0) return
      const meta = this.metas.get(id)
      if (id === leido || (meta && (meta.running || meta.background?.length || meta.pendiente))) continue
      this.events.delete(id)
      sobran--
    }
  }

  /**
   * Los registros (`<id>.jsonl`) que se están escribiendo, abiertos: abrir y cerrar el archivo con cada evento costaba 60
   * veces más, y mientras el agente escribe llegan decenas por segundo. Se cierran tras `QUIETO_REGISTRO` sin eventos, y
   * antes de borrar el hilo. Lo escrito llega al disco igual que antes: con cada evento, sin esperar a cerrarlo.
   */
  private registros = new Map<string, { fd: number; ultimo: number }>()

  private anotar(id: string, linea: string) {
    escribir(() => {
      let r = this.registros.get(id)
      if (!r) this.registros.set(id, (r = { fd: openSync(join(this.dir, `${id}.jsonl`), 'a'), ultimo: 0 }))
      r.ultimo = Date.now()
      try {
        writeSync(r.fd, linea)
      } catch (error) {
        // Un descriptor que dejó de valer no se reintenta: el siguiente evento abre otro.
        this.cerrarRegistro(id)
        throw error
      }
    })
  }

  private cerrarRegistro(id: string) {
    const r = this.registros.get(id)
    if (!r) return
    this.registros.delete(id)
    try {
      closeSync(r.fd)
    } catch {
      // Ya estaba cerrado.
    }
  }

  /** Los registros que llevan un rato sin eventos se cierran. Con `todos`, todos (al cerrar Sloth). */
  cerrarRegistros(todos = false) {
    const antes = Date.now() - QUIETO_REGISTRO
    for (const [id, r] of this.registros) if (todos || r.ultimo < antes) this.cerrarRegistro(id)
  }

  private save(meta: SessionMeta) {
    escribir(() => guardar(join(this.dir, `${meta.id}.json`), JSON.stringify(meta, null, 2)))
    this.pushMeta(meta)
  }
}

/**
 * Guarda en disco sin dejar que un error lo tumbe todo. Con el disco lleno, una escritura que falla cortaba el mensaje a
 * la mitad: se veía, pero nunca llegaba al agente. Así el hilo sigue en memoria y el agente lo recibe.
 */
function escribir(guardar: () => void) {
  try {
    guardar()
  } catch (error) {
    console.error(`No se pudo guardar el hilo: ${error instanceof Error ? error.message : error}`)
  }
}
