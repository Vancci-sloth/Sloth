import { useState, useSyncExternalStore } from 'react'
import { api } from './api'
import { Icono, type NombreIcono } from './Iconos'
import './Referencia.css'

/**
 * Lo elegido en el video para pedir un cambio, como en un editor: un elemento del cuadro (clic en el monitor), una escena
 * (clic en la línea de tiempo) o un tramo (Shift+arrastrar). Va encima del campo del chat, y lo que se manda lo lleva
 * delante para que el agente sepa de qué se habla sin que el usuario lo explique. Uno por hilo: elegir otro lo cambia.
 */
export type Referencia = {
  tipo: 'elemento' | 'escena' | 'tramo'
  /** Lo que se lee en la etiqueta. */
  nombre: string
  /** Lo que lee el agente, delante del mensaje. */
  texto: string
}

const porHilo = new Map<string, Referencia>()
const oyentes = new Set<() => void>()
const oir = (f: () => void) => (oyentes.add(f), () => void oyentes.delete(f))

export function ponerReferencia(sessionId: string, r?: Referencia) {
  if (r) porHilo.set(sessionId, r)
  else if (!porHilo.delete(sessionId)) return
  oyentes.forEach((f) => f())
}

export const useReferencia = (sessionId: string) => useSyncExternalStore(oir, () => porHilo.get(sessionId))

/** El mensaje con la referencia delante, si la hay. Mandarlo la quita. */
export function conReferencia(sessionId: string, texto: string): string {
  const r = porHilo.get(sessionId)
  if (!r) return texto
  ponerReferencia(sessionId)
  return `${r.texto}\n\n${texto}`
}

const ICONO: Record<Referencia['tipo'], NombreIcono> = { elemento: 'mira', escena: 'escena', tramo: 'tramo' }

/** Lo que más se pide de un elemento elegido: un clic lo manda ya. */
const SUGERENCIAS = ['Hazlo más grande', 'Muévelo para que no tape nada importante', 'Que aparezca un poco después', 'Cámbiale el color para que combine con la escena']

/** La etiqueta de lo elegido, encima del campo del chat, con lo que más se pide si es un elemento. */
export function ReferenciaVideo({ sessionId }: { sessionId: string }) {
  const r = useReferencia(sessionId)
  const [error, setError] = useState('')
  if (!r) return null
  const mandar = (texto: string) => {
    setError('')
    api(`/api/sessions/${sessionId}/send`, { text: conReferencia(sessionId, texto) }).catch((e) => setError(e.message))
  }
  return (
    <div className="referencia">
      <div className="referencia-fila">
        <span className="referencia-chip" title={r.texto}>
          <Icono de={ICONO[r.tipo]} />
          <span className="referencia-nombre">{r.nombre}</span>
          <button title="Quitar" aria-label="Quitar lo elegido" onClick={() => ponerReferencia(sessionId)}>
            <Icono de="cerrar" />
          </button>
        </span>
        <span className="muted small">Escribe qué cambiar: el agente sabrá de qué hablas.</span>
      </div>
      {r.tipo === 'elemento' && (
        <div className="referencia-fila">
          {SUGERENCIAS.map((s) => (
            <button key={s} className="referencia-sugerencia" onClick={() => mandar(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      {error && <span className="bad small">{error}</span>}
    </div>
  )
}
