import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AvisoVentana } from '../../shared/types'

/**
 * Un modal que pide confirmación. Escape o un clic fuera lo cierran; Enter pulsa el botón que tiene el foco, que al abrir
 * es el de la acción (con `enfocarCancelar`, el de cancelar: para lo que se abre con una tecla). Si `onConfirm` falla, el error se queda a la vista y el modal sigue abierto. Se pinta en `body`:
 * dentro de otro bloque heredaría sus estilos (en `.pie`, los botones salían grises).
 */
export function Confirm(props: { title: string; children: ReactNode; action: string; danger?: boolean; enfocarCancelar?: boolean; soloAceptar?: boolean; otraAccion?: { etiqueta: string; ejecutar(): Promise<unknown> }; onConfirm(): Promise<unknown>; onClose(): void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const velo = useRef<HTMLDivElement>(null)
  const otraAccion = props.otraAccion

  async function confirm(ejecutar: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await ejecutar()
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && Array.from(document.querySelectorAll('body > .modal-backdrop')).at(-1) === velo.current) {
        if (!busy) props.onClose()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })

  return createPortal(
    <div ref={velo} className="modal-backdrop" onClick={() => { if (!busy) props.onClose() }}>
      <div className="modal" role="dialog" aria-modal aria-label={props.title} onClick={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        <div className="modal-body">{props.children}</div>
        {error && <p className="bad small">{error}</p>}
        <div className="modal-actions">
          {!props.soloAceptar && <button className="ghost" disabled={busy} onClick={props.onClose} autoFocus={props.enfocarCancelar}>
            Cancelar
          </button>}
          <button className={props.danger ? 'primary danger' : 'primary'} disabled={busy} onClick={() => void confirm(props.onConfirm)} autoFocus={!props.enfocarCancelar}>
            {props.action}
          </button>
          {otraAccion && (
            <button className="primary danger" disabled={busy} onClick={() => void confirm(otraAccion.ejecutar)}>
              {otraAccion.etiqueta}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function AvisosVentana() {
  const [aviso, setAviso] = useState<AvisoVentana>()
  const [recordar, setRecordar] = useState(false)
  const respondido = useRef<number | undefined>(undefined)
  useEffect(() => window.sloth?.avisos?.escuchar((nuevo) => {
    setRecordar(false)
    setAviso(nuevo)
  }), [])
  if (!aviso) return null
  const responder = (aceptar: boolean) => {
    if (respondido.current === aviso.id) return
    respondido.current = aviso.id
    window.sloth?.avisos?.responder(aviso.id, aceptar, recordar)
    setAviso(undefined)
  }
  return <Confirm key={aviso.id} title={aviso.titulo} action={aviso.accion ?? 'Entendido'} soloAceptar={!aviso.accion}
    enfocarCancelar={!!aviso.accion} onClose={() => responder(false)} onConfirm={async () => responder(true)}>
    <div className="aviso-ventana-detalle">{aviso.detalle}</div>
    {aviso.recordar && <label className="aviso-ventana-recordar">
      <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.currentTarget.checked)} /> No volver a mostrar
    </label>}
  </Confirm>
}
