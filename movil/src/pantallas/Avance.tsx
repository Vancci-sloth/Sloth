/**
 * Cómo va el video de un hilo, como el estudio de la computadora pero en una columna: las cinco fases, cada etapa con lo
 * que dejó (el guion se lee, las imágenes se ven, los videos y la voz se reproducen) y, al final, los videos terminados
 * para verlos, guardarlos en la galería o compartirlos. Se vuelve a pedir cada vez que cambia algo de su carpeta.
 */
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Clipboard from 'expo-clipboard'
import { FASES, type Avance as AvanceT, type Archivo } from '../../../shared/types'
import { api, urlDe } from '../api'
import { Icono } from '../Icono'
import { Markdown } from '../Markdown'
import type { Rutas } from '../rutas'
import { alCambiarEtapas, useSloth } from '../sloth'
import { c, radio } from '../tema'
import { Aviso, Boton, Cargando, Titulo } from '../ui'

type Etapa = AvanceT['etapas'][number]
const IMAGEN = /\.(png|jpe?g|gif|webp)$/i
const VIDEO = /\.(mp4|mov|webm)$/i
const AUDIO = /\.(wav|mp3|m4a|ogg)$/i
const TEXTO = /\.(md|txt|json|srt)$/i

export function Avance({ route, navigation }: NativeStackScreenProps<Rutas, 'Avance'>) {
  const { id } = route.params
  const { sessions } = useSloth()
  const meta = sessions.find((s) => s.id === id)
  const [avance, setAvance] = useState<AvanceT>()
  const [error, setError] = useState('')
  const [tirando, setTirando] = useState(false)
  const [otra, setOtra] = useState(false)

  const leer = useCallback(() => api<AvanceT>(`/api/sessions/${id}/etapas`).then((a) => (setAvance(a), setError('')), (e) => setError(e.message)), [id])
  useEffect(() => {
    void leer()
    // Lo que cambia en la carpeta llega muchas veces seguidas mientras el agente escribe: se pide una vez cada tanto.
    let t: ReturnType<typeof setTimeout> | undefined
    const quitar = alCambiarEtapas(id, () => {
      clearTimeout(t)
      t = setTimeout(() => void leer(), 800)
    })
    return () => (clearTimeout(t), quitar())
  }, [id, leer])

  const archivo = (a: Archivo, extra = '') => urlDe(`/api/sessions/${id}/archivo?ruta=${encodeURIComponent(a.ruta)}&t=${Math.round(a.t)}${extra}`)
  const ver = (a: Archivo, titulo: string, nombre?: string) =>
    navigation.navigate('Reproductor', { video: { src: `/api/sessions/${id}/archivo?ruta=${encodeURIComponent(a.ruta)}&t=${Math.round(a.t)}`, titulo, archivo: a.ruta, nombre } })

  if (!avance) return error ? <View style={{ padding: 16, flex: 1, backgroundColor: c.bg }}><Aviso texto={error} /></View> : <Cargando texto="Mirando la carpeta del video…" />

  const siguiente = avance.etapas.find((e) => !e.hecha)
  const libre = !meta?.running && !meta?.background?.length && !meta?.pendiente
  return (
    <ScrollView
      style={s.raiz}
      contentContainerStyle={s.contenido}
      refreshControl={<RefreshControl refreshing={tirando} tintColor={c.amber} onRefresh={() => (setTirando(true), void leer().finally(() => setTirando(false)))} />}
    >
      {!!avance.finales?.length && (
        <View style={s.seccion}>
          <Titulo>Tu video</Titulo>
          {avance.finales.map((f) => (
            <Pressable key={f.ruta} onPress={() => ver(f, f.nombre, f.nombre)} style={s.final}>
              {meta && <Image source={{ uri: urlDe(`/api/cards/${meta.cardId}/video?ruta=${encodeURIComponent(`${avance.carpeta}/${f.ruta}`)}&t=${Math.round(f.t)}&cuadro`) }} style={s.finalImagen} resizeMode="contain" />}
              <View style={s.finalVelo}>
                <Icono de="video" color={c.text} tam={30} />
              </View>
              <Text style={s.finalNombre} numberOfLines={2}>
                {f.nombre}
              </Text>
            </Pressable>
          ))}
          {libre && (
            <Boton
              texto="Haz otra versión"
              icono="recargar"
              ocupado={otra}
              onPress={() => {
                setOtra(true)
                void api(`/api/sessions/${id}/version`, {})
                  .then(() => navigation.navigate('Hilo', { id }))
                  .catch((e) => setError(e.message))
                  .finally(() => setOtra(false))
              }}
            />
          )}
        </View>
      )}
      <Aviso texto={error} />
      {siguiente?.espera && <Aviso tipo="info" texto={`Te toca: ${siguiente.espera}`} />}
      {FASES.map((fase) => {
        const etapas = avance.etapas.filter((e) => (e.fase ?? 'video') === fase.id)
        if (!etapas.length) return null
        const hechas = etapas.filter((e) => e.hecha).length
        return (
          <View key={fase.id} style={s.seccion}>
            <View style={s.faseCabeza}>
              <Titulo>{fase.nombre}</Titulo>
              <Text style={s.faseCuenta}>{`${hechas} de ${etapas.length}`}</Text>
            </View>
            <View style={s.panel}>
              {etapas.map((e, i) => (
                <EtapaFila key={e.nombre} etapa={e} primera={i === 0} actual={e === siguiente} trabaja={!!meta?.running} archivo={archivo} onVer={(a) => ver(a, e.nombre)} />
              ))}
            </View>
          </View>
        )
      })}
      {!!avance.monitor?.renders.length && !avance.finales?.length && (
        <View style={s.seccion}>
          <Titulo>Lo renderizado</Titulo>
          {avance.monitor.renders.slice(0, 3).map((r) => (
            <Boton key={r.ruta} texto={`${r.ruta.split('/').pop()}${r.viejo ? ' (va atrasado)' : ''}`} icono="video" onPress={() => ver(r, 'Render')} />
          ))}
        </View>
      )}
      <Text style={s.carpeta} selectable>{`Carpeta: ${avance.carpeta}`}</Text>
    </ScrollView>
  )
}

