import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import type { Card, SessionMeta } from '../shared/types.ts'
import { armar, type Destino, type Fuentes, huellaDe, leer, RespaldoMalo, traer } from './respaldo.ts'

/** Una Sloth de prueba, con un estilo de Sloth y su carpeta de trabajo. */
function sloth(nombre: string) {
  const app = mkdtempSync(join(tmpdir(), 'sloth-respaldo-'))
  const poner = (ruta: string, texto: string | Buffer) => {
    mkdirSync(dirname(join(app, ruta)), { recursive: true })
    writeFileSync(join(app, ruta), texto)
  }
  const leerDe = (ruta: string) => readFileSync(join(app, ruta), 'utf8')
  poner('skills/video-explicativo/SKILL.md', '# Explicativo\n')
  const deSloth: Card = { id: 'video-explicativo', title: 'Explicativo', description: '', skill: 'video-explicativo', cwd: join(app, 'trabajo', 'video-explicativo'), etapas: [{ nombre: 'Video', listo: 'out/*.mp4' }] }
  /** Las cards como las lee el servidor: las de Sloth y las de `data/tus-cards.json`, con su carpeta de trabajo. */
  const cards = (): Card[] => {
    let tuyas: Partial<Card>[] = []
    try {
      tuyas = JSON.parse(leerDe('data/tus-cards.json'))
    } catch {}
    return [deSloth, ...tuyas.map((c) => ({ ...c, tuya: true, cwd: join(app, 'trabajo', c.id!) }) as Card)]
  }
  const hilos = new Map<string, { meta: SessionMeta; registro: string }>()
  let sobre = ''
  const destino: Destino = {
    app,
    cards,
    hilos: { tiene: (id) => hilos.has(id), poner: (meta, registro) => (hilos.has(meta.id) ? false : (hilos.set(meta.id, { meta, registro }), true)) },
    sobreTi: { leer: () => sobre, guardar: (t) => void (sobre = t) }
  }
  /** Un chat en `data/sessions`, del más nuevo al más viejo según se añaden. */
  const lista: { id: string }[] = []
  const chat = (id: string, meta: Partial<SessionMeta> = {}, registro = `${JSON.stringify({ t: 'user', text: 'hola', at: 1 })}\n`) => {
    poner(`data/sessions/${id}.json`, JSON.stringify({ id, cardId: 'receta-rapida', title: `Chat ${id}`, model: 'claude-opus-5-5', cwd: 'C:/de/la/otra', createdAt: 1, updatedAt: 2, running: false, ...meta }))
    poner(`data/sessions/${id}.jsonl`, registro)
    lista.push({ id })
  }
  const fuentes = (): Fuentes => ({ app, cards: cards(), hilos: lista, sloth: '0.4.1', nombre })
  return { app, poner, leerDe, cards, hilos, destino, chat, fuentes, sobre: () => sobre, ponerSobre: (t: string) => void (sobre = t), fin: () => rmSync(app, { recursive: true, force: true }) }
}

/** La portátil: un estilo tuyo con lo que juntaste, «Sobre ti», una marca y dos chats. */
function portatil() {
  const s = sloth('PORTATIL')
  s.poner('data/tus-cards.json', JSON.stringify([{ id: 'receta-rapida', title: 'Receta rápida', description: 'En 30 s.', skill: 'receta-rapida', cwd: 'C:/de/la/otra', icon: 'claqueta', etapas: [{ nombre: 'Video', listo: 'out/*.mp4' }] }]))
  s.poner('skills/receta-rapida/SKILL.md', '# Receta\n')
  s.poner('skills/receta-rapida/plantilla/src/Video.tsx', 'export {}\n')
  s.poner('skills/receta-rapida/huellas/mio.json', '{"voz":1}')
  s.poner('skills/receta-rapida/node_modules/x/index.js', 'x')
  s.poner('skills/receta-rapida/out/video.mp4', 'x')
  s.poner('data/sobre-ti.json', JSON.stringify({ texto: 'Hago recetas.' }))
  s.poner('trabajo/receta-rapida/marca.json', '{"cierre":"Sígueme"}')
  s.poner('trabajo/video-explicativo/marcas/Cocina.json', '{"cierre":"En mi canal"}')
  s.chat('chat0001', { providerSessionId: 'abc', pendiente: { text: 'espera' }, background: ['un render'], running: true })
  s.chat('chat0002')
  return s
}

