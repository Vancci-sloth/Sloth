/**
 * Lo que comparten el motor de avatar (`server/avatar/`), su MCP y el compositor: los motores que hay, su etiqueta
 * (Local o Pago) y la línea `Avatar:` que lleva el primer mensaje de un video (la guía, en `video-base/AVATAR.md`).
 */

export type MotorAvatar = 'sprites' | 'comfyui-local' | 'heygen'
export type EtiquetaMotor = 'Local' | 'Pago'

export interface InfoMotor {
  id: MotorAvatar
  nombre: string
  etiqueta: EtiquetaMotor
  /** Qué hace, en una frase para el menú y para el agente. */
  descripcion: string
}

/** Los motores, en el orden del menú. `sprites` es el de siempre y el que vale sin elegir. */
export const MOTORES: InfoMotor[] = [
  { id: 'sprites', nombre: 'Sprites (boca abierta y cerrada)', etiqueta: 'Local', descripcion: 'El de siempre: el personaje abre y cierra la boca con la voz. Sin GPU, sin costo.' },
  { id: 'comfyui-local', nombre: 'Labios con LatentSync (ComfyUI)', etiqueta: 'Local', descripcion: 'Sincroniza los labios de un video del personaje con la voz, en tu GPU y con tu ComfyUI: LatentSync 1.5, o MuseTalk si importas su flujo. Gratis, pero tarda.' },
  { id: 'heygen', nombre: 'HeyGen', etiqueta: 'Pago', descripcion: 'Un avatar de HeyGen dice la voz, con su API y tu llave: gasta créditos de tu plan.' }
]

export const esMotor = (m: unknown): m is MotorAvatar => MOTORES.some((x) => x.id === m)

/** La línea del primer mensaje con el motor elegido. Sin elegir, o con `sprites`, no hay línea: es lo de siempre. */
export function lineaAvatar(motor: string | undefined): string {
  if (!motor || motor === 'sprites' || !esMotor(motor)) return ''
  return `Avatar: ${motor} (cómo, en video-base/AVATAR.md; si no se puede, usa sprites).`
}

/** El motor que dice una línea `Avatar:` de un mensaje, si la lleva. */
export function motorDeLinea(texto: string): MotorAvatar | undefined {
  const m = /^Avatar: ([a-z-]+)/m.exec(texto)?.[1]
  return esMotor(m) ? m : undefined
}

/**
 * Un flujo de ComfyUI con que se sincronizan los labios. `estado`: `listo` si ComfyUI responde, tiene sus nodos y hay
 * flujo (y, si dijiste dónde está ComfyUI, sus pesos en disco); `falta` dice qué no.
 */
export interface FlujoInfo {
  id: string
  nombre: string
  vramGB: number
  nota: string
  licencia: string
  fuente: string
  /** `incluido`: Sloth trae su flujo. `importar`: hay que exportarlo de ComfyUI en formato API e importarlo. */
  flujo: 'incluido' | 'importar'
  sinFlujo: boolean
  listo: boolean
  falta: string[]
}

export interface EstadoAvatar {
  motores: (InfoMotor & { listo: boolean; detalle: string })[]
  comfy: {
    /** Donde se le habla (por omisión, http://127.0.0.1:8188). */
    url: string
    /** Su carpeta (la que tiene `main.py`), si la dijiste: con ella se miran los pesos en disco. */
    carpeta: string | null
    corriendo: boolean
    version?: string
    gpu?: string
    vramLibreGB?: number
  }
  flujos: FlujoInfo[]
  /** Los cuatro últimos de la llave de HeyGen (`null`: sin poner). */
  heygen: { llave: string | null }
}

export interface TrabajoAvatar {
  id: string
  estado: 'en-fila' | 'generando' | 'lista' | 'error'
  motor: MotorAvatar
  /** Lo que va haciendo, para el agente y la interfaz. */
  paso?: string
  archivo?: string
  error?: string
}
