import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guardar } from './disco.ts'

/**
 * «Sobre ti»: lo que cada quien cuenta de sí una vez (a qué se dedica, su canal, su público, cómo le gusta que le
 * hablen), en la bienvenida o en Opciones. Lo reciben todos los agentes en todos los hilos que empiezan después, así
 * no hay que repetirlo en cada video. Vive en `data/sobre-ti.json`, que ninguna actualización toca.
 */
const ARCHIVO = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data', 'sobre-ti.json')
/** Lo bastante para contar lo suyo sin llenar el contexto de cada hilo. */
export const TOPE_SOBRE_TI = 3000

/** Se lee cada vez: es chico, y así lo guardado vale desde el hilo siguiente sin reiniciar. */
export function sobreTi(): string {
  try {
    const { texto } = JSON.parse(readFileSync(ARCHIVO, 'utf8')) as { texto?: unknown }
    return typeof texto === 'string' ? texto.trim() : ''
  } catch {
    return ''
  }
}

export function guardarSobreTi(texto: string): string {
  const limpio = String(texto ?? '').trim().slice(0, TOPE_SOBRE_TI)
  mkdirSync(dirname(ARCHIVO), { recursive: true })
  guardar(ARCHIVO, JSON.stringify({ texto: limpio }, null, 2))
  return limpio
}

/** Las instrucciones de un agente con lo que el usuario contó de sí, si contó algo. */
export function conSobreTi(instrucciones: string, texto = sobreTi()): string {
  if (!texto) return instrucciones
  return `${instrucciones}

Esto lo escribió quien usa Sloth, sobre sí y sobre lo que hace. Tenlo en cuenta en todo lo que hagas (temas, tono, público, ejemplos), sin repetírselo ni preguntarle lo que ya dice aquí. Lo que pida en un mensaje manda sobre esto:
<sobre-ti>
${texto}
</sobre-ti>`
}
