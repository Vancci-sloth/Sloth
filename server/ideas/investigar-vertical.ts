import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { esOutlier, idiomaDe, MADURO, MIN_MUESTRA, origenes, redDeReferencia, TU_CANAL, TU_INSTAGRAM, usuarioDe, veces } from '../../shared/ideas.ts'
import type { Canal, CanalYT, Investigacion, RedVertical, TerminoYT, VideoYT } from '../../shared/types.ts'
import { cuentaInstagram, LimiteMeta, NoEsProfesional, usoMeta } from './instagram.ts'
import { buscarInstagram, ControlInstagram, hayInstagram, SinSesionInstagram } from './instagram-web.ts'
import type { Ctx } from './investigar.ts'
import { dormir } from './navegador-investigacion.ts'
import { mediana, medir, mil } from './resumen.ts'
import { bajarPortada, buscarTikTok, Captcha, comentariosTikTok, cuentaTikTok, type Hallado, SinSesionTikTok } from './tiktok.ts'
import { transcribirVideos } from './transcribir.ts'
import { vectorizar } from './vectores.ts'
import { Detenido, Pausa } from './youtube.ts'

/**
 * La búsqueda para video vertical: tus cuentas de TikTok e Instagram y tus referencias, y luego cada término en
 * los buscadores de TikTok y de Instagram, que es donde tu público escribe lo que quiere. De cada búsqueda de TikTok
 * salen las cuentas de sus videos más vistos; de cada cuenta, sus últimos videos medidos contra su propia mediana. La de
 * Instagram no da vistas: salen las cuentas de sus Reels con más likes, y al leerlas sus Reels reciben las vistas.
 * Después, el Instagram de las cuentas de TikTok con outliers (casi siempre es el mismo usuario), los comentarios con más
 * likes de los mejores outliers (qué pide la gente), las portadas y lo que se dice en cada video (`transcribir.ts`),
 * agrupado por tema (`vectores.ts`). Se acumula y se guarda paso a paso, como `investigar.ts`.
 */

const POR_TERMINO = 5
/** Cuántas cuentas se leen por vuelta como mucho, en cada red. */
const MAX_CUENTAS = 40
/**
 * En Instagram la búsqueda no da vistas: solo las tienen los Reels de las cuentas que se miden, con la API oficial. Se miden
 * tantas como en TikTok: con 8 por frase, la cuota de Meta se llenó a las 5 frases de 13 (2026-10-11).
 */
const POR_TERMINO_INSTAGRAM = 5
const MAX_CUENTAS_INSTAGRAM = 80
/**
 * En Instagram, a cuántas cuentas de una búsqueda se intenta llegar para medir `POR_TERMINO_INSTAGRAM`: la API de Meta
 * solo deja leer las profesionales, y las demás se saltan.
 */
const INTENTOS_INSTAGRAM = 14
/** Como en YouTube: una búsqueda hecha entera, o una cuenta leída, hace menos de esto no se repite. */
const RECIENTE = 3 * 864e5
/** Cuántas cuentas de TikTok con outliers se buscan en Instagram, y de cuántos outliers se leen los comentarios. */
const MAX_INSTAGRAM = 15
const MAX_COMENTARIOS = 15
const MAX_PORTADAS = 200
/** Cuánto se espera a que resuelvas un captcha antes de dejarlo. */
const CAPTCHA = 3 * 60_000

export interface CtxVertical extends Ctx {
  app: string
  /** La carpeta del canal: ahí van las portadas. */
  carpeta: string
  /** El token de Meta, o `''`: sin él, Instagram no se investiga. */
  meta: string
}

/**
 * El id de una cuenta: su usuario, y en Instagram con `ig:` delante. El mismo usuario suele existir en las dos redes, y
 * cada una tiene su mediana.
 */
const idDe = (red: RedVertical, usuario: string) => (red === 'instagram' ? `ig:${usuario}` : usuario)
/** Una búsqueda es una frase en una red: cada una tiene su fecha, su `cortado` y sus cuentas. */
const clave = (termino: string, red: RedVertical = 'tiktok') => `${red} ${termino}`

