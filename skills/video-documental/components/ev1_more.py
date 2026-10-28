"""ev1_more.py — the devices added on the first full Editor V1 edit (a 45 s cold open).

Same contract as the library (every time frame-snapped, explicit z, videos top level, transforms
only, fromTo immediateRender:false, preamble sets outside the timeline, devices write their cues).
Import this instead of ev1_devices: `from ev1_more import *` brings in both.
"""
import sys, math, random, json
import numpy as np
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ev1_devices import *          # noqa  (Comp, fr, dstr, esc, sfx, FPS, W, H, VERTICAL, FULL, fit_size, ...)

F1 = 1 / FPS


def css_once(c, key, css):
    if not any(key in s for s in c.css):
        c.css.append(f'/*{key}*/' + css)


# ------------------------------------------------------------------ SEQ: a hard-cut run of stills
def seq(c, items, z, t_end, click='click', push=0.05, rot=0.0, seed=1, fit='cover', ground='black', origin='50% 50%',
        dim=None, white_box=False):
    """items = [(src, t_on)] each shown until the next (the last until t_end). Every image is pushed
    (REF: nothing sits still) and gets a click on its frame. rot = max random rotation (deg) for the
    semantic-object strobes (REF-3 money strobe: small rotate/push per image). white_box: one white
    frame before each image (REF-2 pop)."""
    rnd = random.Random(seed)
    cuts = [fr(t) for _, t in items] + [fr(t_end)]
    gid = c.uid('sq')
    inner = [f'<div class="ev1-layer ev1-{ground}">']
    for k, (src, _) in enumerate(items):
        iid = c.uid('si')
        r = rnd.uniform(-rot, rot) if rot else 0
        s0 = 1.0 + rnd.uniform(0, 0.04) if rot else 1.0
        flt = f'filter:brightness({dim});' if dim else ''
        inner.append(f'<img id="{iid}" src="{src}" class="ev1-fill" style="object-fit:{fit};opacity:0;transform-origin:{origin};{flt}">')
        a, b = cuts[k], cuts[k + 1]
        c.pre.append(f'gsap.set("#{iid}",{{rotation:{r:.2f},scale:{s0:.3f}}});')
        c.at(f'tl.set("#{iid}",{{opacity:1}},{a:.4f});')
        if k + 1 < len(items):
            c.at(f'tl.set("#{iid}",{{opacity:0}},{b:.4f});')
        c.at(f'tl.fromTo("#{iid}",{{scale:{s0:.3f}}},{{scale:{s0 + push * max(b - a, 0.2) * 3:.4f},duration:{b - a:.4f},ease:"none",immediateRender:false}},{a:.4f});')
        if click:
            sfx(c, a, click)
    inner.append('</div>')
    c.clip(cuts[0], cuts[-1], ''.join(inner), z, cid=gid)
    return gid


# ------------------------------------------------------------------ VSEQ: a hard-cut run of clips
def vseq(c, items, z, t_end, click='click', rate=0.06, focus_in=0):
    """items = [(src, t_on, media_start)] — moving footage cut on the words, a click per cut."""
    cuts = [fr(t) for _, t, _ in items] + [fr(t_end)]
    ids = []
    for k, (src, _, ms) in enumerate(items):
        ids.append(broll(c, cuts[k], cuts[k + 1], src, z=z, rate=rate, focus_in=focus_in, media_start=ms))
        if click:
            sfx(c, cuts[k], click)
    return ids


# ------------------------------------------------------------------ POP + SHATTER (REF-2 D1)
def pop_shatter(c, t0, t1, cards, z, ground_src=None, shatter=True):
    """REF-2 0.00-1.16: cards pop one per word (a 1-frame white box of the card's size first, a click
    each), the stack PULLS OUT ~11%, then breaks into white blocks: 2f blocky slabs, 1f white, 1f smear.
    cards = [(src, x, y, w, rot, t_pop)] (x, y = centre)."""
    t0, t1 = fr(t0), fr(t1)
    gid = c.uid('ps')
    g = f'<img src="{ground_src}" class="ev1-fill" style="opacity:.28">' if ground_src else ''
    inner = [f'<div class="ev1-layer ev1-black">{g}<div id="{gid}" class="ev1-layer" style="transform-origin:50% 50%">']
    for src, x, y, w, rot, tp in cards:
        cid, bid = c.uid('pc'), c.uid('pb')
        inner.append(f'<div style="position:absolute;left:{x - w // 2}px;top:{y}px;width:{w}px;transform:translateY(-50%) rotate({rot}deg)">'
                     f'<img id="{cid}" src="{src}" style="display:block;width:100%;opacity:0;box-shadow:0 22px 60px rgba(0,0,0,.6)">'
                     f'<div id="{bid}" style="position:absolute;left:0;top:0;width:100%;height:100%;background:#fff;opacity:0"></div></div>')
        tp = fr(tp)
        c.at(f'tl.set("#{bid}",{{opacity:1}},{tp - F1:.4f});tl.set("#{bid}",{{opacity:0}},{tp:.4f});tl.set("#{cid}",{{opacity:1}},{tp:.4f});')
        sfx(c, tp - F1, 'click')
    inner.append('</div>')
    end_hold = t1 - (4 * F1 if shatter else 0)
    if shatter:   # white slabs: 2 frames of offset blocks, then 1 full white, then 1 smeared
        rnd = random.Random(7)
        slabs = ''.join(f'<div style="position:absolute;left:{rnd.randint(-100, W - 220)}px;top:{rnd.randint(-40, H - 80)}px;width:{rnd.randint(160, 620)}px;'
                        f'height:{rnd.randint(40, 220)}px;background:#fff"></div>' for _ in range(16))
        sid, wid = c.uid('sl'), c.uid('sw')
        inner.append(f'<div id="{sid}" class="ev1-layer" style="opacity:0">{slabs}</div><div id="{wid}" class="ev1-layer" style="background:#fff;opacity:0"></div>')
        c.at(f'tl.set("#{sid}",{{opacity:1}},{end_hold:.4f});tl.set("#{sid}",{{opacity:0,scaleX:1}},{end_hold + 2 * F1:.4f});'
             f'tl.set("#{wid}",{{opacity:1}},{end_hold + 2 * F1:.4f});tl.set("#{wid}",{{opacity:0}},{end_hold + 3 * F1:.4f});'
             f'tl.set("#{sid}",{{opacity:.85,scaleX:2.2,filter:"blur(10px)"}},{end_hold + 3 * F1:.4f});')
        sfx(c, end_hold + 2 * F1, 'hit', 0.7)
    inner.append('</div>')
    c.clip(t0, t1, ''.join(inner), z)
    c.at(f'tl.fromTo("#{gid}",{{scale:1.06}},{{scale:0.95,duration:{t1 - t0:.4f},ease:"none",immediateRender:false}},{t0:.4f});')
    c.pre.append(f'gsap.set("#{gid}",{{scale:1.06}});')


