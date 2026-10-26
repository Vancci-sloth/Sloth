import { useEffect, useState } from 'react'
import type { FuenteProbada, FuenteRadar, FuentesRadar } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Icono } from './Iconos'
import './RadarOpciones.css'

/**
 * El radar en Opciones (`server/radar/`): qué noticias sigue, si las está leyendo y un solo campo para darle más. Su fila
 * dice el tema y lo que trajo en 24 h; abierta, enseña las fuentes como fichas, con un punto verde si se leyeron bien,
 * ámbar si no respondieron y gris si aún no se leen, y su ✕ para quitarlas. En el campo, una web o una @cuenta se prueba
 * y se añade si responde; unas palabras son un tema, y Claude propone sus fuentes, ya probadas, para elegir.
 */

/** Como las ve el usuario: que una web tenga feed o no es cosa del radar. */
const GRUPOS: Array<{ nombre: string; tipos: Array<FuenteRadar['tipo']> }> = [
  { nombre: 'Webs', tipos: ['rss', 'pagina'] },
  { nombre: 'Cuentas de X', tipos: ['x'] },
  { nombre: 'Tendencias', tipos: ['hn', 'github'] }
]
const TIPO: Record<FuenteRadar['tipo'], string> = { rss: 'Web', pagina: 'Web', x: 'Cuenta de X', hn: '', github: '' }
const nombre = (f: FuenteRadar) => (f.tipo === 'x' ? `@${f.cuenta}` : f.tipo === 'hn' ? 'Hacker News' : f.tipo === 'github' ? 'GitHub Trending' : f.nombre)
/** Sin lo que cuenta el servidor de cada una: así se guarda. */
const sola = ({ id: _i, ultima: _u, error: _e, docs: _d, ...f }: FuentesRadar['fuentes'][number]): FuenteRadar => f
/** Lo que se pega como fuente (una dirección, una @cuenta, un subreddit); lo demás es un tema. Como `interpretar` de `probar.ts`. */
const esFuente = (t: string) => /^(@\w{1,15}|r\/\w+|hn|hacker ?news|github( trending)?)$/i.test(t) || /^https?:\/\/|^[\w-]+(\.[\w-]+)+(\/|$)/i.test(t)
const plural = (n: number, una: string, varias: string) => `${n.toLocaleString('es-MX')} ${n === 1 ? una : varias}`
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e))

