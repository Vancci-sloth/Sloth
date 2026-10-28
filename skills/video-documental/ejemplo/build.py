"""build.py — WORKED EXAMPLE: the 45 s cold open of an "AI Editor Showdown" video, keyed to the speaker's word onsets.

This is the real build of the first full Editor V1 edit, kept as a reference for how every device is
driven from the words. Its media (company films, pages, NASA footage, the speaker's camera) is NOT in the
kit: read it, don't run it. Start a new video from template/build.py instead.


Every beat is one device from the kit (components/ev1_devices.py + ev1_more.py), sourced
per line (PLAN.md has the beat table and the sources). Times come from work/tx/words.json
(parakeet, no tighten pass: the take is already tight). Two passes: PASS=1 renders the edit;
PASS=2 adds the beats that show the edit itself (the player window plays pass 1, the filmstrip
and the timeline use pass-1 frames, the render log is pass 1's real log).
"""
import json, os, sys
sys.path.insert(0, os.path.join(json.load(open('kit.json'))['skill'], 'components'))
from ev1_more import *          # noqa  (and everything from ev1_devices)

PASS = int(os.environ.get('PASS', '1'))
VO_END = 44.967
DUR = 46.4

W_ = json.load(open('work/tx/words.json'))
WORDS = [(w['w'], w['s']) for w in W_]
WEND = {round(w['s'], 3): w['e'] for w in W_}


def norm(w): return w.strip('.,:?!').lower()


def find(word, after=0.0):
    for w, t in WORDS:
        if norm(w) == norm(word) and t >= after - 1e-6:
            return t
    raise KeyError(word)


def span(first, last, after=0.0):
    out, on = [], False
    for w, t in WORDS:
        if not on and norm(w) == norm(first) and t >= after - 1e-6:
            on = True
        if on:
            out.append((w, t))
            if norm(w) == norm(last):
                return out
    raise KeyError(first)


A = json.load(open('work/assets.json'))           # name -> path, filled by work/prep.py
SIL = [tuple(map(float, l.split())) for l in open('work/silences.txt')]

c = Comp(DUR)
F1 = 1 / FPS
MISSING = []


def has(*ks):
    ok = all(k in A and os.path.exists(A[k]) for k in ks)
    if not ok:
        MISSING.extend(k for k in ks if k not in A)
    return ok


def ph(t0, t1, label, z=1):
    """dev placeholder (must be gone before the final render)"""
    c.clip(t0, t1, f'<div class="ev1-layer" style="background:#2a2a2a"><div style="position:absolute;left:80px;top:80px;font:700 60px var(--ev1-sans);color:#f0f">{esc(label)}</div></div>', z)


T = {}
for key, w, after in [('three', 'three', 0), ('are', 'are', 0), ('claude', 'Claude', 0), ('chatgpt', 'ChatGPT', 0), ('gemini', 'Gemini', 0),
                      ('billions', 'Billions', 0), ('of', 'of', 4.6), ('a1', 'a', 5.5), ('new', 'new', 0), ('every1', 'every', 6), ('and1', 'and', 7),
                      ('single', 'single', 0), ('one1', 'one', 8.3), ('them', 'them', 0), ('says', 'says', 0), ('its', "it's", 0), ('the1', 'the', 9.5),
                      ('best', 'best', 0), ('bench', 'Benchmark', 0), ('charts', 'charts', 0), ('leader', 'leaderboards', 0), ('but1', 'But', 0),
                      ('answers', 'answers', 0), ('really', 'really', 0), ('which', 'Which', 0), ('one2', 'one', 16), ('can', 'can', 0), ('edit1', 'edit', 0),
                      ('a2', 'a', 17), ('and2', 'And', 18), ('weve', "we've", 0), ('seen', 'seen', 0), ('ai2', 'AI', 19), ('editors', 'editors', 0),
                      ('they1', 'They', 0), ('cut', 'cut', 0), ('silence', 'silence', 0), ('they2', 'they', 21.5), ('slap', 'slap', 0), ('some', 'some', 0),
                      ('captions', 'captions', 0), ('on1', 'on', 22.5), ('and3', 'and', 23), ('im', "I'm", 0), ('real', 'real', 0), ('editing', 'editing', 0),
                      ('fast', 'Fast', 0), ('cuts1', 'cuts', 0), ('trans1', 'transitions', 0), ('sound1', 'sound', 27), ('every2', 'every', 27.5),
                      ('picture', 'picture', 0), ('every3', 'every', 28.5), ('landing', 'landing', 0), ('word', 'word', 0), ('so', 'So', 0),
                      ('honestly', 'Honestly', 0), ('you', 'you', 33), ('tell', 'tell', 0), ('but2', 'But', 34), ('this1', 'this', 34), ('the_c', 'the', 35.3),
                      ('the_t', 'the', 35.9), ('the_s', 'the', 36.6), ('the_m', 'the', 37.5), ('i', 'I', 38), ('single2', 'single', 39), ('line', 'line', 0),
                      ('claude2', 'Claude', 40), ('did', 'did', 0), ('and4', 'And', 41), ('day', 'day', 0), ('from', 'From', 0), ('it_', 'it', 43.5),
                      ('better', 'better', 0)]:
    T[key] = find(w, after)
