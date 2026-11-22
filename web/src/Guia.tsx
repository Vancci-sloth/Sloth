import { useState } from 'react'
import { CAMPOS_GUIA, CON_QUE, HERRAMIENTAS, PARA_QUE_AGENTES } from '../../shared/guia'
import { NOMBRE_AGENTE, PROVEEDORES, type Proveedor } from '../../shared/providers'
import type { GuiaEstilo, PruebaEstilo } from '../../shared/types'
import { Icono } from './Iconos'
import './Guia.css'

/**
 * La guía de uso de un estilo (`shared/guia.ts`), en sus dos caras, igual para todos los estilos. `GuiaCampos` es la
 * plantilla que llena quien lo comparte: en `CompartirEstilo` (`Estilos.tsx`) y al editar su publicación
 * (`Escribir.tsx`). `GuiaVista` es como la lee quien lo usa: en la publicación del estilo (`Comunidad.tsx`), en el visor
 * de la tienda y bajo el nombre de su card (`App.tsx`), donde el ejemplo se manda al compositor con un clic. En la
 * comunidad va con su prueba (`prueba`): con qué agente se hizo su video, cuánto costó y cuánto tardó.
 */

/** En la lista de agentes, Codex se llama Codex (en lo demás de la app, «ChatGPT», la cuenta con que corre). */
export const nombreAgente = (p: Proveedor) => (p === 'codex' ? 'Codex' : NOMBRE_AGENTE[p])

/** «3 min 40 s», «45 s». */
export const duracion = (segundos: number) => (segundos >= 60 ? `${Math.floor(segundos / 60)} min${segundos % 60 ? ` ${Math.round(segundos % 60)} s` : ''}` : `${Math.round(segundos)} s`)

/** Con qué lo hace, en una línea: «Solo código» si no usa nada más. */
export const conQue = (ids: string[]) => (ids.length === 1 && ids[0] === 'codigo' ? 'Solo código, en tu computadora' : HERRAMIENTAS.filter((h) => ids.includes(h.id)).map((h) => h.nombre).join(' · '))

/** La prueba, en una línea: con qué se hizo, lo que costó y lo que tardó. */
export const pruebaEnLinea = (p: PruebaEstilo) =>
  [`Hecho con ${nombreAgente(p.agente)} (${p.modelo})`, p.costo ? `$${p.costo.toFixed(2)} a precio de API` : 'sin costo de API', `${duracion(p.segundos)} de trabajo`, ...(p.video ? [`video de ${duracion(p.video)}`] : [])].join(' · ')

export function GuiaCampos({ valor, onCambio }: { valor: Partial<GuiaEstilo>; onCambio(g: Partial<GuiaEstilo>): void }) {
  /** Pone o quita uno de una lista. */
  const alternar = <T,>(lista: T[] | undefined, uno: T) => ((lista ?? []).includes(uno) ? (lista ?? []).filter((x) => x !== uno) : [...(lista ?? []), uno])
  return (
    <div className="guia-campos">
      {CAMPOS_GUIA.map((c) => {
        const campo = { value: valor[c.id] ?? '', maxLength: c.max, placeholder: c.pista }
        return (
          <label key={c.id}>
            <span>
              {c.titulo}
              {c.opcional && <em> · si aplica</em>}
            </span>
            {c.id === 'ejemplo' ? (
              <textarea rows={2} {...campo} onChange={(e) => onCambio({ ...valor, [c.id]: e.target.value })} />
            ) : (
              <input {...campo} onChange={(e) => onCambio({ ...valor, [c.id]: e.target.value })} />
            )}
          </label>
        )
      })}
      <fieldset className="guia-marcar">
        <legend>
          {CON_QUE} <em>· marca todo lo que usa</em>
        </legend>
        {HERRAMIENTAS.map((h) => (
          <label key={h.id}>
            <input type="checkbox" checked={!!valor.herramientas?.includes(h.id)} onChange={() => onCambio({ ...valor, herramientas: alternar(valor.herramientas, h.id) })} />
            <span>
              <strong>{h.nombre}</strong> {h.que}
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="guia-marcar agentes">
        <legend>
          {PARA_QUE_AGENTES} <em>· solo con los que lo probaste</em>
        </legend>
        {PROVEEDORES.map((p) => (
          <label key={p}>
            <input type="checkbox" checked={!!valor.agentes?.includes(p)} onChange={() => onCambio({ ...valor, agentes: alternar(valor.agentes, p) })} />
            <span>
              <strong>{nombreAgente(p)}</strong>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}

export function GuiaVista({ guia, prueba, plegada, onEjemplo }: { guia: GuiaEstilo; prueba?: PruebaEstilo; plegada?: boolean; onEjemplo?(): void }) {
  const [abierta, setAbierta] = useState(!plegada)
  return (
    <div className="guia">
      <button className="guia-titulo" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
        <Icono de="pregunta" className="guia-ico" /> Cómo se usa
      </button>
      {abierta && (
        <dl>
          {CAMPOS_GUIA.filter((c) => guia[c.id]).map((c) => (
            <div key={c.id}>
              <dt>{c.titulo}</dt>
              <dd>
                {guia[c.id]}
                {c.id === 'ejemplo' && onEjemplo && (
                  <button className="guia-usar" title="Lo pone en el mensaje, para que lo cambies por lo tuyo" onClick={onEjemplo}>
                    Usar este ejemplo
                  </button>
                )}
              </dd>
            </div>
          ))}
          {!!guia.herramientas?.length && (
            <div>
              <dt>{CON_QUE}</dt>
              <dd>{conQue(guia.herramientas)}</dd>
            </div>
          )}
          {!!guia.agentes?.length && (
            <div>
              <dt>{PARA_QUE_AGENTES}</dt>
              <dd>{guia.agentes.map(nombreAgente).join(' · ')}</dd>
            </div>
          )}
          {prueba && (
            <div>
              <dt>Su video de prueba</dt>
              <dd>{pruebaEnLinea(prueba)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
