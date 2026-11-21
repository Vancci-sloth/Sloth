#!/usr/bin/env bash
# Sloth en la nube (docs/adr/0026-sloth-en-la-nube.md): arranca la Sloth de Linux, la misma que se instala en una
# computadora, dentro de este Codespace. Lo corre `postStartCommand` (devcontainer.json) cada vez que el Codespace se
# enciende, y vuelve enseguida: Sloth queda de fondo, cuidada por un vigilante que la vuelve a abrir si se cierra.
#
# - La primera vez baja Sloth del cobro (`/descargar?so=linux`); después se pone al día sola, con «Actualizar».
# - Lo tuyo (hilos, videos, estilos, las cuentas de los agentes) va a /workspaces/.sloth-nube, que GitHub conserva
#   aunque el Codespace se reconstruya; en su sitio de siempre quedan enlaces.
# - Su ventana va a una pantalla virtual (Xvfb) que nadie ve: se usa por la web, en la dirección que GitHub da al puerto
#   4848 (`SLOTH_NUBE`, que el servidor atiende como a su propia ventana: server/nube.ts).
set -u

NUBE_DIR=/workspaces/.sloth-nube
REGISTRO="$NUBE_DIR/sloth-nube.log"
APPIMAGE_SLOTH="$NUBE_DIR/Sloth.AppImage"
PUERTO=4848
# /workspaces es de root en el Codespace: la carpeta se crea una vez para este usuario.
[ -w "$NUBE_DIR" ] || { sudo mkdir -p "$NUBE_DIR" && sudo chown "$(id -u):$(id -g)" "$NUBE_DIR"; }
mkdir -p "$NUBE_DIR/casa"

anotar() { echo "[$(date '+%F %T')] $*" >>"$REGISTRO"; }

# Lo tuyo, fuera del contenedor: si ya había algo en su sitio (una vez anterior sin enlace), se lleva antes.
persistir() {
  local en="$HOME/$1" guardado="$NUBE_DIR/casa/$1"
  [ -L "$en" ] && return
  mkdir -p "$(dirname "$guardado")" "$(dirname "$en")"
  if [ -e "$en" ] && [ ! -e "$guardado" ]; then mv "$en" "$guardado"; else rm -rf "$en"; fi
  [ -e "$guardado" ] || { [ "$2" = archivo ] && : >"$guardado" || mkdir -p "$guardado"; }
  ln -s "$guardado" "$en"
}
for d in .local/share/sloth .config/sloth .claude .codex .agents .config/opencode .local/share/opencode .gemini .grok .pi; do persistir "$d" carpeta; done
persistir .claude.json archivo

export DISPLAY=:99
if ! pgrep -x Xvfb >/dev/null; then
  setsid Xvfb :99 -screen 0 1600x1000x24 -nolisten tcp >/dev/null 2>&1 < /dev/null &
  sleep 1
fi

# La dirección pública del puerto de Sloth. Fuera de un Codespace (para probar con Docker), la que traiga SLOTH_NUBE.
if [ -n "${CODESPACE_NAME:-}" ]; then
  export SLOTH_NUBE="${CODESPACE_NAME}-${PUERTO}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
: "${SLOTH_NUBE:?Falta SLOTH_NUBE: la dirección pública del puerto ${PUERTO}}"
export PORT=$PUERTO

if [ ! -s "$APPIMAGE_SLOTH" ]; then
  anotar "Bajando Sloth"
  curl -fsSL --retry 5 --retry-delay 3 -o "$APPIMAGE_SLOTH.part" "${SLOTH_DESCARGA:-https://api.sloth.vancci.org/descargar?so=linux}" >>"$REGISTRO" 2>&1 \
    && mv "$APPIMAGE_SLOTH.part" "$APPIMAGE_SLOTH" \
    || { anotar "No se pudo bajar Sloth"; exit 1; }
  chmod +x "$APPIMAGE_SLOTH"
fi

# La ventana de Sloth (Electron), viva: sin ella no hay navegador del hilo ni «Actualizar». Los procesos que ya
# terminaron (zombis) no cuentan.
ventana() { ps -eo stat=,comm= | awk '$2 == "sloth.bin" && $1 !~ /^Z/ { f = 1 } END { exit !f }'; }

# Un servidor que se quedó sin su ventana (la cerraron a la fuerza) se cierra con todo lo que lanzó: si no, la Sloth
# nueva no podría escuchar en su puerto.
huerfano() {
  local pid grupo
  for pid in $(pgrep -f 'node scripts/start.mjs --no-open'); do
    grupo=$(ps -o pgid= "$pid" | tr -d ' ')
    [ -n "$grupo" ] && kill -TERM -- "-$grupo" 2>/dev/null
  done
  sleep 2
}

# El vigilante, uno solo aunque el Codespace se encienda dos veces. Al actualizarse, la versión nueva la abre la propia
# Sloth (electron-updater pone el AppImage nuevo en su lugar): se le da tiempo antes de abrir otra.
vigilar() {
  # El candado no lo hereda nada de lo que se abre (`9>&-`): si no, un servidor huérfano lo retendría.
  exec 9>"$NUBE_DIR/vigilante.lock"
  flock -n 9 || exit 0
  while true; do
    if ! ventana; then
      huerfano
      # De las copias desempacadas, solo sirve la más nueva: la de la versión puesta.
      ls -dt /tmp/appimage_extracted_* 2>/dev/null | tail -n +2 | xargs -r rm -rf
      # La versión que se pone sola al actualizarse nombra aquí cada archivo que desempaca: el registro no crece sin fin.
      if [ "$(stat -c %s "$REGISTRO" 2>/dev/null || echo 0)" -gt 5000000 ]; then
        tail -c 500000 "$REGISTRO" >"$REGISTRO.corto" && mv "$REGISTRO.corto" "$REGISTRO"
      fi
      anotar "Abriendo Sloth"
      # Lo que dice Sloth queda en su registro (data/sloth.log); aquí, solo sus errores. Su salida normal es la lista de
      # archivos que nombra el AppImage al desempacarse.
      APPIMAGE_EXTRACT_AND_RUN=1 NO_CLEANUP=1 "$APPIMAGE_SLOTH" --no-sandbox >/dev/null 2>>"$REGISTRO" < /dev/null 9>&-
      anotar "Sloth se cerró ($?)"
      for _ in $(seq 1 45); do ventana && break; sleep 2 9>&-; done
    fi
    sleep 10 9>&-
  done
}
export -f vigilar ventana huerfano anotar
export NUBE_DIR REGISTRO APPIMAGE_SLOTH PUERTO
setsid nohup bash -c vigilar >/dev/null 2>&1 < /dev/null &
anotar "Vigilante en marcha: https://$SLOTH_NUBE"
