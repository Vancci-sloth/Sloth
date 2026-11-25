// Manda un aviso por correo a quienes apoyan hoy o tienen un lugar gratis de por vida (`POST /aviso-correo` del cobro,
// licencias/src/aviso-correo.ts), una vez a cada quien. Usa la llave del creador, como `node scripts/bajar-apoyo.mjs`.
//   node scripts/aviso-correo.mjs <aviso> --probar           a quiénes les falta, sin mandar nada
//   node scripts/aviso-correo.mjs <aviso> --prueba [correo]  solo a ese correo (o a soporte), para verlo antes
//   node scripts/aviso-correo.mjs <aviso>                    a todos los que faltan, de 10 en 10
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [aviso, opcion, correo] = process.argv.slice(2)
if (!aviso) {
  console.log('Uso: node scripts/aviso-correo.mjs <aviso> [--probar | --prueba [correo]]')
  process.exit(1)
}
const llave = (
  process.env.SLOTH_ADMIN ||
  ['admin.txt', 'publicar.txt'].map((a) => join(process.env.APPDATA ?? '', 'sloth', 'licencias', a)).flatMap((r) => (existsSync(r) ? [readFileSync(r, 'utf8')] : []))[0] ||
  ''
).trim()

async function pedir(cuerpo) {
  const r = await fetch('https://api.sloth.vancci.org/aviso-correo', {
    method: 'POST',
    headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ aviso, ...cuerpo })
  })
  const d = await r.json()
  if (!r.ok) {
    console.error(d.error ?? r.status)
    process.exit(1)
  }
  return d
}

if (opcion === '--probar') {
  const d = await pedir({ probar: true })
  for (const e of d.emails) console.log(e)
  console.log(`${d.quedan} por mandar.`)
} else if (opcion === '--prueba') {
  const d = await pedir({ prueba: correo || true })
  console.log(d.salio ? `Prueba mandada a ${d.prueba}.` : `La prueba a ${d.prueba} no salió.`)
} else {
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const d = await pedir({})
    for (const h of d.hechos) console.log(`${h.email}  ${h.salio ? 'mandado' : `NO SALIÓ${h.error ? `: ${h.error}` : ''}`}`)
    // Si en una vuelta nada salió, no se insiste: se mira el error.
    if (!d.quedan || !d.hechos.some((h) => h.salio)) {
      console.log(`${d.quedan} por mandar.`)
      break
    }
  }
}
