"""Valida el reloj del director HTML: palabras narradas o montaje musical sin voz."""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'video-base' / 'scripts'))
from momentos import anclar, palabras_de


def numero(valor):
    return isinstance(valor, (int, float)) and not isinstance(valor, bool) and math.isfinite(valor)


def validar(datos, guion):
    errores = []
    modo = datos.get('sonido', 'narracion')
    if modo not in ('narracion', 'musica'):
        errores.append('sonido debe ser narracion o musica')
    momentos = datos.get('momentos', [])
    if not isinstance(momentos, list) or not momentos:
        return ['falta una lista de momentos']
    duracion = datos.get('duracion')
    if not numero(duracion) or duracion <= 0:
        return ['duracion debe ser un número positivo y finito']
    if modo == 'musica' and not datos.get('audio'):
        errores.append('sin narración, indica audio con la música o mezcla final')
    anterior = -1
    for i, momento in enumerate(momentos):
        if not isinstance(momento, dict):
            errores.append(f'momento {i+1}: debe ser un objeto')
            continue
        segundo = momento.get('segundo')
        if not numero(segundo) or not 0 <= segundo < duracion:
            errores.append(f'momento {i+1}: segundo fuera de la duración')
        elif segundo <= anterior:
            errores.append(f'momento {i+1}: segundos fuera de orden')
        else:
            anterior = segundo
        if modo == 'musica' and not str(momento.get('detalle', '')).strip():
            errores.append(f'momento {i+1}: describe la acción visual en detalle')
    if modo == 'narracion' and all(isinstance(m, dict) for m in momentos):
        _, anclas = anclar(momentos, palabras_de(guion), 'el guion')
        errores.extend(anclas)
    return errores
