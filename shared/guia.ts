import { PROVEEDORES, type Proveedor } from './providers.ts'
import type { GuiaEstilo, PruebaEstilo } from './types.ts'

/**
 * Lo que lleva todo estilo que se comparte en la comunidad, igual para todos, para que quien lo instala sepa qué es
 * antes de usarlo y sin adivinar:
 * - **Su guía de uso** (`GuiaEstilo`): qué le das, qué te entrega, un ejemplo, qué necesita, con qué de Sloth hace el
 *   video (`HERRAMIENTAS`: no es lo mismo uno que solo usa código que uno que gasta créditos de Google Flow) y con qué
 *   agentes se probó. La llena quien lo comparte (`CompartirEstilo` en `web/src/Estilos.tsx`), ya escrita si «Nuevo
 *   estilo» la dejó en su card, y al instalarlo queda en su card, a la vista donde se usa (`web/src/Guia.tsx`).
 * - **Un video entero hecho con él**, que es lo que se ve en la tienda.
 * - **Su prueba** (`PruebaEstilo`): con qué agente se hizo ese video, cuánto costó y cuánto tardó, medido en el hilo
 *   donde se hizo (`server/prueba-estilo.ts`), con ese hilo completo como evidencia (`EvidenciaEstilo`), que su autor
 *   acepta compartir y solo ven él y el creador.
 * Sin las tres el Worker no lo publica (`estiloEnSuSitio` en `licencias/src/comunidad.ts`) y el que ya estaba deja de
 * verse en la tienda hasta completarlo (`faltaEnEstilo`, `PublicacionComunidad.incompleto`).
 */
export const CAMPOS_GUIA: { id: 'das' | 'entrega' | 'ejemplo' | 'necesita'; titulo: string; pista: string; max: number; opcional?: true }[] = [
  { id: 'das', titulo: 'Qué le das', pista: 'Lo que pones tú cada vez. Por ejemplo: solo el tema; la voz la grabas cuando te da el guion.', max: 200 },
  { id: 'entrega', titulo: 'Qué te entrega', pista: 'Por ejemplo: un video de 30 a 60 segundos, vertical u horizontal, con su portada.', max: 200 },
  { id: 'ejemplo', titulo: 'Ejemplo de lo que le escribes', pista: 'Un mensaje listo para mandar. Por ejemplo: Hazme un video de por qué el cielo es azul.', max: 400 },
  { id: 'necesita', titulo: 'Qué necesita', pista: 'Lo que hace falta aparte de Sloth, si algo. Por ejemplo: Google Flow con créditos, o fotos tuyas.', max: 200, opcional: true }
]

/** Con qué de Sloth hace el video un estilo. `gasta`: usa una cuenta o créditos de quien lo instala. */
export const HERRAMIENTAS: { id: string; nombre: string; que: string; gasta?: true }[] = [
  { id: 'codigo', nombre: 'Código en tu computadora', que: 'Remotion, three.js o FFmpeg: lo dibuja tu computadora, sin créditos de nada' },
  { id: 'flow-imagenes', nombre: 'Imágenes de Google Flow', que: 'Con tu cuenta de Google', gasta: true },
  { id: 'flow-clips', nombre: 'Clips de Google Flow (Veo)', que: 'Con tu cuenta de Google y sus créditos', gasta: true },
  { id: 'chatgpt', nombre: 'Imágenes de ChatGPT', que: 'Con tu cuenta de ChatGPT', gasta: true },
  { id: 'voz-ia', nombre: 'Voz generada', que: 'AI Studio, Fish Audio, ElevenLabs o Voices Cloning', gasta: true },
  { id: 'tu-voz', nombre: 'Tu voz grabada', que: 'La grabas tú con el guion que te da' },
  { id: 'internet', nombre: 'Material de internet', que: 'Lo busca y lo baja con el navegador de Sloth' },
  { id: 'modelos-3d', nombre: 'Modelos 3D', que: 'Los de tu biblioteca de Sloth, y los que haga' }
]

/** Los títulos de lo que no son campos de texto, para decir qué falta. */
export const CON_QUE = 'Con qué lo hace'
export const PARA_QUE_AGENTES = 'Con qué agentes funciona bien'
export const VIDEO_ENTERO = 'Un video entero hecho con él'
/** La prueba cuenta con su evidencia: el hilo completo donde se hizo su video. */
export const PRUEBA = 'La prueba de con qué agente se hizo, cuánto costó y cuánto tardó'

/** El hilo completo de una prueba, como archivo de la comunidad: su tipo y cómo es su llave. */
export const TIPO_HILO = 'application/x-sloth-hilo'
const LLAVE_HILO = /^[a-z0-9]{20}\.hilo$/

