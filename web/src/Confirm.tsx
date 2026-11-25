import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Un modal que pide confirmación. Escape o un clic fuera lo cierran; Enter pulsa el botón que tiene el foco, que al abrir
 * es el de la acción (con `enfocarCancelar`, el de cancelar: para lo que se abre con una tecla). Si `onConfirm` falla, el error se queda a la vista y el modal sigue abierto. Se pinta en `body`:
 * dentro de otro bloque heredaría sus estilos (en `.pie`, los botones salían grises).
 */
export function Confirm(props: {
  title: string
  children: ReactNode
  action: string
  danger?: boolean
  enfocarCancelar?: boolean
  /** Una segunda salida, entre «Cancelar» y la acción («Ponerlo en cola» en `AvisoVideos.tsx`). */
  otra?: { texto: string; title?: string; onClick(): void }
  onConfirm(): Promise<unknown>
  onClose(): void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await props.onConfirm()
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return createPortal(
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" role="dialog" aria-modal aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        <div className="modal-body">{props.children}</div>
        {error && <p className="bad small">{error}</p>}
        <div className="modal-actions">
          <button className="ghost" onClick={props.onClose} autoFocus={props.enfocarCancelar}>
            Cancelar
          </button>
          {props.otra && (
            <button className="ghost" title={props.otra.title} disabled={busy} onClick={props.otra.onClick}>
              {props.otra.texto}
            </button>
          )}
          <button className={props.danger ? 'primary danger' : 'primary'} disabled={busy} onClick={confirm} autoFocus={!props.enfocarCancelar}>
            {props.action}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
