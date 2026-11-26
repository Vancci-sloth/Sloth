import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Autor, FeedComunidad } from '../../shared/types'
import { api } from './api'
import { CampoAscii } from './CampoAscii'
import { Cara, INSIGNIAS, irAComunidad } from './Comunidad'
import { recordar, ultimoFeed } from './comunidadDatos'
import { useContador } from './contador'
import { Icono } from './Iconos'
import { RecortarFoto } from './RecortarFoto'
import './MiPerfil.css'

/**
 * «Mi perfil» (`#/comunidad/perfil`): su propia página, no una ventanita encima de la comunidad. Aquí está todo lo
 * tuyo junto y a la vista: tu foto, tu nombre, tus números y, si eres Fundador, los créditos.
 *
 * La foto pasa por el recortador (`RecortarFoto.tsx`), para que la encuadres tú. Nada se manda hasta que le das a
 * guardar, y mientras haya algo sin guardar la barra de abajo no se va.
 */
type Yo = FeedComunidad['yo']

export function MiPerfil() {
  // Lo que ya se sabe de esta sesión sale de inmediato; luego llega lo de la nube.
  const [yo, setYo] = useState<Yo | null>(() => ultimoFeed()?.yo ?? null)
  const [cargando, setCargando] = useState(!yo)
  const [nombre, setNombre] = useState(yo?.nombre ?? '')
  const [creditos, setCreditos] = useState(!!yo?.creditos)
  // `undefined`: la foto que ya tenías; `null`: sin foto; o la nueva.
  const [foto, setFoto] = useState<{ llave: string; url: string } | null | undefined>(undefined)
  const [original, setOriginal] = useState<File | null>(null)
  const [recortando, setRecortando] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [error, setError] = useState('')
  const elegir = useRef<HTMLInputElement>(null)
  // Lo que escribiste gana sobre lo que llega de la nube: no se te borra a media palabra.
  const tocado = useRef(false)

  useEffect(() => {
    void api<FeedComunidad>('/api/comunidad').then(
      (f) => {
        recordar(f)
        setYo(f.yo)
        setCargando(false)
        if (!tocado.current) {
          setNombre(f.yo.nombre)
          setCreditos(!!f.yo.creditos)
        }
      },
      (e: Error) => (setCargando(false), setError(e.message))
    )
  }, [])

  function elegida(f?: File) {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('Tu foto debe ser una imagen.')
    setError('')
    setOriginal(f)
    setRecortando(f)
  }

  async function subir(recortada: Blob) {
    setRecortando(null)
    setSubiendo(true)
    setError('')
    try {
      // Ya sale del recortador en 512 px y WebP: por toda la comunidad se ve de 26 a 120 px, así que con eso sobra.
      const r = await fetch(`/api/comunidad/archivo?tipo=${encodeURIComponent(recortada.type)}`, { method: 'POST', body: recortada })
      const j = (await r.json().catch(() => ({}))) as { llave?: string; url?: string; error?: string }
      if (!r.ok || !j.llave || !j.url) throw new Error(j.error ?? 'No se pudo subir tu foto.')
      tocado.current = true
      setGuardado(false)
      setFoto({ llave: j.llave, url: j.url })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubiendo(false)
    }
  }

  async function guardar() {
    if (!yo || !nombre.trim() || subiendo || guardando) return
    setGuardando(true)
    setError('')
    try {
      const a = await api<Autor>('/api/comunidad/perfil', {
        nombre: nombre.trim(),
        ...(foto !== undefined ? { foto: foto?.llave ?? null } : {}),
        ...(yo.insignia === 'fundador' ? { creditos } : {})
      })
      // Tu nombre y tu foto, ya al día en lo que la comunidad tenga guardado de esta sesión.
      const f = ultimoFeed()
      if (f) recordar({ ...f, yo: { ...f.yo, ...a } })
      setYo((v) => v && { ...v, ...a })
      setFoto(undefined)
      setOriginal(null)
      tocado.current = false
      setGuardado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGuardando(false)
    }
  }

  const vista: Autor | undefined = yo ? { ...yo, nombre: nombre || yo.nombre, foto: foto === undefined ? yo.foto : foto?.url } : undefined
  const cambios = !!yo && (nombre.trim() !== yo.nombre || foto !== undefined || (yo.insignia === 'fundador' && creditos !== !!yo.creditos))
  const insignia = yo?.insignia && INSIGNIAS[yo.insignia]
  // Los números suben al entrar, como la cifra del fondo de la comunidad.
  const publicaciones = Math.round(useContador(yo?.publicaciones ?? 0, 900))
  const comentarios = Math.round(useContador(yo?.comentarios ?? 0, 900))

  return (
    <div className="miperfil fondo-ramas">
      <CampoAscii variante="ramas" />
      <div className="miperfil-centro">
        <header className="miperfil-cabeza">
          <div>
            <div className="miperfil-antetitulo">Comunidad</div>
            <h1>Mi perfil</h1>
          </div>
          <button className="miperfil-volver" onClick={irAComunidad}>
            <Icono de="izquierda" /> Volver a la comunidad
          </button>
        </header>

        {cargando && !yo ? (
          <p className="miperfil-cargando">Cargando…</p>
        ) : !yo ? (
          <p className="bad">{error || 'No se pudo abrir tu perfil.'}</p>
        ) : (
          <>
            <section className="miperfil-tarjeta" data-de="foto" style={{ '--turno': 0 } as CSSProperties}>
              <div className="miperfil-titulo">
                <span className="miperfil-sello">
                  <Icono de="imagen" />
                </span>
                <div>
                  <h2>Tu foto</h2>
                  <p>Así te ven en la comunidad, en un círculo. La encuadras tú.</p>
                </div>
              </div>
              {recortando ? (
                <RecortarFoto archivo={recortando} onListo={(b) => void subir(b)} onCancelar={() => setRecortando(null)} />
              ) : (
                <div className="miperfil-cara">
                  <button className={subiendo ? 'subiendo' : ''} title="Elegir una foto" onClick={() => elegir.current?.click()}>
                    <Cara autor={vista} tam="enorme" />
                  </button>
                  <div className="miperfil-acciones">
                    <button className="miperfil-pildora" data-color="elegir" disabled={subiendo} onClick={() => elegir.current?.click()}>
                      <Icono de="imagen" /> {subiendo ? 'Subiendo…' : vista?.foto ? 'Cambiar la foto' : 'Poner una foto'}
                    </button>
                    {original && !subiendo && (
                      <button className="miperfil-pildora" data-color="encuadrar" onClick={() => setRecortando(original)}>
                        <Icono de="mira" /> Volver a encuadrar
                      </button>
                    )}
                    {vista?.foto && !subiendo && (
                      <button className="miperfil-pildora" data-color="quitar" onClick={() => (tocado.current = true, setGuardado(false), setOriginal(null), setFoto(null))}>
                        <Icono de="basura" /> Quitarla
                      </button>
                    )}
                  </div>
                  <input ref={elegir} type="file" accept="image/*" hidden onChange={(e) => (elegida(e.target.files?.[0]), (e.target.value = ''))} />
                </div>
              )}
            </section>

            <section className="miperfil-tarjeta" data-de="nombre" style={{ '--turno': 1 } as CSSProperties}>
              <div className="miperfil-titulo">
                <span className="miperfil-sello">
                  <Icono de="lapiz" />
                </span>
                <div>
                  <h2>Tu nombre</h2>
                  <p>Con el que firmas lo que publicas y lo que comentas.</p>
                </div>
              </div>
              <input
                className="miperfil-nombre"
                value={nombre}
                maxLength={40}
                placeholder="Tu nombre"
                onChange={(e) => (tocado.current = true, setGuardado(false), setNombre(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && void guardar()}
              />
            </section>

            {yo.insignia === 'fundador' && (
              <section className="miperfil-tarjeta" data-de="creditos" style={{ '--turno': 2 } as CSSProperties}>
                <div className="miperfil-titulo">
                  <span className="miperfil-sello">
                    <Icono de="corona" />
                  </span>
                  <div>
                    <h2>Los créditos</h2>
                    <p>Eres Fundador: tu nombre puede salir en la página de VyMotion.</p>
                  </div>
                </div>
                <label className="com-creditos">
                  <input type="checkbox" checked={creditos} onChange={(e) => (tocado.current = true, setGuardado(false), setCreditos(e.target.checked))} />
                  <span>Salir con este nombre en los créditos de los Fundadores, en sloth.vancci.org</span>
                </label>
              </section>
            )}

            <section className="miperfil-tarjeta" data-de="numeros" style={{ '--turno': 3 } as CSSProperties}>
              <div className="miperfil-titulo">
                <span className="miperfil-sello">
                  <Icono de="pulso" />
                </span>
                <div>
                  <h2>Lo que llevas</h2>
                  <p>Lo tuyo en la comunidad hasta ahora.</p>
                </div>
              </div>
              <dl className="miperfil-numeros">
                <div>
                  <dt>Publicaciones</dt>
                  <dd>{publicaciones.toLocaleString('es-MX')}</dd>
                </div>
                <div>
                  <dt>Comentarios</dt>
                  <dd>{comentarios.toLocaleString('es-MX')}</dd>
                </div>
                <div>
                  <dt>Tu insignia</dt>
                  <dd className="miperfil-insignia">{yo.creador ? 'Creador' : insignia ? insignia.texto : 'Sin insignia'}</dd>
                </div>
              </dl>
            </section>

            {error && <p className="bad miperfil-error">{error}</p>}

            {/* Mientras haya algo sin guardar, la barra se queda abajo a la vista. */}
            <div className={`miperfil-pie${cambios ? ' con-cambios' : ''}`}>
              <span>
                {cambios ? 'Tienes cambios sin guardar.' : guardado ? 'Guardado. Así te ven en la comunidad.' : 'Todo está guardado.'}
              </span>
              <button className="esc-listo" disabled={!cambios || !nombre.trim() || subiendo || guardando} onClick={() => void guardar()}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
