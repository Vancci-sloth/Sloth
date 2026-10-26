import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { CambiosSloth } from './cambios-sloth.ts'

/** Repos de prueba aislados dentro de data: ninguna prueba escribe en el código ni en el índice de Sloth. */
function preparar(t: { after(fn: () => void): void }) {
  const base = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data')
  mkdirSync(base, { recursive: true })
  const app = mkdtempSync(join(base, 'prueba-cambios-'))
  t.after(() => {
    assert.ok(app.startsWith(`${base}\\`) || app.startsWith(`${base}/`))
    rmSync(app, { recursive: true, force: true })
  })
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: app, windowsHide: true, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    return r.stdout
  }
  git('init', '-q')
  git('config', 'user.name', 'Prueba de Sloth')
  git('config', 'user.email', 'prueba@example.invalid')
  git('config', 'core.autocrlf', 'false')
  writeFileSync(join(app, '.gitignore'), 'data/\n')
  writeFileSync(join(app, 'codigo.ts'), 'const previo = 1\n')
  git('add', '.gitignore', 'codigo.ts')
  return { app, git, cambios: new CambiosSloth(app), poner: (ruta: string, texto: string | Buffer) => writeFileSync(join(app, ruta), texto), leer: (ruta: string) => readFileSync(join(app, ruta), 'utf8') }
}

test('leer cambios no bloquea la navegación y conserva el resultado de Git', async (t) => {
  const h = preparar(t)
  h.git('commit', '-qm', 'Inicial')
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const previo = 2\n')
  h.cambios.terminar('sloth')
  const esperado = h.cambios.ver('sloth')
  let pulsos = 0
  const timer = setInterval(() => pulsos++, 10)
  try {
    const vista = await h.cambios.verAsync('sloth')
    assert.deepEqual(vista, esperado)
    assert.ok(pulsos > 5, 'el servidor debe seguir atendiendo mientras Git trabaja')
    h.poner('codigo.ts', 'const previo = 3\n')
    const nueva = await h.cambios.verAsync('sloth')
    assert.notEqual(nueva.git.revision, vista.git.revision, 'vuelve a comprobar cambios externos')
  } finally {
    clearInterval(timer)
    await h.cambios.cerrarLectura()
  }
})

test('revertir conserva trabajo previo sin commit y el índice, y restaura creaciones, borrados y binarios', (t) => {
  const h = preparar(t)
  h.poner('codigo.ts', 'const previo = 2\r\n')
  h.poner('borrado.txt', 'antes del turno\n')
  h.poner('imagen.bin', Buffer.from([0, 1, 2, 255]))
  const indice = readFileSync(join(h.app, '.git', 'index'))
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const previo = 3\r\n')
  h.poner('nuevo.txt', 'archivo nuevo\n')
  h.poner('vacio.txt', '')
  h.poner('imagen.bin', Buffer.from([0, 4, 5]))
  unlinkSync(join(h.app, 'borrado.txt'))
  h.cambios.terminar('sloth')
  const cambio = h.cambios.listar('sloth')[0]
  assert.equal(cambio.archivos.find((a) => a.ruta === 'codigo.ts')?.sumadas, 1)
  assert.equal(cambio.archivos.find((a) => a.ruta === 'codigo.ts')?.quitadas, 1)
  assert.equal(cambio.archivos.find((a) => a.ruta === 'imagen.bin')?.binario, true)
  assert.equal(cambio.archivos.find((a) => a.ruta === 'borrado.txt')?.tipo, 'eliminado')
  h.poner('ajeno.txt', 'cambio posterior en otro archivo\n')
  h.cambios.revertir('sloth', cambio.id)
  assert.equal(h.leer('codigo.ts'), 'const previo = 2\r\n')
  assert.equal(h.leer('borrado.txt'), 'antes del turno\n')
  assert.deepEqual(readFileSync(join(h.app, 'imagen.bin')), Buffer.from([0, 1, 2, 255]))
  assert.equal(existsSync(join(h.app, 'nuevo.txt')), false)
  assert.equal(existsSync(join(h.app, 'vacio.txt')), false)
  assert.equal(h.leer('ajeno.txt'), 'cambio posterior en otro archivo\n')
  assert.deepEqual(readFileSync(join(h.app, '.git', 'index')), indice)
  assert.equal(new CambiosSloth(h.app).listar('sloth')[0].revertido, true)
})