_p = [s for s in SIL if s[0] < T['claude2'] <= s[1] + 0.05][0]
T['drop'] = fr(_p[0] + 0.09)                 # 3 frames into the pause before "Claude" (40.46-40.81): the slam hits the gap
json.dump({k: round(v, 3) for k, v in T.items()}, open('work/beats.json', 'w'), indent=1)

SHOTS = []          # (t0, t1, name) — the edit's own shot list, for the timeline / filmstrip / "every picture"


def shot(t0, t1, name):
    SHOTS.append((fr(t0), fr(t1), name))


# ============================================================ COLD OPEN
# 0.00 "Right now," — a race start, tile-flash reveal from black (REF-1's first move)
e = fr(T['three'])
if has('race_start', 'race_start_still'):
    tend = tile_reveal(c, 0, A['race_start_still'], z=2, seed=3, size=(1920, 1080))
    c.clip(0, tend, '<div class="ev1-layer ev1-black"></div>', z=1)
    broll(c, tend, e, A['race_start'], z=1, rate=0.07, media_start=0.0)
else:
    ph(0, e, 'race_start')
shot(0, e, 'race_start_still')
captions(c, [(span('Right', 'now,'), e)])

# 0.48 "three AI companies" — the three HQs pop on the words, the stack pulls out, white-block shatter
b, e = e, fr(T['are'])
cards = []
for k, (key, x, y, w, rot, word) in enumerate([('hq_anthropic', 450, 520, 640, -4, 'three'), ('hq_openai', 975, 575, 660, 2, 'AI'),
                                                 ('hq_google', 1480, 515, 640, -3, 'companies')]):
    if has(key):
        cards.append((A[key], x, y, w, rot, T['three'] if word == 'three' else find(word, 0.5)))
pop_shatter(c, b, e, cards, z=1)
shot(b, e, 'hq_google')
captions(c, [(span('three', 'companies'), e - 4 * F1)])

# 1.52 "are in a race:" — the race itself, whip-carry into the first name
b, e = e, fr(T['claude'])
if has('race_run'):
    rv = broll(c, b, e, A['race_run'], z=1, rate=0.09)
    whip_out(c, rv, e)
    sfx(c, e - 4 * F1, 'hit', 0.6)
else:
    ph(b, e, 'race_run')
shot(b, e, 'race_run_still')
captions(c, [(span('are', 'race:'), e)])

# 2.43 / 3.00 / 3.80 "Claude, ChatGPT, Gemini." — each maker's own film, its own mark in it, cut on the name
mid_gpt = fr(T['chatgpt']) + 12 * F1
for key, t0_, t1_ in [('film_claude', T['claude'], T['chatgpt']), ('film_openai', T['chatgpt'], mid_gpt),
                      ('film_openai_logo', mid_gpt, T['gemini']), ('film_gemini', T['gemini'], T['billions'])]:
    b, e = fr(t0_), fr(t1_)
    broll(c, b, e, A[key], z=1, rate=0.06, focus_in=5 if key != 'film_openai_logo' else 0)
    sfx(c, b, 'click')
    shot(b, e, key + '_still')
finish(c, fr(T['claude']), fr(T['billions']), z=80, grid=False, vignette=True)
captions(c, [([('Claude,', T['claude'])], fr(T['chatgpt'])), ([('ChatGPT,', T['chatgpt'])], fr(T['gemini'])),
             ([('Gemini.', T['gemini'])], fr(T['billions']))], y='84%')

# ============================================================ THE HYPE
# 4.63 "Billions" — the money strobe: one note per 2 frames, a click on every note (REF-3 semantic strobe)
b, e = fr(T['billions']), fr(T['of'])
notes = [A[f'money_{k}'] for k in (6, 0, 4, 2, 5, 1, 3, 7) if f'money_{k}' in A]
n = max(1, round((e - b) * FPS / 2))
seq(c, [(notes[k % len(notes)], b + 2 * k * F1) for k in range(n)], z=1, t_end=e, rot=4, push=0.08, seed=11)
shot(b, e, 'money_6')
captions(c, [([('Billions', T['billions'])], e, 'big')])

