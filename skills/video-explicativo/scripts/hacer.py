"""
El video entero en un comando, de fondo: de guion.md y momentos.json (lo único que escribe el agente) a
out/<carpeta>.mp4 con su portada, medido y con su hoja de cuadros para mirarlo.

    python -B -X utf8 <skill>/scripts/hacer.py --studio <Voz> [--dura <s>]   la voz de AI Studio (la línea `Voz:`)
    python -B -X utf8 <skill>/scripts/hacer.py --audio <archivo>             la que grabó el usuario (m4a, mp3, un video…)
    python -B -X utf8 <skill>/scripts/hacer.py                               otra vez, con la voz que ya hay
    python -B -X utf8 <skill>/scripts/hacer.py --revisa                      solo revisa momentos.json (un segundo)

`--dura`: los segundos que pidió el usuario. Si el guion se pasa o se queda corto por más del 8 %, lo dice antes de
pedir la voz, con cuántas palabras sobran o faltan: el de estafas del 5 de noviembre salió de 44,5 s para 40 y se
rehízo con otra voz y otro render (~2 min).

Desde la raíz del proyecto. En orden, y para en el primer ✗ diciendo qué arreglar:
1. Comprueba momentos.json contra guion.md (cada palabra en el guion, cada pose, modelo, ícono y logo) en un segundo,
   antes de pagar la voz.
2. Trae los modelos de la biblioteca y los íconos, y escribe lo que el director importa (src/director/modelos.ts).
3. Los subtítulos (subtitulos.py, con las palabras de cada momento en negrita) y la voz (voz.py), solo si el guion
   cambió desde la última: arreglar un momento no paga otra voz.
4. Comprueba cada palabra contra lo que la voz dijo de verdad, y los tipos.
5. final.py (render, comprobar, medir, huella), la portada de su primer cuadro y revision/hoja.png: un cuadro cada
   1.5 s con lo que se dice, para mirarlo de un vistazo.
Si nuevo.py todavía empaqueta, lo espera.
"""

import difflib
import hashlib
import json
import re
import subprocess
import sys
import time
import unicodedata
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
BASE = SKILL.parent / "video-base" / "scripts"
MODELOS = SKILL.parent / "modelos-3d"
RAIZ = Path.cwd()
PY = [sys.executable, "-B", "-X", "utf8"]
INICIO = time.time()
TIPOS = {"cifra", "prueba", "iconos", "boton", "post", "logos", "versus", "imagen", "pieza"}
ANCHO_IMAGEN, ALTO_IMAGEN = 760, 640
ACCIONES = {"golpea", "late", "tiembla", "gira", "salta", "quieta"}
LUCES = {"estudio", "dia", "atardecer", "noche", "vela", "neon"}
CAMARA = {"plano": ["general", "medio", "primer", "detalle"], "angulo": ["frente", "tres-cuartos", "lado", "picado", "contrapicado", "cenital"],
          "lente": ["angular", "normal", "tele"], "movimiento": ["fijo", "dolly", "alejar", "orbita", "grua", "travelling"]}
# Palabras por segundo de la voz de AI Studio ya acelerada: 3.3–3.5 cuando acelerar.py dejaba 0.18 s en todas las pausas;
# con el respiro tras cada punto (6-nov), 3.1 (el bostezo y los likes: 104 y 101 palabras, 34 y 33 s).
POR_SEGUNDO = 3.4  # lo que dice la voz ya acelerada: 3,2 a 3,6 en los seis del 6-nov
COLORES = {"protagonista", "segundo", "ajeno", "dinero", "pierde", "regla", "apagado"}


def paso(texto: str) -> None:
    print(f"[{time.time() - INICIO:5.0f} s] {texto}", flush=True)


