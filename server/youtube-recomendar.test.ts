import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import test from 'node:test'
import type { ReferenciaYoutube } from '../shared/youtube.ts'
import { guardar, huella } from './disco.ts'
import { enlacesYoutube, recomendacionesYoutube, validarDescripcionYoutube, validarRecomendacion } from './youtube-recomendar.ts'

test('la descripción respeta los bytes de YouTube y solo enlaza fuentes verificadas', () => {
  const fuente = 'https://www.youtube.com/watch?v=referencia1'
  assert.deepEqual(enlacesYoutube(`Fuente: (${fuente}).`), [fuente])
  assert.equal(validarDescripcionYoutube({ texto: `Una prueba real.\nFuente: ${fuente}`, razon: 'Resumen del guion' }, [fuente]).texto, `Una prueba real.\nFuente: ${fuente}`)
  assert.throws(() => validarDescripcionYoutube({ texto: '🔥'.repeat(1300), razon: '' }, []), /5000 bytes/)
  assert.throws(() => validarDescripcionYoutube({ texto: '<b>Video</b>', razon: '' }, []), /sin HTML/)
  assert.throws(() => validarDescripcionYoutube({ texto: 'Compra en https://inventado.example/venta', razon: '' }, [fuente]), /enlace/)
})

test('acepta recomendaciones de varios videos, ejecuta dos a la vez y continúa aunque falle uno', async (t) => {
  const base = resolve('data'); mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-youtube-cola-'))
  let servicio: ReturnType<typeof recomendacionesYoutube> | undefined
  const liberar = new Map<string, () => void>()
  t.after(async () => {
    for (const ok of liberar.values()) ok()
    const fin = Date.now() + 10_000
    while (servicio?.ocupado() && Date.now() < fin) { for (const ok of liberar.values()) ok(); await new Promise((ok) => setTimeout(ok, 20)) }
    assert.equal(servicio?.ocupado(), null)
    assert.ok(app.startsWith(base + sep)); rmSync(app, { recursive: true, force: true })
  })
  const videos = ['red', 'blue', 'gray', 'green'].map((color, i) => {
    const folder = join(app, `episodio-${i}`); mkdirSync(folder)
    const ruta = join(folder, 'video.mp4')
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ruta], { windowsHide: true })
    guardar(join(folder, 'guion.md'), '# Una prueba de editor\n' + 'El guion muestra una prueba de crear un editor con Claude y su resultado. '.repeat(5))
    return { cardId: 'prueba', ruta, archivo: 'video.mp4', titulo: `Video ${i}`, src: '', t: i }
  })
  const hs = videos.map((v) => huella(v.ruta))
  const planes: string[] = []
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
  servicio = recomendacionesYoutube(app, async (recurso) => recurso === 'search' ? { items: [{ id: { videoId: ref.id } }] } : recurso === 'videos' ? { items: [{ id: ref.id, snippet: { title: ref.titulo, channelTitle: ref.canal, channelId: ref.canalId, publishedAt: '2025-01-01' }, statistics: { viewCount: '1500' }, contentDetails: { duration: 'PT6M' } }] } : { items: [] }, async (model, cwd, _prompt, _imagenes, esquema, effort) => {
    const h = basename(cwd)
    assert.equal(model, `modelo-${hs.indexOf(h)}`)
    assert.equal(effort, hs.indexOf(h) === 2 ? 'high' : 'low')
    if ((esquema?.properties as Record<string, unknown>)?.consultas) {
      planes.push(h)
      await new Promise<void>((ok) => liberar.set(h, ok))
      if (h === hs[0]) throw new Error('Fallo de un video de prueba')
      return JSON.stringify({ tema: 'Editor con Claude', consultas: ['Claude editor'], hechos: [] })
    }
    const p = propuesta(); p.titulo.principal = `Título del video ${hs.indexOf(h)}`
    return JSON.stringify(p)
  }, async () => null)
  const card = { id: 'prueba', title: 'Prueba', description: '', cwd: app }
  for (const [i, v] of videos.entries()) servicio.iniciar(v, card, `modelo-${i}`, [], undefined, null, { tipo: i % 2 ? 'miniatura' : 'titulo', effort: i === 2 ? 'high' : 'low' })
  assert.equal(servicio.estado(hs[0])?.estado, 'trabajando')
  assert.equal(servicio.estado(hs[1])?.estado, 'trabajando')
  assert.equal(servicio.estado(hs[2])?.estado, 'cola')
  assert.equal(servicio.estado(hs[2])?.posicion, 1)
  assert.equal(servicio.estado(hs[3])?.posicion, 2)
  assert.equal(servicio.iniciar(videos[2], card, 'otro-modelo', []).estado, 'cola')
  const disco = JSON.parse(readFileSync(join(app, 'data', 'youtube', 'recomendaciones.json'), 'utf8'))
  assert.equal(disco[hs[2]].pendiente.model, 'modelo-2')
  assert.equal(disco[hs[2]].pendiente.pedido.effort, 'high')
  const esperar = async (condicion: () => boolean) => {
    const fin = Date.now() + 10_000
    while (!condicion() && Date.now() < fin) await new Promise((ok) => setTimeout(ok, 20))
    assert.ok(condicion())
  }
  await esperar(() => planes.length === 2)
  assert.deepEqual(new Set(planes), new Set(hs.slice(0, 2)))
  liberar.get(hs[0])!()
  await esperar(() => planes.includes(hs[2]))
  assert.equal(servicio.estado(hs[0])?.estado, 'error')
  assert.equal(servicio.estado(hs[3])?.posicion, 1)
  liberar.get(hs[1])!()
  await esperar(() => planes.includes(hs[3]))
  liberar.get(hs[2])!(); liberar.get(hs[3])!()
  await esperar(() => !servicio!.ocupado())
  assert.equal(planes.length, 4)
  for (const i of [1, 2, 3]) assert.equal(servicio.estado(hs[i])?.resultado?.titulo.principal, `Título del video ${i}`)
})

