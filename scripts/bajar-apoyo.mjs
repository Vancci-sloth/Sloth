// Da como tiempo lo que pagó de más quien apoyaba con más que el apoyo de hoy (`POST /bajar-apoyo` del cobro,
// licencias/src/bajar-apoyo.ts): baja su suscripción, aplaza su siguiente cobro y le manda el correo. Usa la llave del
// creador, como `npm run fundador -- dar`.
//   node scripts/bajar-apoyo.mjs <fecha ISO del cambio> --probar   qué haría con cada quien, sin tocar nada
//   node scripts/bajar-apoyo.mjs <fecha ISO del cambio> [--uno]    lo hace, de pocos en pocos (con --uno, solo uno)
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const [antes, ...opciones] = process.argv.slice(2)
if (!antes || Number.isNaN(Date.parse(antes))) {
  console.log('Uso: node scripts/bajar-apoyo.mjs <fecha ISO del cambio> [--probar | --uno]')
  process.exit(1)
}
const llave = (
  process.env.SLOTH_ADMIN ||
  ['admin.txt', 'publicar.txt'].map((a) => join(process.env.APPDATA ?? '', 'sloth', 'licencias', a)).flatMap((r) => (existsSync(r) ? [readFileSync(r, 'utf8')] : []))[0] ||
  ''
).trim()

async function pedir(cuerpo) {
  const r = await fetch('https://api.sloth.vancci.org/bajar-apoyo', {
    method: 'POST',
    headers: { authorization: `Bearer ${llave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ antes, ...cuerpo })
  })
  const d = await r.json()
  if (!r.ok) {
    console.error(d.error ?? r.status)
    process.exit(1)
  }
  return d
}

const linea = (h) =>
  `${h.email}  ${h.monto} (${h.pasarela}, ${h.accion})  +${h.dias} días: ${h.antes?.slice(0, 10)} → ${h.hasta?.slice(0, 10)}${h.error ? `  ERROR: ${h.error}` : h.avisado === false ? '  (el correo no salió)' : ''}`

if (opciones.includes('--probar')) {
  const d = await pedir({ probar: true })
  for (const h of d.filas) console.log(linea(h))
  console.log(`${d.quedan} por hacer.`)
} else {
  const uno = opciones.includes('--uno')
  for (let vuelta = 0; vuelta < 30; vuelta++) {
    const d = await pedir({ limite: uno ? 1 : 3 })
    for (const h of d.hechos) console.log(linea(h))
    // Si en una vuelta nada salió bien, no se insiste: se mira el error.
    if (uno || !d.quedan || !d.hechos.some((h) => h.avisado)) {
      console.log(`${d.quedan} por hacer.`)
      break
    }
  }
}
