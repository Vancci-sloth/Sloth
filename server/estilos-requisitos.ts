import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, matchesGlob } from 'node:path'
import { type Card, FASES } from '../shared/types.ts'

/**
 * Lo que Sloth comprueba solo de «Lo que necesita todo estilo» (`skills/video-base/ESTILO.md`), la vara con que un estilo
 * se hace, se comparte y se aprueba. Cada falla lleva el número de su requisito allá: un test los empareja, y otro pasa
 * por aquí los estilos de Sloth, que son la referencia.
 *
 * Mira sin leer lo que el estilo hace, así que nada de lo que traiga escrito lo convence:
 * - `fallas`: lo que no cumple. Se le dice a su autor al compartirlo (`CompartirEstilo`) y, mientras haya una, no se
 *   aprueba aunque quien lo lea diga que sí (`server/estilos-revision.ts`).
 * - `riesgos`: las líneas que se conectan a internet, lanzan otros programas, arman código al vuelo, leen lo del usuario
 *   o borran archivos. Casi todo estilo las tiene, heredadas del de Sloth del que partió: solo cuentan **las que añadió
 *   su autor** (`nuevas`). Con alguna, no se aprueba solo: lo decide el creador.
 * - `frente`: qué cambió frente al estilo de Sloth del que partió, para que quien lo lee empiece por ahí.
 */

export interface Falla {
  /** El número del requisito en `ESTILO.md`. */
  id: number
  texto: string
}

export interface Frente {
  de: string
  iguales: number
  cambiados: string[]
  nuevos: string[]
}

export interface Comprobado {
  fallas: Falla[]
  riesgos: string[]
  frente?: Frente
}

/**
 * Los requisitos de `ESTILO.md` que comprueba Sloth. Cuatro no se miran aquí: el 5 (qué archivos viajan y cuánto pesan)
 * lo hace el paquete (`server/estilos.ts`); y el 10 (su guía de uso), el 29 (su video entero) y el 30 (su prueba), que
 * van en su publicación y no en su carpeta, «Compartir» y la comunidad, que no publica sin ellos (`faltaEnEstilo` en
 * `shared/guia.ts`).
 */
export const COMPRUEBA = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 19, 20, 21, 29, 30]
export const FUERA_DE_AQUI = [5, 10, 29, 30]

