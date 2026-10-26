import { useEffect, useState } from 'react'
import { duration, ESTADO_SUBAGENTE, lineaDeSubagente, modeloDeSubagente, type EstadoSubagente, type Subagente } from './items'
import { Logo } from './Logos'

/**
 * Los subagentes como en T3 Code: cada uno es una fila con su estado, lo último que hace y su tiempo, y los que el
 * agente lanza juntos van en un grupo. Abrir uno enseña lo suyo en el chat (`Timeline`) y su barra en el sitio del
 * compositor. `proveedor` es el del hilo: sus subagentes son del mismo.
 */

const PUNTO: Record<EstadoSubagente, string> = { running: 'running', completed: 'ok', failed: 'error', stopped: '' }

function Avatar({ proveedor, estado }: { proveedor: string; estado?: EstadoSubagente }) {
  return (
    <span className="sub-avatar">
      <Logo de={proveedor} chico />
      {estado && <span className={`dot ${PUNTO[estado]}`} />}
    </span>
  )
}

/** Lo que lleva o lo que tardó; mientras trabaja, cuenta solo. Sin `desde` (un hilo de antes) no se sabe. */
function Tiempo({ desde, hasta, vivo }: { desde?: number; hasta?: number; vivo: boolean }) {
  const [ahora, setAhora] = useState(Date.now)
  useEffect(() => {
    if (!vivo) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [vivo])
  const fin = vivo ? ahora : hasta
  return desde && fin ? <>{duration(fin - desde)}</> : null
}

export function FilaSubagente({ s, proveedor, onAbrir }: { s: Subagente; proveedor: string; onAbrir(id: string): void }) {
  const linea = lineaDeSubagente(s)
  const estado = ESTADO_SUBAGENTE[s.estado]
  return (
    <button className={`sub-fila ${s.estado}`} title={[modeloDeSubagente(s), estado].filter(Boolean).join(' · ')} onClick={() => onAbrir(s.id)}>
      <Avatar proveedor={proveedor} estado={s.estado} />
      <span className="sub-texto">
        <span className="sub-titulo">
          <b>{s.titulo}</b>
          {linea && s.estado !== 'completed' && <small>{estado}</small>}
        </span>
        <span className="sub-linea">{linea || estado}</span>
      </span>
      <span className="sub-tiempo">
        <Tiempo desde={s.desde} hasta={s.hasta} vivo={s.estado === 'running'} />
      </span>
      <span className="sub-flecha">›</span>
    </button>
  )
}

/** Cuántos van en cada estado: «1 trabajando · 2 listos». */
function resumen(subs: Subagente[]) {
  const formas: [EstadoSubagente, string, string][] = [['running', 'trabajando', 'trabajando'], ['completed', 'listo', 'listos'], ['failed', 'falló', 'fallaron'], ['stopped', 'detenido', 'detenidos']]
  return formas
    .map(([estado, uno, varios]) => [subs.filter((s) => s.estado === estado).length, uno, varios] as const)
    .filter(([n]) => n)
    .map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`)
    .join(' · ')
}

/** Los que el agente lanzó juntos, plegados en una fila. Su tiempo va del primero que empezó al último que acabó. */
export function GrupoSubagentes({ subs, proveedor, abierto, onPlegar, onAbrir }: { subs: Subagente[]; proveedor: string; abierto: boolean; onPlegar(abierto: boolean): void; onAbrir(id: string): void }) {
  const vivo = subs.some((s) => s.estado === 'running')
  const fallo = subs.some((s) => s.estado === 'failed')
  const sabido = subs.every((s) => s.desde)
  const desde = sabido ? Math.min(...subs.map((s) => s.desde!)) : undefined
  const hasta = sabido && !vivo && subs.every((s) => s.hasta) ? Math.max(...subs.map((s) => s.hasta!)) : undefined
  return (
    <div className={`sub-grupo ${abierto || vivo ? 'activo' : ''}`}>
      <button className="sub-fila" aria-expanded={abierto} onClick={() => onPlegar(!abierto)}>
        <span className="sub-avatares">
          {subs.slice(0, 3).map((s) => (
            <Avatar key={s.id} proveedor={proveedor} />
          ))}
          {subs.length > 3 && <span className="sub-mas">+{subs.length - 3}</span>}
        </span>
        <span className="sub-texto">
          <span className="sub-titulo">
            <b>{subs.length} subagentes</b>
          </span>
          <span className={`sub-linea ${vivo ? 'vivo' : fallo ? 'bad' : ''}`}>{resumen(subs)}</span>
        </span>
        <span className="sub-tiempo">
          <Tiempo desde={desde} hasta={hasta} vivo={vivo} />
        </span>
        <span className="sub-flecha plegable">›</span>
      </button>
      {abierto && (
        <div className="sub-lista">
          {subs.map((s) => (
            <FilaSubagente key={s.id} s={s} proveedor={proveedor} onAbrir={onAbrir} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * En el sitio del compositor mientras se ve un subagente, como en T3 Code: su modelo, cómo va y la vuelta al hilo. No
 * se le escribe: trabaja por su cuenta y le contesta al agente.
 */
export function BarraSubagente({ s, proveedor, onVolver }: { s: Subagente; proveedor: string; onVolver(): void }) {
  const vivo = s.estado === 'running'
  return (
    <div className="session-composer">
      <div className="sub-barra" role="status">
        <Avatar proveedor={proveedor} estado={s.estado} />
        {s.modelo && <b>{s.modelo.charAt(0).toUpperCase() + s.modelo.slice(1)}</b>}
        {s.esfuerzo && <span className="muted">{s.esfuerzo}</span>}
        <span className="sub-barra-estado">
          {ESTADO_SUBAGENTE[s.estado]}
          {vivo && s.desde ? ' · ' : s.estado === 'completed' && s.desde && s.hasta ? ' en ' : ''}
          <Tiempo desde={s.desde} hasta={s.estado === 'completed' ? s.hasta : undefined} vivo={vivo} />
        </span>
        <span className="sub-barra-suya">Va por su cuenta</span>
        <button className="sub-volver" onClick={onVolver}>
          ↖ Volver al hilo
        </button>
      </div>
    </div>
  )
}
