import { useEffect, useState } from 'react'
import type { LimitesClaude } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { reinicio } from './LimitesContexto'

type CuentaHilo = { alternativas: { id: string; quien: string }[] }

/** Muestra los límites del perfil del hilo y permite pasar su resumen a otra cuenta. */
export function LimiteClaude({ hilo, onSeguir, ocupado }: { hilo: string; onSeguir(): Promise<unknown>; ocupado: boolean }) {
  const [datos, setDatos] = useState<CuentaHilo>()
  const [limites, setLimites] = useState<LimitesClaude>()
  const [error, setError] = useState('')
  const [cambiando, setCambiando] = useState(false)
  const ruta = `/api/sessions/${hilo}/cuenta-claude`
  useEffect(() => {
    let vigente = true
    void api<CuentaHilo>(ruta).then(d => { if (vigente) setDatos(d) }, e => { if (vigente) setError(e.message) })
    void api<LimitesClaude>(`/api/claude/limites?hilo=${encodeURIComponent(hilo)}`).then(d => { if (vigente) setLimites(d) }, () => {})
    return () => { vigente = false }
  }, [hilo, ruta])

  if (limites?.llave) return null
  const ventanas = (limites?.ventanas ?? []).map(v => ({ ...v, queda: Math.max(0, Math.round(100 - v.uso)) }))
  const llenas = ventanas.filter(v => v.queda <= 10)
  const relevantes = llenas.length ? llenas : ventanas.sort((a, b) => a.queda - b.queda).slice(0, 1)

  async function seguirCon(id: string) {
    setCambiando(true)
    setError('')
    try {
      await api(ruta, { id })
      await onSeguir()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCambiando(false)
    }
  }

  return <>
    {relevantes.map(v => <span key={v.nombre} className="turn-ayuda-linea">
      {v.nombre}: <b className={v.queda <= 10 ? 'bad' : ''}>{v.queda} % disponible</b>
      {v.reinicia && ` · se restablece en ${reinicio(v.reinicia, Date.now())}`}
    </span>)}
    {error && <span className="turn-ayuda-linea bad">{error}</span>}
    {!!datos?.alternativas.length ? <Picker
      label="Seguir con otra cuenta de Claude"
      value=""
      disabled={ocupado || cambiando}
      groups={[{ label: 'Cuentas de Claude', options: datos.alternativas.map(c => ({ value: c.id, label: c.quien })) }]}
      onChange={id => void seguirCon(id)}
    /> : <a className="turn-ayuda-linea" href="#/opciones/agentes">Gestionar cuentas de Claude</a>}
  </>
}
