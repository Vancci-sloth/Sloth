import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { voicesCloning } from './voz/voices-cloning.ts'

/** Pide `ruta` al `apiAdmin` de Sloth (con `json`, un POST) y da lo que respondió. */
async function pedir(vc: ReturnType<typeof voicesCloning>, ruta: string, json?: unknown) {
  let status = 0
  let cuerpo = ''
  const res = { writeHead: (s: number) => void (status = s), end: (c: string) => void (cuerpo = c) } as unknown as ServerResponse
  const trozos = json === undefined ? [] : [Buffer.from(JSON.stringify(json))]
  const req = Object.assign(Readable.from(trozos), { method: json === undefined ? 'GET' : 'POST', headers: {} }) as unknown as IncomingMessage
  await vc.apiAdmin(req, res, new URL(ruta, 'http://localhost'))
  return { status, datos: JSON.parse(cuerpo) as Record<string, unknown> }
}

test('el Administrador guarda el panel de la primera página y lo da sin preguntar al cobro', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const pedidos: string[] = []
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    pedidos.push(String(url))
    return new Response(JSON.stringify({ configurado: true, llaves: [], pagina: 1 }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })

  // Antes de leer nada, no hay nada guardado.
  assert.equal((await pedir(vc, '/api/admin/voz/guardado')).status, 404)
  // Otra página no se guarda: lo guardado es lo que se ve al abrir.
  await pedir(vc, '/api/admin/voz?pagina=2&consumo=1')
  assert.equal((await pedir(vc, '/api/admin/voz/guardado')).status, 404)

  const leido = await pedir(vc, '/api/admin/voz?pagina=1&consumo=1')
  assert.equal(leido.status, 200)
  const antes = pedidos.length
  const guardado = await pedir(vc, '/api/admin/voz/guardado')
  assert.equal(guardado.status, 200)
  assert.equal(guardado.datos.configurado, true)
  assert.equal(typeof guardado.datos.leido, 'number')
  assert.equal(pedidos.length, antes, 'lo guardado no pregunta al cobro')
})

test('en una computadora que no es la del creador, no hay nada guardado que dar', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => undefined })
  assert.equal((await pedir(vc, '/api/admin/voz/guardado')).status, 404)
  assert.deepEqual((await pedir(vc, '/api/admin')).datos, { creador: false })
})

test('solo lo cambiado desde Administrador se puede deshacer: se anota con su id, y deshacerlo lo marca', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const mandado: unknown[] = []
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    mandado.push(init?.body ? JSON.parse(String(init.body)) : undefined)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })

  const suma = await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: 5000 })
  const cambio = suma.datos.cambio as { id: string; tipo: string; valor: number }
  assert.equal(cambio.tipo, 'creditos')
  assert.equal(cambio.valor, 5000)
  await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: -5000, deshace: cambio.id })
  await pedir(vc, '/api/admin/voz/estado', { externo: 'beto', status: 'suspended' })
  // Al cobro le llega lo de siempre (el `deshace` no le estorba).
  assert.deepEqual(mandado[0], { externo: 'ana', amount: 5000 })

  const deAna = (await pedir(vc, '/api/admin/voz/cambios?externo=ana')).datos.cambios as { id: string; deshace?: string; deshecho?: string }[]
  assert.equal(deAna.length, 2)
  assert.ok(deAna[0].deshecho, 'el primero quedó deshecho')
  assert.equal(deAna[1].deshace, cambio.id)
  const deBeto = (await pedir(vc, '/api/admin/voz/cambios?externo=beto')).datos.cambios as { tipo: string; valor: string }[]
  assert.deepEqual(deBeto.map((c) => [c.tipo, c.valor]), [['estado', 'suspended']])

  // Deshacer otra vez lo ya deshecho (desde el aviso y desde la ficha) no llega al cobro.
  const antes = mandado.length
  const otraVez = await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: -5000, deshace: cambio.id })
  assert.equal(otraVez.status, 409)
  assert.equal(mandado.length, antes)
  assert.equal((await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: 1, deshace: 'no-existe' })).status, 404)
})

