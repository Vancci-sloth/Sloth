import { createSdkMcpServer, tool, type McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { alPerfil, compartidosPorMil, esVertical, guardadosPorMil, MADURO, MIN_MUESTRA, porMil, usuarioDe, veces } from '../../shared/ideas.ts'
import type { Canal, Investigacion, VideoYT } from '../../shared/types.ts'
import { tokenMeta } from '../opciones.ts'
import { cuentaInstagram } from './instagram.ts'
import { buscarInstagram } from './instagram-web.ts'
import { mediana, mil } from './resumen.ts'
import { buscarTikTok, comentariosTikTok, cuentaTikTok, type Hallado } from './tiktok.ts'
import { parecidos, transcripcion } from './vectores.ts'

/**
 * Las herramientas de un hilo de Ideas (MCP «ideas»), cuando Claude las necesita. En todos, `parecidos`: los videos de la
 * investigación que dicen algo parecido a un texto o a otro video, por sus vectores (`vectores.ts`). En uno vertical,
 * además, buscar en TikTok o en Instagram, leer una cuenta, sus comentarios, o una cuenta de Instagram: así prueba las
 * frases de la entrevista y va más a fondo en lo que el resumen deja abierto. Son las mismas funciones de la
 * investigación, con las cuentas de investigación (nunca las que publican); no guardan nada en ella. Cada búsqueda abre
 * la red a ritmo de persona: la skill pide usarlas con medida.
 */

/** Las herramientas, si `cwd` es la carpeta de un canal (`trabajo/ideas/<id>`, con su `canal.json`); si no, ninguna. */
export function herramientasIdeas(cwd: string): Record<string, McpSdkServerConfigWithInstance> {
  if (!/[\\/]trabajo[\\/]ideas[\\/][\w-]+[\\/]?$/.test(cwd)) return {}
  let canal: Canal | null = null
  try {
    canal = JSON.parse(readFileSync(join(cwd, 'canal.json'), 'utf8'))
  } catch {}
  if (!canal) return {}
  const app = resolve(cwd, '..', '..', '..')
  const deTodos = [
    tool(
      'parecidos',
      'Los 10 videos de la investigación que dicen algo más parecido a un texto («canal sin mostrar la cara») o a un video (su id), aunque usen otras palabras u otro idioma. Compara vectores de lo que dice cada video (título o descripción y transcripción) hechos con un modelo multilingüe local. Cada línea: similitud (coseno: casi nada baja de 0.75, y lo que habla de lo mismo suele pasar de 0.85), id, red, idioma, ×, cuenta, título y, si se transcribió, el principio de lo que dice. Solo lo del perfil de hoy. Con un texto tarda unos 10 s (carga el modelo); con un video, nada. Para saber si un outlier en inglés ya existe en español, mira primero enEspanol de temas.json: buscar por un video trae sobre todo de su mismo idioma.',
      {
        texto: z.string().optional().describe('Lo que buscas, dicho como lo diría el video: «canal sin mostrar la cara»'),
        video: z.string().optional().describe('El id de un video de la investigación, para buscar los que dicen algo parecido')
      },
      (a, extra) => responder(async () => {
        if (!a.texto?.trim() && !a.video?.trim()) return 'Pasa un texto o el id de un video.'
        let inv: Investigacion
        let hoy: Canal
        try {
          inv = JSON.parse(readFileSync(join(cwd, 'investigacion.json'), 'utf8'))
          hoy = JSON.parse(readFileSync(join(cwd, 'canal.json'), 'utf8'))
        } catch {
          return 'Este canal aún no tiene investigación.'
        }
        const videos = new Map(alPerfil(inv, hoy).videos.map((v) => [v.id, v]))
        const consulta: { id?: string; texto?: string } = a.video?.trim() ? { id: a.video.trim() } : { texto: a.texto!.trim() }
        const hallados = await parecidos(cwd, consulta, 10, { entre: new Set(videos.keys()), signal: senal(extra) })
        const base = consulta.id && inv.videos.find((v) => v.id === consulta.id)
        return [
          base ? `Parecidos a ${lineaVideo(cwd, base)}` : `Parecidos a «${consulta.texto ?? consulta.id}»`,
          ...hallados.map((h) => `${h.similitud.toFixed(3)} · ${lineaVideo(cwd, videos.get(h.id)!)}`)
        ].join('\n')
      })
    )
  ]
  if (!esVertical(canal)) return { ideas: createSdkMcpServer({ name: 'ideas', version: '1.0.0', tools: deTodos }) }
  return {
    ideas: createSdkMcpServer({
      name: 'ideas',
      version: '1.0.0',
      tools: [
        ...deTodos,
        tool(
          'buscar_tiktok',
          'Busca una frase en TikTok, como la escribiría el público, y devuelve los ~24 primeros videos con su idioma, vistas, guardados, compartidos y comentarios por mil, fecha, cuenta con seguidores y descripción, más la mediana de vistas. Una frase en inglés pide resultados en inglés, pero TikTok mezcla los de México. No guarda nada.',
          { termino: z.string().describe('La frase, de 2 a 5 palabras: «crear videos con ia»') },
          (a, extra) => responder(async () => {
            const hallados = await buscarTikTok(app, a.termino, senal(extra))
            if (!hallados.length) return `«${a.termino}»: TikTok no dio videos.`
            const med = mediana(hallados.map((h) => h.video.vistas))
            return [`«${a.termino}» · ${hallados.length} videos · mediana ${mil(med)} vistas`, ...hallados.map((h) => linea(h))].join('\n')
          })
        ),
        tool(
          'buscar_instagram',
          'Busca una frase en Instagram, como la escribiría el público, y devuelve los ~30 primeros Reels con su idioma, likes, comentarios, duración, fecha, cuenta y descripción, más la mediana de likes. La búsqueda de Instagram no da vistas: para medir un Reel contra su cuenta, léela con cuenta_instagram. Va más despacio que TikTok (unos 45 s entre búsquedas), porque Instagram es más duro con las cuentas. No guarda nada.',
          { termino: z.string().describe('La frase, de 2 a 5 palabras: «crear videos con ia»') },
          (a, extra) => responder(async () => {
            const hallados = await buscarInstagram(app, a.termino, senal(extra))
            if (!hallados.length) return `«${a.termino}»: Instagram no dio Reels.`
            const med = mediana(hallados.flatMap((h) => (h.video.likes === undefined ? [] : [h.video.likes])))
            return [`«${a.termino}» · ${hallados.length} Reels · mediana ${mil(med)} likes · sin vistas: la búsqueda de Instagram no las da`, ...hallados.map(lineaInstagram)].join('\n')
          })
        ),
        tool(
          'cuenta_tiktok',
          'Los últimos 30 videos de una cuenta de TikTok, cada uno con su × contra la mediana de la cuenta (sin fijados ni videos de menos de 3 días). Un outlier tiene 3× o más.',
          { usuario: z.string().describe('@cuenta o su enlace') },
          (a, extra) => responder(async () => {
            const c = await cuentaTikTok(usuarioDe(a.usuario), senal(extra))
            return medida(`@${c.usuario} (${c.nombre})`, c.videos)
          })
        ),
        tool(
          'comentarios_tiktok',
          'Los comentarios con más likes de un video de TikTok: qué pide la gente, con sus palabras.',
          { usuario: z.string().describe('@cuenta del video'), video: z.string().describe('El id del video') },
          (a, extra) => responder(async () => {
            const cs = await comentariosTikTok(app, usuarioDe(a.usuario), a.video, senal(extra), 10)
            return cs.length ? cs.map((c) => `♥${c.likes} ${c.texto.replace(/\s+/g, ' ')}`).join('\n') : 'Sin comentarios.'
          })
        ),
        tool(
          'cuenta_instagram',
          'Los últimos Reels de una cuenta profesional de Instagram (empresa o creador), cada uno con su × contra la mediana de la cuenta. Necesita el token de Meta en Opciones.',
          { usuario: z.string().describe('@cuenta o su enlace') },
          (a, extra) => responder(async () => {
            const token = tokenMeta()
            if (!token) return 'Sin el token de Meta no se puede leer Instagram: el usuario lo pone en ⚙ Opciones → Llaves de API.'
            const c = await cuentaInstagram(usuarioDe(a.usuario), token, senal(extra))
            return medida(`@${c.usuario} (${c.nombre}${c.seguidores ? `, ${mil(c.seguidores)} seguidores` : ''})`, c.videos)
          })
        )
      ]
    })
  }
}

/** La señal para cortar la herramienta si el hilo se detiene. */
const senal = (extra: unknown) => (extra as { signal?: AbortSignal } | undefined)?.signal ?? new AbortController().signal

/** Un error de la herramienta se devuelve como texto, para que Claude lo lea y siga. */
async function responder(fn: () => Promise<string>) {
  try {
    return { content: [{ type: 'text' as const, text: await fn() }] }
  } catch (e) {
    return { content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true }
  }
}

/** Un video en una línea: id · 210 mil vistas · 38 guard/mil · 4.1 comp/mil · 1.2 com/mil · fecha · @cuenta · «descripción». */
function linea(h: Hallado, x?: number) {
  const v = h.video
  const n = (y?: number) => (y === undefined ? undefined : y.toFixed(y < 1 ? 2 : 1))
  const [g, c, k] = [n(guardadosPorMil(v)), n(compartidosPorMil(v)), n(porMil(v))]
  return [
    v.id,
    v.idioma,
    x !== undefined && veces(x),
    `${mil(v.vistas)} vistas`,
    g && `${g} guard/mil`,
    c && `${c} comp/mil`,
    k && `${k} com/mil`,
    v.fecha,
    v.fijado && 'fijado',
    `${v.canal}${h.autor.seguidores ? ` (${mil(h.autor.seguidores)} seguidores)` : ''}`,
    `«${v.titulo.replace(/\s+/g, ' ').slice(0, 140)}»`
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Un Reel de la búsqueda de Instagram en una línea: código · idioma · 1.2 mil likes · 34 comentarios · 45 s · fecha · @cuenta · «descripción». */
function lineaInstagram(h: Hallado) {
  const v = h.video
  return [
    v.id,
    v.idioma,
    v.likes === undefined ? 'likes ocultos' : `${mil(v.likes)} likes`,
    v.comentarios !== undefined && `${mil(v.comentarios)} comentarios`,
    v.segundos && `${v.segundos} s`,
    v.fecha,
    v.pagado && 'pagado',
    v.canal,
    `«${v.titulo.replace(/\s+/g, ' ').slice(0, 140)}»`
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Un video de la investigación en una línea: id · red · idioma · × · @cuenta · «título» · dice: «…». Lo que dice es el
 * principio de su transcripción, si la tiene; «sin voz», si se transcribió y no se habla.
 */
function lineaVideo(carpeta: string, v: VideoYT) {
  const t = transcripcion(carpeta, v.id)
  const dicho = t?.texto.split(/\s+/).filter(Boolean)
  return [
    v.id,
    v.red ?? 'youtube',
    v.idioma ?? t?.idioma,
    v.x !== undefined ? veces(v.x) : 'sin medir',
    v.canal,
    `«${v.titulo.replace(/\s+/g, ' ').slice(0, 140)}»`,
    t && (dicho?.length ? `dice: «${dicho.slice(0, 30).join(' ')}${dicho.length > 30 ? '…' : ''}»` : 'sin voz')
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Los videos de una cuenta contra su mediana, como los mide la investigación. */
function medida(titulo: string, hallados: Hallado[]) {
  const libres = hallados.filter((h) => !h.video.fijado)
  const maduros = libres.filter((h) => h.video.fecha && Date.now() - new Date(h.video.fecha).getTime() > MADURO)
  const base = maduros.length >= MIN_MUESTRA ? maduros : libres
  const med = mediana(base.map((h) => h.video.vistas))
  const x = (h: Hallado) => (med > 0 ? h.video.vistas / med : undefined)
  return [
    `${titulo} · mediana ${mil(med)} vistas de ${base.length} videos${base.length < MIN_MUESTRA ? ' (pocos: no se fíe de la ×)' : ''}`,
    ...[...hallados].sort((a, b) => (x(b) ?? 0) - (x(a) ?? 0)).map((h) => linea(h, x(h)))
  ].join('\n')
}
