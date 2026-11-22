/** Una publicación de la comunidad entera: su texto, sus imágenes o su video, me gusta y los comentarios para contestar. */
import { useEffect, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AdjuntoComunidad, ComentarioComunidad, PublicacionComunidad } from '../../../shared/types'
import { comunidad } from '../comunidadApi'
import { Icono } from '../Icono'
import { Markdown } from '../Markdown'
import type { Rutas } from '../rutas'
import { c, radio } from '../tema'
import { Aviso, Cargando } from '../ui'
import { Cara, hace, SECCIONES } from './Comunidad'

type Abierta = { publicacion: PublicacionComunidad; comentarios: ComentarioComunidad[] }

export function Publicacion({ route, navigation }: NativeStackScreenProps<Rutas, 'Publicacion'>) {
  const { id } = route.params
  const abajo = useSafeAreaInsets().bottom
  const [a, setA] = useState<Abierta>()
  const [error, setError] = useState('')
  const [texto, setTexto] = useState('')
  const [responde, setResponde] = useState<ComentarioComunidad>()
  const [mandando, setMandando] = useState(false)

  useEffect(() => void comunidad<Abierta>(`/comunidad/p/${id}`).then(setA, (e) => setError(e.message)), [id])
  useEffect(() => {
    const seccion = SECCIONES.find((x) => x.id === a?.publicacion.categoria)
    navigation.setOptions({ title: seccion?.nombre ?? 'Comunidad' })
  }, [a?.publicacion.categoria, navigation])

  if (!a) return error ? <View style={{ flex: 1, backgroundColor: c.bg, padding: 16 }}><Aviso texto={error} /></View> : <Cargando />
  const p = a.publicacion

  async function megusta() {
    try {
      const r = await comunidad<{ likes: number; megusta: boolean }>(`/comunidad/p/${p.id}/megusta`, {})
      setA((v) => v && { ...v, publicacion: { ...v.publicacion, ...r } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function comentar() {
    if (!texto.trim() || mandando) return
    setMandando(true)
    setError('')
    try {
      const nuevo = await comunidad<ComentarioComunidad>(`/comunidad/p/${p.id}/comentar`, { texto: texto.trim(), adjuntos: [], ...(responde ? { responde: responde.responde ?? responde.id } : {}) })
      setA((v) => v && { publicacion: { ...v.publicacion, comentarios: v.publicacion.comentarios + 1 }, comentarios: [...v.comentarios, nuevo] })
      setTexto('')
      setResponde(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMandando(false)
    }
  }

  const primeros = a.comentarios.filter((x) => !x.responde)
  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <View style={s.autor}>
          <Cara autor={p.autor} tam={40} />
          <View style={{ flex: 1 }}>
            <Text style={s.nombre}>{p.autor.nombre}</Text>
            <Text style={s.detalle}>{hace(p.creada)}</Text>
          </View>
        </View>
        {!!p.titulo && <Text style={s.titulo}>{p.titulo}</Text>}
        {!!p.texto && <Markdown texto={p.texto} />}
        {p.adjuntos.map((x) => (
          <Adjunto key={x.llave} a={x} />
        ))}
        <View style={s.acciones}>
          <Pressable accessibilityRole="button" accessibilityLabel="Me gusta" onPress={() => void megusta()} style={s.accion}>
            <Icono de="pulgar" color={p.megusta ? c.amber : c.muted} tam={18} />
            <Text style={[s.detalle, p.megusta && { color: c.amber }]}>{p.likes}</Text>
          </Pressable>
          <View style={s.accion}>
            <Icono de="hilo" color={c.muted} tam={18} />
            <Text style={s.detalle}>{p.comentarios}</Text>
          </View>
        </View>
        <Aviso texto={error} />
        {primeros.map((x) => (
          <View key={x.id} style={{ gap: 8 }}>
            <Comentario c={x} onResponder={() => setResponde(x)} />
            {a.comentarios
              .filter((r) => r.responde === x.id)
              .map((r) => (
                <View key={r.id} style={s.respuesta}>
                  <Comentario c={r} onResponder={() => setResponde(x)} />
                </View>
              ))}
          </View>
        ))}
      </ScrollView>
      <View style={[s.campoCaja, { paddingBottom: abajo + 8 }]}>
        {responde && (
          <Pressable onPress={() => setResponde(undefined)} style={s.respondiendo}>
            <Text style={s.detalle} numberOfLines={1}>{`Respondes a ${responde.autor.nombre}`}</Text>
            <Icono de="cerrar" color={c.muted} tam={14} />
          </Pressable>
        )}
        <View style={s.campoFila}>
          <TextInput style={s.campo} value={texto} onChangeText={setTexto} placeholder="Escribe un comentario…" placeholderTextColor={c.muted} multiline />
          <Pressable accessibilityRole="button" accessibilityLabel="Comentar" disabled={!texto.trim() || mandando} onPress={() => void comentar()} style={[s.enviar, (!texto.trim() || mandando) && { opacity: 0.4 }]}>
            <Icono de="flechaArriba" color={c.sobreAmbar} tam={18} grosor={2.4} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

function Comentario({ c: x, onResponder }: { c: ComentarioComunidad; onResponder(): void }) {
  return (
    <View style={s.comentario}>
      <Cara autor={x.autor} tam={28} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.nombreChico}>
          {x.autor.nombre}
          <Text style={s.detalle}>{`  ${hace(x.creada)}`}</Text>
        </Text>
        <Text style={s.comentarioTexto} selectable>
          {x.texto}
        </Text>
        {x.adjuntos?.map((a) => <Adjunto key={a.llave} a={a} />)}
        <Pressable onPress={onResponder} hitSlop={6}>
          <Text style={s.responder}>Responder</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Adjunto({ a }: { a: AdjuntoComunidad }) {
  if (a.tipo === 'video') return <VideoAdjunto a={a} />
  if (a.tipo === 'imagen') return <Image source={{ uri: a.url }} style={s.imagen} resizeMode="contain" />
  return (
    <View style={s.estilo}>
      <Icono de="claqueta" color={c.amber} tam={18} />
      <Text style={s.nombreChico}>{a.nombre ?? 'Un estilo'}</Text>
      <Text style={s.detalle}>Se instala desde Sloth en tu computadora.</Text>
    </View>
  )
}

function VideoAdjunto({ a }: { a: AdjuntoComunidad }) {
  const player = useVideoPlayer({ uri: a.url }, (p) => (p.loop = true))
  return (
    <View style={[s.video, { aspectRatio: a.vertical ? 9 / 16 : 16 / 9 }]}>
      <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 12 },
  autor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nombre: { color: c.text, fontSize: 15.5, fontWeight: '700' },
  nombreChico: { color: c.text, fontSize: 13.5, fontWeight: '700' },
  detalle: { color: c.muted, fontSize: 12.5, fontWeight: '400' },
  titulo: { color: c.text, fontSize: 20, fontWeight: '800' },
  imagen: { width: '100%', aspectRatio: 4 / 3, borderRadius: radio, backgroundColor: c.panel2 },
  video: { width: '100%', maxHeight: 520, alignSelf: 'center', borderRadius: radio, overflow: 'hidden', backgroundColor: '#000' },
  estilo: { gap: 4, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.line, backgroundColor: c.panel },
  acciones: { flexDirection: 'row', gap: 18, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 12 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comentario: { flexDirection: 'row', gap: 10 },
  comentarioTexto: { color: c.suave, fontSize: 14, lineHeight: 20 },
  respuesta: { marginLeft: 38 },
  responder: { color: c.muted, fontSize: 12.5, fontWeight: '600' },
  campoCaja: { borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: 12, paddingTop: 8, gap: 6, backgroundColor: c.bg },
  respondiendo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  campoFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  campo: { flex: 1, maxHeight: 120, backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  enviar: { width: 42, height: 42, borderRadius: 12, backgroundColor: c.amber, alignItems: 'center', justifyContent: 'center' }
})
