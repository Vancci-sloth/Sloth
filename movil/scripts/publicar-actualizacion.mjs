// Publica una actualización de la app del celular sin sacar otro .apk (`licencias/src/actualizar-celular.ts`). La corre
// GitHub (`.github/workflows/celular.yml`, «actualizacion») después de `npx expo export` y `npx expo config`:
//   node scripts/publicar-actualizacion.mjs <dist> <config.json> [android] [--sin-subir]
// Arma el manifiesto del protocolo Expo Updates con cada archivo de <dist>, lo firma con la llave de Sloth
// (LLAVE_ACTUALIZACIONES, el secreto SLOTH_CELULAR_ACTUALIZACIONES), comprueba la firma con el certificado que trae la app
// (certificados/certificate.pem) y sube los archivos y luego el manifiesto con la llave de publicar (PUBLICAR).
// Con --sin-subir solo arma y comprueba.
import { createHash, createSign, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const sinSubir = args.includes('--sin-subir')
const [dist, rutaConfig, plataforma = 'android'] = args.filter((a) => !a.startsWith('--'))
if (!dist || !rutaConfig) throw new Error('Uso: node scripts/publicar-actualizacion.mjs <dist> <config.json> [android] [--sin-subir]')
const ORIGEN = process.env.ORIGEN ?? 'https://api.sloth.vancci.org'
const { PUBLICAR, LLAVE_ACTUALIZACIONES } = process.env
if (!LLAVE_ACTUALIZACIONES) throw new Error('Falta LLAVE_ACTUALIZACIONES (la llave privada que firma las actualizaciones).')
if (!sinSubir && !PUBLICAR) throw new Error('Falta PUBLICAR (la llave para subir al cobro).')

const TIPOS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' }

const metadata = readFileSync(join(dist, 'metadata.json'))
const expoClient = JSON.parse(readFileSync(rutaConfig, 'utf8'))
// `runtimeVersion` con la política `appVersion` es la `version` de app.json: la misma que lleva el .apk.
const rv = expoClient.runtimeVersion
const version = typeof rv === 'string' ? rv : rv?.policy === 'appVersion' ? expoClient.version : undefined
if (!version) throw new Error(`No sé resolver runtimeVersion ${JSON.stringify(rv)}: usa una cadena o la política appVersion.`)
const de = JSON.parse(metadata.toString('utf8')).fileMetadata?.[plataforma]
if (!de?.bundle) throw new Error(`El export no trae ${plataforma}.`)

function archivo(ruta, ext) {
  const datos = readFileSync(join(dist, ruta))
  const key = createHash('md5').update(datos).digest('hex')
  const meta = {
    hash: createHash('sha256').update(datos).digest('base64url'),
    key,
    contentType: ext ? (TIPOS[ext] ?? 'application/octet-stream') : 'application/javascript',
    ...(ext ? { fileExtension: `.${ext}` } : {}),
    url: `${ORIGEN}/celular/archivo/${key}`
  }
  return { datos, meta }
}

const codigo = archivo(de.bundle)
const otros = de.assets.map((a) => archivo(a.path, a.ext))
const resumen = createHash('sha256').update(metadata).update(JSON.stringify(expoClient)).digest('hex')
const manifiesto = JSON.stringify({
  id: `${resumen.slice(0, 8)}-${resumen.slice(8, 12)}-${resumen.slice(12, 16)}-${resumen.slice(16, 20)}-${resumen.slice(20, 32)}`,
  createdAt: new Date().toISOString(),
  runtimeVersion: version,
  launchAsset: codigo.meta,
  assets: otros.map((a) => a.meta),
  metadata: {},
  extra: { expoClient }
})
const sig = createSign('RSA-SHA256').update(manifiesto, 'utf8').sign(LLAVE_ACTUALIZACIONES, 'base64')
const certificado = readFileSync(new URL('../certificados/certificate.pem', import.meta.url), 'utf8')
if (!createVerify('RSA-SHA256').update(manifiesto, 'utf8').verify(certificado, sig, 'base64'))
  throw new Error('La llave no va con certificados/certificate.pem: las apps la rechazarían.')
const firma = `sig="${sig}", keyid="main"`
const pesa = [codigo, ...otros].reduce((n, a) => n + a.datos.length, 0)
console.log(`Actualización ${JSON.parse(manifiesto).id} para ${plataforma} ${version}: ${otros.length + 1} archivos, ${(pesa / 1e6).toFixed(1)} MB. Firma comprobada.`)
if (sinSubir) process.exit(0)

async function pedir(ruta, init) {
  const r = await fetch(`${ORIGEN}${ruta}`, { ...init, headers: { authorization: `Bearer ${PUBLICAR}`, ...init.headers } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${ruta}: ${r.status} ${j.error ?? ''}`)
  return j
}
let nuevos = 0
for (const a of [codigo, ...otros]) {
  const j = await pedir(`/celular/archivo/${a.meta.key}`, { method: 'PUT', headers: { 'content-type': a.meta.contentType }, body: a.datos })
  if (j.nuevo) nuevos++
}
const r = await pedir(`/celular/actualizacion/${plataforma}/${encodeURIComponent(version)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ manifiesto, firma }) })
console.log(`Publicada (${nuevos} archivos nuevos): ${JSON.stringify(r)}`)
