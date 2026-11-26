"""
Un video de Motion Graphics entero en un comando, de fondo: de momentos.json (lo único que escribe el agente) a
out/motion-graphics.mp4 con su portada y su hoja de cuadros. Sigue el motor común (video-base/MOTOR.md).

    python -B -X utf8 <skill>/scripts/hacer.py --revisa            solo revisa momentos.json (menos de un segundo)
    python -B -X utf8 <skill>/scripts/hacer.py                     el video entero
    python -B -X utf8 <skill>/scripts/hacer.py --fotos             un cuadro por plano, sin render: para mirar
    --pista <audio>   la música del usuario en vez de la sintetizada (se repite si es corta)
    --imagenes <con>  la portada con IA: `chatgpt` o el modelo de Flow de la línea `Imágenes:`

Desde la raíz del proyecto. En orden, y para en el primer ✗ diciendo qué arreglar:
1. Comprueba momentos.json y escribe revision/plan.json: cada plano en su compás, su color y su capítulo. Es lo que
   dibuja el director (kit/motion.js); el agente no elige ni duraciones ni curvas.
2. La música, sintetizada al mismo BPM del montaje (video-base/scripts/musica.py) o la --pista del usuario, masterizada.
3. Dibuja los cuadros en Chrome (render.mjs). Si el plan y el kit no cambiaron, no los dibuja otra vez.
4. Junta imagen y sonido, pone la portada (la del estilo, o la de IA si el mensaje la pidió) y deja revision/hoja.png.
"""
import hashlib
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
SKILLS = Path(os.environ["SLOTH_SKILLS"]) if os.environ.get("SLOTH_SKILLS") else SKILL.parent
BASE = SKILLS / "video-base" / "scripts"
sys.path.insert(0, str(BASE))
from momentos import Reloj, anclar, con_imagenes, esperar_portada, guardar, hoja, normal, opcion, palabras_de, parar, pedir_portada  # noqa: E402
from voz import conseguir as conseguir_voz, palabras as palabras_de_la_voz  # noqa: E402

# ── El estilo: la rejilla y los colores (ESTILO.md) ──────────────────────────────────────────────────────────────
BPM = 128
FPS = 30
TAMANO = {"vertical": (1080, 1920), "horizontal": (1920, 1080)}

PALETAS = {
    # La de la referencia: casi negro, coral, crema, azul eléctrico.
    "coral": {"oscuro": "#121014", "acento": "#EE4B38", "claro": "#F0EDE6", "apoyo": "#4140F2", "tinta": "#121014"},
    # Marca de producto: papel gris, violeta y verde de estado.
    "tinta": {"oscuro": "#0D1117", "acento": "#8B5CF6", "claro": "#F2F2EF", "apoyo": "#2DA44E", "tinta": "#0D1117"},
    # Estudio de motion: gris claro, verde neón y magenta.
    "neon": {"oscuro": "#0A0A0A", "acento": "#00E07A", "claro": "#ECECEC", "apoyo": "#FF2D78", "tinta": "#0A0A0A"},
    # Anuncio limpio: blanco, azul y grafito.
    "nieve": {"oscuro": "#1D1D1F", "acento": "#0071E3", "claro": "#FFFFFF", "apoyo": "#FF9F0A", "tinta": "#1D1D1F"},
}

# Cada plano: su fondo de salida, sus campos obligatorios y el tope de letras de cada texto.
PLANOS = {
    "destello": ("oscuro", [], {"texto": 22}),
    "titular": ("acento", ["texto"], {"texto": 30, "pie": 30}),
    "frase": ("claro", ["texto"], {"texto": 64}),
    "panel": ("oscuro", ["titulo", "filas"], {"titulo": 26}),
    "formas": ("apoyo", ["figuras"], {}),
    "trama": ("oscuro", [], {"texto": 24}),
    "tarjetas": ("claro", ["tarjetas"], {"texto": 30}),
    "cifra": ("acento", ["texto"], {"texto": 12, "pie": 24}),
    "cierre": ("acento", [], {"texto": 22, "pie": 34}),
    # Los de material generado: `pide` es el pedido, en inglés y en una frase (el estilo lo pone material.py).
    "imagen": ("oscuro", ["pide"], {"pide": 220, "texto": 30}),
    "clip": ("oscuro", ["pide"], {"pide": 220, "texto": 30}),
    "modelo": ("apoyo", ["modelo3d"], {"texto": 30}),
}
NOMBRE = {"destello": "apertura", "titular": "titular", "frase": "promesa", "panel": "detalle", "formas": "ritmo",
          "trama": "textura", "tarjetas": "producto", "cifra": "dato", "cierre": "cierre",
          "imagen": "imagen", "clip": "clip", "modelo": "objeto"}
