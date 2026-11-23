import assert from 'node:assert/strict'
import { test } from 'node:test'
import { htmlDeCorreo } from './plantilla-correo.ts'

const datos = { origen: 'https://api.sloth.vancci.org', pie: 'Sloth, de Vancci', respuesta: 'soporte@x.com' }

test('la clave sale en su recuadro, el asunto es el título sin ella y el enlace de descarga da su botón', () => {
  const html = htmlDeCorreo('Tu clave de Sloth: SLOTH-ABCD-EFGH-JKLM-NPQR', [
    'Hola:',
    'Tu clave: SLOTH-ABCD-EFGH-JKLM-NPQR',
    'Descárgala en https://api.sloth.vancci.org/descargar (Mac: https://api.sloth.vancci.org/descargar?so=mac).'
  ], datos)
  assert.match(html, /<h1[^>]*>Tu clave de Sloth<\/h1>/)
  assert.match(html, />Tu clave<\/div>/)
  assert.equal(html.match(/SLOTH-ABCD-EFGH-JKLM-NPQR/g)?.length, 1)
  assert.match(html, /<a href="https:\/\/api\.sloth\.vancci\.org\/descargar\?so=mac"[^>]*>api\.sloth\.vancci\.org\/descargar\?so=mac<\/a>\)\./)
  assert.match(html, />¡Descargar Sloth!<\/a>/)
  assert.match(html, /¡Holaaa!/)
  assert.match(html, /src="https:\/\/api\.sloth\.vancci\.org\/correo\/sloth\.png"/)
})

test('el enlace de renovar da su botón y se enseña corto; a soporte, la clave va sin boleto ni firma', () => {
  const renovar = htmlDeCorreo('Tu año', ['Paga aquí: https://api.sloth.vancci.org/renovar?s=3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b. Gracias.'], datos)
  assert.match(renovar, /<a href="https:\/\/api\.sloth\.vancci\.org\/renovar\?s=3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b"[^>]*>¡Quiero seguir apoyando!<\/a>/)
  assert.match(renovar, />api\.sloth\.vancci\.org\/renovar<\/a>\. Gracias/)
  const soporte = htmlDeCorreo('No salió', ['Su clave: SLOTH-ABCD-EFGH-JKLM-NPQR.'], { ...datos, interno: true })
  assert.doesNotMatch(soporte, />Tu clave<\/div>|Un abrazooo|Respóndeme/)
})

test('resalta fechas y dinero, y no firma dos veces lo que ya firma Vancci', () => {
  const html = htmlDeCorreo('Aviso', ['El 21 de noviembre de 2026 te cobra $10 USD.', 'Vancci · Descarga Sloth en https://sloth.vancci.org'], datos)
  assert.match(html, /<b[^>]*>21 de noviembre de 2026<\/b>/)
  assert.match(html, /<b[^>]*>\$10 USD<\/b>/)
  assert.doesNotMatch(html, /Un abrazooo/)
})

test('no deja pasar HTML y marca lo de «comillas»', () => {
  const html = htmlDeCorreo('Aviso', ['<script>x</script> en Opciones, «Cancelar suscripción».'], datos)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /<b[^>]*>«Cancelar suscripción»<\/b>/)
  assert.doesNotMatch(html, /Descargar Sloth/)
})
