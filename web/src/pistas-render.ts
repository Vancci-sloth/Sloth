/** Un MP4 es una sola pieza: su mezcla de audio sale del mismo archivo, no de las pistas de otro motor. */
export function pistasDeRender(render: { ruta: string; t: number } | undefined, duracion: number) {
  if (!render || !Number.isFinite(duracion) || duracion <= 0) return { escenas: [], pistas: [] }
  return {
    escenas: [{ id: `render:${render.ruta}`, marca: '1', nombre: 'Video renderizado', desde: 0, hasta: duracion,
      title: 'Video renderizado completo · El MP4 no contiene las escenas ni las capas del proyecto original.' }],
    pistas: [{ ruta: render.ruta, t: render.t, desde: 0, hasta: duracion, recorte: 0 }],
  }
}
