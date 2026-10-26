import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AgentEvent } from '../../shared/types'
import { useEventos } from './eventos'
import { Icon } from './Composer'
import { DESIGN, DESIGN_ICON, LINK, LINK_ICON, linkParts, pedirMejora, QUOTE, QUOTE_EVENT, QUOTE_ICON, quoteText, THREAD, THREAD_ICON, threadIconOf } from './etiquetas'
import { MarcaClaude } from './Logos'
import { imageUrl, Thumbs } from './Images'
import { buildTimeline, compact, delHilo, duration, errorLlano, REINTENTAR, toolSummary, type Item, type Subagente } from './items'
import { bloquesDeMarkdown } from './markdown'
import { BarraSubagente, FilaSubagente, GrupoSubagentes } from './Subagentes'

/** Una ruta del disco: `C:\…` en Windows; en Mac y Linux, de las carpetas de la gente (no `/api/…` y parecidas). */
const RUTA = /^([A-Za-z]:[\\/]|\/(Users|home|Volumes|media|mnt|tmp)\/)/

/** Clic en «Copiar» copia su bloque; clic en una ruta del disco (en `código`) la abre en el Explorador o el Finder. */
function onMarkdownClick(e: React.MouseEvent) {
  const el = e.target as HTMLElement
  if (el.classList.contains('copy')) {
    const code = el.parentElement?.querySelector('code')?.textContent ?? ''
    navigator.clipboard.writeText(code.replace(/\n$/, '')).then(() => {
      el.textContent = 'Copiado'
      setTimeout(() => (el.textContent = 'Copiar'), 1500)
    })
    return
  }
  if (el.tagName !== 'CODE') return
  const text = el.textContent?.trim() ?? ''
  if (!RUTA.test(text) || text.includes('\n')) return
  fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: text }) })
}

/**
 * El texto del agente, bloque a bloque (`bloquesDeMarkdown`). Mientras escribe solo cambia el último: los demás se quedan
 * en la página tal cual, sin volver a armarlos ni a medirlos, y lo que tengas seleccionado en ellos sigue seleccionado.
 * Van sin envoltorio, como si fueran un solo HTML (el CSS mira a los hijos de `.md`).
 */
const Markdown = memo(function Markdown({ text }: { text: string }) {
  const caja = useRef<HTMLDivElement>(null)
  const pintados = useRef<{ html: string; nodos: ChildNode[] }[]>([])
  // Cada bloque de código lleva su botón «Copiar», fuera del <pre> para que no se desplace con él.
  const bloques = useMemo(
    () =>
      bloquesDeMarkdown(text).map((html) =>
        html.replaceAll('<pre>', '<div class="code-block"><button class="copy" type="button">Copiar</button><pre>').replaceAll('</pre>', '</pre></div>')
      ),
    [text]
  )
  useLayoutEffect(() => {
    const el = caja.current!
    const antes = pintados.current
    let k = 0
    while (k < antes.length && k < bloques.length && antes[k].html === bloques[k]) k++
    for (const b of antes.slice(k)) for (const n of b.nodos) n.remove()
    const nuevos = bloques.slice(k).map((html) => {
      // Como `innerHTML`: lo de un <template> no se ejecuta al ponerlo (y markdown.ts ya no deja pasar HTML crudo).
      const t = document.createElement('template')
      t.innerHTML = html
      const nodos = [...t.content.childNodes]
      el.append(t.content)
      return { html, nodos }
    })
    pintados.current = [...antes.slice(0, k), ...nuevos]
  }, [bloques])
  return <div className="md" ref={caja} onClick={onMarkdownClick} />
})

/** Lo que el agente hizo para llegar a su respuesta (pensar, herramientas…), plegado en una fila, como en T3 Code. */
type Trabajo = { kind: 'trabajo'; key: string; items: Item[]; vivo: boolean }

/** Una fila del chat: un bloque, los subagentes que el agente lanzó juntos, o su trabajo plegado. */
type Fila = { key: string; item: Item } | { key: string; grupo: Subagente[] } | { key: string; trabajo: Trabajo }

