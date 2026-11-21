/**
 * La app de Sloth para el celular (ADR 0025), con dos modos (`modo.ts`):
 * - En este celular: el agente corre en el teléfono con la llave de Claude de quien la usa (`local/`), con los estilos
 *   que viajan en la app. Hace la idea, la investigación y el guion; el video final lo pasa a la computadora.
 * - Con la computadora: le pide el trabajo a la Sloth de su computadora por la puerta del celular (`server/celular.ts`).
 * La primera vez pregunta cuál (`Bienvenida`). El enlace del QR (`slothmovil://conectar?…`) conecta con la computadora
 * aunque llegue con la app abierta.
 */
import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { createNavigationContainerRef, DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native'
import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack'
import { createBottomTabNavigator, type BottomTabNavigationOptions } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { cargarCredencial, recordarCredencial } from './comunidadApi'
import { cargarConexion, conectar, conexion as conexionGuardada, motivoDeSalida, useConexion } from './conexion'
import { leerEnlace } from './enlace'
import { Icono, type NombreIcono } from './Icono'
import { cargarHilos } from './local/hilos'
import { cargarLlave } from './local/llave'
import { cargarModo, elegirModo, modoActual, tomarAbrir, useModo } from './modo'
import { cargarRecordado } from './recordar'
import type { Pestanas, PestanasCelular, Rutas, RutasCelular } from './rutas'
import { apagar, encender, useSloth } from './sloth'
import { c } from './tema'
import { Cargando } from './ui'
import { Avance } from './pantallas/Avance'
import { Bienvenida } from './pantallas/Bienvenida'
import { Comunidad } from './pantallas/Comunidad'
import { Escribir } from './pantallas/Escribir'
import { Conectar } from './pantallas/Conectar'
import { Estilos } from './pantallas/Estilos'
import { Hilo } from './pantallas/Hilo'
import { Hilos } from './pantallas/Hilos'
import { Mas } from './pantallas/Mas'
import { NuevoHilo } from './pantallas/NuevoHilo'
import { Publicacion } from './pantallas/Publicacion'
import { Reproductor } from './pantallas/Reproductor'
import { SobreTi } from './pantallas/SobreTi'
import { Videos } from './pantallas/Videos'
import { ArchivosLocal } from './pantallas/local/ArchivosLocal'
import { HiloLocal } from './pantallas/local/HiloLocal'
import { HilosLocal } from './pantallas/local/HilosLocal'
import { InicioLocal } from './pantallas/local/InicioLocal'
import { LlaveClaude } from './pantallas/local/LlaveClaude'
import { MasLocal, SobreTiLocal } from './pantallas/local/MasLocal'
import { NuevoLocal } from './pantallas/local/NuevoLocal'

const Pila = createNativeStackNavigator<Rutas>()
const Pestana = createBottomTabNavigator<Pestanas>()
const PilaCelular = createNativeStackNavigator<RutasCelular>()
const PestanaCelular = createBottomTabNavigator<PestanasCelular>()
const navegacion = createNavigationContainerRef<Rutas>()

const tema: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: c.amber, background: c.bg, card: c.panel, text: c.text, border: c.line, notification: c.amber }
}

const ICONOS: Record<keyof Pestanas | keyof PestanasCelular, NombreIcono> = {
  Estilos: 'claqueta',
  Hilos: 'hilo',
  Videos: 'video',
  Comunidad: 'personas',
  Mas: 'puntos',
  InicioLocal: 'claqueta',
  HilosLocal: 'hilo',
  MasLocal: 'puntos'
}

const pestanas = ({ route }: { route: { name: string } }): BottomTabNavigationOptions => ({
  headerStyle: { backgroundColor: c.bg },
  headerShadowVisible: false,
  headerTitleStyle: { color: c.text, fontWeight: '700' },
  tabBarStyle: { backgroundColor: c.panel, borderTopColor: c.line },
  tabBarActiveTintColor: c.amber,
  tabBarInactiveTintColor: c.muted,
  tabBarIcon: ({ color }) => <Icono de={ICONOS[route.name as keyof typeof ICONOS]} color={color} tam={22} />
})

const pila: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: c.bg },
  headerTintColor: c.amber,
  headerTitleStyle: { color: c.text },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: c.bg }
}

function PestanasSloth() {
  const { sessions, avances } = useSloth()
  // En «Hilos», cuántos esperan algo de ti o trabajan: lo que querrías mirar al abrir la app.
  const pendientes = sessions.filter((s) => !s.archived && (s.running || avances[s.id]?.espera)).length
  return (
    <Pestana.Navigator screenOptions={pestanas}>
      <Pestana.Screen name="Estilos" component={Estilos} options={{ title: 'Inicio', headerShown: false }} />
      <Pestana.Screen name="Hilos" component={Hilos} options={{ tabBarBadge: pendientes || undefined, tabBarBadgeStyle: { backgroundColor: c.amber, color: c.sobreAmbar } }} />
      <Pestana.Screen name="Videos" component={Videos} options={{ title: 'Mis videos' }} />
      <Pestana.Screen name="Comunidad" component={Comunidad} />
      <Pestana.Screen name="Mas" component={Mas} options={{ title: 'Más' }} />
    </Pestana.Navigator>
  )
}

