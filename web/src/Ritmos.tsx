import { useEffect, useState } from 'react'
import { horasDelRitmo, resumenRitmo } from '../../shared/ritmo'
import type { EstadoRitmo, Ritmo } from '../../shared/types'
import { api } from './api'
import { Confirm } from './Confirm'
import { Logo } from './Logos'
import './Ritmos.css'

/**
 * En «Mis videos»: a qué ritmo salen los videos, uno para TikTok e Instagram (`server/redes/`) y otro para YouTube
 * (`server/youtube.ts`). Guardarlo vale para lo que programes después. Lo que ya tiene hora pasa al ritmo nuevo solo con
 * «Pasar al ritmo nuevo», que pide confirmación: es una decisión aparte, no un efecto de guardar.
 */
export function Ritmos() {
  const [hay, setHay] = useState<Record<string, boolean>>({})
  const ver = (base: string) => (si: boolean) => setHay((h) => ({ ...h, [base]: si }))
  return (
    <div className="ritmos">
      <RitmoDe base="/api/redes" titulo="TikTok e Instagram" logos={['tiktok', 'instagram']} evento="sloth-redes" onConectada={ver('/api/redes')} />
      <RitmoDe base="/api/youtube" titulo="YouTube" logos={['youtube']} evento="sloth-youtube" onConectada={ver('/api/youtube')} />
      {Object.keys(hay).length === 2 && !hay['/api/redes'] && !hay['/api/youtube'] && (
        <p className="muted small">Conecta TikTok, Instagram o YouTube en Opciones → Redes para elegir a qué ritmo salen.</p>
      )}
    </div>
  )
}

const hoy = () => new Date().toLocaleDateString('sv')

/** El ritmo de unas redes: los campos, «Guardar» y, si lo programado va con otro ritmo, «Pasar al ritmo nuevo». */
function RitmoDe(props: { base: string; titulo: string; logos: string[]; evento: string; onConectada(si: boolean): void }) {
  const [estado, setEstado] = useState<EstadoRitmo | null>(null)
  const [form, setForm] = useState<Ritmo | null>(null)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const recibir = (r: EstadoRitmo) => (setEstado(r), setForm(r.ritmo))
  useEffect(() => {
    api<EstadoRitmo>(`${props.base}/ritmo`).then(
      (r) => (recibir(r), props.onConectada(r.conectada)),
      () => props.onConectada(false)
    )
  }, [props.base])
  if (!estado?.conectada || !form) return null

  const cambiado = JSON.stringify(form) !== JSON.stringify(estado.ritmo)
  function poner(cambio: Partial<Ritmo>) {
    // Al pasar a «cada 2 días» o más, se empieza a contar hoy.
    if (cambio.cadaDias && cambio.cadaDias > 1 && form!.cadaDias === 1) cambio.inicio = hoy()
    setForm({ ...form!, ...cambio })
    setError('')
    setHecho('')
  }
  function guardar() {
    setGuardando(true)
    api<EstadoRitmo>(`${props.base}/ritmo`, form)
      .then(recibir, (e) => setError(e.message))
      .finally(() => setGuardando(false))
  }
  async function pasar() {
    const r = await api<EstadoRitmo & { movidas: number }>(`${props.base}/reacomodar`, {})
    recibir(r)
    setHecho(r.movidas === 1 ? 'Listo: 1 publicación cambió de hora.' : `Listo: ${r.movidas} publicaciones cambiaron de hora.`)
    dispatchEvent(new Event(props.evento))
  }
  const numero = (v: string) => Math.round(Number(v))
  const horas = horasDelRitmo(form)

  return (
    <div className="ritmo">
      <div className="ritmo-cabeza">
        {props.logos.map((l) => (
          <Logo key={l} de={l} chico />
        ))}
        <strong>{props.titulo}</strong>
        <span className="muted">· ahora {resumenRitmo(estado.ritmo)}</span>
      </div>
      <div className="ritmo-campos">
        <input type="number" min={1} max={24} aria-label="Videos" value={form.porDia} onChange={(e) => poner({ porDia: numero(e.target.value) })} />
        {form.porDia === 1 ? 'video' : 'videos'} cada
        <input type="number" min={1} max={30} aria-label="Cada cuántos días" value={form.cadaDias} onChange={(e) => poner({ cadaDias: numero(e.target.value) })} />
        {form.cadaDias === 1 ? 'día' : 'días'}
        {form.cadaDias > 1 && (
          <>
            , desde el
            <input type="date" aria-label="Primer día" value={form.inicio} onChange={(e) => poner({ inicio: e.target.value })} />
          </>
        )}
        , {form.porDia === 1 ? 'a las' : 'el primero a las'}
        <input type="time" aria-label="Hora del primero" value={form.desde} onChange={(e) => poner({ desde: e.target.value })} />
        {form.porDia > 1 && (
          <>
            y uno cada
            <input type="number" min={5} max={720} step={5} aria-label="Minutos entre uno y otro" value={form.cadaMin} onChange={(e) => poner({ cadaMin: numero(e.target.value) })} />
            min
          </>
        )}
        {cambiado && (
          <button className="primary" disabled={guardando} onClick={guardar}>
            Guardar
          </button>
        )}
      </div>
      {cambiado && form.porDia > 0 && (
        <p className="muted small">
          Salen a las {horas.length > 1 ? `${horas.slice(0, -1).join(', ')} y ${horas.at(-1)}` : horas[0]}. Vale para lo que programes después; lo ya programado no
          cambia hasta que lo decidas.
        </p>
      )}
      {error && <p className="bad small">{error}</p>}
      {!cambiado && estado.cambian > 0 && (
        <div className="ritmo-aviso">
          <span>
            {estado.cambian === 1 ? '1 publicación que aún no sale va' : `${estado.cambian} publicaciones que aún no salen van`} con otro ritmo, o dejan
            huecos.
          </span>
          <button className="primary" onClick={() => setConfirmar(true)}>
            Pasar al ritmo nuevo
          </button>
        </div>
      )}
      {!cambiado && estado.fijas > 0 && (
        <p className="muted small">
          {estado.fijas === 1 ? '1 ya está en TikTok y se queda' : `${estado.fijas} ya están en TikTok y se quedan`} a su hora: TikTok no deja cambiarla desde
          Sloth. Las que aún esperan en la cola sí se mueven.
        </p>
      )}
      {hecho && <p className="ritmo-hecho small">{hecho}</p>}
      {confirmar && (
        <Confirm title={`Pasar ${props.titulo} al ritmo nuevo`} action="Pasar al ritmo nuevo" onConfirm={pasar} onClose={() => setConfirmar(false)}>
          <p>
            {estado.cambian === 1 ? 'La publicación que aún no sale cambia' : `Las ${estado.cambian} publicaciones que aún no salen cambian`} de hora: van, en el
            mismo orden, a los huecos de «{resumenRitmo(estado.ritmo)}», desde el primero libre.
          </p>
          <p className="muted">
            Lo que ya está en la red no se vuelve a subir: solo cambia su hora.
            {estado.fijas > 0 && ` ${estado.fijas === 1 ? 'La que ya está en TikTok se queda' : `Las ${estado.fijas} que ya están en TikTok se quedan`} como están.`}
          </p>
        </Confirm>
      )}
    </div>
  )
}
