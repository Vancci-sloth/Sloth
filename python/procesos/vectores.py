"""
Los vectores de la sección Ideas: cada video convertido en un vector de lo que dice (su título o descripción y su
transcripción), para agrupar los videos por tema, saber si lo que funciona en inglés ya existe en español y buscar
videos parecidos. Lo lanza `server/ideas/vectores.ts`.

El modelo es multilingual-e5-small (`E5`, 384 dimensiones, versión fijada): pone en el mismo sitio «faceless youtube
channel» y «canal sin mostrar la cara». A diferencia de los demás procesos, este **sí baja su modelo** la primera vez
(unos 490 MB, de Hugging Face, a `%APPDATA%/youtube/modelos/multilingual-e5-small-<versión>`); después ya no sale a
internet. Se usa con transformers, sin sentence-transformers (el Python de Sloth no lo tiene y no se le instala nada):
la media de los tokens y los prefijos que pide e5, «passage: » para lo que dice un video y «query: » para una búsqueda.

Dos modos, en `options.modo`:

- `vectorizar`: `files[0]` es un JSONL con `{"id", "texto"}` por línea. Escribe en `options.salida` sus vectores
  normalizados, en float32, una fila por línea y en el mismo orden. `options.tipo`: `passage` (por defecto) o `query`.
  Contesta `{"n", "dim", "modelo", "bajado"}` (`bajado`: segundos que tardó en bajar el modelo, si tuvo que bajarlo).
  Antes de bajarlo lo dice en una línea de la salida de errores (`BAJANDO`).
- `temas`: `files[0]` es un JSONL con `{"fila", "id", "cuenta", "idioma", "outlier", "x", "texto"}` por video y
  `files[1]`, el `.bin` de los vectores (`fila` es la suya ahí). Los agrupa y contesta un `Temas` (`shared/types.ts`).
  No usa el modelo. Agrupa con los vectores centrados por idioma (`centrar`), y en esa misma escala va la similitud de
  `enEspanol`: de 0,42 (`PARECIDO`) para arriba es el mismo asunto. No es la de `vectorizar`, que es el coseno tal cual.

Opciones: `modelos` (la carpeta de los modelos, `%APPDATA%/youtube/modelos`), en `vectorizar`.
"""

import json
import math
import os
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np

from interfaz import progress, run
from modelos_transcripcion import HuggingFaceModel

# Bajando el modelo, sin barras de avance en la salida de errores: su última línea es la que dice por qué falló.
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

E5 = HuggingFaceModel(
    name="multilingual-e5-small",
    repo="intfloat/multilingual-e5-small",
    revision="614241f622f53c4eeff9890bdc4f31cfecc418b3",
    files={
        "config.json": 655,
        "model.safetensors": 470641600,
        "special_tokens_map.json": 167,
        "tokenizer.json": 17082730,
        "tokenizer_config.json": 443,
    },
)
DIM = 384
# El nombre con que se guardan los vectores (`vectores.json`, `temas.json`): `MODELO` de vectores.ts dice el mismo.
MODELO = f"{E5.repo}@{E5.revision[:8]}"
# e5 lee hasta 512 tokens: un título largo y unas 400 palabras de transcripción caben casi enteros.
TOKENS = 512
# Lo que se dice en la salida de errores antes de bajar el modelo: vectores.ts lo enseña en un paso mientras baja.
BAJANDO = "Bajando el modelo de vectores"


def vectorize(files: list[str], options: dict) -> dict:
    import torch

    textos = [limpio(json.loads(linea)["texto"]) for linea in Path(files[0]).read_text(encoding="utf-8").splitlines() if linea.strip()]
    folder = Path(options["modelos"])
    bajado = None
    if not E5.installed(folder):
        inicio = time.time()
        print(f"{BAJANDO} (unos 490 MB): solo la primera vez.", file=sys.stderr, flush=True)
        try:
            E5.download(folder)
        except Exception as error:
            raise RuntimeError(f"No pude bajar el modelo de vectores ({E5.repo}, unos 490 MB): {error}") from error
        bajado = round(time.time() - inicio, 1)
    textos = [("query: " if options.get("tipo") == "query" else "passage: ") + t for t in textos]

    # Pocos textos (una búsqueda) van más rápido en el procesador que esperando a que despierte la tarjeta.
    if torch.cuda.is_available() and len(textos) > 64:
        try:
            vectores = encode(textos, E5.folder(folder), "cuda")
        except torch.cuda.OutOfMemoryError:
            # Whisper u otro proceso llenó la tarjeta: en el procesador tarda más, pero sale.
            torch.cuda.empty_cache()
            vectores = encode(textos, E5.folder(folder), "cpu")
    else:
        vectores = encode(textos, E5.folder(folder), "cpu")
    vectores.tofile(options["salida"])
    return {"n": len(textos), "dim": DIM, "modelo": MODELO, "bajado": bajado}