/** Los subagentes seguidos (los que el agente lanzó a la vez) van en un grupo, como en T3 Code. */
function enFilas(lista: (Item | Trabajo)[]): Fila[] {
  const filas: Fila[] = []
  for (const item of lista) {
    if (item.kind === 'trabajo') {
      filas.push({ key: item.key, trabajo: item })
      continue
    }
    const s = item.kind === 'tool' ? item.subagente : undefined
    const previa = filas.at(-1)
    const otro = previa && 'item' in previa && previa.item.kind === 'tool' ? previa.item.subagente : undefined
    if (s && previa && 'grupo' in previa) previa.grupo.push(s)
    else if (s && otro) filas[filas.length - 1] = { key: previa!.key, grupo: [otro, s] }
    else filas.push({ key: item.key, item })
  }
  return filas
}

/** Lo que es trabajo y no conversación. Un subagente que sigue trabajando se ve aunque el turno haya acabado. */
const esTrabajo = (i: Item, acabado: boolean) => i.kind === 'thinking' || (i.kind === 'text' && !!i.parent) || (i.kind === 'tool' && (!i.subagente || (acabado && i.subagente.estado !== 'running')))

/**
 * Cada turno, plegado: si acabó, todo su trabajo va en una fila y solo se ve la respuesta (el último texto). Mientras
 * trabaja, lo que dice entre medias se ve, y el trabajo de entre medias va plegado.
 * `acabado`: el último turno ya no trabaja aunque no haya llegado su fin (un hilo cortado, un subagente que acabó).
 */
function plegarTrabajo(lista: Item[], acabado: boolean): (Item | Trabajo)[] {
  const fuera: (Item | Trabajo)[] = []
  let turno: Item[] = []
  const trabajo = (items: Item[], vivo = false): Trabajo[] => (items.length ? [{ kind: 'trabajo', key: `trabajo:${items[0].key}`, items, vivo }] : [])
  const cerrar = (fin: boolean) => {
    if (fin) {
      const respuesta = turno.findLast((i) => i.kind === 'text' && !i.parent && i.text.trim())
      const suyo = turno.filter((i) => i !== respuesta && esTrabajo(i, true))
      fuera.push(...trabajo(suyo), ...turno.filter((i) => !suyo.includes(i)))
    } else {
      let seguidos: Item[] = []
      for (const i of turno) {
        if (esTrabajo(i, false)) seguidos.push(i)
        else {
          fuera.push(...trabajo(seguidos), i)
          seguidos = []
        }
      }
      fuera.push(...trabajo(seguidos, true))
    }
    turno = []
  }
  for (const item of lista) {
    if (item.kind === 'user') {
      cerrar(true)
      fuera.push(item)
    } else {
      turno.push(item)
      if (item.kind === 'turn_end') cerrar(true)
    }
  }
  cerrar(acabado)
  return fuera
}

/**
 * `onResponder` le escribe al agente, como el compositor. Sin él (un video del lote que espera su turno), nada de la
 * conversación se contesta con un clic. `subagente` es el que está abierto: el chat enseña solo lo suyo y su barra. Los
 * eventos los lee él mismo (`eventos.ts`): con cada trozo del agente se vuelve a dibujar el chat y nada más, y de él solo
 * la fila que cambió (`Row` va memorizada y `buildTimeline` deja igual lo que no cambió).
 */
