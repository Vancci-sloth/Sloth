import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Model, VideoHecho } from '../../shared/types'
import { proveedorDe } from '../../shared/providers'
import type { BorradorYoutube, CatalogoYoutube, MiniaturaYoutube, VideoParaYoutube } from '../../shared/youtube'
import { fechaLocalYoutube, fechasYoutube, type RitmoYoutube } from '../../shared/youtube-fechas'
import { api } from './api'
import './Youtube.css'
import { YoutubeRecomendaciones } from './YoutubeRecomendaciones'
import { YoutubeEliminar } from './YoutubeEliminar'

/** La revisión por lote de YouTube: guarda borradores, exige revisar título y miniatura y confirma las fechas juntas. */
const enCurso = (v: VideoParaYoutube) => !!v.subida && ['cola', 'subiendo', 'preparando'].includes(v.subida.estado)
const bloqueado = (v: VideoParaYoutube) => enCurso(v) || v.subida?.estado === 'programado'
const consulta = (cardId?: string) => `/api/youtube/catalogo${cardId ? `?cardId=${encodeURIComponent(cardId)}` : ''}`
const fecha = (iso?: string) => iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : ''
const ESFUERZOS: Record<string, string> = { none: 'Sin razonamiento', minimal: 'Mínimo', low: 'Bajo', medium: 'Medio', high: 'Alto', xhigh: 'Muy alto', max: 'Máximo', ultra: 'Máximo' }
const ELECCION_YOUTUBE = 'youtube-agente'