test('retoma la cola guardada al abrir Sloth y rechaza versiones que cambiaron mientras esperaban', async (t) => {
  const base = resolve('data'); mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-youtube-retomar-'))
  t.after(() => { assert.ok(app.startsWith(base + sep)); rmSync(app, { recursive: true, force: true }) })
  mkdirSync(join(app, 'data', 'youtube'), { recursive: true })
  guardar(join(app, 'video-a.mp4'), 'Archivo de prueba a')
  guardar(join(app, 'video-b.mp4'), 'Archivo de prueba b')
  const va = { cardId: 'prueba', ruta: join(app, 'video-a.mp4'), archivo: 'video-a.mp4', titulo: 'A', src: '', t: 0 }
  const vb = { ...va, ruta: join(app, 'video-b.mp4'), archivo: 'video-b.mp4', titulo: 'B' }
  const ha = huella(va.ruta), hb = huella(vb.ruta)
  const entrada = (v: typeof va) => ({ v, model: 'modelo-elegido', contexto: 'Contenido de la prueba'.repeat(20), pedido: { tipo: 'descripcion', titulo: v.titulo, effort: 'low' } })
  guardar(join(app, 'data', 'youtube', 'recomendaciones.json'), JSON.stringify({ [ha]: { estado: 'trabajando', fase: '', orden: 1, pendiente: entrada(va) }, [hb]: { estado: 'cola', fase: '', orden: 2, pendiente: entrada(vb) } }))
  guardar(vb.ruta, 'Una nueva versión del archivo de prueba b')
  let llamadas = 0
  const s = recomendacionesYoutube(app, async () => ({}), async (model, _cwd, prompt, _imagenes, _esquema, effort) => {
    llamadas++; assert.equal(model, 'modelo-elegido'); assert.equal(effort, 'low'); assert.ok(prompt.includes('Contenido de la prueba'))
    return JSON.stringify({ texto: 'Descripción recuperada de la solicitud en cola.', razon: 'El guion guardado.' })
  })
  const fin = Date.now() + 2000
  while (s.ocupado() && Date.now() < fin) await new Promise((ok) => setTimeout(ok, 20))
  assert.equal(s.ocupado(), null)
  assert.equal(s.estado(ha)?.descripcion?.texto, 'Descripción recuperada de la solicitud en cola.')
  assert.equal(s.estado(hb)?.estado, 'error')
  assert.match(s.estado(hb)?.error ?? '', /cambió mientras esperaba/)
  assert.equal(llamadas, 1)
})

const ref: ReferenciaYoutube = { id: 'referencia1', titulo: 'Editor con Claude', canal: 'Prueba', canalId: 'canal', vistas: 1500, origen: 'YouTube', leido: 1, url: 'https://www.youtube.com/watch?v=referencia1' }
const propuesta = () => ({ titulo: { principal: 'Claude hizo mi editor de video', alternativas: ['Probé editar con Claude'], razon: 'El guion demuestra el montaje.' }, miniatura: { concepto: 'Línea de tiempo y fábrica', texto: '30 MIN', composicion: 'Dos elementos', prompt: 'Una fábrica isométrica junto a una línea de tiempo.', razon: 'Jerarquía simple' }, analisis: 'El título complementa la imagen.', limites: ['Tres fotogramas, sin ver videos completos.'], referencias: [{ id: ref.id, observacion: 'La miniatura tiene un protagonista claro.' }] })

test('rechaza referencias inventadas y títulos demasiado largos, conservando métricas del servidor', () => {
  const p = propuesta()
  assert.equal(validarRecomendacion(p, [ref]).referencias[0].vistas, 1500)
  p.referencias[0].id = 'inventado00'
  assert.throws(() => validarRecomendacion(p, [ref]), /referencias/)
  p.referencias[0].id = ref.id; p.titulo.principal = 'x'.repeat(101)
  assert.throws(() => validarRecomendacion(p, [ref]), /título/)
})

