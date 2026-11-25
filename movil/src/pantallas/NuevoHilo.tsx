/**
 * Un hilo nuevo de un estilo: lo que pides, con las mismas opciones que el compositor de la computadora (formato, voz,
 * música, clips, marca, modelo y, con varios enlaces, un video por enlace) y las mismas líneas al final del mensaje, que
 * son las que leen las skills.
 */
import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { elegirModelos, CON_CHATGPT, conOpenCode, conPrimero, gruposModelos, lineaSubagentes, type Avanzado, type Choice } from '../../../shared/modelos'
import { lineaClips, OPCIONES_CLIPS, precioClip } from '../../../shared/flow'
import { lineaMusica, lineaVoz, MOTORES } from '../../../shared/voz'
import { PROVEEDORES, proveedorDe, type Proveedor } from '../../../shared/providers'
import type { EstadoVoz, Marcas, SessionMeta } from '../../../shared/types'
import { api } from '../api'
import { Compositor, conLineas, subirAdjuntos } from '../Compositor'
import { Elegir, type Opcion } from '../Elegir'
import { Icono } from '../Icono'
import { esIconoValido } from '../iconos'
import { recordar, recordado } from '../recordar'
import type { Rutas } from '../rutas'
import { useSloth } from '../sloth'
import { c, radio } from '../tema'
import { Segmento, Titulo, Vacio } from '../ui'

