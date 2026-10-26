import { useEffect, useState } from 'react'
import type { Enlace } from '../../shared/types'
import { api } from './api'
import './Enlaces.css'

/**
 * La tarjeta de cada enlace pegado en el inicio (`server/enlaces.ts`): su miniatura, su sitio y su título, debajo del
 * compositor. Con varios (un lote), una compacta por enlace, en dos columnas y con scroll si no caben. Un enlace sin
 * título no enseña nada.
 */
export function TarjetasEnlaces({ enlaces }: { enlaces: string[] }) {
  if (!enlaces.length) return null
  return (
    <div className={`enlaces ${enlaces.length > 1 ? 'varios' : ''}`}>
      {enlaces.map((url) => (
        <Tarjeta key={url} url={url} />
      ))}
    </div>
  )
}

function Tarjeta({ url }: { url: string }) {
  const e = useEnlace(url)
  const [sinImagen, setSinImagen] = useState(false)
  if (!e?.titulo) return null
  return (
    <a className="enlace" href={e.url} target="_blank" rel="noreferrer" title={e.titulo}>
      {e.imagen && !sinImagen && <img src={e.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setSinImagen(true)} />}
      <span className="enlace-texto">
        <small>{[e.sitio, e.autor].filter(Boolean).join(' · ')}</small>
        <strong>{e.titulo}</strong>
      </span>
    </a>
  )
}

/** Lo leído de cada enlace en esta pestaña: al volver al inicio sale ya, sin esperar. */
const vistos = new Map<string, Enlace>()

/** Lo que se sabe de un enlace. Espera un poco: mientras escribes uno a mano, no pregunta por cada letra. */
function useEnlace(url: string) {
  const [e, setE] = useState<Enlace | null>(() => vistos.get(url) ?? null)
  useEffect(() => {
    if (vistos.has(url)) return setE(vistos.get(url)!)
    setE(null)
    let vivo = true
    const t = setTimeout(
      () =>
        api<Enlace>(`/api/enlace?url=${encodeURIComponent(url)}`).then(
          (d) => {
            if (d.titulo) vistos.set(url, d)
            if (vivo) setE(d)
          },
          () => {}
        ),
      400
    )
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [url])
  return e
}
