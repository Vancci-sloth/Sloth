"""Render de Pulso visual desde guion.md, momentos.json y fuentes/voz/original.wav."""
import argparse
import json
import shutil
import subprocess
import sys
import math
import struct
import wave
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL.parent / 'video-base' / 'scripts'))
from momentos import anclar, palabras_de, parar, guardar, Reloj

parser = argparse.ArgumentParser()
parser.add_argument('--revisa', action='store_true')
args = parser.parse_args()
raiz = Path.cwd()
guion = (raiz / 'guion.md').read_text(encoding='utf-8')
datos = json.loads((raiz / 'momentos.json').read_text(encoding='utf-8'))
momentos = datos.get('momentos', [])
_, errores = anclar(momentos, palabras_de(guion), 'el guion')
if not momentos: errores.append('falta al menos un momento')
if datos.get('formato') not in ('vertical', 'horizontal'): errores.append('formato debe ser vertical u horizontal')
if datos.get('estilo') == 'producto-ia':
    if datos.get('duracion', 0) <= 0: errores.append('duracion debe ser positiva')
    for i, m in enumerate(momentos):
        if m.get('estado') not in ('titular', 'consulta', 'respuesta', 'opciones', 'cierre'): errores.append(f'momento {i+1}: estado no disponible para producto-ia')
        if len(str(m.get('titulo', ''))) > 60 or len(str(m.get('detalle', ''))) > 85: errores.append(f'momento {i+1}: acorta el título a 60 y el detalle a 85 caracteres')
        if m.get('estado') in ('respuesta','opciones'):
            tarjetas=m.get('tarjetas')
            if not isinstance(tarjetas,list) or not 1<=len(tarjetas)<=3 or not all(isinstance(x,str) and 0<len(x)<=32 for x in tarjetas): errores.append(f'momento {i+1}: pon de una a tres tarjetas de hasta 32 caracteres')
        if i+1<len(momentos) and momentos[i+1].get('segundo',0)-m.get('segundo',0)<1.5: errores.append(f'momento {i+1}: deja al menos 1,5 segundos para leer')
    if momentos and momentos[0].get('segundo') != 0: errores.append('el primer momento debe comenzar en cero')
    if momentos and datos.get('duracion',0)-momentos[-1].get('segundo',0)<1.5: errores.append('deja al menos 1,5 segundos para el cierre')
    if datos.get('clip') and not (raiz / datos['clip']).is_file(): errores.append('no existe el clip indicado')
if datos.get('estilo') in ('flujo', 'anuncio'):
    estados = [m.get('estado') for m in momentos]
    if estados != ['idea', 'guion', 'linea', 'final']: errores.append('flujo requiere idea, guion, linea y final, en ese orden')
    if momentos and datos.get('duracion', 0) < momentos[-1].get('segundo', 0) + 4: errores.append('flujo necesita al menos cuatro segundos desde el momento final para mostrar el clip')
    if datos.get('clipInicio', 0) < 0: errores.append('clipInicio no puede ser negativo')
    if not datos.get('clip'): errores.append('flujo requiere clip con una ruta de video relativa al proyecto')
    elif not (raiz / datos['clip']).is_file(): errores.append('no existe el clip indicado')
for i, m in enumerate(momentos):
    if m.get('estado') not in ('idea', 'guion', 'linea', 'final', 'invitacion', 'participantes', 'cola', 'onda', 'titular', 'consulta', 'respuesta', 'opciones', 'cierre'): errores.append(f'momento {i+1}: estado inválido')
    if m.get('estado') in ('participantes', 'cola'):
        tarjetas = m.get('tarjetas')
        if not isinstance(tarjetas, list) or not 1 <= len(tarjetas) <= 3 or not all(isinstance(t, str) and 0 < len(t.strip()) <= 40 for t in tarjetas):
            errores.append(f'momento {i+1}: indica de una a tres tarjetas de hasta 40 caracteres')
    if not all(k in m for k in ('segundo', 'titulo', 'detalle')): errores.append(f'momento {i+1}: faltan segundo, titulo o detalle')
    if i and m.get('segundo', -1) <= momentos[i-1].get('segundo', -1): errores.append(f'momento {i+1}: segundos fuera de orden')
