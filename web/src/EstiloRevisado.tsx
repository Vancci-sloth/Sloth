import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card, EstiloRevisado } from '../../shared/types'
import { api, ErrorApi } from './api'
import { abrirPublicacion } from './Comunidad'
import { abrirBorrador } from './Estilos'
import { Icono } from './Iconos'
import './EstiloRevisado.css'

/**
 * Un estilo tuyo que la revisión de la comunidad ya leyó y no aprobó. Antes solo llegaba como «Vancci comentó en…» en la
 * campana de Comunidad, y lo que le faltaba quedaba al fondo de su publicación: quien lo compartió no se enteraba. Ahora
 * Sloth lo dice donde se ve, y lleva directo al estilo:
 * - `AvisoDeRevision`: un aviso a media pantalla, una vez por respuesta, en cuanto se sabe.
 * - `RevisadosEnMenu` y `RevisadosEnNotificaciones`: una fila en la barra lateral y otra en la campana de arriba, que se
 *   quedan hasta que lo vuelves a compartir o se aprueba.
 * - `LoQueLeFalta`: en la ficha de su estilo, bajo su nombre, la lista exacta de lo que pidió la revisión, con cómo
 *   arreglarlo («Nuevo estilo» recibe la lista) y «Compartir otra vez». Mientras está, la ficha crece y el carrusel le
 *   cede sitio (`.con-revision`).
 * La lista sale de lo que la revisión contestó en su publicación (`GET /api/comunidad/estilo/revisados`,
 * `server/comunidad.ts`). Se pide al abrir Sloth y con cada aviso nuevo de la comunidad (`App`), y al publicar.
 */

const CAMBIO = 'sloth-estilos-revisados'
const GUARDADOS = 'estilos-revisados'
const VISTOS = 'estilos-revisados-vistos'

const esLista = (v: unknown): v is EstiloRevisado[] =>
  Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof r.publicacion === 'string' && typeof r.comentario === 'string' && typeof r.titulo === 'string' && Array.isArray(r.falta) && Array.isArray(r.sugerencias))

function guardados(): EstiloRevisado[] {
  try {
    const v = JSON.parse(localStorage.getItem(GUARDADOS) ?? '[]') as unknown
    return esLista(v) ? v : []
  } catch {
    return []
  }
}

/** Lo último que se supo: la fila del menú no aparece de golpe a los segundos de abrir. */
let lista = guardados()
/** Si ya se preguntó en esta sesión: el aviso a media pantalla no sale con algo que quizá ya arreglaste en otra parte. */
let fresca = false

function saber(nueva: EstiloRevisado[]) {
  lista = nueva
  fresca = true
  try {
    if (nueva.length) localStorage.setItem(GUARDADOS, JSON.stringify(nueva))
    else localStorage.removeItem(GUARDADOS)
  } catch {
    // Sin almacenamiento: dura lo que la ventana.
  }
  dispatchEvent(new Event(CAMBIO))
}

/** Pregunta cuáles de tus estilos se revisaron y no se aprobaron. Sin conexión se queda lo último sabido; sin cuenta, nada. */
export function pedirRevisados() {
  api<EstiloRevisado[]>('/api/comunidad/estilo/revisados').then(
    (l) => saber(esLista(l) ? l : []),
    (e: unknown) => e instanceof ErrorApi && e.status === 401 && saber([])
  )
}

function useRevisados(): { lista: EstiloRevisado[]; fresca: boolean } {
  const [estado, setEstado] = useState({ lista, fresca })
  useEffect(() => {
    const oir = () => setEstado({ lista, fresca })
    oir()
    addEventListener(CAMBIO, oir)
    return () => removeEventListener(CAMBIO, oir)
  }, [])
  return estado
}

/** Lo que la revisión le pidió al estilo de esa card, si lo leyó y no lo aprobó. */
export const useRevisado = (cardId?: string) => useRevisados().lista.find((x) => !!cardId && x.cardId === cardId)