const LINK = /https?:\/\/[^\s<>"'«»]*[^\s<>"'«».,;:!?)\]]/g
const enlacesDe = (t: string) => [...new Set(t.match(LINK) ?? [])]

/** Qué cuenta hay conectada en la computadora: sin Claude, lo medido no puede empezar (como `useSinClaude` en la web). */
function useSinClaude(models: { id: string }[]): Proveedor | false | undefined {
  const [cuentas, setCuentas] = useState<'claude' | 'codex' | 'opencode' | 'ninguna'>()
  useEffect(() => {
    type Cuenta = { conectada?: boolean }
    Promise.all([api<Cuenta>('/api/claude/cuenta'), api<Cuenta>('/api/codex/cuenta'), api<Cuenta>('/api/opencode/cuenta')]).then(
      ([a, b, o]) => setCuentas(a.conectada ? 'claude' : b.conectada ? 'codex' : o.conectada ? 'opencode' : 'ninguna'),
      () => setCuentas('claude')
    )
  }, [])
  const otro = PROVEEDORES.find((p) => !['claude', 'codex', 'opencode'].includes(p) && models.some((m) => proveedorDe(m.id) === p))
  return cuentas === undefined ? undefined : cuentas === 'ninguna' ? (otro ?? false) : cuentas === 'claude' ? false : cuentas
}

export function NuevoHilo({ route, navigation }: NativeStackScreenProps<Rutas, 'Nuevo'>) {
  const { cards, models } = useSloth()
  const card = cards.find((x) => x.id === route.params.cardId)
  const abajo = useSafeAreaInsets().bottom
  const id = route.params.cardId
  const video = !!card?.etapas

  const [formato, setFormato] = useState<'vertical' | 'horizontal'>(() => recordado(`formato.${id}`, 'vertical'))
  const [voz, setVoz] = useState(() => recordado(`voz.${id}`, ''))
  const [musica, setMusica] = useState(() => recordado(`musica.${id}`, false))
  const [clips, setClips] = useState(() => recordado(`clips.${id}`, 'Veo 3.1 - Lite'))
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState<Choice | undefined>(() => recordado<Choice | undefined>(`modelo.${id}`, undefined))
  const [porEnlace, setPorEnlace] = useState(true)
  const [escrito, setEscrito] = useState('')
  const [estadoVoz, setEstadoVoz] = useState<EstadoVoz>()
  const [marcas, setMarcas] = useState<Marcas>({ otras: [] })
  const sinClaude = useSinClaude(models)

  useEffect(() => {
    if (!video) return
    if (card?.voz !== false) void api<EstadoVoz>('/api/voz').then(setEstadoVoz, () => {})
    void api<Marcas>(`/api/cards/${id}/marcas`).then(setMarcas, () => {})
  }, [id, video, card?.voz])

  useEffect(() => navigation.setOptions({ title: card?.title ?? 'Hilo nuevo' }), [card?.title, navigation])

  // El modelo: lo medido para la card («Optimizado»), o el que elegiste aquí. Sin Claude, el de la cuenta que haya.
  const avanzado: Avanzado | undefined = modelo
    ? { principal: modelo, tareas: {} }
    : sinClaude === 'codex' ? CON_CHATGPT : sinClaude === 'opencode' ? conOpenCode(models) : sinClaude ? conPrimero(models, sinClaude) : undefined
  const { choice, tareas } = useMemo(() => elegirModelos(card?.modelos, models, avanzado, undefined), [card?.modelos, models, avanzado?.principal?.model, avanzado?.principal?.effort])

  const opcionesVoz = useMemo<Opcion[]>(() => {
    const e = estadoVoz
    const lista: Opcion[] = [{ id: '', texto: card?.voz && card.voz.propia ? 'La que hace el estilo' : 'La mando yo', detalle: card?.voz && card.voz.propia ? card.voz.propia : 'Grábala con el micrófono y adjúntala, aquí o cuando el agente la pida.' }]
    if (e?.vc?.disponible) lista.push(...e.vc.voces.map((v) => ({ id: `vc:${v.id}`, texto: v.nombre, detalle: v.descripcion, grupo: 'Voces de Sloth' })))
    if (e?.cuenta) lista.push(...e.voces.map((v) => ({ id: v.nombre, texto: v.nombre, detalle: v.descripcion, grupo: 'AI Studio' })))
    for (const m of ['fish', 'elevenlabs', 'vibi', 'groq'] as const) if (e?.motores?.[m]?.llave) lista.push(...e.motores[m].voces.map((v) => ({ id: `${m}:${v.id}`, texto: v.nombre, detalle: v.descripcion, grupo: MOTORES[m] })))
    return lista
  }, [estadoVoz, card?.voz])
  const vozValida = opcionesVoz.some((o) => o.id === voz) ? voz : ''
  const nombreVoz = opcionesVoz.find((o) => o.id === vozValida)?.texto

  const opcionesModelo = useMemo<Opcion[]>(
    () => [
      { id: '', texto: 'Optimizado', detalle: 'Lo que medimos como mejor para este estilo' },
      ...gruposModelos(models).flatMap((g) => g.options.map((o) => ({ id: o.value, texto: o.label, grupo: g.label })))
    ],
    [models]
  )
  const modeloElegido = models.find((m) => m.id === choice?.model)

  if (!card) return <Vacio icono="alerta" titulo="Ese estilo ya no está" texto="Puede que lo hayan quitado en la computadora." />

  const enlaces = enlacesDe(escrito)
  const lote = !!card.lote && enlaces.length > 1 && porEnlace

  async function enviar(texto: string, adjuntos: Parameters<typeof subirAdjuntos>[0]) {
    if (!card) return
    if (!choice) throw new Error('Tu computadora aún no tiene ningún agente conectado: conéctalo en Sloth, en Opciones → Agentes.')
    const { images, lineas } = await subirAdjuntos(adjuntos)
    let pedido = conLineas(texto, lineas)
    const enLote = lote && enlaces.length > 1
    if (enLote) pedido = enlaces.reduce((t, e) => t.replaceAll(e, ''), pedido).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    const formatoEscrito = /^Formato: (vertical|horizontal)\s*$/m.test(pedido)
    const lineasSkill = [
      marca && `Marca: ${marca}`,
      video && !formatoEscrito && `Formato: ${formato}`,
      video && lineaVoz(card, vozValida, nombreVoz),
      video && lineaMusica(card, musica),
      video && card.clips && lineaClips(clips),
      lineaSubagentes(tareas)
    ]
    const text = [pedido, ...lineasSkill].filter(Boolean).join('\n\n')
    const eleccion = { model: choice.model, effort: choice.effort }
    if (enLote) {
      const metas = await api<SessionMeta[]>('/api/lotes', { cardId: card.id, text, enlaces, images, ...eleccion })
      return navigation.replace('Hilo', { id: metas[0].id })
    }
    const meta = await api<SessionMeta>('/api/sessions', { cardId: card.id, text, images, ...eleccion })
    navigation.replace('Hilo', { id: meta.id })
  }

  const opciones = (
    <View style={s.opciones}>
      {video && (
        <>
          <Titulo>Formato</Titulo>
          <Segmento
            valor={formato}
            opciones={[
              { id: 'vertical', texto: 'Vertical · TikTok' },
              { id: 'horizontal', texto: 'Horizontal · YouTube' }
            ]}
            onCambio={(f) => (setFormato(f), recordar(`formato.${id}`, f))}
          />
          {card.voz !== false && <Elegir etiqueta="Voz" titulo="¿Quién pone la voz?" valor={vozValida} opciones={opcionesVoz} onCambio={(v) => (setVoz(v), recordar(`voz.${id}`, v))} />}
          {card.musica && (
            <View style={s.interruptor}>
              <Text style={s.interruptorTexto}>Música de fondo</Text>
              <Switch value={musica} onValueChange={(m) => (setMusica(m), recordar(`musica.${id}`, m))} trackColor={{ true: c.amber, false: c.line }} thumbColor={c.text} />
            </View>
          )}
          {card.clips && (
            <Elegir
              etiqueta="Clips"
              titulo="Con qué hace los clips: Google Flow o Google Vids"
              valor={clips}
              opciones={Object.entries(OPCIONES_CLIPS).map(([k, o]) => ({ id: k, texto: k, detalle: `${precioClip(o)} cada clip` }))}
              onCambio={(v) => (setClips(v), recordar(`clips.${id}`, v))}
            />
          )}
          {(marcas.base !== undefined ? 1 : 0) + marcas.otras.length > 1 && (
            <Elegir
              etiqueta="Marca"
              valor={marca}
              opciones={[{ id: '', texto: marcas.base ? `${marcas.base} (la de siempre)` : 'La de siempre' }, ...marcas.otras.map((m) => ({ id: m, texto: m }))]}
              onCambio={setMarca}
            />
          )}
        </>
      )}
      <Elegir
        etiqueta="Modelo"
        titulo="Qué agente hace el trabajo"
        valor={modelo ? (choice?.model ?? '') : ''}
        opciones={opcionesModelo}
        onCambio={(m) => {
          const elegido = m ? models.find((x) => x.id === m) : undefined
          const nuevo = elegido ? { model: elegido.id, effort: elegido.defaultEffort } : undefined
          setModelo(nuevo)
          recordar(`modelo.${id}`, nuevo)
        }}
      />
      {modelo && modeloElegido && modeloElegido.efforts.length > 0 && (
        <Elegir
          etiqueta="Esfuerzo"
          valor={choice?.effort ?? ''}
          opciones={modeloElegido.efforts.map((e) => ({ id: e, texto: e }))}
          onCambio={(e) => {
            const nuevo = { model: modeloElegido.id, effort: e }
            setModelo(nuevo)
            recordar(`modelo.${id}`, nuevo)
          }}
        />
      )}
      {!modelo && choice && <Text style={s.nota}>{`Va con ${modeloElegido?.label ?? choice.model}${choice.effort ? ` · ${choice.effort}` : ''}.`}</Text>}
      {card.lote && enlaces.length > 1 && (
        <View style={s.interruptor}>
          <Text style={s.interruptorTexto}>{`Un video por enlace (${enlaces.length} hilos)`}</Text>
          <Switch value={porEnlace} onValueChange={setPorEnlace} trackColor={{ true: c.amber, false: c.line }} thumbColor={c.text} />
        </View>
      )}
    </View>
  )

  return (
    <KeyboardAvoidingView style={s.raiz} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView contentContainerStyle={[s.contenido, { paddingBottom: abajo + 16 }]} keyboardShouldPersistTaps="handled">
        <View style={s.cabeza}>
          <View style={s.icono}>
            <Icono de={esIconoValido(card.icon) ? card.icon : 'video'} color={c.amber} tam={26} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.titulo}>{card.title}</Text>
            <Text style={s.descripcion}>{card.description}</Text>
          </View>
        </View>
        {card.guia && (
          <View style={s.guia}>
            <Text style={s.guiaTexto}>
              <Text style={s.guiaNombre}>Le das: </Text>
              {card.guia.das}
            </Text>
            <Text style={s.guiaTexto}>
              <Text style={s.guiaNombre}>Te entrega: </Text>
              {card.guia.entrega}
            </Text>
          </View>
        )}
        {card.bloqueada ? (
          <Text style={s.nota}>Este estilo es de la comunidad, para quienes apoyan a Sloth. Vuelve a apoyar y sigue donde lo dejaste.</Text>
        ) : (
          <Compositor
            placeholder={card.guia?.ejemplo ? `Por ejemplo: ${card.guia.ejemplo}` : video ? '¿De qué va el video? Pega enlaces, cuenta la idea…' : '¿Qué quieres hacer?'}
            arriba={opciones}
            autoFocus={false}
            onEnviar={(t, a) => enviar(t, a)}
            onCambioTexto={setEscrito}
          />
        )}
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
  opciones: { gap: 10 },
  interruptor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46, paddingHorizontal: 14, backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio },
  interruptorTexto: { color: c.text, fontSize: 14.5 },
  nota: { color: c.muted, fontSize: 13, lineHeight: 18 }
})