/** Lo menos que dice un campo obligatorio: con menos, no explica nada. */
const MINIMO = 8

const unicos = <T>(lista: T[]) => [...new Set(lista)]

/** La guía limpia: cada campo recortado a su tope, sin los vacíos, y sus listas solo con lo que existe. Sin nada, nada. */
export function guiaDe(valor: unknown): GuiaEstilo | undefined {
  if (!valor || typeof valor !== 'object') return
  const de = valor as Record<string, unknown>
  const g: Record<string, string | string[]> = {}
  for (const c of CAMPOS_GUIA) {
    const v = de[c.id]
    const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, c.max) : ''
    if (t) g[c.id] = t
  }
  const herramientas = unicos(Array.isArray(de.herramientas) ? de.herramientas : []).filter((h) => HERRAMIENTAS.some((x) => x.id === h))
  if (herramientas.length) g.herramientas = herramientas as string[]
  const agentes = unicos(Array.isArray(de.agentes) ? de.agentes : []).filter((a) => (PROVEEDORES as readonly unknown[]).includes(a))
  if (agentes.length) g.agentes = agentes as string[]
  return Object.keys(g).length ? (g as unknown as GuiaEstilo) : undefined
}

/** El título de lo primero obligatorio que falta en la guía, o que no dice nada; '' si está completa. */
export function faltaEnGuia(g: Partial<GuiaEstilo> | undefined): string {
  const campo = CAMPOS_GUIA.find((c) => !c.opcional && (g?.[c.id] ?? '').trim().length < MINIMO)?.titulo
  return campo ?? (!g?.herramientas?.length ? CON_QUE : !g?.agentes?.length ? PARA_QUE_AGENTES : '')
}

const numero = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : undefined)

/** La prueba limpia. Sin su agente, su costo o su tiempo no es una prueba: nada. */
export function pruebaDe(valor: unknown): PruebaEstilo | undefined {
  if (!valor || typeof valor !== 'object') return
  const de = valor as Record<string, unknown>
  const costo = numero(de.costo, 10_000)
  const segundos = numero(de.segundos, 30 * 24 * 3600)
  if (!(PROVEEDORES as readonly unknown[]).includes(de.agente) || typeof de.modelo !== 'string' || !de.modelo.trim() || costo === undefined || !segundos) return
  const video = numero(de.video, 6 * 3600)
  const h = de.hilo && typeof de.hilo === 'object' ? (de.hilo as Record<string, unknown>) : undefined
  const turnos = (Array.isArray(h?.turnos) ? h.turnos : []).slice(0, 80).flatMap((t) => {
    const x = (t ?? {}) as Record<string, unknown>
    const s = numero(x.segundos, 24 * 3600)
    return s === undefined ? [] : [{ segundos: Math.round(s), costo: Math.round((numero(x.costo, 10_000) ?? 0) * 10_000) / 10_000, herramientas: Math.round(numero(x.herramientas, 100_000) ?? 0) }]
  })
  return {
    agente: de.agente as Proveedor,
    modelo: de.modelo.trim().slice(0, 80),
    costo: Math.round(costo * 100) / 100,
    segundos: Math.round(segundos),
    ...(video ? { video: Math.round(video) } : {}),
    ...(typeof de.evidencia === 'string' && LLAVE_HILO.test(de.evidencia) ? { evidencia: de.evidencia } : {}),
    ...(h && turnos.length
      ? {
          hilo: {
            pedido: String(h.pedido ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
            turnos,
            usa: unicos(Array.isArray(h.usa) ? h.usa : []).filter((u): u is string => HERRAMIENTAS.some((x) => x.id === u))
          }
        }
      : {})
  }
}

/**
 * Lo que le falta a un estilo para estar en la comunidad, por los adjuntos de su publicación y su texto: vacío si lo
 * tiene todo. Lo dice el Worker al publicarlo y de los que ya estaban, y la app, en rojo, a su autor.
 */
export function faltaEnEstilo(adjuntos: { tipo: string; guia?: Partial<GuiaEstilo>; prueba?: unknown }[], texto: string): string[] {
  const estilo = adjuntos.find((a) => a.tipo === 'estilo')
  const guia = faltaEnGuia(estilo?.guia)
  return [...(texto.trim() ? [] : ['Qué hace']), ...(guia ? [guia] : []), ...(adjuntos.some((a) => a.tipo === 'video') ? [] : [VIDEO_ENTERO]), ...(pruebaDe(estilo?.prueba)?.evidencia ? [] : [PRUEBA])]
}
