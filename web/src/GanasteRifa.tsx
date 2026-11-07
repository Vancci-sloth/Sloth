import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RifaGanada } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import './CreditosVoz.css'
import './Rifa.css'

/**
 * «Ganaste la rifa»: a toda la pantalla, en cuanto la app sabe que ganaste (`GET /api/comunidad/avisos?cuenta`, que
 * App pide cada dos minutos y al abrir la comunidad). Va en el tono de Vancci, como el correo que llega con el premio
 * (`licencias/src/rifa.ts`). Al cerrarlo se anota que lo viste y no vuelve a salir. En Administrador, «Ver el aviso del
 * ganador» lo abre de prueba (`probarGanasteRifa`), sin anotar nada.
 */
const GANASTE = 'sloth-rifa-ganaste'
export const avisarGanasteRifa = (g: RifaGanada, prueba = false) => dispatchEvent(new CustomEvent(GANASTE, { detail: { g, prueba } }))

/** El confeti, una sola vez: tiras y puntos del color de Sloth que caen a distintas velocidades. */
const CONFETI = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 37) % 100,
  y: -10 - ((i * 13) % 30),
  ancho: i % 3 ? 7 : 5,
  alto: i % 3 ? 14 : 5,
  color: ['var(--amber)', 'var(--amber-2)', 'var(--ok)', 'var(--text)'][i % 4],
  demora: (i % 7) * 0.08,
  cae: 260 + ((i * 53) % 260),
  gira: ((i % 2 ? 1 : -1) * (120 + ((i * 29) % 300))).toString()
}))

export function GanasteRifa() {
  const [aviso, setAviso] = useState<{ g: RifaGanada; prueba: boolean }>()
  // Las ya cerradas en esta sesión no se vuelven a abrir si no se pudo anotar que se vieron.
  const cerradas = useRef(new Set<string>())
  const principal = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const abrir = (e: Event) => {
      const d = (e as CustomEvent<{ g: RifaGanada; prueba: boolean }>).detail
      if (!d.prueba && cerradas.current.has(d.g.rifa)) return
      setAviso((a) => (a && !d.prueba ? a : d))
    }
    addEventListener(GANASTE, abrir)
    return () => removeEventListener(GANASTE, abrir)
  }, [])

  useEffect(() => {
    if (!aviso) return
    principal.current?.focus()
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && cerrar()
    addEventListener('keydown', alPulsar)
    return () => removeEventListener('keydown', alPulsar)
  }, [aviso])

  function cerrar() {
    if (aviso && !aviso.prueba) {
      cerradas.current.add(aviso.g.rifa)
      void api('/api/comunidad/rifa/visto', { rifa: aviso.g.rifa }).catch(() => {})
    }
    setAviso(undefined)
  }

  function usar() {
    cerrar()
    location.hash = '#/opciones'
    setTimeout(() => document.getElementById('voces-de-sloth')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
  }

  if (!aviso) return null
  const { g } = aviso
  const cuantos = g.creditos.toLocaleString('en-US')
  return createPortal(
    <div className="ganaste-rifa" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="gr-caja" role="dialog" aria-modal="true" aria-labelledby="gr-titulo">
        <svg className="gr-confeti" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {CONFETI.map((c, i) =>
            c.alto === c.ancho ? (
              <circle key={i} cx={c.x} cy={c.y} r={1.2} style={{ fill: c.color, animationDelay: `${c.demora}s`, ['--cae' as string]: `${c.cae / 4}px`, ['--gira' as string]: `${c.gira}deg` }} />
            ) : (
              <rect key={i} x={c.x} y={c.y} width={c.ancho / 6} height={c.alto / 6} rx={0.3} style={{ fill: c.color, transformBox: 'fill-box', transformOrigin: 'center', animationDelay: `${c.demora}s`, ['--cae' as string]: `${c.cae / 4}px`, ['--gira' as string]: `${c.gira}deg` }} />
            )
          )}
        </svg>
        <button className="cv-cerrar" onClick={cerrar} aria-label="Cerrar" title="Cerrar">
          <Icono de="cerrar" />
        </button>
        <span className="gr-trofeo">
          <Icono de="regalo" />
        </span>
        <p className="cv-antetitulo">
          <Icono de="boleto" /> Rifa de Sloth{aviso.prueba ? ' · prueba' : ''}
        </p>
        <h2 id="gr-titulo">Ganasteeeee la rifa :)))</h2>
        <p className="gr-premio">{g.premio}</p>
        {g.creditos > 0 ? (
          <p className="cv-texto">
            Neta felicidades. {g.entregados ? 'Ya te deje' : 'En unos minutos te llegan'} <b>{cuantos}</b> creditos de voz en tu cuenta de Sloth, completamente gratis. No tienes que hacer nada mas: escoge una voz o clona LA TUYA y el agente la usa solita
            para tus videos.
          </p>
        ) : (
          <p className="cv-texto">Neta felicidades. Te escribo a tu correo en estos dias para darte tu premio, o si quieres respondeme el correo que te llego y lo vemos.</p>
        )}
        <div className="cv-acciones">
          {g.creditos > 0 ? (
            <>
              <button ref={principal} className="primary" onClick={usar}>
                Usar mis creditos
              </button>
              <button className="ghost" onClick={cerrar}>
                Luego
              </button>
            </>
          ) : (
            <button ref={principal} className="primary" onClick={cerrar}>
              Va, gracias
            </button>
          )}
        </div>
        <p className="cv-firma">Tambien te mande un correo con todo. Gracias por estar en la comunidad, un abrazoooooo, Vancci</p>
      </div>
    </div>,
    document.body
  )
}
