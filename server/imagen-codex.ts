/**
 * Una imagen con ChatGPT para el estudio de Imágenes (`/api/flow/estudio`): `codex exec` con la cuenta de ChatGPT
 * activa de Opciones (nunca con una llave de API) le pide a su herramienta `image_gen` una sola imagen, o editar la de
 * `referencia`, y se toma la que dejó en `generated_images/<hilo>` de ese mismo pedido.
 */
import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { rutaAgente } from './agentes.ts'
import { cuentaCodex } from './cuenta-codex.ts'
import { perfilActivo } from './perfiles-agentes.ts'

export async function imagenCodex(prompt: string, formato: string, cwd: string, referencia?: string) {
  const exe = rutaAgente('codex')
  if (!exe || !(await cuentaCodex()).conectada) throw new Error('Conecta tu cuenta de ChatGPT en Opciones → Agentes.')
  const env = { ...process.env }
  for (const clave of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'OPENAI_IDENTITY_TOKEN_FILE', 'OPENAI_FEDERATION_RULE_ID']) delete env[clave]
  // Con una cuenta agregada, su carpeta y su sesión en archivo (`codex-rpc.ts`).
  const perfil = perfilActivo('codex')
  if (perfil) env.CODEX_HOME = perfil
  const args = ['exec', '--skip-git-repo-check', '--json', '-s', 'read-only', '-C', cwd, '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"', ...(perfil ? ['-c', 'cli_auth_credentials_store="file"'] : [])]
  if (referencia) args.push('-i', referencia)
  args.push('-')
  const salida = await new Promise<string>((ok, fallo) => {
    const proceso = execFile(exe, args, { env, windowsHide: true, timeout: 240_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) fallo(new Error('ChatGPT no terminó la imagen. Mira que a tu cuenta le quede cuota de imágenes.'))
      else ok(stdout)
    })
    proceso.stdin?.on('error', () => {})
    const accion = referencia ? 'editar la imagen adjunta y entregar una sola versión' : 'generar exactamente una imagen'
    proceso.stdin?.end(`Usa tu herramienta image_gen para ${accion}. Proporción pedida: ${formato}. No corras comandos ni dibujes con código.\n\n${prompt}`, 'utf8')
  })
  let hilo = ''
  for (const linea of salida.split(/\r?\n/)) {
    try {
      const evento = JSON.parse(linea)
      if (evento.type === 'thread.started' && typeof evento.thread_id === 'string') hilo = evento.thread_id
    } catch {
      // Entre los eventos van también sus mensajes de diagnóstico.
    }
  }
  if (!/^[a-f0-9-]{36}$/i.test(hilo)) throw new Error('ChatGPT no dijo en qué hilo dejó la imagen.')
  const carpeta = join(env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', hilo)
  const png = (await readdir(carpeta).catch(() => [])).filter((nombre) => /\.png$/i.test(nombre))
  if (png.length !== 1) throw new Error('ChatGPT no entregó una sola imagen para este pedido.')
  return readFile(join(carpeta, png[0]))
}
