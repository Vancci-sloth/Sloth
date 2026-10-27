import { fechaRitmo, huecos, RITMO_YOUTUBE } from './ritmo.ts'
import type { Ritmo } from './types.ts'
import type { CalendarioYoutube } from './youtube.ts'

/**
 * Fechas de YouTube en la zona de la computadora: setDate conserva la hora local al pasar por cambios de horario. `tuyo`
 * es el ritmo que eliges en «Mis videos» (`Ritmo`), desde ahora; `semana`, lunes, miércoles y viernes desde `inicio`.
 */
export type RitmoYoutube = 'tuyo' | 'semana' | 'manual'

export function fechaLocalYoutube(iso?: string): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function fechasYoutube(inicio: string, ritmo: RitmoYoutube, cantidad: number, ocupadas: string[] = [], tuyo: Ritmo = RITMO_YOUTUBE, ahora = Date.now()): string[] {
  if (ritmo === 'tuyo') return huecos(tuyo, cantidad, ocupadas.map((s) => fechaRitmo(new Date(s))), ahora + 10 * 60_000).map((f) => new Date(f.replace(' ', 'T')).toISOString())
  if (ritmo === 'manual' || !Number.isFinite(Date.parse(inicio))) return []
  const fecha = new Date(inicio)
  const tomadas = new Set(ocupadas.map((s) => new Date(s).toISOString().slice(0, 16)))
  const fechas: string[] = []
  for (let i = 0; fechas.length < cantidad && i < 10_000; i++, fecha.setDate(fecha.getDate() + 1)) {
    if (![1, 3, 5].includes(fecha.getDay())) continue
    const iso = fecha.toISOString()
    if (!tomadas.has(iso.slice(0, 16))) fechas.push(iso)
  }
  return fechas
}

/**
 * Días ocupados del canal completo: conserva hoy y usa la hora local. El siguiente es el primer hueco de tu ritmo
 * (`siguienteHueco`, del servidor); sin él, el primer día vacío desde mañana.
 */
export function diasYoutube(publicaciones: CalendarioYoutube['publicaciones'], ahora = new Date(), siguienteHueco?: string) {
  const hoy = fechaLocalYoutube(ahora.toISOString()).slice(0, 10)
  const porDia = new Map<string, CalendarioYoutube['publicaciones']>()
  for (const p of publicaciones) {
    const dia = fechaLocalYoutube(p.cuando).slice(0, 10)
    if (!dia || dia < hoy) continue
    porDia.set(dia, [...(porDia.get(dia) ?? []), p])
  }
  const diasOcupados = [...porDia.keys()].sort()
  const ultimo = diasOcupados.at(-1)
  const siguiente = new Date(ahora)
  siguiente.setHours(12, 0, 0, 0)
  siguiente.setDate(siguiente.getDate() + 1)
  while (porDia.has(fechaLocalYoutube(siguiente.toISOString()).slice(0, 10))) siguiente.setDate(siguiente.getDate() + 1)
  const libre = siguienteHueco?.slice(0, 10) ?? fechaLocalYoutube(siguiente.toISOString()).slice(0, 10)
  const visibles = new Set<string>(diasOcupados)
  const dia = new Date(ahora)
  dia.setHours(12, 0, 0, 0)
  // Los días vacíos se muestran en una ventana breve; todos los días con videos siguen visibles, aunque estén lejos.
  for (let n = 0; n < 14; n++, dia.setDate(dia.getDate() + 1)) {
    const clave = fechaLocalYoutube(dia.toISOString()).slice(0, 10)
    visibles.add(clave)
    if (n >= 6 && (!ultimo || clave >= ultimo && clave >= libre)) break
  }
  return { hoy, ultimo, siguiente: libre, total: [...porDia.values()].reduce((n, ps) => n + ps.length, 0), dias: [...visibles].sort().map((dia) => ({ dia, publicaciones: (porDia.get(dia) ?? []).sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando)) })) }
}
