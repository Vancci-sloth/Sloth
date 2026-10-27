import { query } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserContext, Page } from 'playwright-core'
import { huecos, RITMO_VERTICAL, tocaElDia, validarRitmo } from '../../shared/ritmo.ts'
import type { AvisoRedes, Borrador, CalendarioRed, Card, EstadoRitmo, MarcasDeRedes, Publicacion, Red, RedesDelEstilo, RedesEstilo, RedId, Ritmo, ServerPush, TandaRedes, VideoHecho } from '../../shared/types.ts'
import { aLaPapelera, guardar as guardarArchivo, huella } from '../disco.ts'
import { folderOf, servir, videosDe } from '../etapas.ts'
import type { Sessions } from '../sessions.ts'
import { montarNube, nubeAlDia } from './cloudflare.ts'
import { hayNube, instagram } from './instagram.ts'
import { abierto, conGoogle, contextoDeGoogle, deGoogle, deLaApp, desconectar, enGoogle, navegador, pasarDeEdge, pestana, SinSesion, sinAviso, soltar } from './navegador.ts'
import { tiktok } from './tiktok.ts'

/**
 * Publicar en redes: los videos verticales terminados de cada estilo se programan en las redes, uno por hueco del
 * calendario (`Ritmo`, el que eliges en «Mis videos»), con «Programar los que faltan» y un texto que escribe Claude y
 * que se puede cambiar. Lo hecho vive en `data/redes/redes.json`. Cuando todo lo de una carpeta ya salió, se borra de
 * ella lo que se rehace solo (`liberar`), y «Eliminar los que ya se programaron», en «Mis videos», manda esos videos a
 * la Papelera. Quitarlo es borrar esta carpeta, `web/src/Redes.*` y las líneas marcadas «redes».
 */

/** El navegador de las redes, que se abre al pedirlo: las que van por su API no lo piden, y no se abre una ventana de más. */
export type Navegador = () => Promise<BrowserContext>

/** Con quién está abierta la sesión (`null` si no hay) y, si va por un token que caduca, cuándo y si falló al renovarlo. */
export interface Sesion {
  cuenta: string | null
  caduca?: number
  renovacion?: string
}

/**
 * Lo que sabe hacer cada red. Para sumar YouTube: otro archivo como `tiktok.ts` (por su página) o `instagram.ts` (por la
 * nube de Sloth), y añadirlo a `REDES`.
 */
export interface ModuloRed {
  id: RedId
  nombre: string
  /** La página donde se inicia sesión, en el navegador de las redes. Sin ella, la red va por su API y se conecta con `token`. */
  login?: string
  /** Hasta cuántos días antes deja programar la red. Lo que cae más lejos espera en la cola, sin error, hasta que entre. */
  horizonteDias?: number
  /**
   * El video se queda fuera de esta computadora desde el primer intento (Instagram, en la nube de Sloth): reintentarlo o
   * quitarlo no necesita el archivo, y lo que falla se sigue viendo aunque ya lo hayas borrado del disco.
   */
  enLaNube?: boolean
  /** Prueba el token de su API, lo guarda (`null` lo quita) y devuelve con quién quedó la sesión. */
  token?(token: string | null): Promise<string | null>
  cuenta(nav: Navegador): Promise<Sesion>
  /**
   * Sube el video y lo deja programado para `cuando` (`'2026-10-12 16:00'`): de ahí sale solo, con Sloth cerrado. Lanza un
   * error si algo no quedó (`SinSesion` si la red cerró la sesión). `ref` es el nombre de esta publicación, que Sloth
   * guarda antes de subir: si la subida se corta o se pierde la respuesta, el reintento lleva la misma, y la red que la
   * usa (Instagram, en la nube) ve que ya lo tenía en vez de programarlo dos veces. `reintento`: ya hubo un intento con
   * esa `ref`, y pudo llegar a la red aunque Sloth no se enterara. `huella`, la del video que se puso en la cola: en una
   * red `enLaNube`, Sloth no mira el archivo antes de un reintento, y si hay que subirlo otra vez tiene que ser ese. Un
   * error con `captura` (un PNG) guarda lo que se veía en la página al fallar. Si en un reintento ve que ya estaba (en
   * TikTok, con otra hora), devuelve la hora con la que quedó.
   */
  programar(nav: Navegador, p: { ruta: string; huella: string; texto: string; tags: string[]; cuando: string; ref: string; reintento: boolean }): Promise<void | { cuando: string }>
  /** Quita de la red lo que se dejó con esa `ref`. Si falla, Sloth no la olvida: se puede volver a intentar. */
  quitar?(ref: string): Promise<void>
  /**
   * Lo ya programado cambia de hora volviéndolo a programar con su `ref` (`reintento`), sin subir el video otra vez: «Pasar
   * al ritmo nuevo» lo devuelve a la cola con la hora nueva. Sin esto (TikTok), lo que ya está en la red se queda a su hora.
   */
  mueve?: boolean
  /**
   * Lo que pasó después de programarlo, por `ref`: si ya salió o si falló (con su error). La red lo publica sin Sloth, y
   * Sloth se entera al mirar.
   */
  estados?(): Promise<Record<string, { estado: 'publicado' } | { estado: 'error'; error: string }>>
}

const REDES: ModuloRed[] = [tiktok, instagram]
/** Lo más pronto que se programa: las redes piden un margen. */
const MARGEN = 20 * 60000
const DIA = 24 * 3600000
/** Del mismo episodio, de preferencia no más de 2 videos cada 3 días (ver `enOrden`). */
const MISMO = { cuantos: 2, dias: 3 }
/** La carpeta de un video, la de su hilo: lo de antes de su `out/`. */
const carpetaDeVideo = (ruta: string) => ruta.split(/[\\/]out[\\/]/)[0]
/** Lo que ya está en la red: su archivo ya no hace falta allí. */
const SALIO: Publicacion['estado'][] = ['programado', 'publicado']

interface Datos {
  /** El mismo en todas las redes: un video sale a la vez en TikTok y en Instagram. */
  ritmo: Ritmo
  cuentas: Partial<Record<RedId, string | null>>
  estilos: Record<string, RedesDelEstilo>
  publicaciones: Publicacion[]
}

