/**
 * Lo que el celular recuerda de una vez a otra, como el `localStorage` de la computadora: el formato, la voz, la música
 * y el modelo que elegiste en cada estilo. Se lee una vez al abrir (`cargarRecordado`) y se guarda en un archivo.
 */
import { Platform } from 'react-native'
import { File, Paths } from 'expo-file-system'

let datos: Record<string, unknown> = {}
const archivo = () => new File(Paths.document, 'recordado.json')

export async function cargarRecordado() {
  try {
    const texto = Platform.OS === 'web' ? globalThis.localStorage?.getItem('sloth.recordado') : archivo().exists ? await archivo().text() : null
    datos = texto ? JSON.parse(texto) : {}
  } catch {
    datos = {}
  }
}

export function recordado<T>(clave: string, siNo: T): T {
  return clave in datos ? (datos[clave] as T) : siNo
}

let pendiente: ReturnType<typeof setTimeout> | undefined
export function recordar(clave: string, valor: unknown) {
  if (valor === undefined) delete datos[clave]
  else datos[clave] = valor
  // Varios cambios seguidos se guardan juntos.
  clearTimeout(pendiente)
  pendiente = setTimeout(() => {
    const texto = JSON.stringify(datos)
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem('sloth.recordado', texto)
      else void Promise.resolve(archivo().write(texto)).catch(() => {})
    } catch { /* Si no se puede guardar, se elige otra vez la próxima. */ }
  }, 300)
}
