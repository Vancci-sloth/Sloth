import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { rutaAgente } from './agentes.ts'
import { cuentaCodex } from './cuenta-codex.ts'
import { perfilActivo } from './perfiles-agentes.ts'

/** Usa la misma cuenta que el compositor de video. Busca el resultado solo en el hilo de este pedido. */
export async function imagenCodex(prompt: string, formato: string, cwd: string, referencia?: string) {
  const exe = rutaAgente('codex')
  const perfil = perfilActivo('codex')
  if (!exe || !(await cuentaCodex()).conectada) throw new Error('Conecta tu cuenta de ChatGPT en Opciones → Agentes de IA.')
  if (perfil !== perfilActivo('codex')) throw new Error('Cambió la cuenta de ChatGPT. Vuelve a intentar.')
  const env = { ...process.env }
  for (const clave of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_IDENTITY_TOKEN_FILE', 'OPENAI_FEDERATION_RULE_ID']) delete env[clave]
  if (perfil) env.CODEX_HOME = perfil
  const args = ['exec', '--skip-git-repo-check', '--json', '-s', 'read-only', '-C', cwd,
    '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"']
  if (perfil) args.push('-c', 'cli_auth_credentials_store="file"')
  if (referencia) args.push('-i', referencia)
  args.push('-')
  const salida = await new Promise<string>((ok, fallo) => {
    const proceso = execFile(exe, args, { env, windowsHide: true, timeout: 240_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) fallo(new Error('ChatGPT no completó la generación. Comprueba que tu cuenta tenga cuota de imágenes.'))
      else ok(stdout)
    })
    proceso.stdin?.on('error', () => {})
    const accion = referencia ? 'editar la imagen adjunta y producir una sola versión' : 'generar exactamente una imagen'
    proceso.stdin?.end(`Usa tu herramienta image_gen para ${accion}. Proporción solicitada: ${formato}. No ejecutes comandos ni dibujes con código.\n\n${prompt}`, 'utf8')
  })
  let hilo = ''
  for (const linea of salida.split(/\r?\n/)) {
    try {
      const evento = JSON.parse(linea)
      if (evento.type === 'thread.started' && typeof evento.thread_id === 'string') hilo = evento.thread_id
    } catch { /* La salida puede incluir mensajes de diagnóstico. */ }
  }
  if (!/^[a-f0-9-]{36}$/i.test(hilo)) throw new Error('ChatGPT no identificó el hilo de la imagen.')
  const carpeta = join(env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', hilo)
  const archivos = await readdir(carpeta).catch(() => [])
  const png = archivos.filter((nombre) => /\.png$/i.test(nombre))
  if (png.length !== 1) throw new Error('ChatGPT no entregó una única imagen para este pedido.')
  return readFile(join(carpeta, png[0]))
}
