"""
Un video Low-Poly entero en un comando, de fondo: de guion.md y momentos.json (lo único que escribe el agente) a
out/<carpeta>.mp4 con su portada y su hoja de cuadros. Sigue el motor común (video-base/MOTOR.md).

    python -B -X utf8 <skill>/scripts/hacer.py --revisa                      solo revisa momentos.json (un segundo)
    python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz> [--dura <s>]   la voz de AI Studio (la línea `Voz:`)
    python -B -X utf8 <skill>/scripts/hacer.py --audio <archivo>             la que grabó el usuario (m4a, mp3, un video…)
    python -B -X utf8 <skill>/scripts/hacer.py                               otra vez, con la voz que ya hay
    --muestras <n>   un borrador más rápido (el video final va con las 64 del estilo)

Sin voz (`"voz": false` en momentos.json, como la referencia): cada momento va en su `segundo` en vez de en una
palabra, guion.md solo hace falta para el título, y el sonido es la mezcla completa del kit (música, ambiente y
efectos) a −15 LUFS, como pedía la referencia.

Desde la raíz del proyecto. En orden, y para en el primer ✗ diciendo qué arreglar:
1. Comprueba momentos.json contra guion.md (cada palabra, cada lugar y cada cosa) antes de pagar la voz.
2. La voz (solo si el guion cambió) y sus palabras con su segundo (el transcriptor de Sloth).
3. Ancla cada momento a la palabra que dijo la voz y escribe revision/plan.json: lo que dibuja el director (kit/low-poly.js).
4. Dibuja cada cuadro en Chrome con la tarjeta (render.mjs, 64 sub-render por cuadro, como la referencia) y su sonido,
   salido del mismo plan; si el plan y el kit no cambiaron, no lo dibuja otra vez.
5. Mezcla la voz con los efectos, masteriza (−14 LUFS), pone la portada y deja revision/hoja.png.
"""

import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = (Path(os.environ["SLOTH_SKILLS"]) if os.environ.get("SLOTH_SKILLS") else SKILL.parent) / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from momentos import Reloj, anclar, guardar, hoja, leer, normal, palabras_de, parar  # noqa: E402

RAIZ = Path.cwd()
VOZ = RAIZ / "fuentes" / "voz"
# Palabras por segundo de una voz natural en español (AI Studio dice 2,6 a 3; la del usuario, parecido).
POR_SEGUNDO = 2.8

# Los lugares del mapa (LUGARES de kit/low-poly.js), por su nombre sin acentos.
LUGARES = {"mar": "mar", "cielo": "cielo", "montana": "montaña", "monte": "montaña", "rio": "rio", "costa": "costa",
           "puerto": "costa", "llanura": "llanura", "pueblo": "llanura", "valle": "valle", "campo": "valle", "bosque": "bosque",
           "todo": "todo"}
TIERRA = {"costa", "llanura", "valle", "rio", "bosque", "montaña"}
# Cada cosa, dónde puede ir y qué es.
COSAS = {
    "vapor": ({"mar", "costa", "rio", "llanura", "valle"}, "gotas que suben del suelo o del agua a su nube"),
    "nube": ({"mar", "cielo", "montaña", "rio", "costa", "llanura", "valle", "bosque"}, "una nube que se despliega faceta por faceta"),
    "lluvia": ({"mar", "cielo", "montaña", "rio", "costa", "llanura", "valle", "bosque"}, "su nube se oscurece y llueve"),
    "rio": ({"rio"}, "el agua se despliega río abajo y brotan los árboles de la orilla"),
    "anillo": ({"mar", "costa", "rio", "todo"}, "un anillo de luz que corre por el mar: el resultado, el ciclo que se cierra"),
    "arboles": (TIERRA, "una arboleda que brota árbol por árbol"),
    "rocas": (TIERRA, "unas rocas que salen del suelo"),
    "casas": ({"costa", "llanura", "valle", "rio"}, "un pueblo de cinco casas que brotan una por una"),
    "cultivo": ({"costa", "llanura", "valle", "rio"}, "surcos de dos colores que se despliegan"),
    "molino": ({"costa", "llanura", "valle", "rio"}, "un molino de viento con sus aspas girando"),
    "fabrica": ({"costa", "llanura", "valle", "rio"}, "una fábrica con su chimenea echando humo"),
    "planta": ({"costa", "llanura", "valle", "rio", "bosque"}, "un brote que crece del suelo"),
    "faro": ({"mar", "costa"}, "un faro con su luz (en el mar, en el islote)"),
    "barco": ({"mar", "costa"}, "un barco de papel que navega (con `a`, de un lugar al otro)"),
    "camion": ({"costa", "llanura", "valle"}, "un camión que va por un camino que se despliega hasta `a`"),
    "puente": ({"rio"}, "un puente de tablas que se arma de orilla a orilla"),
}
AMBIENTE = {"vapor", "nube", "lluvia", "anillo", "rio", "barco"}  # no ocupan hueco en su lugar
HUECOS = 4


