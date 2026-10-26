"""
Escribe guion.json: lo que dice la voz (`say`, igual que en guion.md) y lo que se ve (`v`) en cada beat.

Lo que se ve sale del material original (ver material.md): capturas en public/web, videos oficiales en public/videos y
el video del tema en public/clips/tema.mp4 (los clips llevan su segundo original en `desde`). Las coordenadas de
cámara y marcas van en píxeles de la imagen original; el tamaño de cada imagen se mide solo.

La referencia de cada tipo de escena está en ESCENAS.md de la skill video-el-diff.
"""

import json
from pathlib import Path

from PIL import Image

import ubicar  # marcas y cámara por la frase que citan (OCR)
from ubicar import fijar_formato, guardar, renglones

# El episodio va en vertical, 1080x1920, compuesto para el celular: cada escena se dibuja en la zona de 1080x1156 y
# `zona()` da rectángulos con esa forma (ver «El lienzo vertical» en ESCENAS.md de la skill).
FORMATO = "vertical"
fijar_formato(FORMATO)
# Solo en vertical: el rótulo fijo de arriba, dos renglones separados por \n (ver "El gancho" en ESTILO.md).
GANCHO = ""

RAIZ = Path(__file__).resolve().parent
PUBLICO = RAIZ / "public"
# El nombre del noticiero, su despedida y su invitación (ver «La marca» en el SKILL de la skill).
MARCA = json.loads((RAIZ / "src" / "marca.json").read_text(encoding="utf8"))
TEMA = "clips/tema.mp4"
# Lo que mide la pantalla de una escena: el tamaño que toma una captura que aún no llega.
PANTALLA = (1080, 1156) if FORMATO == "vertical" else (1920, 1080)

# Las capturas que aún no están en public/ (siguen saliendo mientras se escriben las escenas): sus beats se escriben ya
# con su nombre final, con el tamaño de la pantalla y sin marcas, y al final se avisa FALTA. Al llegar, entran solas.
FALTAN = set()


def hay(fuente):
    if ubicar.existe(fuente):
        return True
    FALTAN.add(fuente.split("@")[0])
    return False


def tam(img):
    if not hay(img):
        return PANTALLA
    with Image.open(PUBLICO / img) as im:
        return im.size


def marca_texto(fuente, frase, **kw):
    return ubicar.marca_texto(fuente, frase, **kw) if hay(fuente) else []


def caja_texto(fuente, frase, **kw):
    return ubicar.caja_texto(fuente, frase, **kw) if hay(fuente) else {"r": [0, 0, 0, 0], "t": 0}


def zona(fuente, frase, **kw):
    return ubicar.zona(fuente, frase, **kw) if hay(fuente) else [0, 0, *PANTALLA]


def cap(img, **kw):
    w, h = tam(img)
    return {"tipo": "captura", "img": img, "w": w, "h": h, **kw}


def clip(desde, src=TEMA, **kw):
    return {"tipo": "captura", "clip": src, "desde": desde, "completo": True, **kw}


def caja(r, en=None, t=None, **kw):
    return {"r": r, **({"en": en} if en else {"t": t or 0}), **kw}


def marca(r, en=None, t=None, **kw):
    return {"r": r, "tipo": "marcador", **({"en": en} if en else {"t": t or 0}), **kw}


def toma(r, en=None, t=None, dura=14):
    return {"r": r, **({"en": en} if en else {"t": t or 0}), "dura": dura}


def foco(r, en=None, t=None, dura=1.5, forma="rect"):
    """Congela el video `dura` segundos y oscurece todo menos `r`, con un contorno rojo (`forma`: "rect" u "ovalo")."""
    return {"r": r, **({"en": en} if en else {"t": t or 0}), "dura": dura, "forma": forma}


def en_video(video_r, r, ancho=1920, alto=1080):
    """Pasa `r`, medido en un video de ancho x alto, a píxeles de la captura donde ese video ocupa `video_r`."""
    ex, ey = video_r[2] / ancho, video_r[3] / alto
    return [round(video_r[0] + r[0] * ex), round(video_r[1] + r[1] * ey), round(r[2] * ex), round(r[3] * ey)]