test('la ficha de cada quien se guarda al leerla y se da sin preguntar al cobro', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ usuario: { status: 200, datos: { credits: 7 } }, registro: [] }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })
  assert.equal((await pedir(vc, '/api/admin/voz/ficha?externo=ana')).datos, null)
  await pedir(vc, '/api/admin/voz/usuario?externo=ana')
  globalThis.fetch = (async () => {
    throw new Error('no debía preguntar al cobro')
  }) as typeof fetch
  const g = (await pedir(vc, '/api/admin/voz/ficha?externo=ana')).datos as { datos: { usuario: { datos: { credits: number } } }; leido: number }
  assert.equal(g.datos.usuario.datos.credits, 7)
  assert.equal(typeof g.leido, 'number')
  // Se escribe al disco medio segundo después: que acabe antes de borrar la carpeta.
  await new Promise((ok) => setTimeout(ok, 700))
})

test('deshacer pide el contrario exacto, y dos a la vez no pasan las dos', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  let llegaron = 0
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async () => {
    llegaron++
    await new Promise((ok) => setTimeout(ok, 50))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })
  const { id } = (await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: 700 })).datos.cambio as { id: string }
  // A otra persona, o no lo contrario: no.
  assert.equal((await pedir(vc, '/api/admin/voz/creditos', { externo: 'beto', amount: -700, deshace: id })).status, 400)
  assert.equal((await pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: -1400, deshace: id })).status, 400)
  const antes = llegaron
  const [a, b] = await Promise.all([pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: -700, deshace: id }), pedir(vc, '/api/admin/voz/creditos', { externo: 'ana', amount: -700, deshace: id })])
  assert.deepEqual([a.status, b.status].sort(), [200, 409])
  assert.equal(llegaron - antes, 1, 'solo uno llegó al cobro')
})

test('el panel junta a los usuarios de todas las páginas de cada llave', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const pagina = (n: number) => ({ llaves: [{ id: 'L1', usuarios: { status: 200, datos: { total: 150, per_page: 100, users: n === 1 ? [{ external_id: 'a' }] : [{ external_id: 'b' }] } } }], cuentas: n === 1 ? { a: { email: 'a@x.mx' } } : { b: { email: 'b@x.mx' } } })
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async (url: string) => new Response(JSON.stringify(pagina(/pagina=2/.test(String(url)) ? 2 : 1)), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })
  const r = (await pedir(vc, '/api/admin/voz?pagina=1&consumo=1')).datos as { llaves: { usuarios: { datos: { users: { external_id: string }[] } } }[]; cuentas: Record<string, unknown>; todasLasPaginas: boolean }
  assert.deepEqual(r.llaves[0].usuarios.datos.users.map((u) => u.external_id), ['a', 'b'])
  assert.deepEqual(Object.keys(r.cuentas).sort(), ['a', 'b'])
  assert.equal(r.todasLasPaginas, true)
  // Las fichas de fondo (también b) se leen después: que acaben antes de borrar la carpeta.
  await new Promise((ok) => setTimeout(ok, 900))
})

test('nadie sale en el panel sin su ficha: las de quien nunca se ha leído se leen antes de darlo', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-admin-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const panel = { llaves: [{ id: 'L1', usuarios: { status: 200, datos: { total: 2, per_page: 100, users: [{ external_id: 'a' }, { external_id: 'b' }] } } }], cuentas: {} }
  const fetchDeVerdad = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    const u = String(url)
    const datos = /\/voz\/admin\/usuario/.test(u) ? { usuario: { status: 200, datos: { credits: 1 } }, registro: [{ id: 1, accion: 'alta' }] } : panel
    await new Promise((ok) => setTimeout(ok, 20))
    return new Response(JSON.stringify(datos), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  t.after(() => void (globalThis.fetch = fetchDeVerdad))
  const vc = voicesCloning(carpeta, { credencial: () => undefined, creador: () => ({ llave: 'llave-del-creador' }) })
  assert.equal((await pedir(vc, '/api/admin/voz?pagina=1&consumo=1')).status, 200)
  // Justo al recibir el panel, las dos ya están.
  for (const e of ['a', 'b']) assert.notEqual((await pedir(vc, `/api/admin/voz/ficha?externo=${e}`)).datos, null, `la ficha de ${e}`)
  await new Promise((ok) => setTimeout(ok, 700))
})
