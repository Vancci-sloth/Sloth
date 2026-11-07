import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import * as comfy from './avatar/comfy.ts'
import { FLUJOS, esFlujoApi, flujoDe, importarFlujo, leerFlujo, mapearFlujo, pesoPuesto, prepararFlujo } from './avatar/flujos.ts'
import { avatar } from './avatar/index.ts'

const BASE = 'http://127.0.0.1:8188'

/** Un ComfyUI de mentira. `nodos`: los que tiene cargados; `historia`: lo que va diciendo `/history/p1`. */
function simulado(estado: { historia?: unknown[]; nodos?: string[]; rechazo?: unknown; apagado?: boolean } = {}) {
  const llamadas: { ruta: string; metodo: string; cuerpo?: any; forma?: FormData }[] = []
  let consultas = 0
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url))
    if (estado.apagado) throw new Error('ECONNREFUSED')
    llamadas.push({ ruta: u.pathname + u.search, metodo: init?.method ?? 'GET', cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, forma: init?.body instanceof FormData ? init.body : undefined })
    const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status })
    if (u.pathname === '/system_stats') return json({ system: { comfyui_version: '0.43.0' }, devices: [{ name: 'NVIDIA GeForce RTX 4060', vram_total: 8 * 1024 ** 3, vram_free: 7 * 1024 ** 3 }] })
    if (u.pathname === '/object_info') return json(Object.fromEntries((estado.nodos ?? ['LoadAudio', 'VHS_LoadVideo']).map((n) => [n, {}])))
    if (u.pathname === '/upload/image') return json({ name: 'subido.bin', subfolder: '' })
    if (u.pathname === '/prompt') return estado.rechazo ? json(estado.rechazo, 400) : json({ prompt_id: 'p1' })
    if (u.pathname === '/history/p1') return json(estado.historia?.[Math.min(consultas++, estado.historia.length - 1)] ?? {})
    if (u.pathname === '/view') return new Response(new Uint8Array([1, 2, 3]))
    return json({}, 404)
  }) as typeof fetch
  return { f, llamadas }
}

const carpetaVacia = () => mkdtempSync(join(tmpdir(), 'sloth-avatar-'))

test('detectar: dice la versión y la VRAM, y null si no responde', async () => {
  assert.deepEqual(await comfy.detectar(BASE, simulado().f), { version: '0.43.0', gpu: 'NVIDIA GeForce RTX 4060', vramTotalGB: 8, vramLibreGB: 7 })
  assert.equal(await comfy.detectar(BASE, simulado({ apagado: true }).f), null)
})

test('subirArchivo manda multipart a /upload/image y devuelve el nombre que ve ComfyUI', async (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const audio = join(dir, 'voz.wav')
  writeFileSync(audio, 'RIFF')
  const { f, llamadas } = simulado()
  assert.equal(await comfy.subirArchivo(audio, BASE, f), 'subido.bin')
  assert.equal(llamadas[0].ruta, '/upload/image')
  assert.match((llamadas[0].forma!.get('image') as File).name, /^sloth-[0-9a-f]{8}-voz\.wav$/)
})

test('encolar: manda el flujo; si ComfyUI lo rechaza, dice qué nodo', async (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const flujo = leerFlujo('latentsync', dir)!.prompt
  const bien = simulado()
  assert.equal(await comfy.encolar(flujo, BASE, bien.f), 'p1')
  assert.deepEqual(Object.keys(bien.llamadas[0].cuerpo.prompt), ['1', '2', '3', '4'])
  const mal = simulado({ rechazo: { error: { message: 'Prompt outputs failed validation' }, node_errors: { 3: { class_type: 'LatentSyncNode', errors: [{ message: 'x', details: 'audio: falta' }] } } } })
  await assert.rejects(comfy.encolar(flujo, BASE, mal.f), /failed validation.*nodo 3 \(LatentSyncNode\): audio: falta/)
})

test('esperar: sigue preguntando a /history hasta que sale el video, y lo baja', async (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const fin = { p1: { status: { status_str: 'success', completed: true }, outputs: { 4: { gifs: [{ filename: 'sloth-latentsync_00001-audio.mp4', subfolder: '', type: 'output' }] } } } }
  const { f, llamadas } = simulado({ historia: [{}, {}, fin] })
  const salidas = await comfy.esperar('p1', { base: BASE, f, cada: 1 })
  assert.equal(llamadas.filter((l) => l.ruta.startsWith('/history')).length, 3)
  const video = comfy.elVideo(salidas)!
  await comfy.bajar(video, join(dir, 'x', 'avatar.mp4'), BASE, f)
  assert.deepEqual([...readFileSync(join(dir, 'x', 'avatar.mp4'))], [1, 2, 3])
  assert.match(llamadas.at(-1)!.ruta, /^\/view\?filename=sloth-latentsync_00001-audio\.mp4&subfolder=&type=output$/)
})

