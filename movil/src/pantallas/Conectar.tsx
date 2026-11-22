/**
 * La primera pantalla: conectar el celular con la Sloth de tu computadora, escaneando el QR de Opciones → Tu celular o
 * escribiendo su dirección y su llave. El mismo QR, leído con la cámara del celular, abre la app y conecta solo.
 */
import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { SafeAreaView } from 'react-native-safe-area-context'
import { conectar } from '../conexion'
import { leerEnlace, normalizarDireccion } from '../enlace'
import { elegirModo } from '../modo'
import { c, radio } from '../tema'
import { Aviso, Boton } from '../ui'

export function Conectar({ error: errorDeFuera }: { error?: string }) {
  const [permiso, pedirPermiso] = useCameraPermissions()
  const [escaneando, setEscaneando] = useState(false)
  const [aMano, setAMano] = useState(false)
  const [direccion, setDireccion] = useState('')
  const [llave, setLlave] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function probar(texto: string, llaveAMano?: string) {
    setError('')
    const destino = leerEnlace(texto) ?? (llaveAMano ? { direcciones: [normalizarDireccion(texto)].filter(Boolean), llave: llaveAMano.trim() } : null)
    if (!destino?.direcciones.length) {
      setError('Ese código no es el de Sloth. Escanea el de Opciones → Tu celular, en tu computadora.')
      return
    }
    setOcupado(true)
    try {
      await conectar(destino)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function escanear() {
    setError('')
    if (!permiso?.granted) {
      const r = await pedirPermiso()
      if (!r.granted) return setError('Sin la cámara no se puede leer el código. Escribe la dirección a mano o permite la cámara en los ajustes del celular.')
    }
    setEscaneando(true)
  }

  return (
    <SafeAreaView style={s.raiz}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/splash-icon.png')} style={s.logo} />
          <Text style={s.titulo}>Sloth en tu celular</Text>
          <Text style={s.texto}>
            Pide videos, sigue a los agentes mientras trabajan y guarda lo terminado en tu galería. El trabajo pesado lo sigue haciendo tu computadora: aquí lo mandas y lo ves.
          </Text>

          <View style={s.pasos}>
            <Paso n={1} texto="En tu computadora, abre Sloth y ve a Opciones → Tu celular." />
            <Paso n={2} texto="Enciende «Dejar entrar al celular»: sale un código." />
            <Paso n={3} texto="Escanéalo aquí. El celular y la computadora tienen que estar en el mismo Wi-Fi." />
          </View>

          {escaneando ? (
            <View style={s.camaraMarco}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={
                  ocupado
                    ? undefined
                    : ({ data }) => {
                        setEscaneando(false)
                        void probar(data)
                      }
                }
              />
            </View>
          ) : null}

          <Aviso texto={error || errorDeFuera || ''} />

          {escaneando ? (
            <Boton texto="Cancelar" tipo="quieto" onPress={() => setEscaneando(false)} />
          ) : (
            <Boton texto={ocupado ? 'Conectando…' : 'Escanear el código'} icono="mira" tipo="primario" ocupado={ocupado} onPress={() => void escanear()} />
          )}

          {!aMano ? (
            <Boton texto="Escribir la dirección a mano" tipo="quieto" onPress={() => setAMano(true)} />
          ) : (
            <View style={s.aMano}>
              <Text style={s.etiqueta}>Dirección (sale bajo el código)</Text>
              <TextInput
                style={s.campo}
                value={direccion}
                onChangeText={setDireccion}
                placeholder="192.168.1.20:4849"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'url'}
              />
              <Text style={s.etiqueta}>Llave (con «Copiar el enlace» también vale el enlace entero)</Text>
              <TextInput style={s.campo} value={llave} onChangeText={setLlave} placeholder="La llave o el enlace slothmovil://…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} />
              <Boton
                texto="Conectar"
                tipo="primario"
                ocupado={ocupado}
                disabled={!llave.trim() || (!direccion.trim() && !leerEnlace(llave))}
                onPress={() => void (leerEnlace(llave) ? probar(llave) : probar(direccion, llave))}
              />
            </View>
          )}
          <Boton texto="Mejor usarla solo en este celular" icono="movil" tipo="quieto" onPress={() => elegirModo('celular')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Paso({ n, texto }: { n: number; texto: string }) {
  return (
    <View style={s.paso}>
      <Text style={s.pasoN}>{n}</Text>
      <Text style={s.pasoTexto}>{texto}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 24, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { width: 96, height: 96, alignSelf: 'center', marginTop: 12 },
  titulo: { color: c.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  texto: { color: c.suave, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  pasos: { gap: 10, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, padding: 14 },
  paso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pasoN: { color: c.amber, fontWeight: '800', fontSize: 15, width: 16 },
  pasoTexto: { color: c.text, fontSize: 14.5, lineHeight: 21, flex: 1 },
  camaraMarco: { width: '100%', aspectRatio: 1, borderRadius: radio, overflow: 'hidden', borderWidth: 2, borderColor: c.amber, backgroundColor: c.panel },
  aMano: { gap: 8 },
  etiqueta: { color: c.muted, fontSize: 13 },
  campo: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }
})
