import { useEffect, useRef, useState } from 'react'
import type { Model, ModelosConf, ModeloTarea } from '../../shared/types'
import { NOMBRE_AGENTE, proveedorDe, type Proveedor } from '../../shared/providers'
import { gruposModelos, Picker, type Choice } from './Composer'
import { Segmento } from './Segmento'

/**
 * El modelo de un hilo nuevo. «Optimizado» (lo normal) usa lo que medimos como mejor para la skill en cada tarea: el hilo
 * y cada subagente (`modelos` de la card); en una skill sin medir, el hilo va en lo último que elegiste a mano.
 * «Avanzado» deja elegir el modelo y el esfuerzo de cada uno. Sloth le pasa los de los subagentes al agente en la línea
 * `Subagentes:`, que la skill respeta.
 */

/** Sin medir y sin nada elegido a mano, el hilo va en Opus con esfuerzo alto: lo mejor en las dos skills que se midieron. */
const POR_DEFECTO: ModeloTarea = { model: 'claude-opus-5-5', effort: 'high' }
/** Con ChatGPT y sin Claude, la card va en «Avanzado» con GPT-6.1 Terra en medio, mientras no elijas otro. */
export const CON_CHATGPT: Avanzado = { principal: { model: 'codex:gpt-6.1-terra', effort: 'medium' }, tareas: {} }
/**
 * Sin Claude ni ChatGPT, el modelo gratis de OpenCode con que va un hilo nuevo: el que mejor siguió las skills en las
 * pruebas, si sigue en el catálogo (cambia solo); si no, el primero.
 */
const OPENCODE_PRIMERO = 'opencode:opencode/big-pickle'
export function conOpenCode(models: Model[]): Avanzado | undefined {
  const gratis = models.filter((m) => proveedorDe(m.id) === 'opencode' && !m.precio)
  const m = gratis.find((x) => x.id === OPENCODE_PRIMERO) ?? gratis[0]
  return m && { principal: { model: m.id }, tareas: {} }
}
/** Con otro agente (Grok, Cursor…) y sin Claude, ChatGPT ni OpenCode: su primer modelo, con su esfuerzo de siempre. */
export function conPrimero(models: Model[], p: Proveedor): Avanzado | undefined {
  const m = models.find((x) => proveedorDe(x.id) === p)
  return m && { principal: { model: m.id, effort: m.defaultEffort }, tareas: {} }
}
const SUBAGENTES = ['opus', 'sonnet', 'haiku']
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh']
const NOMBRE: Record<string, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }

/** Lo que el usuario cambió en «Avanzado». Sin esto, la card va en «Optimizado». */
export type Avanzado = { principal?: Choice; tareas: Record<string, { model: string; effort: string }> }
type Tarea = { nombre: string; para: string; model: string; effort: string; medido?: string }

/**
 * El modelo del hilo y el de cada subagente, según el modo. En «Optimizado», el hilo va en lo medido para la card; sin
 * medir (o si el catálogo no lo trae), en `ultimo`, lo último que elegiste a mano; y si nunca elegiste, en `POR_DEFECTO`.
 */
export function elegirModelos(conf: ModelosConf | undefined, models: Model[], avanzado: Avanzado | undefined, ultimo?: Choice) {
  const optimo =
    (conf?.principal && valido(models, conf.principal)) ||
    (ultimo && valido(models, ultimo)) ||
    valido(models, POR_DEFECTO) ||
    (models[0] && valido(models, { model: models[0].id }))
  const choice = (avanzado?.principal && valido(models, avanzado.principal)) || optimo
  // Las mediciones actuales piden alias de Claude: Codex y OpenCode eligen sus propios subagentes.
  const tareas: Tarea[] = proveedorDe(choice?.model ?? '') !== 'claude' ? [] : (conf?.tareas ?? []).map((t) => ({ ...t, ...(avanzado?.tareas[t.nombre] ?? {}) }))
  return { choice, tareas }
}

/** La línea que la skill lee para elegir el modelo de cada subagente. */
export const lineaSubagentes = (tareas: Tarea[]) => (tareas.length ? `Subagentes: ${tareas.map((t) => `${t.nombre} = ${t.model} ${t.effort}`).join('; ')}.` : '')

/** Un modelo del catálogo con un esfuerzo que admite. Una elección vieja guardada puede decir `claude-opus-5-5[1m]`: es el mismo. */
function valido(models: Model[], c: { model: string; effort?: string }): Choice | undefined {
  const m = models.find((x) => x.id === c.model.replace('[1m]', ''))
  if (!m) return undefined
  return { model: m.id, effort: m.efforts.includes(c.effort ?? '') ? c.effort : m.defaultEffort }
}

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
  const cambiarTarea = (t: Tarea, c: Partial<{ model: string; effort: string }>) =>
    props.onAvanzado({ ...avanzado!, tareas: { ...avanzado!.tareas, [t.nombre]: { model: t.model, effort: t.effort, ...c } } })

  return (
    <div ref={root} className={`picker modelos ${open ? 'open' : ''}`}>
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
                    groups={gruposModelos(models).map((g) => ({ ...g, options: g.options.map((o) => ({ ...o, label: o.label.replace(/^Codex · /, '') })) }))}
                    onChange={(model) => cambiarPrincipal({ model, effort: models.find((m) => m.id === model)?.defaultEffort })}
                  />
                  <Picker
                    className="modelos-selector"
                    menuClassName="modelos-lista"
                    menuWidth={160}
                    flotante
                    label={choice?.effort ?? 'Esfuerzo'}
                    value={choice?.effort ?? ''}
                    disabled={!modelo?.efforts.length}
                    groups={[{ label: 'Esfuerzo', options: (modelo?.efforts ?? []).map((x) => ({ value: x, label: x })) }]}
                    onChange={(effort) => cambiarPrincipal({ effort })}
                  />
                </>
              ) : (
                <span>
                  {modelo?.label ?? choice?.model} · {choice?.effort}
                </span>
              )}
            </Fila>
            {tareas.map((t) => (
              <Fila key={t.nombre} nombre={t.nombre[0].toUpperCase() + t.nombre.slice(1)} para={t.para} medido={!avanzado ? t.medido : undefined}>
                {avanzado ? (
                  <>
                    <select value={t.model} onChange={(e) => cambiarTarea(t, { model: e.target.value })}>
                      {SUBAGENTES.map((m) => (
                        <option key={m} value={m}>
                          {NOMBRE[m]}
                        </option>
                      ))}
                    </select>
                    <Picker
                      className="modelos-selector"
                      menuClassName="modelos-lista"
                      menuWidth={160}
                      flotante
                      label={t.effort}
                      value={t.effort}
                      groups={[{ label: 'Esfuerzo', options: ESFUERZOS.map((x) => ({ value: x, label: x })) }]}
                      onChange={(effort) => cambiarTarea(t, { effort })}
                    />
                  </>
                ) : (
                  <span>
                    {NOMBRE[t.model] ?? t.model} · {t.effort}
                  </span>
                )}
              </Fila>
            ))}
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
                : tareas.length || principalMedido
                  ? 'Lo que medimos como mejor en cada tarea: misma calidad por menos tiempo y dinero. Pasa el ratón por «medido» para ver la prueba.'
                  : 'Esta skill aún no se ha medido: el hilo va en lo último que elegiste a mano (o en Opus high, si nunca elegiste), y sus subagentes, en lo que diga la skill.'}
          </p>
        </div>
      )}
    </div>
  )
}

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
