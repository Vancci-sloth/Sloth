import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import test from 'node:test'
import { MODELO3D_CARD } from '../shared/modelos3d.ts'
import type { SessionMeta } from '../shared/types.ts'
import { idDe, mensajeNuevo, modelos3dAcciones } from './modelos3d-acciones.ts'

test('el id sale del nombre, sin acentos ni signos', () => {
  assert.equal(idDe('Caja Fuerte Mágica!'), 'caja-fuerte-magica')
  assert.equal(idDe('¡¡'), 'modelo')
})

test('el primer mensaje lleva lo pedido y apunta a la skill', () => {
  const m = mensajeNuevo('  Una caja fuerte que se abre ', true)
  assert.match(m, /skill modelos-3d/)
  assert.match(m, /imagen que te mando/)
  assert.match(m, /\n\nUna caja fuerte que se abre$/)
  assert.doesNotMatch(mensajeNuevo('x', false), /imagen/)
})

/** Un servidor con las rutas, una biblioteca de mentira y sesiones que apuntan lo que se les manda. */
async function montar() {
  const dir = mkdtempSync(join(tmpdir(), 'sloth-m3d-'))
  const biblioteca = join(dir, 'skills', 'modelos-3d')
  mkdirSync(join(biblioteca, 'modelos', 'moneda'), { recursive: true })
  writeFileSync(join(biblioteca, 'modelos', 'moneda', 'modelo.json'), '{}')
  const adjuntos = join(dir, 'adjuntos')
  mkdirSync(adjuntos)
  const trabajo = join(dir, 'trabajo', 'modelos-3d')
  const hilos: { meta: SessionMeta; texto?: string; imagenes?: string[] }[] = []
  const corridas: { args: string[]; cwd: string; glb: string }[] = []
  const api = modelos3dAcciones({
    sessions: {
      create: (i) => {
        const meta = { id: `h${hilos.length + 1}`, ...i, createdAt: 0, updatedAt: 0, running: false } as SessionMeta
        hilos.push({ meta })
        return meta
      },
      send: (_id, texto, _skill, imagenes) => Object.assign(hilos[hilos.length - 1], { texto, imagenes })
    },
    skillRef: (name) => ({ name, path: '/skills/modelos-3d/SKILL.md' }),
    modelo: (p) => ({ model: p.model ?? 'claude-x', effort: p.effort }),
    adjuntos,
    biblioteca,
    trabajo,
    python: () => 'python',
    ejecutar: async (_p, args, cwd) => {
      const glb = args[args.indexOf('importar') + 1]
      corridas.push({ args, cwd, glb: readFileSync(glb, 'latin1') })
      // Como modelos.py: arma el proyecto de prueba dentro de la carpeta temporal.
      mkdirSync(join(args[args.indexOf('--proyecto') + 1], 'public'), { recursive: true })
      return args.includes('falla') ? { codigo: 1, salida: 'uno\nEl .glb pide KHR_x' } : { codigo: 0, salida: `vista\nimportado: ${idDe(args[args.indexOf('--nombre') + 1])}\n` }
    }
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
  return { base, hilos, corridas, adjuntos, trabajo, cerrar }
}

const post = (url: string, cuerpo: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) })

test('POST /nuevo abre un hilo de la card oculta, cada uno en su carpeta', async () => {
  const m = await montar()
  try {
    const imagen = join(m.adjuntos, '1-ref.png')
    writeFileSync(imagen, 'png')
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { descripcion: 'Caja fuerte con rueda', referencia: imagen, model: 'claude-y' })).status, 200)
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { descripcion: 'Caja fuerte con rueda' })).status, 200)
    const [a, b] = m.hilos
    assert.equal(a.meta.cardId, MODELO3D_CARD.id)
    assert.equal(a.meta.model, 'claude-y')
    assert.deepEqual(a.imagenes, [imagen])
    assert.match(a.texto ?? '', /Caja fuerte con rueda/)
    // Dos hilos a la vez no comparten proyecto.
    assert.equal(basename(a.meta.cwd), 'caja-fuerte-con-rueda')
    assert.equal(basename(b.meta.cwd), 'caja-fuerte-con-rueda-2')
    assert.ok(existsSync(a.meta.cwd) && existsSync(b.meta.cwd))
    // Sin descripción, o con una imagen que no se subió desde Sloth, no abre nada.
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { descripcion: '  ' })).status, 400)
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { descripcion: 'x', referencia: join(m.adjuntos, '..', 'fuera.png') })).status, 400)
    assert.equal((await post(`${m.base}/api/modelos3d/nuevo`, { descripcion: 'x', referencia: join(m.adjuntos, 'no-esta.png') })).status, 400)
    assert.equal(m.hilos.length, 2)
  } finally {
    await m.cerrar()
  }
})

test('POST /importar pasa el .glb a modelos.py y no deja nada temporal, salga bien o mal', async () => {
  const m = await montar()
  try {
    const glb = Buffer.from('glTF\x02\x00\x00\x00', 'latin1')
    const r = await fetch(`${m.base}/api/modelos3d/importar?nombre=${encodeURIComponent('Robot Rojo')}&categoria=Objetos&licencia=CC0`, { method: 'POST', body: glb })
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { id: 'robot-rojo' })
    const { args, glb: recibido } = m.corridas[0]
    assert.equal(recibido, glb.toString('latin1'))
    assert.ok(args.includes('Robot Rojo') && args.includes('CC0') && args.includes('--proyecto'))

    const mal = await fetch(`${m.base}/api/modelos3d/importar?nombre=falla`, { method: 'POST', body: glb })
    assert.equal(mal.status, 500)
    assert.match(((await mal.json()) as { error: string }).error, /pide KHR_x/)
    // Ni la subida ni el proyecto de prueba se quedan: la única copia es la de la biblioteca.
    assert.deepEqual(readdirSync(m.trabajo), [])

    assert.equal((await fetch(`${m.base}/api/modelos3d/importar`, { method: 'POST', body: glb })).status, 400)
    assert.equal((await fetch(`${m.base}/api/modelos3d/importar?nombre=Moneda`, { method: 'POST', body: glb })).status, 409)
    assert.equal(m.corridas.length, 2)
  } finally {
    await m.cerrar()
  }
})