export function Timeline({ running, background, sessionId, proveedor = 'claude', subagente, onSubagente, onResponder }: { running: boolean; background: string[]; sessionId: string; proveedor?: string; subagente?: string; onSubagente?(id: string | null): void; onResponder?(text: string): Promise<unknown> }) {
  const events = useEventos(sessionId) ?? SIN_EVENTOS
  const items = buildTimeline(events)
  const lanzador = subagente ? items.find((i): i is Extract<Item, { kind: 'tool' }> => i.kind === 'tool' && i.id === subagente && !!i.subagente) : undefined
  const sub = lanzador?.subagente
  // Al volver de un subagente lanzado por otro, se vuelve a ese.
  const padre = lanzador?.parent && items.some((i) => i.kind === 'tool' && i.id === lanzador.parent && i.subagente) ? lanzador.parent : null
  const lista = useMemo(() => (sub ? sub.items : delHilo(items)), [items, sub])
  const filas = useMemo(() => enFilas(plegarTrabajo(lista, sub ? sub.estado !== 'running' : !running)), [lista, sub, running])
  // Solo se contesta con un clic lo último del agente, con el hilo quieto y sin nada tuyo después.
  const responder = running || sub ? undefined : onResponder
  const tuyo = lista.findLastIndex((i) => i.kind === 'user')
  const contestables = new Set([lista.findLastIndex((i) => i.kind === 'text' && !i.parent), lista.findLastIndex((i) => i.kind === 'turn_end')].filter((n) => n > tuyo).map((n) => lista[n].key))
  // Los que siguen en segundo plano se abren desde su nombre.
  const porTitulo = useMemo(() => new Map(items.flatMap((i) => (i.kind === 'tool' && i.subagente ? [[i.subagente.titulo, i.id] as const] : []))), [items])
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const [cita, setCita] = useState<{ text: string; x: number; y: number } | null>(null)
  const [visibles, setVisibles] = useState(60)
  const ancla = useRef<{ alto: number; top: number } | null>(null)
  // Dónde estabas en el hilo al abrir un subagente, para volver ahí.
  const vuelta = useRef<{ top: number; visibles: number } | null>(null)
  // Los grupos de subagentes que abriste: siguen abiertos al volver de uno.
  const [desplegados, setDesplegados] = useState<ReadonlySet<string>>(new Set())
  const desde = Math.max(0, filas.length - visibles)

  useEffect(() => { setVisibles(60); stick.current = true; setCita(null) }, [sessionId])
  // Si el subagente abierto ya no está en el hilo, vuelve el hilo (y con él, el compositor).
  useEffect(() => { if (subagente && !sub) onSubagente?.(null) }, [subagente, sub, onSubagente])

  function abrir(id: string | null) {
    const el = scroller.current
    if (id && !sub && el) vuelta.current = { top: el.scrollTop, visibles }
    // Un subagente se abre por el final, donde va; el hilo vuelve a donde estabas.
    stick.current = !!id || !vuelta.current
    setVisibles(id ? 60 : vuelta.current?.visibles ?? 60)
    setCita(null)
    onSubagente?.(id)
  }
  // Siempre la misma función para las filas memorizadas, y con lo de ahora.
  const alAbrir = useRef(abrir)
  alAbrir.current = abrir
  const onAbrir = useCallback((id: string | null) => alAbrir.current(id), [])

  // Como en T3 Code: al soltar el ratón sobre texto elegido de la conversación, sale «Citar» junto al final, y a su lado el
  // símbolo de Claude, que pide una mejora sobre lo elegido.
  function elegir() {
    const sel = getSelection()
    const text = sel?.toString().trim()
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (!text || !range || sel!.isCollapsed || !scroller.current?.contains(range.commonAncestorContainer)) return setCita(null)
    const rects = range.getClientRects()
    const end = rects[rects.length - 1] ?? range.getBoundingClientRect()
    setCita({ text, x: Math.min(end.right, innerWidth - (sessionId ? 230 : 90)), y: Math.min(end.bottom + 6, innerHeight - 40) })
  }

  // Si la selección desaparece (clic en otro sitio, Escape), el botón también.
  useEffect(() => {
    if (!cita) return
    const gone = () => getSelection()?.isCollapsed && setCita(null)
    document.addEventListener('selectionchange', gone)
    return () => document.removeEventListener('selectionchange', gone)
  }, [cita])

  // Se queda pegada abajo mientras el agente escribe, salvo que subas a leer. Al volver de un subagente, donde estabas.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (!sub && vuelta.current) {
      el.scrollTop = vuelta.current.top
      vuelta.current = null
    } else if (ancla.current) {
      el.scrollTop = ancla.current.top + el.scrollHeight - ancla.current.alto
      ancla.current = null
    } else if (stick.current) el.scrollTop = el.scrollHeight
  }, [lista, visibles])

  const plegar = (key: string) => (abierto: boolean) =>
    setDesplegados((antes) => {
      const ahora = new Set(antes)
      if (abierto) ahora.add(key)
      else ahora.delete(key)
      return ahora
    })

  function pintar(fila: Fila): React.ReactNode {
    if ('trabajo' in fila) return <PlegadoTrabajo key={fila.key} t={fila.trabajo} abierto={desplegados.has(fila.key)} onPlegar={plegar(fila.key)} pintar={pintar} />
    if ('grupo' in fila) return <GrupoSubagentes key={fila.key} subs={fila.grupo} proveedor={proveedor} abierto={desplegados.has(fila.key)} onPlegar={plegar(fila.key)} onAbrir={onAbrir} />
    return <Row key={fila.key} item={fila.item} sessionId={sessionId} anidado={!sub && 'parent' in fila.item && !!fila.item.parent} proveedor={proveedor} onAbrir={onAbrir} onResponder={contestables.has(fila.key) ? responder : undefined} />
  }

  return (
    <>
      <div
        className="timeline"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          setCita(null)
        }}
        // Tras un doble o triple clic la selección se asienta un instante después de soltar.
        onPointerUp={() => setTimeout(elegir)}
        onKeyUp={(e) => e.shiftKey && elegir()}
      >
        <div className="timeline-inner">
          {sub && <Encargo s={sub} />}
          {desde > 0 && <button className="link small" onClick={() => {
            const el = scroller.current
            if (el) ancla.current = { alto: el.scrollHeight, top: el.scrollTop }
            stick.current = false
            setVisibles((n) => n + 60)
          }}>Ver mensajes anteriores</button>}
          {filas.slice(desde).map(pintar)}
          {sub?.estado === 'running' && !lista.length && (
            <div className="working">
              <span className="spinner" /> Empezando…
            </div>
          )}
          {!sub && running && <Working since={lastTurnStart(events)} />}
          {!sub && !running && background.length > 0 && (
            <div className="working">
              <span className="spinner" />
              <span>
                En segundo plano ·{' '}
                {background.map((tarea, i) => (
                  <Fragment key={i}>
                    {i > 0 && ' · '}
                    {porTitulo.has(tarea) ? <button className="link" onClick={() => abrir(porTitulo.get(tarea)!)}>{tarea}</button> : tarea}
                  </Fragment>
                ))}
              </span>
            </div>
          )}
        </div>
        {cita && (
          // Que el clic no se lleve la selección antes de leerla.
          <div className="cite-bar" style={{ left: cita.x, top: cita.y }} onPointerDown={(e) => e.preventDefault()}>
            <button
              className="cite-btn"
              onClick={() => {
                getSelection()?.removeAllRanges()
                setCita(null)
                dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: cita.text }))
                // La cita va al compositor, que es del hilo.
                if (sub) abrir(null)
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d={QUOTE_ICON} />
              </svg>
              Citar
            </button>
            {sessionId && (
              <button
                className="cite-btn"
                title="Pide una mejora a Sloth sobre esto; Claude te ayuda a decirla"
                onClick={() => {
                  getSelection()?.removeAllRanges()
                  setCita(null)
                  pedirMejora({ hilo: sessionId, cita: cita.text })
                }}
              >
                <MarcaClaude />
                Pedir mejora
              </button>
            )}
          </div>
        )}
      </div>
      {sub && <BarraSubagente s={sub} proveedor={proveedor} onVolver={() => abrir(padre)} />}
    </>
  )
}

