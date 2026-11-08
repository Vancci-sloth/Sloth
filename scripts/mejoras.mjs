// Las mejoras que pidió la comunidad y que aún no están hechas, y avisarle a quien la pidió que ya salió. Lo usa el agente
// que publica una versión (docs/agents/publicacion.md, paso 5), con la llave del creador
// (%APPDATA%\sloth\licencias\admin.txt): el comentario va a nombre de Vancci y la mejora queda «hecha», y a quien la
// pidió le llegan los dos avisos.
//   node scripts/mejoras.mjs                          las que faltan, con su id y sus comentarios
//   node scripts/mejoras.mjs <id> <archivo> [--probar]  comenta el texto del archivo y la marca hecha
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const COBRO = 'https://api.sloth.vancci.org'
const [id, archivo] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const LLAVE = llaveDelCreador()

function llaveDelCreador() {
  const env = (process.env.SLOTH_ADMIN || '').trim()
  if (env) return env
  try {
    return readFileSync(join(process.env.APPDATA ?? '', 'sloth', 'licencias', 'admin.txt'), 'utf8').trim()
  } catch {
    console.error('Falta la llave del creador: %APPDATA%\\sloth\\licencias\\admin.txt.')
    process.exit(1)
  }
}

async function comunidad(ruta, cuerpo) {
  const r = await fetch(`${COBRO}/comunidad${ruta}`, {
    method: cuerpo ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${LLAVE}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo && JSON.stringify(cuerpo)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`La comunidad respondió ${r.status}: ${j.error ?? ''}`)
  return j
}

if (!id) {
  // Las que faltan, de las más recientes hacia atrás (hasta 10 páginas).
  let antes = ''
  for (let i = 0; i < 10; i++) {
    const { publicaciones } = await comunidad(`?categoria=mejoras${antes ? `&antes=${antes}` : ''}`)
    if (!publicaciones.length) break
    for (const p of publicaciones.filter((x) => x.estado !== 'hecha')) {
      console.log(`\n${p.id} · ${p.autor.nombre}${p.estado ? ` · ${p.estado}` : ''}\n  ${[p.titulo, p.texto].filter(Boolean).join(' — ').replace(/\n+/g, ' ')}`)
      if (p.comentarios) for (const c of (await comunidad(`/p/${p.id}`)).comentarios) console.log(`    ${c.autor.nombre}: ${c.texto.replace(/\n+/g, ' ')}`)
    }
    antes = publicaciones.at(-1).actividad
  }
  process.exit(0)
}

if (!archivo) {
  console.error('Uso: node scripts/mejoras.mjs <id> <archivo> [--probar]')
  process.exit(1)
}
const texto = readFileSync(archivo, 'utf8').replace(/\r\n/g, '\n').trim()
const { publicacion, comentarios } = await comunidad(`/p/${id}`)
if (comentarios.some((c) => c.autor.creador && c.texto.trim() === texto)) {
  console.log('Ese comentario ya está.')
} else if (process.argv.includes('--probar')) {
  console.log(`Comentaría en la mejora de ${publicacion.autor.nombre} («${publicacion.texto}») y la marcaría hecha:\n\n${texto}`)
  process.exit(0)
} else {
  await comunidad(`/p/${id}/comentar`, { texto })
  console.log(`Comenté en la mejora de ${publicacion.autor.nombre}.`)
}
if (publicacion.estado !== 'hecha') {
  await comunidad(`/p/${id}`, { estado: 'hecha' })
  console.log('La marqué hecha.')
}