def normal(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return re.sub(r"[^a-z0-9ñ%$]", "", "".join(c for c in s if unicodedata.category(c) != "Mn"))


def palabras_de(texto: str) -> list[str]:
    return [w for w in (normal(p) for p in texto.split()) if w]


def busca(lista: list[str], frase: str, vez: int) -> int:
    """Dónde empieza `frase` (la vez `vez`) en la lista de palabras, o -1."""
    b = palabras_de(frase)
    vistas = 0
    for i in range(len(lista) - len(b) + 1):
        if lista[i:i + len(b)] == b:
            vistas += 1
            if vistas == vez:
                return i
    return -1


def a_la_voz(m: dict, guion: list[str], dichas: list[str]) -> None:
    """
    Las palabras de momentos.json como las dijo la voz: el transcriptor escribe a su modo lo que no conoce («Tamalli»
    salió «tamali» en el del tamal, y el agente gastó una vuelta en cambiarlo). Se alinean el guion y la voz, y cada
    palabra que la voz no dice tal cual pasa a las que dijo en ese mismo sitio.
    """
    mapa: dict[int, int] = {}
    for op, a0, a1, b0, b1 in difflib.SequenceMatcher(None, guion, dichas, autojunk=False).get_opcodes():
        for k in range(a1 - a0):
            mapa[a0 + k] = b0 + min(k, max(0, b1 - b0 - 1))

    def cambia(frase: str, vez: int) -> tuple[str, int]:
        if busca(dichas, frase, vez) >= 0:
            return frase, vez
        i = busca(guion, frase, vez)
        if i < 0 or i not in mapa:
            return frase, vez
        j = mapa[i]
        nueva = " ".join(dichas[j:j + max(1, len(palabras_de(frase)))])
        return nueva, sum(1 for k in range(j + 1) if dichas[k:k + len(palabras_de(nueva))] == palabras_de(nueva))

    for mo in m["momentos"]:
        mo["palabra"], v = cambia(mo["palabra"], int(mo.get("vez", 1)))
        if v > 1:
            mo["vez"] = v
        t = mo.get("tarjeta") or {}
        for clave in ("no", "subraya"):
            if t.get(clave):
                t[clave], _ = cambia(t[clave], 1)
    if m.get("cierre"):
        m["cierre"], _ = cambia(m["cierre"], 1)


def pascal_a_kebab(n: str) -> str:
    n = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", n)
    return re.sub(r"([A-Z])([A-Z][a-z])", r"\1-\2", n).lower()


def texto_del_guion() -> str:
    """Lo que se dice: guion.md sin el título ni la línea del corte de datos."""
    lineas = [l for l in (RAIZ / "guion.md").read_text(encoding="utf-8").splitlines() if l.strip()]
    return " ".join(l for l in lineas if not l.startswith("#") and not l.lower().startswith("corte de datos"))


def titulo() -> str:
    for l in (RAIZ / "guion.md").read_text(encoding="utf-8").splitlines():
        if l.startswith("# "):
            return l[2:].strip()
    return ""


def marca() -> dict:
    for d in (RAIZ.parent, RAIZ.parent.parent):
        if (d / "marca.json").exists():
            return json.loads((d / "marca.json").read_text(encoding="utf-8"))
    return {}


def esperar_proyecto() -> None:
    """nuevo.py deja node_modules, las poses y el empaquetado; si sigue en eso, se espera (hasta 4 min)."""
    for _ in range(240):
        if (RAIZ / ".listo").exists():
            return
        time.sleep(1)
    sys.exit("✗ El proyecto no está listo: ¿corrió nuevo.py?")


def comprobar(m: dict, dichas: list[str], donde: str) -> list[str]:
    """Todo lo que está mal en momentos.json, de una vez."""
    errores: list[str] = []
    cosas = m.get("cosas") or {}
    momentos = m.get("momentos") or []
    if not momentos:
        return ["no tiene momentos"]
    poses = set(json.loads((RAIZ / "src" / "datos" / "personaje.json").read_text(encoding="utf-8"))["poses"])
    fill = RAIZ / "node_modules" / "@phosphor-icons" / "core" / "assets" / "fill"
    biblioteca = {p.parent.name for p in (MODELOS / "modelos").glob("*/modelo.json")} | {p.parent.name for p in (MODELOS / "plantilla").glob("*/modelo.json")}
    propios = {p.stem for p in (RAIZ / "src" / "modelos").glob("*.tsx")}

    def icono_ok(n: str, que: str) -> None:
        if not re.fullmatch(r"[A-Z][A-Za-z0-9]*", n):
            errores.append(f"{que}: el ícono «{n}» va en PascalCase, como en phosphoricons.com («ShieldCheck»)")
        elif not (fill / f"{pascal_a_kebab(n)}-fill.svg").exists():
            errores.append(f"{que}: Phosphor no tiene el ícono «{n}»")

    for id_, c in cosas.items():
        if bool(c.get("modelo")) == bool(c.get("icono")):
            errores.append(f"cosa «{id_}»: lleva `modelo` o `icono`, uno de los dos")
        if c.get("modelo") and c["modelo"] not in biblioteca | propios:
            errores.append(f"cosa «{id_}»: no hay modelo «{c['modelo']}» en la biblioteca (modelos.py buscar) ni en src/modelos")
        if c.get("icono"):
            icono_ok(c["icono"], f"cosa «{id_}»")
        if c.get("color") and c["color"] not in COLORES and not re.fullmatch(r"#[0-9a-fA-F]{6}", c["color"]):
            errores.append(f"cosa «{id_}»: el color va por significado ({', '.join(sorted(COLORES))}) o en #rrggbb")
    usadas = set()
    antes = -1
    for k, mo in enumerate(momentos):
        que = f"momento {k + 1} («{mo.get('palabra', '')}»)"
        i = busca(dichas, mo.get("palabra", ""), int(mo.get("vez", 1)))
        if i < 0:
            errores.append(f"{que}: {donde} no dice «{mo.get('palabra')}»" + (f" {mo['vez']} veces" if mo.get("vez", 1) > 1 else ""))
        elif i < antes:
            errores.append(f"{que}: va antes que el momento anterior en {donde}: ordénalos como se dicen")
        antes = max(antes, i)
        if mo.get("cosa"):
            if mo["cosa"] not in cosas:
                errores.append(f"{que}: la cosa «{mo['cosa']}» no está en `cosas`")
            usadas.add(mo["cosa"])
        if mo.get("pose") and mo["pose"] not in poses:
            errores.append(f"{que}: no hay pose «{mo['pose']}» (hay: {', '.join(sorted(poses))})")
        if mo.get("accion") and mo["accion"] not in ACCIONES:
            errores.append(f"{que}: no hay acción «{mo['accion']}» (hay: {', '.join(sorted(ACCIONES))})")
        if "cuenta" in mo and (not isinstance(mo["cuenta"], (int, float)) or not m.get("contador")):
            errores.append(f"{que}: `cuenta` es un número, y pide `contador` arriba ({{\"nota\": \"…\"}})")
        if mo.get("tema") and mo["tema"] not in ("oscuro", "claro"):
            errores.append(f"{que}: `tema` es oscuro o claro")
        t = mo.get("tarjeta")
        if t:
            if t.get("tipo") not in TIPOS:
                errores.append(f"{que}: la tarjeta es de un tipo que no hay ({', '.join(sorted(TIPOS))})")
            for n in [t.get("icono")] + (t.get("iconos") or []):
                if n:
                    icono_ok(n, que)
            for l in [t.get("logo")] + (t.get("logos") or []):
                if l and not (RAIZ / "public" / "logos" / f"{l}.png").exists():
                    errores.append(f"{que}: falta el logo «{l}» (logos.py {l}=sitio:<dominio>)")
            for clave in ("no", "subraya"):
                if t.get(clave) and busca(dichas, t[clave], 1) < 0:
                    errores.append(f"{que}: {donde} no dice «{t[clave]}» (`{clave}` de la tarjeta)")
            if t.get("tipo") == "imagen":
                img = RAIZ / "public" / str(t.get("src", ""))
                if not t.get("src") or not img.is_file():
                    errores.append(f"{que}: no está la imagen public/{t.get('src')} (bájala ahí: curl -L -o public/img/<nombre>.jpg <url>)")
                else:
                    try:
                        from PIL import Image
                        with Image.open(img) as im:
                            ancho, alto = im.size
                        # Del ancho de la tarjeta y su proporción; lo muy alto se recorta (cover) a ALTO_IMAGEN.
                        # La del gancho, más grande: es lo primero que ve el que va pasando videos.
                        w, h = (820, 720) if k == 0 else (ANCHO_IMAGEN, ALTO_IMAGEN)
                        t["w"], t["h"] = w, min(h, round(w * alto / ancho))
                    except Exception as e:
                        errores.append(f"{que}: no se puede abrir public/{t['src']} como imagen ({e})")
            if t.get("tipo") == "pieza" and not (RAIZ / "src" / "piezas" / f"{t.get('nombre')}.tsx").exists():
                errores.append(f"{que}: no hay src/piezas/{t.get('nombre')}.tsx")
    for id_ in set(cosas) - usadas:
        errores.append(f"cosa «{id_}»: ningún momento la usa (quítala)")
    # Dirigido como un set (CINE.md): sin escenas ni planos, todo es un plano medio que va de objeto en objeto. Con
    # esfuerzo medio, dos de tres agentes se lo saltaban mientras fuera opcional.
    if len(momentos) >= 6:
        if not m.get("escenas") or not any(mo.get("escena") for mo in momentos):
            errores.append("no tiene escenas: dos a cuatro lugares en `escenas` (con su `luz` y su `fondo`) y `escena` en los momentos (CINE.md)")
        con_camara = sum(1 for mo in momentos if mo.get("camara"))
        if con_camara < len(momentos) * 0.4:
            errores.append(f"solo {con_camara} de {len(momentos)} momentos llevan `camara`: ponle plano, ángulo, lente o movimiento a la mitad o más (CINE.md)")
    for nombre, e in (m.get("escenas") or {}).items():
        if e.get("luz") and e["luz"] not in LUCES:
            errores.append(f"escena «{nombre}»: no hay luz «{e['luz']}» (hay: {', '.join(sorted(LUCES))})")
        if e.get("fondo") and not re.fullmatch(r"#[0-9a-fA-F]{6}", e["fondo"]):
            errores.append(f"escena «{nombre}»: el fondo va en #rrggbb")
    for k, mo in enumerate(momentos):
        if mo.get("escena") and mo["escena"] not in (m.get("escenas") or {}):
            errores.append(f"momento {k + 1}: la escena «{mo['escena']}» no está en `escenas`")
        for campo, valores in CAMARA.items():
            v = (mo.get("camara") or {}).get(campo)
            if v is not None and v not in valores:
                errores.append(f"momento {k + 1}: `camara.{campo}` es uno de {', '.join(valores)}")
    # Sin fotos reales todo es un ícono genérico: el del agua del 5 de noviembre salió sin ninguna y fue el más flojo.
    fotos = sum(1 for mo in momentos if (mo.get("tarjeta") or {}).get("tipo") == "imagen")
    # Lo que el modelo puede decir y no dice: el SMS falso de la paquetería salió como una alerta roja todo el video, sin el
    # mensaje que explica la estafa; la tía de los dedos salió de persona cualquiera.
    for nombre, c in cosas.items():
        props = c.get("props") or {}
        if c.get("modelo") == "celular" and not props.get("mensaje") and not props.get("pantalla") and re.search(r"mensaje|sms|whatsapp|notificaci|texto", " ".join(dichas).lower()):
            errores.append(f"cosa «{nombre}»: el guion habla de un mensaje y el celular no lo enseña: escríbelo en `props.mensaje` (y `de`), "
                           "y la `alerta`, si va, después")
        if isinstance(props.get("mensaje"), str) and len(props["mensaje"]) > 14 and " " not in props["mensaje"]:
            errores.append(f"cosa «{nombre}»: `mensaje` va sin espacios («{props['mensaje'][:24]}…»): escríbelo como se lee")
        suyos = [mo for mo in momentos if mo.get("cosa") == nombre]
        alerta, prendida = float(props.get("alerta") or 0), 0
        for mo in suyos:
            alerta = float((mo.get("anima") or {}).get("alerta", alerta))
            prendida += alerta > 0.5
        if len(suyos) >= 3 and prendida >= 0.7 * len(suyos):
            errores.append(f"cosa «{nombre}»: la `alerta` tapa la pantalla en {prendida} de sus {len(suyos)} momentos y no se lee lo que dice: "
                           "préndela solo en el momento del peligro y apágala (`\"alerta\": 0`) en el siguiente")
        if c.get("modelo") == "persona" and not props.get("rol"):
            for rol, palabras in (("tia", ("tia", "abuela", "mama", "suegra", "senora", "vieja")), ("ladron", ("ladron", "estafador", "rata")), ("jefe", ("jefe", "patron"))):
                if any(p in normal(nombre) for p in palabras):
                    errores.append(f"cosa «{nombre}»: es `persona` sin `props.rol`; pon `\"rol\": \"{rol}\"` para que se vea quién es")
    # Una escena que se arma, no un objeto nuevo por idea: el revisor a ciegas del 6-nov lo dijo de los nueve videos
    # (cada idea traía su ícono y nada se iba construyendo). El protagonista en la mitad de los momentos o más y, en
    # todo el video, cinco cosas como mucho.
    usos = {}
    for mo in momentos:
        if mo.get("cosa"):
            usos[mo["cosa"]] = usos.get(mo["cosa"], 0) + 1
    if len(momentos) >= 6 and usos:
        prota, veces = max(usos.items(), key=lambda kv: kv[1])
        if veces * 2 < len(momentos):
            errores.append(f"el protagonista («{prota}») sale en {veces} de {len(momentos)} momentos: que salga en la mitad o más, "
                           "cambiando de estado (`anima`, `accion`), en vez de una cosa nueva por idea")
        suyos = [mo for mo in momentos if mo.get("cosa") == prota]
        # Si el protagonista es una pieza que actúa sola (`actua` en su modelo.json), que actúe desde su primer momento:
        # el cuchillo que pica, el corazón que late. Con ellas la cebolla pasó de 5/5/5/4/6 a 7/6/6/7/8 (revisor a ciegas).
        ficha = next((p for p in (MODELOS / "modelos" / str(cosas.get(prota, {}).get("modelo")) / "modelo.json",) if p.exists()), None)
        actua = json.loads(ficha.read_text(encoding="utf-8")).get("actua") if ficha else None
        if actua and suyos:
            valor = (suyos[0].get("anima") or {}).get(actua, (cosas[prota].get("props") or {}).get(actua, 0))
            if not valor:
                errores.append(f"el protagonista («{prota}») actúa solo con `{actua}`: ponle `\"anima\": {{\"{actua}\": 1}}` en su primer "
                               "momento, que se mueva desde el primer cuadro")
        # `anima` y `accion` siguen hasta que otro momento los cambia: lo que se pide es que cambie de estado seguido.
        cambios = sum(1 for mo in suyos if mo.get("anima") or mo.get("accion"))
        if cambios < max(3, len(suyos) / 3):
            errores.append(f"el protagonista cambia {cambios} veces en sus {len(suyos)} momentos: que cambie (`anima`) o se mueva "
                           "(`accion`) en tres o más y en uno de cada tres; lo que pide sigue hasta que otro lo cambie (el cuchillo "
                           "que pica desde el primer cuadro)")
        if len(usos) > 5:
            errores.append(f"hay {len(usos)} cosas distintas ({', '.join(usos)}): cinco como mucho; lo demás va en tarjetas "
                           "sobre el protagonista o como `anima` de él")
    # El gancho con una foto quieta: el revisor a ciegas del 6-nov le dio 5 a 7 de «lo vería» a los cinco que abrían así.
    primero = momentos[0]
    if (primero.get("tarjeta") or {}).get("tipo") == "imagen" or "modelo" not in cosas.get(primero.get("cosa", ""), {}):
        errores.append("momento 1: el gancho abre con el protagonista 3D (un modelo) haciendo ya lo que sorprende (`anima` o "
                       "`accion`), no con una foto ni un ícono; la foto va después, como prueba")
    # Lo que el usuario vio con sonido (6-nov) y vale para todos: el corazón salió 2.9 s y entró la foto, «al modelo 3D
    # ya no se le permitió ver nada»; la foto que dura menos de 2 s no se alcanza a ver; un ícono en `detalle` llena el
    # cuadro de una mancha (el cerebro naranja); un celular que «late» o una gota que «salta» son «animaciones que no
    # tienen que ver»; y lo que ya actúa solo (`actua`) temblando encima se ve «rápido y raro».
    donde_va = [busca(dichas, mo.get("palabra", ""), int(mo.get("vez", 1))) for mo in momentos]
    # Lo que la voz explica se ve cuando lo dice (el usuario, 6-nov, de los dedos: «ir creciendo la burbuja e ir moviendo
    # los huesos»). El dedo traía la burbuja y los huesos separados desde el gancho, y en «se separan» y «nace una
    # burbuja» no cambió nada; y temblaba encima («el dedo se movía mucho»).
    valores: dict[tuple[str, str], tuple[float, int]] = {}
    for k, mo in enumerate(momentos):
        id_ = mo.get("cosa", "")
        for prop, v in (mo.get("anima") or {}).items():
            if not isinstance(v, (int, float)):
                continue
            antes_v, desde = valores.get((id_, prop), (float(((cosas.get(id_) or {}).get("props") or {}).get(prop, 0) or 0), -1))
            if abs(antes_v - v) < 0.05 and desde >= 0:
                errores.append(f"momento {k + 1} («{mo.get('palabra', '')}»): `{prop}` ya vale {v} desde el momento {desde + 1}, y aquí no "
                               "cambia nada. Que cambie cuando la voz lo dice: quítalo de antes (el gancho enseña otra cosa) o bájalo")
            valores[(id_, prop)] = (float(v), k)
        if mo.get("accion") and mo["accion"] != "quieta" and mo.get("anima") and "modelo" in (cosas.get(id_) or {}):
            errores.append(f"momento {k + 1} («{mo.get('palabra', '')}»): «{id_}» cambia (`anima`) y además hace `{mo['accion']}`: los dos "
                           "a la vez se ven de más; que se vea el cambio, sin `accion`")
    def fichas(c: dict) -> dict:
        f = MODELOS / "modelos" / str(c.get("modelo")) / "modelo.json"
        return json.loads(f.read_text(encoding="utf-8")) if c.get("modelo") and f.exists() else {}
    for k, mo in enumerate(momentos):
        que = f"momento {k + 1} («{mo.get('palabra', '')}»)"
        c = cosas.get(mo.get("cosa", ""), {})
        t = mo.get("tarjeta") or {}
        sig = next((i for i in donde_va[k + 1:] if i >= 0), len(dichas))
        if t.get("tipo") == "imagen" and donde_va[k] >= 0:
            if k < 2 or donde_va[k] < 15:
                errores.append(f"{que}: la primera foto entra a los {donde_va[k] / POR_SEGUNDO:.1f} s; deja que el protagonista 3D se vea "
                               "de dos momentos y unos 5 s (15 palabras) antes de la primera foto")
            if sig - donde_va[k] < 6:
                errores.append(f"{que}: la foto dura {sig - donde_va[k]} palabras (~{(sig - donde_va[k]) / POR_SEGUNDO:.1f} s): que dure 6 o más "
                               "(unos 2 s) o no se alcanza a ver; junta este momento con el siguiente")
        # El remate se ve: en la cebolla que gustó, la abuela salió en la tabla y el corazón roto latía; en la que no,
        # «la salsa del domingo» fue una foto de catálogo y «a la cebolla ni la conocías», el logo de una revista.
        if mo.get("pose") in ("ladra", "lentes", "tapa") and t.get("tipo") in ("imagen", "prueba", "logos"):
            errores.append(f"{que}: es un remate (pose `{mo['pose']}`) y lo cubre una tarjeta `{t['tipo']}`: el chiste se ve en "
                           "la escena (la cosa con su `anima`, la persona que lo vive); la prueba va en otro momento")
        if c.get("icono") and (mo.get("camara") or {}).get("plano") == "detalle":
            errores.append(f"{que}: un ícono en `detalle` llena el cuadro y no se reconoce: ponle `primer` o `medio`")
        if mo.get("accion") == "late" and not (c.get("modelo") == "corazon" or "Heart" in str(c.get("icono"))):
            errores.append(f"{que}: `late` es de un corazón; «{mo.get('cosa')}» no late. Cada acción es lo que esa cosa hace en "
                           "la vida real y lo que dice la voz en ese momento; si no hay una, ninguna")
        if mo.get("accion") == "salta" and c.get("icono"):
            errores.append(f"{que}: un ícono que salta («{c['icono']}») no dice nada: la gota de «lluvia de gotitas» brincando no "
                           "era una lluvia. Quítale la acción o enseña lo que pasa con `anima` en el modelo")
        actua = fichas(c).get("actua")
        if actua and mo.get("accion") and mo["accion"] != "quieta":
            errores.append(f"{que}: «{mo.get('cosa')}» ya se mueve solo (`{actua}`); quítale `accion: {mo['accion']}`, que encima de "
                           f"su animación se ve raro. Para cambiarlo, `anima` (como `{actua}`)")
    # Una imagen casi negra (la molécula de la adenosina, líneas oscuras sobre negro) no se ve en su tarjeta oscura.
    for k, mo in enumerate(momentos):
        t = mo.get("tarjeta") or {}
        archivo = RAIZ / "public" / t.get("src", "") if t.get("tipo") == "imagen" and t.get("src") else None
        if archivo and archivo.is_file():
            r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(archivo), "-vf", "scale=16:16,format=gray", "-f", "rawvideo", "-"], capture_output=True)
            if r.returncode == 0 and r.stdout and sum(r.stdout) / len(r.stdout) < 40:
                errores.append(f"momento {k + 1}: «{t['src']}» es casi negra y no se ve en la tarjeta: busca otra (o una versión clara)")
    if fotos < 2 and not m.get("sin_fotos"):
        errores.append(f"lleva {fotos} foto{'s' if fotos != 1 else ''} real{'es' if fotos != 1 else ''}: pon de dos a tres (imagenes.py, después del gancho) "
                       "o, si de verdad no hay, `\"sin_fotos\": \"<por qué>\"`")
    # Sin la pieza central el video es de íconos sueltos: el del pan (5 de noviembre) fue una tostada, un cubo y una copa
    # de Phosphor, y quedó en 7 donde el tamal, con su diorama, llegó a 9.
    cosas = m.get("cosas", {})
    con_modelo = sum(1 for mo in momentos if "modelo" in cosas.get(mo.get("cosa", ""), {}))
    if len(momentos) >= 6 and con_modelo * 10 < len(momentos) * 4:
        errores.append(f"solo {con_modelo} de {len(momentos)} momentos enseñan un modelo 3D: lo demás son íconos. Lanza «La pieza "
                       "central» (paso 1) con lo que sostiene la historia y úsala en casi todos los momentos. No lo "
                       "cumplas con un modelo que no es lo que dice la voz (un vaso de agua para «la glucosa», un tamal "
                       "para «el taco»): se ve el error y baja lo claro")
    return errores


