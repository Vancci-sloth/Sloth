/** Instrucciones visuales reutilizables del estudio. El modelo se elige por separado. */
export const ESTILOS_IMAGEN = {
  libre: { nombre: 'Libre', guia: '' },
  realista: { nombre: 'Realista', guia: 'Fotografía realista. Luz natural, proporciones creíbles y texturas detalladas.' },
  anime: { nombre: 'Anime', guia: 'Ilustración anime original. Contornos definidos, color expresivo y sombras dibujadas.' },
  futurista: { nombre: 'Futurista', guia: 'Concepto de ciencia ficción. Tecnología verosímil, profundidad e iluminación ambiental.' },
  editorial: { nombre: 'Editorial', guia: 'Fotografía editorial. Encuadre deliberado, iluminación de estudio y dirección de arte coherente.' },
  acuarela: { nombre: 'Acuarela', guia: 'Ilustración en acuarela sobre papel, con transparencias, bordes orgánicos y grano visible.' }
} as const

export type EstiloImagen = keyof typeof ESTILOS_IMAGEN
export const CARD_HISTORIAL_IMAGEN = 'estudio-imagenes'
export const rutaEditorImagen = (id: string) => `#/imagenes/editar/${id}`
export const LIMITE_MARCAS = 8
export const LIMITE_PUNTOS_MARCA = 64
export const MODELO_RECORTE = 'recorte-local'
/** Una imagen que el usuario subió para editarla (no la generó ningún modelo). */
export const MODELO_SUBIDA = 'subida'
export const PEDIDO_RECORTE = 'Quitar el fondo'
export const HERRAMIENTAS_IMAGEN = {
  editar: { nombre: 'Cambiar zona', instruccion: 'Aplica los cambios solicitados en esta zona.' },
  quitar: { nombre: 'Quitar objeto', instruccion: 'Borra el objeto de esta zona y rellena el hueco de forma coherente.' },
  conservar: { nombre: 'Conservar zona', instruccion: 'Mantén intacta esta zona, incluso donde se cruce con otra marca.' }
} as const
export type HerramientaImagen = keyof typeof HERRAMIENTAS_IMAGEN
export const AJUSTES_EDICION_IMAGEN = {
  luz: "Equilibra la exposición, recupera detalle en las sombras y suaviza las altas luces. Conserva la dirección de la luz y la composición.",
  color: "Corrige el balance de blancos y los dominantes de color. Ajusta el contraste y la saturación con un acabado natural.",
  detalle: "Reduce el ruido y mejora la definición de las texturas y los bordes sin inventar rasgos ni cambiar la composición.",
  restaurar: "Elimina arañazos, manchas y señales de deterioro. Conserva los rostros y el carácter de la fotografía.",
  colorizar: "Aplica colores naturales y coherentes con la época. Conserva la textura, los rasgos y la iluminación de la fotografía original.",
  retrato: "Suaviza brillos y corrige imperfecciones temporales. Conserva la textura de la piel, la expresión, la edad aparente y la identidad.",
  reflejos: "Reduce los reflejos molestos y recupera la visibilidad del contenido detrás de ellos. Conserva la textura y los brillos naturales del material.",
  perspectiva: "Endereza el horizonte y corrige la perspectiva de las líneas verticales. Respeta el encuadre y la proporción de la imagen.",
  fondo: "Cambia el fondo y mantén intactos el sujeto principal y sus bordes. Integra el nuevo entorno con la perspectiva y la iluminación del sujeto.",
  estilo: "Reinterpreta la imagen en un nuevo estilo visual. Conserva el encuadre, la identidad de los sujetos y sus poses.",
  objeto: "Añade el elemento que indique en la zona marcada o en la ubicación descrita. Respeta la escala, la perspectiva y las sombras de la escena.",
  reemplazar: "Sustituye el elemento marcado o descrito por el que indique. Mantén intactos los elementos de alrededor e integra la luz y las sombras del reemplazo.",
  profundidad: "Mantén el sujeto principal nítido y aplica al fondo un desenfoque gradual según la distancia. Conserva los bordes finos y el encuadre.",
  reencuadre: "Reencuadra la escena dentro de su proporción actual. Da espacio al sujeto principal y evita cortar partes importantes.",
  producto: "Prepara una foto de catálogo con fondo limpio, luz suave y sombra de contacto. Conserva exactamente la forma, el color, las etiquetas y los detalles del producto.",
} as const
export type AjusteEdicionImagen = keyof typeof AJUSTES_EDICION_IMAGEN
export const PASOS_IMAGEN = {
  referencia: 'Cargando imagen de referencia…',
  prompt: 'Preparando el prompt…',
  turno: 'Esperando turno en Google Flow…',
  configurar: 'Configurando modelo y formato…',
  generar: 'Generando la imagen…',
  recortar: 'Quitando el fondo en tu equipo…',
  descargar: 'Descargando el resultado…',
  guardar: 'Guardando en la galería…'
} as const

export type PasoImagen = keyof typeof PASOS_IMAGEN

export interface PuntoImagen { x: number; y: number }

/** Contorno cerrado en porcentajes. Las marcas antiguas solo guardaban el rectángulo. */
export interface MarcaImagen {
  x: number
  y: number
  ancho: number
  alto: number
  herramienta?: HerramientaImagen
  contorno?: PuntoImagen[]
}

export function areaDeContorno(puntos: PuntoImagen[]): number {
  return Math.abs(puntos.reduce((suma, p, i) => {
    const siguiente = puntos[(i + 1) % puntos.length]
    return suma + p.x * siguiente.y - siguiente.x * p.y
  }, 0)) / 2
}

export interface ImagenEstudio {
  id: string
  prompt: string
  estilo: EstiloImagen
  modelo: string
  formato: string
  creada: number
  orquestador?: string
  promptPreparado?: string
  origen?: string
  raiz?: string
  marcas?: MarcaImagen[]
  ajustesEdicion?: AjusteEdicionImagen[]
}
