import { useEffect, useRef, useState } from 'react'
import type { CuentaClaude, LimitesClaude } from '../../shared/types'
import { api } from './api'
import { reinicio } from './LimitesContexto'
import { MarcaAgente } from './Logos'

/** Lo que queda por debajo de esto ya cuenta como lleno: lo mismo que pinta de rojo «Uso». */
const LLENO = 10

/**
 * En el aviso «Llegaste al límite de tu plan de Claude» (`Fallo` en Timeline.tsx), sin abrir «Uso»: cuánto queda del límite
 * que se llenó y cuándo vuelve, y «Usar otra cuenta de Claude», el mismo inicio de sesión que Opciones → Agentes. Al
 * entrar con otra, el hilo sigue solo donde se quedó (`onSeguir`): el servidor ya soltó su Claude Code de antes
 * (`alEntrarClaude`). Si entra con la misma, lo dice. Con la llave de API no hay plan ni cuenta que cambiar.
 */
export function LimiteClaude({ onSeguir, ocupado }: { onSeguir(): Promise<unknown>; ocupado: boolean }) {
  const [limites, setLimites] = useState<LimitesClaude>()
  const [cuenta, setCuenta] = useState<CuentaClaude>()
  const [nota, setNota] = useState<{ texto: string; mal?: boolean }>()
  // El correo con que se pulsó «Usar otra cuenta»; mientras no haya, no se está cambiando.
  const antes = useRef<string | undefined>(undefined)
  const leerCuenta = () => api<CuentaClaude>('/api/claude/cuenta').then(setCuenta, () => {})
  useEffect(() => {
    void api<LimitesClaude>('/api/claude/limites').then(setLimites, () => {})
    void leerCuenta()
  }, [])

  // Mientras autorizas en el navegador, se mira cada dos segundos si ya entraste.
  const conectando = !!cuenta?.conectando
  useEffect(() => {
    if (!conectando) return
    const id = setInterval(leerCuenta, 2000)
    return () => clearInterval(id)
  }, [conectando])

  useEffect(() => {
    if (antes.current === undefined || !cuenta || cuenta.conectando) return
    const era = antes.current
    antes.current = undefined
    if (cuenta.error || !cuenta.conectada) return setNota({ texto: cuenta.error ?? 'No se terminó de autorizar la cuenta. Vuelve a intentarlo.', mal: true })
    if (cuenta.quien === era)
      return setNota({ texto: `Entraste otra vez con ${era}. Para usar otra, cierra sesión en claude.ai y vuelve a pulsar «Usar otra cuenta».`, mal: true })
    setNota({ texto: `Sigue con ${cuenta.quien}.` })
    onSeguir().catch((e) => setNota({ texto: e instanceof Error ? e.message : String(e), mal: true }))
  }, [cuenta])

  if (cuenta?.llave?.activa || limites?.llave) return null
  const llenos = (limites?.ventanas ?? []).map((v) => ({ ...v, queda: Math.max(0, Math.round(100 - v.uso)) }))
  // Los que se llenaron; si la lectura aún no lo ve, el que menos tiene.
  const vistos = llenos.filter((v) => v.queda <= LLENO)
  const ventanas = vistos.length ? vistos : [...llenos].sort((a, b) => a.queda - b.queda).slice(0, 1)

  function otra() {
    setNota(undefined)
    antes.current = cuenta?.quien ?? ''
    api<CuentaClaude>('/api/claude/conectar', {}).then(setCuenta, (e) => {
      antes.current = undefined
      setNota({ texto: e instanceof Error ? e.message : String(e), mal: true })
    })
  }

  return (
    <>
      {ventanas.map((v) => (
        <span key={v.nombre} className="turn-ayuda-linea">
          {v.nombre}: <b className={v.queda <= LLENO ? 'bad' : ''}>{v.queda} % disponible</b>
          {v.reinicia && ` · se restablece en ${reinicio(v.reinicia, Date.now())}`}
        </span>
      ))}
      {conectando ? (
        <span className="turn-ayuda-linea">
          Autoriza la otra cuenta en la pestaña que se abrió. Si entra sola con {cuenta?.quien ?? 'la de antes'}, cierra sesión en
          claude.ai y elige la otra.
        </span>
      ) : (
        nota && <span className={`turn-ayuda-linea ${nota.mal ? 'bad' : ''}`}>{nota.texto}</span>
      )}
      <button className="seguir-con" disabled={ocupado || conectando || !cuenta} title={cuenta?.quien ? `Ahora trabaja con ${cuenta.quien}` : undefined} onClick={otra}>
        <MarcaAgente de="claude" />
        {conectando ? 'Esperando al navegador…' : 'Usar otra cuenta de Claude'}
      </button>
    </>
  )
}
