import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Model } from '../../shared/types'
import { proveedorDe } from '../../shared/providers'
import { imageUrl, Thumbs, type Attached } from './Images'
import { compact } from './items'
import { esIcono, Icono } from './Iconos'
import { LimitesContexto } from './LimitesContexto'
import { invocacion, LINK, LINK_ICON, linkParts, QUOTE_EVENT, QUOTE_ICON, quoteRef, THREAD, THREAD_ICON, threadIconOf } from './etiquetas'

/**
 * El aviso con el que el inicio le pasa al compositor lo que se soltó fuera de él (`Soltar.tsx`): los archivos y el texto
 * (un enlace). Le pasa lo mismo que si se hubiera soltado encima.
 */
export const SOLTAR_EVENT = 'sloth:soltar'
export type Soltado = { files: File[]; texto: string }

/**
 * Si lo que se arrastra salió de esta misma página (un texto del campo, la imagen de una card): eso no se adjunta. Solo
 * lo de esta página dispara `dragstart`. Se olvida con `dragend` o, si lo arrastrado ya no está en la página para
 * avisarlo, después de soltarlo.
 */
let deAqui = false
addEventListener('dragstart', () => (deAqui = true), true)
addEventListener('dragend', () => (deAqui = false), true)
addEventListener('drop', () => setTimeout(() => (deAqui = false)), true)
export const desdeFuera = () => !deAqui

/** Lo que trae algo soltado: sus archivos o, si no trae, el enlace o el texto. Se lee durante el `drop`, después ya no está. */
export function soltado(dt: DataTransfer): Soltado {
  const files = Array.from(dt.files)
  // `text/uri-list` lleva un enlace por línea, y comentarios con `#`.
  const enlaces = dt.getData('text/uri-list').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
  return { files, texto: files.length ? '' : enlaces.join(' ') || dt.getData('text/plain') }
}

/** Lo escrito en el campo sin mandar: el HTML con sus etiquetas, el texto que saldría y las imágenes subidas. */
export interface Draft {
  html: string
  text: string
  images: (Attached & { chip: boolean })[]
}

export interface Choice {
  model: string
  effort?: string
}

/** Los desplegables separan las dos familias para encontrar cada modelo de un vistazo. */
export function gruposModelos(models: Model[]) {
  return [
    { id: 'claude', label: 'Anthropic' },
    { id: 'codex', label: 'OpenAI' },
  ].map((p) => ({
    label: p.label,
    options: models.filter((m) => proveedorDe(m.id) === p.id).map((m) => ({ value: m.id, label: m.label })),
  })).filter((g) => g.options.length > 0)
}

/** Las que Claude sabe leer. */
const IMAGE = /^image\/(png|jpeg|gif|webp)$/

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}


/** El icono de una card: una imagen (`/icon.svg`), el nombre de un icono de trazo (`Iconos.tsx`) o un emoji de las de antes. */
export const Icon = ({ icon }: { icon: string }) =>
  icon.startsWith('/') ? <img className="icon-img" src={icon} alt="" /> : esIcono(icon) ? <Icono de={icon} className="icon-trazo" /> : <>{icon}</>

/**
 * El texto del campo, sin las etiquetas de imagen: las imágenes viajan aparte. La etiqueta de un archivo se vuelve su
 * ruta entre comillas, para que el agente la abra aunque tenga espacios; la de un hilo, su referencia entera.
 */
function read(el: Node): string {
  let out = ''
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.textContent
    else if (n instanceof HTMLElement && n.dataset.path !== undefined) out += `"${n.dataset.path}"`
    else if (n instanceof HTMLElement && n.dataset.ref !== undefined) out += n.dataset.ref
    else if (n instanceof HTMLElement && !n.dataset.src) {
      if (n.tagName === 'BR') out += '\n'
      else out += (n.tagName === 'DIV' && out && !out.endsWith('\n') ? '\n' : '') + read(n)
    }
  })
  return out
}

