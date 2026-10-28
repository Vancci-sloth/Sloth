import assert from 'node:assert/strict'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { aguantaCuda, elegirPython, motorDe, moverPython, pasoDePip } from './requisitos.ts'

function carpetas() {
  const raiz = mkdtempSync(join(tmpdir(), 'sloth-mover-'))
  const de = join(raiz, 'bajando', 'python')
  mkdirSync(join(de, 'Lib'), { recursive: true })
  writeFileSync(join(de, 'python.exe'), 'exe')
  writeFileSync(join(de, 'Lib', 'os.py'), 'os')
  return { raiz, de, a: join(raiz, 'listo', 'python') }
}

test('mueve el Python y quita uno a medias que hubiera en el destino', async (t) => {
  const { raiz, de, a } = carpetas()
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  mkdirSync(a, { recursive: true })
  writeFileSync(join(a, 'viejo.txt'), 'sin python.exe')
  await moverPython(de, a, 1)
  assert.equal(readFileSync(join(a, 'python.exe'), 'utf8'), 'exe')
  assert.ok(existsSync(join(a, 'Lib', 'os.py')))
  assert.ok(!existsSync(join(a, 'viejo.txt')))
})

test('con un archivo abierto (el antivirus), lo copia en vez de moverlo', { skip: process.platform !== 'win32' }, async (t) => {
  const { raiz, de, a } = carpetas()
  const abierto = openSync(join(de, 'Lib', 'os.py'), 'r')
  t.after(() => (closeSync(abierto), rmSync(raiz, { recursive: true, force: true })))
  await moverPython(de, a, 1)
  assert.equal(readFileSync(join(a, 'python.exe'), 'utf8'), 'exe')
  assert.equal(readFileSync(join(a, 'Lib', 'os.py'), 'utf8'), 'os')
})

test('dice en qué va pip: qué baja y cuánto pesa, y los modelos', () => {
  assert.equal(pasoDePip('Downloading https://download.pytorch.org/whl/cu128/torch-2.8.0%2Bcu128-cp312-cp312-win_amd64.whl (3466.1 MB)'), 'Bajando torch (3,5 GB)')
  assert.equal(pasoDePip('  Downloading nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl (706.8 MB)'), 'Bajando nvidia_cudnn_cu12 (706,8 MB)')
  assert.equal(pasoDePip('Installing collected packages: torch, whisperx'), 'Instalando los paquetes')
  assert.equal(pasoDePip('Bajando large-v3'), 'Bajando el modelo large-v3')
  assert.equal(pasoDePip('Requirement already satisfied: numpy in c:\python'), undefined)
})

test('el torch de CUDA solo con una NVIDIA, un controlador y una memoria que lo aguantan', () => {
  assert.ok(aguantaCuda('8.6, 581.57, 6144'))
  assert.ok(aguantaCuda('6.1, 560.94, 4096\n7.5, 528.33, 4096')) // dos tarjetas: basta una
  assert.ok(!aguantaCuda('6.1, 581.57, 8192')) // una Pascal: el cu128 ya no la usa
  assert.ok(!aguantaCuda('8.6, 528.24, 6144'))
  assert.ok(!aguantaCuda('7.5, 581.57, 2048')) // una MX450 de 2 GB: Whisper no cabe, va Parakeet
  assert.ok(!aguantaCuda('Field "compute_cap" is not a valid field to query.'))
  assert.ok(!aguantaCuda(''))
})

test('el motor de la voz sale de la carpeta del Python de Sloth', () => {
  assert.equal(motorDe('3.12.15-cu128-sloth'), 'whisper')
  assert.equal(motorDe('3.12.14-cu128-2e23ffa6'), 'whisper') // el de la app de YouTube archivada
  assert.equal(motorDe('3.12.15-cpu-sloth'), 'parakeet')
  assert.equal(motorDe('3.12.15-onnx-sloth'), 'parakeet-solo')
})

test('de varios Python de Sloth se usa el suyo y, entre iguales, el más nuevo', () => {
  const fechas: Record<string, number> = { '3.12.14-cu128-2e23ffa6': 3, '3.12.15-cpu-sloth': 1, '3.12.15-cu128-sloth': 2 }
  assert.equal(elegirPython(Object.keys(fechas), (id) => fechas[id]), '3.12.15-cu128-sloth')
  assert.equal(elegirPython(['3.12.14-cu128-2e23ffa6'], () => 0), '3.12.14-cu128-2e23ffa6')
  assert.equal(elegirPython([], () => 0), undefined)
})