test('el análisis adjunta fotogramas y miniaturas reales, conserva su resultado y no modifica borradores', async (t) => {
  const base = resolve('data'); mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-youtube-analisis-'))
  t.after(() => { assert.ok(app.startsWith(base + sep)); rmSync(app, { recursive: true, force: true }) })
  const folder = join(app, 'episodio'); mkdirSync(folder)
  const ruta = join(folder, 'video.mp4')
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=320x180:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ruta], { windowsHide: true })
  guardar(join(folder, 'guion.md'), '# Editor con Claude\n' + 'Una prueba de crear una fábrica isométrica y montar videos con Claude Code. '.repeat(8))
  mkdirSync(join(app, 'data'))
  guardar(join(app, 'data', 'youtube.json'), JSON.stringify({ borradores: { elegido: { titulo: 'Mi título elegido', revisado: true } } }))
  const antes = readFileSync(join(app, 'data', 'youtube.json'), 'utf8')
  let llamadas = 0
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from([0xff, 0xd8, 0xff, 0xd9])))
  let consultasApi = 0
  const api = async (recurso: string) => { consultasApi++; return recurso === 'search' ? { items: [{ id: { videoId: ref.id } }] } : recurso === 'videos' ? { items: [{ id: ref.id, snippet: { title: ref.titulo, channelTitle: ref.canal, channelId: ref.canalId, publishedAt: '2025-01-01' }, statistics: { viewCount: '1500' }, contentDetails: { duration: 'PT6M' } }] } : { items: [] } }
  const servicio = recomendacionesYoutube(app, api, async (_model, _cwd, prompt, imagenes = [], esquema, effort) => {
    llamadas++
    assert.ok(imagenes.every(existsSync))
    assert.equal(esquema?.additionalProperties, false)
    if (llamadas === 3) {
      assert.equal(effort, 'medium')
      assert.equal(imagenes.length, 0)
      assert.ok(prompt.includes('Mi título elegido'))
      assert.ok(prompt.includes(ref.url))
      return JSON.stringify({ texto: `Una prueba de crear un editor con Claude.\n\nFuente: ${ref.url}`, razon: 'Resumen y atribución de la prueba.' })
    }
    assert.equal(effort, 'low')
    assert.equal(imagenes.length, llamadas === 1 ? 3 : 4)
    if (llamadas === 1) return JSON.stringify({ tema: 'Editor con Claude', consultas: ['Claude editor'], hechos: ['Una fábrica isométrica'] })
    assert.ok(prompt.includes('Imagen 4: miniatura del video referencia1'))
    assert.ok(prompt.includes('no una imagen generada'))
    assert.ok(prompt.includes('Una prueba con un editor'))
    return JSON.stringify(propuesta())
  }, async () => ({ idioma: 'es', segmentos: [{ inicio: 0, fin: 5, texto: 'Una prueba con un editor' }] }))
  const v = { cardId: 'prueba', ruta, archivo: 'video.mp4', titulo: 'Nombre del hilo', src: '', t: 1 }
  const card = { id: 'prueba', title: 'Prueba', description: '', cwd: folder }
  const inicial = servicio.iniciar(v, card, 'sonnet', [], undefined, null, { tipo: 'titulo', effort: 'low' })
  assert.equal(inicial.estado, 'trabajando')
  assert.equal(servicio.iniciar(v, card, 'sonnet', []).estado, 'trabajando')
  const h = huella(ruta)
  const limite = Date.now() + 15000
  while (servicio.ocupado() && Date.now() < limite) await new Promise((ok) => setTimeout(ok, 50))
  const estado = servicio.estado(h)!
  assert.equal(estado.estado, 'listo', estado.error ?? 'El análisis debe terminar')
  assert.equal(llamadas, 2)
  assert.equal(estado.resultado!.fotogramas.length, 3)
  assert.ok(estado.resultado!.referencias[0].miniatura?.endsWith('/referencia1.jpg'))
  assert.equal(readFileSync(join(app, 'data', 'youtube.json'), 'utf8'), antes)
  assert.equal(recomendacionesYoutube(app, api).estado(h)?.resultado?.titulo.principal, propuesta().titulo.principal)
  const antesApi = consultasApi
  servicio.iniciar(v, card, 'sonnet', [], undefined, null, { tipo: 'descripcion', titulo: 'Mi título elegido', effort: 'medium' })
  assert.throws(() => servicio.iniciar(v, card, 'sonnet', [], undefined, null, { tipo: 'descripcion' }), /Espera/)
  while (servicio.ocupado() && Date.now() < limite) await new Promise((ok) => setTimeout(ok, 50))
  const descrito = servicio.estado(h)!
  assert.equal(descrito.estado, 'listo', descrito.error ?? 'Debe generar la descripción')
  assert.equal(descrito.modelo, 'sonnet')
  assert.ok(descrito.descripcion?.texto.includes('Una prueba de crear un editor'))
  assert.equal(descrito.resultado?.titulo.principal, estado.resultado?.titulo.principal)
  assert.equal(consultasApi, antesApi)
  assert.equal(llamadas, 3)
  assert.equal(readFileSync(join(app, 'data', 'youtube.json'), 'utf8'), antes)
  assert.equal(recomendacionesYoutube(app, api).estado(h)?.descripcion?.texto, descrito.descripcion?.texto)
})
