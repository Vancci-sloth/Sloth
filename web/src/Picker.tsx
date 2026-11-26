import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { NOMBRE_AGENTE, proveedorDe, type Proveedor } from '../../shared/providers'
import type { Model } from '../../shared/types'
import { Icono } from './Iconos'
import { VistaAyuda } from './Ayuda'
import { Logo } from './Logos'

/** Los desplegables agrupan los modelos por proveedor y distinguen los que se cobran por uso. */
export function gruposModelos(models: Model[]) {
  return [
    { id: 'claude', label: 'Anthropic' },
    { id: 'codex', label: 'OpenAI' },
    { id: 'opencode', label: 'OpenCode · gratis' },
    // Los de pago de OpenCode, debajo de los gratis: se cobran del saldo de la cuenta.
    { id: 'opencode', label: 'OpenCode · de pago (de tu saldo, por millón de tokens)', pago: true },
    { id: 'deepseek', label: 'DeepSeek · beta' },
    { id: 'grok', label: 'Grok · beta' },
    { id: 'antigravity', label: 'Antigravity · beta' },
    { id: 'gemini', label: 'Gemini · beta' },
    { id: 'cursor', label: 'Cursor' },
    { id: 'muse', label: 'Muse Code (Meta)' },
    { id: 'pi', label: 'Pi · beta · gratis' },
    { id: 'pi', label: 'Pi · beta · de pago (por millón de tokens)', pago: true },
  ].map((p) => ({
    proveedor: p.id as Proveedor,
    label: p.label,
    options: models
      .filter((m) => proveedorDe(m.id) === p.id && !!m.precio === !!p.pago)
      .map((m) => ({ value: m.id, label: m.precio ? `${m.label} · ${m.precio}` : m.label })),
  })).filter((g) => g.options.length > 0)
}

function lugarMenu(r: DOMRect, ancho?: number) {
  const above = r.top - 16
  const below = innerHeight - r.bottom - 16
  const down = above < 360 && below > above
  const width = Math.min(ancho ?? 280, innerWidth - 24)
  return { down, max: Math.max(0, Math.min(360, down ? below : above)), left: Math.max(12, Math.min(r.left, innerWidth - width - 12)), edge: down ? r.bottom + 8 : innerHeight - r.top + 8, width }
}

/**
 * Un desplegable con la cara de la app, en vez del nativo: el del sistema no se deja pintar. Se abre hacia arriba
 * (el compositor suele vivir abajo), salvo que arriba no quepa: en «Nuevo chat» el compositor está cerca del borde.
 * Se cierra al elegir, al hacer clic fuera o con Escape. También lo usa Opciones → Redes.
 */