const execFileP = promisify(execFile)
/** El ritmo de redes.json; si falta o no vale, el de siempre. */
function ritmoGuardado(r: Partial<Ritmo> | undefined) {
  try {
    return validarRitmo(r ?? {}, RITMO_VERTICAL)
  } catch {
    return RITMO_VERTICAL
  }
}
const dos = (n: number) => String(n).padStart(2, '0')
const fecha = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`
const enFecha = (s: string) => new Date(s.replace(' ', 'T')).getTime()
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0]
/** Un hashtag como lo quieren las redes: letras, números y guion bajo, sin `#`. */
const limpiarTag = (t: string) => t.replace(/[^\p{L}\p{N}_]/gu, '')

export function redes(app: string, sessions: Sessions, cards: () => Card[], avisar: (msg: ServerPush) => void) {
  const archivo = join(app, 'data', 'redes', 'redes.json')
  const fallos = join(app, 'data', 'redes', 'fallos')
  let datos: Datos = { ritmo: RITMO_VERTICAL, cuentas: {}, estilos: {}, publicaciones: [] }
  // Si redes.json no se puede leer, no se sigue en blanco: todo saldría como sin programar, y se programaría otra vez lo
  // que ya estaba. Nada se programa ni se guarda (el archivo queda como está) hasta que se arregle y se reinicie.
  let roto = ''
  try {
    // Solo lo que se usa: lo de antes (el ritmo de cada red y `sinTexto`, del automático) se queda fuera y desaparece al
    // guardar.
    const { ritmo, cuentas, estilos, publicaciones } = existsSync(archivo) ? JSON.parse(readFileSync(archivo, 'utf8')) : datos
    datos = { ritmo: ritmoGuardado(ritmo), cuentas: cuentas ?? {}, estilos: estilos ?? {}, publicaciones: publicaciones ?? [] }
  } catch (e) {
    roto = `data/redes/redes.json está dañado (${mensaje(e)}). Arréglalo o bórralo y reinicia; mientras, no se programa nada, para no repetir lo que ya estaba.`
    console.error(roto)
  }
  // Una subida que se cortó al reiniciar pudo quedar programada o no: no se repite sola, para no duplicarla.
  for (const p of datos.publicaciones)
    if (p.estado === 'subiendo') Object.assign(p, { estado: 'error', error: 'Se cortó a la mitad: revisa en la red si quedó antes de reintentar.' })

  // Tu nube de Cloudflare, con el Worker de esta versión.
  void nubeAlDia()

  // Cada red tiene su cola, con un video a la vez: Instagram no espera al navegador de TikTok.
  const trabajando = new Set<RedId>()
  // Las que estás conectando en el navegador de la app: no se suelta mientras inicias sesión en él (de `conectar` a `soltar`).
  const iniciando = new Set<RedId>()
  // Las redes que cerraron la sesión: su cola espera hasta que se vuelvan a conectar.
  const sinSesion = new Set<RedId>()
  /** La red de la página de la app, la que se está conectando (tras un reinicio no se sabe: la primera que va por ella). */
  const redDeLaApp = () => REDES.find((r) => r.login && iniciando.has(r.id)) ?? REDES.find((r) => r.login)
  // Antes de que Google diga «el navegador no es seguro»: la página de la app vuelve al login de la red y Google va en
  // Edge, de donde la sesión pasa a la app (en `GET /api/redes`).
  const vigilados = new WeakSet<Page>()
  let yendoAGoogle = false
  function vigilar(page: Page) {
    if (vigilados.has(page)) return
    vigilados.add(page)
    page.on('framenavigated', (f) => f === page.mainFrame() && deGoogle(f.url()) && void aGoogle(page))
  }
  async function aGoogle(page: Page) {
    const login = redDeLaApp()?.login
    if (!login || yendoAGoogle || enGoogle()) return
    yendoAGoogle = true
    await sinAviso(page).then(() => page.goto(login, { waitUntil: 'commit' })).catch(() => {})
    await conGoogle(app, login).catch((e) => console.error('redes: no pude abrir Edge para entrar con Google:', mensaje(e)))
    yendoAGoogle = false
  }
  // Lo que se está quitando de la nube: la cola no lo toma mientras tanto.
  const quitando = new Set<Publicacion>()
  // Las llamadas a Claude para escribir textos que están en marcha.
  let escribiendoTextos = 0
  // Lo que mandaste a programar («Programar los que faltan», «Reintentar»), por huella: cuando ya no trabaja ninguna cola,
  // se avisa una vez de cómo quedó (`acabar`). Lo que la cola sube sola, al entrar en el calendario de su red, no avisa.
  let tanda: Set<string> | null = null

  /** Guarda, y avisa a la interfaz: los videos de un estilo se vuelven a leer y la barra lateral sabe qué falló. */
  function guardar() {
    if (!roto) {
      mkdirSync(dirname(archivo), { recursive: true })
      guardarArchivo(archivo, JSON.stringify(datos, null, 1))
    }
    avisar({ type: 'redes', aviso: aviso() })
  }

  /** Lo que pide atención, para la barra lateral y Opciones → Redes. */
  function aviso(): AvisoRedes {
    const n = new Map<string, number>()
    const sumar = (cardId = '') => n.set(cardId, (n.get(cardId) ?? 0) + 1)
    const sinVideo: Publicacion[] = []
    for (const p of datos.publicaciones) {
      if (p.estado !== 'error' && p.estado !== 'cola' && p.estado !== 'subiendo') continue
      // Lo que se ve en los videos de su estilo, allí. De un archivo borrado o vuelto a exportar ya no hay nada que
      // arreglar, salvo si su video sigue en la nube: eso va a Opciones → Redes.
      if (publicacion(p.red, p.ruta) === p) {
        if (p.estado === 'error') sumar(p.cardId)
      } else if (sinDisco(p)) sinVideo.push(p)
    }
    const titulos = new Map(cards().map((c) => [c.id, c.title]))
    return { fallos: [...n].map(([cardId, n]) => ({ cardId, titulo: titulos.get(cardId) ?? cardId, n })), sinVideo, sinSesion: [...sinSesion], ...(roto ? { roto } : {}) }
  }

  const nav: Navegador = () => navegador(app)
  // Lo de cada estilo, sin lo que dejaron el automático (`auto`, `autoDesde`) y las indicaciones para Claude (`nota`).
  const ajustes = (cardId: string): RedesDelEstilo => ({ tags: datos.estilos[cardId]?.tags ?? [] })
  const conectadas = () => REDES.filter((r) => datos.cuentas[r.id])
  /** Ya tuvo un intento en una red que guarda el video fuera (`enLaNube`): se reintenta o se quita sin el archivo. */
  const sinDisco = (p: Publicacion) => !!p.ref && !!REDES.find((r) => r.id === p.red)?.enLaNube

  /**
   * Lo que se hizo con un video en una red. El video se reconoce por su contenido (`huella`): una copia en otra carpeta es
   * el mismo; otro archivo del mismo tamaño, o una versión nueva en la misma ruta, no (ver
   * `docs/adr/0002-publicar-en-redes-por-el-navegador.md`).
   */
  function publicacion(red: RedId, ruta: string) {
    const h = huella(ruta)
    return h ? datos.publicaciones.find((p) => p.red === red && p.huella === h) : undefined
  }

  /**
   * El video ya está en todas las redes conectadas, y en ninguna (tampoco en una desconectada) espera, sube o falló: su
   * archivo ya no hace falta. Lo descartado no lo pide.
   */
  function yaSalio(ruta: string) {
    const h = huella(ruta)
    const ps = h ? datos.publicaciones.filter((p) => p.huella === h) : []
    const redes = conectadas()
    return !!redes.length && redes.every((r) => ps.some((p) => p.red === r.id && SALIO.includes(p.estado))) && ps.every((p) => SALIO.includes(p.estado) || p.estado === 'descartado')
  }

  /**
   * Hay algo programado de otra versión de este archivo: se volvió a exportar en la misma ruta. Lo descartado no cuenta: no
   * está en la red, y la versión nueva es otro video, que no hereda el descarte.
   */
  function otraVersion(ruta: string) {
    const h = huella(ruta)
    return datos.publicaciones.some((p) => p.ruta === ruta && p.estado !== 'descartado' && p.huella !== h)
  }

  /**
   * El primer hueco libre del calendario de la red, desde ahora más el margen, sin los que ya tomó una tanda (`tomados`):
   * nunca deja uno vacío por delante.
   */
  function hueco(red: RedId, tomados = new Set<string>()): string {
    return huecos(datos.ritmo, 1, [...tomados, ...ocupadas(red)], Date.now() + MARGEN)[0]
  }
  /** Las horas que ya tiene una red, sin lo que falló (`sin`: lo que se va a mover). */
  const ocupadas = (red: RedId, sin = new Set<Publicacion>()) =>
    datos.publicaciones.filter((p) => p.red === red && p.cuando && p.estado !== 'error' && !sin.has(p)).map((p) => p.cuando!)

  /**
   * «Pasar al ritmo nuevo»: lo que aún no sale y se puede mover (lo de la cola; y lo programado en una red que `mueve`, con
   * su hora aún lejos) va, en el mismo orden, a los primeros huecos del ritmo de ahora. Lo demás se queda donde está, y
   * cuenta como ocupado. Devuelve cada una con su hora nueva, y cuántas ya programadas no se pueden mover (`fijas`).
   */
  function reacomodo() {
    const limite = Date.now() + MARGEN
    const cambios: { p: Publicacion; cuando: string }[] = []
    let fijas = 0
    for (const red of conectadas()) {
      const suyas = datos.publicaciones.filter((p) => p.red === red.id && !quitando.has(p))
      const mueven = suyas.filter((p) => p.estado === 'cola' || (p.estado === 'programado' && red.mueve && p.ref && p.cuando && enFecha(p.cuando) >= limite))
      fijas += suyas.filter((p) => p.estado === 'programado' && !red.mueve && p.cuando && enFecha(p.cuando) >= limite).length
      mueven.sort((a, b) => (a.cuando ?? '9').localeCompare(b.cuando ?? '9'))
      const nuevas = huecos(datos.ritmo, mueven.length, ocupadas(red.id, new Set(mueven)), limite)
      mueven.forEach((p, i) => p.cuando !== nuevas[i] && cambios.push({ p, cuando: nuevas[i] }))
    }
    return { cambios, fijas }
  }
  function estadoRitmo(): EstadoRitmo {
    const { cambios, fijas } = reacomodo()
    return { ritmo: datos.ritmo, conectada: conectadas().length > 0, cambian: cambios.length, fijas }
  }

  /**
   * En qué orden van a los huecos los videos que mandaste juntos. Los de un episodio, en su orden (el episodio entero y
   * luego sus cortes 1, 2, 3…); y cada hueco, para el primero cuyo episodio no lleve ya `MISMO.cuantos` en `MISMO.dias`
   * (cuatro de Photoshop en tres días cansaron). Si todos los llevan, va el del episodio que menos lleva: no se deja un
   * hueco vacío.
   */
  function enOrden(red: RedId, bs: Borrador[]): { b: Borrador; cuando: string }[] {
    const episodios = [...new Set(bs.map((b) => carpetaDeVideo(b.ruta)))]
    const faltan = [...bs].sort((a, b) => episodios.indexOf(carpetaDeVideo(a.ruta)) - episodios.indexOf(carpetaDeVideo(b.ruta)) || a.ruta.localeCompare(b.ruta, 'es', { numeric: true }))
    const horas = datos.publicaciones.filter((p) => p.red === red && p.cuando && p.estado !== 'error').map((p) => ({ carpeta: carpetaDeVideo(p.ruta), t: enFecha(p.cuando!) }))
    const salida: { b: Borrador; cuando: string }[] = []
    const ocupados = new Set<string>()
    while (faltan.length) {
      const cuando = hueco(red, ocupados)
      const t = enFecha(cuando)
      const cerca = faltan.map((b) => horas.filter((x) => x.carpeta === carpetaDeVideo(b.ruta) && Math.abs(x.t - t) < MISMO.dias * DIA).length)
      const i = cerca.findIndex((n) => n < MISMO.cuantos)
      const [b] = faltan.splice(i >= 0 ? i : cerca.indexOf(Math.min(...cerca)), 1)
      ocupados.add(cuando)
      horas.push({ carpeta: carpetaDeVideo(b.ruta), t })
      salida.push({ b, cuando })
    }
    return salida
  }

  // Si el video es vertical se pregunta una vez por archivo y versión.
  const formas = new Map<string, Promise<boolean>>()
  function vertical(ruta: string, t: number) {
    const clave = `${ruta}|${t}`
    if (!formas.has(clave))
      formas.set(
        clave,
        execFileP('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', ruta]).then(
          ({ stdout }) => {
            const [w, h] = stdout.trim().split(',').map(Number)
            return h > w
          },
          () => false
        )
      )
    return formas.get(clave)!
  }

  /**
   * El calendario de cada red conectada, de hoy al último día con algo: los videos de cada día, con su hora y su estado
   * (lo que espera en la cola ya tiene su hora; la interfaz sabe cuáles ya salieron), y el primer hueco libre, donde va el
   * siguiente que programes.
   */
  function calendario(): CalendarioRed[] {
    const hoy = fecha(new Date()).slice(0, 10)
    return conectadas().map((r) => {
      const porDia = new Map<string, CalendarioRed['dias'][number]['videos']>()
      for (const p of datos.publicaciones)
        if (p.red === r.id && p.cuando && p.cuando >= hoy && p.estado !== 'error' && p.estado !== 'descartado')
          porDia.set(p.cuando.slice(0, 10), [...(porDia.get(p.cuando.slice(0, 10)) ?? []), { cuando: p.cuando, estado: p.estado }])
      const ultimo = [...porDia.keys()].sort().pop()
      const dias: CalendarioRed['dias'] = []
      for (const d = new Date(); ultimo; d.setDate(d.getDate() + 1)) {
        const dia = fecha(d).slice(0, 10)
        if (dia > ultimo) break
        // Los días que no tocan, solo si tienen algo (de un ritmo de antes).
        if (!tocaElDia(datos.ritmo, dia) && !porDia.has(dia)) continue
        dias.push({ dia, videos: (porDia.get(dia) ?? []).sort((a, b) => a.cuando.localeCompare(b.cuando)) })
      }
      return { red: r.id, porDia: datos.ritmo.porDia, dias, siguiente: hueco(r.id) }
    })
  }

  async function verticales(videos: VideoHecho[]) {
    const si = await Promise.all(videos.map((v) => vertical(v.ruta, v.t)))
    return videos.filter((_, i) => si[i])
  }
  const verticalesDe = (card: Card) => verticales(videosDe(card, sessions))

  /**
   * Las marcas de redes de unos videos terminados, de la lista que ya tiene quien las pide: los videos de un estilo y «Mis
   * videos» (`GET /api/videos`, en `server/etapas.ts`), que así no recorre el disco otra vez.
   */
  async function marcas(videos: VideoHecho[]): Promise<MarcasDeRedes> {
    // Sin esperar a la nube: si algo cambió, el aviso por el WebSocket hace que la vista lo vuelva a pedir.
    sincronizar().catch((err) => console.error('redes:', mensaje(err)))
    const suyos = await verticales(videos)
    const publicaciones: Record<string, Publicacion[]> = {}
    const otra: string[] = []
    for (const v of suyos) {
      const ps = REDES.map((r) => publicacion(r.id, v.ruta)).filter((p) => !!p)
      if (ps.length) publicaciones[v.ruta] = ps
      if (otraVersion(v.ruta)) otra.push(v.ruta)
    }
    return {
      verticales: suyos.map((v) => v.ruta),
      publicaciones,
      redes: conectadas().map((r) => r.id),
      otraVersion: otra,
      programados: suyos.filter((v) => yaSalio(v.ruta)).map((v) => v.ruta),
      enNavegador: datos.publicaciones.some((p) => p.estado === 'subiendo' && !!REDES.find((r) => r.id === p.red)?.login) || undefined,
      calendario: calendario()
    }
  }

  /**
   * El texto de un video: el mismo que lleva en otra red; si no, uno que escribe Claude con lo que hay en su carpeta: el
   * guion, el plan de cortes, sus notas. Los hashtags fijos del estilo van primero.
   */
  async function borrador(card: Card, ruta: string): Promise<Borrador> {
    const a = ajustes(card.id)
    // Si ya va a otra red, va el mismo texto: el video es el mismo.
    const otra = REDES.map((r) => publicacion(r.id, ruta)).find((p) => p?.texto)
    if (otra) return { ruta, texto: otra.texto, tags: unirTags(a.tags, otra.tags) }
    const partes = ruta.split(`${sep}out${sep}`)
    const carpeta = partes.length > 1 ? partes[0] : dirname(ruta)
    // Primero lo que mejor dice de qué trata el video; luego lo demás, de lo más corto a lo más largo.
    const primero = ['short.json', 'shorts.json', 'redes.json', 'guion.md', 'shorts.md']
    const rango = (f: string) => (primero.includes(f) ? primero.indexOf(f) : primero.length)
    const textos = readdirSync(carpeta)
      .filter((f) => /\.(md|json|txt)$/.test(f) && !/^(package|package-lock|tsconfig|sloth)\.json$/.test(f))
      .map((f) => ({ f, n: tamano(join(carpeta, f)) }))
      .sort((x, y) => rango(x.f) - rango(y.f) || x.n - y.n)
    let contexto = ''
    for (const { f } of textos) {
      if (contexto.length > 30000) break
      contexto += `\n\n===== ${f} =====\n${readFileSync(join(carpeta, f), 'utf8').slice(0, 15000)}`
    }
    const prompt = [
      `Escribe la descripción de un video vertical para redes (TikTok, Shorts, Reels), en español de México, para el canal del usuario.`,
      `El video es \`${relative(carpeta, ruta).replaceAll('\\', '/')}\`, del estilo «${card.title}». Abajo van los archivos de su carpeta.`,
      `Si es uno de varios cortes de un episodio (por ejemplo \`out/redes/2-algo.mp4\`), habla solo de ese corte; \`out/el-diff-final.mp4\` (o \`out/redes/0-completo.mp4\`, en los de antes) es el episodio entero.`,
      ``,
      `- Una o dos frases cortas (menos de 200 caracteres) con el planteamiento y su giro completos, sin guardarte el giro para el video (en una noticia: quién prometió o hizo qué, y cómo le salió al revés). No inventes nada que no esté en los archivos.`,
      `- Que lo entienda alguien que no sigue la tecnología: nombra lo que la gente conoce (Photoshop, Call of Duty, ElevenLabs) y nada de jerga («DNS», «throughput», «prefijo»). Lo que mejor funcionó: «Pidió frenar a los hackers de IA que metieron patinetas en Call of Duty. El hacker era él.»`,
      `- Sin hashtags en el texto, sin emojis de relleno y sin «en este video».`,
      `- Aparte, de 2 a 4 hashtags del tema, sin # ni espacios (por ejemplo: IA, Claude, Photoshop).`,
      ``,
      `Responde solo con JSON: {"texto": "…", "tags": ["…"]}`,
      contexto
    ].join('\n')
    let salida = ''
    escribiendoTextos++
    try {
      for await (const m of query({ prompt, options: { model: 'sonnet', tools: [], maxTurns: 1, settingSources: [], persistSession: false, cwd: carpeta } }))
        if (m.type === 'result' && m.subtype === 'success') salida = m.result
    } finally {
      escribiendoTextos--
    }
    const json = JSON.parse(/\{[\s\S]*\}/.exec(salida)?.[0] ?? 'null') as { texto?: string; tags?: string[] } | null
    if (!json?.texto) throw new Error('Claude no devolvió el texto.')
    return { ruta, texto: json.texto.trim(), tags: unirTags(a.tags, json.tags ?? []) }
  }

  /**
   * Pone en la cola de una red un video con su texto, a la hora que le tocó (`enOrden`). Lo que ya estaba en esa red y
   * falló se cambia por este.
   */
  function encolar(card: Card, b: Borrador, red: RedId, cuando: string) {
    const previa = publicacion(red, b.ruta)
    if (previa) olvidar(previa)
    const tags = unirTags([], b.tags)
    const h = huella(b.ruta)
    // Con la `ref` del intento que falló: si había llegado a la red, el reintento lo encuentra en vez de duplicarlo.
    datos.publicaciones.push({ red, cardId: card.id, ruta: b.ruta, huella: h, texto: b.texto.trim(), tags, cuando, estado: 'cola', t: Date.now(), ...(previa?.ref ? { ref: previa.ref } : {}) })
    ;(tanda ??= new Set()).add(h)
  }

  /** Borra el registro de una publicación, con su captura. */
  function olvidar(p: Publicacion) {
    soltarCaptura(p)
    datos.publicaciones.splice(datos.publicaciones.indexOf(p), 1)
  }

  /** Guarda lo que se veía en la página de la red al fallar (`data/redes/fallos/<fecha>.png`): el error lo enlaza. */
  function capturar(p: Publicacion, e: unknown) {
    soltarCaptura(p)
    const png = (e as { captura?: Buffer } | null)?.captura
    if (!png) return
    try {
      const d = new Date()
      const nombre = `${fecha(d).replace(/[ :]/g, '-')}-${dos(d.getSeconds())}.png`
      mkdirSync(fallos, { recursive: true })
      writeFileSync(join(fallos, nombre), png)
      p.captura = nombre
    } catch (err) {
      console.error('redes: no pude guardar la captura del fallo:', mensaje(err))
    }
  }
  function soltarCaptura(p: Publicacion) {
    if (p.captura) rmSync(join(fallos, p.captura), { force: true })
    delete p.captura
  }

  /** El siguiente de la cola de una red: el primero cuya hora ya se puede programar en ella. */
  function siguiente(red: ModuloRed) {
    if (sinSesion.has(red.id)) return
    for (const p of datos.publicaciones) {
      if (p.red !== red.id || p.estado !== 'cola' || quitando.has(p)) continue
      // Una hora que ya pasó (o está por pasar) se cambia por el siguiente hueco libre.
      if (!p.cuando || enFecha(p.cuando) < Date.now() + MARGEN) p.cuando = hueco(red.id)
      if (!red.horizonteDias || enFecha(p.cuando) <= Date.now() + red.horizonteDias * DIA) return p
    }
  }

  // Las colas: un video a la vez en cada red. En las del navegador, con un respiro entre uno y otro, como lo haría una
  // persona. Lo que aún no cabe en el horizonte de su red lo toma una vuelta posterior (cada pocos minutos, abajo).
  function seguir() {
    if (roto) return
    for (const red of REDES) if (!trabajando.has(red.id)) void cola(red)
  }
  async function cola(red: ModuloRed) {
    trabajando.add(red.id)
    let subidos = 0
    let otraVuelta = false
    try {
      for (let p = siguiente(red); p; p = siguiente(red)) {
        // Lo que cambió desde que entró en la cola no se sube: su texto era de la otra versión, y puede estar a medio escribir.
        // Lo que ya está en la nube no necesita el archivo: si hay que subirlo otra vez, lo mira el módulo.
        if (!sinDisco(p) && huella(p.ruta) !== p.huella) {
          Object.assign(p, { estado: 'error', error: 'El video cambió (o ya no está) después de ponerlo en la cola: no se subió.', t: Date.now() })
          guardar()
          continue
        }
        const reintento = !!p.ref
        p.ref ??= randomUUID()
        p.estado = 'subiendo'
        subidos++
        guardar()
        try {
          const ya = await red.programar(nav, { ruta: p.ruta, huella: p.huella, texto: p.texto, tags: p.tags, cuando: p.cuando!, ref: p.ref, reintento })
          if (ya) p.cuando = ya.cuando
          p.estado = 'programado'
          delete p.error
          soltarCaptura(p)
          const card = cards().find((c) => c.id === p!.cardId)
          if (card) limpiar(card)
        } catch (e) {
          if (e instanceof SinSesion) {
            // No es un fallo del video: vuelve a la cola, y la red espera a que la conectes otra vez.
            p.estado = 'cola'
            sinSesion.add(red.id)
          } else {
            p.estado = 'error'
            p.error = mensaje(e)
            capturar(p, e)
          }
        }
        p.t = Date.now()
        guardar()
        if (red.login && !sinSesion.has(red.id) && siguiente(red)) await pausa(20000 + Math.random() * 20000)
      }
      // Acabó: el navegador se cierra solo si nadie lo usa. Lo que entró en la cola mientras se cerraba, sigue.
      if (red.login && subidos) await soltar().catch((e) => console.error('redes: no pude cerrar el navegador:', mensaje(e)))
      otraVuelta = !!siguiente(red)
    } finally {
      trabajando.delete(red.id)
      if (otraVuelta) void cola(red)
      else acabar()
    }
  }

  /** Ya no trabaja ninguna cola: si mandaste algo a programar, avisa cómo quedó, por video (en todas sus redes). */
  function acabar() {
    if (trabajando.size || !tanda) return
    const acabo: TandaRedes = { bien: 0, fallaron: 0, esperan: 0, redes: conectadas().map((r) => r.id) }
    for (const h of tanda) {
      const ps = datos.publicaciones.filter((p) => p.huella === h)
      if (ps.some((p) => p.estado === 'error')) acabo.fallaron++
      else if (ps.some((p) => p.estado === 'cola' || p.estado === 'subiendo')) acabo.esperan++
      else if (ps.some((p) => SALIO.includes(p.estado))) acabo.bien++
    }
    tanda = null
    if (acabo.bien || acabo.fallaron || acabo.esperan) avisar({ type: 'redes', aviso: aviso(), acabo })
  }

  /**
   * Lo que la red hizo con lo programado: lo que ya salió pasa a «publicado», y lo que falló, a «Falló» con su error. Se
   * pregunta a lo más una vez por minuto, y solo a las redes que tienen algo programado.
   */
  let sincronizado = 0
  async function sincronizar() {
    if (roto || Date.now() - sincronizado < 60000) return
    sincronizado = Date.now()
    let cambio = false
    for (const r of REDES) {
      const programadas = datos.publicaciones.filter((p) => p.red === r.id && p.estado === 'programado' && p.ref)
      if (!r.estados || !programadas.length) continue
      const estados = await r.estados().catch(() => null)
      for (const p of programadas) {
        const e = estados?.[p.ref!]
        if (e) Object.assign(p, e, { t: Date.now() }), (cambio = true)
      }
    }
    if (cambio) guardar()
  }

  // Cada pocos minutos: las colas (lo que antes no cabía en el horizonte de su red) y lo que pasó en la nube, para que un
  // fallo se vea en la barra lateral aunque no estés mirando el estilo.
  setInterval(() => {
    if (roto) return
    seguir()
    sincronizar().catch((e) => console.error('redes:', mensaje(e)))
  }, 3 * 60000)

  /**
   * Libera espacio en las carpetas de video que ya salieron: cuando todos los videos verticales de una carpeta (de primer
   * nivel dentro del `cwd` de su estilo) están programados o publicados en todas las redes conectadas, borra de ella lo
   * que se rehace solo (`regenerables`). Nunca con un agente trabajando en ese estilo. Corre al programar y al arrancar,
   * una vuelta detrás de otra.
   */
  let limpieza = Promise.resolve()
  function limpiar(card: Card) {
    limpieza = limpieza.then(() => liberar(card)).catch((e) => console.error('redes: no pude liberar espacio:', mensaje(e)))
  }
  const mismaRuta = (a: string, b: string) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
  const trabajaEn = (card: Card) => sessions.list().some((s) => (s.cardId === card.id || mismaRuta(s.cwd, card.cwd)) && (s.running || !!s.background?.length))
  /**
   * Un hilo de un estilo de video trabaja (o dejó algo en marcha) en la carpeta de ese archivo. Los de la card Sloth no
   * cuentan: trabajan en el repo, que tiene dentro `trabajo/`, y bloquearían todos los videos.
   */
  function enUso(ruta: string) {
    const estilos = new Set(cards().filter((c) => c.etapas?.length).map((c) => c.id))
    return sessions.list().some((s) => {
      const rel = relative(resolve(folderOf(s)), ruta)
      return estilos.has(s.cardId) && (s.running || !!s.background?.length) && !rel.startsWith('..') && !isAbsolute(rel)
    })
  }
  async function liberar(card: Card) {
    const redes = conectadas()
    if (roto || !redes.length || !card.etapas || trabajaEn(card)) return
    const cwd = resolve(card.cwd)
    const carpetas = new Map<string, string[]>()
    for (const v of await verticalesDe(card)) {
      const rel = relative(cwd, v.ruta)
      if (rel.startsWith('..') || isAbsolute(rel) || !rel.includes(sep)) continue
      const carpeta = join(cwd, rel.split(sep)[0])
      carpetas.set(carpeta, [...(carpetas.get(carpeta) ?? []), v.ruta])
    }
    for (const [carpeta, videos] of carpetas) {
      if (!videos.every(yaSalio)) continue
      let bytes = 0
      const borradas: string[] = []
      for (const dir of regenerables(carpeta)) {
        const n = peso(dir)
        // Con un enlace dentro no se toca: podría llevar a algo que no se rehace. Y si alguien empezó a trabajar, se para.
        if (n === null) continue
        if (trabajaEn(card)) return
        await rm(dir, { recursive: true, force: true })
        bytes += n
        borradas.push(relative(carpeta, dir).replaceAll('\\', '/'))
      }
      if (borradas.length) console.log(`redes: liberé ${legible(bytes)} en ${carpeta} (${borradas.join(', ')}): ya salió en ${redes.map((r) => r.nombre).join(' y ')}.`)
    }
  }

  seguir()
  // Lo que ya estaba programado de antes.
  for (const card of cards()) limpiar(card)

  /** Si hay algo de redes a medias que un reinicio cortaría, por qué: «Reiniciar backend» espera a que termine. */
  function ocupado(): string | null {
    const p = datos.publicaciones.find((x) => x.estado === 'subiendo')
    if (p) return `Se está subiendo un video a ${REDES.find((r) => r.id === p.red)?.nombre ?? p.red}. Espera a que termine.`
    if (escribiendoTextos) return 'Claude está escribiendo el texto de un video para redes. Espera a que termine.'
    if (enGoogle()) return 'Estás iniciando sesión con Google en Edge. Espera a que termine.'
    return null
  }

  async function body<T>(req: IncomingMessage): Promise<T> {
    let text = ''
    for await (const chunk of req) text += chunk
    return (text ? JSON.parse(text) : {}) as T
  }
  function json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(data))
    return true
  }

  /** Las rutas `/api/redes/…`. Devuelve si atendió la petición. */
  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname
    if (!path.startsWith('/api/redes')) return false
    const post = req.method === 'POST'

    // Lo que pide atención, para la barra lateral. También con redes.json dañado: eso es lo primero que hay que ver.
    if (path === '/api/redes/aviso' && !post) return json(res, 200, aviso())
    // La captura de un fallo, para verla desde su error. Solo sirve lo de `data/redes/fallos`.
    const f = /^\/api\/redes\/fallos\/([\w-]+\.png)$/.exec(path)
    if (f && !post) {
      const file = resolve(fallos, f[1])
      if (!file.startsWith(resolve(fallos) + sep)) return json(res, 403, { error: 'Fuera de la carpeta' })
      return servir(req, res, file)
    }
    if (roto) return json(res, 500, { error: roto })
    // El calendario de cada red conectada, para Opciones → Redes.
    if (path === '/api/redes/calendario' && !post) return json(res, 200, calendario())

    // Las redes, con su cuenta. Las que van por su API se miran siempre; las del navegador, si está abierto (si no, vale
    // la última que se vio). El de la app siempre lo está.
    if (path === '/api/redes' && !post) {
      const conVentana = await abierto()
      // Entraste con Google en Edge: su sesión pasa a la app, y Edge se cierra.
      const g = enGoogle() ? redDeLaApp() : undefined
      if (g?.login) {
        const s = await g.cuenta(async () => contextoDeGoogle()).catch(() => null)
        if (s?.cuenta && (sinSesion.has(g.id) || s.cuenta !== datos.cuentas[g.id]))
          await pasarDeEdge(app, g.login).catch((e) => console.error('redes: no pude pasar la sesión de Edge a la app:', mensaje(e)))
      }
      const sesiones: Partial<Record<RedId, Sesion>> = {}
      for (const r of REDES) {
        if (r.login && !conVentana) continue
        const s = await r.cuenta(nav).catch(() => null)
        if (!s) continue
        sesiones[r.id] = s
        // Una red del navegador que tenía cuenta y ya no, perdió la sesión. Al volver, su cola sigue.
        if (s.cuenta) sinSesion.delete(r.id)
        else if (r.login && datos.cuentas[r.id]) sinSesion.add(r.id)
        datos.cuentas[r.id] = s.cuenta
      }
      guardar()
      seguir()
      // Si la página de la app ya está en Google (el servidor se reinició mientras conectabas), se lleva a Edge.
      const pagina = deLaApp() ? (await nav().catch(() => null))?.pages()[0] : undefined
      if (pagina) {
        vigilar(pagina)
        if (deGoogle(pagina.url())) void aGoogle(pagina)
      }
      // En la app, mirar la sesión no abre nada: después se suelta, salvo si sube algo o estás iniciando sesión.
      if (REDES.every((r) => !r.login || (!trabajando.has(r.id) && !iniciando.has(r.id)))) await desconectar()
      return json(
        res,
        200,
        REDES.map((r): Red => ({
          id: r.id,
          nombre: r.nombre,
          cuenta: datos.cuentas[r.id] ?? null,
          ritmo: datos.ritmo,
          token: !!r.token,
          sinSesion: sinSesion.has(r.id),
          enEdge: (enGoogle() && redDeLaApp() === r) || undefined,
          sinNube: (r.enLaNube && !hayNube()) || undefined,
          caduca: sesiones[r.id]?.caduca,
          renovacion: sesiones[r.id]?.renovacion
        }))
      )
    }

    // Montar la nube en tu cuenta de Cloudflare, con un token tuyo.
    if (path === '/api/redes/nube' && post) {
      const { token } = await body<{ token?: string }>(req)
      if (!token?.trim()) return json(res, 400, { error: 'Pega el token de Cloudflare.' })
      try {
        return json(res, 200, { url: await montarNube(token) })
      } catch (err) {
        return json(res, 400, { error: mensaje(err) })
      }
    }

    const r = /^\/api\/redes\/(\w+)\/(conectar|soltar|token)$/.exec(path)
    const red = r && REDES.find((x) => x.id === r[1])
    const que = r?.[2]
    if (red?.token && post && que === 'token') {
      const { token } = await body<{ token: string | null }>(req)
      try {
        datos.cuentas[red.id] = await red.token(token?.trim() || null)
      } catch (err) {
        return json(res, 400, { error: mensaje(err) })
      }
      guardar()
      seguir()
      return json(res, 200, { cuenta: datos.cuentas[red.id] })
    }
    if (red?.login && post && que === 'conectar') {
      const login = red.login
      const ctx = await navegador(app, login)
      if (!ctx.pages().some((p) => p.url().startsWith(login))) await (await pestana(ctx)).goto(login, { waitUntil: 'commit' })
      if (deLaApp()) {
        iniciando.add(red.id)
        vigilar(await pestana(ctx))
      }
      return json(res, 200, { ok: true, enLaApp: deLaApp() })
    }
    // Acabaste de conectarla en el navegador de la app: se suelta, salvo si está subiendo algo.
    if (red?.login && post && que === 'soltar') {
      iniciando.delete(red.id)
      if (deLaApp() && !trabajando.has(red.id)) await navegador(app).then(soltar, () => {})
      return json(res, 200, { ok: true })
    }

    const e = /^\/api\/redes\/estilos\/([\w-]+)$/.exec(path)
    const card = e && cards().find((c) => c.id === e[1])
    if (e && !card) return json(res, 404, { error: 'No existe ese estilo' })
    if (card && !post) return json(res, 200, { ajustes: ajustes(card.id), ...(await marcas(videosDe(card, sessions))) } satisfies RedesEstilo)
    if (card && post) {
      const cambio = await body<Partial<RedesDelEstilo>>(req)
      const a = ajustes(card.id)
      datos.estilos[card.id] = { tags: cambio.tags ? unirTags(cambio.tags, []) : a.tags }
      guardar()
      return json(res, 200, datos.estilos[card.id])
    }

    // El ritmo, en «Mis videos». Guardarlo vale para lo que programes después; lo que ya tiene hora se mueve solo con
    // «Pasar al ritmo nuevo» (`reacomodar`), que es aparte para que sea a propósito.
    if (path === '/api/redes/ritmo' && !post) return json(res, 200, estadoRitmo())
    if (path === '/api/redes/ritmo' && post) {
      try {
        datos.ritmo = validarRitmo(await body<Partial<Ritmo>>(req), datos.ritmo)
      } catch (err) {
        return json(res, 400, { error: mensaje(err) })
      }
      guardar()
      return json(res, 200, estadoRitmo())
    }
    // Lo programado que ya está en la red (Instagram) vuelve a la cola con su `ref`: la cola le cambia la hora allí.
    if (path === '/api/redes/reacomodar' && post) {
      const { cambios } = reacomodo()
      for (const { p, cuando } of cambios) Object.assign(p, { cuando, estado: 'cola', t: Date.now() })
      guardar()
      seguir()
      return json(res, 200, { ...estadoRitmo(), movidas: cambios.length })
    }

    // Los textos que propone Claude, para revisarlos antes de programar.
    if (path === '/api/redes/borradores' && post) {
      const { cardId, rutas } = await body<{ cardId: string; rutas: string[] }>(req)
      const card = cards().find((c) => c.id === cardId)
      if (!card) return json(res, 404, { error: 'No existe ese estilo' })
      const validas = new Set(videosDe(card, sessions).map((v) => v.ruta))
      const salida: (Borrador | { ruta: string; error: string })[] = []
      // De tres en tres, para no tardar uno por uno.
      for (let i = 0; i < rutas.length; i += 3)
        salida.push(
          ...(await Promise.all(
            rutas.slice(i, i + 3).map((ruta) => (validas.has(ruta) ? borrador(card, ruta) : Promise.reject(new Error('No es un video de este estilo'))).catch((err) => ({ ruta, error: mensaje(err) })))
          ))
        )
      return json(res, 200, salida)
    }

    if (path === '/api/redes/programar' && post) {
      const { cardId, borradores } = await body<{ cardId: string; borradores: Borrador[] }>(req)
      const card = cards().find((c) => c.id === cardId)
      if (!card) return json(res, 404, { error: 'No existe ese estilo' })
      const redes = conectadas()
      if (!redes.length) return json(res, 400, { error: 'Conecta una red en Opciones antes de programar.' })
      const validas = new Set(videosDe(card, sessions).map((v) => v.ruta))
      const buenos = borradores.filter((b) => validas.has(b.ruta) && b.texto.trim())
      for (const r of redes) {
        // Solo lo que no está en esa red, o falló: lo que descartaste no vuelve.
        const faltan = buenos.filter((b) => {
          const previa = publicacion(r.id, b.ruta)
          return !previa || previa.estado === 'error'
        })
        for (const { b, cuando } of enOrden(r.id, faltan)) encolar(card, b, r.id, cuando)
      }
      guardar()
      seguir()
      return json(res, 200, { ok: true })
    }

    // «Eliminar los que ya se programaron», en «Mis videos»: esos archivos van a la Papelera; en las redes no cambia nada.
    // Solo videos terminados de un estilo que ya salieron, y no los de una carpeta donde trabaja un agente.
    if (path === '/api/redes/eliminar' && post) {
      const { rutas } = await body<{ rutas: string[] }>(req)
      const videos = new Set(cards().flatMap((c) => (c.etapas?.length ? videosDe(c, sessions).map((v) => v.ruta) : [])))
      const listas = rutas.filter((r) => videos.has(r) && yaSalio(r) && !enUso(r))
      const siguen = await aLaPapelera(listas)
      avisar({ type: 'redes', aviso: aviso() })
      return json(res, 200, { borrados: listas.length - siguen.length, quedan: rutas.length - listas.length + siguen.length })
    }

    // Una que falló vuelve a la cola, con hueco nuevo. Una que espera en la cola, o que falló, se puede quitar: queda
    // descartada, con su huella, para que «Programar los que faltan» no la vuelva a proponer. Deshacerlo es olvidarla:
    // vuelve a faltar en esa red.
    const q = /^\/api\/redes\/(reintentar|quitar|deshacer)$/.exec(path)
    if (q && post) {
      const { ruta, red, ref } = await body<{ ruta: string; red: RedId; ref?: string }>(req)
      // Con `ref`, esa publicación aunque su archivo ya no esté; sin ella, la del video que hay ahora en esa ruta.
      const p = ref ? datos.publicaciones.find((x) => x.red === red && x.ref === ref) : publicacion(red, ruta)
      if (q[1] === 'deshacer') {
        if (p?.estado !== 'descartado') return json(res, 404, { error: 'Ese video no está descartado' })
        olvidar(p)
        guardar()
        return json(res, 200, { ok: true })
      }
      if (!p || (p.estado !== 'error' && p.estado !== 'cola') || quitando.has(p)) return json(res, 404, { error: 'Ese video no está en la cola ni falló' })
      if (q[1] === 'quitar') {
        // Lo que ya llegó a la red se quita también de ahí antes de olvidar su `ref`. Si no se puede, se queda para reintentarlo.
        const modulo = REDES.find((x) => x.id === p.red)!
        if (p.ref && modulo.quitar) {
          quitando.add(p)
          try {
            await modulo.quitar(p.ref)
          } catch (err) {
            return json(res, 502, { error: `No pude quitarlo de ${modulo.nombre}: ${mensaje(err)}` })
          } finally {
            quitando.delete(p)
          }
        }
        // Sin hora, para que su hueco quede libre.
        soltarCaptura(p)
        Object.assign(p, { estado: 'descartado', cuando: undefined, ref: undefined, error: undefined, t: Date.now() })
      } else {
        Object.assign(p, { estado: 'cola', cuando: hueco(p.red), error: undefined, t: Date.now() })
        ;(tanda ??= new Set()).add(p.huella)
      }
      guardar()
      seguir()
      return json(res, 200, { ok: true })
    }

    return false
  }

  // Para «Mis videos». Con redes.json dañado, ninguna: todo saldría «Sin programar».
  return { api, ocupado, marcas: async (videos: VideoHecho[]) => (roto ? undefined : marcas(videos)) }
}

