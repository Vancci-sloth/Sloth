"""Contrato público: modelos sin iconos no requieren Phosphor; pedir un icono sí."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("modelos.py")
SALIDA = 'pieza: import { Pieza } from "../modelos/pieza";\n'


class ModelosCLI(unittest.TestCase):
    def setUp(self):
        temporal = tempfile.TemporaryDirectory()
        self.addCleanup(temporal.cleanup)
        self.raiz = Path(temporal.name)
        self.biblioteca = self.raiz / "biblioteca"
        scripts = self.biblioteca / "scripts"
        scripts.mkdir(parents=True)
        self.script = scripts / "modelos.py"
        self.script.write_bytes(SCRIPT.read_bytes())
        (self.biblioteca / "categorias.json").write_text('[{"nombre":"Objetos"}]', encoding="utf-8")
        (self.biblioteca / "comun.tsx").write_text("// común de prueba\n", encoding="utf-8")
        self.modelo = self.biblioteca / "modelos" / "pieza"
        self.modelo.mkdir(parents=True)
        self.ficha([])
        (self.modelo / "pieza.tsx").write_text("export const Pieza = () => null;\n", encoding="utf-8")
        self.proyecto = self.raiz / "video"
        self.proyecto.mkdir()
        (self.proyecto / "package.json").write_text('{}', encoding="utf-8")

    def ficha(self, iconos):
        (self.modelo / "modelo.json").write_text(
            json.dumps({"usa": [], "iconos": iconos, "exporta": ["Pieza"]}), encoding="utf-8")

    def ejecutar(self, *args):
        return subprocess.run(
            [sys.executable, "-B", "-X", "utf8", str(self.script), *args],
            cwd=self.proyecto, capture_output=True, text=True, encoding="utf-8")

    def test_usar_sin_iconos(self):
        archivos = self.modelo / "archivos"
        archivos.mkdir()
        (archivos / "geometria.bin").write_bytes(b"geometria de prueba")
        r = self.ejecutar("usar", "pieza")
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, SALIDA, ""))
        for nombre in ("pieza.tsx", "comun.tsx"):
            origen = self.modelo if nombre == "pieza.tsx" else self.biblioteca
            self.assertEqual((self.proyecto / "src/modelos" / nombre).read_bytes(), (origen / nombre).read_bytes())
        self.assertEqual((self.proyecto / "public/modelos/pieza/geometria.bin").read_bytes(), (archivos / "geometria.bin").read_bytes())
        self.assertFalse((self.proyecto / "public/iconos").exists())

    def test_iconos_sin_phosphor_no_cambia_archivos(self):
        antes = {str(p.relative_to(self.raiz)): p.read_bytes() for p in self.raiz.rglob("*") if p.is_file()}
        r = self.ejecutar("iconos", "heart")
        self.assertEqual((r.returncode, r.stdout, r.stderr), (
            1, "", "No está @phosphor-icons/core en node_modules: npm i @phosphor-icons/core\n"))
        self.assertEqual(antes, {str(p.relative_to(self.raiz)): p.read_bytes() for p in self.raiz.rglob("*") if p.is_file()})

    def test_usar_con_iconos_sigue_copiando_svg(self):
        self.ficha(["heart"])
        assets = self.proyecto / "node_modules/@phosphor-icons/core/assets/fill"
        assets.mkdir(parents=True)
        (assets / "heart-fill.svg").write_text('<svg fill="currentColor"><path/></svg>', encoding="utf-8")
        r = self.ejecutar("usar", "pieza")
        self.assertEqual((r.returncode, r.stdout, r.stderr), (0, SALIDA, ""))
        self.assertEqual((self.proyecto / "public/iconos/heart.svg").read_text(encoding="utf-8"), '<svg><path/></svg>')


if __name__ == "__main__":
    unittest.main()
