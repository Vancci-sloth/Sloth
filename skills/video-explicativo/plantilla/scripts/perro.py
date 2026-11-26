"""
Recorta las fotos del perro como stickers y escribe el índice que lee Personaje.tsx.

    python -B scripts/perro.py

Lee perro/pose_<nombre>.png (las poses nuevas de este video; perro/perro.png sería `normal`) y deja
public/perro/<nombre>.webp: la silueta con un
borde blanco grueso cortado a mano (scripts/sticker.py), en un lienzo cuadrado de 900 px con el perro apoyado abajo y
centrado, para que cambiar de pose no lo haga brincar. Si la pose tiene boca abierta (perro/bocas/abierta_<nombre>.png,
de scripts/bocas.py), deja también public/perro/<nombre>-abierta.webp con la misma silueta y el mismo borde: al hablar
solo cambia la boca. Las suma a src/datos/personaje.json, junto a las de la biblioteca de la skill que copió nuevo.py.

Va con el Python del sistema (el que tiene rembg). Solo rehace las poses cuya foto es más nueva que su recorte.
"""

import json
from pathlib import Path

from PIL import Image

from sticker import contorno

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "perro"
DESTINO = RAIZ / "public" / "perro"
LADO = 900
_sesion = None


def silueta(foto: Image.Image) -> Image.Image:
    """La máscara del perro, del tamaño de la foto (rembg, como alfa() de video-base/recorte.py)."""
    global _sesion
    from rembg import new_session, remove

    _sesion = _sesion or new_session("isnet-general-use")
    a = remove(foto, session=_sesion, post_process_mask=True).getchannel("A")
    return a.point(lambda v: 0 if v < 24 else v)


def sticker(foto: Image.Image, a: Image.Image, semilla: int) -> Image.Image:
    rgba = foto.convert("RGBA")
    rgba.putalpha(a)
    rgba = rgba.crop(a.getbbox())
    rgba.thumbnail((LADO - 80, LADO - 60), Image.LANCZOS)
    recorte = contorno(rgba, 0.03, semilla)
    recorte.thumbnail((LADO, LADO), Image.LANCZOS)
    lienzo = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    lienzo.alpha_composite(recorte, ((LADO - recorte.width) // 2, LADO - recorte.height))
    return lienzo


def viejo(salida: Path, *fuentes: Path) -> bool:
    return not salida.exists() or any(salida.stat().st_mtime < f.stat().st_mtime for f in fuentes if f.exists())


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    fuentes = {"normal": ORIGEN / "perro.png"} if (ORIGEN / "perro.png").exists() else {}
    fuentes |= {f.stem.removeprefix("pose_"): f for f in sorted(ORIGEN.glob("pose_*.png"))}
    datos = RAIZ / "src" / "datos" / "personaje.json"
    viejos = json.loads(datos.read_text(encoding="utf8")) if datos.exists() else {}
    poses = viejos.get("poses", {})
    for nombre, f in fuentes.items():
        salida = DESTINO / f"{nombre}.webp"
        boca = ORIGEN / "bocas" / f"abierta_{nombre}.png"
        salida_boca = DESTINO / f"{nombre}-abierta.webp"
        if viejo(salida, f) or (boca.exists() and viejo(salida_boca, f, boca)):
            foto = Image.open(f).convert("RGB")
            a = silueta(foto)
            semilla = sum(map(ord, nombre))
            sticker(foto, a, semilla).save(salida, "WEBP", quality=95, method=6, alpha_quality=100)
            if boca.exists():
                abierta = Image.open(boca).convert("RGB").resize(foto.size, Image.LANCZOS)
                sticker(abierta, a, semilla).save(salida_boca, "WEBP", quality=95, method=6, alpha_quality=100)
        poses[nombre] = {"cerrada": f"perro/{nombre}.webp"}
        if salida_boca.exists():
            poses[nombre]["abierta"] = f"perro/{nombre}-abierta.webp"
        print(nombre, "con boca" if salida_boca.exists() else "")
    datos.write_text(json.dumps({"poses": poses, "anclas": viejos.get("anclas", {})}, ensure_ascii=False, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()
