import { useEffect, useState } from 'react'
import { VIDEOS_SIN_AVISO } from '../../shared/limites'
import { alPreguntar } from './api'
import { Confirm } from './Confirm'

/**
 * Antes de arrancar más videos de los que van sin aviso, el servidor pide confirmar y aquí se pregunta (ADR 0011). Cualquier
 * cosa que arranque uno pasa por `api`: un hilo nuevo, un lote, la voz que le llega a un video quieto o «Empezar ya». Un
 * hilo nuevo también se puede poner en la cola: arranca solo cuando acabe uno de los que trabajan.
 */
export function AvisoVideos() {
  const [aviso, setAviso] = useState<{ texto: string; cola: boolean; decide(sigue: boolean | 'cola'): void } | null>(null)

  useEffect(() => {
    alPreguntar((texto, cola) => new Promise((decide) => setAviso({ texto, cola, decide })))
    return () => alPreguntar(undefined)
  }, [])

  if (!aviso) return null
  return (
    <Confirm
      title={`¿Más de ${VIDEOS_SIN_AVISO} videos a la vez?`}
      action="Empezar ya"
      otra={aviso.cola ? { texto: 'Ponerlo en cola', title: 'Empieza solo cuando acabe uno de los que trabajan', onClick: () => (aviso.decide('cola'), setAviso(null)) } : undefined}
      onConfirm={async () => aviso.decide(true)}
      onClose={() => (aviso.decide(false), setAviso(null))}
    >
      {aviso.texto}
      {aviso.cola && ' En la cola, empieza solo cuando acabe uno de los que trabajan.'}
    </Confirm>
  )
}
