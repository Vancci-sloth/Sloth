import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { Card, VideoHecho } from '../shared/types.ts'
import type { CuentaYoutube, EstadoRecomendacionYoutube, RecomendacionYoutube, ReferenciaYoutube } from '../shared/youtube.ts'
import { guardar, huella } from './disco.ts'
import { carpetaYoutube } from './youtube-catalogo.ts'
import { carpetaTrabajo } from './trabajo.ts'
import { buscarReferenciasYoutube, type ApiPublicaYoutube } from './youtube-referencias.ts'
import { jsonYoutube, redactarYoutube } from './youtube-redactor.ts'
import { subtitulosYoutube, transcribirArchivo } from './ideas/transcribir.ts'
import { DESCRIPCION_YOUTUBE, PLAN_YOUTUBE, RECOMENDACION_YOUTUBE } from './youtube-esquemas.ts'

/**
 * Investiga el tema del video con su guion y fotogramas, reúne Ideas y datos públicos de YouTube, y adjunta miniaturas
 * reales al agente. Guarda propuestas y evidencia sin cambiar el título elegido ni aprobar una publicación. El mismo
 * análisis sirve para ambos botones; procesa dos videos a la vez y guarda la cola para retomarla al abrir Sloth.
 * Una solicitud conserva el modelo, esfuerzo y contenido recibidos; no se duplica mientras ese video ya espera o trabaja.
 * La descripción lleva al final sus capítulos: Sloth escucha el video terminado con Whisper (una vez por versión), el
 * agente elige los cambios de tema y `capitulosYoutube` los deja como YouTube los acepta, con los tiempos de ese montaje.
 */
const execFileP = promisify(execFile)
type Redactar = typeof redactarYoutube
type Pedido = { tipo: 'titulo' | 'miniatura' | 'descripcion'; titulo?: string; effort?: string }
type Entrada = { v: VideoHecho; model: string; contexto: string; tema?: string; pedido?: Pedido }
type Trabajo = EstadoRecomendacionYoutube & { firma?: string; orden?: number; pendiente?: Entrada }
const SIMULTANEOS = 2

