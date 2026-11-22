/**
 * Un hilo nuevo en el celular: lo que pides, el formato y el modelo de Claude. Los adjuntos se copian a la carpeta del
 * hilo (`guardarAdjunto`) y el agente arranca en el teléfono (`turno`).
 */
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Compositor, type Adjunto } from '../../Compositor'
import { Elegir } from '../../Elegir'
import { Icono } from '../../Icono'
import { esIconoValido } from '../../iconos'
import { estiloLocal, turno, type AdjuntoLocal } from '../../local/agente'
import { guardarAdjunto } from '../../local/archivos'
import { crearHilo } from '../../local/hilos'
import { llaveClaude } from '../../local/llave'
import { MODELO_POR_DEFECTO, MODELOS } from '../../local/puro'
import { recordado, recordar } from '../../recordar'
import type { RutasCelular } from '../../rutas'
import { c, radio } from '../../tema'
import { Segmento, Titulo, Vacio } from '../../ui'

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Copia los adjuntos a la carpeta del hilo y da lo que necesita el agente. */
export async function copiarAdjuntos(id: string, adjuntos: Adjunto[]): Promise<AdjuntoLocal[]> {
  const fuera: AdjuntoLocal[] = []
  for (const a of adjuntos) {
    const copia = await guardarAdjunto(id, a.uri, a.nombre)
    fuera.push({ ...copia, tipo: a.tipo })
  }
  return fuera
}

export function NuevoLocal({ route, navigation }: NativeStackScreenProps<RutasCelular, 'NuevoLocal'>) {
  const estilo = estiloLocal(route.params.estiloId)
  const abajo = useSafeAreaInsets().bottom
  const [formato, setFormato] = useState<'vertical' | 'horizontal'>(() => recordado(`local.formato.${route.params.estiloId}`, 'vertical'))
  const [modelo, setModelo] = useState<string>(() => recordado('local.modelo', MODELO_POR_DEFECTO))

  useEffect(() => navigation.setOptions({ title: estilo?.title ?? 'Hilo nuevo' }), [estilo?.title, navigation])
  if (!estilo) return <Vacio icono="alerta" titulo="Ese estilo ya no está" />

  async function enviar(texto: string, adjuntos: Adjunto[]) {
    if (!estilo) return
    if (!llaveClaude()) {
      navigation.navigate('LlaveClaude')
      throw new Error('Primero pon tu llave de la API de Claude; lo que escribiste se queda aquí.')
    }
    const id = nuevoId()
    const titulo = (texto.split('\n')[0] || estilo.title).slice(0, 80)
    await crearHilo({ id, cardId: estilo.id, title: titulo, model: modelo })
    const copiados = await copiarAdjuntos(id, adjuntos)
    navigation.replace('HiloLocal', { id })
    // El agente sigue aunque cambies de pantalla: lo que pasa se guarda en el hilo.
    void turno(id, [texto.trim(), `Formato: ${formato}`].filter(Boolean).join('\n\n'), copiados).catch(() => {})
  }

  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={[s.contenido, { paddingBottom: abajo + 16 }]} keyboardShouldPersistTaps="handled">
        <View style={s.cabeza}>
          <View style={s.icono}>
            <Icono de={esIconoValido(estilo.icon) ? estilo.icon : 'video'} color={c.amber} tam={26} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.titulo}>{estilo.title}</Text>
            <Text style={s.descripcion}>{estilo.description}</Text>
          </View>
        </View>
        {estilo.guia && (
          <View style={s.guia}>
            <Text style={s.guiaTexto}>
              <Text style={s.guiaNombre}>Le das: </Text>
              {estilo.guia.das}
            </Text>
            <Text style={s.guiaTexto}>
              <Text style={s.guiaNombre}>En el celular sale: </Text>
              la idea, la investigación y el guion. El video lo termina tu computadora.
            </Text>
          </View>
        )}
        <Compositor
          placeholder={estilo.guia?.ejemplo ? `Por ejemplo: ${estilo.guia.ejemplo}` : '¿De qué va el video? Pega enlaces, cuenta la idea…'}
          arriba={
            <View style={s.opciones}>
              <Titulo>Formato</Titulo>
              <Segmento
                valor={formato}
                opciones={[
                  { id: 'vertical', texto: 'Vertical · TikTok' },
                  { id: 'horizontal', texto: 'Horizontal · YouTube' }
                ]}
                onCambio={(f) => (setFormato(f), recordar(`local.formato.${estilo.id}`, f))}
              />
              <Elegir
                etiqueta="Modelo"
                titulo="Qué Claude hace el trabajo"
                valor={modelo}
                opciones={MODELOS.map((m) => ({ id: m.id, texto: m.label, detalle: `${m.detalle} · $${m.entrada} / $${m.salida} por millón de tokens` }))}
                onCambio={(m) => (setModelo(m), recordar('local.modelo', m))}
              />
            </View>
          }
          onEnviar={enviar}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 16 },
  cabeza: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icono: { backgroundColor: c.amberTinte, borderRadius: radio, padding: 10 },
  titulo: { color: c.text, fontSize: 22, fontWeight: '800' },
  descripcion: { color: c.suave, fontSize: 14, lineHeight: 20 },
  guia: { gap: 6, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, padding: 12 },
  guiaTexto: { color: c.suave, fontSize: 13.5, lineHeight: 19 },
  guiaNombre: { color: c.text, fontWeight: '700' },
  opciones: { gap: 10 }
})
