/** «Mis videos»: los terminados de todos los estilos, del más nuevo al más viejo, con su portada. Tocar uno lo abre. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { VideoHecho, VideosDeTodos } from '../../../shared/types'
import { api, urlDe } from '../api'
import type { Rutas } from '../rutas'
import { useSloth } from '../sloth'
import { c } from '../tema'
import { Aviso, Cargando, Segmento, Vacio } from '../ui'

const duracion = (s?: number) => (s === undefined ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)

export function Videos() {
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const { cards } = useSloth()
  const [videos, setVideos] = useState<VideoHecho[]>()
  const [error, setError] = useState('')
  const [tirando, setTirando] = useState(false)
  const [forma, setForma] = useState<'todos' | 'vertical' | 'horizontal'>('todos')

  const leer = useCallback(() => api<VideosDeTodos>('/api/videos').then((r) => (setVideos(r.videos), setError('')), (e) => setError(e.message)), [])
  useEffect(() => void leer(), [leer])
  const vistos = useMemo(() => (videos ?? []).filter((v) => forma === 'todos' || (forma === 'vertical' ? v.vertical !== false : v.vertical === false)), [videos, forma])

  if (!videos) return error ? <View style={s.raiz}><View style={{ padding: 16 }}><Aviso texto={error} /></View></View> : <Cargando texto="Juntando tus videos…" />

  return (
    <FlatList
      style={s.raiz}
      data={vistos}
      numColumns={3}
      keyExtractor={(v) => v.ruta}
      contentContainerStyle={s.lista}
      columnWrapperStyle={{ gap: 4 }}
      refreshControl={<RefreshControl refreshing={tirando} tintColor={c.amber} onRefresh={() => (setTirando(true), void leer().finally(() => setTirando(false)))} />}
      ListHeaderComponent={
        <View style={s.cabeza}>
          <Segmento
            valor={forma}
            opciones={[
              { id: 'todos', texto: `Todos · ${videos.length}` },
              { id: 'vertical', texto: 'Verticales' },
              { id: 'horizontal', texto: 'Horizontales' }
            ]}
            onCambio={setForma}
          />
          <Aviso texto={error} />
        </View>
      }
      ListEmptyComponent={<Vacio icono="video" titulo="Aún no hay videos" texto="Los videos que terminen tus hilos salen aquí, listos para guardar o compartir." />}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.titulo}
          onPress={() => navigation.navigate('Reproductor', { video: { src: item.src, titulo: item.titulo, archivo: item.archivo, vertical: item.vertical } })}
          style={({ pressed }) => [s.celda, pressed && { opacity: 0.7 }]}
        >
          <Image source={{ uri: urlDe(`${item.src}&cuadro`) }} style={s.portada} resizeMode="cover" />
          <View style={s.pie}>
            <Text style={s.titulo} numberOfLines={1}>
              {item.titulo}
            </Text>
            <Text style={s.detalle} numberOfLines={1}>
              {[cards.find((x) => x.id === item.cardId)?.title, duracion(item.segundos)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </Pressable>
      )}
    />
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 8, gap: 4 },
  cabeza: { gap: 8, padding: 8, paddingBottom: 10 },
  celda: { flex: 1 / 3, backgroundColor: c.panel, borderRadius: 8, overflow: 'hidden' },
  portada: { width: '100%', aspectRatio: 9 / 16, backgroundColor: c.panel2 },
  pie: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: 'rgba(15, 14, 12, 0.7)' },
  titulo: { color: c.text, fontSize: 11.5, fontWeight: '600' },
  detalle: { color: c.muted, fontSize: 10.5 }
})
