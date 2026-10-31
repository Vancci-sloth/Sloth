import { useEffect, useState } from 'react'
import { VIDEOS_SIN_AVISO } from '../../shared/limites'
import { alPreguntar } from './api'
import { Confirm } from './Confirm'

/**
 * Antes de arrancar más videos de los que van sin aviso, el servidor pide confirmar y aquí se pregunta (ADR 0011). Cualquier
 * cosa que arranque uno pasa por `api`: un hilo nuevo, un lote, la voz que le llega a un video quieto o «Empezar ya».
 */
export function AvisoVideos() {
  const [aviso, setAviso] = useState<{ texto: string; decide(sigue: boolean): void } | null>(null)

  useEffect(() => {
    alPreguntar((texto) => new Promise((decide) => setAviso({ texto, decide })))
    return () => alPreguntar(undefined)
  }, [])

  if (!aviso) return null
  return (
    <Confirm
      title={`¿Más de ${VIDEOS_SIN_AVISO} videos a la vez?`}
      action="Continuar"
      onConfirm={async () => aviso.decide(true)}
      onClose={() => (aviso.decide(false), setAviso(null))}
    >
      {aviso.texto}
    </Confirm>
  )
}
