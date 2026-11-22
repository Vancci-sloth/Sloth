"""Director de Motion Graphics: composición HTML a medida o plantillas Remotion."""
import argparse
import json
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
BASE = SKILL.parent / 'video-base' / 'scripts'
sys.path.insert(0, str(BASE))
from momentos import parar, Reloj
from tiempos import validar

parser = argparse.ArgumentParser()
parser.add_argument('--revisa', action='store_true')
args = parser.parse_args()
raiz = Path.cwd().resolve()
datos = json.loads((raiz / 'momentos.json').read_text(encoding='utf-8'))

if datos.get('motor') != 'html':
    comando = [sys.executable, '-B', '-X', 'utf8', str(SKILL / 'scripts' / 'remotion.py')]
    if args.revisa:
        comando.append('--revisa')
    sys.exit(subprocess.run(comando, check=False).returncode)

guion = (raiz / 'guion.md').read_text(encoding='utf-8')
momentos = datos.get('momentos', [])
errores = validar(datos, guion)
if datos.get('formato') not in ('vertical', 'horizontal'):
    errores.append('formato debe ser vertical u horizontal')
parar(errores)

def local(nombre):
    ruta = (raiz / nombre).resolve()
    if not ruta.is_relative_to(raiz):
        raise ValueError('Los archivos del video deben estar dentro de su carpeta')
    return ruta

html = local(datos.get('composicion', 'composicion/index.html'))
audio = local(datos.get('audio', 'fuentes/voz/original.wav'))
if not html.is_file():
    errores.append('falta la composición HTML')
if not audio.is_file():
    errores.append('falta el audio indicado en momentos.json')
else:
    prueba = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
        'format=duration:stream=codec_type', '-of', 'json', str(audio)],
        capture_output=True, text=True, check=True)
    info = json.loads(prueba.stdout)
    if not any(s.get('codec_type') == 'audio' for s in info.get('streams', [])):
        errores.append('el archivo de audio no contiene una pista de sonido')
    if float(info.get('format', {}).get('duration', 0)) + 0.05 < datos['duracion']:
        errores.append('la mezcla es más corta que el video: prepara su cierre antes de renderizar')
parar(errores)
herramientas = SKILL / 'referencias' / 'motion-agent' / 'tools'

def ejecutar(*comando):
    subprocess.run(list(map(str, comando)), check=True)

ejecutar('node', herramientas / 'lint.mjs', html)
ejecutar('node', SKILL / 'scripts' / 'comprobar-html.mjs', html, raiz / 'momentos.json')
ejecutar('node', herramientas / 'qa.mjs', html, '--samples', '32')
if args.revisa:
    print('✓ guion, momentos y composición comprobados')
    sys.exit(0)
if not audio.is_file():
    sys.exit('Falta el audio indicado en momentos.json')
reloj = Reloj(raiz)
salida = raiz / 'out' / 'motion-graphics.mp4'
salida.parent.mkdir(exist_ok=True)
reloj.paso('renderizando composición HTML')
ejecutar('node', herramientas / 'render.mjs', html, '--out', salida, '--audio', audio)
ejecutar('node', herramientas / 'qa.mjs', html, '--video', salida)
portada = raiz / 'portada.png'
comando = ['node', BASE / 'portada_sin_ia.mjs', salida, portada, '--titulo', datos.get('portada', momentos[0].get('titulo', 'Motion Graphics')), '--t', '1']
if datos['formato'] == 'horizontal':
    comando.append('--horizontal')
ejecutar(*comando)
if datos['formato'] == 'vertical':
    ejecutar('node', BASE / 'portada.mjs', salida, portada)
revision = raiz / 'revision'
revision.mkdir(exist_ok=True)
ejecutar('node', BASE / 'hoja.mjs', salida, revision / 'hoja.png', '--cada', '1.5')
reloj.listo(salida, [portada, revision / 'hoja.png'])
