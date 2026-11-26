import type { ImagenEstudio } from '../../shared/estilos-imagen'

const fechaImagen = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

export function MetadatosImagen({ imagen }: { imagen: ImagenEstudio }) {
  const fecha = new Date(imagen.creada)
  if (!Number.isFinite(fecha.getTime())) return null
  return <small className="imagen-metadatos">
    {imagen.origen ? 'Edición solicitada' : 'Creación solicitada'} · <time dateTime={fecha.toISOString()}>{fechaImagen.format(fecha)}</time>
  </small>
}