function EtapaFila({ etapa, primera, actual, trabaja, archivo, onVer }: { etapa: Etapa; primera: boolean; actual: boolean; trabaja: boolean; archivo(a: Archivo, extra?: string): string; onVer(a: Archivo): void }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState<string>()
  const ultimo = etapa.archivos.at(-1)
  const deTexto = ultimo && TEXTO.test(ultimo.ruta)
  const abrir = () => {
    if (!ultimo) return
    if (VIDEO.test(ultimo.ruta) || AUDIO.test(ultimo.ruta)) return onVer(ultimo)
    setAbierta(!abierta)
    if (deTexto && texto === undefined)
      void fetch(archivo(ultimo)).then(
        (r) => r.text().then(setTexto),
        () => setTexto('No se pudo leer.')
      )
  }
  const imagenes = etapa.archivos.filter((a) => IMAGEN.test(a.ruta))
  return (
    <View style={[s.etapa, !primera && s.etapaRaya]}>
      <Pressable onPress={abrir} disabled={!ultimo} style={s.etapaFila}>
        <View style={[s.marca, etapa.hecha ? s.marcaHecha : actual && s.marcaActual]}>
          {etapa.hecha ? <Icono de="palomita" color={c.sobreAmbar} tam={13} grosor={3} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.etapaNombre, !etapa.hecha && !actual && { color: c.muted }]}>{etapa.nombre}</Text>
          {actual && <Text style={s.etapaDetalle}>{etapa.espera ? `Te espera: ${etapa.espera}` : trabaja ? 'En esto va' : 'Lo siguiente'}</Text>}
        </View>
        {ultimo && <Icono de={VIDEO.test(ultimo.ruta) || AUDIO.test(ultimo.ruta) ? 'video' : abierta ? 'anterior' : 'siguiente'} color={c.muted} tam={16} />}
      </Pressable>
      {abierta && imagenes.length > 0 && (
        <ScrollView horizontal contentContainerStyle={s.imagenes} showsHorizontalScrollIndicator={false}>
          {imagenes.slice(-12).map((a) => (
            <Image key={a.ruta} source={{ uri: archivo(a, '&mini') }} style={s.imagen} />
          ))}
        </ScrollView>
      )}
      {abierta && deTexto && (
        <View style={s.texto}>
          {texto === undefined ? (
            <Text style={s.etapaDetalle}>Leyendo…</Text>
          ) : ultimo!.ruta.endsWith('.md') ? (
            <Markdown texto={texto} />
          ) : (
            <Text style={s.crudo} selectable>
              {texto.slice(0, 20000)}
            </Text>
          )}
          {etapa.copiar && texto && <Boton texto="Copiar el texto" icono="copiar" onPress={() => void Clipboard.setStringAsync(texto.replace(/^#.*$/gm, '').trim())} />}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 18 },
  seccion: { gap: 8 },
  faseCabeza: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  faseCuenta: { color: c.muted, fontSize: 12.5 },
  panel: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, overflow: 'hidden' },
  etapa: {},
  etapaRaya: { borderTopWidth: 1, borderTopColor: c.line },
  etapaFila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 },
  marca: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  marcaHecha: { backgroundColor: c.amber, borderColor: c.amber },
  marcaActual: { borderColor: c.amber },
  etapaNombre: { color: c.text, fontSize: 15 },
  etapaDetalle: { color: c.amber, fontSize: 12.5 },
  imagenes: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  imagen: { width: 120, height: 120, borderRadius: 10, backgroundColor: c.panel2 },
  texto: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  crudo: { color: c.suave, fontSize: 12.5, fontFamily: 'monospace' },
  final: { borderRadius: radio, overflow: 'hidden', backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1 },
  finalImagen: { width: '100%', aspectRatio: 16 / 9, backgroundColor: c.panel2 },
  finalVelo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 14, 12, 0.35)' },
  finalNombre: { color: c.text, fontSize: 14, fontWeight: '600', padding: 10 },
  carpeta: { color: c.muted, fontSize: 11.5 }
})
