"""
Las huellas: que ningún video de un estilo salga igual a otro ya hecho, sin que el agente lea el historial. Cada video
deja una huella en `<skill>/huellas/registro.jsonl` (lo que cuenta y cómo se ve, en palabras) y su hoja de ocho cuadros
en `<skill>/huellas/hojas/<id>.jpg`. Este script compara contra todas y contesta solo lo que choca: cuesta lo mismo con
10 videos que con 1,000, y borrar la carpeta de un video no borra su huella.

Desde la raíz del proyecto:

    python -B -X utf8 <base>/scripts/huellas.py buscar <skill> "<tema>" ["<otro tema>"…] [--serie "<serie>"]
                                         ¿ya se hizo un tema parecido? (todos los candidatos de una vez: el modelo de
                                         vectores tarda en cargar) y los temas de los dos últimos de la serie
    python -B -X utf8 <base>/scripts/huellas.py revisar <skill> [--aunque "<por qué>"]
    python -B -X utf8 <base>/scripts/huellas.py parecidos <skill> [video.mp4]
    python -B -X utf8 <base>/scripts/huellas.py cerrar <skill> [video.mp4]   (lo corre el final del estilo)

- `revisar` lee `fuentes/huella.json` y la compara: el tema, contra todos; la forma, la apertura, el lugar, el
  protagonista, la pieza, la paleta y los objetos, contra los dos últimos; y contra los demás, si se parece en tres
  cosas o más a uno solo. Sin choques, la **reserva**: los otros videos de un lote ya la ven. Con `--aunque`, la
  reserva igual y guarda el porqué (para un choque que no lo es).
- `parecidos` saca ocho cuadros parejos del video a medio hacer (de un borrador ya renderizado, o con `fotos.mjs`), busca en todo el historial los dos que
  más se le parecen en imagen y arma `revision/parecidos.jpg` con los tres, para que lo mire alguien que no lo hizo.
- `cerrar` guarda la hoja del video terminado y marca la huella como terminada.

Lo dicho se compara con vectores (multilingual-e5, el proceso `vectores.py` de Sloth: «sala» y «living» quedan cerca),
guardados en `huellas/.cache`; sin el Python de Sloth, por palabras. El modelo queda cargado entre llamadas
(`vectores_vivo.py`): un texto nuevo tarda menos de un segundo, no ~18. La imagen, por sus colores y por cuánto se parece
cada cuadro al más cercano del otro video, solo en la zona del medio (el texto de arriba y el perro son iguales a
propósito en todos).
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sloth import MODELOS, ffmpeg, turno, vectorizar  # noqa: E402

# Lo que se dice de un video, en palabras. `paleta` (dos colores) y `objetos` (ids de la biblioteca) van aparte.
CAMPOS = ["tema", "forma", "apertura", "lugar", "protagonista", "pieza"]
NOMBRES = {"tema": "tema", "forma": "forma", "apertura": "apertura", "lugar": "lugar", "protagonista": "protagonista",
           "pieza": "pieza propia", "paleta": "paleta", "objetos": "objetos"}
# Coseno de e5 («query: » a los dos lados) desde el que dos textos dicen lo mismo, y su equivalente por palabras.
# Medidos con campos de pocas palabras: lo mismo dicho de otro modo («la sala de su casa» y «el living de su
# departamento», «una cartera de cuero» y «una billetera de piel») da 0.89–0.93; lo distinto, 0.78–0.88. Con textos
# largos todo sube a 0.85–0.95 por el relleno que comparten, y no separa: por eso la huella va en pocas palabras.
PARECIDO = {"vectores": 0.89, "palabras": 0.35}
MISMO_TEMA = {"vectores": 0.9, "palabras": 0.45}
# Distancia en Lab (ΔE) desde la que dos fondos ya se ven distintos: un negro verdoso (#1b2418) junto al negro (#0f0f0f)
# da 13 y se ve igual; un azul noche (#14233a), 19, y ya se nota.
OTRO_COLOR = 15
# Una reserva sin terminar deja de contar a la semana: ese video se abandonó.
CADUCA = timedelta(days=7)
CUADROS = 8
CELDA = (144, 256)
# La zona del medio del cuadro (1920 de alto): entre el texto de arriba y el perro.
ZONA = (470 / 1920, 1390 / 1920)


def sin_acentos(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn")


def palabras(t: str) -> set[str]:
    return {p for p in re.findall(r"[a-z0-9ñ]{4,}", sin_acentos(t))}


class Registro:
    def __init__(self, skill: Path):
        self.carpeta = skill / "huellas"
        self.archivo = self.carpeta / "registro.jsonl"
        self.hojas = self.carpeta / "hojas"
        self.hojas.mkdir(parents=True, exist_ok=True)
        ignora = self.carpeta / ".gitignore"
        if not ignora.exists():
            ignora.write_text(".cache/\n", encoding="utf-8", newline="\n")

    def leer(self) -> list[dict]:
        if not self.archivo.exists():
            return []
        return [json.loads(l) for l in self.archivo.read_text(encoding="utf-8").splitlines() if l.strip()]

    def guardar(self, huellas: list[dict]) -> None:
        huellas.sort(key=lambda h: h["fecha"])
        texto = "".join(json.dumps(h, ensure_ascii=False) + "\n" for h in huellas)
        fd, tmp = tempfile.mkstemp(dir=self.carpeta, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(texto)
        os.replace(tmp, self.archivo)

    def vigentes(self, sin: Path | None = None) -> list[dict]:
        """Las terminadas y las reservadas de esta semana, menos la del proyecto `sin`."""
        ahora = datetime.now()
        return [
            h for h in self.leer()
            if (sin is None or h.get("proyecto") != str(sin))
            and (h["estado"] == "terminada" or ahora - datetime.fromisoformat(h["fecha"]) < CADUCA)
        ]


# ---- Vectores ------------------------------------------------------------------------------------------------------

class Vectores:
    """Los vectores de cada texto, con su caché. Si no hay Python de Sloth o falla, `modo` pasa a «palabras»."""

    def __init__(self, registro: Registro):
        self.cache = registro.carpeta / ".cache" / "vectores.npz"
        self.modo = "vectores"
        self.v: dict[str, np.ndarray] = {}
        if self.cache.exists():
            d = np.load(self.cache)
            self.v = dict(zip(d["claves"].tolist(), d["v"]))

    @staticmethod
    def clave(t: str) -> str:
        return hashlib.sha1(t.strip().encode("utf-8")).hexdigest()[:16]

    def preparar(self, textos: list[str]) -> None:
        faltan = sorted({t.strip() for t in textos if t.strip() and self.clave(t) not in self.v})
        if not faltan or self.modo != "vectores":
            return
        with tempfile.TemporaryDirectory() as d:
            entrada, salida = Path(d) / "textos.jsonl", Path(d) / "v.bin"
            entrada.write_text("".join(json.dumps({"id": i, "texto": t}, ensure_ascii=False) + "\n" for i, t in enumerate(faltan)), encoding="utf-8")
            try:
                vectorizar(str(entrada), {"modo": "vectorizar", "tipo": "query", "salida": str(salida), "modelos": str(MODELOS)})
            except SystemExit as e:
                print(f"(Sin vectores, comparo por palabras: {str(e).splitlines()[0]})")
                self.modo = "palabras"
                return
            filas = np.fromfile(salida, dtype=np.float32).reshape(len(faltan), -1)
        for t, fila in zip(faltan, filas):
            self.v[self.clave(t)] = fila
        self.cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez(self.cache, claves=np.array(list(self.v.keys())), v=np.stack(list(self.v.values())))

    def parecido(self, a: str, b: str) -> float:
        if not a.strip() or not b.strip():
            return 0.0
        if self.modo == "vectores":
            return float(np.dot(self.v[self.clave(a)], self.v[self.clave(b)]))
        pa, pb = palabras(a), palabras(b)
        return len(pa & pb) / max(1, len(pa | pb))


def lab(h: str) -> np.ndarray:
    """Un color #rrggbb en CIELAB (D65), donde la distancia es la que ve el ojo."""
    h = h.lstrip("#")
    rgb = np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255
    rgb = np.where(rgb > 0.04045, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    xyz = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ rgb
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def misma_paleta(a: list[str], b: list[str]) -> bool:
    """Los dos fondos (el oscuro y el claro) se ven iguales: cada uno a menos de `OTRO_COLOR` del suyo."""
    if len(a) < 2 or len(b) < 2:
        return False
    return all(np.linalg.norm(lab(x) - lab(y)) < OTRO_COLOR for x, y in zip(a[:2], b[:2]))


def iguales(nueva: dict, otra: dict, vec: Vectores) -> list[str]:
    """En qué se parece `nueva` a `otra`, sin contar el tema."""
    lista = [c for c in CAMPOS[1:] if vec.parecido(nueva.get(c, ""), otra.get(c, "")) >= PARECIDO[vec.modo]]
    if misma_paleta(nueva.get("paleta", []), otra.get("paleta", [])):
        lista.append("paleta")
    comunes = set(nueva.get("objetos", [])) & set(otra.get("objetos", []))
    if comunes:
        lista.append("objetos (" + ", ".join(sorted(comunes)) + ")")
    return lista


def nombre(h: dict) -> str:
    return f"{h['id']} «{h['tema'][:70]}»"


# ---- Comandos ------------------------------------------------------------------------------------------------------

def buscar(skill: Path, temas: list[str], serie: str | None) -> None:
    reg = Registro(skill)
    previas = reg.vigentes()
    if not previas:
        print("No hay videos en el registro todavía.")
        return
    if temas:
        vec = Vectores(reg)
        vec.preparar([*temas, *(h["tema"] for h in previas)])
    for tema in temas:
        if len(temas) > 1:
            print(f"— {tema}")
        for h in sorted(previas, key=lambda h: -vec.parecido(tema, h["tema"]))[:3]:
            p = vec.parecido(tema, h["tema"])
            print(f"{'YA HECHO' if p >= MISMO_TEMA[vec.modo] else 'distinto'}  {p:.2f}  {nombre(h)}")
    if serie:
        ultimos = [h for h in previas if (h.get("serie") or "").lower() == serie.lower()][-2:]
        print(f"Los dos últimos de «{serie}»: " + ("; ".join(f"{h['id']}: {h['tema']}" for h in ultimos) or "ninguno"))


def revisar(skill: Path, aunque: str | None) -> None:
    raiz = Path.cwd()
    archivo = raiz / "fuentes" / "huella.json"
    if not archivo.exists():
        sys.exit(f"Falta {archivo}: escríbela antes (ver el estilo).")
    nueva = json.loads(archivo.read_text(encoding="utf-8"))
    faltan = [c for c in [*CAMPOS, "paleta", "objetos"] if not nueva.get(c)]
    if faltan:
        sys.exit("A la huella le falta: " + ", ".join(faltan))
    reg = Registro(skill)
    with turno("huellas", "Esperando el registro de huellas: otro video lo está usando."):
        previas = reg.vigentes(sin=raiz)
        vec = Vectores(reg)
        vec.preparar([nueva[c] for c in CAMPOS] + [h.get(c, "") for h in previas for c in CAMPOS])
        choques = []
        for h in previas:
            p = vec.parecido(nueva["tema"], h["tema"])
            if p >= MISMO_TEMA[vec.modo]:
                choques.append(f"El tema ya se hizo ({p:.2f}): {nombre(h)}")
        ultimas = previas[-2:]
        for h in ultimas:
            lista = iguales(nueva, h, vec)
            if lista:
                choques.append(f"Igual que uno de los dos últimos, {nombre(h)}, en: " + ", ".join(lista))
        for h in previas[:-2]:
            lista = iguales(nueva, h, vec)
            if len(lista) >= 3:
                choques.append(f"Se parece en {len(lista)} cosas a {nombre(h)}: " + ", ".join(lista))
        for c in choques:
            print("✗ " + c)
        if choques and not aunque:
            print("Cambia eso en el enfoque y en fuentes/huella.json, y vuelve a revisar. No la reservé.")
            sys.exit(1)
        todas = [h for h in reg.leer() if h.get("proyecto") != str(raiz)]
        anterior = next((h for h in reg.leer() if h.get("proyecto") == str(raiz)), None)
        fecha = datetime.now().isoformat(timespec="minutes")
        ident = anterior["id"] if anterior else f"{fecha[:10]}-{raiz.name}"
        # El enfoque se queda en el proyecto: al registro solo va lo que se compara.
        huella = {"id": ident, "estado": "reservada", "fecha": fecha, "proyecto": str(raiz),
                  **{k: v for k, v in nueva.items() if k != "enfoque"}}
        if aunque and choques:
            huella["aunque"] = aunque
        todas.append(huella)
        reg.guardar(todas)
    print(f"{'Sin choques' if not choques else 'Con choques, aceptados'}: huella reservada como {ident} "
          f"(comparada con {len(previas)}, por {vec.modo}).")


def rasgos(hoja: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    """De una hoja de ocho cuadros: el histograma de colores (64) y una miniatura normalizada por cuadro."""
    w, h = CELDA
    y0, y1 = int(ZONA[0] * h), int(ZONA[1] * h)
    zonas = [np.asarray(hoja.crop((i * w, y0, (i + 1) * w, y1)).convert("RGB")) for i in range(CUADROS)]
    todo = np.concatenate([z.reshape(-1, 3) for z in zonas]) // 64
    hist = np.bincount(todo[:, 0] * 16 + todo[:, 1] * 4 + todo[:, 2], minlength=64).astype(float)
    hist /= hist.sum()
    minis = []
    for z in zonas:
        m = np.asarray(Image.fromarray(z).convert("L").resize((12, 10), Image.BILINEAR), dtype=float).ravel()
        m -= m.mean()
        n = np.linalg.norm(m)
        minis.append(m / n if n > 1e-6 else m)
    return hist, np.stack(minis)


def semejanza(a, b) -> float:
    colores = float(np.minimum(a[0], b[0]).sum())
    tomas = float(np.clip(a[1] @ b[1].T, 0, 1).max(axis=1).mean())
    return (colores + tomas) / 2


def hoja_de(cuadros: list[Image.Image]) -> Image.Image:
    hoja = Image.new("RGB", (CELDA[0] * CUADROS, CELDA[1]))
    for i, c in enumerate(cuadros[:CUADROS]):
        hoja.paste(c.convert("RGB").resize(CELDA, Image.LANCZOS), (i * CELDA[0], 0))
    return hoja


def duracion_voz(raiz: Path) -> float:
    return float(json.loads((raiz / "src" / "datos" / "voz.json").read_text(encoding="utf-8"))["duracion"])


def cuadros_de(video: Path) -> list[Image.Image]:
    """Ocho cuadros parejos de un video ya renderizado."""
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                               capture_output=True, text=True, check=True).stdout)
    cuadros = []
    with tempfile.TemporaryDirectory() as d:
        for i in range(CUADROS):
            png = Path(d) / f"{i}.png"
            ffmpeg("-ss", f"{(i + 0.5) / CUADROS * dur:.2f}", "-i", str(video), "-frames:v", "1", str(png))
            cuadros.append(Image.open(png).copy())
    return cuadros