/** Cuántos de tus estilos esperan a que los completes: el punto de la campana de arriba. */
export const useCuantosRevisados = () => useRevisados().lista.length

/** Directo a su estilo, donde está la lista; si su card no está en esta computadora, a su publicación. */
function irAlEstilo(r: EstiloRevisado) {
  if (r.cardId) location.hash = `/new/${r.cardId}`
  else abrirPublicacion(r.publicacion)
}

const cuantas = (r: EstiloRevisado) => (r.falta.length === 1 ? 'es una cosa' : `son ${r.falta.length} cosas`)

function vistos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(VISTOS) ?? '[]') as unknown
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

/**
 * «Tu estilo ya se revisó, pero no se aprobó»: a media pantalla, una vez por respuesta de la revisión (se recuerda por
 * su comentario). No se encima a otro aviso (la bienvenida, un estilo de Sloth que cambió): espera a que se cierre.
 */
export function AvisoDeRevision() {
  const { lista, fresca } = useRevisados()
  const [ya, setYa] = useState(vistos)
  const r = fresca ? lista.find((x) => !ya.includes(x.comentario)) : undefined
  const [libre, setLibre] = useState(false)

  // Al publicar o comentar desde aquí cambia cómo va: lo que volviste a compartir deja de avisarse.
  useEffect(() => {
    addEventListener('sloth-comunidad', pedirRevisados)
    return () => removeEventListener('sloth-comunidad', pedirRevisados)
  }, [])

  const pendiente = r?.comentario
  useEffect(() => {
    if (!pendiente || libre) return
    const mirar = () => !document.querySelector('[aria-modal="true"], .modal-backdrop') && setLibre(true)
    mirar()
    const t = setInterval(mirar, 1500)
    return () => clearInterval(t)
  }, [pendiente, libre])

  function cerrar(ir: boolean) {
    if (!r) return
    const todos = [...ya, r.comentario].slice(-50)
    try {
      localStorage.setItem(VISTOS, JSON.stringify(todos))
    } catch {
      // Sin almacenamiento: no vuelve a salir en esta ventana.
    }
    setYa(todos)
    setLibre(false)
    if (ir) irAlEstilo(r)
  }

  useEffect(() => {
    if (!r || !libre) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && cerrar(false)
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })

  if (!r || !libre) return null
  return createPortal(
    <div className="modal-backdrop" onClick={() => cerrar(false)}>
      <div className="modal revisado-aviso" role="dialog" aria-modal aria-label="Tu estilo ya se revisó, pero no se aprobó" onClick={(e) => e.stopPropagation()}>
        <span className="revisado-aviso-icono">
          <Icono de="alerta" className="icon-trazo" />
        </span>
        <h2>Tu estilo ya se revisó, pero no se aprobó</h2>
        <div className="modal-body">
          <p>
            Ayúdanos a completar lo que le falta a <strong>«{r.titulo}»</strong>
            {r.falta.length ? `: ${cuantas(r)}.` : '.'}
          </p>
          <p className="revisado-aviso-sigue">
            {r.cardId ? 'En tu estilo está la lista exacta de lo que pidió la revisión.' : 'La lista exacta está en la respuesta de su publicación.'} Cuando lo arregles, lo compartes otra vez y se vuelve a
            revisar solo.
          </p>
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={() => cerrar(false)}>
            Después
          </button>
          <button className="primary" autoFocus onClick={() => cerrar(true)}>
            Ver qué le falta
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/** En la barra lateral, bajo «Comunidad»: una fila por estilo sin aprobar, que lleva a él. */
export function RevisadosEnMenu() {
  const { lista } = useRevisados()
  return (
    <>
      {lista.slice(0, 3).map((r) => (
        <button key={r.publicacion} className="new-chat falta revisado" title={`La revisión leyó «${r.titulo}» y no lo aprobó: entra a ver qué le falta`} onClick={() => irAlEstilo(r)}>
          <span className="new-chat-icon">
            <Icono de="alerta" />
          </span>
          <span className="revisado-texto">
            Tu estilo no se aprobó
            <small>
              {r.titulo} · ver qué le falta
            </small>
          </span>
        </button>
      ))}
    </>
  )
}

/** En la campana de arriba, con las demás notificaciones de Sloth. */
export function RevisadosEnNotificaciones({ alIr }: { alIr(): void }) {
  const { lista } = useRevisados()
  if (!lista.length) return null
  return (
    <section className="panel revisado-notificaciones">
      {lista.map((r) => (
        <div className="item" key={r.publicacion}>
          <div className="fila">
            <div className="fila-nombre">
              <strong>«{r.titulo}» se revisó, pero no se aprobó</strong>
              <span>{r.falta.length ? `Le falta completar algo: ${cuantas(r)}.` : 'Le falta completar algo.'} Arréglalo y compártelo otra vez.</span>
            </div>
            <button className="primary" onClick={() => (alIr(), irAlEstilo(r))}>
              Ver qué le falta
            </button>
          </div>
        </div>
      ))}
    </section>
  )
}

/** Lo que se le pide a «Nuevo estilo» con lo que contestó la revisión. */
const arreglar = (card: Card, r: EstiloRevisado) =>
  [
    `La revisión de la comunidad leyó mi estilo «${card.title}» (la skill ${card.skill ?? card.id}) y no lo aprobó. Le falta esto:`,
    r.falta.map((f) => `- ${f}`).join('\n'),
    ...(r.sugerencias.length ? [`De paso, esto no lo frena, pero lo mejora:\n${r.sugerencias.map((s) => `- ${s}`).join('\n')}`] : []),
    'Arréglalo sin cambiar lo que hace. Sigue «Compartir un estilo» de tu skill.'
  ].join('\n\n')

/**
 * En la ficha del estilo, bajo su nombre: lo que la revisión pidió para aprobarlo, cada cosa como la dijo. «Nuevo estilo»
 * recibe la lista ya escrita; con eso arreglado, «Compartir otra vez» pone al día su publicación y se vuelve a revisar.
 * Arreglarlo va arriba, junto al título: en una ventana baja la ficha hace scroll, y eso no se pierde de vista.
 */
export function LoQueLeFalta({ card, r, onCompartir }: { card: Card; r: EstiloRevisado; onCompartir(): void }) {
  return (
    <section className="revisado-panel" aria-label="Lo que le falta para aprobarse">
      <header>
        <Icono de="alerta" className="icon-trazo" />
        <div>
          <strong>Se revisó, pero no se aprobó</strong>
          <span>{r.falta.length ? `Le falta esto (${cuantas(r)}). Con eso arreglado, se aprueba.` : 'Lo que le falta está en la respuesta de su publicación.'}</span>
        </div>
        {r.falta.length > 0 && (
          <button className="primary" title="Abre «Nuevo estilo» con esta lista ya escrita: la revisas y la mandas" onClick={() => abrirBorrador('nuevo-estilo', arreglar(card, r))}>
            Arreglarlo con «Nuevo estilo»
          </button>
        )}
      </header>
      {r.falta.length > 0 && (
        <ol className="revisado-lista">
          {r.falta.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      )}
      {r.sugerencias.length > 0 && (
        <details>
          <summary>{r.sugerencias.length === 1 ? 'De paso, una cosa que no lo frena pero lo mejora' : `De paso, ${r.sugerencias.length} cosas que no lo frenan pero lo mejoran`}</summary>
          <ul>
            {r.sugerencias.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="revisado-acciones">
        <button className="ghost" title="Pone al día su misma publicación y se vuelve a revisar" onClick={onCompartir}>
          Ya lo arreglé: compartir otra vez
        </button>
        <button className="ghost" title="Lo que contestó la revisión, en su publicación: ahí le puedes responder" onClick={() => abrirPublicacion(r.publicacion)}>
          Ver la respuesta
        </button>
      </div>
    </section>
  )
}
