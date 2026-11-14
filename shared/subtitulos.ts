/** Lo que comparten el servidor (`server/subtitulos.ts`) y la card «Subtítulos» (`web/src/Subtitulos.tsx`). */

export type EstiloSubtitulos = 'resaltada' | 'clasicos'

export interface OpcionesSubtitulos {
  estilo: EstiloSubtitulos
  tamano: 'chico' | 'mediano' | 'grande'
  posicion: 'arriba' | 'centro' | 'abajo'
}

/** Lo que se puede elegir, con su nombre en la interfaz. El primero de cada uno es el de por omisión. */
export const OPCIONES_SUBTITULOS = {
  estilo: [
    { value: 'resaltada', label: 'Palabra resaltada', detalle: 'Pocas palabras grandes; la que se dice, en ámbar' },
    { value: 'clasicos', label: 'Clásicos', detalle: 'Una o dos líneas blancas, como en una película' }
  ],
  tamano: [
    { value: 'mediano', label: 'Mediano' },
    { value: 'chico', label: 'Chico' },
    { value: 'grande', label: 'Grande' }
  ],
  posicion: [
    { value: 'abajo', label: 'Abajo' },
    { value: 'centro', label: 'Al centro' },
    { value: 'arriba', label: 'Arriba' }
  ]
} as const satisfies { [K in keyof OpcionesSubtitulos]: readonly { value: OpcionesSubtitulos[K]; label: string; detalle?: string }[] }

/** Un renglón de subtítulos: las palabras que se ven juntas, cada una con su tiempo en segundos. */
export interface Renglon {
  palabras: { text: string; start: number; end: number }[]
}

/** Cómo van los subtítulos de un video terminado (`GET /api/sessions/<id>/subtitulos?ruta=…`). */
export interface TrabajoSubtitulos {
  /** `nada`: aún no tiene. */
  estado: 'nada' | 'transcribiendo' | 'grabando' | 'listo' | 'error'
  /** Lo que está haciendo, o por qué falló. */
  aviso: string
  /** De 0 a 1, al grabar. */
  avance?: number
  opciones: OpcionesSubtitulos
  /** El video se rehízo después de ponerle subtítulos: los de ahora son del de antes. */
  desactualizado: boolean
  /** El video con subtítulos y el .srt, relativos a la carpeta del video, cuando están. */
  video?: string
  srt?: string
  /** La fecha del video con subtítulos: cambia con cada grabación, y con ella su dirección. */
  t: number
  renglones?: Renglon[]
}
