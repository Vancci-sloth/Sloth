"""
Prepara la voz que grabó el usuario y escribe src/datos/voz.json, lo que lee el video para saber cuándo pasa cada cosa.

    python -I -B scripts/alinear.py <voz.wav>
    python -I -B scripts/alinear.py --frases     (subtitulos.txt cambió: vuelve a emparejar sin transcribir)

1. Nivela la voz a -14 LUFS (masterizar.mjs de video-base) en public/voz.wav.
2. La transcribe con tiempos por palabra (transcribir.py de Sloth, con las cifras en letra: el alineador no sabe situar
   dígitos).
3. Si Whisper se saltó un tramo con voz o escribió otra frase en lugar de la dicha (pasa: en un video dejó fuera los
   primeros 17 s y apretó lo que seguía al principio), vuelve a transcribir esas zonas en trozos cortos cortados en
   silencios y las cose con el resto (`remendar`).
4. Empareja las frases de subtitulos.txt con lo que de verdad se dijo.
5. Mide el nivel de la voz en cada cuadro, para la boca del personaje.

Deja src/datos/voz.json y una copia en fuentes/voz/voz-lenta.json, de la que parte acelerar.py. Los nombres del tema
que el transcriptor tiene que reconocer van en terminos.txt.

subtitulos.txt: una frase por renglón, tal como se verá arriba. `*palabra*` va en negrita, `[palabra]` lleva la caja
de selección (y negrita), `{Icono}palabra` lleva un ícono delante (un nombre de Phosphor o una imagen de public; nunca
un emoji). Si lo que se ve no es lo que se dice (una cifra),
`$15=quince_dólares`: se ve «$15» y aparece cuando se dice «quince».
"""

import difflib
import json
import re
import subprocess
import sys
import unicodedata
import wave
from pathlib import Path

import numpy as np

BASE = Path.home() / ".claude" / "skills" / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from sloth import MODELOS, proceso, wav16k  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
FPS = 30


def terminos() -> list[str]:
    """Los nombres que el transcriptor tiene que reconocer (terminos.txt, uno por renglón)."""
    ruta = RAIZ / "terminos.txt"
    lineas = ruta.read_text(encoding="utf8").splitlines() if ruta.exists() else []
    return [l.strip() for l in lineas if l.strip() and not l.startswith("#")]