export function recomendacionesYoutube(app: string, api: ApiPublicaYoutube, redactar: Redactar = redactarYoutube, subtitulos = subtitulosYoutube, escuchar = transcribirArchivo) {
  const archivo = join(app, 'data', 'youtube', 'recomendaciones.json')
  const trabajos: Record<string, Trabajo> = {}
  let roto = false
  try {
    if (existsSync(archivo)) Object.assign(trabajos, JSON.parse(readFileSync(archivo, 'utf8')))
    for (const r of Object.values(trabajos)) if (r.estado === 'trabajando' || r.estado === 'cola') {
      if (r.pendiente) { r.estado = 'cola'; r.fase = 'En cola para continuar'; delete r.error }
      else { r.estado = 'error'; r.fase = 'Interrumpido'; r.error = 'Sloth se cerró durante el análisis. Puedes reintentar.' }
    }
  } catch { roto = true }
  const activos = new Set<string>()
  let orden = Math.max(Date.now(), ...Object.values(trabajos).map((r) => r.orden ?? 0))
  const guardarDatos = () => { mkdirSync(join(app, 'data', 'youtube'), { recursive: true }); guardar(archivo, JSON.stringify(trabajos, null, 2)) }
  const cola = () => Object.keys(trabajos).filter((h) => trabajos[h].estado === 'cola').sort((a, b) => (trabajos[a].orden ?? 0) - (trabajos[b].orden ?? 0))
  function estado(h: string): EstadoRecomendacionYoutube | undefined {
    const r = trabajos[h]
    const posicion = r?.estado === 'cola' ? cola().indexOf(h) + 1 : undefined
    return r && { estado: r.estado, fase: posicion ? `En cola · posición ${posicion}` : r.fase, error: r.error, resultado: r.resultado, descripcion: r.descripcion, modelo: r.modelo, posicion }
  }
  const etapa = (h: string, fase: string) => { trabajos[h].fase = fase; guardarDatos() }
  function iniciar(v: VideoHecho, card: Card, model: string, mensajes: string[], tema?: string, canal?: CuentaYoutube | null, pedido?: Pedido) {
    if (roto) throw new Error('No se pudo leer el archivo de recomendaciones. Recupéralo antes de generar otras.')
    const h = huella(v.ruta)
    if (trabajos[h] && ['cola', 'trabajando'].includes(trabajos[h].estado)) {
      if (pedido?.tipo === 'descripcion') throw new Error('Espera a que termine la recomendación de este video antes de rellenar otra descripción.')
      return estado(h)!
    }
    let contexto = ''
    const folder = carpetaYoutube(v)
    for (const nombre of ['guion.md', 'guion.json', 'tratamiento.md', 'publicacion.md', 'youtube.md', 'entrega.md', 'informe.md', 'material.md']) {
      const file = join(folder, nombre)
      if (!existsSync(file) || statSync(file).size > 500_000 || contexto.length >= 40_000) continue
      contexto += `\n\nArchivo ${nombre}:\n${readFileSync(file, 'utf8').slice(0, nombre === 'guion.md' ? 20_000 : 6000)}`
    }
    contexto += '\n\nEntregas anteriores del agente:\n' + mensajes.join('\n\n').slice(-12_000)
    if (contexto.trim().length < 150) throw new Error('Falta el guion o una descripción suficiente del contenido. Continúa el hilo del video y pide guardar su guion antes de recomendar títulos.')
    if (canal) {
      try {
        const perfiles = readdirSync(join(carpetaTrabajo(app), 'ideas'), { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => {
          try { return [JSON.parse(readFileSync(join(carpetaTrabajo(app), 'ideas', d.name, 'canal.json'), 'utf8'))] } catch { return [] }
        }).filter((p) => p.formato !== 'vertical' && typeof p.nombre === 'string' && p.nombre.toLowerCase() === canal.nombre.toLowerCase())
        if (perfiles.length === 1) contexto += '\n\nPerfil del canal conectado (público, objetivo y referencias configuradas):\n' + JSON.stringify(perfiles[0]).slice(0, 8000)
      } catch { /* El perfil es opcional; el guion sigue siendo la fuente del contenido. */ }
    }
    if (card.skill && /^[\w-]+$/.test(card.skill)) {
      const estilo = join(app, 'skills', card.skill, 'ESTILO.md')
      if (existsSync(estilo)) {
        const texto = readFileSync(estilo, 'utf8')
        contexto += '\n\nCriterio del estilo para título y miniatura:\n' + (texto.slice(texto.indexOf('## Título') >= 0 ? texto.indexOf('## Título') : 0, texto.indexOf('## Título') >= 0 ? texto.indexOf('## Título') + 12_000 : 6000))
      }
    }
    const firma = createHash('sha256').update(`${h}|${contexto}|${tema ?? ''}|${model}|${JSON.stringify(pedido)}`).digest('hex')
    const anterior = trabajos[h]
    trabajos[h] = { estado: 'cola', fase: 'En cola', resultado: anterior?.resultado, descripcion: anterior?.descripcion, modelo: model, firma, orden: ++orden, pendiente: { v, model, contexto, tema, pedido } }
    try { guardarDatos() } catch (e) { if (anterior) trabajos[h] = anterior; else delete trabajos[h]; throw e }
    seguir()
    return estado(h)!
  }
  function seguir() {
    if (roto) return
    for (const h of cola()) {
      if (activos.size >= SIMULTANEOS) break
      activos.add(h)
      void ejecutar(h).finally(() => { activos.delete(h); seguir() }).catch(() => {})
    }
  }
  async function ejecutar(h: string) {
    const anterior = trabajos[h]
    try {
      const entrada = anterior.pendiente
      if (!entrada) throw new Error('Faltan los datos de la solicitud. Vuelve a recomendar este video.')
      const { v, model, contexto, tema, pedido } = entrada
      if (huella(v.ruta) !== h) throw new Error('El video cambió mientras esperaba en cola. Revisa la nueva versión antes de recomendar.')
      const describiendo = pedido?.tipo === 'descripcion'
      anterior.estado = 'trabajando'
      anterior.fase = describiendo ? 'Redactando la descripción con el guion y las fuentes…' : 'Leyendo el guion y preparando fotogramas…'
      guardarDatos()
      const tarea = describiendo
        ? describir(v, model, contexto, pedido?.titulo ?? v.titulo, anterior.resultado, pedido?.effort).then((descripcion) => ({ resultado: anterior.resultado, descripcion }))
        : hacer(v, model, contexto, tema, pedido?.effort).then((resultado) => ({ resultado, descripcion: anterior.descripcion }))
      const salida = await tarea
      if (huella(v.ruta) !== h) throw new Error('El video cambió durante el análisis. Vuelve a recomendar sobre la nueva versión.')
      trabajos[h] = { estado: 'listo', fase: describiendo ? 'Descripción lista' : 'Análisis listo', ...salida, modelo: model, firma: anterior.firma, orden: anterior.orden }
      guardarDatos()
    } catch (e) {
      trabajos[h].estado = 'error'
      trabajos[h].fase = 'No se pudo completar el análisis'
      trabajos[h].error = e instanceof Error && !/https?:\/\//i.test(e.message) ? e.message : 'No se pudo completar el análisis. Revisa las conexiones y reintenta.'
      delete trabajos[h].pendiente
      guardarDatos()
    }
  }
  async function describir(v: VideoHecho, model: string, contexto: string, titulo: string, analisis?: RecomendacionYoutube, effort?: string) {
    const dir = join(app, 'data', 'youtube', 'analisis', huella(v.ruta))
    mkdirSync(dir, { recursive: true })
    const referencias = analisis?.referencias.filter((r) => r.observacion).map((r) => ({ titulo: r.titulo, url: r.url })) ?? []
    const evidencia = `${contexto}\n\nFuentes del análisis previo:\n${JSON.stringify(referencias)}`
    const urls = enlacesYoutube(evidencia)
    etapa(huella(v.ruta), 'Escuchando el video terminado para marcar sus capítulos…')
    const oido = await oir(v, dir)
    etapa(huella(v.ruta), 'Redactando la descripción y sus capítulos…')
    const salida = jsonYoutube(await redactar(model, dir, [
      'Redacta una descripción de YouTube lista para publicar para este video, en español de México. Usa el guion como fuente del contenido y el estilo del canal.',
      `Título elegido por el usuario: ${JSON.stringify(titulo)}. Es contexto editorial, no prueba de hechos.`,
      'Abre con dos líneas claras sobre lo que encontrará el espectador; sigue con un resumen breve y natural. Atribuye las pruebas de otros creadores cuando el guion las relate. No copies descripciones ajenas.',
      'Puedes incluir las fuentes pertinentes del guion y hasta tres hashtags relevantes. Usa solo enlaces de la lista permitida. No inventes descuentos, enlaces del canal, patrocinios, pruebas propias ni afirmaciones que el contenido no respalde. No pongas capítulos ni marcas de tiempo en el texto: van aparte, en "capitulos", y Sloth los añade al final.',
      oido.segmentos.length
        ? `Capítulos: marca cada cambio de tema real del video con la transcripción del video terminado de abajo, que dice en qué segundo empieza cada frase. El primero empieza en 0. Cada uno dura al menos 10 s, y el último empieza 10 s o más antes del final (${Math.floor(oido.duracion)} s). Usa como "inicio" el segundo de una frase de la transcripción; según la duración, de 3 a 15 capítulos, uno cada uno a tres minutos suele bastar. Títulos cortos (hasta 50 caracteres) que digan lo que pasa en ese tramo, sin numerarlos ni ponerles hora.`
        : 'Este video no tiene voz transcrita: responde "capitulos": [].',
      'Texto plano con saltos de línea, sin HTML ni < o >. Máximo 4000 bytes UTF-8; apunta a 1200–2500 bytes. Responde JSON {"texto":"Descripción lista para publicar","razon":"Breve explicación de su enfoque","capitulos":[{"inicio":0,"titulo":"De qué va"}]}.',
      `Enlaces permitidos: ${JSON.stringify(urls)}`, evidencia,
      ...(oido.segmentos.length ? [`Transcripción del video terminado (segundo: frase):\n${oido.segmentos.map((s) => `${Math.floor(s.inicio)}: ${s.texto}`).join('\n').slice(0, 40_000)}`] : [])
    ].join('\n\n'), [], DESCRIPCION_YOUTUBE, effort))
    const descripcion = validarDescripcionYoutube(salida, urls)
    const capitulos = capitulosYoutube((salida as { capitulos?: unknown } | null)?.capitulos, oido.segmentos, oido.duracion)
    const conCapitulos = capitulos.length ? `${descripcion.texto}\n\nCapítulos:\n${capitulos.map((c) => `${marcaYoutube(c.inicio, oido.duracion)} ${c.titulo}`).join('\n')}` : descripcion.texto
    const caben = Buffer.byteLength(conCapitulos, 'utf8') <= 5000
    const nota = oido.aviso ?? (!capitulos.length ? 'Sin capítulos: no salieron al menos tres tramos de 10 s o más.' : !caben ? 'Sin capítulos: con ellos la descripción pasaba de 5000 bytes.' : `${capitulos.length} capítulos, con los tiempos del video terminado.`)
    return { texto: caben ? conCapitulos : descripcion.texto, razon: `${descripcion.razon} ${nota}`.trim() }
  }
  /** Lo dicho en el video terminado y su duración, guardados por huella: otra descripción del mismo video no lo vuelve a escuchar. */
  async function oir(v: VideoHecho, dir: string): Promise<{ segmentos: { inicio: number; texto: string }[]; duracion: number; aviso?: string }> {
    const file = join(dir, 'transcripcion.json')
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { /* Aún no se escucha este video. */ }
    let duracion = 0
    try {
      const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.ruta], { timeout: 15_000, windowsHide: true })
      duracion = Number(stdout.trim())
    } catch { /* Sin duración no hay capítulos, pero la descripción sigue. */ }
    if (!Number.isFinite(duracion) || duracion < 30) return { segmentos: [], duracion: 0, aviso: 'Sin capítulos: YouTube los pide en videos de 30 s o más.' }
    try {
      const segmentos = frasesYoutube(await escuchar(v.ruta, AbortSignal.timeout(45 * 60_000)))
      const oido = { segmentos, duracion, ...(segmentos.length ? {} : { aviso: 'Sin capítulos: el video no tiene voz que transcribir.' }) }
      guardar(file, JSON.stringify(oido))
      return oido
    } catch (e) {
      return { segmentos: [], duracion, aviso: `Sin capítulos: no se pudo escuchar el video (${e instanceof Error ? e.message.slice(0, 200) : 'error desconocido'}).` }
    }
  }
  async function hacer(v: VideoHecho, model: string, contexto: string, tema?: string, effort?: string): Promise<RecomendacionYoutube> {
    const h = huella(v.ruta)
    const dir = join(app, 'data', 'youtube', 'analisis', h)
    mkdirSync(dir, { recursive: true })
    const { stdout } = await execFileP('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.ruta], { timeout: 15_000, windowsHide: true })
    const duracion = Number(stdout.trim())
    if (!Number.isFinite(duracion) || duracion <= 0) throw new Error('No se pudo leer el video para analizar sus fotogramas.')
    const fotogramas: string[] = []
    for (const [i, parte] of [0.12, 0.5, 0.82].entries()) {
      const file = join(dir, `fotograma-${i}.jpg`)
      await execFileP('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(duracion * parte), '-i', v.ruta, '-vf', 'scale=960:-2', '-frames:v', '1', '-q:v', '3', file], { timeout: 30_000, windowsHide: true })
      fotogramas.push(file)
    }
    const plan = jsonYoutube(await redactar(model, dir,
      `Identifica el tema real de este video, sus hechos respaldados y hasta dos consultas específicas para buscar videos comparables de YouTube. No adoptes el nombre del hilo como título editorial. Las tres imágenes son fotogramas del video local, no evidencia de terceros. ${tema ? `El usuario quiere investigar: ${tema}` : ''}\nResponde JSON: {"tema":"...","consultas":["...","..."],"hechos":["..."]}.\n${contexto}`, fotogramas, PLAN_YOUTUBE, effort)) as { tema?: string; consultas?: string[]; hechos?: string[] }
    if (typeof plan.tema !== 'string' || !Array.isArray(plan.consultas) || !plan.consultas.length || !plan.consultas.every((q) => typeof q === 'string' && q.trim() && q.length <= 120)) throw new Error('El agente no pudo identificar consultas útiles para este video. Ajusta el tema y reintenta.')
    etapa(h, 'Buscando comparables y midiendo sus canales…')
    const encontrados = await buscarReferenciasYoutube(app, plan.consultas, api)
    const referencias = encontrados.referencias
    etapa(h, 'Leyendo el contenido de las referencias por sus subtítulos…')
    const dirTranscripciones = join(app, 'data', 'youtube', 'transcripciones')
    mkdirSync(dirTranscripciones, { recursive: true })
    for (const r of referencias.slice(0, 2)) {
      if (r.transcripcion) continue
      const file = join(dirTranscripciones, `${r.id}.json`)
      try {
        if (existsSync(file)) r.transcripcion = JSON.parse(readFileSync(file, 'utf8')).texto?.slice(0, 6000)
        if (!r.transcripcion) {
          const t = await subtitulos(r, dir, AbortSignal.timeout(30_000))
          if (t?.segmentos.length) {
            const texto = t.segmentos.map((s) => s.texto).join(' ')
            guardar(file, JSON.stringify({ id: r.id, idioma: t.idioma, texto, hecha: Date.now() }))
            r.transcripcion = texto.slice(0, 6000)
          }
        }
        if (!r.transcripcion) encontrados.limites.push(`El video ${r.id} no tiene una transcripción disponible; su contenido no se verificó por voz.`)
      } catch { encontrados.limites.push(`No se pudieron leer los subtítulos del video ${r.id}; su contenido no se verificó por voz.`) }
    }
    const adjuntos = [...fotogramas]
    const orden = fotogramas.map((_, i) => `Imagen ${i + 1}: fotograma ${i + 1} del video del usuario.`)
    etapa(h, 'Analizando miniaturas reales de los videos comparables…')
    let vistas = 0
    for (const r of referencias.slice(0, 6)) {
      const file = join(dir, `${r.id}.jpg`)
      try {
        const origen = r.miniaturaOrigen && new URL(r.miniaturaOrigen)
        const url = origen && origen.protocol === 'https:' && origen.hostname === 'i.ytimg.com' && origen.pathname.startsWith(`/vi/${r.id}/`) ? origen.href : `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`
        r.miniaturaOrigen = url
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' })
        if (!res.ok) throw new Error('No se pudo leer la imagen')
        const bytes = Buffer.from(await res.arrayBuffer())
        if (bytes.length > 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Imagen no válida')
        await writeFile(file, bytes)
        r.miniatura = `/api/youtube/analisis/${h}/${r.id}.jpg`
        adjuntos.push(file)
        orden.push(`Imagen ${adjuntos.length}: miniatura del video ${r.id}, «${r.titulo}».`)
        vistas++
      } catch { encontrados.limites.push(`La miniatura del video ${r.id} no se pudo inspeccionar; solo se usaron sus metadatos.`) }
    }
    if (!vistas) throw new Error('No se pudo descargar ninguna miniatura comparable. Reintenta para obtener un análisis visual real.')
    etapa(h, 'Preparando títulos y concepto de miniatura con su evidencia…')
    const respuesta = jsonYoutube(await redactar(model, dir, [
      'Recomienda el título y el concepto de miniatura para ESTE video del usuario, en español de México. No copies una miniatura ajena ni prometas lo que el guion no demuestra.',
      'La miniatura es un concepto y un prompt, todavía no una imagen generada. Propón objeto protagonista, composición, texto corto y un prompt ejecutable. El texto complementa el título; no lo repite.',
      'Analiza las miniaturas adjuntas: objeto, contraste, jerarquía, texto y relación con el título. Cita IDs reales de los comparables para explicar tus decisiones. No des observaciones visuales de un ID sin imagen adjunta.',
      'Los múltiplos de vistas son una comparación descriptiva con la muestra de su canal. No prueban que el título o miniatura causaran las vistas. No inventes CTR, porcentajes de mejora ni resultados futuros.',
      'Del video local leíste sus archivos y tres fotogramas. De terceros solo metadatos, las miniaturas adjuntas y extractos de sus transcripciones incluidas, cuando existan. Analiza sus ganchos y la relación del contenido con el título, usando esos extractos y citando IDs. No digas que viste completos sus videos.',
      'Responde JSON: {"titulo":{"principal":"...","alternativas":["...","...","..."],"razon":"..."},"miniatura":{"concepto":"...","texto":"...","composicion":"...","prompt":"...","razon":"..."},"analisis":"...","limites":["..."],"referencias":[{"id":"ID real","observacion":"Lo observado o leído y qué patrón usar"}]}.',
      `Tema: ${plan.tema}\nHechos extraídos del contenido: ${JSON.stringify(plan.hechos ?? [])}\nOrden de imágenes:\n${orden.join('\n')}`,
      `Referencias verificadas: ${JSON.stringify(referencias.map((r) => ({ ...r, miniatura: !!r.miniatura })))}`,
      contexto
    ].join('\n\n'), adjuntos, RECOMENDACION_YOUTUBE, effort))
    const resultado = validarRecomendacion(respuesta, referencias)
    return { ...resultado, tema: plan.tema, fecha: Date.now(), fotogramas: fotogramas.map((_, i) => `/api/youtube/analisis/${h}/fotograma-${i}.jpg`), limites: [...encontrados.limites, ...resultado.limites] }
  }
  queueMicrotask(seguir)
  return { iniciar, estado, ocupado: () => activos.size || cola().length ? 'Hay recomendaciones de YouTube en curso o en cola.' : null }
}

export function enlacesYoutube(texto: string): string[] {
  return [...new Set((texto.match(/https?:\/\/[^\s<>"'`]+/g) ?? []).map((s) => s.replace(/[.,;!?)\]}]+$/, '')))]
}

export function validarDescripcionYoutube(input: unknown, permitidos: string[]) {
  const r = input as { texto?: unknown; razon?: unknown } | null
  if (!r || typeof r.texto !== 'string' || !r.texto.trim() || Buffer.byteLength(r.texto, 'utf8') > 5000 || /[<>]/.test(r.texto) || typeof r.razon !== 'string') throw new Error('La descripción debe ser un texto de hasta 5000 bytes, sin HTML. Reintenta.')
  if (enlacesYoutube(r.texto).some((url) => !permitidos.includes(url))) throw new Error('La descripción incluye un enlace que no está en las fuentes del video. Reintenta.')
  return { texto: r.texto.trim(), razon: r.razon }
}

/**
 * Los capítulos que YouTube acepta: el primero en 0:00, al menos tres, de 10 s o más, en orden. Cada inicio se lleva a la
 * frase más cercana de la transcripción, para que caiga donde de verdad empieza el tramo; el que queda a menos de 10 s del
 * anterior o del final se quita. Si el agente no abrió en 0, el principio se llama «Introducción». Con menos de tres, nada.
 */
export function capitulosYoutube(input: unknown, segmentos: { inicio: number }[], duracion: number): { inicio: number; titulo: string }[] {
  if (!Array.isArray(input) || !segmentos.length || !(duracion >= 30)) return []
  const inicios = [0, ...segmentos.map((s) => Math.floor(s.inicio))]
  const cerca = (t: number) => inicios.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a))
  const propuestos = input.flatMap((c: { inicio?: unknown; titulo?: unknown } | null) => {
    if (typeof c?.inicio !== 'number' || !Number.isFinite(c.inicio) || typeof c.titulo !== 'string') return []
    const titulo = c.titulo.replace(/[<>]/g, '').replace(/\s+/g, ' ').replace(/^(?:\d{1,2}:)?\d{1,2}:\d{2}\s*[-–—:]?\s*|^\d+[.)]\s+/, '').trim().slice(0, 80).trim()
    return titulo ? [{ inicio: cerca(Math.max(0, c.inicio)), titulo }] : []
  }).sort((a, b) => a.inicio - b.inicio)
  if (propuestos[0] && propuestos[0].inicio >= 10) propuestos.unshift({ inicio: 0, titulo: 'Introducción' })
  else if (propuestos[0]) propuestos[0].inicio = 0
  const capitulos: { inicio: number; titulo: string }[] = []
  for (const c of propuestos) if (!capitulos.length || (c.inicio - capitulos.at(-1)!.inicio >= 10 && duracion - c.inicio >= 10)) capitulos.push(c)
  return capitulos.length >= 3 ? capitulos : []
}

/**
 * Whisper da trozos de hasta 30 s sin el tiempo de cada palabra: cada trozo se parte en sus frases y el tiempo del trozo
 * se reparte por sus letras. Así un capítulo puede abrir a media pieza, cerca de donde de verdad cambia el tema.
 */
export function frasesYoutube(segmentos: { inicio: number; fin: number; texto: string }[]) {
  return segmentos.flatMap((s) => {
    const frases = s.texto.match(/[^.!?…]+(?:[.!?…]+["'»”)]*|$)/g)?.map((f) => f.trim()).filter(Boolean) ?? []
    const letras = frases.reduce((n, f) => n + f.length, 0)
    let antes = 0
    return frases.map((texto) => {
      const inicio = s.inicio + ((s.fin - s.inicio) * antes) / (letras || 1)
      antes += texto.length
      return { inicio, texto }
    })
  })
}

/** 0:00, o 0:00:00 en un video de una hora o más (todas con la misma forma, como las lee YouTube). */
export function marcaYoutube(segundos: number, duracion: number) {
  const s = Math.floor(segundos)
  const dos = (n: number) => String(n).padStart(2, '0')
  return duracion >= 3600 ? `${Math.floor(s / 3600)}:${dos(Math.floor(s / 60) % 60)}:${dos(s % 60)}` : `${Math.floor(s / 60)}:${dos(s % 60)}`
}

export function validarRecomendacion(input: unknown, referencias: ReferenciaYoutube[]): Omit<RecomendacionYoutube, 'tema' | 'fecha' | 'fotogramas'> {
  const r = input as RecomendacionYoutube | null
  const textos = [r?.titulo?.principal, r?.titulo?.razon, r?.miniatura?.concepto, r?.miniatura?.texto, r?.miniatura?.composicion, r?.miniatura?.prompt, r?.miniatura?.razon, r?.analisis]
  if (!r || textos.some((s) => typeof s !== 'string') || !r.titulo.principal.trim() || [...r.titulo.principal].length > 100 || /[<>]/.test(r.titulo.principal) || !r.miniatura.prompt.trim() || !r.miniatura.concepto.trim()) throw new Error('El agente no devolvió un título y una miniatura completos. Reintenta.')
  if (!Array.isArray(r.titulo.alternativas) || !r.titulo.alternativas.every((s) => typeof s === 'string' && [...s].length <= 100 && !/[<>]/.test(s)) || !Array.isArray(r.limites) || !r.limites.every((s) => typeof s === 'string') || !Array.isArray(r.referencias)) throw new Error('La recomendación no tiene un formato válido. Reintenta.')
  const ids = new Set(referencias.map((v) => v.id))
  if (!r.referencias.length || r.referencias.some((v) => !ids.has(v.id) || typeof v.observacion !== 'string')) throw new Error('El agente citó referencias que no están en la investigación. Reintenta para obtener una propuesta verificable.')
  return { titulo: { ...r.titulo, alternativas: r.titulo.alternativas.slice(0, 3) }, miniatura: r.miniatura, analisis: r.analisis, limites: r.limites,
    referencias: referencias.map((v) => ({ ...v, observacion: r.referencias.find((r) => r.id === v.id)?.observacion })) }
}
