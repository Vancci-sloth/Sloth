import { markdown } from './markdown'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { enCurso } from '../../shared/etapas'
import type { AgentEvent, Avance, CarpetaDeVideo, FileDraft } from '../../shared/types'
import { api } from './api'
import { Picker } from './Composer'
import { imageUrl } from './Images'
import { buildTimeline } from './items'
import { GenerarVoz } from './Voz' // voz de AI Studio
import './Etapas.css'

/**
 * El avance de la sesión, leído de sus archivos al abrirla y cada vez que el servidor avisa de que cambió su carpeta
 * (`sloth-etapas`, que App reparte desde el WebSocket; sin hilo, al reconectar, es para todos).
 */
export function useAvance(sessionId: string) {
  const [avance, setAvance] = useState<Avance | null>(null)
  const [error, setError] = useState('')
  const last = useRef('')

  useEffect(() => {
    let alive = true
    // Solo cuenta la última lectura: dos avisos seguidos no pueden dejar la vieja encima de la nueva.
    let n = 0
    const read = () => {
      const esta = ++n
      api<Avance>(`/api/sessions/${sessionId}/etapas`)
        .then((a) => {
          if (!alive || esta !== n) return
          // Aunque llegue lo mismo de antes, el error se va: el servidor ya contesta.
          setError('')
          const text = JSON.stringify(a)
          if (text === last.current) return
          last.current = text
          setAvance(a)
        })
        .catch((e) => alive && esta === n && setError(e.message))
    }
    read()
    const aviso = (e: Event) => {
      const id = (e as CustomEvent<string | undefined>).detail
      if (!id || id === sessionId) read()
    }
    addEventListener('sloth-etapas', aviso)
    return () => {
      alive = false
      removeEventListener('sloth-etapas', aviso)
    }
  }, [sessionId])

  useEffect(() => {
    last.current = ''
    setAvance(null)
  }, [sessionId])

  return { avance, error }
}

export type Pasos = ReturnType<typeof usePasos>

/**
 * Lo que se sabe de cada etapa: en cuál va, qué está escribiendo el agente y qué entregó ya el usuario. Es lo que enseña
 * el estudio de video (`Estudio.tsx`). Lo que piensa el agente va en el chat, que en el estudio está siempre a la vista.
 */
export function usePasos(avance: Avance | null, events: AgentEvent[], escritos: FileDraft[], working: boolean) {
  const etapas = avance?.etapas ?? []
  // En cuál va y cuáles se saltó: lo mismo que lee la barra lateral (`shared/etapas.ts`).
  const { current, saltada } = enCurso(etapas)
  const items = useMemo(() => buildTimeline(events), [events])
  // Lo que el agente está escribiendo (con `Write` o con un heredoc en la consola) va a la etapa que enseña ese archivo,
  // hasta que el archivo de verdad lo alcanza. Una ruta relativa es de la carpeta del video, o de la de su card si empieza
  // por el nombre de esa carpeta. Una herramienta que falló no deja nada.
  const folder = (avance?.carpeta ?? '').replaceAll('\\', '/').toLowerCase() + '/'
  const nombre = folder.split('/').at(-2) + '/'
  const writing = etapas.map(() => undefined as string | undefined)
  for (const d of escritos) {
    const path = d.path.replaceAll('\\', '/')
    const relativa = !/^([a-z]:)?\/|^~/i.test(path)
    const ruta = relativa
      ? path.replace(/^\.\//, '').replace(new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), '')
      : path.toLowerCase().startsWith(folder) && path.slice(folder.length)
    if (!ruta) continue
    if (items.some((i) => i.kind === 'tool' && i.key === `tool:${d.id.split('#')[0]}` && i.error)) continue
    const i = etapas.findIndex((e) => e.muestra && globRegex(e.muestra).test(ruta))
    if (i < 0 || etapas[i].archivos.some((a) => a.ruta === ruta && a.t >= d.at)) continue
    writing[i] = d.text
  }
  // Lo que el usuario ya entregó a una etapa que lo esperaba: el último archivo con su extensión que mandó por el chat
  // (o por su zona) desde que acabó la etapa anterior. La etapa no está hecha hasta que el agente lo procesa, pero ya no
  // espera a nadie.
  const recibido = etapas.map((e, i) => {
    if (!e.espera || e.hecha) return undefined
    const ext = /\.\w+$/.exec(e.listo)?.[0]
    const since = etapas[i - 1]?.hechaEn ?? 0
    const file = new RegExp(`[A-Za-z]:\\\\[^"\\n]*?${ext ? ext.replace('.', '\\.') : '\\.\\w+'}(?=["\\s]|$)`, 'i')
    const sent = events.findLast((ev): ev is Extract<AgentEvent, { t: 'user' }> => ev.t === 'user' && ev.at >= since && file.test(ev.text))
    return sent?.text.match(file)?.[0]
  })
  const espera = (i: number) => !!etapas[i].espera && !etapas[i].hecha && !recibido[i]
  const state = (i: number) =>
    etapas[i].hecha ? 'hecha' : saltada(i) ? 'saltada' : i === current ? (espera(i) ? 'espera' : working ? 'en curso' : recibido[i] ? 'recibido' : 'en pausa') : 'pendiente'
  return { etapas, current, items, writing, recibido, espera, state, saltada, working }
}

/** Las carpetas de video como opciones de un `Picker`: el nombre y, si se sabe, el hilo que la tiene. */
function opcionesDeCarpetas(carpetas: CarpetaDeVideo[]) {
  const corto = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s)
  return carpetas.map((c) => ({ value: c.nombre, label: c.hilo && c.hilo !== c.nombre ? `${c.nombre} · ${corto(c.hilo)}` : c.nombre }))
}