# 5.12 "of dollars," — the real money: a cash counter, then the funding headlines
b, e = e, fr(T['a1'])
if has('cash'):
    broll(c, b, e, A['cash'], z=1, rate=0.08)
else:
    ph(b, e, 'cash')
hl = [A[k] for k in ('headline_0', 'headline_1', 'headline_2') if k in A]
if hl:
    t_h = fr(T['of']) + 6 * F1
    seq(c, [(h, t_h + 4 * k * F1) for k, h in enumerate(hl)], z=2, t_end=e, push=0.05, rot=2, seed=3)
shot(b, e, 'cash_still')
t_h = fr(T['of']) + 6 * F1
captions_switch(c, span('of', 'dollars,', 5), [(b, t_h, 'white'), (t_h, t_h + 4 * F1, 'ink'), (t_h + 4 * F1, t_h + 8 * F1, 'white'),
                                              (t_h + 8 * F1, e, 'ink')], y='88%')     # cash (dark) / Anthropic (light) / TechCrunch (green) / SEC (white)

# 5.76 "a new model every few weeks," — the real release calendar: each launch lands on its date
b, e = e, fr(T['and1'])
if os.path.exists('work/releases.json'):
    R = json.load(open('work/releases.json'))
    land = [b + 4 * F1 + k * max(2, round((e - b - 10 * F1) * FPS / max(1, len(R['events'])))) * F1 for k in range(len(R['events']))]
    calendar(c, b, e, [tuple(m) for m in R['months']], [(ev[0], ev[1], ev[2], ev[3], land[k]) for k, ev in enumerate(R['events'])], z=1)
else:
    ph(b, e, 'calendar')
shot(b, e, 'calendar')
captions(c, [(span('a', 'weeks,', 5.5), e)], on_paper=True, y='90%')

# 7.70 "and every single one of them" — the three CEOs, rack focus in, then all three at once
b, e = e, fr(T['says'])
ceo = [('ceo_dario', T['and1'], T['single']), ('ceo_sam', T['single'], T['one1']), ('ceo_google', T['one1'], T['them'])]
for key, a_, b_ in ceo:
    if has(key):
        broll(c, a_, b_, A[key], z=1, rate=0.06, focus_in=7, media_start=A.get(key + '_ms', 0.0))
    else:
        ph(a_, b_, key)
    sfx(c, a_, 'click')
    shot(a_, b_, key + '_still')
if has('ceo_dario', 'ceo_sam', 'ceo_google'):
    triptych(c, T['them'], e, [(A[k], A.get(k + '_ms', 0.0) + (T['them'] - t_)) for k, t_ in
                               (('ceo_dario', T['and1']), ('ceo_sam', T['single']), ('ceo_google', T['one1']))], z=1)
    sfx(c, T['them'], 'click')
shot(T['them'], e, 'ceo_sam_still')
captions(c, [(span('and', 'one', 7), fr(T['them'])), (span('of', 'them', 8.6), e)])

# 9.20 "says it's the best." — each maker's own page, the highlighter on its own claim; then BEST, red
b, e = e, fr(T['bench'])
claims = [('claim_anthropic', T['says'], False), ('claim_openai', T['its'], True), ('claim_google', T['the1'], False)]
for k, (key, t_, dark) in enumerate(claims):
    t_end = claims[k + 1][1] if k + 1 < len(claims) else e          # Google's page stays on under BEST
    page_card(c, t_, t_end, A[key], z=1, marks=A.get(key + '_marks', []), dark=dark, focus_frames=4, step=3)
    sfx(c, t_, 'click')
    shot(t_, t_end, key)
# "best." — the shock word over Google's page, dimmed (its "#1" still lit underneath)
c.clip(T['best'], e, '<div class="ev1-layer" style="background:rgba(6,6,7,.70)"></div>', z=2)
keyword(c, T['best'], e, 'BEST', z=40, y=560, kind='shock', size=260)
sfx(c, T['best'], 'hit', 0.7)
captions_switch(c, span('says', 'the', 9), [(T['says'], T['its'], 'ink'), (T['its'], T['the1'], 'white'), (T['the1'], T['best'], 'ink')], y='88%')

