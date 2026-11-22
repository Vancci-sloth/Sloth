/**
 * La comunidad de Sloth en el celular: el mismo feed que la computadora (`web/src/Comunidad.tsx`), que pasa por tu Sloth
 * con tu cuenta (por tu computadora o, sin ella, directo: `comunidadApi.ts`). Se lee por secciones, se abre una publicación con sus
 * comentarios y se escribe una nueva. Sin cuenta de la comunidad, dice cómo crearla en la computadora.
 */
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { Autor, CategoriaComunidad, FeedComunidad, PublicacionComunidad } from '../../../shared/types'
import { ErrorApi } from '../api'
import { comunidad } from '../comunidadApi'
import { Icono, type NombreIcono } from '../Icono'
import type { Rutas } from '../rutas'
import { c, radio } from '../tema'
import { Aviso, Boton, Cargando, Vacio } from '../ui'

/** Las secciones, como en la computadora. Anuncios solo lo escribe el creador. */
export const SECCIONES: { id: CategoriaComunidad; nombre: string; icono: NombreIcono }[] = [
  { id: 'general', nombre: 'General', icono: 'hilo' },
  { id: 'hice', nombre: 'Lo que hice', icono: 'video' },
  { id: 'ayuda', nombre: 'Ayuda', icono: 'pregunta' },
  { id: 'mejoras', nombre: 'Mejoras', icono: 'flechaArriba' },
  { id: 'estilos', nombre: 'Estilos', icono: 'claqueta' },
  { id: 'anuncios', nombre: 'Anuncios', icono: 'megafono' }
]

