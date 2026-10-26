import {
  alPerfil,
  compartidosPorMil,
  cuenta,
  esOutlier,
  esVertical,
  guardadosPorMil,
  LARGO,
  MADURO,
  medible,
  MIN_MUESTRA,
  MIN_VISTAS,
  MIN_VISTAS_VERTICAL,
  OUTLIER,
  porMil,
  sinInvestigar,
  sospechoso,
  veces,
  viejo
} from '../../shared/ideas.ts'
import type { Canal, Investigacion, Temas, VideoYT } from '../../shared/types.ts'

/**
 * Lo que el resumen lee fuera de `investigacion.json`, si existe: el texto entero de cada transcripción
 * (`transcripciones/<id>.json`, para lo que se dice en cualquier parte del video) y los temas (`temas.json`).
 */
export interface Extra {
  textos?: Map<string, string>
  temas?: Temas | null
}

/**
 * Lo que la skill `ideas-youtube` sacaba a mano de `investigacion.json` en cada vuelta (medianas, outliers por búsqueda y
 * por canal, fechas, comentarios, el éxito de cada fórmula de título) es una cuenta: aquí se hace una vez y se deja en
 * `resumen.json`. Claude lo lee primero y abre la investigación entera solo si le falta algo.
 */

export const mediana = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export const mil = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(Math.round(n)))

/**
 * `x` de cada video medido, con sus vistas y la mediana de su canal de ahora: si la API da sus vistas al día o el canal se
 * vuelve a leer, cambia. Un video corto de YouTube, o de un canal sin muestra suficiente, no lleva `x`; en TikTok e
 * Instagram cuentan todos (`cuenta`).
 */
export function medir(inv: Investigacion) {
  const canales = new Map(inv.canales.map((c) => [c.id, c]))
  for (const v of inv.videos) {
    if (v.x === undefined) continue
    const c = canales.get(v.canalId)
    if (c && medible(c) && c.mediana > 0 && cuenta(v)) v.x = v.vistas / c.mediana
    else delete v.x
  }
}

/**
 * Candidatos a fórmula de título por su patrón, los de METODO.md y los que Claude buscaba a mano. Un patrón es tosco
 * («cómo» también sale en «así es cómo…»): dice dónde mirar, y Claude revisa los títulos antes de citar una tasa.
 */
const FORMULAS: [string, RegExp][] = [
  ['Dame N minutos / en N minutos', /(?<!\p{L})dame \d+|(?<!\p{L})(en|in) \d+ min|\d+ minutos/iu],
  ['Si empezara hoy / lo que haría', /(?<!\p{L})si (empezara|tuviera que empezar|volviera a empezar|empiezo|comenzara)|lo que (yo )?(har[ií]a|aprender[ií]a)|if i (started|had to start|were starting)|what i would do/iu],
  ['Hice / probé / creé, en primera persona', /^(hice|prob[eé]|cre[eé]|gast[eé]|invert[ií]|sub[ií]|intent[eé]|constru[ií]|desarroll[eé]|he (creado|probado|hecho|construido|usado))(?!\p{L})|^i (made|tried|built|spent|tested|created)(?!\p{L})/iu],
  ['Reto con reloj: en N días u horas', /(?<!\p{L})(en|durante|in|for) \d+ (d[ií]as|horas|semanas|days|hours|weeks)(?!\p{L})|(?<!\d)24 ?(horas|hours|h)(?!\p{L})/iu],
  ['Cambio: nuevas reglas, nueva era, acaba de', /(?<!\p{L})(nuevas? (reglas|era|estrategia|forma|manera)|new (rules|era|way)|para siempre|acaba de|just (changed|killed|replaced|dropped|launched)|forever|cambi[oó] todo|changes everything)(?!\p{L})/iu],
  ['X reemplaza a Y: despedir, destruir, jubilar', /(?<!\p{L})(reemplaz|despid|desped[ií]|destru|jubil|replac|fired|kill)/iu],
  ['Curso, guía completa, desde cero', /(?<!\p{L})(curso|gu[ií]a (completa|definitiva|para principiantes)|tutorial completo|desde cero|de cero a|principiantes|full course|beginners?|from scratch|masterclass)(?!\p{L})/iu],
  ['Cómo… (tutorial)', /^(c[oó]mo|how to) /iu],
  ['Lista: N herramientas, consejos, errores', /(?<!\p{L})\d+ (herramientas|consejos|errores|trucos|ideas|formas|maneras|pasos|claves|apps|aplicaciones|h[aá]bitos|cosas|tools|tips|mistakes|ways|habits|things)(?!\p{L})/iu],
  ['Dinero: ganar $, al mes', /\$ ?\d|\d ?(\$|usd|d[oó]lares|euros)|(?<!\p{L})(ganar dinero|gan[eé]|gano|al mes|ingresos|facturar|make money|per month|a month)(?!\p{L})/iu],
  ['Sin…: sin cara, sin experiencia, gratis', /(?<!\p{L})(sin (mostrar|saber|experiencia|programar|cara|rostro|invertir|dinero|editar|c[oó]digo)|gratis|free|faceless|without)(?!\p{L})/iu],
  ['Mírame hacer…', /(?<!\p{L})(m[ií]rame|watch me)(?!\p{L})/iu],
  ['Honestidad: la verdad, nadie te dice', /(?<!\p{L})(honest|brutal|la verdad|nadie te (dice|cuenta)|nobody (tells|talks)|the truth)/iu],
  ['X vs Y', /(?<!\p{L})(vs\.?|versus)(?!\p{L})/iu],
  ['Pregunta en el título', /\?/u]
]

