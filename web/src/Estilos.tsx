import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'

/**
 * Compartir tus estilos y usar los de otros (`server/estilos.ts`). «Compartir» en la card de un estilo tuyo lo publica en
 * la comunidad, en Estilos (donde nadie más lo ve hasta que el creador lo aprueba), o lo guarda como archivo
 * `.sloth-estilo` en Descargas. «Importar», arriba de los estilos, instala uno de esos archivos. Tras instalar, si
 * video-base cambió desde la Sloth donde se hizo, se ofrece adaptarlo con «Nuevo estilo» (`abrirBorrador`).
 */

/** Lo que devuelve instalar un estilo (`Instalado` en `server/estilos.ts`). */
export interface Instalado {
  id: string
  titulo: string
  actualizado: boolean
  adaptar: string[]
  sloth: string
}

/** Lleva a la comunidad con el compositor abierto en Estilos y ese estilo subiendo (lo atiende `Comunidad`). */
export const COMPARTIR_ESTILO = 'comunidad:estilo'
export function compartirEstilo(e: { cardId: string; titulo: string }) {
  sessionStorage.setItem(COMPARTIR_ESTILO, JSON.stringify(e))
  location.hash = '/comunidad'
  dispatchEvent(new Event(COMPARTIR_ESTILO))
}

/** Abre un borrador de esa card con el texto ya escrito, para revisarlo antes de mandarlo (lo atiende `App`). */
export function abrirBorrador(cardId: string, texto: string) {
  dispatchEvent(new CustomEvent('sloth-borrador', { detail: { cardId, texto } }))
}

/** Lo que se le pide a «Nuevo estilo» para que un estilo instalado use lo de esta versión de video-base. */
const adaptar = (r: Instalado) =>
  [
    `Adapta mi estilo «${r.titulo}» (la skill ${r.id}) a esta versión de Sloth. Se hizo con Sloth ${r.sloth} y desde entonces cambiaron en video-base: ${r.adaptar.join(', ')}.`,
    'Sigue «Adaptar un estilo instalado» de tu skill.'
  ].join('\n\n')

function Modal(props: { titulo: string; children: ReactNode; acciones: ReactNode; onCerrar(): void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && props.onCerrar()
    addEventListener('keydown', tecla)
    return () => removeEventListener('keydown', tecla)
  })
  return createPortal(
    <div className="modal-backdrop" onClick={props.onCerrar}>
      <div className="modal" role="dialog" aria-modal aria-label={props.titulo} onClick={(e) => e.stopPropagation()}>
        <h2>{props.titulo}</h2>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">{props.acciones}</div>
      </div>
    </div>,
    document.body
  )
}

/** Un estilo ya instalado: listo para usarse y, si conviene, adaptarlo a esta versión. */
export function TrasInstalar({ r, onCerrar }: { r: Instalado; onCerrar(): void }) {
  return (
    <Modal
      titulo={r.actualizado ? `«${r.titulo}» está al día` : `«${r.titulo}» ya está en tus estilos`}
      onCerrar={onCerrar}
      acciones={
        r.adaptar.length ? (
          <>
            <button className="ghost" onClick={onCerrar}>
              Así está bien
            </button>
            <button className="primary" autoFocus onClick={() => (abrirBorrador('nuevo-estilo', adaptar(r)), onCerrar())}>
              Adaptar a tu versión
            </button>
          </>
        ) : (
          <button className="primary" autoFocus onClick={() => (location.hash = `/new/${r.id}`, onCerrar())}>
            Usarlo
          </button>
        )
      }
    >
      {r.adaptar.length ? (
        <p>
          Se hizo con Sloth {r.sloth} y desde entonces cambió lo que usa de video-base ({r.adaptar.join(', ')}). Puede funcionar igual, pero lo mejor es que
          «Nuevo estilo» lo adapte a tu versión antes del primer video.
        </p>
      ) : (
        <p>Su card ya sale entre tus estilos. Lo de antes, si ya lo tenías, se guardó en una copia.</p>
      )}
    </Modal>
  )
}

/** «Compartir» de un estilo tuyo: en la comunidad o como archivo. */
export function CompartirEstilo({ card, onCerrar }: { card: Card; onCerrar(): void }) {
  const [guardado, setGuardado] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  async function guardar() {
    setOcupado(true)
    setError('')
    try {
      setGuardado((await api<{ ruta: string }>(`/api/estilos/${card.id}/archivo`, {})).ruta)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <Modal
      titulo={`Compartir «${card.title}»`}
      onCerrar={onCerrar}
      acciones={
        guardado ? (
          <>
            <button className="ghost" onClick={() => void api('/api/open', { path: guardado })}>
              Ver en su carpeta
            </button>
            <button className="primary" autoFocus onClick={onCerrar}>
              Listo
            </button>
          </>
        ) : (
          <>
            <button className="ghost" disabled={ocupado} onClick={() => void guardar()}>
              {ocupado ? 'Guardando…' : 'Guardar como archivo'}
            </button>
            <button className="primary" autoFocus onClick={() => (compartirEstilo({ cardId: card.id, titulo: card.title }), onCerrar())}>
              Publicar en la comunidad
            </button>
          </>
        )
      }
    >
      {guardado ? (
        <p>
          Quedó en <code>{guardado}</code>. Quien lo reciba lo instala con «Importar», arriba de sus estilos.
        </p>
      ) : (
        <>
          <p>Viaja su skill y su card. Tus huellas, tu banco y tus poses se quedan aquí, y no lleva nada que Sloth no traiga.</p>
          <p>En la comunidad sale en Estilos cuando el creador de Sloth lo revise y lo apruebe.</p>
        </>
      )}
      {error && <p className="bad small">{error}</p>}
    </Modal>
  )
}

/** «Importar»: instala un `.sloth-estilo` que te pasaron. */
export function ImportarEstilo() {
  const elegir = useRef<HTMLInputElement>(null)
  const [instalado, setInstalado] = useState<Instalado | null>(null)
  const [error, setError] = useState('')
  async function importar(f: File) {
    setError('')
    try {
      const r = await fetch('/api/estilos/importar', { method: 'POST', body: f })
      const j = (await r.json().catch(() => ({}))) as Instalado & { error?: string }
      if (!r.ok) throw new Error(j.error ?? `No se pudo instalar ${f.name}.`)
      setInstalado(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <>
      {error && <span className="bad small importar-error">{error}</span>}
      <button className="estilo-importar" title="Instala un estilo que te pasaron (un archivo .sloth-estilo)" onClick={() => elegir.current?.click()}>
        <Icono de="descargar" className="icon-trazo" /> Importar
      </button>
      <input
        ref={elegir}
        type="file"
        accept=".sloth-estilo"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importar(f)
          e.target.value = ''
        }}
      />
      {instalado && <TrasInstalar r={instalado} onCerrar={() => setInstalado(null)} />}
    </>
  )
}
