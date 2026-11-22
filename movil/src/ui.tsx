/** Las piezas que repiten las pantallas: botones, el segmento de opciones, avisos y el punto de estado. Sin cápsulas. */
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { Icono, type NombreIcono } from './Icono'
import { c, radio } from './tema'

export function Boton(props: { texto: string; icono?: NombreIcono; onPress(): void; tipo?: 'primario' | 'normal' | 'peligro' | 'quieto'; ocupado?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const tipo = props.tipo ?? 'normal'
  const color = tipo === 'primario' ? c.sobreAmbar : tipo === 'peligro' ? c.bad : tipo === 'quieto' ? c.suave : c.text
  const apagado = props.disabled || props.ocupado
  return (
    <Pressable
      accessibilityRole="button"
      disabled={apagado}
      onPress={props.onPress}
      style={({ pressed }) => [s.boton, s[tipo], pressed && s.apretado, apagado && s.apagado, props.style]}
    >
      {props.ocupado ? <ActivityIndicator size="small" color={color} /> : props.icono && <Icono de={props.icono} color={color} tam={18} />}
      <Text style={[s.botonTexto, { color }]}>{props.texto}</Text>
    </Pressable>
  )
}

/** Un botón que es solo un icono, con su nombre para quien no ve la pantalla. */
export function BotonIcono({ icono, nombre, onPress, color = c.text, tam = 22, disabled }: { icono: NombreIcono; nombre: string; onPress(): void; color?: string; tam?: number; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={nombre} hitSlop={8} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.icono, pressed && s.apretado, disabled && s.apagado]}>
      <Icono de={icono} color={color} tam={tam} />
    </Pressable>
  )
}

/** Elegir una de pocas opciones, de un vistazo: un renglón partido, la elegida en ámbar. */
export function Segmento<T extends string>({ opciones, valor, onCambio }: { opciones: { id: NoInfer<T>; texto: string }[]; valor: T; onCambio(v: NoInfer<T>): void }) {
  return (
    <View style={s.segmento}>
      {opciones.map((o) => {
        const si = o.id === valor
        return (
          <Pressable key={o.id} accessibilityRole="button" accessibilityState={{ selected: si }} onPress={() => onCambio(o.id)} style={[s.segOpcion, si && s.segSi]}>
            <Text style={[s.segTexto, si && s.segTextoSi]} numberOfLines={1}>
              {o.texto}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Aviso({ texto, tipo = 'error' }: { texto: string; tipo?: 'error' | 'info' }) {
  if (!texto) return null
  return (
    <View style={[s.aviso, tipo === 'error' ? s.avisoError : s.avisoInfo]}>
      <Icono de={tipo === 'error' ? 'alerta' : 'campana'} color={tipo === 'error' ? c.bad : c.amber} tam={16} />
      <Text style={[s.avisoTexto, { color: tipo === 'error' ? c.bad : c.suave }]}>{texto}</Text>
    </View>
  )
}

/**
 * La app del celular está en versión GAMMA: una prueba muy temprana, con fallos seguido. Va a la vista al empezar y arriba
 * de Inicio; `corto` es la línea de Inicio.
 */
export function Gamma({ corto }: { corto?: boolean }) {
  return (
    <View style={[s.aviso, s.avisoError, { alignItems: 'flex-start' }]}>
      <Icono de="alerta" color={c.bad} tam={16} />
      <Text style={[s.avisoTexto, { color: c.suave }]}>
        <Text style={{ color: c.bad, fontWeight: '800' }}>SOLO VERSIÓN GAMMA. </Text>
        {corto
          ? 'Prueba súper temprana: espera fallos seguido.'
          : 'Es una prueba súper temprana: espera fallos continuos. Si no quieres presenciarlos, mejor no la uses todavía.'}
      </Text>
    </View>
  )
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <View style={s.centro}>
      <ActivityIndicator color={c.amber} />
      <Text style={s.muted}>{texto}</Text>
    </View>
  )
}

export function Vacio({ icono, titulo, texto, children }: { icono: NombreIcono; titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <View style={s.centro}>
      <Icono de={icono} color={c.muted} tam={36} grosor={1.6} />
      <Text style={s.vacioTitulo}>{titulo}</Text>
      {!!texto && <Text style={[s.muted, s.vacioTexto]}>{texto}</Text>}
      {children}
    </View>
  )
}

/** El punto de un hilo: trabajando (ámbar), acabó bien (verde), falló (rojo) o quieto. */
export function Punto({ estado }: { estado: 'trabaja' | 'ok' | 'error' | 'quieto' | 'espera' }) {
  const fondo = estado === 'trabaja' || estado === 'espera' ? c.amber : estado === 'ok' ? c.ok : estado === 'error' ? c.bad : c.muted
  return <View style={[s.punto, { backgroundColor: fondo, opacity: estado === 'quieto' ? 0.6 : 1 }]} />
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={s.titulo}>{children}</Text>
}

export const s = StyleSheet.create({
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, paddingHorizontal: 16, borderRadius: radio, borderWidth: 1 },
  primario: { backgroundColor: c.amber, borderColor: c.amber },
  normal: { backgroundColor: c.panel2, borderColor: c.line },
  peligro: { backgroundColor: c.badTinte, borderColor: c.badTinte },
  quieto: { backgroundColor: 'transparent', borderColor: 'transparent' },
  apretado: { opacity: 0.7 },
  apagado: { opacity: 0.45 },
  botonTexto: { fontSize: 15, fontWeight: '600' },
  icono: { padding: 6, borderRadius: 10 },
  segmento: { flexDirection: 'row', backgroundColor: c.panel, borderColor: c.line, borderWidth: 1, borderRadius: radio, padding: 3, gap: 3 },
  segOpcion: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 8 },
  segSi: { backgroundColor: c.amberTinte },
  segTexto: { color: c.muted, fontSize: 14, fontWeight: '500' },
  segTextoSi: { color: c.amber, fontWeight: '700' },
  aviso: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: radio, borderWidth: 1 },
  avisoError: { backgroundColor: c.badTinte, borderColor: c.badTinte },
  avisoInfo: { backgroundColor: c.amberTinte, borderColor: c.amberTinte },
  avisoTexto: { flex: 1, fontSize: 14, lineHeight: 20 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  muted: { color: c.muted, fontSize: 14 },
  vacioTitulo: { color: c.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  vacioTexto: { textAlign: 'center', lineHeight: 20 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  titulo: { color: c.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }
})
