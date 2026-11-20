import { pruebaDe } from '../shared/guia.ts'
import { proveedorDe } from '../shared/providers.ts'
import type { AgentEvent, EvidenciaEstilo, PasoEvidencia, PruebaEstilo } from '../shared/types.ts'

/**
 * La prueba de un estilo que se comparte (`PruebaEstilo`, `shared/guia.ts`): lo que costó hacer el video con que se
 * enseña, sacado del hilo donde se hizo. Nadie la escribe: sale de lo que el hilo guardó, y por eso el video tiene que
 * ser uno hecho en Sloth cuyo hilo siga ahí.
 *
 * Cuenta los turnos que empezaron antes de que el video quedara terminado: lo que trabajó el agente en cada uno (sin lo
 * que esperó a quien lo usa, por ejemplo a que grabara su voz, ni lo que Sloth estuvo cerrada tras una caída: `finDe`)
 * y lo que costó, a precio de la API. Con ellos va el
 * resumen del hilo: lo que se le pidió, cada turno con su tiempo, su costo y cuántas herramientas usó, y lo que usó de
 * Sloth (`HERRAMIENTAS`). Con él se compara su guía al revisarlo.
 *
 * La evidencia es el hilo completo (`evidenciaDelHilo`), que sube aparte al publicar, con el permiso de su autor.
 */

