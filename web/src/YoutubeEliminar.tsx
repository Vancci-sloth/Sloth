import { useState } from 'react'
import type { VideoParaYoutube } from '../../shared/youtube'
import { api } from './api'
import { Confirm } from './Confirm'

/** Limpieza local de MP4 terminados en YouTube: confirmación, Papelera y actualización de las galerías. */
export function YoutubeEliminar({ videos, individual, disabled, onEliminar }: { videos: VideoParaYoutube[]; individual?: boolean; disabled?: boolean; onEliminar(r: { borrados: number; quedan: number }): void | Promise<void> }) {
  const [confirmar, setConfirmar] = useState(false)
  const candidatos = videos.filter((v) => v.eliminable)
  if (!candidatos.length) return null
  return <>
    <button className={individual ? 'ghost small' : 'boton'} disabled={disabled} title="Envía los archivos locales a la Papelera de reciclaje" onClick={() => setConfirmar(true)}>{individual ? 'Eliminar del disco' : `Eliminar subidos del disco (${candidatos.length})`}</button>
    {confirmar && <Confirm title={`¿Eliminar ${candidatos.length === 1 ? '1 video' : `${candidatos.length} videos`} del disco?`} action="Enviar a la Papelera" danger onClose={() => setConfirmar(false)} onConfirm={async () => {
      const r = await api<{ borrados: number; quedan: number }>('/api/youtube/eliminar', { videos: candidatos.map((v) => ({ cardId: v.cardId, ruta: v.ruta, huella: v.huella })) })
      if (r.borrados) dispatchEvent(new Event('sloth-videos'))
      await onEliminar(r)
    }}>
      <p>Se enviarán a la Papelera de reciclaje los archivos de video que ya se subieron a YouTube, incluidos los programados. La publicación de YouTube conserva su miniatura, descripción y fecha.</p>
      <p>Se conservan el guion, las miniaturas y los materiales del proyecto. Los archivos con subidas incompletas o trabajos en curso se quedan.</p>
    </Confirm>}
  </>
}
