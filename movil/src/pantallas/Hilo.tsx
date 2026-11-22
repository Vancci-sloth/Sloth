/**
 * Un hilo en vivo: lo que escribe el agente, lo que hace (herramientas y subagentes, plegados en una línea que se abre),
 * cómo acaba cada turno y, abajo, el campo para seguir hablándole, también mientras trabaja. Los eventos se juntan con
 * `buildTimeline` de la computadora (`web/src/items.ts`): el hilo se lee igual en los dos.
 */
import { memo, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { buildTimeline, delHilo, duration, errorLlano, ESTADO_SUBAGENTE, lineaDeSubagente, REINTENTAR, toolSummary, type Item } from '../../../web/src/items'
import { conOpenCode, conPrimero } from '../../../shared/modelos'
import { NOMBRE_AGENTE, PROVEEDORES, proveedorDe } from '../../../shared/providers'
import { api, urlDe } from '../api'
import { Compositor, conLineas, subirAdjuntos } from '../Compositor'
import { Icono } from '../Icono'
import { Markdown } from '../Markdown'
import type { Rutas } from '../rutas'
import { abrirHilo, useEventos, useSloth } from '../sloth'
import { c, mono, radio } from '../tema'
import { Aviso, Boton, BotonIcono, Cargando } from '../ui'

const imagenDe = (ruta: string) => urlDe(`/api/attachments/${encodeURIComponent(ruta.split(/[\\/]/).pop() ?? '')}`)

export function Hilo({ route, navigation }: NativeStackScreenProps<Rutas, 'Hilo'>) {
  const { id } = route.params
  const { sessions, cards, models, avances } = useSloth()
  const meta = sessions.find((s) => s.id === id)
  const card = cards.find((x) => x.id === meta?.cardId)
  const { events, fallo } = useEventos(id)
  const abajo = useSafeAreaInsets().bottom
  const [respuesta, setRespuesta] = useState<string>()

  useEffect(() => {
    abrirHilo(id)
    return () => abrirHilo(null)
  }, [id])

  useEffect(() => {
    navigation.setOptions({
      title: meta?.title ?? 'Hilo',
      headerRight: card?.etapas?.length ? () => <BotonIcono icono="claqueta" nombre="Cómo va el video" color={c.amber} onPress={() => navigation.navigate('Avance', { id })} /> : undefined
    })
  }, [meta?.title, card?.etapas?.length, navigation, id])

  const items = useMemo(() => (events ? delHilo(buildTimeline(events)) : []), [events])
  // La lista va al revés: lo último abajo, donde está el pulgar, y crece hacia arriba.
  const alReves = useMemo(() => [...items].reverse(), [items])

  // Otro agente al que pasar el hilo si al de ahora se le acabó el uso.
  const actual = proveedorDe(meta?.model ?? '')
  const relevos = useMemo(() => PROVEEDORES.filter((p) => p !== actual).flatMap((p) => (p === 'opencode' ? conOpenCode(models) : conPrimero(models, p))?.principal ?? []), [models, actual])

  const responder = (text: string, images?: string[]) => api(`/api/sessions/${id}/send`, { text, images })

  if (fallo && !events) return <View style={s.raiz}><View style={{ padding: 16 }}><Aviso texto={fallo} /></View></View>
  if (!events) return <Cargando texto="Abriendo el hilo…" />

  const avance = avances[id]
  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {avance && avance.total > 0 && (
        <Pressable onPress={() => navigation.navigate('Avance', { id })} style={s.avance}>
          <View style={[s.barraAvance]}>
            <View style={[s.barraLlena, { width: `${Math.round((avance.hechas / avance.total) * 100)}%` }]} />
          </View>
          <Text style={[s.avanceTexto, avance.espera && { color: c.amber }]} numberOfLines={1}>
            {avance.etapa ? `${avance.espera ? 'Te espera: ' : ''}${avance.etapa} · ${avance.hechas} de ${avance.total}` : 'Video terminado: tócalo para verlo'}
          </Text>
          <Icono de="siguiente" color={c.muted} tam={16} />
        </Pressable>
      )}
      <FlatList
        inverted
        data={alReves}
        keyExtractor={(item) => item.key}
        contentContainerStyle={s.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <Fila item={item} sessionId={id} agente={actual} relevos={relevos} onResponder={responder} onOpcion={setRespuesta} />}
        ListHeaderComponent={meta?.running ? <Trabajando /> : undefined}
      />
      <View style={[s.pie, { paddingBottom: abajo + 8 }]}>
        {meta?.pendiente ? (
          <View style={{ gap: 8 }}>
            <Aviso tipo="info" texto="Este video del lote espera su turno: arranca solo cuando haya sitio en la computadora." />
            <Boton texto="Empezar ya" icono="video" onPress={() => void api(`/api/sessions/${id}/empezar`, {})} />
          </View>
        ) : (
          <Compositor
            placeholder={meta?.running ? 'Díselo mientras trabaja…' : 'Responde o pide un cambio…'}
            trabajando={!!meta?.running}
            onParar={() => void api(`/api/sessions/${id}/stop`, {})}
            texto={respuesta}
            bloqueo={card?.bloqueada ? 'Este estilo es de la comunidad: vuelve a apoyar a Sloth para seguir.' : undefined}
            onEnviar={async (texto, adjuntos) => {
              const { images, lineas } = await subirAdjuntos(adjuntos)
              await responder(conLineas(texto, lineas), images)
              setRespuesta(undefined)
            }}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

export function Trabajando() {
  return (
    <View style={s.trabajando}>
      <ActivityIndicator size="small" color={c.amber} />
      <Text style={s.trabajandoTexto}>Trabajando…</Text>
    </View>
  )
}

type PropsFila = {
  item: Item
  /** El hilo de la computadora; sin él (un hilo del celular), las salidas largas no se piden a nadie. */
  sessionId?: string
  /** De dónde se dibuja una imagen que adjuntaste: la computadora o el propio celular. */
  imagen?(ruta: string): string
  agente: ReturnType<typeof proveedorDe>
  relevos: { model: string; effort?: string }[]
  onResponder(text: string, images?: string[]): Promise<unknown>
  onOpcion(texto: string): void
}

export const Fila = memo(function Fila({ item, sessionId, imagen = imagenDe, agente, relevos, onResponder, onOpcion }: PropsFila) {
  switch (item.kind) {
    case 'user':
      return (
        <View style={s.usuario}>
          {item.images.length > 0 && (
            <View style={s.imagenes}>
              {item.images.map((ruta) => (
                <Image key={ruta} source={{ uri: imagen(ruta) }} style={s.imagen} />
              ))}
            </View>
          )}
          {!!item.text.trim() && <Text style={s.usuarioTexto} selectable>{item.text.trim()}</Text>}
        </View>
      )
    case 'text':
      return (
        <View style={s.agente}>
          <Markdown texto={item.text} />
          {!!item.opciones?.length && (
            <View style={s.opciones}>
              {item.opciones.map((o) => (
                <Pressable key={o} accessibilityRole="button" onPress={() => void onResponder(o).catch(() => onOpcion(o))} style={({ pressed }) => [s.opcion, pressed && { opacity: 0.7 }]}>
                  <Text style={s.opcionTexto}>{o}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )
    case 'thinking':
      return item.text.trim() ? <Plegable icono="foco" titulo="Pensando" detalle={item.text.trim().slice(0, 140)} cuerpo={item.text} /> : null
    case 'tool':
      return <Herramienta item={item} sessionId={sessionId} />
    case 'info':
      return <Text style={s.info}>{item.text}</Text>
    case 'arranque':
      return item.acabado ? null : (
        <View style={s.trabajando}>
          <ActivityIndicator size="small" color={c.muted} />
          <Text style={s.trabajandoTexto}>Arrancando {item.nombre}…</Text>
        </View>
      )
    case 'turn_end':
      return <FinDeTurno item={item} agente={agente} relevos={relevos} sessionId={sessionId} onResponder={onResponder} />
  }
})

function Plegable({ icono, titulo, detalle, cuerpo, estado, alAbrir }: { icono: 'foco' | 'flecha' | 'personas'; titulo: string; detalle: string; cuerpo?: string; estado?: 'trabaja' | 'error'; alAbrir?(): void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <View style={s.plegable}>
      <Pressable onPress={() => (setAbierto(!abierto), !abierto && alAbrir?.())} style={s.plegableFila}>
        {estado === 'trabaja' ? <ActivityIndicator size="small" color={c.amber} /> : <Icono de={estado === 'error' ? 'alerta' : icono} color={estado === 'error' ? c.bad : c.muted} tam={15} />}
        <Text style={s.plegableTexto} numberOfLines={abierto ? undefined : 1}>
          <Text style={s.plegableTitulo}>{titulo}</Text>
          {detalle ? `  ${detalle}` : ''}
        </Text>
      </Pressable>
      {abierto && cuerpo !== undefined && (
        <Text style={s.salida} selectable>
          {cuerpo || '(sin salida)'}
        </Text>
      )}
    </View>
  )
}

function Herramienta({ item, sessionId }: { item: Extract<Item, { kind: 'tool' }>; sessionId?: string }) {
  const [larga, setLarga] = useState<string>()
  if (item.subagente) {
    const sa = item.subagente
    return (
      <Plegable
        icono="personas"
        titulo={`${sa.titulo || 'Subagente'} · ${ESTADO_SUBAGENTE[sa.estado]}`}
        detalle={lineaDeSubagente(sa)}
        cuerpo={sa.encargo}
        estado={sa.estado === 'running' ? 'trabaja' : sa.estado === 'failed' ? 'error' : undefined}
      />
    )
  }
  const { verb, detail } = toolSummary(item.name, item.input)
  const salida = larga ?? item.output
  return (
    <Plegable
      icono="flecha"
      titulo={verb}
      detalle={String(detail ?? '')}
      cuerpo={item.largo && larga === undefined ? 'Cargando la salida…' : salida.slice(-6000)}
      estado={!item.done ? 'trabaja' : item.error ? 'error' : undefined}
      alAbrir={() => {
        if (sessionId && item.largo && larga === undefined)
          void api<{ output: string }>(`/api/sessions/${sessionId}/salida?tool=${encodeURIComponent(item.id)}`).then(
            (r) => setLarga(r.output),
            (e) => setLarga(String(e?.message ?? e))
          )
      }}
    />
  )
}

function FinDeTurno({ item, agente, relevos, sessionId, onResponder }: { item: Extract<Item, { kind: 'turn_end' }>; agente: ReturnType<typeof proveedorDe>; relevos: { model: string; effort?: string }[]; sessionId?: string; onResponder(text: string, images?: string[]): Promise<unknown> }) {
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState('')
  const datos = [item.ms ? duration(item.ms) : '', item.costUsd !== undefined ? `$${item.costUsd.toFixed(2)}` : ''].filter(Boolean).join(' · ')
  if (item.ok) return <Text style={s.fin}>{`Listo${datos ? ` · ${datos}` : ''}`}</Text>
  const quien = item.agente ?? agente
  const e = errorLlano(item.error, item.caida, quien)
  const intentar = (paso: () => Promise<unknown>) => {
    setEnviando(true)
    setFallo('')
    paso().catch((err) => (setEnviando(false), setFallo(err instanceof Error ? err.message : String(err))))
  }
  const otros = e.limite && sessionId ? relevos.filter((r) => proveedorDe(r.model) !== quien) : []
  return (
    <View style={[s.fallo, e.tuyo && { borderColor: c.line, backgroundColor: c.panel }]}>
      <Text style={[s.falloTitulo, e.tuyo && { color: c.text }]}>{e.titulo}</Text>
      <Text style={s.falloAyuda}>{fallo || e.ayuda}</Text>
      <View style={s.falloBotones}>
        {otros.map((r) => (
          <Boton
            key={r.model}
            texto={`Seguir con ${NOMBRE_AGENTE[proveedorDe(r.model)]}`}
            disabled={enviando}
            onPress={() => intentar(() => api(`/api/sessions/${sessionId}/model`, r).then(() => onResponder(REINTENTAR)))}
          />
        ))}
        {e.reintentar && (
          <Boton
            texto="Reintentar"
            icono="recargar"
            tipo="primario"
            ocupado={enviando}
            onPress={() => intentar(() => (item.pedido ? onResponder(item.pedido.text, item.pedido.images) : onResponder(REINTENTAR)))}
          />
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: c.bg },
  lista: { padding: 14, gap: 12 },
  pie: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
  avance: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: c.panel },
  barraAvance: { width: 56, height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' },
  barraLlena: { height: 6, backgroundColor: c.amber },
  avanceTexto: { flex: 1, color: c.suave, fontSize: 13.5 },
  usuario: { alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: c.panel2, borderColor: c.line, borderWidth: 1, borderRadius: 16, borderBottomRightRadius: 6, padding: 12, gap: 8 },
  usuarioTexto: { color: c.text, fontSize: 15, lineHeight: 22 },
  imagenes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  imagen: { width: 96, height: 96, borderRadius: 10, backgroundColor: c.panel },
  agente: { gap: 10 },
  opciones: { gap: 8 },
  opcion: { borderColor: c.amber, borderWidth: 1, borderRadius: radio, paddingHorizontal: 14, paddingVertical: 11 },
  opcionTexto: { color: c.text, fontSize: 15 },
  plegable: { backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: 10 },
  plegableFila: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 9 },
  plegableTexto: { flex: 1, color: c.muted, fontSize: 13 },
  plegableTitulo: { color: c.suave, fontWeight: '700' },
  salida: { fontFamily: mono, fontSize: 11.5, color: c.suave, paddingHorizontal: 10, paddingBottom: 10, lineHeight: 16 },
  info: { color: c.muted, fontSize: 13, textAlign: 'center' },
  trabajando: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trabajandoTexto: { color: c.muted, fontSize: 13.5 },
  fin: { color: c.muted, fontSize: 12.5 },
  fallo: { gap: 8, padding: 12, borderRadius: radio, borderWidth: 1, borderColor: c.badTinte, backgroundColor: c.badTinte },
  falloTitulo: { color: c.bad, fontSize: 15, fontWeight: '700' },
  falloAyuda: { color: c.suave, fontSize: 13.5, lineHeight: 19 },
  falloBotones: { gap: 8 }
})
