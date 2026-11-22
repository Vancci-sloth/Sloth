import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EvidenciaEstilo, PasoEvidencia, PruebaEstilo } from '../../shared/types'
import { api } from './api'
import { conQue, duracion, pruebaEnLinea } from './Guia'
import { Icono } from './Iconos'
import './Evidencia.css'

/**
 * La evidencia de la prueba de un estilo: el hilo completo donde se hizo su video (`EvidenciaEstilo`,
 * `server/prueba-estilo.ts`), para comprobar que lo que dice su prueba es cierto. «Ver la evidencia», en la publicación
 * del estilo, sale solo para su autor y el creador de Sloth, que son los únicos a quienes el cobro les da el archivo.
 *
 * Arriba, la prueba en una línea y lo que se le pidió; debajo, el hilo como pasó: lo que escribió quien lo hizo, lo que
 * contestó el agente, cada herramienta que usó (con lo que se le pasó y lo que devolvió, plegado) y cómo acabó cada
 * turno. Todo va como texto: lo escribió otra persona, y nada de ahí se dibuja como HTML.
 */
export function VerEvidencia({ prueba }: { prueba: PruebaEstilo }) {
  const [abierta, setAbierta] = useState(false)
  if (!prueba.evidencia) return null
  return (
    <>
      <button className="hiloprueba-boton" title="El hilo completo donde se hizo el video de su prueba. Solo lo ven su autor y el creador de Sloth" onClick={() => setAbierta(true)}>
        <Icono de="hilo" /> Ver la evidencia
      </button>
      {abierta && <Evidencia prueba={prueba} onCerrar={() => setAbierta(false)} />}
    </>
  )
}

function Evidencia({ prueba, onCerrar }: { prueba: PruebaEstilo; onCerrar(): void }) {
  const [hilo, setHilo] = useState<EvidenciaEstilo | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api<EvidenciaEstilo>(`/api/comunidad/archivo/${prueba.evidencia}`).then(setHilo, (e: Error) => setError(e.message))
  }, [prueba.evidencia])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onCerrar())
    addEventListener('keydown', tecla, true)
    return () => removeEventListener('keydown', tecla, true)
  })
  const turnos = hilo?.pasos.filter((p) => p.t === 'turno').length ?? 0
  return createPortal(
    <div className="modal-backdrop" onClick={onCerrar}>
      <div className="modal modal-ancho hiloprueba" role="dialog" aria-modal aria-label="La evidencia de su prueba" onClick={(e) => e.stopPropagation()}>
        <h2>La evidencia de su prueba</h2>
        <div className="modal-body">
          <p className="hiloprueba-prueba">{pruebaEnLinea(prueba)}</p>
          {prueba.hilo && <p className="hiloprueba-usa">Lo que usó de Sloth: {conQue(prueba.hilo.usa) || 'nada que deje rastro'}.</p>}
          {error && <p className="bad">{error}</p>}
          {!hilo && !error && <p className="hiloprueba-usa">Trayendo el hilo…</p>}
          {hilo && (
            <>
              <p className="hiloprueba-usa">
                El hilo «{hilo.titulo}», completo hasta el video terminado: {turnos} {turnos === 1 ? 'turno' : 'turnos'}.
              </p>
              <ol className="hiloprueba-hilo">
                {hilo.pasos.map((p, i) => (
                  <Paso key={i} p={p} />
                ))}
              </ol>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="primary" autoFocus onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function Paso({ p }: { p: PasoEvidencia }) {
  if (p.t === 'usuario')
    return (
      <li className="hiloprueba-usuario">
        <span>Quien lo hizo</span>
        <p>{p.texto}</p>
      </li>
    )
  if (p.t === 'agente')
    return (
      <li className="hiloprueba-agente">
        <span>El agente</span>
        <p>{p.texto}</p>
      </li>
    )
  if (p.t === 'herramienta')
    return (
      <li className={`hiloprueba-herramienta${p.error ? ' mal' : ''}`}>
        <details>
          <summary>
            <strong>{p.nombre}</strong> {p.entrada.replace(/\s+/g, ' ').slice(0, 140)}
          </summary>
          <pre>{p.entrada}</pre>
          {p.salida && <pre className="salida">{p.salida}</pre>}
        </details>
      </li>
    )
  return (
    <li className={`hiloprueba-turno${p.ok ? '' : ' mal'}`}>
      {p.ok ? 'Turno terminado' : `El turno se cortó${p.error ? `: ${p.error}` : ''}`} · {duracion(p.segundos)} · {p.costo ? `$${p.costo.toFixed(2)}` : 'sin costo'}
    </li>
  )
}
