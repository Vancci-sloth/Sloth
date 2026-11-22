/**
 * La revisión de YouTube es una página de la app (`#/youtube?…`, `RevisionYoutube`), no una ventana encima: se puede ir a
 * otro lado y volver. `volver` es de dónde se abrió, para regresar ahí al cerrarla.
 */
export function abrirRevisionYoutube(cardId?: string, ruta?: string) {
  const params = new URLSearchParams({ volver: location.hash.startsWith('#/youtube') || !location.hash ? '#/mis-videos' : location.hash })
  if (cardId) params.set('cardId', cardId)
  if (ruta) params.set('ruta', ruta)
  location.hash = `/youtube?${params}`
}
