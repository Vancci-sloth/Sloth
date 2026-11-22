/**
 * Escribir en la comunidad desde el celular: la sección, un título, el texto y, si quieres, fotos de tu galería (suben al
 * cobro, `subirFotoComunidad`). Lo publica con tu cuenta de la comunidad.
 */
import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as ImagePicker from 'expo-image-picker'
import type { AdjuntoComunidad, CategoriaComunidad, PublicacionComunidad } from '../../../shared/types'
import { comunidad, subirFotoComunidad } from '../comunidadApi'
import { Elegir } from '../Elegir'
import { Icono } from '../Icono'
import type { Rutas } from '../rutas'
import { c, radio } from '../tema'
import { Aviso, Boton } from '../ui'
import { SECCIONES } from './Comunidad'

export function Escribir({ route, navigation }: NativeStackScreenProps<Rutas, 'Escribir'>) {
  const [seccion, setSeccion] = useState<CategoriaComunidad>(route.params.seccion === 'anuncios' ? 'general' : route.params.seccion)
  const [titulo, setTitulo] = useState('')
  const [texto, setTexto] = useState('')
  const [fotos, setFotos] = useState<AdjuntoComunidad[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [mandando, setMandando] = useState(false)
  const [error, setError] = useState('')

  async function elegirFotos() {
    setError('')
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4, quality: 0.9 })
    if (r.canceled) return
    setSubiendo(true)
    try {
      for (const x of r.assets) {
        const f = await subirFotoComunidad(x.uri, x.mimeType ?? 'image/jpeg')
        setFotos((l) => [...l, { tipo: 'imagen', ...f }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubiendo(false)
    }
  }

  async function publicar() {
    setMandando(true)
    setError('')
    try {
      const p = await comunidad<PublicacionComunidad>('/comunidad/publicar', { categoria: seccion, titulo: titulo.trim(), texto: texto.trim(), adjuntos: fotos })
      navigation.replace('Publicacion', { id: p.id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMandando(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
        <Elegir etiqueta="Sección" valor={seccion} opciones={SECCIONES.filter((x) => x.id !== 'anuncios' && x.id !== 'estilos').map((x) => ({ id: x.id, texto: x.nombre }))} onCambio={(v) => setSeccion(v as CategoriaComunidad)} />
        <TextInput style={s.titulo} value={titulo} onChangeText={setTitulo} placeholder="Título" placeholderTextColor={c.muted} maxLength={140} />
        <TextInput style={s.texto} value={texto} onChangeText={setTexto} placeholder="Cuéntalo aquí…" placeholderTextColor={c.muted} multiline />
        {fotos.length > 0 && (
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {fotos.map((f) => (
              <View key={f.llave}>
                <Image source={{ uri: f.url }} style={s.foto} />
                <Pressable accessibilityLabel="Quitar la foto" style={s.quitar} onPress={() => setFotos((l) => l.filter((x) => x.llave !== f.llave))}>
                  <Icono de="cerrar" color={c.text} tam={14} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}
        <Boton texto={subiendo ? 'Subiendo…' : 'Añadir fotos'} icono="imagen" ocupado={subiendo} onPress={() => void elegirFotos()} />
        <Aviso texto={error} />
        <Boton texto="Publicar" tipo="primario" ocupado={mandando} disabled={!titulo.trim() || !texto.trim() || subiendo} onPress={() => void publicar()} />
        <Text style={s.nota}>Lo ve toda la comunidad de Sloth, con tu nombre.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 12 },
  titulo: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, padding: 12, fontSize: 17, fontWeight: '700' },
  texto: { minHeight: 200, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, padding: 12, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  foto: { width: 96, height: 96, borderRadius: 10, backgroundColor: c.panel2 },
  quitar: { position: 'absolute', top: 4, right: 4, backgroundColor: c.panel, borderRadius: 10, padding: 3 },
  nota: { color: c.muted, fontSize: 12.5, textAlign: 'center' }
})
