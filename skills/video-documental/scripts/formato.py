"""El formato del video: horizontal (1920×1080, YouTube) o vertical (1080×1920, TikTok, Reels, Shorts).

Lo dice `formato.txt` en la carpeta del video (lo deja `nuevo.py --vertical`; sin él, horizontal). La variable
EV1_FORMATO=vertical|horizontal lo pisa. Todo lo que dibuja o corta (los dispositivos, ev1_treat, ev1_clip, matte,
terminar) lo lee de aquí, desde la carpeta del video.
"""
import os
from pathlib import Path

TAMANOS = {'horizontal': (1920, 1080), 'vertical': (1080, 1920)}


def formato(carpeta='.'):
    f = os.environ.get('EV1_FORMATO', '').strip().lower()
    if not f:
        p = Path(carpeta) / 'formato.txt'
        f = p.read_text(encoding='utf-8').strip().lower() if p.exists() else 'horizontal'
    if f not in TAMANOS:
        raise SystemExit(f'formato desconocido: {f!r} (horizontal o vertical)')
    return f


def tamano(carpeta='.'):
    """(ancho, alto) del video."""
    return TAMANOS[formato(carpeta)]
