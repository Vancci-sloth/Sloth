# Sloth en la nube: la misma Sloth de Linux en un Codespace de GitHub de cada quien

Fecha: 2026-11-21

## Contexto

Sloth en la web (ADR 0025) usa tu Sloth desde otro navegador, pero la computadora tiene que estar encendida. El creador
pidió que también funcione sin computadora, desde la web nada más.

Lo que hace Sloth no cabe en el navegador: los agentes son programas (Claude Code, Codex…) con la cuenta de cada quien,
y los videos se arman con Python, FFmpeg, Remotion y Chrome. Hace falta una máquina. Una por persona en servidores
nuestros (Cloudflare Containers, que además pide el plan pago de Workers) costaría por cada quien, y la app es gratis.

GitHub da a cada cuenta personal Codespaces gratis al mes (120 horas de núcleo y 15 GB): una máquina Linux de cada
quien, con disco que se conserva, que se abre desde el navegador y que GitHub enciende y detiene. Sloth ya tiene su
versión de Linux (ADR 0006) y todo lo que la web necesita para usarla sin ver su pantalla (ADR 0025).

## Decisión

- **La nube es la Sloth de Linux, la misma que se instala**, en el Codespace de cada quien, con su cuenta de GitHub. Se
  crea desde web.sloth.vancci.org («Abrir Sloth en la nube»), que lleva a `codespaces.new/Vancci-sloth/sloth?quickstart=1`:
  GitHub abre el que ya tengas o crea uno. Nada pasa por nuestros servidores ni nos cuesta.
- **`.devcontainer/`** pone lo que el sistema debe traer: una pantalla virtual (Xvfb) para su ventana, las bibliotecas
  de Electron, Chrome para entrar con Google y las fuentes. Python, FFmpeg y los agentes los baja Sloth sola, como en
  cualquier Linux. Cuatro núcleos y 16 GB: los videos se arman ahí.
- **`sloth-nube.sh`** corre cada vez que el Codespace se enciende: baja el AppImage del cobro la primera vez, lleva lo
  tuyo (hilos, videos, estilos, las cuentas de los agentes) a `/workspaces/.sloth-nube`, que GitHub conserva aunque el
  Codespace se reconstruya, y deja un vigilante que la vuelve a abrir si se cierra. Se actualiza sola con «Actualizar»,
  como en Linux (electron-updater pone el AppImage nuevo).
- **Se entra por la dirección que GitHub da al puerto 4848** (`<codespace>-4848.app.github.dev`). Es privada: GitHub
  solo deja pasar al dueño del Codespace, con su sesión. `SLOTH_NUBE` le dice al servidor esa dirección y la atiende
  como a su propia ventana (`server/nube.ts`), con las mismas reglas contra otros sitios (`Origin`, `Sec-Fetch-Site`).
  No hay túnel ni códigos de dispositivo: cualquier navegador con tu cuenta de GitHub entra, también el celular.
- **Todo va como desde la web.** La interfaz lo sabe porque no llega por un túnel (`enLaNube`, `web/src/web.ts`): los
  inicios de sesión salen en el panel «En tu Sloth en la nube» (ADR 0025), lo que se abre o se descarga se baja al
  dispositivo (no hay Explorador ni carpeta de Descargas que valgan), y «Actualizar» le pregunta a la ventana por el
  servidor (`/api/ventana/…`, `server/navegador-remoto.ts`), porque esa ventana no la ve nadie. Electron no espera ningún
  clic en la nube: sin diálogos, y si el servidor se cae, sale y el vigilante la abre otra vez.

## Consecuencias

- Hace falta una cuenta de GitHub (gratis). Lo gratis alcanza para unas 30 horas al mes en 4 núcleos; luego, GitHub
  cobra a esa cuenta si la deja (por defecto no: se detiene).
- GitHub detiene el Codespace tras un rato sin uso (30 minutos, hasta 4 horas en sus opciones), aunque un agente siga
  trabajando: un video largo conviene con el tiempo subido. Se enciende otra vez en github.com/codespaces y todo sigue
  ahí; la web lo dice al perder la conexión.
- Las cuentas de los agentes quedan en el Codespace de cada quien, en GitHub, no en su computadora. Google puede pedir
  más verificación al entrar desde una máquina de un centro de datos.
- Sin GPU: la voz va con Parakeet y el render con CPU, como en una computadora sin NVIDIA (ADR 0007).
- Si un día conviene una nube nuestra (sin cuenta de GitHub), la misma imagen de `.devcontainer/` corre en Cloudflare
  Containers o en cualquier servidor con Docker: solo cambia quién da la dirección y quién deja entrar.