/** Marca la invocación sin cambiar el texto enviado ni perder el cursor al seguir escribiendo. */
function etiquetarInvocacion(el: HTMLElement) {
  const sel = getSelection()
  const rango = sel?.rangeCount ? sel.getRangeAt(0) : undefined
  const dentro = rango && el.contains(rango.startContainer) && el.contains(rango.endContainer)
  const posicion = (node: Node, offset: number) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    r.setEnd(node, offset)
    return r.toString().length
  }
  const cursor = dentro ? [posicion(rango.startContainer, rango.startOffset), posicion(rango.endContainer, rango.endOffset)] : undefined

  // Chromium puede conservar el estilo de una etiqueta borrada como <font>/<span style>. El campo sigue siendo plano.
  el.querySelectorAll<HTMLElement>('font, span[style], b').forEach((n) => {
    if (!n.closest('.chip')) n.replaceWith(...n.childNodes)
  })
  el.normalize()
  const anterior = el.querySelector<HTMLElement>('.invocacion-chip')
  const primero = el.firstChild
  const texto = primero?.textContent ?? ''
  const comando = invocacion(texto)
  if (anterior === primero && comando?.nombre === texto && anterior?.dataset.tipo === comando.tipo) return
  if (anterior) anterior.replaceWith(...anterior.childNodes)
  el.normalize()
  const nodo = el.firstChild
  const actual = nodo?.nodeType === Node.TEXT_NODE ? invocacion(nodo.textContent ?? '') : undefined
  if (actual && nodo) {
    const r = document.createRange()
    r.setStart(nodo, actual.inicio)
    r.setEnd(nodo, actual.inicio + actual.nombre.length)
    const etiqueta = document.createElement('span')
    etiqueta.className = 'chip invocacion-chip'
    etiqueta.dataset.tipo = actual.tipo
    etiqueta.title = `${actual.tipo}: ${actual.nombre}`
    r.surroundContents(etiqueta)
    // surroundContents deja un nodo vacío delante si la invocación empieza en el primer carácter.
    if (!el.firstChild?.textContent) el.firstChild?.remove()
  }

  if (cursor && sel) {
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(true)
    for (const [i, offset] of cursor.entries()) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let restante = offset
      let n = walker.nextNode()
      while (n && restante > (n.textContent?.length ?? 0)) {
        restante -= n.textContent?.length ?? 0
        n = walker.nextNode()
      }
      if (n) {
        if (i === 0) r.setStart(n, restante)
        else r.setEnd(n, restante)
      }
    }
    sel.removeAllRanges()
    sel.addRange(r)
  }
}

/** La etiqueta de una imagen dentro del texto, como en T3 Code: miniatura, nombre y peso. Se borra como una letra. */
function chip(file: File, src: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'chip'
  el.contentEditable = 'false'
  el.dataset.src = src
  const img = document.createElement('img')
  img.src = src
  const small = document.createElement('small')
  small.textContent = size(file.size)
  el.append(img, file.name || 'imagen.png', small)
  return el
}

/** La etiqueta de cualquier otro archivo: extensión, nombre y peso. Su ruta se pone al terminar de subir. */
function fileChip(file: File): HTMLElement {
  const el = document.createElement('span')
  el.className = 'chip'
  el.contentEditable = 'false'
  el.dataset.path = ''
  const ext = document.createElement('b')
  ext.className = 'ext'
  ext.textContent = (/\.(\w{1,5})$/.exec(file.name)?.[1] ?? 'archivo').toUpperCase()
  const small = document.createElement('small')
  small.textContent = size(file.size)
  el.append(ext, file.name, small)
  return el
}

/** La etiqueta de un hilo pegado: icono de su card y título. Guarda la referencia entera, que es lo que se manda. */
function threadChip(ref: string, title: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'chip'
  el.contentEditable = 'false'
  el.dataset.ref = ref
  el.title = ref
  const icon = threadIconOf(ref)
  el.innerHTML = `${icon ? '<span class="chip-emoji"></span>' : `<svg class="chip-icon" viewBox="0 0 24 24"><path d="${THREAD_ICON}"/></svg>`}<span class="chip-name"></span>`
  if (icon?.startsWith('/')) el.querySelector('.chip-emoji')!.innerHTML = `<img class="icon-img" src="${icon}" alt="" />`
  else if (icon) el.querySelector('.chip-emoji')!.textContent = icon
  el.querySelector('.chip-name')!.textContent = title
  return el
}