function hace(t: number) {
  const min = Math.round((Date.now() - t) / 60_000)
  return min < 2 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 48 * 60 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`
}

export function RadarOpciones() {
  const [datos, setDatos] = useState<FuentesRadar | null>(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(false)
  const [reiniciar, setReiniciar] = useState(false)

  useEffect(() => void api<FuentesRadar>('/api/radar/fuentes').then(setDatos, (e) => setError(e.message)), [])

  /** Guarda la lista entera (`null`, las de siempre); dice si se pudo. */
  async function guardar(fuentes: FuenteRadar[] | null) {
    setError('')
    try {
      setDatos(await api<FuentesRadar>('/api/radar/fuentes', { fuentes }))
      return true
    } catch (e) {
      setError(mensaje(e))
      return false
    }
  }

  if (!datos) return <div className="item fila muted small">{error || 'Mirando…'}</div>
  const lista = datos.fuentes.map(sola)
  const tiene = (id: string) => datos.fuentes.some((f) => f.id === id)
  const sin = (quitar: (f: FuentesRadar['fuentes'][number]) => boolean) => guardar(lista.filter((_, i) => !quitar(datos.fuentes[i])))
  const fallan = datos.fuentes.filter((f) => f.error).length
  const leidas = Math.max(0, ...datos.fuentes.map((f) => f.ultima ?? 0))
  const cuantas = plural(datos.fuentes.length, 'fuente', 'fuentes')
  return (
    <>
      <div className="item">
        <button className="fila fila-boton" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
          <span className="logo">
            <Icono de="radar" />
          </span>
          <span className="fila-nombre">
            <strong>{datos.deSiempre ? 'Noticias de IA y tecnología' : 'Tus fuentes de noticias'}</strong>
            <span className="una-linea">
              {!datos.fuentes.length
                ? 'Ninguna fuente: El Diff solo busca en la web'
                : leidas
                  ? `${cuantas} · ${plural(datos.recientes, 'noticia', 'noticias')} en 24 h · leídas ${hace(leidas)}`
                  : `${cuantas} · se leen por primera vez en un minuto`}
            </span>
          </span>
          <span className={`resumen${abierta ? ' on' : ''}`}>{abierta ? 'Plegar' : 'Ver fuentes'}</span>
        </button>
        {abierta && (
          <div className="fila-extra radar-fuentes">
            {GRUPOS.map((g) => [g, datos.fuentes.filter((f) => g.tipos.includes(f.tipo))] as const)
              .filter(([, fs]) => fs.length)
              .map(([g, fs]) => (
                <div key={g.nombre}>
                  <p className="muted small">
                    {g.nombre} · {fs.length}
                  </p>
                  <div className="radar-chips">
                    {fs.map((f) => (
                      <span
                        key={f.id}
                        className={`radar-chip${f.error ? ' falla' : f.ultima ? '' : ' nueva'}`}
                        title={f.error ? `No respondió: ${f.error}` : f.ultima ? `Leída ${hace(f.ultima)} · ${plural(f.docs, 'noticia guardada', 'noticias guardadas')}` : 'Se lee en los próximos minutos'}
                      >
                        {nombre(f)}
                        <button aria-label={`Quitar ${nombre(f)}`} title="Quitar" onClick={() => sin((x) => x.id === f.id)}>
                          <Icono de="cerrar" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            {(fallan > 0 || !datos.deSiempre) && (
              <div className="radar-pie">
                {fallan > 0 && (
                  <>
                    <span className="estado falta">{fallan === 1 ? 'Una no respondió' : `${fallan} no respondieron`} en la última lectura</span>
                    <button className="boton" onClick={() => sin((f) => !!f.error)}>
                      {fallan === 1 ? 'Quitarla' : 'Quitarlas'}
                    </button>
                  </>
                )}
                <span className="spacer" />
                {!datos.deSiempre && (
                  <button className="ghost small" onClick={() => setReiniciar(true)}>
                    Volver a las de siempre
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <Anadir tiene={tiene} onAnadir={(fs) => guardar([...lista, ...fs])} onCambiar={guardar} />
      {error && <p className="bad small fila-extra">{error}</p>}
      {reiniciar && (
        <Confirm title="¿Volver a las fuentes de siempre?" action="Volver" onConfirm={() => guardar(null)} onClose={() => setReiniciar(false)}>
          Se quitan las {datos.fuentes.length} que tienes ahora y vuelven las de IA y tecnología con que viene Sloth. Lo que ya leyeron se queda en el
          radar.
        </Confirm>
      )}
    </>
  )
}

/**
 * El campo para darle más al radar. Una web o una @cuenta se prueba y, si responde, se añade. Unas palabras son un tema:
 * Claude propone sus fuentes, ya probadas, y se añaden las marcadas o se usan solo esas.
 */
function Anadir({ tiene, onAnadir, onCambiar }: { tiene(id: string): boolean; onAnadir(fs: FuenteRadar[]): Promise<boolean>; onCambiar(fs: FuenteRadar[]): Promise<boolean> }) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState<'probando' | 'buscando' | null>(null)
  const [aviso, setAviso] = useState<{ bien: boolean; texto: string } | null>(null)
  const [tema, setTema] = useState('')
  const [propuestas, setPropuestas] = useState<FuenteProbada[] | null>(null)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [cambiar, setCambiar] = useState(false)
  const t = texto.trim()

  async function enviar() {
    const fuente = esFuente(t)
    setOcupado(fuente ? 'probando' : 'buscando')
    setAviso(null)
    setPropuestas(null)
    try {
      if (fuente) {
        const p = await api<FuenteProbada>('/api/radar/fuentes/probar', { texto: t })
        if (!p.ok) setAviso({ bien: false, texto: `${nombre(p.fuente)}: ${p.detalle}` })
        else if (tiene(p.id)) setAviso({ bien: true, texto: `${nombre(p.fuente)} ya está en el radar.` })
        else if (await onAnadir([p.fuente])) {
          setAviso({ bien: true, texto: `Añadida: ${nombre(p.fuente)} · ${p.detalle}. Se lee en los próximos minutos.` })
          setTexto('')
        }
      } else {
        setTema(t)
        const r = await api<{ propuestas: FuenteProbada[]; error?: string }>('/api/radar/proponer', { tema: t })
        setPropuestas(r.propuestas)
        setMarcadas(new Set(r.propuestas.filter((p) => p.ok && !tiene(p.id)).map((p) => p.id)))
        if (r.error) setAviso({ bien: false, texto: r.error })
      }
    } catch (e) {
      setAviso({ bien: false, texto: mensaje(e) })
    } finally {
      setOcupado(null)
    }
  }

  const elegidas = propuestas?.filter((p) => marcadas.has(p.id)).map((p) => p.fuente) ?? []
  const listo = (bien = true) => bien && (setPropuestas(null), setTexto(''))
  return (
    <div className="item">
      <form className="fila opcion-fila radar-campo" onSubmit={(e) => (e.preventDefault(), t && !ocupado && enviar())}>
        <input placeholder="Una web, una @cuenta de X o un tema: Fórmula 1, cripto…" value={texto} onChange={(e) => (setTexto(e.target.value), setAviso(null))} />
        <button className="boton" disabled={!!ocupado || !t}>
          {ocupado === 'probando' ? 'Probando…' : ocupado === 'buscando' ? 'Buscando…' : t && !esFuente(t) ? 'Buscar fuentes' : 'Añadir'}
        </button>
      </form>
      {(ocupado === 'buscando' || aviso || propuestas) && (
        <div className="fila-extra">
          {ocupado === 'buscando' && <p className="muted small">Claude busca de dónde salen primero las noticias de «{tema}» y se prueba cada una: unos 20 segundos.</p>}
          {aviso &&
            (aviso.bien ? (
              <p className="small radar-hecho">
                <Icono de="palomita" />
                {aviso.texto}
              </p>
            ) : (
              <p className="bad small">{aviso.texto}</p>
            ))}
          {propuestas && (
            <>
              <p className="muted small">
                {plural(propuestas.length, 'fuente', 'fuentes')} para «{tema}». Van marcadas las que respondieron.
              </p>
              <div className="radar-propuestas">
                {propuestas.map((p) => {
                  const ya = tiene(p.id)
                  return (
                    <label key={p.id} className={p.ok && !ya ? '' : 'apagada'}>
                      <input
                        type="checkbox"
                        disabled={!p.ok || ya}
                        checked={marcadas.has(p.id)}
                        onChange={(e) => setMarcadas((m) => (e.target.checked ? new Set(m).add(p.id) : new Set([...m].filter((id) => id !== p.id))))}
                      />
                      <strong className="una-linea">{nombre(p.fuente)}</strong>
                      <span className={`una-linea ${p.ok ? 'muted' : 'bad'}`}>{[TIPO[p.fuente.tipo], ya ? 'Ya está en el radar' : p.detalle].filter(Boolean).join(' · ')}</span>
                    </label>
                  )
                })}
              </div>
              <div className="opcion-fila">
                <button type="button" className="primary" disabled={!elegidas.length} onClick={() => onAnadir(elegidas).then(listo)}>
                  {elegidas.length > 1 ? `Añadir las ${elegidas.length}` : elegidas.length ? 'Añadir la marcada' : 'Añadir'}
                </button>
                <button type="button" className="boton" disabled={!elegidas.length} onClick={() => setCambiar(true)}>
                  Usar solo estas
                </button>
                <button type="button" className="ghost" onClick={() => listo()}>
                  Descartar
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {cambiar && (
        <Confirm title="¿Usar solo estas fuentes?" action="Usar solo estas" onConfirm={() => onCambiar(elegidas).then(listo)} onClose={() => setCambiar(false)}>
          El radar deja de leer las que tiene ahora y lee solo {elegidas.length === 1 ? 'la que marcaste' : `las ${elegidas.length} que marcaste`}. Lo que ya
          leyó se queda, y puedes volver a las de siempre cuando quieras.
        </Confirm>
      )}
    </div>
  )
}
