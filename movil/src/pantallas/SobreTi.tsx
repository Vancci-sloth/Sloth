/** «Sobre ti» (`server/sobre-ti.ts`): lo que cuentas de ti y que va con las instrucciones de todos los agentes. */
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from 'react-native'
import { api } from '../api'
import { c, radio } from '../tema'
import { Aviso, Boton, Cargando } from '../ui'

export function SobreTi() {
  const [texto, setTexto] = useState<string>()
  const [guardado, setGuardado] = useState('')
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info' }>()
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => void api<{ texto: string }>('/api/sobre-ti').then((r) => (setTexto(r.texto), setGuardado(r.texto)), (e) => setAviso({ texto: e.message, tipo: 'error' })), [])

  if (texto === undefined) return aviso ? <Aviso texto={aviso.texto} /> : <Cargando />
  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Text style={s.texto}>Tu canal, tu tono, a quién le hablas, lo que nunca quieres en un video. Lo leen todos tus agentes al empezar cada hilo.</Text>
        <TextInput style={s.campo} value={texto} onChangeText={setTexto} multiline placeholder="Hago videos de… para…" placeholderTextColor={c.muted} />
        {aviso && <Aviso texto={aviso.texto} tipo={aviso.tipo} />}
        <Boton
          texto="Guardar"
          tipo="primario"
          ocupado={ocupado}
          disabled={texto === guardado}
          onPress={() => {
            setOcupado(true)
            setAviso(undefined)
            void api('/api/sobre-ti', { texto })
              .then(() => (setGuardado(texto), setAviso({ texto: 'Guardado. Lo usan los hilos que empiecen desde ahora.', tipo: 'info' })))
              .catch((e) => setAviso({ texto: e.message, tipo: 'error' }))
              .finally(() => setOcupado(false))
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 12 },
  texto: { color: c.suave, fontSize: 14.5, lineHeight: 21 },
  campo: { minHeight: 240, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, padding: 12, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }
})
