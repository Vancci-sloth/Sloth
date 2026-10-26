import { esLargo, esOutlier, LARGO, MIN_MUESTRA, origenes, porMil, sospechoso, TU_CANAL, veces } from '../../shared/ideas.ts'
import type { Canal, CanalYT, Investigacion, PasoYT, TerminoYT, VideoYT } from '../../shared/types.ts'
import { mediana, medir, mil } from './resumen.ts'
import { transcribirVideos } from './transcribir.ts'
import { vectorizar } from './vectores.ts'
import { correr, datosPorApi, datosPorPagina, type DatosVideo, Detenido, Pausa, subsPorApi, urlDeCanal } from './youtube.ts'

/**
 * La búsqueda en profundidad, en pequeño: el canal del usuario y sus referencias, y luego cada término
 * semilla. De cada búsqueda salen sus videos largos y los canales de los que más vistas tienen; de cada canal, sus videos
 * largos medidos contra la mediana de esos mismos videos largos. Al final, la fecha y los comentarios de los outliers,
 * para saber si son recientes y orgánicos, y lo que se dice en los videos largos (`transcribir.ts`), agrupados por tema
 * (`vectores.ts`). Los «recomendados» no se pueden leer: esa rama la cubre Claude con los términos nuevos que propone.
 */

const RESULTADOS = 30
/**
 * De cada búsqueda se abren los canales de sus videos con más vistas. Con 3 quedaban sin medir muchos videos del feed,
 * y un video sin medir prueba que el tema se busca, pero no que superó a su canal.
 */
const POR_TERMINO = 5
const MAX_CANALES = 40
/**
 * Una búsqueda hecha entera, o un canal leído, hace menos de esto no se repite: la vuelta siguiente solo hace lo nuevo, y
 * lo de antes sigue en la investigación.
 */
const RECIENTE = 3 * 864e5
/** Sin llave de la API, las fechas se leen de una en una: solo las de los mejores outliers. */
const FECHAS_SIN_LLAVE = 30

export interface Ctx {
  paso(tipo: PasoYT['tipo'], texto: string, detalle?: string): void
  avance(hecho: number, total: number, fase: string): void
  guardar(inv: Investigacion): void
  signal: AbortSignal
  llave: string
  /** La carpeta del canal (`trabajo/ideas/<id>`): ahí van las transcripciones, y en uno vertical las portadas. */
  carpeta: string
}

/** Lo que dice yt-dlp de un video que ya no está: no hay fecha que leer, y no se vuelve a intentar. */
const NO_ESTA = /unavailable|private video|has been removed|no longer available|not available/i

function dormir(ms: number, signal: AbortSignal) {
  return new Promise<void>((ok, mal) => {
    if (signal.aborted) return mal(new Detenido('Detenida'))
    const t = setTimeout(ok, ms)
    signal.addEventListener('abort', () => (clearTimeout(t), mal(new Detenido('Detenida'))), { once: true })
  })
}

/**
 * Con `solo`, investiga únicamente esos orígenes del perfil (términos, referencias o tu canal): lo que le falta a la
 * investigación antes de proponer ideas.
 */