/** El trabajo de un turno en una fila, siempre plegada: cuántos pasos dio, y abierta, cada uno. */
function PlegadoTrabajo({ t, abierto, onPlegar, pintar }: { t: Trabajo; abierto: boolean; onPlegar(abierto: boolean): void; pintar(fila: Fila): React.ReactNode }) {
  const pasos = t.items.filter((i) => i.kind !== 'thinking' || i.text.trim())
  if (!pasos.length) return null
  const filas = enFilas(pasos)
  const n = `${pasos.length} ${pasos.length === 1 ? 'paso' : 'pasos'}`
  return (
    <div className="pasos">
      <button className="link pasos-cabeza" aria-expanded={abierto} onClick={() => onPlegar(!abierto)}>
        <span className="pasos-flecha">›</span>
        {t.vivo ? n : `Trabajó · ${n}`}
      </button>
      {abierto && <div className="pasos-lista">{filas.map(pintar)}</div>}
    </div>
  )
}

/**
 * Arriba de un subagente abierto: cuál es y lo que le encargó el agente, como el primer mensaje de su conversación. Un
 * encargo largo se ve plegado.
 */
function Encargo({ s }: { s: Subagente }) {
  const [todo, setTodo] = useState(false)
  const largo = s.encargo.length > 600
  return (
    <>
      <div className="sub-cabeza">
        <b>{s.titulo}</b>
        <span className="muted small">Subagente</span>
      </div>
      {s.encargo && (
        <div className="user-msg">
          <span className="muted small">Lo que le encargó el agente</span>
          <div className={`bubble sub-encargo ${largo && !todo ? 'plegado' : ''}`}>
            <Markdown text={s.encargo} />
          </div>
          {largo && (
            <button className="link small" onClick={() => setTodo(!todo)}>
              {todo ? 'Ver menos' : 'Ver todo el encargo'}
            </button>
          )}
        </div>
      )}
    </>
  )
}

