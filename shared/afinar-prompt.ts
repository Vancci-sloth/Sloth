import { proveedorDe } from './providers.ts'
import { MAX_PROMPT_3D } from './modelos3d.ts'

export type TipoAfinado = 'video' | 'imagen' | 'edicion' | 'modelo3d'
export type PreguntaAfinado = { pregunta: string; opciones: string[] }
export type RespuestaAfinado = { pregunta: string; respuesta: string }
export type PropuestaAfinado = { prompt: string; preguntas: PreguntaAfinado[] }

export const MAX_PREGUNTAS = 3
export const MAX_RESPUESTA = 300
export const limitePrompt = (tipo: TipoAfinado) => tipo === 'video' ? 14_000 : tipo === 'modelo3d' ? MAX_PROMPT_3D : 4_000
export const modeloAfina = (id: string) => ['claude', 'codex', 'deepseek', 'opencode'].includes(proveedorDe(id))
export const patronReferencia = /\[\[VYMOTION_REF_\d+\]\]/g
