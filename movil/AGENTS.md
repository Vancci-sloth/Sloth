# Sloth en el celular

App de Expo (React Native) para iOS y Android con dos modos (`src/modo.ts`): «En este celular», donde el agente
corre en el teléfono (`src/local/`: Claude por la API con la llave de quien la usa), y «Con mi computadora», que le pide
el trabajo a su Sloth por la puerta del celular (`server/celular.ts`). El porqué está en `docs/adr/0025-sloth-en-el-celular.md`; compilarla y comprobarla, en
`docs/agents/publicacion.md` («App del celular»).

## Expo cambia en cada versión

Lo que recuerdas de Expo seguramente ya no es así. Antes de tocar una API de Expo o de React Native, mira la versión de
`expo` en `package.json` y lee su documentación (`https://docs.expo.dev/versions/v<mayor>.0.0/`, y
`https://docs.expo.dev/llms.txt`). En la 58: `expo-file-system` y `expo-media-library` traen la API de clases (`File`,
`Paths`, `Asset.create`) y las funciones de antes truenan; `fetch` es el de Expo y acepta un `File` de cuerpo;
`VideoView` usa `fullscreenOptions`.

## Al editar

- Instala con `npx expo install <paquete>`, no con `npm install`: elige la versión que va con el SDK.
- Comprueba con `npx tsc --noEmit` y `npx expo export --platform android --platform ios --output-dir <temporal>`.
- `ios/` y `android/` no existen en el repo: se generan con la configuración de `app.json` y sus plugins.
- Lo que se importa de `../shared` y `../web/src` no puede importar paquetes (los resuelve Metro desde fuera de esta
  carpeta). Si algo de la web hace falta aquí y trae React DOM, saca la parte pura a un archivo propio, como
  `web/src/trazos.ts`.
- Navegación con React Navigation (`src/App.tsx`, las rutas en `src/rutas.ts`), sin Expo Router.
- Las mismas reglas que la app de escritorio: la paleta de `src/tema.ts` (la de `web/src/styles.css`), iconos de trazo
  (`src/Icono.tsx`), nada de cápsulas, textos y comentarios en español.
- Los estilos del modo celular salen de `cards.json` y las skills: al cambiarlos, `node scripts/estilos.mjs` (un test
  avisa si no).
- El SDK de Anthropic va sin su «tool runner» ni sus «threads» (`metro.config.js`, `src/local/sdk-sin-runner.js`): se
  importan en círculo y la app no abre en desarrollo. El agente del celular lleva su bucle en `src/local/agente.ts`.
