import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, isAbsolute, join, relative } from 'node:path'
import { CANAL_CARD, esVertical, IDEAS_CARD, redDeReferencia, sinInvestigar, skillDe, TU_INSTAGRAM } from '../../shared/ideas.ts'
import type { Canal, CanalCompleto, EnVivo, IdeaElegida, Ideas, Investigacion, Rendimiento, ServerPush, SessionMeta, Temas, TrabajoYT, Transcripcion, VueltaAnterior } from '../../shared/types.ts'
import { guardar } from '../disco.ts'
import { llaveYoutube, tokenMeta } from '../opciones.ts'
import type { Sessions } from '../sessions.ts'
import { skillRef } from '../skills.ts'
import { investigar } from './investigar.ts'
import { investigarVertical } from './investigar-vertical.ts'
import { medirRendimiento } from './rendimiento.ts'
import { enLineas, resumir } from './resumen.ts'
import { abrirInvestigacion, cuentaInvestigacion } from './tiktok.ts'
import { Detenido, ytdlp } from './youtube.ts'

/**
 * La sección Ideas: canales de YouTube, o verticales (TikTok e Instagram), la investigación de su nicho
 * (`investigar.ts`, `investigar-vertical.ts`) y las ideas que Claude propone con la skill `ideas-youtube` o
 * `ideas-vertical`. Cada canal vive en `trabajo/ideas/<id>/`, con todo lo suyo a la vista: `canal.json`,
 * `investigacion.json`, `resumen.json` (lo que Claude lee primero, `resumen.ts`), `registro.json` (los pasos de la última
 * vuelta), `estado.json` (lo que hiciste con cada idea), `portadas/` (las de los videos verticales) y lo que escribe
 * Claude (`demanda.md`, `formatos.md`, `ideas.json`, `esquema-<id>.md`). En el canal de YouTube que conectaste para subir,
 * «Tus videos»: cómo le fue a cada uno (`rendimiento.json`, `rendimiento.ts`), lo que Claude lee en Studio
 * (`studio.json`) y su diagnóstico (`diagnostico.md`), que lee antes de proponer. Quitarlo es borrar esta carpeta,
 * `web/src/Ideas.*`, `shared/ideas.ts`, `skills/ideas-*` y las líneas marcadas «ideas».
 */

/**
 * `estado.json`: los hilos que propusieron ideas, en orden, la última entrevista, el último diagnóstico de tus videos y lo
 * que el usuario hizo con cada idea.
 */
interface Estado {
  hilos: string[]
  entrevista?: string
  diagnostico?: string
  elegidas: Record<string, IdeaElegida>
}

/** La cuenta de YouTube conectada para subir (`server/youtube.ts`): con ella se miden tus videos. */
type CuentaYoutube = { canal(): string | undefined; token(): Promise<string> }
/** `studio.json`, que escribe Claude al diagnosticar: lo que solo Studio dice de cada video. */
type Studio = { medido?: string; videos?: Record<string, { impresiones?: number; ctr?: number }> }

/** Los campos que se pueden pedir con «No sé, pregúntame», dichos como en el formulario. */
const CAMPOS: Record<string, string> = {
  publico: '«¿A quién le hablas?» (publico)',
  meta: '«¿Para qué es el canal?» (meta)',
  semillas: '«Lo que tu público busca» (semillas)',
  vecinos: '«Nichos vecinos» (vecinos)',
  referencias: '«Canales que ya conoces» (referencias)'
}
/** Rutas de `/api/ideas/…` que no pueden ser el id de un canal. */
const RESERVADOS = ['canales', 'entrevista']
/** El nombre del canal que crea la entrevista cuando aún no tiene uno. La interfaz manda el mismo. */
const NUEVO = 'Canal nuevo'

type Eleccion = { model: string; effort?: string }

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]

/** Una herramienta del agente, dicha como la vería el usuario: «Escribe demanda.md», «Lee investigacion.json». */
function queHace(nombre: string, input: unknown): string {
  const i = (input ?? {}) as { description?: string; file_path?: string; command?: string; pattern?: string }
  const archivo = i.file_path ? basename(i.file_path) : ''
  if (/^(Write|Edit|MultiEdit)$/.test(nombre) && archivo) return `Escribe ${archivo}`
  if (nombre === 'Read' && archivo) return `Lee ${archivo}`
  if (nombre === 'Skill') return 'Lee la skill'
  if (i.description) return i.description
  if (i.command) return i.command.slice(0, 90)
  return nombre
}

/** `El Diff · IA` → `el-diff-ia`. */
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'canal'

/** Una lista escrita por el usuario: sin vacíos ni repetidos. */
const lista = (xs: unknown) => [...new Set((Array.isArray(xs) ? xs : []).map((x) => String(x).trim()).filter(Boolean))]

