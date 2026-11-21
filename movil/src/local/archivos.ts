/**
 * La carpeta de cada hilo del celular (`<documentos>/hilos/<id>/`): lo que escribe su agente (el guion, las fuentes) y lo
 * que adjuntas (fotos, tu voz). Las rutas que da el agente son relativas a ella y nunca salen de ella.
 */
import { Directory, File, Paths } from 'expo-file-system'
import { rutaSegura } from './puro'

export const carpetaDe = (id: string) => new Directory(Paths.document, 'hilos', id)

function asegurar(id: string) {
  const d = carpetaDe(id)
  if (!d.exists) d.create({ intermediates: true, idempotent: true })
  return d
}

function archivo(id: string, ruta: string): File {
  const partes = rutaSegura(ruta)
  if (!partes) throw new Error(`«${ruta}» no es una ruta dentro de la carpeta del hilo.`)
  let d = asegurar(id)
  for (const p of partes.slice(0, -1)) {
    d = new Directory(d, p)
    if (!d.exists) d.create({ idempotent: true })
  }
  return new File(d, partes[partes.length - 1])
}

export async function escribir(id: string, ruta: string, contenido: string) {
  const f = archivo(id, ruta)
  if (!f.exists) f.create()
  await f.write(contenido)
}

export async function leer(id: string, ruta: string): Promise<string> {
  const f = archivo(id, ruta)
  if (!f.exists) throw new Error(`No existe «${ruta}».`)
  return f.text()
}

export interface ArchivoDelHilo {
  ruta: string
  uri: string
  tamano: number
}

/** Todo lo que hay en la carpeta del hilo, con su ruta relativa. */
export function listar(id: string): ArchivoDelHilo[] {
  const raiz = carpetaDe(id)
  if (!raiz.exists) return []
  const fuera: ArchivoDelHilo[] = []
  const recorrer = (d: Directory, pre: string) => {
    for (const x of d.list()) {
      if (x instanceof Directory) recorrer(x, `${pre}${x.name}/`)
      else fuera.push({ ruta: `${pre}${x.name}`, uri: x.uri, tamano: x.size ?? 0 })
    }
  }
  recorrer(raiz, '')
  return fuera.sort((a, b) => a.ruta.localeCompare(b.ruta))
}

/** Copia un adjunto (una foto, tu voz grabada) a la carpeta del hilo, para que el agente lo nombre y siga con él. */
export async function guardarAdjunto(id: string, uri: string, nombre: string): Promise<{ ruta: string; uri: string }> {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-') || 'archivo'
  const destino = archivo(id, `adjuntos/${Date.now()}-${limpio}`)
  await new File(uri).copy(destino)
  return { ruta: `adjuntos/${destino.name}`, uri: destino.uri }
}

export function borrarCarpeta(id: string) {
  const d = carpetaDe(id)
  if (d.exists) d.delete()
}
