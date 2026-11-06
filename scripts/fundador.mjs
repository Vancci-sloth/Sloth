// Los enlaces de invitación de Fundador (`enlaces_fundador` del cobro, `licencias/`): con uno, sloth.vancci.org ofrece el
// apoyo de Fundador mientras queden lugares; sin él, solo «Lo que gustes» y el grande. Un enlace sirve para todos los que
// lo abran. Usa la sesión de Cloudflare de Sloth, como `npm run licencias`.
//   npm run fundador -- nuevo [nota]     da un enlace nuevo (la nota dice para quién o dónde se dio)
//   npm run fundador -- lista            los enlaces que se han dado
//   npm run fundador -- revocar <codigo> ese enlace deja de servir
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const [orden, ...resto] = process.argv.slice(2)
const env = { ...process.env, XDG_CONFIG_HOME: join(process.env.APPDATA ?? '', 'sloth') }
if (process.env.SLOTH_CLOUDFLARE_CUENTA) env.CLOUDFLARE_ACCOUNT_ID = process.env.SLOTH_CLOUDFLARE_CUENTA

/** Corre `sql` en la base remota del cobro. Va entre comillas dobles en la consola: el SQL no lleva ninguna. */
function d1(sql) {
  const r = spawnSync(`npx --yes wrangler@4 d1 execute sloth-licencias --remote --json --command "${sql}"`, {
    cwd: join(import.meta.dirname, '..', 'licencias'),
    env,
    shell: true,
    encoding: 'utf8'
  })
  try {
    return JSON.parse(r.stdout)[0].results
  } catch {
    console.error(r.stdout, r.stderr)
    process.exit(1)
  }
}

const enlace = (codigo) => `https://sloth.vancci.org/?fundador=${codigo}#apoyar`

if (orden === 'nuevo') {
  const codigo = randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).padEnd(12, 'x')
  // Solo letras, números y espacios: así no rompe las comillas del SQL ni de la consola.
  const nota = resto.join(' ').replace(/[^\p{L}\p{N} ]/gu, '').slice(0, 80)
  d1(`INSERT INTO enlaces_fundador (codigo, nota, creado) VALUES ('${codigo}', '${nota}', '${new Date().toISOString()}')`)
  console.log(enlace(codigo))
} else if (orden === 'lista') {
  const filas = d1(
    "SELECT codigo, nota, substr(creado, 1, 10) AS creado, revocado IS NOT NULL AS revocado FROM enlaces_fundador ORDER BY creado"
  )
  if (!filas.length) console.log('Aún no hay enlaces.')
  for (const f of filas) console.log(`${f.revocado ? '(revocado) ' : ''}${f.creado}  ${f.nota || 'sin nota'}\n  ${enlace(f.codigo)}`)
} else if (orden === 'revocar' && /^[A-Za-z0-9]{8,32}$/.test(resto[0] ?? '')) {
  d1(`UPDATE enlaces_fundador SET revocado = '${new Date().toISOString()}' WHERE codigo = '${resto[0]}'`)
  console.log(`Revocado: ${resto[0]}`)
} else {
  console.log('Uso: npm run fundador -- nuevo [nota] | lista | revocar <codigo>')
}