# ------------------------------------------------------------------ WHIP-CARRY (REF-2 D3)
def whip_out(c, vid, t_end, frames_n=4):
    """the zoom accelerates with the subject over the last frames: x1.15, 1.30, 1.35, 1.83 + motion smear."""
    t = fr(t_end) - frames_n * F1
    for k, (s, b) in enumerate([(1.15, 2), (1.30, 6), (1.45, 12), (1.83, 22)][:frames_n]):
        c.at(f'tl.set("#{vid}",{{scale:{s},filter:"blur({b}px)"}},{t + k * F1:.4f});')


# ------------------------------------------------------------------ SILENCE CUT (the speaker's own waveform)
def silence_cut(c, t0, t1, wav, win, silences, cut_at, z, width=None, clip_name=None):
    """A rebuilt editor track of THIS take: the real waveform of `win` (seconds), the real silences
    (silencedetect) flagged red, then snapped shut one by one at cut_at[k] — a click each, the rest of
    the track sliding left (transform only)."""
    import soundfile as sf
    x, sr = sf.read(wav, dtype='float32')
    x = x.mean(1) if x.ndim > 1 else x
    a, b = win
    width = width or W - 240
    seg = x[int(a * sr):int(b * sr)]
    px_per_s = width / (b - a)
    ncol = width // 3
    cols = np.array_split(np.abs(seg), ncol)
    peaks = np.array([cc.max() if len(cc) else 0 for cc in cols])
    peaks = peaks / (peaks.max() + 1e-9)
    sil = [(s, e) for s, e in silences if s >= a and e <= b]
    # segments between silences
    bounds = [a] + [v for s, e in sil for v in (s, e)] + [b]
    pieces = [(bounds[2 * k], bounds[2 * k + 1]) for k in range(len(bounds) // 2)]
    H_ = 300; left0 = (W - width) // 2; top0 = H // 2 - 120
    css_once(c, 'sc', '.sc-track{position:absolute;height:300px;top:0;border-radius:10px;background:#1B2A33;box-shadow:inset 0 0 0 2px #2F4A57;overflow:hidden}'
             '.sc-gap{position:absolute;top:-6px;height:312px;background:rgba(242,3,10,.28);box-shadow:inset 0 0 0 3px var(--ev1-red);border-radius:8px}')
    inner = [f'<div class="ev1-layer" style="background:#0D1013">']
    # ruler
    ticks = ''.join(f'<div style="position:absolute;left:{left0 + (t - a) * px_per_s:.1f}px;top:{top0 - 70}px;width:2px;height:{24 if abs(t - round(t)) < 1e-6 else 12}px;background:#56616B"></div>'
                    + (f'<div style="position:absolute;left:{left0 + (t - a) * px_per_s + 8:.1f}px;top:{top0 - 76}px;font:400 22px var(--ev1-mono);color:#7C8591">00:{int(t):02d}</div>' if abs(t - round(t)) < 1e-6 else '')
                    for t in np.arange(math.ceil(a * 4) / 4, b, 0.25))
    inner.append(ticks)
    lab = (left0 - 120, top0 + 120) if not VERTICAL else (left0, top0 - 140)
    inner.append(f'<div style="position:absolute;left:{lab[0]}px;top:{lab[1]}px;font:400 30px var(--ev1-mono);color:#7C8591">A1</div>')
    if clip_name:
        inner.append(f'<div style="position:absolute;left:{left0}px;top:{top0 + H_ + 26}px;font:400 30px var(--ev1-mono);color:#9AA5B1">{esc(clip_name)}</div>')
    ids = []
    for (pa, pb) in pieces:
        pid = c.uid('scp')
        x0 = (pa - a) * px_per_s; w_ = (pb - pa) * px_per_s
        # waveform bars inside this piece
        c0, c1 = int((pa - a) / (b - a) * ncol), int((pb - a) / (b - a) * ncol)
        bars = ''.join(f'<div style="position:absolute;left:{(k - c0) * 3}px;top:{150 - p * 130:.1f}px;width:2px;height:{max(2, p * 260):.1f}px;background:#7FD3E6"></div>'
                       for k, p in enumerate(peaks[c0:c1], start=c0))
        inner.append(f'<div id="{pid}" class="sc-track" style="left:{left0 + x0:.1f}px;top:{top0}px;width:{w_:.1f}px">{bars}</div>')
        ids.append(pid)
    gids = []
    for (s, e) in sil:
        gid = c.uid('scg')
        inner.append(f'<div id="{gid}" class="sc-gap" style="left:{left0 + (s - a) * px_per_s:.1f}px;top:{top0 - 6}px;width:{(e - s) * px_per_s:.1f}px;opacity:0"></div>')
        gids.append(gid)
    # playhead
    ph = c.uid('scph')
    inner.append(f'<div id="{ph}" style="position:absolute;left:{left0}px;top:{top0 - 90}px;width:3px;height:{H_ + 130}px;background:var(--ev1-red)"></div>')
    inner.append('<div class="ev1-vignette"></div></div>')
    t0, t1 = fr(t0), fr(t1)
    c.clip(t0, t1, ''.join(inner), z)
    # flag all gaps at t0+2f, staggered 1f
    for k, g in enumerate(gids):
        c.at(f'tl.set("#{g}",{{opacity:1}},{t0 + (2 + k) * F1:.4f});')
    # cut them shut, left to right; everything right of gap k slides left by its width.
    # Explicit fromTo steps (never tl.to: seeking must not depend on render order), each step ends a
    # frame before the next starts (a same-target chain that overlaps drops a beat).
    cts = [fr(cut_at[min(k, len(cut_at) - 1)]) for k in range(len(sil))]
    shift_p = [0.0] * len(ids); shift_g = [0.0] * len(gids)
    for k, (s, e) in enumerate(sil):
        tc = cts[k]
        gw = (e - s) * px_per_s
        nxt = cts[k + 1] if k + 1 < len(cts) else t1
        dur = max(F1, min(4 * F1, nxt - tc - 2 * F1))
        c.at(f'tl.set("#{gids[k]}",{{backgroundColor:"#fff"}},{tc:.4f});tl.set("#{gids[k]}",{{opacity:0}},{tc + F1:.4f});')
        for j in range(k + 1, len(ids)):
            c.at(f'tl.fromTo("#{ids[j]}",{{x:{shift_p[j]:.1f}}},{{x:{shift_p[j] - gw:.1f},duration:{dur:.4f},ease:"power3.out",immediateRender:false}},{tc + F1:.4f});')
            shift_p[j] -= gw
        for j in range(k + 1, len(gids)):
            c.at(f'tl.fromTo("#{gids[j]}",{{x:{shift_g[j]:.1f}}},{{x:{shift_g[j] - gw:.1f},duration:{dur:.4f},ease:"power3.out",immediateRender:false}},{tc + F1:.4f});')
            shift_g[j] -= gw
        sfx(c, tc, 'click')
    c.at(f'tl.fromTo("#{ph}",{{x:0}},{{x:{width * 0.62:.0f},duration:{t1 - t0:.4f},ease:"none",immediateRender:false}},{t0:.4f});')


# ------------------------------------------------------------------ TIMELINE OF THIS EDIT
def edit_timeline(c, t0, t1, view, clips, words, cues, z, sweep=None, wav=None, hl_word=None):
    """The real timeline of THIS video between view=(a,b): V1 = the actual shots (thumb per shot),
    A1 = the spoken words as blocks at their onsets (+ waveform), FX = every sound cue. The playhead sweeps
    `sweep`=(from,to) in comp seconds across the beat; each cut it crosses flashes a guide line down
    to the word it lands on, with a click (REF: clicks land on the frame)."""
    a, b = view
    width = W - 160; left0 = (W - width) // 2
    pps = width / (b - a)
    X = lambda t: left0 + (t - a) * pps
    css_once(c, 'tlx', '.tl-lane{position:absolute;left:0;width:100%}'
             '.tl-clip{position:absolute;top:0;height:150px;overflow:hidden;border-radius:6px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.55)}'
             '.tl-clip img{position:absolute;left:0;top:0;height:150px;width:auto}'
             '.tl-word{position:absolute;top:0;height:64px;border-radius:6px;background:#2C3E8C;box-shadow:inset 0 0 0 2px #6E86FF;'
             'font:600 26px/64px var(--ev1-sans);color:#fff;padding-left:8px;box-sizing:border-box;white-space:nowrap;overflow:hidden}'
             '.tl-cue{position:absolute;top:0;width:6px;height:40px;background:#FFC24A;border-radius:2px}')
    # the lanes sit in a 1080-high band, centred (the whole frame in horizontal)
    inner = [f'<div class="ev1-layer" style="background:#0D0F12"><div style="position:absolute;left:0;top:{(H - 1080) // 2}px;width:{W}px;height:1080px">']
    # ruler
    for t in np.arange(math.ceil(a * 2) / 2, b, 0.5):
        big = abs(t - round(t)) < 1e-6
        inner.append(f'<div style="position:absolute;left:{X(t):.1f}px;top:150px;width:2px;height:{22 if big else 12}px;background:#4E5862"></div>')
        if big:
            inner.append(f'<div style="position:absolute;left:{X(t) + 6:.1f}px;top:142px;font:400 22px var(--ev1-mono);color:#7C8591">00:{int(t):02d}:00</div>')
    # lane labels
    for lab, y in (('V1', 250), ('A1', 470), ('FX', 590)):
        inner.append(f'<div style="position:absolute;left:28px;top:{y}px;font:400 26px var(--ev1-mono);color:#7C8591">{lab}</div>')
    # V1 shots
    for s, e, th in clips:
        if e <= a or s >= b:
            continue
        s2, e2 = max(s, a), min(e, b)
        inner.append(f'<div class="tl-clip" style="left:{X(s2) + 1:.1f}px;top:220px;width:{max(4, (e2 - s2) * pps - 2):.1f}px">'
                     f'<img src="{th}"></div>')
    # A1 waveform + words
    if wav:
        import soundfile as sf
        x, sr = sf.read(wav, dtype='float32'); x = x.mean(1) if x.ndim > 1 else x
        seg = np.abs(x[int(a * sr):int(b * sr)]); ncol = width // 4
        pk = np.array([cc.max() for cc in np.array_split(seg, ncol)]); pk /= pk.max() + 1e-9
        inner.append(''.join(f'<div style="position:absolute;left:{left0 + k * 4}px;top:{430 - p * 36:.1f}px;width:3px;height:{max(2, p * 72):.1f}px;background:#4F6B8F"></div>' for k, p in enumerate(pk)))
    wid_map = {}
    for wtxt, s, e in words:
        if e <= a or s >= b:
            continue
        wid = c.uid('tw')
        hl = (hl_word is not None and abs(s - hl_word) < 1e-3)
        inner.append(f'<div id="{wid}" class="tl-word" style="left:{X(s) + 1:.1f}px;top:470px;width:{max(10, (e - s) * pps - 2):.1f}px">{esc(wtxt)}</div>')
        wid_map[s] = wid
    # FX cue markers
    for tq in cues:
        if a <= tq <= b:
            inner.append(f'<div class="tl-cue" style="left:{X(tq):.1f}px;top:580px"></div>')
    # guides + playhead
    gids = []
    cut_ts = sorted({s for s, e, th in clips if a < s < b})
    for tc in cut_ts:
        gid = c.uid('tg')
        inner.append(f'<div id="{gid}" style="position:absolute;left:{X(tc) - 2:.1f}px;top:200px;width:5px;height:440px;background:#fff;opacity:0;box-shadow:0 0 18px #fff"></div>')
        gids.append((tc, gid))
    ph = c.uid('tph')
    inner.append(f'<div id="{ph}" style="position:absolute;left:0;top:130px;width:4px;height:540px;background:var(--ev1-red);box-shadow:0 0 12px rgba(242,3,10,.8)">'
                 f'<div style="position:absolute;left:-14px;top:-10px;width:32px;height:24px;background:var(--ev1-red);border-radius:4px"></div></div>')
    inner.append('</div><div class="ev1-vignette"></div></div>')
    t0, t1 = fr(t0), fr(t1)
    c.clip(t0, t1, ''.join(inner), z)
    sa, sb = sweep or (a, b)
    dur = t1 - t0
    c.pre.append(f'gsap.set("#{ph}",{{x:{X(sa):.1f}}});')
    c.at(f'tl.fromTo("#{ph}",{{x:{X(sa):.1f}}},{{x:{X(sb):.1f},duration:{dur:.4f},ease:"none",immediateRender:false}},{t0:.4f});')
    for tc, gid in gids:
        if sa <= tc <= sb:
            tt = fr(t0 + (tc - sa) / (sb - sa) * dur)
            c.at(f'tl.set("#{gid}",{{opacity:1}},{tt:.4f});tl.set("#{gid}",{{opacity:0}},{tt + 2 * F1:.4f});')
            # the word under that cut lights
            near = min(wid_map, key=lambda s: abs(s - tc)) if wid_map else None
            if near is not None and abs(near - tc) < 0.12:
                c.at(f'tl.set("#{wid_map[near]}",{{backgroundColor:"#F2F2F2",color:"#111"}},{tt:.4f});')
            sfx(c, tt, 'click_soft')
    if hl_word is not None and hl_word in wid_map:
        th_ = fr(t0 + (hl_word - sa) / (sb - sa) * dur) if sa <= hl_word <= sb else t1 - 6 * F1
        c.at(f'tl.set("#{wid_map[hl_word]}",{{backgroundColor:"#F2030A",color:"#fff"}},{th_:.4f});')


# ------------------------------------------------------------------ COMMENT BOX (rebuilt UI, no fake content)
def comment_box(c, t0, t1, z, placeholder='Add a comment…', avatar_letter='Y', type_text='', type_at=None, fpc=2):
    """A generic comment composer (no brand marks, no invented comments): avatar, the input line,
    a blinking caret; optional text typing. "You tell me" = the empty box waiting for the viewer."""
    t0, t1 = fr(t0), fr(t1)
    bid, cur, kid = c.uid('cb'), c.uid('cc'), c.uid('ck')
    chars = []
    for j, ch in enumerate(type_text):
        sid = c.uid('ct')
        chars.append(f'<span id="{sid}" style="opacity:0">{esc(ch)}</span>')
        c.at(f'tl.set("#{sid}",{{opacity:1}},{fr(type_at or t0) + j * fpc * F1:.4f});')
    ph_id = c.uid('cph')
    bw = 1200 if not VERTICAL else W - 160          # the box (scaled 1.3 in horizontal, 1.0 in vertical)
    s0 = 1.3 if not VERTICAL else 1.0
    inner = (f'<div class="ev1-layer" style="background:#0F0F0F"><div id="{bid}" style="position:absolute;left:{(W - bw) // 2}px;top:{H // 2 - 210}px;width:{bw}px;transform-origin:50% 50%">'
             f'<div style="font:700 40px var(--ev1-sans);color:#F1F1F1;margin-bottom:46px">Comments</div>'
             f'<div style="display:flex;gap:30px;align-items:flex-start">'
             f'<div style="width:96px;height:96px;border-radius:50%;background:#3F51B5;color:#fff;font:700 46px/96px var(--ev1-sans);text-align:center;flex:none">{esc(avatar_letter)}</div>'
             f'<div style="flex:1;border-bottom:3px solid #F1F1F1;padding:18px 0 14px;font:400 40px/1.2 var(--ev1-sans);color:#F1F1F1;position:relative">'
             f'<span id="{ph_id}" style="color:#AAAAAA;position:absolute;left:0">{esc(placeholder)}</span>{"".join(chars)}'
             f'<span id="{cur}" style="display:inline-block;width:3px;height:44px;background:#F1F1F1;vertical-align:-8px"></span></div></div>'
             f'<div style="display:flex;justify-content:flex-end;gap:20px;margin-top:30px">'
             f'<div style="font:600 34px/72px var(--ev1-sans);color:#F1F1F1;padding:0 34px">Cancel</div>'
             f'<div id="{kid}" style="font:600 34px/72px var(--ev1-sans);color:#717171;background:#272727;border-radius:36px;padding:0 40px">Comment</div></div>'
             f'</div><div class="ev1-vignette"></div></div>')
    c.clip(t0, t1, inner, z)
    t = t0; on = True
    while t < t1:
        c.at(f'tl.set("#{cur}",{{opacity:{1 if on else 0}}},{t:.4f});'); t += 8 * F1; on = not on
    if type_text:
        c.at(f'tl.set("#{ph_id}",{{opacity:0}},{fr(type_at or t0):.4f});'
             f'tl.set("#{kid}",{{backgroundColor:"#3EA6FF",color:"#0F0F0F"}},{fr(type_at or t0):.4f});')
    c.pre.append(f'gsap.set("#{bid}",{{scale:{s0}}});')
    c.at(f'tl.fromTo("#{bid}",{{scale:{s0}}},{{scale:{s0 + 0.08:.2f},duration:{t1 - t0:.4f},ease:"none",immediateRender:false}},{t0:.4f});')


# ------------------------------------------------------------------ WAVEFORM VIEW (the bed itself)
def bed_wave(c, t0, t1, wav, song_at, z, span=6.0, color='#F2F2F2'):
    """The music bed's real waveform, scrolling under a fixed centre line: at comp time t the
    centre shows song time song_at + (t - t0). A symmetric peak plot, white on black."""
    import soundfile as sf
    x, sr = sf.read(wav, dtype='float32'); x = x.mean(1) if x.ndim > 1 else x
    dur = fr(t1) - fr(t0)
    a = song_at - span / 2; b = song_at + dur + span / 2
    seg = np.abs(x[max(0, int(a * sr)):int(b * sr)])
    pps = W / span
    ncol = int((b - a) * pps / 5)
    pk = np.array([cc.max() if len(cc) else 0 for cc in np.array_split(seg, ncol)]); pk /= pk.max() + 1e-9
    wid = c.uid('bw')
    bars = ''.join(f'<div style="position:absolute;left:{k * 5}px;top:{H // 2 - p * 330:.1f}px;width:3px;height:{max(2, p * 660):.1f}px;background:{color}"></div>' for k, p in enumerate(pk))
    inner = (f'<div class="ev1-layer ev1-black"><div id="{wid}" style="position:absolute;left:0;top:0;width:{ncol * 5}px;height:{H}px">{bars}</div>'
             f'<div style="position:absolute;left:{W // 2 - 2}px;top:{H // 2 - 420}px;width:4px;height:840px;background:var(--ev1-red)"></div><div class="ev1-vignette"></div></div>')
    c.clip(t0, t1, inner, z)
    c.pre.append(f'gsap.set("#{wid}",{{x:0}});')
    c.at(f'tl.fromTo("#{wid}",{{x:0}},{{x:{-dur * pps:.1f},duration:{dur:.4f},ease:"none",immediateRender:false}},{fr(t0):.4f});')


# ------------------------------------------------------------------ FILMSTRIP (every shot of this edit)
def filmstrip(c, t0, t1, thumbs, z, tw=None, travel=None):
    """Every shot of the video as a strip of frames racing past (REF-1's wall, flattened):
    35mm-style perforations, a click as the strip starts."""
    t0, t1 = fr(t0), fr(t1)
    tw = tw or (420 if not VERTICAL else 300)
    th = round(tw * H / W)
    sid = c.uid('fs')
    perf = ''.join(f'<div style="position:absolute;left:{k * 46 + 10}px;top:{{y}}px;width:24px;height:18px;border-radius:4px;background:#EDE7DA"></div>' for k in range(int(len(thumbs) * (tw + 24) / 46) + 4))
    frames_html = ''.join(f'<img src="{s}" style="position:absolute;left:{k * (tw + 24)}px;top:46px;width:{tw}px;height:{th}px;object-fit:cover">' for k, s in enumerate(thumbs))
    stripw = len(thumbs) * (tw + 24)
    inner = (f'<div class="ev1-layer ev1-black"><div style="position:absolute;left:0;top:{H // 2 - th // 2 - 46}px;width:{W}px;height:{th + 92}px;transform:rotate(-6deg)">'
             f'<div id="{sid}" style="position:absolute;left:0;top:0;width:{stripw}px;height:{th + 92}px;background:#151311">'
             f'{perf.replace("{y}", "14")}{frames_html}{perf.replace("{y}", str(th + 60))}</div></div><div class="ev1-vignette"></div></div>')
    c.clip(t0, t1, inner, z)
    tr = travel or (stripw - W)
    c.pre.append(f'gsap.set("#{sid}",{{x:200}});')
    c.at(f'tl.fromTo("#{sid}",{{x:200,filter:"blur(3px)"}},{{x:{-tr:.0f},filter:"blur(1px)",duration:{t1 - t0:.4f},ease:"power1.in",immediateRender:false}},{t0:.4f});')
    sfx(c, t0, 'click')


# ------------------------------------------------------------------ PLAYER WINDOW (this very video)
def player_window(c, t0, t1, src, media_start, z, steps=((0.0, 1.0), (3, 0.70), (6, 0.46)), dur_label='0:46', bar_t=None):
    """This video, shrinking into a generic player in hard steps (REF-3's window-expand, reversed):
    the frame is the video, and we're watching it inside itself. steps = [(frame_offset, scale)].
    The <video> is a top-level clip (never inside a wrapper); the chrome is a separate clip above it."""
    t0, t1 = fr(t0), fr(t1)
    c.clip(t0, t1, '<div class="ev1-layer" style="background:#0F0F0F"></div>', z)
    vid = c.uid('pw')
    c.video(t0, t1, src, media_start, z + 1, style='transform-origin:50% 44%', vid=vid)
    chid = c.uid('pch'); barid = c.uid('pbar')
    chrome = (f'<div id="{chid}" style="position:absolute;left:0;top:0;width:{W}px;height:{H}px;transform-origin:50% 44%">'
              f'<div style="position:absolute;left:0;top:{H - 80}px;width:{W}px;height:80px;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.75))"></div>'
              f'<div style="position:absolute;left:40px;top:{H - 50}px;width:{W - 80}px;height:8px;background:rgba(255,255,255,.3)">'
              f'<div id="{barid}" style="width:100%;height:100%;background:var(--ev1-red);transform-origin:0 50%"></div></div>'
              f'<div style="position:absolute;left:40px;top:{H - 94}px;font:600 30px var(--ev1-sans);color:#fff">0:00 / {dur_label}</div></div>')
    c.clip(t0, t1, chrome, z + 2, cls='', style=FULL)
    c.pre.append(f'gsap.set("#{barid}",{{scaleX:0.01}});')
    c.at(f'tl.fromTo("#{barid}",{{scaleX:0.01}},{{scaleX:{(t1 - t0) / 46:.4f},duration:{t1 - t0:.4f},ease:"none",immediateRender:false}},{t0:.4f});')
    for fo, s in steps:
        tt = t0 + fo * F1
        for i in (vid, chid):
            c.at(f'tl.set("#{i}",{{scale:{s}}},{tt:.4f});')
        if fo:
            sfx(c, tt, 'click_soft')
    # keep shrinking slowly after the last step
    last_t = t0 + steps[-1][0] * F1; s_last = steps[-1][1]
    for i in (vid, chid):
        c.at(f'tl.fromTo("#{i}",{{scale:{s_last}}},{{scale:{s_last * 0.94:.4f},duration:{t1 - last_t:.4f},ease:"none",immediateRender:false}},{last_t:.4f});')
    return vid


# ------------------------------------------------------------------ CALENDAR (the real release cadence)
def calendar(c, t0, t1, months, events, z, pan=True):
    """A wall calendar of real months; each real release lands on its date as a chip (a 1-frame
    white box first, a click each). months = [(year, month)], events = [(y, m, d, label, t_land)]."""
    import calendar as _cal
    t0, t1 = fr(t0), fr(t1)
    cw, step, x0 = (150, 1120, 120) if not VERTICAL else (128, 990, 70)     # day column, month pitch, left edge
    css_once(c, 'cal', f'.cal-m{{position:absolute;top:0;width:{7 * cw + 30}px}}.cal-h{{font:700 52px var(--ev1-sans);color:var(--ev1-ink);margin:0 0 18px 6px}}'
             f'.cal-g{{display:grid;grid-template-columns:repeat(7,{cw}px);grid-auto-rows:{cw - 8}px;gap:5px}}'
             '.cal-d{background:#fff;border-radius:6px;box-shadow:0 1px 0 rgba(0,0,0,.08);position:relative;font:600 24px var(--ev1-sans);color:#8A8A8A;padding:8px 10px;box-sizing:border-box}'
             '.cal-dow{font:600 22px var(--ev1-sans);color:#6E6E6E;text-align:center;height:34px}'
             '.cal-chip{position:absolute;left:4px;right:4px;bottom:6px;min-height:46px;border-radius:6px;background:var(--ev1-ink);color:#fff;'
             'font:700 19px/1.08 var(--ev1-sans);padding:5px 7px;box-sizing:border-box;opacity:0;overflow:hidden}')
    gid = c.uid('cal')
    html_m = []
    chip_ids = {}
    for k, (yy, mm) in enumerate(months):
        first_wd, nd = _cal.monthrange(yy, mm)            # Monday = 0
        cells = ''.join(f'<div class="cal-dow">{d}</div>' for d in 'MTWTFSS')
        cells += ''.join('<div></div>' for _ in range(first_wd))
        for d in range(1, nd + 1):
            evs = [e for e in events if (e[0], e[1], e[2]) == (yy, mm, d)]
            chips = ''
            for j, e in enumerate(evs):
                cid = c.uid('cch'); chip_ids[id(e)] = cid
                chips += f'<div id="{cid}" class="cal-chip" style="bottom:{6 + j * 54}px">{esc(e[3])}</div>'
            cells += f'<div class="cal-d">{d}{chips}</div>'
        html_m.append(f'<div class="cal-m" style="left:{k * step}px"><div class="cal-h">{_cal.month_name[mm]} {yy}</div><div class="cal-g">{cells}</div></div>')
    inner = (f'<div class="ev1-layer ev1-paper"><div id="{gid}" style="position:absolute;left:{x0}px;top:{(H - 960) // 2}px;width:{len(months) * step}px;height:900px">'
             f'{"".join(html_m)}</div><div class="ev1-vignette" style="opacity:.6"></div></div>')
    c.clip(t0, t1, inner, z)
    for e in events:
        tl_ = fr(e[4]); cid = chip_ids[id(e)]
        c.at(f'tl.set("#{cid}",{{opacity:1,backgroundColor:"#fff"}},{tl_ - F1:.4f});tl.set("#{cid}",{{backgroundColor:"#121214"}},{tl_:.4f});')
        sfx(c, tl_ - F1, 'click')
    if pan:
        travel = max(0, len(months) * step - (W - 2 * x0 + 40))
        c.pre.append(f'gsap.set("#{gid}",{{x:0,scale:1}});')
        c.at(f'tl.fromTo("#{gid}",{{x:0,scale:1.0}},{{x:{-travel},scale:0.96,duration:{t1 - t0:.4f},ease:"power1.inOut",immediateRender:false}},{t0:.4f});')
    return gid


# ------------------------------------------------------------------ CODE / LOG SCROLL
def code_scroll(c, t0, t1, lines, z, font=30, title=None, speed=None, hl=None, start_y=None, end_y=None):
    """Real text (this build's own code, cue sheet, render log) scrolling up in a dark editor pane.
    lines = list of (html) strings. hl = (row, t) puts the marker on one row."""
    t0, t1 = fr(t0), fr(t1)
    start_y = start_y if start_y is not None else H - 100
    lx, top = (150, 0) if not VERTICAL else (60, 140)      # in vertical the editor bar clears the app's top bar
    lh = round(font * 1.45)
    lid = c.uid('cs')
    rows = ''.join(f'<div style="height:{lh}px"><span class="dim" style="display:inline-block;width:{font * 2.6:.0f}px">{k + 1}</span>{ln}</div>' for k, ln in enumerate(lines))
    mk = ''
    if hl:
        mid = c.uid('csm')
        mk = f'<div id="{mid}" class="ev1-mark on-dark" style="left:0;top:{hl[0] * lh + 3}px;width:{W - 2 * lx - 120}px;height:{lh - 6}px"></div>'
        c.pre.append(f'gsap.set("#{mid}",{{scaleX:0}});')
        c.at(f'tl.fromTo("#{mid}",{{scaleX:0}},{{scaleX:1,duration:{5 * F1:.4f},ease:"power2.out",immediateRender:false}},{fr(hl[1]):.4f});')
        sfx(c, hl[1], 'click_soft')
    head = (f'<div style="position:absolute;left:0;top:0;width:{W}px;height:{top + 96}px;background:#16191E;border-bottom:2px solid #262B33">'
            f'<div style="position:absolute;left:{lx}px;top:{top + 28}px;font:400 30px var(--ev1-mono);color:#C9D1D9">{esc(title)}</div></div>') if title else ''
    inner = (f'<div class="ev1-layer" style="background:#0B0D10"><div id="{lid}" class="ev1-term" style="left:{lx}px;top:0;font-size:{font}px">{rows}{mk}</div>{head}'
             f'<div style="position:absolute;left:0;top:{H - 260}px;width:{W}px;height:260px;background:linear-gradient(rgba(11,13,16,0),rgba(11,13,16,.92) 60%)"></div>'
             f'<div class="ev1-vignette"></div></div>')
    c.clip(t0, t1, inner, z)
    ey = end_y if end_y is not None else start_y - len(lines) * lh * 0.55
    c.pre.append(f'gsap.set("#{lid}",{{y:{start_y}}});')
    c.at(f'tl.fromTo("#{lid}",{{y:{start_y}}},{{y:{ey:.0f},duration:{t1 - t0:.4f},ease:"power2.out",immediateRender:false}},{t0:.4f});')
    return lid


# ------------------------------------------------------------------ SLAP CAPS (the cliché auto-caption)
def slap_caps(c, items, t_end, z, y=None, size=132, big=None):
    """The generic auto-caption look the line mocks (made for this video): one heavy uppercase word at a
    time, marker-yellow with a thick black stroke, each SLAPPED on (scale 1.45 -> 0.96 -> 1 over 3 frames,
    a small tilt), a click each. items = [(word, t)]; big = the word that lands bigger."""
    css_once(c, 'slap', '.slap{font:900 var(--slap-size)/1 var(--ev1-sans);color:var(--ev1-marker);text-transform:uppercase;letter-spacing:-0.02em;'
             '-webkit-text-stroke:14px var(--ev1-ink);paint-order:stroke fill;text-shadow:0 10px 0 var(--ev1-ink),0 18px 40px rgba(0,0,0,.6);white-space:nowrap}')
    y = y if y is not None else round(H * 0.593)
    cuts = [fr(t) for _, t in items] + [fr(t_end)]
    rnd = random.Random(5)
    for k, (wtxt, _) in enumerate(items):
        sid = c.uid('sl')
        s = fit_size(wtxt, 'slap', size * (1.5 if big and wtxt.lower().strip('.,') == big else 1))
        rot = rnd.uniform(-5, 5)
        inner = (f'<div style="position:absolute;left:0;top:{y}px;width:{W}px;height:0;display:flex;justify-content:center;align-items:center">'
                 f'<div id="{sid}" class="slap" style="--slap-size:{s:.0f}px">{esc(wtxt)}</div></div>')
        c.clip(cuts[k], cuts[k + 1], inner, z, cls='', style=FULL)
        c.pre.append(f'gsap.set("#{sid}",{{scale:1.45,rotation:{rot:.1f}}});')
        c.at(f'tl.fromTo("#{sid}",{{scale:1.45,rotation:{rot:.1f}}},{{scale:0.96,rotation:{rot * 0.4:.1f},duration:{2 * F1:.4f},ease:"power2.out",immediateRender:false}},{cuts[k]:.4f});'
             f'tl.fromTo("#{sid}",{{scale:0.96}},{{scale:1.0,duration:{F1:.4f},ease:"none",immediateRender:false}},{cuts[k] + 2 * F1:.4f});')
        sfx(c, cuts[k], 'click')


# ------------------------------------------------------------------ IMG MARK (a real logo, as an image)
def img_mark(c, t0, t1, src, z, width=520, x=None, y=None, white=False, blur_in=True, shadow=True):
    """A real brand mark as <img> (keeps its own colours: the Claude spark stays clay, Gemini keeps its
    gradient). white=True turns a black mark white (invert). Blur-in over 6 frames like a key word."""
    mid = c.uid('im')
    x = W // 2 if x is None else x
    y = H // 2 if y is None else y
    width = min(width, W - 120)
    flt = ('invert(1) ' if white else '') + ('drop-shadow(0 10px 40px rgba(0,0,0,.55))' if shadow else '')
    inner = (f'<div style="position:absolute;left:{x - width // 2}px;top:{y}px;width:{width}px;transform:translateY(-50%)">'
             f'<img id="{mid}" src="{src}" style="display:block;width:100%;filter:{flt}"></div>')
    c.clip(t0, t1, inner, z, cls='', style=FULL)
    if blur_in:
        c.pre.append(f'gsap.set("#{mid}",{{opacity:0}});')
        c.at(f'tl.fromTo("#{mid}",{{opacity:0,scale:1.12}},{{opacity:1,scale:1,duration:{6 * F1:.4f},ease:"power2.out",immediateRender:false}},{fr(t0):.4f});')
    return mid


# ------------------------------------------------------------------ CUT-OUT ON A CHANGING WORLD (the hero)
def cutout_world(c, t0, t1, worlds, matte_src, matte_first_s, z=1, mega=None, matte_rate=0.0, tiles=True):
    """REF-1 0-4.5s: the speaker (RVM matte from the RAW plate, never graded) standing still while the world behind swaps on
    the words, each swap a tile-flash reveal. worlds = [(kind, src, t_on, still_for_tiles, media_start)]
    kind = 'video'|'img'. mega = (text, t_on, y): the huge red word BEHIND the head.
    Layer order: world (z) -> tiles (z+1) -> mega (z+10) -> matte (z+20)."""
    t0, t1 = fr(t0), fr(t1)
    ons = [fr(w[2]) for w in worlds] + [t1]
    for k, (kind, src, _, still_src, ms) in enumerate(worlds):
        a, b = ons[k], ons[k + 1]
        if kind == 'video':
            broll(c, a, b, src, z=z, rate=0.04, media_start=ms or 0.0)
        else:
            still(c, a, b, src, z=z, push=1.05)
        if tiles and k and still_src:
            tile_reveal(c, a, still_src, z=z + 1, seed=20 + k, frames_n=9, size=(W, H))
    if mega:
        txt, tm, my = mega
        keyword(c, fr(tm), t1, txt, z=z + 10, x=W // 2, y=my, kind='mega', blur_in=False)
        sfx(c, tm, 'hit', 0.8)
    vid = c.uid('mt')
    c.video(t0, t1, matte_src, t0 - matte_first_s, z + 20, vid=vid)
    return vid


def double_neg(c, t, out_ids, in_ids, sound='click'):
    """REF-2 D19, into every chapter: the last 2 frames of the outgoing shot inverted + the first 2 of the
    incoming inverted."""
    t = fr(t)
    for i in out_ids:
        c.at(f'tl.set("#{i}",{{filter:"invert(1)"}},{t - 2 * F1:.4f});')
    for i in in_ids:
        c.at(f'tl.set("#{i}",{{filter:"invert(1)"}},{t:.4f});tl.set("#{i}",{{filter:"none"}},{t + 2 * F1:.4f});')
    if sound:
        sfx(c, t - 2 * F1, sound)


# ------------------------------------------------------------------ TRIPTYCH (three subjects at once)
def triptych(c, t0, t1, vids, z, gap=10, rate=0.05):
    """REF-1 S70: the three people of the line side by side (vertical panels here; a diagonal seam
    would need clip-path on <video>, which the renderer is not proven to honour). vids = [(src, media_start)].
    Each panel is its own top-level <video> in frame px, opening defocused (rack in, 6 frames)."""
    t0, t1 = fr(t0), fr(t1)
    c.clip(t0, t1, '<div class="ev1-layer ev1-black"></div>', z)
    pw = ((W if not VERTICAL else H) - 2 * gap) / 3       # side by side in horizontal, stacked in vertical
    for k, (src, ms) in enumerate(vids):
        vid = c.uid('tp')
        p = round(k * (pw + gap))
        box = (f'left:{p}px;top:0;width:{round(pw)}px;height:{H}px' if not VERTICAL
               else f'left:0;top:{p}px;width:{W}px;height:{round(pw)}px')
        c.video(t0, t1, src, ms, z + 1, style=f'position:absolute;{box}', vid=vid, cls='clip')
        c.pre.append(f'gsap.set("#{vid}",{{scale:1.0}});')
        c.at(f'tl.fromTo("#{vid}",{{scale:1.0,filter:"blur(12px)"}},{{scale:{1 + rate * (t1 - t0):.4f},filter:"blur(0px)",duration:{t1 - t0:.4f},ease:"power2.out",immediateRender:false}},{t0:.4f});')


# ------------------------------------------------------------------ PAGE CARD (a real page, racked in, marks swept)
def page_card(c, t0, t1, src, z, marks=(), mark_t=None, dark=False, focus_frames=6, push=0.05, step=4):
    """A real page edge to edge: opens defocused and racks sharp (REF-1 9.9s), pushes slowly, and the
    highlighter sweeps each measured box in turn (marks = [[x,y,w,h]] in frame px, from OCR / DOM),
    `step` frames apart, a soft click each. Marks live inside the pushed container so they stay on the words."""
    t0, t1 = fr(t0), fr(t1)
    kid = c.uid('pg')
    mk = []
    for k, (x, y, w, h) in enumerate(marks):
        mid = c.uid('pgm')
        mk.append(f'<div id="{mid}" class="ev1-mark{" on-dark" if dark else ""}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"></div>')
        tm = fr(mark_t if mark_t is not None else t0 + focus_frames * F1) + k * step * F1
        c.pre.append(f'gsap.set("#{mid}",{{scaleX:0}});')
        c.at(f'tl.fromTo("#{mid}",{{scaleX:0}},{{scaleX:1,duration:{4 * F1:.4f},ease:"power2.out",immediateRender:false}},{tm:.4f});')
        sfx(c, tm, 'click_soft')
    inner = (f'<div class="ev1-layer ev1-black"><div id="{kid}" style="{FULL};transform-origin:50% 45%">'
             f'<img src="{src}" class="ev1-fill">{"".join(mk)}</div><div class="ev1-vignette"></div></div>')
    c.clip(t0, t1, inner, z)
    c.pre.append(f'gsap.set("#{kid}",{{filter:"blur(14px)",scale:1.0}});')
    c.at(f'tl.fromTo("#{kid}",{{filter:"blur(14px)"}},{{filter:"blur(0px)",duration:{focus_frames * F1:.4f},ease:"power2.out",immediateRender:false}},{t0:.4f});')
    c.at(f'tl.fromTo("#{kid}",{{scale:1.0}},{{scale:{1 + push * (t1 - t0) * 3:.4f},duration:{t1 - t0:.4f},ease:"none",immediateRender:false}},{t0:.4f});')
    return kid


# ------------------------------------------------------------------ CAPTIONS THAT SWITCH WITH THE GROUND
def captions_switch(c, words, segs, z=60, y=None):
    """REF-2: the caption turns black on light pages and white on dark ones, in the same slots. words =
    [(text, onset)]; segs = [(t_start, t_end, 'ink'|'white')]. Every seg lays out ALL the words (so nothing
    re-centres) and shows those already spoken. Ink gets a paper halo so it reads over page text."""
    for a, b, mode in segs:
        a, b = fr(a), fr(b)
        spans = []
        for wtxt, on in words:
            wid = c.uid('w')
            spans.append(f'<span id="{wid}" class="w">{esc(wtxt)}</span>')
            if fr(on) < b:
                c.at(f'tl.set("#{wid}",{{opacity:1}},{max(a, fr(on)):.4f});')
        style = f'top:calc({y} - 0.6 * var(--ev1-cap-size));' if y else ''
        if mode == 'ink':
            style += 'color:var(--ev1-ink);text-shadow:0 0 6px var(--ev1-paper),0 0 18px var(--ev1-paper),0 0 34px var(--ev1-paper);'
        c.clip(a, b, f'<div class="ev1-cap" style="{style}">{"".join(spans)}</div>', z, cls='', style=FULL)