def texto_del_guion(hace_falta: bool = True) -> str:
    """Lo que se dice: guion.md sin el título ni la línea del corte de datos."""
    archivo = RAIZ / "guion.md"
    if not archivo.exists():
        if not hace_falta:
            return ""
        sys.exit(f"✗ Falta guion.md en {RAIZ}.")
    lineas = [l for l in archivo.read_text(encoding="utf-8").splitlines() if l.strip()]
    return " ".join(l for l in lineas if not l.startswith("#") and not l.lower().startswith("corte de datos"))


def titulo(m: dict) -> str:
    if (m.get("titulo") or "").strip():
        return m["titulo"].strip()
    if (RAIZ / "guion.md").exists():
        for l in (RAIZ / "guion.md").read_text(encoding="utf-8").splitlines():
            if l.startswith("# "):
                return l[2:].strip()
    return RAIZ.name


def lugar_de(n) -> str | None:
    return LUGARES.get(normal(str(n or "")))


def entradas(mo: dict) -> list[dict]:
    e = mo.get("entra") or []
    return [x if isinstance(x, dict) else {"tipo": x} for x in (e if isinstance(e, list) else [e])]


def comprobar(m: dict, dichas: list[str], donde: str) -> tuple[list[int], list[str]]:
    """Todo lo que falla de una vez: cada ✗ suelto le cuesta al agente una vuelta."""
    errores = []
    if m.get("formato", "vertical") not in ("vertical", "horizontal"):
        errores.append("`formato` es «vertical» o «horizontal» (la línea `Formato:` del mensaje)")
    ms = m.get("momentos")
    if not isinstance(ms, list) or not ms:
        return [], errores + ["no hay `momentos`"]
    if m.get("voz") is False:
        # Sin voz, cada momento en su segundo, en orden, y el primero en el 0.
        indices, antes = [], -1.0
        for k, mo in enumerate(ms):
            seg = mo.get("segundo")
            if not isinstance(seg, (int, float)) or isinstance(seg, bool):
                errores.append(f"momento {k + 1}: sin voz, cada momento dice su `segundo`")
            elif k == 0 and seg != 0:
                errores.append("momento 1: el primer momento es el primer cuadro: `segundo: 0`")
            elif seg <= antes:
                errores.append(f"momento {k + 1}: su `segundo` ({seg}) va antes que el del anterior; ordénalos")
            else:
                antes = seg
            indices.append(k)
        if m.get("dura") is not None and (not isinstance(m["dura"], (int, float)) or m["dura"] <= antes):
            errores.append("`dura`: los segundos del video, más que el del último momento")
    else:
        indices, malos = anclar(ms, dichas, donde)
        errores += malos
    if m.get("voz") is not False and indices and indices[0] > 2:
        errores.append(f"momento 1 («{ms[0].get('palabra')}»): el primer momento es el primer cuadro (ya está desde el "
                       "principio), así que su palabra va al principio del guion, en sus tres primeras palabras")
    en, ocupado, vistos, banderas, solos, por_lugar = None, {}, set(), 0, {"rio": 0, "anillo": 0}, {}
    for k, mo in enumerate(ms):
        que = f"momento {k + 1} («{mo.get('palabra', '')}»)"
        if mo.get("en") is not None:
            en = lugar_de(mo["en"])
            if not en:
                errores.append(f"{que}: no hay lugar «{mo['en']}»; son {', '.join(sorted(set(LUGARES.values())))}")
        elif k == 0:
            errores.append(f"{que}: el primer momento dice `en` (el lugar del mapa donde pasa)")
        if mo.get("camara") not in (None, "cerca"):
            errores.append(f"{que}: `camara` solo puede ser «cerca» (sin ella, el encuadre lo pone el director)")
        b = mo.get("bandera")
        if b is not None:
            banderas += 1
            por_lugar[en] = por_lugar.get(en, 0) + 1
            if por_lugar[en] == 3:
                errores.append(f"{que}: es la tercera bandera en «{en}»; dos como mucho por lugar (la segunda va arriba de la primera)")
            if en == "todo":
                errores.append(f"{que}: en «todo» no hay dónde clavar la bandera: va en el momento de su lugar")
            if len(str(b).split()) > 3 or len(str(b)) > 16:
                errores.append(f"{que}: la bandera «{b}» es larga: de una a tres palabras y 16 letras como mucho (se lee de lejos)")
        es = entradas(mo)
        if len(es) > 3:
            errores.append(f"{que}: entran {len(es)} cosas a la vez; tres como mucho, que se vea cada una")
        for e in es:
            if e.get("pieza") is not None:
                # Una pieza a la medida: piezas/<nombre>.js del proyecto (ver «Piezas a la medida» en SKILL.md).
                n = str(e["pieza"])
                e_en = lugar_de(e["en"]) if e.get("en") else en
                if not re.fullmatch(r"[a-z0-9-]+", n):
                    errores.append(f"{que}: la pieza «{n}» se nombra en minúsculas y con guiones (como su archivo)")
                elif not (RAIZ / "piezas" / f"{n}.js").exists():
                    errores.append(f"{que}: falta piezas/{n}.js (la pieza «{n}»)")
                elif "registrarPieza(" not in (RAIZ / "piezas" / f"{n}.js").read_text(encoding="utf-8"):
                    errores.append(f"{que}: piezas/{n}.js no llama a registrarPieza('{n}', {{ ... }})")
                if e_en in ("todo", "cielo"):
                    errores.append(f"{que}: una pieza va en un lugar con suelo, no en «{e_en}»")
                ocupado[e_en] = ocupado.get(e_en, 0) + 1
                if ocupado[e_en] == HUECOS + 1:
                    errores.append(f"{que}: en «{e_en}» ya hay {HUECOS} cosas; la que sigue va en otro lugar")
                continue
            tipo = normal(str(e.get("tipo", "")))
            if tipo not in COSAS:
                errores.append(f"{que}: no hay cosa «{e.get('tipo')}»; son {', '.join(COSAS)}")
                continue
            e_en = lugar_de(e["en"]) if e.get("en") else en
            if e.get("en") and not e_en:
                errores.append(f"{que}: no hay lugar «{e['en']}»")
                continue
            if e_en and e_en not in COSAS[tipo][0]:
                errores.append(f"{que}: «{tipo}» no va en «{e_en}»; va en {', '.join(sorted(COSAS[tipo][0]))}")
            if (tipo, e_en) in vistos and tipo not in ("lluvia",):
                errores.append(f"{que}: ya entró «{tipo}» en «{e_en}»; una cosa entra una vez y se queda")
            vistos.add((tipo, e_en))
            if tipo in solos:
                solos[tipo] += 1
            if tipo not in AMBIENTE:
                ocupado[e_en] = ocupado.get(e_en, 0) + 1
                if ocupado[e_en] == HUECOS + 1:
                    errores.append(f"{que}: en «{e_en}» ya hay {HUECOS} cosas; la que sigue va en otro lugar")
            a = e.get("a")
            if tipo == "camion":
                if lugar_de(a) not in ("costa", "llanura", "valle") or lugar_de(a) == e_en:
                    errores.append(f"{que}: el camión dice `a`: otro lugar de tierra plana (costa, llanura o valle)")
            elif tipo == "barco":
                if a is not None and lugar_de(a) not in ("mar", "costa"):
                    errores.append(f"{que}: el barco va por agua: `a` es «mar» o «costa»")
            elif a is not None:
                errores.append(f"{que}: `a` solo lo llevan el camión y el barco")
    if banderas > 7:
        errores.append(f"hay {banderas} banderas: siete como mucho, una por etapa del proceso")
    if not banderas:
        errores.append("ninguna bandera: cada etapa del proceso clava la suya, con su nombre (es lo que se lee sin sonido)")
    for tipo, n in solos.items():
        if n > 1:
            errores.append(f"«{tipo}» entra {n} veces: hay uno solo en el mapa")
    if lugar_de(ms[-1].get("en")) != "todo":
        errores.append("el último momento va `en: \"todo\"`: la cámara sale a ver el mundo entero con el resultado")
    return indices, errores