parar(errores)
if args.revisa:
    print('✓ momentos y guion válidos')
    sys.exit(0)
voz = raiz / 'fuentes' / 'voz' / 'original.wav'
if not voz.is_file(): sys.exit('✗ Falta fuentes/voz/original.wav')
plantilla = SKILL / 'plantilla'
if not (plantilla / 'node_modules' / 'remotion').exists(): sys.exit('✗ Faltan los paquetes de la plantilla de Pulso visual.')
reloj = Reloj(raiz)
reloj.paso('preparando voz y composición')
public = plantilla / 'public'
public.mkdir(exist_ok=True)
audio = 'voz-' + str(__import__('os').getpid()) + '.wav'
shutil.copy2(voz, public / audio)
datos['voz'] = audio
clip = None
if datos.get('clip'):
    origen_clip = raiz / datos['clip']
    clip = 'clip-' + str(__import__('os').getpid()) + origen_clip.suffix
    shutil.copy2(origen_clip, public / clip)
    datos['clip'] = clip
revision = raiz / 'revision'
revision.mkdir(exist_ok=True)
props = revision / 'props.json'
guardar(props, datos)
salida = raiz / 'out' / 'pulso-visual.mp4'
salida.parent.mkdir(exist_ok=True)
try:
    reloj.paso('renderizando')
    cli = plantilla / 'node_modules' / '@remotion' / 'cli' / 'remotion-cli.js'
    subprocess.run(['node', str(cli), 'render', 'src/index.tsx', 'Pulso', str(salida), '--props', str(props), '--concurrency=2', '--pixel-format=yuv420p', '--color-space=bt709'], cwd=plantilla, check=True)
    reloj.paso('acentos sonoros y portada')
    efecto = revision / 'acentos.wav'
    frecuencia = 48000
    puntos = [float(m['segundo']) for m in momentos[1:]]
    with wave.open(str(efecto), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(frecuencia)
        muestras = bytearray(int(float(datos['duracion']) * frecuencia) * 2)
        for punto in puntos:
            for n in range(int(.12 * frecuencia)):
                pos = int(punto * frecuencia) + n
                if 2 * pos + 2 > len(muestras): break
                amplitud = int(1600 * math.sin(2 * math.pi * (650 + n / 80) * n / frecuencia) * math.exp(-n / (frecuencia * .025)))
                struct.pack_into('<h', muestras, pos * 2, amplitud)
        w.writeframes(muestras)
    mezclado = salida.with_name('_mezcla.mp4')
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(salida),'-i',str(efecto),'-filter_complex','[0:a][1:a]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1:LRA=11[a]','-map','0:v','-map','[a]','-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-movflags','+faststart',str(mezclado)], check=True)
    mezclado.replace(salida)
    base = SKILL.parent / 'video-base' / 'scripts'
    portada = raiz / 'portada.png'
    fondo = salida
    if datos.get('estilo') == 'producto-ia':
        fondo = revision / 'fondo-portada.png'
        dimensiones = '1280x720' if datos['formato'] == 'horizontal' else '1080x1920'
        subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',f'color=c=0x292447:s={dimensiones}','-frames:v','1',str(fondo)],check=True)
    cmd = ['node',str(base / 'portada_sin_ia.mjs'),str(fondo),str(portada),'--titulo',datos.get('portada',momentos[0]['titulo']),'--t','1']
    if datos['formato'] == 'horizontal': cmd.append('--horizontal')
    subprocess.run(cmd, check=True)
    if datos['formato'] == 'vertical': subprocess.run(['node',str(base / 'portada.mjs'),str(salida),str(portada)],check=True)
    reloj.paso('hoja de revisión')
    subprocess.run(['node', str(SKILL.parent / 'video-base' / 'scripts' / 'hoja.mjs'), str(salida), str(revision / 'hoja.png'), '--cada', '1.5'], check=True)
    reloj.listo(salida, [revision / 'hoja.png'])
finally:
    (public / audio).unlink(missing_ok=True)
    if clip: (public / clip).unlink(missing_ok=True)
