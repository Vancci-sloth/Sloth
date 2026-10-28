"""
Pasa un logo SVG a PNG transparente, a `alto` px, para usarlo como recorte. Con Playwright sobre Edge.

    python svg_png.py <svg> <png> [alto=900]

Abre un HTML junto al SVG y espera a que la imagen cargue: desde `about:blank` (set_content) Edge no carga archivos
locales y sale el ícono de imagen rota (así salió invisible la estrella de Gemini en un borrador).
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

from comun import navegador

if len(sys.argv) < 3:
    sys.exit(__doc__)
svg, png = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
alto = int(sys.argv[3]) if len(sys.argv) > 3 else 900
html = svg.with_suffix(".tmp.html")
html.write_text(f'<html><body style="margin:0;background:transparent"><img id="i" src="{svg.name}" style="height:{alto}px;display:block"></body></html>', encoding="utf8")
try:
    with sync_playwright() as p:
        b = navegador(p, headless=True)
        pg = b.new_page(viewport={"width": 2400, "height": alto + 40})
        pg.goto(html.as_uri())
        pg.wait_for_function("document.getElementById('i').complete && document.getElementById('i').naturalWidth > 0")
        pg.locator("#i").screenshot(path=str(png), omit_background=True)
        b.close()
finally:
    html.unlink()
print(png)
