/** «Más»: a qué computadora estás conectado, «Sobre ti» y desconectar el celular. */
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { versionDeLaApp } from '../actualizacion'
import { olvidarConexion, useConexion } from '../conexion'
import { Icono, type NombreIcono } from '../Icono'
import type { Rutas } from '../rutas'
import { apagar, useSloth } from '../sloth'
import { elegirModo } from '../modo'
import { c, radio } from '../tema'
import { Punto, Titulo } from '../ui'

export function Mas() {
  const navigation = useNavigation<NativeStackNavigationProp<Rutas>>()
  const conexion = useConexion()
  const { enLinea, sessions } = useSloth()
  const trabajando = sessions.filter((x) => x.running).length

  function desconectar() {
    const salir = () => {
      apagar()
      void olvidarConexion()
    }
    if (Platform.OS === 'web') return salir()
    Alert.alert('¿Desconectar este celular?', 'Para volver a entrar tendrás que escanear otra vez el código de tu computadora. Lo que trabaja allá sigue trabajando.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desconectar', style: 'destructive', onPress: salir }
    ])
  }

  return (
    <ScrollView style={s.raiz} contentContainerStyle={s.contenido}>
      <Titulo>Tu computadora</Titulo>
      <View style={s.panel}>
        <View style={s.fila}>
          <Punto estado={enLinea ? 'ok' : 'error'} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.nombre}>{conexion?.equipo ?? 'Tu computadora'}</Text>
            <Text style={s.detalle}>
              {[enLinea ? 'Conectado' : 'Sin conexión', conexion?.base.replace('http://', ''), conexion?.version && `Sloth ${conexion.version}`].filter(Boolean).join(' · ')}
            </Text>
            {trabajando > 0 && <Text style={[s.detalle, { color: c.amber }]}>{`${trabajando} ${trabajando === 1 ? 'hilo trabajando' : 'hilos trabajando'} ahora`}</Text>}
          </View>
        </View>
      </View>

      <Titulo>Sloth</Titulo>
      <View style={s.panel}>
        <Opcion icono="lapiz" nombre="Sobre ti" detalle="Lo que tus agentes saben de ti en cada hilo" onPress={() => navigation.navigate('SobreTi')} />
      </View>

      <Titulo>Este celular</Titulo>
      <View style={s.panel}>
        <Opcion icono="movil" nombre="Trabajar solo en este celular" detalle="Sin computadora, con tu llave de Claude" onPress={() => elegirModo('celular')} />
        <Opcion icono="cerrar" nombre="Desconectar" detalle="Olvida la computadora y su llave" onPress={desconectar} peligro raya />
      </View>
      <Text style={s.version}>{`Sloth para celular ${versionDeLaApp()} · versión GAMMA`}</Text>
    </ScrollView>
  )
}

function Opcion({ icono, nombre, detalle, onPress, raya, peligro }: { icono: NombreIcono; nombre: string; detalle: string; onPress(): void; raya?: boolean; peligro?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fila, raya && s.raya, pressed && { backgroundColor: c.panel2 }]}>
      <Icono de={icono} color={peligro ? c.bad : c.amber} tam={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.nombre, peligro && { color: c.bad }]}>{nombre}</Text>
        <Text style={s.detalle}>{detalle}</Text>
      </View>
      <Icono de="siguiente" color={c.muted} tam={16} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 10 },
  panel: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, overflow: 'hidden', marginBottom: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  raya: { borderTopWidth: 1, borderTopColor: c.line },
  nombre: { color: c.text, fontSize: 15, fontWeight: '600' },
  detalle: { color: c.muted, fontSize: 13 },
  version: { color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }
})