test('un conflicto posterior bloquea toda la reversión sin tocar los demás archivos', (t) => {
  const h = preparar(t)
  h.cambios.iniciar('sloth', 1)
  h.poner('aaa.txt', 'nuevo\n')
  h.poner('codigo.ts', 'const cambio = 2\n')
  h.cambios.terminar('sloth')
  const cambio = h.cambios.listar('sloth')[0]
  h.poner('codigo.ts', 'edición posterior del usuario\n')
  assert.throws(() => h.cambios.revertir('sloth', cambio.id), /cambió después/)
  assert.equal(h.leer('aaa.txt'), 'nuevo\n')
  assert.equal(h.leer('codigo.ts'), 'edición posterior del usuario\n')
  assert.equal(h.cambios.listar('sloth')[0].revertido, false)
})

test('las copias sobreviven a un reinicio y los turnos se pueden revertir del último al primero', (t) => {
  const h = preparar(t)
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const segundo = 2\n')
  const retomado = new CambiosSloth(h.app)
  retomado.terminar('sloth')
  retomado.iniciar('sloth', 2)
  h.poner('codigo.ts', 'const tercero = 3\n')
  retomado.terminar('sloth')
  const [ultimo, primero] = retomado.listar('sloth')
  assert.throws(() => retomado.revertir('sloth', primero.id), /cambió después/)
  retomado.revertir('sloth', ultimo.id)
  assert.equal(h.leer('codigo.ts'), 'const segundo = 2\n')
  retomado.revertir('sloth', primero.id)
  assert.equal(h.leer('codigo.ts'), 'const previo = 1\n')
  assert.throws(() => retomado.revertir('sloth', primero.id), /ya se revirtió/)
})

test('un archivo que cambia sin cambiar de tamaño, justo tras la copia, sale en la ronda', (t) => {
  const h = preparar(t)
  h.cambios.calentar()
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const previo = 2\n')
  h.cambios.terminar('sloth')
  h.cambios.iniciar('sloth', 2)
  h.poner('codigo.ts', 'const previo = 3\n')
  h.cambios.terminar('sloth')
  const [segundo, primero] = h.cambios.listar('sloth')
  assert.deepEqual([segundo.archivos.map((a) => a.ruta), primero.archivos.map((a) => a.ruta)], [['codigo.ts'], ['codigo.ts']])
  h.cambios.revertir('sloth', segundo.id)
  assert.equal(h.leer('codigo.ts'), 'const previo = 2\n')
})

test('solo Sloth en este repo usa la función; no revierte mientras trabajan ni el cambio de otro hilo', (t) => {
  const h = preparar(t)
  assert.equal(h.cambios.esSloth({ cardId: 'sloth', cwd: h.app }), true)
  assert.equal(h.cambios.esSloth({ cardId: 'video-el-diff', cwd: h.app }), false)
  assert.equal(h.cambios.esSloth({ cardId: 'sloth', cwd: dirname(h.app) }), false)
  h.cambios.iniciar('hilo-a', 1)
  h.poner('codigo.ts', 'const nuevo = 2\n')
  h.cambios.terminar('hilo-a')
  const cambio = h.cambios.listar('hilo-a')[0]
  h.cambios.iniciar('hilo-b', Date.now() + 1)
  assert.throws(() => h.cambios.revertir('hilo-a', cambio.id), /sigue trabajando/)
  h.cambios.terminar('hilo-b')
  assert.throws(() => h.cambios.revertir('hilo-b', cambio.id), /No existe/)
})

/** Una herramienta del hilo, de principio a fin, que escribe lo que se le pida. */
function herramienta(h: ReturnType<typeof preparar>, hilo: string, id: string, escribir: () => void) {
  h.cambios.herramienta(hilo, id, false)
  escribir()
  h.cambios.herramienta(hilo, id, true)
}

