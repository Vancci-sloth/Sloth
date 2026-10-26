#!/usr/bin/env node
// El árbitro del bucle: el agente cambia código; este script mide y decide si el cambio se queda o se deshace.
// Uso, desde la raíz del repo:
//   node autoloop.mjs init <tag>          rama autoloop/<tag> y carpeta .autoloop
//   node autoloop.mjs lock <fase>         commit de checks + config aprobados por el humano
//   node autoloop.mjs round "<qué probé>" commit, puntúa, keep o reset, apunta en results.tsv
//   node autoloop.mjs fin [carpeta]       antes de fusionar: .autoloop sale de la rama; los checks, a la carpeta
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const RESULTS = '.autoloop/results.tsv'
const CONFIG = '.autoloop/config.json'
const COLS = ['ronda', 'fase', 'commit', 'score', 'estado', 'descripción', 'log']
// Lo que el agente no puede tocar después de `lock`. program.md, results.tsv y runs/ quedan fuera de git para
// que sobrevivan a los reset.
const LOCKED = ['.autoloop/checks', CONFIG]
const UNTRACKED = ['.autoloop/program.md', RESULTS, '.autoloop/runs/']

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const ok = (...args) => spawnSync('git', args).status === 0
function die(msg) {
  console.error(`autoloop: ${msg}`)
  process.exit(1)
}

