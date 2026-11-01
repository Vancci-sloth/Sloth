/**
 * El MCP `navegador`, a demanda. Playwright MCP tarda en arrancar y ocupa lo suyo, y antes corría uno por hilo aunque el
 * agente nunca abriera una página (en una instalación real, 30 de 42 hilos). Este proceso, sin paquetes, le contesta al
 * agente lo que no necesita un navegador (`initialize` y la lista de herramientas, guardados de la primera vez) y solo
 * lanza Playwright en la primera llamada a una herramienta. Desde ahí es un tubo: lo pasa todo tal cual, en los dos
 * sentidos.
 *
 * Con `suelta` (milisegundos), tras ese tiempo sin llamadas cierra Playwright y vuelve a esperar. Suelta también la
 * conexión con la página del hilo, que así puede frenarse y cerrarse (`electron/navegador.ts`); la siguiente llamada lo
 * vuelve a lanzar, sobre la misma página. Solo con el navegador integrado: los otros guardan en Playwright lo que abrieron.
 *
 * Se lanza como `node navegador-mcp.mjs <caché> <suelta> <cli.js de Playwright> [sus argumentos]`. La lista de
 * herramientas no cambia con esos argumentos: la caché va por versión del paquete (`server/navegador-agente.ts`).
 * Habla MCP por stdio, un JSON por renglón. `scripts/compilar.mjs` lo copia tal cual.
 */
import { spawn } from 'node:child_process'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const [cache, suelta, ...programa] = process.argv.slice(2)
const OCIOSO = Number(suelta)
const ARRANQUE = 'sloth-arranque'

function leerGuardado() {
  try {
    const g = JSON.parse(readFileSync(cache, 'utf8'))
    return g.capabilities && Array.isArray(g.tools) ? g : null
  } catch {
    return null // La primera vez con esta versión.
  }
}

let guardado = leerGuardado()
/** Lo que mandó el agente en `initialize`: a Playwright se le repite tal cual al lanzarlo. */
let inicial
/** El `id` de un `initialize` que espera a Playwright: sin caché, contesta él. */
let esperaInit
/** El `id` de un `tools/list` que contesta Playwright, para guardar su respuesta. */
let esperaLista
let aprendido
/** Playwright, si corre, y lo que espera a que acabe de arrancar. */
let proceso = null
let listo = false
let cola = []
/** Las llamadas sin contestar: mientras haya alguna, no se suelta. */
const llamadas = new Set()
let reloj

const contestar = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
const sinMetodo = (id) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } })}\n`)

function guardar(datos) {
  guardado = datos
  try {
    writeFileSync(`${cache}.${process.pid}`, JSON.stringify(datos))
    renameSync(`${cache}.${process.pid}`, cache)
  } catch {
    // La próxima vez se vuelve a preguntar.
  }
}

function lanzar() {
  const hijo = spawn(process.execPath, programa, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  proceso = hijo
  listo = false
  hijo.stdin.on('error', () => {})
  hijo.on('exit', (codigo) => {
    // Uno que se soltó ya no importa; si se fue el que trabaja, el agente lo ve como siempre: se cierra su MCP.
    if (hijo === proceso) process.exit(codigo ?? 0)
  })
  createInterface(hijo.stdout).on('line', (linea) => dePlaywright(hijo, linea))
  hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: ARRANQUE, method: 'initialize', params: inicial })}\n`)
}

function aPlaywright(linea, m) {
  if (m.method === 'tools/call') {
    llamadas.add(m.id)
    clearTimeout(reloj)
  }
  if (m.method === 'tools/list' && !guardado) esperaLista = m.id
  if (m.method === 'notifications/cancelled') llamadas.delete(m.params?.requestId)
  proceso.stdin.write(`${linea}\n`)
}

function programar() {
  clearTimeout(reloj)
  if (OCIOSO && guardado && !llamadas.size) reloj = setTimeout(soltar, OCIOSO)
}

function soltar() {
  if (!proceso || !listo || llamadas.size) return
  const hijo = proceso
  proceso = null
  hijo.stdin.end()
}

function dePlaywright(hijo, linea) {
  if (hijo !== proceso) return
  let m
  try {
    m = JSON.parse(linea)
  } catch {
    return process.stdout.write(`${linea}\n`)
  }
  if (m.id === ARRANQUE) {
    if (m.error) return process.exit(1)
    aprendido = { capabilities: m.result.capabilities, serverInfo: m.result.serverInfo }
    listo = true
    hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
    if (esperaInit !== undefined) contestar(esperaInit, m.result)
    esperaInit = undefined
    for (const l of cola) aPlaywright(l, JSON.parse(l))
    cola = []
    return programar()
  }
  if (m.id === esperaLista && m.result?.tools) {
    esperaLista = undefined
    guardar({ ...aprendido, tools: m.result.tools })
    programar()
  }
  process.stdout.write(`${linea}\n`)
  if (llamadas.delete(m.id)) programar()
}

function delAgente(linea) {
  let m
  try {
    m = JSON.parse(linea)
  } catch {
    return
  }
  // Playwright ya recibe el suyo al lanzarse.
  if (m.method === 'notifications/initialized') return
  if (proceso) {
    if (listo) aPlaywright(linea, m)
    else cola.push(linea)
    return
  }
  // Una respuesta a algo que pidió un Playwright ya soltado, o un aviso sin nadie que lo oiga.
  if (m.method === undefined) return
  switch (m.method) {
    case 'initialize':
      inicial = m.params
      if (guardado) return contestar(m.id, { protocolVersion: m.params?.protocolVersion, capabilities: guardado.capabilities, serverInfo: guardado.serverInfo })
      esperaInit = m.id
      return lanzar()
    case 'tools/list':
      return contestar(m.id, { tools: guardado.tools })
    case 'ping':
      return contestar(m.id, {})
    case 'tools/call':
      cola.push(linea)
      return lanzar()
    default:
      if (m.id !== undefined) sinMetodo(m.id)
  }
}

createInterface(process.stdin)
  .on('line', delAgente)
  .on('close', () => {
    // Playwright sale solo al cerrarle su entrada, y cierra su navegador. Si no corre, no hay nada que esperar.
    if (proceso) proceso.stdin.end()
    else process.exit(0)
  })
