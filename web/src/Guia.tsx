import { useState } from 'react'
import { CAMPOS_GUIA } from '../../shared/guia'
import type { GuiaEstilo } from '../../shared/types'
import { Icono } from './Iconos'
import './Guia.css'

/**
 * La guía de uso de un estilo (`shared/guia.ts`), en sus dos caras. `GuiaCampos` es la plantilla que llena quien lo
 * comparte: en `CompartirEstilo` (`Estilos.tsx`) y al editar su publicación (`Escribir.tsx`). `GuiaVista` es como la lee
 * quien lo usa: en la publicación del estilo (`Comunidad.tsx`) y bajo el nombre de su card (`App.tsx`), donde el ejemplo
 * se manda al compositor con un clic.
 */
export function GuiaCampos({ valor, onCambio }: { valor: Partial<GuiaEstilo>; onCambio(g: Partial<GuiaEstilo>): void }) {
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
    </div>
  )
}

export function GuiaVista({ guia, plegada, onEjemplo }: { guia: GuiaEstilo; plegada?: boolean; onEjemplo?(): void }) {
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
        </dl>
      )}
    </div>
  )
}