def tar(img=None, clip_=None, video=None, **kw):
    it = dict(kw)
    if video:
        it["video"] = video
    if img:
        it["img"] = img
        it["w"], it["h"] = tam(img)
    if clip_ is not None:
        it["clip"] = TEMA
        it["desde"] = clip_
    return it


def extra(img, **kw):
    w, h = tam(img)
    return {"img": img, "w": w, "h": h, **kw}


def titular(texto, color="fuego", **kw):
    return {"tipo": "titular", "texto": texto, "color": color, **kw}


def emo(src, en=None, t=None, **kw):
    return {"src": f"emoji/{src}.png", **({"en": en} if en else {"t": t or 0}), **kw}


# Lo que se pega encima de cualquier escena, en la palabra que lo dice: `encima=[rotulo(...), pegado(...)]` en el beat
# (en `cap()`, `clip()` o cualquier `v`). x, y: el centro en fracciones de la escena. Ver «Encima» en ESCENAS.md.
def rotulo(texto, en=None, t=None, estilo="crema", **kw):
    """estilo: "crema" (nombra), "rojo" (golpea), "banda" (letras oscuras sobre una banda; color="roja", "verde",
    "amarilla"), "placa" (el nombre de una persona). giro en grados, tam en px, hasta="palabra"."""
    return {"tipo": "rotulo", "texto": texto, "estilo": estilo, **({"en": en} if en else {"t": t or 0}), **kw}


def pegado(img, en=None, t=None, **kw):
    """Un recorte de public/recortes/. entra: "sube" (desde abajo, anclado abajo), "golpe", "izquierda", "derecha".
    alto en fracción de la escena (0.75), x del centro, espejo=True lo voltea."""
    return {"tipo": "pegado", "img": img, **({"en": en} if en else {"t": t or 0}), **kw}


def senal(x, y, en=None, t=None, dir="derecha", **kw):
    """El 👉 que entra desde su lado y señala el punto (x, y), en fracciones de la escena."""
    return {"tipo": "senal", "x": x, "y": y, "dir": dir, **({"en": en} if en else {"t": t or 0}), **kw}


def bloque(nombre):
    """Las secciones que escribió otro agente en fuentes/escenas/<nombre>.py, en su lugar (ver «En paralelo» en el paso 3
    de SKILL.md): una sola lista de párrafos como la de abajo, con estas mismas funciones y constantes, sin import ni
    asignaciones. Mientras no exista, nada."""
    f = RAIZ / "fuentes" / "escenas" / f"{nombre}.py"
    if not f.exists():
        return []
    try:
        codigo = compile(f.read_text(encoding="utf8"), str(f), "eval")
    except SyntaxError as e:
        raise SystemExit(f"{f} tiene que ser una sola lista de párrafos, sin import ni asignaciones: {e}")
    return eval(codigo, globals())


# Un párrafo por sección del guion. Cada beat es (frase tal como se lee, lo que se ve).
# El primer beat de cada sección lleva seccion=True (interferencia). Ejemplos de cada tipo:
parrafos = [
    ("intro", [
        # Un tuit con video, en una sola toma: arranca en el texto, la cámara baja al video y en "patineta" el video
        # se congela con el foco en la patineta (medida en el video de 1920x1080).
        # ("Frase con su fuente, que habla del clip donde sale una patineta.",
        #  cap("web/x-cuenta.png", vista=zona("web/x-cuenta.png", "the exact words in the post"), fuente="x.com/cuenta · 1 oct 2026",
        #      video={"src": "videos/x-cuenta.mp4", "r": [34, 527, 1098, 618], "desde": 0},
        #      camara=[toma([34, 527, 1098, 618], en="clip", dura=20)],
        #      foco=foco(en_video([34, 527, 1098, 618], [800, 700, 300, 250]), en="patineta"))),
        # El beat siguiente sobre la misma captura sigue la toma: sube al texto y traduce lo que cita.
        # ("Y escribió, citando lo que dice el post.",
        #  cap("web/x-cuenta.png", sigue=True, camara=[toma(zona("web/x-cuenta.png", "the exact words in the post"), t=0, dura=18)],
        #      marcas=[*marca_texto("web/x-cuenta.png", "the exact words in the post", en="citando",
        #                           es="las palabras exactas del post")])),
        # ("Lo que pasa en el video del tema.",
        #  clip(62.0, camara=[toma([700, 380, 1000, 400], t=0.2, dura=40)], etiqueta="Autor · YouTube")),
        ("Un remate.", titular("EL CHISTE", "rojo", emoji="emoji/sonrisa_picara.png")),
    ]),
    ("logo", [
        (f"Es 6 de octubre de 2026, y estás viendo {MARCA['nombre']}.", {"tipo": "logo", "fecha": "6 OCT, 2026"}),
    ]),
    # Las secciones de en medio, si las escribieron otros agentes: *bloque("1"), *bloque("2"),
    ("cierre", [
        (MARCA["despedida"], {"tipo": "logo", "final": True}),
        # Sin `invitacion` en la marca, el episodio acaba en la despedida.
        *([(MARCA["invitacion"], {"tipo": "logo", "invitacion": True})] if MARCA.get("invitacion") else []),
    ]),
]