def mapa(guion: list[str], dichas: list[str]) -> dict[int, int]:
    """De cada palabra del guion a la que dijo la voz en ese sitio: el transcriptor escribe a su modo lo que no conoce."""
    m: dict[int, int] = {}
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, guion, dichas, autojunk=False).get_opcodes():
        for k in range(a1 - a0):
            m[a0 + k] = b0 + min(k, max(0, b1 - b0 - 1))
    return m


def huella(*partes) -> str:
    h = hashlib.sha1()
    for p in partes:
        h.update(p if isinstance(p, bytes) else str(p).encode("utf-8"))
    return h.hexdigest()[:16]


def pedir(ruta: str, datos: dict | None = None) -> dict:
    url = os.environ.get("SLOTH_URL", "http://127.0.0.1:4848") + ruta
    pedido = urllib.request.Request(url, data=json.dumps(datos).encode() if datos else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"✗ AI Studio: {json.load(e).get('error', e)} (si es la cuenta o la cuota, VOZ.md de video-base: «Si falla»)")
    except urllib.error.URLError as e:
        sys.exit(f"✗ Sloth no contesta en {url}: {e.reason}")


def voz(args: list[str], guion_txt: str, reloj: Reloj) -> None:
    """fuentes/voz/original.wav (48 kHz, sin el silencio de las puntas), solo si el guion o el audio cambiaron."""
    VOZ.mkdir(parents=True, exist_ok=True)
    marca = VOZ / "hecha.json"
    antes = json.loads(marca.read_text(encoding="utf-8")) if marca.exists() else {}
    if "--studio" in args:
        nombre = args[args.index("--studio") + 1]
        clave = huella("studio", nombre, guion_txt)
        if antes.get("clave") == clave and (VOZ / "original.wav").exists():
            reloj.paso("voz: la de antes (el guion no cambió)")
            return
        reloj.paso(f"voz de AI Studio ({nombre})…")
        salida = VOZ / "ai-studio.wav"
        t = pedir("/api/voz/generar", {"voz": nombre, "archivo": str((RAIZ / "guion.md").resolve()), "salida": str(salida.resolve())})
        while t["estado"] in ("en-fila", "generando"):
            t = pedir(f"/api/voz/trabajos/{t['id']}?esperar=40")
        if t["estado"] == "error":
            sys.exit(f"✗ AI Studio: {t['error']} (VOZ.md de video-base: «Si falla»)")
        audio = salida
    elif "--audio" in args:
        audio = Path(args[args.index("--audio") + 1]).expanduser()
        if not audio.exists():
            sys.exit(f"✗ No encuentro el audio {audio}.")
        clave = huella("audio", audio.stat().st_size, audio.stat().st_mtime_ns, audio.name)
        if antes.get("clave") == clave and (VOZ / "original.wav").exists():
            reloj.paso("voz: la de antes")
            return
        reloj.paso("tu voz…")
    else:
        if not (VOZ / "original.wav").exists():
            sys.exit("✗ Aún no hay voz: corre hacer.py con --studio <Voz> (la línea `Voz:`) o con --audio <archivo> (la del usuario).")
        return
    # Sin el silencio largo de las puntas: deja 0,15 s antes de la primera palabra y 0,4 después de la última.
    puntas = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,"
              "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.4,areverse")
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(audio), "-vn", "-af", puntas, "-ac", "2", "-c:a", "pcm_s16le",
                    "-ar", "48000", str(VOZ / "original.wav")], check=True)
    (VOZ / "palabras.json").unlink(missing_ok=True)
    guardar(marca, {"clave": clave})