# 10.64 "Benchmark," — Google's own benchmark bars, on the I/O 2026 stage (moving)
b, e = e, fr(T['charts'])
vseq(c, [(A['bench_io_bars'], b, 0.0)], z=1, t_end=e, rate=0.07, focus_in=5)
shot(b, e, 'bench_io_bars_still')
captions_switch(c, span('Benchmark,', 'Benchmark,'), [(b, e, 'ink')])      # Google's white slide

# 11.36 "charts," — the makers' real benchmark tables and charts on a 3D wall, the camera sweeping (silent, REF-1)
b, e = e, fr(T['leader'])
wall3d(c, b, e, [A[f'benchimg_{k}'] for k in range(7)], z=1, cols=4, tile_w=820)
sfx(c, b, 'click')
shot(b, e, 'benchimg_0')
captions(c, [(span('charts,', 'charts,'), e)])

# 11.92 "leaderboards." — the live leaderboard, racked in, the #1 row marked
b, e = e, fr(T['but1'])
if has('leaderboard'):
    page_card(c, b, e, A['leaderboard'], z=1, marks=A.get('leaderboard_marks', []), dark=True, focus_frames=9, mark_t=find('leaderboards') + 0.35)
else:
    ph(b, e, 'leaderboard')
sfx(c, b, 'click')
shot(b, e, 'leaderboard')
captions(c, [([('leaderboards.', T['leader'])], e)], y='88%')

# ============================================================ THE TURN
# 12.88 "But none of that" — the leaderboard datamoshes out to a black word card; the bed pulls down (mix)
b, e = e, fr(T['answers'])
if has('leaderboard_g0'):
    frames(c, b, [A['leaderboard_g0'], A['leaderboard_g1'], A['leaderboard_g2']], z=5)
c.clip(b + 3 * F1, e, '<div class="ev1-layer ev1-black"></div>', z=1)
sfx(c, b + 3 * F1, 'subtone')
captions(c, [(span('But', 'that'), e, 'serif')])
shot(b, e, 'black')

# 13.60 "answers the questions that I really care about." — the speaker, raw camera (never graded), a hard punch on "really"
b, e = e, fr(T['which'])
broll(c, b, e, 'assets/media/cam_raw.mp4', z=1, rate=0.03, media_start=b, origin='50% 38%', punches=[(T['really'], 1.12)])
sfx(c, T['really'], 'click_soft')
captions(c, [(span('answers', 'questions'), fr(find('that', 14.4))), (span('that', 'about.', 14.4), e)], y='84%')
shot(b, e, 'cam_raw')

# ============================================================ THE QUESTION (hero)
# 15.84 "Which one can edit a video?" — him cut out, standing still while the world behind him swaps maker
# by maker on the words (tile reveals), then becomes archival film editing on "edit"; EDIT huge, red,
# BEHIND his head. In through a double negative (REF-2 chapter entry); a swell peaks on the cut.
b, e = e, fr(T['and2'])
worlds = []
for key, tk in [('world_claude', 'which'), ('world_openai', 'one2'), ('world_gemini', 'can'), ('splice', 'edit1')]:
    if has(key):
        worlds.append(('video', A[key], T[tk], A.get(key + '_still'), A.get(key + '_ms', 0.0)))
if worlds:
    cutout_world(c, b, e, worlds, 'assets/media/matte_a_raw.webm', 465 / 30, z=1, mega=('EDIT', T['edit1'], 330))
else:
    ph(b, e, 'hero worlds')
sfx(c, b, 'riser')
shot(b, e, 'hero')
captions(c, [(span('Which', 'can'), fr(T['edit1'])), (span('a', 'video?', 17), e, 'serif')], y='86%')
finish(c, b, e, z=80, grid=True, vignette=False)   # no darkening on his face

# ============================================================ THE AI EDITORS
# 18.32 "And yes, we've seen AI editors." — platform hop across the real sites, a click per site
b, e = e, fr(T['cut'])
hop = [('site_descript', T['and2']), ('site_capcut', T['weve']), ('site_opus', T['seen']), ('site_captions', T['ai2']),
       ('site_submagic', T['editors']), ('site_veed_silence', T['editors'] + 0.36)]
seq(c, [(A[k], t_) for k, t_ in hop if k in A], z=1, t_end=e, push=0.015, seed=2)
# Captions' own headline, "a professional editor would." — marked inside the page (multiply needs the page as backdrop)
page_card(c, T['ai2'], T['editors'], A['site_captions'], z=2, marks=A['site_captions_marks'], focus_frames=2, push=0.005, step=3,
          mark_t=fr(T['ai2']) + 2 * F1)
for k, t_ in hop:
    shot(t_, t_ + 0.3, k)
