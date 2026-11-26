import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { ollamaAlDia } from './acceso.ts'
import { antesDeOllama, modelosDe, recordar, ventanaOllama, type ModeloOllama } from './ollama.ts'
import { conConsejo } from './otra-api.ts'

// Como los da un Ollama de verdad (`GET /api/tags`, 0.40.18, noviembre de 2026), con lo que Sloth usa de cada uno.
const CATALOGO: ModeloOllama[] = [
  { name: 'qwen3:1.7b', details: { context_length: 40960 }, capabilities: ['completion', 'tools', 'thinking'] },
  { name: 'gemma4:cloud', remote_host: 'https://ollama.com', details: { context_length: 262144 }, capabilities: ['completion', 'thinking', 'tools', 'vision'] },
  { name: 'gpt-oss:20b-cloud', remote_host: 'https://ollama.com', details: { context_length: 131072 }, capabilities: ['completion', 'tools', 'thinking'] },
  { name: 'llama3.2:1b', details: { context_length: 131072 }, capabilities: ['completion', 'tools'] },
  { name: 'all-minilm:latest', details: { context_length: 512 }, capabilities: ['embedding'] }
]

test('Ollama: solo salen los modelos que usan herramientas y tienen ventana para un hilo', () => {
  // Fuera el de embeddings y el que usa herramientas pero no llega a 64 000 de ventana.
  const modelos = modelosDe(CATALOGO)
  assert.deepEqual(modelos.map((m) => m.id), ['ollama:gemma4:cloud', 'ollama:gpt-oss:20b-cloud', 'ollama:llama3.2:1b'])
  assert.equal(modelos[2].label, 'Ollama · llama3.2:1b')
  assert.ok(modelos.every((m) => !m.precio && !m.efforts.length))
  // Uno que conversa con ventana de sobra, pero no sabe pedir una herramienta: Claude Code no podría ni leer un archivo.
  assert.deepEqual(modelosDe([{ name: 'solo-conversa:latest', details: { context_length: 131072 }, capabilities: ['completion', 'vision'] }]), [])
  // Un Ollama anterior a la 0.30 no dice qué sabe hacer cada modelo: no sale ninguno, y por eso no se conecta (`ollamaAlDia`).
  assert.deepEqual(modelosDe([{ name: 'llama3.2:1b' }]), [])
})

test('Ollama: uno de su nube se compacta a su ventana; uno de esta computadora, a la mínima', () => {
  recordar(CATALOGO)
  assert.equal(ventanaOllama('ollama:gemma4:cloud'), 262144)
  // Su ventana es de 131 072, pero se carga con la que su dueño puso en Ollama, que no se sabe de antemano.
  assert.equal(ventanaOllama('ollama:llama3.2:1b'), 64_000)
  assert.equal(ventanaOllama('ollama:no-leido:latest'), 64_000)
})

test('Ollama: se conecta desde la 0.30', () => {
  assert.equal(ollamaAlDia('0.40.18'), true)
  assert.equal(ollamaAlDia('0.30.0'), true)
  assert.equal(ollamaAlDia('1.0.0'), true)
  assert.equal(ollamaAlDia('0.24.0'), false)
  assert.equal(ollamaAlDia('0.14.0'), false)
  // Compilado a mano dice «0.0.0»: no se sabe, pasa.
  assert.equal(ollamaAlDia('0.0.0'), true)
})

/** Un Ollama de mentira que contesta a la carga y a `/api/ps` lo que contestó el de verdad en cada caso. */
async function conOllama(carga: { estado: number; cuerpo: unknown }, cargados: unknown[], probar: (direccion: string) => Promise<void>) {
  const servidor = createServer((req, res) => {
    if (req.url === '/api/generate') return void res.writeHead(carga.estado, { 'content-type': 'application/json' }).end(JSON.stringify(carga.cuerpo))
    if (req.url === '/api/ps') return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ models: cargados }))
    res.writeHead(404).end()
  })
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo))
  try {
    await probar(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`)
  } finally {
    servidor.close()
  }
}

const CARGADO = { estado: 200, cuerpo: { model: 'llama3.2:1b', response: '', done: true, done_reason: 'load' } }

test('Ollama: antes de un mensaje, un modelo cargado con poco contexto no pasa, y se dice cómo subirlo', async () => {
  // Con menos de 24 GB de VRAM, Ollama lo abre con 4 096 y recorta en silencio lo que no le cabe.
  await conOllama(CARGADO, [{ name: 'llama3.2:1b', context_length: 4096 }], async (direccion) => {
    await assert.rejects(antesDeOllama('ollama:llama3.2:1b', direccion), /abrió «llama3\.2:1b» con 4,096 tokens de contexto.*necesita 64,000 o más.*Context length.*OLLAMA_CONTEXT_LENGTH=64000/)
  })
  await conOllama(CARGADO, [{ name: 'otro:latest', context_length: 4096 }, { name: 'llama3.2:1b', context_length: 64000 }], (direccion) => antesDeOllama('ollama:llama3.2:1b', direccion))
  // Los de la nube no se cargan en esta computadora: no salen en `/api/ps`, y van con toda su ventana.
  await conOllama(CARGADO, [], (direccion) => antesDeOllama('ollama:gemma4:cloud', direccion))
})

test('Ollama: antes de un mensaje, lo que no deja cargar el modelo se dice en claro', async () => {
  await conOllama({ estado: 401, cuerpo: { error: 'Unauthorized' } }, [], async (direccion) => {
    await assert.rejects(antesDeOllama('ollama:gemma4:cloud', direccion), /«gemma4:cloud» es de la nube de Ollama y pide tu cuenta/)
  })
  await conOllama({ estado: 404, cuerpo: { error: "model 'no-existe:1b' not found" } }, [], async (direccion) => {
    await assert.rejects(antesDeOllama('ollama:no-existe:1b', direccion), /Ollama no pudo cargar «no-existe:1b»: model 'no-existe:1b' not found\./)
  })
  // Cerrado: en su dirección no contesta nadie.
  let cerrada = ''
  await conOllama(CARGADO, [], async (direccion) => void (cerrada = direccion))
  await assert.rejects(antesDeOllama('ollama:llama3.2:1b', cerrada), /Ollama está cerrado: ábrelo/)
})

test('Ollama: si se cierra a medio turno, el error dice que es él', () => {
  assert.match(conConsejo('API Error: Connection refused — a firewall or proxy may be blocking it (ECONNREFUSED)', 'ollama:llama3.2:1b'), /Ollama está cerrado: ábrelo/)
})
