import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { validarConfig } from '../shared/piloto.ts'
import type { Card, Model } from '../shared/types.ts'
import { cardDelEstilo, elegirRotando, enZona, faltanHoy, horariosDelDia, instanteDe, MARGEN, piloto, primerMensaje } from './piloto.ts'

/** El piloto automático con hilos, video y redes falsos: nunca se crea un hilo ni se publica nada de verdad. */

const ZONA = 'America/Mexico_City'
// 7 nov 2026, 08:00 en la Ciudad de México (UTC-6, sin horario de verano).
const OCHO = Date.parse('2026-11-07T14:00:00Z')

const CARDS = [
  { id: 'video-el-diff', title: 'El Diff', cwd: '/x', description: '', skill: 'video-el-diff', etapas: [{ fase: 'guion' }] },
  { id: 'video-explicativo', title: 'Video explicativo', cwd: '/x', description: '', skill: 'video-explicativo', etapas: [{ fase: 'guion' }] },
  { id: 'nuevo-estilo', title: 'Nuevo estilo', cwd: '/x', description: '' }
] as unknown as Card[]
const MODELOS = [{ id: 'codex:gpt', label: 'GPT', efforts: [] }, { id: 'claude-sonnet-5', label: 'Sonnet', efforts: [] }] as Model[]

const BRIEF = { marca: 'Café Brasa, tostadores de barrio', publico: 'Gente que toma café en casa', temas: ['Moler al momento', 'Agua y café'], ganchos: ['G1', 'G2', 'G3'], cta: 'Pide tu bolsa', horarios: ['10:00', '19:00'], videosPorDia: 2 }

function montar(t: { after(f: () => void): void }, o: { solo?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'piloto-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const creados: { cardId: string; modelo: string; videos: { title: string; text: string }[] }[] = []
  const vivos = new Map<string, number>()
  const videos = new Map<string, string>()
  const cola: { cardId: string; ruta: string; cuando: string }[] = []
  const reloj = { t: OCHO }
  const fallo = { programar: '' }
  let n = 0
  const p = piloto({
    dir,
    cards: () => CARDS,
    modelos: () => MODELOS,
    hilos: {
      crear: (x) => {
        creados.push(x)
        return x.videos.map(() => {
          const id = `h${++n}`
          vivos.set(id, reloj.t)
          return id
        })
      },
      estado: (id) => (vivos.has(id) ? { trabajando: vivos.get(id) === -1, t: Math.abs(vivos.get(id)!) } : undefined)
    },
    videoDe: (_c, sesion) => videos.get(sesion),
    programar: async (cardId, ruta, cuando) => {
      if (fallo.programar) throw new Error(fallo.programar)
      cola.push({ cardId, ruta, cuando })
    },
    ahora: () => reloj.t,
    zona: () => ZONA
  })
  p.configurar({ ...BRIEF, publicarSolo: o.solo ?? false })
  /** Los hilos acaban (o vuelven a trabajar, con `-1`). */
  const acaban = () => vivos.forEach((_, id) => vivos.set(id, reloj.t))
  const trabajan = () => vivos.forEach((_, id) => vivos.set(id, -1))
  return { p, dir, creados, cola, videos, reloj, fallo, acaban, trabajan }
}

test('piloto: horas en la zona', () => {
  assert.deepEqual(enZona(OCHO, ZONA), { fecha: '2026-11-07', hora: '08:00' })
  assert.equal(instanteDe('2026-11-07', '10:00', ZONA), Date.parse('2026-11-07T16:00:00Z'))
  // Con horario de verano (Nueva York, 31 oct 2026 aún es EDT): 10:00 es 14:00 UTC.
  assert.equal(instanteDe('2026-10-31', '10:00', 'America/New_York'), Date.parse('2026-10-31T14:00:00Z'))
})

test('piloto: cuántos faltan hoy', () => {
  const c = { horarios: ['10:00', '19:00'], videosPorDia: 2 }
  assert.deepEqual(faltanHoy(c, [], OCHO, ZONA).map((h) => h.hora), ['10:00', '19:00'])
  assert.deepEqual(faltanHoy(c, [{ fecha: '2026-11-07', hora: '10:00' }], OCHO, ZONA).map((h) => h.hora), ['19:00'])
  // A las 9:45, el de las 10:00 ya no da tiempo (MARGEN).
  assert.equal(MARGEN, 30 * 60_000)
  assert.deepEqual(faltanHoy(c, [], OCHO + 105 * 60_000, ZONA).map((h) => h.hora), ['19:00'])
  assert.equal(horariosDelDia({ horarios: ['10:00', '19:00'], videosPorDia: 4 }).length, 4)
  assert.deepEqual(horariosDelDia({ horarios: ['10:00', '19:00'], videosPorDia: 1 }), ['10:00'])
  assert.deepEqual(horariosDelDia({ horarios: ['10:00', '19:00'], videosPorDia: 3 }), ['10:00', '13:00', '19:00'])
})

test('piloto: los ganchos y temas rotan sin repetir los últimos', () => {
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], []), 'G1')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G1']), 'G2')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G1', 'G2', 'G3']), 'G1')
  assert.equal(elegirRotando(['G1', 'G2', 'G3'], ['G2', 'G3', 'G1', 'G3']), 'G2')
  assert.equal(elegirRotando([], ['x']), '')
})

