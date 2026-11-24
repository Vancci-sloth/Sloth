import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import type { Card, Ritmo } from '../shared/types.ts'
import { ANTELACION, cardDelEstilo, elegirRotando, horasPorDelante, piloto, primerMensaje } from './piloto.ts'

/** El piloto con hilos, videos y redes falsos: nunca se crea un hilo ni se publica nada de verdad. */

// 23 nov 2026, 08:00 en la hora de esta computadora.
const OCHO = new Date(2026, 10, 23, 8, 0).getTime()
const HORA = 3600_000
/** Tres al día, de 12:00 a 14:00, todos los días. */
const RITMO: Ritmo = { porDia: 3, cadaDias: 1, inicio: '2026-10-01', desde: '12:00', cadaMin: 60 }

const CARDS = [
  { id: 'video-el-diff', title: 'El Diff', cwd: '/x', description: '', skill: 'video-el-diff', etapas: [{ fase: 'guion' }] },
  { id: 'video-explicativo', title: 'Video explicativo', cwd: '/x', description: '', skill: 'video-explicativo', etapas: [{ fase: 'guion' }] },
  { id: 'nuevo-estilo', title: 'Nuevo estilo', cwd: '/x', description: '' }
] as unknown as Card[]

const BRIEF = { marca: 'Café Brasa, tostadores de barrio', publico: 'Gente que toma café en casa', temas: ['Moler al momento', 'Agua y café'], ganchos: ['G1', 'G2', 'G3'], cta: 'Pide tu bolsa' }

function montar(t: { after(f: () => void): void }, o: { conectada?: boolean; ritmo?: Ritmo } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'piloto-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const creados: { cardId: string; videos: { title: string; text: string }[] }[] = []
  /** Cada hilo: si trabaja y cuándo se movió. */
  const hilos = new Map<string, { trabajando: boolean; t: number }>()
  const videos = new Map<string, string>()
  const cola: { cardId: string; ruta: string }[] = []
  const reloj = { t: OCHO }
  const red = { conectada: o.conectada ?? true, fallo: '' }
  let n = 0
  const p = piloto({
    dir,
    cards: () => CARDS,
    hilos: {
      crear: ({ card, videos }) => {
        creados.push({ cardId: card.id, videos })
        return videos.map(() => {
          const id = `h${++n}`
          hilos.set(id, { trabajando: true, t: reloj.t })
          return id
        })
      },
      estado: (id) => hilos.get(id)
    },
    videoDe: (_c, sesion) => videos.get(sesion),
    redes: {
      ritmo: () => ({ ritmo: o.ritmo ?? RITMO, conectada: red.conectada }),
      programar: async (cardId, ruta) => {
        if (red.fallo) throw new Error(red.fallo)
        cola.push({ cardId, ruta })
      }
    },
    aviso: (k) => (k > 2 ? 'Son muchos' : undefined),
    ahora: () => reloj.t
  })
  p.brief(BRIEF)
  /** Todos los hilos acaban, cada uno con su video. */
  const acaban = () => hilos.forEach((h, id) => (hilos.set(id, { trabajando: false, t: reloj.t }), videos.set(id, `/v/${id}.mp4`)))
  return { p, creados, cola, hilos, videos, reloj, red, acaban }
}

const encender = (p: ReturnType<typeof piloto>, tope = 2) => p.auto({ encendido: true, acepto: true, tope })

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

test('piloto: el primer mensaje lleva el brief y dice quién publica', () => {
  const b = { ...BRIEF, idioma: 'es' as const, tono: '', cardId: '' }
  const m = primerMensaje(b, { modo: 'manual', gancho: 'G1', tema: 'Agua y café' })
  assert.match(m, /Café Brasa/)
  assert.match(m, /no vendas de frente/)
  assert.match(m, /Pide tu bolsa/)
  assert.match(m, /Idioma: español/)
  assert.match(m, /el usuario lo revisa/)
  assert.match(m, /Otros ganchos[^]*- G2/)
  assert.doesNotMatch(m.split('Otros ganchos')[1], /- G1/)
  assert.match(primerMensaje(b, { modo: 'auto', gancho: '', tema: '' }), /Sloth mete el video a su cola/)
})

