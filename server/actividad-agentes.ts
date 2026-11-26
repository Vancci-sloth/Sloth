import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { DIAS_ACTIVIDAD, fechaActividad, type ActividadDiaria } from '../shared/actividad-agentes.ts'
import { NOMBRE_AGENTE, PROVEEDORES, proveedorDe, type Proveedor } from '../shared/providers.ts'
import type { AgentEvent, SessionMeta } from '../shared/types.ts'

const traspasos = new Map(PROVEEDORES.map(p => [NOMBRE_AGENTE[p], p]))

function sumar(dias: Map<string, ActividadDiaria>, uso: ActividadDiaria) {
  const clave = `${uso.fecha}/${uso.modelo ?? ''}`
  const previo = dias.get(clave)
  if (!previo) {
    dias.set(clave, uso)
    return
  }
  previo.turnos += uso.turnos
  previo.turnosFallidos += uso.turnosFallidos
  previo.turnosConTokens += uso.turnosConTokens
  previo.input += uso.input
  previo.output += uso.output
  previo.cacheRead += uso.cacheRead
}

/** Lee solo los cierres y los traspasos. En el historial antiguo se puede recuperar el agente, pero no el modelo. */
export function actividadAgentes(dir: string, hilos: () => SessionMeta[]) {
  let guardado: { hasta: number; resultado: Promise<Map<Proveedor, Map<string, ActividadDiaria>>> } | undefined

  async function leer(desde: number) {
    const porAgente = new Map(PROVEEDORES.map(p => [p, new Map<string, ActividadDiaria>()]))
    for (const hilo of hilos()) {
      if (hilo.updatedAt < desde) continue
      const anterior = new Map<string, ActividadDiaria>()
      function atribuir(p: Proveedor) {
        for (const uso of anterior.values()) sumar(porAgente.get(p)!, uso)
        anterior.clear()
      }
      const input = createReadStream(join(dir, `${hilo.id}.jsonl`))
      const lineas = createInterface({ input, crlfDelay: Infinity })
      try {
        for await (const linea of lineas) {
          if (!linea.startsWith('{"t":"turn_end"') && !linea.startsWith('{"t":"info","text":"El hilo pasa de ')) continue
          let evento: AgentEvent
          try { evento = JSON.parse(linea) } catch { continue }
          if (evento.t === 'info') {
            const nombre = /^El hilo pasa de (.+?) a .+: tu próximo mensaje/.exec(evento.text)?.[1]
            const p = nombre && traspasos.get(nombre)
            if (p) atribuir(p)
            continue
          }
          if (evento.t !== 'turn_end' || !Number.isFinite(evento.at) || evento.at < desde) continue
          const { model, agente, tokens } = evento
          const p = model ? proveedorDe(model) : agente
          sumar((p && porAgente.get(p)) || anterior, {
            fecha: fechaActividad(new Date(evento.at)), modelo: model,
            turnos: 1, turnosFallidos: evento.ok ? 0 : 1, turnosConTokens: tokens ? 1 : 0,
            input: tokens?.input ?? 0, output: tokens?.output ?? 0, cacheRead: tokens?.cacheRead ?? 0
          })
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      } finally {
        lineas.close()
        input.destroy()
      }
      atribuir(proveedorDe(hilo.model))
    }
    return porAgente
  }

  return async (p: Proveedor) => {
    if (!guardado || guardado.hasta <= Date.now()) {
      const desde = new Date()
      desde.setHours(0, 0, 0, 0)
      desde.setDate(desde.getDate() - DIAS_ACTIVIDAD + 1)
      const entrada = { hasta: Infinity, resultado: leer(desde.getTime()) }
      guardado = entrada
      void entrada.resultado.then(() => { entrada.hasta = Date.now() + 30_000 }, () => { guardado = undefined })
    }
    return [...((await guardado.resultado).get(p)?.values() ?? [])]
  }
}
