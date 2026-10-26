import type { Canal, CanalYT, Card, Investigacion, VideoYT } from './types.ts'

/**
 * Los hilos de la sección Ideas (`server/ideas/`) no son de ninguna card: trabajan en la carpeta de un canal con la skill
 * `ideas-youtube`. Esta card no sale en el inicio: les da su icono, y sus etapas son las que la sección enseña mientras
 * Claude propone (`Ideas.tsx`). Lo que dejan se ve en la sección, no en el hilo.
 */
export const IDEAS_CARD: Card = {
  id: 'ideas',
  title: 'Ideas',
  description: 'Ideas de video con su evidencia, desde la investigación de un canal (YouTube, o TikTok e Instagram).',
  skill: 'ideas-youtube',
  icon: '💡',
  cwd: '',
  etapas: [
    { nombre: 'Demanda', listo: 'demanda.md', muestra: 'demanda.md' },
    { nombre: 'Formatos', listo: 'formatos.md', muestra: 'formatos.md' },
    { nombre: 'Ideas', listo: 'ideas.json', muestra: 'ideas.json' },
    { nombre: 'Para grabar', listo: 'esquema-*.md', muestra: 'esquema-*.md' }
  ]
}

/**
 * La entrevista que arma el perfil de un canal cuando el usuario no sabe qué poner: la misma skill, en la misma carpeta.
 * Lo que va dejando es `canal.json`, que se ve en la sección.
 */
export const CANAL_CARD: Card = {
  id: 'ideas-canal',
  title: 'Tu canal',
  description: 'Preguntas para saber a quién le habla tu canal y qué busca tu público.',
  skill: 'ideas-youtube',
  icon: '💡',
  cwd: ''
}

/** La skill de un canal vertical (TikTok e Instagram). Los hilos son los mismos (`IDEAS_CARD`, `CANAL_CARD`); cambia la skill. */
export const SKILL_VERTICAL = 'ideas-vertical'
export const esVertical = (c: Pick<Canal, 'formato'> | null | undefined) => c?.formato === 'vertical'
export const skillDe = (c: Pick<Canal, 'formato'>) => (esVertical(c) ? SKILL_VERTICAL : IDEAS_CARD.skill!)

/** Un video largo dura 4 minutos o más: los shorts son otro juego. Vale igual en las búsquedas y en la mediana del canal. */
export const LARGO = 240
export const esLargo = (v: Pick<VideoYT, 'segundos'>) => (v.segundos ?? 0) >= LARGO
/** Si un video entra en la mediana de su canal y se mide: en YouTube, los largos; en TikTok e Instagram, todos. */
export const cuenta = (v: Pick<VideoYT, 'segundos' | 'red'>) => !!v.red || esLargo(v)

/** Un canal se mide con al menos estos videos largos entre los últimos que se leen: con menos, su mediana es un azar. */
export const MIN_MUESTRA = 8
export const medible = (c: Pick<CanalYT, 'videos' | 'propio'>) => !!c.propio || c.videos >= MIN_MUESTRA

/** Un video es outlier si saca esto o más veces la mediana de su canal… */
export const OUTLIER = 3
/**
 * …y al menos estas vistas. Con una mediana diminuta todo parece outlier: en un canal que saca 1 vista, uno con 3 ya es
 * «3×»; en TEDx, que sube muchas charlas al día, sus últimos 30 videos tienen de 5 a 57 vistas. Eso es ruido, no demanda.
 */
export const MIN_VISTAS = 1000

/**
 * En TikTok e Instagram, mil vistas es lo que saca cualquier video al salir: un outlier ahí necesita al menos esto. En la
 * primera búsqueda de «crear videos con ia», los primeros resultados iban de 41 mil a un millón.
 */
export const MIN_VISTAS_VERTICAL = 10_000
/**
 * Un video vertical sigue juntando vistas durante días: con menos de esto no entra en la mediana de su cuenta (la bajaría),
 * aunque sí puede ser outlier si ya la pasó.
 */
export const MADURO = 3 * 864e5

/** Con `x` sin redondear: 2,96 no es outlier, aunque al pintarlo con un decimal pareciera 3. */
export const esOutlier = (v: Pick<VideoYT, 'x' | 'vistas' | 'red'>) => (v.x ?? 0) >= OUTLIER && v.vistas >= (v.red ? MIN_VISTAS_VERTICAL : MIN_VISTAS)

/** `x` para leerlo: un decimal, cortado y no redondeado, para que 2,96 no se lea como el 3 que no alcanzó. */
export const veces = (x: number) => `${Math.floor(x * 10) / 10}×`