def encode(textos: list[str], carpeta: Path, device: str) -> np.ndarray:
    """Los vectores de e5: la media de sus tokens (sin el relleno), de largo 1."""
    import torch
    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(str(carpeta), local_files_only=True)
    model = AutoModel.from_pretrained(str(carpeta), local_files_only=True).to(device).eval()
    if device == "cuda":
        model = model.half()
    vectores = np.zeros((len(textos), DIM), dtype=np.float32)
    # De más corto a más largo: cada tanda se rellena hasta su texto más largo, y así casi no se rellena.
    orden = sorted(range(len(textos)), key=lambda i: len(textos[i]))
    tanda = 64 if device == "cuda" else 16
    with torch.inference_mode():
        for inicio in range(0, len(orden), tanda):
            filas = orden[inicio : inicio + tanda]
            lote = tokenizer([textos[i] for i in filas], max_length=TOKENS, padding=True, truncation=True, return_tensors="pt").to(device)
            ocultos = model(**lote).last_hidden_state.float()
            mascara = lote["attention_mask"].unsqueeze(-1).float()
            medias = (ocultos * mascara).sum(1) / mascara.sum(1).clamp(min=1e-9)
            vectores[filas] = torch.nn.functional.normalize(medias, dim=-1).cpu().numpy()
            progress((inicio + len(filas)) / len(orden))
    return vectores


def limpio(texto: str) -> str:
    """Sin medios emojis: una descripción cortada a mitad de uno deja un surrogate suelto, y el tokenizador no lo acepta."""
    return texto.encode("utf-8", "ignore").decode("utf-8")


# --- Los temas ---------------------------------------------------------------------------------------------------

# Las similitudes de aquí se miden con los vectores centrados por idioma (`centrar`), no con los de `vectorizar`.
#
# Un outlier y un video en español hablan de lo mismo desde esto. Medido en la investigación de un canal real (2026-10-11, solo
# descripciones): de 0,42 para arriba casi todos los pares son el mismo asunto («Turn Claude into your motion graphics
# editor» con «Claude Code ya puede ayudarte a crear y editar motion graphics», 0,62; «5 things to build with Claude» con
# «Cinco cosas que construiría en Claude», 0,43); por debajo entran los que solo comparten el formato. El ruido que queda
# es de textos que son casi solo hashtags, y sale a cualquier altura.
PARECIDO = 0.42
# Cuántos videos en español se guardan por outlier, y cuántos ejemplos por tema.
EN_ESPANOL = 3
EJEMPLOS = 5
# Un tema tiene al menos esto; lo que queda en grupos más chicos no es un tema, es ruido.
MIN_TEMA = 8
# Un grupo es un tema cuando sus videos se parecen a su centro, de media, al menos esto; si no, se parte en dos. En
# Un canal real (2.755 videos, solo descripciones): 0,35 daba 27 temas y mezclaba (Kling con Anthropic), 0,4 daba 61 y partía
# lo mismo en dos; 0,38 da 38.
COHERENCIA = 0.38
# Un idioma con menos videos que esto no tiene media propia que restar: se le resta la de todos.
MIN_IDIOMA = 30

