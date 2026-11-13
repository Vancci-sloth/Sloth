/**
 * El menú de «/» del compositor del inicio: escribir `/` y unas letras al principio del campo cambia de estilo sin
 * soltar el teclado. Aquí, qué escribió y en qué orden salen los estilos.
 */

export interface OpcionBarra {
  id: string
  titulo: string
  /** La carpeta de su skill: `/video-el-diff` también la encuentra. */
  skill?: string
  icono?: string
  detalle?: string
}

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Lo buscado tras la barra si el campo es solo `/` y unas letras (sin espacios): `undefined` si no es un pedido de menú. */
export function consultaBarra(texto: string): string | undefined {
  return /^\/([^\s/]*)$/.exec(texto)?.[1]
}

/**
 * Los estilos que casan, del mejor al peor: los que empiezan por lo escrito, luego los que tienen una palabra que empieza
 * así, luego los de una skill que lo contiene y al final los que lo contienen en cualquier parte. Entre iguales, su orden.
 */
export function filtrarBarra<T extends OpcionBarra>(opciones: T[], consulta: string): T[] {
  const q = sinTildes(consulta)
  if (!q) return opciones
  const rango = (o: T) => {
    const t = sinTildes(o.titulo)
    if (t.startsWith(q)) return 0
    if (t.split(/[\s-]+/).some((p) => p.startsWith(q))) return 1
    if (o.skill && sinTildes(o.skill).includes(q)) return 2
    if (t.includes(q)) return 3
    return -1
  }
  return opciones
    .map((o, i) => ({ o, i, r: rango(o) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.o)
}