export function Picker(props: {
  label: ReactNode
  etiqueta?: string
  buscar?: string
  className?: string
  menuClassName?: string
  menuWidth?: number
  /** Dentro de otro menú: sube la lista a la capa superior para que no la recorte su contenedor. */
  flotante?: boolean
  /** Sigue al botón si el compositor crece o su panel se desplaza. */
  seguirAncla?: boolean
  value: string
  disabled?: boolean
  /** `detalle` va a la derecha de la opción, apagado (lo que cuesta y tarda cada modelo). */
  groups: { label: string; proveedor?: Proveedor; options: { value: string; label: ReactNode; detalle?: string; logo?: string }[] }[]
  ayuda?: { etiqueta(value: string): string | undefined; vista(value: string): ReactNode }
  onChange(value: string): void
}) {
  const [open, setOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<{ valor: string; ancla: HTMLButtonElement }>()
  const esperaVista = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Hacia dónde se abre y cuánto alto le cabe; se mide al abrir.
  const [place, setPlace] = useState({ down: false, max: 360, left: 0, edge: 0, width: 280 })
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const id = useId()
  const idVista = id + '-ayuda'
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const terminos = busqueda.trim() ? normalizar(busqueda.trim()).split(/\s+/) : []
  const grupos = terminos.length ? props.groups.map((g) => ({ ...g, options: g.options.filter((o) => {
    const nombre = typeof o.label === 'string' ? o.label : ''
    const marca = g.proveedor ? NOMBRE_AGENTE[g.proveedor] : ''
    const texto = normalizar(`${g.label} ${g.proveedor ?? ''} ${marca} ${nombre} ${o.detalle ?? ''}`)
    return terminos.every((t) => texto.includes(t))
  }) })).filter((g) => g.options.length) : props.groups

  const toggle = () => {
    if (!open && root.current) {
      setBusqueda('')
      setPlace(lugarMenu(root.current.getBoundingClientRect(), props.menuWidth))
    }
    setOpen(!open)
  }

  function mantenerVista() {
    clearTimeout(esperaVista.current)
  }

  function mostrarVista(valor: string, ancla: HTMLButtonElement) {
    mantenerVista()
    setVista((actual) => actual?.ancla === ancla ? actual : { valor, ancla })
  }

  function ocultarVista() {
    mantenerVista()
    esperaVista.current = setTimeout(() => setVista(undefined), 180)
  }

  useEffect(() => {
    if (!open) setVista(undefined)
    return () => clearTimeout(esperaVista.current)
  }, [open])

  useLayoutEffect(() => {
    if (open && props.flotante) menu.current?.showPopover()
  }, [open, props.flotante])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (root.current?.closest('dialog[open]')) e.preventDefault()
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus()
    }
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    // Que se vea la opción elegida aunque la lista sea larga.
    const elegido = menu.current?.querySelector<HTMLButtonElement>('.picker-option.on')
    elegido?.scrollIntoView({ block: 'nearest' })
    if (props.flotante) (entrada.current ?? elegido ?? menu.current?.querySelector<HTMLButtonElement>('.picker-option'))?.focus({ preventScroll: true })
    const mover = (e: Event) => {
      if (menu.current?.contains(e.target as Node)) {
        setVista(undefined)
        return
      }
      if (!props.flotante || root.current?.contains(e.target as Node)) return
      const r = props.seguirAncla && root.current?.getBoundingClientRect()
      if (r && r.bottom > 0 && r.top < innerHeight) setPlace(lugarMenu(r, props.menuWidth))
      else setOpen(false)
    }
    addEventListener('resize', mover)
    addEventListener('scroll', mover, true)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
      removeEventListener('resize', mover)
      removeEventListener('scroll', mover, true)
    }
  }, [open, props.flotante, props.seguirAncla, props.menuWidth])

  useEffect(() => {
    if (props.disabled) setOpen(false)
  }, [props.disabled])

  return (
    <div ref={root} className={`picker ${props.className ?? ''} ${open ? 'open' : ''}`}>
      <button type="button" className="picker-trigger" disabled={props.disabled} aria-label={props.etiqueta} aria-haspopup={props.ayuda ? "dialog" : "listbox"} aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} onKeyDown={(e) => {
        if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); toggle() }
      }}>
        {props.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={menu} popover={props.flotante ? 'manual' : undefined} className={`picker-menu ${props.menuClassName ?? ''} ${props.flotante ? 'picker-flotante' : ''} ${place.down ? 'down' : ''}${props.buscar ? ' picker-buscable' : ''}`} style={{ maxHeight: place.max, ...(props.flotante ? { left: place.left, width: place.width, top: place.down ? place.edge : 'auto', bottom: place.down ? 'auto' : place.edge } : {}) }} onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            if (vista) {
              setVista(undefined)
              return
            }
            setOpen(false)
            root.current?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus()
            return
          }
          if (e.target === entrada.current) {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              menu.current?.querySelector<HTMLButtonElement>('.picker-option')?.click()
              return
            }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
          }
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
          e.preventDefault()
          const opciones = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.picker-option, .picker-info') ?? [])
          const actual = opciones.indexOf(document.activeElement as HTMLButtonElement)
          const siguiente = e.key === 'Home' || (actual < 0 && e.key === 'ArrowDown') ? 0
            : e.key === 'End' || actual < 0 ? opciones.length - 1
            : (actual + (e.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length
          opciones[siguiente]?.focus()
        }}>
          {props.buscar && <div className="picker-buscar"><Icono de="buscar" />
            <input ref={entrada} type="search" aria-label={props.buscar} placeholder={props.buscar} value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); if (menu.current) menu.current.scrollTop = 0 }} />
          </div>}
          {props.buscar && !grupos.length && <p className="picker-sin-resultados" role="status">No se encontraron modelos.</p>}
          <div id={id} role={props.ayuda ? "dialog" : "listbox"} aria-label={props.etiqueta}>
            {grupos.map((g) => (
              <div key={g.label} className="picker-group" role="group" aria-label={g.label} data-proveedor={g.proveedor}>
                <span className="picker-label">{g.proveedor && <Logo de={g.proveedor} chico />}{g.label}</span>
                {g.options.map((o) => {
                  const ayuda = props.ayuda?.etiqueta(o.value)
                  const opcion = <button
                    type="button"
                    key={o.value}
                    role={props.ayuda ? undefined : "option"}
                    aria-selected={props.ayuda ? undefined : o.value === props.value}
                    aria-pressed={props.ayuda && props.value ? o.value === props.value : undefined}
                    className={`picker-option ${o.value === props.value ? 'on' : ''}`}
                    onClick={() => {
                      setOpen(false)
                      if (props.etiqueta) root.current?.querySelector<HTMLButtonElement>('.picker-trigger')?.focus({ preventScroll: true })
                      if (o.value !== props.value) props.onChange(o.value)
                    }}
                  >
                    {o.logo ? <span className="picker-modelo-logo"><Logo de={o.logo} chico />{o.label}</span> : o.label}
                    {o.detalle && <span className="picker-detalle">{o.detalle}</span>}
                    {o.value === props.value && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                  if (!ayuda) return opcion
                  return <div className="picker-fila-info" key={o.value}>
                    {opcion}
                    <button type="button" className="picker-info" aria-label={"Información: " + ayuda}
                      aria-describedby={vista?.valor === o.value ? idVista : undefined}
                      onPointerEnter={(e) => { if (e.pointerType !== 'touch') mostrarVista(o.value, e.currentTarget) }}
                      onPointerLeave={ocultarVista}
                      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) mostrarVista(o.value, e.currentTarget) }}
                      onBlur={ocultarVista}
                      onClick={(e) => mostrarVista(o.value, e.currentTarget)}><Icono de="informacion" /></button>
                  </div>
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && vista && menu.current && props.ayuda && (
        <VistaAyuda id={idVista} ancla={vista.ancla} menu={menu.current} mantener={mantenerVista} ocultar={ocultarVista}>
          {props.ayuda.vista(vista.valor)}
        </VistaAyuda>
      )}
    </div>
  )
}