def nombre_de(archivo: Path, id_: str) -> str:
    """El componente que exporta un modelo o una pieza: el de su id en PascalCase, o el primero que no sea Muestra."""
    texto = archivo.read_text(encoding="utf-8")
    pascal = "".join(p.capitalize() for p in re.split(r"[-_]", id_))
    nombres = re.findall(r"^export const (\w+)\s*:\s*React\.FC", texto, re.M)
    if pascal in nombres:
        return pascal
    otros = [n for n in nombres if n != "Muestra"]
    if not otros:
        sys.exit(f"✗ {archivo.name} no exporta un componente (export const Nombre: React.FC…)")
    return otros[0]


def traer(m: dict) -> None:
    """Los modelos y los íconos al proyecto, y src/director/modelos.ts con sus imports."""
    cosas = m.get("cosas") or {}
    ids = sorted({c["modelo"] for c in cosas.values() if c.get("modelo")})
    nuevos = [i for i in ids if not (RAIZ / "src" / "modelos" / f"{i}.tsx").exists()]
    modelos_py = PY + [str(MODELOS / "scripts" / "modelos.py")]
    if nuevos:
        subprocess.run(modelos_py + ["usar", *nuevos], cwd=RAIZ, check=True, stdout=subprocess.DEVNULL)
    iconos = sorted({pascal_a_kebab(c["icono"]) for c in cosas.values() if c.get("icono")})
    if iconos:
        subprocess.run(modelos_py + ["iconos", *iconos], cwd=RAIZ, check=True)
    piezas = sorted({mo["tarjeta"]["nombre"] for mo in m["momentos"] if (mo.get("tarjeta") or {}).get("tipo") == "pieza"})
    lineas = ["// Lo escribe hacer.py con lo que pide momentos.json. No se edita a mano.", 'import type React from "react";']
    mapa_m, mapa_p = [], []
    for i in ids:
        n = nombre_de(RAIZ / "src" / "modelos" / f"{i}.tsx", i)
        lineas.append(f'import {{ {n} as M{len(mapa_m)} }} from "../modelos/{i}";')
        mapa_m.append(f'  "{i}": M{len(mapa_m)},')
    for i in piezas:
        n = nombre_de(RAIZ / "src" / "piezas" / f"{i}.tsx", i)
        lineas.append(f'import {{ {n} as P{len(mapa_p)} }} from "../piezas/{i}";')
        mapa_p.append(f'  "{i}": P{len(mapa_p)},')
    # La caja de los que la tienen en su modelo.json (ancho, alto, fondo): con ella la cámara encuadra lo alto y delgado
    # (un celular) por su silueta y no por una esfera, que lo dejaba en un tercio del cuadro.
    cajas, frentes = [], []
    for i in ids:
        ficha = next((p for p in (MODELOS / "modelos" / i / "modelo.json", MODELOS / "plantilla" / i / "modelo.json") if p.exists()), None)
        datos = json.loads(ficha.read_text(encoding="utf-8")) if ficha else {}
        if datos.get("caja"):
            cajas.append(f'  "{i}": [{", ".join(str(float(x)) for x in datos["caja"])}],')
        if datos.get("frente"):
            frentes.append(f'"{i}"')
    lineas += ["", "// eslint-disable-next-line @typescript-eslint/no-explicit-any", "export const MODELOS: Record<string, React.FC<any>> = {", *mapa_m, "};",
               "// eslint-disable-next-line @typescript-eslint/no-explicit-any", "export const PIEZAS: Record<string, React.FC<any>> = {", *mapa_p, "};",
               "export const CAJAS: Record<string, [number, number, number]> = {", *cajas, "};",
               f"export const FRENTES = new Set<string>([{', '.join(frentes)}]);", ""]
    (RAIZ / "src" / "director" / "modelos.ts").write_text("\n".join(lineas), encoding="utf-8", newline="\n")


