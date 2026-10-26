/**
 * El relevo CDP del navegador integrado (`navegador.ts`): a Playwright, que se conecta como a un Chrome con
 * `connectOverCDP`, le enseña un navegador con una sola página, la del hilo, y lo de esa página se lo pasa a su depurador.
 * Electron deja un solo cliente de depuración por página: todas las conexiones comparten el de `navegador.ts`.
 * Sale del de T3 Code (`apps/desktop/src/preview/CdpRelay.ts`, MIT).
 */

/** La página del hilo, vista desde el relevo. */
export interface PaginaDelRelevo {
  /** Un comando a su depurador; con `sesion`, a uno de sus marcos o workers. */
  enviar(metodo: string, params: Record<string, unknown>, sesion?: string): Promise<unknown>
  /** Su id en CDP: Playwright lo usa para su marco principal. */
  id(): Promise<string>
  url(): string
  titulo(): string
  agente(): string
  /** Dónde guardar lo que baje el agente (`null`: que no baje nada). */
  descargas(carpeta: string | null): void
}

export interface Relevo {
  /** Un mensaje de Playwright. */
  recibir(texto: string): void
  /** Un evento del depurador de la página. */
  evento(metodo: string, params: unknown, sesion?: string): void
}

interface Comando {
  id: number
  method: string
  params?: Record<string, unknown>
  sessionId?: string
}

const esComando = (v: unknown): v is Comando =>
  typeof v === 'object' && v !== null && typeof (v as Comando).id === 'number' && typeof (v as Comando).method === 'string'

const CONTEXTO = 'sloth'
const SESION_PAGINA = 'sloth-pagina'
/** Lo que se contesta con un `{}`: en un navegador de una sola página no hay nada que hacer. */
const SIN_EFECTO = new Set(['Target.setDiscoverTargets', 'Browser.grantPermissions', 'Browser.resetPermissions', 'Browser.cancelDownload'])
/** Lo que se contesta y además anuncia la página (`Target.attachedToTarget`), después de la respuesta. */
const ANUNCIO = Symbol('anuncio')

export function crearRelevo(pagina: PaginaDelRelevo, escribir: (texto: string) => void): Relevo {
  const mandar = (m: Record<string, unknown>) => escribir(JSON.stringify(m))
  let unida = false
  // Las sesiones que inventa el relevo. Las de página (las de `newCDPSession` también) van todas a la única sesión real,
  // y cada una recibe sus eventos; cualquier otro id es de la página misma: un iframe o un worker.
  const sesiones = new Map<string, 'navegador' | 'pagina'>([[SESION_PAGINA, 'pagina']])
  let n = 0
  const nueva = (tipo: 'navegador' | 'pagina') => {
    const id = `sloth-${tipo}-${++n}`
    sesiones.set(id, tipo)
    return id
  }
  const info = async () => ({
    targetId: await pagina.id(),
    type: 'page',
    title: pagina.titulo(),
    url: pagina.url(),
    attached: true,
    canAccessOpener: false,
    browserContextId: CONTEXTO
  })

  async function delNavegador(c: Comando): Promise<unknown> {
    if (SIN_EFECTO.has(c.method)) return {}
    switch (c.method) {
      case 'Browser.setDownloadBehavior': {
        const carpeta = c.params?.downloadPath
        pagina.descargas(c.params?.behavior !== 'deny' && typeof carpeta === 'string' ? carpeta : null)
        const { browserContextId: _, ...params } = c.params ?? {}
        return pagina.enviar('Browser.setDownloadBehavior', params)
      }
      case 'Browser.getVersion':
        return { protocolVersion: '1.3', product: 'Electron', revision: '', userAgent: pagina.agente(), jsVersion: '' }
      // Las cookies del navegador son las del perfil de la página: `context.request` de Playwright las lee y las guarda así.
      case 'Storage.getCookies':
        return pagina.enviar('Network.getAllCookies', {})
      case 'Storage.setCookies':
        return pagina.enviar('Network.setCookies', { cookies: c.params?.cookies ?? [] })
      case 'Storage.clearCookies':
        return pagina.enviar('Network.clearBrowserCookies', {})
      case 'Target.getTargetInfo':
        return { targetInfo: { targetId: 'navegador', type: 'browser', title: '', url: '', attached: true, canAccessOpener: false } }
      case 'Target.getBrowserContexts':
        return { browserContextIds: [] }
      case 'Target.getTargets':
        return { targetInfos: [await info()] }
      case 'Target.attachToBrowserTarget':
        return { sessionId: nueva('navegador') }
      case 'Target.attachToTarget':
        if (c.params?.targetId !== (await pagina.id())) throw new Error('Este navegador solo tiene la página del hilo.')
        return { sessionId: nueva('pagina') }
      case 'Target.detachFromTarget': {
        const id = c.params?.sessionId
        if (typeof id === 'string' && id !== SESION_PAGINA) sesiones.delete(id)
        return {}
      }
      case 'Target.setAutoAttach':
        if (unida) return {}
        unida = true
        return { [ANUNCIO]: { method: 'Target.attachedToTarget', params: { sessionId: SESION_PAGINA, targetInfo: await info(), waitingForDebugger: false } } }
      default:
        throw new Error(`El navegador del hilo no tiene ${c.method}: solo es una página.`)
    }
  }

  function deLaPagina(c: Comando): Promise<unknown> {
    const hija = sesiones.get(c.sessionId!) === 'pagina' ? undefined : c.sessionId
    // La página ya corre; sus marcos hijos no: Playwright se une a ellos con `waitForDebuggerOnStart`, y Chromium los
    // detiene hasta que esto les llega. Tragárselo dejaba congelados los captchas y los inicios de sesión de otro sitio.
    if (c.method === 'Runtime.runIfWaitingForDebugger' && hija === undefined) return Promise.resolve({})
    return pagina.enviar(c.method, c.params ?? {}, hija)
  }

  return {
    recibir(texto) {
      let c: unknown
      try {
        c = JSON.parse(texto)
      } catch {
        return
      }
      if (!esComando(c)) return
      const ruta = c.sessionId === undefined ? {} : { sessionId: c.sessionId }
      const resultado = c.sessionId === undefined || sesiones.get(c.sessionId) === 'navegador' ? delNavegador(c) : deLaPagina(c)
      // Cada respuesta sale cuando su comando acaba, como en Chromium: una captura lenta no detiene a las de detrás.
      resultado.then(
        (valor) => {
          const anuncio = typeof valor === 'object' && valor !== null && ANUNCIO in valor ? (valor as { [ANUNCIO]: Record<string, unknown> })[ANUNCIO] : undefined
          mandar({ id: c.id, result: anuncio ? {} : (valor ?? {}), ...ruta })
          if (anuncio) mandar(anuncio)
        },
        (error: unknown) => mandar({ id: c.id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) }, ...ruta })
      )
    },
    evento(metodo, params, sesion) {
      if (!unida) return
      // Las descargas son del navegador: Playwright las escucha en su sesión raíz.
      if (metodo.startsWith('Browser.download')) return mandar({ method: metodo, params })
      // Electron da los eventos de la página misma con la sesión vacía.
      if (sesion) return mandar({ method: metodo, params, sessionId: sesion })
      for (const [id, tipo] of sesiones) if (tipo === 'pagina') mandar({ method: metodo, params, sessionId: id })
    }
  }
}