TRATOS = ["duotono", "completo", "tarjeta"]
# Lo que cuesta un clip de 8 s, de OPCIONES_CLIPS en shared/flow.ts (si cambia allá, cambia aquí).
CREDITOS = {"Veo 3.1 - Lite": 10, "Veo 3.1 - Fast": 20, "Veo 3.1 - Quality": 100,
            "Omni 1.2 Flash": 24, "Omni 1.1 Flash": 12}
MODELOS_3D = SKILLS / "modelos-3d" / "modelos"
FIGURAS = ["circulo", "cuadrado", "triangulo", "rombo", "pentagono", "play", "cruz", "estrella", "anillo"]
COMPASES = [0.5, 1, 1.5, 2, 3]
FONDOS = ["oscuro", "acento", "claro", "apoyo"]
FOCOS = [[0.5, 0.45], [0.72, 0.3], [0.28, 0.62], [0.5, 0.75], [0.8, 0.58], [0.2, 0.36]]


def texto_de(valor) -> str:
    return " ".join(str(valor or "").split())


def plan_de(datos: dict, guion: str = "", voz_en: tuple[list[float], float] | None = None) -> tuple[dict, list[str]]:
    """
    Comprueba momentos.json y, si está bien, devuelve el plan que dibuja el director. Dice todos los ✗ de una vez.

    Sin voz, cada plano dura sus `compases` y los cortes caen en la rejilla. Con `"voz": true`, cada plano entra
    cuando la voz dice su `palabra` (`voz_en`: el segundo de cada una y el final de la grabación), **pegado a la
    corchea más cercana**: lo manda la voz, pero el corte sigue cayendo en el ritmo.
    """
    e = []
    formato = datos.get("formato", "vertical")
    if formato not in TAMANO:
        e.append("formato debe ser vertical u horizontal")
        formato = "vertical"
    nombre_paleta = datos.get("paleta", "coral")
    if nombre_paleta not in PALETAS:
        e.append(f"paleta debe ser una de {', '.join(PALETAS)}")
        nombre_paleta = "coral"
    bpm = datos.get("bpm", BPM)
    if not isinstance(bpm, (int, float)) or not 70 <= bpm <= 180:
        e.append("bpm debe ir entre 70 y 180 (128 es el del estilo)")
        bpm = BPM
    marca = texto_de(datos.get("marca"))
    if not 1 <= len(marca) <= 18:
        e.append("marca: el nombre que lleva el HUD y el cierre, de 1 a 18 letras")
    momentos = datos.get("momentos")
    if not isinstance(momentos, list) or not 4 <= len(momentos) <= 16:
        return {}, e + ["momentos: de 4 a 16 planos, en orden"]

    pulso = 60 / bpm
    compas = 4 * pulso
    corchea = pulso / 2
    con_voz = bool(datos.get("voz"))
    if con_voz:
        if not guion.strip():
            e.append('con «voz»: escribe guion.md con lo que dice la voz')
        elif all(isinstance(m, dict) for m in momentos):
            _, fallos = anclar(momentos, palabras_de(guion), "el guion")
            e.extend(fallos)
    inicios = None
    if con_voz and voz_en:
        tiempos, fin_voz = voz_en
        # Pegada a la corchea: el plano entra con la palabra, pero el corte cae en el ritmo.
        inicios = [round(round(x / corchea) * corchea, 4) for x in tiempos]
        inicios[0] = 0.0
        for i in range(1, len(inicios)):
            if inicios[i] <= inicios[i - 1]:
                inicios[i] = round(inicios[i - 1] + corchea, 4)
        # El video termina un compás entero después de la última palabra.
        final = round(math.ceil((fin_voz + pulso) / compas) * compas, 4)
        if final <= inicios[-1]:
            final = round(inicios[-1] + compas, 4)
    escenas, t = [], 0.0
    anterior = None
    for i, m in enumerate(momentos):
        donde = f"momento {i + 1}"
        if not isinstance(m, dict):
            e.append(f"{donde}: debe ser un objeto")
            continue
        plano = m.get("plano")
        if plano not in PLANOS:
            e.append(f"{donde}: plano debe ser uno de {', '.join(PLANOS)}")
            continue
        base_salida, obligatorios, topes = PLANOS[plano]
        for campo in obligatorios:
            if not m.get(campo):
                e.append(f"{donde} ({plano}): falta «{campo}»")
        for campo, tope in topes.items():
            if m.get(campo) and len(texto_de(m[campo])) > tope:
                e.append(f"{donde} ({plano}): «{campo}» pasa de {tope} letras; en pantalla no se lee")
        compases = m.get("compases", 1)
        if compases not in COMPASES:
            e.append(f"{donde}: compases debe ser uno de {', '.join(str(c) for c in COMPASES)}")
            compases = 1
        if con_voz and "compases" in m:
            e.append(f"{donde}: con voz manda la palabra, no «compases»: quítalo")
        if con_voz and inicios:
            t = inicios[i]
            dura = round((inicios[i + 1] if i + 1 < len(inicios) else final) - t, 4)
            if dura < corchea:
                e.append(f"{donde}: la voz dice su palabra casi encima de la anterior; junta los dos momentos")
        else:
            dura = compases * compas

        if plano == "frase":
            palabras = texto_de(m.get("texto")).split()
            if not 3 <= len(palabras) <= 10:
                e.append(f"{donde} (frase): de 3 a 10 palabras")
            if len(palabras) * corchea + 0.45 > dura:
                e.append(f"{donde} (frase): {len(palabras)} palabras no caben en {compases} compás; sube «compases»")
        if plano == "panel":
            filas = m.get("filas")
            if not isinstance(filas, list) or not 2 <= len(filas) <= 6:
                e.append(f"{donde} (panel): «filas», de 2 a 6 etiquetas")
            elif any(len(texto_de(f)) > 18 for f in filas):
                e.append(f"{donde} (panel): cada fila, 18 letras como mucho")
        if plano == "formas":
            figuras = m.get("figuras")
            if not isinstance(figuras, list) or not 2 <= len(figuras) <= 8:
                e.append(f"{donde} (formas): «figuras», de 2 a 8")
            elif [f for f in figuras if f not in FIGURAS]:
                e.append(f"{donde} (formas): solo {', '.join(FIGURAS)}")
        if plano == "tarjetas":
            tarjetas = m.get("tarjetas")
            if not isinstance(tarjetas, list) or not 2 <= len(tarjetas) <= 6:
                e.append(f"{donde} (tarjetas): «tarjetas», de 2 a 6 títulos")
            elif any(len(texto_de(c)) > 28 for c in tarjetas):
                e.append(f"{donde} (tarjetas): cada título, 28 letras como mucho")
        if plano in ("imagen", "clip") and m.get("trato") and m["trato"] not in TRATOS:
            e.append(f"{donde} ({plano}): trato debe ser uno de {', '.join(TRATOS)}")
        if plano == "clip":
            if "desde" in m:
                e.append(f'{donde} (clip): «desde» ya no existe (chocaba con el segundo del plano): usa "sigue": true')
            if m.get("sigue") not in (None, True, False):
                e.append(f'{donde} (clip): «sigue» es true o false')
            if dura > 8:
                e.append(f"{donde} (clip): un clip de Flow dura 8 s; baja «compases» a 4 o menos")
        if plano == "modelo":
            cual3d = texto_de(m.get("modelo3d"))
            if cual3d and not (MODELOS_3D / cual3d / "vuelta.webm").is_file():
                hay = ", ".join(sorted(d.name for d in MODELOS_3D.glob("*") if d.is_dir())) or "ninguno todavía"
                e.append(f"{donde} (modelo): «{cual3d}» no está en la biblioteca 3D. Hay: {hay}")
        if plano == "cierre" and i != len(momentos) - 1:
            e.append(f"{donde}: «cierre» es el último plano del video")

        # El fondo: el de salida del plano, o el que pida el momento, y nunca dos planos seguidos del mismo color.
        base = m.get("fondo", base_salida)
        if base not in FONDOS:
            e.append(f"{donde}: fondo debe ser uno de {', '.join(FONDOS)}")
            base = base_salida
        if base == anterior:
            base = FONDOS[(FONDOS.index(base) + 1) % len(FONDOS)]
        anterior = base

        escena = {k: v for k, v in m.items() if k not in ("compases", "fondo", "plano")}
        escena.update({"plano": plano, "desde": round(t, 4), "dura": round(dura, 4), "base": base,
                       "capitulo": texto_de(m.get("capitulo")) or f"{i + 1:02d} — {NOMBRE[plano]}",
                       "foco": FOCOS[i % len(FOCOS)]})
        escenas.append(escena)
        t += dura

    if momentos and momentos[-1].get("plano") != "cierre":
        e.append("el último momento debe ser el plano «cierre»: la marca con la que termina el video")
    if not 6 <= t <= 45:
        e.append(f"el video dura {t:.1f} s: suma entre 6 y 45 s de compases")

    ancho, alto = TAMANO[formato]
    titulares = [s for s in escenas if s["plano"] == "titular"]
    portada = texto_de(datos.get("portada")) or (titulares[0]["texto"] if titulares else marca)
    if len(portada) > 34:
        e.append("portada: de 2 a 5 palabras enormes, 34 letras como mucho")
    plan = {"ancho": ancho, "alto": alto, "fps": datos.get("fps", FPS), "bpm": bpm,
            "pulso": round(pulso, 6), "compas": round(compas, 6), "duracion": round(t, 4),
            "paleta": PALETAS[nombre_paleta], "marca": marca.upper(),
            "sello": texto_de(datos.get("sello")) or "MOTION GRAPHICS",
            "portada": {"texto": portada, "pie": marca, "base": "acento"}, "escenas": escenas}
    return plan, e


