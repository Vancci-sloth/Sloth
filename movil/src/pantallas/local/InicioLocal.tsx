/** Inicio del modo celular: los estilos de Sloth que viajan dentro de la app (`local/estilos.json`). */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ESTILOS } from '../../local/agente'
import type { EstiloLocal } from '../../local/puro'
import { Icono } from '../../Icono'
import { esIconoValido } from '../../iconos'
import type { RutasCelular } from '../../rutas'
import { useLlave } from '../../local/llave'
import { c, radio } from '../../tema'
import { Actualizacion } from '../../actualizacion'
import { Aviso, Boton, Gamma, Punto } from '../../ui'

export function InicioLocal() {
  const navigation = useNavigation<NativeStackNavigationProp<RutasCelular>>()
  const arriba = useSafeAreaInsets().top
  const llave = useLlave()
  return (
    <FlatList
      style={s.raiz}
      contentContainerStyle={[s.lista, { paddingTop: arriba + 16 }]}
      data={ESTILOS}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <View style={s.cabeza}>
          <View style={s.modo}>
            <Punto estado="ok" />
            <Text style={s.modoTexto}>Trabajando en este celular</Text>
          </View>
          <Gamma corto />
          <Actualizacion />
          <Text style={s.titulo}>¿Qué hacemos hoy?</Text>
          <Text style={s.sub}>Elige un estilo y cuéntale qué video quieres. Aquí se hacen la idea, la investigación y el guion; el video final lo arma tu computadora cuando se lo pases.</Text>
          {llave === null && (
            <View style={{ gap: 8 }}>
              <Aviso tipo="info" texto="Para que el agente trabaje en el celular hace falta tu llave de la API de Claude." />
              <Boton texto="Poner mi llave de Claude" icono="ajustar" onPress={() => navigation.navigate('LlaveClaude')} />
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <Fila e={item} onPress={() => navigation.navigate('NuevoLocal', { estiloId: item.id })} />}
    />
  )
}

function Fila({ e, onPress }: { e: EstiloLocal; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={e.title} onPress={onPress} style={({ pressed }) => [s.fila, pressed && { opacity: 0.75 }]}>
      <View style={s.icono}>
        <Icono de={esIconoValido(e.icon) ? e.icon : 'video'} color={c.amber} tam={24} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.nombre}>
          {e.title}
          {e.version ? <Text style={s.version}>{`  ${e.version}`}</Text> : null}
        </Text>
        <Text style={s.descripcion} numberOfLines={3}>
          {e.description}
        </Text>
      </View>
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 16, gap: 10 },
  cabeza: { gap: 8, marginBottom: 6 },
  modo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modoTexto: { color: c.muted, fontSize: 13 },
  titulo: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  fila: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 14, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio },
  icono: { backgroundColor: c.amberTinte, borderRadius: radio, padding: 10 },
  nombre: { color: c.text, fontSize: 16, fontWeight: '700' },
  version: { color: c.muted, fontSize: 12, fontWeight: '500' },
  descripcion: { color: c.muted, fontSize: 13, lineHeight: 18 }
})
