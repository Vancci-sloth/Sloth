/**
 * «Seguir en la computadora»: un hilo del celular pasa a la Sloth de tu computadora, que hace lo que el teléfono no puede
 * (la voz, el render, el video final). Sube lo que hay en la carpeta del hilo (`/api/upload`) y abre allá un hilo del
 * mismo estilo con el pedido de siempre y la lista de lo ya hecho, para que su agente lo copie a la carpeta del video y
 * siga desde ahí.
 */
import { elegirModelos, lineaSubagentes } from '../../../shared/modelos'
import type { Card, Model, SessionMeta } from '../../../shared/types'
import { api, subir } from '../api'
import { conexion } from '../conexion'
import { listar } from './archivos'
import { eventosDe, hiloLocal } from './hilos'

export async function seguirEnComputadora(id: string, avance?: (texto: string) => void): Promise<SessionMeta> {
  const hilo = hiloLocal(id)
  if (!hilo) throw new Error('Ese hilo ya no está.')
  if (!conexion()) throw new Error('Primero conecta tu computadora: Más → Tu computadora.')
  const estado = await api<{ cards: Card[]; models: Model[] }>('/api/state')
  const card = estado.cards.find((c) => c.id === hilo.cardId)
  if (!card) throw new Error('Tu computadora no tiene este estilo: actualiza Sloth allá.')

  const archivos = listar(id)
  const subidos: string[] = []
  for (const [i, a] of archivos.entries()) {
    avance?.(`Subiendo ${i + 1} de ${archivos.length}: ${a.ruta}`)
    const ruta = await subir(a.uri, a.ruta.replace(/\//g, '-'), { wav: /\.(m4a|mp3|aac|webm)$/i.test(a.ruta) })
    subidos.push(`- ${a.ruta}: "${ruta}"`)
  }

  const pedido = (await eventosDe(id)).find((e) => e.t === 'user')
  const { choice, tareas } = elegirModelos(card.modelos, estado.models, undefined, undefined)
  if (!choice) throw new Error('Tu computadora aún no tiene ningún agente conectado: conéctalo en Sloth, en Opciones → Agentes.')
  const text = [
    pedido?.t === 'user' ? pedido.text : hilo.title,
    subidos.length
      ? `Este video lo empecé en el celular, sin computadora, y allá quedó hecho esto. Copia cada archivo a la carpeta del video con la ruta de la izquierda y sigue la skill desde donde quedó; no rehagas lo que ya está, salvo que no cumpla la skill:\n${subidos.join('\n')}`
      : 'Lo empecé en el celular, pero aún no hay archivos: empieza desde el principio.',
    lineaSubagentes(tareas)
  ]
    .filter(Boolean)
    .join('\n\n')
  avance?.('Abriendo el hilo en tu computadora…')
  return api<SessionMeta>('/api/sessions', { cardId: card.id, text, model: choice.model, effort: choice.effort })
}
