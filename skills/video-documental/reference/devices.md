# Editor V1 — the device library

> ⚠ **This is the FIRST pass, written before the frame-by-frame breakdowns.**
> `edl/REF-1.md`, `edl/REF-2.md`, `edl/REF-3.md` and `edl/SOUND.md` list every device with
> frame recipes and mark what this file got wrong (pop collage pulls OUT 11%; chapter entry is a
> DOUBLE negative, 2+2 frames; the invert is 1 negative + 1 overexposed frame; REF-1 titles sit in
> FRONT of a cut-out; captions 62px; the strobe is shape-matched; the wall sweep is silent; the
> zoom-through jumps to 2.4x over 2 blurred frames). Where they disagree, they win.
>
> **Added later (`components/ev1_devices.py`):** `broll` (moving clip, steady zoom, focus-in,
> punches, stepped window) · `overlay` (glitch / light-leak textures) · `neg_flash` ·
> `find_hop` (the platform hop: a find bar typing over real pages, "0/0") · caption modes.

Every device was seen in the references at the frames listed, then rebuilt in
`components/ev1_devices.py`. Frame counts are at the reference's own rate (24 or 25fps);
the library converts to 30fps. **Pick the device from what the speaker SAYS**, not from what
is free in the timeline — the table in SKILL.md §2 is the routing.

---

## 1 · Tile-flash reveal  `tile_reveal(c, t, src, z)`
**Seen:** REF-1 0.12–0.46s (street → Golden Gate), 1.88–2.17s, 3.08–3.83s; REF-1 full-res
f6, f9, f49.
**Measured:** a rule-of-thirds grid (lines at 428/855 and 240/480 on 1280×720; the grid
scales with the push). Panes switch one per frame in a shuffled order; each pane is a solid
white box for one frame, then the new picture. ~9 frames end to end. **One click per
pane** — the bed stem shows a click train at exactly 1/frame (0.042s at 24fps).
**Use for:** a chapter open, a world swap, the first frame of the video.
**Build:** put the full still under it from the same `t`; the pane layer ends when the last
pane lands.

## 2 · Cut-out on a changing world  (still + tile_reveal + matte)
**Seen:** REF-1 0–4.5s — Palmer Luckey cut out of a beach photo, a white sticker edge
around him, standing still while the world behind him goes street → San Francisco →
snowy mountains, each swap a tile reveal; the big title sits BEHIND him.
**For a speaker on camera:** the hero device (`cutout_world`, `components/ev1_more.py`).
`scripts/matte.py` runs RVM (downsample 0.3) on the RAW plate and encodes VP9 with alpha,
RGB premultiplied over black. If a mic or a hand edge flickers, harden the alpha in that
region only (smoothstep 0.45–0.65 + a 9px close, feathered region mask). Put the matte
`<video>` ABOVE the title / mega word and BELOW captions.
**Title placement:** the person must touch the type, not erase it. A long ID stacks into
two lines beside the head (e.g. x 1450, y 300, 118px).

## 3 · Pop collage  `pop_collage(c, t0, t1, cards, z)`
**Seen:** REF-2 0.0–1.0s — B&W photos land on a black chalkboard ground one by one, each
preceded by a white box of its size for one frame; REF-3 12–13s (photos on lavender).
**Measured:** a pop every 2 frames (0.08s) and **a click on every pop** (16 clicks in
1.3s, 0.078s mean gap). The stack drifts in slowly.
**Use for:** "three new models", "two things", any count — one card per spoken item, on
the word.

## 4 · 3D wall  `wall3d(c, t0, t1, tiles, z)`
**Seen:** REF-1 41.4–45.3s — a 2×2 of interview tiles tilts into perspective and the camera
sweeps across an endless plane of screenshots, football, F1, a PayPal page, motion-blurred.
REF-3 15.8–17.8s: photos floating at depth.
**Use for:** "everyone", "everywhere", "it showed up all over" — fill it with the real posts
and pages.

