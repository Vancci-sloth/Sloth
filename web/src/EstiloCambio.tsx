import { useEffect, useState } from 'react'
import type { Card, EstiloAnterior } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { abrirBorrador } from './Estilos'
import { Icono } from './Iconos'

/**
 * Bajo la card de un estilo de Sloth que esta versión cambió a fondo (`Card.cambio`), si se guardó el de antes al
 * actualizar (`server/anteriores.ts`): qué cambió, la comparación de los dos, y quedarse también con el de antes, que
 * pasa a tus estilos tal cual. El de Sloth ya es el nuevo pase lo que pase. «Usar solo el nuevo» borra la copia.
 */
export function EstiloCambio({ card }: { card: Card }) {
  const [aviso, setAviso] = useState<EstiloAnterior | null>(null)
  const [hecho, setHecho] = useState<{ titulo: string; id: string; adaptar: string[] } | null>(null)
  const [olvidar, setOlvidar] = useState(false)
  const [fallo, setFallo] = useState('')
  useEffect(() => {
    setHecho(null)
    setFallo('')
    if (!card.skill || card.tuya) return setAviso(null)
    let vivo = true
    api<EstiloAnterior | null>(`/api/cards/${card.id}/anterior`).then((a) => vivo && setAviso(a), () => vivo && setAviso(null))
    return () => {
      vivo = false
    }
  }, [card.id])

  async function conservar() {
    setFallo('')
    try {
      setHecho(await api<{ titulo: string; id: string; adaptar: string[] }>(`/api/cards/${card.id}/anterior`, { accion: 'conservar' }))
      setAviso(null)
    } catch (e) {
      setFallo(`No se pudo guardar: ${e instanceof Error ? e.message : e}`)
    }
  }

  if (hecho)
    return (
      <p className="estilo-cambio-listo">
        «{hecho.titulo}» ya está entre tus estilos, tal como era.
        {hecho.adaptar.length > 0 && (
          <>
            {' '}
            Usa cosas de Sloth que cambiaron desde entonces:{' '}
            <button
              onClick={() =>
                abrirBorrador(
                  'nuevo-estilo',
                  `Adapta mi estilo «${hecho.titulo}» (la skill ${hecho.id}) a esta versión de Sloth. Es el ${card.title} de antes, y desde entonces cambiaron en video-base: ${hecho.adaptar.join(', ')}.\n\nSigue «Adaptar un estilo instalado» de tu skill.`
                )
              }
            >
              Adaptarlo
            </button>
          </>
        )}
      </p>
    )
  if (!aviso) return null
  return (
    <section className="panel cuenta-aviso estilo-cambio">
      <div className="item">
        <div className="fila">
          <Icono de="megafono" className="icon-trazo" />
          <div className="fila-nombre">
            <strong>Este estilo cambió</strong>
            <span>{aviso.texto}</span>
          </div>
        </div>
        <div className="estilo-cambio-acciones">
          {aviso.compara && (
            <a href={aviso.compara} target="_blank" rel="noreferrer">
              <Icono de="video" className="icon-trazo" /> Ver los dos lado a lado
            </a>
          )}
          <button onClick={() => setOlvidar(true)}>Usar solo el nuevo</button>
          <button className="primary" onClick={conservar} title={`Queda entre tus estilos como «${aviso.titulo}»`}>
            Guardar también el de antes
          </button>
        </div>
        {fallo && <p className="bad small">{fallo}</p>}
      </div>
      {olvidar && (
        <Confirm
          title="¿Usar solo el nuevo?"
          action="Usar solo el nuevo"
          onClose={() => setOlvidar(false)}
          onConfirm={() => api(`/api/cards/${card.id}/anterior`, { accion: 'olvidar' }).then(() => setAviso(null))}
        >
          Se borra la copia del de antes y ya no podrás volver a él. Tus videos ya hechos no cambian.
        </Confirm>
      )}
    </section>
  )
}