n = 0
salida = {"voz": "grabada", "formato": FORMATO, "gancho": GANCHO, "parrafos": []}
for pid, lista in parrafos:
    # Una sección partida entre dos agentes llega en dos párrafos seguidos con el mismo id: van juntos.
    if not salida["parrafos"] or salida["parrafos"][-1]["id"] != pid:
        salida["parrafos"].append({"id": pid, "beats": []})
    for say, v in lista:
        n += 1
        salida["parrafos"][-1]["beats"].append({"id": f"b{n:02d}", "say": say, "v": v})

def avisos(beats):
    """
    Lo que más se arregló en la revisión de el-diff-8, avisado aquí para que lo corrija quien escribe la escena:
    - una escena con `sigue` que pone sus marcas sin `limpia=True` deja también las del beat anterior, sobre otra frase;
    - en vertical, una captura más ancha que alta llena el ancho y deja bandas vacías arriba y abajo (la misma cuenta que
      `bandas` de reglas.mjs: menos del 55 % del alto de la zona de 1080x1156).
    """
    previo = None
    for b in beats:
        v = b["v"]
        if v.get("tipo") == "captura" and v.get("sigue") and v.get("marcas") and not v.get("limpia") and previo \
                and previo["v"].get("marcas") and (v.get("img") or v.get("clip")) == (previo["v"].get("img") or previo["v"].get("clip")):
            print(f"aviso: {b['id']} «{b['say'][:40]}» sigue a {previo['id']} con marcas nuevas pero sin limpia=True: también "
                  "se quedan las de antes, sobre otra frase. Si cita otra cosa, ponle limpia=True.")
        if FORMATO == "vertical" and v.get("tipo") == "captura" and not v.get("sigue") and v.get("encuadre") != "cubre":
            # Una imagen enseña a lo alto todo lo que tiene (el encuadre suma renglones): cuenta la imagen entera. Un clip
            # llena la zona salvo en "ajusta" sin vista, que lo deja entero, a 16:9.
            if v.get("img"):
                alto = 1080 * v.get("h", 1) / max(1, v.get("w", 1)) / 1156
            else:
                alto = 1080 * 9 / 16 / 1156 if v.get("encuadre") == "ajusta" and not v.get("vista") else None
            if alto is not None and alto < 0.55:
                arreglo = ("sácala otra vez con lo de alrededor (pagina.mjs --contexto) o usa otra imagen" if v.get("img") else
                           "quita encuadre=\"ajusta\" (el clip llena la zona) o ponle una vista en la parte que cita la voz")
                print(f"aviso: {b['id']} «{b['say'][:40]}» queda en tira ({v.get('img') or v.get('clip')}, {alto:.0%} del "
                      f"alto de la zona): {arreglo}.")
        previo = b


avisos([b for p in salida["parrafos"] for b in p["beats"]])
guardar(RAIZ / "guion.json", json.dumps(salida, ensure_ascii=False, indent=1))
# Los renglones del OCR de cada captura: el encuadre vertical los usa para no cortar uno a la mitad (src/encuadre.ts).
capturas = sorted({b["v"]["img"] for p in salida["parrafos"] for b in p["beats"]
                   if b["v"].get("tipo") == "captura" and b["v"].get("img") and hay(b["v"]["img"])})
guardar(RAIZ / "src" / "lineas.json", json.dumps({img: renglones(img) for img in capturas}))
print(n, "beats")
if FALTAN:
    print("FALTA (aún no está en public/):", ", ".join(sorted(FALTAN)))
