import { useEffect, useState } from 'react'
import { IDIOMAS_PILOTO, type ConfigPiloto, type IdiomaPiloto, type TurnoPiloto, type VistaPiloto } from '../../shared/piloto'
import { api } from './api'
import { Icono } from './Iconos'
import './Piloto.css'

/**
 * Opciones → Piloto automático (`server/piloto.ts`): apagado por defecto. Un brief simple de la marca, cuántos videos al
 * día y a qué horas, el estilo de video y si se programan solos en las redes o quedan por revisar aquí.
 */

const ESTADO: Record<TurnoPiloto['estado'], string> = { hilo: 'Haciéndose', por_revisar: 'Por revisar', programado: 'En la cola de redes', error: 'Falló' }
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))
const lineas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function PilotoOpciones() {
  const [v, setV] = useState<VistaPiloto>()
  const [c, setC] = useState<ConfigPiloto>()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [abierta, setAbierta] = useState(false)

  const poner = (x: VistaPiloto) => (setV(x), setC((antes) => antes ?? x.config))
  useEffect(() => {
    const leer = () => api<VistaPiloto>('/api/piloto').then(poner, (e) => setError(e.message))
    leer()
    const t = setInterval(leer, 30_000)
    return () => clearInterval(t)
  }, [])

  async function hacer(f: () => Promise<VistaPiloto>) {
    setOcupado(true)
    setError('')
    try {
      const x = await f()
      setV(x)
      return x
    } catch (e) {
      setError(mensaje(e))
    } finally {
      setOcupado(false)
    }
  }

  if (!v || !c) return <div className="item fila muted small">{error || 'Mirando…'}</div>
  const set = <K extends keyof ConfigPiloto>(k: K, valor: ConfigPiloto[K]) => setC({ ...c, [k]: valor })
  const guardar = (cambios: Partial<ConfigPiloto> = c) => hacer(() => api<VistaPiloto>('/api/piloto', cambios))
  async function encender(si: boolean) {
    const x = await guardar({ ...c!, encendido: si })
    if (x) setC({ ...c!, encendido: x.config.encendido })
  }
  const activo = v.config.encendido
  const hora = (x: { fecha: string; hora: string }) => `${x.fecha.slice(8)}/${x.fecha.slice(5, 7)} ${x.hora}`

  return (
    <div className="item piloto">
      <div className="fila">
        <span className="logo" aria-hidden>
          <Icono de="calendario" />
        </span>
        <div className="fila-nombre">
          <strong>Piloto automático</strong>
          <span>
            {activo
              ? `Encendido: ${c.videosPorDia} ${c.videosPorDia === 1 ? 'video' : 'videos'} al día, ${c.publicarSolo ? 'programados solos en tus redes' : 'por revisar aquí antes de programarlos'}.`
              : 'Apagado. Hace unos videos al día a partir del brief de tu marca y los mete a la cola de redes.'}
          </span>
        </div>
        <button role="switch" aria-checked={activo} aria-label="Piloto automático" className={`interruptor${activo ? ' on' : ''}`} disabled={ocupado} onClick={() => encender(!activo)}>
          <span />
        </button>
        <button className="ghost small" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
          {abierta ? 'Cerrar' : 'Brief y horarios'}
        </button>
      </div>
      {abierta && (
        <div className="fila-extra piloto-form">
          <label>
            De qué trata la marca
            <textarea rows={2} value={c.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Una cafetería de barrio que tuesta su propio café" />
          </label>
          <label>
            A quién le habla
            <input value={c.publico} onChange={(e) => set('publico', e.target.value)} placeholder="Gente que toma café en casa" />
          </label>
          <label>
            Dolores o temas (uno por línea)
            <textarea rows={3} value={c.temas.join('\n')} onChange={(e) => set('temas', e.target.value.split('\n'))} onBlur={() => set('temas', lineas(c.temas.join('\n')))} />
          </label>
          <label>
            Ganchos (opcional, uno por línea)
            <textarea rows={3} value={c.ganchos.join('\n')} onChange={(e) => set('ganchos', e.target.value.split('\n'))} onBlur={() => set('ganchos', lineas(c.ganchos.join('\n')))} />
          </label>
          <div className="piloto-dos">
            <label>
              Llamada a la acción
              <input value={c.cta} onChange={(e) => set('cta', e.target.value)} placeholder="Pide tu bolsa" />
            </label>
            <label>
              Tono
              <input value={c.tono} onChange={(e) => set('tono', e.target.value)} placeholder="Cercano y con humor" />
            </label>
          </div>
          <div className="piloto-dos">
            <label>
              Idioma
              <select value={c.idioma} onChange={(e) => set('idioma', e.target.value as IdiomaPiloto)}>
                {Object.entries(IDIOMAS_PILOTO).map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estilo de video
              <select value={c.cardId} onChange={(e) => set('cardId', e.target.value)}>
                <option value="">El explicativo</option>
                {v.estilos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="piloto-dos">
            <label>
              Videos por día (1 a 6)
              <input type="number" min={1} max={6} value={c.videosPorDia} onChange={(e) => set('videosPorDia', Math.min(6, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <label>
              Horarios (HH:MM, separados por coma; hora de tu computadora, {v.zona})
              <input value={c.horarios.join(', ')} onChange={(e) => set('horarios', e.target.value.split(/[,\s]+/))} onBlur={() => set('horarios', c.horarios.filter(Boolean))} />
            </label>
          </div>
          <label className="piloto-check">
            <input type="checkbox" checked={c.publicarSolo} onChange={(e) => set('publicarSolo', e.target.checked)} />
            Programarlos solos en mis redes (si no, quedan aquí por revisar)
          </label>
          <div className="piloto-botones">
            <button className="boton" disabled={ocupado} onClick={() => guardar()}>
              Guardar
            </button>
            <button className="ghost small" disabled={ocupado || !c.marca.trim()} title="Hace el video del siguiente horario libre, aunque el piloto esté apagado" onClick={() => hacer(() => api<VistaPiloto>('/api/piloto/ahora', {}))}>
              Hacer uno ahora
            </button>
          </div>
        </div>
      )}
      {v.ultimos.length > 0 && (
        <div className="fila-extra piloto-turnos">
          {v.ultimos.map((t) => (
            <div key={t.id} className="piloto-turno">
              <span className="mono small">{hora(t)}</span>
              <span className="una-linea">{t.gancho || t.tema || 'Video'}</span>
              <span className={`small ${t.estado === 'error' ? 'falta' : 'muted'}`} title={t.error}>
                {ESTADO[t.estado]}
              </span>
              {(t.estado === 'por_revisar' || (t.estado === 'error' && t.ruta)) && (
                <button className="ghost small" disabled={ocupado} onClick={() => hacer(() => api<VistaPiloto>('/api/piloto/programar', { id: t.id }))}>
                  Programar
                </button>
              )}
              {t.estado !== 'hilo' && (
                <button className="ghost small" aria-label="Quitar de la lista" disabled={ocupado} onClick={() => hacer(() => api<VistaPiloto>('/api/piloto/descartar', { id: t.id }))}>
                  <Icono de="cerrar" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="fila-extra falta small">{error}</p>}
    </div>
  )
}
