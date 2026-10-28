"""prep.py — every sourced still/clip -> treated 1920x1080 asset; writes work/assets.json (name -> path).
Run from the video folder with the rvm env. Sections are added as sources land; reruns are deterministic."""
import os, sys, json
SK = os.path.join(json.load(open('kit.json'))['skill'], 'scripts')
sys.path.insert(0, SK)
import ev1_treat as T
import cv2, numpy as np

A = json.load(open('work/assets.json')) if os.path.exists('work/assets.json') else {}
SEL = sys.argv[1:]          # optional: only these sections


def still(name, src, look='natural', crop=None, focus=(0.5, 0.5), ht=0.0, vig=0.78, rec=None, size=(1920, 1080)):
    out = f'assets/img/{name}.jpg'
    T.treat(src, out, look, size, focus, crop, ht, vig, rec)
    A[name] = out


def section(n):
    return not SEL or n in SEL


E = 'work/src/editors/sites'
if section('sites'):
    # AI editor sites, the hero area as a 16:9 page (captures are 1440x900 @2x)
    still('site_descript', f'{E}/descript-home.png', crop=(0, 0, 2880, 1620))
    still('site_capcut', f'{E}/capcut-ai-video-editor.png', crop=(0, 120, 2880, 1560))
    still('site_opus', f'{E}/opus-home.png', crop=(0, 0, 2880, 1620))
    still('site_captions', f'{E}/captions-home.png', crop=(0, 0, 2880, 1620))
    still('site_submagic', f'{E}/submagic-home.png', crop=(0, 0, 2880, 1620))
    still('site_veed', f'{E}/veed-home.png', crop=(0, 0, 2880, 1620))
    still('site_veed_silence', f'{E}/veed-silence-remover.png', crop=(0, 0, 2880, 1620))
    still('site_submagic_cap', f'{E}/submagic-ai-caption.png', crop=(0, 0, 2880, 1620))
    still('site_capcut_cap', f'{E}/capcut-auto-captions.png', crop=(0, 120, 2880, 1740))
    still('site_descript_filler', f'{E}/descript-filler-words.png', crop=(0, 0, 2880, 1620))


M = 'work/src/editors'
if section('money'):
    import glob as _g
    for k, f in enumerate(sorted(_g.glob(f'{M}/money/strobe/*.jpg'))):
        still(f'money_{k}', f, look='natural', vig=0.72)
if section('finish'):
    # the 1953 triple dead heat (portrait) -> kept whole as a card on paper; a 16:9 crop for the punch
    import shutil
    im = cv2.imread(f'{M}/photofinish/photofinish-triple-deadheat-1953.jpg')
    cv2.imwrite('assets/img/deadheat_card.jpg', T.vignette(T.look(im, 'natural'), 0.9), [cv2.IMWRITE_JPEG_QUALITY, 94]); A['deadheat_card'] = 'assets/img/deadheat_card.jpg'
    still('deadheat_full', f'{M}/photofinish/photofinish-triple-deadheat-1953.jpg', look='natural', focus=(0.5, 0.5), vig=0.7)


B = 'work/src/brands'
if section('brands'):
    import shutil
    for name, f in [('mark_claude', 'claude_symbol.svg'), ('mark_claude_word', 'claude_logo_wordmark.svg'),
                    ('mark_openai', 'openai_blossom.svg'), ('mark_gemini', 'gemini_icon_2025.svg')]:
        shutil.copy(f'{B}/logos/{f}', f'assets/img/{name}.svg'); A[name] = f'assets/img/{name}.svg'
    still('hq_google', f'{B}/hq/google_googleplex_logo_2016.jpg', look='natural', focus=(0.45, 0.45), vig=0.8)
    # OpenAI's Pioneer Building (HaeB, CC BY-SA 4.0) — the demo's treated still, reused
    shutil.copy('../oct20-editor-v1-demo/assets/img/hq.jpg', 'assets/img/hq_openai.jpg'); A['hq_openai'] = 'assets/img/hq_openai.jpg'


import ev1_clip as C
import subprocess


def clip(name, src, ss, dur, look='natural', speed=1.0, focus=(0.5, 0.5), zoom=1.0, grain=0, still_too=False):
    out = f'assets/broll/{name}.mp4'
    C.make(src, out, ss, dur, look, speed, focus, zoom, grain)
    A[name] = out
    if still_too:
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', out, '-vframes', '1', '-q:v', '2', f'assets/img/{name}_still.jpg'], check=True)
        A[name + '_still'] = f'assets/img/{name}_still.jpg'


