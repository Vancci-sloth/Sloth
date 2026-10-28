"""
Captura una página real (una nota, un anuncio) con Playwright sobre Edge, quitando banners y ventanas emergentes.

    python captura.py <url> <salida.png> [ancho=520]

Toma la página completa a escala 3 y quita todo lo `position: fixed/sticky`, los iframes y los anuncios. Para
recortar después, ubica las frases con el OCR de El Diff (lee imágenes de hasta unos 3000 px de alto; parte las más
altas en tramos): `python <skills>/video-el-diff/plantilla/ubicar.py <png> ["frase"]`, con `<skills>` la carpeta de
las skills (la de esta, `SLOTH_SKILLS`).

Úsalo cuando `pagina.mjs` de El Diff se cuelga: pasa con las páginas que nunca terminan de cargar,
como The Star. Ojo con los selectores: `[class*="ad"]` también atrapa "headline" y "header", y borró el titular.
"""

import sys

from playwright.sync_api import sync_playwright

from comun import navegador

LIMPIAR = """() => {
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    if (s.position === 'fixed' || s.position === 'sticky') el.remove();
  }
  for (const sel of ['iframe', '[id^="div-gpt"]', '[class*="advert"]', '[class*="popup"]', '[class*="modal"]', 'aside']) {
    document.querySelectorAll(sel).forEach(e => { if (!e.querySelector('h1')) e.style.display = 'none'; });
  }
  document.body.style.overflow = 'auto';
  window.scrollTo(0, 0);
}"""


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    url, salida = sys.argv[1], sys.argv[2]
    ancho = int(sys.argv[3]) if len(sys.argv) > 3 else 520
    with sync_playwright() as p:
        b = navegador(p, headless=True)
        pg = b.new_page(viewport={"width": ancho, "height": 1400}, device_scale_factor=3,
                        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                                   "Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0")
        pg.goto(url, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(5000)
        pg.evaluate(LIMPIAR)
        pg.wait_for_timeout(800)
        pg.screenshot(path=salida, full_page=True)
        b.close()
    print(salida)


main()