function tamano(ruta: string) {
  try {
    return statSync(ruta).size
  } catch {
    return -1
  }
}

/**
 * Lo que se rehace solo en una carpeta de video, y nada más: `out/partes` y `out/redes/partes` (los tramos del episodio
 * y de los cortes de El Diff, que `final.py` y `redes.py` vuelven a hacer si faltan) y cada `_bundle_rev` dentro de
 * `out` (el bundle de las revisiones de los episodios de antes). Ni la carpeta ni su `out` pueden ser un enlace, y
 * dentro no se sigue ninguno.
 */
function regenerables(carpeta: string): string[] {
  const out = join(carpeta, 'out')
  const hallados: string[] = []
  const mirar = (dir: string) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      // Un enlace (en Windows, también una junction) no cuenta como carpeta: ni se mira dentro ni se borra.
      if (!d.isDirectory()) continue
      const ruta = join(dir, d.name)
      if (d.name === '_bundle_rev' || (d.name === 'partes' && (dir === out || dir === join(out, 'redes')))) hallados.push(ruta)
      else if (d.name !== 'node_modules') mirar(ruta)
    }
  }
  try {
    if (lstatSync(carpeta).isDirectory() && lstatSync(out).isDirectory()) mirar(out)
  } catch {
    return []
  }
  return hallados
}

/** Lo que pesan los archivos de una carpeta, o `null` si dentro hay un enlace. */
function peso(dir: string): number | null {
  let n = 0
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isSymbolicLink()) return null
    const p = d.isDirectory() ? peso(join(dir, d.name)) : statSync(join(dir, d.name)).size
    if (p === null) return null
    n += p
  }
  return n
}

/** `1288490188` → `1,2 GB`. */
const legible = (bytes: number) => (bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 2 ** 20)} MB`)

/** Junta hashtags sin repetir (sin importar mayúsculas), en orden: primero los fijos. */
function unirTags(fijos: string[], otros: string[]) {
  const vistos = new Set<string>()
  return [...fijos, ...otros].map(limpiarTag).filter((t) => t && !vistos.has(t.toLowerCase()) && vistos.add(t.toLowerCase()))
}