test('dos hilos a la vez: cada uno ve lo suyo, también en el panel, y no revierte lo que cambiaron los dos', (t) => {
  const h = preparar(t)
  h.poner('otro.ts', 'const otro = 1\n')
  h.cambios.iniciar('hilo-a', Date.now())
  h.cambios.iniciar('hilo-b', Date.now())
  herramienta(h, 'hilo-a', 'a1', () => h.poner('codigo.ts', 'const de_a = 1\n'))
  herramienta(h, 'hilo-b', 'b1', () => h.poner('otro.ts', 'const de_b = 1\n'))
  // Los dos con una herramienta en marcha: no se sabe de quién es.
  h.cambios.herramienta('hilo-a', 'a2', false)
  h.cambios.herramienta('hilo-b', 'b2', false)
  h.poner('comando.ts', 'de cualquiera\n')
  h.cambios.herramienta('hilo-a', 'a2', true)
  h.cambios.herramienta('hilo-b', 'b2', true)
  assert.deepEqual(h.cambios.ver('hilo-a').ronda?.archivos.map((a) => a.ruta), ['codigo.ts', 'comando.ts'])
  // El panel lee con su propia copia (cambios-sloth-worker.mjs): sabe lo mismo.
  assert.deepEqual(new CambiosSloth(h.app).ver('hilo-b').ronda?.archivos.map((a) => a.ruta), ['comando.ts', 'otro.ts'])
  h.cambios.terminar('hilo-a')
  h.cambios.terminar('hilo-b')
  const [a] = h.cambios.listar('hilo-a'), [b] = h.cambios.listar('hilo-b')
  assert.deepEqual(a.archivos.map((x) => x.ruta), ['codigo.ts', 'comando.ts'])
  assert.deepEqual(b.archivos.map((x) => x.ruta), ['comando.ts', 'otro.ts'])
  assert.throws(() => h.cambios.revertir('hilo-a', a.id), /Otro hilo también cambió comando\.ts/)
  assert.equal(h.leer('codigo.ts'), 'const de_a = 1\n')
})

test('un comando de otro hilo sobre un archivo que este editó bloquea revertirlo', (t) => {
  const h = preparar(t)
  h.cambios.iniciar('hilo-a', Date.now())
  h.cambios.iniciar('hilo-b', Date.now())
  herramienta(h, 'hilo-a', 'edit', () => h.poner('codigo.ts', 'const de_a = 1\n'))
  // El hilo A piensa; el B cambia el mismo archivo con un comando.
  herramienta(h, 'hilo-b', 'bash', () => h.poner('codigo.ts', 'const de_a = 1\nconst de_b = 2\n'))
  h.cambios.terminar('hilo-a')
  h.cambios.terminar('hilo-b')
  const [a] = h.cambios.listar('hilo-a'), [b] = h.cambios.listar('hilo-b')
  assert.deepEqual(b.archivos.map((x) => x.ruta), ['codigo.ts'])
  assert.throws(() => h.cambios.revertir('hilo-a', a.id), /Otro hilo también cambió codigo\.ts/)
  assert.throws(() => h.cambios.revertir('hilo-b', b.id), /Otro hilo también cambió codigo\.ts/)
  assert.equal(h.leer('codigo.ts'), 'const de_a = 1\nconst de_b = 2\n')
})

test('las tareas de fondo cuentan como trabajo: lo que cambia mientras, el otro hilo no lo revierte', (t) => {
  const h = preparar(t)
  h.cambios.iniciar('hilo-a', Date.now())
  h.cambios.iniciar('hilo-b', Date.now())
  h.cambios.trabajoDeFondo('hilo-b', true)
  h.cambios.herramienta('hilo-a', 'a1', false)
  h.poner('compilado.js', 'lo escribió el fondo de B\n')
  h.cambios.herramienta('hilo-a', 'a1', true)
  h.cambios.terminar('hilo-a')
  h.cambios.trabajoDeFondo('hilo-b', false)
  h.cambios.terminar('hilo-b')
  assert.deepEqual(h.cambios.listar('hilo-a').map((c) => c.archivos.map((x) => x.ruta)), [['compilado.js']])
  assert.deepEqual(h.cambios.listar('hilo-b').map((c) => c.archivos.map((x) => x.ruta)), [['compilado.js']])
  assert.throws(() => h.cambios.revertir('hilo-a', h.cambios.listar('hilo-a')[0].id), /Otro hilo también cambió compilado\.js/)
})