test('esperar: un nodo que falla en ComfyUI sale como error con su nombre', async () => {
  const { f } = simulado({ historia: [{ p1: { status: { status_str: 'error', messages: [['execution_error', { node_type: 'LatentSyncNode', exception_message: 'CUDA out of memory\ndetalle' }]] }, outputs: {} } }] })
  await assert.rejects(comfy.esperar('p1', { base: BASE, f, cada: 1 }), /LatentSyncNode: CUDA out of memory$/)
})

test('flujos: LatentSync viene hecho; MuseTalk, de respaldo, pide importar el suyo', (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.deepEqual(FLUJOS.map((f) => f.id), ['latentsync', 'musetalk'])
  assert.ok(leerFlujo('latentsync', dir))
  assert.equal(leerFlujo('musetalk', dir), null)
  for (const f of FLUJOS) for (const p of f.pesos) assert.match(p.url, /^https:\/\/huggingface\.co\/ByteDance\/LatentSync-1\.5\/resolve\/main\//, f.id)
  // Un peso a medias no cuenta.
  const peso = flujoDe('latentsync')!.pesos[1]
  mkdirSync(join(dir, 'custom_nodes', 'ComfyUI-LatentSyncWrapper', 'checkpoints', 'whisper'), { recursive: true })
  writeFileSync(join(dir, peso.destino), 'corto')
  assert.equal(pesoPuesto(dir, peso), false)
})

test('mapearFlujo adivina dónde van el video, el audio y la salida; importarFlujo guarda y prepararFlujo los llena', (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const muse = {
    10: { class_type: 'VHS_LoadVideo', inputs: { video: 'ejemplo.mp4' } },
    11: { class_type: 'LoadAudio', inputs: { audio: 'ejemplo.mp3' } },
    12: { class_type: 'muse_talk_sampler', inputs: { seed: 7 } },
    13: { class_type: 'VHS_VideoCombine', inputs: { frame_rate: 25 } }
  }
  assert.ok(esFlujoApi(muse))
  assert.deepEqual(mapearFlujo(muse), { video: { nodo: '10', campo: 'video' }, imagen: undefined, audio: { nodo: '11', campo: 'audio' }, semilla: { nodo: '12', campo: 'seed' }, salida: '13' })
  const g = importarFlujo('musetalk', JSON.stringify(muse), dir)
  assert.ok(existsSync(join(dir, 'musetalk.json')))
  assert.equal(leerFlujo('musetalk', dir)?.mapeo.salida, '13')
  const listo = prepararFlujo(g, { video: 'sloth-1-cara.mp4', audio: 'sloth-2-voz.wav' })
  assert.equal(listo['10'].inputs.video, 'sloth-1-cara.mp4')
  assert.equal(listo['11'].inputs.audio, 'sloth-2-voz.wav')
  assert.equal(g.prompt['10'].inputs.video, 'ejemplo.mp4') // el original no se toca
})

test('importarFlujo rechaza el formato de la interfaz y los flujos sin audio', (t) => {
  const dir = carpetaVacia()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.throws(() => importarFlujo('musetalk', JSON.stringify({ nodes: [], links: [] }), dir), /Save \(API Format\)/)
  assert.throws(() => importarFlujo('musetalk', '{no es json', dir), /no es un JSON/)
  assert.throws(() => importarFlujo('musetalk', JSON.stringify({ 1: { class_type: 'LoadImage', inputs: { image: 'a.png' } } }), dir), /LoadAudio/)
  assert.throws(() => importarFlujo('inexistente', '{}', dir), /No conozco el flujo/)
})

test('el motor comfyui-local está apagado hasta que ComfyUI responde con los nodos de LatentSync', async (t) => {
  const datos = carpetaVacia()
  t.after(() => rmSync(datos, { recursive: true, force: true }))
  const estado = async (f: typeof fetch) => {
    let cuerpo = ''
    const res = { writeHead() {}, end: (d: string) => void (cuerpo = d) } as never
    await avatar({ datos, fetch: f }).api({ method: 'GET' } as never, res, '/api/avatar')
    return JSON.parse(cuerpo)
  }
  const apagado = await estado(simulado({ apagado: true }).f)
  assert.equal(apagado.motores.find((m: { id: string }) => m.id === 'comfyui-local').listo, false)
  assert.match(apagado.flujos[0].falta[0], /ComfyUI abierto en http:\/\/127\.0\.0\.1:8188/)
  const sinNodo = await estado(simulado({ nodos: ['LoadAudio', 'VHS_LoadVideo', 'VHS_VideoCombine'] }).f)
  assert.deepEqual(sinNodo.flujos[0].falta, ['el nodo LatentSyncNode (ShmuelRonen/ComfyUI-LatentSyncWrapper)'])
  const listo = await estado(simulado({ nodos: ['LoadAudio', 'VHS_LoadVideo', 'VHS_VideoCombine', 'LatentSyncNode'] }).f)
  assert.equal(listo.motores.find((m: { id: string }) => m.id === 'comfyui-local').listo, true)
  assert.equal(listo.flujos[1].listo, false) // MuseTalk sin su flujo
})