const SIN_EVENTOS: AgentEvent[] = []

function lastTurnStart(events: AgentEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.t === 'turn_start') return e.at
  }
  return Date.now()
}

function Working({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="working">
      <span className="spinner" /> Trabajando · {duration(now - since)}
    </div>
  )
}

/** Un archivo adjunto viaja como su ruta entre comillas; en la burbuja se ve otra vez como etiqueta. */
const FILE = /"([^"]*[\\/]data[\\/]attachments[\\/](?:\d+-)?([^"\\/]+))"/

/** El encargo de crear una skill: en la burbuja se ve otra vez como la etiqueta «Nuevo diseño». */
function WithDesign({ text }: { text: string }) {
  if (!text.startsWith(DESIGN)) return <WithQuotes text={text} />
  return (
    <>
      <span className="chip design-chip" title={DESIGN}>
        <svg className="chip-icon" viewBox="0 0 24 24">
          <path d={DESIGN_ICON} />
        </svg>
        <span className="chip-name">Nuevo diseño</span>
      </span>
      <WithQuotes text={text.slice(DESIGN.length)} />
    </>
  )
}

/** Cada cita del chat: en la burbuja se ve otra vez como la etiqueta del compositor, con el texto entero al pasar el ratón. */
function WithQuotes({ text }: { text: string }) {
  // `split` con un grupo deja: texto, cita, texto, cita…
  return text.split(new RegExp(QUOTE, 'g')).map((part, i) => {
    if (i % 2 === 0) return <WithThreads key={i} text={part} />
    const quote = quoteText(part)
    return (
      <span key={i} className="chip quote-chip" title={quote}>
        <svg className="chip-icon" viewBox="0 0 24 24">
          <path d={QUOTE_ICON} />
        </svg>
        <span className="chip-name">{quote.replace(/\s+/g, ' ')}</span>
      </span>
    )
  })
}

/** Lo mismo con la referencia a otro hilo: en la burbuja se ve como la etiqueta que se pegó. */
function WithThreads({ text }: { text: string }) {
  // `split` con un grupo deja: texto, título, texto, título…
  const refs = text.match(new RegExp(THREAD, 'g')) ?? []
  return text.split(new RegExp(THREAD, 'g')).map((part, i) => {
    if (i % 2 === 0) return <WithFiles key={i} text={part} />
    const ref = refs[(i - 1) / 2]
    const icon = threadIconOf(ref)
    return (
      <span key={i} className="chip" title={ref}>
        {icon ? (
          <span className="chip-emoji">
            <Icon icon={icon} />
          </span>
        ) : (
          <svg className="chip-icon" viewBox="0 0 24 24">
            <path d={THREAD_ICON} />
          </svg>
        )}
        <span className="chip-name">{part}</span>
      </span>
    )
  })
}

function WithFiles({ text }: { text: string }) {
  // `split` con dos grupos deja: texto, ruta, nombre, texto, ruta, nombre…
  const parts = text.split(new RegExp(FILE, 'g'))
  return parts.map((part, i) =>
    i % 3 === 0 ? (
      <WithLinks key={i} text={part} />
    ) : i % 3 === 2 ? (
      <span key={i} className="chip" title={parts[i - 1]}>
        <b className="ext">{/\.(\w{1,5})$/.exec(part)?.[1]?.toUpperCase() ?? 'ARCHIVO'}</b>
        <span className="chip-name">{part}</span>
      </span>
    ) : null,
  )
}

/** Y cada enlace: la misma etiqueta que en el compositor, y se abre en otra pestaña. */
function WithLinks({ text }: { text: string }) {
  const links = text.match(new RegExp(LINK, 'g')) ?? []
  return text.split(new RegExp(LINK, 'g')).flatMap((part, i) => {
    if (i >= links.length) return [part]
    const [host, rest] = linkParts(links[i])
    return [
      part,
      <a key={i} className="chip link-chip" href={links[i]} target="_blank" rel="noreferrer" title={links[i]}>
        <svg className="chip-icon" viewBox="0 0 24 24">
          <path d={LINK_ICON} />
        </svg>
        <span className="chip-name">
          {host}
          <small>{rest}</small>
        </span>
      </a>,
    ]
  })
}

/**
 * `anidado`: lo de un subagente que no se sabe cuál es, suelto en el hilo, va sangrado. Memorizada: mientras el agente
 * escribe, solo se vuelve a dibujar la fila que crece.
 */
const Row = memo(function Row({ item, sessionId, anidado, proveedor, onAbrir, onResponder }: { item: Item; sessionId?: string; anidado: boolean; proveedor: string; onAbrir(id: string): void; onResponder?(text: string): Promise<unknown> }) {
  const nested = anidado ? 'nested' : ''
  switch (item.kind) {
    case 'user':
      return (
        <div className="user-msg">
          <div className="bubble">
            <Thumbs images={item.images.map((path) => ({ path, src: imageUrl(path) }))} />
            <WithDesign text={item.text} />
          </div>
        </div>
      )
    case 'text':
      return (
        <div className={`assistant ${nested}`}>
          <Markdown text={item.text} />
          {item.opciones && <Respuestas opciones={item.opciones} onElegir={onResponder} />}
        </div>
      )
    case 'thinking':
      return <Thinking text={item.text} nested={nested} />
    case 'tool':
      if (item.subagente) return <FilaSubagente s={item.subagente} proveedor={proveedor} onAbrir={onAbrir} />
      return <Tool item={item} nested={nested} sessionId={sessionId} />
    case 'turn_end': {
      const datos = `${item.ms > 0 ? ` · ${duration(item.ms)}` : ''}${item.costUsd ? ` · $${item.costUsd.toFixed(2)}` : ''}`
      // Es lo que se sabe: el agente acabó su turno. El trabajo puede seguir esperando tu voz, una revisión o la exportación.
      if (item.ok) return <div className="turn-end">Turno terminado{datos}</div>
      return <Fallo item={item} datos={datos} sessionId={sessionId} onResponder={onResponder} />
    }
    case 'info':
      return <div className="info">{item.text}</div>
  }
})

/**
 * Las respuestas que el agente propuso a su pregunta, un botón por cada una. Pulsar una le manda su texto, como si lo
 * escribieras. Sin `onElegir` (una pregunta que ya pasó, o el agente trabaja) se ven, pero no se pulsan.
 */
function Respuestas({ opciones, onElegir }: { opciones: string[]; onElegir?(text: string): Promise<unknown> }) {
  const [elegida, setElegida] = useState<string>()
  const [fallo, setFallo] = useState('')
  return (
    <div className="respuestas">
      {opciones.map((o, i) => (
        <button
          key={i}
          className={o === elegida ? 'on' : ''}
          disabled={!onElegir || elegida !== undefined}
          onClick={() => {
            setElegida(o)
            setFallo('')
            onElegir?.(o).catch((e) => (setElegida(undefined), setFallo(e instanceof Error ? e.message : String(e))))
          }}
        >
          {o}
        </button>
      ))}
      {fallo && <span className="bad small">{fallo}</span>}
    </div>
  )
}

/**
 * Un turno que acabó mal, dicho en llano; el error tal cual, al pasar el ratón. El último, con el hilo quieto
 * (`onResponder`), dice además qué hacer y deja «Reintentar», que le pide que siga donde se quedó. Todos llevan el símbolo
 * de Claude, que pide una mejora con el error para que no vuelva a pasar.
 */
function Fallo({ item, datos, sessionId, onResponder }: { item: Extract<Item, { kind: 'turn_end' }>; datos: string; sessionId?: string; onResponder?(text: string): Promise<unknown> }) {
  const e = errorLlano(item.error, item.caida)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState('')
  return (
    <>
      <div className={`turn-end ${e.tuyo ? '' : 'bad'}`} title={item.error}>
        {e.titulo}
        {datos}
        {sessionId && (
          <button className="pedir-mejora" title="Pide una mejora para que esto no vuelva a pasar; Claude te ayuda a decirla" onClick={() => pedirMejora({ hilo: sessionId, cita: [e.titulo, item.error].filter((t, i): t is string => !!t && (i === 0 || !e.titulo.toLowerCase().includes(t.toLowerCase()))).join('\n') })}>
            <MarcaClaude />
            Pedir mejora
          </button>
        )}
      </div>
      {onResponder && (
        <div className="turn-ayuda">
          <span className={fallo ? 'bad' : ''}>{fallo || e.ayuda}</span>
          {e.reintentar && (
            <button
              className="primary"
              disabled={enviando}
              onClick={() => {
                setEnviando(true)
                setFallo('')
                onResponder(REINTENTAR).catch((err) => (setEnviando(false), setFallo(err instanceof Error ? err.message : String(err))))
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}
    </>
  )
}

export function Thinking({ text, nested = '' }: { text: string; nested?: string }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  return (
    <div className={`thinking ${nested}`}>
      <button className="link thinking-row" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'} Pensando</span>
        {!open && <span className="thinking-peek">{text.trim().split('\n').at(-1)}</span>}
      </button>
      {open && <Markdown text={text} />}
    </div>
  )
}

/** Las herramientas que de verdad llegan (14.959 llamadas en los hilos de Sloth). Las demás llevan el engranaje. */
const ICONS: Record<string, string> = {
  Bash: '›_',
  PowerShell: '›_',
  Read: '◔',
  Write: '✎',
  Edit: '✎',
  Grep: '⌕',
  WebSearch: '◍',
  WebFetch: '◍',
  Skill: '✦',
  Agent: '◈',
  SendMessage: '◈',
  TaskStop: '■',
  Monitor: '◉',
  ScheduleWakeup: '◷',
  ToolSearch: '⊕'
}

function Tool({ item, nested, sessionId }: { item: Extract<Item, { kind: 'tool' }>; nested: string; sessionId?: string }) {
  const [open, setOpen] = useState(false)
  // Una imagen que el agente lee (una captura, un recorte, una hoja de cuadros) se ve aquí: es lo que está mirando.
  const ruta = item.name === 'Read' && typeof item.input?.file_path === 'string' ? (item.input.file_path as string) : ''
  const imagen = sessionId && /\.(png|jpe?g|gif|webp)$/i.test(ruta) ? `/api/sessions/${sessionId}/imagen?ruta=${encodeURIComponent(ruta)}` : ''
  const { verb, detail } = toolSummary(item.name, item.input)
  const state = !item.done ? 'running' : item.error ? 'error' : 'ok'

  return (
    <div className={`tool ${state} ${nested}`}>
      <button className="tool-row" onClick={() => setOpen(!open)}>
        <span className="tool-icon">{ICONS[item.name] ?? '⚙'}</span>
        <span className="tool-verb">{verb}</span>
        <span className="tool-detail">{detail}</span>
        <span className={`dot ${state}`} />
      </button>
      {imagen && <Mirada src={imagen} />}
      {open && (
        <div className="tool-body">
          <pre className="tool-input">{typeof item.input === 'string' ? item.input : JSON.stringify(item.input, null, 2)}</pre>
          {item.output && <Output text={item.output} />}
        </div>
      )}
    </div>
  )
}

/** La imagen que miró el agente, entera y en pequeño; clic la amplía. Si el servidor aún no la sirve, no se ve nada. */
function Mirada({ src }: { src: string }) {
  const [grande, setGrande] = useState(false)
  const [falla, setFalla] = useState(false)
  useEffect(() => {
    if (!grande) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setGrande(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [grande])
  if (falla) return null
  return (
    <>
      <button className="tool-mirada" title="Ampliar" onClick={() => setGrande(true)}>
        <img src={src} alt="" loading="lazy" onError={() => setFalla(true)} />
      </button>
      {grande && (
        <div className="lightbox" onClick={() => setGrande(false)}>
          <img src={src} alt="" />
        </div>
      )}
    </>
  )
}

function Output({ text }: { text: string }) {
  const [all, setAll] = useState(false)
  const LIMIT = 6000
  const shown = all || text.length <= LIMIT ? text : text.slice(0, LIMIT)
  return (
    <>
      <pre className="tool-output">{shown}</pre>
      {shown.length < text.length && (
        <button className="link small" onClick={() => setAll(true)}>
          Ver todo ({compact(text.length)} caracteres)
        </button>
      )}
    </>
  )
}