test('sin archivos en común, cada hilo revierte lo suyo y deja lo del otro', (t) => {
  const h = preparar(t)
  h.poner('otro.ts', 'const otro = 1\n')
  h.cambios.iniciar('hilo-a', Date.now())
  h.cambios.iniciar('hilo-b', Date.now())
  herramienta(h, 'hilo-a', 'a1', () => h.poner('codigo.ts', 'const de_a = 22\n'))
  herramienta(h, 'hilo-b', 'b1', () => h.poner('otro.ts', 'const de_b = 22\n'))
  h.cambios.terminar('hilo-a')
  h.cambios.terminar('hilo-b')
  h.cambios.revertir('hilo-a', h.cambios.listar('hilo-a')[0].id)
  assert.deepEqual([h.leer('codigo.ts'), h.leer('otro.ts')], ['const previo = 1\n', 'const de_b = 22\n'])
})

test('cambiar .gitignore nunca mete las propias copias en el diff', (t) => {
  const h = preparar(t)
  h.cambios.iniciar('sloth', 1)
  h.poner('.gitignore', '')
  h.poner('codigo.ts', 'const nuevo = 2\n')
  h.cambios.terminar('sloth')
  const cambio = h.cambios.listar('sloth')[0]
  assert.deepEqual(cambio.archivos.map((a) => a.ruta), ['.gitignore', 'codigo.ts'])
  h.cambios.revertir('sloth', cambio.id)
  assert.equal(h.leer('.gitignore'), 'data/\n')
})

test('la ronda se actualiza en vivo, los globales incluyen lo previo y una ronda vacía no enseña la anterior', (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.poner('codigo.ts', 'const previo = 2\n')
  h.poner('pendiente.txt', 'trabajo de antes\n')
  h.cambios.iniciar('sloth', 1)
  assert.equal(h.cambios.ver('sloth').ronda?.archivos.length, 0)
  h.poner('codigo.ts', 'const previo = 3\n')
  const vivo = h.cambios.ver('sloth')
  assert.equal(vivo.ronda?.enCurso, true)
  assert.deepEqual(vivo.ronda?.archivos.map((a) => a.ruta), ['codigo.ts'])
  assert.deepEqual(vivo.globales.map((a) => a.ruta), ['codigo.ts', 'pendiente.txt'])
  assert.ok(vivo.ronda?.archivos[0].diff.includes('-const previo = 2'))
  assert.ok(vivo.globales[0].diff.includes('-const previo = 1'))
  h.poner('ronda.txt', 'creado mientras trabaja\n')
  assert.equal(h.cambios.ver('sloth').ronda?.archivos.length, 2)
  h.cambios.terminar('sloth')
  h.cambios.iniciar('sloth', 2)
  h.cambios.terminar('sloth')
  const siguiente = h.cambios.ver('sloth')
  assert.equal(siguiente.ronda?.archivos.length, 0)
  assert.equal(siguiente.historial.length, 2)
  assert.equal(siguiente.globales.length, 3)
})