/**
 * La carpeta de donde se lee el avance, y cambiarla por otra de la card: la de un video que este hilo siguió, o una que
 * se adivinó mal. Solo cambia lo que enseña el estudio; si el agente debe trabajar en otra, se le dice en el
 * chat. `carpeta` es la del avance: cuando cambia, se vuelve a pedir.
 */
export function CarpetaDelHilo({ sessionId, carpeta }: { sessionId: string; carpeta: string }) {
  const [datos, setDatos] = useState<{ actual: string; carpetas: CarpetaDeVideo[] } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let vivo = true
    api<{ actual: string; carpetas: CarpetaDeVideo[] }>(`/api/sessions/${sessionId}/carpeta`).then(
      (d) => vivo && setDatos(d),
      (e) => vivo && setError(e.message)
    )
    return () => {
      vivo = false
    }
  }, [sessionId, carpeta])
  // El avance se vuelve a leer solo: el servidor avisa cuando cambia la carpeta.
  const cambiar = (nueva: string) => {
    setError('')
    api(`/api/sessions/${sessionId}/carpeta`, { carpeta: nueva }).catch((e) => setError(e.message))
  }
  if (!datos) return null
  return (
    <div className="etapas-carpeta">
      <span className="muted small">Carpeta</span>
      <Picker
        label={datos.actual || 'la de la card'}
        value={datos.actual}
        groups={[{ label: 'Leer el avance de otra', options: opcionesDeCarpetas(datos.carpetas) }]}
        onChange={cambiar}
      />
      {error && <span className="bad small">{error}</span>}
    </div>
  )
}

/** Lo que se ve de una etapa: su estado, lo que espera o recibió del usuario y lo que dejó. */
export function EtapaCuerpo({ sessionId, p, i }: { sessionId: string; p: Pasos; i: number }) {
  const etapa = p.etapas[i]
  return (
    <>
      <div className="etapa-titulo">
        <span>{etapa.nombre}</span>
        <span className={`muted small ${p.state(i) === 'en curso' ? 'etapa-viva' : etapa.hecha ? 'etapa-hecha' : ''}`}>
          {i + 1} de {p.etapas.length} · {p.state(i)}
        </span>
      </div>
      <EtapaEspera sessionId={sessionId} p={p} i={i} />
      <Muestra sessionId={sessionId} archivos={etapa.archivos} writing={p.writing[i]} copiar={etapa.copiar} />
      {!etapa.archivos.length && !etapa.espera && p.writing[i] === undefined &&<div className="muted small">{etapa.hecha ? 'Hecha.' : 'Aún no hay nada que ver.'}</div>}
    </>
  )
}

/** Lo que la etapa espera del usuario, con dónde dárselo, o lo que ya le dio. Nada si no espera nada. */
function EtapaEspera({ sessionId, p, i }: { sessionId: string; p: Pasos; i: number }) {
  if (p.recibido[i]) return <Recibido path={p.recibido[i]} working={p.working} />
  return p.espera(i) ? <Entrega key={`${sessionId}-${i}`} sessionId={sessionId} etapa={p.etapas[i]} /> : null
}