export function ideas(app: string, sessions: Sessions, avisar: (push: ServerPush) => void, youtube?: CuentaYoutube) {
  const raiz = join(app, 'trabajo', 'ideas')
  mkdirSync(raiz, { recursive: true })
  const trabajos = new Map<string, TrabajoYT>()
  const paradas = new Map<string, AbortController>()

  const carpeta = (id: string) => join(raiz, id)
  function leer<T>(id: string, archivo: string): T | null {
    try {
      return JSON.parse(readFileSync(join(carpeta(id), archivo), 'utf8')) as T
    } catch {
      return null
    }
  }
  const texto = (id: string, archivo: string) => {
    try {
      return readFileSync(join(carpeta(id), archivo), 'utf8')
    } catch {
      return undefined
    }
  }
  const escribir = (id: string, archivo: string, datos: unknown) => guardar(join(carpeta(id), archivo), JSON.stringify(datos, null, 1))
  /** `estado.json`. Uno de antes guardaba un solo hilo por idea (`cardId` y `hilo`): se lee como el primero de la lista. */
  function estado(id: string): Estado {
    const e: Estado = { hilos: [], elegidas: {}, ...leer<Estado>(id, 'estado.json') }
    for (const el of Object.values(e.elegidas) as (IdeaElegida & { cardId?: string; hilo?: string })[]) {
      el.hilos ??= el.cardId ? [{ cardId: el.cardId, en: el.en, ...(el.hilo ? { id: el.hilo } : {}) }] : []
      delete el.cardId
      delete el.hilo
    }
    return e
  }

  const investigacion = (id: string) => leer<Investigacion>(id, 'investigacion.json')
  /** `resumen.json`, desde la investigación guardada y el perfil de hoy: no vuelve a YouTube, y tarda milisegundos. */
  function escribirResumen(id: string) {
    const inv = investigacion(id)
    const canal = leer<Canal>(id, 'canal.json')
    if (inv?.videos.length && canal) guardar(join(carpeta(id), 'resumen.json'), enLineas(resumir(inv, canal, Date.now(), { textos: textos(id), temas: leer<Temas>(id, 'temas.json') })) + '\n')
  }
  /** El texto entero de cada transcripción del canal, por id: el resumen busca en él lo que se dice en todo el video. */
  function textos(id: string) {
    const dir = join(carpeta(id), 'transcripciones')
    const t = new Map<string, string>()
    if (!existsSync(dir)) return t
    for (const f of readdirSync(dir)) {
      const tr = leer<Transcripcion>(id, join('transcripciones', f))
      if (tr?.texto) t.set(tr.id, tr.texto)
    }
    return t
  }

  /** Si el canal es el de YouTube que conectaste para subir: solo de ese se pueden leer los números. */
  function esTuyo(id: string) {
    const canal = leer<Canal>(id, 'canal.json')
    const propio = investigacion(id)?.canales.find((x) => x.propio)?.id
    return !!canal && !esVertical(canal) && !!propio && propio === youtube?.canal()
  }
  /** `rendimiento.json`, con lo de Studio (`studio.json`) puesto en cada video. */
  function rendimiento(id: string): Rendimiento | null {
    const r = leer<Rendimiento>(id, 'rendimiento.json')
    const s = leer<Studio>(id, 'studio.json')
    if (!r || !s?.videos) return r
    return { ...r, studio: s.medido, videos: r.videos.map((v) => ({ ...v, ...s.videos![v.id] })) }
  }
  /** «Actualizar»: lee otra vez tus videos de YouTube. Al escribir el archivo, la sección se entera sola. */
  const midiendo = new Set<string>()
  async function medir(id: string) {
    if (!youtube || !esTuyo(id)) throw new Error('Conecta este canal en «Mis videos» → YouTube para leer sus números.')
    if (midiendo.has(id)) return
    midiendo.add(id)
    try {
      escribir(id, 'rendimiento.json', await medirRendimiento(await youtube.token()))
    } finally {
      midiendo.delete(id)
    }
  }

  /** Los hilos que trabajan ahora en la carpeta de un canal: la entrevista, las propuestas, las preparaciones. */
  const activos = (id: string) =>
    sessions.list().filter((s) => {
      const r = relative(carpeta(id), s.cwd)
      return (s.running || !!s.background?.length || !!s.pendiente) && !r.startsWith('..') && !isAbsolute(r)
    })

  function canales(): Canal[] {
    return readdirSync(raiz)
      .map((id) => leer<Canal>(id, 'canal.json'))
      .filter((c): c is Canal => !!c)
      .sort((a, b) => a.creado - b.creado)
  }

  // Lo que Claude escribe en la carpeta de un canal se avisa a la interfaz, que lo vuelve a pedir. La investigación avisa
  // ella misma, paso a paso.
  const pendientes = new Map<string, ReturnType<typeof setTimeout>>()
  watch(raiz, { recursive: true }, (_evento, nombre) => {
    const [id, archivo] = String(nombre ?? '').split(/[\\/]/)
    if (!id || !archivo || /^((investigacion|resumen|registro|estado|temas|vectores)\.json|vectores\.bin|portadas|transcripciones)$/.test(archivo)) return
    clearTimeout(pendientes.get(id))
    pendientes.set(id, setTimeout(() => avisar({ type: 'ideas', canalId: id }), 300))
  })

  /** La línea con que un hilo dice de qué idea sale: `Idea: <canal>/<idea>`. «Hacer con…» la escribe en el borrador. */
  const MARCA = /^Idea: ([\w-]+)\/([\w-]+)\s*$/m
  /** La idea de cada hilo, `[canal, idea]` o `null`. Su primer mensaje no cambia: se lee una vez. */
  const ideaDeHilo = new Map<string, [string, string] | null>()
  function ideaDe(s: SessionMeta) {
    if (!ideaDeHilo.has(s.id)) {
      const primero = sessions.primerUsuario(s.id)
      if (!primero) return null // Aún sin mandar: se mira otra vez la próxima.
      const m = MARCA.exec(primero.text)
      ideaDeHilo.set(s.id, m && [m[1], m[2]])
    }
    return ideaDeHilo.get(s.id)!
  }

  /**
   * Une a cada idea todos los hilos que salen de ella: los que llevan su línea `Idea: <canal>/<idea>`, vengan de «Hacer
   * con…» o no. Si «Hacer con…» dejó esa card esperando, el hilo ocupa ese sitio. Los de «Lo grabo yo» los une `preparar`.
   */
  function unirHilos(id: string, creado: number, e: Estado) {
    let cambio = false
    for (const s of sessions.list()) {
      if (s.createdAt < creado || s.cardId === IDEAS_CARD.id || s.cardId === CANAL_CARD.id) continue
      const [canalId, ideaId] = ideaDe(s) ?? []
      if (canalId !== id || !ideaId) continue
      const el = (e.elegidas[ideaId] ??= { estado: 'elegida', en: s.createdAt, hilos: [] })
      if (el.hilos.some((h) => h.id === s.id)) continue
      const esperando = el.hilos.find((h) => !h.id && h.cardId === s.cardId && s.createdAt >= h.en - 1000)
      if (esperando) esperando.id = s.id
      else el.hilos.push({ cardId: s.cardId, id: s.id, en: s.createdAt })
      cambio = true
    }
    if (cambio) escribir(id, 'estado.json', e)
  }

  /** Lo que escribe «Proponer ideas», y que se guarda entero antes de una vuelta nueva. */
  const DE_UNA_VUELTA = ['ideas.json', 'demanda.md', 'formatos.md']

  /**
   * Guarda la vuelta actual en `anteriores/<fecha>/`: Claude reescribe `ideas.json`, y ninguna idea debe perderse. Dos
   * vueltas distintas del mismo minuto no se pisan: la segunda lleva `-2`. La misma, ya guardada, no se repite.
   */
  function archivar(id: string) {
    const ideas = join(carpeta(id), 'ideas.json')
    if (!existsSync(ideas)) return
    const actual = readFileSync(ideas, 'utf8')
    const d = new Date(statSync(ideas).mtimeMs)
    const dos = (n: number) => String(n).padStart(2, '0')
    const base = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`
    let vuelta = base
    for (let n = 2; existsSync(join(carpeta(id), 'anteriores', vuelta)); n++) {
      if (texto(id, join('anteriores', vuelta, 'ideas.json')) === actual) return // Ya se guardó esta misma.
      vuelta = `${base}-${n}`
    }
    const destino = join(carpeta(id), 'anteriores', vuelta)
    mkdirSync(destino, { recursive: true })
    for (const f of DE_UNA_VUELTA) if (existsSync(join(carpeta(id), f))) copyFileSync(join(carpeta(id), f), join(destino, f))
  }

  /**
   * Las ideas que elegiste no dependen de que Claude las conserve: si una vuelta nueva omitió alguna, vuelve desde la
   * vuelta anterior más nueva que la tenga, con su mismo id, para que su hilo y su estado sigan unidos a ella. Solo con el
   * hilo quieto, para no escribir a la vez que Claude.
   */
  function conservarElegidas(id: string, e: Estado) {
    const actuales = leer<Ideas>(id, 'ideas.json')
    if (!actuales) return
    const faltan = Object.keys(e.elegidas).filter((i) => e.elegidas[i].estado === 'elegida' && !actuales.ideas.some((idea) => idea.id === i))
    if (!faltan.length) return
    const vueltas = anteriores(id)
    let cambio = false
    for (const ideaId of faltan) {
      const idea = vueltas.map((v) => v.ideas.find((i) => i.id === ideaId)).find((i) => !!i)
      if (idea) actuales.ideas.push(idea), (cambio = true)
    }
    if (cambio) escribir(id, 'ideas.json', actuales)
  }

  function anteriores(id: string): VueltaAnterior[] {
    const dir = join(carpeta(id), 'anteriores')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .map((vuelta) => {
        const ideas = leer<Ideas>(id, join('anteriores', vuelta, 'ideas.json'))
        return ideas && { vuelta, en: statSync(join(dir, vuelta, 'ideas.json')).mtimeMs, ideas: ideas.ideas }
      })
      .filter((v): v is VueltaAnterior => !!v)
      .sort((a, b) => b.en - a.en)
  }

  /** Vuelve a poner en las ideas de ahora una de una vuelta anterior. Si su id ya está, lleva uno nuevo. */
  function recuperar(id: string, vuelta: string, ideaId: string) {
    const idea = anteriores(id)
      .find((v) => v.vuelta === vuelta)
      ?.ideas.find((i) => i.id === ideaId)
    if (!idea) throw new Error('No encuentro esa idea en las vueltas anteriores.')
    if (completo(id)?.hilo?.running) throw new Error('Claude está proponiendo ideas ahora: espera a que termine.')
    const actuales = leer<Ideas>(id, 'ideas.json') ?? { ideas: [] }
    if (actuales.ideas.some((i) => i.titulo === idea.titulo)) throw new Error('Esa idea ya está entre las de ahora.')
    let nuevo = idea.id
    for (let n = 2; actuales.ideas.some((i) => i.id === nuevo); n++) nuevo = `${idea.id}-${n}`
    actuales.ideas.push({ ...idea, id: nuevo })
    escribir(id, 'ideas.json', actuales)
  }

  function completo(id: string): CanalCompleto | null {
    const canal = leer<Canal>(id, 'canal.json')
    if (!canal) return null
    const e = estado(id)
    unirHilos(id, canal.creado, e)
    const hilo = e.hilos.map((h) => sessions.list().find((s) => s.id === h)).filter((s) => !!s).at(-1)
    const entrevista = e.entrevista ? sessions.list().find((s) => s.id === e.entrevista) : undefined
    const diagnostico = e.diagnostico ? sessions.list().find((s) => s.id === e.diagnostico) : undefined
    // Cuando el hilo que propone ya acabó, su ideas.json es el de la vuelta: ahí se comprueba que no faltan las elegidas.
    if (!hilo?.running && !hilo?.background?.length) conservarElegidas(id, e)
    const esquemas: Record<string, string> = {}
    for (const f of readdirSync(carpeta(id))) {
      const m = /^esquema-(.+)\.md$/.exec(f)
      if (m) esquemas[m[1]] = texto(id, f) ?? ''
    }
    return {
      canal,
      carpeta: carpeta(id),
      investigacion: investigacion(id),
      trabajo: trabajos.get(id) ?? leer<TrabajoYT>(id, 'registro.json'),
      ideas: leer<Ideas>(id, 'ideas.json'),
      anteriores: anteriores(id),
      // Un hilo que borraste ya no se enseña.
      elegidas: Object.fromEntries(Object.entries(e.elegidas).map(([i, el]) => [i, { ...el, hilos: el.hilos.filter((h) => !h.id || sessions.meta(h.id)) }])),
      hilo: hilo && { id: hilo.id, title: hilo.title, running: hilo.running || !!hilo.background?.length },
      entrevista: entrevista && { id: entrevista.id, title: entrevista.title, running: entrevista.running || !!entrevista.background?.length },
      demanda: texto(id, 'demanda.md'),
      formatos: texto(id, 'formatos.md'),
      esquemas,
      api: !!llaveYoutube(),
      ytdlp: !!ytdlp(),
      meta: esVertical(canal) ? !!tokenMeta() : undefined,
      temas: leer<Temas>(id, 'temas.json'),
      ...(esTuyo(id) || existsSync(join(carpeta(id), 'rendimiento.json'))
        ? {
            rendimiento: rendimiento(id),
            diagnostico: texto(id, 'diagnostico.md'),
            diagnosticoHilo: diagnostico && { id: diagnostico.id, title: diagnostico.title, running: diagnostico.running || !!diagnostico.background?.length }
          }
        : {})
    }
  }

  function guardarCanal(entrada: Partial<Canal>): Canal {
    const nombre = String(entrada.nombre ?? '').trim()
    if (!nombre) throw new Error('El canal necesita un nombre.')
    const previo = entrada.id ? leer<Canal>(entrada.id, 'canal.json') : null
    let id = previo?.id
    // «Canal nuevo» sale de abrir la entrevista sin nombre. Si una se abandonó, su canal quedó vacío: se reutiliza.
    if (!id && nombre === NUEVO) id = canales().find((c) => vacio(c) && !activos(c.id).length)?.id
    if (!id) {
      id = slug(nombre)
      for (let n = 2; existsSync(carpeta(id)) || RESERVADOS.includes(id); n++) id = `${slug(nombre)}-${n}`
    }
    // El formato se elige al crearlo y no cambia: la investigación de uno no sirve para el otro.
    const vertical = previo ? esVertical(previo) : entrada.formato === 'vertical'
    const canal: Canal = {
      id,
      nombre,
      ...(vertical ? { formato: 'vertical' as const } : {}),
      handle: String(entrada.handle ?? '').trim() || undefined,
      instagram: (vertical && String(entrada.instagram ?? '').trim()) || undefined,
      publico: String(entrada.publico ?? '').trim(),
      meta: String(entrada.meta ?? '').trim(),
      semillas: lista(entrada.semillas),
      vecinos: lista(entrada.vecinos),
      referencias: lista(entrada.referencias),
      creado: previo?.creado ?? Date.now()
    }
    mkdirSync(carpeta(id), { recursive: true })
    escribir(id, 'canal.json', canal)
    return canal
  }
  /** Un canal que nadie llenó: el nombre de la entrevista, nada escrito y nada investigado. */
  const vacio = (c: Canal) =>
    c.nombre === NUEVO &&
    !c.handle &&
    !c.instagram &&
    !c.publico &&
    !c.meta &&
    !c.semillas.length &&
    !c.vecinos.length &&
    !c.referencias.length &&
    !existsSync(join(carpeta(c.id), 'investigacion.json')) &&
    !existsSync(join(carpeta(c.id), 'ideas.json'))

  /**
   * Con `solo`, investiga únicamente esos orígenes del perfil. `luego` corre si la investigación termina bien: así
   * «Proponer ideas» investiga primero lo que falta.
   */
  function empezarInvestigacion(id: string, solo?: string[], luego?: () => void) {
    const canal = leer<Canal>(id, 'canal.json')
    if (!canal) throw new Error('No existe ese canal.')
    if (trabajos.get(id)?.estado === 'trabajando') throw new Error('Ya está investigando.')
    const vertical = esVertical(canal)
    if (!canal.semillas.length && !canal.referencias.length && !canal.handle && !canal.instagram)
      throw new Error(vertical ? 'Pon al menos un término de búsqueda o una cuenta que conozcas.' : 'Pon al menos un término de búsqueda o un canal de referencia.')
    if (!ytdlp()) throw new Error('Falta yt-dlp: instala el Python de Sloth, o corre «python -m pip install yt-dlp».')
    const t: TrabajoYT = { canalId: id, estado: 'trabajando', fase: 'Empezando', hecho: 0, total: 1, pasos: [], empezo: Date.now(), ...(luego ? { proponer: true } : {}) }
    trabajos.set(id, t)
    const parar = new AbortController()
    paradas.set(id, parar)
    const empujar = () => avisar({ type: 'ideas', canalId: id, trabajo: t })
    empujar()
    const ctx = {
      paso: (tipo: TrabajoYT['pasos'][number]['tipo'], texto: string, detalle?: string) => {
        t.pasos.push({ at: Date.now(), tipo, texto, ...(detalle ? { detalle } : {}) })
        if (t.pasos.length > 300) t.pasos.splice(0, t.pasos.length - 300)
        empujar()
      },
      avance: (hecho: number, total: number, fase: string) => {
        Object.assign(t, { hecho, total: Math.max(total, hecho), fase })
        empujar()
      },
      guardar: (inv: Investigacion) => escribir(id, 'investigacion.json', inv),
      signal: parar.signal,
      llave: llaveYoutube(),
      carpeta: carpeta(id)
    }
    ;(vertical ? investigarVertical(canal, investigacion(id), { ...ctx, app, meta: tokenMeta() }, solo) : investigar(canal, investigacion(id), ctx, solo))
      .then(() => {
        Object.assign(t, { estado: 'listo', fase: 'Lista' })
        try {
          escribirResumen(id)
        } catch (e) {
          t.pasos.push({ at: Date.now(), tipo: 'error', texto: 'No pude escribir resumen.json: se escribe al proponer ideas.', detalle: mensaje(e) })
        }
        try {
          luego?.()
        } catch (e) {
          t.pasos.push({ at: Date.now(), tipo: 'error', texto: 'No pude empezar a proponer ideas.', detalle: mensaje(e) })
        }
      })
      .catch((e) =>
        e instanceof Detenido || parar.signal.aborted
          ? (Object.assign(t, { estado: 'detenido', fase: 'Detenida' }), t.pasos.push({ at: Date.now(), tipo: 'info', texto: 'La detuviste. Lo leído hasta aquí quedó guardado.' }))
          : (Object.assign(t, { estado: 'error', fase: 'Falló', error: mensaje(e) }), t.pasos.push({ at: Date.now(), tipo: 'error', texto: mensaje(e) }))
      )
      .finally(() => {
        if (luego && t.estado !== 'listo') t.pasos.push({ at: Date.now(), tipo: 'info', texto: 'No propongo ideas: la investigación no terminó.' })
        t.termino = Date.now()
        paradas.delete(id)
        try {
          escribir(id, 'registro.json', t)
        } catch {}
        empujar()
      })
  }

  /**
   * Qué hace ahora el hilo que propone, para verlo en la sección sin abrirlo: su última herramienta (o que está pensando)
   * y desde cuándo trabaja este turno.
   */
  function enVivo(sessionId: string): EnVivo | null {
    const s = sessions.get(sessionId)
    if (!s) return null
    let ahora = 'Pensando…'
    let desde: number | undefined
    for (let i = s.events.length - 1; i >= 0; i--) {
      const e = s.events[i]
      if (e.t === 'turn_start') {
        desde = e.at
        break
      }
      if (e.t === 'tool' && ahora === 'Pensando…') ahora = queHace(e.name, e.input)
    }
    return { running: s.meta.running || !!s.meta.background?.length, ahora, desde }
  }

  /** Un hilo de la sección, con la skill: el que propone ideas, el que prepara una para grabar o la entrevista. */
  function hilo(id: string, title: string, text: string, eleccion: Eleccion, card = IDEAS_CARD) {
    if (!eleccion.model) throw new Error('Falta elegir el modelo.')
    const canal = leer<Canal>(id, 'canal.json')
    const meta = sessions.create({ cardId: card.id, title: title.slice(0, 80), model: eleccion.model, effort: eleccion.effort, cwd: carpeta(id) })
    // Las mismas cards para los dos formatos: cambia la skill. La de vertical trae además las herramientas de `mcp.ts`.
    sessions.send(meta.id, text, skillRef(canal ? skillDe(canal) : card.skill!))
    return meta
  }

  /**
   * La entrevista: Claude pregunta, una cosa a la vez, lo que el usuario no sabe poner en el formulario, y va guardando
   * cada respuesta en `canal.json`. Sin canal, crea uno («Canal nuevo») que la entrevista nombra.
   */
  function entrevistar(canalId: string | undefined, campo: string | undefined, eleccion: Eleccion, formato?: Canal['formato']) {
    // Antes de crear nada: sin modelo no hay entrevista.
    if (!eleccion.model) throw new Error('Falta elegir el modelo con que pregunta Claude.')
    const canal = canalId ? leer<Canal>(canalId, 'canal.json') : guardarCanal({ nombre: NUEVO, formato })
    if (!canal) throw new Error('No existe ese canal.')
    const e = estado(canal.id)
    const viva = e.entrevista && sessions.list().find((s) => s.id === e.entrevista)
    if (viva && viva.running) throw new Error('Ya te está preguntando por este canal: contesta en su hilo.')
    const pedido = campo && CAMPOS[campo]
    const text = [
      `Ayúdame a armar el perfil del canal ${esVertical(canal) ? 'vertical (TikTok e Instagram) ' : ''}«${canal.nombre}» con preguntas: sigue «Armar el canal (entrevista)» de la skill. Lo que ya hay está en canal.json.`,
      pedido ? `No sé qué poner en ${pedido}: empieza por ahí.` : 'Empieza por lo que falte o esté más flojo.'
    ].join('\n\n')
    const meta = hilo(canal.id, `Tu canal · ${canal.nombre}`, text, eleccion, CANAL_CARD)
    e.entrevista = meta.id
    escribir(canal.id, 'estado.json', e)
    return { canalId: canal.id, sesion: meta }
  }

  /**
   * «Proponer ideas». Si el perfil tiene algo que la investigación no cubre (un término nuevo, una referencia sin leer),
   * primero se investiga solo eso y Claude propone al terminar: proponer sin ello gasta la vuelta en el perfil de antes.
   * Si aun así falta algo (YouTube no dejó buscarlo), propone con lo que hay, y el resumen dice qué falta.
   */
  function proponer(id: string, eleccion: Eleccion, nota?: string, investigado = false): SessionMeta | { investigando: string[] } {
    const c = completo(id)
    if (!c) throw new Error('No existe ese canal.')
    const vertical = esVertical(c.canal)
    if (!c.investigacion?.videos.length) throw new Error(`Primero investiga: las ideas salen de lo que se leyó en ${vertical ? 'TikTok e Instagram' : 'YouTube'}.`)
    if (trabajos.get(id)?.estado === 'trabajando') throw new Error('Está investigando: las ideas salen de la investigación, espera a que termine.')
    if (c.hilo?.running) throw new Error('Claude ya está proponiendo ideas para este canal.')
    if (!eleccion.model) throw new Error('Falta elegir el modelo.')
    // Sin token de Meta, Instagram no se puede leer: pedirlo otra vez en cada vuelta solo la retrasaría.
    const legible = (o: string) => !vertical || !!c.meta || (o !== TU_INSTAGRAM && !(c.canal.referencias.includes(o) && redDeReferencia(o) === 'instagram'))
    const faltan = investigado ? [] : sinInvestigar(c.investigacion, c.canal).filter(legible)
    if (faltan.length) {
      empezarInvestigacion(id, faltan, () => proponer(id, eleccion, nota, true))
      return { investigando: faltan }
    }
    // La vuelta de ahora se guarda antes: Claude reescribe ideas.json. Y el resumen, al día con la investigación guardada.
    archivar(id)
    escribirResumen(id)
    const elegidas = Object.entries(c.elegidas).filter(([, el]) => el.estado === 'elegida').map(([i]) => i)
    const text = [
      `Propón ideas de ${vertical ? 'video vertical (TikTok e Instagram)' : 'video largo'} para el canal «${c.canal.nombre}» con lo que hay en esta carpeta: canal.json y resumen.json (lo ya contado de investigacion.json). Sigue «Proponer ideas» de la skill.`,
      c.ideas &&
        [
          'Ya hay ideas de una vuelta anterior (ideas.json). Sloth ya la guardó en anteriores/, así que puedes reescribir el archivo: mejora las que sigan valiendo, quita las que la investigación nueva desmienta y no repitas las descartadas de estado.json.',
          elegidas.length && `Las que el usuario eligió (${elegidas.join(', ')}) se quedan con su mismo id: puedes mejorarlas. Si alguna falta al terminar, Sloth la vuelve a poner como estaba.`
        ]
          .filter(Boolean)
          .join(' '),
      nota?.trim() && `Además: ${nota.trim()}`
    ]
      .filter(Boolean)
      .join('\n\n')
    const meta = hilo(id, `Ideas · ${c.canal.nombre}`, text, eleccion)
    const e = estado(id)
    e.hilos.push(meta.id)
    escribir(id, 'estado.json', e)
    return meta
  }

  /**
   * «Diagnosticar»: lee otra vez tus números y abre un hilo que los explica. Claude suma lo de Studio (`studio.json`) y
   * escribe `diagnostico.md`, con lo que cambiar en la siguiente tanda.
   */
  async function diagnosticar(id: string, eleccion: Eleccion): Promise<SessionMeta> {
    const e = estado(id)
    const vivo = e.diagnostico && sessions.list().find((s) => s.id === e.diagnostico)
    if (vivo && (vivo.running || vivo.background?.length)) return vivo
    if (!eleccion.model) throw new Error('Falta elegir el modelo.')
    await medir(id)
    const canal = leer<Canal>(id, 'canal.json')!
    const meta = hilo(id, `Tus videos · ${canal.nombre}`, `Diagnostica cómo le fue a mis videos de «${canal.nombre}»: sigue «Diagnosticar tus videos» de la skill. Sloth acaba de dejar los números en rendimiento.json.`, eleccion)
    const ahora = estado(id)
    ahora.diagnostico = meta.id
    escribir(id, 'estado.json', ahora)
    return meta
  }

  /** «Lo grabo yo». Pedirlo otra vez mientras su hilo trabaja (un doble clic) devuelve ese hilo: no abre otro. */
  function preparar(id: string, ideaId: string, eleccion: Eleccion): SessionMeta {
    const idea = leer<Ideas>(id, 'ideas.json')?.ideas.find((i) => i.id === ideaId)
    if (!idea) throw new Error('No encuentro esa idea en ideas.json.')
    const grabando = estado(id).elegidas[ideaId]?.hilos.filter((h) => h.cardId === 'grabar').map((h) => h.id)
    const enCurso = activos(id).find((s) => grabando?.includes(s.id))
    if (enCurso) return enCurso
    const meta = hilo(
      id,
      `Grabar · ${idea.titulo}`,
      `Prepara la idea «${ideaId}» de ideas.json («${idea.titulo}») para que la grabe yo${esVertical(leer<Canal>(id, 'canal.json')) ? ', en vertical' : ', con mi pantalla y mi voz'}. Sigue «Preparar para grabar» de la skill y deja esquema-${ideaId}.md.`,
      eleccion
    )
    // Se suma a los hilos que ya tuviera la idea: grabarla no quita el video que haga un estilo.
    const e = estado(id)
    const el = (e.elegidas[ideaId] ??= { estado: 'elegida', en: Date.now(), hilos: [] })
    el.estado = 'elegida'
    el.hilos.push({ cardId: 'grabar', id: meta.id, en: Date.now() })
    escribir(id, 'estado.json', e)
    return meta
  }

  async function body<T>(req: IncomingMessage): Promise<T> {
    let text = ''
    for await (const chunk of req) text += chunk
    return (text ? JSON.parse(text) : {}) as T
  }
  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
    return true
  }

  /** Las rutas `/api/ideas/…`. Devuelve si atendió la petición. */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/api/ideas')) return false
    const post = req.method === 'POST'
    try {
      if (path === '/api/ideas' && !post) return json(res, 200, { canales: canales(), trabajando: [...trabajos.values()].filter((t) => t.estado === 'trabajando').map((t) => t.canalId) })
      if (path === '/api/ideas/canales' && post) return json(res, 200, guardarCanal(await body<Partial<Canal>>(req)))
      if (path === '/api/ideas/entrevista' && post) {
        const { canalId, campo, formato, ...eleccion } = await body<Eleccion & { canalId?: string; campo?: string; formato?: Canal['formato'] }>(req)
        return json(res, 200, entrevistar(canalId, campo, eleccion, formato))
      }

      // La portada de un video vertical, bajada al investigar: las de TikTok e Instagram caducan en un día.
      const p = /^\/api\/ideas\/([\w-]+)\/portada\/([\w-]+)$/.exec(path)
      if (p && !post) {
        const archivo = join(carpeta(p[1]), 'portadas', `${p[2]}.jpg`)
        if (!existsSync(archivo)) return json(res, 404, { error: 'Sin portada.' })
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'max-age=86400' })
        res.end(readFileSync(archivo))
        return true
      }

      const m = /^\/api\/ideas\/([\w-]+)(?:\/(\w+))?$/.exec(path)
      if (!m) return false
      const [, id, accion] = m
      if (!existsSync(join(carpeta(id), 'canal.json'))) return json(res, 404, { error: 'No existe ese canal.' })
      if (!accion && !post) return json(res, 200, completo(id))

      if (accion === 'hilo' && !post) {
        const h = estado(id).hilos.at(-1)
        return json(res, 200, h ? enVivo(h) : null)
      }
      // Las cuentas de investigación de TikTok e Instagram: con quién está cada sesión, sin abrir su navegador.
      if (accion === 'tiktok' && !post) return json(res, 200, await cuentaInvestigacion())
      if (!post) return false

      // Su ventana, en la red que se pida (`{ red }`; sin ella, TikTok).
      if (accion === 'navegador') {
        const { red } = await body<{ red?: string }>(req)
        return await abrirInvestigacion(app, red === 'instagram' ? 'instagram' : 'tiktok'), json(res, 200, { ok: true })
      }
      if (accion === 'investigar') return empezarInvestigacion(id), json(res, 200, { ok: true })
      if (accion === 'detener') return paradas.get(id)?.abort(), json(res, 200, { ok: true })
      if (accion === 'proponer') {
        const { nota, ...eleccion } = await body<Eleccion & { nota?: string }>(req)
        return json(res, 200, proponer(id, eleccion, nota))
      }
      if (accion === 'rendimiento') return await medir(id), json(res, 200, { ok: true })
      if (accion === 'diagnosticar') return json(res, 200, await diagnosticar(id, await body<Eleccion>(req)))
      if (accion === 'preparar') {
        const { ideaId, ...eleccion } = await body<Eleccion & { ideaId: string }>(req)
        return json(res, 200, preparar(id, ideaId, eleccion))
      }
      if (accion === 'recuperar') {
        const { vuelta, ideaId } = await body<{ vuelta: string; ideaId: string }>(req)
        recuperar(id, vuelta, ideaId)
        return json(res, 200, { ok: true })
      }
      if (accion === 'elegir') {
        const { ideaId, estado: nuevo, cardId } = await body<{ ideaId: string; estado: IdeaElegida['estado'] | null; cardId?: string }>(req)
        const e = estado(id)
        const hilos = e.elegidas[ideaId]?.hilos ?? []
        if (nuevo === 'elegida' && cardId) {
          // «Hacer con…»: la card espera su hilo, que llega al mandar el borrador. Pulsarla otra vez no suma otra espera.
          const esperando = hilos.find((h) => !h.id && h.cardId === cardId)
          if (esperando) esperando.en = Date.now()
          else hilos.push({ cardId, en: Date.now() })
          e.elegidas[ideaId] = { estado: nuevo, en: Date.now(), hilos }
        } else if (nuevo) e.elegidas[ideaId] = { estado: nuevo, en: Date.now(), hilos }
        // «Recuperarla»: si ya salió algún hilo de ella, vuelve a elegida; si no, a como estaba.
        else if (hilos.length) e.elegidas[ideaId] = { estado: 'elegida', en: Date.now(), hilos }
        else delete e.elegidas[ideaId]
        escribir(id, 'estado.json', e)
        avisar({ type: 'ideas', canalId: id })
        return json(res, 200, e.elegidas)
      }
      if (accion === 'borrar') {
        if (trabajos.get(id)?.estado === 'trabajando') return json(res, 409, { error: 'Está investigando: detenlo antes de borrar el canal.' })
        // Cualquier hilo que escriba en su carpeta, no solo la investigación: borrarla le quitaría el suelo.
        const ocupado = activos(id)[0]
        if (ocupado) return json(res, 409, { error: `Claude está trabajando en este canal («${ocupado.title}»): espera a que termine, o detenlo, antes de borrarlo.` })
        trabajos.delete(id)
        rmSync(carpeta(id), { recursive: true, force: true })
        return json(res, 200, { ok: true })
      }
      return false
    } catch (e) {
      return json(res, 400, { error: mensaje(e) })
    }
  }

  /** Si se está investigando algún canal, por qué: un reinicio la cortaría. «Reiniciar backend» espera a que termine. */
  function ocupado(): string | null {
    const t = [...trabajos.values()].find((t) => t.estado === 'trabajando')
    return t ? `Se está investigando en Ideas («${leer<Canal>(t.canalId, 'canal.json')?.nombre ?? t.canalId}»). Espera a que termine, o detenla.` : null
  }

  return { api, ocupado }
}