def pegar_material(raiz: Path, plan: dict) -> None:
    """
    Vuelve a enganchar el plan con el material que ya está en `material/`. El plan se rehace desde momentos.json en
    cada corrida (también en `--revisa` y `--fotos`), y sin esto perdería lo ya generado y el plano saldría vacío.
    """
    try:
        piezas = json.loads((raiz / "material" / "estado.json").read_text(encoding="utf-8")).get("piezas", {})
    except (OSError, ValueError):
        piezas = {}
    for clave, pieza in piezas.items():
        i = int(clave)
        if pieza.get("estado") != "lista" or i >= len(plan["escenas"]):
            continue
        escena = plan["escenas"][i]
        if pieza.get("cuadros") and (raiz / pieza["cuadros"]).is_dir():
            escena["cuadros"], escena["n"] = pieza["cuadros"], pieza["n"]
        elif pieza.get("archivo") and (raiz / pieza["archivo"]).is_file():
            escena["archivo"] = pieza["archivo"]
    for escena in plan["escenas"]:
        if escena["plano"] == "modelo":
            carpeta = raiz / "material" / ("mod-" + escena["modelo3d"])
            hay = len(list(carpeta.glob("f*.jpg"))) if carpeta.is_dir() else 0
            if hay:
                escena["cuadros"], escena["n"] = f"material/mod-{escena['modelo3d']}", hay