/** La confirmación de lo que el usuario ya entregó, con el archivo para oírlo o verlo, mientras el agente lo procesa. */
function Recibido({ path, working }: { path: string; working: boolean }) {
  const name = (path.split(/[\\/]/).pop() ?? path).replace(/^\d{10,}-/, '')
  const src = imageUrl(path)
  return (
    <div className="etapa-recibido etapa-nuevo">
      <div className="recibido-cabeza">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span>Recibido</span>
      </div>
      <span className="recibido-nombre">{name}</span>
      {kind(name) === 'audio' && <audio src={src} controls preload="metadata" />}
      {kind(name) === 'video' && <video src={src} controls preload="metadata" />}
      {kind(name) === 'imagen' && <img src={src} alt={name} />}
      <span className="muted small">{working ? 'El agente ya está trabajando con él.' : 'El agente lo usará en cuanto siga.'}</span>
    </div>
  )
}

/**
 * Lo que una etapa espera del usuario, con un sitio donde dárselo: soltar el archivo o elegirlo. Se ve antes de mandarse
 * y solo sale con «Confirmar», como un mensaje del chat con su ruta: el agente ya sabe qué hacer con él. Si espera tu
 * voz, también se puede pedir que el agente la genere en AI Studio (`GenerarVoz`).
 */