modes = {'site_descript': 'white', 'site_capcut': 'ink', 'site_opus': 'white', 'site_captions': 'ink', 'site_submagic': 'ink', 'site_veed_silence': 'ink'}
cuts_ = [t_ for _, t_ in hop] + [e]
captions_switch(c, span('And', 'editors.', 18), [(cuts_[k], min(cuts_[k + 1], fr(T['editors']) + 0.36), modes[k_]) for k, (k_, _) in enumerate(hop[:-1])] +
                [(hop[-1][1], fr(T['editors']) + 0.36 if hop[-1][1] < fr(T['editors']) + 0.36 else hop[-1][1], 'ink')], y='88%')
captions_switch(c, [('They', T['they1'])], [(T['editors'] + 0.36, e, 'ink')], y='88%')

# 20.94 "cut your silence," — HIS OWN take: the real waveform, the real silences flagged, snapped shut
b, e = e, fr(T['they2'])
silence_cut(c, b, e, 'assets/media/vo.wav', (12.4, 24.2), SIL, [b + 3 * F1 + k * 4 * F1 for k in range(6)], z=1,
            clip_name='AI_Editor_Showdown_0.mp4')
shot(b, e, 'silence')
captions(c, [(span('cut', 'silence,'), e)], y='86%')

# 21.76 "they slap some captions on," — the auto-caption page, then the pun: a label machine slapping labels on,
# and the cliché caption (made for this video) slapped on top, one word a time
b, e = e, fr(T['and3'])
if has('site_submagic_cap'):
    still(c, b, T['slap'], A['site_submagic_cap'], z=1, push=1.03)
if has('label'):
    broll(c, T['slap'], e, A['label'], z=1, rate=0.06, media_start=A.get('label_ms', 0.0))
else:
    ph(T['slap'], e, 'label machine')
slap_caps(c, [('they', T['they2']), ('slap', T['slap']), ('some', T['some']), ('captions', T['captions']), ('on', T['on1'])], e, z=60, big='slap')
sfx(c, T['slap'], 'hit', 0.8)
shot(T['slap'], e, 'label_still')

# 23.04 "and that's it." — the end card of a 1945 film; the bed cuts out under it (mix)
b, e = e, fr(T['im'])
if has('theend'):
    broll(c, b, e, A['theend'], z=1, rate=0.03)
shot(b, e, 'theend_still')
captions(c, [(span('and', 'it.', 23), e, 'serif')], y='17%')

# ============================================================ REAL EDITING
# 23.98 "I'm talking about real editing." — him, raw camera; the bed slams back; REAL huge, red, behind his head
b, e = e, fr(T['fast'])
broll(c, b, e, 'assets/media/cam_raw.mp4', z=1, rate=0.035, media_start=b, origin='50% 38%', punches=[(T['real'], 1.14)])
white_flash(c, b, z=90, frames_n=1, sound='impact')
keyword(c, fr(T['real']), e, 'REAL', z=20, x=960, y=330, kind='mega', blur_in=False)
broll(c, fr(T['real']), e, 'assets/media/matte_a_raw.webm', z=30, rate=0.035, origin='50% 38%', start_scale=1.14,
      media_start=fr(T['real']) - 465 / 30)
sfx(c, T['real'], 'hit', 0.8)
captions(c, [(span("I'm", 'about'), fr(T['real'])), (span('editing.', 'editing.'), e)], y='86%')
shot(b, e, 'cam_raw')

