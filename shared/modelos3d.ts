import type { Card, SessionMeta } from './types.ts'

export const MAX_REFERENCIAS_3D = 4
export const MAX_PROMPT_3D = 4000
export const OPERACIONES_3D = [
  { id: 'texto', nombre: 'Texto → modelo', ayuda: 'Construye una malla desde tu descripción y entrega una silueta lista para revisar.', detalle: 'Define forma, proporciones y piezas móviles antes de crear la primera versión.', conserva: 'La intención, escala y piezas que indiques.', resultado: 'Modelo base con malla, materiales iniciales y vista de comprobación.', ejemplo: 'Una lámpara de escritorio articulada, metal cepillado y pantalla de vidrio.', preview: '/modelos-3d/previews/crear.png' },
  { id: 'imagen', nombre: 'Imagen → modelo', ayuda: 'Reconstruye el objeto usando hasta cuatro referencias y compara la silueta con ellas.', detalle: 'Cruza los ángulos de tus imágenes, resuelve las partes ocultas y evita inventar detalles que contradigan la referencia.', conserva: 'Silueta, proporciones, materiales visibles y rasgos de la referencia.', resultado: 'Modelo reconstruido con cámara de revisión y materiales de partida.', ejemplo: 'Convierte estas cuatro vistas de una mochila en un modelo reutilizable.', preview: '/modelos-3d/previews/crear.png' },
  { id: 'seleccionar', nombre: 'Seleccionar cara o pieza', ayuda: 'Fija una vista y elige una cara o pieza para limitar la edición a esa zona.', detalle: 'Usa el visor para girar, fija el ángulo y señala la superficie exacta que quieres trabajar.', conserva: 'El resto del modelo y la cámara elegida.', resultado: 'Selección acotada que guía la siguiente operación.', ejemplo: 'Selecciona solo el asa para cambiar su grosor.', preview: '/modelos-3d/previews/seleccion.png', requiereZona: true },
  { id: 'marcar', nombre: 'Marcar zona de cambio', ayuda: 'Dibuja una máscara sobre el modelo y aplica un cambio localizado.', detalle: 'Traza el contorno de la zona, describe el cambio y comprueba los bordes para evitar deformar el resto.', conserva: 'Todo lo que quede fuera de la máscara.', resultado: 'Variante con el área marcada editada y sus límites recompuestos.', ejemplo: 'Marca la abolladura del lateral y pide una superficie lisa.', preview: '/modelos-3d/previews/seleccion.png', requiereZona: true },
  { id: 'mejorar', nombre: 'Mejorar modelo', ayuda: 'Corrige forma, materiales o detalles del modelo seleccionado con una revisión completa.', detalle: 'Detecta problemas visibles, prioriza los que afectan a la silueta y aplica mejoras sin rehacer el modelo entero.', conserva: 'Identidad, escala, piezas y cambios que no hayas pedido.', resultado: 'Versión refinada con decisiones resumidas para aprobarla.', ejemplo: 'Corrige las proporciones de la tapa y mejora el acabado metálico.', preview: '/modelos-3d/previews/seleccion.png' },
  { id: 'remesh', nombre: 'Remesh y topología', ayuda: 'Redistribuye la malla para obtener polígonos uniformes y una superficie estable.', detalle: 'Limpia triángulos estirados, densidades bruscas y normales inconsistentes antes de volver a proyectar los detalles.', conserva: 'La silueta y el volumen exterior.', resultado: 'Malla uniforme lista para subdividir, deformar o exportar.', ejemplo: 'Prepara esta escultura para animarla con quads regulares.', preview: '/modelos-3d/previews/geometria.png' },
  { id: 'reconstruir', nombre: 'Reconstruir superficie', ayuda: 'Rellena agujeros y rehace pliegues para recuperar una superficie continua.', detalle: 'Detecta huecos, puentes rotos y zonas invertidas, y reconstruye solo las superficies necesarias.', conserva: 'La forma alrededor de las reparaciones.', resultado: 'Superficie cerrada y comprobada desde varios ángulos.', ejemplo: 'Cierra el agujero de la base sin cambiar el borde exterior.', preview: '/modelos-3d/previews/geometria.png' },
  { id: 'suavizar', nombre: 'Suavizar o definir', ayuda: 'Suaviza bultos o refuerza bordes y detalles sin cambiar la silueta.', detalle: 'Elige entre una pasada suave para eliminar ruido o una definición controlada para recuperar aristas.', conserva: 'Silueta, escala y detalles fuera del área pedida.', resultado: 'Superficie más limpia con bordes legibles.', ejemplo: 'Suaviza las marcas de impresión y define el borde de la carcasa.', preview: '/modelos-3d/previews/geometria.png' },
  { id: 'simetria', nombre: 'Simetría y alineación', ayuda: 'Alinea, centra o refleja una parte usando el eje real del modelo.', detalle: 'Encuentra el eje dominante, corrige el centro y refleja solo lo que corresponda.', conserva: 'Desplazamientos intencionales y piezas asimétricas que indiques.', resultado: 'Modelo alineado con un eje claro y proporciones consistentes.', ejemplo: 'Centra las dos asas y refleja la pieza derecha sobre el eje X.', preview: '/modelos-3d/previews/geometria.png' },
  { id: 'partes', nombre: 'Separar partes', ayuda: 'Divide el modelo en piezas editables y nombra cada una para el siguiente paso.', detalle: 'Separa por islas, materiales y uniones lógicas, y conserva los pivotes útiles.', conserva: 'La posición relativa y el encaje entre piezas.', resultado: 'Componentes independientes preparados para editar o animar.', ejemplo: 'Separa carcasa, botones y tornillos en piezas con nombres claros.', preview: '/modelos-3d/previews/geometria.png' },
  { id: 'borrar', nombre: 'Borrar una pieza', ayuda: 'Elimina la zona marcada y recompone la superficie que queda.', detalle: 'Quita la pieza seleccionada, limpia sus caras internas y cierra el hueco con continuidad.', conserva: 'El volumen y los materiales que rodean el hueco.', resultado: 'Modelo sin la pieza y con la superficie reparada.', ejemplo: 'Borra el soporte trasero y deja la carcasa cerrada.', preview: '/modelos-3d/previews/seleccion.png', requiereZona: true },
  { id: 'materiales', nombre: 'Materiales y UV', ayuda: 'Organiza materiales y crea un desplegado UV limpio para texturizar.', detalle: 'Agrupa superficies por acabado, corta islas donde conviene y evita estirar la textura.', conserva: 'La geometría y la asignación de piezas.', resultado: 'Materiales nombrados y UV listo para pintar.', ejemplo: 'Separa metal, goma y vidrio con UV sin solapamientos.', preview: '/modelos-3d/previews/materiales.png' },
  { id: 'texturas', nombre: 'Pintar textura', ayuda: 'Pinta, reemplaza o limpia la textura de una zona marcada.', detalle: 'Aplica el cambio dentro de la máscara y mezcla sus bordes para que no se note el parche.', conserva: 'La textura y el material fuera de la zona.', resultado: 'Textura actualizada con bordes integrados.', ejemplo: 'Pinta una etiqueta naranja en el panel frontal.', preview: '/modelos-3d/previews/materiales.png', requiereZona: true },
  { id: 'rig', nombre: 'Rig y pose', ayuda: 'Crea un esqueleto útil y una pose revisable para personajes.', detalle: 'Coloca articulaciones según la anatomía, prueba una pose y comprueba que la malla deforme sin pliegues extraños.', conserva: 'Identidad, proporciones y materiales del personaje.', resultado: 'Rig nombrado, pose de revisión y controles básicos.', ejemplo: 'Prepara el personaje para caminar y deja una pose de paso.', preview: '/modelos-3d/previews/rig.png' },
  { id: 'animar', nombre: 'Animar con un pedido', ayuda: 'Convierte una indicación de movimiento en una animación revisable.', detalle: 'Define la acción, el ritmo y el bucle, y entrega una prueba corta antes de exportar.', conserva: 'Rig, escala, cámara y pose de referencia.', resultado: 'Animación de prueba con duración y bucle claros.', ejemplo: 'Haz que la lámpara se abra, gire y vuelva a su posición.', preview: '/modelos-3d/previews/rig.png' },
  { id: 'optimizar', nombre: 'Optimizar y exportar', ayuda: 'Reduce peso y deja el modelo listo para usar en video o compartir.', detalle: 'Elimina datos innecesarios, comprime texturas, aplica transformaciones y comprueba el archivo final.', conserva: 'La apariencia visible y los nombres de las piezas.', resultado: 'GLB optimizado con informe de peso y compatibilidad.', ejemplo: 'Baja el modelo a tiempo real sin perder el detalle de la silueta.', preview: '/modelos-3d/previews/geometria.png' },
] as const
export type OperacionModelo3D = (typeof OPERACIONES_3D)[number]['id']
export type PuntoModelo3D = { x: number; y: number }
export function tipoMarca3D(puntos: PuntoModelo3D[]): 'Punto' | 'Trazo' | 'Zona' {
  if (puntos.length === 1) return 'Punto'
  const ultimo = puntos.at(-1)
  return puntos.length >= 4 && puntos[0].x === ultimo?.x && puntos[0].y === ultimo?.y ? 'Zona' : 'Trazo'
}
export const TIPOS_REFERENCIA_3D = [
  { id: 'objeto', nombre: 'Objeto' },
  { id: 'personaje', nombre: 'Personaje' },
  { id: 'escenario', nombre: 'Escenario' },
] as const
export type TipoReferencia3D = (typeof TIPOS_REFERENCIA_3D)[number]['id']
export type TrabajoModelo3D = { resultado: string; origen?: string; editando?: string; operacion?: OperacionModelo3D }
/** Las variantes antiguas tenían un hilo por versión. Su relación explícita también funciona si se borró el modelo de partida. */
export function chatsPorModelo3D(sesiones: SessionMeta[]) {
  const enlaces = new Map<string, SessionMeta[]>()
  for (const s of sesiones) {
    if (!s.modelo3d) continue
    for (const id of new Set([s.modelo3d.resultado, s.modelo3d.origen])) {
      if (!id) continue
      const lista = enlaces.get(id) ?? []
      lista.push(s)
      enlaces.set(id, lista)
    }
  }
  const grupos = new Map<string, SessionMeta[]>()
  const prioridad = (s: SessionMeta) => s.running || s.background?.length ? 2 : s.archived ? 0 : 1
  for (const id of enlaces.keys()) {
    if (grupos.has(id)) continue
    const grupo: SessionMeta[] = [], pendientes = [id], vistos = new Set<SessionMeta>()
    while (pendientes.length) {
      const actual = pendientes.pop()!
      if (grupos.has(actual)) continue
      grupos.set(actual, grupo)
      for (const s of enlaces.get(actual) ?? []) {
        if (vistos.has(s)) continue
        vistos.add(s)
        grupo.push(s)
        pendientes.push(s.modelo3d!.resultado)
        if (s.modelo3d!.origen) pendientes.push(s.modelo3d!.origen)
      }
    }
    grupo.sort((a, b) => prioridad(b) - prioridad(a) || b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  }
  return grupos
}
export const rutaEditor3D = (id: string) => '#/modelos-3d/editar/' + encodeURIComponent(id)

/**
 * Los hilos de «Nuevo modelo» (en «Modelos 3D»): una card que no sale en el inicio, como las de Ideas. Cada hilo trabaja
 * en su propia carpeta (`server/modelos3d-acciones.ts`), así que no lleva `cwd`.
 */
export const MODELO3D_CARD: Card = {
  id: 'modelo-3d',
  title: 'Modelo 3D',
  description: 'Un modelo 3D nuevo para la biblioteca, hecho a partir de lo que describes.',
  skill: 'modelos-3d',
  icon: 'cubo',
  cwd: ''
}
