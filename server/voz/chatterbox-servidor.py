"""
El servidor local de Chatterbox Multilingual (Resemble AI, MIT) para Sloth (`server/voz/chatterbox.ts`). Lo arranca
Sloth con el Python del entorno donde instalaste `chatterbox-tts`, y solo escucha en 127.0.0.1:

    <python del entorno> chatterbox-servidor.py --puerto 8189

GET  /salud -> {"modelo": ..., "dispositivo": "cuda"|"mps"|"cpu", "idiomas": [...]}
POST /tts   {"texto": ..., "idioma": "es", "referencia": "/ruta/voz.wav"?, "exageracion": 0.5?} -> audio/wav, 16 bits, mono

El texto se parte en frases (el modelo rinde mejor con trozos cortos), que se juntan con una pausa corta. Una voz a la
vez: la GPU es una sola.
"""
import argparse
import io
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELO = {"modelo": None, "dispositivo": None, "idiomas": []}
CERROJO = threading.Lock()


def cargar():
    import torch
    from chatterbox.mtl_tts import SUPPORTED_LANGUAGES, ChatterboxMultilingualTTS

    if torch.cuda.is_available():
        dispositivo = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        dispositivo = "mps"
    else:
        dispositivo = "cpu"
    MODELO["tts"] = ChatterboxMultilingualTTS.from_pretrained(device=dispositivo)
    MODELO["modelo"] = "chatterbox-multilingual"
    MODELO["dispositivo"] = dispositivo
    MODELO["idiomas"] = sorted(SUPPORTED_LANGUAGES.keys())


def frases(texto, maximo=280):
    partes = re.split(r"(?<=[.!?;:])\s+", texto.strip())
    trozos, actual = [], ""
    for p in partes:
        if actual and len(actual) + len(p) + 1 > maximo:
            trozos.append(actual)
            actual = p
        else:
            actual = f"{actual} {p}".strip()
    if actual:
        trozos.append(actual)
    return trozos


def generar(datos):
    import torch
    import torchaudio

    tts = MODELO["tts"]
    kw = {"language_id": datos.get("idioma") or "es"}
    if datos.get("referencia"):
        kw["audio_prompt_path"] = datos["referencia"]
    if datos.get("exageracion") is not None:
        kw["exaggeration"] = float(datos["exageracion"])
    pausa = torch.zeros(1, int(tts.sr * 0.15))
    piezas = []
    with CERROJO:
        for trozo in frases(datos["texto"]):
            wav = tts.generate(trozo, **kw)
            piezas += [wav.cpu().reshape(1, -1), pausa]
    audio = torch.cat(piezas[:-1], dim=1).clamp(-1, 1)
    buf = io.BytesIO()
    # PCM de 16 bits, como las demás voces de Sloth.
    torchaudio.save(buf, audio, tts.sr, format="wav", encoding="PCM_S", bits_per_sample=16)
    return buf.getvalue()


class Manejador(BaseHTTPRequestHandler):
    def _json(self, estado, datos):
        cuerpo = json.dumps(datos).encode("utf8")
        self.send_response(estado)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/salud":
            return self._json(200, {k: MODELO[k] for k in ("modelo", "dispositivo", "idiomas")})
        self._json(404, {"error": "no existe"})

    def do_POST(self):
        if self.path != "/tts":
            return self._json(404, {"error": "no existe"})
        try:
            datos = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))) or b"{}")
            if not (datos.get("texto") or "").strip():
                return self._json(400, {"error": "falta el texto"})
            wav = generar(datos)
        except Exception as e:  # noqa: BLE001 - quien pidió recibe el motivo
            return self._json(500, {"error": str(e)})
        self.send_response(200)
        self.send_header("content-type", "audio/wav")
        self.send_header("content-length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--puerto", type=int, default=8189)
    args = ap.parse_args()
    cargar()
    ThreadingHTTPServer(("127.0.0.1", args.puerto), Manejador).serve_forever()