def cuenta(plan: dict, con: str, clips: str, resolucion: str, raiz: Path | None = None) -> str:
    """Lo que este video va a pedir y lo que cuesta, para decirlo antes de gastarlo."""
    import material
    pedidos = material.pedidos_de(plan, con, clips, resolucion, raiz)
    imagenes = [p for p in pedidos if p["tipo"] == "imagen"]
    videos = [p for p in pedidos if p["tipo"] == "video"]
    if not pedidos:
        return "no pide material generado"
    partes = []
    if imagenes:
        quien = "ChatGPT" if con == "chatgpt" else f"Flow, {con}" if con else "nadie elegido todavía (línea «Imágenes:»)"
        partes.append(f"{len(imagenes)} imagen(es) con {quien}" + (", sin créditos de Flow" if con and con != "chatgpt" else ""))
    if videos:
        cada = CREDITOS.get(clips, 20)
        partes.append(f"{len(videos)} clip(s) con {clips}: {cada} créditos cada uno, {cada * len(videos)} en total")
    return "va a pedir " + " y ".join(partes)


def correr(*comando, **kw):
    r = subprocess.run([str(c) for c in comando], **kw)
    if r.returncode:
        sys.exit(f"✗ falló: {' '.join(str(c) for c in comando[:3])}…")
    return r


