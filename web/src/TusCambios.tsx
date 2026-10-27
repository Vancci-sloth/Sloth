import { useEffect, useState } from 'react'
import type { Card, CambiosCard } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'

/**
 * «Con tus cambios (N)», bajo la card elegida: lo que tú o tu agente cambiaron en su skill (y en video-base, que lee), que
 * es por lo que tus videos pueden salir distintos de los de Sloth. Se quita archivo por archivo o se vuelve a la original
 * entera; lo que se pisa queda antes en una copia (`server/originales.ts`). Solo en la app que se vende: en el repo no
 * hay original con qué comparar y no sale. Se vuelve a mirar cuando avanza un hilo de la card, que pudo cambiarla.
 */
export function TusCambios({ card, clave }: { card: Card; clave: string }) {
  const [estado, setEstado] = useState<CambiosCard | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [fallo, setFallo] = useState('')
  // Tras volver a la original, dónde quedó tu versión, por si te arrepientes.
  const [copia, setCopia] = useState('')
  useEffect(() => setCopia(''), [card.id])
  useEffect(() => {
    if (!card.skill) return setEstado(null)
    let vivo = true
    api<CambiosCard | null>(`/api/cards/${card.id}/cambios`).then((e) => vivo && setEstado(e), () => vivo && setEstado(null))
    return () => {
      vivo = false
    }
  }, [card.id, clave])

  const abrir = (ruta: string) => void api('/api/open', { path: ruta })
  async function quitar(uno?: { skill: string; archivo: string }) {
    const e = await api<CambiosCard | null>(`/api/cards/${card.id}/original`, uno ?? {})
    setEstado(e)
    if (!e?.cambios.length) {
      setAbierto(false)
      setCopia(e?.copia ?? '')
    }
  }

  const cambios = estado?.cambios ?? []
  if (!cambios.length) {
    return copia ? (
      <p className="tus-cambios-listo">
        La skill volvió a la original. Lo tuyo quedó en una copia: <button onClick={() => abrir(copia)}>Verla</button>
      </p>
    ) : null
  }
  return (
    <>
      <button className="tus-cambios" onClick={() => setAbierto(true)} title="Lo que tú o tu agente cambiaron en esta skill">
        Con tus cambios ({cambios.length})
      </button>
      {abierto && (
        <Confirm title={`Tus cambios en «${card.title}»`} action="Volver a la original" onClose={() => setAbierto(false)} onConfirm={() => quitar()}>
          <p>
            Esto ya no es como lo trae Sloth: lo cambiaste tú o tu agente al pedirle que guardara algo. Por eso tus videos pueden salir
            distintos. Lo que quites se guarda antes en una copia.
          </p>
          <ul className="tus-cambios-lista">
            {cambios.map((c) => (
              <li key={`${c.skill}/${c.archivo}`}>
                <code>
                  {c.skill}/{c.archivo}
                </code>
                {c.borrado && <span> (lo quitaste)</span>}
                <button
                  onClick={() => (setFallo(''), quitar(c).catch((e: Error) => setFallo(`No se pudo quitar: ${e.message}`)))}
                  title="Vuelve a dejar solo este archivo como lo trae Sloth"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          {fallo && <p className="bad small">{fallo}</p>}
          {estado?.copia && (
            <button className="tus-cambios-copia" onClick={() => abrir(estado.copia!)}>
              Ver tu última copia
            </button>
          )}
        </Confirm>
      )}
    </>
  )
}
