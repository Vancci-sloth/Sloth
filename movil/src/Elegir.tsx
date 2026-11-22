/**
 * Un desplegable del celular: un renglón con lo elegido que, al tocarlo, sube una hoja con las opciones, por grupos y
 * con buscador si son muchas. Es el `Desplegable` de la computadora.
 */
import { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icono } from './Icono'
import { c, radio } from './tema'

export interface Opcion {
  id: string
  texto: string
  detalle?: string
  grupo?: string
}

export function Elegir({ etiqueta, valor, opciones, onCambio, titulo }: { etiqueta: string; valor: string; opciones: Opcion[]; onCambio(id: string): void; titulo?: string }) {
  const [abierto, setAbierto] = useState(false)
  const [busca, setBusca] = useState('')
  const abajo = useSafeAreaInsets().bottom
  const elegida = opciones.find((o) => o.id === valor)
  const filas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const vistas = q ? opciones.filter((o) => `${o.texto} ${o.detalle ?? ''} ${o.grupo ?? ''}`.toLowerCase().includes(q)) : opciones
    // Cada grupo, con su título antes de su primera opción.
    const out: (Opcion | { titulo: string })[] = []
    let grupo: string | undefined
    for (const o of vistas) {
      if (o.grupo && o.grupo !== grupo) out.push({ titulo: o.grupo })
      grupo = o.grupo
      out.push(o)
    }
    return out
  }, [opciones, busca])

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${etiqueta}: ${elegida?.texto ?? 'sin elegir'}`} onPress={() => setAbierto(true)} style={({ pressed }) => [s.renglon, pressed && { opacity: 0.7 }]}>
        <Text style={s.etiqueta}>{etiqueta}</Text>
        <Text style={s.valor} numberOfLines={1}>
          {elegida?.texto ?? 'Elegir'}
        </Text>
        <Icono de="siguiente" color={c.muted} tam={16} />
      </Pressable>
      <Modal visible={abierto} transparent animationType="slide" onRequestClose={() => setAbierto(false)}>
        <Pressable style={s.fondo} onPress={() => setAbierto(false)} />
        <View style={[s.hoja, { paddingBottom: abajo + 12 }]}>
          <View style={s.cabeza}>
            <Text style={s.titulo}>{titulo ?? etiqueta}</Text>
            <Pressable accessibilityLabel="Cerrar" hitSlop={10} onPress={() => setAbierto(false)}>
              <Icono de="cerrar" color={c.muted} tam={20} />
            </Pressable>
          </View>
          {opciones.length > 8 && (
            <TextInput style={s.buscar} value={busca} onChangeText={setBusca} placeholder="Buscar…" placeholderTextColor={c.muted} autoCorrect={false} />
          )}
          <FlatList
            style={{ flexGrow: 0, flexShrink: 1 }}
            data={filas}
            keyExtractor={(f, i) => ('id' in f ? `o:${f.id}` : `g:${f.titulo}:${i}`)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) =>
              'id' in item ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === valor }}
                  onPress={() => {
                    onCambio(item.id)
                    setAbierto(false)
                    setBusca('')
                  }}
                  style={({ pressed }) => [s.opcion, item.id === valor && s.opcionSi, pressed && { opacity: 0.7 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.opcionTexto, item.id === valor && { color: c.amber }]}>{item.texto}</Text>
                    {!!item.detalle && (
                      <Text style={s.opcionDetalle} numberOfLines={2}>
                        {item.detalle}
                      </Text>
                    )}
                  </View>
                  {item.id === valor && <Icono de="palomita" color={c.amber} tam={18} />}
                </Pressable>
              ) : (
                <Text style={s.grupo}>{item.titulo}</Text>
              )
            }
          />
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  renglon: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio },
  etiqueta: { color: c.muted, fontSize: 14 },
  valor: { flex: 1, color: c.text, fontSize: 14.5, fontWeight: '600', textAlign: 'right' },
  fondo: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  hoja: { maxHeight: '75%', backgroundColor: c.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderColor: c.line, borderWidth: 1, paddingHorizontal: 12, paddingTop: 14 },
  cabeza: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 10 },
  titulo: { color: c.text, fontSize: 17, fontWeight: '700' },
  buscar: { backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1, borderRadius: radio, color: c.text, paddingHorizontal: 12, paddingVertical: 9, fontSize: 15, marginBottom: 8 },
  grupo: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 8, paddingTop: 12, paddingBottom: 6 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 10 },
  opcionSi: { backgroundColor: c.amberTinte },
  opcionTexto: { color: c.text, fontSize: 15 },
  opcionDetalle: { color: c.muted, fontSize: 12.5 }
})
