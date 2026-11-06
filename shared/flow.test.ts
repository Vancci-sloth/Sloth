import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AVISO_FRENADA,
  creditosDe,
  DESCANSO,
  descansoNuevo,
  elegirCuenta,
  ENTRE_PEDIDOS,
  espacioEntrePedidos,
  gastoDeRechazo,
  IMAGEN_CHATGPT,
  imagenPosible,
  lineaClips,
  lineaImagenes,
  MODELOS_VIDEO,
  motivoDeAviso,
  esOmni,
  OPCIONES_CLIPS,
  RESOLUCIONES_OMNI,
  saldoDe,
  tipoDeArchivo,
  type UsoCuenta
} from './flow.ts'

test('cada pedido va a la cuenta libre que lleva más sin generar', () => {
  const cuentas: UsoCuenta[] = [
    { correo: 'a', ocupada: false, usada: 300 },
    { correo: 'b', ocupada: false, usada: 100 },
    { correo: 'c', ocupada: true, usada: 0 }
  ]
  assert.equal(elegirCuenta(cuentas, 'video', 1000), 'b')
  // La que ya lo probó y no pudo, no otra vez.
  assert.equal(elegirCuenta(cuentas, 'video', 1000, ['b']), 'a')
  // Solo queda la ocupada: espera su turno.
  assert.equal(elegirCuenta(cuentas, 'video', 1000, ['a', 'b']), 'esperar')
  assert.equal(elegirCuenta(cuentas, 'video', 1000, ['a', 'b', 'c']), 'ninguna')
})

test('sin créditos una cuenta descansa de videos pero sigue con imágenes, y vuelve al acabar su descanso', () => {
  const cuentas: UsoCuenta[] = [{ correo: 'a', ocupada: false, usada: 0, descansa: { hasta: 5000, motivo: 'creditos' } }]
  assert.equal(elegirCuenta(cuentas, 'video', 1000), 'ninguna')
  assert.equal(elegirCuenta(cuentas, 'imagen', 1000), 'a')
  assert.equal(elegirCuenta(cuentas, 'video', 5000), 'a')
  const frenada: UsoCuenta[] = [{ correo: 'a', ocupada: false, usada: 0, descansa: { hasta: 5000, motivo: 'frenada' } }]
  assert.equal(elegirCuenta(frenada, 'imagen', 1000), 'ninguna')
})

test('el aviso de Flow dice si la cuenta se quedó sin créditos o la frenaron', () => {
  assert.equal(motivoDeAviso('No tienes suficientes créditos', 'video'), 'creditos')
  assert.equal(motivoDeAviso('You have reached your daily limit', 'video'), 'creditos')
  assert.equal(motivoDeAviso('Demasiadas solicitudes. Inténtalo más tarde', 'video'), 'frenada')
  assert.equal(motivoDeAviso('', 'video'), 'creditos')
  assert.equal(motivoDeAviso('', 'imagen'), 'frenada')
})

test('el rechazo por «actividad inusual» en la tarjeta se ve como frenada, en cualquier idioma', () => {
  assert.ok(AVISO_FRENADA.test('Failed: We noticed some unusual activity. Please visit the Help Centre for more information.'))
  assert.ok(AVISO_FRENADA.test('Error: Notamos actividad inusual. Visita el Centro de ayuda'))
  assert.ok(!AVISO_FRENADA.test('Failed: This prompt may violate our policies'))
})

test('una cuenta frenada otra vez descansa el doble cada vez, hasta 8 h, y lo olvida tras unas horas', () => {
  const h = 60 * 60_000
  const primera = descansoNuevo('frenada', 0, undefined)
  assert.deepEqual(primera, { hasta: DESCANSO.frenada, motivo: 'frenada', veces: 1 })
  const segunda = descansoNuevo('frenada', primera.hasta + 1000, primera)
  assert.equal(segunda.veces, 2)
  assert.equal(segunda.hasta - (primera.hasta + 1000), 2 * DESCANSO.frenada)
  let d = segunda
  for (let i = 0; i < 6; i++) d = descansoNuevo('frenada', d.hasta, d)
  assert.equal(descansoNuevo('frenada', d.hasta, d).hasta - d.hasta, 8 * h)
  // Mucho después de su último descanso, empieza de nuevo.
  assert.equal(descansoNuevo('frenada', d.hasta + 7 * h, d).veces, 1)
  // Sin créditos, hasta que se renueven.
  assert.deepEqual(descansoNuevo('creditos', 0, undefined, 5 * h), { hasta: 5 * h, motivo: 'creditos' })
})

test('un video rechazado dice cuánto gastó comparando el saldo de antes y el de después', () => {
  assert.equal(gastoDeRechazo({ creditos: 50 }, { creditos: 50 }), 0)
  assert.equal(gastoDeRechazo({ creditos: 50 }, { creditos: 40 }), 10)
  assert.equal(gastoDeRechazo(null, { creditos: 40 }), null)
  // Subió: se renovó en medio, no se sabe.
  assert.equal(gastoDeRechazo({ creditos: 2 }, { creditos: 50 }), null)
})

test('entre dos pedidos hay un espacio al azar, y cuatro veces más tras una frenada', () => {
  assert.equal(espacioEntrePedidos(false, 0), ENTRE_PEDIDOS)
  assert.equal(espacioEntrePedidos(false, 1), 2 * ENTRE_PEDIDOS)
  assert.equal(espacioEntrePedidos(true, 0), 4 * ENTRE_PEDIDOS)
})