## 5 · Paper card  `paper_card(c, t0, t1, src, z, left=, right=)`
**Seen:** REF-1 8.2–9.0s — a small photo on a grey-vignetted white ground, "His" to its
left and "name's" to its right in small ink type; it then punches to full frame through a
white flash.
**Measured:** paper ground is ~11–14% of held runtime across the refs.
**Use for:** quoting one source; a breather after a dark run. Opens on a 2-frame invert.

## 6 · Strobe  `strobe(c, t0, t1, srcs, z, step_frames=3)`
**Seen:** REF-2 83.2–84.6s on "perception": hypnotic spiral, atom, Vitruvian man, globe,
golden spiral, black hole, clock, eye — 2 frames each, a small white/black square hopping
across them. Accounts for 13% of REF-2's runtime as <0.17s shots.
**Use for:** one abstract word ("perception", "no blog posts") — all images on the same
theme, each a different treatment.

## 7 · Rack-focus card  `focus_card(c, t0, t1, src, z, mark=)`
**Seen:** REF-1 9.9s (blur → sharp over ~10 frames) and every interview cut-in.
**Use for:** a post or a document the speaker is citing; optional highlighter on the line.

## 8 · Rebuilt UI / terminal  `terminal(...)`
**Seen:** REF-1 13.0–14.5s — the PayPal "You paid $10,000.00 USD" receipt rebuilt, spinner
then check, the amount highlighted yellow; REF-2 69.6–71.0s — Facebook and ChatGPT inputs
with the query typing; REF-3 26.4s — a profile pill, a "12,000 impressions" ring.
**Rule:** real data only. A rebuilt `/v1/models` list uses real model IDs and only the
fields a source reported; never invent a field you cannot source (leave out a timestamp
whose mapping to each model is unknown).

## 9 · Typewriter  `typewriter(...)`
**Seen:** REF-2 51.8–52.8s "with no ▮" — type on black behind a white block cursor,
broken scanlines flickering.
**Use for:** an error, a quote, a line from a screenshot that contains emojis (retype it).

## 10 · Datamosh  `frames(c, t0, srcs, z)` + `ev1_treat.glitch_frames`
**Seen:** REF-1 f192–195 (8.00–8.12s): RGB-split slices and smeared blocks, 3–4 frames,
landing on the next shot; REF-3 9.12s a psychedelic colour-cycle frame.
**Use for:** "leaked", "broke", "glitch", or any hard turn in the story.

## 11 · Invert flash  (`paper_card(invert_in=2)`, or `filter:invert(1)` on a wrapper)
**Seen:** REF-2 f503–504 (#1 Signaling → cyan negative → cut), f1421, f48; REF-1 f106.
**Measured:** 1–2 frames. A warm image inverts to cyan.
⚠ Do not put a CSS filter on a `<video>`; invert a still or a DOM wrapper.

## 12 · Display words  `keyword(kind='key'|'title'|'shock')`
- **key** — white Inter 700, ~150px, blur-in 6 frames (REF-1 "autonomous", "Silicon Valley",
  "weapons"). The word the speaker stresses.
- **title** — Playfair Display italic, chrome fill, ~136px, drop shadow (REF-2 "#1 Signaling",
  "Game theory", "#3 Information cascade"). Chapter names and proper IDs.
- **shock** — Bodoni Moda caps, **#F2030A**, ~176px, cuts on hard (REF-3 "COCKROACHES",
  "DEAD", "VOICE"; REF-1 "Tony Stark"). Once or twice a minute, never more.
- **mega** — Inter 900 red, ~560px, BEHIND the speaker's head (between plate and matte).
  The stressed word on a face beat.
- A real brand mark (`svg_mark`, or `img_mark` for a raster logo) replaces the key word when
  the speaker names a company.

## 13 · Black card
**Seen:** REF-2 66.2–67.0s ("to", "to join"), 82.1–83.2s ("with the product").
Small caption alone on black. Use for "nothing", "no one", a pause — and drop the bed.