test('solo commit incluye los globales revisados y respeta mensajes y rutas con caracteres especiales', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const nuevo = 2\n')
  h.poner('nombre con espacios [1].txt', 'nuevo\n')
  h.cambios.terminar('sloth')
  const estado = h.cambios.ver('sloth')
  const mensaje = 'Mejora Sloth: "literal" $(sin-shell) `texto`'
  const operacion = h.cambios.guardarGit('commit', mensaje, estado.git.revision)
  assert.throws(() => h.cambios.iniciar('otro-hilo', 2), /haciendo commit o push/)
  const resultado = await operacion
  assert.equal(resultado.push, false)
  assert.equal(h.git('log', '-1', '--format=%s').trim(), mensaje)
  assert.equal(h.git('rev-parse', 'HEAD').trim(), resultado.commit)
  assert.deepEqual(h.git('show', '--format=', '--name-only', 'HEAD').trim().split('\n').sort(), ['codigo.ts', 'nombre con espacios [1].txt'])
  assert.equal(h.cambios.ver('sloth').globales.length, 0)
  assert.equal(h.cambios.ver('sloth').ronda?.archivos.length, 2)
})

test('si el repo cambió desde la revisión, no hace commit ni prepara archivos', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.poner('codigo.ts', 'const cambio = 2\n')
  const estado = h.cambios.ver('sloth')
  const head = h.git('rev-parse', 'HEAD')
  const indice = readFileSync(join(h.app, '.git', 'index'))
  h.poner('codigo.ts', 'otra edición posterior\n')
  await assert.rejects(h.cambios.guardarGit('commit', 'Cambio', estado.git.revision), /globales cambiaron/)
  assert.equal(h.git('rev-parse', 'HEAD'), head)
  assert.deepEqual(readFileSync(join(h.app, '.git', 'index')), indice)
})

test('commit y push, seguido de solo push, funcionan con un remoto local sin recrear commits', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  const remoto = join(h.app, 'data', 'remoto.git')
  h.git('init', '--bare', '-q', remoto)
  h.git('remote', 'add', 'origin', remoto)
  h.poner('codigo.ts', 'const enviado = 2\n')
  const estado = h.cambios.ver('sloth')
  const resultado = await h.cambios.guardarGit('commit-push', 'Cambio enviado', estado.git.revision)
  assert.equal(resultado.push, true)
  assert.equal(h.git('--git-dir', remoto, 'rev-parse', `refs/heads/${estado.git.rama}`).trim(), resultado.commit)
  const head = h.git('rev-parse', 'HEAD')
  const repetido = await h.cambios.guardarGit('push', '', h.cambios.ver('sloth').git.revision)
  assert.equal(repetido.push, true)
  assert.equal(repetido.commit, undefined)
  assert.equal(h.git('rev-parse', 'HEAD'), head)
})

test('si falla el push, conserva el commit y permite reintentar solamente el envío', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.git('remote', 'add', 'origin', join(h.app, 'data', 'no-existe.git'))
  h.poner('codigo.ts', 'const local = 2\n')
  const resultado = await h.cambios.guardarGit('commit-push', 'Guardar local', h.cambios.ver('sloth').git.revision)
  assert.equal(resultado.push, false)
  assert.ok(resultado.errorPush)
  assert.equal(h.git('rev-parse', 'HEAD').trim(), resultado.commit)
  const remoto = join(h.app, 'data', 'remoto.git')
  h.git('init', '--bare', '-q', remoto)
  h.git('remote', 'set-url', 'origin', remoto)
  await h.cambios.guardarGit('push', '', h.cambios.ver('sloth').git.revision)
  assert.equal(h.git('rev-list', '--count', 'HEAD').trim(), '2')
})

test('el diff global respeta la conversión de saltos de línea de Git en Windows', (t) => {
  const h = preparar(t)
  h.poner('codigo.ts', 'primera\nsegunda\ntercera\n')
  h.git('add', 'codigo.ts')
  h.git('commit', '-m', 'Inicial')
  h.git('config', 'core.autocrlf', 'true')
  h.poner('codigo.ts', 'primera\r\ncambiada\r\ntercera\r\n')
  const archivo = h.cambios.ver('sloth').globales.find((a) => a.ruta === 'codigo.ts')!
  assert.equal(archivo.sumadas, 1)
  assert.equal(archivo.quitadas, 1)
})