/** «hace 5 min», «hace 3 h», «12 nov». */
export function hace(fecha: string): string {
  const min = Math.round((Date.now() - Date.parse(fecha)) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  return new Date(fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function Cara({ autor, tam = 34 }: { autor: Autor; tam?: number }) {
  return autor.foto ? (
    <Image source={{ uri: autor.foto }} style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: c.panel2 }} />
  ) : (
    <View style={{ width: tam, height: tam, borderRadius: tam / 2, backgroundColor: c.amberTinte, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.amber, fontWeight: '800', fontSize: tam * 0.42 }}>{(autor.nombre || '?').charAt(0).toUpperCase()}</Text>
    </View>
  )
}

export function Comunidad() {
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const [seccion, setSeccion] = useState<CategoriaComunidad | ''>('')
  const [feed, setFeed] = useState<FeedComunidad>()
  const [lista, setLista] = useState<PublicacionComunidad[]>([])
  const [error, setError] = useState<{ texto: string; sinCuenta: boolean }>()
  const [tirando, setTirando] = useState(false)
  const [masCargando, setMasCargando] = useState(false)

  const consulta = (extra: Record<string, string> = {}) => new URLSearchParams({ ...(seccion ? { categoria: seccion } : {}), ...extra }).toString()
  const leer = useCallback(
    () =>
      comunidad<FeedComunidad>(`/comunidad?${consulta()}`).then(
        (f) => (setFeed(f), setLista(f.publicaciones), setError(undefined)),
        (e) => setError({ texto: e.message, sinCuenta: e instanceof ErrorApi && e.status === 401 })
      ),
    [seccion]
  )
  useEffect(() => {
    setFeed(undefined)
    void leer()
  }, [leer])

  // Navegar de vuelta tras publicar o comentar: la lista se pone al día.
  useEffect(() => navigation.addListener('focus', () => void leer()), [navigation, leer])

  function masAbajo() {
    const ultima = lista.filter((p) => !p.fijada).at(-1)
    if (!feed?.mas || !ultima || masCargando) return
    setMasCargando(true)
    comunidad<FeedComunidad>(`/comunidad?${consulta({ antes: ultima.actividad })}`)
      .then((f) => {
        setLista((l) => [...l, ...f.publicaciones.filter((p) => !l.some((x) => x.id === p.id))])
        setFeed((v) => v && { ...v, mas: f.mas })
      })
      .catch(() => {})
      .finally(() => setMasCargando(false))
  }

  if (error && !feed)
    return error.sinCuenta ? (
      <Vacio icono="personas" titulo="Entra a la comunidad" texto={`${error.texto} Si aún no tienes cuenta, créala gratis en Sloth de tu computadora (sección Comunidad).`}>
        <Boton texto="Ya la creé" icono="recargar" onPress={() => void leer()} />
      </Vacio>
    ) : (
      <View style={s.raiz}><View style={{ padding: 16 }}><Aviso texto={error.texto} /></View></View>
    )

  return (
    <View style={s.raiz}>
      <View style={s.seccionesBarra}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.secciones}>
        {[{ id: '' as const, nombre: 'Todo', icono: 'globo' as NombreIcono }, ...SECCIONES].map((x) => {
          const si = x.id === seccion
          return (
            <Pressable key={x.id || 'todo'} onPress={() => setSeccion(x.id)} style={[s.seccion, si && s.seccionSi]}>
              <Icono de={x.icono} color={si ? c.amber : c.muted} tam={15} />
              <Text style={[s.seccionTexto, si && { color: c.amber }]}>{x.nombre}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
      </View>
      {!feed ? (
        <Cargando texto="Leyendo la comunidad…" />
      ) : (
        <FlatList
          data={lista}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.lista}
          onEndReached={masAbajo}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={tirando} tintColor={c.amber} onRefresh={() => (setTirando(true), void leer().finally(() => setTirando(false)))} />}
          ListHeaderComponent={
            <View style={s.cabeza}>
              <Text style={s.numeros}>{`${feed.miembros.toLocaleString('es-MX')} miembros · ${feed.activos} hoy`}</Text>
              <Boton texto="Escribir" icono="lapiz" tipo="primario" onPress={() => navigation.navigate('Escribir', { seccion: seccion || 'general' })} />
            </View>
          }
          ListFooterComponent={masCargando ? <Cargando texto="Trayendo más…" /> : undefined}
          ListEmptyComponent={<Vacio icono="hilo" titulo="Nada por aquí todavía" />}
          renderItem={({ item }) => <Tarjeta p={item} onPress={() => navigation.navigate('Publicacion', { id: item.id })} />}
        />
      )}
    </View>
  )
}

function Tarjeta({ p, onPress }: { p: PublicacionComunidad; onPress(): void }) {
  const imagen = p.adjuntos.find((a) => a.tipo === 'imagen')?.url ?? p.adjuntos.find((a) => a.tipo === 'video')?.posterUrl
  const seccion = SECCIONES.find((x) => x.id === p.categoria)
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.tarjeta, pressed && { opacity: 0.8 }]}>
      <View style={s.autor}>
        <Cara autor={p.autor} />
        <View style={{ flex: 1 }}>
          <Text style={s.autorNombre} numberOfLines={1}>
            {p.autor.nombre}
            {p.autor.creador ? <Text style={s.creador}>  Creador</Text> : null}
          </Text>
          <Text style={s.detalle}>{[hace(p.creada), seccion?.nombre].filter(Boolean).join(' · ')}</Text>
        </View>
        {p.fijada && <Icono de="pin" color={c.amber} tam={16} />}
      </View>
      {!!p.titulo && <Text style={s.titulo}>{p.titulo}</Text>}
      {!!p.texto && (
        <Text style={s.texto} numberOfLines={4}>
          {p.texto}
        </Text>
      )}
      {imagen && <Image source={{ uri: imagen }} style={s.imagen} resizeMode="cover" />}
      <View style={s.pie}>
        <Icono de="pulgar" color={p.megusta ? c.amber : c.muted} tam={16} />
        <Text style={[s.detalle, p.megusta && { color: c.amber }]}>{p.likes}</Text>
        <Icono de="hilo" color={c.muted} tam={16} />
        <Text style={s.detalle}>{p.comentarios}</Text>
        {p.estado && <Text style={[s.detalle, { color: c.ok }]}>{p.estado === 'hecha' ? 'Hecha' : 'Haciéndose'}</Text>}
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  seccionesBarra: { height: 52, borderBottomWidth: 1, borderBottomColor: c.line },
  secciones: { gap: 6, paddingHorizontal: 12, alignItems: 'center' },
  seccion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radio },
  seccionSi: { backgroundColor: c.amberTinte },
  seccionTexto: { color: c.muted, fontSize: 14, fontWeight: '600' },
  lista: { padding: 12, gap: 10 },
  cabeza: { gap: 10, marginBottom: 4 },
  numeros: { color: c.muted, fontSize: 13 },
  tarjeta: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, padding: 12, gap: 8 },
  autor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  autorNombre: { color: c.text, fontSize: 14.5, fontWeight: '700' },
  creador: { color: c.amber, fontSize: 12, fontWeight: '600' },
  detalle: { color: c.muted, fontSize: 12.5 },
  titulo: { color: c.text, fontSize: 16, fontWeight: '700' },
  texto: { color: c.suave, fontSize: 14, lineHeight: 20 },
  imagen: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, backgroundColor: c.panel2 },
  pie: { flexDirection: 'row', alignItems: 'center', gap: 6 }
})
