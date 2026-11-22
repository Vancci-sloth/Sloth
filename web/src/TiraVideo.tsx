import { useEffect, useState } from 'react'

/** Diez miniaturas pequeñas con un solo reproductor; se cancela la lectura al dejar el video. */
export function TiraVideo({ src }: { src: string }) {
  const [cuadros, setCuadros] = useState<string[]>([])
  const [terminado, setTerminado] = useState(false)
  useEffect(() => {
    const corte = new AbortController()
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'metadata'
    video.playsInline = true
    setCuadros([])
    setTerminado(false)
    function esperar(evento: string) {
      return new Promise<void>((ok, mal) => {
        const limpiar = () => {
          clearTimeout(reloj)
          video.removeEventListener(evento, listo)
          video.removeEventListener('error', fallo)
          corte.signal.removeEventListener('abort', fallo)
        }
        const listo = () => { limpiar(); ok() }
        const fallo = () => { limpiar(); mal(new Error('No se pudo leer el fotograma')) }
        const reloj = setTimeout(fallo, 15_000)
        video.addEventListener(evento, listo, { once: true })
        video.addEventListener('error', fallo, { once: true })
        corte.signal.addEventListener('abort', fallo, { once: true })
        if (corte.signal.aborted) fallo()
      })
    }
    async function leer() {
      const listo = esperar('loadeddata')
      video.src = src
      video.load()
      await listo
      if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) return
      const lienzo = document.createElement('canvas')
      lienzo.width = 160
      lienzo.height = Math.max(1, Math.round(160 * video.videoHeight / video.videoWidth))
      // Los verticales tampoco necesitan decodificarse a tamaño de exportación.
      if (lienzo.height > 90) { lienzo.width = Math.max(1, Math.round(90 * video.videoWidth / video.videoHeight)); lienzo.height = 90 }
      const g = lienzo.getContext('2d')
      if (!g) return
      const imagenes: string[] = []
      for (let i = 0; i < 10 && !corte.signal.aborted; i++) {
        const t = Math.min(Math.max(0, video.duration - .05), video.duration * (i + .5) / 10)
        if (Math.abs(video.currentTime - t) > .001) {
          const buscado = esperar('seeked')
          video.currentTime = t
          await buscado
        }
        if (corte.signal.aborted) return
        g.drawImage(video, 0, 0, lienzo.width, lienzo.height)
        imagenes.push(lienzo.toDataURL('image/jpeg', .65))
        setCuadros([...imagenes])
      }
    }
    void leer().catch(() => {}).finally(() => { video.removeAttribute('src'); video.load(); if (!corte.signal.aborted) setTerminado(true) })
    return () => { corte.abort(); video.removeAttribute('src'); video.load() }
  }, [src])
  return <div className="tira-video" aria-label="Fotogramas del video" aria-busy={!terminado}>
    {cuadros.map((src, i) => <img key={i} src={src} alt="" draggable={false} style={{ left: `${i * 10}%`, width: '10%' }} />)}
  </div>
}
