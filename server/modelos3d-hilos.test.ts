import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Card, SessionMeta } from '../shared/types.ts'
import { idDe, mensajeAmpliar, mensajeNuevo, modelos3dHilos } from './modelos3d-hilos.ts'

test('el id sale del nombre, sin acentos ni signos', () => {
  assert.equal(idDe('Caja Fuerte Mágica!'), 'caja-fuerte-magica')
  assert.equal(idDe('¡¡'), 'modelo')
})

test('los mensajes llevan lo pedido y el comando de la skill', () => {
  const m = mensajeNuevo({ nombre: 'Caja fuerte', descripcion: 'Con puerta que abre', referencia: '/x/ref.png' })
  assert.match(m, /Id: caja-fuerte/)
  assert.match(m, /Imagen de referencia: \/x\/ref\.png/)
  assert.match(m, /modelos\.py nuevo caja-fuerte --nombre "Caja fuerte"/)
  const a = mensajeAmpliar({ id: 'moneda', nombre: 'Moneda', que: 'colores del proyecto "Hoy"' })
  assert.match(a, /Modelo: Moneda \(moneda\)/)
  assert.match(a, /modelos\.py ampliar moneda --que "colores del proyecto 'Hoy'"/)
})

/** Un servidor con las rutas de modelos 3D, una biblioteca de mentira y sesiones que apuntan lo que se les manda. */
async function montar() {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-m3d-'))
  const biblioteca = join(dir, 'skill')
  mkdirSync(join(biblioteca, 'modelos', 'moneda'), { recursive: true })
  writeFileSync(join(biblioteca, 'modelos', 'moneda', 'modelo.json'), JSON.stringify({ nombre: 'Moneda de oro' }))
  const adjuntos = join(dir, 'adjuntos')
  const hilos: { meta: Omit<SessionMeta, 'id'>; texto?: string }[] = []
  const comandos: string[][] = []
  const card = { id: 'nuevo-modelo-3d', title: 'Nuevo modelo 3D', description: '', cwd: join(dir, 'trabajo', 'nuevo-modelo-3d') } as Card
  const api = modelos3dHilos({
    cards: () => [card],
    sessions: {
      create: (i) => {
        const meta = { id: 'h1', ...i, createdAt: 0, updatedAt: 0, running: false } as SessionMeta
        hilos.push({ meta })
        return meta
      },
      send: (_id, texto) => void (hilos[hilos.length - 1].texto = texto)
    },
    skillRef: (nombre) => ({ name: nombre, path: '/skills/modelos-3d/SKILL.md' }),
    modeloPorOmision: () => ({ model: 'claude-x', effort: 'medium' }),
    adjuntos,
    biblioteca,
    python: () => 'python',
    ejecutar: async (_p, args) => (comandos.push(args), args.includes('falla') ? { codigo: 1, salida: 'uno\nRobot: no se pudo' } : { codigo: 0, salida: 'ok' })
  })
  const server: Server = createServer(async (req, res) => {
    if (!(await api.api(req, res, new URL(req.url!, 'http://x')))) res.writeHead(404).end('{}')
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const cerrar = async () => {
    await new Promise((ok) => server.close(ok))
    rmSync(dir, { recursive: true, force: true })
  }
  return { base, hilos, comandos, adjuntos, cerrar, card }
}

const post = (url: string, cuerpo?: unknown, init?: RequestInit) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), ...init })

test('POST /nuevo abre un hilo de la card con el primer mensaje', async () => {
  const m = await montar()
  try {
    const r = await post(`${m.base}/api/modelos3d/nuevo`, { nombre: 'Caja fuerte', descripcion: 'Con puerta' })
    assert.equal(r.status, 200)
    assert.equal(m.hilos.length, 1)
    assert.equal(m.hilos[0].meta.cardId, 'nuevo-modelo-3d')
    assert.equal(m.hilos[0].meta.cwd, m.card.cwd)
    assert.equal(m.hilos[0].meta.model, 'claude-x')
    assert.match(m.hilos[0].texto ?? '', /modelos\.py nuevo caja-fuerte/)
    // Sin descripción, o con un id que ya existe, no abre nada.
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { nombre: 'Caja' })).status, 400)
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { nombre: 'Moneda', descripcion: 'otra' })).status, 409)
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { nombre: 'Caja', descripcion: 'x', referencia: '/etc/passwd' })).status, 400)
    assert.equal(m.hilos.length, 1)
  } finally {
    await m.cerrar()
  }
})

test('POST /<id>/ampliar abre un hilo con lo que se quiere y rechaza lo que no existe', async () => {
  const m = await montar()
  try {
    const r = await post(`${m.base}/api/modelos3d/moneda/ampliar`, { que: 'una variante azul' })
    assert.equal(r.status, 200)
    assert.match(m.hilos[0].texto ?? '', /Modelo: Moneda de oro \(moneda\)/)
    assert.match(m.hilos[0].meta.title, /Ampliar Moneda de oro/)
    assert.equal((await post(`${m.base}/api/modelos3d/otro/ampliar`, { que: 'x' })).status, 404)
    assert.equal((await post(`${m.base}/api/modelos3d/moneda/ampliar`, { que: '  ' })).status, 400)
    assert.equal((await post(`${m.base}/api/modelos3d/..%2Fx/ampliar`, { que: 'x' })).status, 404)
  } finally {
    await m.cerrar()
  }
})

test('POST /importar guarda el .glb y corre modelos.py importar; si falla, dice por qué', async () => {
  const m = await montar()
  try {
    const glb = Buffer.from('glTF\x02\x00\x00\x00')
    const r = await fetch(`${m.base}/api/modelos3d/importar?nombre=${encodeURIComponent('Robot Rojo')}&categoria=Objetos&licencia=CC0`, { method: 'POST', body: glb })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { id: 'robot-rojo' })
    const args = m.comandos[0]
    assert.ok(args.includes('importar') && args.includes('Robot Rojo') && args.includes('--licencia'))
    const mal = await fetch(`${m.base}/api/modelos3d/importar?nombre=falla`, { method: 'POST', body: glb })
    assert.equal(mal.status, 500)
    assert.match(((await mal.json()) as { error: string }).error, /Robot: no se pudo/)
    assert.equal((await fetch(`${m.base}/api/modelos3d/importar`, { method: 'POST', body: glb })).status, 400)
  } finally {
    await m.cerrar()
  }
})