BC = 'work/src/brands/clips'
DD = '../oct20-editor-v1-demo/work/src/stock'
if section('brandclips'):
    clip('film_claude', f'{BC}/ant_sonnet55_title_logo.mp4', 3.45, 0.80, still_too=True)        # Claude logo over Earth (Sonnet 5.5 film)
    clip('film_openai', f'{BC}/oai_gpt6_chatgpt_end.mp4', 2.55, 0.85, still_too=True)          # GPT-6 in ChatGPT on a phone
    clip('film_openai_logo', f'{DD}/yt_devday26_9.mp4', 2.55, 0.60, still_too=True)            # the OpenAI mark, DevDay 2026
    clip('film_gemini', f'{BC}/gem_argon_title.mp4', 2.55, 0.95, still_too=True)               # "gemini" -> "4" (Gemini 4 film)
    clip('ceo_dario', f'{BC}/dario_cwc26_conv_218.mp4', 9.55, 1.70, still_too=True)            # lower third: Dario Amodei, Co-Founder and CEO
    clip('ceo_sam', f'{BC}/sam_devday26_astra_claim.mp4', 1.00, 1.25, still_too=True)          # DevDay 2026 close-up
    clip('ceo_google', f'{BC}/sundar_io26_hello_closeup.mp4', 5.55, 0.90, still_too=True)      # I/O 2026, name pill "Sundar Pichai"
    clip('bench_io_bars', f'{BC}/sundar_io26_flash_claim.mp4', 19.2, 1.00, look='natural', zoom=1.25, focus=(0.42, 0.40), still_too=True)
    clip('bench_io_aa', f'{BC}/sundar_io26_bestmodels.mp4', 7.6, 0.80, look='natural', zoom=1.25, focus=(0.42, 0.38), still_too=True)
    clip('world_claude', f'{BC}/ant_fable51_wordmark_end.mp4', 2.40, 0.70, still_too=True)     # ANTHROP\C types on over clouds
    clip('world_openai', f'{BC}/oai_gpt6_chatgpt_end.mp4', 0.60, 0.50, still_too=True)
    clip('world_gemini', f'{BC}/gem_argon_title.mp4', 4.80, 0.60, still_too=True)


P = 'work/src/pages'


def page(name, src, x0, y0, cw, marks_src=(), look='natural', vig=0.8):
    """crop a 16:9 window (cw wide) from a capture, scale to 1920x1080; marks_src = OCR boxes in capture px -> out px"""
    ch = round(cw * 9 / 16); sc = 1920 / cw
    still(name, src, look=look, crop=(x0, y0, x0 + cw, y0 + ch), vig=vig)
    A[name + '_marks'] = [[round((x - x0) * sc - 6), round((y - y0) * sc - 4), round(w * sc + 12), round(h * sc + 8)] for x, y, w, h in marks_src]


if section('pages'):
    # Anthropic, Fable 5.1 launch: "They're the world's / most advanced models for coding and knowledge work"
    page('claim_anthropic', f'{P}/claim_anthropic_fable51.png', 505, 420, 1520, [(1524, 729, 210, 63), (722, 803, 600, 64)])
    # OpenAI, GPT-6 Astra launch: "the world's most intelligent and aligned model."
    page('claim_openai', f'{P}/claim_openai_astra.png', 560, 420, 1520, [(1158, 725, 710, 41)])
    # Google, Gemini 4 Argon GA post: "ranking #1 on the Vals Index"
    page('claim_google', f'{P}/claim_google_argon_ga.png', 505, 400, 1520, [(1304, 777, 408, 34)])
    # LMArena text leaderboard, Oct 20 2026: #1 Gemini 4 Argon (High) 1524, preliminary
    page('leaderboard', f'{P}/board_lmarena_text_top10.png', 40, 330, 1440, [(100, 555, 1330, 75)])
    for k in range(3):
        pass