def subtitulos(m: dict) -> None:
    """subtitulos.txt desde el guion, con las palabras de cada momento y las cifras en negrita y una caja por renglón."""
    subprocess.run(PY + [str(SKILL / "scripts" / "subtitulos.py"), "--pisa"], cwd=RAIZ, check=True, stdout=subprocess.DEVNULL)
    claves = set()
    for mo in m["momentos"]:
        claves.update(w for w in palabras_de(mo["palabra"]) if len(w) > 3 or w.isdigit())
    archivo = RAIZ / "subtitulos.txt"
    fuera = []
    for linea in archivo.read_text(encoding="utf-8").splitlines():
        if linea.startswith("#") or not linea.strip():
            fuera.append(linea)
            continue
        fichas, caja = [], False
        for ficha in linea.split(" "):
            dicho = ficha.split("=", 1)[-1].replace("_", " ")
            cifra = "=" in ficha or any(ch.isdigit() for ch in ficha)
            clave = cifra or any(w in claves for w in palabras_de(dicho))
            if clave and not caja and not cifra and len(normal(dicho)) > 3:
                fichas.append(f"[{ficha}]")
                caja = True
            elif clave:
                fichas.append(f"*{ficha}*")
            else:
                fichas.append(ficha)
        fuera.append(" ".join(fichas))
    archivo.write_text("\n".join(fuera) + "\n", encoding="utf-8", newline="\n")


