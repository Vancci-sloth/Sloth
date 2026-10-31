import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'

/**
 * Un agente que habla JSON-RPC 2.0, un mensaje por línea, por su entrada y su salida: los de ACP (Grok, Antigravity) y
 * Muse. Como `CodexRpc`, pero también contesta lo que el agente le pregunta a Sloth (`alPedir`).
 *
 * Las líneas se parten solo en `\n`: `readline` también parte en U+2028 y U+2029, que llegan dentro del texto del modelo
 * (T3 Code, `provider-pi/rpc.ts`). Lo que no es JSON (avisos del programa) va a `alTexto`.
 */
export class RpcLineas {
  readonly proc: ChildProcessWithoutNullStreams
  private siguiente = 0
  private pendientes = new Map<number, { ok(value: unknown): void; mal(error: Error): void; reloj?: ReturnType<typeof setTimeout> }>()
  private resto = ''
  /** El final de lo que escribió en stderr, para decir por qué se cerró. */
  private errores = ''
  terminado = false

  constructor(
    private nombre: string,
    command: string,
    args: string[],
    opciones: { cwd: string; env: NodeJS.ProcessEnv },
    private eventos: {
      alAvisar(method: string, params: any): void
      /** Lo que pide el agente: lo que devuelva es la respuesta; si falla, el error. */
      alPedir(method: string, params: any): unknown | Promise<unknown>
      alCerrar(error?: Error): void
      /** Una línea que no es del protocolo (Antigravity escribe ahí el enlace para iniciar sesión). */
      alTexto?(linea: string): void
    }
  ) {
    this.proc = spawn(command, args, { ...opciones, windowsHide: true, stdio: 'pipe' })
    this.proc.stdout.setEncoding('utf8')
    this.proc.stdout.on('data', (d: string) => this.leer(d))
    this.proc.stderr.setEncoding('utf8')
    this.proc.stderr.on('data', (d: string) => {
      this.errores = (this.errores + d).slice(-4000)
      for (const linea of d.split('\n')) if (linea.trim()) this.eventos.alTexto?.(linea.trim())
    })
    this.proc.on('error', (e) => this.finalizar(e))
    this.proc.on('exit', (code) => this.finalizar(new Error(`${this.nombre} se cerró (código ${code})${this.ultimoError()}.`), false))
    this.proc.stdin.on('error', (e) => this.finalizar(e))
  }

  /** La última línea de stderr, para el mensaje de error. */
  private ultimoError() {
    const linea = this.errores.trim().split('\n').pop()?.trim()
    return linea ? `: ${linea.slice(0, 300)}` : ''
  }

  private leer(trozo: string) {
    this.resto += trozo
    let i
    while ((i = this.resto.indexOf('\n')) >= 0) {
      const linea = this.resto.slice(0, i).replace(/\r$/, '')
      this.resto = this.resto.slice(i + 1)
      if (!linea.trim()) continue
      let m: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message: string; data?: unknown } }
      try {
        m = JSON.parse(linea)
      } catch {
        this.eventos.alTexto?.(linea.trim())
        continue
      }
      if (m.method && m.id !== undefined) void this.contestar(m.id, m.method, m.params)
      else if (m.method) this.eventos.alAvisar(m.method, m.params)
      else if (typeof m.id === 'number') {
        const p = this.pendientes.get(m.id)
        if (!p) continue
        clearTimeout(p.reloj)
        this.pendientes.delete(m.id)
        if (m.error) p.mal(Object.assign(new Error(m.error.message + (typeof m.error.data === 'string' ? ` (${m.error.data})` : '')), { code: m.error.code }))
        else p.ok(m.result)
      }
    }
  }

  private async contestar(id: number | string, method: string, params: unknown) {
    try {
      this.escribir({ jsonrpc: '2.0', id, result: (await this.eventos.alPedir(method, params)) ?? null })
    } catch (e) {
      this.escribir({ jsonrpc: '2.0', id, error: { code: -32601, message: e instanceof Error ? e.message : String(e) } })
    }
  }

  private escribir(m: unknown) {
    if (!this.terminado) this.proc.stdin.write(JSON.stringify(m) + '\n')
  }

  /** Sin `espera` (o con 0), espera lo que tarde: un turno puede durar horas. */
  request<T = any>(method: string, params: unknown = {}, espera = 60_000): Promise<T> {
    if (this.terminado) return Promise.reject(new Error(`${this.nombre} ya está cerrado.`))
    const id = ++this.siguiente
    return new Promise<T>((ok, mal) => {
      const reloj = espera
        ? setTimeout(() => {
            this.pendientes.delete(id)
            mal(new Error(`${this.nombre} no contestó a tiempo (${method}).`))
          }, espera)
        : undefined
      this.pendientes.set(id, { ok: (value) => ok(value as T), mal, reloj })
      this.escribir({ jsonrpc: '2.0', id, method, params })
    })
  }

  notify(method: string, params: unknown = {}) {
    this.escribir({ jsonrpc: '2.0', method, params })
  }

  /**
   * Cierra el agente y lo que lanzó (sus MCP, sus comandos). `esperar`, al salir Sloth: lo que se lanza sin esperar no
   * alcanza a terminar el árbol y deja vivos a sus hijos.
   */
  close(esperar = false) {
    this.finalizar(undefined, true, esperar)
  }

  private finalizar(error?: Error, matar = true, esperar = false) {
    if (this.terminado) return
    this.terminado = true
    for (const p of this.pendientes.values()) {
      clearTimeout(p.reloj)
      p.mal(error ?? new Error(`Se cerró ${this.nombre}.`))
    }
    this.pendientes.clear()
    if (matar) matarArbol(this.proc, esperar)
    this.eventos.alCerrar(error)
  }
}

/** En Windows, kill() deja vivos los MCP y los comandos hijos: se termina el árbol entero. */
export function matarArbol(proc: { pid?: number; exitCode: number | null; signalCode: NodeJS.Signals | null; kill(): boolean }, esperar = false) {
  if (!proc.pid || proc.exitCode !== null || proc.signalCode !== null) return
  if (process.platform !== 'win32') return void proc.kill()
  const args = ['/PID', String(proc.pid), '/T', '/F']
  if (esperar) spawnSync('taskkill', args, { windowsHide: true, stdio: 'ignore', timeout: 5000 })
  else spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' }).on('error', () => proc.kill())
}