def normal(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    # Whisper escribe «cripto» lo que el guion dice «crypto»: para emparejar, son la misma palabra.
    return re.sub(r"[^a-z0-9ñ%$]", "", s).replace("crypto", "cripto")


def leer_frases(ruta: Path) -> list[list[dict]]:
    frases = []
    for renglon in ruta.read_text(encoding="utf8").splitlines():
        renglon = renglon.strip()
        if not renglon or renglon.startswith("#"):
            continue
        fichas = []
        for tok in renglon.split():
            icono = None
            m = re.match(r"^\{(.+?)\}(.*)$", tok)
            if m:
                icono, tok = m.group(1), m.group(2)
            caja = tok.startswith("[") and tok.rstrip(".,;:!?»").endswith("]")
            clave = caja or (tok.startswith("*") and tok.rstrip(".,;:!?»").endswith("*"))
            visto = tok.replace("[", "").replace("]", "").replace("*", "")
            dicho = visto
            if "=" in visto:
                visto, dicho = visto.split("=", 1)
            # El guion bajo junta varias palabras en una ficha («Proof_of_Liquidity», «6_de_febrero»).
            visto, dicho = visto.replace("_", " "), dicho.replace("_", " ")
            fichas.append({"t": visto, "dicho": dicho.split(), "clave": clave, "caja": caja, "icono": icono})
        frases.append(fichas)
    return frases


def parear(frases: list[list[dict]], palabras: list[dict]) -> tuple[list[str], list[tuple[int, int]], list[int | None]]:
    """Cada palabra dicha del subtítulo, de qué ficha es y en qué palabra de la voz está (None si no está)."""
    dichas, dueno = [], []
    for nf, fr in enumerate(frases):
        for nt, ficha in enumerate(fr):
            for d in ficha["dicho"]:
                dichas.append(normal(d))
                dueno.append((nf, nt))
    voz = [normal(p["w"]) for p in palabras]
    indice: list[int | None] = [None] * len(dichas)
    for bloque in difflib.SequenceMatcher(None, dichas, voz, autojunk=False).get_matching_blocks():
        for k in range(bloque.size):
            indice[bloque.a + k] = bloque.b + k
    return dichas, dueno, indice


def emparejar(frases: list[list[dict]], palabras: list[dict]) -> int:
    """A cada ficha le pone `i`, el índice de la palabra de la voz donde empieza."""
    dichas, dueno, indice = parear(frases, palabras)
    voz = palabras
    faltan = [d for d, v in zip(dichas, indice) if v is None]
    # Lo que no se emparejó toma el índice de su vecino anterior (+1), sin pasarse del siguiente.
    ultimo = -1
    for k, v in enumerate(indice):
        if v is None:
            siguiente = next((x for x in indice[k + 1:] if x is not None), len(voz) - 1)
            indice[k] = min(ultimo + 1, siguiente)
        ultimo = indice[k]
    for k, (nf, nt) in enumerate(dueno):
        frases[nf][nt].setdefault("i", indice[k])
    if faltan:
        print(f"{len(faltan)} palabras del subtítulo no están en la voz (toman el tiempo de su vecina):", " ".join(faltan))
    return len(faltan)


def transcribir(*wavs: Path) -> list[list[dict]]:
    """Las palabras de cada WAV, con Whisper y el alineador cargados una sola vez para todos."""
    d = proceso("transcribir.py", [str(w) for w in wavs], {"modelos": str(MODELOS), "alineador": "voxpopuli-es",
                                                           "terminos": terminos(), "cifras_en_letra": True})
    return [[{"w": p["text"], "s": round(p["start"], 3), "e": round(p["end"], 3)} for p in ws] for ws in d.get("trozos", [d["words"]])]


def energia(v16: Path, paso: float = 0.05) -> np.ndarray:
    """El nivel de la voz cada 50 ms, de 0 a 1 (el WAV de 16 kHz, mono y 16 bits)."""
    with wave.open(str(v16), "rb") as w:
        datos = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    n = int(16000 * paso)
    rms = np.sqrt((datos[: len(datos) // n * n].reshape(-1, n) ** 2).mean(axis=1))
    return rms / (np.percentile(rms, 95) + 1e-9)


def huecos(palabras: list[dict], nivel: np.ndarray, paso: float = 0.05) -> list[tuple[float, float]]:
    """Los tramos de 2 s o más sin palabras en que se oye voz al menos un 30 % del tiempo (las pausas entre frases
    bajan la cuenta: con la mitad, en nuevo-6 se escapó un hueco de 6 s)."""
    bordes = [0.0] + [x for p in palabras for x in (p["s"], p["e"])] + [len(nivel) * paso]
    hay = []
    for a, b in zip(bordes[0::2], bordes[1::2]):
        if b - a >= 2 and (nivel[int(a / paso): int(b / paso)] > 0.1).mean() >= 0.3:
            hay.append((a, b))
    return hay


def silencio(nivel: np.ndarray, desde: float, hasta: float, paso: float = 0.05) -> float:
    """El momento más callado entre dos tiempos, para cortar sin partir una palabra."""
    desde, hasta = max(0.0, desde), min(len(nivel) * paso, hasta)
    i, j = int(desde / paso), max(int(desde / paso) + 1, int(hasta / paso))
    return (i + int(np.argmin(np.convolve(nivel[i:j], np.ones(6) / 6, mode="same")))) * paso


def tiras(palabras: list[dict]) -> list[tuple[float, float, int]]:
    """Dónde faltan 5 o más palabras del subtítulo: desde la última que sí está antes, y cuántas faltan. Pasa cuando
    Whisper escribe otra frase (una repetida, o la siguiente corrida de su sitio) en lugar de la que se dijo; las
    sueltas que coinciden por casualidad («alguien», «compañía») no cortan la tira si son menos de tres seguidas."""
    _, _, indice = parear(leer_frases(RAIZ / "subtitulos.txt"), palabras)
    falta = [v is None for v in indice]
    k = 0
    while k < len(falta):
        fin = k
        while fin < len(falta) and not falta[fin]:
            fin += 1
        if 0 < k and fin < len(falta) and fin - k < 3:
            falta[k:fin] = [True] * (fin - k)
        k = fin + 1
    hay, k = [], 0
    while k < len(falta):
        if not falta[k]:
            k += 1
            continue
        fin = k
        while fin < len(falta) and falta[fin]:
            fin += 1
        n = sum(indice[x] is None for x in range(k, fin))
        if n >= 5:
            antes = palabras[indice[k - 1]]["e"] if k > 0 else 0.0
            despues = palabras[indice[fin]]["s"] if fin < len(indice) else palabras[-1]["e"] + 1
            hay.append((antes, despues, n))
        k = fin
    return hay


def remendar(v16: Path, palabras: list[dict]) -> list[dict]:
    """Arregla lo que Whisper se saltó o cambió. Falla en un tramo largo y acierta en uno corto, así que vuelve a
    transcribir en trozos de 7 s o menos, cortados en silencios, y todos los trozos de una vuelta en una sola llamada
    (cargar los modelos cuesta más que transcribir). Hasta tres vueltas, mientras queden:
    - huecos con voz y sin palabras; la primera vez, desde 30 s antes, porque lo que Whisper dejó ahí suele estar
      corrido de su sitio;
    - tiras de palabras del subtítulo que no están: el tramo mide lo que se tardan en decir (0.35 s cada una), no
      hasta la palabra siguiente, que puede estar fuera de su sitio."""
    nivel = energia(v16)
    total = len(nivel) * 0.05
    for ronda in range(3):
        zonas = []
        for a, b in huecos(palabras, nivel):
            desde = (b - 30 if b > 30 else 0.0) if ronda == 0 else a - 3
            zonas.append((silencio(nivel, desde - 1, desde) if desde > 1 else 0.0, silencio(nivel, b, b + 2)))
            print(f"Whisper se saltó voz entre {a:.1f} y {b:.1f} s.")
        for a, b, n in tiras(palabras):
            hasta = max(b, a + n * 0.35 + 0.8)
            zonas.append((silencio(nivel, a - 0.5, a) if a > 0.5 else 0.0, silencio(nivel, hasta, hasta + 1.5)))
            print(f"A Whisper le faltan {n} palabras desde {a:.1f} s.")
        if not zonas:
            break
        zonas.sort()
        juntas = [list(zonas[0])]
        for a, b in zonas[1:]:
            if a <= juntas[-1][1]:
                juntas[-1][1] = max(juntas[-1][1], b)
            else:
                juntas.append([a, b])
        trozos = []
        for a, b in juntas:
            cortes = [a]
            while b - cortes[-1] > 7:
                cortes.append(silencio(nivel, cortes[-1] + 4, cortes[-1] + 7))
            trozos += list(zip(cortes, cortes[1:] + [b]))
        print(f"Vuelta {ronda + 1}: transcribo {len(trozos)} trozos ({', '.join(f'{a:.1f}–{b:.1f}' for a, b in juntas)} s).")
        archivos = []
        for k, (x, y) in enumerate(trozos):
            archivos.append(v16.with_name(f"trozo-{k}.wav"))
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{x:.3f}", "-t", f"{min(total, y) - x:.3f}", "-i",
                            str(v16), str(archivos[-1])], check=True)
        nuevas = transcribir(*archivos)
        for a_ in archivos:
            a_.unlink()
        for a, b in juntas:
            palabras = [p for p in palabras if p["e"] <= a or p["s"] >= b]
        for (x, _), ws in zip(trozos, nuevas):
            palabras += [{"w": p["w"], "s": round(p["s"] + x, 3), "e": round(p["e"] + x, 3)} for p in ws]
        palabras.sort(key=lambda p: p["s"])
    return palabras


def nivel_por_cuadro(wav: Path) -> list[float]:
    # La voz masterizada viene en 24 bits: FFmpeg la da en 16 bits y mono, más fácil de leer.
    sr = 48000
    pcm = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(wav), "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    datos = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    paso = sr // FPS
    cuadros = len(datos) // paso
    rms = np.sqrt((datos[: cuadros * paso].reshape(cuadros, paso) ** 2).mean(axis=1))
    rms /= np.percentile(rms[rms > 0], 95) + 1e-9
    return [round(float(v), 3) for v in np.clip(rms, 0, 1)]


def solo_frases() -> None:
    """Empareja otra vez subtitulos.txt con las palabras ya transcritas (fuentes/palabras.json): unos segundos. La
    duración y la boca son las de la voz lenta; luego hay que volver a correr acelerar.py."""
    lenta = RAIZ / "fuentes" / "voz" / "voz-lenta.json"
    if not lenta.exists():
        sys.exit("Todavía no hay voz alineada: corre alinear.py con la voz primero.")
    salida = json.loads(lenta.read_text(encoding="utf8"))
    palabras = json.loads((RAIZ / "fuentes" / "palabras.json").read_text(encoding="utf8"))
    frases = leer_frases(RAIZ / "subtitulos.txt")
    emparejar(frases, palabras)
    salida["frases"] = [{"palabras": [{k: f[k] for k in ("t", "i", "clave", "caja", "icono")} for f in fr]} for fr in frases]
    for ruta in (lenta, RAIZ / "src" / "datos" / "voz.json"):
        ruta.write_text(json.dumps(salida, ensure_ascii=False), encoding="utf8")
    print(f"{len(frases)} frases emparejadas otra vez. Ahora acelerar.py, con las mismas opciones que la primera vez.")


def main() -> None:
    if sys.argv[1:] == ["--frases"]:
        return solo_frases()
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    original = Path(sys.argv[1])
    voz = RAIZ / "public" / "voz.wav"
    voz.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["node", str(BASE / "masterizar.mjs"), str(original), str(voz)], check=True)
    v16 = RAIZ / "fuentes" / "voz16k.wav"
    v16.parent.mkdir(parents=True, exist_ok=True)
    wav16k(voz, v16)
    palabras = transcribir(v16)[0]
    frases = leer_frases(RAIZ / "subtitulos.txt")
    if huecos(palabras, energia(v16)) or tiras(palabras):
        remendadas = remendar(v16, palabras)
        # Se queda la que empareja más palabras del subtítulo.
        if emparejar(leer_frases(RAIZ / "subtitulos.txt"), remendadas) <= emparejar(leer_frases(RAIZ / "subtitulos.txt"), palabras):
            palabras = remendadas
    (RAIZ / "fuentes" / "palabras.json").write_text(json.dumps(palabras, ensure_ascii=False, indent=1), encoding="utf8")
    emparejar(frases, palabras)
    # Lo que sigue faltando después de remendar casi siempre no se grabó: en nuevo-10 la voz generada se saltó una frase
    # y el agente gastó minutos buscándola en el audio.
    for antes, despues, n in tiras(palabras):
        print(f"⚠ Faltan {n} palabras seguidas entre {antes:.1f} y {despues:.1f} s aun transcribiendo en trozos"
              + (" y no caben en ese hueco" if despues - antes < 0.15 * n else "")
              + ": seguramente no están en la grabación. No las busques en el audio: dile al usuario qué frase falta (las "
              "palabras de arriba) y que la grabe o te diga que va sin ella; sin ella, quítala de subtitulos.txt y corre "
              "alinear.py --frases y acelerar.py.")
    with wave.open(str(voz), "rb") as w:
        duracion = w.getnframes() / w.getframerate()
    salida = {
        "duracion": round(duracion, 3),
        "palabras": palabras,
        "frases": [{"palabras": [{k: f[k] for k in ("t", "i", "clave", "caja", "icono")} for f in fr]} for fr in frases],
        "boca": nivel_por_cuadro(voz),
    }
    (RAIZ / "src" / "datos" / "voz.json").write_text(json.dumps(salida, ensure_ascii=False), encoding="utf8")
    # Los tiempos de la voz tal como se grabó: acelerar.py parte de ellos.
    (RAIZ / "fuentes" / "voz" / "voz-lenta.json").parent.mkdir(parents=True, exist_ok=True)
    (RAIZ / "fuentes" / "voz" / "voz-lenta.json").write_text(json.dumps(salida, ensure_ascii=False), encoding="utf8")
    print(f"{len(palabras)} palabras, {len(frases)} frases, {duracion:.1f} s")
    print(" ".join(p["w"] for p in palabras))


if __name__ == "__main__":
    main()