def voz(args: list[str]) -> None:
    """La voz solo si el guion cambió desde la última (o si no hay)."""
    guion = (RAIZ / "guion.md").read_bytes()
    firma = hashlib.sha1(guion).hexdigest()
    hecha = RAIZ / "fuentes" / "voz" / "guion.sha1"
    if not args and hecha.exists() and hecha.read_text().strip() == firma:
        paso("la voz ya es de este guion: no se rehace")
        return
    if not args:
        if hecha.exists():
            sys.exit("✗ El guion cambió desde la voz: corre hacer.py con --studio <Voz> o --audio <archivo>.")
        sys.exit("✗ Falta la voz: --studio <Voz> o --audio <archivo>.")
    cmd = PY + [str(SKILL / "scripts" / "voz.py")] + (["--studio", args[1]] if args[0] == "--studio" else [args[1]])
    paso("la voz (" + ("AI Studio" if args[0] == "--studio" else "la del usuario") + ")…")
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode and args[0] == "--studio" and "AI Studio" in r.stdout + r.stderr and not any(x in (r.stdout + r.stderr).lower() for x in ("cuota", "429")):
        # AI Studio a veces cierra su página a medias («Target page, context or browser has been closed», 5 de
        # noviembre): se pide otra vez, una sola, antes de dar la vuelta por perdida.
        paso("AI Studio falló; otra vez…")
        r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    for l in (r.stdout + r.stderr).splitlines():
        if l.startswith(("✗", "⚠", "✓", "voz de")):
            print("  " + l, flush=True)
    if r.returncode:
        sys.exit("✗ La voz falló (arriba). Si es de AI Studio, «Si falla» en VOZ.md de video-base.")
    hecha.parent.mkdir(parents=True, exist_ok=True)
    hecha.write_text(firma + "\n")


