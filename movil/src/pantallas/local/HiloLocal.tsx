/**
 * Un hilo del celular: el mismo chat que uno de la computadora (las filas de `Hilo.tsx`), con el agente corriendo en el
 * teléfono. Arriba, sus archivos y «Seguir en la computadora».
 */
import { useEffect, useMemo, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { buildTimeline, delHilo } from '../../../../web/src/items'
import { Compositor } from '../../Compositor'
import { Icono } from '../../Icono'
import { parar, turno } from '../../local/agente'
import { useEventosLocal, useHilosLocales } from '../../local/hilos'
import type { RutasCelular } from '../../rutas'
import { c } from '../../tema'
import { BotonIcono, Cargando, Vacio } from '../../ui'
import { Fila, Trabajando } from '../Hilo'
import { copiarAdjuntos } from './NuevoLocal'

const SIN_RELEVOS: { model: string }[] = []

export function HiloLocal({ route, navigation }: NativeStackScreenProps<RutasCelular, 'HiloLocal'>) {
  const { id } = route.params
  const hilo = useHilosLocales().find((h) => h.id === id)
  const events = useEventosLocal(id)
  const abajo = useSafeAreaInsets().bottom
  const [respuesta, setRespuesta] = useState<string>()

  useEffect(() => {
    navigation.setOptions({
      title: hilo?.title ?? 'Hilo',
      headerRight: () => <BotonIcono icono="importar" nombre="Archivos del hilo" color={c.amber} onPress={() => navigation.navigate('ArchivosLocal', { id })} />
    })
  }, [hilo?.title, navigation, id])

  const items = useMemo(() => (events ? delHilo(buildTimeline(events)) : []), [events])
  const alReves = useMemo(() => [...items].reverse(), [items])

  if (!hilo) return <Vacio icono="alerta" titulo="Ese hilo ya no está" />
  if (!events) return <Cargando texto="Abriendo el hilo…" />

  const responder = (texto: string) => turno(id, texto, [])
  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Pressable onPress={() => navigation.navigate('ArchivosLocal', { id })} style={s.barra}>
        <Icono de="movil" color={c.amber} tam={16} />
        <Text style={s.barraTexto} numberOfLines={1}>
          En este celular · Archivos y «Seguir en la computadora»
        </Text>
        <Icono de="siguiente" color={c.muted} tam={16} />
      </Pressable>
      <FlatList
        inverted
        data={alReves}
        keyExtractor={(item) => item.key}
        contentContainerStyle={s.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Fila item={item} imagen={(uri) => uri} agente="claude" relevos={SIN_RELEVOS} onResponder={responder} onOpcion={setRespuesta} />}
        ListHeaderComponent={hilo.running ? <Trabajando /> : undefined}
      />
      <View style={[s.pie, { paddingBottom: abajo + 8 }]}>
        <Compositor
          placeholder={hilo.running ? 'Espera a que termine o páralo…' : 'Responde o pide un cambio…'}
          trabajando={hilo.running}
          onParar={() => parar(id)}
          texto={respuesta}
          bloqueo={hilo.running ? 'El agente está trabajando: espera a que acabe o páralo con el cuadro.' : undefined}
          onEnviar={async (texto, adjuntos) => {
            const copiados = await copiarAdjuntos(id, adjuntos)
            setRespuesta(undefined)
            void turno(id, texto, copiados).catch(() => {})
          }}
        />
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 14, gap: 12 },
  pie: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.panel },
  barraTexto: { flex: 1, color: c.suave, fontSize: 13.5 }
})
