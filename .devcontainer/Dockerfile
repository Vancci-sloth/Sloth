# Sloth en la nube (docs/adr/0026-sloth-en-la-nube.md): lo que la Sloth de Linux necesita del sistema para correr en un
# Codespace, sin pantalla. Sloth trae su propio Node y baja sola su Python, FFmpeg y los agentes (server/requisitos.ts);
# aquí va lo demás: una pantalla virtual (Xvfb) para su ventana, las bibliotecas de Electron, Chrome para entrar con
# Google (server/chromium.ts) y las fuentes de los videos.
FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

RUN export DEBIAN_FRONTEND=noninteractive \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    xvfb xauth dbus-x11 \
    libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxtst6 libnotify4 libsecret-1-0 libdrm2 libxkbfile1 libatspi2.0-0t64 \
    curl ca-certificates xz-utils procps util-linux \
    fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fonts-liberation fonts-dejavu-core \
  && curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && apt-get install -y --no-install-recommends /tmp/chrome.deb \
  && rm -f /tmp/chrome.deb \
  && rm -rf /var/lib/apt/lists/*
