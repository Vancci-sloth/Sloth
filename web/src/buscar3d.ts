import type { Modelo3D } from '../../shared/types'

/**
 * La búsqueda de «Modelos 3D» (`Modelos3D.tsx`): cada palabra tiene que estar en el modelo, escrita como la escribe la
 * gente: con o sin acentos, en plural («camiones» da el camión), junta («cajafuerte») o, si así no está en ningún
 * modelo, con una letra de más, de menos o cambiada («pulmnes») o de su familia («engrane»). Los artículos y las
 * preposiciones no cuentan («el dinosaurio»). Cuenta la palabra entera o su principio («pulmon» en
 * «pulmones»), nunca un pedazo de en medio: «oro» no es La Llorona ni «redes» el «cofre del» tesoro. Lo que sale primero
 * es lo que más se parece: el nombre pesa más que su resumen, este más que sus etiquetas, y estas más que lo que hace o su
 * descripción.
 */

export const plano = (s: string) => s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase()

type Campo = { palabras: string[]; juntas: string[]; peso: number }
export type Indice = { modelo: Modelo3D; campos: Campo[] }

export function indexar(m: Modelo3D): Indice {
  const campo = (partes: (string | undefined)[], peso: number): Campo => {
    const palabras = plano(partes.filter(Boolean).join(' · ')).split(/[^a-z0-9]+/).filter(Boolean)
    // Desde cada palabra, ella y las dos siguientes juntas: «caja fuerte» también es «cajafuerte».
    return { palabras, juntas: palabras.map((_, i) => palabras.slice(i, i + 3).join('')), peso }
  }
  return {
    modelo: m,
    campos: [
      campo([m.nombre, m.id.replace(/-/g, ' ')], 5),
      campo([m.resumen], 4),
      campo(m.etiquetas, 3),
      campo([m.categoria, ...(m.hace ?? [])], 2),
      campo([m.descripcion, ...m.exporta], 1),
    ],
  }
}

/** La palabra y su singular («relojes» → «reloj», «palmeras» → «palmera»), si le quedan 4 letras o más. */
function formas(p: string) {
  const f = [p]
  if (p.endsWith('es') && p.length - 2 >= 4) f.push(p.slice(0, -2))
  if (p.endsWith('s') && p.length - 1 >= 4) f.push(p.slice(0, -1))
  return f
}

/** ¿Están a una letra (de más, de menos o cambiada)? */
export function casi(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let distintas = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++distintas > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return distintas + (a.length - i) + (b.length - j) <= 1
}

/** El largo del principio que comparten dos palabras. */
const comun = (a: string, b: string) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/** ¿Son de la misma familia? Comparten todo menos sus dos últimas letras, y 5 o más («engrane» y engranaje). */
const familia = (w: string, f: string) => w.length >= 5 && comun(w, f) >= Math.max(5, f.length - 2)

/**
 * Cuánto se parece una palabra a un campo: 1 si está entera, 0,9 si es su principio o va junta, 0,5 si es de su familia,
 * 0 si no.
 */
function parecido(p: string, c: Campo) {
  let mejor = 0
  for (const f of formas(p)) {
    if (c.palabras.includes(f)) return 1
    if (f.length >= 3 && c.palabras.some((w) => w.startsWith(f))) mejor = 0.9
    else if (f.length >= 4 && c.juntas.some((j) => j.startsWith(f))) mejor = 0.9
    else if (f.length >= 5 && c.palabras.some((w) => familia(w, f))) mejor = Math.max(mejor, 0.5)
  }
  return mejor
}

/** Con una letra de error («pulmnes»): 0,5. Solo se usa si la palabra no está bien escrita en ningún modelo. */
function conError(p: string, c: Campo) {
  if (p.length < 5) return 0
  return formas(p).some((f) => c.palabras.some((w) => w.length >= 4 && casi(w, f))) ? 0.5 : 0
}

/** Las que no dicen qué modelo es: «el dinosaurio» es «dinosaurio». */
const SOBRAN = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'a', 'y', 'o', 'con', 'en', 'para', 'por', 'que', 'su', 'sus', 'mi', 'lo'])

/** Los que tienen todas las palabras de `texto`, con sus puntos (más, más parecido). Sin palabras, todos con 0. */
export function buscar(indices: Indice[], texto: string): { modelo: Modelo3D; puntos: number }[] {
  const todas = plano(texto).split(/[^a-z0-9]+/).filter(Boolean)
  const utiles = todas.filter((p) => !SOBRAN.has(p))
  // Si solo hay de esas («de»), se buscan tal cual.
  const palabras = utiles.length ? utiles : todas
  // Por palabra, cómo se compara: bien escrita si así está en algún modelo; si no, con una letra de error.
  const medidas = palabras.map((p) => (indices.some((ind) => ind.campos.some((c) => parecido(p, c))) ? parecido : conError))
  const salen: { modelo: Modelo3D; puntos: number }[] = []
  for (const ind of indices) {
    let puntos = 0
    for (const [k, p] of palabras.entries()) {
      const cada = ind.campos.map((c) => c.peso * medidas[k](p, c))
      const mejor = Math.max(...cada)
      if (!mejor) {
        puntos = -1
        break
      }
      // Lo que más cuenta es el mejor campo; los demás donde también está, poco, para desempatar.
      puntos += mejor + 0.1 * (cada.reduce((a, b) => a + b, 0) - mejor)
    }
    if (puntos >= 0) salen.push({ modelo: ind.modelo, puntos })
  }
  return salen
}
