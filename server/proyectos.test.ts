import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { serieDelBanco } from '../shared/proyectos.ts'
import { Proyectos } from './proyectos.ts'
import { Sessions } from './sessions.ts'

function carpeta(t: { after(fn: () => void): void }) {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-proyectos-'))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  return { dir: join(raiz, 'proyectos') }
}

test('arranca sin proyectos y sin sembrar nada', (t) => {
  const { dir } = carpeta(t)
  const p = new Proyectos(dir)
  assert.deepEqual(p.listar(true), [])
  const a = p.crear({ nombre: 'Canal' })
  assert.equal(a.color, 'ambar')
  const mem = p.leerMemoria(a.id)
  for (const seccion of ['## Marca', '## Tono', '## Público', '## Reglas', '## Cierre']) assert.ok(mem.includes(seccion), seccion)
})

test('crear, renombrar, cambiar color, series y memoria', (t) => {
  const { dir } = carpeta(t)
  const p = new Proyectos(dir)
  const a = p.crear({ nombre: '  Mi  Canal ', color: 'oro' })
  assert.equal(a.id, 'mi-canal')
  assert.equal(a.nombre, 'Mi Canal')
  assert.equal(p.crear({ nombre: 'Mi canal' }).id, 'mi-canal-2')
  assert.throws(() => p.crear({ nombre: '   ' }), /nombre/)
  assert.equal(p.actualizar(a.id, { nombre: 'Otro', color: 'verde' }).color, 'verde')
  assert.throws(() => p.actualizar(a.id, { color: '#ff00ff' }), /paleta/)
  assert.equal(p.get(a.id)!.nombre, 'Otro')
  const s = p.crearSerie(a.id, { nombre: 'Mitos de aduana' })
  assert.equal(s.id, 'mitos-de-aduana')
  assert.match(p.leerMemoria(a.id, s.id), /Mitos de aduana \(Otro\)/)
  p.escribirMemoria(a.id, s.id, 'regla\r\nnueva')
  assert.equal(readFileSync(p.rutaMemoria(a.id, s.id), 'utf8'), 'regla\nnueva')
  assert.throws(() => p.escribirMemoria(a.id, 'no-existe', 'x'), /serie/)
  assert.throws(() => p.leerMemoria('no-existe'), /proyecto/)
  p.actualizarSerie(a.id, s.id, { archivado: true })
  assert.equal(p.listar().find((x) => x.id === a.id)!.series.length, 0)
  assert.equal(p.listar(true).find((x) => x.id === a.id)!.series.length, 1)
})

test('archivar no borra nada del disco', (t) => {
  const { dir } = carpeta(t)
  const p = new Proyectos(dir)
  const a = p.crear({ nombre: 'Uno' })
  p.crearSerie(a.id, { nombre: 'Serie' })
  p.archivar(a.id)
  assert.ok(existsSync(join(dir, a.id, 'proyecto.json')))
  assert.ok(existsSync(p.rutaMemoria(a.id)))
  assert.ok(existsSync(p.rutaMemoria(a.id, 'serie')))
  assert.equal(p.get(a.id)!.archivado, true)
  p.archivar(a.id, false)
  assert.equal(p.get(a.id)!.archivado, undefined)
})