def huella(plan: dict) -> str:
    """Lo que cambia el dibujo: el plan y el kit. Si no cambió, el render de antes sirve."""
    h = hashlib.sha256(json.dumps(plan, sort_keys=True, ensure_ascii=False).encode())
    for archivo in sorted((SKILL / "kit").rglob("*")):
        if archivo.is_file():
            h.update(archivo.name.encode())
            h.update(archivo.read_bytes())
    return h.hexdigest()


def main() -> None:
    args = sys.argv[1:]
    pista = opcion(args, "--pista")
    imagenes = opcion(args, "--imagenes")
    clips = opcion(args, "--clips") or "Veo 3.1 - Lite"
    resolucion = opcion(args, "--resolucion") or ""
    tope = opcion(args, "--tope") or ""
    revisa = "--revisa" in args
    fotos = "--fotos" in args
    raiz = Path.cwd().resolve()

    archivo = raiz / "momentos.json"
    if not archivo.is_file():
        sys.exit("✗ falta momentos.json en la carpeta del video")
    try:
        datos = json.loads(archivo.read_text(encoding="utf-8"))
    except ValueError as err:
        sys.exit(f"✗ momentos.json no es JSON válido: {err}")
    guion_md = raiz / "guion.md"
    guion = guion_md.read_text(encoding="utf-8") if guion_md.is_file() else ""
    con_voz = bool(datos.get("voz"))
    plan, errores = plan_de(datos, guion)
    parar(errores)
    pegar_material(raiz, plan)
    guardar(raiz / "revision" / "plan.json", plan)
    if revisa:
        print(f"✓ {len(plan['escenas'])} planos, {plan['duracion']:.1f} s a {plan['bpm']} BPM "
              f"({plan['duracion'] / plan['compas']:.0f} compases), {plan['ancho']}×{plan['alto']}")
        # Lo que va a gastar, antes de gastarlo.
        print("  " + cuenta(plan, con_imagenes(raiz, imagenes), clips, resolucion, raiz))
        return

    if fotos:
        tiempos = ",".join(f"{s['desde'] + s['dura'] * 0.9:.2f}" for s in plan["escenas"])
        correr("node", SKILL / "scripts" / "render.mjs", raiz, "--fotos", tiempos)
        print("Mira revision/fotos/: un cuadro por plano, ya asentado.")
        return

    reloj = Reloj(raiz)
    desde = time.time()
    if con_voz:
        # Con voz, los planos no caen en la rejilla sino donde la voz dice su palabra: hay que tenerla antes del plan.
        conseguir_voz(raiz, args, guion, reloj)
        dichos = palabras_de_la_voz(raiz, reloj)
        indices, fallos = anclar(datos["momentos"], [normal(p["w"]) for p in dichos], "la voz")
        parar(fallos)
        plan, errores = plan_de(datos, guion, ([dichos[k]["s"] for k in indices], dichos[-1]["e"]))
        parar(errores)
        pegar_material(raiz, plan)
        guardar(raiz / "revision" / "plan.json", plan)
    con = con_imagenes(raiz, imagenes)
    vertical = plan["alto"] > plan["ancho"]
    proceso = pedir_portada(
        raiz, con, plan["portada"]["texto"],
        "flat vector motion graphics, huge condensed sans-serif type, one flat colour field, a thin technical HUD frame, "
        f"palette {', '.join(plan['paleta'][k] for k in ('oscuro', 'acento', 'claro'))}, no photos, no gradients",
        plan["marca"], horizontal=not vertical)

    # ── El material generado, pedido de fondo: mientras llega se hace la música ─────────────────────────────────
    import material as mat
    # Primero los objetos 3D: son locales y gratis, y así una semilla que caiga sobre uno ya lo enseña.
    objetos = [e for e in plan["escenas"] if e["plano"] == "modelo"]
    if objetos:
        reloj.paso(f"{len(objetos)} objeto(s) de la biblioteca 3D")
        for e in objetos:
            carpeta = raiz / "material" / ("mod-" + e["modelo3d"])
            e["cuadros"] = f"material/mod-{e['modelo3d']}"
            e["n"] = mat.sacar_cuadros(MODELOS_3D / e["modelo3d"] / "vuelta.webm", carpeta, plan["ancho"],
                                       plan["alto"], plan["fps"], e["dura"], cuadrado=True, repetir=True)
    # La semilla de los clips que siguen del plano anterior: se dibuja **antes** de calcular los pedidos, porque
    # entra en la huella de cada uno (cambiar el plano anterior cambia el clip).
    semillas = [(i, e["desde"] - 1 / plan["fps"]) for i, e in enumerate(plan["escenas"])
                if e["plano"] == "clip" and e.get("sigue") and i > 0]
    if semillas:
        guardar(raiz / "revision" / "plan.json", plan)
        correr("node", SKILL / "scripts" / "render.mjs", raiz, "--semillas",
               ",".join(f"{n}:{t:.3f}" for n, t in semillas))
        for n, _ in semillas:
            plan["escenas"][n]["semilla"] = f"material/semilla-{n}.jpg"
        guardar(raiz / "revision" / "plan.json", plan)
    pedidos = mat.pedidos_de(plan, con, clips, resolucion, raiz)
    hilo = None
    if pedidos:
        reloj.paso("material generado: " + cuenta(plan, con, clips, resolucion, raiz))
        orden = [sys.executable, "-B", "-X", "utf8", str(SKILL / "scripts" / "material.py"), str(raiz),
                 "--con", con, "--clips", clips]
        if resolucion:
            orden += ["--resolucion", resolucion]
        if tope:
            orden += ["--tope", tope]
        (raiz / "material").mkdir(exist_ok=True)
        registro = open(raiz / "material" / "material.log", "w", encoding="utf-8")
        hilo = subprocess.Popen(orden, cwd=raiz, stdin=subprocess.DEVNULL, stdout=registro, stderr=subprocess.STDOUT)

    # ── La música, al mismo BPM que el montaje ──────────────────────────────────────────────────────────────────
    mezcla = raiz / "fuentes" / "audio" / "mezcla.wav"
    seña = {"dur": plan["duracion"], "bpm": plan["bpm"], "pista": str(pista or ""), "voz": con_voz}
    apunte = raiz / "fuentes" / "audio" / "mezcla.json"
    hecha = json.loads(apunte.read_text(encoding="utf-8")) if apunte.is_file() else None
    if not mezcla.is_file() or hecha != seña:
        reloj.paso(f"música a {plan['bpm']} BPM")
        crudo = raiz / "fuentes" / "audio" / "crudo.wav"
        crudo.parent.mkdir(parents=True, exist_ok=True)
        if con_voz:
            # La pista del video es la voz; la música entra debajo cuando el video ya está (musica.poner la agacha).
            correr("ffmpeg", "-nostdin", "-v", "error", "-y", "-i", raiz / "fuentes" / "voz" / "original.wav",
                   "-af", f"apad,atrim=0:{plan['duracion']:.3f}", "-ar", "48000", "-ac", "2", crudo)
        elif pista:
            correr("ffmpeg", "-nostdin", "-v", "error", "-y", "-stream_loop", "-1", "-i", pista,
                   "-t", f"{plan['duracion']:.3f}", "-ar", "48000", "-ac", "2", "-af",
                   f"afade=in:st=0:d=0.5,afade=out:st={max(0, plan['duracion'] - 1.2):.3f}:d=1.2", crudo)
        else:
            import musica
            musica.sintetizar(plan["duracion"], crudo, 11, plan["bpm"])
        correr("node", BASE / "masterizar.mjs", crudo, mezcla)
        guardar(apunte, seña)

    # ── Recoger el material y los objetos 3D de la biblioteca ──────────────────────────────────────────────────
    if hilo:
        reloj.paso("esperando el material generado")
        hilo.wait()
        try:
            piezas = json.loads((raiz / "material" / "estado.json").read_text(encoding="utf-8")).get("piezas", {})
        except (OSError, ValueError):
            piezas = {}
        for clave, pieza in piezas.items():
            escena = plan["escenas"][int(clave)]
            if pieza.get("estado") == "lista":
                if pieza.get("cuadros"):
                    escena["cuadros"], escena["n"] = pieza["cuadros"], pieza["n"]
                else:
                    escena["archivo"] = pieza["archivo"]
                print(f"  plano {int(clave) + 1} ({escena['plano']}): {pieza.get('gasto', 'listo')}", flush=True)
            else:
                print(f"  ✗ plano {int(clave) + 1} ({escena['plano']}): {pieza.get('por')}; va su campo de color",
                      flush=True)
    if pedidos or objetos:
        guardar(raiz / "revision" / "plan.json", plan)

    # ── Los cuadros ─────────────────────────────────────────────────────────────────────────────────────────────
    imagen = raiz / "revision" / "_imagen.mp4"
    marca_render = raiz / "revision" / "huella.json"
    actual = huella(plan)
    hecho = json.loads(marca_render.read_text(encoding="utf-8")).get("huella") if marca_render.is_file() else None
    if not imagen.is_file() or hecho != actual:
        reloj.paso(f"render de {plan['duracion']:.1f} s a {plan['fps']} fps")
        correr("node", SKILL / "scripts" / "render.mjs", raiz, "--salida", "revision/_imagen.mp4")
        guardar(marca_render, {"huella": actual})
    else:
        reloj.paso("los cuadros de antes sirven: ni el plan ni el kit cambiaron")

    reloj.paso("imagen y sonido")
    salida = raiz / "out" / "motion-graphics.mp4"
    salida.parent.mkdir(parents=True, exist_ok=True)
    # `-t` con la imagen copiada deja los cuadros exactos; `apad` evita que un audio una pizca corto los recorte.
    correr("ffmpeg", "-nostdin", "-v", "error", "-y", "-i", imagen, "-i", mezcla, "-map", "0:v:0", "-map", "1:a:0",
           "-c:v", "copy", "-af", "apad", "-c:a", "aac", "-b:a", "192k", "-t", f"{plan['duracion']:.4f}",
           "-movflags", "+faststart", salida)

    # ── La portada ──────────────────────────────────────────────────────────────────────────────────────────────
    reloj.paso("portada")
    portada = raiz / "portada.png"
    ia = esperar_portada(raiz, proceso, desde, "la del propio estilo")
    if ia:
        portada.write_bytes(ia.read_bytes())
    else:
        correr("node", SKILL / "scripts" / "render.mjs", raiz, "--portada", "portada.png")
    if vertical:
        correr("node", BASE / "portada.mjs", salida, portada)

    if con_voz:
        reloj.paso(f"música a {plan['bpm']} BPM bajo la voz")
        import musica
        musica.poner(salida, Path(pista).resolve() if pista else None, 10, plan["bpm"])

    reloj.paso("comprobar y hoja")
    # Los cuadros que debe tener, contados como los cuenta render.mjs (Math.round de JavaScript, que en el .5 sube;
    # el round() de Python baja al par), más el de la portada en vertical. La duración se le pasa ya dividida entre
    # los fps para que comprobar.mjs vuelva al mismo entero.
    cuadros = math.floor(plan["duracion"] * plan["fps"] + 0.5) + (1 if vertical else 0)
    esperada = cuadros / plan["fps"]
    correr("node", BASE / "comprobar.mjs", salida, "--duracion", f"{esperada:.6f}",
           "--fps", str(plan["fps"]), "--tamano", f"{plan['ancho']}x{plan['alto']}")
    hoja(salida, raiz / "revision" / "hoja.png", cada=max(0.5, plan["compas"] / 2))
    reloj.listo(salida, [raiz / "revision" / "hoja.png", portada])


if __name__ == "__main__":
    main()
