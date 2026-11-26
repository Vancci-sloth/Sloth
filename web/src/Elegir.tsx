import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Icono, type NombreIcono } from './Iconos'
import './Elegir.css'

/**
 * Un menú para elegir una cosa de una lista corta, con el vidrio negro de la app: el `<select>` de siempre abría la
 * lista del sistema, que no se puede pintar y desentonaba con todo lo demás.
 *
 * Se cierra con Escape, al tocar fuera o al elegir, y se mueve con las flechas. `tinte` pinta el icono de cada opción
 * con su color (las secciones de la comunidad lo usan).
 */
export type Opcion = { id: string; nombre: string; icono?: NombreIcono; tinte?: string }

export function Elegir({ opciones, valor, onCambio, etiqueta, clase = '', soloIcono, alDerecho }: {
  opciones: Opcion[]
  valor: string
  onCambio(id: string): void
  /** Qué se elige aquí, para quien no ve la pantalla y para el globo de ayuda. */
  etiqueta: string
  clase?: string
  /** Solo el icono en el botón, sin el nombre. */
  soloIcono?: boolean
  /** La lista se alinea por su derecha (cuando el botón está pegado a la orilla). */
  alDerecho?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const ahora = opciones.find((o) => o.id === valor) ?? opciones[0]

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false)
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setAbierto(false)
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const botones = [...(caja.current?.querySelectorAll<HTMLButtonElement>('.elegir-lista button') ?? [])]
      const i = botones.indexOf(document.activeElement as HTMLButtonElement)
      botones[(i + (e.key === 'ArrowDown' ? 1 : botones.length - 1) + botones.length) % botones.length]?.focus()
    }
    addEventListener('pointerdown', fuera)
    addEventListener('keydown', tecla)
    return () => (removeEventListener('pointerdown', fuera), removeEventListener('keydown', tecla))
  }, [abierto])

  return (
    <div ref={caja} className={`elegir ${clase}`} style={{ '--tinte': ahora?.tinte } as CSSProperties}>
      <button
        className="elegir-boton"
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={soloIcono ? `${etiqueta}: ${ahora?.nombre ?? ''}` : undefined}
        title={`${etiqueta}: ${ahora?.nombre ?? ''}`}
        onClick={() => setAbierto(!abierto)}
      >
        {ahora?.icono && <Icono de={ahora.icono} />}
        {!soloIcono && <span>{ahora?.nombre}</span>}
      </button>
      {abierto && (
        <div className={`elegir-lista${alDerecho ? ' derecha' : ''}`} role="menu" aria-label={etiqueta}>
          {opciones.map((o) => (
            <button
              key={o.id}
              role="menuitemradio"
              aria-checked={o.id === valor}
              className={o.id === valor ? 'on' : ''}
              style={{ '--tinte': o.tinte } as CSSProperties}
              onClick={() => (setAbierto(false), o.id !== valor && onCambio(o.id))}
            >
              {o.icono && <Icono de={o.icono} />}
              <span>{o.nombre}</span>
              {o.id === valor && <Icono de="palomita" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
