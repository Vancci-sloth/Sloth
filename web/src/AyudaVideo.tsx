import type { Fase } from '../../shared/types'
import { BotonAyuda } from './Ayuda'
import { Icono } from './Iconos'
import './AyudaVideo.css'

const fases = {
  idea: {
    icono: 'foco', descripcion: 'Revisa el tema, el enfoque y las fuentes que usará el agente.',
    muestra: ['Tema', 'Cómo se forman las tormentas'],
    ejemplo: 'Explica el fenómeno con un ejemplo cotidiano y cierra con un dato curioso.'
  },
  guion: {
    icono: 'lapiz', descripcion: 'Lee el guion y comprueba qué se cuenta al inicio, en el desarrollo y en el cierre.',
    muestra: ['Inicio del guion', '¿Por qué retumba el cielo después del relámpago?'],
    ejemplo: 'Empieza con una pregunta y acorta la introducción.'
  },
  sonido: {
    icono: 'sonido', descripcion: 'Escucha la narración y revisa las pistas disponibles en este estilo.',
    muestra: ['Pista de voz', 'Narración lista para escuchar'],
    ejemplo: 'Baja la música cuando empiece la narración.'
  },
  video: {
    icono: 'escena', descripcion: 'Reproduce la vista previa y revisa el montaje en la línea de tiempo.',
    muestra: ['Escena 2 · 00:04–00:08', 'Escena seleccionada para el chat'],
    ejemplo: 'Selecciona una escena y pide: «Aclara el cielo en este tramo».'
  },
  entrega: {
    icono: 'descargar', descripcion: 'Descarga el video terminado o pide otra versión desde Entrega.',
    muestra: ['Video terminado', 'tormentas.mp4'],
    ejemplo: 'Abre el video final y revisa cómo se ve antes de compartirlo.'
  },
} as const

export function AyudaFase({ fase, nombre, disponible }: { fase: Fase; nombre: string; disponible: boolean }) {
  const guia = fases[fase]
  return <BotonAyuda etiqueta={'Información: ' + nombre}>
    <div className="ayuda-video">
      <strong>{nombre}</strong>
      <p>{guia.descripcion}</p>
      <div className="ayuda-video-muestra">
        <Icono de={guia.icono} />
        <div><strong>{guia.muestra[0]}</strong><span>{guia.muestra[1]}</span></div>
      </div>
      {fase === 'video' && <div className="ayuda-video-linea" aria-hidden="true">
        <span>Inicio</span><span>Escena 2</span><span>Cierre</span>
      </div>}
      {fase === 'sonido' && <div className="ayuda-video-onda" aria-hidden="true">
        {[4, 9, 15, 11, 6, 12, 20, 16, 8, 14, 19, 12, 5, 9, 14, 7, 4].map((alto, i) =>
          <span key={i} style={{ height: alto }} />)}
      </div>}
      {disponible ? <p><strong>Prueba esto</strong><br />{guia.ejemplo}</p>
        : <p>Esta fase no está disponible en este proyecto por ahora.</p>}
    </div>
  </BotonAyuda>
}

export function AyudaCrearVideo({ clips }: { clips: boolean }) {
  return <BotonAyuda etiqueta="Información: Cómo preparar un video">
    <div className="ayuda-video">
      <strong>Cómo preparar un video</strong>
      <div className="ayuda-video-formatos">
        <div><span className="ayuda-video-vertical"><Icono de="video" /></span><strong>Vertical · 9:16</strong><small>Reels, Shorts y TikTok</small></div>
        <div><span className="ayuda-video-horizontal"><Icono de="video" /></span><strong>Horizontal · 16:9</strong><small>Videos largos de YouTube</small></div>
      </div>
      <p><strong>Voz</strong> elige quién narrará el video. <strong>Imágenes</strong> elige con qué modelo se generan las ilustraciones.
        {clips && <> Usa <strong>Clips</strong> para ajustar los fragmentos de video generados.</>}
      </p>
      <p><strong>Ejemplo de pedido</strong><br />«Haz un video de 45 segundos sobre cómo se forman las tormentas, con narración tranquila».</p>
    </div>
  </BotonAyuda>
}