test('piloto: las horas del ritmo de hoy que aún dan tiempo', () => {
  assert.deepEqual(horasPorDelante(RITMO, OCHO), ['12:00', '13:00', '14:00'])
  // A las 11:30, la de las 12:00 ya no da tiempo.
  assert.equal(ANTELACION, HORA)
  assert.deepEqual(horasPorDelante(RITMO, OCHO + 3.5 * HORA), ['13:00', '14:00'])
  // Un día que no toca (cada 2 días desde el 22 de noviembre), ninguna.
  assert.deepEqual(horasPorDelante({ ...RITMO, cadaDias: 2, inicio: '2026-11-22' }, OCHO), [])
})

/* ---------- Manual ---------- */

test('piloto manual: hace los que pides, ahora, un hilo por video', (t) => {
  const { p, creados } = montar(t)
  assert.equal(p.manual(3).length, 3)
  assert.equal(creados.length, 1)
  assert.equal(creados[0].cardId, 'video-explicativo')
  const [uno, dos] = creados[0].videos.map((v) => v.text)
  assert.match(uno, /Gancho .*: G1/)
  assert.match(dos, /Gancho .*: G2/)
  assert.match(uno, /Tema de este video: Moler al momento/)
  assert.throws(() => p.manual(0), /De 1 a/)
  assert.throws(() => p.manual(7), /De 1 a/)
})

test('piloto manual: sin marca no hace nada', (t) => {
  const { p, creados } = montar(t)
  p.brief({ marca: '' })
  assert.throws(() => p.manual(1), /de qué trata la marca/)
  assert.equal(creados.length, 0)
})

test('piloto manual: nunca programa solo, ni con el automático encendido', async (t) => {
  const { p, cola, acaban, creados } = montar(t)
  p.manual(2)
  acaban()
  await p.revisar()
  assert.deepEqual(p.leer().turnos.map((x) => x.estado), ['por_revisar', 'por_revisar'])
  assert.equal(cola.length, 0)
  // Con el automático encendido, sus videos siguen sin programarse; el automático pide los suyos aparte.
  encender(p)
  await p.revisar()
  assert.equal(creados.length, 2)
  assert.equal(cola.length, 0)
  assert.deepEqual(p.leer().turnos.filter((x) => x.modo === 'manual').map((x) => x.estado), ['por_revisar', 'por_revisar'])
})

test('piloto manual: el manual no crea nada solo', async (t) => {
  const { p, creados, reloj } = montar(t)
  for (let i = 0; i < 5; i++) {
    reloj.t += 10 * 60_000
    await p.revisar()
  }
  assert.equal(creados.length, 0)
})

test('piloto manual: más de dos a la vez se confirma antes', async (t) => {
  const { p, creados } = montar(t)
  const respuesta = (status: number, datos: unknown) => ({ status, datos })
  const llamar = async (cuerpo: unknown) => {
    let salida: { status: number; datos: unknown } | undefined
    const req = Object.assign((async function* () {
      yield Buffer.from(JSON.stringify(cuerpo))
    })(), { method: 'POST' })
    const res = {
      writeHead: (s: number) => (salida = respuesta(s, undefined)),
      setHeader() {},
      end: (b: string) => salida && (salida.datos = JSON.parse(b))
    }
    await p.api(req as never, res as never, '/api/piloto/manual')
    return salida!
  }
  const r = await llamar({ n: 3 })
  assert.equal(r.status, 409)
  assert.equal(creados.length, 0)
  assert.equal((await llamar({ n: 3, masDeDos: true })).status, 200)
  assert.equal(creados.length, 1)
})

/* ---------- Automático ---------- */

test('piloto automático: apagado por defecto, y no pide nada', async (t) => {
  const { p, creados } = montar(t)
  assert.equal(p.vista().config.auto.encendido, false)
  assert.equal(p.automatico().motivo, 'apagado')
  await p.revisar()
  assert.equal(creados.length, 0)
})

test('piloto automático: encenderlo pide aceptar, marca y una red conectada', (t) => {
  const { p, red } = montar(t)
  assert.throws(() => p.auto({ encendido: true }), /aceptar/)
  assert.equal(p.vista().config.auto.encendido, false)
  red.conectada = false
  assert.throws(() => p.auto({ encendido: true, acepto: true }), /Conecta una red/)
  red.conectada = true
  p.brief({ marca: '' })
  assert.throws(() => p.auto({ encendido: true, acepto: true }), /de qué trata la marca/)
  p.brief({ marca: 'Café Brasa' })
  assert.equal(p.auto({ encendido: true, acepto: true }).config.auto.encendido, true)
  // Con él encendido, la marca no se puede vaciar.
  assert.throws(() => p.brief({ marca: '' }), /Apágalo primero/)
  assert.throws(() => p.auto({ tope: 0 }), /tope/)
})