test('la copia lleva tus estilos con lo que juntaste, tus chats, «Sobre ti» y tus marcas, y entra en otra Sloth', async () => {
  const a = portatil()
  const b = sloth('ESCRITORIO')
  try {
    const { paquete, manifiesto } = await armar(a.fuentes())
    const rutas = manifiesto.archivos.map((x) => x.ruta)
    assert.ok(rutas.includes('skills/receta-rapida/huellas/mio.json'))
    // Lo que se rehace y los videos no viajan; tampoco la skill de un estilo de Sloth.
    assert.equal(rutas.some((r) => r.includes('node_modules') || r.includes('/out/') || r.startsWith('skills/video-explicativo/')), false)
    assert.deepEqual({ estilos: manifiesto.estilos, chats: manifiesto.chats, nombre: manifiesto.nombre }, { estilos: [{ id: 'receta-rapida', titulo: 'Receta rápida' }], chats: 2, nombre: 'PORTATIL' })

    const traido = await traer(paquete, b.destino)
    assert.deepEqual(traido, { estilos: ['Receta rápida'], chats: 2, sobreTi: true, marcas: 2 })
    assert.equal(b.leerDe('skills/receta-rapida/huellas/mio.json'), '{"voz":1}')
    // Su card entra sin la carpeta de la otra computadora.
    const [card] = JSON.parse(b.leerDe('data/tus-cards.json')) as Partial<Card>[]
    assert.equal(card.id, 'receta-rapida')
    assert.equal(card.cwd, undefined)
    assert.equal(b.sobre(), 'Hago recetas.')
    assert.equal(b.leerDe('trabajo/receta-rapida/marca.json'), '{"cierre":"Sígueme"}')
    assert.equal(b.leerDe('trabajo/video-explicativo/marcas/Cocina.json'), '{"cierre":"En mi canal"}')

    // El chat llega quieto, en la carpeta de su estilo de aquí y sin la sesión del agente de allá: sigue con un resumen.
    const { meta, registro } = b.hilos.get('chat0001')!
    assert.equal(meta.cwd, join(b.app, 'trabajo', 'receta-rapida'))
    assert.deepEqual([meta.running, meta.resumir, meta.providerSessionId, meta.pendiente, meta.background], [false, true, undefined, undefined, undefined])
    const lineas = registro.trim().split('\n').map((l) => JSON.parse(l))
    assert.deepEqual(lineas.map((l) => l.t), ['user', 'turn_end', 'info'])
    assert.match(lineas[2].text, /PORTATIL/)
    // Uno que aún no tenía sesión no necesita resumen.
    assert.equal(b.hilos.get('chat0002')!.meta.resumir, undefined)
  } finally {
    a.fin()
    b.fin()
  }
})

test('traer no pisa nada de lo que ya hay aquí, y traer dos veces no duplica', async () => {
  const a = portatil()
  const b = sloth('ESCRITORIO')
  try {
    const { paquete } = await armar(a.fuentes())
    // Aquí ya hay un estilo con ese nombre, un chat con ese id, «Sobre ti» y la marca.
    b.poner('data/tus-cards.json', JSON.stringify([{ id: 'receta-rapida', title: 'La mía', skill: 'receta-rapida' }]))
    b.poner('skills/receta-rapida/SKILL.md', '# La mía\n')
    b.poner('trabajo/receta-rapida/marca.json', '{"cierre":"El de aquí"}')
    b.ponerSobre('Lo de aquí.')
    b.hilos.set('chat0001', { meta: { id: 'chat0001' } as SessionMeta, registro: 'el de aquí' })

    assert.deepEqual(await traer(paquete, b.destino), { estilos: [], chats: 1, sobreTi: false, marcas: 1 })
    assert.equal(b.leerDe('skills/receta-rapida/SKILL.md'), '# La mía\n')
    assert.equal(existsSync(join(b.app, 'skills/receta-rapida/huellas/mio.json')), false)
    assert.equal(JSON.parse(b.leerDe('data/tus-cards.json')).length, 1)
    assert.equal(b.leerDe('trabajo/receta-rapida/marca.json'), '{"cierre":"El de aquí"}')
    assert.equal(b.sobre(), 'Lo de aquí.')
    assert.equal(b.hilos.get('chat0001')!.registro, 'el de aquí')

    assert.deepEqual(await traer(paquete, b.destino), { estilos: [], chats: 0, sobreTi: false, marcas: 0 })
  } finally {
    a.fin()
    b.fin()
  }
})

