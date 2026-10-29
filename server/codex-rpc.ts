import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { codexConLlave, type CodexLlave } from './acceso.ts'

/** El app-server oficial, por JSON-RPC sobre stdio. No lee ni copia las credenciales de Codex. */
export class CodexRpc {
  private proc: ChildProcessWithoutNullStreams
  private siguiente = 0
  private pendientes = new Map<number, { ok(value: unknown): void; mal(error: Error): void; reloj: ReturnType<typeof setTimeout> }>()
  private terminado = false
  readonly ready: Promise<void>

  constructor(
    private onNotification: (method: string, params: unknown) => void = () => {},
    private onExit: (error?: Error) => void = () => {},
    config: Record<string, unknown> = {},
    /** Con qué trabaja: la llave de API, o `null` para la cuenta de ChatGPT. Sin él, lo elegido en Opciones. */
    llave: CodexLlave | null = codexConLlave() ?? null
  ) {
    const destinos: Record<string, string> = {
      'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
      'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
      'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl'
    }
    const plataforma = `${process.platform}-${process.arch}`
    const destino = destinos[plataforma]
    if (!destino) throw new Error(`Codex no admite esta plataforma: ${plataforma}.`)
    const raiz = dirname(createRequire(import.meta.url).resolve(`@openai/codex-${plataforma}/package.json`))
    const exe = join(raiz, 'vendor', destino, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
    // La elección del usuario es su plan de ChatGPT, aunque tenga llaves de API en el entorno o un proveedor personalizado,
    // o la llave que eligió en Opciones (`server/acceso.ts`).
    const env = { ...process.env }
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_IDENTITY_TOKEN_FILE', 'OPENAI_FEDERATION_RULE_ID']) delete env[key]
    Object.assign(env, llave?.env)
    const ajustes = { ...config, ...(llave?.config ?? { model_provider: 'openai', forced_login_method: 'chatgpt' }) }
    const args = ['app-server', '--listen', 'stdio://', ...Object.entries(ajustes).flatMap(([key, value]) => ['-c', `${key}=${toml(value)}`])]
    this.proc = spawn(exe, args, { env, windowsHide: true, stdio: 'pipe' })
    // stderr no es el protocolo; se drena sin guardar datos de autenticación ni volcarlos a la interfaz.
    this.proc.stderr.resume()
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      let m: { id?: number | string; method?: string; params?: unknown; result?: unknown; error?: { message: string } }
      try { m = JSON.parse(line) } catch { return this.finalizar(new Error('Codex envió una respuesta que no se pudo leer.')) }
      if (m.method && m.id !== undefined) {
        // Sloth pregunta con mensajes y botones. Una herramienta interactiva desconocida no queda esperando para siempre.
        this.proc.stdin.write(JSON.stringify({ id: m.id, error: { code: -32601, message: 'Sloth no admite esta petición interactiva. Pregunta al usuario con un mensaje.' } }) + '\n')
      } else if (m.method) this.onNotification(m.method, m.params)
      else if (typeof m.id === 'number') {
        const p = this.pendientes.get(m.id)
        if (!p) return
        clearTimeout(p.reloj)
        this.pendientes.delete(m.id)
        if (m.error) p.mal(new Error(m.error.message))
        else p.ok(m.result)
      }
    })
    this.proc.on('error', (e) => this.finalizar(e))
    this.proc.on('exit', (code) => this.finalizar(new Error(`El proceso de Codex se cerró (código ${code}).`), false))
    this.proc.stdin.on('error', (e) => this.finalizar(e))
    this.ready = this.request('initialize', { clientInfo: { name: 'sloth', title: 'Sloth', version: '0.1.0' } })
      .then(() => { this.proc.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n') })
    // Puede fallar antes de que el llamador llegue a esperar la inicialización.
    void this.ready.catch(() => {})
  }

  request<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    if (this.terminado) return Promise.reject(new Error('El proceso de Codex ya está cerrado.'))
    const id = ++this.siguiente
    return new Promise<T>((ok, mal) => {
      const reloj = setTimeout(() => {
        this.pendientes.delete(id)
        mal(new Error(`Codex no contestó a tiempo (${method}).`))
        this.finalizar(new Error('Codex dejó de responder.'))
      }, 60_000)
      this.pendientes.set(id, { ok: (value) => ok(value as T), mal, reloj })
      this.proc.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  private finalizar(error?: Error, matar = true) {
    if (this.terminado) return
    this.terminado = true
    for (const p of this.pendientes.values()) { clearTimeout(p.reloj); p.mal(error ?? new Error('Se cerró Codex.')) }
    this.pendientes.clear()
    // En Windows, kill() deja vivos los MCP y comandos hijos. Solo se termina el árbol de este app-server.
    if (matar && this.proc.pid && this.proc.exitCode === null && this.proc.signalCode === null) {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(this.proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => this.proc.kill())
      else this.proc.kill()
    }
    this.onExit(error)
  }

  close() { this.finalizar() }
}

/** Los overrides del CLI son TOML; JSON solo coincide en los valores simples. */
function toml(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([key, v]) => `${JSON.stringify(key)} = ${toml(v)}`).join(', ')} }`
  return JSON.stringify(value)
}