function PestanasDelCelular() {
  return (
    <PestanaCelular.Navigator screenOptions={pestanas}>
      <PestanaCelular.Screen name="InicioLocal" component={InicioLocal} options={{ title: 'Inicio', headerShown: false }} />
      <PestanaCelular.Screen name="HilosLocal" component={HilosLocal} options={{ title: 'Hilos' }} />
      <PestanaCelular.Screen name="Comunidad" component={Comunidad} />
      <PestanaCelular.Screen name="MasLocal" component={MasLocal} options={{ title: 'Más' }} />
    </PestanaCelular.Navigator>
  )
}

/** El modo celular. Sin llave de Claude se ve todo (los estilos, tus hilos, la comunidad); el agente la pide al empezar. */
function Celular() {
  return (
    <NavigationContainer theme={tema}>
      <PilaCelular.Navigator screenOptions={pila}>
        <PilaCelular.Screen name="PestanasCelular" component={PestanasDelCelular} options={{ headerShown: false }} />
        <PilaCelular.Screen name="NuevoLocal" component={NuevoLocal} options={{ title: 'Hilo nuevo' }} />
        <PilaCelular.Screen name="HiloLocal" component={HiloLocal} />
        <PilaCelular.Screen name="ArchivosLocal" component={ArchivosLocal} options={{ title: 'Archivos del hilo' }} />
        <PilaCelular.Screen name="LlaveClaude" component={LlaveClaude} options={{ title: 'Claude' }} />
        <PilaCelular.Screen name="SobreTiLocal" component={SobreTiLocal} options={{ title: 'Sobre ti' }} />
        <PilaCelular.Screen name="Publicacion" component={Publicacion} options={{ title: 'Comunidad' }} />
        <PilaCelular.Screen name="Escribir" component={Escribir} options={{ title: 'Escribir en la comunidad' }} />
      </PilaCelular.Navigator>
    </NavigationContainer>
  )
}

/** El modo computadora: sin conexión guardada, primero se conecta. */
function Computadora({ errorEnlace }: { errorEnlace: string }) {
  const conexion = useConexion()
  useEffect(() => {
    if (!conexion) return
    encender()
    // Para que la comunidad funcione también sin la computadora, el celular guarda su cuenta mientras puede.
    void recordarCredencial()
    return apagar
  }, [conexion?.base, conexion?.llave])

  if (!conexion) return <Conectar error={errorEnlace || motivoDeSalida()} />
  return (
    <NavigationContainer
      theme={tema}
      ref={navegacion}
      onReady={() => {
        // El hilo que acaba de pasar «Seguir en la computadora».
        const id = tomarAbrir()
        if (id) navegacion.navigate('Hilo', { id })
      }}
    >
      <Pila.Navigator screenOptions={pila}>
        <Pila.Screen name="Pestanas" component={PestanasSloth} options={{ headerShown: false }} />
        <Pila.Screen name="Nuevo" component={NuevoHilo} options={{ title: 'Hilo nuevo' }} />
        <Pila.Screen name="Hilo" component={Hilo} />
        <Pila.Screen name="Avance" component={Avance} options={{ title: 'Cómo va el video' }} />
        <Pila.Screen name="Reproductor" component={Reproductor} />
        <Pila.Screen name="SobreTi" component={SobreTi} options={{ title: 'Sobre ti' }} />
        <Pila.Screen name="Publicacion" component={Publicacion} options={{ title: 'Comunidad' }} />
        <Pila.Screen name="Escribir" component={Escribir} options={{ title: 'Escribir en la comunidad' }} />
      </Pila.Navigator>
    </NavigationContainer>
  )
}

export default function App() {
  const modo = useModo()
  const [listo, setListo] = useState(false)
  const [errorEnlace, setErrorEnlace] = useState('')
  const enlace = Linking.useLinkingURL()

  useEffect(() => {
    void Promise.all([cargarConexion(), cargarRecordado().then(cargarModo), cargarLlave(), cargarHilos(), cargarCredencial()]).then(() => {
      // Quien ya se había conectado a su computadora antes de que hubiera modos sigue con ella.
      if (!modoActual() && conexionGuardada()) elegirModo('computadora')
      setListo(true)
    })
  }, [])

  // El QR leído con la cámara del celular abre la app con su enlace: conecta con esa computadora y trabaja con ella.
  useEffect(() => {
    const destino = enlace ? leerEnlace(enlace) : null
    if (!listo || !destino) return
    setErrorEnlace('')
    elegirModo('computadora')
    conectar(destino).catch((e) => setErrorEnlace(e instanceof Error ? e.message : String(e)))
  }, [enlace, listo])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!listo ? <Cargando texto="Abriendo Sloth…" /> : modo === 'celular' ? <Celular /> : modo === 'computadora' ? <Computadora errorEnlace={errorEnlace} /> : <Bienvenida />}
    </SafeAreaProvider>
  )
}
