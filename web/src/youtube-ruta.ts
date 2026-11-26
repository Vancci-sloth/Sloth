/** La revisión es una página de la app y conserva el origen al abrir un video concreto. */
export function abrirRevisionYoutube(cardId?: string, ruta?: string) {
  const params = new URLSearchParams({ volver: location.hash.startsWith('#/youtube') ? '#/redes' : location.hash || '#/mis-videos' })
  if (cardId) params.set('cardId', cardId)
  if (ruta) params.set('ruta', ruta)
  location.hash = `/youtube?${params}`
}