## Not yet built (seen, documented, waiting for a video that needs them)
- **LED dot-matrix** (REF-2 57.0–59.5s): a painting turns into glowing dots, title types,
  a dot starburst zooms through. `ev1_treat.led()` makes the still; the zoom-through is to do.
- **Giant word zoom-through** (REF-3 10.6–11.5s "SURVIVE", 29.8–30.2s "OUTLAST"): a serif
  word scaling past the camera with motion blur.
- **Engraving plate** (REF-3 13.4–15.4s): a scientific illustration on white with
  annotation lines and text blocks.
- **Count-up on footage** (REF-3 46.2–47.2s "€ 20,000!" over a cash counter).
- **Location tag** (REF-3 52.9s "Airbnb office, San Francisco, CA", bottom-left).
- **Line-art overlay** (REF-2 54.2s: thin white geometry drawn over a cheetah).
- **End ident** (all three: "Link's in bio" → two bars assemble the channel mark). Needs
  the creator's own mark — ask once, then build it.

---

## Devices added on the first full edit (`components/ev1_more.py`)
Same contract as the library: every time frame-snapped, explicit z, videos top level,
transforms only, `fromTo` with `immediateRender:false`, and each device writes its own cues.
`from ev1_more import *` also re-exports everything in `ev1_devices`. The 45 s worked example
that uses all of them is `ejemplo/build.py`.

