import assert from 'node:assert/strict'
import {mkdtempSync, rmSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {Sessions} from './sessions.ts'
import {guardar} from './disco.ts'
import type {AgentOptions} from './agent.ts'

test('el mismo turno genera el título y nunca pisa un renombrado manual', t => {
  const dir = mkdtempSync(join(tmpdir(), 'vymotion-titulos-'))
  let emitir!: AgentOptions['onEvent']
  let enviado = ''
  const sesiones = new Sessions(dir, ()=>{}, ()=>{}, ()=>{}, ()=>{}, opts => {
    emitir = opts.onEvent
    return {send(texto) {enviado = texto}, steer(){}, async interrupt(){}, close(){}}
  })
  t.after(()=>{sesiones.closeAll(); rmSync(dir, {recursive:true, force:true})})
  const meta = sesiones.create({cardId:'prueba', title:'Crea un anuncio', model:'codex:prueba', cwd:dir, generarTitulo:true})
  sesiones.send(meta.id, 'Un anuncio de Deezer sin voz')
  const archivo = join(dir, `.vymotion-titulo-${meta.id}.txt`)
  assert.ok(enviado.includes(meta.id+'.txt'))
  guardar(archivo, 'Deezer: tu próximo ritmo')
  emitir({t:'turn_end', at:Date.now(), ok:true})
  assert.equal(sesiones.meta(meta.id)?.title, 'Deezer: tu próximo ritmo')
  assert.equal(existsSync(archivo), false)
  sesiones.rename(meta.id, 'Mi campaña')
  sesiones.send(meta.id, 'Otro cambio')
  guardar(archivo, 'Título que no debe reemplazarlo')
  emitir({t:'turn_end', at:Date.now(), ok:true})
  assert.equal(sesiones.meta(meta.id)?.title, 'Mi campaña')
})
