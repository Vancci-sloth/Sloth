/**
 * Las actualizaciones sin bajar otra app (`expo-updates`). Al abrir, la app le pregunta al cobro (`updates.url` en
 * `app.json`, `licencias/src/actualizar-celular.ts`) y baja la versión nueva en segundo plano; se pone sola la próxima
 * vez que se abre. Mientras, `Actualizacion` avisa que ya está lista y deja reiniciar ahí mismo. Al volver a la app
 * después de `CADA`, pregunta otra vez. Solo llega lo que no es nativo: lo nativo pide otro `.apk` (ver
 * `docs/agents/publicacion.md`). Cada actualización va firmada con la llave de Sloth (`certificados/certificate.pem`).
 * En Expo Go y en desarrollo, `expo-updates` está apagado y nada de esto hace algo.
 */
import { AppState, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { Icono } from './Icono'
import { c } from './tema'
import { Boton, s } from './ui'

const CADA = 6 * 3600_000
let revisado = Date.now()

AppState.addEventListener('change', (a) => {
  if (a !== 'active' || !Updates.isEnabled || Date.now() - revisado < CADA) return
  revisado = Date.now()
  void Updates.checkForUpdateAsync()
    .then((r) => (r.isAvailable ? Updates.fetchUpdateAsync() : undefined))
    .catch(() => {})
})

export function Actualizacion() {
  const { isUpdatePending } = Updates.useUpdates()
  if (!Updates.isEnabled || !isUpdatePending) return null
  return (
    <View style={[s.aviso, s.avisoInfo, { alignItems: 'center' }]}>
      <Icono de="descargar" color={c.amber} tam={16} />
      <Text style={[s.avisoTexto, { color: c.suave }]}>Hay una versión nueva de Sloth lista.</Text>
      <Boton texto="Reiniciar" tipo="normal" onPress={() => void Updates.reloadAsync()} />
    </View>
  )
}

/** «0.1.1», o «0.1.1 · actualizada el 22 nov» si corre una actualización y no la que traía el `.apk`. */
export function versionDeLaApp(): string {
  const version = Constants.expoConfig?.version ?? ''
  if (!Updates.isEnabled || Updates.isEmbeddedLaunch || !Updates.createdAt) return version
  return `${version} · actualizada el ${Updates.createdAt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
}
