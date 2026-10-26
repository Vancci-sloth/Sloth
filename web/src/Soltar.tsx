import { type DragEvent, useState } from 'react'
import { desdeFuera, SOLTAR_EVENT, soltado } from './Composer'
import './Soltar.css'

/**
 * Soltar en cualquier parte del inicio: un archivo o un enlace que se suelta fuera del compositor va igual al mensaje,
 * como si se hubiera soltado en él (`SOLTAR_EVENT`). Mientras se arrastra algo de fuera, un aviso cubre el inicio. Lo que
 * cae encima del compositor lo atiende él.
 */
export function useSoltar() {
  const [encima, setEncima] = useState(false)
  const sirve = (e: DragEvent) => desdeFuera() && ['Files', 'text/uri-list', 'text/plain'].some((t) => e.dataTransfer.types.includes(t))
  const props = {
    onDragEnter: (e: DragEvent) => sirve(e) && setEncima(true),
    onDragOver: (e: DragEvent) => {
      if (!sirve(e)) return
      // Sin esto no llega el `drop`, y el navegador abre el archivo en lugar de la app.
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setEncima(true)
    },
    // Pasar de un elemento a otro también es salir de uno: solo cuenta salir del inicio.
    onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setEncima(false),
    onDrop: (e: DragEvent) => {
      setEncima(false)
      if (e.isDefaultPrevented() || !sirve(e)) return
      e.preventDefault()
      dispatchEvent(new CustomEvent(SOLTAR_EVENT, { detail: soltado(e.dataTransfer) }))
    }
  }
  const aviso = encima && (
    <div className="soltar-aviso" aria-hidden="true">
      <span>Suéltalo y va al mensaje</span>
    </div>
  )
  return { props, aviso }
}