ST = 'work/src/stock'
if section('stock'):
    clip('race_start', f'{ST}/L01_nr1947_belmont_gate_break.mp4', 0.15, 0.70, look='mono', still_too=True)    # 1947 Belmont, the gate breaks
    clip('race_run', f'{ST}/L02_mk14898_harness_race_headon.mp4', 2.0, 1.00, look='natural', zoom=1.12)        # three trotters, head on
    clip('cash', f'{DD}/mk_45703.mp4', 11.0, 0.80, look='natural', zoom=1.1)
    clip('splice', f'{ST}/L04_L06_ar_splicer_press_cut.mp4', 2.90, 1.50, look='mono', still_too=True)          # film splicer, the blade presses ~0.3s in
    clip('label', f'{ST}/L05_ar_ford1919_hand_labeling_cans.mp4', 0.30, 1.30, look='mono', zoom=1.08)           # Ford Educational 1919
    clip('blade_0', f'{ST}/L06_mk43055_knife_chop.mp4', 0.90, 0.50, look='teal')
    clip('blade_1', f'{ST}/L06_mk14776_scissors_fabric.mp4', 1.00, 0.50, look='natural')
    clip('blade_2', f'{ST}/L06_mk48517_craft_knife_paper.mp4', 3.40, 0.50, look='warm')
    clip('blade_3', f'{ST}/L04_L06_ar_splicer_press_cut.mp4', 3.10, 0.50, look='mono')
    clip('foley', f'{ST}/L07_ar_botm_foley_water_tub.mp4', 0.20, 0.60, look='mono')                          # Back of the Mike, 1938
    clip('foley_2', f'{ST}/L07_ar_botm_sfx_record_a.mp4', 0.30, 0.60, look='mono')
    clip('speaker_0', f'{ST}/L08_mk32411_speaker_cone.mp4', 2.0, 0.45, look='natural')
    clip('speaker_1', f'{ST}/L07_ar_botm_sfx_record_b.mp4', 0.5, 0.45, look='mono')
    clip('speaker_2', f'{ST}/L07_mk46722_needle_on_vinyl.mp4', 3.0, 0.45, look='warm')
    clip('scope_0', f'{ST}/L08_ar_nos_oscilloscope_sine.mp4', 7.0, 0.45, look='natural')
    clip('sunrise', f'{ST}/L10_nasa_iss_sun_on_limb_REVERSED.mp4', 2.80, 1.50, look='natural')               # ISS, sun on the limb (played backwards)
    clip('rocket', f'{ST}/L11_nasa_saturnv_liftoff_tower.mp4', 2.60, 0.95, look='natural')                  # Saturn V clears the tower
    clip('rocket_climb', f'{ST}/L11_nasa_saturnv_climb.mp4', 8.20, 1.30, look='natural')
    clip('fx_burn', f'{ST}/L12_mk47259_film_burn_red.mp4', 0.70, 0.60, look='natural')
    clip('fx_leak', f'{ST}/L12_mk48011_light_leak.mp4', 1.0, 1.00, look='natural')
    clip('fx_glitch', f'{DD}/mk_4111.mp4', 0.50, 1.20, look='natural')


if section('benchimg'):
    import glob as _g
    for k, f in enumerate(['bench_anthropic_opus55_tb4_chart.png', 'bench_openai_astra_coding_table.png', 'board_aa_index_home.png',
                           'bench_anthropic_opus55_table.png', 'bench_openai_astra_tbsci_chart.png', 'board_aa_score_vs_release.png',
                           'bench_openai_astra_computeruse_table.png']):
        im = cv2.imread(f'{P}/{f}'); h, w = im.shape[:2]
        # tiles keep their own aspect; written as-is (wall3d covers them into 16:10 cells, top-anchored)
        out = f'assets/img/benchimg_{k}.jpg'; cv2.imwrite(out, T.look(im, 'natural'), [cv2.IMWRITE_JPEG_QUALITY, 90]); A[f'benchimg_{k}'] = out


if section('headlines'):
    # "of dollars," — three real billion-dollar headlines, cropped tight on the figure; the figure marked (baked: 4 frames each)
    for k, (f, x0, y0, cw, box) in enumerate([('money_anthropic_seriesh.png', 600, 60, 1360, (1296, 364, 151, 71)),
                                              ('money_tc_openai_122b.png', 1260, 170, 1300, (1636, 569, 222, 74)),
                                              ('money_sec_alphabet_80b.png', 560, 0, 1440, (1026, 115, 125, 37))]):
        im = cv2.imread(f'{P}/{f}')
        x, y, w, h = box
        roi = im[y - 6:y + h + 6, x - 8:x + w + 8].astype(np.float32)
        im[y - 6:y + h + 6, x - 8:x + w + 8] = (roi * (np.array([74, 224, 255], np.float32) / 255)).astype(np.uint8)   # marker #FFE04A, multiply
        ch = round(cw * 9 / 16)
        still(f'headline_{k}', im[y0:y0 + ch, x0:x0 + cw], look='natural', vig=0.78)

json.dump(A, open('work/assets.json', 'w'), indent=1)
print(len(A), 'assets')