const TEXTO = /\.(md|txt|json|py|mjs|cjs|js|ts|tsx|jsx|css|html|svg|ps1|sh|yml|yaml|csv)$/i
const SCRIPT = /\.(py|mjs|cjs|js|ts|tsx|jsx|ps1|sh)$/i
const CONSOLA = /\.(ps1|sh)$/i
/** Lo que una etapa «Video» no puede dar por terminado (lo mismo que `server/reglas-repo.test.ts` pide a las de Sloth). */
const A_MEDIAS = ['out/borrador-a.mp4', 'out/render-1.mp4', 'out/_parte.mp4', 'out/partes/p1.mp4', 'out/borrador.mp4']
const RUTA_DE_ALGUIEN = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'`<>]+|\/(?:Users|home)\/[^/\s"'`<>]+\//
const LLAVE_DE_ALGUIEN = /\b(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/
const INSTALA = /\bpip3? install\b|\bnpm (?:install|i) +[a-z@]/
const DE_LA_BASE = /video-base\/([\w./-]+\.[a-z0-9]+)/gi
/** Lo que, añadido por su autor, pide que lo vea una persona. */
const SENALES: [RegExp, string][] = [
  [/\b(requests|urllib|httpx|aiohttp|socket|ftplib|smtplib)\b|\bhttp\.client\b|\bfetch\(|\bXMLHttpRequest\b|\bWebSocket\b|\bhttps?\.(get|request)\(|\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/, 'se conecta a internet'],
  [/\bsubprocess\b|\bos\.(system|popen|exec\w*|spawn\w*)\b|\bchild_process\b|\b(execSync|spawnSync|execFile\w*|spawn)\(|\bStart-Process\b/, 'lanza otros programas'],
  [/\beval\(|\bexec\(|\bnew Function\(|\b__import__\(|\bcompile\(|\bb64decode\b|\batob\(|\bfromCharCode\b|\bimportlib\b/, 'arma código al vuelo'],
  [/\bos\.environ\b|\bprocess\.env\b|\$env:|\bgetenv\(|\bexpanduser\(|\bPath\.home\(|\bhomedir\(|\bAPPDATA\b|\.ssh\b|\.aws\b|\bkeyring\b|\bcredential|\bcookies?\b/i, 'lee lo de tu usuario'],
  [/\b(rmtree|unlink|rmdir|removedirs|rmSync|unlinkSync|Remove-Item)\b|\bos\.remove\(|\brm -rf?\b/, 'borra archivos']
]

const juntas = (rutas: string[]) => (rutas.length > 4 ? `${rutas.slice(0, 4).join(', ')} y ${rutas.length - 4} más` : rutas.join(', '))

/**
 * Comprueba un estilo: su card, sus archivos (por su ruta dentro de su carpeta) y esta Sloth (`base` es su video-base;
 * `deSloth`, sus estilos). `npm`: los paquetes que pide y Sloth no trae (`ajenos` de `server/estilos.ts`).
 */
export function comprobar(o: {
  id: string
  card: Partial<Card>
  basadoEn?: string
  archivos: Map<string, Buffer>
  base: string
  deSloth: { skill: string; carpeta: string }[]
  npm?: string[]
}): Comprobado {
  const { card, archivos } = o
  const fallas: Falla[] = []
  const falla = (id: number, texto: string) => fallas.push({ id, texto })
  const textos = [...archivos].filter(([r]) => TEXTO.test(r)).map(([r, b]) => [r, b.toString('utf8')] as const)

  // El estilo de Sloth del que partió: lo que sigue igual que allá es de Sloth, no de su autor.
  const origen = o.deSloth.find((s) => s.skill === o.basadoEn)
  const original = (ruta: string): Buffer | undefined => {
    const p = origen && join(origen.carpeta, ...ruta.split('/'))
    return p && existsSync(p) && statSync(p).isFile() ? readFileSync(p) : undefined
  }
  /** Las líneas de un archivo que no están en el original, ni con el nombre del original cambiado por el suyo (lo que hace «Nuevo estilo» al copiarlo). */
  const nuevas = (ruta: string, texto: string): { n: number; linea: string }[] => {
    const antes = original(ruta)?.toString('utf8') ?? ''
    const ya = new Set([antes, origen ? antes.replaceAll(origen.skill, o.id) : ''].flatMap((t) => t.split(/\r?\n/).map((l) => l.trim())))
    return texto.split(/\r?\n/).flatMap((linea, i) => (linea.trim() && !ya.has(linea.trim()) ? [{ n: i + 1, linea }] : []))
  }
  const suyas = textos.map(([ruta, texto]) => [ruta, nuevas(ruta, texto)] as const)
  /** Los archivos donde alguna línea de su autor coincide. */
  const donde = (re: RegExp, solo?: RegExp) => juntas(suyas.filter(([r, ls]) => (!solo || solo.test(r)) && ls.some((l) => re.test(l.linea))).map(([r]) => r))

  // Su carpeta.
  const skill = archivos.get('SKILL.md')?.toString('utf8') ?? ''
  const cabeza = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1] ?? ''
  const nombre = /^name:\s*(.+)$/m.exec(cabeza)?.[1].trim()
  if (nombre !== o.id) falla(1, `Su SKILL.md tiene que empezar con \`name: ${o.id}\`, el nombre de su carpeta${nombre ? ` (dice \`${nombre}\`)` : ''}.`)
  else if (!/^description:\s*\S/m.test(cabeza)) falla(1, 'Su SKILL.md no lleva `description`: sin ella el agente no sabe cuándo usarlo.')
  const otras = o.deSloth.map((s) => s.skill).concat('crear-estilo').filter((s) => s !== o.id)
  const deOtra = otras.flatMap((s) => {
    const en = donde(new RegExp(`[\\\\/]${s}\\b|\\b${s}[\\\\/]`))
    return en ? [`${s} (en ${en})`] : []
  })
  if (deOtra.length) falla(3, `Usa archivos de otra skill: ${deOtra.join('; ')}. Todo lo suyo va en su carpeta o en video-base.`)
  const copias = [...archivos].filter(([r, b]) => {
    const suyo = join(o.base, 'scripts', r.split('/').at(-1)!)
    return SCRIPT.test(r) && existsSync(suyo) && statSync(suyo).isFile() && readFileSync(suyo).equals(b)
  })
  if (copias.length) falla(4, `Copia scripts de video-base (${juntas(copias.map(([r]) => r))}): se usan desde video-base, no se llevan.`)
  const faltan = [...new Set(textos.flatMap(([, t]) => [...t.matchAll(DE_LA_BASE)].map((m) => m[1])))].filter((a) => !a.includes('..') && !existsSync(join(o.base, ...a.split('/'))))
  if (faltan.length) falla(4, `Nombra de video-base lo que no existe en esta Sloth: ${juntas(faltan)}.`)

  // Su card.
  if (!String(card.description ?? '').trim()) falla(6, 'Su card no dice qué video hace (`description`).')
  if (!/^\d+\.\d+$/.test(card.version ?? '')) falla(6, 'Su card no lleva `version` (como "1.0").')
  if (/\p{Extended_Pictographic}/u.test(card.icon ?? '')) falla(6, 'El `icon` de su card es un emoji: va uno de trazo, de los de Sloth.')
  const etapas = card.etapas ?? []
  const fases = FASES.map((f) => f.id as string)
  if (!etapas.length) falla(7, 'Su card no tiene `etapas`: en el estudio no se vería cómo va el video.')
  else {
    const sinFase = etapas.filter((e) => !fases.includes(e.fase ?? ''))
    if (sinFase.length) falla(7, `Estas etapas no dicen su \`fase\` (${fases.join(', ')}): ${sinFase.map((e) => e.nombre).join(', ')}.`)
    const video = etapas.find((e) => e.nombre === 'Video' && e.fase === 'video')
    if (!video) falla(8, 'Le falta la etapa «Video», de la fase `video`: de ella salen sus videos terminados en «Mis videos».')
    else if (!/mp4/i.test(video.listo)) falla(8, `El \`listo\` de su etapa «Video» (${video.listo}) no es un MP4.`)
    else if (A_MEDIAS.some((r) => matchesGlob(r, video.listo))) falla(8, `El \`listo\` de su etapa «Video» (${video.listo}) cuenta los borradores como terminados: usa \`out/!(render*|borrador*|_*).mp4\` o el nombre exacto.`)
    if (!etapas.some((e) => e.fase === 'entrega')) falla(9, 'Le falta la etapa de su portada, de la fase `entrega`.')
  }
  if (!o.basadoEn) falla(11, 'Su card no dice de qué estilo de Sloth partió (`basadoEn`): sin eso no se le instalan sus paquetes de Python.')
  else if (!origen) falla(11, `Su \`basadoEn\` (${o.basadoEn}) no es un estilo de Sloth.`)

  // El video que hace.
  if (!skill.includes('Carpeta:')) falla(12, 'Su SKILL.md no dice que el proyecto va en la carpeta de la línea `Carpeta:` del mensaje: el estudio lo busca ahí.')
  if (!skill.includes('Formato: horizontal')) falla(13, 'Su SKILL.md no dice qué hace con «Formato: horizontal»: todo estilo hace vertical y horizontal.')
  if (!/portada/i.test(skill)) falla(14, 'Su SKILL.md no dice cómo es su portada: todo video la lleva.')

  // En la computadora de cualquiera.
  const rutas = donde(RUTA_DE_ALGUIEN)
  if (rutas) falla(18, `Nombra carpetas de tu computadora en ${rutas}: en la de otra persona no existen.`)
  const llaves = donde(LLAVE_DE_ALGUIEN)
  if (llaves) falla(19, `Parece llevar una llave o un token tuyo en ${llaves}: quítalo, que lo vería quien lo instale.`)
  const consola = [...archivos].filter(([r, b]) => CONSOLA.test(r) && !original(r)?.equals(b)).map(([r]) => r)
  if (consola.length) falla(20, `Trae scripts de consola (${juntas(consola)}): los .ps1 solo corren en Windows y los .sh, en Mac y Linux. Lo que corre va en Python o Node.`)
  // En una guía puede decir justo que no se instala nada: solo cuenta en los scripts.
  const instala = donde(INSTALA, SCRIPT)
  if (instala) falla(21, `Instala paquetes por su cuenta en ${instala}: un estilo solo usa lo que Sloth ya trae.`)
  if (o.npm?.length) falla(21, `Pide paquetes de npm que Sloth no trae (${o.npm.join(', ')}).`)

  const riesgos = suyas
    .filter(([r]) => SCRIPT.test(r))
    .flatMap(([r, ls]) => ls.flatMap((l) => SENALES.filter(([re]) => re.test(l.linea)).map(([, que]) => `${r}:${l.n} ${que}: ${l.linea.trim().slice(0, 110)}`)))

  const rutasSuyas = [...archivos.keys()]
  const frente = origen && {
    de: origen.skill,
    iguales: rutasSuyas.filter((r) => original(r)?.equals(archivos.get(r)!)).length,
    cambiados: rutasSuyas.filter((r) => original(r) && !original(r)!.equals(archivos.get(r)!)),
    nuevos: rutasSuyas.filter((r) => !original(r))
  }
  return { fallas, riesgos, ...(frente ? { frente } : {}) }
}
