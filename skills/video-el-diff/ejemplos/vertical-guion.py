"""
Lo que se escribe en guion.py, en vertical: el arranque y el cierre del episodio de una herramienta de IA, la
skill de Ana que dibuja una máquina descrita en una línea. Va debajo de las funciones de la plantilla, en lugar de su
`parrafos` de ejemplo: el `GANCHO`, las constantes del material y los párrafos. Enseña la placa de un nombre, la
traducción de lo resaltado, la toma que sigue (`sigue`), el 👉 (`senal`), la cifra en una banda, el recorte con su
placa, las secciones que escriben otros agentes (`bloque`) y el cierre con la marca (`MARCA`).
"""

GANCHO = "UNA LÍNEA,\nCATORCE HORAS"

# Las fuentes que se leen bajo cada captura, y el material, con lo que cita.
F_X = "x.com/dev_ejemplo · 10 oct 2026"
F_GH = "github.com/dev_ejemplo"
F_YT = "YouTube · Canal Ejemplo · 21 oct 2026"
LEO = "Leo · Canal Ejemplo · YouTube"
LANZA_MP4 = "videos/lanzamiento.mp4"  # el video del post, recodificado
X_LANZA = "web/x-lanzamiento.png"  # el post: «Describe a machine in one line. Claude brings it to life.»
GH_DEV = "web/gh-dev.png"  # su bio: «self-proclaimed misfit»
VISTAS = "web/tema-vistas.png"  # un cuadro del video del tema, con el contador de vistas
INVENTED = "web/tema-invented.png"  # otro cuadro: «Invented»

parrafos = [
    ("arranque", [
        # Un clip con la fecha en su palabra. `encuadre="ajusta"`: el cuadro entero a lo ancho de la zona.
        ("El sábado 10 de octubre,",
         clip(0.3, src=LANZA_MP4, seccion=True, encuadre="ajusta", encima=[rotulo("SÁB 10 OCT", en="sabado", y=0.82)])),
        # La placa con el nombre de alguien que el público no reconoce.
        ("un desarrollador llamado Ana,",
         cap(GH_DEV, fuente=F_GH, encima=[rotulo("@DEV_EJEMPLO", en="ana", estilo="placa", y=0.85, tam=64)])),
        # La misma captura en la misma toma: resalta lo que cita la voz y lo traduce en su lugar.
        ("que en GitHub se describe como un inadaptado autoproclamado,",
         cap(GH_DEV, sigue=True,
             marcas=[*marca_texto(GH_DEV, "self-proclaimed misfit", en="inadaptado", es="inadaptado confeso")])),
        # El encuadre por la frase, sin medir.
        ("publicó en X una promesa en dos frases:",
         cap(X_LANZA, vista=zona(X_LANZA, "Describe a machine in one line. Claude"), fuente=F_X, claro=True)),
        ("«Describe una máquina en una línea.",
         cap(X_LANZA, sigue=True,
             marcas=[*marca_texto(X_LANZA, "Describe a machine in one line. Claude brings it to life.", en="describe")],
             encima=[senal(0.08, 0.23, en="maquina")])),
        ("Claude le da vida».",
         clip(9.0, src=LANZA_MP4, encuadre="ajusta")),
        # La cifra exacta en una banda, cuando la voz redondea; la caja, sobre la que se ve.
        ("Lleva más de dos millones y medio de vistas.",
         cap(VISTAS, vista=[800, 140, 880, 800], etiqueta=LEO, marcas=[caja([1398, 857, 242, 48], en="dos")],
             encima=[rotulo("2,597,890 VISTAS", en="millones", estilo="banda", color="amarilla", giro=-6, y=0.2)])),
    ]),
    ("logo", [
        (f"Es 22 de octubre de 2026, y estás viendo {MARCA['nombre']}.", {"tipo": "logo", "fecha": "22 OCT, 2026"}),
    ]),
    # Las secciones de en medio, de otro agente: fuentes/escenas/2.py es una sola lista de párrafos como esta, con las
    # mismas funciones y constantes, sin import ni asignaciones.
    *bloque("2"),
    ("cierre", [
        # El recorte entra en el nombre de quien es, con su placa debajo y lejos de lo citado.
        ("Lo que no prueban, como dijo Leo, de Canal Ejemplo, es la metáfora:",
         cap(INVENTED, vista=[150, 200, 1650, 700], fuente=F_YT, marcas=[caja_texto(INVENTED, "Invented", en="metafora")],
             encima=[pegado("recortes/leo.png", en="leo", entra="derecha", x=0.8, alto=0.7),
                     rotulo("LEO · CANAL EJEMPLO", en="leo", estilo="placa", x=0.8, y=0.9, tam=56)])),
        (MARCA["despedida"], {"tipo": "logo", "final": True}),
        *([(MARCA["invitacion"], {"tipo": "logo", "invitacion": True})] if MARCA.get("invitacion") else []),
    ]),
]
