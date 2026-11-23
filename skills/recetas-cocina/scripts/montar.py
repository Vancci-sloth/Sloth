#!/usr/bin/env python3
"""
Monta escenas.json + narración al estilo Sazón en Equilibrio: zoom suave, logo, gancho fijo arriba
(crema/verde) y subtítulos palabra a palabra abajo.

    python montar.py --voz master.wav --escenas escenas.json --gancho gancho.txt \
      --logo marca/logo.png --subtitulos fuentes/voz/voz.json --formato vertical
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import tempfile

VERDE = "0x173E32"
CREMA = "0xF0F0E0"


def ffprobe_dur(ruta: str) -> float:
    return float(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", ruta],
            text=True,
        ).strip()
    )


def palabras_de(ruta: pathlib.Path) -> list[dict]:
    if not ruta.is_file():
        return []
    j = json.loads(ruta.read_text(encoding="utf-8"))
    out: list[dict] = []
    for fr in j.get("frases") or []:
        for p in fr.get("palabras") or []:
            a = float(p.get("a", p.get("s", 0)))
            b = float(p.get("b", p.get("e", a + 0.2)))
            w = str(p.get("w") or p.get("texto") or "").strip()
            if w:
                out.append({"w": w, "a": a, "b": max(b, a + 0.08)})
    if not out:
        for p in j.get("palabras") or []:
            a = float(p.get("a", p.get("s", 0)))
            b = float(p.get("b", p.get("e", a + 0.2)))
            w = str(p.get("w") or "").strip()
            if w:
                out.append({"w": w, "a": a, "b": max(b, a + 0.08)})
    return out


def esc_draw(s: str) -> str:
    return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'").replace("%", "\\%")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--voz", required=True)
    p.add_argument("--escenas", required=True)
    p.add_argument("--formato", choices=["vertical", "horizontal"], default="vertical")
    p.add_argument("--gancho", default="gancho.txt")
    p.add_argument("--logo", default="marca/logo.png")
    p.add_argument("--subtitulos", default="fuentes/voz/voz.json")
    a = p.parse_args()

    scenes = json.loads(pathlib.Path(a.escenas).read_text(encoding="utf-8"))
    if not scenes:
        raise SystemExit("Faltan escenas.")
    duration = ffprobe_dur(a.voz)
    last = 0.0
    for s in scenes:
        if abs(float(s["desde"]) - last) > 0.05 or float(s["hasta"]) <= last:
            raise SystemExit("Los intervalos deben ser contiguos y positivos.")
        if not pathlib.Path(s["imagen"]).is_file():
            raise SystemExit("Falta imagen: " + s["imagen"])
        last = float(s["hasta"])
    if abs(last - duration) > 0.15:
        raise SystemExit("Las escenas deben cubrir toda la voz.")

    w, h = (1080, 1920) if a.formato == "vertical" else (1920, 1080)
    gancho = ""
    gp = pathlib.Path(a.gancho)
    if gp.is_file():
        gancho = " ".join(gp.read_text(encoding="utf-8").strip().split())
    palabras = palabras_de(pathlib.Path(a.subtitulos))
    logo = pathlib.Path(a.logo)
    hay_logo = logo.is_file()

    n = len(scenes)
    args: list[str] = ["ffmpeg", "-nostdin", "-y", "-v", "error"]
    for s in scenes:
        args += ["-loop", "1", "-framerate", "30", "-t", str(float(s["hasta"]) - float(s["desde"])), "-i", s["imagen"]]
    if hay_logo:
        args += ["-loop", "1", "-i", str(logo)]
        logo_i = n
        audio_i = n + 1
    else:
        logo_i = -1
        audio_i = n
    args += ["-i", a.voz]

    filters: list[str] = []
    for i, s in enumerate(scenes):
        frames = max(1, round((float(s["hasta"]) - float(s["desde"])) * 30))
        filters.append(
            f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"zoompan=z='min(zoom+0.0003,1.06)':d={frames}:s={w}x{h}:fps=30,"
            f"trim=duration={float(s['hasta']) - float(s['desde'])},setpts=PTS-STARTPTS,"
            f"setsar=1,scale=in_range=full:out_range=tv,format=yuv420p[v{i}]"
        )
    filters.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[v]")

    cur = "[v]"
    step = 0

    def next_label() -> str:
        nonlocal step
        step += 1
        return f"[t{step}]"

    if gancho:
        box_h = 200 if a.formato == "vertical" else 140
        box_y = 140 if a.formato == "vertical" else 60
        fs = 42 if a.formato == "vertical" else 36
        tw = int(w * 0.82)
        tx = (w - tw) // 2
        lab = next_label()
        filters.append(f"{cur}drawbox=x={tx}:y={box_y}:w={tw}:h={box_h}:color={CREMA}@0.95:t=fill{lab}")
        cur = lab
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False) as tf:
            tf.write(gancho)
            tpath = tf.name
        lab = next_label()
        filters.append(
            f"{cur}drawtext=textfile='{esc_draw(tpath)}':fontcolor={VERDE}:fontsize={fs}:"
            f"x=(w-text_w)/2:y={box_y + 28}:line_spacing=8{lab}"
        )
        cur = lab

    if palabras:
        fs = 72 if a.formato == "vertical" else 56
        y = int(h * 0.78) if a.formato == "vertical" else int(h * 0.82)
        for pal in palabras:
            txt = esc_draw(pal["w"].upper())
            lab = next_label()
            filters.append(
                f"{cur}drawtext=text='{txt}':fontcolor={CREMA}:fontsize={fs}:borderw=6:bordercolor={VERDE}:"
                f"x=(w-text_w)/2:y={y}:enable='between(t\\,{pal['a']:.3f}\\,{pal['b']:.3f})'{lab}"
            )
            cur = lab

    if hay_logo:
        lw = int(w * 0.12)
        filters.append(f"[{logo_i}:v]scale={lw}:-1[logo]")
        filters.append(f"{cur}[logo]overlay=x=36:y=36[vout]")
    else:
        filters.append(f"{cur}format=yuv420p[vout]")

    pathlib.Path("out").mkdir(exist_ok=True)
    args += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[vout]",
        "-map",
        f"{audio_i}:a",
        "-t",
        str(duration),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "out/receta.mp4",
    ]
    subprocess.run(args, check=True)
    print("listo: out/receta.mp4")


if __name__ == "__main__":
    main()
