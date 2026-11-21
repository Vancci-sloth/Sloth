/** Los hilos del celular, los que trabajan arriba. Mantener pulsado uno deja borrarlo. */
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Icono } from '../../Icono'
import { esIconoValido } from '../../iconos'
import { estiloLocal, parar } from '../../local/agente'
import { borrarHilo, useHilosLocales, type HiloLocal } from '../../local/hilos'
import type { RutasCelular } from '../../rutas'
import { c } from '../../tema'
import { Punto, Vacio } from '../../ui'

function cuando(t: number): string {
  const min = Math.round((Date.now() - t) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function HilosLocal() {
  const navigation = useNavigation<NativeStackNavigationProp<RutasCelular>>()
  const hilos = [...useHilosLocales()].sort((a, b) => Number(b.running) - Number(a.running) || b.updatedAt - a.updatedAt)

  function menu(h: HiloLocal) {
    const borrar = () => {
      parar(h.id)
      void borrarHilo(h.id)
    }
    if (Platform.OS === 'web') return borrar()
    Alert.alert(h.title, 'Se borran su chat y sus archivos de este celular.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: borrar }
    ])
  }

  return (
    <FlatList
      style={s.raiz}
      data={hilos}
      keyExtractor={(h) => h.id}
      contentContainerStyle={s.lista}
      ListEmptyComponent={<Vacio icono="hilo" titulo="Ningún hilo todavía" texto="Elige un estilo en Inicio y pide tu primer video." />}
      renderItem={({ item: h }) => {
        const e = estiloLocal(h.cardId)
        const estado = h.running ? 'trabaja' : h.acaboBien === false ? 'error' : 'quieto'
        return (
          <Pressable onPress={() => navigation.navigate('HiloLocal', { id: h.id })} onLongPress={() => menu(h)} style={({ pressed }) => [s.fila, pressed && { backgroundColor: c.panel }]}>
            <View style={s.icono}>
              <Icono de={esIconoValido(e?.icon) ? e.icon : 'hilo'} color={h.running ? c.amber : c.muted} tam={18} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={s.arriba}>
                <Text style={s.titulo} numberOfLines={1}>
                  {h.title}
                </Text>
                <Text style={s.cuando}>{cuando(h.updatedAt)}</Text>
              </View>
              <View style={s.arriba}>
                <Punto estado={estado} />
                <Text style={[s.linea, estado === 'trabaja' && { color: c.amber }, estado === 'error' && { color: c.bad }]} numberOfLines={1}>
                  {h.running ? 'Trabajando…' : h.acaboBien === false ? 'Se detuvo: ábrelo para ver por qué' : (e?.title ?? '')}
                </Text>
              </View>
            </View>
          </Pressable>
        )
      }}
    />
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 12, gap: 2 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 12 },
  icono: { width: 38, height: 38, borderRadius: 10, backgroundColor: c.panel2, alignItems: 'center', justifyContent: 'center' },
  arriba: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, color: c.text, fontSize: 15, fontWeight: '600' },
  cuando: { color: c.muted, fontSize: 12 },
  linea: { flex: 1, color: c.muted, fontSize: 13 }
})