test('Auto documenta, hace commit y push sin pedir un mensaje manual', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  const remoto = join(h.app, 'data', 'remoto.git')
  h.git('init', '--bare', '-q', remoto)
  h.git('remote', 'add', 'origin', remoto)
  h.poner('codigo.ts', 'const actualizado = 2\n')
  const estado = h.cambios.ver('sloth')
  const mensaje = 'Actualiza la configuración de Sloth\n\n- Ajusta el valor de configuración.\n- Conserva el resto del comportamiento.\n\nArchivos incluidos:\n- codigo.ts: modificado (+1 / -1)'
  let redacciones = 0
  const resultado = await h.cambios.guardarGit('auto', '', estado.git.revision, async () => {
    redacciones++
    assert.equal(h.cambios.ocupado(), true)
    return mensaje
  })
  assert.equal(redacciones, 1)
  assert.equal(resultado.push, true)
  assert.equal(resultado.mensaje, mensaje)
  assert.equal(h.git('log', '-1', '--format=%B').trim(), mensaje)
  assert.equal(h.git('--git-dir', remoto, 'rev-parse', `refs/heads/${estado.git.rama}`).trim(), resultado.commit)
})

test('Auto no modifica el índice ni crea un commit si falla la redacción', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.git('remote', 'add', 'origin', join(h.app, 'data', 'remoto.git'))
  h.poner('codigo.ts', 'const nuevo = 2\n')
  const estado = h.cambios.ver('sloth')
  const indice = readFileSync(join(h.app, '.git', 'index'))
  await assert.rejects(h.cambios.guardarGit('auto', '', estado.git.revision, async () => { throw new Error('Falló el agente') }), /Falló el agente/)
  assert.equal(h.git('rev-list', '--count', 'HEAD').trim(), '1')
  assert.deepEqual(readFileSync(join(h.app, '.git', 'index')), indice)
  assert.equal(h.cambios.ocupado(), false)
})

test('Auto cancela commit y push si el código cambia mientras se documenta', async (t) => {
  const h = preparar(t)
  h.git('commit', '-m', 'Inicial')
  h.git('remote', 'add', 'origin', join(h.app, 'data', 'remoto.git'))
  h.poner('codigo.ts', 'const nuevo = 2\n')
  const estado = h.cambios.ver('sloth')
  const indice = readFileSync(join(h.app, '.git', 'index'))
  await assert.rejects(h.cambios.guardarGit('auto', '', estado.git.revision, async () => {
    h.poner('codigo.ts', 'const posterior = 3\n')
    return 'Documenta el cambio\n\n- Explica la modificación.'
  }), /cambiaron durante la documentación/)
  assert.equal(h.git('rev-list', '--count', 'HEAD').trim(), '1')
  assert.deepEqual(readFileSync(join(h.app, '.git', 'index')), indice)
  assert.equal(h.leer('codigo.ts'), 'const posterior = 3\n')
})

test('tras reiniciar, lo que no cambió se reconoce sin volver a leerlo, y lo que cambió mientras tanto, sí', (t) => {
  const h = preparar(t)
  h.poner('otro.ts', 'uno\n')
  h.cambios.iniciar('sloth', 1)
  h.poner('codigo.ts', 'const previo = 2\n')
  h.cambios.terminar('sloth')
  const antes = h.cambios.listar('sloth')
  // Otro Sloth sobre los mismos datos, como tras un reinicio. Mientras estaba apagado, alguien cambió un archivo.
  h.poner('otro.ts', 'uno y dos\n')
  const otro = new CambiosSloth(h.app)
  otro.iniciar('sloth', 2)
  h.poner('codigo.ts', 'const previo = 3\n')
  otro.terminar('sloth')
  const cambios = otro.listar('sloth')
  assert.deepEqual(cambios.at(-1), antes[0], 'el turno de antes sigue igual')
  // El turno nuevo ve el cambio de codigo.ts desde el 2, que leyó de nuevo; otro.ts cambió antes del turno: no es suyo.
  assert.deepEqual(cambios[0].archivos.map((a) => a.ruta), ['codigo.ts'])
  assert.match(cambios[0].archivos[0].diff, /-const previo = 2/)
})
