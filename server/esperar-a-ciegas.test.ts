import assert from 'node:assert/strict'
import test from 'node:test'
import { esperaACiegas, frenarEspera } from './claude.ts'

test('el bucle con que el tamal esperó a final.py', () => {
  assert.equal(esperaACiegas('until grep -qE "✓ listo" final.log && ! pgrep -f final.py; do sleep 15; done; tail -40 final.log'), 15)
})

test('las demás formas de esperar: con unidad, en PowerShell, en milisegundos', () => {
  assert.equal(esperaACiegas('sleep 2m && tail voz.log'), 120)
  assert.equal(esperaACiegas('while ($true) { Start-Sleep -Seconds 30 }'), 30)
  assert.equal(esperaACiegas('Start-Sleep 10'), 10)
  assert.equal(esperaACiegas('Start-Sleep -Milliseconds 8000'), 8)
})

test('lo que no es esperar, o espera poco, pasa', () => {
  assert.equal(esperaACiegas('python -B final.py'), 0)
  assert.equal(esperaACiegas('until curl -s localhost:3000; do sleep 1; done'), 1)
  assert.equal(esperaACiegas('grep -n "sleep" SKILL.md'), 0)
  assert.equal(esperaACiegas('Start-Sleep -Milliseconds 500'), 0.5)
})

test('una espera larga se frena siempre; de fondo, también el vigilante de 4 s que dejó colgado al de estafas', () => {
  const vigilante = 'until grep -qE "out/|✘|✓ listo" "C:/tmp/tasks/bjh10irab.output" 2>/dev/null; do sleep 4; done; tail -25 x'
  assert.ok(frenarEspera(vigilante, true))
  assert.equal(frenarEspera(vigilante, false), null)
  assert.ok(frenarEspera('sleep 30; tail final.log', false))
  assert.ok(frenarEspera('sleep 30; tail final.log', true))
})

test('esperar a que arranque un servidor, en primer plano, y lo de fondo sin sleep pasan', () => {
  assert.equal(frenarEspera('until curl -s localhost:3000; do sleep 1; done', false), null)
  assert.equal(frenarEspera('python -B final.py > final.log 2>&1; tail -40 final.log', true), null)
  assert.equal(frenarEspera('for f in *.jpg; do echo $f; done', true), null)
})