/** Una descripción en una línea y corta, para los pasos. */
function corto(texto: string, max = 80) {
  const t = texto.replace(/\s+/g, ' ').trim()
  return !t ? '(sin texto)' : t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Con `solo`, investiga únicamente esos orígenes del perfil: términos, referencias o tus cuentas. */
export async function investigarVertical(canal: Canal, previa: Investigacion | null, ctx: CtxVertical, solo?: string[]): Promise<Investigacion> {
  const inv: Investigacion = previa ? structuredClone(previa) : { terminos: [], canales: [], videos: [] }
  const videos = new Map(inv.videos.map((v) => [v.id, v]))
  const ahora = Date.now()
  const actuales = origenes(canal)
  const toca = (o: string) => !solo || solo.includes(o)
  const reciente = (x?: { visto: number; cortado?: boolean }) => !!x && !x.cortado && ahora - x.visto < RECIENTE
  // Los enlaces de las portadas caducan en un día: se guardan solo durante la vuelta, y se bajan al final. Los de los
  // Reels, para transcribirlos, también.
  const portadas = new Map<string, string>()
  const enlaces = new Map<string, string>()
  /** Los videos que salieron en una búsqueda: se transcriben después de los outliers. */
  const buscados = new Set(inv.terminos.flatMap((t) => t.ids))
  // yt-dlp no da los seguidores de una cuenta; la búsqueda, sí.
  const seguidores = new Map<string, number>()
  let hecho = 0

  /**
   * Guarda un video sin perder lo que ya se sabía de él. Si sale en otra búsqueda, se suma a sus orígenes. Su idioma no
   * cambia: el de la búsqueda lo da TikTok, y el de leer su cuenta solo se deduce del texto.
   */
  function anotar(v: VideoYT) {
    const antes = videos.get(v.id)
    if (!antes) return void videos.set(v.id, v)
    const nuevo = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined))
    videos.set(v.id, { ...antes, ...nuevo, idioma: antes.idioma ?? v.idioma, de: [...new Set([...antes.de, ...v.de])] })
  }
  /** El idioma de una cuenta: el de la mayoría de sus videos con idioma. */
  function idiomaDeCuenta(ids: string[]) {
    const n = new Map<string, number>()
    for (const id of ids) {
      const i = videos.get(id)?.idioma
      if (i) n.set(i, (n.get(i) ?? 0) + 1)
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  /** Cada vez que se guarda, `x` se vuelve a calcular: las vistas o la mediana de su cuenta pudieron cambiar. */
  function guardar() {
    inv.videos = [...videos.values()]
    medir(inv)
    ctx.guardar(inv)
  }

  /**
   * Una lectura de cuenta con su respiro. Si la red frena, espera un minuto y lo intenta una vez más. Si es el límite de
   * Meta y tarda más en recuperarse, no se espera: Instagram queda para la vuelta siguiente (`agotarMeta`).
   */
  async function llamar<T>(red: string, fn: () => Promise<T>): Promise<T> {
    await dormir(1200 + Math.random() * 1300, ctx.signal)
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Pausa)) throw e
      if (e instanceof LimiteMeta && usoMeta.minutos > 2) throw agotarMeta(e)
      ctx.paso('pausa', `${red} pidió ir más despacio: espero un minuto y sigo.`)
      await dormir(60_000, ctx.signal)
      try {
        return await fn()
      } catch (e2) {
        if (e2 instanceof LimiteMeta) throw agotarMeta(e2)
        if (e2 instanceof Pausa) throw new Error(`${red} sigue frenando las peticiones. Lo leído ya está guardado: vuelve a intentarlo en un rato.`)
        throw e2
      }
    }
  }

  /**
   * Meta llenó su límite de llamadas (o está por llenarlo): lo que falta de Instagram, cuentas y búsquedas, queda para la
   * vuelta siguiente, con un solo aviso. Buscar Reels que luego no se pueden medir solo gastaría la cuenta de
   * investigación. Devuelve el error, para lanzarlo.
   */
  let metaAgotada = false
  function agotarMeta(e: Error = new LimiteMeta('Meta está por llegar al límite de llamadas de tu Instagram.')) {
    if (metaAgotada) return e
    metaAgotada = true
    sinInstagram('pausa', `${e.message} Dejo lo que falta de Instagram para la próxima vuelta.`, 'Lo ya medido queda guardado. Al investigar otra vez se hacen las búsquedas y cuentas de Instagram que faltan, sin repetir lo medido.')
    return e
  }

  /**
   * Lo que pasa por la cuenta de investigación. Si TikTok pide un captcha, su pestaña se queda al frente y se vuelve a
   * intentar cada 5 s (sin abrir nada mientras se vea) hasta que lo resuelvas.
   */
  async function navegar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof Captcha)) throw e
      ctx.paso('pausa', 'TikTok pide un captcha en la ventana de la cuenta de investigación: resuélvelo y sigo.')
      ctx.avance(hecho, total(), 'Esperando a que resuelvas el captcha de TikTok')
      const hasta = Date.now() + CAPTCHA
      for (;;) {
        await dormir(5000, ctx.signal)
        try {
          return await fn()
        } catch (e2) {
          if (!(e2 instanceof Captcha)) throw e2
          if (Date.now() > hasta) throw new Captcha(`Nadie resolvió el captcha de TikTok en ${CAPTCHA / 60_000} minutos. Lo leído ya está guardado: resuélvelo en la ventana de la cuenta de investigación y vuelve a investigar.`)
        }
      }
    }
  }

  // La pila: primero tus cuentas y tus referencias; las cuentas de cada búsqueda se apilan al hacerla.
  type PorLeer = { red: RedVertical; usuario: string; de: string; propio?: boolean }
  const porLeer: PorLeer[] = []
  const vistos = new Set<string>()
  let saltados = 0
  // Lo leído hace poco no se repite, y sus cuentas cuentan como ya vistas.
  function apilar(c: PorLeer) {
    const antes = inv.canales.find((x) => x.red === c.red && x.de === c.de)
    if (!reciente(antes)) return void porLeer.push(c)
    vistos.add(antes!.id)
    saltados++
  }
  let sinMeta = 0
  if (canal.handle && toca(TU_CANAL)) apilar({ red: 'tiktok', usuario: usuarioDe(canal.handle), de: TU_CANAL, propio: true })
  if (canal.instagram && toca(TU_INSTAGRAM)) {
    if (ctx.meta) apilar({ red: 'instagram', usuario: usuarioDe(canal.instagram), de: TU_INSTAGRAM, propio: true })
    else sinMeta++
  }
  // Cada referencia es su propio origen: si la quitas del perfil, lo que trajo deja de contar.
  for (const r of canal.referencias.filter(toca)) {
    const red = redDeReferencia(r)
    const usuario = usuarioDe(r)
    if (!usuario) continue
    if (red === 'instagram' && !ctx.meta) sinMeta++
    else apilar({ red, usuario, de: r })
  }
  const leidas: Record<RedVertical, number> = { tiktok: 0, instagram: 0 }
  const todos = [
    ...canal.semillas.map((termino) => ({ termino, vecino: false })),
    ...canal.vecinos.filter((v) => !canal.semillas.includes(v)).map((termino) => ({ termino, vecino: true }))
  ].filter((p) => toca(p.termino))
  // Cada frase, en TikTok y en seguida en Instagram. Instagram busca con el token de Meta (sin él no se miden sus cuentas)
  // y con sesión en su cuenta de investigación, que se mira al llegar a su primera búsqueda.
  let instagram = ctx.meta ? undefined : false
  const buscadas = new Map(inv.terminos.map((t) => [clave(t.termino, t.red), t]))
  const busquedas = todos.flatMap((p) => (['tiktok', 'instagram'] as const).map((red) => ({ ...p, red })))
  const repetidas = new Set(busquedas.map((b) => clave(b.termino, b.red)).filter((k) => reciente(buscadas.get(k))))
  const pendientes = busquedas.filter((b) => !repetidas.has(clave(b.termino, b.red)) && (b.red === 'tiktok' || instagram !== false))
  for (const c of inv.canales) if (repetidas.has(clave(c.de, c.red))) vistos.add(c.id)
  const total = () => hecho + porLeer.length + pendientes.length * (1 + POR_TERMINO) + 1
  /** Los Reels de cada búsqueda de Instagram de esta vuelta, para sacar su mediana cuando tengan vistas. */
  const delBuscador = new Map<string, string[]>()
  /** La mediana de una búsqueda de Instagram: la de las vistas de sus Reels que ya las tienen, por su cuenta. */
  const medianaInstagram = (ids: string[]) => mediana(ids.map((id) => videos.get(id)?.vistas ?? 0).filter((v) => v > 0))
  /** Lo que queda de la vuelta, solo con TikTok. */
  function sinInstagram(tipo: 'info' | 'error' | 'pausa', texto: string, detalle?: string) {
    instagram = false
    ctx.paso(tipo, texto, detalle)
    for (let i = pendientes.length - 1; i >= 0; i--) if (pendientes[i].red === 'instagram') pendientes.splice(i, 1)
  }

  const nombre = (c: PorLeer) => `@${c.usuario}${c.propio ? `, tu ${c.red === 'instagram' ? 'Instagram' : 'TikTok'}` : c.red === 'instagram' ? ' en Instagram' : ''}`

  /**
   * Lee una cuenta y mide sus videos contra su mediana. Los fijados no entran en ella (suelen ser viejos y muy vistos), ni
   * los de menos de `MADURO`, que aún juntan vistas, salvo que sin ellos no quede muestra; en Instagram, tampoco los Reels
   * sin vistas, que es que Meta no las dio. Devuelve `true` si la pudo leer, o su error; `callar` no lo avisa (el
   * Instagram de una cuenta de TikTok, que puede no existir).
   */
  async function leerCuenta(c: PorLeer, callar = false, buscados: string[] = []): Promise<true | Error> {
    // Con el límite de Meta lleno, o a punto, ni se intenta: ya se avisó una vez.
    if (c.red === 'instagram' && (metaAgotada || (usoMeta.porcentaje >= 90 && Date.now() - usoMeta.en < 10 * 60_000))) return agotarMeta()
    let d: { nombre: string; seguidores?: number; videos: Hallado[]; anteriores?: Hallado[] }
    try {
      d = c.red === 'instagram' ? await llamar('Instagram', () => cuentaInstagram(c.usuario, ctx.meta, ctx.signal, buscados)) : await llamar('TikTok', () => cuentaTikTok(c.usuario, ctx.signal))
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      if (!callar && !(e instanceof LimiteMeta)) ctx.paso('error', `No pude leer ${nombre(c)}`, (e as Error).message)
      return e as Error
    }
    hecho++
    const id = idDe(c.red, c.usuario)
    vistos.add(id)
    const sinVistas = (h: Hallado) => c.red === 'instagram' && !h.video.vistas
    const normales = d.videos.filter((h) => !h.video.fijado && !sinVistas(h))
    const maduros = normales.filter((h) => !h.video.fecha || ahora - Date.parse(h.video.fecha) >= MADURO)
    const med = mediana((maduros.length >= MIN_MUESTRA ? maduros : normales).map((h) => h.video.vistas))
    const medible = normales.length >= MIN_MUESTRA || !!c.propio
    const antes = inv.canales.find((x) => x.id === id)
    const cuenta: CanalYT = {
      id,
      nombre: d.nombre || c.usuario,
      url: c.red === 'instagram' ? `https://www.instagram.com/${c.usuario}/` : `https://www.tiktok.com/@${c.usuario}`,
      mediana: med,
      videos: normales.length,
      subs: d.seguidores ?? seguidores.get(id) ?? antes?.subs,
      red: c.red,
      usuario: c.usuario,
      de: c.de,
      propio: c.propio || undefined,
      visto: Date.now()
    }
    inv.canales = [...inv.canales.filter((x) => x.id !== id), cuenta]
    for (const h of d.videos) {
      anotar({ ...h.video, canalId: id, x: medible && med && !sinVistas(h) ? h.video.vistas / med : undefined, de: [c.de], visto: Date.now() })
      // Un video que ya no está fijado vuelve a ser uno más.
      if (!h.video.fijado) delete videos.get(h.video.id)!.fijado
      if (h.portada) portadas.set(h.video.id, h.portada)
      if (h.descarga) enlaces.set(h.video.id, h.descarga)
    }
    // Los Reels de la búsqueda que ya no están entre sus últimos: se miden contra la mediana de hoy, sin entrar en ella.
    for (const h of d.anteriores ?? []) {
      anotar({ ...h.video, canalId: id, x: medible && med && !sinVistas(h) ? h.video.vistas / med : undefined, de: [c.de], visto: Date.now() })
      if (h.portada) portadas.set(h.video.id, h.portada)
      if (h.descarga) enlaces.set(h.video.id, h.descarga)
    }
    const idioma = idiomaDeCuenta(d.videos.map((h) => h.video.id))
    if (idioma) cuenta.idioma = idioma
    guardar()
    const outliers = medible && med ? d.videos.filter((h) => esOutlier({ x: h.video.vistas / med, vistas: h.video.vistas, red: c.red })).sort((a, b) => b.video.vistas - a.video.vistas) : []
    const mejor = outliers[0]
    ctx.paso(
      'canal',
      `${nombre(c)} · mediana ${mil(med)} de ${normales.length} videos · ${outliers.length} ${outliers.length === 1 ? 'outlier' : 'outliers'}`,
      !medible
        ? `Solo ${normales.length} videos: muy pocos para medirla.`
        : mejor
          ? `El mejor: «${corto(mejor.video.titulo)}», ${veces(mejor.video.vistas / med)} (${mil(mejor.video.vistas)})`
          : undefined
    )
    return true
  }

  // Tus cuentas y tus referencias.
  const frases = new Set(pendientes.map((b) => b.termino)).size
  const cuantos = `${frases} ${frases === 1 ? 'término' : 'términos'}${porLeer.length ? `, ${porLeer.length} ${porLeer.length === 1 ? 'cuenta conocida' : 'cuentas conocidas'}` : ''}`
  ctx.paso('info', solo ? `Investigo lo que falta de tu perfil: ${cuantos}.` : `Empiezo: ${cuantos}.`)
  if (!ctx.meta)
    ctx.paso(
      'info',
      'Sin el token de Meta, Instagram no se investiga y las frases se buscan solo en TikTok: ⚙ Opciones → Llaves de API.',
      sinMeta ? `Quedan fuera ${sinMeta} ${sinMeta === 1 ? 'cuenta' : 'cuentas'} de Instagram de tu perfil.` : undefined
    )
  if (repetidas.size || saltados)
    ctx.paso(
      'info',
      `No repito lo hecho hace menos de ${RECIENTE / 864e5} días: ${[repetidas.size && `${repetidas.size} ${repetidas.size === 1 ? 'búsqueda' : 'búsquedas'}`, saltados && `${saltados} ${saltados === 1 ? 'cuenta conocida' : 'cuentas conocidas'}`].filter(Boolean).join(' y ')}.`,
      'Lo que encontraron sigue en la investigación.'
    )
  while (porLeer.length) {
    const c = porLeer.shift()!
    ctx.avance(hecho, total(), `Leyendo cuentas · ${c.de}`)
    await leerCuenta(c)
  }

  /**
   * La misma frase en Instagram. Su búsqueda no da vistas: se abren las cuentas de los Reels con más likes con la API de
   * Meta, que solo deja leer las profesionales (las demás se saltan), y al leerlas sus Reels de la búsqueda reciben vistas
   * y `x`. La mediana de la búsqueda sale al final, de los que quedaron con vistas.
   */
  let fallasInstagram = 0
  async function buscarEnInstagram(termino: string, vecino: boolean) {
    ctx.avance(hecho, total(), `Buscando «${termino}» en Instagram${vecino ? ' (nicho vecino)' : ''}`)
    if (instagram === undefined && !(instagram = await hayInstagram(ctx.app).catch(() => false)))
      return sinInstagram('info', 'La cuenta de investigación de Instagram no tiene sesión: las frases se buscan solo en TikTok.', 'Ábrela desde Ideas y entra con la cuenta que solo investiga, nunca con la que publica.')
    let hallados: Hallado[]
    try {
      hallados = await buscarInstagram(ctx.app, termino, ctx.signal)
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      // Sin sesión, o con Instagram pidiendo verificar la cuenta, no se busca más ahí: sigue TikTok.
      if (e instanceof SinSesionInstagram || e instanceof ControlInstagram) return sinInstagram('error', e.message, 'Lo que queda se busca solo en TikTok.')
      ctx.paso('error', `No pude buscar «${termino}» en Instagram`, (e as Error).message)
      if (++fallasInstagram >= 2) sinInstagram('error', 'Dos búsquedas seguidas fallaron en Instagram: lo que queda se busca solo en TikTok.', (e as Error).message)
      return
    }
    fallasInstagram = 0
    hecho++
    const enIngles = idiomaDe(termino) === 'en'
    const t: TerminoYT = {
      termino,
      ...(vecino ? { vecino } : {}),
      red: 'instagram',
      ...(enIngles ? { idioma: 'en' as const } : {}),
      largos: hallados.length,
      mediana: 0,
      ids: hallados.slice(0, 12).map((h) => h.video.id),
      visto: Date.now(),
      cortado: true
    }
    inv.terminos = [...inv.terminos.filter((x) => clave(x.termino, x.red) !== clave(termino, 'instagram')), t]
    delBuscador.set(termino, hallados.map((h) => h.video.id))
    for (const h of hallados) {
      // Sus vistas, si ya se sabían por su cuenta: la búsqueda no las da.
      anotar({ ...h.video, canalId: idDe('instagram', h.video.canalId), vistas: videos.get(h.video.id)?.vistas ?? 0, de: [termino], visto: Date.now() })
      if (h.portada) portadas.set(h.video.id, h.portada)
      if (h.descarga) enlaces.set(h.video.id, h.descarga)
      buscados.add(h.video.id)
    }
    guardar()
    const porLikes = [...hallados].sort((a, b) => (b.video.likes ?? 0) - (a.video.likes ?? 0))
    const top = porLikes[0]
    ctx.paso(
      'buscar',
      `«${termino}»${vecino ? ' (vecino)' : ''} en Instagram · ${hallados.length} Reels`,
      top ? `El de más likes: «${corto(top.video.titulo)}» de ${top.video.canal} (${mil(top.video.likes ?? 0)} likes)` : 'Instagram no tiene Reels para esta búsqueda.'
    )

    const delIdioma = enIngles && porLikes.some((h) => h.video.idioma === 'en') ? porLikes.filter((h) => h.video.idioma === 'en') : porLikes
    const autores = [...new Set(delIdioma.map((h) => h.video.canalId))].filter((u) => !vistos.has(idDe('instagram', u)))
    let medidas = 0
    let intentos = 0
    let noSon = 0
    let cortado = false
    for (const usuario of autores) {
      if (medidas >= POR_TERMINO_INSTAGRAM || intentos >= INTENTOS_INSTAGRAM) break
      const id = idDe('instagram', usuario)
      vistos.add(id)
      const antes = inv.canales.find((c) => c.id === id)
      if (antes && ahora - antes.visto < RECIENTE) {
        for (const v of videos.values()) if (v.canalId === id && !v.de.includes(termino)) v.de = [...v.de, termino]
        if (!actuales.has(antes.de)) antes.de = termino
        ctx.paso('info', `@${usuario} en Instagram: ya la leí hace poco, no la repito.`)
        medidas++
        continue
      }
      if (leidas.instagram >= MAX_CUENTAS_INSTAGRAM) {
        cortado = true
        break
      }
      intentos++
      ctx.avance(hecho, total(), `Leyendo cuentas de Instagram · ${termino}`)
      const suyos = hallados.filter((h) => h.video.canalId === usuario).map((h) => h.video.id)
      const leida = await leerCuenta({ red: 'instagram', usuario, de: termino }, true, suyos)
      if (leida === true) {
        leidas.instagram++
        medidas++
      } else if (leida instanceof NoEsProfesional) noSon++
      else {
        // No es esa cuenta: es el token o Meta, y las siguientes fallarían igual. El límite de Meta ya se avisó.
        if (!(leida instanceof LimiteMeta)) ctx.paso('error', `No pude leer @${usuario} en Instagram`, leida.message)
        cortado = true
        break
      }
    }
    t.mediana = medianaInstagram(delBuscador.get(termino)!)
    if (!cortado) delete t.cortado
    guardar()
    const conVistas = hallados.filter((h) => (videos.get(h.video.id)?.vistas ?? 0) > 0).length
    ctx.paso(
      'info',
      `«${termino}» en Instagram · ${medidas} ${medidas === 1 ? 'cuenta medida' : 'cuentas medidas'} · ${conVistas} de ${hallados.length} Reels con vistas · mediana ${mil(t.mediana)}`,
      noSon ? `${noSon} ${noSon === 1 ? 'cuenta no es profesional' : 'cuentas no son profesionales'}: Meta solo deja leer las de empresa o de creador.` : undefined
    )
  }

  // Cada término, en TikTok y luego en Instagram, y en seguida las cuentas que trae: a fondo en una rama antes de pasar a
  // la siguiente.
  let fallas = 0
  while (pendientes.length) {
    const { termino, vecino, red } = pendientes.shift()!
    if (red === 'instagram') {
      await buscarEnInstagram(termino, vecino)
      continue
    }
    ctx.avance(hecho, total(), `Buscando «${termino}» en TikTok${vecino ? ' (nicho vecino)' : ''}`)
    if (!/\s/.test(termino.trim()))
      ctx.paso('info', `«${termino}» es una sola palabra: trae de todo, también otros públicos.`, 'Mejor una frase como la escribiría tu público: «crecer en tiktok», «editar videos con claude».')
    let hallados: Hallado[]
    try {
      hallados = await navegar(() => buscarTikTok(ctx.app, termino, ctx.signal))
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      // Sin sesión o con el captcha sin resolver no se puede buscar nada más.
      if (e instanceof SinSesionTikTok || e instanceof Captcha) throw e
      ctx.paso('error', `No pude buscar «${termino}»`, (e as Error).message)
      // Si fallan dos seguidas, no es esa búsqueda: TikTok cambió o no responde, y las demás fallarían igual.
      if (++fallas >= 2) throw new Error(`Dos búsquedas seguidas fallaron: ${(e as Error).message} Lo leído ya está guardado.`)
      continue
    }
    fallas = 0
    hecho++
    const porVistas = [...hallados].sort((a, b) => b.video.vistas - a.video.vistas)
    // Queda `cortado` hasta abrir sus cuentas: si algo lo corta antes, la vuelta siguiente la repite.
    const enIngles = idiomaDe(termino) === 'en'
    const t: TerminoYT = {
      termino,
      ...(vecino ? { vecino } : {}),
      red: 'tiktok',
      ...(enIngles ? { idioma: 'en' as const } : {}),
      largos: hallados.length,
      mediana: mediana(hallados.map((h) => h.video.vistas)),
      ids: hallados.slice(0, 12).map((h) => h.video.id),
      visto: Date.now(),
      cortado: true
    }
    inv.terminos = [...inv.terminos.filter((x) => clave(x.termino, x.red) !== clave(termino, 'tiktok')), t]
    for (const h of hallados) {
      anotar({ ...h.video, de: [termino], visto: Date.now() })
      // El idioma de la búsqueda lo da TikTok: manda sobre el que se dedujo al leer la cuenta.
      if (h.video.idioma) videos.get(h.video.id)!.idioma = h.video.idioma
      if (h.portada) portadas.set(h.video.id, h.portada)
      if (h.autor.seguidores !== undefined) seguidores.set(h.video.canalId, h.autor.seguidores)
      buscados.add(h.video.id)
    }
    for (const c of inv.canales) if (c.red === 'tiktok' && seguidores.has(c.id)) c.subs = seguidores.get(c.id)
    guardar()
    const top = porVistas[0]
    ctx.paso(
      'buscar',
      `«${termino}»${vecino ? ' (vecino)' : ''} · ${hallados.length} videos · mediana ${mil(t.mediana)}`,
      top ? `El más visto: «${corto(top.video.titulo)}» de ${top.video.canal} (${mil(top.video.vistas)})` : 'TikTok no tiene videos para esta búsqueda.'
    )

    // De una frase en inglés se abren las cuentas que publican en inglés: TikTok mezcla las de tu país, y esas ya salen
    // buscando en español.
    const delIdioma = enIngles && porVistas.some((h) => h.video.idioma === 'en') ? porVistas.filter((h) => h.video.idioma === 'en') : porVistas
    const autores = [...new Map(delIdioma.map((h) => [h.video.canalId, h])).keys()].filter((id) => !vistos.has(id))
    let cortado = false
    for (const id of autores.slice(0, POR_TERMINO)) {
      vistos.add(id)
      const antes = inv.canales.find((c) => c.id === id)
      if (antes && ahora - antes.visto < RECIENTE) {
        // No se relee, pero también la trajo esta búsqueda, y a su Instagram con ella: sus videos lo dicen, para que
        // cuenten mientras siga en tu perfil. Si la había traído algo que ya quitaste, ahora viene de aquí.
        for (const c of inv.canales.filter((c) => c.id === id || c.id === idDe('instagram', id))) {
          for (const v of videos.values()) if (v.canalId === c.id && !v.de.includes(termino)) v.de = [...v.de, termino]
          if (!actuales.has(c.de)) c.de = termino
        }
        ctx.paso('info', `@${antes.usuario ?? id}: ya la leí hace poco, no la repito.`)
        continue
      }
      if (leidas.tiktok >= MAX_CUENTAS) {
        cortado = true
        break
      }
      leidas.tiktok++
      ctx.avance(hecho, total(), `Leyendo cuentas · ${termino}`)
      if ((await leerCuenta({ red: 'tiktok', usuario: id, de: termino })) !== true) cortado = true
    }
    if (!cortado) delete t.cortado
    guardar()
  }

  // El Instagram de las cuentas de TikTok con outliers, con el mismo usuario y el mismo origen: así se ve si lo que
  // funcionó en una red funcionó también en la otra.
  const propias = () => new Set(inv.canales.filter((c) => c.propio).map((c) => c.id))
  if (ctx.meta && !metaAgotada) {
    const mejorX = new Map<string, number>()
    for (const v of videos.values()) if (v.red === 'tiktok' && esOutlier(v)) mejorX.set(v.canalId, Math.max(mejorX.get(v.canalId) ?? 0, v.x!))
    const gemelas = inv.canales
      .filter((c) => c.red === 'tiktok' && !c.propio && mejorX.has(c.id) && actuales.has(c.de) && toca(c.de) && !reciente(inv.canales.find((x) => x.id === idDe('instagram', c.id))))
      .sort((a, b) => mejorX.get(b.id)! - mejorX.get(a.id)!)
      .slice(0, MAX_INSTAGRAM)
    let halladas = 0
    let probadas = 0
    for (const [i, c] of gemelas.entries()) {
      if (metaAgotada) break
      ctx.avance(hecho, hecho + gemelas.length - i, `Instagram de las mismas cuentas · ${i + 1} de ${gemelas.length}`)
      const r = await leerCuenta({ red: 'instagram', usuario: c.usuario ?? c.id, de: c.de }, true)
      // Lo que cortó el límite de Meta no se sabe si existe: no cuenta como probado.
      if (!(r instanceof LimiteMeta)) probadas++
      if (r === true) halladas++
    }
    if (probadas)
      ctx.paso(
        'info',
        `Instagram de las cuentas de TikTok con outliers: ${halladas} de ${probadas} ${probadas === 1 ? 'está' : 'están'} con el mismo usuario.`,
        halladas < probadas ? 'Las demás no existen con ese usuario o no son cuentas profesionales: Meta solo deja leer esas.' : undefined
      )
  }
  // Una cuenta leída después de su búsqueda de Instagram (por otra frase, o en el cruce) también da vistas a sus Reels.
  if (delBuscador.size) {
    for (const t of inv.terminos) if (t.red === 'instagram' && delBuscador.has(t.termino)) t.mediana = medianaInstagram(delBuscador.get(t.termino)!)
    guardar()
  }

  // Los comentarios con más likes de los mejores outliers de TikTok, solo de lo que trajo tu perfil de hoy: qué le pide
  // la gente a ese video, y si parece orgánico.
  const tuyas = propias()
  const porComentar = [...videos.values()]
    .filter((v) => v.red === 'tiktok' && esOutlier(v) && !tuyas.has(v.canalId) && !v.destacados && v.de.some((d) => actuales.has(d)))
    .sort((a, b) => (b.x ?? 0) - (a.x ?? 0))
    .slice(0, MAX_COMENTARIOS)
  for (const [i, v] of porComentar.entries()) {
    ctx.avance(hecho, hecho + porComentar.length - i, `Comentarios de los mejores outliers · ${i + 1} de ${porComentar.length}`)
    try {
      const destacados = await navegar(() => comentariosTikTok(ctx.app, v.canal, v.id, ctx.signal))
      anotar({ ...v, destacados, leido: Date.now() })
      guardar()
      const primero = destacados[0]
      ctx.paso(
        'comentarios',
        `«${corto(v.titulo)}» · ${veces(v.x ?? 0)} · ${v.canal}`,
        primero ? `El más votado: «${corto(primero.texto, 120)}» (${mil(primero.likes)} likes)` : 'No tiene comentarios que leer.'
      )
    } catch (e) {
      if (e instanceof Detenido || ctx.signal.aborted) throw new Detenido('Detenida')
      if (e instanceof Captcha) throw e
      // Sin términos que buscar, la sesión no hacía falta hasta aquí: sin ella, la investigación sigue sin comentarios.
      if (e instanceof SinSesionTikTok) {
        ctx.paso('error', 'No leo los comentarios de los outliers.', e.message)
        break
      }
      ctx.paso('error', `No pude leer los comentarios de «${corto(v.titulo)}»`, (e as Error).message)
    }
    hecho++
  }

  // Las portadas, para verlas en la sección sin depender de enlaces que caducan: los outliers de tu perfil de hoy, lo
  // primero que enseña cada búsqueda y tus videos.
  const ruta = (id: string) => join(ctx.carpeta, 'portadas', `${id}.jpg`)
  const delPerfil = (v: VideoYT) => v.de.some((d) => actuales.has(d))
  const elegidas = [
    ...[...videos.values()].filter((v) => esOutlier(v) && delPerfil(v)).sort((a, b) => (b.x ?? 0) - (a.x ?? 0)).map((v) => v.id),
    ...inv.terminos.filter((t) => actuales.has(t.termino)).flatMap((t) => t.ids.slice(0, 6)),
    ...[...videos.values()].filter((v) => tuyas.has(v.canalId)).map((v) => v.id)
  ]
  const porBajar = [...new Set(elegidas)].filter((id) => portadas.has(id) && !existsSync(ruta(id))).slice(0, MAX_PORTADAS)
  let bajadas = 0
  for (let i = 0; i < porBajar.length; i += 6) {
    ctx.avance(hecho, hecho + 1, `Portadas · ${i} de ${porBajar.length}`)
    const tanda = await Promise.all(porBajar.slice(i, i + 6).map((id) => bajarPortada(portadas.get(id)!, ruta(id), ctx.signal)))
    bajadas += tanda.filter(Boolean).length
  }
  if (porBajar.length) ctx.paso('info', `Portadas: ${bajadas} nuevas${bajadas < porBajar.length ? `; ${porBajar.length - bajadas} no se pudieron bajar` : ''}.`)

  // Lo medido ya está: si detienes lo que sigue, que es largo, la investigación queda hecha.
  inv.hecha = Date.now()
  guardar()

  // Lo que se dice en todos los videos de tu perfil de hoy (con `solo`, en los de esos orígenes), y luego todos
  // agrupados por tema.
  const deHoy = [...videos.values()].filter(delPerfil)
  const fase = { paso: ctx.paso, avance: ctx.avance, signal: ctx.signal, guardar }
  await transcribirVideos(ctx.carpeta, deHoy.filter((v) => v.de.some(toca)), fase, enlaces, buscados)
  await vectorizar(ctx.carpeta, deHoy, fase)
  guardar()

  const outliers = [...videos.values()].filter(esOutlier)
  ctx.paso('info', `Listo: ${inv.terminos.length} búsquedas, ${inv.canales.length} cuentas y ${outliers.length} outliers en total.`)
  ctx.avance(hecho, hecho, 'Lista')
  return inv
}
