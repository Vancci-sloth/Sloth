import { useEffect, useState } from 'react'
import type { CuentaMeta, EstadoMeta } from '../../shared/meta'
import { api } from './api'
import { Picker } from './Composer'
import { Confirm } from './Confirm'
import { Logo } from './Logos'

/**
 * Opciones → Meta Muse (`server/meta/`): las cuentas de Meta con que los agentes generan imágenes y videos en muse.ai.
 * Cada pedido va a la que lleva menos usado de la semana, y si una ya gastó la suya, pasa a otra. Agregar abre muse.ai en
 * una ventana de Edge aparte; al cerrarla, Sloth comprueba la sesión, lee el correo y lo usado.
 */

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/** Cómo está una cuenta, y la clase de su punto (`.estado`). */
function comoEsta(c: CuentaMeta): [string, string] {
  const uso = c.uso ? `${c.uso.porcentaje} % de la semana${c.uso.detalle ? ` · ${c.uso.detalle}` : ''}` : 'uso sin leer'
  if (c.abierta) return [`Ventana abierta · ${uso}`, 'moviendo']
  if (c.generando) return [`Generando · ${uso}`, 'moviendo']
  if (c.descansa) return [`${c.descansa.motivo === 'uso' ? 'Gastó su semana' : 'Sin sesión'} · vuelve a probar a las ${hora(c.descansa.hasta)} · ${uso}`, 'falta']
  return [`Lista · ${uso}`, '']
}

export function MetaOpciones() {
  const [e, setEstado] = useState<EstadoMeta>()
  const [error, setError] = useState<string>()
  const [quitando, setQuitando] = useState<string>()
  const recibir = (p: Promise<EstadoMeta>) => p.then((n) => (setEstado(n), setError(undefined)), (x: Error) => setError(x.message))
  useEffect(() => void recibir(api('/api/meta')), [])
  // Mientras entras, lee o genera, se vuelve a preguntar.
  const ventana = e?.agregando || e?.cuentas.some((c) => c.abierta)
  const cada = ventana ? 2000 : e?.leyendo ? 3000 : e?.enFila ? 5000 : 0
  useEffect(() => {
    if (!cada) return
    const t = setInterval(() => {
      if (!document.hidden) void recibir(api('/api/meta'))
    }, cada)
    return () => clearInterval(t)
  }, [cada])
  const leer = (faltan: boolean) => void recibir(api('/api/meta/uso', { faltan }))
  // Al abrirse, las que nunca se leyeron.
  const cargado = !!e
  useEffect(() => {
    if (e?.cuentas.some((c) => !c.uso)) leer(true)
  }, [cargado])
  const n = e?.cuentas.length ?? 0
  return (
    <div className="item">
      <div className="fila">
        <Logo de="muse" />
        <div className="fila-nombre">
          <strong>Cuentas de Meta</strong>
          <span>
            {n
              ? `Imágenes y videos de 10 s con ${n === 1 ? 'una cuenta' : `${n} cuentas`}${e?.enFila ? ` · generando ${e.enFila}` : ''}`
              : 'Agrega una cuenta de Meta para que los agentes generen imágenes y videos con Muse.'}
          </span>
        </div>
        {e?.agregando ? (
          <span className="estado moviendo">Entra a muse.ai en la ventana de {e.navegador}…</span>
        ) : (
          e && (
            <button className={n ? 'boton' : 'primary'} onClick={() => void recibir(api('/api/meta/cuentas/agregar', {}))}>
              Agregar cuenta
            </button>
          )
        )}
      </div>
      {e?.agregando && (
        <p className="muted small fila-extra">
          Entra con tu cuenta de Meta y, cuando veas el chat de Muse, cierra la ventana: la cuenta queda en Sloth. Muse abre cuentas en Estados Unidos, Canadá, Japón y Singapur, y el plan gratis también genera. Cuando una cuenta gasta su semana, Sloth sigue con otra. Agrega solo cuentas tuyas: usar varias para tener más uso puede hacer que Meta limite alguna.
        </p>
      )}
      {n > 0 && e && (
        <div className="fila-extra">
          <div className="opcion-fila">
            <span className="muted small una-linea">En el plan gratis, una imagen usa cerca del 1 % de la semana de una cuenta y un video, cerca del 9 %.</span>
            {e.leyendo ? (
              <span className="estado moviendo small">Leyendo uso…</span>
            ) : (
              <button className="link small" title="Abre el muse.ai de cada cuenta, sin ventana, y lee lo usado de la semana. No gasta." onClick={() => leer(false)}>
                Actualizar uso
              </button>
            )}
          </div>
          {e.cuentas.map((c) => {
            const [texto, clase] = comoEsta(c)
            return (
              <div className="opcion-fila" key={c.correo}>
                <Picker
                  className="acciones"
                  label={<span className={`estado ${clase}`}>{c.correo}</span>}
                  value=""
                  groups={[{ label: 'Cuenta', options: [{ value: 'abrir', label: 'Abrir muse.ai (revisar sesión)' }, { value: 'quitar', label: 'Quitar de Sloth' }] }]}
                  onChange={(q) => (q === 'quitar' ? setQuitando(c.correo) : void recibir(api('/api/meta/abrir', { correo: c.correo })))}
                />
                <span className="muted small una-linea" title={c.uso ? `${texto}. Leído a las ${hora(c.uso.leido)}.` : texto}>
                  {texto}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {quitando && (
        <Confirm title="Quitar la cuenta de Meta" action="Quitar" danger onConfirm={() => api<EstadoMeta>('/api/meta/cuentas/quitar', { correo: quitando }).then(setEstado)} onClose={() => setQuitando(undefined)}>
          Sloth deja de generar con {quitando} y borra su sesión. Lo que ya generó sigue en su muse.ai. Para volver a usarla, agrégala otra vez.
        </Confirm>
      )}
      {(error ?? e?.error) && !e?.agregando && <p className="bad small fila-extra">{error ?? e?.error}</p>}
    </div>
  )
}
