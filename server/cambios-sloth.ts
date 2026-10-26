import { execFile, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { CambioSloth, ArchivoCambiado, SessionMeta, VistaCambiosSloth, ResultadoGitSloth } from '../shared/types.ts'
import { guardar } from './disco.ts'
import { lectorCambios } from './cambios-sloth-lectura.ts'

/**
 * Solo Sloth: una copia antes y después de cada turno, incluyendo archivos nuevos y trabajo previo sin commit.
 * Los contenidos se guardan por su huella en data, sin tocar el índice ni la historia de Git. Revertir comprueba
 * todos los archivos primero: si alguno cambió después, no sobrescribe nada. Los contenidos siguen recuperables.
 *
 * Varios hilos pueden trabajar a la vez, y entonces la copia de un turno trae también lo del otro. Mientras coinciden,
 * se mira el repo cada vez que una herramienta empieza o acaba: lo que cambió cuando solo un hilo tenía herramientas o
 * tareas de fondo en marcha es suyo (`propias`); si eran los dos, o ninguno, es de todos (`compartidas`). Cada hilo
 * enseña lo suyo y lo compartido, y no revierte un archivo que también cambió otro hilo.
 */
type Copia = Record<string, string>
type Duenos = { propias?: string[]; compartidas?: string[] }
type Turno = Duenos & { id: string; sessionId: string; inicio: number; fin?: number; antes: Copia; despues?: Copia; revertido?: boolean }
/** Lo último que se leyó de un archivo: su tamaño, fechas e inodo (`firma`) y la huella de su contenido. */
type Visto = { firma: string; hash: string }

export class CambiosSloth {
  private objetos: string
  private estado: string
  /** El diff de cada archivo de cada turno terminado, por `<turno>:<ruta>`. */
  private diffs = new Map<string, ArchivoCambiado>()
  private gitOcupado = false
  private globalCache?: { clave: string; archivos: ArchivoCambiado[] }
  private rondaCache?: { clave: string; archivos: ArchivoCambiado[] }
  private leer?: ReturnType<typeof lectorCambios>
  private vistos = new Map<string, Visto>()
  /**
   * Donde se guardan los `vistos` entre reinicios. Sin ellos, la primera copia tras cada reinicio (que pasa solo cada vez
   * que la card Sloth cambia el servidor) leía y huellaba los mil archivos del repo: unos 3 s con el servidor parado.
   */
  private vistosGuardados: string
  /** De quién es lo que cambió en los turnos abiertos: aparte de turnos.json, que pesa megas, para que lo lea el panel. */
  private duenos: string
  /** La última vez que se miró el repo: lo que cambie desde entonces es de quien trabaje hasta la próxima. */
  private ultima?: Copia
  /** Las herramientas en marcha de cada hilo, y los hilos con tareas de fondo. */
  private enVuelo = new Map<string, Set<string>>()
  private fondo = new Set<string>()
  private turnos: Turno[] = []

  constructor(private app: string, private dir = join(app, 'data', 'cambios-sloth')) {
    this.objetos = join(dir, 'objetos')
    this.estado = join(dir, 'turnos.json')
    mkdirSync(this.objetos, { recursive: true })
    this.duenos = join(dir, 'duenos.json')
    this.recargar()
    this.vistosGuardados = join(dir, 'vistos.json')
    // Lo que se vio antes de reiniciar, si su contenido sigue guardado: la primera copia ya no lee el repo entero.
    try {
      const guardados = JSON.parse(readFileSync(this.vistosGuardados, 'utf8')) as Record<string, Visto>
      for (const [ruta, visto] of Object.entries(guardados)) if (existsSync(join(this.objetos, visto.hash))) this.vistos.set(ruta, visto)
    } catch { /* La primera vez, o un archivo dañado: la próxima copia los lee. */ }
  }

  esSloth(meta: Pick<SessionMeta, 'cardId' | 'cwd'>) {
    return meta.cardId === 'sloth' && resolve(meta.cwd) === resolve(this.app)
  }

  comprobarInicio(sessionId: string) {
    if (this.gitOcupado) throw new Error('Sloth está haciendo commit o push. Espera a que termine.')
  }

  /** Una herramienta del hilo empieza o acaba. Lo que cambió antes es de quien trabajaba hasta ahora. */
  herramienta(sessionId: string, id: string, hecha: boolean) {
    if (!this.turnos.some((t) => !t.fin && t.sessionId === sessionId)) return
    const enVuelo = this.enVuelo.get(sessionId) ?? new Set<string>()
    if (enVuelo.has(id) !== hecha) return
    this.antesDeCambiar(sessionId, this.fondo.has(sessionId) || enVuelo.size + (hecha ? -1 : 1) > 0)
    if (hecha) enVuelo.delete(id)
    else this.enVuelo.set(sessionId, enVuelo.add(id))
  }

  /** El hilo tiene tareas de fondo, o ya no: mientras las tenga puede cambiar archivos sin ninguna herramienta en marcha. */
  trabajoDeFondo(sessionId: string, hay: boolean) {
    if (!this.turnos.some((t) => !t.fin && t.sessionId === sessionId) || this.fondo.has(sessionId) === hay) return
    this.antesDeCambiar(sessionId, hay || !!this.enVuelo.get(sessionId)?.size)
    if (hay) this.fondo.add(sessionId)
    else this.fondo.delete(sessionId)
  }

  private trabaja(sessionId: string) { return this.fondo.has(sessionId) || !!this.enVuelo.get(sessionId)?.size }

  /**
   * Mirar el repo tarda unos 100 ms con el servidor parado: solo se mira si cambia quién trabaja y alguien trabajaba. Lo
   * que cambie sin nadie trabajando (tú, a mano) queda con lo que venga después.
   */
  private antesDeCambiar(sessionId: string, trabajara: boolean) {
    if (this.trabaja(sessionId) === trabajara || !this.vigilando()) return
    if (this.turnos.some((t) => !t.fin && this.trabaja(t.sessionId))) this.mirar()
  }

  ocupado() { return this.gitOcupado }

  recargar() {
    this.turnos = existsSync(this.estado) ? JSON.parse(readFileSync(this.estado, 'utf8')) : []
    let duenos: Record<string, Duenos> = {}
    try { duenos = JSON.parse(readFileSync(this.duenos, 'utf8')) } catch { /* Ningún turno abierto ha coincidido con otro. */ }
    for (const t of this.turnos) if (!t.fin && duenos[t.id]) Object.assign(t, duenos[t.id])
  }

  async verAsync(sessionId: string): Promise<VistaCambiosSloth> {
    this.leer ??= lectorCambios(this.app, this.dir)
    const leer = this.leer
    let vista: VistaCambiosSloth
    try { vista = await leer(sessionId) }
    catch (error) {
      await leer.cerrar()
      if (this.leer === leer) this.leer = undefined
      throw error
    }
    vista.git.ocupado = this.gitOcupado
    return vista
  }

  cerrarLectura() { return this.leer?.cerrar() }

  ver(sessionId: string): VistaCambiosSloth {
    const historial: CambioSloth[] = this.turnos.filter((t) => t.sessionId === sessionId && t.despues)
      .map((t) => ({ id: t.id, inicio: t.inicio, revertido: !!t.revertido, archivos: this.archivos(t) })).reverse()
    const activo = this.turnos.find((t) => t.sessionId === sessionId && !t.fin)
    let ronda = historial[0]
    if (activo) {
      const enVivo = { ...activo, despues: this.capturar() }
      const propias = this.propias(enVivo)
      const clave = activo.id + this.huella(Buffer.from(JSON.stringify([enVivo.despues, propias])))
      if (this.rondaCache?.clave !== clave) this.rondaCache = { clave, archivos: propias.map((ruta) => this.diff(enVivo, ruta)) }
      ronda = { id: activo.id, inicio: activo.inicio, revertido: false, enCurso: true, archivos: this.rondaCache.archivos }
    }
    const estado = this.estadoGit()
    if (this.globalCache?.clave !== estado.revision) {
      const antes: Copia = {}, despues: Copia = {}
      for (const ruta of estado.rutas) {
        const contenido = this.gitOpcional(['show', `HEAD:${ruta}`], true)
        if (contenido !== undefined) antes[ruta] = this.conservar(contenido)
        const archivo = this.rutaSegura(ruta)
        if (existsSync(archivo)) despues[ruta] = this.conservar(readFileSync(archivo))
      }
      const turno: Turno = { id: 'global', sessionId, inicio: 0, antes, despues }
      this.globalCache = { clave: estado.revision, archivos: this.rutas(turno).map((ruta) => {
        const archivo = this.diff(turno, ruta)
        // Git aplica los atributos del repo (por ejemplo CRLF en Windows) al comparar con HEAD.
        if (antes[ruta] && !archivo.binario && !archivo.truncado) {
          const patch = this.git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--unified=3', 'HEAD', '--', `:(literal)${ruta}`])
          return this.conPatch(archivo, patch)
        }
        return archivo
      }) }
    }
    return { ronda, historial, globales: this.globalCache.archivos, git: { rama: estado.rama, remoto: estado.remoto, destino: estado.destino, revision: estado.revision, ocupado: this.gitOcupado, conflictos: estado.conflictos } }
  }

  /** Sin shell ni force push. Se revisan de nuevo los archivos que el usuario vio antes de guardar. */
  async guardarGit(operacion: 'commit' | 'commit-push' | 'push' | 'auto', mensaje: string, revision: string, documentar?: () => Promise<string>): Promise<ResultadoGitSloth> {
    if (this.gitOcupado || this.turnos.some((t) => !t.fin)) throw new Error('Sloth sigue trabajando. Espera a que termine antes de usar Git.')
    const estado = this.estadoGit()
    if (revision !== estado.revision) throw new Error('Los cambios globales cambiaron. Revisa la lista actualizada y vuelve a intentarlo.')
    if (!estado.rama) throw new Error('El repo no está en una rama. Cámbiala antes de usar este botón.')
    if (estado.conflictos) throw new Error('Hay conflictos de Git pendientes de resolver.')
    const hacerCommit = operacion !== 'push'
    if (hacerCommit && operacion !== 'auto' && (!mensaje.trim() || mensaje.length > 1000)) throw new Error('Escribe un mensaje de commit de entre 1 y 1000 caracteres.')
    if (hacerCommit && !estado.rutas.length) throw new Error('No hay cambios globales para hacer commit.')
    if (operacion !== 'commit' && (!estado.remoto || !estado.destino)) throw new Error('La rama no tiene un remoto de push configurado.')
    this.gitOcupado = true
    let commit: string | undefined
    try {
      if (operacion === 'auto') {
        if (!documentar) throw new Error('No está disponible la redacción automática.')
        mensaje = (await documentar()).trim()
        if (!mensaje || mensaje.length > 12_000 || mensaje.includes('\0')) throw new Error('La documentación automática no es válida.')
        if (this.estadoGit().revision !== estado.revision) throw new Error('Los cambios globales cambiaron durante la documentación. No se hizo commit ni push; vuelve a pulsar Auto.')
      }
      if (hacerCommit) {
        for (const ruta of estado.rutas) this.rutaSegura(ruta)
        const rutas = estado.rutas.join('\0') + '\0'
        await this.gitAsync(['add', '--all', '--pathspec-from-file=-', '--pathspec-file-nul'], rutas)
        // --only evita incluir cualquier archivo preparado que no figure en la revisión global.
        const archivoMensaje = join(this.dir, 'mensaje-commit.txt')
        guardar(archivoMensaje, mensaje.trim())
        await this.gitAsync(['commit', '--only', '--file', archivoMensaje, '--pathspec-from-file=-', '--pathspec-file-nul'], rutas)
        commit = this.git(['rev-parse', 'HEAD']).trim()
      }
      if (operacion !== 'commit') {
        try {
          await this.gitAsync(['push', '--porcelain', '--set-upstream', estado.remoto!, `HEAD:${estado.destino!}`])
        } catch (error) {
          if (!commit) throw error
          return { commit, push: false, mensaje: hacerCommit ? mensaje.trim() : undefined, errorPush: error instanceof Error ? error.message : String(error) }
        }
      }
      return { commit, push: operacion !== 'commit', mensaje: hacerCommit ? mensaje.trim() : undefined }
    } finally { this.gitOcupado = false }
  }

  private estadoGit() {
    const estado = this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']).split('\0').filter(Boolean)
    const conflictos = estado.some((s) => ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(s.slice(0, 2)))
    const rutas = estado.map((s) => s.slice(3)).filter((r) => !/^(data|node_modules)(\/|$)/.test(r)).sort()
    const head = this.gitOpcional(['rev-parse', '--verify', 'HEAD'])?.toString().trim() ?? ''
    const rama = this.gitOpcional(['symbolic-ref', '--short', 'HEAD'])?.toString().trim() ?? ''
    const remotos = this.git(['remote']).trim().split('\n').filter(Boolean)
    const configurado = (rama ? this.gitOpcional(['config', '--get', `branch.${rama}.pushRemote`])?.toString().trim() : undefined)
      || this.gitOpcional(['config', '--get', 'remote.pushDefault'])?.toString().trim()
      || (rama ? this.gitOpcional(['config', '--get', `branch.${rama}.remote`])?.toString().trim() : undefined)
    const remoto = configurado && configurado !== '.' ? configurado : remotos.includes('origin') ? 'origin' : remotos.length === 1 ? remotos[0] : undefined
    const destino = (rama ? this.gitOpcional(['config', '--get', `branch.${rama}.merge`])?.toString().trim() : undefined) || (rama ? `refs/heads/${rama}` : undefined)
    const contenido = rutas.map((ruta) => {
      const archivo = this.rutaSegura(ruta)
      return [ruta, existsSync(archivo) ? this.huella(readFileSync(archivo)) : null]
    })
    const destinoRemoto = remoto ? this.gitOpcional(['remote', 'get-url', '--push', '--all', remoto])?.toString().trim() : undefined
    const revision = this.huella(Buffer.from(JSON.stringify({ head, rama, remoto, destino, destinoRemoto, estado, contenido })))
    return { rutas, rama, remoto, destino, conflictos, revision }
  }

  private gitOpcional(args: string[], binario = false): Buffer | undefined {
    const r = spawnSync('git', args, { cwd: this.app, windowsHide: true, timeout: 15_000, maxBuffer: 16 * 1024 * 1024 })
    if (r.error) throw r.error
    if (r.status !== 0) return undefined
    return binario ? r.stdout : Buffer.from(r.stdout.toString('utf8'))
  }

  private gitAsync(args: string[], input?: string): Promise<string> {
    return new Promise((ok, fail) => {
      const child = execFile('git', args, { cwd: this.app, windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_LITERAL_PATHSPECS: '1', GIT_TERMINAL_PROMPT: '0' } }, (error, stdout, stderr) => {
        if (error) fail(new Error(stderr.trim() || stdout.trim() || error.message))
        else ok(stdout)
      })
      child.stdin?.on('error', () => {})
      child.stdin?.end(input)
    })
  }

  iniciar(sessionId: string, inicio: number) {
    this.comprobarInicio(sessionId)
    if (this.turnos.some((t) => !t.fin && t.sessionId === sessionId)) return
    this.turnos.push({ id: randomUUID(), sessionId, inicio, antes: this.mirar() })
    this.guardar()
  }

  terminar(sessionId: string) {
    const turno = this.turnos.find((t) => !t.fin && t.sessionId === sessionId)
    if (!turno) return
    turno.despues = this.mirar()
    turno.fin = Date.now()
    this.enVuelo.delete(sessionId)
    this.fondo.delete(sessionId)
    this.guardar()
    this.guardarDuenos()
  }

  /** Si algún turno abierto coincidió con otro hilo: solo entonces hace falta mirar el repo a cada herramienta. */
  private vigilando() {
    return this.turnos.some((t) => !t.fin && this.aLaVez(t).length > 0)
  }

  /**
   * Copia el repo y reparte lo que cambió desde la última vez. Con un solo turno abierto es suyo; con varios, del único
   * que trabajaba, o compartido. Tras un reinicio no se sabe quién trabajaba: se compara con el último turno abierto.
   */
  private mirar(): Copia {
    const nueva = this.capturar()
    const abiertos = this.turnos.filter((t) => !t.fin)
    const base = this.ultima ?? abiertos.at(-1)?.antes
    this.ultima = nueva
    if (!base || !abiertos.length) return nueva
    const cambiadas = [...new Set([...Object.keys(base), ...Object.keys(nueva)])].filter((r) => base[r] !== nueva[r])
    if (!cambiadas.length) return nueva
    const trabajan = abiertos.filter((t) => this.trabaja(t.sessionId))
    const [campo, turnos]: ['propias' | 'compartidas', Turno[]] = abiertos.length === 1 ? ['propias', abiertos]
      : trabajan.length === 1 ? ['propias', trabajan] : ['compartidas', trabajan.length ? trabajan : abiertos]
    for (const t of turnos) t[campo] = [...new Set([...t[campo] ?? [], ...cambiadas])]
    this.guardarDuenos()
    return nueva
  }

  private guardarDuenos() {
    const abiertos = this.turnos.filter((t) => !t.fin && (t.propias || t.compartidas))
    guardar(this.duenos, JSON.stringify(Object.fromEntries(abiertos.map((t) => [t.id, { propias: t.propias, compartidas: t.compartidas }]))))
  }

  listar(sessionId: string): CambioSloth[] {
    return this.turnos.filter((t) => t.sessionId === sessionId && t.despues)
      .map((t) => ({ id: t.id, inicio: t.inicio, revertido: !!t.revertido, archivos: this.archivos(t) }))
      .filter((t) => t.archivos.length > 0).reverse()
  }

  revertir(sessionId: string, id: string) {
    if (this.gitOcupado || this.turnos.some((t) => !t.fin)) throw new Error('Sloth sigue trabajando. Espera a que termine o detenlo antes de revertir.')
    const turno = this.turnos.find((t) => t.id === id && t.sessionId === sessionId)
    if (!turno?.despues) throw new Error('No existe ese cambio terminado.')
    if (turno.revertido) throw new Error('Este cambio ya se revirtió.')
    const rutas = this.propias(turno)
    // Lo que otro hilo cambió a la vez, revertirlo también desharía lo suyo.
    const ajenas = new Set([...turno.compartidas ?? [], ...this.aLaVez(turno).flatMap((o) => this.propias(o))])
    const comun = rutas.find((r) => ajenas.has(r))
    if (comun) throw new Error(`Otro hilo también cambió ${comun} mientras tanto. No se revirtió ningún archivo.`)
    // Preparar todo antes de escribir; nunca dejar una reversión parcial por un conflicto conocido.
    const preparados = rutas.map((ruta) => {
      const archivo = this.rutaSegura(ruta)
      const actual = existsSync(archivo) ? this.huella(readFileSync(archivo)) : undefined
      if (actual !== turno.despues![ruta]) throw new Error(`${ruta} cambió después de este turno. No se revirtió ningún archivo.`)
      return { archivo, contenido: turno.antes[ruta] ? readFileSync(join(this.objetos, turno.antes[ruta])) : undefined }
    })
    try {
      for (const p of preparados) this.reponer(p.archivo, p.contenido)
      turno.revertido = true
      this.guardar()
    } catch (error) {
      turno.revertido = false
      // Una escritura fallida también devuelve los archivos que alcanzaron a cambiar a su estado posterior.
      for (const ruta of rutas) {
        const hash = turno.despues[ruta]
        this.reponer(this.rutaSegura(ruta), hash ? readFileSync(join(this.objetos, hash)) : undefined)
      }
      throw error
    }
    return this.listar(sessionId)
  }

  /**
   * Copia el repo al empezar y al acabar cada turno. Leer y comprobar todos los archivos tardaba medio segundo, con el
   * servidor parado, entre «Enviar» y abrir el hilo: un archivo con el mismo tamaño y las mismas fechas que en la copia
   * anterior conserva su huella, y solo se leen los que cambiaron.
   */
  private capturar(): Copia {
    const listado = this.git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    const copia: Copia = {}
    const vistos = new Map<string, Visto>()
    let leidos = 0
    for (const ruta of new Set(listado.split('\0').filter(Boolean))) {
      // Las copias nunca se copian a sí mismas, aunque un turno modifique .gitignore.
      if (/^(data|node_modules)(\/|$)/.test(ruta)) continue
      let s
      try { s = lstatSync(resolve(this.app, ruta)) } catch { continue }
      if (s.isSymbolicLink()) throw new Error(`No se puede guardar o revertir un enlace: ${ruta}`)
      const firma = `${s.size}:${s.mtimeMs}:${s.ctimeMs}:${s.ino}`
      const antes = this.vistos.get(ruta)
      const hash = antes?.firma === firma ? antes.hash : (leidos++, this.conservar(readFileSync(this.rutaSegura(ruta))))
      vistos.set(ruta, { firma, hash })
      copia[ruta] = hash
    }
    const cambio = leidos > 0 || vistos.size !== this.vistos.size
    this.vistos = vistos
    if (cambio) {
      try { guardar(this.vistosGuardados, JSON.stringify(Object.fromEntries(vistos))) }
      catch { /* Sin guardarlos, el próximo reinicio vuelve a leerlo todo. */ }
    }
    return copia
  }

  /** Tras un reinicio, la primera copia lee el repo entero: se hace antes de que nadie mande nada. */
  calentar() {
    try { this.capturar() } catch { /* La del turno lo vuelve a intentar y dice qué falló. */ }
  }

  private rutaSegura(ruta: string): string {
    const archivo = resolve(this.app, ruta)
    const rel = relative(this.app, archivo)
    if (!rel || isAbsolute(rel) || rel.startsWith('..') || /(^|[\\/])\.git([\\/]|$)/.test(rel)) throw new Error('Ruta de cambio inválida.')
    // No seguir enlaces al restaurar, ni en el archivo ni en una carpeta de su ruta.
    for (let p = archivo; p !== resolve(this.app); p = dirname(p)) {
      if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw new Error(`No se puede guardar o revertir un enlace: ${ruta}`)
    }
    if (existsSync(archivo) && relative(realpathSync(this.app), realpathSync(archivo)).startsWith('..')) throw new Error('La ruta sale de la app.')
    return archivo
  }

  private rutas(t: Turno) {
    return [...new Set([...Object.keys(t.antes), ...Object.keys(t.despues ?? {})])].filter((r) => t.antes[r] !== t.despues?.[r]).sort()
  }

  /** Los turnos de otros hilos que trabajaron a la vez que este. */
  private aLaVez(t: Turno) {
    return this.turnos.filter((o) => o.sessionId !== t.sessionId && o.inicio < (t.fin ?? Infinity) && t.inicio < (o.fin ?? Infinity))
  }

  /** Lo que cambió en el turno, sin lo que cambió otro hilo que trabajaba a la vez. */
  private propias(t: Turno) {
    if (!this.aLaVez(t).length) return this.rutas(t)
    const suyas = new Set([...t.propias ?? [], ...t.compartidas ?? []])
    return this.rutas(t).filter((r) => suyas.has(r))
  }

  private archivos(t: Turno) {
    return this.propias(t).map((ruta) => {
      let archivo = this.diffs.get(`${t.id}:${ruta}`)
      if (!archivo) this.diffs.set(`${t.id}:${ruta}`, archivo = this.diff(t, ruta))
      return archivo
    })
  }

  private diff(t: Turno, ruta: string): ArchivoCambiado {
    const antes = t.antes[ruta], despues = t.despues![ruta]
    const viejo = antes ? readFileSync(join(this.objetos, antes)) : Buffer.alloc(0)
    const nuevo = despues ? readFileSync(join(this.objetos, despues)) : Buffer.alloc(0)
    const tipo = !antes ? 'nuevo' : !despues ? 'eliminado' : 'modificado'
    const binario = viejo.includes(0) || nuevo.includes(0)
    if (binario || viejo.length + nuevo.length > 1_000_000) return { ruta, tipo, sumadas: 0, quitadas: 0, diff: '', binario, truncado: !binario }
    const vacio = join(this.dir, 'vacio')
    if (!existsSync(vacio)) writeFileSync(vacio, '')
    const patch = this.git(['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--no-textconv', '--unified=3', antes ? join(this.objetos, antes) : vacio, despues ? join(this.objetos, despues) : vacio], true)
    return this.conPatch({ ruta, tipo, sumadas: 0, quitadas: 0, diff: '', binario: false, truncado: false }, patch)
  }

  private conPatch(archivo: ArchivoCambiado, patch: string): ArchivoCambiado {
    const lineas = patch.slice(Math.max(0, patch.indexOf('@@'))).split('\n')
    const sumadas = lineas.filter((l) => l.startsWith('+')).length
    const quitadas = lineas.filter((l) => l.startsWith('-')).length
    return { ...archivo, sumadas, quitadas, diff: patch.includes('@@') ? lineas.slice(0, 400).join('\n') : '', truncado: lineas.length > 400 }
  }

  private git(args: string[], diff = false) {
    const r = spawnSync('git', args, { cwd: this.app, encoding: 'utf8', windowsHide: true, timeout: 15_000, maxBuffer: 8 * 1024 * 1024 })
    if (r.error || (r.status !== 0 && !(diff && r.status === 1))) throw new Error(r.error?.message ?? r.stderr.trim() ?? 'No se pudo leer Git.')
    return r.stdout
  }

  private huella(contenido: Buffer) { return createHash('sha256').update(contenido).digest('hex') }
  private conservar(contenido: Buffer) {
    const hash = this.huella(contenido)
    if (!existsSync(join(this.objetos, hash))) writeFileSync(join(this.objetos, hash), contenido)
    return hash
  }
  private guardar() { guardar(this.estado, JSON.stringify(this.turnos)) }
  private reponer(archivo: string, contenido?: Buffer) {
    if (contenido === undefined) { if (existsSync(archivo)) unlinkSync(archivo); return }
    mkdirSync(dirname(archivo), { recursive: true })
    const temporal = `${archivo}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporal, contenido)
      renameSync(temporal, archivo)
    } finally {
      if (existsSync(temporal)) unlinkSync(temporal)
    }
  }
}
