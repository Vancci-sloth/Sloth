/** «Más» del modo celular: la llave de Claude, «Sobre ti», y pasar a trabajar con la computadora. */
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { versionDeLaApp } from '../../actualizacion'
import { useConexion } from '../../conexion'
import { Icono, type NombreIcono } from '../../Icono'
import { useLlave } from '../../local/llave'
import { elegirModo } from '../../modo'
import { recordado, recordar } from '../../recordar'
import type { RutasCelular } from '../../rutas'
import { c, radio } from '../../tema'
import { Boton, Titulo } from '../../ui'

export function MasLocal() {
  const navigation = useNavigation<NativeStackNavigationProp<RutasCelular>>()
  const llave = useLlave()
  const conexion = useConexion()
  return (
    <ScrollView style={s.raiz} contentContainerStyle={s.contenido}>
      <Titulo>Este celular</Titulo>
      <View style={s.panel}>
        <Opcion icono="ajustar" nombre="Claude" detalle={llave ? `Llave guardada (…${llave.slice(-4)})` : 'Falta tu llave de la API'} onPress={() => navigation.navigate('LlaveClaude')} />
        <Opcion icono="lapiz" nombre="Sobre ti" detalle="Lo que el agente sabe de ti en cada hilo" onPress={() => navigation.navigate('SobreTiLocal')} raya />
      </View>
      <Titulo>Tu computadora</Titulo>
      <View style={s.panel}>
        <Opcion
          icono="globo"
          nombre={conexion ? `Trabajar con ${conexion.equipo}` : 'Conectar tu computadora'}
          detalle={conexion ? 'Ver sus estilos, sus hilos y sus videos terminados' : 'Para el video final y tus hilos de allá'}
          onPress={() => elegirModo('computadora')}
        />
      </View>
      <Text style={s.version}>{`Sloth para celular ${versionDeLaApp()} · versión GAMMA`}</Text>
    </ScrollView>
  )
}

function Opcion({ icono, nombre, detalle, onPress, raya }: { icono: NombreIcono; nombre: string; detalle: string; onPress(): void; raya?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.fila, raya && s.raya, pressed && { backgroundColor: c.panel2 }]}>
      <Icono de={icono} color={c.amber} tam={20} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.nombre}>{nombre}</Text>
        <Text style={s.detalle}>{detalle}</Text>
      </View>
      <Icono de="siguiente" color={c.muted} tam={16} />
    </Pressable>
  )
}

/** «Sobre ti» del celular: va en las instrucciones del agente de cada hilo nuevo. */
export function SobreTiLocal() {
  const [texto, setTexto] = useState(() => recordado('local.sobreTi', ''))
  const [guardado, setGuardado] = useState(texto)
  return (
    <ScrollView style={s.raiz} contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <Text style={s.texto}>Tu canal, tu tono, a quién le hablas, lo que nunca quieres en un video. El agente lo lee al empezar cada turno.</Text>
      <TextInput style={s.campo} value={texto} onChangeText={setTexto} multiline placeholder="Hago videos de… para…" placeholderTextColor={c.muted} />
      <Boton texto={texto === guardado ? 'Guardado' : 'Guardar'} tipo="primario" disabled={texto === guardado} onPress={() => (recordar('local.sobreTi', texto), setGuardado(texto))} />
    </ScrollView>
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
  version: { color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  texto: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  campo: { minHeight: 220, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, padding: 12, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }
})
