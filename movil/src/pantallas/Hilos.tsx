/** Los hilos, como la barra lateral de la computadora: los que trabajan arriba, cómo va su video y lo que espera de ti. */
import { useMemo, useState } from 'react'
import { Alert, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { FASES, type SessionMeta } from '../../../shared/types'
import { api } from '../api'
import { Icono } from '../Icono'
import { esIconoValido } from '../iconos'
import type { Rutas } from '../rutas'
import { refrescar, useSloth } from '../sloth'
import { c } from '../tema'
import { Punto, Segmento, Vacio } from '../ui'

/** «hace 5 min», «ayer», «3 nov». */
function cuando(t: number): string {
  const min = Math.round((Date.now() - t) / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`
  if (min < 48 * 60) return 'ayer'
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function Hilos() {
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const { sessions, cards, avances, cargado } = useSloth()
  const [vista, setVista] = useState<'activos' | 'archivados'>('activos')
  const [tirando, setTirando] = useState(false)

  const lista = useMemo(
    () =>
      sessions
        .filter((x) => !!x.archived === (vista === 'archivados'))
        .sort((a, b) => Number(b.running) - Number(a.running) || b.updatedAt - a.updatedAt),
    [sessions, vista]
  )

  function menu(h: SessionMeta) {
    const archivar = () => void api(`/api/sessions/${h.id}/archive`, { archived: !h.archived })
    if (Platform.OS === 'web') return archivar()
    Alert.alert(h.title, undefined, [
      { text: h.archived ? 'Sacar del archivo' : 'Archivar', onPress: archivar },
      ...(h.running ? [{ text: 'Parar al agente', style: 'destructive' as const, onPress: () => void api(`/api/sessions/${h.id}/stop`, {}) }] : []),
      { text: 'Cancelar', style: 'cancel' as const }
    ])
  }

  return (
    <FlatList
      style={s.raiz}
      data={lista}
      keyExtractor={(h) => h.id}
      contentContainerStyle={s.lista}
      refreshControl={<RefreshControl refreshing={tirando} tintColor={c.amber} onRefresh={() => (setTirando(true), void refrescar().finally(() => setTirando(false)))} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: 8 }}>
          <Segmento
            valor={vista}
            opciones={[
              { id: 'activos', texto: 'Hilos' },
              { id: 'archivados', texto: 'Archivados' }
            ]}
            onCambio={setVista}
          />
        </View>
      }
      ListEmptyComponent={cargado ? <Vacio icono="hilo" titulo={vista === 'activos' ? 'Ningún hilo todavía' : 'Nada archivado'} texto={vista === 'activos' ? 'Elige un estilo en Inicio y pide tu primer video.' : undefined} /> : undefined}
      renderItem={({ item: h }) => {
        const card = cards.find((x) => x.id === h.cardId)
        const a = avances[h.id]
        const fase = a?.fase && FASES.find((f) => f.id === a.fase)?.nombre
        const estado = h.running ? 'trabaja' : a?.espera ? 'espera' : h.acaboBien === false ? 'error' : a && !a.etapa && a.total > 0 ? 'ok' : 'quieto'
        const linea = h.pendiente
          ? 'Espera su turno'
          : a?.espera
            ? `Te espera: ${a.etapa ?? ''}`
            : a && a.total > 0
              ? a.etapa
                ? `${fase && fase !== a.etapa ? `${fase} · ` : ''}${a.etapa} · ${a.hechas}/${a.total}`
                : 'Video terminado'
              : h.running
                ? 'Trabajando…'
                : h.acaboBien === false
                  ? 'Se detuvo: ábrelo para ver por qué'
                  : (card?.title ?? '')
        return (
          <Pressable onPress={() => navigation.navigate('Hilo', { id: h.id })} onLongPress={() => menu(h)} style={({ pressed }) => [s.fila, pressed && { backgroundColor: c.panel }]}>
            <View style={s.icono}>
              <Icono de={esIconoValido(card?.icon) ? card.icon : 'hilo'} color={h.running ? c.amber : c.muted} tam={18} />
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
                <Text style={[s.linea, (estado === 'espera' || estado === 'trabaja') && { color: c.amber }, estado === 'error' && { color: c.bad }]} numberOfLines={1}>
                  {linea}
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
