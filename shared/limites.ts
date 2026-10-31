/**
 * Con cuántos videos trabajando a la vez Sloth deja de arrancar otro sin preguntar (ADR 0011). No es un tope: con 3 en una
 * computadora de 16 GB, una voz de 40 s llegó a tardar 22 min, pero los tres juntos acabaron antes que de dos en dos, y a
 * quien tiene más memoria no le estorban. Lo decide cada quien, cada vez.
 */
export const VIDEOS_SIN_AVISO = 2

/** El aviso antes de arrancar `nuevos` videos más, si se pasa de `VIDEOS_SIN_AVISO`. Sin pasarse, nada. */
export function avisoDeVideos(trabajando: number, nuevos = 1): string | undefined {
  const total = trabajando + nuevos
  if (total <= VIDEOS_SIN_AVISO) return
  const ya = trabajando === 1 ? 'Ya hay 1 video trabajando' : trabajando ? `Ya hay ${trabajando} videos trabajando` : `Son ${total} videos`
  return `${ya}${trabajando ? ` y con ${nuevos === 1 ? 'este' : 'estos'} serían ${total}` : ''}. Con más de ${VIDEOS_SIN_AVISO} a la vez, la computadora puede ir lenta y el audio puede tardar bastante más, sobre todo con poca memoria.`
}