/** La etiqueta de un enlace pegado: eslabón, sitio y ruta. Guarda el enlace entero, que es lo que se manda. */
function linkChip(url: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'chip link-chip'
  el.contentEditable = 'false'
  el.dataset.ref = url
  el.title = url
  el.innerHTML = `<svg class="chip-icon" viewBox="0 0 24 24"><path d="${LINK_ICON}"/></svg><span class="chip-name"><span></span><small></small></span>`
  const [host, rest] = linkParts(url)
  el.querySelector('.chip-name span')!.textContent = host
  el.querySelector('.chip-name small')!.textContent = rest
  return el
}

/** La etiqueta de una cita: comillas y el texto en una línea. Guarda el bloque `>` entero, que es lo que se manda. */
function quoteChip(text: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'chip quote-chip'
  el.contentEditable = 'false'
  el.dataset.ref = quoteRef(text)
  el.title = text
  el.innerHTML = `<svg class="chip-icon" viewBox="0 0 24 24"><path d="${QUOTE_ICON}"/></svg><span class="chip-name"></span>`
  el.querySelector('.chip-name')!.textContent = text.trim().replace(/\s+/g, ' ')
  return el
}

/** El texto pegado, con cada referencia a un hilo y cada enlace vueltos etiqueta. Sin ninguno, nada: pega el navegador. */
function withChips(text: string): Node[] {
  if (!new RegExp(THREAD).test(text) && !LINK.test(text)) return []
  // `split` con un grupo deja: texto, título, texto, título…; la referencia entera se recupera con `match`.
  const refs = text.match(new RegExp(THREAD, 'g')) ?? []
  return text.split(new RegExp(THREAD, 'g')).flatMap((part, i) =>
    i % 2 === 0 ? withLinks(part) : [threadChip(refs[(i - 1) / 2], part), document.createTextNode(' ')],
  )
}

function withLinks(text: string): Node[] {
  const links = text.match(new RegExp(LINK, 'g')) ?? []
  const parts = text.split(new RegExp(LINK, 'g'))
  return parts.flatMap((part, i) => [
    ...(part ? [document.createTextNode(part)] : []),
    // Un espacio tras la etiqueta solo si cierra lo pegado: ahí hace falta para que el cursor quede después.
    ...(i < links.length ? [linkChip(links[i]), ...(parts[i + 1] ? [] : [document.createTextNode(' ')])] : []),
  ])
}

/**
 * Un círculo que se llena con el contexto, con el porcentaje dentro. Cerca del tope se pone rojo: ahí el agente compacta
 * o se corta. Aunque vaya casi vacío, el arco nunca baja de un trazo que se vea. Al pasar el ratón abre una tarjeta
 * con el detalle, con la cara del menú de modelos en vez del `title` del sistema.
 */
function ContextRing({ used, max }: { used: number; max: number }) {
  const [hover, setHover] = useState(false)
  const [foco, setFoco] = useState(false)
  const abierto = hover || foco
  const [leyendo, setLeyendo] = useState(false)
  useEffect(() => {
    if (!abierto) { setLeyendo(false); return }
    const reloj = setTimeout(() => setLeyendo(true), 150)
    return () => clearTimeout(reloj)
  }, [abierto])
  const share = Math.min(1, used / max)
  const percent = Math.round(share * 100)
  const full = share > 0.85
  const r = 14
  const length = 2 * Math.PI * r
  const shown = used > 0 ? Math.max(share, 0.04) : 0
  return (
    <span className={`context-ring ${full ? 'full' : ''}`} tabIndex={0} aria-label={`Contexto: ${percent}% usado. Límites del plan al enfocar.`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}>
      <svg width="34" height="34" viewBox="0 0 34 34">
        <circle cx="17" cy="17" r={r} />
        <circle cx="17" cy="17" r={r} className="fill" strokeDasharray={length} strokeDashoffset={length * (1 - shown)} />
      </svg>
      <b>{percent}%</b>
      <span className="context-card" role="tooltip">
        <span className="picker-label">Contexto</span>
        <span className="context-figure">
          <strong>{percent}%</strong> usado
        </span>
        <span className="context-bar">
          <span style={{ width: `${shown * 100}%` }} />
        </span>
        <span className="context-numbers">
          <span>{compact(used)} de {compact(max)} tokens</span>
          <span>quedan {compact(Math.max(0, max - used))}</span>
        </span>
        {full && <span className="context-warn">Casi lleno: el agente compactará la conversación pronto.</span>}
        {leyendo && <LimitesContexto />}
      </span>
    </span>
  )
}