test('las líneas de control y el bloque de memoria', (t) => {
  const { dir } = carpeta(t)
  const p = new Proyectos(dir)
  const canal = p.crear({ nombre: 'Mi Canal' })
  const serie = p.crearSerie(canal.id, { nombre: 'Noticias' })
  p.escribirMemoria(canal.id, undefined, '# Mi Canal\n\nTono cercano.')
  p.escribirMemoria(canal.id, serie.id, '# Noticias\n\nUn minuto.')
  assert.deepEqual(p.lineasDe(canal.id), [`Proyecto: Mi Canal`, `MemoriaProyecto: ${p.rutaMemoria(canal.id)}`])
  const conSerie = p.lineasDe(canal.id, serie.id)
  assert.equal(conSerie[0], 'Proyecto: Mi Canal · serie Noticias')
  assert.equal(conSerie[2], `MemoriaSerie: ${p.rutaMemoria(canal.id, serie.id)}`)
  assert.deepEqual(p.lineasDe('no-existe'), [])
  const bloque = p.contexto(canal.id, serie.id)
  assert.match(bloque, /^<contexto-del-proyecto>/)
  assert.match(bloque, /Memoria del proyecto Mi Canal/)
  assert.match(bloque, /Memoria de la serie Noticias/)
  assert.match(bloque, /Tono cercano/)
  assert.match(bloque, /propón/)
  assert.equal(p.contexto(), '')
})

test('una serie del proyecto coincide con la del banco por id o por nombre sin tildes', () => {
  const banco = [{ id: 'mitos', nombre: 'Mitos' }, { id: 'el-embarque', nombre: 'El embarque' }]
  assert.equal(serieDelBanco({ id: 'mitos', nombre: 'Otra cosa' }, banco)?.id, 'mitos')
  assert.equal(serieDelBanco({ id: 'x', nombre: 'MÍTOS' }, banco)?.id, 'mitos')
  assert.equal(serieDelBanco({ id: 'radar', nombre: 'Radar' }, banco), undefined)
})

test('la memoria se antepone al primer turno del agente, no a lo que se ve en el hilo, para cualquier proveedor', (t) => {
  const base = resolve('data')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'prueba-sesiones-proyecto-'))
  const { dir: dirP } = carpeta(t)
  const proyectos = new Proyectos(dirP)
  const canal = proyectos.crear({ nombre: 'Canal' })
  const serie = proyectos.crearSerie(canal.id, { nombre: 'Serie' })
  const abiertas: Sessions[] = []
  t.after(() => {
    for (const s of abiertas) s.closeAll()
    rmSync(dir, { recursive: true, force: true })
  })
  for (const model of ['codex:prueba', 'opencode:prueba']) {
    const mandados: string[] = []
    const s = new Sessions(dir, () => {}, () => {}, () => {}, () => {}, () => ({ send: (text: string) => void mandados.push(text), steer() {}, async interrupt() {}, close() {} }))
    s.contexto = (meta) => proyectos.contexto(meta.proyecto, meta.serie)
    abiertas.push(s)
    const meta = s.create({ cardId: 'prueba', title: 'Prueba', model, cwd: dir, proyecto: canal.id, serie: serie.id })
    assert.equal(meta.proyecto, canal.id)
    s.send(meta.id, 'Hola\n\nProyecto: Canal')
    assert.match(mandados[0], /^<contexto-del-proyecto>[\s\S]*Hola/)
    // Lo que se ve en el hilo es solo el mensaje.
    const visto = s.get(meta.id)!.events.find((e) => e.t === 'user')
    assert.equal(visto?.t === 'user' ? visto.text : '', 'Hola\n\nProyecto: Canal')
    // El proceso ya lo tiene: el siguiente turno no lo repite.
    s.send(meta.id, 'Otra cosa')
    assert.equal(mandados[1], 'Otra cosa')
    // Mover a «Sin proyecto».
    s.mover(meta.id)
    assert.equal(s.meta(meta.id)!.proyecto, undefined)
    assert.equal(s.meta(meta.id)!.serie, undefined)
  }
  // Sin proyecto, nada.
  const mandados: string[] = []
  const s = new Sessions(dir, () => {}, () => {}, () => {}, () => {}, () => ({ send: (text: string) => void mandados.push(text), steer() {}, async interrupt() {}, close() {} }))
  s.contexto = () => 'NO'
  abiertas.push(s)
  const m = s.create({ cardId: 'prueba', title: 'Sin', model: 'codex:prueba', cwd: dir })
  s.send(m.id, 'Hola')
  assert.equal(mandados[0], 'Hola')
})