# 25.91 "Fast cuts," — blades, one family, 3 frames each, a click each
b, e = fr(T['fast']), fr(T['trans1'])
blades = [A[k] for k in ('blade_0', 'blade_1', 'blade_2', 'blade_3') if k in A]
if blades:
    n = max(1, round((e - b) * FPS / 3))
    vseq(c, [(blades[k % len(blades)], b + 3 * k * F1, A.get(f'blade_{k % len(blades)}_ms', 0.0) + 0.1 * (k // len(blades))) for k in range(n)],
         z=1, t_end=e, rate=0.1)
else:
    ph(b, e, 'blades')
shot(b, e, 'blade_0_still')
captions(c, [(span('Fast', 'cuts,'), e, 'big')])

# 26.60 "transitions," — four of them, back to back, in 20 frames
b, e = e, fr(T['sound1'])
TR = [A.get(k) for k in ('race_start_still', 'hq_google', 'world_claude_still', 'deadheat_full')]
if all(TR):
    still(c, b, b + 2 * F1, TR[0], z=1, push=1.02)
    t2 = tile_reveal(c, b + 2 * F1, TR[1], z=3, seed=7, frames_n=9, size=(1920, 1080))
    s2 = still(c, b + 2 * F1, b + 12 * F1, TR[1], z=2, push=1.03)
    s3 = still(c, b + 12 * F1, b + 16 * F1, TR[2], z=2, push=1.03)
    neg_flash(c, b + 12 * F1, [s3[1]])
    frames(c, b + 16 * F1, [A['tr_g0'], A['tr_g1'], A['tr_g2']], z=5)
    still(c, b + 16 * F1, e, TR[3], z=1, push=1.03)
else:
    ph(b, e, 'transitions')
shot(b, e, 'hq_google')
captions(c, [(span('transitions,', 'transitions,'), e)])

# 27.28 "sound effects," — Foley, 1938: a splash in a tub, then a sound-effects record
b, e = e, fr(T['every2'])
if has('foley', 'foley_2'):
    vseq(c, [(A['foley'], b, 0.0), (A['foley_2'], find('effects', 27), 0.0)], z=1, t_end=e, rate=0.07)
else:
    ph(b, e, 'foley')
shot(b, e, 'foley_still')
captions(c, [(span('sound', 'effects,', 27), e)])

# 27.99 "every picture," — every picture in this video, 2 frames each (filled in pass 2 from pass 1's frames)
b, e = e, fr(T['every3'])
PIC_AT = (b, e)
captions(c, [(span('every', 'picture,', 27.5), e)])

# 28.72 "every sound" — speakers and scopes, round, 3 frames each, a click each
b, e = e, fr(T['landing'])
spk = [A[k] for k in ('speaker_0', 'speaker_1', 'speaker_2', 'scope_0') if k in A]
if spk:
    n = max(1, round((e - b) * FPS / 3))
    vseq(c, [(spk[k % len(spk)], b + 3 * k * F1, A.get(f'speaker_{k % len(spk)}_ms', 0.0)) for k in range(n)], z=1, t_end=e, rate=0.1)
else:
    ph(b, e, 'speakers')
shot(b, e, 'speaker_0_still')
captions(c, [(span('every', 'sound', 28.5), e)])

# 29.71 "landing right on the word." — THIS edit's timeline (pass 2): shots, his words, every sound cue
b, e = e, fr(T['so'])
TL_AT = (b, e)
captions(c, [(span('landing', 'word.'), e)], y='90%')

# ============================================================ WHO WINS
# 31.38 "So who wins?" — the 1953 triple dead heat: three, and no winner
b, e = e, fr(T['honestly'])
if has('deadheat_card'):
    paper_card(c, b, e, A['deadheat_card'], z=1, card_w=600, left=span('So', 'who', 31), right=[('wins?', find('wins'))], invert_in=2)
shot(b, e, 'deadheat_full')

# 32.64 "Honestly," — him
b, e = e, fr(T['you'])
broll(c, b, e, 'assets/media/cam_raw.mp4', z=1, rate=0.04, media_start=b, origin='50% 38%', focus_in=0)
captions(c, [(span('Honestly,', 'Honestly,'), e)], y='86%')
shot(b, e, 'cam_raw')

# 33.22 "you tell me." — the comment box, empty, waiting for you
b, e = e, fr(T['but2'])
comment_box(c, b, e, z=1)
sfx(c, b, 'click')
captions(c, [(span('you', 'me.', 33), e)], y='80%')
shot(b, e, 'comment')

# ============================================================ THIS VIDEO
P1 = 'out/pass1.mp4'            # pass 1's render: the video watching itself (pass 2 only)
P1F = 'work/p1frames'           # pass 1 frames, one per shot
# 34.15 "But this video right here," — this very edit, shrinking into a player in hard steps
b, e = fr(T['but2']), fr(T['the_c'])
if PASS == 2 and os.path.exists('assets/media/pass1_open.mp4'):
    player_window(c, b, e, 'assets/media/pass1_open.mp4', 0.0, z=1, dur_label='0:46')
else:
    ph(b, e, 'player window (pass 2)')
shot(b, e, 'player')
captions(c, [(span('But', 'here,', 34), e)], y='92%')

# 35.71 "the cuts," — every shot of this video on one strip, racing past
b, e = e, fr(T['the_t'])
FILM_AT = (b, e)
captions(c, [(span('the', 'cuts,', 35.3), e)], y='88%')

# 36.05 "the transition," — one, right here: a negative, then the tile-flash reveal onto the hero frame
b, e = e, fr(T['the_s'])
TRANS_AT = (b, e)
captions(c, [(span('the', 'transition,', 35.9), e)], y='88%')

# 36.80 "the sound effects," — the real cue sheet of this video, scrolling (filled after every device has cued)
b, e = e, fr(T['the_m'])
CUES_AT = (b, e)
captions(c, [(span('the', 'effects,', 36.6), e)], y='88%')

# 37.68 "the music." — the bed's own waveform; its hit lands on "music"
b, e = e, fr(T['i'])
bed_wave(c, b, e, 'assets/music/song_full.wav', b + 2.88, z=1)
shot(b, e, 'bedwave')
captions(c, [(span('the', 'music.', 37.5), e)], y='88%')

# 38.40 "I didn't edit a single" — the speaker, raw camera, the song's own break under it; a punch on "single"
b, e = e, fr(T['line'])
broll(c, b, e, 'assets/media/cam_raw.mp4', z=1, rate=0.035, media_start=b, origin='50% 38%', punches=[(T['single2'], 1.13)])
sfx(c, T['single2'], 'click_soft')
captions(c, [(span('I', 'single', 38), e)], y='86%')
shot(b, e, 'cam_raw')

# 39.92 "line of it." — the lines: this build's own code, scrolling
b, e = e, fr(T['drop'])
src_lines = open(__file__).read().splitlines()
k0 = next(i for i, l in enumerate(src_lines) if 'THE QUESTION (hero)' in l)
code_scroll(c, b, e, [esc(l) for l in src_lines[k0:k0 + 34]], z=1, font=30, title='build.py', hl=(6, b + 6 * F1), start_y=180, end_y=-120)
captions(c, [(span('line', 'it.', 39), e)], y='88%')
shot(b, e, 'code')

# ============================================================ CLAUDE DID
# 40.57 → "Claude" — the drop, in the pause before the word: white flash, Claude's own mark on its own paper
b, e = e, fr(T['did'])
white_flash(c, b, z=90, frames_n=2, sound=None)           # the song's own drop is the slam; an impact or click here masked "Claude"
c.clip(b, e, '<div class="ev1-layer ev1-paper"></div>', z=1)
if has('mark_claude_word'):
    cm = img_mark(c, b, e, A['mark_claude_word'], z=2, width=1150, shadow=False)
    c.at(f'tl.fromTo("#{cm}",{{scale:1}},{{scale:1.05,duration:{e - b - 6 * F1:.4f},ease:"none",immediateRender:false}},{b + 6 * F1:.4f});')
shot(b, e, 'claude_word')

# 41.28 "did." — the real session that made this video
b, e = e, fr(T['and4'])
LOG_AT = (b, e)

# ============================================================ DAY ONE
# 41.71 "And this is just day one." — sunrise over the Earth, from orbit
b, e = e, fr(T['from'])
white_flash(c, b, z=90, frames_n=1, sound=None)          # the song's drop slams back here
if has('sunrise'):
    broll(c, b, e, A['sunrise'], z=1, rate=0.05, media_start=A.get('sunrise_ms', 0.0))
else:
    ph(b, e, 'sunrise')
shot(b, e, 'sunrise_still')
captions(c, [(span('And', 'just', 41), fr(T['day'])), (span('day', 'one.', 42), e, 'serif')])

# 43.12 "From here," — liftoff
b, e = e, fr(T['it_'])
if has('rocket'):
    broll(c, b, e, A['rocket'], z=1, rate=0.06, media_start=A.get('rocket_ms', 0.0))
else:
    ph(b, e, 'rocket')
shot(b, e, 'rocket_still')
captions(c, [(span('From', 'here,', 43), e)])

# 43.94 "it only gets better." — him, cut out, in front of the climbing rocket
b, e = e, fr(VO_END)
if has('rocket'):
    cutout_world(c, b, e, [('video', A['rocket_climb'], b, None, 0.0)],
                 'assets/media/matte_b_raw.webm', 1140 / 30, z=1)
else:
    ph(b, e, 'rocket cutout')
captions(c, [(span('it', 'gets', 43.5), fr(T['better']))], y='84%')
keyword(c, fr(T['better']), e, 'better.', z=60, x=960, y=880, kind='key', size=170)
shot(b, e, 'end_cutout')

# 44.97 → end: the three marks, in the order he named them, then black; the bed rings out (mix)
b = fr(VO_END)
c.clip(b, DUR, '<div class="ev1-layer ev1-black"></div>', z=1)
for k, (mk, white, x) in enumerate([('mark_claude', False, 560), ('mark_openai', True, 960), ('mark_gemini', False, 1360)]):
    if has(mk):
        img_mark(c, b + 3 * k * F1, DUR - 10 * F1, A[mk], z=2, width=220, x=x, white=white, blur_in=False)
        sfx(c, b + 3 * k * F1, 'click')
sfx(c, b, 'outro', 0.8)

# ============================================================ PASS-2 FILLS: the edit showing itself
def thumb(t0, t1, name):
    p = f'assets/p1/{int(round((t0 + t1) / 2 * FPS)):05d}.jpg'
    if os.path.exists(p):
        return p
    v = A.get(name)
    return v if v and v.endswith(('.jpg', '.png')) else None


SH = sorted(SHOTS)
TH = [(a, b, thumb(a, b, n)) for a, b, n in SH]
TH = [x for x in TH if x[2]]

# "every picture," — the pictures of this video so far (their clean sources), 2 frames each
b, e = PIC_AT
pics = [A[k] for k in ('race_start_still', 'hq_google', 'film_claude_still', 'money_6', 'headline_0', 'claim_anthropic', 'ceo_dario_still',
                       'bench_io_bars_still', 'leaderboard', 'world_claude_still', 'splice_still', 'site_descript', 'film_gemini_still', 'deadheat_full') if k in A]
seq(c, [(pics[k % len(pics)], b + 2 * k * F1) for k in range(max(1, round((e - b) * FPS / 2)))], z=1, t_end=e, push=0.06, seed=9)

# "landing right on the word." — the timeline of this edit around this very moment
b, e = TL_AT
words3 = [(w['w'], w['s'], w['e']) for w in W_]
edit_timeline(c, b, e, (25.6, 31.6), TH, words3, sorted({round(t, 3) for t, s, g in c.cues}), z=1, sweep=(25.8, 31.3),
              wav='assets/media/vo.wav', hl_word=round(find('word'), 3))

# "the cuts," — every shot of the video on one strip
b, e = FILM_AT
filmstrip(c, b, e, [p for _, _, p in TH], z=1, tw=400)

# "the transition," — a negative, then the tile-flash reveal onto the hero frame
b, e = TRANS_AT
hero = 'assets/img/hero_p1.jpg' if os.path.exists('assets/img/hero_p1.jpg') else A.get('world_claude_still')
if hero:
    s0 = still(c, b, e, hero, z=1, push=1.04)
    neg_flash(c, b, [s0[1]])
    tile_reveal(c, b + 2 * F1, hero, z=2, seed=13, frames_n=9, size=(1920, 1080))

# the references never repeat one click file 80 times: rotate the four click files at their measured gains, ~15% under
VAR = [('ev1kit/click_3', 0.42), ('ev1kit/click_1', 0.33), ('ev1kit/click_4', 0.36), ('ev1kit/click_2', 0.32)]
_ROT = [0]


def rotate_clicks():
    for i, (tq, s_, g_) in sorted(enumerate(c.cues), key=lambda x: x[1][0]):
        if s_ == 'ev1kit/click_3':
            name, g0 = VAR[_ROT[0] % 4]; _ROT[0] += 1
            c.cues[i] = (tq, name, round(g0 * 0.85 * (g_ / 0.42), 3))


rotate_clicks()
# "the sound effects," — the real cue sheet (every cue this build wrote)
b, e = CUES_AT
cue_rows = [f'<span class="str">{t:7.3f}</span>  <span class="key">{esc(s)}</span>  <span class="dim">{g}</span>' for t, s, g in sorted(c.cues)]
code_scroll(c, b, e, cue_rows, z=1, font=30, title='sfx-cues.txt  ·  __NCUES__ cues', start_y=150, end_y=150 - (len(cue_rows) - 18) * round(30 * 1.45))
sfx(c, b, 'click')

# "did." — the session that made this video, ending on the real render line
b, e = LOG_AT
log = json.load(open('work/session_log.json')) if os.path.exists('work/session_log.json') else ['(pass 1)']
code_scroll(c, b, e, [esc(l) for l in log], z=1, font=32, title='claude  ·  ~/editor-v1/videos/ai-editor-showdown',
            hl=(len(log) - 1, b + 5 * F1), start_y=220, end_y=170)

rotate_clicks()
c.write('index.html', 'assets/ev1/tokens.css', title='AI Editor Showdown')
c.write_cues('sfx-cues.txt')
_h = open('index.html').read().replace('__NCUES__', str(len(c.cues))); open('index.html', 'w').write(_h)
json.dump(SH, open('work/shots.json', 'w'))
print('PASS', PASS, 'cues', len(c.cues), 'shots', len(SH), 'missing', sorted(set(MISSING)))