| device | what it is | use it when the speaker… | key args | measured from |
|---|---|---|---|---|
| `seq` | a hard-cut run of stills, each pushed, a click on every image; optional small random rotate/scale per image and a 1-frame white box before each | lists things fast; a shape-matched object strobe (money, blades) | `items=[(src, t_on)]`, `t_end`, `rot`, `push`, `white_box`, `fit`, `dim` | REF-3 money strobe (rotate/push per image); REF-2 pop (white box) |
| `vseq` | a hard-cut run of moving clips on the words, a click per cut | runs through several real things in one phrase | `items=[(src, t_on, media_start)]`, `rate`, `focus_in` | REF-1/2 moving-footage share |
| `pop_shatter` | cards pop one per word (1-frame white box of the card's size first, a click each), the stack pulls OUT ~11%, then breaks into white slabs: 2f slabs, 1f white, 1f smear, with a hit | says a count of things, then turns | `cards=[(src, x, y, w, rot, t_pop)]`, `ground_src`, `shatter` | REF-2 0.00–1.16 (D1) |
| `whip_out` | the zoom accelerates out of a clip over its last frames (×1.15, 1.30, 1.45, 1.83 + motion blur) | carries momentum into the next shot | `vid`, `t_end`, `frames_n` | REF-2 whip-carry (D3) |
| `silence_cut` | a rebuilt editor track of YOUR take: the real waveform of a window, the real silences flagged red, then snapped shut one by one, the track sliding left, a click each | talks about cutting silences / editing | `wav`, `win=(a,b)`, `silences` (silencedetect), `cut_at=[t…]`, `clip_name` | self-reference beat |
| `edit_timeline` | the real timeline of THIS edit: V1 shot thumbs, A1 words at their onsets (+ waveform), FX = every cue; the playhead sweeps and each cut it crosses flashes a guide to the word it lands on, a click each | says "landing on the word", "every cut" | `view=(a,b)`, `clips=[(t0,t1,thumb)]`, `words=[(w,s,e)]`, `cues`, `sweep`, `hl_word` | self-reference beat (two-pass) |
| `comment_box` | a generic comment composer (no brand marks, no invented comments): avatar letter, input line, blinking caret, optional typing | asks the viewer ("you tell me", "let me know") | `placeholder`, `avatar_letter`, `type_text`, `type_at` | rebuilt UI |
| `bed_wave` | the music bed's real waveform scrolling under a fixed red centre line | names "the music" | `wav`, `song_at` (song time at the beat start), `span` | self-reference beat |
| `filmstrip` | every shot of the video as a tilted strip of frames racing past, perforations, a click as it starts | "every shot / every picture / all of it" | `thumbs`, `tw`, `travel` | REF-1 wall, flattened; two-pass |
| `player_window` | this very video shrinking into a generic player in hard steps (100% → 70% → 46%, a soft click each), red progress bar | "this video right here" | `src` (pass-1 render), `media_start`, `steps`, `dur_label` | REF-3 stepped window, reversed; two-pass |
| `calendar` | a wall calendar of real months; each real release lands on its date as a chip (1-frame white box, a click each), the wall pans | "every few weeks", a cadence of real dated events | `months=[(y,m)]`, `events=[(y,m,d,label,t_land)]`, `pan` | rebuilt UI, real dates |
| `code_scroll` | real text (the build's own code, cue sheet, render log) scrolling up in a dark editor pane, optional highlighter on one row | names code, a log, "a single line" | `lines` (html), `title`, `hl=(row, t)`, `start_y`, `end_y` | self-reference beat |
| `slap_caps` | the generic auto-caption look a line mocks (made for the video): one heavy uppercase marker-yellow word at a time with a thick stroke, slapped on over 3 frames, a click each | mocks cliché auto-captions | `items=[(word, t)]`, `t_end`, `big` | made for the video, labelled as such |
| `img_mark` | a real brand mark as an image keeping its own colours, blur-in over 6 frames; `white=True` inverts a black mark | names a company whose mark is raster | `src`, `width`, `x`, `y`, `white` | key-word blur-in |
| `cutout_world` | the hero: the speaker (RVM matte from the raw plate) standing still while the world behind swaps on the words, each swap a tile-flash reveal; optional mega word BEHIND the head. Layers: world z → tiles z+1 → mega z+10 → matte z+20 | names a list of variants; the hero line of a chapter | `worlds=[(kind, src, t_on, still_for_tiles, media_start)]`, `matte_src`, `matte_first_s`, `mega=(text, t_on, y)` | REF-1 0–4.5s |
| `double_neg` | the last 2 frames of the outgoing shot inverted + the first 2 of the incoming inverted | enters a chapter / a hard turn | `t`, `out_ids`, `in_ids` | REF-2 D19 |
| `triptych` | three moving panels side by side (vertical seams), each racking in from blur | names three people/companies at once | `vids=[(src, media_start)]`, `gap`, `rate` | REF-1 S70 (diagonal seam not used: clip-path on `<video>` is not proven in the renderer) |
| `page_card` | a real page edge to edge: opens defocused and racks sharp, pushes slowly, the highlighter sweeps each measured box in turn (a soft click each); marks live inside the pushed container so they stay on the words | quotes a claim from a page | `src`, `marks=[[x,y,w,h]]` (1920×1080 px, measured by OCR/DOM, never eyeballed), `mark_t`, `dark`, `step` | REF-1 9.9s rack focus |
| `captions_switch` | captions that turn ink (with a paper halo) on light pages and white on dark ones, in the same slots | any run that crosses light and dark pages | `words=[(text, onset)]`, `segs=[(t0, t1, mode)]`, mode `'ink'` or `'white'`, `y` | REF-2 news-headline strobe |

A multiply-blend highlighter in its own clip renders opaque (each clip is its own stacking
context) — that is why `page_card` keeps its marks inside the page container.

### Self-reference beats (the video shows itself)
`edit_timeline`, `filmstrip`, `player_window`, the "every picture" strobe and the render-log
`code_scroll` need the video to exist first. Build in two passes:
1. `PASS=1 python build.py` → render `out/pass1.mp4` (keep the render log).
2. `python work/pass2_prep.py out/pass1.mp4 out/pass1.log` (`ejemplo/work/pass2_prep.py`):
   cuts the opening of pass 1 for the player window, one frame per shot (shot middle) for the
   timeline / filmstrip thumbs, and appends the real "rendered in" line to the session log.
3. `PASS=2 python build.py` → render the final. Use clean frames (captions hidden) wherever a
   pass-1 frame is shown full size, or the burned-in captions double up.