/** Comentarios por cada mil vistas. */
export const porMil = (v: Pick<VideoYT, 'vistas' | 'comentarios'>) => (v.comentarios === undefined || !v.vistas ? undefined : (v.comentarios / v.vistas) * 1000)
/**
 * Guardados y compartidos por cada mil vistas. Guardar es «esto lo voy a usar», lo más cercano a querer comprar;
 * compartir, «esto es para alguien». En TikTok e Instagram dicen más que las vistas de si el video sirve para vender.
 */
export const guardadosPorMil = (v: Pick<VideoYT, 'vistas' | 'guardados'>) => (v.guardados === undefined || !v.vistas ? undefined : (v.guardados / v.vistas) * 1000)
export const compartidosPorMil = (v: Pick<VideoYT, 'vistas' | 'compartidos'>) => (v.compartidos === undefined || !v.vistas ? undefined : (v.compartidos / v.vistas) * 1000)

/**
 * Una referencia de un canal vertical: `instagram.com/cuenta` (o `ig:@cuenta`) es de Instagram; lo demás (`@cuenta`,
 * `tiktok.com/@cuenta`), de TikTok.
 */
export const redDeReferencia = (ref: string): 'tiktok' | 'instagram' => (/instagram\.com\/|^ig:/i.test(ref.trim()) ? 'instagram' : 'tiktok')
/** El usuario de una referencia o un handle, sin `@` y en minúsculas: `https://www.tiktok.com/@Tu.Cuenta?lang=es` → `tu.cuenta`. */
export function usuarioDe(ref: string): string {
  const r = ref.trim().replace(/^ig:/i, '')
  const m = /(?:tiktok\.com\/@|instagram\.com\/)([\w.]+)/i.exec(r)
  return (m ? m[1] : r.replace(/^@/, '').replace(/[/?#].*$/, '')).toLowerCase()
}
/** Palabras que casi solo salen en un idioma: bastan para decir si una frase o una descripción es español o inglés. */
const PALABRAS: Record<'es' | 'en' | 'pt', Set<string>> = {
  es: new Set('que de la el los las con para por una uno como cómo qué esto este esta tu tus mi mis sin más pero hacer hice crear gratis dinero vídeos hoy así aquí también ia contenido negocio negocios canal crecer editar herramientas consejos'.split(' ')),
  en: new Set('the and to how with for this that you your my is are of make made free money today here what why best new get from without ai generator channel content creator business editing tools tips grow'.split(' ')),
  // El portugués comparte acentos y muchas palabras con el español: solo cuentan las que no tiene el español.
  pt: new Set('você vocês não mais muito isso isto também uma um com seu sua seus suas aqui agora fazer criar dinheiro conteúdo vídeo grátis então porque quando onde ainda já tem são está estão vai'.split(' '))
}

/**
 * El idioma de un texto, `'es'`, `'en'` o `'pt'`, o `undefined` si no se sabe (solo hashtags, muy corto, u otro idioma).
 * Cuenta palabras de cada lista (IA es español; AI, inglés) y los acentos, la ñ y los signos de apertura, que son del
 * español; la ã, la õ y la ç, del portugués, que sin eso se contaba como español (un tema de 143 videos, 2026-10-11).
 * Es tosco a propósito: la búsqueda de TikTok ya trae el idioma de cada video; esto es para lo que no lo trae (yt-dlp,
 * Instagram, tus frases).
 */
export function idiomaDe(texto: string): 'es' | 'en' | 'pt' | undefined {
  const sinTags = texto.replace(/[#@][\p{L}\p{N}_.]+/gu, ' ').toLowerCase()
  const palabras = sinTags.match(/\p{L}+/gu) ?? []
  let pt = (sinTags.match(/[ãõç]|ção|ções/g) ?? []).length
  let es = (sinTags.match(/[ñ¿¡]/g) ?? []).length
  let en = 0
  for (const p of palabras) {
    // Las que comparten el español y el portugués («com», «uma» no; «que», «para» sí) cuentan para el español.
    if (PALABRAS.pt.has(p) && !PALABRAS.es.has(p)) pt++
    else if (PALABRAS.es.has(p)) es++
    if (PALABRAS.en.has(p)) en++
  }
  // Los acentos que comparten (á, é, í, ó, ú) solo dicen español si nada apunta al portugués.
  if (!pt) es += (sinTags.match(/[áéíóú]/g) ?? []).length
  const max = Math.max(es, en, pt)
  if (!max || [es, en, pt].filter((n) => n === max).length > 1) return undefined
  return max === pt ? 'pt' : max === es ? 'es' : 'en'
}

/** Dónde ver un video vertical: su `url`, o su página armada con la cuenta y el id. */
export const urlVertical = (v: Pick<VideoYT, 'id' | 'url' | 'canal' | 'red'>) =>
  v.url ?? (v.red === 'instagram' ? `https://www.instagram.com/reel/${v.id}/` : `https://www.tiktok.com/@${v.canal.replace(/^@/, '')}/video/${v.id}`)

/**
 * Muchas vistas con casi ningún comentario. Puede ser publicidad pagada, o un canal con los comentarios cerrados: es una
 * señal para mirar el video, no una prueba. 7,2 millones de vistas con 52 comentarios dan 0,007 por mil, y 219 mil con 7,
 * 0,03; un video orgánico anda entre 0,4 y 30 por mil.
 */
export const sospechoso = (v: Pick<VideoYT, 'vistas' | 'comentarios'>) => v.vistas >= 50_000 && (porMil(v) ?? Infinity) < 0.15

/** En temas que caducan (IA, tecnología), lo de hace más de un año vale poco. Sin fecha no se sabe: `undefined`. */
export const viejo = (fecha?: string, hoy = Date.now()) => (fecha ? hoy - new Date(fecha).getTime() > 365 * 864e5 : undefined)

/**
 * El origen (`de`) de lo que se lee del canal del usuario (en un canal vertical, su TikTok). Los demás orígenes son un
 * término o una referencia, tal cual.
 */
export const TU_CANAL = 'tu canal'
/** El origen de lo que se lee de tu Instagram, en un canal vertical. */
export const TU_INSTAGRAM = 'tu instagram'

/** De dónde puede salir lo que cuenta hoy: los términos, los vecinos y las referencias de `canal.json`, y tus cuentas. */
export const origenes = (c: Canal) =>
  new Set([...c.semillas, ...c.vecinos, ...c.referencias, ...(c.handle ? [TU_CANAL] : []), ...(esVertical(c) && c.instagram ? [TU_INSTAGRAM] : [])])

/**
 * La investigación como la ve el perfil de hoy. `investigacion.json` lo guarda todo, también lo que trajo un término o
 * una referencia que ya quitaste; eso no cuenta, ni en el resumen ni en la sección. Un video cuenta si alguno de sus
 * orígenes sigue en el perfil, y lleva solo esos; un canal, si lo trajo algo del perfil o tiene videos que cuentan, y
 * entonces dice de cuál.
 */
export function alPerfil(inv: Investigacion, c: Canal): Investigacion {
  const o = origenes(c)
  const terminos = new Set([...c.semillas, ...c.vecinos])
  const videos = inv.videos.flatMap((v) => {
    const de = v.de.filter((d) => o.has(d))
    return !de.length ? [] : de.length === v.de.length ? [v] : [{ ...v, de }]
  })
  const deDonde = new Map<string, string>()
  for (const v of videos) if (!deDonde.has(v.canalId)) deDonde.set(v.canalId, v.de[0])
  return {
    ...inv,
    // Un término que pasó de vecino a semilla, o al revés, se cuenta como está hoy.
    terminos: inv.terminos.filter((t) => terminos.has(t.termino)).map((t) => ({ ...t, vecino: !c.semillas.includes(t.termino) || undefined })),
    canales: inv.canales.filter((x) => o.has(x.de) || deDonde.has(x.id)).map((x) => (o.has(x.de) ? x : { ...x, de: deDonde.get(x.id)! })),
    videos
  }
}

/** Lo del perfil que la investigación aún no tiene: términos que nunca se buscaron, referencias y tu canal sin leer. */
export function sinInvestigar(inv: Investigacion | null, c: Canal): string[] {
  const buscados = new Set(inv?.terminos.map((t) => t.termino))
  const leidos = new Set(inv?.canales.map((x) => x.de))
  // Tu canal de YouTube se reconoce por `propio`; en uno vertical, cada cuenta tuya por su origen.
  const propio = esVertical(c) ? leidos.has(TU_CANAL) : inv?.canales.some((x) => x.propio)
  return [...new Set([...c.semillas, ...c.vecinos])]
    .filter((t) => !buscados.has(t))
    .concat(c.referencias.filter((r) => !leidos.has(r)), c.handle && !propio ? [TU_CANAL] : [], esVertical(c) && c.instagram && !leidos.has(TU_INSTAGRAM) ? [TU_INSTAGRAM] : [])
}
