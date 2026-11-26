"""
Lo que no se puede mirar en una hoja de cuadros: que el plan salga bien. Sin voz de verdad y sin render.

    python -B -X utf8 <skill>/scripts/test_plan.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from hacer import plan_de  # noqa: E402

fallos = []


def igual(que, a, b):
    if a != b:
        fallos.append(f"{que}: {a!r} ≠ {b!r}")


def sin_errores(que, errores):
    if errores:
        fallos.append(f"{que}: {errores}")


BASE = {"formato": "vertical", "marca": "VyMotion",
        "momentos": [{"plano": "destello"}, {"plano": "titular", "texto": "Hola"},
                     {"plano": "formas", "figuras": ["circulo", "play"]}, {"plano": "cierre"}]}

# ── Sin voz: cada plano dura sus compases y el video es la suma.
plan, errores = plan_de(BASE)
sin_errores("sin voz", errores)
igual("duración", plan["duracion"], 7.5)
igual("inicios", [e["desde"] for e in plan["escenas"]], [0.0, 1.875, 3.75, 5.625])
igual("compás", round(plan["compas"], 4), 1.875)

# ── Dos planos seguidos nunca llevan el mismo fondo.
fondos = [e["base"] for e in plan["escenas"]]
if any(a == b for a, b in zip(fondos, fondos[1:])):
    fallos.append(f"fondos repetidos: {fondos}")

# ── Con voz: cada plano entra en su palabra, pegado a la corchea (0,234 s a 128 BPM).
GUION = "# T\n\nUno dos tres cuatro cinco seis siete ocho nueve diez."
con_voz = {**BASE, "voz": True, "momentos": [
    {"plano": "destello", "palabra": "Uno"},
    {"plano": "titular", "texto": "Hola", "palabra": "tres"},
    {"plano": "formas", "figuras": ["circulo", "play"], "palabra": "seis"},
    {"plano": "cierre", "palabra": "nueve"}]}
# Palabras dichas en segundos cualesquiera: el plan las pega a la corchea más cercana.
tiempos = [0.0, 1.30, 3.10, 5.02]
plan2, errores2 = plan_de(con_voz, GUION, (tiempos, 6.4))
sin_errores("con voz", errores2)
corchea = plan2["pulso"] / 2
for e in plan2["escenas"]:
    if abs(e["desde"] - round(e["desde"] / corchea) * corchea) > 1e-3:
        fallos.append(f"el plano en {e['desde']} no cae en la corchea")
igual("inicios con voz", [e["desde"] for e in plan2["escenas"]], [0.0, 1.4062, 3.0469, 4.9219])
# El video termina en un compás entero después de la última palabra.
igual("duración con voz", plan2["duracion"], 7.5)

# ── Con voz, «compases» no manda: lo dice en vez de usarlo.
_, errores3 = plan_de({**con_voz, "momentos": [{**con_voz["momentos"][0], "compases": 2}, *con_voz["momentos"][1:]]},
                      GUION, (tiempos, 6.4))
if not any("compases" in x for x in errores3):
    fallos.append("con voz, «compases» debería avisar")

# ── Una palabra que no está en el guion se dice, no se traga.
_, errores4 = plan_de({**con_voz, "momentos": [{**con_voz["momentos"][0], "palabra": "zanahoria"}, *con_voz["momentos"][1:]]}, GUION)
if not errores4:
    fallos.append("una palabra fuera del guion debería fallar")

# ── El clip que sigue del plano anterior conserva su «sigue» en el plan y llega así al pedido.
#    (Se llamaba «desde» y el plan lo pisaba con el segundo de inicio: el clip nunca recibía su primer cuadro.)
import material  # noqa: E402

CON_CLIP = {**BASE, "momentos": [BASE["momentos"][0],
                                 {"plano": "clip", "pide": "a cat", "sigue": True, "compases": 2},
                                 BASE["momentos"][1], BASE["momentos"][-1]]}
plan3, errores6 = plan_de(CON_CLIP)
sin_errores("con clip", errores6)
igual("el plan conserva «sigue»", plan3["escenas"][1].get("sigue"), True)
igual("y «desde» sigue siendo el segundo", plan3["escenas"][1]["desde"], 1.875)
pedidos = material.pedidos_de(plan3, "Nano Banana 2.1", "Veo 3.1 - Lite", "")
igual("el pedido lo lleva", [p["sigue"] for p in pedidos if p["tipo"] == "video"], [True])

# ── El nombre viejo se dice, no se traga en silencio.
_, errores7 = plan_de({**CON_CLIP, "momentos": [CON_CLIP["momentos"][0],
                                                {"plano": "clip", "pide": "a cat", "desde": "plano", "compases": 2},
                                                *CON_CLIP["momentos"][2:]]})
if not any("sigue" in x for x in errores7):
    fallos.append("un «desde» viejo debería avisar que ahora es «sigue»")

# ── El último plano es el cierre.
_, errores5 = plan_de({**BASE, "momentos": BASE["momentos"][:-1] + [{"plano": "titular", "texto": "Fin"}]})
if not any("cierre" in x for x in errores5):
    fallos.append("el último plano debería tener que ser «cierre»")

if fallos:
    sys.exit("✗ " + "\n✗ ".join(fallos))
print("✓ el plan: rejilla, fondos alternados, voz pegada a la corchea y los avisos")