export async function investigar(canal: Canal, previa: Investigacion | null, ctx: Ctx, solo?: string[]): Promise<Investigacion> {
  // La investigación se acumula de una vuelta a otra.
  const inv: Investigacion = previa ? structuredClone(previa) : { terminos: [], canales: [], videos: [] }
  const videos = new Map(inv.videos.map((v) => [v.id, v]))
  const ahora = Date.now()
  const actuales = origenes(canal)
  const toca = (o: string) => !solo || solo.includes(o)
  const reciente = (x?: { visto: number; cortado?: boolean }) => !!x && !x.cortado && ahora - x.visto < RECIENTE
  /** Los videos que salieron en una búsqueda: se transcriben después de los outliers. */
  const buscados = new Set(inv.terminos.flatMap((t) => t.ids))
  let hecho = 0

  /**
   * Guarda un video sin perder lo que ya se sabía de él (fecha, comentarios, su `x`). Si sale en otra búsqueda, se suma
   * a sus orígenes: es el mismo video.
   */
  function anotar(v: VideoYT) {
    const antes = videos.get(v.id)
    if (!antes) return void videos.set(v.id, v)
    const nuevo = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))
    videos.set(v.id, { ...antes, ...nuevo, de: [...new Set([...antes.de, ...v.de])] })
  }
  /** Cada vez que se guarda, `x` se vuelve a calcular: las vistas o la mediana de su canal pudieron cambiar. */
  function guardar() {
    inv.videos = [...videos.values()]
    medir(inv)
    ctx.guardar(inv)
  }
  /** Lo que se leyó de un video (su fecha, sus comentarios, sus vistas al día). Sin `d`, YouTube ya no lo tiene. */
  function leido(v: VideoYT, d: DatosVideo = {}) {
    anotar({ ...v, ...d, vistas: d.vistas ?? v.vistas, leido: Date.now() })
  }

  /** Una llamada a YouTube con su respiro. Si YouTube frena, espera un minuto y lo intenta una vez más. */
  async function llamar<T>(fn: () => Promise<T>): Promise<T> {
    await dormir(1200 + Math.random() * 1300, ctx.signal)
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Pausa)) throw e
      ctx.paso('pausa', 'YouTube pidió ir más despacio: espero un minuto y sigo.')
      await dormir(60_000, ctx.signal)
      try {
        return await fn()
      } catch (e2) {
        if (e2 instanceof Pausa) throw new Error('YouTube sigue frenando las peticiones. Lo leído ya está guardado: vuelve a intentarlo en un rato.')
        throw e2
      }
    }
  }

  // La pila: primero tu canal y tus referencias; los canales de cada búsqueda se apilan al hacerla.
  type PorLeer = { url: string; de: string; propio?: boolean }
  const porLeer: PorLeer[] = []
  const vistos = new Set<string>()
  // Lo leído hace poco no se repite. Sus canales cuentan como ya vistos, igual que si se hubieran leído en esta vuelta.
  let saltados = 0
  function apilar(c: PorLeer) {
    const antes = inv.canales.find((x) => (c.propio ? x.propio : x.de === c.de))
    if (!reciente(antes)) return void porLeer.push(c)
    vistos.add(antes!.id)
    saltados++
  }
  if (canal.handle && toca(TU_CANAL)) apilar({ url: urlDeCanal(canal.handle)!, de: TU_CANAL, propio: true })
  // Cada referencia es su propio origen: si la quitas del perfil, lo que trajo deja de contar.
  for (const r of canal.referencias.filter(toca)) {
    const url = urlDeCanal(r)
    if (url) apilar({ url, de: r })
  }
  let leidos = 0
  // Los nichos vecinos se recorren igual que tus términos: ahí se ve qué fórmulas funcionan con un público como el tuyo.
  const todos = [
    ...canal.semillas.map((termino) => ({ termino, vecino: false })),
    ...canal.vecinos.filter((v) => !canal.semillas.includes(v)).map((termino) => ({ termino, vecino: true }))
  ].filter((p) => toca(p.termino))
  const buscadas = new Map(inv.terminos.map((t) => [t.termino, t]))
  const repetidas = new Set(todos.filter((p) => reciente(buscadas.get(p.termino))).map((p) => p.termino))
  const pendientes = todos.filter((p) => !repetidas.has(p.termino))
  for (const c of inv.canales) if (repetidas.has(c.de)) vistos.add(c.id)
  // Cada término cuenta por él y por los canales que suele traer.
  const total = () => hecho + porLeer.length + pendientes.length * (1 + POR_TERMINO) + 1

  /** Devuelve si lo pudo leer. */
  async function leerCanal(c: PorLeer) {
    ctx.avance(hecho, total(), `Leyendo canales · ${c.de}`)
    let d: any
    try {
      d = await llamar(() => correr(['--flat-playlist', '--playlist-end', '30', c.url], ctx.signal))
    } catch (e) {
      if (e instanceof Detenido) throw e
      ctx.paso('error', `No pude leer ${c.url.replace('https://www.youtube.com/', '')}`, (e as Error).message)
      return false
    }
    hecho++
    const id: string = d.channel_id ?? d.id
    const nombre: string = d.channel ?? d.uploader ?? String(d.title ?? id).replace(/ - Videos$/, '')
    vistos.add(id)
    const entradas = ((d.entries ?? []) as any[]).filter((e) => e?.id && typeof e.view_count === 'number')
    // Se mide como se busca: solo con sus videos largos. Los cortos se guardan, sin `x`, por si un día se recalcula.
    const largos = entradas.filter((e) => esLargo({ segundos: e.duration ?? undefined }))
    const med = mediana(largos.map((e) => e.view_count))
    const medible = largos.length >= MIN_MUESTRA || c.propio
    const yt: CanalYT = { id, nombre, url: `https://www.youtube.com/channel/${id}`, mediana: med, videos: largos.length, subs: d.channel_follower_count ?? undefined, de: c.de, propio: c.propio || undefined, visto: Date.now() }
    inv.canales = [...inv.canales.filter((x) => x.id !== id), yt]
    for (const e of entradas) {
      const x = medible && med && largos.includes(e) ? e.view_count / med : undefined
      anotar({ id: e.id, titulo: e.title ?? '', canal: nombre, canalId: id, vistas: e.view_count, segundos: e.duration ?? undefined, x, de: [c.de], visto: Date.now() })
    }
    guardar()
    const outliers = largos.filter((e) => medible && med && esOutlier({ x: e.view_count / med, vistas: e.view_count })).sort((a, b) => b.view_count - a.view_count)
    const mejor = outliers[0]
    ctx.paso(
      'canal',
      `${nombre}${c.propio ? ' (tu canal)' : ''} · mediana ${mil(med)} de ${largos.length} videos largos · ${outliers.length} ${outliers.length === 1 ? 'outlier' : 'outliers'}`,
      !medible
        ? `Solo ${largos.length} videos largos: muy pocos para medirlo.`
        : med < 100
          ? `Su normal es de ${mil(med)} vistas: con tan pocas, sus «outliers» no cuentan como demanda.`
          : mejor
            ? `El mejor: «${mejor.title}», ${veces(mejor.view_count / med)} (${mil(mejor.view_count)})`
            : undefined
    )
    return true
  }

  // Tu canal y tus referencias.
  const cuantos = `${pendientes.length} ${pendientes.length === 1 ? 'término' : 'términos'}${porLeer.length ? `, ${porLeer.length} ${porLeer.length === 1 ? 'canal conocido' : 'canales conocidos'}` : ''}`
  ctx.paso('info', solo ? `Investigo lo que falta de tu perfil: ${cuantos}.` : `Empiezo: ${cuantos}.`)
  if (repetidas.size || saltados)
    ctx.paso(
      'info',
      `No repito lo hecho hace menos de ${RECIENTE / 864e5} días: ${[repetidas.size && `${repetidas.size} ${repetidas.size === 1 ? 'búsqueda' : 'búsquedas'}`, saltados && `${saltados} ${saltados === 1 ? 'canal conocido' : 'canales conocidos'}`].filter(Boolean).join(' y ')}.`,
      'Lo que encontraron sigue en la investigación.'
    )
  while (porLeer.length) await leerCanal(porLeer.shift()!)

  // Cada término, y en seguida los canales que trae: así se va a fondo en una rama antes de pasar a la siguiente.
  while (pendientes.length) {
    const { termino, vecino } = pendientes.shift()!
    ctx.avance(hecho, total(), `Buscando «${termino}»${vecino ? ' (nicho vecino)' : ''}`)
    // Se busca con la frase del problema («lose visceral fat»), no con una palabra: «Tiktok» trae mashups de música.
    if (!/\s/.test(termino.trim()))
      ctx.paso('info', `«${termino}» es una sola palabra: trae de todo, también otros públicos.`, 'Mejor una frase como la escribiría tu público: «crecer en tiktok», «editar videos con claude».')
    let d: any
    try {
      d = await llamar(() => correr(['--flat-playlist', `ytsearch${RESULTADOS}:${termino}`], ctx.signal))
    } catch (e) {
      if (e instanceof Detenido) throw e
      ctx.paso('error', `No pude buscar «${termino}»`, (e as Error).message)
      continue
    }
    hecho++
    const largos = ((d.entries ?? []) as any[]).filter((e) => e?.id && typeof e.view_count === 'number' && (e.duration ?? 0) >= LARGO)
    // Queda `cortado` hasta abrir sus canales: si algo lo corta antes, la vuelta siguiente la repite.
    const t: TerminoYT = { termino, ...(vecino ? { vecino } : {}), largos: largos.length, mediana: mediana(largos.map((e) => e.view_count)), ids: largos.slice(0, 12).map((e) => e.id), visto: Date.now(), cortado: true }
    inv.terminos = [...inv.terminos.filter((x) => x.termino !== termino), t]
    for (const e of largos) {
      anotar({ id: e.id, titulo: e.title ?? '', canal: e.channel ?? '', canalId: e.channel_id ?? '', vistas: e.view_count, segundos: e.duration ?? undefined, de: [termino], visto: Date.now() })
      buscados.add(e.id)
    }
    guardar()
    const porVistas = [...largos].sort((a, b) => b.view_count - a.view_count)
    ctx.paso('buscar', `«${termino}»${vecino ? ' (vecino)' : ''} · ${largos.length} videos largos · mediana ${mil(t.mediana)}`, porVistas[0] ? `El más visto: «${porVistas[0].title}» (${mil(porVistas[0].view_count)})` : undefined)

    const canales = [...new Map(porVistas.map((e) => [e.channel_id as string, e])).values()].filter((e) => e.channel_id && !vistos.has(e.channel_id))
    let cortado = false
    for (const e of canales.slice(0, POR_TERMINO)) {
      vistos.add(e.channel_id)
      const antes = inv.canales.find((c) => c.id === e.channel_id)
      if (antes && ahora - antes.visto < RECIENTE) {
        // No se relee, pero también lo trajo esta búsqueda: sus videos lo dicen, para que cuenten mientras siga en tu
        // perfil. Si lo había traído algo que ya quitaste, ahora viene de aquí.
        for (const v of videos.values()) if (v.canalId === antes.id && !v.de.includes(termino)) v.de = [...v.de, termino]
        if (!actuales.has(antes.de)) antes.de = termino
        ctx.paso('info', `${antes.nombre}: ya lo leí hace poco, no lo repito.`)
        continue
      }
      if (leidos >= MAX_CANALES) {
        cortado = true
        break
      }
      leidos++
      if (!(await leerCanal({ url: `https://www.youtube.com/channel/${e.channel_id}/videos`, de: termino }))) cortado = true
    }
    if (!cortado) delete t.cortado
    guardar()
  }

  // Los suscriptores no hacen falta para medir (el outlier es contra la mediana del canal), pero dan contexto. yt-dlp no
  // los da en el listado rápido; la API, de 50 en 50 canales por 1 unidad.
  const sinSubs = inv.canales.filter((c) => c.subs === undefined)
  if (ctx.llave && sinSubs.length) {
    try {
      const subs = await subsPorApi(sinSubs.map((c) => c.id), ctx.llave, ctx.signal)
      for (const c of inv.canales) if (subs.has(c.id)) c.subs = subs.get(c.id)
      guardar()
    } catch (e) {
      if (ctx.signal.aborted) throw new Detenido('Detenida')
      ctx.paso('error', 'No pude leer los suscriptores con la API de YouTube.', (e as Error).message)
    }
  }

  // Las fechas y los comentarios de los outliers, los mismos que cuentan como outlier: ¿son recientes? ¿son orgánicos?
  // Con la llave se leen todos; sin ella, o si la API falla, uno por uno y solo los mejores. Solo los de tu perfil de hoy:
  // los de un término que quitaste no se cuentan, y sin llave se comían la mitad de las 30 lecturas.
  const candidatos = [...videos.values()]
    .filter((v) => esOutlier(v) && v.leido === undefined && v.de.some((d) => actuales.has(d)))
    .sort((a, b) => (b.x ?? 0) - (a.x ?? 0))
  let porApi = false
  if (candidatos.length && ctx.llave) {
    ctx.avance(hecho, hecho + 1, 'Fechas y comentarios (API de YouTube)')
    try {
      const datos = await datosPorApi(candidatos.map((v) => v.id), ctx.llave, ctx.signal)
      // La API responde por todos los que existen: el que no viene se borró o es privado.
      for (const v of candidatos) leido(v, datos.get(v.id))
      guardar()
      porApi = true
      const raros = candidatos.filter((v) => sospechoso(videos.get(v.id)!)).length
      const fuera = candidatos.length - datos.size
      ctx.paso(
        'fecha',
        `Fechas y comentarios de ${datos.size} outliers con la API de YouTube.`,
        [raros && `${raros} con comentarios inusualmente bajos para sus vistas: míralos antes de contarlos.`, fuera && `${fuera} ya no están en YouTube.`].filter(Boolean).join(' ') || undefined
      )
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      ctx.paso('error', `La API de YouTube falló: leo las fechas sin ella, de los ${FECHAS_SIN_LLAVE} mejores outliers.`, (e as Error).message)
    }
    hecho++
  }
  const sinFecha = porApi ? [] : candidatos.slice(0, FECHAS_SIN_LLAVE)
  for (const [i, v] of sinFecha.entries()) {
    ctx.avance(hecho, hecho + sinFecha.length - i, `Fechas de los mejores outliers · ${i + 1} de ${sinFecha.length}`)
    try {
      const d = await llamar(() => datosPorPagina(v.id, ctx.signal))
      leido(v, d)
      guardar()
      const nuevo = videos.get(v.id)!
      const pm = porMil(nuevo)
      ctx.paso(
        'fecha',
        `«${v.titulo}» · ${nuevo.fecha ?? 'sin fecha'}${pm !== undefined ? ` · ${nuevo.comentarios} comentarios (${pm.toFixed(pm < 1 ? 2 : 1)} por mil)` : ''}`,
        sospechoso(nuevo) ? 'Comentarios inusualmente bajos para sus vistas: puede ser publicidad pagada. Míralo antes de contarlo como demanda.' : `${veces(nuevo.x ?? 0)} en ${v.canal}`
      )
    } catch (e) {
      if (e instanceof Detenido) throw e
      // Si YouTube dice que ya no está, queda leído y sin fecha: no es lo mismo que no haberlo intentado.
      if (NO_ESTA.test((e as Error).message)) leido(v), guardar()
      ctx.paso('error', `No pude leer la fecha de «${v.titulo}»`, (e as Error).message)
    }
    hecho++
  }

  // Lo medido ya está: si detienes lo que sigue, que es largo, la investigación queda hecha.
  inv.hecha = Date.now()
  guardar()

  // Lo que se dice en los videos largos de tu perfil de hoy, los medidos y los de las búsquedas (los cortos de un canal se
  // guardan sin medir, y no se transcriben); con `solo`, los de esos orígenes. Luego, todos agrupados por tema.
  const carpeta = ctx.carpeta
  const deHoy = [...videos.values()].filter((v) => v.de.some((d) => actuales.has(d)))
  const fase = { paso: ctx.paso, avance: ctx.avance, signal: ctx.signal, guardar }
  await transcribirVideos(carpeta, deHoy.filter((v) => esLargo(v) && v.de.some(toca)), fase, undefined, buscados)
  await vectorizar(carpeta, deHoy, fase)
  guardar()

  const outliers = [...videos.values()].filter(esOutlier)
  ctx.paso('info', `Listo: ${inv.terminos.length} términos, ${inv.canales.length} canales y ${outliers.length} outliers en total.`)
  ctx.avance(hecho, hecho, 'Lista')
  return inv
}
