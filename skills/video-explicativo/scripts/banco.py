"""
El banco de historias de una serie: las candidatas que ya se buscaron, leyeron y comprobaron y no se usaron, para que
el siguiente video no empiece a buscar de cero. Vive en `<skill>/series/banco/<serie>.jsonl` (una por renglón), y
`<serie>` es el nombre del archivo de la serie (`reddit`, `estafas`…). Noticias no usa banco: caducan.

    python -B -X utf8 <skill>/scripts/banco.py ver <serie>
        las libres, de más a menos votos, y si alguna ya se hizo (huellas.py buscar, todas en una llamada)
    python -B -X utf8 <skill>/scripts/banco.py tomar <serie> <enlace>
        la marca usada por este proyecto (desde su raíz), para que otro video no la tome a la vez
    python -B -X utf8 <skill>/scripts/banco.py guardar <serie> '<json>'
        suma una (o una lista): {"enlace", "titulo", "tema", "votos", "comentarios", "fecha", "momento",
        "comprobado", "notas"}. `tema` en pocas palabras, como el de la huella; `momento`, el instante en que todo se
        tuerce; `comprobado`, qué se verificó y dónde (o qué falta). La que ya está (mismo enlace), no se repite.
"""

import json
import subprocess
import sys
from datetime import date
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from sloth import turno  # noqa: E402


def archivo(serie: str) -> Path:
    if not (SKILL / "series" / f"{serie}.md").exists():
        sys.exit(f"No hay series/{serie}.md.")
    return SKILL / "series" / "banco" / f"{serie}.jsonl"


def leer(ruta: Path) -> list[dict]:
    if not ruta.exists():
        return []
    return [json.loads(l) for l in ruta.read_text(encoding="utf-8").splitlines() if l.strip()]


def escribir(ruta: Path, todas: list[dict]) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_suffix(".tmp")
    temporal.write_text("".join(json.dumps(h, ensure_ascii=False) + "\n" for h in todas), encoding="utf-8", newline="\n")
    temporal.replace(ruta)


def nombre_de(serie: str) -> str:
    return (SKILL / "series" / f"{serie}.md").read_text(encoding="utf-8").splitlines()[0].lstrip("# ").strip()


def ver(serie: str) -> None:
    libres = sorted((h for h in leer(archivo(serie)) if h.get("estado", "libre") == "libre"), key=lambda h: -(h.get("votos") or 0))
    if not libres:
        print("El banco está vacío: busca como dice la serie y guarda aquí las que no uses.")
        return
    for h in libres:
        print(f"- {h.get('votos', '?')} votos · {h.get('comentarios', '?')} com. · {h.get('fecha', '')} · {h['enlace']}\n"
              f"  {h.get('titulo', '')}\n  tema: {h.get('tema', '')}\n  momento: {h.get('momento', '')}\n"
              f"  comprobado: {h.get('comprobado', '')}" + (f"\n  notas: {h['notas']}" if h.get("notas") else ""))
    print(flush=True)
    subprocess.run([sys.executable, "-B", "-X", "utf8", str(BASE / "huellas.py"), "buscar", str(SKILL),
                    *[h.get("tema") or h.get("titulo", "") for h in libres], "--serie", nombre_de(serie)])


def tomar(serie: str, enlace: str) -> None:
    ruta = archivo(serie)
    with turno("banco", "Esperando el banco de historias: otro video lo está usando."):
        todas = leer(ruta)
        h = next((x for x in todas if x["enlace"] == enlace), None)
        if h is None:
            sys.exit("No está en el banco.")
        if h.get("estado", "libre") != "libre":
            sys.exit(f"Ya la tomó {h.get('proyecto')}: elige otra.")
        h.update(estado="usada", proyecto=Path.cwd().name, usada=date.today().isoformat())
        escribir(ruta, todas)
    print(f"Tomada: {h.get('titulo', enlace)}")


def guardar(serie: str, texto: str) -> None:
    nuevas = json.loads(texto)
    nuevas = nuevas if isinstance(nuevas, list) else [nuevas]
    ruta = archivo(serie)
    with turno("banco", "Esperando el banco de historias: otro video lo está usando."):
        todas = leer(ruta)
        hay = {h["enlace"] for h in todas}
        suma = [{**h, "estado": "libre", "agregada": date.today().isoformat()} for h in nuevas if h.get("enlace") and h["enlace"] not in hay]
        escribir(ruta, todas + suma)
    libres = sum(1 for h in todas + suma if h.get("estado", "libre") == "libre")
    print(f"{len(suma)} nuevas en el banco de {serie} ({libres} libres).")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("ver", "tomar", "guardar") or a[0] != "ver" and len(a) < 3:
        sys.exit(__doc__)
    {"ver": lambda: ver(a[1]), "tomar": lambda: tomar(a[1], a[2]), "guardar": lambda: guardar(a[1], a[2])}[a[0]]()


main()
