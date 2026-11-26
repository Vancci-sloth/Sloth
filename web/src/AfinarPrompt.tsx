import { useEffect, useId, useRef, useState } from 'react'
import { limitePrompt, MAX_RESPUESTA, modeloAfina, type PreguntaAfinado, type PropuestaAfinado, type TipoAfinado } from '../../shared/afinar-prompt'
import { proveedorDe } from '../../shared/providers'
import type { Model } from '../../shared/types'
import { api } from './api'
import { Icono } from './Iconos'
import { gruposModelos, Picker } from './Picker'
import './AfinarPrompt.css'

type Cambio = { texto: string; deshacer(): void }
export type BorradorAfinable = { prompt: string; aplicar(prompt: string): Cambio }
type Cuestionario = { modelo: string; preguntas: PreguntaAfinado[]; respuestas: string[]; aplicadas: string[] }
const nombreModelo = (m: Model) => m.label.replace(/^(?:(?:Claude|ChatGPT|Codex|DeepSeek|OpenCode)\s*·\s*)+/i, '')

export function AfinarPrompt({ texto, tomar, onTexto, enfocar, tipo, contexto, modelo, modelos, bloqueado }: {
  texto: string
  tomar?(): BorradorAfinable
  onTexto?(texto: string, afinado: boolean): void
  enfocar(): void
  tipo: TipoAfinado
  contexto: string
  modelo?: string
  modelos: Model[]
  bloqueado?: boolean
}) {
  const id = useId()
  const dialogo = useRef<HTMLDialogElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const actual = useRef({ texto, contexto })
  actual.current = { texto, contexto }
  const enCurso = useRef(false)
  const [elegido, setElegido] = useState('')
  const [cuestionario, setCuestionario] = useState<Cuestionario>()
  const [otra, setOtra] = useState<{ indice: number; texto: string }>()
  const [esperando, setEsperando] = useState<'borrador' | 'respuestas'>()
  const [error, setError] = useState('')
  const [errorRespuestas, setErrorRespuestas] = useState('')
  const [cambio, setCambio] = useState<Cambio>()
  const compatibles = modelos.filter((m) => modeloAfina(m.id))
  const preferido = compatibles.find((m) => m.id === modelo) ?? compatibles[0]
  const seleccionado = compatibles.find((m) => m.id === elegido) ?? preferido
  const acento = seleccionado && proveedorDe(seleccionado.id)
  const mostrarDeshacer = cambio && cambio.texto === texto
  const hayRespuestas = cuestionario?.respuestas.some((r, i) => r !== cuestionario.aplicadas[i])

  useEffect(() => { setElegido('') }, [modelo])
  useEffect(() => { if (cambio && texto !== cambio.texto) setCambio(undefined) }, [cambio, texto])
  useEffect(() => {
    setCuestionario(undefined)
    setOtra(undefined)
    setErrorRespuestas('')
  }, [contexto, !!texto.trim()])

  function abrir() {
    setError('')
    if (dialogo.current) {
      dialogo.current.returnValue = ''
      dialogo.current.showModal()
    }
  }

  async function consultar(idModelo: string, preguntas?: Cuestionario) {
    if (enCurso.current || bloqueado) return
    const setAviso = preguntas ? setErrorRespuestas : setError
    setAviso('')
    const borrador = tomar?.() ?? {
      prompt: texto,
      aplicar(prompt: string) {
        onTexto?.(prompt, true)
        return { texto: prompt, deshacer: () => onTexto?.(texto, false) }
      }
    }
    const max = limitePrompt(tipo)
    if (!borrador.prompt.trim()) return setAviso('Escribe primero lo que quieres crear.')
    if (borrador.prompt.length > max) return setAviso(`Acorta el borrador a ${max} caracteres para afinarlo.`)
    const respuestas = preguntas?.preguntas.flatMap(({ pregunta }, i) => {
      const respuesta = preguntas.respuestas[i]
      return respuesta ? [{ pregunta, respuesta }] : []
    })
    enCurso.current = true
    setEsperando(preguntas ? 'respuestas' : 'borrador')
    try {
      const guia = preguntas ? `Integra las respuestas en el borrador actual y conserva el resto de lo que ya escribió el usuario.\n${contexto}` : contexto
      const r = await api<PropuestaAfinado>('/api/afinar-prompt', { tipo, contexto: guia.slice(0, 1800), modelo: idModelo, prompt: borrador.prompt, respuestas })
      if (!boton.current || (!preguntas && !dialogo.current?.open)) return
      if (actual.current.texto !== texto || actual.current.contexto !== contexto) {
        return setAviso('El borrador cambió durante el afinado. Vuelve a intentarlo con tu texto actual.')
      }
      const aplicado = borrador.aplicar(r.prompt)
      setCambio({ texto: aplicado.texto, deshacer() { aplicado.deshacer(); setCuestionario(cuestionario) } })
      const vacias = r.preguntas.map(() => '')
      setCuestionario(preguntas ? { ...preguntas, aplicadas: preguntas.respuestas } : r.preguntas.length
        ? { modelo: idModelo, preguntas: r.preguntas, respuestas: vacias, aplicadas: vacias } : undefined)
      setOtra(undefined)
      if (preguntas) requestAnimationFrame(enfocar)
      else dialogo.current?.close('editado')
    } catch (e) {
      if (boton.current && (preguntas || dialogo.current?.open)) setAviso(e instanceof Error ? e.message : 'No pudimos afinar el prompt.')
    } finally { enCurso.current = false; setEsperando(undefined) }
  }

  function responder(indice: number, respuesta: string) {
    setCuestionario((q) => q && { ...q, respuestas: q.respuestas.map((r, i) => i === indice ? respuesta : r) })
    setOtra(undefined)
    setErrorRespuestas('')
  }

  return <>
    {(cuestionario || errorRespuestas) && !!texto.trim() && <div className="afinar-decisiones" role="group" aria-label="Detalles del prompt"
      data-proveedor={cuestionario && proveedorDe(cuestionario.modelo)}>
      <div className="afinar-preguntas">
        {cuestionario?.preguntas.map(({ pregunta, opciones }, i) => {
          const respuesta = cuestionario.respuestas[i]
          const valor = opciones.indexOf(respuesta)
          return <Picker key={pregunta} flotante seguirAncla className="afinar-pregunta" menuClassName="modelos-lista afinar-lista-pregunta"
            etiqueta={respuesta ? `${pregunta} ${respuesta}` : pregunta} disabled={bloqueado || !!esperando}
            label={<span title={respuesta || pregunta}>{respuesta || pregunta}</span>}
            value={valor < 0 ? respuesta ? 'personal' : '' : String(valor)}
            groups={[{ label: pregunta, options: [
              ...opciones.map((label, i) => ({ value: String(i), label })),
              ...(respuesta && valor < 0 ? [{ value: 'personal', label: respuesta }] : []),
              { value: 'otra', label: respuesta && valor < 0 ? 'Editar mi respuesta…' : 'Otra respuesta…' }
            ] }]}
            onChange={(valor) => valor === 'otra' ? setOtra({ indice: i, texto: respuesta ?? '' }) : responder(i, opciones[Number(valor)])} />
        })}
        {hayRespuestas && !otra && <button type="button" className="afinar-boton" disabled={bloqueado || !!esperando}
          onClick={() => cuestionario && void consultar(cuestionario.modelo, cuestionario)}>
          {esperando === 'respuestas' ? 'Aplicando…' : 'Aplicar respuestas'}
        </button>}
      </div>
      {otra && <div className="afinar-personal">
        <input aria-label="Tu respuesta" value={otra.texto} autoFocus maxLength={MAX_RESPUESTA} placeholder="Escribe tu respuesta…"
          onChange={(e) => setOtra({ ...otra, texto: e.target.value })} onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); setOtra(undefined) }
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (otra.texto.trim()) responder(otra.indice, otra.texto.trim()) }
          }} />
        <button type="button" className="afinar-boton" disabled={!otra.texto.trim()} onClick={() => responder(otra.indice, otra.texto.trim())}>Guardar respuesta</button>
        <button type="button" className="afinar-deshacer" onClick={() => setOtra(undefined)}>Cancelar</button>
      </div>}
      {errorRespuestas && <p className="bad small" role="alert">{errorRespuestas}</p>}
    </div>}
    <button ref={boton} type="button" className="afinar-boton" data-proveedor={acento}
      disabled={bloqueado || !!esperando || !texto.trim()} aria-haspopup="dialog" aria-controls={id} aria-label="Afinar prompt"
      title={texto.trim() ? 'Mejorar el borrador con IA' : 'Escribe primero lo que quieres crear'} onClick={abrir}>
      <Icono de="lapiz" />Afinar
    </button>
    {mostrarDeshacer && <button type="button" className="afinar-deshacer" disabled={bloqueado || !!esperando}
      onClick={() => { cambio.deshacer(); setCambio(undefined); setOtra(undefined); enfocar() }}>Deshacer afinado</button>}
    <dialog ref={dialogo} id={id} className="afinar-panel" data-proveedor={acento} aria-labelledby={`${id}-titulo`}
      onClose={(e) => e.currentTarget.returnValue === 'editado' ? enfocar() : boton.current?.focus({ preventScroll: true })}>
      <header className="afinar-cabecera">
        <span><Icono de="lapiz" /><h2 id={`${id}-titulo`}>Afinar prompt</h2></span>
        <button type="button" className="afinar-cerrar" aria-label="Cerrar afinado" onClick={() => dialogo.current?.close()}><Icono de="cerrar" /></button>
      </header>
      {(!seleccionado || error || esperando === 'borrador') && <div className="afinar-contenido">
        {esperando === 'borrador' && <div className="afinar-espera" role="status"><span className="spinner" aria-hidden="true" />Afinando el borrador…</div>}
        {!seleccionado && <p className="muted">Conecta un modelo compatible en <a href="#/opciones/agentes" onClick={() => dialogo.current?.close()}>Opciones → Agentes de IA</a>.</p>}
        {error && <p className="bad" role="alert">{error}</p>}
      </div>}
      {seleccionado && <footer className="afinar-pie">
        <div className="afinar-modelo"><span className="muted small">Modelo</span>
          <Picker flotante buscar="Buscar modelo…" menuClassName="modelos-lista afinar-lista-modelos" menuWidth={330}
            etiqueta={`Modelo para afinar, ${nombreModelo(seleccionado)}`} label={<span>{nombreModelo(seleccionado)}</span>}
            value={seleccionado.id} disabled={!!esperando} groups={gruposModelos(compatibles.map((m) => ({ ...m, label: nombreModelo(m) })))}
            onChange={(id) => { setElegido(id); setError('') }} />
        </div>
        <button type="button" className="afinar-boton destacado" disabled={!!esperando} onClick={() => void consultar(seleccionado.id)}>
          {error ? 'Reintentar' : 'Afinar borrador'}
        </button>
      </footer>}
    </dialog>
  </>
}
