import { useEffect, useState } from 'react'
import { IDIOMAS_PILOTO, MANUAL_MAX, TOPE_MAX, type BriefPiloto, type IdiomaPiloto, type TurnoPiloto, type VistaPiloto } from '../../shared/piloto'
import { api } from './api'
import { Confirm } from './Confirm'
import { Desplegable } from './Desplegable'
import { Icono } from './Iconos'
import { rutaRedes } from './redes-ruta'
import './Piloto.css'

/**
 * Redes → Piloto (`server/piloto.ts`): el brief de la marca, arriba, y debajo los dos modos, cada uno en su tarjeta y con
 * su explicación. El manual hace los videos que pidas al pulsar y los deja por revisar; el automático, apagado por
 * defecto, se enciende tras un aviso de que gasta y publica solo, y se apaga con un clic. Encendido, la barra lateral lo
 * dice siempre (`AvisoPiloto`).
 */

const ESTADO: Record<TurnoPiloto['estado'], string> = { haciendo: 'Haciéndose', por_revisar: 'Por revisar', programado: 'En la cola de redes', error: 'Falló' }
const lineas = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
/** Avisa a la barra lateral de que el automático cambió. */
const avisar = () => dispatchEvent(new Event('sloth-piloto'))
const conY = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0] ?? '')

