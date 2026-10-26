import { useEffect, useRef, useState } from 'react'
import type { EstadoRecomendacionYoutube, VideoParaYoutube } from '../../shared/youtube'
import { api } from './api'

/** Las sugerencias se guardan aparte: elegir un título exige volver a revisar la publicación. */
export function YoutubeRecomendaciones({ video: v, cerrado, agente, tituloActual, descripcionActual, usarDescripcion, usarTitulo, verImagen }: { video: VideoParaYoutube; cerrado: boolean; agente?: { model: string; effort?: string }; tituloActual: string; descripcionActual: string; usarDescripcion(descripcion: string): void; usarTitulo(titulo: string): void; verImagen(src: string): void }) {
  const [estado, setEstado] = useState(v.recomendacion)
  const [tema, setTema] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const rellenar = useRef<{ titulo: string; descripcion: string } | null>(null)
  useEffect(() => { if (v.recomendacion) setEstado(v.recomendacion) }, [v.recomendacion])
  const trabajando = estado?.estado === 'trabajando' || estado?.estado === 'cola'
  useEffect(() => {
    if (!trabajando) return
    let vivo = true
    const t = setInterval(() => {
      api<EstadoRecomendacionYoutube | null>(`/api/youtube/recomendacion?${new URLSearchParams({ cardId: v.cardId, ruta: v.ruta })}`).then((r) => { if (vivo && r) { setEstado(r); setError('') } }, (e) => { if (vivo) setError(e.message) })
    }, 2000)
    return () => { vivo = false; clearInterval(t) }
  }, [trabajando, v.cardId, v.ruta])
  useEffect(() => {
    if (enviando || !rellenar.current || !estado || trabajando) return
    const pedido = rellenar.current
    rellenar.current = null
    if (estado.estado === 'error' || !estado.descripcion) return
    if (cerrado || pedido.descripcion !== descripcionActual || pedido.titulo !== tituloActual) {
      setAviso('Conservé tus cambios. Puedes aplicar la descripción sugerida con el botón de abajo.')
      return
    }
    usarDescripcion(estado.descripcion.texto)
    setAviso('Descripción rellenada. Puedes editarla arriba antes de guardar.')
  }, [estado, trabajando, enviando, cerrado, descripcionActual, tituloActual, usarDescripcion])
  async function recomendar(tipo: 'titulo' | 'miniatura' | 'descripcion') {
    if (!agente?.model) return
    setEnviando(true); setError(''); setAviso('')
    if (tipo === 'descripcion') rellenar.current = { titulo: tituloActual, descripcion: descripcionActual }
    try { setEstado(await api<EstadoRecomendacionYoutube>('/api/youtube/recomendar', { cardId: v.cardId, ruta: v.ruta, tipo, ...agente, ...(tipo === 'descripcion' ? { titulo: tituloActual } : {}), ...(tema.trim() ? { tema: tema.trim() } : {}) })) }
    catch (e) { rellenar.current = null; setError(e instanceof Error ? e.message : String(e)) }
    finally { setEnviando(false) }
  }
  const r = estado?.resultado
  return <section className="youtube-recomendaciones" aria-label={`Recomendaciones para ${v.titulo}`}>
    <div className="youtube-recomendar-acciones">
      <button className="boton" disabled={cerrado || enviando || trabajando || !agente?.model} onClick={() => void recomendar('titulo')}>Recomendar título</button>
      <button className="boton" disabled={cerrado || enviando || trabajando || !agente?.model} onClick={() => void recomendar('miniatura')}>Recomendar miniatura</button>
      <button className="boton" disabled={cerrado || enviando || trabajando || !agente?.model || !tituloActual.trim()} onClick={() => void recomendar('descripcion')}>Rellenar descripción con IA</button>
      <details><summary>Ajustar tema de búsqueda</summary><label className="small">Tema o enfoque (opcional)<input aria-label={`Tema para recomendar ${v.titulo}`} maxLength={200} placeholder="Se obtiene del guion y del video" value={tema} disabled={cerrado || enviando || trabajando} onChange={(e) => setTema(e.target.value)} /></label></details>
    </div>
    <p className="muted small">Título y miniatura se analizan juntos con el guion y referencias de YouTube. Puedes pedir recomendaciones en varios videos: se procesan dos a la vez y los demás quedan en cola. Las sugerencias se guardan para continuar después.</p>
    {!agente?.model && <p className="muted small">Elige el agente y modelo arriba para usar IA.</p>}
    {trabajando && <p className="youtube-estado" role="status">{estado.fase}{estado.modelo ? ` · ${estado.modelo.replace(/^codex:/, 'Codex · ')}` : ''}</p>}
    {(error || estado?.error) && <p className="bad small" role="alert">{error || estado?.error}</p>}
    {aviso && <p className="muted small" role="status">{aviso}</p>}
    {estado?.descripcion && <details><summary>Descripción sugerida</summary><pre className="youtube-propuesta">{estado.descripcion.texto}</pre><p className="muted small">{estado.descripcion.razon}</p><button className="ghost" disabled={cerrado || trabajando || enviando} onClick={() => { usarDescripcion(estado.descripcion!.texto); setAviso('Descripción aplicada. Puedes editarla arriba antes de guardar.') }}>Usar esta descripción</button></details>}
    {!r && (v.tituloPropuesto || v.miniaturaPropuesta) && <div className="youtube-sugerencia-anterior">
      <strong>Recomendación anterior</strong><span className="muted small">{v.propuestaFuente}</span>
      {v.tituloPropuesto && <div className="youtube-titulo-sugerido"><span>{v.tituloPropuesto}</span><button className="ghost" disabled={cerrado} onClick={() => usarTitulo(v.tituloPropuesto!)}>Usar este título</button></div>}
      {v.miniaturaPropuesta && <div><strong className="small">Miniatura propuesta</strong><p className="youtube-concepto">{v.miniaturaPropuesta}</p></div>}
    </div>}
    {r && <>
      <div className="youtube-sugerencias">
        <div><strong>Título recomendado</strong><div className="youtube-titulo-sugerido"><span>{r.titulo.principal}</span><button className="ghost" disabled={cerrado} onClick={() => usarTitulo(r.titulo.principal)}>Usar este título</button></div><p className="muted small">{r.titulo.razon}</p>
          <details><summary>Otros títulos ({r.titulo.alternativas.length})</summary><div className="youtube-alternativas">{r.titulo.alternativas.map((t) => <button key={t} disabled={cerrado} onClick={() => usarTitulo(t)}>{t}</button>)}</div></details>
        </div>
        <div><strong>Miniatura recomendada · Concepto</strong><p className="youtube-concepto">{r.miniatura.concepto}</p>{r.miniatura.texto && <p className="small">Texto en la imagen: <strong>{r.miniatura.texto}</strong></p>}<p className="small youtube-concepto">{r.miniatura.composicion}</p><p className="muted small">{r.miniatura.razon}</p><details><summary>Prompt para crear la miniatura</summary><pre className="youtube-propuesta">{r.miniatura.prompt}</pre></details><p className="muted small">Es una propuesta visual. Para publicarla, crea la imagen e impórtala como miniatura arriba.</p></div>
      </div>
      <details className="youtube-evidencia" open><summary>Análisis y referencias · {r.tema}</summary><p className="youtube-concepto">{r.analisis}</p>
        <div className="youtube-referencias">{r.referencias.map((ref) => <article key={ref.id}>
          {ref.miniatura && <button className="youtube-portada-imagen" onClick={() => verImagen(ref.miniatura!)} title={`Ampliar miniatura de ${ref.titulo}`}><img src={ref.miniatura} alt={`Referencia: ${ref.titulo}`} loading="lazy" /></button>}
          <a href={ref.url} target="_blank" rel="noreferrer">{ref.titulo}</a><span className="muted small">{ref.canal} · {ref.vistas.toLocaleString('es-MX')} vistas{ref.fecha ? ` · ${ref.fecha}` : ''}</span>
          <span className="muted small">{ref.x !== undefined ? `${ref.x.toFixed(1)}× la mediana de ${ref.muestra} videos de su canal` : 'Sin comparación suficiente con su canal'} · {ref.origen}</span>
          <span className="muted small">{ref.transcripcion ? 'Extracto de transcripción analizado' : 'Contenido: título y descripción'} · {ref.miniatura ? 'Miniatura inspeccionada' : 'Sin análisis visual'}</span>
          <span className="muted small">Datos consultados el {new Date(ref.leido).toLocaleDateString('es-MX')}</span>
          {ref.observacion && <p className="small youtube-concepto">{ref.observacion}</p>}
        </article>)}</div>
        <details><summary>Contenido analizado y límites</summary><div className="youtube-fotogramas">{r.fotogramas.map((src, i) => <button className="youtube-portada-imagen" key={src} onClick={() => verImagen(src)}><img src={src} alt={`Fotograma ${i + 1} analizado del video`} loading="lazy" /></button>)}</div><ul>{r.limites.map((l, i) => <li key={i}>{l}</li>)}</ul><p className="muted small">Análisis del {new Date(r.fecha).toLocaleString('es-MX')}. Se leen extractos de subtítulos cuando existen; no se ven completos los videos de referencia.</p></details>
      </details>
    </>}
  </section>
}
