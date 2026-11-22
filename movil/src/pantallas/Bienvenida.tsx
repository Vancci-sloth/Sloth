/**
 * La primera vez: dónde trabaja Sloth (`modo.ts`). Solo en el celular, con tu llave de Claude, o pidiéndole el trabajo a
 * tu computadora. Las dos se cambian después en Más.
 */
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Icono, type NombreIcono } from '../Icono'
import { elegirModo } from '../modo'
import { c, radio } from '../tema'
import { Gamma } from '../ui'

export function Bienvenida() {
  return (
    <SafeAreaView style={s.raiz}>
      <ScrollView contentContainerStyle={s.contenido}>
        <Image source={require('../../assets/splash-icon.png')} style={s.logo} />
        <Text style={s.titulo}>Sloth en tu celular</Text>
        <Gamma />
        <Text style={s.texto}>¿Dónde quieres que trabaje? Puedes cambiarlo cuando quieras en Más.</Text>
        <Opcion
          icono="movil"
          titulo="En este celular"
          texto="Sin computadora. El agente trabaja aquí con tu llave de la API de Claude: ideas, investigación en la web y guiones de tus estilos, con tus fotos y tu voz. Para armar el video final, lo pasas a tu computadora cuando quieras."
          onPress={() => elegirModo('celular')}
        />
        <Opcion
          icono="globo"
          titulo="Con mi computadora"
          texto="Tu computadora con Sloth hace el video completo (voz, render, todo) y aquí lo pides, lo sigues en vivo y lo guardas o lo compartes. Necesita el mismo Wi-Fi o Tailscale."
          onPress={() => elegirModo('computadora')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

function Opcion({ icono, titulo, texto, onPress }: { icono: NombreIcono; titulo: string; texto: string; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={titulo} onPress={onPress} style={({ pressed }) => [s.opcion, pressed && { opacity: 0.8 }]}>
      <View style={s.icono}>
        <Icono de={icono} color={c.amber} tam={26} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.opcionTitulo}>{titulo}</Text>
        <Text style={s.opcionTexto}>{texto}</Text>
      </View>
      <Icono de="siguiente" color={c.muted} tam={18} />
    </Pressable>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 24, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { width: 96, height: 96, alignSelf: 'center', marginTop: 12 },
  titulo: { color: c.text, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  texto: { color: c.suave, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 4 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio },
  icono: { backgroundColor: c.amberTinte, borderRadius: radio, padding: 10 },
  opcionTitulo: { color: c.text, fontSize: 17, fontWeight: '700' },
  opcionTexto: { color: c.muted, fontSize: 13.5, lineHeight: 19 }
})