export function Piloto() {
  const [v, setV] = useState<VistaPiloto>()
  const [b, setB] = useState<BriefPiloto>()
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [cuantos, setCuantos] = useState(1)
  const [encender, setEncender] = useState(false)
  const [hecho, setHecho] = useState('')

  useEffect(() => {
    // Lo que se hace cambia de estado solo: se mira cada medio minuto mientras esta pestaña está abierta.
    const leer = () => api<VistaPiloto>('/api/piloto').then((x) => (setV(x), setB((antes) => antes ?? x.config.brief)), (e) => setError(e.message))
    leer()
    const t = setInterval(leer, 30_000)
    return () => clearInterval(t)
  }, [])

  async function hacer(ruta: string, datos: unknown, listo?: string) {
    setOcupado(true)
    setError('')
    setHecho('')
    try {
      setV(await api<VistaPiloto>(ruta, datos))
      if (listo) setHecho(listo)
    } catch (e) {
      // Decir que no al aviso de más de dos videos no es un fallo: llega sin texto.
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  if (!v || !b) return <p className="muted">{error || 'Mirando…'}</p>
  const set = <K extends keyof BriefPiloto>(k: K, valor: BriefPiloto[K]) => (setB({ ...b, [k]: valor }), setHecho(''))
  const cambiado = JSON.stringify(b) !== JSON.stringify(v.config.brief)
  const sinMarca = !v.config.brief.marca.trim()
  const auto = v.config.auto
  const estilo = v.estilos.find((e) => e.id === b.cardId)?.title ?? 'Video explicativo'

  return (
    <section className="piloto">
      <p className="muted piloto-intro">
        El piloto hace videos verticales de tu marca a partir de su brief, cada uno en su hilo. Tiene dos modos, aparte: en el manual tú pides y tú decides qué se publica; el automático los hace y los publica solo.
      </p>

      <div className="piloto-brief">
        <h2>
          <Icono de="lapiz" /> Brief de la marca <span className="muted small">· lo usan los dos modos</span>
        </h2>
        <label>
          De qué trata la marca
          <textarea rows={2} value={b.marca} onChange={(e) => set('marca', e.target.value)} placeholder="Una cafetería de barrio que tuesta su propio café" />
        </label>
        <div className="piloto-dos">
          <label>
            A quién le habla
            <input value={b.publico} onChange={(e) => set('publico', e.target.value)} placeholder="Gente que toma café en casa" />
          </label>
          <label>
            Llamada a la acción
            <input value={b.cta} onChange={(e) => set('cta', e.target.value)} placeholder="Pide tu bolsa" />
          </label>
        </div>
        <div className="piloto-dos">
          <label>
            Temas o dolores (uno por línea; rotan)
            <textarea rows={3} value={b.temas.join('\n')} onChange={(e) => set('temas', e.target.value.split('\n'))} onBlur={() => set('temas', lineas(b.temas.join('\n')))} />
          </label>
          <label>
            Ganchos (opcional, uno por línea; rotan)
            <textarea rows={3} value={b.ganchos.join('\n')} onChange={(e) => set('ganchos', e.target.value.split('\n'))} onBlur={() => set('ganchos', lineas(b.ganchos.join('\n')))} />
          </label>
        </div>
        <div className="piloto-tres">
          <label>
            Tono
            <input value={b.tono} onChange={(e) => set('tono', e.target.value)} placeholder="Cercano y con humor" />
          </label>
          <div className="piloto-label">
            Idioma
            <Desplegable campo nombre="Idioma" valor={b.idioma} opciones={Object.entries(IDIOMAS_PILOTO).map(([value, label]) => ({ value, label }))} onCambio={(x) => set('idioma', x as IdiomaPiloto)} />
          </div>
          <div className="piloto-label">
            Estilo de video
            <Desplegable campo nombre="Estilo de video" valor={b.cardId || 'video-explicativo'} opciones={v.estilos.map((e) => ({ value: e.id, label: e.title }))} onCambio={(x) => set('cardId', x)} />
          </div>
        </div>
        {cambiado && (
          <div className="piloto-acciones">
            <button className="primary" disabled={ocupado} onClick={() => hacer('/api/piloto/brief', b, 'Brief guardado.')}>
              Guardar el brief
            </button>
          </div>
        )}
      </div>

      <div className="piloto-modos">
        <article className="piloto-modo">
          <header>
            <Icono de="claqueta" />
            <h2>Manual</h2>
            <span className="piloto-estado">Solo cuando pulsas</span>
          </header>
          <p>
            Pides cuántos y Sloth los hace ahora, uno por hilo, en «{estilo}». Al terminar quedan por revisar: en <a href={rutaRedes('publicaciones')}>Publicaciones</a> decides cuál se programa y cuándo, con su texto a la vista.
          </p>
          <p className="muted small">Nunca crea nada solo ni publica nada solo.</p>
          <div className="piloto-acciones">
            <span className="piloto-campo">
              Hacer
              <input type="number" min={1} max={MANUAL_MAX} aria-label="Cuántos videos" value={cuantos} onChange={(e) => setCuantos(Math.min(MANUAL_MAX, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
              {cuantos === 1 ? 'video' : 'videos'}
            </span>
            <button
              className="primary"
              disabled={ocupado || sinMarca || cambiado}
              title={sinMarca ? 'Cuenta de qué trata la marca primero' : cambiado ? 'Guarda el brief primero' : undefined}
              onClick={() => hacer('/api/piloto/manual', { n: cuantos }, cuantos === 1 ? 'Listo: el video ya se está haciendo.' : `Listo: los ${cuantos} videos ya se están haciendo.`)}
            >
              Hacer ahora
            </button>
          </div>
        </article>

        <article className={`piloto-modo auto${auto.encendido ? ' on' : ''}`}>
          <header>
            <Icono de="calendario" />
            <h2>Automático</h2>
            <span className="piloto-estado">{auto.encendido ? 'Encendido' : 'Apagado'}</span>
          </header>
          <p>
            Cada día que toca en tu <a href={rutaRedes('calendario')}>ritmo de publicación</a>, hace hasta {auto.tope} {auto.tope === 1 ? 'video' : 'videos'} solo y {auto.tope === 1 ? 'lo programa' : 'los programa'} sin
            preguntarte en la cola de redes, en sus horas{v.hoy.horas.length ? ` (hoy, ${conY(v.hoy.horas)})` : ''}. Trabaja mientras Sloth está abierto.
          </p>
          <p className="piloto-gasta small">
            <Icono de="alerta" /> Gasta tokens de tu agente y créditos (voz, imágenes) sin que nadie mire, y publica en tus cuentas sin que lo revises.
          </p>
          <div className="piloto-acciones">
            <span className="piloto-campo">
              Tope:
              <input
                type="number"
                min={1}
                max={TOPE_MAX}
                aria-label="Tope de videos al día"
                value={auto.tope}
                disabled={ocupado}
                onChange={(e) => hacer('/api/piloto/auto', { tope: Math.min(TOPE_MAX, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
              />
              al día
            </span>
            {auto.encendido ? (
              <button className="primary danger" disabled={ocupado} onClick={() => hacer('/api/piloto/auto', { encendido: false }, 'Automático apagado. Lo que aún se hace quedará por revisar.').then(avisar)}>
                Apagar
              </button>
            ) : (
              <button className="primary" disabled={ocupado || sinMarca || cambiado || !v.hoy.conectada} title={!v.hoy.conectada ? 'Conecta una red en Cuentas primero' : sinMarca ? 'Cuenta de qué trata la marca primero' : cambiado ? 'Guarda el brief primero' : undefined} onClick={() => setEncender(true)}>
                Encender…
              </button>
            )}
          </div>
          {auto.encendido && (
            <p className="muted small">
              Hoy lleva {v.hoy.hechos} de {auto.tope}.{v.hoy.horas.length ? '' : ' Hoy no toca publicar en tu ritmo.'}
            </p>
          )}
          {!auto.encendido && !v.hoy.conectada && (
            <p className="muted small">
              Para encenderlo, conecta una red en <a href={rutaRedes('cuentas')}>Cuentas</a>.
            </p>
          )}
        </article>
      </div>

      {error && <p className="bad small">{error}</p>}
      {hecho && <p className="piloto-hecho small">{hecho}</p>}

      {v.ultimos.length > 0 && (
        <div className="piloto-lista">
          <h2>Lo último del piloto</h2>
          {v.ultimos.map((t) => (
            <div key={t.id} className="piloto-turno">
              <span className="muted small">{t.modo === 'auto' ? 'Automático' : 'Manual'}</span>
              <span className="piloto-titulo">{t.gancho || t.tema || 'Video'}</span>
              <span className={`small ${t.estado === 'error' ? 'bad' : 'muted'}`} title={t.error}>
                {ESTADO[t.estado]}
              </span>
              <a className="ghost small" href={`#/s/${t.sesion}`}>
                Abrir hilo
              </a>
              {t.estado !== 'haciendo' && (
                <button className="ghost" aria-label="Quitar de la lista" title="Quitar de la lista (el hilo y el video se quedan)" disabled={ocupado} onClick={() => hacer('/api/piloto/descartar', { id: t.id })}>
                  <Icono de="cerrar" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {encender && (
        <Confirm
          title="¿Encender el piloto automático?"
          action="Sí, encenderlo"
          danger
          enfocarCancelar
          onConfirm={async () => {
            setV(await api<VistaPiloto>('/api/piloto/auto', { encendido: true, acepto: true }))
            avisar()
          }}
          onClose={() => setEncender(false)}
        >
          <p>Mientras esté encendido, cada día que toca Sloth hace hasta {auto.tope} {auto.tope === 1 ? 'video' : 'videos'} de «{estilo}» sin preguntarte:</p>
          <ul>
            <li>Gasta tokens de tu agente y créditos de voz e imágenes sin que nadie mire.</li>
            <li>Publica solo en tus redes conectadas, con el texto que escriba tu agente, sin que lo revises.</li>
          </ul>
          <p className="muted">Se apaga con un clic, aquí o desde la barra lateral. Lo que se esté haciendo al apagarlo queda por revisar.</p>
        </Confirm>
      )}
    </section>
  )
}

/** En la barra lateral, mientras el automático está encendido: siempre a la vista, y lleva a donde se apaga. */
export function AvisoPiloto({ connected }: { connected: boolean }) {
  const [encendido, setEncendido] = useState(false)
  useEffect(() => {
    const leer = () => api<{ encendido: boolean }>('/api/piloto/encendido').then((r) => setEncendido(r.encendido), () => {})
    if (connected) leer()
    addEventListener('sloth-piloto', leer)
    return () => removeEventListener('sloth-piloto', leer)
  }, [connected])
  if (!encendido) return null
  return (
    <button className="aviso-piloto" title="Hace y publica videos solo. Pulsa para verlo o apagarlo." onClick={() => (location.hash = rutaRedes('piloto'))}>
      <span>Piloto automático encendido</span>
    </button>
  )
}
