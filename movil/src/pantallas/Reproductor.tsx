/**
 * Un video de la computadora, en el celular: se reproduce por tramos desde Sloth (sin bajarlo entero) y se puede guardar
 * en la galería o compartir directo a TikTok, Instagram o WhatsApp. Para eso se baja una vez a la caché del celular.
 */
import { useEffect, useState } from 'react'
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useVideoPlayer, VideoView } from 'expo-video'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Asset, requestPermissionsAsync } from 'expo-media-library'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { urlDe } from '../api'
import type { Rutas } from '../rutas'
import { c } from '../tema'
import { Aviso, Boton } from '../ui'

/** El nombre con que se guarda: sin lo que los sistemas de archivos no aceptan. */
const nombreDeArchivo = (n: string) => (n.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'video') + (/\.mp4$/i.test(n) ? '' : '.mp4')

export function Reproductor({ route, navigation }: NativeStackScreenProps<Rutas, 'Reproductor'>) {
  const { video } = route.params
  const url = urlDe(video.src)
  const abajo = useSafeAreaInsets().bottom
  const player = useVideoPlayer({ uri: url, useCaching: false }, (p) => {
    p.loop = true
    p.play()
  })
  const [haciendo, setHaciendo] = useState<'guardar' | 'compartir' | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info' }>()
  /** Cuánto lleva bajado, de 0 a 100: un video terminado pesa decenas de MB y por Wi-Fi tarda. */
  const [bajado, setBajado] = useState<number>()
  const nombre = nombreDeArchivo(video.nombre ?? video.archivo.split(/[\\/]/).pop() ?? video.titulo)

  useEffect(() => navigation.setOptions({ title: video.titulo }), [navigation, video.titulo])

  /** Lo baja a la caché del celular una vez; si ya estaba, usa ese. */
  async function bajar(): Promise<File> {
    const destino = new File(Paths.cache, nombre)
    if (destino.exists && (destino.size ?? 0) > 0) return destino
    try {
      return await File.downloadFileAsync(url, destino, {
        idempotent: true,
        onProgress: ({ bytesWritten, totalBytes }) => totalBytes > 0 && setBajado(Math.floor((bytesWritten / totalBytes) * 100))
      })
    } finally {
      setBajado(undefined)
    }
  }

  async function hacer(que: 'guardar' | 'compartir') {
    setAviso(undefined)
    if (Platform.OS === 'web') return void Linking.openURL(`${url}&descarga=${encodeURIComponent(nombre)}`)
    setHaciendo(que)
    try {
      if (que === 'guardar') {
        const permiso = await requestPermissionsAsync(true)
        if (!permiso.granted) throw new Error('Sin permiso para la galería no se puede guardar: permítelo en los ajustes del celular.')
      }
      const archivo = await bajar()
      if (que === 'guardar') {
        await Asset.create(archivo.uri)
        setAviso({ tipo: 'info', texto: 'Guardado en tu galería.' })
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('Este celular no deja compartir archivos.')
        await Sharing.shareAsync(archivo.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: 'Compartir el video' })
      }
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setHaciendo(null)
    }
  }

  return (
    <ScrollView style={s.raiz} contentContainerStyle={[s.contenido, { paddingBottom: abajo + 16 }]}>
      <View style={[s.marco, { aspectRatio: video.vertical === false ? 16 / 9 : 9 / 16 }]}>
        <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
      </View>
      <Text style={s.nombre} numberOfLines={2}>
        {nombre}
      </Text>
      {aviso && <Aviso tipo={aviso.tipo} texto={aviso.texto} />}
      <View style={s.botones}>
        <Boton texto={haciendo === 'guardar' && bajado !== undefined ? `Bajando ${bajado} %` : 'Guardar'} icono="descargar" tipo="primario" ocupado={haciendo === 'guardar' && bajado === undefined} disabled={!!haciendo} onPress={() => void hacer('guardar')} style={{ flex: 1 }} />
        <Boton texto={haciendo === 'compartir' && bajado !== undefined ? `Bajando ${bajado} %` : 'Compartir'} icono="compartir" ocupado={haciendo === 'compartir' && bajado === undefined} disabled={!!haciendo} onPress={() => void hacer('compartir')} style={{ flex: 1 }} />
      </View>
      <Text style={s.nota}>Compartir lo manda a TikTok, Instagram, WhatsApp o a donde quieras. La primera vez se baja del todo a tu celular.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 14 },
  marco: { width: '100%', maxHeight: 560, alignSelf: 'center', backgroundColor: '#000', borderRadius: 12, overflow: 'hidden' },
  nombre: { color: c.text, fontSize: 15, fontWeight: '600' },
  botones: { flexDirection: 'row', gap: 10 },
  nota: { color: c.muted, fontSize: 13, lineHeight: 18 }
})
