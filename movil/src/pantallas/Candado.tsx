/**
 * La app cerrada (`candado.ts`): el creador la dejó solo para quienes apoyan Sloth. Se entra con la clave de Sloth. Sin
 * botón ni enlace para pagar: Google Play no deja mandar a pagar fuera de su cobro.
 */
import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { entrarConClave, revisarCandado, useCandado } from '../candado'
import { c, radio } from '../tema'
import { Aviso, Boton } from '../ui'

export function Candado() {
  const candado = useCandado()
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function hacer(f: () => Promise<void>) {
    setError('')
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const deAntes = !error && (candado.error || (candado.email && !candado.apoya ? `La clave de ${candado.email} no tiene un apoyo activo hoy.` : ''))
  return (
    <SafeAreaView style={s.raiz}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          <Image source={require('../../assets/splash-icon.png')} style={s.logo} />
          <Text style={s.titulo}>Sloth en el celular es para quienes apoyan Sloth</Text>
          <Text style={s.texto}>
            Entra con tu clave de Sloth: empieza con «SLOTH-» y te llegó por correo. Si ya conectaste este celular a tu computadora con Sloth, usa la de ella sola.
          </Text>
          {deAntes ? <Aviso texto={deAntes} /> : null}
          <TextInput
            style={s.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="SLOTH-XXXX-XXXX-XXXX-XXXX"
            placeholderTextColor={c.muted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Aviso texto={error} />
          <Boton texto="Entrar" tipo="primario" ocupado={ocupado} disabled={!texto.trim()} onPress={() => void hacer(() => entrarConClave(texto))} />
          <Boton texto="Volver a revisar" icono="recargar" tipo="quieto" disabled={ocupado} onPress={() => void hacer(revisarCandado)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 20, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  logo: { width: 72, height: 72, alignSelf: 'center', marginTop: 24 },
  titulo: { color: c.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  texto: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  campo: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, letterSpacing: 1 }
})