test('el costo se lee del panel de Flow en cualquier idioma', () => {
  assert.equal(creditosDe('Veo 3.1 - Lite\nx1\nx2\nLa generación usará 10 créditos'), 10)
  assert.equal(creditosDe('x1\nThis generation will use 100 credits'), 100)
  assert.equal(creditosDe('La generación usará 0 créditos'), 0)
  // En el español de España, Flow los llama puntos.
  assert.equal(creditosDe('Veo 3.1 - Lite\nx1\nx4\nLa generación consumirá 10 puntos'), 10)
})

test('sin costo escrito no hay número: así no se genera a ciegas', () => {
  assert.equal(creditosDe('Veo 3.1 - Lite\nx1\nx2'), null)
  assert.equal(creditosDe('Créditos de Google Flow'), null)
})

test('las imágenes usan lo elegido si está conectado y, si no, lo que haya', () => {
  const ambos = { chatgpt: true, google: true }
  assert.equal(imagenPosible('Nano Banana Pro', ambos), 'Nano Banana Pro')
  assert.equal(imagenPosible(IMAGEN_CHATGPT, ambos), IMAGEN_CHATGPT)
  assert.equal(imagenPosible('', ambos), IMAGEN_CHATGPT)
  assert.equal(imagenPosible(IMAGEN_CHATGPT, { chatgpt: false, google: true }), 'Nano Banana 2.1')
  assert.equal(imagenPosible('Nano Banana Pro', { chatgpt: true, google: false }), IMAGEN_CHATGPT)
  assert.equal(imagenPosible('', { chatgpt: false, google: false }), '')
})

test('la línea Imágenes dice con qué generar y sin elección no sale', () => {
  assert.match(lineaImagenes('Nano Banana Pro'), /^Imágenes: genéralas en Google Flow con Nano Banana Pro, no con ChatGPT/)
  assert.match(lineaImagenes(IMAGEN_CHATGPT), /^Imágenes: con ChatGPT/)
  assert.equal(lineaImagenes(''), '')
})

test('la línea Clips lleva el modelo, la resolución de Omni y su costo de tope; lo que no existe no sale', () => {
  assert.match(lineaClips('Omni 1.1 Flash · 720p'), /^Clips: genéralos en Google Flow con Omni 1\.1 Flash en 720p, 12 créditos .*modelo "Omni 1\.1 Flash", resolucion "720p" y tope 12/)
  assert.match(lineaClips('Omni 1.2 Flash · 360p'), /con Omni 1\.2 Flash en 360p, 8 créditos .*modelo "Omni 1\.2 Flash", resolucion "360p" y tope 8/)
  assert.match(lineaClips('Veo 3.1 - Quality'), /con Veo 3\.1 - Quality, 100 créditos .*modelo "Veo 3\.1 - Quality" y tope 100/)
  assert.equal(lineaClips('Veo 9'), '')
  // Todo modelo que acepta el servidor sale en el menú, y la resolución solo en Omni.
  assert.deepEqual([...new Set(Object.values(OPCIONES_CLIPS).map((o) => o.modelo))].sort(), [...MODELOS_VIDEO].sort())
  for (const o of Object.values(OPCIONES_CLIPS)) assert.ok(o.resolucion === undefined || (esOmni(o.modelo) && RESOLUCIONES_OMNI.includes(o.resolucion)))
})

test('lo que baja se reconoce por sus bytes, no por el nombre', () => {
  assert.equal(tipoDeArchivo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])), 'imagen')
  assert.equal(tipoDeArchivo(Uint8Array.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])), 'video')
  assert.equal(tipoDeArchivo(new TextEncoder().encode('<!doctype html>')), null)
})

test('lo que le queda a una cuenta se lee de su menú, con la hora en que se renueva', () => {
  const ahora = new Date(2026, 10, 3, 15, 0).getTime()
  const mexico = saldoDe('Agencia DK\nCambiar de cuenta\nmovie_filter_auto\n20 créditos de Google Flow\nLos créditos se actualizan todos los días a la(s) 12:02 p.m.\nActualizar', ahora)
  assert.deepEqual(mexico, { creditos: 20, renueva: new Date(2026, 10, 4, 12, 2).getTime() })
  const espana = saldoDe('movie_filter_auto\n50 puntos de Google Flow\nLos puntos se actualizan a diario a las 17:11\nActualizar', ahora)
  assert.deepEqual(espana, { creditos: 50, renueva: new Date(2026, 10, 3, 17, 11).getTime() })
  assert.equal(saldoDe('1,000 credits\nYour credits refresh daily at 12:30 AM', ahora)?.renueva, new Date(2026, 10, 4, 0, 30).getTime())
  assert.deepEqual(saldoDe('1.000 créditos de Google Flow\nSe renuevan el 5 de diciembre', ahora), { creditos: 1000 })
  // Sin gastar aún, Flow dice la hora de ahora: no es cuándo se renuevan.
  assert.deepEqual(saldoDe('50 puntos de Google Flow\nLos puntos se actualizan a diario a las 15:00', ahora), { creditos: 50 })
  assert.equal(saldoDe('Créditos de Google Flow', ahora), null)
})
