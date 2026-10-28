"""Lo que comparten los scripts del reel. Todos se corren desde la raíz del proyecto (`reel-<tema>`)."""

import os
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SKILL = Path(__file__).resolve().parent.parent
# Lo que comparten los estilos de video (bajar, transcribir, masterizar, comprobar) vive en video-base, junto a esta
# skill. El Diff es un estilo aparte: el reel no usa sus scripts.
BASE = SKILL.parent / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
PROYECTO = Path.cwd()
# Las pestañas de Chrome que dibujan a la vez. Remotion no arranca si pides más que los hilos del procesador: con 6
# fijos, una computadora de 4 hilos no podía renderizar.
CONCURRENCIA = min(6, os.cpu_count() or 1)


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", *args], check=True)


def base(script: str, *args: str) -> None:
    """Corre un script de video-base: los .mjs con Node, los .py con este Python. Si falla, sale con su código."""
    exe = ["node"] if script.endswith(".mjs") else [sys.executable, "-B"]
    r = subprocess.run([*exe, str(BASE / script), *args])
    if r.returncode:
        sys.exit(r.returncode)


def navegador(p, **opciones):
    """
    El navegador de Playwright (`p`) para capturar: Edge o Chrome si están; si no (en Mac y Linux casi nunca hay Edge), el
    que encuentra `chrome.mjs` de video-base.
    """
    for canal in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=canal, **opciones)
        except Exception:
            pass
    modulo = (BASE / "chrome.mjs").resolve().as_uri()
    r = subprocess.run(["node", "--input-type=module", "-e", f"import {{ buscarChrome }} from '{modulo}'; console.log(buscarChrome())"],
                       capture_output=True, text=True)
    if r.returncode or not r.stdout.strip():
        sys.exit(f"No encontré Edge ni Chrome para abrir la página. {r.stderr.strip()[-300:]}")
    return p.chromium.launch(executable_path=r.stdout.strip(), **opciones)
