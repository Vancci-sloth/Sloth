import { useEffect, useState } from 'react'
import type { VersionLiberable } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'

const SISTEMAS = { windows: 'Windows', mac: 'Mac', linux: 'Linux' }

/**
 * Solo el creador, arriba de la comunidad: la versión que aún es solo de quien apoya y el botón que la da a todos ya,
 * para cuando el chat de un live cumple su meta (`/comunidad/liberar` del cobro). No compila nada: las apps abiertas la
 * ven en unos minutos (el vistazo de electron/main.ts). Luego se puede anunciar en Anuncios.
 */
export function Liberar({ onAnunciar }: { onAnunciar(version: string): void }) {
  const [sistemas, setSistemas] = useState<VersionLiberable[] | null>(null)
  const [preguntar, setPreguntar] = useState(false)
  const [liberada, setLiberada] = useState('')
  const [error, setError] = useState('')

  useEffect(() => void api<VersionLiberable[]>('/api/comunidad/liberar').then(setSistemas, (e) => setError(e.message)), [])

  if (error) return <div className="com-liberar bad small">No se pudo ver qué versión espera: {error}</div>
  if (!sistemas?.length) return null
  const pendientes = sistemas.filter((s) => s.todos)
  // Casi siempre es la misma en los tres; si no, cada una con su sistema.
  const nombre = (lista: VersionLiberable[]) => {
    const versiones = [...new Set(lista.map((s) => s.version))]
    return versiones.length === 1 ? `Sloth ${versiones[0]}` : lista.map((s) => `${SISTEMAS[s.so]} ${s.version}`).join(', ')
  }
  const ultima = sistemas.map((s) => s.version).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]

  if (liberada)
    return (
      <div className="com-liberar">
        <span>
          <strong>{liberada} ya es de todos.</strong> Las apps abiertas la ven en unos minutos.
        </span>
        <button className="com-boton ok" onClick={() => onAnunciar(ultima)}>
          Anunciarlo
        </button>
      </div>
    )
  if (!pendientes.length)
    return (
      <div className="com-liberar muted">
        <span>
          {nombre(sistemas)} ya es de todos. Para liberar una en el live, súbela a <span className="mono">venta</span> antes.
        </span>
      </div>
    )
  const cuando = new Date(Math.min(...pendientes.map((s) => Date.parse(s.todos!)))).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="com-liberar">
      <span>
        <strong>{nombre(pendientes)}</strong> es solo de quien apoya hasta el {cuando}.
      </span>
      <button className="com-boton ok" onClick={() => setPreguntar(true)}>
        Liberar para todos
      </button>
      {preguntar && (
        <Confirm
          title={`¿Dar ${nombre(pendientes)} a todos ya?`}
          action="Liberar para todos"
          onConfirm={async () => {
            const r = await api<VersionLiberable[]>('/api/comunidad/liberar', {})
            setSistemas(r)
            setLiberada(nombre(pendientes))
          }}
          onClose={() => setPreguntar(false)}
        >
          Quien no apoya la recibe ahora, sin esperar al {cuando}. No se puede deshacer: en cuanto alguien la baja, ya la tiene.
        </Confirm>
      )}
    </div>
  )
}
