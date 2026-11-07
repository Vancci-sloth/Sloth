import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { wavDePcm } from '../shared/voz.ts'
import { chatterbox } from './voz/chatterbox.ts'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('Chatterbox está apagado hasta que le dices un Python que lo tiene', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-chatterbox-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const python = join(carpeta, 'python')
  writeFileSync(python, '')
  const c = chatterbox({ carpeta, probar: async (p) => p === python })
  await espera(10)
  assert.deepEqual([c.estado().python, c.estado().listo, c.estado().voces], [null, false, []])
  assert.match(c.estado().texto, /^Apagado/)
  await assert.rejects(c.configurar(join(carpeta, 'no-existe')), /No encuentro/)
  const otro = join(carpeta, 'otro-python')
  writeFileSync(otro, '')
  await assert.rejects(c.configurar(otro), /no tiene el paquete chatterbox/)
  await c.configurar(python)
  assert.equal(c.estado().listo, true)
  assert.deepEqual(c.estado().voces.map((v) => v.id), ['base'])
  // Se guarda: otro arranque lo encuentra.
  const despues = chatterbox({ carpeta, probar: async () => true })
  await espera(10)
  assert.equal(despues.estado().python, python)
  await c.configurar(null)
  assert.equal(c.estado().listo, false)
})

test('clonar guarda la grabación como una voz; generar enciende el servidor y le pasa la referencia', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-chatterbox-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const python = join(carpeta, 'python')
  writeFileSync(python, '')
  const pedidos: { ruta: string; cuerpo?: any }[] = []
  let lanzado = 0
  const wav = wavDePcm([new Uint8Array(48000)], 24000, 1)
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url))
    pedidos.push({ ruta: u.pathname, cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined })
    if (!lanzado) throw new Error('ECONNREFUSED')
    if (u.pathname === '/salud') return Response.json({ modelo: 'chatterbox-multilingual', dispositivo: 'cuda' })
    return new Response(Buffer.from(wav))
  }) as typeof fetch
  const c = chatterbox({ carpeta, fetch: f, probar: async () => true, lanzar: () => void lanzado++ })
  await c.configurar(python)
  const id = c.clonar('Mi Voz Ñandú', new Uint8Array(2000), 'grabacion.m4a')
  assert.equal(id, 'mi-voz-nandu')
  assert.ok(existsSync(join(carpeta, 'chatterbox', 'mi-voz-nandu.m4a')))
  assert.deepEqual(c.estado().voces.map((v) => [v.id, v.propia]), [['base', false], ['mi-voz-nandu', true]])
  assert.throws(() => c.clonar('base', new Uint8Array(2000), 'a.wav'), /ponle otro nombre/)
  const r = await c.generar('mi-voz-nandu', 'Hola a todos.')
  assert.equal(r.segundos, 1)
  assert.equal(lanzado, 1)
  const tts = pedidos.find((p) => p.ruta === '/tts')!
  assert.deepEqual([tts.cuerpo.texto, tts.cuerpo.idioma, tts.cuerpo.referencia], ['Hola a todos.', 'es', join(carpeta, 'chatterbox', 'mi-voz-nandu.m4a')])
  // Ya encendido, no se lanza otra vez; la voz del modelo va sin referencia.
  await c.generar('base', 'Otra.')
  assert.equal(lanzado, 1)
  assert.equal(pedidos.filter((p) => p.ruta === '/tts').at(-1)!.cuerpo.referencia, undefined)
  await assert.rejects(c.generar('no-existe', 'x'), /No hay una voz «no-existe»/)
  c.quitar('mi-voz-nandu')
  assert.deepEqual(c.estado().voces.map((v) => v.id), ['base'])
  c.apagar()
})
