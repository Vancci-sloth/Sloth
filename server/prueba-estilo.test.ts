import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentEvent } from '../shared/types.ts'
import { deSuPublicacion } from './estilos-revision.ts'
import { evidenciaDelHilo, pruebaDelHilo } from './prueba-estilo.ts'

const MIN = 60_000
const herramienta = (name: string, input: unknown = {}): AgentEvent => ({ t: 'tool', id: name, name, input })

/** Un hilo que hace un video: pide, el agente escribe el guion, espera tu voz, lo renderiza y, ya terminado, sigues platicando. */
const hilo: AgentEvent[] = [
  { t: 'user', text: 'Hazme un video del ciclo del agua.\n\nFormato: vertical\n\nCarpeta: ciclo-del-agua', at: 0 },
  { t: 'turn_start', at: 0 },
  herramienta('Write', { file_path: 'guion.md' }),
  { t: 'turn_end', at: 2 * MIN, ok: true, costUsd: 0.2 },
  // Veinte minutos grabando la voz: no es trabajo del agente.
  { t: 'user', text: 'Ya subí mi voz.', at: 22 * MIN },
  { t: 'turn_start', at: 22 * MIN },
  herramienta('Bash', { command: 'python scripts/hacer.py' }),
  herramienta('mcp__flow__generar_imagen', { que: 'una nube' }),
  herramienta('mcp__navegador__browser_navigate', { url: 'https://es.wikipedia.org' }),
  // El archivo queda a los 25 min; el turno sigue con su portada.
  { t: 'turn_end', at: 26 * MIN, ok: true, costUsd: 0.29 },
  { t: 'user', text: 'Gracias. ¿Y si hacemos otro?', at: 40 * MIN },
  { t: 'turn_start', at: 40 * MIN },
  herramienta('mcp__flow__generar_video'),
  { t: 'turn_end', at: 41 * MIN, ok: true, costUsd: 5 }
]

test('la prueba sale del hilo: lo que trabajó el agente hasta el video terminado, lo que costó y lo que usó', () => {
  const p = pruebaDelHilo(hilo, 'claude-opus-5-5', 25 * MIN, 45)!
  assert.equal(p.agente, 'claude')
  assert.equal(p.modelo, 'claude-opus-5-5')
  // Dos turnos, de 2 y 4 minutos: ni la espera por la voz ni lo que vino después del video.
  assert.equal(p.segundos, 360)
  assert.equal(p.costo, 0.49)
  assert.equal(p.video, 45)
  assert.deepEqual(p.hilo, {
    pedido: 'Hazme un video del ciclo del agua. Formato: vertical',
    turnos: [{ segundos: 120, costo: 0.2, herramientas: 1 }, { segundos: 240, costo: 0.29, herramientas: 3 }],
    usa: ['codigo', 'flow-imagenes', 'internet']
  })
})

test('dice el agente por el modelo del hilo, y sin un turno cerrado antes del video no hay prueba', () => {
  assert.deepEqual([pruebaDelHilo(hilo, 'codex:gpt-5.6', 25 * MIN)!.agente, pruebaDelHilo(hilo, 'codex:gpt-5.6', 25 * MIN)!.modelo], ['codex', 'gpt-5.6'])
  assert.equal(pruebaDelHilo([], 'claude-opus-5-5', 25 * MIN), undefined)
  assert.equal(pruebaDelHilo(hilo.slice(0, 3), 'claude-opus-5-5', 25 * MIN), undefined)
  // Un agente gratis no cuesta, y es una prueba igual.
  assert.equal(pruebaDelHilo(hilo.map((e) => (e.t === 'turn_end' ? { ...e, costUsd: undefined } : e)), 'opencode:grok-code', 25 * MIN)!.costo, 0)
})

test('lo que el hilo de su prueba usó y su guía no dice, no cuadra: es una falla', () => {
  const prueba = pruebaDelHilo(hilo, 'claude-opus-5-5', 25 * MIN, 45)!
  const guia = { das: '', entrega: '', ejemplo: '', herramientas: ['codigo', 'flow-imagenes', 'internet', 'tu-voz'], agentes: ['claude' as const] }
  const bien = deSuPublicacion(guia, prueba)
  assert.deepEqual(bien.fallas, [])
  assert.match(bien.notas.join('\n'), /Su guía dice que hace el video con: Código en tu computadora, Imágenes de Google Flow, Tu voz grabada, Material de internet/)
  assert.match(bien.notas.join('\n'), /Claude \(claude-opus-5-5\), \$0\.49 a precio de API, 6 min de trabajo en 2 turnos/)
  const calla = deSuPublicacion({ ...guia, herramientas: ['codigo'], agentes: ['codex'] }, prueba)
  assert.match(calla.fallas[0], /usó Imágenes de Google Flow, Material de internet, y tu guía no lo dice/)
  assert.match(calla.fallas[1], /se hizo con Claude, y tu guía no lo pone entre los agentes/)
  assert.deepEqual(deSuPublicacion(undefined, undefined), { notas: [], fallas: [] })
})

test('la evidencia es el hilo completo hasta el video terminado: lo que se dijo, lo que se hizo y cómo acabó cada turno', () => {
  const con = [
    ...hilo.slice(0, 2),
    { t: 'text', id: 'a', delta: 'Aquí va el ' } as AgentEvent,
    { t: 'text', id: 'a', delta: 'guion.' } as AgentEvent,
    hilo[2],
    { t: 'tool_update', id: 'Write', output: 'x'.repeat(5000), done: true } as AgentEvent,
    ...hilo.slice(3)
  ]
  const e = evidenciaDelHilo(con, 'claude-opus-5-5', 'Ciclo del agua', 25 * MIN)
  assert.equal(e.titulo, 'Ciclo del agua')
  assert.deepEqual(e.pasos.map((p) => p.t), ['usuario', 'agente', 'herramienta', 'turno', 'usuario', 'herramienta', 'herramienta', 'herramienta', 'turno'])
  assert.deepEqual(e.pasos[1], { t: 'agente', texto: 'Aquí va el guion.' })
  // Lo de cada herramienta va recortado; lo que se dijo, entero.
  const escribir = e.pasos[2] as { nombre: string; entrada: string; salida: string }
  assert.equal(escribir.nombre, 'Write')
  assert.match(escribir.entrada, /guion\.md/)
  assert.match(escribir.salida, /^x{2000}… \(3000 caracteres más\)$/)
  assert.deepEqual(e.pasos[3], { t: 'turno', segundos: 120, costo: 0.2, ok: true })
  // Lo que se platicó después de terminar el video no es de su prueba.
  assert.ok(!JSON.stringify(e).includes('hacemos otro'))
})
