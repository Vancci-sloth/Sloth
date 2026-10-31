import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
// @ts-expect-error: un script de la skill, sin tipos
import { turnoNavegador } from '../skills/video-base/scripts/chrome.mjs'
import { crearTope, sitiosDeAgente } from './tope-agentes.ts'

const pronto = () => new Promise((r) => setTimeout(r, 5))

test('pasa hasta el tope, y los demás en orden según se sueltan', async () => {
  const tope = crearTope(2, () => 8e9)
  const orden: number[] = []
  for (const n of [1, 2, 3, 4]) void tope.pedir().then(() => orden.push(n))
  await pronto()
  assert.deepEqual(orden, [1, 2])
  tope.soltar()
  await pronto()
  assert.deepEqual(orden, [1, 2, 3])
})

test('con poca memoria uno más no entra, pero si no hay ninguno, sí', async () => {
  const tope = crearTope(8, () => 1e9)
  assert.equal(await tope.pedir(), true)
  let entro = false
  void tope.pedir().then(() => (entro = true))
  await pronto()
  assert.equal(entro, false)
  tope.soltar()
  await pronto()
  assert.equal(entro, true)
})

test('detener el hilo saca de la fila al que esperaba', async () => {
  const tope = crearTope(1, () => 8e9)
  await tope.pedir()
  const corte = new AbortController()
  const pedido = tope.pedir(corte.signal)
  corte.abort()
  assert.equal(await pedido, false)
  tope.soltar()
  assert.equal(await tope.pedir(), true)
})

test('al cerrarse el proceso de Claude se sueltan sus sitios, y el que llega tarde no se queda con uno', async () => {
  const tope = crearTope(2, () => 8e9)
  const sitios = sitiosDeAgente(tope)
  await sitios.pedir('a')
  await sitios.pedir('b')
  const tarde = sitios.pedir('c')
  sitios.soltar('a')
  sitios.soltar('a') // dos avisos del mismo no sueltan dos sitios
  await tarde
  sitios.cerrar()
  assert.equal(await tope.pedir(), true)
  assert.equal(await tope.pedir(), true)
  let tercero = false
  void tope.pedir().then(() => (tercero = true))
  await pronto()
  assert.equal(tercero, false)
})

test('un SendMessage que despierta a un subagente ocupa sitio hasta que acaba; uno que solo deja un recado lo devuelve', async () => {
  const tope = crearTope(1, () => 8e9)
  const sitios = sitiosDeAgente(tope, 1)
  await sitios.pedir('despierta')
  sitios.arranco('despierta')
  sitios.siNoArranca('despierta')
  await pronto()
  let otro = false
  void sitios.pedir('recado').then(() => (otro = true))
  await pronto()
  assert.equal(otro, false)

  sitios.soltar('despierta')
  await pronto()
  assert.equal(otro, true)
  sitios.siNoArranca('recado')
  await pronto()
  assert.equal(await tope.pedir(), true)
})

test('un navegador espera sitio en toda la máquina, y recupera el de un proceso muerto', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-navegadores-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const opciones = { carpeta, tope: 2, memoria: () => 8e9, pausa: 2 }
  const soltar = await turnoNavegador(opciones)
  await turnoNavegador(opciones)
  let tercero = false
  void turnoNavegador({ ...opciones, paciencia: 200 }).then(() => (tercero = true))
  await pronto()
  assert.equal(tercero, false)
  soltar()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(tercero, true)

  writeFileSync(join(carpeta, 'sloth-navegador-0.lock'), '999999')
  rmSync(join(carpeta, 'sloth-navegador-1.lock'), { force: true })
  await turnoNavegador({ ...opciones, tope: 1 })
  assert.equal(existsSync(join(carpeta, 'sloth-navegador-0.lock')), true)
})

test('tras la paciencia abre igual: un navegador de más es mejor que un agente colgado', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'sloth-navegadores-'))
  t.after(() => rmSync(carpeta, { recursive: true, force: true }))
  const opciones = { carpeta, tope: 1, memoria: () => 8e9, pausa: 2, paciencia: 20 }
  await turnoNavegador(opciones)
  assert.equal(typeof (await turnoNavegador(opciones)), 'function')
})