test('piloto: el estilo es una card de video que existe', () => {
  assert.equal(cardDelEstilo(CARDS, 'video-el-diff')?.id, 'video-el-diff')
  assert.equal(cardDelEstilo(CARDS, 'no-existe')?.id, 'video-explicativo')
  assert.equal(cardDelEstilo(CARDS, 'nuevo-estilo')?.id, 'video-explicativo')
})

test('piloto: la configuración se valida', () => {
  assert.deepEqual(validarConfig({ videosPorDia: 3, horarios: ['09:30'], idioma: 'es' }), [])
  assert.equal(validarConfig({ videosPorDia: 7 }).length, 1)
  assert.equal(validarConfig({ horarios: ['25:00'] }).length, 1)
  assert.equal(validarConfig({ idioma: 'xx' as 'es' }).length, 1)
})

test('piloto: apagado por defecto y sin marca no enciende', (t) => {
  const { p, creados } = montar(t)
  assert.equal(p.vista().config.encendido, false)
  assert.equal(p.crear().motivo, 'apagado')
  assert.equal(creados.length, 0)
  p.configurar({ marca: '' })
  assert.throws(() => p.configurar({ encendido: true }), /de qué trata la marca/)
  p.configurar({ marca: 'Café Brasa', encendido: true })
  assert.equal(p.crear().hechos, 2)
})

test('piloto: un hilo por horario, sin duplicar ni crear mientras trabajan', (t) => {
  const { p, creados, reloj, acaban, trabajan } = montar(t)
  p.configurar({ encendido: true })
  assert.equal(p.crear().hechos, 2)
  const [lote] = creados
  assert.equal(lote.cardId, 'video-explicativo')
  assert.equal(lote.modelo, 'claude-sonnet-5')
  assert.equal(lote.videos.length, 2)
  const [uno, dos] = lote.videos.map((v) => v.text)
  assert.match(uno, /Gancho .*: G1/)
  assert.match(dos, /Gancho .*: G2/)
  assert.match(uno, /Tema de este video: Moler al momento/)
  assert.match(uno, /no vendas de frente/)
  assert.match(uno, /Café Brasa/)
  assert.match(uno, /Pide tu bolsa/)
  assert.match(uno, /Formato: vertical/)
  assert.match(uno, /Idioma: español/)
  trabajan()
  assert.equal(p.crear().motivo, 'trabajando')
  acaban()
  assert.equal(p.crear().motivo, 'al_dia')
  // Al día siguiente, dos más, con los ganchos que siguen.
  reloj.t += 24 * 3600_000
  assert.equal(p.crear().hechos, 2)
  assert.match(creados[1].videos[0].text, /Gancho .*: G3/)
  assert.equal(new Set(p.leer().turnos.map((x) => `${x.fecha} ${x.hora}`)).size, 4)
  // «Hacer uno ahora» toma el siguiente libre (pasado mañana), aunque otros trabajen.
  assert.equal(p.crear({ uno: true }).hechos, 1)
  assert.equal(p.leer().turnos.at(-1)?.fecha, '2026-11-09')
})

