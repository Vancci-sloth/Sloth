import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import test, { type TestContext } from 'node:test'
import { programarYoutube } from './youtube-publicacion.ts'
import type { SubidaYoutube } from './youtube-subida.ts'
import { propuestaYoutube, miniaturasYoutube } from './youtube-catalogo.ts'
import { fechasYoutube, fechaLocalYoutube } from '../shared/youtube-fechas.ts'

function preparar(t: TestContext) {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-youtube-publicacion-'))
  t.after(() => { assert.ok(dir.startsWith(base + sep)); rmSync(dir, { recursive: true, force: true }) })
  const miniatura = join(dir, 'miniatura.png')
  const imagen = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aQXcAAAAASUVORK5CYII=', 'base64')
  writeFileSync(miniatura, imagen)
  const subida: SubidaYoutube = { estado: 'preparando', id: 'id-guardado', enviados: 100, total: 100,
    datos: { titulo: 'Título revisado', descripcion: 'Descripción revisada', privacidad: 'private', infantil: false, sintetico: false, miniatura, huellaMiniatura: createHash('sha256').update(imagen).digest('hex'), cuando: new Date(Date.now() + 86_400_000).toISOString(), revisado: true } }
  return { dir, subida }
}

test('pone la miniatura antes de programar y confirma la fecha que guardó YouTube', async (t) => {
  const { subida } = preparar(t)
  const pasos: string[] = []
  let guardados = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    pasos.push(init.method ?? 'GET')
    if (!init.method) return Response.json({ items: [{ status: { privacyStatus: 'private' } }] })
    if (init.method === 'POST') { assert.ok(url.includes('/thumbnails/set')); return Response.json({ items: [{}] }) }
    const j = JSON.parse(String(init.body))
    assert.equal(j.id, 'id-guardado')
    assert.equal(j.status.privacyStatus, 'private')
    assert.equal(j.status.publishAt, subida.datos.cuando)
    assert.equal(j.snippet.title, 'Título revisado')
    assert.ok(subida.miniaturaPuesta)
    return Response.json(j)
  })
  await programarYoutube(subida, async () => 'prueba', () => { guardados++ })
  assert.deepEqual(pasos, ['GET', 'POST', 'PUT'])
  assert.equal(subida.estado, 'programado')
  assert.equal(guardados, 2)
})

test('si falló la miniatura, reintenta con el mismo id y sin programar antes de tiempo', async (t) => {
  const { subida } = preparar(t)
  let fallar = true
  const ids: string[] = []
  let fechas = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (!init.method) return Response.json({ items: [{ status: { privacyStatus: 'private' } }] })
    if (init.method === 'POST') { ids.push(new URL(url).searchParams.get('videoId')!); return fallar ? Response.json({}, { status: 403 }) : Response.json({}) }
    fechas++
    return Response.json(JSON.parse(String(init.body)))
  })
  await assert.rejects(programarYoutube(subida, async () => 'prueba', () => {}), /no permitió/)
  assert.equal(fechas, 0)
  fallar = false
  await programarYoutube(subida, async () => 'prueba', () => {})
  assert.deepEqual(ids, ['id-guardado', 'id-guardado'])
  assert.equal(fechas, 1)
})

test('una respuesta de programación perdida se recupera consultando la fecha, sin repetirla', async (t) => {
  const { subida } = preparar(t)
  subida.miniaturaPuesta = true
  let guardadoEnGoogle = false
  let escrituras = 0
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    if (!init.method) return Response.json({ items: [{ status: { privacyStatus: 'private', publishAt: guardadoEnGoogle ? subida.datos.cuando : undefined } }] })
    escrituras++
    guardadoEnGoogle = true
    throw new Error('Se perdió la respuesta')
  })
  await assert.rejects(programarYoutube(subida, async () => 'prueba', () => {}), /Se perdió/)
  await programarYoutube(subida, async () => 'prueba', () => {})
  assert.equal(escrituras, 1)
  assert.equal(subida.estado, 'programado')
})

test('una fecha vencida o un video público no dispara una publicación', async (t) => {
  const { subida } = preparar(t)
  let publico = false
  let escrituras = 0
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    if (init.method) escrituras++
    return Response.json({ items: [{ status: { privacyStatus: publico ? 'public' : 'private' } }] })
  })
  subida.datos.cuando = new Date(Date.now() - 1000).toISOString()
  await assert.rejects(programarYoutube(subida, async () => 'prueba', () => {}), /fecha.*pasó/)
  publico = true
  await assert.rejects(programarYoutube(subida, async () => 'prueba', () => {}), /ya es público/)
  assert.equal(escrituras, 0)
})

test('lee títulos y alternativas de la entrega, y ofrece portadas sin confundirlas con capturas', (t) => {
  const { dir } = preparar(t)
  writeFileSync(join(dir, 'publicacion.md'), '# Publicación\n\n## Título recomendado\n\n**Un título editorial**\n\nAlternativas:\n1. **Otra opción** — explicación.\n\n## Miniatura\nUn concepto.\n\n## Descripción propuesta\n\nDescripción del episodio.\n')
  mkdirSync(join(dir, 'out'))
  const v = { cardId: 'prueba', ruta: join(dir, 'out', 'video.mp4'), archivo: 'out/video.mp4', titulo: 'Mensaje del chat', src: '', t: 0 }
  const propuesta = propuestaYoutube(v)
  assert.equal(propuesta.titulo, 'Un título editorial')
  assert.equal(propuesta.descripcion, 'Descripción del episodio.')
  assert.deepEqual(propuesta.alternativas, ['Otra opción'])
  writeFileSync(join(dir, 'captura.png'), Buffer.from('captura'))
  const imagenes = miniaturasYoutube(dir, v)
  assert.equal(imagenes.length, 1)
  assert.equal(imagenes[0].nombre, 'miniatura.png')
})

test('el ritmo mantiene la hora local, respeta lunes/miércoles/viernes y evita fechas ocupadas', () => {
  const inicio = '2026-10-13T18:00'
  const ahora = new Date('2026-10-13T09:00').getTime()
  const tuyo = { porDia: 1, cadaDias: 1, inicio: '2026-10-01', desde: '18:00', cadaMin: 60 }
  const diario = fechasYoutube(inicio, 'tuyo', 3, [], tuyo, ahora)
  assert.deepEqual(diario.map(fechaLocalYoutube), ['2026-10-13T18:00', '2026-10-14T18:00', '2026-10-15T18:00'])
  const semanal = fechasYoutube(inicio, 'semana', 3)
  assert.deepEqual(semanal.map(fechaLocalYoutube), ['2026-10-14T18:00', '2026-10-16T18:00', '2026-10-19T18:00'])
  assert.equal(fechaLocalYoutube(fechasYoutube(inicio, 'tuyo', 1, [diario[0]], tuyo, ahora)[0]), '2026-10-14T18:00')
})
