import { useEffect, useState } from 'react'
import type { CalendarioYoutube } from '../../shared/youtube'
import { diasYoutube } from '../../shared/youtube-fechas'
import { api } from './api'
import { Logo } from './Logos'
import './Redes.css'
import './Youtube.css'

/**
 * El calendario de YouTube permanece al limpiar videos locales; los puntos verdes son fechas confirmadas en el canal:
 * rellenos los que ya salieron (YouTube los publica a su hora), con borde los que esperan.
 */
const corta = (dia: string, hoy: string) => new Date(`${dia}T12:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(dia.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' } : {}) })
export function CalendarioYoutube() {
  const [datos, setDatos] = useState<CalendarioYoutube | null>(null)
  const [ahora, setAhora] = useState(() => new Date())
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    const leer = () => api<CalendarioYoutube>('/api/youtube/calendario').then((r) => { if (vivo) { setDatos(r); setAhora(new Date()); setError('') } }, (e) => { if (vivo) setError(e.message) })
    void leer()
    const t = setInterval(leer, datos?.pendientes ? 5000 : 60_000)
    addEventListener('sloth-youtube', leer)
    addEventListener('sloth-videos', leer)
    return () => { vivo = false; clearInterval(t); removeEventListener('sloth-youtube', leer); removeEventListener('sloth-videos', leer) }
  }, [!!datos?.pendientes])
  if (!datos?.cuenta) return error ? <p className="bad small">No se pudo leer el calendario de YouTube: {error}</p> : null
  const c = diasYoutube(datos.publicaciones, ahora, datos.siguiente)
  const salio = (p: { cuando: string }) => Date.parse(p.cuando) <= ahora.getTime()
  const deHoy = c.dias.find((d) => d.dia === c.hoy)?.publicaciones ?? []
  const salieron = deHoy.filter(salio).length
  return <div className="calendario-redes" aria-label="Calendario de YouTube">
    <div className="calendario-red">
      <Logo de="youtube" chico />
      <div className="calendario-dias youtube-calendario-dias">
        {c.dias.map(({ dia, publicaciones }, i) => {
          const anterior = c.dias[i - 1]?.dia
          const seguido = anterior && new Date(`${anterior}T12:00`)
          if (seguido) seguido.setDate(seguido.getDate() + 1)
          const salto = seguido && seguido.toLocaleDateString('sv') !== dia
          const n = publicaciones.length
          const etiqueta = dia === c.hoy ? 'hoy' : new Date(`${dia}T12:00`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', ...(dia.slice(0, 7) !== c.hoy.slice(0, 7) ? { month: 'short' } : {}), ...(dia.slice(0, 4) !== c.hoy.slice(0, 4) ? { year: 'numeric' } : {}) })
          const detalle = `${corta(dia, c.hoy)}: ${n ? `${n} ${n === 1 ? 'video programado' : 'videos programados'}` : 'sin videos programados'}${n ? '\n' + publicaciones.map((p) => `${new Date(p.cuando).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${salio(p) ? 'salió · ' : ''}${p.titulo}`).join('\n') : ''}`
          return <span className="youtube-calendario-fecha" key={dia}>{salto && <span className="muted" title="Hay un salto entre estas fechas">…</span>}<span className={`calendario-dia${n ? ' lleno' : ''}`} title={detalle} aria-label={detalle}><span>{etiqueta}</span><span className="puntos">{Array.from({ length: Math.min(n || 1, 5) }, (_, j) => <i className={publicaciones[j] && salio(publicaciones[j]) ? 'salio' : n ? 'si' : ''} key={j} />)}{n > 5 && <span>+{n - 5}</span>}</span></span></span>
        })}
      </div>
      <span className="calendario-texto"><strong>YouTube</strong>: {deHoy.length > 0 && <>hoy {salieron === deHoy.length ? (deHoy.length === 1 ? 'ya salió' : `ya salieron los ${deHoy.length}`) : `salieron ${salieron} de ${deHoy.length}`}. </>}{c.total ? <>{c.total} {c.total === 1 ? 'video programado' : 'videos programados'} hasta el <strong>{corta(c.ultimo!, c.hoy)}</strong>. </> : <>sin videos programados. </>}{datos.siguiente ? <>El siguiente va el <strong className="hueco">{corta(c.siguiente, c.hoy)}, a las {datos.siguiente.slice(11)}</strong>.</> : <>Próximo día libre (desde mañana): <strong className="hueco">{corta(c.siguiente, c.hoy)}</strong>.</>}{datos.pendientes > 0 && <> {datos.pendientes} pendientes de subir.</>}</span>
    </div>
    {error && <p className="bad small">No se pudo actualizar el calendario: {error}</p>}
  </div>
}