test('piloto: el primer mensaje no repite el gancho y el tema elegidos', () => {
  const c = { ...p0(), ...BRIEF }
  const m = primerMensaje(c, { fecha: '2026-11-07', hora: '10:00', gancho: 'G1', tema: 'Agua y café' })
  assert.match(m, /Otros ganchos[^]*- G2/)
  assert.doesNotMatch(m.split('Otros ganchos')[1], /- G1/)
  assert.doesNotMatch(m.split('Otros temas')[1].split('Otros ganchos')[0], /Agua y café/)
})
function p0() {
  return { encendido: true, marca: '', publico: '', temas: [], ganchos: [], cta: '', idioma: 'es' as const, tono: '', videosPorDia: 1, horarios: [], cardId: '', publicarSolo: false }
}

test('piloto: al terminar, con publicarSolo el video entra a la cola de redes a su horario', async (t) => {
  const { p, cola, videos, acaban } = montar(t, { solo: true })
  p.configurar({ encendido: true })
  p.crear()
  const [a, b] = p.leer().turnos
  // Mientras trabajan no se entrega nada.
  await p.entregar()
  assert.equal(cola.length, 0)
  acaban()
  videos.set(a.sesion!, '/v/a.mp4')
  await p.entregar()
  assert.deepEqual(cola, [{ cardId: 'video-explicativo', ruta: '/v/a.mp4', cuando: '2026-11-07 10:00' }])
  assert.equal(p.leer().turnos[0].estado, 'programado')
  // El otro aún no tiene video (y el hilo acaba de moverse): sigue esperando.
  assert.equal(p.leer().turnos[1].estado, 'hilo')
  videos.set(b.sesion!, '/v/b.mp4')
  await p.entregar()
  assert.equal(cola.at(-1)?.cuando, '2026-11-07 19:00')
})

test('piloto: sin publicarSolo el video queda por revisar y se programa a mano', async (t) => {
  const { p, cola, videos, acaban } = montar(t)
  p.configurar({ encendido: true })
  p.crear()
  const [a, b] = p.leer().turnos
  acaban()
  videos.set(a.sesion!, '/v/a.mp4')
  videos.set(b.sesion!, '/v/b.mp4')
  await p.entregar()
  assert.equal(cola.length, 0)
  assert.deepEqual(p.leer().turnos.map((x) => x.estado), ['por_revisar', 'por_revisar'])
  const v = await p.programar(a.id)
  assert.equal(cola.length, 1)
  assert.equal(v.ultimos.find((x) => x.id === a.id)?.estado, 'programado')
  await assert.rejects(p.programar(a.id), /no está esperando/)
  assert.equal(p.descartar(b.id).ultimos.some((x) => x.id === b.id), false)
})

test('piloto: un hilo sin video avisa, y un error al programar se puede reintentar', async (t) => {
  const { p, cola, videos, reloj, acaban, fallo } = montar(t, { solo: true })
  p.configurar({ encendido: true })
  p.crear()
  const [a, b] = p.leer().turnos
  acaban()
  // Sin video, pero recién terminó: aún se espera.
  await p.entregar()
  assert.equal(p.leer().turnos[1].estado, 'hilo')
  reloj.t += 11 * 60_000
  videos.set(a.sesion!, '/v/a.mp4')
  fallo.programar = 'Conecta una red en Opciones antes de programar.'
  await p.entregar()
  const [x, y] = p.leer().turnos
  assert.equal(x.estado, 'error')
  assert.match(x.error!, /Conecta una red/)
  assert.equal(y.estado, 'error')
  assert.match(y.error!, /sin dejar un video/)
  assert.equal(b.id, y.id)
  fallo.programar = ''
  await p.programar(a.id)
  assert.equal(cola.length, 1)
  assert.equal(p.leer().turnos[0].estado, 'programado')
})
