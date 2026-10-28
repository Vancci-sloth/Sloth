"""
Baja emojis 3D de Microsoft Fluent (licencia MIT; se parecen a los de Apple del reel original) a public/img/.

    python emoji.py "Flexed biceps" "Fountain" "Crab" ...

El nombre es la carpeta del repo microsoft/fluentui-emoji (en inglés, como el nombre Unicode). Los que tienen tono de
piel van en `Default`. Guarda public/img/e_<nombre-en-minúsculas-con-guiones-bajos>.png.
"""

import subprocess
import sys
from urllib.parse import quote

from comun import PROYECTO

BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets"


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    destino = PROYECTO / "public" / "img"
    destino.mkdir(parents=True, exist_ok=True)
    for nombre in sys.argv[1:]:
        archivo = nombre.lower().replace(" ", "_").replace("-", "_")
        salida = destino / f"e_{archivo}.png"
        for url in (f"{BASE}/{quote(nombre)}/3D/{archivo}_3d.png", f"{BASE}/{quote(nombre)}/Default/3D/{archivo}_3d_default.png"):
            if subprocess.run(["curl", "-sfL", "-o", str(salida), url]).returncode == 0:
                print(f"ok {salida.name}")
                break
        else:
            print(f"no encontré '{nombre}': busca el nombre exacto en https://github.com/microsoft/fluentui-emoji/tree/main/assets")


main()
