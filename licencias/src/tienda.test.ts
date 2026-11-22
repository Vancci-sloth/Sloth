import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estimado, personasDe, prefijoDe, PUNTOS, puntosDelMes } from './tienda.ts'

const autores = new Map([
  ['ana', 'm-ana'],
  ['luis', 'm-luis']
])

test('cada persona suma sus puntos, y sus videos solo hasta el tope del mes', () => {
  const p = puntosDelMes(
    [
      { publicacion: 'ana', equipo: 'e1', red: 'r1', videos: 3 },
      { publicacion: 'ana', equipo: 'e2', red: 'r2', videos: 200 },
      { publicacion: 'luis', equipo: 'e1', red: 'r1', videos: 1 }
    ],
    [],
    autores,
    '2026-11'
  )
  assert.deepEqual(p.get('ana'), { personas: 2, videos: 3 + PUNTOS.tope, variantes: 0, puntos: 2 * PUNTOS.persona + 3 + PUNTOS.tope })
  assert.deepEqual(p.get('luis'), { personas: 1, videos: 1, variantes: 0, puntos: PUNTOS.persona + 1 })
})

test('diez computadoras en la misma conexión son una persona, y una computadora en dos redes también', () => {
  const granja = Array.from({ length: 10 }, (_, i) => ({ equipo: `falsa${i}`, red: 'casa', videos: 5 }))
  assert.deepEqual(personasDe(granja), [50])
  assert.deepEqual(personasDe([{ equipo: 'lap', red: 'casa', videos: 2 }, { equipo: 'lap', red: 'oficina', videos: 3 }, { equipo: 'otra', red: 'oficina', videos: 1 }]), [6])
  // Sin red conocida, cada computadora va sola.
  assert.deepEqual(personasDe([{ equipo: 'a', red: '', videos: 1 }, { equipo: 'b', red: '', videos: 1 }]), [1, 1])
  // Y en los puntos, la granja vale lo que una persona con su tope.
  const p = puntosDelMes(granja.map((g) => ({ ...g, publicacion: 'ana' })), [], autores, '2026-11')
  assert.equal(p.get('ana')?.puntos, PUNTOS.persona + PUNTOS.tope)
})

test('el prefijo de la conexión: /24 en IPv4 y /48 en IPv6, escriba como se escriba', () => {
  assert.equal(prefijoDe('189.203.14.77'), '189.203.14')
  assert.equal(prefijoDe('2806:2f0:9021::1'), '2806:2f0:9021')
  assert.equal(prefijoDe('2806:02f0:9021:0:0:0:0:1'), '2806:2f0:9021')
  assert.equal(prefijoDe('2806::1'), '2806:0:0')
  assert.equal(prefijoDe(''), '')
})

test('una variante cuenta si es de otra persona y de este mes; la de uno mismo no', () => {
  const p = puntosDelMes(
    [],
    [
      { de: 'ana', autor: 'm-luis', periodo: '2026-11' },
      { de: 'ana', autor: 'm-ana', periodo: '2026-11' },
      { de: 'ana', autor: 'm-otro', periodo: '2026-10' }
    ],
    autores,
    '2026-11'
  )
  assert.equal(p.get('ana')?.variantes, 1)
  assert.equal(p.get('ana')?.puntos, PUNTOS.variante)
})

test('un estilo que no está en el reparto (sin aprobar o del creador de Sloth) no suma', () => {
  const p = puntosDelMes([{ publicacion: 'oficial', equipo: 'e1', red: 'r1', videos: 5 }], [{ de: 'oficial', autor: 'm-ana', periodo: '2026-11' }], autores, '2026-11')
  assert.equal(p.size, 0)
})

test('cada estilo se lleva la parte de sus puntos, hacia abajo, en cada moneda', () => {
  const f = { mes: 'noviembre de 2026', cierra: '', cuentas: [], montos: [{ moneda: 'USD', monto: 100 }] }
  assert.deepEqual(estimado(f, 1, 3), [{ moneda: 'USD', monto: 33.33 }])
  assert.deepEqual(estimado(f, 0, 3), [])
  assert.deepEqual(estimado({ ...f, montos: [] }, 1, 1), [])
})
