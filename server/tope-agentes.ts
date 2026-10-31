import { freemem, totalmem } from 'node:os'

/**
 * Cuántos subagentes de Claude trabajan a la vez en toda la máquina, sumando los hilos (ADR 0011): uno por cada 2 GB, y uno
 * más no empieza con menos de `LIBRE` libres, salvo que no haya ninguno: si no, se esperaría para siempre. Sin esto, cada
 * hilo lanzaba los suyos en un mismo mensaje: 36 a la vez en 16 GB. No le dicen al agente que espere: su herramienta tarda
 * más en arrancar (`startClaude`). Codex ya trae su tope y OpenCode no tiene por dónde frenarlo.
 */
export const TOPE_AGENTES = Math.max(3, Math.floor(totalmem() / 2e9))
const LIBRE = 1.5e9
/** Cada cuánto se vuelve a mirar la memoria con alguien esperando: se libera sin que nada lo avise. */
const MIRAR = 5000

export function crearTope(tope = TOPE_AGENTES, memoria: () => number = freemem) {
  let ocupados = 0
  let reloj: ReturnType<typeof setTimeout> | undefined
  // Un Set guarda el orden de llegada y deja salir de en medio al que se cansa de esperar.
  const fila = new Set<() => void>()
  const repartir = () => {
    clearTimeout(reloj)
    for (const entrar of fila) {
      if (ocupados >= tope || (ocupados > 0 && memoria() < LIBRE)) break
      ocupados++
      fila.delete(entrar)
      entrar()
    }
    if (fila.size) (reloj = setTimeout(repartir, MIRAR)).unref()
  }
  return {
    /** Espera su sitio. false si `signal` lo canceló antes: entonces no hay nada que soltar. */
    pedir(signal?: AbortSignal): Promise<boolean> {
      return new Promise((listo) => {
        if (signal?.aborted) return listo(false)
        const entrar = () => (signal?.removeEventListener('abort', irse), listo(true))
        const irse = () => (fila.delete(entrar), listo(false))
        signal?.addEventListener('abort', irse, { once: true })
        fila.add(entrar)
        repartir()
      })
    },
    soltar() {
      ocupados = Math.max(0, ocupados - 1)
      repartir()
    }
  }
}

const maquina = crearTope()

/** Cuánto se espera a que arranque el subagente al que un `SendMessage` despertó. */
const GRACIA = 5000

/** Los sitios de un proceso de Claude, por el id de la herramienta: al cerrarse el proceso se sueltan los que le quedaban. */
export function sitiosDeAgente(tope: Pick<typeof maquina, 'pedir' | 'soltar'> = maquina, gracia = GRACIA) {
  const mios = new Set<string>()
  const arrancados = new Set<string>()
  let cerrado = false
  return {
    async pedir(id: string, signal?: AbortSignal) {
      if (!(await tope.pedir(signal))) return
      if (cerrado) tope.soltar()
      else mios.add(id)
    },
    soltar(id: string) {
      arrancados.delete(id)
      if (mios.delete(id)) tope.soltar()
    },
    arranco(id: string) {
      arrancados.add(id)
    },
    /**
     * Un `SendMessage` despierta a un subagente dormido, que trabaja como uno nuevo (12 de golpe pasaron el tope en la
     * prueba del ADR 0011), o solo le deja un recado a uno que sigue, y entonces nada arranca ni avisa al acabar.
     */
    siNoArranca(id: string) {
      setTimeout(() => arrancados.has(id) || this.soltar(id), gracia).unref()
    },
    cerrar() {
      cerrado = true
      for (const id of mios) this.soltar(id)
    }
  }
}
