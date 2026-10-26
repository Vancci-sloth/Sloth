import { useEffect, useState } from 'react'
import type { Espacio, GrupoEspacio, IdEspacio } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : '0 MB')
/** Lo que no vale un botón: menos de esto no se enseña. */
const MINIMO = 20e6

/**
 * Opciones → Espacio en disco (`server/espacio.ts`): cuánto queda libre y lo que Sloth y sus videos dejaron y ya no
 * hace falta. Lo seguro va junto en «Liberar» (y Sloth lo borra solo cada 6 horas); lo demás, cada uno con su botón.
 */
export function EspacioDisco() {
  const [e, setE] = useState<Espacio>()
  const [error, setError] = useState('')
  const [liberando, setLiberando] = useState<IdEspacio[] | 'seguros' | null>(null)

  const leer = () => api<Espacio>('/api/espacio').then(setE, (x) => setError(x.message))
  useEffect(() => void leer(), [])

  async function liberar(grupos?: IdEspacio[]) {
    setLiberando(grupos ?? 'seguros')
    setError('')
    try {
      setE(await api<Espacio>('/api/espacio', { grupos }))
    } catch (x) {
      setError(x instanceof Error ? x.message : String(x))
    } finally {
      setLiberando(null)
    }
  }

  const visibles = e?.grupos.filter((g) => g.bytes >= MINIMO) ?? []
  const seguros = visibles.filter((g) => g.seguro)
  const totalSeguro = seguros.reduce((n, g) => n + g.bytes, 0)
  const ocupado = liberando !== null

  return (
    <section className="grupo">
      <div className="grupo-titulo">
        <h2>Espacio en disco</h2>
        {totalSeguro > 0 && (
          <button className="boton" disabled={ocupado} onClick={() => liberar()}>
            {liberando === 'seguros' ? 'Liberando…' : `Liberar ${gb(totalSeguro)}`}
          </button>
        )}
      </div>
      <div className="panel">
        {!e ? (
          <div className="item fila muted small">{error || 'Midiendo lo que se puede borrar…'}</div>
        ) : (
          <>
            <div className="item">
              <div className="fila">
                <span className="logo" aria-hidden>
                  <Icono de="basura" />
                </span>
                <div className="fila-nombre">
                  <strong>{gb(e.libre)} libres de {gb(e.total)}</strong>
                  <span>
                    {e.liberado ? `Se liberaron ${gb(e.liberado)}. ` : ''}
                    {visibles.length ? 'Nada de esto es tuyo: tus videos terminados, tus grabaciones y tus guiones no se tocan.' : 'No hay nada que sobre.'}
                  </span>
                </div>
              </div>
            </div>
            {visibles.map((g) => (
              <Fila key={g.id} g={g} liberando={ocupado && (liberando === 'seguros' ? g.seguro : liberando.includes(g.id))} disabled={ocupado} onLiberar={() => liberar([g.id])} />
            ))}
          </>
        )}
      </div>
      {e && error && <p className="bad small fila-extra">{error}</p>}
      <p className="grupo-nota">Lo de «Liberar» Sloth también lo borra solo cada 6 horas, cuando nada trabaja. Lo que usa un hilo que está trabajando se queda para la próxima.</p>
    </section>
  )
}

function Fila({ g, liberando, disabled, onLiberar }: { g: GrupoEspacio; liberando: boolean; disabled: boolean; onLiberar(): void }) {
  return (
    <div className="item">
      <div className="fila">
        <div className="fila-nombre">
          <strong>{g.nombre}</strong>
          <span>{g.detalle}</span>
        </div>
        <span className="estado">{gb(g.bytes)}</span>
        <button className={g.seguro ? 'ghost small' : 'primary'} disabled={disabled} onClick={onLiberar}>
          {liberando ? 'Borrando…' : 'Borrar'}
        </button>
      </div>
    </div>
  )
}