function rows() {
  return readFileSync(RESULTS, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
    .map((line) => Object.fromEntries(line.split('\t').map((v, i) => [COLS[i], v])))
}
function append(row) {
  appendFileSync(RESULTS, COLS.map((c) => String(row[c] ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t') + '\n')
}
// Los reset --hard solo se hacen en una rama del bucle: nunca en main.
function onLoopBranch() {
  const branch = git('branch', '--show-current')
  if (!branch.startsWith('autoloop/')) die(`estás en "${branch}". Corre init antes: solo trabajo en ramas autoloop/*.`)
}

function init(tag) {
  if (!tag) die('falta el tag: init <tag>')
  if (!ok('rev-parse', '--git-dir')) die('esto no es un repo git.')
  if (git('status', '--porcelain')) die('hay cambios sin commit; guárdalos antes de empezar.')
  if (!ok('checkout', '-b', `autoloop/${tag}`)) die(`la rama autoloop/${tag} ya existe; elige otro tag.`)
  mkdirSync('.autoloop/checks', { recursive: true })
  mkdirSync('.autoloop/runs', { recursive: true })
  if (!existsSync('.autoloop/program.md')) copyFileSync(join(HERE, 'program.md'), '.autoloop/program.md')
  if (!existsSync(CONFIG)) copyFileSync(join(HERE, 'config.json'), CONFIG)
  if (!existsSync(RESULTS)) writeFileSync(RESULTS, COLS.join('\t') + '\n')
  const exclude = git('rev-parse', '--git-path', 'info/exclude')
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  mkdirSync(dirname(exclude), { recursive: true })
  // Desde una carpeta del repo (como skills/ en este repo), el exclude las quiere con esa carpeta delante.
  const prefijo = git('rev-parse', '--show-prefix')
  const nuevas = UNTRACKED.map((p) => prefijo + p).filter((p) => !current.includes(p))
  if (nuevas.length) appendFileSync(exclude, (current && !current.endsWith('\n') ? '\n' : '') + nuevas.map((p) => `${p}\n`).join(''))
  console.log(`rama autoloop/${tag} lista. Escribe .autoloop/program.md, los checks y ${CONFIG}; luego lock <fase>.`)
}

function lock(fase) {
  if (!fase) die('falta la fase: lock <fase>')
  onLoopBranch()
  git('add', '--', ...LOCKED)
  if (!ok('diff', '--cached', '--quiet')) git('commit', '-q', '-m', `autoloop: checks aprobados (${fase})`)
  const commit = git('rev-parse', '--short', 'HEAD')
  append({ ronda: '-', fase, commit, estado: 'lock', 'descripción': 'checks aprobados' })
  console.log(`fase "${fase}" bloqueada en ${commit}. Siguiente: round "base".`)
}

function round(desc) {
  if (!desc) die('falta la descripción: round "<qué probé>"')
  onLoopBranch()
  const all = rows()
  const locked = all.findLast((r) => r.estado === 'lock')
  if (!locked) die('no hay checks aprobados: primero lock <fase>.')
  const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
  const lower = cfg.better === 'lower'
  // `margen`: cuánto tiene que mejorar (0.05 = 5 %) para contar. Con métricas ruidosas, como un tiempo, evita que el
  // azar de una medición se quede como mejora.
  const margen = cfg.margen ?? 0
  const beats = (a, b) => b === undefined || (lower ? a < b * (1 - margen) : a > b * (1 + margen))
  const kept = all.filter((r) => r.fase === locked.fase && r.estado === 'keep')
  const best = kept.reduce((acc, r) => (!acc || (lower ? Number(r.score) < Number(acc.score) : Number(r.score) > Number(acc.score)) ? r : acc), undefined)
  const base = best?.commit ?? locked.commit
  const n = all.filter((r) => r.estado !== 'lock').length + 1

  if (git('status', '--porcelain')) {
    git('add', '-A')
    git('commit', '-q', '-m', `autoloop ${n}: ${desc}`)
  }
  const commit = git('rev-parse', '--short', 'HEAD')
  const log = `.autoloop/runs/${n}.log`
  let estado
  let score = ''
  let done = false

  if (!ok('diff', '--quiet', locked.commit, 'HEAD', '--', ...LOCKED)) {
    estado = 'trampa'
    writeFileSync(log, `[autoloop] la ronda tocó ${LOCKED.join(' o ')}: no se mide.\n` + git('diff', '--stat', locked.commit, 'HEAD', '--', ...LOCKED))
  } else {
    // ponytail: en Windows el timeout mata la shell, no siempre a sus hijos; si se queda colgado, mátalo a mano.
    const r = spawnSync(cfg.command, { shell: true, encoding: 'utf8', timeout: (cfg.timeoutMin ?? 10) * 60_000, maxBuffer: 1 << 28 })
    const out = (r.stdout ?? '') + (r.stderr ?? '') + (r.error ? `\n[autoloop] ${r.error.message}\n` : '')
    writeFileSync(log, out)
    const m = [...out.matchAll(new RegExp(cfg.score, 'gm'))].at(-1)
    score = m ? Number(m[1]) : NaN
    estado = Number.isNaN(score) ? 'crash' : beats(score, best && Number(best.score)) ? 'keep' : 'discard'
    done = estado === 'keep' && !!cfg.done && new RegExp(cfg.done, 'm').test(out)
  }
  if (estado !== 'keep') git('reset', '-q', '--hard', base)
  append({ ronda: n, fase: locked.fase, commit, score: Number.isNaN(score) ? '' : score, estado, 'descripción': desc, log })

  console.log(`ronda ${n} · ${estado} · score ${score === '' || Number.isNaN(score) ? '-' : score} · mejor antes ${best?.score ?? '-'} (${lower ? 'menos' : 'más'} es mejor)`)
  console.log(`log: ${log}`)
  if (estado !== 'keep') console.log(`deshecho: vuelvo a ${base}`)
  console.log(`hecho: ${done ? 'sí' : 'no'}`)
}

// `lock` hace commit de los checks: si la rama se fusiona así, .autoloop llega a main. `fin` lo saca de la rama (en
// el disco se queda) y, con una carpeta, deja ahí los checks y config.json, versionados, para repetir el bucle.
function fin(carpeta) {
  onLoopBranch()
  if (git('status', '--porcelain')) die('hay cambios sin commit; termina la ronda antes de cerrar el bucle.')
  if (carpeta) {
    mkdirSync(carpeta, { recursive: true })
    cpSync('.autoloop/checks', join(carpeta, 'checks'), { recursive: true })
    copyFileSync(CONFIG, join(carpeta, 'config.json'))
    git('add', '--', carpeta)
  }
  git('rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.autoloop')
  if (!ok('diff', '--cached', '--quiet')) git('commit', '-q', '-m', `autoloop: .autoloop fuera de la rama${carpeta ? `; los checks, en ${carpeta}` : ''}`)
  console.log(`.autoloop ya no va en la rama${carpeta ? ` y los checks quedan en ${carpeta}` : ''}. Ya se puede fusionar.`)
}

const [cmd, ...rest] = process.argv.slice(2)
const arg = rest.join(' ')
if (cmd === 'init') init(arg)
else if (cmd === 'lock') lock(arg)
else if (cmd === 'round') round(arg)
else if (cmd === 'fin') fin(arg)
else die('uso: init <tag> | lock <fase> | round "<qué probé>" | fin [carpeta]')
