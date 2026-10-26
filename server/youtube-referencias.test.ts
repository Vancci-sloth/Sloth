import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'
import { buscarReferenciasYoutube } from './youtube-referencias.ts'

test('compara largos con otros videos maduros de su canal, sin filtros de veinte minutos ni CTR inventado', async (t) => {
  const base = resolve('data'); mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-youtube-referencias-'))
  t.after(() => { assert.ok(dir.startsWith(base + sep)); rmSync(dir, { recursive: true, force: true }) })
  const video = (id: string, vistas: number, duration = 'PT6M', publishedAt = '2025-01-01T00:00:00Z') => ({ id, snippet: { title: 'Editor con Claude', channelTitle: 'Canal de prueba', channelId: 'canal', publishedAt }, statistics: { viewCount: String(vistas) }, contentDetails: { duration } })
  const objetivo = video('referencia1', 1000)
  const muestra = [objetivo, ...Array.from({ length: 8 }, (_, i) => video(`video00000${i}`, 100)), video('corto000001', 999999, 'PT30S'), video('nuevo000001', 999999, 'PT6M', new Date().toISOString())]
  let busquedas = 0
  const resultado = await buscarReferenciasYoutube(dir, ['Claude editor', 'Claude video', 'Consulta ignorada'], async (recurso, params) => {
    if (recurso === 'search') { busquedas++; assert.equal(params.videoDuration, undefined); return { items: [{ id: { videoId: objetivo.id } }] } }
    if (recurso === 'channels') return { items: [{ id: 'canal', contentDetails: { relatedPlaylists: { uploads: 'subidas' } } }] }
    if (recurso === 'playlistItems') { assert.equal(params.playlistId, 'subidas'); return { items: muestra.map((v) => ({ contentDetails: { videoId: v.id } })) } }
    return { items: params.id === objetivo.id ? [objetivo] : muestra }
  })
  assert.equal(busquedas, 2)
  assert.equal(resultado.referencias.length, 1)
  assert.equal(resultado.referencias[0].muestra, 8)
  assert.equal(resultado.referencias[0].x, 10)
  assert.ok(resultado.limites.some((s) => s.includes('CTR')))
})

test('no asigna múltiplos con muestras pequeñas y explica búsquedas fallidas', async () => {
  let testBusqueda = 0
  const resultado = await buscarReferenciasYoutube(resolve('data/sin-investigacion-prueba'), ['Claude', 'Otra consulta'], async (recurso) => {
    if (recurso === 'search') {
      if (!testBusqueda++) return { items: [{ id: { videoId: 'referencia1' } }] }
      throw new Error('Cuota')
    }
    if (recurso === 'videos') return { items: [{ id: 'referencia1', snippet: { title: 'Claude', channelId: 'canal', channelTitle: 'Canal', publishedAt: '2025-01-01' }, statistics: { viewCount: '1000' }, contentDetails: { duration: 'PT6M' } }] }
    if (recurso === 'channels') return { items: [{ id: 'canal', contentDetails: { relatedPlaylists: { uploads: 'subidas' } } }] }
    return { items: [{ contentDetails: { videoId: 'referencia1' } }] }
  })
  assert.equal(resultado.referencias[0].x, undefined)
  assert.equal(resultado.referencias[0].muestra, 0)
  assert.ok(resultado.limites.some((s) => s.includes('Otra consulta')))
})
