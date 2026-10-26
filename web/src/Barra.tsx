import { useCallback, useEffect, useRef, useState } from 'react'
import { FASES, type AvanceCorto, type Fase, type SessionMeta } from '../../shared/types'

/**
 * Lo de la barra lateral que no es la lista en sí (que vive en App): plegarla, y el avance de cada video bajo su título.
 * El avance lo calcula el servidor y lo manda cuando cambia (`server/avances.ts`); aquí solo se dibuja.
 */

/** Lo que eligió el usuario, en una ventana ancha y en una estrecha. Sin elegir, la ancha va abierta y la estrecha plegada. */
export type Plegado = { ancha?: boolean; estrecha?: boolean }
/** Con menos de este ancho, la barra se pliega sola. */
const ESTRECHA = '(width < 1100px)'

/**
 * Si la barra lateral está plegada en una columna de iconos, y plegarla o desplegarla. Ctrl+B lo hace desde cualquier
 * sitio, también escribiendo (ningún campo de la app lo usa). En una ventana estrecha se pliega sola. Lo que elijas se
 * recuerda (`elegido`, en localStorage) por separado en ancha y en estrecha: abrirla para mirar algo en una ventana
 * estrecha no la deja abierta en la ancha, ni al revés.
 */
export function useBarraPlegada(elegido: Plegado, guardar: (p: Plegado) => void) {
  const [estrecha, setEstrecha] = useState(() => matchMedia(ESTRECHA).matches)
  useEffect(() => {
    const m = matchMedia(ESTRECHA)
    const cambio = () => setEstrecha(m.matches)
    m.addEventListener('change', cambio)
    return () => m.removeEventListener('change', cambio)
  }, [])
  const plegada = estrecha ? (elegido.estrecha ?? true) : (elegido.ancha ?? false)
  // `plegar` es siempre la misma función, y ve lo de ahora: la usan el atajo y Ctrl+K, que no se vuelven a montar.
  const ahora = useRef({ plegada, estrecha, elegido, guardar })
  ahora.current = { plegada, estrecha, elegido, guardar }
  const plegar = useCallback((si: boolean) => {
    const { plegada, estrecha, elegido, guardar } = ahora.current
    if (si !== plegada) guardar({ ...elegido, [estrecha ? 'estrecha' : 'ancha']: si })
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'b') return
      e.preventDefault()
      if (!e.repeat) plegar(!ahora.current.plegada)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return [plegada, plegar] as const
}

/** Lo que se dibuja bajo el título de una fila: el texto, lo que dice al pasar el ratón y cuánto va de la barra (0 a 1). */
export type Vista = { texto: string; title: string; parte: number; clase?: 'espera' | 'hecho' }

const nombreDe = (fase: Fase) => FASES.find((f) => f.id === fase)?.nombre ?? fase
/** Si el hilo espera al usuario: su etapa espera algo y el agente no trabaja. */
const teEspera = (s: SessionMeta, a: AvanceCorto) => !!a.espera && !s.running && !s.background?.length

/** Un video: en qué fase va (o que terminó) y cuántas etapas lleva. Los que esperan su turno en un lote, nada: ya lo dicen. */
export function vistaDeVideo(s: SessionMeta, a?: AvanceCorto): Vista | undefined {
  if (!a?.total || s.pendiente) return undefined
  if (!a.fase) return { texto: 'Terminado', title: `Terminado: sus ${a.total} etapas están hechas`, parte: 1, clase: 'hecho' }
  const fase = nombreDe(a.fase)
  const espera = teEspera(s, a)
  return {
    texto: espera ? `${fase} · te espera` : fase,
    title: `${fase}: ${espera ? 'espera de ti' : 'va'} en «${a.etapa}» · ${a.hechas} de ${a.total} etapas`,
    parte: a.hechas / a.total,
    clase: espera ? 'espera' : undefined
  }
}

/**
 * Un lote: la fase en la que van más videos («3/5 en Video»; a la par, la más atrasada) y la barra de todas sus etapas
 * juntas. Los que esperan su turno no cuentan en ninguna fase.
 */
export function vistaDeLote(videos: SessionMeta[], avances: Record<string, AvanceCorto>): Vista | undefined {
  const con = videos.flatMap((s) => (avances[s.id]?.total ? [{ s, a: avances[s.id] }] : []))
  const cuantos = new Map<Fase | 'fin', number>()
  for (const { s, a } of con) if (!s.pendiente) cuantos.set(a.fase ?? 'fin', (cuantos.get(a.fase ?? 'fin') ?? 0) + 1)
  if (!cuantos.size) return undefined
  const orden = [...FASES.map((f) => f.id), 'fin' as const].filter((k) => cuantos.has(k))
  const mas = orden.reduce((m, k) => (cuantos.get(k)! > cuantos.get(m)! ? k : m))
  const n = cuantos.get(mas)!
  const nombre = (k: Fase | 'fin') => (k === 'fin' ? 'Terminados' : nombreDe(k))
  const todos = mas === 'fin' && n === videos.length
  const esperan = con.filter(({ s, a }) => teEspera(s, a)).length
  return {
    texto: todos ? 'Terminados' : mas === 'fin' ? `${n}/${videos.length} terminados` : `${n}/${videos.length} en ${nombre(mas)}`,
    title: [...orden.map((k) => `${nombre(k)}: ${cuantos.get(k)}`), esperan && `${esperan === 1 ? 'uno te espera' : `${esperan} te esperan`}`].filter(Boolean).join(' · '),
    parte: con.reduce((t, { a }) => t + a.hechas, 0) / con.reduce((t, { a }) => t + a.total, 0),
    clase: esperan ? 'espera' : todos ? 'hecho' : undefined
  }
}

/** El título de una fila y, si es de un video, debajo su avance: el texto y una barra fina, que se va al terminar. */
export function TituloDeFila({ titulo, vista }: { titulo: string; vista?: Vista }) {
  if (!vista) return <span className="session-title">{titulo}</span>
  return (
    <span className="session-texto">
      <span className="session-title">{titulo}</span>
      <span className={`avance ${vista.clase ?? ''}`} title={vista.title}>
        <span className="avance-texto">{vista.texto}</span>
        {vista.parte < 1 && (
          <span className="avance-barra">
            <span style={{ width: `${vista.parte * 100}%` }} />
          </span>
        )}
      </span>
    </span>
  )
}
