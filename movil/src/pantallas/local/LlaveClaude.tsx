/**
 * La llave de la API de Claude del modo celular (`local/llave.ts`). Antes de guardarla se prueba pidiendo la lista de
 * modelos, que no gasta nada: así una llave mal pegada se ve aquí y no a media conversación.
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Anthropic from '@anthropic-ai/sdk'
import { SafeAreaView } from 'react-native-safe-area-context'
import { guardarLlave, pareceLlave, useLlave } from '../../local/llave'
import { elegirModo } from '../../modo'
import { c, radio } from '../../tema'
import { Aviso, Boton } from '../../ui'

export function LlaveClaude({ alGuardar, primeraVez, navigation }: { alGuardar?(): void; primeraVez?: boolean; navigation?: { canGoBack(): boolean; goBack(): void } }) {
  const guardada = useLlave()
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function probar() {
    setError('')
    if (!pareceLlave(texto)) return setError('Eso no parece una llave de la API de Claude: empieza con «sk-ant-».')
    setOcupado(true)
    try {
      const cliente = new Anthropic({ apiKey: texto.trim(), dangerouslyAllowBrowser: true, baseURL: process.env.EXPO_PUBLIC_ANTHROPIC_BASE_URL || undefined })
      await cliente.models.list({ limit: 1 })
      await guardarLlave(texto)
      setTexto('')
      alGuardar?.()
      if (navigation?.canGoBack()) navigation.goBack()
    } catch (e) {
      setError(e instanceof Anthropic.AuthenticationError ? 'Esa llave no funciona: revisa que esté completa y activa.' : e instanceof Anthropic.APIConnectionError ? 'Sin internet: revisa tu conexión.' : e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  const Contenedor = primeraVez ? SafeAreaView : View
  return (
    <Contenedor style={s.raiz}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
          {primeraVez && <Text style={s.titulo}>Tu llave de Claude</Text>}
          <Text style={s.texto}>
            En el celular, el agente es Claude por su API, con tu propia cuenta: pagas solo lo que usas, directo a Anthropic. Crea una llave en console.anthropic.com (API Keys) y pégala aquí. Se guarda en el llavero de este celular y solo viaja a la API de Claude.
          </Text>
          <Boton texto="Abrir console.anthropic.com" icono="fuera" tipo="quieto" onPress={() => void Linking.openURL('https://console.anthropic.com/settings/keys')} />
          {guardada && !primeraVez && <Aviso tipo="info" texto={`Ya tienes una guardada (…${guardada.slice(-4)}). Pega otra para cambiarla.`} />}
          <TextInput
            style={s.campo}
            value={texto}
            onChangeText={setTexto}
            placeholder="sk-ant-…"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Aviso texto={error} />
          <Boton texto="Guardar" tipo="primario" ocupado={ocupado} disabled={!texto.trim()} onPress={() => void probar()} />
          {guardada && !primeraVez && <Boton texto="Quitar la llave" tipo="peligro" onPress={() => void guardarLlave(null)} />}
          {primeraVez && <Boton texto="Mejor con mi computadora" tipo="quieto" onPress={() => elegirModo('computadora')} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Contenedor>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 20, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  titulo: { color: c.text, fontSize: 24, fontWeight: '800', marginTop: 12 },
  texto: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  campo: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 }
})
