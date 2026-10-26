import assert from 'node:assert/strict'
import test from 'node:test'
import { listaDeArchivos, prepararDiff, redactarCodex, validarMensaje } from './git-mensaje.ts'
import type { SessionMeta } from '../shared/types.ts'

test('la documentación debe incluir un título y explicación; no acepta texto incompleto del agente', () => {
  const correcto = 'Integra los selectores de Sloth\n\n- Usa el menú de la app para los modelos.\n- Aplica el mismo estilo al esfuerzo.'
  assert.equal(validarMensaje(`  ${correcto}\n`), correcto)
  for (const texto of ['', 'Solo un título', '¿Qué cambios quieres subir?', '```\nTítulo\n\n- Cambio\n```', `${'x'.repeat(101)}\n\n- Cambio`, 'Título\n\n- Cambio\0']) {
    assert.throws(() => validarMensaje(texto), /explicación válida/)
  }
})

test('el contexto para redactar conserva nombres, archivos binarios y la marca de diff abreviado', () => {
  const contexto = JSON.parse(prepararDiff([
    { ruta: 'web/src/Modelos.tsx', tipo: 'modificado', sumadas: 20, quitadas: 10, diff: '+selector\n'.repeat(2000), binario: false, truncado: false },
    { ruta: 'logo.png', tipo: 'nuevo', sumadas: 0, quitadas: 0, diff: '', binario: true, truncado: false },
  ]))
  assert.equal(contexto.length, 2)
  assert.equal(contexto[0].ruta, 'web/src/Modelos.tsx')
  assert.equal(contexto[0].abreviado, true)
  assert.ok(contexto[0].diff.length <= 8000)
  assert.equal(contexto[1].binario, true)
  assert.equal(contexto[1].tipo, 'nuevo')
})

const meta: SessionMeta = { id: 'prueba', cardId: 'sloth', title: 'Prueba Auto', model: 'codex:gpt-6.1-sol', cwd: process.cwd(), running: false, createdAt: 1, updatedAt: 1 }
const mensaje = 'Integra el selector de Sloth\n\n- Reemplaza la lista nativa por el menú de la app.\n- Destaca la opción elegida en ámbar.'

/** Reproduce el protocolo real: Codex avisa del mensaje de entrada antes de razonar y responder. */
function conexion(tipo: 'userMessage' | 'commandExecution') {
  const pedidos: { metodo: string; params: unknown }[] = []
  let cerrada = false
  const conectar: NonNullable<Parameters<typeof redactarCodex>[2]> = (notificar, salir) => ({
    ready: Promise.resolve(),
    async request<T>(metodo: string, params: unknown = {}): Promise<T> {
      pedidos.push({ metodo, params })
      let respuesta: unknown = {}
      if (metodo === 'account/read') respuesta = { account: { type: 'chatgpt' } }
      if (metodo === 'thread/start') respuesta = { thread: { id: 'hilo-auto' } }
      if (metodo === 'turn/start') {
        notificar('item/started', { threadId: 'hilo-auto', item: { type: tipo } })
        if (!cerrada) {
          notificar('item/started', { threadId: 'hilo-auto', item: { type: 'reasoning' } })
          notificar('item/completed', { threadId: 'hilo-auto', item: { type: 'agentMessage', text: 'Comentario previo' } })
          notificar('item/completed', { threadId: 'hilo-auto', item: { type: 'agentMessage', text: mensaje } })
          notificar('turn/completed', { threadId: 'hilo-auto', turn: { status: 'completed' } })
        }
        respuesta = { turn: { id: 'turno-auto', status: cerrada ? 'interrupted' : 'completed' } }
      }
      return respuesta as T
    },
    close() { if (!cerrada) { cerrada = true; salir() } },
  })
  return { conectar, pedidos, cerrada: () => cerrada }
}

test('Auto acepta el mensaje de entrada de Codex y devuelve la documentación final', async () => {
  const rpc = conexion('userMessage')
  assert.equal(validarMensaje(await redactarCodex(meta, 'diff del selector', rpc.conectar)), mensaje)
  const abrir = rpc.pedidos.find((p) => p.metodo === 'thread/start')?.params as Record<string, unknown>
  assert.equal(abrir.sandbox, 'read-only')
  assert.equal(abrir.ephemeral, true)
  assert.equal(rpc.cerrada(), true)
})

test('Auto sigue cancelando la redacción si Codex intenta ejecutar una herramienta', async () => {
  const rpc = conexion('commandExecution')
  await assert.rejects(redactarCodex(meta, 'diff del selector', rpc.conectar), /intentó usar una herramienta/)
  assert.equal(rpc.cerrada(), true)
})

test('con cientos de archivos, la lista de Auto va por carpeta y cabe en el límite del commit', () => {
  const archivo = (ruta: string) => ({ ruta, tipo: 'nuevo' as const, sumadas: 10, quitadas: 0, diff: '', binario: false, truncado: false })
  assert.equal(listaDeArchivos([archivo('web/src/App.tsx')]), '- web/src/App.tsx: nuevo (+10 / -0)')
  const muchos = Array.from({ length: 351 }, (_, i) => archivo(`skills/modelos-3d/modelos/pieza-${i}/modelo.json`))
  const lista = listaDeArchivos([...muchos, archivo('web/src/App.tsx')])
  assert.ok(lista.length <= 5000)
  assert.ok(lista.includes('- web/src/: 1 archivo (+10 / -0)'))
  assert.ok(lista.split('\n').length < 100)
})