function Entrega({ sessionId, etapa }: { sessionId: string; etapa: Avance['etapas'][number] }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [generada, setGenerada] = useState(false)
  const [error, setError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  // La extensión que pide la etapa (`.wav`), si su glob la dice sin ambigüedad. Un WAV es la voz: vale cualquier audio,
  // como lo grabe el celular, y el servidor lo convierte.
  const ext = /\.\w+$/.exec(etapa.listo)?.[0].toLowerCase()
  const voz = ext === '.wav'

  useEffect(() => () => URL.revokeObjectURL(preview), [preview])

  function take(f?: File) {
    if (!f) return
    if (voz ? !AUDIO.test(f.name) : ext && !f.name.toLowerCase().endsWith(ext)) return setError(voz ? 'Hace falta un audio (M4A, MP3, WAV…).' : `Hace falta un ${ext}.`)
    setError('')
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  async function confirm() {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}${voz ? '&wav' : ''}`, { method: 'POST', body: file })
      // Sin ruta no se manda nada: el agente recibiría "undefined" como archivo.
      const { path, error } = await res.json().catch(() => ({}))
      if (!res.ok || typeof path !== 'string') throw new Error(`No se pudo subir «${file.name}»: ${error ?? `el servidor respondió ${res.status}`}`)
      await api(`/api/sessions/${sessionId}/send`, { text: `Aquí está lo de «${etapa.nombre}»: "${path}"`, steer: true })
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (sent) return <div className="etapa-espera">Enviado. El agente sigue con {file?.name}.</div>
  if (generada) return <div className="etapa-espera">Pedido. El agente genera la voz en AI Studio y sigue con ella.</div>
  return (
    <div className="etapa-espera">
      {etapa.espera}
      {file ? (
        <div className="entrega-lista">
          <span className="entrega-nombre">{file.name}</span>
          {kind(file.name) === 'audio' && <audio src={preview} controls preload="metadata" />}
          <div className="entrega-botones">
            <button className="ghost small" disabled={busy} onClick={() => (setFile(null), setPreview(''))}>Cancelar</button>
            <button className="primary small" disabled={busy} onClick={confirm}>{busy ? 'Subiendo…' : 'Confirmar'}</button>
          </div>
        </div>
      ) : (
        <button
          className={`entrega-zona ${over ? 'encima' : ''}`}
          onClick={() => picker.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            take(e.dataTransfer.files[0])
          }}
        >
          Suelta aquí el archivo o haz clic para elegirlo
        </button>
      )}
      {voz && !file && (
        <GenerarVoz
          onGenerar={async (text) => {
            try {
              await api(`/api/sessions/${sessionId}/send`, { text, steer: true })
              setGenerada(true)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          }}
        />
      )}
      <input
        ref={picker}
        type="file"
        accept={voz ? 'audio/*,.m4a,.opus' : ext}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <div className="bad small">{error}</div>}
    </div>
  )
}

/** Un glob de `cards.json` (`*`, `**`, `?`, `{a,b}`) como expresión regular, para saber qué etapa enseña un archivo. */
function globRegex(glob: string): RegExp {
  const map: Record<string, string> = { '*': '[^/]*', '?': '[^/]', '{': '(?:', '}': ')', ',': '|' }
  const body = glob
    .split(/(\*\*\/|\*\*|[*?{},])/)
    .map((part) => (part === '**/' ? '(?:.*/)?' : part === '**' ? '.*' : (map[part] ?? part.replace(/[.+^$()|[\]\\]/g, '\\$&'))))
    .join('')
  return new RegExp(`^${body}$`, 'i')
}

/** Los audios que se aceptan como voz: los de un celular o una grabadora. */
const AUDIO = /\.(wav|m4a|mp3|aac|ogg|oga|opus|flac|wma|amr|3gp)$/i

const kind = (ruta: string) => {
  const ext = ruta.slice(ruta.lastIndexOf('.')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'imagen'
  if (['.mp4', '.webm'].includes(ext)) return 'video'
  if (AUDIO.test(ext)) return 'audio'
  return 'texto'
}

/** Lo que dejó una etapa, según el tipo de archivo. Lo nuevo entra con un fundido. `writing` es el texto que se está escribiendo. */
function Muestra({ sessionId, archivos, writing, copiar }: { sessionId: string; archivos: Avance['etapas'][number]['archivos']; writing?: string; copiar?: boolean }) {
  const src = (a: { ruta: string; t: number }) => `/api/sessions/${sessionId}/archivo?ruta=${encodeURIComponent(a.ruta)}&t=${Math.round(a.t)}`
  const images = archivos.filter((a) => kind(a.ruta) === 'imagen')
  const videos = archivos.filter((a) => kind(a.ruta) === 'video')
  const audios = archivos.filter((a) => kind(a.ruta) === 'audio')
  const text = archivos.filter((a) => kind(a.ruta) === 'texto').at(-1)
  return (
    <>
      {writing !== undefined ? <Escribiendo text={writing} /> : text && <Texto url={src(text)} copiar={copiar} />}
      {videos.length > 0 && (
        <div className={`etapa-rejilla c${Math.min(videos.length, 3)}`}>
          {videos.map((v) => (
            <video key={v.ruta} className="etapa-nuevo" src={src(v)} controls preload="metadata" title={v.ruta} />
          ))}
        </div>
      )}
      {audios.map((a) => (
        <audio key={a.ruta} className="etapa-nuevo" src={src(a)} controls preload="metadata" title={a.ruta} />
      ))}
      {images.length > 0 && (
        <div className={`etapa-rejilla c${images.length <= 2 ? 1 : images.length <= 10 ? 2 : 3}`}>
          {images.map((i) => (
            // En rejilla va la miniatura: decenas de capturas enteras traban el estudio. El clic abre la entera.
            <a key={i.ruta} href={src(i)} target="_blank" rel="noreferrer" title={i.ruta}>
              <img className="etapa-nuevo" src={images.length > 2 ? `${src(i)}&mini` : src(i)} alt={i.ruta} loading="lazy" decoding="async" />
            </a>
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Un texto de la etapa. Si se lee en voz alta (`copiar`), «Copiar» nace arriba a la derecha, acompaña la lectura
 * mientras bajas y copia el texto entero. No se parte en el primer `##`: en El Diff, antes va la intro, que también se lee.
 */
function Texto({ url, copiar }: { url: string; copiar?: boolean }) {
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const body = useMemo(() => markdown(text), [text])
  useEffect(() => {
    let alive = true
    fetch(url)
      .then((r) => r.text())
      .then((text) => alive && setText(text))
    return () => {
      alive = false
    }
  }, [url])
  function copy() {
    navigator.clipboard.writeText(paraLeer(text)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }
  if (!copiar || !text) return <div className="md etapa-texto" dangerouslySetInnerHTML={{ __html: body }} />
  return (
    <div className="etapa-lectura">
      <button className={`etapa-copiar ${copied ? 'copiado' : ''}`} type="button" title="Copia el guion entero, sin los encabezados ni el corte de datos" onClick={copy}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {copied ? <path d="M20 6 9 17l-5-5" /> : <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>}
        </svg>
        {copied ? 'Copiado' : 'Copiar'}
      </button>
      <div className="md etapa-texto" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  )
}

/**
 * Lo que se lee en voz alta, sin los encabezados ni la línea del corte de datos del video explicativo (la misma que
 * se salta su `subtitulos.py`).
 */
function paraLeer(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^#{1,6} /.test(line) && !/^(Corte de datos|Datos al)/.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Un texto que crece mientras el agente lo escribe. Si lo estabas siguiendo, la fase del estudio baja con él. */
function Escribiendo({ text }: { text: string }) {
  const html = useMemo(() => markdown(text), [text])
  const cursor = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = cursor.current
    const box = el?.closest('.estudio-fase')
    if (!el || !box) return
    const below = el.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom
    if (below > 0 && below < 240) box.scrollTop += below + 24
  }, [html])
  return (
    <div>
      <div className="md etapa-texto" dangerouslySetInnerHTML={{ __html: html }} />
      <span ref={cursor} className="etapa-cursor" />
    </div>
  )
}