VACIAS_ES = set(
    """
    a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bajo bien cada casi como con contra
    cual cuales cuando cuanto de del desde donde dos el ella ellas ello ellos en entre era eran eres es esa esas ese eso
    esos esta estaba estado estan estar estas este esto estos estoy fue fueron ha haber habia hace hacen hacer hacia han
    has hasta hay he la las le les lo los mas me mi mis mucho muchos muy nada ni no nos nosotros nuestra nuestro o os otra
    otras otro otros para pero poco por porque puede pueden puedes que quien se sea ser si sido sin sobre solo son su sus
    tal tambien te tener tengo ti tiene tienen todo todos tu tus un una unas uno unos usted ustedes va vamos van vez y ya
    yo eh ah oh ok q pq xq tb tmb jaja jajaja jajajaja aca alla esto asi mismo misma ademas cosa cosas aqui ahi dia dias
    hoy ver voy vas ir sea segun mientras cual luego entonces pues sino tan tanto tanta toda todas ese estas estes dice
    dijo digo decir hecho hizo hago hay ya quieres quiero quiere saber sabes sabe mejor mejores nuevo nueva primer
    primera parte tipo vida gente forma manera
    """.split()
)
# El ruido de las redes: está en todos los temas y no dice de qué habla ninguno.
VACIAS_REDES = set(
    """
    fyp fy fypシ foryou foryoupage parati paratii xyzbca viral virales viralvideo trending trend tiktok tiktoker reels
    reel instagram instagood explore explorepage explorar shorts youtube youtuber
    """.split()
)


