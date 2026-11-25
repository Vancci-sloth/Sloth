import type { Ritmo } from './types.ts'

/** La conexión del canal y la subida de un video largo. Nunca se mandan tokens al navegador. */
export interface CuentaYoutube {
  id: string
  nombre: string
}

export interface ConexionYoutube {
  cliente: boolean
  cuenta: CuentaYoutube | null
  conectando: boolean
  error?: string
  /** El canal concedió el permiso para editar la fecha después de poner la miniatura. */
  programar?: boolean
  /** La app de Google de Sloth ya está lista; `apoya`, si esta computadora la puede usar (es para quien apoya). */
  sloth?: { apoya: boolean }
  /** El canal se conectó con la app de Sloth, no con la tuya. */
  conSloth?: boolean
}

export interface DatosYoutube {
  titulo: string
  descripcion: string
  privacidad: 'private' | 'unlisted' | 'public'
  infantil: boolean
  sintetico: boolean
  cuando?: string
  miniatura?: string
  huellaMiniatura?: string
  revisado?: boolean
}

export interface EstadoSubidaYoutube {
  estado: 'cola' | 'subiendo' | 'preparando' | 'error' | 'terminado' | 'programado'
  enviados: number
  total: number
  id?: string
  error?: string
  datos?: DatosYoutube
}

export interface MiniaturaYoutube {
  ruta: string
  nombre: string
  src: string
  huella: string
}

export interface BorradorYoutube extends DatosYoutube {
  cardId: string
  ruta: string
  huella: string
}

export interface VideoParaYoutube {
  cardId: string
  ruta: string
  huella: string
  src: string
  titulo: string
  estilo: string
  duracion: number
  formato: 'horizontal' | 'vertical' | 'desconocido'
  miniaturas: MiniaturaYoutube[]
  borrador: BorradorYoutube
  alternativas: string[]
  propuesta?: string
  tituloPropuesto?: string
  miniaturaPropuesta?: string
  propuestaFuente?: string
  recomendacion?: EstadoRecomendacionYoutube
  subida?: EstadoSubidaYoutube
  eliminable?: boolean
}

export interface ReferenciaYoutube {
  id: string
  titulo: string
  canal: string
  canalId: string
  vistas: number
  fecha?: string
  x?: number
  muestra?: number
  origen: 'Ideas' | 'YouTube'
  leido: number
  url: string
  miniatura?: string
  observacion?: string
  miniaturaOrigen?: string
  descripcion?: string
  transcripcion?: string
}

export interface RecomendacionYoutube {
  tema: string
  titulo: { principal: string; alternativas: string[]; razon: string }
  miniatura: { concepto: string; texto: string; composicion: string; prompt: string; razon: string }
  analisis: string
  limites: string[]
  referencias: ReferenciaYoutube[]
  fotogramas: string[]
  fecha: number
}

/**
 * Lo más que Sloth guarda lo que leyó de la API de YouTube sin volver a leerlo: las políticas (III.E.4) piden borrarlo o
 * actualizarlo a los 30 días.
 */
export const VIGENCIA_YOUTUBE = 30 * 24 * 3600_000

export interface EstadoRecomendacionYoutube {
  estado: 'cola' | 'trabajando' | 'listo' | 'error'
  fase: string
  error?: string
  resultado?: RecomendacionYoutube
  descripcion?: { texto: string; razon: string }
  modelo?: string
  posicion?: number
}

export interface CatalogoYoutube {
  conexion: ConexionYoutube
  videos: VideoParaYoutube[]
  verticales: number
  /** Tu ritmo de YouTube, y las fechas que ya tiene el canal (también de videos que ya no están en el disco). */
  ritmo: Ritmo
  ocupadas: { huella: string; cuando: string }[]
}

export interface CalendarioYoutube {
  cuenta: CuentaYoutube | null
  publicaciones: { id: string; titulo: string; cuando: string }[]
  pendientes: number
  /** El primer hueco libre de tu ritmo (`'2026-10-28 12:00'`, hora local): ahí va el siguiente. */
  siguiente?: string
}
