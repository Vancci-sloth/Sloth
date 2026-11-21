/**
 * Lo que hay en la carpeta de un hilo del celular: el guion y lo demás que escribió el agente, y lo que adjuntaste. Se lee
 * aquí, se comparte, y «Seguir en la computadora» se lo pasa todo a tu Sloth para que arme el video.
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import * as Sharing from 'expo-sharing'
import { File } from 'expo-file-system'
import { useConexion } from '../../conexion'
import { Icono } from '../../Icono'
import { listar, type ArchivoDelHilo } from '../../local/archivos'
import { useHilosLocales } from '../../local/hilos'
import { seguirEnComputadora } from '../../local/seguir'
import { Markdown } from '../../Markdown'
import { elegirModo, pedirAbrir } from '../../modo'
import type { RutasCelular } from '../../rutas'
import { c, mono, radio } from '../../tema'
import { Aviso, Boton, Titulo, Vacio } from '../../ui'

const TEXTO = /\.(md|txt|json|srt)$/i
const IMAGEN = /\.(png|jpe?g|gif|webp)$/i

export function ArchivosLocal({ route }: NativeStackScreenProps<RutasCelular, 'ArchivosLocal'>) {
  const { id } = route.params
  const hilo = useHilosLocales().find((h) => h.id === id)
  const conexion = useConexion()
  const [archivos, setArchivos] = useState<ArchivoDelHilo[]>([])
  const [abierto, setAbierto] = useState<string>()
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'error' | 'info' }>()
  const [pasando, setPasando] = useState<string>()

  const leer = useCallback(() => setArchivos(listar(id)), [id])
  useEffect(leer, [leer, hilo?.updatedAt])

  async function seguir() {
    setAviso(undefined)
    setPasando('Preparando…')
    try {
      const meta = await seguirEnComputadora(id, setPasando)
      setPasando(undefined)
      const ir = () => (pedirAbrir(meta.id), elegirModo('computadora'))
      if (Platform.OS === 'web') return ir()
      Alert.alert('Ya sigue en tu computadora', `Tu Sloth abrió «${meta.title}» con lo de este hilo y lo está trabajando.`, [
        { text: 'Quedarme aquí', style: 'cancel' },
        { text: 'Verlo', onPress: ir }
      ])
    } catch (e) {
      setPasando(undefined)
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <ScrollView style={s.raiz} contentContainerStyle={s.contenido} refreshControl={<RefreshControl refreshing={false} onRefresh={leer} tintColor={c.amber} />}>
      <View style={s.seguir}>
        <Text style={s.seguirTitulo}>Seguir en la computadora</Text>
        <Text style={s.seguirTexto}>
          {conexion
            ? `Pasa este hilo a ${conexion.equipo}: sube estos archivos y su Sloth sigue la skill desde donde quedó (la voz, el render, el video final).`
            : 'Para el video final hace falta tu computadora con Sloth. Conéctala en Más → Tu computadora, y vuelve aquí.'}
        </Text>
        <Boton texto={pasando ?? 'Seguir en la computadora'} icono="flechaArriba" tipo="primario" ocupado={!!pasando} disabled={!conexion || hilo?.running} onPress={() => void seguir()} />
        {hilo?.running && <Text style={s.nota}>Espera a que el agente termine su turno.</Text>}
      </View>
      {aviso && <Aviso tipo={aviso.tipo} texto={aviso.texto} />}
      <Titulo>Archivos del hilo</Titulo>
      {!archivos.length ? (
        <Vacio icono="importar" titulo="Aún no hay archivos" texto="Lo que escriba el agente (el guion, las fuentes) y lo que adjuntes sale aquí." />
      ) : (
        <View style={s.panel}>
          {archivos.map((a, i) => (
            <ArchivoFila key={a.ruta} a={a} primero={i === 0} abierto={abierto === a.ruta} onAbrir={() => setAbierto(abierto === a.ruta ? undefined : a.ruta)} />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function ArchivoFila({ a, primero, abierto, onAbrir }: { a: ArchivoDelHilo; primero: boolean; abierto: boolean; onAbrir(): void }) {
  const [texto, setTexto] = useState<string>()
  useEffect(() => {
    if (abierto && TEXTO.test(a.ruta) && texto === undefined) void new File(a.uri).text().then(setTexto, () => setTexto('No se pudo leer.'))
  }, [abierto])
  const compartir = () => void Sharing.shareAsync(a.uri).catch(() => {})
  return (
    <View style={[!primero && s.raya]}>
      <Pressable onPress={onAbrir} style={s.fila}>
        <Icono de={IMAGEN.test(a.ruta) ? 'imagen' : /\.(m4a|mp3|wav)$/i.test(a.ruta) ? 'microfono' : 'lapiz'} color={c.muted} tam={16} />
        <Text style={s.nombre} numberOfLines={1}>
          {a.ruta}
        </Text>
        <Text style={s.tam}>{a.tamano > 1024 ? `${Math.round(a.tamano / 1024)} KB` : `${a.tamano} B`}</Text>
      </Pressable>
      {abierto && (
        <View style={s.abierto}>
          {IMAGEN.test(a.ruta) && <Image source={{ uri: a.uri }} style={s.imagen} resizeMode="contain" />}
          {TEXTO.test(a.ruta) &&
            (texto === undefined ? null : a.ruta.endsWith('.md') ? <Markdown texto={texto} /> : <Text style={s.crudo} selectable>{texto.slice(0, 20000)}</Text>)}
          {Platform.OS !== 'web' && <Boton texto="Compartir" icono="compartir" onPress={compartir} />}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  contenido: { padding: 16, gap: 14 },
  seguir: { gap: 10, padding: 14, borderRadius: radio, backgroundColor: c.amberTinte },
  seguirTitulo: { color: c.text, fontSize: 16, fontWeight: '700' },
  seguirTexto: { color: c.suave, fontSize: 13.5, lineHeight: 19 },
  nota: { color: c.muted, fontSize: 12.5 },
  panel: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, overflow: 'hidden' },
  raya: { borderTopWidth: 1, borderTopColor: c.line },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  nombre: { flex: 1, color: c.text, fontSize: 14.5 },
  tam: { color: c.muted, fontSize: 12 },
  abierto: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  imagen: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: c.panel2 },
  crudo: { color: c.suave, fontSize: 12.5, fontFamily: mono }
})
