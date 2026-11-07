import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accionDeRiesgo, descargaPeligrosa, urlPermitida } from './navegador-politica.ts'

test('el perfil del agente es libre salvo los esquemas bloqueados', () => {
  assert.equal(urlPermitida('persist:navegador', 'https://ejemplo.com/a').ok, true)
  assert.equal(urlPermitida('persist:navegador', 'about:blank').ok, true)
  for (const u of ['file:///C:/x.txt', 'chrome://settings', 'javascript:alert(1)', 'view-source:https://a.com', 'ftp://a.com'])
    assert.equal(urlPermitida('persist:navegador', u).ok, false, u)
})

test('las redes solo abren sus sitios y sus subdominios', () => {
  assert.equal(urlPermitida('persist:redes', 'https://www.tiktok.com/upload').ok, true)
  assert.equal(urlPermitida('persist:redes', 'https://accounts.google.com/signin').ok, true)
  assert.equal(urlPermitida('persist:redes', 'https://business.facebook.com/').ok, true)
  assert.equal(urlPermitida('persist:redes', 'https://eviltiktok.com/').ok, false)
  assert.equal(urlPermitida('persist:redes', 'https://tiktok.com.malo.mx/').ok, false)
})

test('la voz solo abre AI Studio y el inicio de sesión de Google', () => {
  assert.equal(urlPermitida('persist:voz', 'https://aistudio.google.com/generate-speech').ok, true)
  assert.equal(urlPermitida('persist:voz', 'https://accounts.google.com/').ok, true)
  assert.equal(urlPermitida('persist:voz', 'https://www.google.com/').ok, false)
  assert.equal(urlPermitida('persist:voz', 'https://ejemplo.com/').ok, false)
})

test('una dirección rota o un perfil desconocido', () => {
  assert.equal(urlPermitida('persist:voz', 'no es una url').ok, false)
  assert.equal(urlPermitida('persist:voz', 'blob:https://aistudio.google.com/1234').ok, true)
  assert.equal(urlPermitida('otro', 'https://a.com').ok, true)
})

test('descargas ejecutables', () => {
  for (const n of ['a.exe', 'A.MSI', 'x.bat', 'y.ps1', 'z.cmd', 'w.scr', 'setup.exe?token=1', 'setup.exe.'])
    assert.equal(descargaPeligrosa(n), true, n)
  for (const n of ['foto.png', 'doc.pdf', 'exe.txt', 'archivo.zip']) assert.equal(descargaPeligrosa(n), false, n)
})

test('acciones que piden confirmación', () => {
  for (const t of ['Publicar', 'Pagar ahora', 'Comprar', 'Borrar cuenta', 'Eliminar', 'Enviar', 'Post', 'Pay', 'Buy now', 'Delete', 'Submit'])
    assert.equal(accionDeRiesgo(t), true, t)
  for (const t of ['Buscar', 'Siguiente', 'Cancelar', 'Iniciar sesión']) assert.equal(accionDeRiesgo(t), false, t)
})
