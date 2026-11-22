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
export const PEDIDO_RECORTE = 'Quitar el fondo'
export const HERRAMIENTAS_IMAGEN = {
  editar: { nombre: 'Cambiar zona', instruccion: 'Aplica los cambios solicitados en esta zona.' },
  quitar: { nombre: 'Quitar objeto', instruccion: 'Borra el objeto de esta zona y rellena el hueco de forma coherente.' },
  conservar: { nombre: 'Conservar zona', instruccion: 'Mantén intacta esta zona, incluso donde se cruce con otra marca.' }
} as const
export type HerramientaImagen = keyof typeof HERRAMIENTAS_IMAGEN
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
}
