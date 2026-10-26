/**
 * Anclar Sloth a la barra de tareas (el paso de la bienvenida, web/src/Bienvenida.tsx). Windows solo lo pregunta si lo
 * pide la ventana de Sloth, al frente y con su AppUserModelID; pedido desde el instalador o desde una ventana invisible de
 * otro programa, dice que no sin preguntar. En Windows 11 al día se pide con TaskbarManager, que Electron no trae: se llama
 * a Windows con koffi, desde este proceso. En los de antes (Windows 10, 11 hasta 23H2), ayudante.exe hace lo que hacen
 * Edge y Firefox (scripts/ayudante).
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, shell } from 'electron'

/** Lo anclado a la barra de tareas es un acceso en esta carpeta. */
const ANCLADOS = join(process.env.APPDATA ?? '', 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
/** ITaskbarManagerDesktopAppSupportStatics: si está, TaskbarManager sirve a las apps de escritorio. */
const ESCRITORIO = 'CDFEFD63-E879-4134-B9A7-8283F05F9480'
const ESTATICOS = 'DB32AB74-DE52-4FE6-B7B6-95FF9F8395DF' // ITaskbarManagerStatics
const INFO = '00000036-0000-0000-C000-000000000046' // IAsyncInfo
/** Si Windows contesta que no antes de esto, no preguntó: nadie decide tan rápido. */
const SIN_PREGUNTAR = 1500

/** Si Sloth está anclada; `null` fuera de la app instalada en Windows, donde no se ofrece. */
export function anclada(): boolean | null {
  if (!app.isPackaged || process.platform !== 'win32') return null
  let accesos: string[] = []
  try {
    accesos = readdirSync(ANCLADOS).filter((f) => f.toLowerCase().endsWith('.lnk'))
  } catch {
    // Windows crea la carpeta con lo primero que se ancla.
  }
  return accesos.some((f) => {
    try {
      return shell.readShortcutLink(join(ANCLADOS, f)).target.toLowerCase() === process.execPath.toLowerCase()
    } catch {
      return false // un acceso roto de otra app
    }
  })
}

/** Pide anclarla. `windows`: Windows no dejó pedirlo (se anclará a mano). */
export async function anclar(): Promise<'anclada' | 'no' | 'windows'> {
  if (anclada()) return 'anclada'
  const r = await pedir().catch(() => 'windows' as const)
  if (r !== 'sin-api') return r
  return (await ayudante('--anclar').catch(() => 3)) === 0 ? 'anclada' : 'windows'
}

/** TaskbarManager.GetDefault().RequestPinCurrentAppAsync(), por su tabla de métodos. `sin-api`: un Windows de antes. */
async function pedir(): Promise<'anclada' | 'no' | 'windows' | 'sin-api'> {
  const k = require('koffi') as typeof import('koffi')
  const combase = k.load('combase.dll')
  const GUID = k.struct('GUID', { a: 'uint32', b: 'uint16', c: 'uint16', d: k.array('uint8', 8) })
  const guid = (s: string) => {
    const h = s.replace(/-/g, '')
    return { a: parseInt(h.slice(0, 8), 16), b: parseInt(h.slice(8, 12), 16), c: parseInt(h.slice(12, 16), 16), d: [...Buffer.from(h.slice(16), 'hex')] }
  }
  const crearTexto = combase.func('int __stdcall WindowsCreateString(str16 texto, uint32 largo, _Out_ void **cadena)')
  const borrarTexto = combase.func('int __stdcall WindowsDeleteString(void *cadena)')
  const fabrica = combase.func('int __stdcall RoGetActivationFactory(void *clase, const GUID *iid, _Out_ void **fabrica)')
  // Los métodos de un objeto de Windows, por su lugar en la tabla: 0 a 2 son los de COM y 3 a 5 los de WinRT.
  const SALIDA = k.proto('int __stdcall Salida(void *yo, _Out_ void **salida)')
  const SI_NO = k.proto('int __stdcall SiNo(void *yo, _Out_ bool *valor)')
  const NUMERO = k.proto('int __stdcall Numero(void *yo, _Out_ int *valor)')
  const PEDIR = k.proto('int __stdcall Pedir(void *yo, const GUID *iid, _Out_ void **salida)')
  const SOLTAR = k.proto('uint32 __stdcall Soltar(void *yo)')
  const metodo = (yo: unknown, i: number, firma: unknown, ...args: unknown[]): number => k.call(k.decode(k.decode(yo, 'void *'), i * 8, 'void *'), firma as never, yo, ...args)
  const ok = (hr: number) => {
    if (hr < 0) throw new Error(`Windows respondió 0x${(hr >>> 0).toString(16)}`)
  }
  const soltar: unknown[] = []
  const clase = 'Windows.UI.Shell.TaskbarManager'
  const nombre: unknown[] = [null]
  ok(crearTexto(clase, clase.length, nombre))
  try {
    const marca: unknown[] = [null]
    if (fabrica(nombre[0], guid(ESCRITORIO), marca) < 0) return 'sin-api'
    soltar.push(marca[0])
    const estaticos: unknown[] = [null]
    ok(fabrica(nombre[0], guid(ESTATICOS), estaticos))
    soltar.push(estaticos[0])
    const barra: unknown[] = [null]
    ok(metodo(estaticos[0], 6, SALIDA, barra)) // GetDefault
    soltar.push(barra[0])
    const permitido = [false]
    ok(metodo(barra[0], 7, SI_NO, permitido)) // IsPinningAllowed
    if (!permitido[0]) return 'windows'
    const inicio = Date.now()
    const pedido: unknown[] = [null]
    ok(metodo(barra[0], 10, SALIDA, pedido)) // RequestPinCurrentAppAsync
    soltar.push(pedido[0])
    const info: unknown[] = [null]
    ok(metodo(pedido[0], 0, PEDIR, guid(INFO), info))
    soltar.push(info[0])
    // Windows pregunta en su ventana: se mira cada poco si ya contestaste (0 es que sigue esperando).
    const estado = [0]
    while (estado[0] === 0 && Date.now() - inicio < 5 * 60_000) {
      await new Promise((listo) => setTimeout(listo, 150))
      ok(metodo(info[0], 7, NUMERO, estado)) // Status
    }
    const si = [false]
    if (estado[0] === 1) ok(metodo(pedido[0], 8, SI_NO, si)) // GetResults
    if (si[0]) return 'anclada'
    return Date.now() - inicio < SIN_PREGUNTAR ? 'windows' : 'no'
  } finally {
    for (const o of soltar.reverse()) metodo(o, 2, SOLTAR)
    borrarTexto(nombre[0])
  }
}

/** ayudante.exe, con la orden y Sloth.exe: su código de salida. */
function ayudante(orden: string): Promise<number> {
  const exe = join(process.resourcesPath, 'ayudante.exe')
  if (!existsSync(exe)) return Promise.reject(new Error('Sin ayudante'))
  return new Promise((listo, falla) => {
    const p = spawn(exe, [orden, process.execPath], { stdio: 'ignore', windowsHide: true })
    p.on('exit', (codigo) => listo(codigo ?? 3))
    p.on('error', falla)
  })
}
