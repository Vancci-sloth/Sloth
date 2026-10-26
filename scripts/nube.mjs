// wrangler para la nube de Sloth (`nube/`), con su propia sesión de Cloudflare (la cuenta de Sloth) en %APPDATA%\sloth,
// sin tocar la de otras cuentas de esta computadora. Uso: `npm run nube -- login`, `npm run nube -- deploy`. Con
// `--licencias` primero (`npm run licencias -- deploy`), el cobro de la suscripción (`licencias/`).
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const args = process.argv.slice(2)
const carpeta = args[0] === '--licencias' ? (args.shift(), 'licencias') : 'nube'
// La cuenta de Cloudflare no va en el repo: es SLOTH_CLOUDFLARE_CUENTA, en las variables de quien despliega.
const cuenta = process.env.SLOTH_CLOUDFLARE_CUENTA
const env = { ...process.env, XDG_CONFIG_HOME: join(process.env.APPDATA ?? '', 'sloth'), ...(cuenta ? { CLOUDFLARE_ACCOUNT_ID: cuenta } : {}) }
// En Windows, npx es un .cmd y necesita la consola: va como un solo comando.
spawn(['npx --yes wrangler@4', ...args].join(' '), { cwd: join(import.meta.dirname, '..', carpeta), env, stdio: 'inherit', shell: true }).on('exit', (code) =>
  process.exit(code ?? 0)
)
