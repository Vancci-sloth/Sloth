// Notariza la de Mac firmada con el certificado de Apple (scripts/compilar.mjs, `afterSign`), sin quedarse esperando a
// Apple. electron-builder espera sin límite (`notarytool --wait`), y los primeros envíos de un equipo nuevo pasan días
// «In Progress»: el 8 de noviembre de 2026 la 0.4.0 se quedó así más de media hora y salió sin firma. Aquí se manda la
// app y se espera SLOTH_NOTARIZAR_MINUTOS (10 si no se dice):
// - Si Apple la acepta, se le pega el ticket (`stapler`) y abre a la primera aunque no haya internet.
// - Si no contesta a tiempo, sigue firmada sin ticket: al abrirla, macOS le pregunta a Apple, y en cuanto Apple acepta
//   ese envío abre a la primera. Hasta entonces pide «Abrir de todos modos», como la de firma local, y por eso deja
//   `sin-ticket` junto al instalador: `npm run publicar` se lo dice al cobro, que sigue explicando ese paso. Las
//   actualizaciones no cambian: van con el mismo certificado.
// - Si la rechaza, la compilación falla con el motivo de Apple: publicarla así no tendría arreglo después.
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MINUTOS = Number(process.env.SLOTH_NOTARIZAR_MINUTOS) || 10

/** Corre un programa y devuelve lo que escribió; falla con su salida si sale mal y no se pidió aguantarlo. */
function correr(programa, args, aguantar = false) {
  const r = spawnSync(programa, args, { encoding: 'utf8' })
  if (r.status !== 0 && !aguantar) throw new Error(`${programa} ${args[0]} falló:\n${r.stdout}\n${r.stderr}`)
  return r.stdout
}

/** Lo que va al resumen del job de GitHub, para que se vea sin abrir el registro. */
function resumen(texto) {
  console.log(texto)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`)
}

export async function notarizar(ctx) {
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (ctx.electronPlatformName !== 'darwin' || !process.env.CSC_LINK) return
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    throw new Error('Hay certificado de Apple (CSC_LINK) pero faltan APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD o APPLE_TEAM_ID para notarizar.')
  }
  const cuenta = ['--apple-id', APPLE_ID, '--password', APPLE_APP_SPECIFIC_PASSWORD, '--team-id', APPLE_TEAM_ID, '--output-format', 'json']
  const app = join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`)
  const sinTicket = join(ctx.outDir, 'sin-ticket')
  rmSync(sinTicket, { force: true })
  const carpeta = mkdtempSync(join(tmpdir(), 'notarizar-'))
  try {
    const zip = join(carpeta, 'Sloth.zip')
    correr('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip])
    const { id } = JSON.parse(correr('xcrun', ['notarytool', 'submit', zip, ...cuenta]))
    console.log(`Notarización: enviada a Apple (${id}); se espera hasta ${MINUTOS} min.`)
    const limite = Date.now() + MINUTOS * 60_000
    let estado = 'In Progress'
    while (estado === 'In Progress' && Date.now() < limite) {
      await new Promise((listo) => setTimeout(listo, 20_000))
      // Un tropiezo de la red no corta la espera: se vuelve a preguntar.
      const salida = correr('xcrun', ['notarytool', 'info', id, ...cuenta], true)
      try {
        estado = JSON.parse(salida).status ?? estado
      } catch {}
    }
    if (estado === 'Accepted') {
      correr('xcrun', ['stapler', 'staple', app])
      resumen(`Notarización aceptada por Apple (${id}): la de Mac abre a la primera.`)
    } else if (estado === 'In Progress') {
      writeFileSync(sinTicket, `${id}\n`)
      resumen(
        `Notarización: Apple no contestó en ${MINUTOS} min (${id}). Sale firmada con el certificado y sin ticket: ` +
          'abre a la primera en cuanto Apple acepte ese envío. Se mira con `xcrun notarytool info`.'
      )
    } else {
      const log = correr('xcrun', ['notarytool', 'log', id, ...cuenta.slice(0, -2)], true)
      throw new Error(`Apple no aceptó la notarización (${estado}, ${id}):\n${log}`)
    }
  } finally {
    rmSync(carpeta, { recursive: true, force: true })
  }
}