/**
 * Un desplegable con la cara de la app, en vez del nativo: el del sistema no se deja pintar. Se abre hacia arriba
 * (el compositor suele vivir abajo), salvo que arriba no quepa: en «Nuevo chat» el compositor está cerca del borde.
 * Se cierra al elegir, al hacer clic fuera o con Escape. También lo usa Opciones → Redes.
 */
export function Picker(props: {
  label: ReactNode
  className?: string
  menuClassName?: string
  menuWidth?: number
  /** Dentro de otro menú: sube la lista a la capa superior para que no la recorte su contenedor. */
  flotante?: boolean
  value: string
  disabled?: boolean
  groups: { label: string; options: { value: string; label: string }[] }[]
  onChange(value: string): void
}) {
  const [open, setOpen] = useState(false)
  // Hacia dónde se abre y cuánto alto le cabe; se mide al abrir.
  const [place, setPlace] = useState({ down: false, max: 360, left: 0, edge: 0, width: 280 })
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && root.current) {
      const r = root.current.getBoundingClientRect()
      const above = r.top - 16
      const below = innerHeight - r.bottom - 16
      const down = above < 360 && below > above
      const width = Math.min(props.menuWidth ?? 280, innerWidth - 24)
      setPlace({ down, max: Math.max(0, Math.min(360, down ? below : above)), left: Math.max(12, Math.min(r.left, innerWidth - width - 12)), edge: down ? r.bottom + 8 : innerHeight - r.top + 8, width })
    }
    setOpen(!open)
  }

  useLayoutEffect(() => {
    if (open && props.flotante) menu.current?.showPopover()
  }, [open, props.flotante])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus()
    }
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    // Que se vea la opción elegida aunque la lista sea larga.
    const elegido = menu.current?.querySelector<HTMLButtonElement>('.picker-option.on')
    elegido?.scrollIntoView({ block: 'nearest' })
    if (props.flotante) (elegido ?? menu.current?.querySelector<HTMLButtonElement>('.picker-option'))?.focus({ preventScroll: true })
    const mover = (e: Event) => {
      if (props.flotante && !menu.current?.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('resize', mover)
    addEventListener('scroll', mover, true)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
      removeEventListener('resize', mover)
      removeEventListener('scroll', mover, true)
    }
  }, [open, props.flotante])

  return (
    <div ref={root} className={`picker ${props.className ?? ''} ${open ? 'open' : ''}`}>
      <button className="picker-trigger" disabled={props.disabled} aria-haspopup="listbox" aria-expanded={open} onClick={toggle} onKeyDown={(e) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); toggle() }
      }}>
        {props.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={menu} popover={props.flotante ? 'manual' : undefined} className={`picker-menu ${props.menuClassName ?? ''} ${props.flotante ? 'picker-flotante' : ''} ${place.down ? 'down' : ''}`} style={{ maxHeight: place.max, ...(props.flotante ? { left: place.left, width: place.width, top: place.down ? place.edge : 'auto', bottom: place.down ? 'auto' : place.edge } : {}) }} role="listbox" onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            root.current?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus()
            return
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const opciones = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.picker-option') ?? [])
          const actual = opciones.indexOf(document.activeElement as HTMLButtonElement)
          const siguiente = e.key === 'Home' ? 0 : e.key === 'End' ? opciones.length - 1 : (actual + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length
          opciones[siguiente]?.focus()
        }}>
          {props.groups.map((g) => (
            <div key={g.label} className="picker-group">
              <span className="picker-label">{g.label}</span>
              {g.options.map((o) => (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={o.value === props.value}
                  className={`picker-option ${o.value === props.value ? 'on' : ''}`}
                  onClick={() => {
                    setOpen(false)
                    if (o.value !== props.value) props.onChange(o.value)
                  }}
                >
                  {o.label}
                  {o.value === props.value && (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * El campo de texto y el modelo. Enter manda, Shift+Enter baja de línea. Una imagen pegada o soltada se adjunta (se ve
 * en miniatura y, si ya hay texto, como etiqueta donde está el cursor); cualquier otro archivo entra como etiqueta y
 * le llega al agente como su ruta. Un enlace pegado también se ve como etiqueta. El clip abre el explorador y hace lo mismo con lo que elijas.
 */
export function Composer(props: {
  models: Model[]
  initial?: Choice
  /** Si llega, manda sobre lo que el compositor eligió: el inicio lo usa para que la card cambie el modelo. */
  choice?: Choice
  running?: boolean
  /** Sigue algo corriendo en segundo plano (subagentes, comandos): Detener lo para aunque el turno haya acabado. */
  background?: boolean
  /** Cambiar de modelo cierra el agente, y con él lo que corre en segundo plano. */
  lockModel?: boolean
  autoFocus?: boolean
  /** Lo que ocupa la conversación en la ventana del modelo. Sin él no sale el círculo. */
  context?: { used: number; max: number }
  /** Lo que la card añade a la barra, junto al modelo (la serie, la carpeta, el lote…). */
  extra?: ReactNode
  /** Se puede mandar sin escribir nada: lo que se pide ya va en la barra (una serie, que elige sola su tema). */
  vacio?: boolean
  /** En vez de elegir modelo y esfuerzo aquí: el hilo nuevo trae su propio selector («Optimizado» o «Avanzado»). */
  modelos?: ReactNode
  placeholder: string
  /** Por qué aún no se puede mandar (falta la cuenta…): el botón de enviar lo dice y no manda. */
  bloqueo?: string
  /** Lo que había escrito, para retomar un borrador. Solo cuenta al montarse. */
  draft?: Draft
  /** Cada cambio del campo, para guardarlo como borrador. */
  onDraft?(draft: Draft): void
  /** Con el agente trabajando, le llega ya, en mitad del turno. */
  onSend(text: string, choice: Choice, images: string[]): Promise<unknown>
  /** Si falla, el modelo vuelve al de antes y el error sale en la barra, como los de mandar. Lo mismo al detener. */
  onChoice?(choice: Choice): Promise<unknown> | void
  onStop?(): Promise<unknown> | void
}) {
  const [text, setText] = useState(props.draft?.text ?? '')
  const [images, setImages] = useState(props.draft?.images ?? [])
  const [uploading, setUploading] = useState(0)
  const [own, setChoice] = useState<Choice | undefined>(props.initial)
  const choice = props.choice ?? own
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!own && props.initial) setChoice(props.initial)
  }, [props.initial, own])

  useEffect(() => {
    if (!props.draft) return
    box.current!.innerHTML = props.draft.html
    etiquetarInvocacion(box.current!)
    if (!props.autoFocus) return
    // El cursor al final, para seguir escribiendo donde se dejó.
    box.current!.focus()
    getSelection()?.selectAllChildren(box.current!)
    getSelection()?.collapseToEnd()
  }, [])

  useEffect(() => {
    if (props.autoFocus && !props.draft) box.current?.focus()
  }, [props.autoFocus])

  // Las vistas previas `blob:` mueren con la página: el borrador guarda la URL del servidor de cada imagen.
  useEffect(() => {
    if (!props.onDraft) return
    let html = box.current!.innerHTML
    const saved = images.map((i) => {
      const src = i.src.startsWith('blob:') ? imageUrl(i.path) : i.src
      html = html.replaceAll(i.src, src)
      return { ...i, src }
    })
    props.onDraft({ html, text, images: saved })
  }, [text, images])

  /** Lee el campo tras cada cambio. Borrar una etiqueta quita su imagen. */
  function sync() {
    const el = box.current!
    etiquetarInvocacion(el)
    setText(read(el))
    const shown = new Set(Array.from(el.querySelectorAll<HTMLElement>('[data-src]'), (c) => c.dataset.src))
    setImages((list) => list.filter((i) => !i.chip || shown.has(i.src)))
  }

  /** Pone algo donde está el cursor, o al final si el cursor no está en el campo. */
  function insert(...nodes: Node[]) {
    const el = box.current!
    if (!nodes.length) return
    const sel = getSelection()
    let range = sel?.rangeCount ? sel.getRangeAt(0) : null
    if (!range || !el.contains(range.commonAncestorContainer)) {
      range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
    }
    range.deleteContents()
    for (const n of [...nodes].reverse()) range.insertNode(n)
    range.setStartAfter(nodes[nodes.length - 1])
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
    sync()
  }

  // Una cita elegida en la conversación entra al final del campo, y el cursor queda detrás para comentarla.
  useEffect(() => {
    const quote = (e: Event) => {
      insert(quoteChip((e as CustomEvent<string>).detail), document.createTextNode(' '))
      box.current?.focus()
    }
    addEventListener(QUOTE_EVENT, quote)
    return () => removeEventListener(QUOTE_EVENT, quote)
  }, [])

  /** Lo soltado, aquí o en cualquier parte del inicio: los archivos se adjuntan; un enlace entra como etiqueta, como al pegarlo. */
  function soltar({ files, texto }: Soltado) {
    const el = box.current!
    const sel = getSelection()
    const dentro = !!sel?.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)
    el.focus()
    // Si el cursor no estaba en el campo, va al final: ahí entra lo soltado.
    if (!dentro) (sel?.selectAllChildren(el), sel?.collapseToEnd())
    if (files.length) return void attach(files)
    if (!texto.trim()) return
    const nodes = withChips(texto)
    insert(...(nodes.length ? nodes : [document.createTextNode(texto)]))
  }
  const alSoltar = useRef(soltar)
  alSoltar.current = soltar
  useEffect(() => {
    const oir = (e: Event) => alSoltar.current((e as CustomEvent<Soltado>).detail)
    addEventListener(SOLTAR_EVENT, oir)
    return () => removeEventListener(SOLTAR_EVENT, oir)
  }, [])

  const model = props.models.find((m) => m.id === choice?.model)

  const empty = !props.vacio && !text.trim() && !images.length
  const trabajando = props.running || props.background

  async function submit() {
    if (empty || !choice || busy || uploading || props.bloqueo) return
    setBusy(true)
    setError('')
    try {
      await props.onSend(text.trim(), choice, images.map((i) => i.path))
      box.current!.replaceChildren()
      setText('')
      setImages([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  /** El modelo cambia a la vista al elegirlo; si el servidor no lo acepta, vuelve al de antes y dice por qué. */
  async function pick(next: Choice) {
    const antes = own
    setChoice(next)
    setError('')
    try {
      await props.onChoice?.(next)
    } catch (e) {
      setChoice(antes)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function stop() {
    setError('')
    try {
      await props.onStop?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function attach(files: File[]) {
    setUploading((n) => n + files.length)
    // Como en T3: sin texto escrito, la imagen solo sale arriba en miniatura; con texto, además lleva su etiqueta. Las
    // etiquetas entran ya, donde está el cursor; la vista previa sale del archivo mismo y no espera al servidor.
    const chipped = !!read(box.current!).trim()
    // Los demás archivos siempre llevan etiqueta: es lo que el agente recibe como ruta.
    const srcs = files.map((f) => (IMAGE.test(f.type) ? URL.createObjectURL(f) : ''))
    const chips = files.map((f, i) => (srcs[i] ? (chipped ? chip(f, srcs[i]) : null) : fileChip(f)))
    insert(...chips.flatMap((c) => (c ? [c, document.createTextNode(' ')] : [])))
    for (const [i, file] of files.entries()) {
      const src = srcs[i]
      try {
        const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name || 'imagen.png')}`, { method: 'POST', body: file })
        // Si el servidor no la guardó, no hay ruta: adjuntarla le mandaría al agente "undefined".
        const { path, error } = await res.json().catch(() => ({}))
        if (!res.ok || typeof path !== 'string') throw new Error(`No se pudo subir «${file.name || 'imagen.png'}»: ${error ?? `el servidor respondió ${res.status}`}`)
        const chip = chipped && !!src
        // Si borraron la etiqueta mientras subía, la imagen ya no va.
        if (chip && !box.current?.querySelector(`[data-src="${src}"]`)) continue
        if (src) setImages((list) => [...list, { path, src, chip }])
        else {
          chips[i]!.dataset.path = path
          sync()
        }
      } catch (e) {
        // Su etiqueta se va también: a la vista no queda nada que no vaya a llegar.
        chips[i]?.remove()
        sync()
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  return (
    <div
      className={`composer ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        if (desdeFuera()) soltar(soltado(e.dataTransfer))
      }}
    >
      <Thumbs
        images={images}
        onRemove={(image) => {
          box.current?.querySelector(`[data-src="${image.src}"]`)?.remove()
          setImages((list) => list.filter((i) => i !== image))
          sync()
        }}
      />
      <div className="editor">
        {!text && !images.some((i) => i.chip) && (
          <span className="placeholder">{props.running ? 'Enter le llega ya, en mitad del turno' : props.placeholder}</span>
        )}
        <div
          ref={box}
          className="field"
          contentEditable="plaintext-only"
          role="textbox"
          aria-multiline
          onInput={sync}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files)
            if (files.length) {
              e.preventDefault()
              attach(files)
              return
            }
            const nodes = withChips(e.clipboardData.getData('text/plain'))
            if (!nodes.length) return
            e.preventDefault()
            insert(...nodes)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
      </div>
      <div className="composer-bar">
        <button className="attach" title="Adjuntar archivos" onClick={() => picker.current?.click()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
          </svg>
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            attach(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        {props.modelos ?? (
          <>
        <Picker
          label={model?.label ?? choice?.model ?? 'Modelo'}
          disabled={props.running || props.lockModel}
          groups={gruposModelos(props.models)}
          value={model?.id ?? choice?.model ?? ''}
          onChange={(id) => {
            const m = props.models.find((x) => x.id === id)!
            pick({ model: id, effort: m.efforts.includes(choice?.effort ?? '') ? choice?.effort : m.defaultEffort })
          }}
        />
        {model && model.efforts.length > 0 && (
          <Picker
            label={choice?.effort ?? ''}
            disabled={props.running || props.lockModel}
            groups={[{ label: 'Esfuerzo', options: model.efforts.map((e) => ({ value: e, label: e })) }]}
            value={choice?.effort ?? ''}
            onChange={(effort) => pick({ ...choice!, effort })}
          />
        )}
          </>
        )}
        {props.extra}
        <span className="spacer" />
        {props.context && <ContextRing {...props.context} />}
        {uploading > 0 && <span className="muted small">Subiendo…</span>}
        {error && <span className="bad small">{error}</span>}
        {(!trabajando || !empty) && (
          <button
            className="send"
            title={props.bloqueo ?? (props.running ? 'Enviar ya, en mitad del turno (Enter)' : 'Enviar (Enter)')}
            disabled={empty || busy || uploading > 0 || !!props.bloqueo}
            onClick={() => submit()}
          >
            ↑
          </button>
        )}
        {trabajando && (
          <button className="send stop" title={props.running ? 'Detener' : 'Detener lo que corre en segundo plano'} onClick={stop}>
            ■
          </button>
        )}
      </div>
    </div>
  )
}