def sin_acentos(palabra: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", palabra) if unicodedata.category(c) != "Mn")


def palabras(texto: str) -> list[str]:
    """
    Las palabras de un texto, en minúsculas: de tres letras o más, sin números sueltos ni enlaces, ni las que repiten una
    letra tres veces («paratiiiii»); de un hashtag, su palabra.
    """
    texto = re.sub(r"https?://\S+", " ", texto.lower())
    return [p for p in re.findall(r"[^\W\d_][\w']{2,}", texto) if not re.search(r"(.)\1\1", p)]


def topics(files: list[str], options: dict) -> dict:
    videos = [json.loads(linea) for linea in Path(files[0]).read_text(encoding="utf-8").splitlines() if linea.strip()]
    todos = np.fromfile(files[1], dtype=np.float32).reshape(-1, DIM)
    vectores = todos[[v["fila"] for v in videos]]
    if len(videos) < 2 * MIN_TEMA:
        return {"modelo": MODELO, "hecho": int(time.time() * 1000), "temas": [], "enEspanol": {}}
    vectores = centrar(vectores, [v.get("idioma") for v in videos])
    progress(0.1)

    grupos = agrupar(vectores)
    progress(0.6)
    temas = []
    for n, (grupo, nombre) in enumerate(zip(grupos, nombres(grupos, [v["texto"] for v in videos], [v["cuenta"] for v in videos]))):
        centro = vectores[grupo].mean(0)
        cerca = sorted(grupo, key=lambda i: -float(vectores[i] @ centro))[:EJEMPLOS]
        temas.append({"id": f"t{n + 1}", "nombre": nombre, "ids": [videos[i]["id"] for i in grupo], "ejemplos": [videos[i]["id"] for i in cerca]})
    progress(0.8)

    # Los outliers que no son en español, del de más × al de menos, con sus videos más parecidos en español. Sin ninguno
    # por encima de `PARECIDO`, la lista va vacía: eso aún no existe en español.
    espanol = [i for i, v in enumerate(videos) if v.get("idioma") == "es"]
    en_espanol: dict[str, list] = {}
    if espanol:
        de_espanol = vectores[espanol]
        otros = sorted(
            (i for i, v in enumerate(videos) if v.get("outlier") and v.get("idioma") and v["idioma"] != "es"),
            key=lambda i: -(videos[i].get("x") or 0),
        )
        for i in otros:
            similitud = de_espanol @ vectores[i]
            cerca = np.argsort(-similitud)[:EN_ESPANOL]
            en_espanol[videos[i]["id"]] = [[videos[espanol[j]]["id"], round(float(similitud[j]), 3)] for j in cerca if similitud[j] >= PARECIDO]
    progress(1)
    return {"modelo": MODELO, "hecho": int(time.time() * 1000), "temas": temas, "enEspanol": en_espanol}


def centrar(vectores: np.ndarray, idiomas: list[str | None]) -> np.ndarray:
    """
    Los vectores sin lo que solo dice su idioma. En e5, dos textos cortos en español se parecen más entre sí que a uno en
    inglés del mismo asunto: sin centrar, los temas salían por idioma («todo lo de IA en español» en un solo tema de 900)
    y lo parecido en español de un outlier en inglés compartía el formato, no el asunto. Restar a cada video la media de
    su idioma deja lo que dice, y el mismo asunto se junta en los dos idiomas. Lo que no tiene idioma cuenta como uno más.
    """
    general = vectores.mean(0)
    centrados = vectores.copy()
    for idioma in set(idiomas):
        filas = [i for i, x in enumerate(idiomas) if x == idioma]
        centrados[filas] -= vectores[filas].mean(0) if len(filas) >= MIN_IDIOMA else general
    return centrados / np.clip(np.linalg.norm(centrados, axis=1, keepdims=True), 1e-9, None)


def agrupar(vectores: np.ndarray, coherencia: float = COHERENCIA) -> list[list[int]]:
    """
    Los temas, del más grande al más chico: cuántos hay lo deciden los datos. Se arma el árbol de Ward (cada paso junta
    los dos grupos que menos se dispersan al juntarse) y se baja desde la raíz: un grupo se parte en sus dos ramas
    mientras sus videos no se parezcan lo bastante (`coherencia`) y le queden al menos dos temas dentro. Las ramas de
    menos de `MIN_TEMA` videos no son un tema: esos videos se quedan sin tema.
    """
    from sklearn.cluster import AgglomerativeClustering

    n = len(vectores)
    arbol = AgglomerativeClustering(n_clusters=1, linkage="ward", compute_full_tree=True).fit(vectores).children_
    # Los videos de cada nodo del árbol: las hojas son los videos y el nodo n + k es la fusión k.
    hojas: list[list[int]] = [[i] for i in range(n)]
    for a, b in arbol:
        hojas.append(hojas[a] + hojas[b])
    temas = []
    pendientes = [len(hojas) - 1]
    while pendientes:
        nodo = pendientes.pop()
        grupo = hojas[nodo]
        if len(grupo) < MIN_TEMA:
            continue
        # Con vectores de largo 1, la similitud media con el centro es el largo de su media.
        if len(grupo) < 2 * MIN_TEMA or float(np.linalg.norm(vectores[grupo].mean(0))) >= coherencia:
            temas.append(grupo)
        else:
            pendientes.extend(arbol[nodo - n])
    return sorted(temas, key=len, reverse=True)


def nombres(grupos: list[list[int]], textos: list[str], cuentas: list[str]) -> list[str]:
    """
    El nombre de cada grupo: sus tres palabras más distintivas (c-TF-IDF), sin palabras vacías. Cuenta en cuántos de sus
    videos sale cada una, no cuántas veces: así un texto largo que repite una palabra no se adueña del tema. Y, si las hay,
    solo las que usan dos cuentas o más: la marca que una cuenta pone en todos sus videos (#duodedos) no nombra un tema.
    """
    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

    vacias = VACIAS_ES | VACIAS_REDES | {sin_acentos(p) for p in ENGLISH_STOP_WORDS}
    # Se cuenta sin acentos («codigo» y «código» son la misma) y se enseña la forma más usada.
    formas: dict[str, Counter] = {}
    por_grupo: list[Counter] = []
    de_cuentas: list[dict[str, set]] = []
    for grupo in grupos:
        cuenta: Counter = Counter()
        quienes: dict[str, set] = {}
        for i in grupo:
            claves = set()
            for p in palabras(textos[i]):
                clave = sin_acentos(p)
                if clave not in vacias:
                    formas.setdefault(clave, Counter())[p] += 1
                    claves.add(clave)
                    quienes.setdefault(clave, set()).add(cuentas[i])
            cuenta.update(claves)
        por_grupo.append(cuenta)
        de_cuentas.append(quienes)
    total: Counter = Counter()
    for cuenta in por_grupo:
        total.update(cuenta)
    promedio = sum(len(g) for g in grupos) / len(grupos)
    salida = []
    for grupo, cuenta, quienes in zip(grupos, por_grupo, de_cuentas):
        # Una palabra de un solo video no nombra un tema.
        candidatas = [p for p, c in cuenta.items() if c >= 2]
        compartidas = [p for p in candidatas if len(quienes[p]) > 1]
        peso = {p: (cuenta[p] / len(grupo)) * math.log(1 + promedio / total[p]) for p in compartidas or candidatas}
        mejores = sorted(peso, key=lambda p: -peso[p])[:3]
        salida.append(" · ".join(formas[p].most_common(1)[0][0] for p in mejores) or "(sin palabras)")
    return salida


def process(files: list[str], options: dict) -> dict:
    modo = options.get("modo")
    if modo == "vectorizar":
        return vectorize(files, options)
    if modo == "temas":
        return topics(files, options)
    raise ValueError(f"No hay ningún modo «{modo}».")


if __name__ == "__main__":
    run(process)