def palabras(reloj: Reloj) -> list[dict]:
    """Las palabras de la voz con su segundo (WhisperX de Sloth), guardadas mientras la voz no cambie."""
    archivo, original = VOZ / "palabras.json", VOZ / "original.wav"
    clave = huella(original.read_bytes())
    if archivo.exists():
        d = json.loads(archivo.read_text(encoding="utf-8"))
        if d.get("clave") == clave:
            return d["palabras"]
    reloj.paso("transcribo la voz…")
    from sloth import MODELOS, proceso, wav16k  # el Python de Sloth y su WhisperX: solo hace falta aquí
    v16 = VOZ / "voz.16k.wav"
    wav16k(original, v16)
    t = RAIZ / "terminos.txt"
    terminos = [x.strip() for x in t.read_text(encoding="utf-8").splitlines() if x.strip()] if t.exists() else []
    try:
        d = proceso("transcribir.py", [str(v16)], {"modelos": str(MODELOS), "alineador": "voxpopuli-es", "terminos": terminos, "cifras_en_letra": True})
    finally:
        v16.unlink(missing_ok=True)
    ps = [{"w": p["text"], "s": round(p["start"], 3), "e": round(p["end"], 3)} for p in d["words"]]
    if not ps:
        sys.exit("✗ La voz no trae palabras: ¿se oye?")
    guardar(archivo, {"clave": clave, "palabras": ps})
    return ps


