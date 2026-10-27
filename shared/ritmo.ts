import type { Ritmo } from './types.ts'

/**
 * Las cuentas del ritmo de publicación (`Ritmo`), para las redes (`server/redes/`) y YouTube (`server/youtube.ts`). Las
 * horas van en la hora local de la computadora, como `'2026-10-27 12:00'`.
 */

/** Hasta que lo cambies en «Mis videos»: 5 al día, de 12:00 a 16:00. */
export const RITMO_VERTICAL: Ritmo = { porDia: 5, cadaDias: 1, inicio: '2026-10-01', desde: '12:00', cadaMin: 60 }
/** Hasta que lo cambies en «Mis videos»: uno al día, a las 12:00. */
export const RITMO_YOUTUBE: Ritmo = { porDia: 1, cadaDias: 1, inicio: '2026-10-01', desde: '12:00', cadaMin: 60 }

const dos = (n: number) => String(n).padStart(2, '0')
/** `'2026-10-27 12:00'`, en hora local. */
export const fechaRitmo = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`
const DIA = 24 * 3600000
const utc = (dia: string) => Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10))

/** A qué hora sale cada video de un día: `['12:00', '13:00', …]`. */
export function horasDelRitmo(r: Ritmo): string[] {
  const [h, m] = r.desde.split(':').map(Number)
  return Array.from({ length: r.porDia }, (_, i) => {
    const t = h * 60 + m + i * r.cadaMin
    return `${dos(Math.floor(t / 60))}:${dos(t % 60)}`
  })
}

/** Ese día (`'2026-10-27'`) se publica: cae cada `cadaDias` contando desde `inicio`. */
export function tocaElDia(r: Ritmo, dia: string): boolean {
  const n = Math.round((utc(dia) - utc(r.inicio)) / DIA)
  return ((n % r.cadaDias) + r.cadaDias) % r.cadaDias === 0
}

/**
 * Los primeros `n` huecos libres del ritmo desde `minimo` (`Date.now()`), en orden: ni a una hora ya `ocupada` ni más de
 * `porDia` en un día, contando lo que ya tiene (aunque esté a otra hora, de un ritmo de antes). Nunca deja uno vacío
 * por delante.
 */
export function huecos(r: Ritmo, n: number, ocupados: Iterable<string>, minimo: number): string[] {
  const tomadas = new Set(ocupados)
  const enDia = new Map<string, number>()
  for (const t of tomadas) enDia.set(t.slice(0, 10), (enDia.get(t.slice(0, 10)) ?? 0) + 1)
  const horas = horasDelRitmo(r).map((h) => h.split(':').map(Number))
  const desde = new Date(minimo)
  const salida: string[] = []
  // Cada día que toca da un hueco, salvo los que ya están llenos: con esto alcanza.
  const tope = (n + tomadas.size + 2) * r.cadaDias
  for (let k = 0; salida.length < n && k < tope; k++) {
    const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + k)
    const dia = fechaRitmo(d).slice(0, 10)
    if (!tocaElDia(r, dia)) continue
    for (const [h, m] of horas) {
      if (salida.length >= n || (enDia.get(dia) ?? 0) >= r.porDia) break
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m)
      const clave = fechaRitmo(t)
      if (t.getTime() < minimo || tomadas.has(clave)) continue
      salida.push(clave)
      tomadas.add(clave)
      enDia.set(dia, (enDia.get(dia) ?? 0) + 1)
    }
  }
  return salida
}

/**
 * Lo que pide guardar un ritmo, revisado: si algo no vale, un error que se puede enseñar tal cual. Si no cambian los
 * días, se queda el `inicio` de `antes`, para que guardar otra vez no mueva qué días tocan.
 */
export function validarRitmo(x: Partial<Ritmo>, antes: Ritmo): Ritmo {
  const entero = (v: unknown, min: number, max: number, que: string) => {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) throw new Error(`${que}: un número de ${min} a ${max}.`)
    return v as number
  }
  const porDia = entero(x.porDia, 1, 24, 'Videos por día')
  const cadaDias = entero(x.cadaDias, 1, 30, 'Cada cuántos días')
  const cadaMin = porDia === 1 ? (Number.isInteger(x.cadaMin) && x.cadaMin! >= 5 ? x.cadaMin! : antes.cadaMin) : entero(x.cadaMin, 5, 720, 'Minutos entre uno y otro')
  if (typeof x.desde !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.desde)) throw new Error('Elige la hora del primero.')
  const [h, m] = x.desde.split(':').map(Number)
  if (h * 60 + m + (porDia - 1) * cadaMin >= 24 * 60) throw new Error('El último saldría después de medianoche: empieza antes, o deja menos minutos entre uno y otro.')
  const valido = typeof x.inicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.inicio) && Number.isFinite(utc(x.inicio))
  const inicio = valido ? x.inicio! : cadaDias === antes.cadaDias ? antes.inicio : fechaRitmo(new Date()).slice(0, 10)
  return { porDia, cadaDias, inicio, desde: x.desde, cadaMin }
}

/** `5 al día, de 12:00 a 16:00` · `2 cada 3 días, de 12:00 a 13:00` · `1 al día, a las 12:00`. */
export function resumenRitmo(r: Ritmo) {
  const hs = horasDelRitmo(r)
  const cuando = r.cadaDias === 1 ? 'al día' : `cada ${r.cadaDias} días`
  return r.porDia === 1 ? `1 ${cuando}, a las ${hs[0]}` : `${r.porDia} ${cuando}, de ${hs[0]} a ${hs[hs.length - 1]}`
}
