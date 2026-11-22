/**
 * El campo de texto de un hilo, nuevo o abierto: lo que escribes, lo que adjuntas de la galería o de tus archivos y tu voz
 * grabada con el micrófono. Al mandar, los adjuntos suben a la computadora (`/api/upload`): las imágenes van como
 * `images`, que el agente ve; lo demás, como su ruta en el texto, igual que en la computadora.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio'
import { subir } from './api'
import { Icono } from './Icono'
import { c } from './tema'
import { Aviso, BotonIcono } from './ui'

export interface Adjunto {
  uri: string
  nombre: string
  tipo: 'imagen' | 'video' | 'audio' | 'archivo'
}

const IMAGEN = /\.(png|jpe?g|gif|webp)$/i

/** Sube los adjuntos y dice qué va en `images` y qué líneas van al final del texto. */
export async function subirAdjuntos(adjuntos: Adjunto[]): Promise<{ images: string[]; lineas: string[] }> {
  const images: string[] = []
  const lineas: string[] = []
  for (const a of adjuntos) {
    const ruta = await subir(a.uri, a.nombre, { wav: a.tipo === 'audio' })
    if (a.tipo === 'imagen' && IMAGEN.test(a.nombre)) images.push(ruta)
    else lineas.push(`${a.tipo === 'audio' ? 'Mi voz grabada' : a.tipo === 'video' ? 'Video adjunto' : 'Archivo adjunto'}: "${ruta}"`)
  }
  return { images, lineas }
}

/** Junta lo escrito con las rutas de lo adjunto que no es imagen. */
export const conLineas = (texto: string, lineas: string[]) => [texto.trim(), lineas.join('\n')].filter(Boolean).join('\n\n')