def parecidos(skill: Path, video: Path | None) -> None:
    raiz = Path.cwd()
    if video:
        cuadros = cuadros_de(video)
    else:
        dur = duracion_voz(raiz)
        carpeta = raiz / "revision" / "huella"
        for viejo in carpeta.glob("*.png"):
            viejo.unlink()
        segundos = [f"{(i + 0.5) / CUADROS * dur:.2f}" for i in range(CUADROS)]
        subprocess.run(["node", "scripts/fotos.mjs", str(carpeta), *segundos], cwd=raiz, check=True, shell=False, stdout=subprocess.DEVNULL)
        cuadros = [Image.open(p) for p in sorted(carpeta.glob("*.png"), key=lambda p: float(p.stem))]
    nueva = hoja_de(cuadros)
    reg = Registro(skill)
    yo = rasgos(nueva)
    otras = []
    for h in reg.vigentes(sin=raiz):
        ruta = reg.hojas / f"{h['id']}.jpg"
        if ruta.exists():
            otras.append((semejanza(yo, rasgos(Image.open(ruta))), h, ruta))
    otras.sort(key=lambda x: -x[0])
    salida = raiz / "revision" / "parecidos.jpg"
    filas = [("NUEVO: este video", nueva)] + [(f"{h['id']} ({s:.2f})", Image.open(r)) for s, h, r in otras[:2]]
    banda = 34
    lienzo = Image.new("RGB", (CELDA[0] * CUADROS, len(filas) * (CELDA[1] + banda)), "white")
    d = ImageDraw.Draw(lienzo)
    try:
        letra = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 22)
    except OSError:
        letra = ImageFont.load_default()
    for i, (titulo, img) in enumerate(filas):
        y = i * (CELDA[1] + banda)
        d.text((8, y + 6), titulo, fill="black", font=letra)
        lienzo.paste(img, (0, y + banda))
    lienzo.save(salida, quality=85)
    if not otras:
        print(f"No hay hojas de otros videos con qué comparar. Hoja nueva: {salida}")
        return
    for s, h, _ in otras[:2]:
        print(f"{s:.2f}  {nombre(h)}")
    print(f"\nLanza un subagente (que no lea el enfoque) con esto:\n\n"
          f"Abre {salida}. La fila 1 es un video nuevo; las de abajo, los dos más parecidos de los que ya se hicieron, "
          f"ocho cuadros de cada uno de principio a fin. El perro de abajo y el texto de arriba son iguales a propósito "
          f"en todos: no cuentan. ¿Alguien que ya vio los de abajo creería que el nuevo es otra vez el mismo video? "
          f"Contesta sí o no en la primera línea y, si es sí, qué se repite: los colores, el lugar, los objetos, dónde "
          f"está el protagonista o el primer cuadro.")


