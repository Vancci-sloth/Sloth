/**
 * El chat de una imagen del estudio (`/api/flow/estudio`): cuando un agente escribe el pedido («Prompt» con un modelo),
 * la imagen de partida y cada edición quedan como un hilo de solo lectura (`SessionMeta.imagenEstudio`), con lo que
 * pediste, el prompt que escribió el agente y el enlace para abrir cada versión en el editor. No se le escribe: se edita
 * desde el editor. Sin agente, no hay chat.
 */
import { CARD_HISTORIAL_IMAGEN, rutaEditorImagen, type ImagenEstudio } from '../../shared/estilos-imagen.ts'
import type { AgentEvent } from '../../shared/types.ts'
import type { Sessions } from '../sessions.ts'
import { tituloInicial } from '../titulos.ts'

type UsoPrompt = Pick<Extract<AgentEvent, { t: 'turn_end' }>, 'tokens' | 'costUsd' | 'model'>
export type PromptPreparado = { texto: string; uso?: UsoPrompt }

export function registroDeImagen(sessions: Pick<Sessions, 'list' | 'create' | 'registrarImagen'>, cwd: string) {
  function turno(id: string, pedido: ImagenEstudio, at = Date.now()) {
    let uso: UsoPrompt | undefined
    sessions.registrarImagen(id, { t: 'user', text: pedido.prompt, at }, { t: 'turn_start', at })
    return {
      promptListo(preparado: PromptPreparado) {
        uso = preparado.uso
        const literal = preparado.texto.split(/\r?\n/).map((linea) => `    ${linea}`).join('\n')
        sessions.registrarImagen(id, { t: 'text', id: `prompt-${pedido.id}`, delta: `**El prompt**\n\n${literal}` })
      },
      terminar(error?: string, fin = Date.now()) {
        if (!error)
          sessions.registrarImagen(id, {
            t: 'text',
            id: `imagen-${pedido.id}`,
            delta: pedido.origen ? `Imagen editada. [Abrir esta versión en el editor](${rutaEditorImagen(pedido.id)})` : `Imagen lista. [Abrirla en el editor](${rutaEditorImagen(pedido.id)})`
          })
        sessions.registrarImagen(id, { t: 'turn_end', at: fin, ok: !error, error, ...uso })
      }
    }
  }
  /** `base`: la imagen de partida de la edición (o la misma, si es nueva). Sin chat ni agente, nada. */
  return (base: ImagenEstudio, pedido: ImagenEstudio) => {
    let hilo = sessions.list().find((s) => s.imagenEstudio === base.id)
    const modelo = pedido.orquestador ?? base.orquestador
    if (!hilo && modelo) hilo = sessions.create({ cardId: CARD_HISTORIAL_IMAGEN, imagenEstudio: base.id, title: tituloInicial(base.prompt, 'Imagen'), cwd, model: modelo })
    return hilo ? turno(hilo.id, pedido) : undefined
  }
}