export function Compositor(props: {
  placeholder: string
  /** Manda lo escrito y lo adjunto; si falla, el texto y los adjuntos se quedan. */
  onEnviar(texto: string, adjuntos: Adjunto[]): Promise<void>
  trabajando?: boolean
  onParar?(): void
  /** Lo que va encima del campo: las opciones del hilo nuevo. */
  arriba?: ReactNode
  /** Un texto que llega de fuera (las opciones del agente): reemplaza lo escrito. */
  texto?: string
  autoFocus?: boolean
  bloqueo?: string
  /** Lo escrito, cada vez que cambia: el hilo nuevo cuenta los enlaces para el lote. */
  onCambioTexto?(texto: string): void
}) {
  const [texto, setTexto] = useState(props.texto ?? '')
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [mandando, setMandando] = useState(false)
  const [error, setError] = useState('')
  const grabadora = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const grabando = useAudioRecorderState(grabadora)
  useEffect(() => {
    if (props.texto !== undefined) setTexto(props.texto)
  }, [props.texto])
  useEffect(() => props.onCambioTexto?.(texto), [texto])

  async function galeria() {
    setError('')
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 })
    if (r.canceled) return
    setAdjuntos((a) => [
      ...a,
      ...r.assets.map((x, i): Adjunto => {
        const video = x.type === 'video'
        const ext = (x.fileName ?? x.uri).split('.').pop()?.toLowerCase() ?? (video ? 'mp4' : 'jpg')
        return { uri: x.uri, nombre: x.fileName ?? `${video ? 'video' : 'foto'}-${Date.now()}-${i}.${ext}`, tipo: video ? 'video' : 'imagen' }
      })
    ])
  }

  async function archivo() {
    setError('')
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: true })
    if (r.canceled) return
    setAdjuntos((a) => [
      ...a,
      ...r.assets.map((x): Adjunto => {
        const mime = x.mimeType ?? ''
        const tipo = mime.startsWith('image/') ? 'imagen' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'archivo'
        return { uri: x.uri, nombre: x.name, tipo }
      })
    ])
  }

  async function voz() {
    setError('')
    if (grabando.isRecording) {
      await grabadora.stop()
      const uri = grabadora.uri
      if (uri) setAdjuntos((a) => [...a, { uri, nombre: `mi-voz-${Date.now()}.${Platform.OS === 'web' ? 'webm' : 'm4a'}`, tipo: 'audio' }])
      return
    }
    const { granted } = await requestRecordingPermissionsAsync()
    if (!granted) return setError('Sin el micrófono no se puede grabar tu voz: permítelo en los ajustes del celular.')
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
    await grabadora.prepareToRecordAsync()
    grabadora.record()
  }

  async function enviar() {
    if (mandando || grabando.isRecording) return
    if (!texto.trim() && !adjuntos.length) return
    setMandando(true)
    setError('')
    try {
      await props.onEnviar(texto, adjuntos)
      setTexto('')
      setAdjuntos([])
    } catch (e) {
      // Un «no» al aviso de varios videos no es un error que enseñar.
      const m = e instanceof Error ? e.message : String(e)
      if (m) setError(m)
    } finally {
      setMandando(false)
    }
  }

  const vacio = !texto.trim() && !adjuntos.length
  const segundos = Math.floor((grabando.durationMillis ?? 0) / 1000)

  return (
    <View style={s.raiz}>
      {props.arriba}
      <Aviso texto={error || props.bloqueo || ''} />
      {adjuntos.length > 0 && (
        <ScrollView horizontal contentContainerStyle={s.adjuntos} showsHorizontalScrollIndicator={false}>
          {adjuntos.map((a, i) => (
            <View key={a.uri + i} style={s.adjunto}>
              {a.tipo === 'imagen' ? (
                <Image source={{ uri: a.uri }} style={s.miniatura} />
              ) : (
                <View style={[s.miniatura, s.miniaturaIcono]}>
                  <Icono de={a.tipo === 'audio' ? 'microfono' : a.tipo === 'video' ? 'video' : 'importar'} color={c.amber} tam={22} />
                  <Text style={s.adjuntoNombre} numberOfLines={2}>
                    {a.nombre}
                  </Text>
                </View>
              )}
              <Pressable accessibilityLabel={`Quitar ${a.nombre}`} hitSlop={8} style={s.quitar} onPress={() => setAdjuntos((l) => l.filter((_, j) => j !== i))}>
                <Icono de="cerrar" color={c.text} tam={14} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={s.caja}>
        {grabando.isRecording ? (
          <View style={s.grabando}>
            <View style={s.puntoRojo} />
            <Text style={s.grabandoTexto}>Grabando tu voz… {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</Text>
          </View>
        ) : (
          <TextInput
            style={s.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder={props.placeholder}
            placeholderTextColor={c.muted}
            multiline
            autoFocus={props.autoFocus}
            editable={!mandando}
          />
        )}
        <View style={s.barra}>
          <BotonIcono icono="imagen" nombre="Adjuntar de la galería" onPress={() => void galeria()} color={c.suave} disabled={mandando || grabando.isRecording} />
          <BotonIcono icono="importar" nombre="Adjuntar un archivo" onPress={() => void archivo()} color={c.suave} disabled={mandando || grabando.isRecording} />
          <BotonIcono icono={grabando.isRecording ? 'pausa' : 'microfono'} nombre={grabando.isRecording ? 'Terminar de grabar' : 'Grabar tu voz'} onPress={() => void voz().catch((e) => setError(String(e?.message ?? e)))} color={grabando.isRecording ? c.bad : c.suave} disabled={mandando} />
          <View style={{ flex: 1 }} />
          {props.trabajando && props.onParar && vacio ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Parar al agente" onPress={props.onParar} style={[s.enviar, s.parar]}>
              <View style={s.cuadro} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={props.trabajando ? 'Mandar mientras trabaja' : 'Mandar'}
              disabled={vacio || mandando || grabando.isRecording || !!props.bloqueo}
              onPress={() => void enviar()}
              style={[s.enviar, (vacio || mandando || !!props.bloqueo) && { opacity: 0.4 }]}
            >
              <Icono de={mandando ? 'recargar' : 'flechaArriba'} color={c.sobreAmbar} tam={20} grosor={2.4} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { gap: 8 },
  caja: { backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1, borderRadius: 16, paddingTop: 4 },
  campo: { color: c.text, fontSize: 16, lineHeight: 22, minHeight: 44, maxHeight: 160, paddingHorizontal: 12, paddingVertical: 8, textAlignVertical: 'top' },
  barra: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingBottom: 6, gap: 2 },
  enviar: { width: 38, height: 38, borderRadius: 12, backgroundColor: c.amber, alignItems: 'center', justifyContent: 'center' },
  parar: { backgroundColor: c.panel, borderWidth: 1, borderColor: c.line },
  cuadro: { width: 13, height: 13, borderRadius: 3, backgroundColor: c.text },
  adjuntos: { gap: 8, paddingVertical: 2 },
  adjunto: { position: 'relative' },
  miniatura: { width: 72, height: 72, borderRadius: 10, backgroundColor: c.panel2 },
  miniaturaIcono: { alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4, borderWidth: 1, borderColor: c.line },
  adjuntoNombre: { color: c.muted, fontSize: 9.5, textAlign: 'center' },
  quitar: { position: 'absolute', top: -6, right: -6, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 3 },
  grabando: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12 },
  puntoRojo: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.bad },
  grabandoTexto: { color: c.text, fontSize: 15 }
})
