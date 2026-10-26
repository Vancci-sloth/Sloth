import { useEffect, useRef, useState } from 'react'
import type { ResultadoGitSloth, VistaCambiosSloth } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Segmento } from './Segmento'
import './CambiosSloth.css'

/** Ronda en vivo e historial junto al compositor de Sloth. Git usa todos los cambios globales del repo. */
export function CambiosSloth({ sessionId, ocupado, revision }: { sessionId: string; ocupado: boolean; revision: number }) {
  const [datos, setDatos] = useState<VistaCambiosSloth>()
  const [vista, setVista] = useState<'ronda' | 'global'>('ronda')
  const [elegido, setElegido] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [error, setError] = useState('')
  const [errorLectura, setErrorLectura] = useState('')
  const [gitAbierto, setGitAbierto] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [documentacion, setDocumentacion] = useState('')
  const [mostrarResultado, setMostrarResultado] = useState(false)
  const [automatico, setAutomatico] = useState(false)
  const ultimo = useRef('')
  const revisionQuieta = ocupado ? 0 : revision

  // La confirmación dura un momento; su contenido se conserva y se vuelve a ver al abrir Git.
  useEffect(() => {
    if (!mostrarResultado || guardando || error) return
    const reloj = setTimeout(() => {
      setMostrarResultado(false)
      setGitAbierto(false)
      setAbierto(false)
    }, 4000)
    return () => clearTimeout(reloj)
  }, [mostrarResultado, guardando, error])

  function recibir(nuevos: VistaCambiosSloth) {
    setDatos(nuevos)
    if (ultimo.current !== (nuevos.ronda?.id ?? '')) {
      ultimo.current = nuevos.ronda?.id ?? ''
      setElegido('')
    }
  }

  async function actualizar() { recibir(await api<VistaCambiosSloth>(`/api/sessions/${sessionId}/diff`)) }

  useEffect(() => {
    let vigente = true
    let reintento: ReturnType<typeof setTimeout> | undefined
    const cargar = () => api<VistaCambiosSloth>(`/api/sessions/${sessionId}/diff`).then((nuevos) => {
      if (!vigente) return
      recibir(nuevos)
      setErrorLectura('')
    }).catch((e) => {
      if (!vigente) return
      const mensaje = e instanceof Error ? e.message : String(e)
      setErrorLectura(mensaje.includes('aún no conoce esta función') ? 'Preparando el registro de cambios…' : mensaje)
    }).finally(() => {
      if (vigente && (abierto || gitAbierto)) reintento = setTimeout(cargar, 5000)
    })
    cargar()
    return () => { vigente = false; clearTimeout(reintento) }
  }, [sessionId, ocupado, revisionQuieta, abierto, gitAbierto])

  const cambio = elegido ? datos?.historial.find((c) => c.id === elegido) : datos?.ronda
  const archivos = (vista === 'global' ? datos?.globales : cambio?.archivos) ?? []
  const sumadas = archivos.reduce((n, a) => n + a.sumadas, 0)
  const quitadas = archivos.reduce((n, a) => n + a.quitadas, 0)
  const bloqueado = ocupado || guardando || !!datos?.git.ocupado

  async function guardar(operacion: 'commit' | 'commit-push' | 'push' | 'auto') {
    if (!datos || bloqueado) return
    setGuardando(true)
    setMostrarResultado(false)
    setError('')
    setAviso('')
    setDocumentacion('')
    setAutomatico(operacion === 'auto')
    try {
      const result = await api<ResultadoGitSloth>(`/api/sessions/${sessionId}/git`, { operacion, mensaje, revision: datos.git.revision })
      setAviso(result.commit ? `Commit ${result.commit.slice(0, 7)} creado${result.push ? ' y enviado' : ''}.` : 'Push completado.')
      setDocumentacion(result.mensaje ?? '')
      setMostrarResultado(!result.errorPush)
      if (result.errorPush) setError(`El commit quedó guardado. El push falló: ${result.errorPush}`)
      else setMensaje('')
      await actualizar()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await actualizar().catch(() => {})
    } finally { setGuardando(false) }
  }

  if (!datos) return <div className="sloth-cambios-error muted small">{errorLectura || 'Cargando cambios…'}</div>

  return (
    <div className="sloth-cambios">
      <div className="sloth-cambios-barra">
        <button className="sloth-cambios-toggle" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
          <span aria-hidden>{abierto ? '▾' : '▸'}</span>
          <span>{vista === 'global' ? 'Globales' : elegido ? 'Ronda anterior' : 'Ronda actual'} · {archivos.length} {archivos.length === 1 ? 'archivo' : 'archivos'}</span>
          <span className="sloth-diff-mas">+{sumadas}</span>
          <span className="sloth-diff-menos">−{quitadas}</span>
          {vista === 'ronda' && cambio?.enCurso && <span className="muted small">en vivo</span>}
        </button>
        <button className="sloth-cambios-revertir" disabled={bloqueado} aria-expanded={gitAbierto} onClick={() => {
          const abrir = !gitAbierto
          setMostrarResultado(false)
          setGitAbierto(abrir)
          setVista('global')
          setAbierto(abrir)
        }}>Git ▾</button>
        {vista === 'ronda' && cambio?.revertido ? <span className="muted small">Revertido</span> : vista === 'ronda' && cambio && archivos.length > 0 && (
          <button className="sloth-cambios-revertir" disabled={bloqueado || cambio.enCurso} onClick={() => setConfirmar(true)} title="Restaurar los archivos a como estaban antes de esta ronda">↶ Revertir</button>
        )}
      </div>
      {abierto && (
        <div className="sloth-cambios-detalle">
          <div className="sloth-cambios-vistas">
            <Segmento<'ronda' | 'global'> label="Cambios que quieres ver" valor={vista} opciones={[{ id: 'ronda', texto: 'Ronda actual' }, { id: 'global', texto: `Globales · ${datos.globales.length}` }]} onCambio={setVista} />
          </div>
          {vista === 'ronda' && datos.historial.some((c) => c.id !== datos.ronda?.id) && (
            <select aria-label="Ronda cuyos cambios quieres ver" value={elegido} onChange={(e) => setElegido(e.target.value)}>
              <option value="">Ronda actual</option>
              {datos.historial.filter((c) => c.id !== datos.ronda?.id).map((c) => <option key={c.id} value={c.id}>Ronda anterior · {new Date(c.inicio).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{c.revertido ? ' · Revertida' : ''}</option>)}
            </select>
          )}
          {vista === 'global' && <p className="sloth-cambios-ayuda muted small">Todo lo pendiente de commit en {datos.git.rama || 'este repo'}, incluyendo rondas anteriores.</p>}
          <div className="sloth-cambios-archivos">
            {archivos.map((a) => (
              <details key={`${vista === 'global' ? 'global' : cambio?.id}:${a.ruta}`} className="sloth-diff-archivo">
                <summary>
                  <span className="sloth-diff-ruta" title={a.ruta}>{a.ruta}</span>
                  {a.tipo !== 'modificado' && <span className="muted small">{a.tipo}</span>}
                  {a.binario ? <span className="muted small">binario</span> : <><span className="sloth-diff-mas">+{a.sumadas}</span><span className="sloth-diff-menos">−{a.quitadas}</span></>}
                </summary>
                {a.diff && <pre className="sloth-diff-codigo">{a.diff.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') ? 'sumada' : l.startsWith('-') ? 'quitada' : l.startsWith('@@') ? 'ubicacion' : ''}>{l || ' '}</span>)}</pre>}
                {a.binario && <p className="muted small">El contenido de este archivo cambió.</p>}
                {a.truncado && <p className="muted small">Vista abreviada. Las acciones incluyen el archivo completo.</p>}
                {!a.diff && !a.binario && !a.truncado && <p className="muted small">Archivo vacío {a.tipo}.</p>}
              </details>
            ))}
          </div>
          {archivos.length === 0 && <p className="sloth-cambios-ayuda muted small">{vista === 'global' ? 'No hay cambios pendientes de commit.' : cambio?.enCurso ? 'Esta ronda aún no ha cambiado archivos.' : 'Esta ronda no tiene cambios registrados.'}</p>}
        </div>
      )}
      {gitAbierto && (
        <form className="sloth-cambios-git" onSubmit={(e) => { e.preventDefault(); guardar('commit') }}>
          <span className="muted small">{datos.git.rama || 'Sin rama'}{datos.git.remoto ? ` → ${datos.git.remoto}/${datos.git.destino?.replace(/^refs\/heads\//, '')}` : ' · Sin remoto'} · El commit incluye los {datos.globales.length} archivos globales.</span>
          <input aria-label="Mensaje del commit" placeholder="Mensaje del commit…" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={1000} disabled={bloqueado} autoFocus />
          <div className="sloth-cambios-git-acciones">
            <button className="sloth-git-auto" type="button" title="Documentar los cambios, hacer commit y push automáticamente" disabled={bloqueado || !datos.globales.length || !datos.git.remoto || datos.git.conflictos || !datos.git.rama} onClick={() => guardar('auto')}>✦ Auto</button>
            <button type="submit" disabled={bloqueado || !mensaje.trim() || !datos.globales.length || datos.git.conflictos || !datos.git.rama}>Solo commit</button>
            <button type="button" disabled={bloqueado || !mensaje.trim() || !datos.globales.length || !datos.git.remoto || datos.git.conflictos || !datos.git.rama} onClick={() => guardar('commit-push')}>Commit y push</button>
            <button type="button" disabled={bloqueado || !datos.git.remoto || datos.git.conflictos || !datos.git.rama} onClick={() => guardar('push')}>Solo push</button>
            {guardando && <span className="muted small">{automatico ? 'Documentando y subiendo…' : 'Guardando…'}</span>}
          </div>
          {datos.git.conflictos && <span className="bad small">Resuelve los conflictos de Git antes de continuar.</span>}
        </form>
      )}
      {(mostrarResultado || gitAbierto) && aviso && <p className="sloth-cambios-aviso small" role="status">{aviso}</p>}
      {(mostrarResultado || gitAbierto) && documentacion && <details className="sloth-git-documentacion" onToggle={(e) => {
        if (e.currentTarget.open) { setMostrarResultado(false); setGitAbierto(true) }
      }}><summary>Documentación del commit</summary><pre>{documentacion}</pre></details>}
      {(error || errorLectura) && <p className="bad small">{error || errorLectura}</p>}
      {confirmar && cambio && <Confirm title="Revertir los cambios de esta ronda" action="Revertir" onClose={() => setConfirmar(false)} onConfirm={async () => {
        await api(`/api/sessions/${sessionId}/revertir`, { cambioId: cambio.id })
        await actualizar()
        setError('')
      }}>Se restaurarán {cambio.archivos.length} {cambio.archivos.length === 1 ? 'archivo' : 'archivos'} al estado anterior a esta ronda. Si alguno cambió después, Sloth te avisará y conservará los archivos actuales.</Confirm>}
    </div>
  )
}