/** Lo más que se guarda de lo que se le pasó a una herramienta y de lo que devolvió, y de la evidencia entera. */
const ENTRADA = 4000
const SALIDA = 2000
const PESO_EVIDENCIA = 3 * 1024 * 1024
const corto = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max)}… (${texto.length - max} caracteres más)` : texto)

/**
 * Cuándo acabó de trabajar un turno. Al que lo cortó una caída lo cierra Sloth al volver a abrirse, quizá un día
 * después: ese cuenta hasta lo último que se supo de él (`visto`), no hasta su cierre.
 */
const finDe = (e: Extract<AgentEvent, { t: 'turn_end' }>, visto: number) => (e.caida || /^el servidor se cerró/.test(e.error ?? '') ? visto : e.at)

/**
 * La evidencia de una prueba (`EvidenciaEstilo`): el hilo completo donde se hizo el video, hasta el turno en que quedó
 * terminado. Lo que se dijo va entero; lo de cada herramienta, recortado, y si aun así pesa de más, sin lo que
 * devolvieron. La leen su autor y el creador, con «Ver la evidencia» en la publicación del estilo.
 */
export function evidenciaDelHilo(eventos: AgentEvent[], modelo: string, titulo: string, terminado: number): EvidenciaEstilo {
  const pasos: PasoEvidencia[] = []
  const textos = new Map<string, Extract<PasoEvidencia, { t: 'agente' }>>()
  const herramientas = new Map<string, Extract<PasoEvidencia, { t: 'herramienta' }>>()
  let inicio: number | undefined
  let visto = 0
  for (const e of eventos) {
    if (e.t === 'thinking' && e.at) visto = Math.max(visto, e.at)
    if (e.t === 'turn_start') {
      if (e.at > terminado) break
      inicio = visto = e.at
    } else if (e.t === 'user') {
      if (e.at > terminado) break
      pasos.push({ t: 'usuario', texto: e.text })
    } else if (e.t === 'text' && !e.parent) {
      // Los trozos de una misma respuesta llegan sueltos: van juntos.
      const paso = textos.get(e.id) ?? { t: 'agente' as const, texto: '' }
      if (!textos.has(e.id)) (textos.set(e.id, paso), pasos.push(paso))
      paso.texto += e.delta
    } else if (e.t === 'tool') {
      const paso = { t: 'herramienta' as const, nombre: e.name, entrada: corto(typeof e.input === 'string' ? e.input : JSON.stringify(e.input ?? '', null, 2), ENTRADA) }
      herramientas.set(e.id, paso)
      pasos.push(paso)
    } else if (e.t === 'tool_update') {
      const paso = herramientas.get(e.id)
      if (!paso) continue
      if (e.output !== undefined) paso.salida = corto(e.output, SALIDA)
      else if (e.delta && (paso.salida?.length ?? 0) < SALIDA) paso.salida = corto((paso.salida ?? '') + e.delta, SALIDA)
      if (e.error) paso.error = true
    } else if (e.t === 'turn_end' && inicio !== undefined) {
      pasos.push({ t: 'turno', segundos: Math.round(Math.max(0, finDe(e, visto) - inicio) / 1000), costo: e.costUsd ?? 0, ok: e.ok, ...(e.error ? { error: e.error } : {}) })
      inicio = undefined
    }
  }
  const evidencia: EvidenciaEstilo = { version: 1, titulo, modelo, pasos }
  if (JSON.stringify(evidencia).length > PESO_EVIDENCIA) for (const p of pasos) if (p.t === 'herramienta') delete p.salida
  return evidencia
}

/** Lo que usó de Sloth, por el nombre de cada herramienta y lo que se le pasó. Tu voz grabada no deja rastro: la dice su autor. */
function usaDe(nombre: string, entrada: string): string[] {
  const usa: string[] = []
  if (/generar_imagen/.test(nombre)) usa.push('flow-imagenes')
  if (/generar_video/.test(nombre)) usa.push('flow-clips')
  if (/generar_voz/.test(nombre)) usa.push('voz-ia')
  if (/browser_/.test(nombre)) usa.push('internet')
  if (/^(Bash|PowerShell|shell|exec|Write|Edit|apply_patch)/i.test(nombre)) usa.push('codigo')
  if (/portada_ia\.py\W+chatgpt|--imagenes\W+chatgpt/.test(entrada)) usa.push('chatgpt')
  if (/modelos-3d|modelos\.py/.test(entrada)) usa.push('modelos-3d')
  return usa
}

/**
 * La prueba de un video: `eventos` y `modelo` son los de su hilo; `terminado`, cuándo quedó el archivo (ms); `dura`, sus
 * segundos. Nada si el hilo no tiene ningún turno cerrado antes de eso.
 */
export function pruebaDelHilo(eventos: AgentEvent[], modelo: string, terminado: number, dura?: number): PruebaEstilo | undefined {
  const turnos: { segundos: number; costo: number; herramientas: number }[] = []
  const usa = new Set<string>()
  let inicio: number | undefined
  let visto = 0
  let herramientas = 0
  for (const e of eventos) {
    if (e.t === 'thinking' && e.at) visto = Math.max(visto, e.at)
    if (e.t === 'turn_start') {
      // El turno en que se terminó cuenta entero: el archivo se escribe a la mitad, y lo que sigue (medirlo, su portada) es parte de hacerlo.
      if (e.at > terminado) break
      inicio = visto = e.at
      herramientas = 0
    } else if (e.t === 'tool' && inicio !== undefined) {
      herramientas++
      for (const u of usaDe(e.name, typeof e.input === 'string' ? e.input : JSON.stringify(e.input ?? ''))) usa.add(u)
    } else if (e.t === 'turn_end' && inicio !== undefined) {
      turnos.push({ segundos: Math.max(0, (finDe(e, visto) - inicio) / 1000), costo: e.costUsd ?? 0, herramientas })
      inicio = undefined
    }
  }
  if (!turnos.length) return undefined
  const pedido = eventos.find((e): e is Extract<AgentEvent, { t: 'user' }> => e.t === 'user')?.text ?? ''
  return pruebaDe({
    agente: proveedorDe(modelo),
    modelo: modelo.includes(':') ? modelo.slice(modelo.indexOf(':') + 1) : modelo,
    costo: turnos.reduce((s, t) => s + t.costo, 0),
    segundos: turnos.reduce((s, t) => s + t.segundos, 0),
    video: dura,
    // Las líneas que añade Sloth (la carpeta, los subagentes) no son lo que pidió.
    hilo: { pedido: pedido.replace(/^(Carpeta|Subagentes): .*$/gm, ''), turnos, usa: [...usa] }
  })
}
