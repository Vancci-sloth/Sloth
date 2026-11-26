import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Card } from '../shared/types.ts'
import { guardar, huella } from './disco.ts'

/**
 * Lo que se mide de los estilos de la comunidad para su tienda y el fondo (`licencias/src/tienda.ts`): cada video
 * terminado con un estilo que vino de la sección Estilos (el `origen.publicacion` de su card) se le avisa a la comunidad
 * una vez, con cuál estilo, la huella del archivo y su portada de prueba (su primer cuadro, en chico), que solo ve el
 * creador de VyMotion antes de pagar. Lo ya avisado se apunta en `data/estilos-usos.json`.
 * Se revisa al arrancar y al acabar cada turno de un hilo de esos estilos; sin cuenta o sin internet, la siguiente vez.
 * La descarga la avisa la instalación misma (`server/comunidad.ts`).
 */
export interface UsoEstilo {
  publicacion: string
  tipo: 'video' | 'descarga'
  huella?: string
  /** La llave de su portada en la comunidad. */
  prueba?: string
}

interface Opciones {
  cards(): Card[]
  /** Los videos terminados de un estilo (`videosDe` de `server/etapas.ts`). */
  videos(card: Card): { ruta: string }[]
  /** Sube la portada de un video y da su llave; sin portada, nada. */
  prueba(ruta: string): Promise<string | undefined>
  /** Se lo manda al Worker; si falla, lanza. */
  enviar(usos: UsoEstilo[]): Promise<void>
}

/** Los videos que se avisan en cada petición: cada uno sube su portada, y la comunidad topa lo que se sube al día. */
const POR_ENVIO = 10

/** Los videos de estilos de la comunidad que aún no se avisan, con la llave con que se apuntan. */
export function pendientes(cards: Card[], videos: Opciones['videos'], enviados: Set<string>, huellaDe = huella): (UsoEstilo & { llave: string; ruta: string })[] {
  const lista: (UsoEstilo & { llave: string; ruta: string })[] = []
  for (const card of cards) {
    const publicacion = card.origen?.publicacion
    if (!publicacion || !card.etapas?.length) continue
    for (const v of videos(card)) {
      const h = huellaDe(v.ruta)
      const llave = `${publicacion}:${h}`
      if (!h || enviados.has(llave)) continue
      enviados.add(llave)
      lista.push({ publicacion, tipo: 'video', huella: h, llave, ruta: v.ruta })
    }
  }
  return lista
}

export function usosDeEstilos(app: string, o: Opciones) {
  const archivo = join(app, 'data', 'estilos-usos.json')
  let andando: Promise<void> | undefined
  let otraVez = false

  function leer(): Set<string> {
    try {
      return new Set((JSON.parse(readFileSync(archivo, 'utf8')) as { enviados?: string[] }).enviados ?? [])
    } catch {
      return new Set()
    }
  }

  async function revisarYa() {
    const enviados = leer()
    const nuevos = pendientes(o.cards(), o.videos, new Set(enviados))
    for (let i = 0; i < nuevos.length; i += POR_ENVIO) {
      // Sin portada (el video se borró o no se pudo leer) se queda para la siguiente vez.
      const parte = (await Promise.all(nuevos.slice(i, i + POR_ENVIO).map(async (u) => ({ ...u, prueba: await o.prueba(u.ruta).catch(() => undefined) })))).filter((u) => u.prueba)
      if (!parte.length) continue
      await o.enviar(parte.map(({ llave: _, ruta: __, ...u }) => u))
      for (const u of parte) enviados.add(u.llave)
      guardar(archivo, JSON.stringify({ enviados: [...enviados] }))
    }
  }

  /** Avisa lo pendiente. Si ya está avisando, vuelve a mirar al acabar. Nunca lanza: lo que falle se intenta la siguiente vez. */
  function revisar(): Promise<void> {
    if (andando) return ((otraVez = true), andando)
    andando = revisarYa()
      .catch(() => {})
      .finally(() => {
        andando = undefined
        if (otraVez) (otraVez = false), void revisar()
      })
    return andando
  }

  /** Si la card del hilo es de un estilo de la comunidad. */
  const deLaComunidad = (cardId: string | undefined) => !!cardId && !!o.cards().find((c) => c.id === cardId)?.origen?.publicacion

  return { revisar, deLaComunidad }
}