def huella(m: dict) -> None:
    """Lo que este video deja en el registro de huellas, sacado de momentos.json."""
    archivo = RAIZ / "fuentes" / "huella.json"
    if archivo.exists():
        return
    cosas = m.get("cosas") or {}
    datos = {"serie": None, "tema": titulo(), "paleta": [m.get("paleta", {}).get("oscuro"), m.get("paleta", {}).get("claro")],
             "objetos": sorted({c["modelo"] for c in cosas.values() if c.get("modelo")})}
    archivo.parent.mkdir(parents=True, exist_ok=True)
    archivo.write_text(json.dumps(datos, ensure_ascii=False) + "\n", encoding="utf-8")


def hoja(video: Path) -> Path:
    """Un cuadro cada 1.5 s, en una sola imagen de 6 columnas."""
    salida = RAIZ / "revision" / "hoja.png"
    salida.parent.mkdir(exist_ok=True)
    dura = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)], capture_output=True, text=True).stdout)
    filas = max(1, -(-int(dura / 1.5) // 6))
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", "0.75", "-i", str(video), "-vf", f"fps=1/1.5,scale=300:-1,tile=6x{filas}:padding=4", "-frames:v", "1", str(salida)], check=True)
    return salida


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    if not (RAIZ / "remotion.config.ts").exists():
        sys.exit("Córrelo desde la raíz del proyecto (donde está remotion.config.ts).")
    args = sys.argv[1:]
    dura = None
    if "--dura" in args:
        i = args.index("--dura")
        try:
            dura = float(args[i + 1])
        except (IndexError, ValueError):
            sys.exit(__doc__)
        del args[i:i + 2]
    # `--revisa`: solo el paso 1, en un segundo y sin fondo. Lanzado de fondo, cada ✗ le costaba al agente tres
    # llamadas (esperar, leer el log, corregir): en el estómago del 6-nov fueron 9 de sus 22.
    revisa = "--revisa" in args
    if revisa:
        args.remove("--revisa")
    if args and (len(args) != 2 or args[0] not in ("--studio", "--audio")):
        sys.exit(__doc__)
    for f in ("guion.md", "momentos.json"):
        if not (RAIZ / f).exists():
            sys.exit(f"✗ Falta {f} en la raíz del proyecto.")
    esperar_proyecto()
    try:
        m = json.loads((RAIZ / "momentos.json").read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"✗ momentos.json no es JSON: {e}")
    if errores := comprobar(m, palabras_de(texto_del_guion()), "el guion"):
        sys.exit("✗ momentos.json:\n  " + "\n  ".join(errores))
    mc = marca()
    if mc.get("cierre", {}).get("red", "ninguna") != "ninguna":
        frase = mc["cierre"].get("frase", "")
        if busca(palabras_de(texto_del_guion()), frase, 1) < 0:
            sys.exit(f"✗ El guion no termina con la frase de la marca: «{frase}»")
        m["cierre"] = " ".join(frase.split()[:3])
    # Lo largo, antes de pagar la voz: el ajo del 6-nov salió de 37,7 s para 30 y se rehízo (otra voz, otro render, +3 min).
    if dura:
        n = len(palabras_de(texto_del_guion()))
        quiere = round(dura * POR_SEGUNDO)
        if abs(n - quiere) > quiere * 0.12:
            sys.exit(f"✗ El guion tiene {n} palabras (~{n / POR_SEGUNDO:.0f} s) y pidieron {dura:g} s (~{quiere} palabras con el cierre): "
                     + (f"quítale {n - quiere}." if n > quiere else f"súmale {quiere - n}."))
    if revisa:
        print("✓ momentos.json bien: ya puedes lanzar hacer.py de fondo")
        return
    paso("momentos.json bien; trayendo modelos e íconos")
    traer(m)
    subtitulos(m)
    voz(args)
    dichas = [normal(p["w"]) for p in json.loads((RAIZ / "src" / "datos" / "voz.json").read_text(encoding="utf-8"))["palabras"]]
    dichas = [d for d in dichas if d]
    a_la_voz(m, palabras_de(texto_del_guion()), dichas)
    if errores := comprobar(m, dichas, "la voz"):
        texto = " ".join(dichas)
        sys.exit("✗ La voz lo dijo distinto (cambia la palabra en momentos.json y vuelve a correr hacer.py, sin --studio):\n  "
                 + "\n  ".join(errores) + f"\n  La voz dijo: {texto}")
    (RAIZ / "src" / "datos" / "momentos.json").write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    huella(m)
    paso("tipos…")
    tsc = RAIZ / "node_modules" / "typescript" / "bin" / "tsc"
    r = subprocess.run(["node", str(tsc), "--noEmit", "-p", "tsconfig.json"], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        sys.exit("✗ Tipos:\n" + r.stdout[-2500:])
    paso("render…")
    r = subprocess.run(PY + [str(SKILL / "scripts" / "final.py")], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode and "Timeout" in r.stdout + r.stderr:
        # Un cuadro que no termina de dibujarse en 30 s (el del tamal del 5 de noviembre, en el cuadro 103) sale bien al
        # repetirlo: se repite una vez antes de dar la vuelta por perdida.
        paso("un cuadro tardó de más; render otra vez…")
        r = subprocess.run(PY + [str(SKILL / "scripts" / "final.py")], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", errors="replace")
    salida = r.stdout + r.stderr
    lineas = [l.strip() for l in salida.splitlines()]
    medido = [l for k, l in enumerate(lineas) if l.startswith(("video ", "✘")) or (k and lineas[k - 1].startswith("video "))]
    for l in medido:
        # Lo que medir.py marca (quieto, parpadeos) lo pone el director, no momentos.json: sus consejos son del flujo viejo.
        print("  " + (l.split(":")[0] + ": es del director, no de momentos.json; entrega y díselo al usuario" if l.startswith("✘") else l), flush=True)
    if r.returncode:
        sys.exit("✗ final.py falló:\n" + salida[-2500:])
    video = RAIZ / "out" / f"{RAIZ.name}.mp4"
    paso("portada…")
    portada = RAIZ / "portada.png"
    horizontal = json.loads((RAIZ / "src" / "datos" / "formato.json").read_text(encoding="utf-8")).get("formato") == "horizontal"
    # En horizontal es la miniatura de YouTube (1280×720) y no entra en el video; en vertical, su primer cuadro.
    palabras = json.loads((RAIZ / "src" / "datos" / "voz.json").read_text(encoding="utf-8"))["palabras"]
    propio = [w for w in (json.loads((RAIZ / "momentos.json").read_text(encoding="utf-8")).get("titular") or "").split() if normal(w)]
    n = len(propio) or next((k + 1 for k, p in enumerate(palabras) if re.search(r"[.!?]$", p["w"])), 0)
    hay_titular = 0 < n <= max(10, len(propio))
    if hay_titular and not horizontal:
        # En vertical la portada es el cuadro del gancho con su titular ya entero (Titular.tsx lo deja completo en
        # 3 cuadros por palabra): el protagonista 3D, la frase que detiene y nada más. Con un cuadro cualquiera y el
        # título de guion.md encima salían los subtítulos de fondo con su recuadro y un título que delataba todo («El
        # falso premio»): el revisor a ciegas le dio 4 de «lo vería».
        hasta = palabras[min(n, len(palabras)) - 1]["e"] + 10 / 30
        t = min(hasta - 0.15, (3 * n + 16) / 30)
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1", str(portada)],
                       cwd=RAIZ, check=True, capture_output=True)
    else:
        # El fondo, cuando el titular ya se fue: a medias salía una palabra entrando encima de otra.
        fondo = palabras[min(n, len(palabras)) - 1]["e"] + 0.7 if hay_titular else 0.6
        subprocess.run(["node", str(BASE / "portada_sin_ia.mjs"), str(video), str(portada), "--titulo", titulo() or RAIZ.name, "--t", f"{fondo:.2f}",
                        *(["--horizontal"] if horizontal else [])], cwd=RAIZ, check=True, capture_output=True)
    if not horizontal:
        subprocess.run(["node", str(BASE / "portada.mjs"), str(video), str(portada)], cwd=RAIZ, check=True, capture_output=True)
    paso(f"✓ listo: {video}\n  Mira {hoja(video)} (un cuadro cada 1.5 s) y {portada}.")


main()
