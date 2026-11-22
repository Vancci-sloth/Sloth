import type { Tokens } from './types.ts'

export const DIAS_ACTIVIDAD = 91

export interface ActividadDiaria extends Tokens {
  fecha: string
  modelo?: string
  turnos: number
  turnosFallidos: number
  turnosConTokens: number
}

export function fechaActividad(dia: Date) {
  const mes = String(dia.getMonth() + 1).padStart(2, '0')
  const numero = String(dia.getDate()).padStart(2, '0')
  return `${dia.getFullYear()}-${mes}-${numero}`
}

export const totalTokens = ({ input, output, cacheRead }: Tokens) => input + output + cacheRead
