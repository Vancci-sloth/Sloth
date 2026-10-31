// El puente con el SDK de Cursor (`@cursor/sdk`). Sloth lo copia a la carpeta donde bajó el SDK y lo corre con su Node
// (server/cursor.ts): así el SDK encuentra sus ayudantes de cada sistema (los busca desde el script que se corre), y si
// falla algo suyo (T3 Code vio promesas sin atender que tumbaban el proceso) cae este proceso, no el servidor de Sloth.
//
// Uno por vez: `estado`, `modelos`, `login` y `salir` escriben su resultado y acaban; `agente` es un hilo, que lee
// órdenes por su entrada (una por línea) y escribe por su salida lo que pasa.
import { Agent, Cursor } from '@cursor/sdk'

const decir = (m) => process.stdout.write(`${JSON.stringify(m)}\n`)
const mensajeDe = (e) => (e instanceof Error ? e.message : String(e))
// Lo que el SDK deja sin atender no tumba el puente a mitad de un turno (T3 Code, `CursorSdk.ts`).
process.on('unhandledRejection', (e) => decir({ type: 'aviso', error: mensajeDe(e) }))

const modo = process.argv[2]

if (modo === 'estado') {
  const s = await Cursor.auth.status()
  decir(s.status === 'logged-in' ? { conectada: true, quien: s.email } : { conectada: false })
} else if (modo === 'modelos') {
  try {
    decir({ modelos: await Cursor.models.list() })
  } catch (e) {
    decir({ modelos: [], error: mensajeDe(e) })
  }
} else if (modo === 'login') {
  try {
    await Cursor.auth.login({ openBrowser: false, apiKeyName: 'Sloth', onLoginUrl: (url) => decir({ type: 'url', url }) })
    decir({ type: 'listo' })
  } catch (e) {
    decir({ type: 'error', error: mensajeDe(e) })
  }
} else if (modo === 'salir') {
  await Cursor.auth.logout()
  decir({ ok: true })
} else if (modo === 'agente') {
  let agente
  let run
  const ordenes = { abrir, mandar, steer, cancelar, cerrar }
  let resto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => {
    resto += d
    let i
    while ((i = resto.indexOf('\n')) >= 0) {
      const linea = resto.slice(0, i)
      resto = resto.slice(i + 1)
      if (!linea.trim()) continue
      const o = JSON.parse(linea)
      Promise.resolve(ordenes[o.type]?.(o)).catch((e) => decir({ type: 'fin', status: 'error', error: mensajeDe(e) }))
    }
  })
  process.stdin.on('end', () => cerrar())

  async function abrir({ opciones, resume }) {
    agente = resume ? await Agent.resume(resume, opciones).catch(() => Agent.create(opciones)) : await Agent.create(opciones)
    decir({ type: 'abierto', agentId: agente.agentId })
  }

  async function mandar({ mensaje, modelo }) {
    const enviar = () => agente.send(mensaje, { ...(modelo ? { model: modelo } : {}), onDelta: ({ update }) => decir({ type: 'update', update }) })
    try {
      run = await enviar()
    } catch (e) {
      // Uno que quedó trabado de un cierre anterior: se cancela y se vuelve a mandar (T3 Code).
      if (!/already has active run/i.test(mensajeDe(e))) throw e
      const { items } = await Agent.listRuns(agente.agentId, { runtime: 'local', cwd: process.cwd(), limit: 1 })
      if (items?.[0]) await Agent.cancelRun(items[0].id, { runtime: 'local', cwd: process.cwd() })
      run = await enviar()
    }
    const r = await run.wait()
    run = undefined
    decir({ type: 'fin', status: r.status, error: r.error?.message, usage: r.usage, result: r.result })
  }

  async function steer({ texto }) {
    // Si el SDK no lo mete en el turno, va como un mensaje más al acabar.
    const ack = run?.steer ? await run.steer(texto).catch(() => 'revert_to_followup') : 'revert_to_followup'
    decir({ type: 'steer', ack, texto })
  }

  async function cancelar() {
    await run?.cancel().catch(() => {})
  }

  function cerrar() {
    try {
      agente?.close()
    } finally {
      process.exit(0)
    }
  }
}
