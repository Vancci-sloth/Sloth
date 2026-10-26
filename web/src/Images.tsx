import { useEffect, useState } from 'react'

/** La URL con la que el servidor sirve una imagen adjunta (`data/attachments`). */
export function imageUrl(path: string): string {
  return `/api/attachments/${encodeURIComponent(path.split(/[\\/]/).pop() ?? '')}`
}

/** Una imagen adjunta: su ruta en el disco y de dónde se dibuja. */
export interface Attached {
  path: string
  src: string
}

/** Las miniaturas de las imágenes adjuntas, como en T3 Code. Clic la amplía; con `onRemove`, la × la quita. */
export function Thumbs({ images, onRemove }: { images: Attached[]; onRemove?(image: Attached): void }) {
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  if (!images.length) return null
  return (
    <div className="thumbs">
      {images.map((image) => (
        <div key={image.path} className="thumb">
          <button onClick={() => setOpen(image.src)} title="Ampliar">
            <img src={image.src} alt="" />
          </button>
          {onRemove && (
            <button className="thumb-x" title="Quitar" onClick={() => onRemove(image)}>
              ×
            </button>
          )}
        </div>
      ))}
      {open && (
        <div className="lightbox" onClick={() => setOpen(null)}>
          <img src={open} alt="" />
        </div>
      )}
    </div>
  )
}
