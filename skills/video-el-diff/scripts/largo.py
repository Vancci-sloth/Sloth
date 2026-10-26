"""
Cuánto dura el guion leído en voz alta (`guion.md`, o `fuentes/borrador.md` mientras no se entrega): las palabras de
lo que se narra (desde el primer `##`, o todo si no tiene; sin los encabezados), a las 3 por segundo con que lee el
usuario. Se corre en la raíz del episodio.

    python <skill>/scripts/largo.py [minutos]

Con los minutos que pidió el usuario (la línea `Duración:` del mensaje), dice si el guion se pasa o se queda corto más
de un 10 % y sale con error. En el lote del 7 de octubre los guiones pedían 1,100 palabras y salieron de 1,225 a 1,379.
"""

import sys
from pathlib import Path

from quitar_titulos import parrafos

sys.stdout.reconfigure(encoding="utf-8")
POR_MINUTO = 180  # 3 palabras por segundo
MARGEN = 0.10


def main() -> None:
    guion = Path.cwd() / "guion.md"
    if not guion.exists():
        guion = Path.cwd() / "fuentes" / "borrador.md"
    palabras = sum(len(p.split()) for p in parrafos(guion))
    minutos = palabras / POR_MINUTO
    print(f"{guion.name}: {palabras} palabras, unos {minutos * 60:.0f} s ({minutos:.1f} min) leído")
    if len(sys.argv) < 2:
        return
    pedido = float(sys.argv[1])
    objetivo = pedido * POR_MINUTO
    if abs(palabras - objetivo) > objetivo * MARGEN:
        sobra = palabras - objetivo
        sys.exit(f"Se pidieron {pedido:g} min (unas {objetivo:.0f} palabras): {'sobran' if sobra > 0 else 'faltan'} "
                 f"{abs(sobra):.0f}. {'Corta lo que no alimenta el SMP' if sobra > 0 else 'Agrega datos o remates'} hasta quedar a ±10 %.")
    print(f"Dentro del ±10 % de los {pedido:g} min pedidos.")


if __name__ == "__main__":
    main()
