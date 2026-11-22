import { useEffect, useRef, useState } from 'react'
import type { Model, ModelosConf } from '../../shared/types'
import { NOMBRE_AGENTE, proveedorDe, type Proveedor } from '../../shared/providers'
import { textoPorMinuto, type Avanzado, type Tarea } from '../../shared/modelos'
import { gruposModelos, Picker, type Choice } from './Composer'
import { Segmento } from './Segmento'

export { CON_CHATGPT, conOpenCode, conPrimero, elegirModelos, lineaSubagentes, subagentes, textoPorMinuto, type Avanzado } from '../../shared/modelos'

/**
 * El modelo de un hilo nuevo. «Optimizado» (lo normal) usa lo que medimos como mejor para el hilo (`modelos` de la
 * card); en una skill sin medir, lo último que elegiste a mano. «Avanzado» deja elegirlo, con su esfuerzo. Los
 * subagentes van siempre en ese mismo modelo y esfuerzo: Sloth se lo pasa al agente en la línea `Subagentes:`, que la
 * skill respeta (antes iban en lo medido por tarea, y en un hilo de Haiku los de las escenas salían en Opus).
 */

export function Modelos(props: {
  conf?: ModelosConf
  models: Model[]
  avanzado?: Avanzado
  choice?: Choice
  tareas: Tarea[]
  /** Sin cuenta de Claude, con qué va: «Optimizado», medido con Claude, no se puede elegir. */
  sinClaude?: Proveedor | false
  onAvanzado(a: Avanzado | undefined): void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { avanzado, choice, tareas, models } = props
  const modelo = models.find((m) => m.id === choice?.model)
  const principalMedido = props.conf?.principal?.medido
  const porMinuto = choice && textoPorMinuto(props.conf, choice.model, choice.effort)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !root.current?.querySelector('.picker.open') && setOpen(false)
    addEventListener('pointerdown', away)
    addEventListener('keydown', esc)
    return () => {
      removeEventListener('pointerdown', away)
      removeEventListener('keydown', esc)
    }
  }, [open])

  const cambiarPrincipal = (c: Partial<Choice>) => props.onAvanzado({ ...avanzado!, principal: { ...choice!, ...c } })

  return (
    <div ref={root} data-proveedor={proveedorDe(choice?.model ?? '')} className={`picker modelos ${open ? 'open' : ''}`}>
      <button className="picker-trigger" title="Qué modelo hace cada tarea" onClick={() => setOpen(!open)}>
        {avanzado ? `Avanzado · ${modelo?.label ?? choice?.model ?? ''} ${choice?.effort ?? ''}` : '✦ Optimizado'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="picker-menu modelos-menu">
          <Segmento
            label="Modo"
            valor={avanzado ? 'avanzado' : 'optimizado'}
            opciones={[
              { id: 'optimizado', texto: 'Optimizado', disabled: !!props.sinClaude, title: props.sinClaude ? 'Va con Claude: conecta tu cuenta en Opciones' : undefined },
              { id: 'avanzado', texto: 'Avanzado' }
            ]}
            onCambio={(modo) => (modo === 'optimizado' ? props.onAvanzado(undefined) : !avanzado && props.onAvanzado({ principal: choice, tareas: {} }))}
          />
          <div className="modelos-filas">
            <Fila nombre="Hilo principal" para="Lo que escribe, decide y arma" medido={!avanzado ? principalMedido : undefined}>
              {avanzado ? (
                <>
                  <Picker
                    className="modelos-selector"
                    menuClassName="modelos-lista"
                    flotante
                    label={modelo?.label ?? choice?.model ?? 'Modelo'}
                    value={choice?.model ?? ''}
                    menuWidth={340}
                    buscar
                    groups={gruposModelos(models).map((g) => ({
                      ...g,
                      options: g.options.map((o) => ({
                        ...o,
                        label: o.label.replace(/^Codex · /, ''),
                        detalle: textoPorMinuto(props.conf, o.value, undefined, o.value === choice?.model ? choice.effort : models.find((m) => m.id === o.value)?.defaultEffort)
                      }))
                    }))}
                    onChange={(model) => cambiarPrincipal({ model, effort: models.find((m) => m.id === model)?.defaultEffort })}
                  />
                  <Picker
                    className="modelos-selector"
                    menuClassName="modelos-lista"
                    menuWidth={props.conf?.porMinuto?.some((p) => p.model === choice?.model) ? 230 : 160}
                    flotante
                    label={choice?.effort ?? 'Esfuerzo'}
                    value={choice?.effort ?? ''}
                    disabled={!modelo?.efforts.length}
                    groups={[{ label: 'Esfuerzo', options: (modelo?.efforts ?? []).map((x) => ({ value: x, label: x, detalle: choice && textoPorMinuto(props.conf, choice.model, x) })) }]}
                    onChange={(effort) => cambiarPrincipal({ effort })}
                  />
                </>
              ) : (
                <span>
                  {modelo?.label ?? choice?.model} · {choice?.effort}
                  {porMinuto && <span className="picker-detalle"> · {porMinuto}</span>}
                </span>
              )}
            </Fila>
            <Fila nombre="Subagentes" para="Captura, escenas, revisión y los demás">
              <span>{tareas.length ? 'El mismo modelo y esfuerzo' : 'Los del agente'}</span>
            </Fila>
          </div>
          <p className="modelos-nota muted small">
            {props.sinClaude === 'codex'
              ? 'Con tu cuenta de ChatGPT, el hilo va en uno de sus modelos: GPT-6.1 Terra, si no eliges otro. «Optimizado» va con Claude: se puede elegir al conectar tu cuenta de Claude en Opciones.'
              : props.sinClaude === 'opencode'
              ? 'Con tu cuenta de OpenCode, el hilo va en uno de sus modelos gratis: Big Pickle, si no eliges otro. «Optimizado» va con Claude: se puede elegir al conectar tu cuenta de Claude en Opciones.'
              : props.sinClaude
              ? `Sin Claude, el hilo va con ${NOMBRE_AGENTE[props.sinClaude]}, en el modelo que elijas. «Optimizado» va con Claude: se puede elegir al conectar tu cuenta de Claude en Opciones.`
              : avanzado
                ? 'Tus elecciones se quedan para esta card. «Optimizado» vuelve a lo medido o, si la skill no se ha medido, a lo último que elegiste.'
                : principalMedido
                  ? 'Lo que medimos como mejor para el hilo; sus subagentes van en ese mismo modelo y esfuerzo. Pasa el ratón por «medido» para ver la prueba.'
                  : 'Esta skill aún no se ha medido: el hilo va en lo último que elegiste a mano (o en Opus high, si nunca elegiste), y sus subagentes, en ese mismo modelo y esfuerzo.'}
          </p>
          {!!props.conf?.porMinuto?.length && (
            <p className="modelos-nota muted small" title={props.conf.porMinuto.map((p) => `${modeloNombre(models, p.model)} ${p.effort}: ${p.medido}`).join('\n')}>
              Junto a cada modelo medido con este estilo: lo que cuesta un minuto de video y cuánto tarda en salir. Es a precio de la API: con tu plan de Claude o ChatGPT no se cobra aparte, gasta de su límite. Los demás aún no se han medido.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const modeloNombre = (models: Model[], id: string) => models.find((m) => m.id === id)?.label ?? id

function Fila({ nombre, para, medido, children }: { nombre: string; para: string; medido?: string; children: React.ReactNode }) {
  return (
    <div className="modelos-fila">
      <span className="modelos-tarea">
        {nombre}
        <span className="muted small">{para}</span>
      </span>
      <span className="modelos-valor">
        {children}
        {medido && (
          <span className="modelos-medido" title={medido}>
            medido
          </span>
        )}
      </span>
    </div>
  )
}
