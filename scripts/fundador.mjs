// Los enlaces de invitación de Fundador (`enlaces_fundador` del cobro, `licencias/`): con uno, sloth.vancci.org ofrece el
// apoyo de Fundador; sin él, solo «Lo que gustes» y el grande. Cada enlace es de una sola persona: con su primer pago deja
// de servir. Usa la sesión de Cloudflare de Sloth, como `npm run licencias`.
//   npm run fundador -- nuevo [nota]     da un enlace nuevo (la nota dice para quién es)
//   npm run fundador -- lista            los enlaces que se han dado, y quién usó cada uno
//   npm run fundador -- revocar <codigo> ese enlace deja de servir
//   npm run fundador -- dar <correo> [meses]  Fundador por esos meses (1 si no se dice) a quien apoyó por transferencia,
//                                        con su clave por correo. Si ya tiene uno así, se le suman y conserva la clave;
//                                        con 0 meses, solo se le vuelve a mandar. Usa la llave de `npm run publicar`.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
    'SELECT e.codigo, e.nota, substr(e.creado, 1, 10) AS creado, e.revocado IS NOT NULL AS revocado, l.email FROM enlaces_fundador e LEFT JOIN licencias l ON l.id = e.usado ORDER BY e.creado'
  )
  if (!filas.length) console.log('Aún no hay enlaces.')
  for (const f of filas) {
    const estado = f.email ? `usado por ${f.email}` : f.revocado ? 'revocado' : 'sin usar'
    console.log(`${f.creado}  ${f.nota || 'sin nota'}  (${estado})\n  ${enlace(f.codigo)}`)
  }
} else if (orden === 'revocar' && /^[A-Za-z0-9]{8,32}$/.test(resto[0] ?? '')) {
  d1(`UPDATE enlaces_fundador SET revocado = '${new Date().toISOString()}' WHERE codigo = '${resto[0]}'`)
  console.log(`Revocado: ${resto[0]}`)
} else if (orden === 'dar' && resto[0]) {
  const llave = (process.env.PUBLICAR || readFileSync(join(process.env.APPDATA ?? '', 'sloth', 'licencias', 'publicar.txt'), 'utf8')).trim()
  const r = await fetch('https://api.sloth.vancci.org/a-mano', {
    method: 'POST',
    headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: resto[0], meses: resto[1] === undefined ? 1 : Number(resto[1]) })
  })
  const d = await r.json()
  if (!r.ok) {
    console.error(d.error ?? r.status)
    process.exit(1)
  }
  console.log(`${resto[0]}: Fundador hasta el ${d.hasta.slice(0, 10)}, clave ${d.clave}${d.enviado ? ', mandada por correo' : ' (el correo no salió)'}`)
} else {
  console.log('Uso: npm run fundador -- nuevo [nota] | lista | revocar <codigo> | dar <correo> [meses]')
}
