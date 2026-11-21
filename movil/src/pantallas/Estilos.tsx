/** Inicio: los estilos de tu Sloth, cada uno con el primer cuadro de su último video. Tocar uno abre un hilo nuevo. */
import { useEffect, useState } from 'react'
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Card, Previa } from '../../../shared/types'
import { esIconoValido } from '../iconos'
import { api, urlDe } from '../api'
import { useConexion } from '../conexion'
import { Icono } from '../Icono'
import { refrescar, useSloth } from '../sloth'
import { c, radio } from '../tema'
import { Aviso, Cargando, Gamma, Punto } from '../ui'
import type { Rutas } from '../rutas'

export function Estilos() {
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  // Inicio va sin encabezado: lo de arriba empieza bajo la barra de estado del celular.
  const arriba = useSafeAreaInsets().top
  const { cards, cargado, enLinea, error } = useSloth()
  const conexion = useConexion()
  const [previas, setPrevias] = useState<Record<string, Previa>>({})
  const [tirando, setTirando] = useState(false)
  useEffect(() => {
    if (cargado) void api<Record<string, Previa>>('/api/previas').then(setPrevias, () => {})
  }, [cargado, cards.length])

  if (!cargado) return error ? <View style={s.raiz}><View style={{ padding: 16, paddingTop: arriba + 16 }}><Aviso texto={error} /></View></View> : <Cargando texto={`Hablando con ${conexion?.equipo ?? 'tu computadora'}…`} />

  return (
    <FlatList
      style={s.raiz}
      contentContainerStyle={[s.lista, { paddingTop: arriba + 16 }]}
      data={cards.length % 2 ? [...cards, null] : cards}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      keyExtractor={(card) => card?.id ?? 'hueco'}
      refreshControl={<RefreshControl refreshing={tirando} tintColor={c.amber} onRefresh={() => (setTirando(true), void refrescar().finally(() => setTirando(false)))} />}
      ListHeaderComponent={
        <View style={s.cabeza}>
          <View style={s.equipo}>
            <Punto estado={enLinea ? 'ok' : 'error'} />
            <Text style={s.equipoTexto} numberOfLines={1}>
              {enLinea ? `Conectado a ${conexion?.equipo ?? 'tu computadora'}` : 'Sin conexión: reintentando…'}
            </Text>
          </View>
          <Gamma corto />
          <Text style={s.titulo}>¿Qué hacemos hoy?</Text>
          <Text style={s.sub}>Elige un estilo y cuéntale qué video quieres. Tu computadora hace el trabajo y aquí lo ves en vivo.</Text>
          {!!error && <Aviso texto={error} />}
        </View>
      }
      renderItem={({ item }) => (item ? <Tarjeta card={item} previa={previas[item.id]} onPress={() => navigation.navigate('Nuevo', { cardId: item.id })} /> : <View style={{ flex: 1 }} />)}
    />
  )
}

function Tarjeta({ card, previa, onPress }: { card: Card; previa?: Previa; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={card.title} onPress={onPress} style={({ pressed }) => [s.tarjeta, pressed && { opacity: 0.75 }]}>
      <View style={s.fondo}>
        {previa ? <Image source={{ uri: urlDe(previa.cuadro) }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View style={s.velo} />
        <View style={s.icono}>
          <Icono de={esIconoValido(card.icon) ? card.icon : 'video'} color={c.amber} tam={22} />
        </View>
        {card.bloqueada && (
          <View style={s.candado}>
            <Icono de="candado" color={c.text} tam={16} />
          </View>
        )}
      </View>
      <View style={s.textos}>
        <Text style={s.nombre} numberOfLines={1}>
          {card.title}
          {card.version ? <Text style={s.version}>{`  ${card.version}`}</Text> : null}
        </Text>
        <Text style={s.descripcion} numberOfLines={3}>
          {card.description}
        </Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 16, gap: 12 },
  cabeza: { gap: 8, marginBottom: 6 },
  equipo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  equipoTexto: { color: c.muted, fontSize: 13, flex: 1 },
  titulo: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  tarjeta: { flex: 1, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, overflow: 'hidden' },
  fondo: { aspectRatio: 4 / 3, backgroundColor: c.panel2 },
  velo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15, 14, 12, 0.35)' },
  icono: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(15, 14, 12, 0.75)', borderRadius: 10, padding: 7 },
  candado: { position: 'absolute', right: 10, top: 10, backgroundColor: 'rgba(15, 14, 12, 0.75)', borderRadius: 10, padding: 6 },
  textos: { padding: 10, gap: 4 },
  nombre: { color: c.text, fontSize: 15, fontWeight: '700' },
  version: { color: c.muted, fontSize: 12, fontWeight: '500' },
  descripcion: { color: c.muted, fontSize: 12.5, lineHeight: 17 }
})