export function YoutubeLote({ videos, cardId }: { videos: VideoHecho[]; cardId?: string }) {
  const [datos, setDatos] = useState<CatalogoYoutube | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const clave = videos.map((v) => `${v.ruta}|${v.t}`).join()
  const leer = () => api<CatalogoYoutube>(consulta(cardId)).then((r) => { setDatos(r); setError('') }, (e) => setError(e.message))
  useEffect(() => {
    let vivo = true
    api<CatalogoYoutube>(consulta(cardId)).then((r) => { if (vivo) setDatos(r) }, (e) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [clave, cardId])
  const trabajando = datos?.videos.some(enCurso)
  useEffect(() => {
    if (!trabajando) return
    const t = setInterval(leer, 5000)
    return () => clearInterval(t)
  }, [trabajando, cardId])
  if (!videos.length) return null
  const pendientes = datos?.videos.filter((v) => !bloqueado(v)) ?? []
  const programados = datos?.videos.filter((v) => v.subida?.estado === 'programado') ?? []
  return <>
    <section className="youtube-lote-barra">
      <div><strong>YouTube</strong><span className="muted small">{datos ? `Horizontales · ${pendientes.length} por revisar · ${programados.length} programados${trabajando ? ' · Subiendo el lote…' : ''}` : error || 'Buscando videos largos…'}</span></div>
      <div className="youtube-lote-acciones"><YoutubeEliminar videos={datos?.videos ?? []} onEliminar={async (r) => { await leer(); setAviso(r.quedan ? `${r.quedan} no se pudieron eliminar: siguen pendientes, en uso o Windows no los dejó mover.` : '') }} /><button className="primary" onClick={() => setAbierto(true)}>Revisar y programar{pendientes.length ? ` (${pendientes.length})` : ''}</button></div>
    </section>
    {aviso && <p className="bad small" role="status">{aviso}</p>}
    {abierto && createPortal(<RevisionYoutube cardId={cardId} cerrar={() => { setAbierto(false); void leer() }} onCambio={leer} />, document.body)}
  </>
}

export function RevisionYoutube({ cardId, ruta, cerrar, onCambio }: { cardId?: string; ruta?: string; cerrar(): void; onCambio?(): void }) {
  const [modelos, setModelos] = useState<Model[]>([])
  const [errorModelos, setErrorModelos] = useState('')
  const [agente, setAgente] = useState<{ model: string; effort?: string }>(() => {
    try { const r = JSON.parse(localStorage.getItem(ELECCION_YOUTUBE) ?? 'null'); return r && typeof r.model === 'string' ? r : { model: '' } } catch { return { model: '' } }
  })
  useEffect(() => {
    let vivo = true
    api<{ models: Model[] }>('/api/state').then((r) => {
      if (!vivo) return
      setModelos(r.models)
      if (!r.models.length) setErrorModelos('Los modelos aún se están cargando. Vuelve a abrir la revisión en unos segundos.')
      setAgente((a) => {
        const m = r.models.find((m) => m.id === a.model)
        return m ? { model: m.id, effort: m.efforts.includes(a.effort ?? '') ? a.effort : m.defaultEffort } : { model: '' }
      })
    }, (e) => { if (vivo) setErrorModelos(e.message) })
    return () => { vivo = false }
  }, [])
  function elegirAgente(model: string, effort?: string) {
    const elegido = { model, effort }
    setAgente(elegido)
    localStorage.setItem(ELECCION_YOUTUBE, JSON.stringify(elegido))
  }
  const modelo = modelos.find((m) => m.id === agente.model)
  const [catalogo, setCatalogo] = useState<CatalogoYoutube | null>(null)
  const [borradores, setBorradores] = useState<Record<string, BorradorYoutube>>({})
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [ritmo, setRitmo] = useState<RitmoYoutube>('diario')
  const [inicio, setInicio] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return fechaLocalYoutube(d.toISOString()) })
  const [sucio, setSucio] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [importando, setImportando] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [previa, setPrevia] = useState<{ src: string; video?: boolean } | null>(null)
  const guardando = useRef(false)
  const rutaNormal = (s: string) => s.replaceAll('\\', '/').toLowerCase()
  async function leer(inicial = false) {
    const r = await api<CatalogoYoutube>(consulta(cardId))
    if (ruta) r.videos = r.videos.filter((v) => rutaNormal(v.ruta) === rutaNormal(ruta))
    setCatalogo((antes) => ({ ...r, videos: r.videos.map((v) => ({ ...v, miniaturas: [...new Map([...(antes?.videos.find((a) => a.huella === v.huella)?.miniaturas ?? []), ...v.miniaturas].map((m) => [m.ruta, m])).values()] })) }))
    if (inicial) {
      const ocupadas = r.videos.flatMap((v) => v.borrador.cuando || v.subida?.datos?.cuando ? [v.borrador.cuando ?? v.subida!.datos!.cuando!] : [])
      const fechas = fechasYoutube(inicio, ritmo, r.videos.length, ocupadas)
      let n = 0
      setBorradores(Object.fromEntries(r.videos.map((v) => [v.huella, { ...v.borrador, cuando: v.borrador.cuando ?? fechas[n++] }])))
      setElegidos(new Set(r.videos.filter((v) => !bloqueado(v) && v.formato === 'horizontal').map((v) => v.huella)))
    } else setBorradores((bs) => Object.fromEntries(r.videos.map((v) => [v.huella, bloqueado(v) ? v.borrador : bs[v.huella] ?? v.borrador])))
    return r
  }
  useEffect(() => { let vivo = true; leer(true).catch((e) => { if (vivo) setError(e.message) }); return () => { vivo = false } }, [cardId, ruta])
  const trabajando = catalogo?.videos.some(enCurso)
  useEffect(() => {
    if (!trabajando) return
    const t = setInterval(() => leer().catch((e) => setError(e.message)), 2000)
    return () => clearInterval(t)
  }, [trabajando, cardId, ruta])
  function cambiar(v: VideoParaYoutube, cambios: Partial<BorradorYoutube>, editorial = true) {
    setBorradores((bs) => ({ ...bs, [v.huella]: { ...bs[v.huella], ...cambios, ...(editorial ? { revisado: false } : {}) } }))
    setSucio(true)
    setAviso('')
  }
  function seleccionar(h: string, si: boolean) { setElegidos((s) => { const nuevo = new Set(s); if (si) nuevo.add(h); else nuevo.delete(h); return nuevo }) }
  const pendientes = catalogo?.videos.filter((v) => !bloqueado(v) && v.formato === 'horizontal') ?? []
  const seleccionados = pendientes.filter((v) => elegidos.has(v.huella))
  const problema = (v: VideoParaYoutube) => {
    const b = borradores[v.huella]
    if (!b?.titulo.trim() || [...b.titulo].length > 100 || /[<>]/.test(b.titulo)) return 'Revisa el título (1–100 caracteres, sin < ni >).'
    if (new TextEncoder().encode(b.descripcion).length > 5000 || /[<>]/.test(b.descripcion)) return 'Revisa la descripción (hasta 5000 bytes, sin < ni >).'
    if (!v.miniaturas.some((m) => m.ruta === b.miniatura && m.huella === b.huellaMiniatura)) return 'Falta elegir la miniatura actual.'
    if (!b.revisado) return 'Falta revisar el título y la miniatura.'
    if (!b.cuando || Date.parse(b.cuando) < Date.now() + 120_000) return 'Falta una fecha futura, con al menos dos minutos de margen.'
    return ''
  }
  const listos = seleccionados.filter((v) => !problema(v))
  const visibles = catalogo?.videos.filter((v) => {
    const b = borradores[v.huella]
    const coincide = `${b?.titulo ?? v.titulo} ${v.titulo} ${v.estilo}`.toLowerCase().includes(busqueda.toLowerCase())
    return coincide && (filtro === 'todos' || filtro === 'pendientes' && !bloqueado(v) || filtro === 'revisados' && b?.revisado && !bloqueado(v) || filtro === 'programados' && v.subida?.estado === 'programado' || filtro === 'errores' && v.subida?.estado === 'error')
  }) ?? []
  async function guardar() {
    const bs = pendientes.map((v) => borradores[v.huella]).filter(Boolean)
    if (bs.length) await api('/api/youtube/borradores', { borradores: bs })
    setSucio(false)
  }
  async function cerrarGuardando(irOpciones = false) {
    if (guardando.current || importando) return
    guardando.current = true
    setOcupado(true)
    try { if (sucio) await guardar(); cerrar(); if (irOpciones) location.hash = '/opciones' } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { guardando.current = false; setOcupado(false) }
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (document.querySelector('.modal-backdrop > .modal[role="dialog"]')) return; if (previa) setPrevia(null); else void cerrarGuardando() } }
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  async function programar() {
    if (guardando.current || seleccionados.length !== listos.length || !listos.length) return
    guardando.current = true
    setOcupado(true)
    setError('')
    try {
      await guardar()
      const r = await api<{ encolados: number }>('/api/youtube/programar', { borradores: listos.map((v) => borradores[v.huella]) })
      dispatchEvent(new Event('sloth-youtube'))
      setAviso(`${r.encolados} ${r.encolados === 1 ? 'video en cola' : 'videos en cola'}. Sloth los sube de uno en uno y YouTube los publica a su hora.`)
      setElegidos(new Set())
      await leer()
      onCambio?.()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { guardando.current = false; setOcupado(false) }
  }
  function distribuir() {
    const ocupadas = catalogo?.videos.flatMap((v) => !elegidos.has(v.huella) && (v.subida?.datos?.cuando || borradores[v.huella]?.cuando) ? [v.subida?.datos?.cuando ?? borradores[v.huella].cuando!] : []) ?? []
    const fechas = fechasYoutube(inicio, ritmo, seleccionados.length, ocupadas)
    setBorradores((bs) => { const nuevos = { ...bs }; seleccionados.forEach((v, n) => { nuevos[v.huella] = { ...bs[v.huella], cuando: fechas[n] } }); return nuevos })
    setSucio(true)
  }
  async function importar(v: VideoParaYoutube, file?: File) {
    if (!file) return
    setImportando(v.huella)
    setError('')
    try {
      if (file.size > 50 * 1024 * 1024 || !/\.(png|jpe?g)$/i.test(file.name)) throw new Error('Elige una miniatura PNG o JPEG de hasta 50 MB.')
      const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'No se pudo importar la miniatura.')
      const m = await api<MiniaturaYoutube>('/api/youtube/elegir-miniatura', { cardId: v.cardId, ruta: v.ruta, imagen: j.path })
      setCatalogo((c) => c && ({ ...c, videos: c.videos.map((a) => a.huella === v.huella ? { ...a, miniaturas: [...a.miniaturas.filter((i) => i.ruta !== m.ruta), m] } : a) }))
      cambiar(v, { miniatura: m.ruta, huellaMiniatura: m.huella })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setImportando('') }
  }
  async function quitar(v: VideoParaYoutube) {
    try { await api('/api/youtube/quitar', { cardId: v.cardId, ruta: v.ruta }); await leer(); onCambio?.() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return <div className="modal-backdrop" onClick={() => void cerrarGuardando()}>
    <section className="youtube-revision" role="dialog" aria-modal="true" aria-label="Revisar y programar YouTube" onClick={(e) => e.stopPropagation()}>
      <header className="youtube-revision-head">
        <div><h2>Revisar y programar YouTube</h2><p className="muted">{catalogo?.conexion.cuenta?.nombre ?? 'Prepara tus publicaciones'} · Revisa el título junto a su miniatura antes de programar.</p></div>
        <button className="ghost" aria-label="Cerrar revisión" disabled={ocupado} onClick={() => void cerrarGuardando()}>✕</button>
      </header>
      <div className="youtube-revision-controles">
        <div className="youtube-herramientas">
          <label>Agente y modelo para las recomendaciones<select aria-label="Agente y modelo para YouTube" value={agente.model} disabled={!modelos.length} onChange={(e) => elegirAgente(e.target.value, modelos.find((m) => m.id === e.target.value)?.defaultEffort)}>
            <option value="">Elegir agente y modelo…</option>
            {(['claude', 'codex'] as const).map((p) => <optgroup label={p === 'claude' ? 'Claude' : 'Codex'} key={p}>{modelos.filter((m) => proveedorDe(m.id) === p).map((m) => <option value={m.id} key={m.id}>{p === 'claude' ? 'Claude' : 'Codex'} · {m.label.replace(/^(?:Codex|Claude)(?:\s*·\s*|\s+)/, '')}</option>)}</optgroup>)}
          </select></label>
          {!!modelo?.efforts.length && <label>Esfuerzo<select aria-label="Esfuerzo para YouTube" value={agente.effort ?? ''} onChange={(e) => elegirAgente(agente.model, e.target.value)}>{modelo.efforts.map((e) => <option key={e} value={e}>{ESFUERZOS[e] ?? e}</option>)}</select></label>}
          <span className="muted small">Tu elección se usa para título, miniatura y descripción, y se recuerda para la próxima vez.</span>
          {errorModelos && <p className="bad small">{errorModelos}</p>}
        </div>
        {!catalogo?.conexion.programar && catalogo && <p className="youtube-nota">Puedes guardar la revisión. Para programar, <a href="#/opciones" onClick={(e) => { e.preventDefault(); void cerrarGuardando(true) }}>vuelve a conectar YouTube en Opciones → Redes</a> y concede el permiso de editar las publicaciones.</p>}
        <div className="youtube-herramientas"><label>Buscar<input aria-label="Buscar videos para YouTube" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Título o estilo…" /></label><label>Ver<select aria-label="Filtrar publicaciones" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="pendientes">Pendientes</option><option value="revisados">Revisados</option><option value="programados">Programados</option><option value="errores">Fallaron</option></select></label>
          <button className="boton" disabled={ocupado} onClick={() => setElegidos(new Set(pendientes.map((v) => v.huella)))}>Seleccionar pendientes ({pendientes.length})</button>
          <button className="ghost" onClick={() => setElegidos(new Set())}>Quitar selección</button>
        </div>
        <div className="youtube-herramientas"><label>Primera publicación<input aria-label="Primera publicación" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label><label>Ritmo<select aria-label="Ritmo de publicación" value={ritmo} onChange={(e) => setRitmo(e.target.value as RitmoYoutube)}><option value="diario">Uno al día</option><option value="semana">Lunes, miércoles y viernes</option><option value="manual">Fechas a mano</option></select></label>
          <button className="boton" disabled={ritmo === 'manual' || !seleccionados.length || ocupado || !inicio} onClick={distribuir}>Asignar fechas a la selección</button><span className="muted small">Hora local · {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
      </div>
      <div className="youtube-revision-lista">
        {!catalogo && <p className="muted">{error || 'Leyendo los videos y sus propuestas…'}</p>}
        {catalogo && !visibles.length && <p className="muted">{catalogo.videos.length ? 'No hay videos con este filtro.' : 'No hay videos largos terminados en esta selección.'}</p>}
        {visibles.map((v) => {
          const b = borradores[v.huella] ?? v.borrador
          const m = v.miniaturas.find((m) => m.ruta === b.miniatura && m.huella === b.huellaMiniatura)
          const cerrado = bloqueado(v) || ocupado
          const s = v.subida
          return <article className={`youtube-publicacion${elegidos.has(v.huella) && !bloqueado(v) ? ' seleccionada' : ''}`} key={v.huella}>
            <label className="youtube-seleccion"><input type="checkbox" aria-label={`Seleccionar ${b.titulo}`} checked={elegidos.has(v.huella) && !bloqueado(v)} disabled={cerrado || v.formato !== 'horizontal'} onChange={(e) => seleccionar(v.huella, e.target.checked)} /></label>
            <div className="youtube-portada">
              {m ? <button className="youtube-portada-imagen" onClick={() => setPrevia({ src: m.src })} title="Ver la miniatura en grande"><img src={m.src} alt={`Miniatura de ${b.titulo}`} loading="lazy" /></button> : <div className="youtube-sin-miniatura">Sin miniatura elegida</div>}
              <strong className="youtube-titulo-previa">{b.titulo || 'Título pendiente'}</strong>
              <span className="muted small">{v.estilo} · {Math.floor(v.duracion / 60)}:{String(Math.floor(v.duracion % 60)).padStart(2, '0')}</span>
              <div className="youtube-portada-acciones"><label className={`youtube-importar${cerrado ? ' desactivado' : ''}`}>{importando === v.huella ? 'Importando…' : 'Importar miniatura'}<input type="file" accept="image/png,image/jpeg" hidden disabled={cerrado || !!importando} onChange={(e) => { void importar(v, e.target.files?.[0]); e.target.value = '' }} /></label><button className="ghost" onClick={() => setPrevia({ src: v.src, video: true })}>Ver video</button></div>
              {v.miniaturas.length > 0 && <select aria-label={`Miniatura para ${b.titulo}`} value={m?.ruta ?? ''} disabled={cerrado} onChange={(e) => { const m = v.miniaturas.find((m) => m.ruta === e.target.value); cambiar(v, { miniatura: m?.ruta, huellaMiniatura: m?.huella }) }}><option value="">Elegir miniatura…</option>{v.miniaturas.map((m) => <option key={m.ruta} value={m.ruta}>{m.nombre}</option>)}</select>}
            </div>
            <fieldset className="youtube-publicacion-campos" disabled={cerrado}>
              <label>Título<input aria-label={`Título de ${v.titulo}`} value={b.titulo} maxLength={100} onChange={(e) => cambiar(v, { titulo: e.target.value })} /><span className="muted small">{[...b.titulo].length}/100</span></label>
              {v.alternativas.length > 0 && <details><summary>Alternativas de título ({v.alternativas.length})</summary><div className="youtube-alternativas">{v.alternativas.map((titulo) => <button type="button" key={titulo} onClick={() => cambiar(v, { titulo })}>{titulo}</button>)}</div></details>}
              <label>Descripción<textarea aria-label={`Descripción de ${v.titulo}`} rows={3} value={b.descripcion} onChange={(e) => cambiar(v, { descripcion: e.target.value })} /></label>
              {v.propuesta && <details><summary>Propuesta original de título y miniatura</summary><pre className="youtube-propuesta">{v.propuesta}</pre></details>}
              <div className="youtube-audiencia"><label><input type="checkbox" checked={b.infantil} onChange={(e) => cambiar(v, { infantil: e.target.checked })} />Creado para niños</label><label><input type="checkbox" checked={b.sintetico} onChange={(e) => cambiar(v, { sintetico: e.target.checked })} />Material sintético que parece real</label></div>
            </fieldset>
            <div className="youtube-publicacion-fecha"><label>Publicación<input aria-label={`Fecha de ${v.titulo}`} type="datetime-local" value={fechaLocalYoutube(b.cuando)} disabled={cerrado} onChange={(e) => cambiar(v, { cuando: e.target.value ? new Date(e.target.value).toISOString() : undefined }, false)} /></label>
              <label className={`youtube-revisado${b.revisado ? ' listo' : ''}`}><input type="checkbox" checked={!!b.revisado} disabled={cerrado || !m || !b.titulo.trim() || [...b.titulo].length > 100} onChange={(e) => cambiar(v, { revisado: e.target.checked }, false)} />Título y miniatura revisados</label>
              <span className={`youtube-estado${s?.estado === 'error' ? ' bad' : s?.estado === 'programado' ? ' listo' : ''}`}>{s?.estado === 'programado' ? `Programado · ${fecha(s.datos?.cuando)}` : s?.estado === 'cola' ? 'En cola' : s?.estado === 'subiendo' ? `Subiendo · ${Math.floor(s.enviados / s.total * 100)} %` : s?.estado === 'preparando' ? 'Aplicando miniatura y fecha…' : s?.estado === 'error' ? 'Falló · Puedes reintentar' : s?.id ? 'Subido · Sin fecha' : b.revisado ? 'Revisado' : 'Pendiente de revisión'}</span>
              {enCurso(v) && <progress aria-label={`Avance de ${b.titulo}`} value={s!.enviados} max={s!.total} />}
              {s?.error && <p className="bad small">{s.error}</p>}
              {v.formato === 'desconocido' && <p className="bad small">No se pudo leer el formato del video.</p>}
              {!cerrado && elegidos.has(v.huella) && problema(v) && <p className="muted small">{problema(v)}</p>}
              {s?.id && <a className="small" href={`https://studio.youtube.com/video/${encodeURIComponent(s.id)}/edit`} target="_blank" rel="noreferrer">Abrir en YouTube Studio</a>}
              {s?.estado === 'cola' && !s.id && <button className="ghost small" onClick={() => void quitar(v)}>Quitar de la cola</button>}
              <YoutubeEliminar videos={[v]} individual disabled={ocupado || !!importando} onEliminar={async (r) => { await leer(); onCambio?.(); if (r.quedan) setError('El archivo sigue en uso o Windows no lo dejó mover. Puedes reintentarlo.') }} />
            </div>
            <YoutubeRecomendaciones video={v} cerrado={cerrado} agente={modelo ? agente : undefined} tituloActual={b.titulo} descripcionActual={b.descripcion} usarDescripcion={(descripcion) => cambiar(v, { descripcion })} usarTitulo={(titulo) => cambiar(v, { titulo })} verImagen={(src) => setPrevia({ src })} />
          </article>
        })}
      </div>
      <footer className="youtube-revision-pie">
        <div><strong>{listos.length} de {seleccionados.length} seleccionados listos</strong><span className="muted small">{sucio ? 'Cambios sin guardar.' : 'Puedes cerrar y continuar la revisión después.'} Los videos se suben privados y se publican en las fechas elegidas.</span>{error && <p className="bad small" role="alert">{error}</p>}{aviso && <p className="youtube-terminado small" role="status">{aviso}</p>}</div>
        <button className="ghost" disabled={ocupado || !!importando} onClick={() => void cerrarGuardando()}>Guardar y cerrar</button>
        <button className="primary" disabled={ocupado || !!importando || !catalogo?.conexion.programar || !listos.length || listos.length !== seleccionados.length} onClick={() => void programar()}>{ocupado ? 'Guardando…' : `Programar ${listos.length} ${listos.length === 1 ? 'video' : 'videos'}`}</button>
      </footer>
      {previa && <div className="youtube-previa" onClick={() => setPrevia(null)}><button className="primary" onClick={() => setPrevia(null)}>Cerrar vista</button>{previa.video ? <video src={previa.src} controls autoPlay onClick={(e) => e.stopPropagation()} /> : <img src={previa.src} alt="Miniatura completa" />}</div>}
    </section>
  </div>
}