def cerrar(skill: Path, video: Path | None) -> None:
    raiz = Path.cwd()
    video = video or raiz / "out" / f"{raiz.name}.mp4"
    reg = Registro(skill)
    with turno("huellas", "Esperando el registro de huellas: otro video lo está usando."):
        todas = reg.leer()
        h = next((x for x in todas if x.get("proyecto") == str(raiz)), None)
        if h is None:
            archivo = raiz / "fuentes" / "huella.json"
            if not archivo.exists():
                print("Sin fuentes/huella.json: este video no queda en el registro de huellas.")
                return
            fecha = datetime.now().isoformat(timespec="minutes")
            h = {"id": f"{fecha[:10]}-{raiz.name}", "estado": "reservada", "fecha": fecha, "proyecto": str(raiz),
                 **{k: v for k, v in json.loads(archivo.read_text(encoding="utf-8")).items() if k != "enfoque"}}
            todas.append(h)
            print("Esta huella no se había revisado: queda guardada, pero sin comparar.")
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)],
                                   capture_output=True, text=True, check=True).stdout)
        hoja_de(cuadros_de(video)).save(reg.hojas / f"{h['id']}.jpg", quality=80)
        h["estado"] = "terminada"
        h["duracion"] = round(dur, 1)
        reg.guardar(todas)
    print(f"Huella {h['id']} terminada, con su hoja en {reg.hojas / (h['id'] + '.jpg')}.")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if len(args) < 2 or args[0] not in ("buscar", "revisar", "parecidos", "cerrar"):
        sys.exit(__doc__)
    comando, skill = args[0], Path(args[1]).expanduser().resolve()
    if not (skill / "SKILL.md").exists():
        sys.exit(f"{skill} no es la carpeta de una skill.")
    if comando == "buscar":
        serie = args[args.index("--serie") + 1] if "--serie" in args else None
        resto = [a for i, a in enumerate(args[2:], 2) if a != "--serie" and args[i - 1] != "--serie"]
        buscar(skill, [t for t in resto if t.strip()], serie)
    elif comando == "revisar":
        aunque = args[args.index("--aunque") + 1] if "--aunque" in args else None
        revisar(skill, aunque)
    elif comando == "parecidos":
        parecidos(skill, Path(args[2]) if len(args) > 2 else None)
    else:
        cerrar(skill, Path(args[2]) if len(args) > 2 else None)


main()
