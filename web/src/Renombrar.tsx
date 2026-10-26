import { useRef, useState } from 'react'
import type { SessionMeta } from '../../shared/types'
import { api } from './api'

/**
 * Renombrar un hilo ahí mismo: en su fila de la barra lateral (doble clic, o «Renombrar» del clic derecho) o en su
 * cabecera (el lápiz, o doble clic en el nombre). Enter lo guarda y Escape lo deja como estaba; salir del campo lo guarda
 * si cambió. Va por el `rename` de siempre, que lo deja en una línea. Si falla, el campo se queda y dice por qué.
 */
export function Renombrar({ session, onListo }: { session: SessionMeta; onListo(): void }) {
  const [nombre, setNombre] = useState(session.title)
  // El de cuando se abrió el campo: si mientras tanto llega el título corto, salir sin tocar nada no lo pisa.
  const inicial = useRef(session.title)
  const [error, setError] = useState('')
  // Enter y salir del campo llegan los dos: se guarda una vez.
  const hecho = useRef(false)
  async function guardar() {
    if (hecho.current) return
    hecho.current = true
    const limpio = nombre.trim()
    if (!limpio || limpio === inicial.current || limpio === session.title) return onListo()
    try {
      await api(`/api/sessions/${session.id}/rename`, { title: limpio })
      onListo()
    } catch (e) {
      hecho.current = false
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <input
      className={`renombrar ${error ? 'mal' : ''}`}
      aria-label="Nombre del hilo"
      title={error || 'Enter lo guarda · Esc lo deja como estaba'}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      value={nombre}
      maxLength={80}
      onChange={(e) => (setNombre(e.target.value), setError(''))}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') guardar()
        // El Escape es solo del campo: no cierra una selección ni vacía la búsqueda.
        if (e.key === 'Escape') e.stopPropagation(), (hecho.current = true), onListo()
      }}
      onBlur={guardar}
    />
  )
}

/** El nombre del hilo en su cabecera, con su lápiz: el lápiz o un doble clic en el nombre lo cambian ahí mismo. */
export function NombreDelHilo({ session }: { session: SessionMeta }) {
  const [editando, setEditando] = useState(false)
  if (editando) return <Renombrar session={session} onListo={() => setEditando(false)} />
  return (
    <>
      <span className="session-name" title={`${session.title}\n\nDoble clic para renombrarlo`} onDoubleClick={() => setEditando(true)}>
        {session.title}
      </span>
      <button className="lapiz" title="Renombrar" aria-label="Renombrar el hilo" onClick={() => setEditando(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
        </svg>
      </button>
    </>
  )
}