/**
 * Tipos de gancho dicho, sobre `gancho` (lo que se dice al principio, de la transcripción): los de las 4 P y los
 * que se repiten en vertical. Con `entero`, el patrón se busca en toda la transcripción: «comenta X» suele ir al final.
 * Como las fórmulas de título, es tosco: dice dónde mirar, y Claude lee las transcripciones antes de citar una tasa.
 */
const GANCHOS: [string, RegExp, boolean?][] = [
  ['Pregunta', /\?/u],
  ['Cifra o número', /\d/u],
  ['Dinero: $, ganar, al mes', /\$ ?\d|\d ?(\$|usd|d[oó]lares|pesos|euros)|(?<!\p{L})(ganar dinero|gan[eé]|gano|ganas|al mes|ingresos|facturar|make money|made \$|per month|a month)(?!\p{L})/iu],
  ['Condición: si…, si eres…', /^(y )?(si|if)(?!\p{L})/iu],
  ['Advertencia: deja de, no hagas, error', /(?<!\p{L})(deja de|dejen de|no hagas|no uses|no cometas|nunca|error(es)?|cuidado|stop|don'?t|do not|never|mistakes?)(?!\p{L})/iu],
  ['Así se hace / cómo / te enseño', /(?<!\p{L})(as[ií] (es como|se)|c[oó]mo (hacer|crear|se|puedes|lograr)|te (enseño|muestro|explico)|paso a paso|how to|here'?s how|this is how|step by step|let me show)(?!\p{L})/iu],
  ['Experiencia propia: hice, probé, gasté', /(?<!\p{L})(hice|prob[eé]|gast[eé]|cre[eé]|constru[ií]|intent[eé]|us[eé]|ped[ií]|le ped[ií]|i (made|tried|spent|built|tested|used|asked))(?!\p{L})/iu],
  ['Lista: N herramientas, pasos, formas', /(?<!\p{L})(\d+|dos|tres|cuatro|cinco|siete|diez|two|three|four|five|seven|ten) (herramientas|apps|aplicaciones|formas|maneras|pasos|cosas|trucos|ideas|errores|prompts|tools|ways|steps|things|tips|hacks|mistakes|prompts)(?!\p{L})/iu],
  ['Novedad: acaba de, nuevo, ya salió', /(?<!\p{L})(acaba(n)? de|nuev[oa]s?|ya sali[oó]|lanz[oó]|just (launched|dropped|released|came out)|brand new|new)(?!\p{L})/iu],
  ['Secreto: nadie te dice, la verdad', /(?<!\p{L})(nadie (te )?(dice|cuenta|habla)|secreto|la verdad|no quieren que sepas|nobody (tells|talks)|no one (tells|talks)|secret|the truth)(?!\p{L})/iu],
  ['Le habla a alguien: tú, si eres', /^(tú|tu|oye|ey|hey|you|si eres|if you('| a)re)(?!\p{L})/iu],
  ['Pide comentar: comenta X (en todo el video)', /(?<!\p{L})(comenta|comentan|com[eé]ntame|escr[ií]be(me|lo)? en (los )?comentarios|d[eé]jame (un|en los) coment|comment|dm me)(?!\p{L})/iu, true]
]

/** Lo que dice un video al principio, en una línea: `dice: «…»`, o `sin voz`. Sin transcribir, nada. */
const dice = (v: VideoYT, largo = 140) => (v.sinVoz ? 'sin voz' : v.gancho ? `dice: «${v.gancho.replace(/\s+/g, ' ').trim().slice(0, largo)}${v.gancho.length > largo ? '…' : ''}»` : undefined)

/**
 * Los ganchos dichos de unos videos comparables, como `formulas`: por tipo, cuántos, cuántos pasan su mediana, cuántos
 * son outliers y en cuántos canales o cuentas, con los mejores y los peores. Solo los transcritos con voz.
 */
function ganchosDe(comparables: VideoYT[], textos: Map<string, string> | undefined, ver: (v: VideoYT) => string, en: 'canales' | 'cuentas') {
  const porX = (a: VideoYT, b: VideoYT) => (b.x ?? 0) - (a.x ?? 0)
  const conVoz = comparables.filter((v) => v.gancho && !v.sinVoz)
  return GANCHOS.map(([gancho, patron, entero]) => {
    const m = conVoz.filter((v) => patron.test(entero ? (textos?.get(v.id) ?? v.gancho!) : v.gancho!)).sort(porX)
    return {
      gancho,
      videos: m.length,
      pasan: m.filter((v) => v.x! > 1).length,
      outliers: m.filter(esOutlier).length,
      [en]: new Set(m.map((v) => v.canalId)).size,
      mejores: m.slice(0, 3).map(ver),
      // Dónde falló: si solo se miran los éxitos, cualquier gancho parece bueno.
      peores: m.length > 3 ? m.slice(-2).map(ver) : undefined
    }
  })
    .filter((g) => g.videos)
    .sort((a, b) => b.videos - a.videos)
}

/**
 * Los temas de `temas.json` con su evidencia contada en la investigación de hoy: cuántos videos, cuántos medidos y cuántos
 * pasan su mediana, cuántos outliers, en qué redes e idiomas, sus mejores outliers y sus ejemplos.
 */
function temasDe(temas: Temas | null | undefined, videos: Map<string, VideoYT>, buenos: Set<string>, fil: (v: VideoYT) => string, lin: (v: VideoYT) => string) {
  if (!temas?.temas.length) return undefined
  const porX = (a: VideoYT, b: VideoYT) => (b.x ?? 0) - (a.x ?? 0)
  const contar = (vs: VideoYT[], f: (v: VideoYT) => string | undefined) => {
    const n: Record<string, number> = {}
    for (const v of vs) {
      const k = f(v)
      if (k) n[k] = (n[k] ?? 0) + 1
    }
    return n
  }
  return temas.temas
    .map((t) => {
      const vs = t.ids.map((id) => videos.get(id)).filter((v): v is VideoYT => !!v)
      if (!vs.length) return null
      const medidos = vs.filter((v) => v.x !== undefined && v.vistas > 0)
      const out = vs.filter((v) => buenos.has(v.id)).sort(porX)
      return {
        tema: t.nombre,
        videos: vs.length,
        medidos: medidos.length,
        pasanSuMediana: pct(medidos.filter((v) => v.x! > 1).length, medidos.length),
        outliers: out.length,
        redes: contar(vs, (v) => v.red ?? 'youtube'),
        idiomas: vs.some((v) => v.idioma) ? contar(vs, (v) => v.idioma) : undefined,
        mejores: out.slice(0, 3).map(fil),
        ejemplos: t.ejemplos
          .map((id) => videos.get(id))
          .filter((v): v is VideoYT => !!v)
          .slice(0, 3)
          .map(lin)
      }
    })
    .filter((t) => !!t)
    .sort((a, b) => b.outliers - a.outliers || b.videos - a.videos)
}

/** Lo que dice la transcripción, y cómo se cuentan los ganchos y los temas: igual en YouTube y en vertical. */
const CRITERIOS_LO_DICHO = {
  transcripciones:
    'Lo que se dice en cada video está entero en transcripciones/<id>.json (léelo con Read): de los subtítulos en YouTube, del audio con Whisper en TikTok e Instagram. Cada outlier termina en «dice: «…»» (su gancho dicho) o en «sin voz» (música o solo texto: su gancho está en la imagen, que la transcripción no ve). Lo que se ve en pantalla no está.',
  ganchos:
    'Tipos de gancho dicho, sobre lo que se dice al principio (3 s en vertical, 30 s en YouTube; «pide comentar», en todo el video), en los videos comparables transcritos con voz. pasan: x > 1. Compara con muestra.pasanSuMediana: un tipo solo destaca si pasa claro de esa base. El patrón es tosco: lee las transcripciones antes de citar una tasa.',
  temas:
    'Los videos agrupados por lo que dicen (título o descripción y transcripción, en vectores de un modelo multilingüe local): un tema junta lo que habla de lo mismo aunque use otras palabras u otro idioma. El nombre son sus palabras más distintivas, no un título: decide tú qué tema es. pasanSuMediana y outliers, como en muestra.'
}

/** Un video en una línea: «título» · canal · 1.2 M vistas · 4.3× · 2026-09. */
const linea = (v: VideoYT) => [`«${v.titulo}»`, v.canal, `${mil(v.vistas)} vistas`, v.x !== undefined ? veces(v.x) : 'sin medir', v.fecha?.slice(0, 7)].filter(Boolean).join(' · ')

/**
 * Un outlier en una línea, con lo que decide si cuenta: id · 4.3× · 925 mil vistas · 34 min · 2026-09-14 · 1.2 com/mil ·
 * canal · «título» · y de qué otras búsquedas salió, aparte de la que lo lista (`aqui`) · y lo que dice al principio.
 */
function fila(v: VideoYT, hoy: number, aqui?: string) {
  const pm = porMil(v)
  const otras = v.de.filter((d) => d !== aqui)
  return [
    v.id,
    veces(v.x ?? 0),
    `${mil(v.vistas)} vistas`,
    v.segundos && `${Math.round(v.segundos / 60)} min`,
    (v.fecha ?? (v.leido ? 'YouTube ya no lo tiene' : 'sin leer')) + (viejo(v.fecha, hoy) ? ', viejo' : ''),
    pm !== undefined && `${pm.toFixed(pm < 1 ? 3 : 1)} com/mil`,
    v.canal.trim(),
    `«${v.titulo}»`,
    otras.length > 0 && `${aqui ? 'también de' : 'de'}: ${otras.join(', ')}`,
    dice(v, 220)
  ]
    .filter(Boolean)
    .join(' · ')
}

const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 100)} %` : '—')

/**
 * `resumen.json`: lo que Claude necesita de la investigación para proponer, ya contado. Solo con lo que trajo el perfil
 * de hoy (`alPerfil`): lo de un término que quitaste no es la demanda de tu público.
 */
export function resumir(toda: Investigacion, canal: Canal, hoy = Date.now(), extra: Extra = {}) {
  if (esVertical(canal)) return resumirVertical(toda, canal, hoy, extra)
  const inv = alPerfil(toda, canal)
  const faltan = sinInvestigar(toda, canal)
  const videos = new Map(inv.videos.map((v) => [v.id, v]))
  const canales = new Map(inv.canales.map((c) => [c.id, c]))
  const propio = inv.canales.find((c) => c.propio)
  const porX = (a: VideoYT, b: VideoYT) => (b.x ?? 0) - (a.x ?? 0)
  const medidos = inv.videos.filter((v) => v.x !== undefined)
  const outliers = inv.videos.filter((v) => esOutlier(v) && !canales.get(v.canalId)?.propio).sort(porX)
  const buenos = outliers.filter((v) => !sospechoso(v))
  const bajos = outliers.filter(sospechoso)
  // Cada outlier va con la búsqueda que lo trajo, que casi siempre es un tema; los de tus referencias, aparte.
  const terminos = new Set(inv.terminos.map((t) => t.termino))
  const otros = [...new Set(buenos.flatMap((v) => v.de).filter((d) => !terminos.has(d)))]
  const de = (origen: string) => buenos.filter((v) => v.de.includes(origen)).map((v) => fila(v, hoy, origen))
  const dia = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : undefined)
  // Las fórmulas se miden en los demás canales, y no en los de mediana diminuta, donde cualquier cosa «pasa».
  const comparables = medidos.filter((v) => !canales.get(v.canalId)?.propio && (canales.get(v.canalId)?.mediana ?? 0) >= 100)

  return {
    generado: dia(hoy),
    investigacion: dia(inv.hecha),
    criterios: {
      perfil:
        'Solo cuenta lo que trajeron los términos, vecinos y referencias que hoy tiene canal.json, y tu canal. investigacion.json guarda también lo que salió de lo que ya se quitó del perfil: si lo consultas, cuenta solo los videos cuyo `de` nombre algo de canal.json.',
      largo: `Solo videos de ${LARGO / 60} min o más, en las búsquedas y en la mediana de cada canal.`,
      canal: `La mediana de un canal sale de sus últimos videos largos (muestra). Con menos de ${MIN_MUESTRA} no se mide, salvo el tuyo.`,
      outlier: `x = vistas ÷ mediana de su canal. Outlier: ${OUTLIER}× o más y al menos ${MIN_VISTAS} vistas. Aquí x va cortado a un decimal; la cuenta usa el valor entero.`,
      filas:
        'Los outliers van dentro de la búsqueda que los trajo (los de tus referencias, en otrosOrigenes), del mayor x al menor. Cada uno es una línea: id · x · vistas · duración · fecha · comentarios por mil · canal · «título» · y las otras búsquedas donde salió, si las hay.',
      comentariosBajos:
        '50 mil vistas o más y menos de 0,15 comentarios por mil: inusualmente pocos. Puede ser publicidad pagada o comentarios cerrados; es una señal, no una prueba. Van aparte, en comentariosBajos.',
      fecha: '«sin leer»: aún no se leyó (sin la llave de la API solo se leen los 30 mejores). «YouTube ya no lo tiene»: borrado o privado.',
      viejo: 'viejo: de hace más de 12 meses, contados desde el día de este resumen. Sin fecha, no se sabe.',
      formulas: 'Candidatos por patrón de título, en los videos medidos de los demás canales con mediana de 100 vistas o más. pasan: x > 1. El patrón es tosco: revisa los títulos antes de citar una tasa.',
      ...CRITERIOS_LO_DICHO
    },
    muestra: {
      // Lo del perfil que no se pudo investigar: de eso no hay evidencia, ni a favor ni en contra.
      sinInvestigar: faltan.length ? faltan : undefined,
      busquedas: inv.terminos.length,
      canales: inv.canales.length,
      canalesMedidos: inv.canales.filter((c) => medible(c) && c.mediana > 0).length,
      videos: inv.videos.length,
      videosMedidos: medidos.length,
      pasanSuMediana: pct(medidos.filter((v) => v.x! > 1).length, medidos.length),
      outliers: buenos.length,
      comentariosBajos: bajos.length,
      conFecha: outliers.filter((v) => v.fecha).length,
      sinLeer: outliers.filter((v) => !v.fecha && !v.leido).length,
      yaNoEstan: outliers.filter((v) => !v.fecha && v.leido).length,
      transcritos: inv.videos.filter((v) => v.transcrito).length,
      outliersTranscritos: buenos.filter((v) => v.transcrito).length,
      sinVoz: inv.videos.filter((v) => v.sinVoz).length
    },
    // De aquí sale el piso: lo que saca hoy un video del usuario, y cuáles le funcionaron.
    tuCanal: propio && {
      nombre: propio.nombre,
      mediana: Math.round(propio.mediana),
      muestra: propio.videos,
      videos: inv.videos
        .filter((v) => v.canalId === propio.id && v.x !== undefined)
        .sort(porX)
        .map(linea)
    },
    busquedas: [...inv.terminos]
      .sort((a, b) => b.mediana - a.mediana)
      .map((t) => ({
        termino: t.termino,
        vecino: t.vecino,
        largos: t.largos,
        mediana: Math.round(t.mediana),
        canales: inv.canales.filter((c) => c.de === t.termino).length,
        // Lo primero que enseña la búsqueda: contra eso compite la miniatura.
        feed: t.ids
          .slice(0, 6)
          .map((id) => videos.get(id))
          .filter((v): v is VideoYT => !!v)
          .map(linea),
        outliers: de(t.termino)
      })),
    otrosOrigenes: otros.length ? Object.fromEntries(otros.map((o) => [o, de(o)])) : undefined,
    canales: inv.canales
      .filter((c) => !c.propio)
      .map((c) => ({
        nombre: c.nombre,
        id: c.id,
        mediana: Math.round(c.mediana),
        muestra: c.videos,
        sinMedir: medible(c) ? undefined : `solo ${c.videos} videos largos`,
        subs: c.subs,
        de: c.de,
        outliers: buenos.filter((v) => v.canalId === c.id).length,
        comentariosBajos: bajos.filter((v) => v.canalId === c.id).length || undefined
      }))
      .sort((a, b) => b.outliers - a.outliers || b.mediana - a.mediana),
    comentariosBajos: bajos.map((v) => fila(v, hoy)),
    formulas: FORMULAS.map(([formula, patron]) => {
      const m = comparables.filter((v) => patron.test(v.titulo)).sort(porX)
      return {
        formula,
        patron: patron.source,
        videos: m.length,
        pasan: m.filter((v) => v.x! > 1).length,
        outliers: m.filter(esOutlier).length,
        canales: new Set(m.map((v) => v.canalId)).size,
        mejores: m.slice(0, 3).map(linea),
        // Dónde falló: si solo se miran los éxitos, cualquier fórmula parece buena.
        peores: m.length > 3 ? m.slice(-2).map(linea) : undefined
      }
    })
      .filter((f) => f.videos)
      .sort((a, b) => b.videos - a.videos),
    ganchos: ganchosDe(comparables, extra.textos, (v) => [linea(v), dice(v, 220)].filter(Boolean).join(' · '), 'canales'),
    temas: temasDe(extra.temas, videos, new Set(buenos.map((v) => v.id)), (v) => fila(v, hoy), linea)
  }
}

/** Una cifra por mil, con los decimales que hacen falta para no leer 0 donde hay 0,04. */
const pm = (x?: number) => (x === undefined ? undefined : Number(x.toFixed(x < 1 ? 2 : 1)))
/** La descripción de un video vertical en una línea, corta: no es el texto que se ve en el video. */
const desc = (v: VideoYT) => v.titulo.replace(/\s+/g, ' ').trim().slice(0, 140)

/** Las vistas de un video vertical; un Reel de la búsqueda de Instagram que no las tiene, sus likes. */
const vistasV = (v: VideoYT) => (v.vistas ? `${mil(v.vistas)} vistas` : v.likes !== undefined ? `${mil(v.likes)} likes, sin vistas` : 'sin vistas')

/** Un video vertical en una línea: «descripción» · @cuenta · 210 mil vistas · 7.3× · 38 guard/mil · 2026-10-02. */
const lineaV = (v: VideoYT) => {
  const g = pm(guardadosPorMil(v))
  return [`«${desc(v)}»`, v.canal, v.idioma, vistasV(v), v.x !== undefined ? veces(v.x) : 'sin medir', g !== undefined && `${g} guard/mil`, v.fecha, v.pagado && 'pagado'].filter(Boolean).join(' · ')
}

/**
 * Un outlier vertical en una línea: id · red · idioma · 7.3× · 210 mil vistas · 38 guard/mil · 4.1 comp/mil · 1.2 com/mil
 * · 45 s · fecha · pagado · @cuenta · «descripción» · y de qué otras búsquedas salió · lo que dice al principio · y, si no
 * es en español, si ya hay algo parecido en español (`enEspanol` de `temas.json`).
 */
function filaV(v: VideoYT, hoy: number, aqui?: string, temas?: Temas | null) {
  const [g, c, k] = [pm(guardadosPorMil(v)), pm(compartidosPorMil(v)), pm(porMil(v))]
  const otras = v.de.filter((d) => d !== aqui)
  const parecidos = v.idioma && v.idioma !== 'es' ? temas?.enEspanol[v.id] : undefined
  return [
    v.id,
    v.red,
    v.idioma,
    veces(v.x ?? 0),
    `${mil(v.vistas)} vistas`,
    g !== undefined && `${g} guard/mil`,
    c !== undefined && `${c} comp/mil`,
    k !== undefined && `${k} com/mil`,
    v.segundos && `${Math.round(v.segundos)} s`,
    (v.fecha ?? 'sin fecha') + (viejo(v.fecha, hoy) ? ', viejo' : ''),
    v.pagado && 'pagado',
    v.canal,
    `«${desc(v)}»`,
    otras.length > 0 && `${aqui ? 'también de' : 'de'}: ${otras.join(', ')}`,
    dice(v),
    parecidos && (parecidos.length ? `en español: ${parecidos.length} parecidos (${parecidos[0][1].toFixed(2)})` : 'nada parecido en español')
  ]
    .filter(Boolean)
    .join(' · ')
}

/** La mediana de guardados, compartidos y comentarios por mil de unos videos: la base contra la que se lee cada uno. */
function señales(vs: VideoYT[]) {
  const de = (f: (v: VideoYT) => number | undefined) => {
    const xs = vs.map(f).filter((x): x is number => x !== undefined)
    return xs.length ? pm(mediana(xs)) : undefined
  }
  return { videos: vs.length, guardadosPorMil: de(guardadosPorMil), compartidosPorMil: de(compartidosPorMil), comentariosPorMil: de(porMil) }
}

/**
 * `resumen.json` de un canal vertical (TikTok e Instagram), para la skill `ideas-vertical`. La misma cuenta que en
 * YouTube, más lo que en vertical dice si un video sirve para vender: guardados y compartidos por mil, y lo que piden los
 * comentarios de los outliers.
 */
function resumirVertical(toda: Investigacion, canal: Canal, hoy: number, extra: Extra) {
  const inv = alPerfil(toda, canal)
  const faltan = sinInvestigar(toda, canal)
  const videos = new Map(inv.videos.map((v) => [v.id, v]))
  const canales = new Map(inv.canales.map((c) => [c.id, c]))
  const propias = inv.canales.filter((c) => c.propio)
  const porX = (a: VideoYT, b: VideoYT) => (b.x ?? 0) - (a.x ?? 0)
  const ajeno = (v: VideoYT) => !canales.get(v.canalId)?.propio
  // Un Reel sin vistas (de la búsqueda de Instagram, si su cuenta no las dio) no entra en ninguna mediana.
  const medidos = inv.videos.filter((v) => v.x !== undefined && v.vistas > 0)
  const outliers = inv.videos.filter((v) => esOutlier(v) && ajeno(v)).sort(porX)
  const buenos = outliers.filter((v) => !sospechoso(v))
  const bajos = outliers.filter(sospechoso)
  const terminos = new Set(inv.terminos.map((t) => t.termino))
  const otros = [...new Set(buenos.flatMap((v) => v.de).filter((d) => !terminos.has(d)))]
  const redDe = (x: { red?: string }) => x.red ?? 'tiktok'
  const buscada = new Set(inv.terminos.map((t) => `${redDe(t)} ${t.termino}`))
  /**
   * Los outliers que trajo un origen. En una búsqueda, los de su red, y los de la otra si la frase no se buscó en ella (el
   * Instagram de las cuentas de TikTok, sin sesión de Instagram).
   */
  const de = (origen: string, red?: string) =>
    buenos.filter((v) => v.de.includes(origen) && (!red || redDe(v) === red || !buscada.has(`${redDe(v)} ${origen}`))).map((v) => fila(v, origen))
  const dia = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : undefined)
  const comparables = medidos.filter((v) => ajeno(v) && (canales.get(v.canalId)?.mediana ?? 0) >= 1000)
  const fila = (v: VideoYT, aqui?: string) => filaV(v, hoy, aqui, extra.temas)

  return {
    generado: dia(hoy),
    investigacion: dia(inv.hecha),
    criterios: {
      perfil:
        'Solo cuenta lo que trajeron los términos, vecinos y referencias que hoy tiene canal.json, y tus cuentas. investigacion.json guarda también lo que salió de lo que ya se quitó del perfil: si lo consultas, cuenta solo los videos cuyo `de` nombre algo de canal.json.',
      videos:
        'Cada término se busca en TikTok (unos 24 videos) y en Instagram (unos 30 Reels), cada red con su cuenta de investigación: son dos búsquedas, y cada una lleva su red. De TikTok se abren las cuentas de los 5 más vistos y se leen sus últimos 30 videos. Las cuentas de Instagram se leen con la API de Meta, que solo deja ver las profesionales.',
      instagram:
        'La búsqueda de Instagram no da vistas, solo likes y comentarios: las vistas las da la cuenta. Se abren las de los Reels con más likes, y cada Reel de la búsqueda que sale entre los últimos de su cuenta recibe sus vistas y su x. Los demás quedan «sin vistas»: no entran en ninguna mediana, ni en pasanSuMediana, ni se miden. La mediana de una búsqueda de Instagram sale solo de sus Reels con vistas. En cada búsqueda, cuentas son solo las de su red.',
      cuenta: `La mediana de una cuenta sale de sus últimos videos, sin los fijados ni los de menos de ${MADURO / 864e5} días (siguen subiendo); en Instagram, tampoco los Reels sin vistas. Con menos de ${MIN_MUESTRA} no se mide, salvo las tuyas.`,
      outlier: `x = vistas ÷ mediana de su cuenta. Outlier: ${OUTLIER}× o más y al menos ${mil(MIN_VISTAS_VERTICAL)} vistas. x va cortado a un decimal; la cuenta usa el valor entero. Los seguidores no entran: en TikTok casi no limitan.`,
      filas:
        'Cada outlier es una línea: id · red · idioma · x · vistas · guardados por mil · compartidos por mil · comentarios por mil · duración · fecha · pagado (si lo es) · @cuenta · «descripción» · y las otras búsquedas donde salió. En una búsqueda van los outliers de su red. La descripción no es el texto que se ve en el video: el gancho hay que verlo.',
      pagado: 'pagado: Instagram dice que es una colaboración pagada. Sus vistas no son demanda orgánica.',
      idioma:
        'Cada video lleva su idioma (es, en…): lo da TikTok en la búsqueda; lo demás se deduce de la descripción, y sin él no se sabe. TikTok localiza por el país de la cuenta de investigación (México): aun buscando en inglés, la mitad sale en español. De una frase en inglés se abren las cuentas que publican en inglés. La demanda de tu comprador se lee en español; lo que funciona en inglés es empaque y modas que suelen llegar antes, para traer si aún no existen en español.',
      señales:
        'Guardar es «lo voy a usar»: lo más cercano a querer comprar. Compartir, «esto es para alguien». señales da su mediana en todos los videos medidos de los demás y en sus outliers: compara cada video con eso, no con un número fijo.',
      comentariosBajos: `${mil(50_000)} vistas o más y menos de 0,15 comentarios por mil: puede ser publicidad pagada (Spark Ads) o comentarios cerrados. Es una señal, no una prueba. Van aparte.`,
      comentarios: 'Los comentarios con más likes de los mejores outliers: qué pide la gente, con sus palabras.',
      viejo: 'viejo: de hace más de 12 meses. En vertical las modas duran semanas: mira la fecha aunque no diga viejo.',
      formulas:
        'Candidatos por patrón en la descripción, en los videos medidos de los demás con mediana de mil vistas o más. pasan: x > 1. En vertical la descripción dice poco del gancho: úsalo como pista.',
      ...CRITERIOS_LO_DICHO,
      enEspanol:
        'En un outlier que no es en español: «en español: N parecidos (0,84)», los videos en español que dicen algo parecido (similitud de 0 a 1, del más parecido), o «nada parecido en español»: lo que funciona en inglés y aún no existe en español. Sin nada de eso, aún no se comparó.'
    },
    muestra: {
      sinInvestigar: faltan.length ? faltan : undefined,
      busquedas: inv.terminos.length,
      cuentas: inv.canales.length,
      cuentasMedidas: inv.canales.filter((c) => medible(c) && c.mediana > 0).length,
      videos: inv.videos.length,
      videosMedidos: medidos.length,
      pasanSuMediana: pct(medidos.filter((v) => v.x! > 1).length, medidos.length),
      outliers: buenos.length,
      comentariosBajos: bajos.length,
      conDestacados: buenos.filter((v) => v.destacados?.length).length,
      porIdioma: {
        es: medidos.filter((v) => v.idioma === 'es').length,
        en: medidos.filter((v) => v.idioma === 'en').length,
        otro: medidos.filter((v) => v.idioma && v.idioma !== 'es' && v.idioma !== 'en').length,
        sinSaber: medidos.filter((v) => !v.idioma).length
      },
      transcritos: inv.videos.filter((v) => v.transcrito).length,
      outliersTranscritos: buenos.filter((v) => v.transcrito).length,
      sinVoz: inv.videos.filter((v) => v.sinVoz).length
    },
    señales: {
      todos: señales(medidos.filter(ajeno)),
      outliers: señales(buenos),
      porIdioma: { es: señales(buenos.filter((v) => v.idioma === 'es')), en: señales(buenos.filter((v) => v.idioma === 'en')) }
    },
    // De aquí sale el piso: lo que saca hoy un video tuyo en cada red, y cuáles te funcionaron.
    tusCuentas: propias.map((c) => {
      const tuyos = medidos.filter((v) => v.canalId === c.id).sort(porX)
      return { red: c.red, usuario: c.usuario ?? c.nombre, mediana: Math.round(c.mediana), muestra: c.videos, señales: señales(tuyos), videos: tuyos.map(lineaV) }
    }),
    busquedas: [...inv.terminos]
      .sort((a, b) => b.mediana - a.mediana)
      .map((t) => ({
        termino: t.termino,
        red: redDe(t),
        vecino: t.vecino,
        idioma: t.idioma,
        videos: t.largos,
        mediana: Math.round(t.mediana),
        cuentas: inv.canales.filter((c) => c.de === t.termino && redDe(c) === redDe(t)).length,
        // Lo primero que enseña la búsqueda: contra eso compite el primer cuadro.
        feed: t.ids
          .slice(0, 6)
          .map((id) => videos.get(id))
          .filter((v): v is VideoYT => !!v)
          .map(lineaV),
        outliers: de(t.termino, redDe(t))
      })),
    otrosOrigenes: otros.length ? Object.fromEntries(otros.map((o) => [o, de(o)])) : undefined,
    cuentas: inv.canales
      .filter((c) => !c.propio)
      .map((c) => ({
        red: c.red,
        usuario: c.usuario ?? c.nombre,
        idioma: c.idioma,
        nombre: c.nombre,
        mediana: Math.round(c.mediana),
        muestra: c.videos,
        sinMedir: medible(c) ? undefined : `solo ${c.videos} videos`,
        seguidores: c.subs,
        de: c.de,
        outliers: buenos.filter((v) => v.canalId === c.id).length,
        comentariosBajos: bajos.filter((v) => v.canalId === c.id).length || undefined
      }))
      .sort((a, b) => b.outliers - a.outliers || b.mediana - a.mediana),
    comentariosBajos: bajos.map((v) => fila(v)),
    comentarios: Object.fromEntries(buenos.filter((v) => v.destacados?.length).map((v) => [v.id, v.destacados!.map((d) => `♥${d.likes} ${d.texto.replace(/\s+/g, ' ').slice(0, 200)}`)])),
    formulas: FORMULAS.map(([formula, patron]) => {
      const m = comparables.filter((v) => patron.test(v.titulo)).sort(porX)
      return {
        formula,
        patron: patron.source,
        videos: m.length,
        pasan: m.filter((v) => v.x! > 1).length,
        outliers: m.filter(esOutlier).length,
        cuentas: new Set(m.map((v) => v.canalId)).size,
        mejores: m.slice(0, 3).map(lineaV),
        peores: m.length > 3 ? m.slice(-2).map(lineaV) : undefined
      }
    })
      .filter((f) => f.videos)
      .sort((a, b) => b.videos - a.videos),
    ganchos: ganchosDe(comparables, extra.textos, (v) => [lineaV(v), dice(v)].filter(Boolean).join(' · '), 'cuentas'),
    temas: temasDe(extra.temas, videos, new Set(buenos.map((v) => v.id)), (v) => fila(v), lineaV)
  }
}

/**
 * JSON con una fila corta por línea: se lee de corrido, pesa menos que con sangría y ninguna línea pasa del límite con
 * que Claude lee un archivo.
 */
export function enLineas(x: unknown, sangria = ''): string {
  const una = JSON.stringify(x)
  if (una.length <= 400 || !x || typeof x !== 'object') return una
  const dentro = sangria + ' '
  if (Array.isArray(x)) return `[\n${x.map((e) => dentro + enLineas(e, dentro)).join(',\n')}\n${sangria}]`
  const campos = Object.entries(x as object).filter(([, v]) => v !== undefined)
  return `{\n${campos.map(([k, v]) => `${dentro}${JSON.stringify(k)}: ${enLineas(v, dentro)}`).join(',\n')}\n${sangria}}`
}