test('una card tuya que usa la skill de un estilo de Sloth viaja sin la skill, y entra donde esa skill está', async () => {
  const a = sloth('PORTATIL')
  const b = sloth('ESCRITORIO')
  try {
    a.poner('data/tus-cards.json', JSON.stringify([{ id: 'video-explicativo-2', title: 'Explicativo (copia)', skill: 'video-explicativo' }]))
    const { paquete, manifiesto } = await armar(a.fuentes())
    assert.deepEqual(manifiesto.archivos.map((x) => x.ruta), ['tus-cards.json'])
    assert.deepEqual((await traer(paquete, b.destino)).estilos, ['Explicativo (copia)'])
    assert.equal(b.cards().some((c) => c.id === 'video-explicativo-2'), true)
  } finally {
    a.fin()
    b.fin()
  }
})

test('si no cabe, van menos chats (los más nuevos) y, si aún no, los estilos sin lo personal', async () => {
  const a = portatil()
  try {
    // Chats que no se comprimen, de 200 KB cada uno, y huellas de 300 KB.
    for (let i = 3; i < 9; i++) a.chat(`chat000${i}`, {}, randomBytes(200_000).toString('base64'))
    const menos = await armar(a.fuentes(), 700_000)
    assert.ok(menos.paquete.length <= 700_000)
    assert.ok(menos.manifiesto.chats > 0 && menos.manifiesto.chats < 8)
    assert.ok(menos.manifiesto.archivos.some((x) => x.ruta === 'chats/chat0001.json'), 'el más nuevo va')
    assert.ok(menos.manifiesto.archivos.some((x) => x.ruta === 'skills/receta-rapida/huellas/mio.json'))

    a.poner('skills/receta-rapida/huellas/pesado.json', randomBytes(300_000).toString('base64'))
    const sinPersonal = await armar(a.fuentes(), 100_000)
    // Sin las huellas caben los dos chats chicos, los más nuevos; los de 200 KB, no.
    assert.equal(sinPersonal.manifiesto.chats, 2)
    assert.equal(sinPersonal.manifiesto.archivos.some((x) => x.ruta.includes('/huellas/')), false)
    assert.ok(sinPersonal.manifiesto.archivos.some((x) => x.ruta === 'skills/receta-rapida/SKILL.md'))

    await assert.rejects(armar(a.fuentes(), 100), RespaldoMalo)
  } finally {
    a.fin()
  }
})

test('la huella dice si hay algo nuevo que guardar, sin leer los archivos', () => {
  const a = portatil()
  const vacia = sloth('NUEVA')
  try {
    assert.equal(huellaDe(vacia.fuentes()), '')
    const antes = huellaDe(a.fuentes())
    assert.equal(huellaDe(a.fuentes()), antes)
    a.chat('chat0003')
    assert.notEqual(huellaDe(a.fuentes()), antes)
  } finally {
    a.fin()
    vacia.fin()
  }
})

/** Un paquete hecho a mano, con las rutas que se pidan. */
function paqueteCon(rutas: string[], formato = 1) {
  const datos = Buffer.from('x')
  const cabeza = Buffer.from(JSON.stringify({ formato, sloth: '0.4.1', nombre: 'OTRA', fecha: '', estilos: [], chats: 0, archivos: rutas.map((ruta) => ({ ruta, bytes: datos.length })) }))
  const largo = Buffer.alloc(4)
  largo.writeUInt32BE(cabeza.length)
  return gzipSync(Buffer.concat([largo, cabeza, ...rutas.map(() => datos)]))
}

test('una copia con rutas que salen de su sitio no se abre', async () => {
  for (const ruta of ['../fuera.txt', 'skills/../../x.md', 'skills/Mala/SKILL.md', 'C:/x.json', 'chats/../x.json', 'data/licencia.json', 'marcas/receta/otra/cosa.json', 'skills\\x\\y.md'])
    await assert.rejects(leer(paqueteCon([ruta])), RespaldoMalo, ruta)
  await assert.rejects(leer(Buffer.from('no es una copia')), RespaldoMalo)
  await assert.rejects(leer(paqueteCon(['sobre-ti.json'], 99)), /más nueva/)
  assert.deepEqual([...(await leer(paqueteCon(['sobre-ti.json', 'skills/mi-estilo/a/b.md', 'marcas/mi-estilo/marcas/Canal uno.json', 'chats/abc12345.jsonl']))).archivos.keys()].length, 4)
})
