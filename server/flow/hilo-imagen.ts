import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { CARD_HISTORIAL_IMAGEN, rutaEditorImagen, type ImagenEstudio } from '../../shared/estilos-imagen.ts'
import type { AgentEvent } from '../../shared/types.ts'
import type { Sessions } from '../sessions.ts'
import { tituloInicial } from '../titulos.ts'

type UsoPrompt = Pick<Extract<AgentEvent, { t: 'turn_end' }>, 'tokens' | 'costUsd' | 'model'>
export type PromptPreparado = { texto: string; uso?: UsoPrompt }

function leerPromptAnterior(carpeta: string): string | undefined {
  const archivo = join(carpeta, 'prompt.txt')
  try {
    if ((statSync(archivo, { throwIfNoEntry: false })?.size ?? Infinity) <= 16_000) {
      const texto = readFileSync(archivo, 'utf8').trim()
      if (texto && texto.length <= 4000) return texto
    }
  } catch { /* El pedido sigue accesible si ya no existe su borrador de prompt. */ }
}

export function registroDeImagen(sessions: Pick<Sessions, 'list' | 'create' | 'registrarImagen' | 'vincularImagen'>, cwd: string) {
  function turno(id: string, pedido: ImagenEstudio, at = Date.now()) {
    let uso: UsoPrompt | undefined
    sessions.registrarImagen(id,
      { t: 'user', text: pedido.prompt, at },
      { t: 'turn_start', at })
    return {
      promptListo(preparado: PromptPreparado) {
        uso = preparado.uso
        const literal = preparado.texto.split(/\r?\n/).map((linea) => `    ${linea}`).join('\n')
        sessions.registrarImagen(id, { t: 'text', id: `prompt-${pedido.id}`, delta: `**Prompt listo**\n\n${literal}` })
      },
      terminar(error?: string, fin = Date.now()) {
        if (!error) sessions.registrarImagen(id, {
          t: 'text', id: `imagen-${pedido.id}`,
          delta: pedido.origen ? `Imagen editada. [Abrir versión en el editor](${rutaEditorImagen(pedido.id)})`
            : `Imagen lista. [Abrir imagen en el editor](${rutaEditorImagen(pedido.id)})`
        })
        sessions.registrarImagen(id, { t: 'turn_end', at: fin, ok: !error, error, ...uso })
      }
    }
  }
  return (base: ImagenEstudio, pedido: ImagenEstudio) => {
    const hilos = sessions.list()
    let hilo = hilos.find((s) => s.imagenEstudio === base.id)
    const titulo = tituloInicial(base.prompt, 'Edición de imagen')
    if (!hilo && base.id !== pedido.id && base.orquestador) {
      const carpeta = join(cwd, 'pedidos', base.id)
      const anterior = hilos.find((s) => s.cardId === CARD_HISTORIAL_IMAGEN && s.cwd === carpeta && !s.imagenEstudio)
      if (anterior) {
        const fin = anterior.updatedAt
        hilo = sessions.vincularImagen(anterior.id, base.id, anterior.title === 'Preparar prompt de imagen' ? titulo : anterior.title)
        if (hilo) {
          const original = turno(hilo.id, base, base.creada)
          const texto = base.promptPreparado ?? leerPromptAnterior(carpeta)
          if (texto) original.promptListo({ texto })
          original.terminar(undefined, fin)
        }
      }
    }
    const modelo = pedido.orquestador ?? base.orquestador
    if (!hilo && modelo) hilo = sessions.create({
      cardId: CARD_HISTORIAL_IMAGEN, imagenEstudio: base.id, title: titulo, cwd, model: modelo
    })
    return hilo ? turno(hilo.id, pedido) : undefined
  }
}