def plan(m: dict, ps: list[dict], guion: list[str], indices: list[int]) -> tuple[dict, list[str]]:
    """revision/plan.json: cada momento en el segundo en que la voz dice su palabra (sin voz, en su `segundo`)."""
    sin_voz = m.get("voz") is False
    dichas = [normal(p["w"]) for p in ps]
    a_voz = mapa(guion, dichas)
    vertical = m.get("formato", "vertical") == "vertical"
    # El último segundo y medio se queda quieto, con el resultado a la vista (en la referencia, 1,65 s tras el anillo).
    if sin_voz:
        duracion = round(float(m.get("dura") or m["momentos"][-1]["segundo"] + 1.65), 2)
    else:
        duracion = round(ps[-1]["e"] + 1.6, 2)
    momentos, errores, en = [], [], None
    for k, (mo, i) in enumerate(zip(m["momentos"], indices)):
        en = lugar_de(mo["en"]) if mo.get("en") else en
        t = float(mo["segundo"]) if sin_voz else 0.0 if k == 0 else ps[a_voz.get(i, i)]["s"]
        if momentos and t <= momentos[-1]["t"]:
            t = momentos[-1]["t"] + 0.3
        es = []
        for e in entradas(mo):
            x = {"tipo": "pieza", "pieza": str(e["pieza"])} if e.get("pieza") is not None else {"tipo": normal(str(e["tipo"]))}
            if e.get("en"):
                x["en"] = lugar_de(e["en"])
            if e.get("a"):
                x["a"] = lugar_de(e["a"])
            es.append(x)
        o = {"t": round(t, 3), "en": en, "entra": es}
        for clave in ("bandera", "camara"):
            if mo.get(clave):
                o[clave] = mo[clave]
        momentos.append(o)
    # La cámara viaja de un lugar a otro en algo más de un segundo: dos cambios de lugar más juntos no dejan ver nada.
    # Desde que empieza cada lugar (la referencia pasa del monte al río en 0,8 s).
    empieza = momentos[0]
    for a, b in zip(momentos, momentos[1:]):
        if b["en"] != a["en"]:
            if b["t"] - empieza["t"] < 0.75:
                errores.append(f"«{b['en']}» empieza {b['t'] - empieza['t']:.1f} s después de «{empieza['en']}»: la cámara no llega a "
                               "verlo. Junta esos momentos en un lugar o ancla el segundo más adelante")
            empieza = b
    return {"ancho": 1080 if vertical else 1920, "alto": 1920 if vertical else 1080, "duracion": duracion, "voz": not sin_voz, "momentos": momentos}, errores


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    m = leer(RAIZ)
    sin_voz = m.get("voz") is False
    guion_txt = texto_del_guion(not sin_voz)
    guion = palabras_de(guion_txt)
    indices, errores = comprobar(m, guion, "el guion")
    if "--dura" in args and not sin_voz:
        pide, n = float(args[args.index("--dura") + 1]), len(guion)
        if abs(n / POR_SEGUNDO - pide) > pide * 0.1:
            errores.append(f"el guion tiene {n} palabras: dicho a {POR_SEGUNDO} por segundo dura {n / POR_SEGUNDO:.0f} s y "
                           f"pidieron {pide:.0f} ({int(pide * POR_SEGUNDO)} palabras)")
    parar(errores)
    if "--revisa" in args:
        lugares = []
        for mo in m["momentos"]:
            if mo.get("en") and (not lugares or lugares[-1] != lugar_de(mo["en"])):
                lugares.append(lugar_de(mo["en"]))
        if sin_voz:
            dura = f"{float(m.get('dura') or m['momentos'][-1]['segundo'] + 1.65):.1f} s sin voz"
        else:
            dura = f"~{len(guion) / POR_SEGUNDO:.0f} s de voz"
        print(f"✓ momentos.json bien: {len(m['momentos'])} momentos, de {' → '.join(lugares)}; {dura}.")
        return

    reloj = Reloj(RAIZ)
    ps = []
    if not sin_voz:
        voz(args, guion_txt, reloj)
        ps = palabras(reloj)
        reloj.paso(f"voz: {len(ps)} palabras, {ps[-1]['e']:.1f} s")
    p, errores = plan(m, ps, guion, indices)
    parar(errores, "los tiempos de la voz")
    guardar(RAIZ / "revision" / "plan.json", p)

    # El render, solo si cambió algo que se ve (el plan o el kit): arreglar la mezcla no dibuja otra vez.
    kit = SKILL / "kit"
    muestras = args[args.index("--muestras") + 1] if "--muestras" in args else None
    clave = huella(json.dumps(p, sort_keys=True), muestras or "", *[(kit / n).read_bytes() for n in ("low-poly.js", "stage.js", "sound.js", "pagina.html")],
                  *[f.read_bytes() for f in sorted((RAIZ / "piezas").glob("*.js"))])
    imagen, efectos, hecho = RAIZ / "revision" / "_imagen.mp4", RAIZ / "revision" / "_efectos.wav", RAIZ / "revision" / "_imagen.json"
    previo = json.loads(hecho.read_text(encoding="utf-8")) if hecho.exists() else {}
    if previo.get("clave") == clave and imagen.exists() and efectos.exists():
        reloj.paso("render: el de antes (ni el plan ni el kit cambiaron)")
    else:
        reloj.paso(f"render de {p['duracion']:.1f} s ({round(p['duracion'] * 30)} cuadros, {muestras or 64} sub-render cada uno)…")
        from sloth import turno  # uno a la vez en la tarjeta, como los demás renders de Sloth
        with turno("render-gpu", "Esperando: otro video está usando la tarjeta."):
            r = subprocess.run(["node", str(SKILL / "scripts" / "render.mjs"), ".", "--plan", "revision/plan.json", "--salida", str(imagen.relative_to(RAIZ)),
                                "--sonido", str(efectos.relative_to(RAIZ)), *([] if sin_voz else ["--voz"]), *(["--muestras", muestras] if muestras else [])],
                               cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
        for l in r.stdout.splitlines():
            if l.startswith("⚠"):
                print(l, flush=True)
        if r.returncode:
            sys.exit("✗ render:\n" + (r.stdout + r.stderr)[-2500:])
        guardar(hecho, {"clave": clave})

    reloj.paso("mezcla y master…")
    mezcla, cruda = RAIZ / "revision" / "_mezcla.wav", RAIZ / "revision" / "_mezcla-cruda.wav"
    if sin_voz:
        # La mezcla completa del kit (música, ambiente y efectos), tal cual, a −15 LUFS como pedía la referencia.
        shutil.copy(efectos, cruda)
        lufs = "-15"
    else:
        # La voz a −16 LUFS y los efectos del estilo debajo (el kit ya los baja cuando hay voz); luego el master a −14.
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(VOZ / "original.wav"), "-i", str(efectos), "-filter_complex",
                        "[0:a]aresample=48000,loudnorm=I=-16:TP=-2:LRA=11[v];[1:a]aresample=48000,volume=0.9[e];"
                        "[v][e]amix=inputs=2:duration=longest:normalize=0[m]", "-map", "[m]", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s24le",
                        str(cruda)], check=True)
        lufs = "-14"
    subprocess.run(["node", str(BASE / "masterizar.mjs"), str(cruda), str(mezcla), "--lufs", lufs], check=True, capture_output=True)
    salida = RAIZ / "out" / f"{RAIZ.name}.mp4"
    salida.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(imagen), "-i", str(mezcla), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", f"{p['duracion']:.3f}", "-movflags", "+faststart", str(salida)], check=True)

    reloj.paso("portada…")
    portada = RAIZ / "portada.png"
    vertical = p["alto"] > p["ancho"]
    # De fondo, el mejor cuadro: el segundo lugar ya armado (con su bandera), o la mitad si hay uno solo.
    ts = [mo["t"] for mo in p["momentos"]]
    fondo = min(p["duracion"] - 0.5, (ts[1] + 1.4) if len(ts) > 1 else p["duracion"] / 2)
    subprocess.run(["node", str(BASE / "portada_sin_ia.mjs"), str(salida), str(portada), "--titulo", titulo(m), "--t", f"{fondo:.2f}",
                    "--fuente", str(kit / "letra" / "oswald.woff2"), "--color", "#fff6e4", *([] if vertical else ["--horizontal"])],
                   check=True, capture_output=True)
    if vertical:
        subprocess.run(["node", str(BASE / "portada.mjs"), str(salida), str(portada)], check=True, capture_output=True)
    reloj.listo(salida, [hoja(salida, RAIZ / "revision" / "hoja.png"), portada])


main()