test('piloto automático: respeta el tope del día y no apila mientras trabajan', async (t) => {
  const { p, creados, reloj, acaban } = montar(t)
  encender(p, 2)
  assert.equal(p.automatico().hechos, 2)
  assert.equal(p.automatico().motivo, 'trabajando')
  acaban()
  await p.entregar()
  // Ya hizo los dos de hoy: no hace más, aunque queden horas.
  assert.equal(p.automatico().motivo, 'tope')
  reloj.t += 2 * HORA
  assert.equal(p.automatico().motivo, 'tope')
  assert.equal(creados.flatMap((c) => c.videos).length, 2)
  // Al día siguiente, otros dos.
  reloj.t = OCHO + 24 * HORA
  assert.equal(p.automatico().hechos, 2)
  assert.equal(p.vista().hoy.hechos, 2)
})

test('piloto automático: solo en las horas del ritmo que quedan hoy', (t) => {
  // A las 12:30 solo quedan 13:00 y 14:00, y la de las 13:00 ya no da tiempo: uno, aunque el tope sea 3.
  const tarde = montar(t)
  tarde.reloj.t = OCHO + 4.5 * HORA
  encender(tarde.p, 3)
  assert.equal(tarde.p.automatico().hechos, 1)
  // La pestaña enseña solo las que aún sirven, no las que ya pasaron.
  assert.deepEqual(tarde.p.vista().hoy.horas, ['14:00'])
  // Pasadas las horas de hoy, ninguno.
  const noche = montar(t)
  noche.reloj.t = OCHO + 14 * HORA
  encender(noche.p, 3)
  assert.equal(noche.p.automatico().motivo, 'sin_horas')
  assert.deepEqual(noche.p.vista().hoy.horas, [])
  assert.equal(noche.creados.length, 0)
  // Un día que no toca, ninguno.
  const libre = montar(t, { ritmo: { ...RITMO, cadaDias: 2, inicio: '2026-11-22' } })
  encender(libre.p, 3)
  assert.equal(libre.p.automatico().motivo, 'sin_horas')
  assert.equal(libre.creados.length, 0)
})

test('piloto automático: al terminar, el video entra solo a la cola de redes', async (t) => {
  const { p, cola, acaban } = montar(t)
  encender(p, 1)
  p.automatico()
  await p.entregar()
  assert.equal(cola.length, 0)
  acaban()
  await p.entregar()
  assert.deepEqual(cola, [{ cardId: 'video-explicativo', ruta: '/v/h1.mp4' }])
  assert.equal(p.leer().turnos[0].estado, 'programado')
})

test('piloto automático: apagado a medio camino, lo que acabe queda por revisar', async (t) => {
  const { p, cola, acaban, creados, reloj } = montar(t)
  encender(p, 2)
  p.automatico()
  p.auto({ encendido: false })
  acaban()
  await p.revisar()
  assert.equal(cola.length, 0)
  assert.deepEqual(p.leer().turnos.map((x) => x.estado), ['por_revisar', 'por_revisar'])
  reloj.t += 24 * HORA
  await p.revisar()
  assert.equal(creados.length, 1)
})

test('piloto automático: si la cola falla, o el hilo no deja video, se dice', async (t) => {
  const { p, hilos, videos, red, reloj } = montar(t)
  encender(p, 2)
  p.automatico()
  hilos.forEach((_, id) => hilos.set(id, { trabajando: false, t: reloj.t }))
  videos.set('h1', '/v/h1.mp4')
  red.fallo = 'No hay ninguna red conectada'
  await p.entregar()
  const [a, b] = p.leer().turnos
  assert.equal(a.estado, 'error')
  assert.match(a.error!, /No entró a la cola/)
  // El otro acaba de quedarse quieto: aún se espera su video. Pasado un rato, se da por perdido.
  assert.equal(b.estado, 'haciendo')
  reloj.t += 11 * 60_000
  await p.entregar()
  assert.match(p.leer().turnos[1].error!, /sin dejar un video/)
})
