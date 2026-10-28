# Editor V1 — the sound of the references, and the kit synthesised to match it

What the three reference mixes actually do, measured, and how the kit's sounds were built to
match. No audio from the references ships in this kit.

Refs: **T1** = REF-1, a founders story (78.4 s, 24 fps); **T2** = REF-2, a game-theory
explainer (93.6 s, 25 fps); **T3** = REF-3, a company-origin story (70.5 s, 25 fps). Frames,
cuts and stems were all measured from the same files, so times line up.

## 0 · Method
1. `demucs htdemucs` 4-stem (drums / bass / other / vocals) and the 2-stem no-vocals mix.
2. Stacked stem spectrograms with frame thumbnails and cut markers, read window by window
   around every visual
   device (tile reveals, pop-ins, cards, glitch, explosion, typing, crowd, cash, logo sting).
3. An event pass over the stems: clicks (>4 kHz transients < 20 ms, 1 ms
   resolution) vs every frame-level visual change, click trains, drops, swells into cuts,
   bed level under title cards, cut-to-drum-onset offsets — each against a shuffled-timeline
   chance baseline.
4. The cleanest example of each class was measured (length, transient offset, 20 ms RMS peak
   vs the narrator, spectral centroid, envelope, click count and spacing) — 47 candidates, 22
   kept as targets. A REPET-SIM music/SFX split was tried and does NOT separate these beds —
   they are not strict loops.

## 1 · What the sound is (headline)
- **The music carries the mix, the effects are few and specific.** Bed vs narrator (median,
  RMS): T1 −1.6 dB, **T3 −0.1 dB (as loud as the voice)**, T2 −11.5 dB.
- **Cuts are NOT cut on the beat.** Held cuts landing within ±40 ms of a drum onset: T1 41 %
  (chance 50 %), T2 46 % (44 %), T3 45 % (46 %). The picture follows the words; the bed runs
  underneath. (The earlier "69 % of onsets on cuts" figure was hats + dense cutting, not sync.)
- **The editorial SFX are clicks, placed on frames.** The loudest 30 % of clicks sit on a
  visual change 80 % of the time in T1 (chance 23 %), 61 % in T2 (34 %). Train clicks land
  **+4 to +14 ms after the visual change** (median; IQR within ±20 ms) — on the frame.
- **Structure is made with the bed's level, not with booms:** drops to silence under a
  punchline, the bed thinned under black text cards, swells of 20–33 dB into the cut that
  follows a dip, a near-silent ident, the beat slamming in on the first content cut.
- **No diegetic sound was found** where the footage invites it (crowd wall T2 63–65 s,
  ChatGPT typing T2 69–71 s, cash counter T3 46 s, rocket/fire T3 58–61 s, F1 T2 53–56 s).
  One possible exception: a broadband swell on the T1 explosion (29.3–30.4 s, "other" stem).
- **No whoosh on moves.** The T1 3D-wall sweep (41–45 s) and the T3 3D cards have no whoosh;
  the only swish found is the one INTO a chapter title (T2 19.2–19.5 s).

## 2 · The grammar (class → visual event)
| visual event | sound | timing | measured in |
|---|---|---|---|
| tile-flash reveal (panes 1/frame) | **click train at 1/frame** (0.042 s @24) | each click on its pane's frame, +0–15 ms | T1 0.14–0.47, 1.89–2.25, 3.06–3.39 |
| photo / card pop-ins | **click per pop**, trains at 0.08 s (1 per 2 frames) | on the pop frame | T2 0.09–0.85, 7.59–8.15, 25.5–26.3, 37.7–38.2, 63.0–63.5 |
| strobe / fast cut burst on one phrase | **click per image**, 0.04–0.08 s, up to 23 in a row | on each cut | T3 18.8–19.8, 24.5–25.5, 55.1–56.4 |
| black text card (T2 style) | **bed pulled down 4–10 dB** below its running level (−15 to −22 dB vs voice); a **sustained sub tone** under chapter cards | whole card | T2 10.4, 33.3, 43.5, 44.4, 57.6, 66.0; sub under "#1" 18.7–19.4 |
| chapter title reveal | **swish into it** (transient = the cut) + a hit with a long reverb tail | swish peaks ON the cut | T2 19.18–19.52, 19.44 |
| a punchline / confession line | **full drop** of the bed (−36 dB vs voice), voice alone; music re-enters with a hit on the next line | drop starts on the line, re-entry on the next cut | T2 77.9–79.75 ("I hate, hate, hate being left out") → 79.88 "Notice" |
| a hard turn ("But instead…") | **dip, then a 20–33 dB swell that peaks on the cut** | swell 0.3–2.0 s, ends on the cut | T1 16.5 → 17.46; T1 55.8 → 57.46; T2 61.2 → 62.24; T2 37.9 → 40.0 |
| datamosh / glitch cut | **glitch burst** 0.15–0.27 s | over the 3–4 glitch frames | T1 7.93–8.20 |
| ident (the channel's production card) | swell + 4-click stutter, then **near-silence under the logo**, then the beat slams in on the first content cut | slam ON the cut out of the ident | T2 8.2–9.05 |
| logo / UI reveal | **noise riser** under it, cut when the reveal ends | — | T2 69.95–71.17 (ChatGPT logo) |
| outro "Link's in bio" → two-bar mark | music outro swell / hits, a click stutter (12 at 17 ms) on the bars, bed drops to silence after | on the mark | T1 76.8–78.4, T2 92.2–93.5, T3 66.9–68.7 |
| opening | T2: sub rumble + click trains, no beat until the ident; T1/T3: the beat from frame 0 | — | |

## 3 · Density and level
| | T1 | T2 | T3 |
|---|---|---|---|
| bed vs narrator (median RMS) | −1.6 dB | −11.5 dB | −0.1 dB |
| click trains / min | 4.6 | 9.6 | 15.3 |
| train clicks / min | 30 | 55 | 121 |
| strong swells into cuts (≥20 dB) / min | 4.6 | 5.8 | 0.9 |
| drops / min | 2.3 | 5.8 (+ the 1.85 s full drop) | 0.9 |
| click level (20 ms RMS peak vs narrator) | −4.5 to −5.7 dB | −5.9 to −7.2 dB | −1.6 to −3.2 dB |
| strongest periodicity / feel | 62 (124) BPM | 115 BPM | 124 BPM |
Clicks are not quiet texture in these mixes: they sit only ~2–7 dB under the voice.

## 4 · Music, per ref (describe only — do NOT reuse these tracks)
- **T1** — cinematic trap at ~62/124 BPM: tonal piano/strings pad (horizontal lines in
  "other"), 808 bass, reverbed snares, hats; continuous from frame 0, almost as loud as the
  voice. Shape: short dips before reveals (9.55–9.85 before "Palmer Luckey", −7 dB), a deep
  dip on "page they didn't like" (16.5–16.7, −21 dB) followed by a 33 dB swell into "But
  instead" (17.46); dips 54.35–54.65 and 67.0–67.25; outro swell under the logo.
- **T2** — dark, sparse, staccato ~115 BPM: no beat for the first 8.6 s (sub rumble, click
  trains, textures), a swell + stutter, a near-silent ident, the beat slams in on the first
  content cut (9.05). Big reverb-tail hits with silence between; a sustained sub tone under
  black chapter cards; new pad section at "#1" (18.7). Full drop under "I hate, hate, hate
  being left out", re-entry on "Notice". Ends in short drops on "Link in bio".
- **T3** — driving drum'n'bass/trap ~124 BPM, dense hats, continuous and loud (≈ voice level)
  from frame 0 to the outro; editorial click trains on top of it on every strobe. One drop,
  at the very end (69.8–70.45, −37 dB) after the logo stutter.
**For a bed:** pick a dark cinematic trap / hip-hop instrumental 115–125 BPM with a sparse
intro and a clear drop, place its drop on the first content cut, and mix it 0–5 dB under the
voice (T1/T3) — or ~11 dB under for a T2-style sparse piece. Cut it, don't duck it, for drops.

## 5 · The kit (`sfx/ev1kit/`, synthesised by `scripts/synth-sfx.py`)
22 files, 48 kHz, each synthesised in code to the measured length, transient offset (`peak ms`
= the pre-roll) and 20 ms RMS level of its reference class, so the `SND` gains in
`components/ev1_devices.py` reproduce the reference level relation against a −20 LUFS voice.
`sfx/peaks.json` records what was written.
- `clicktrain_1..4` (tile reveal 1/frame ×2, pop-ins 0.08 s, strobe 0.08 s) — same click count
  and spacing as the reference trains
- `click_1..4` single clicks
- `subtone_1` (under a black chapter card) · `subtone_2` (opening rumble)
- `subboom_1` (long sub under a black card)
- `riser_1..3` (swell into a cut; noise riser under a logo reveal)
- `swish_1` (into a chapter title) · `glitch_1` (datamosh)
- `impact_1..2` (single hard hit; beat slam after a silence) — most "impacts" at cuts in the
  references were just the beat's kicks, so only two classes were kept
- `explosion_1` (footage-matched only) · `sweepdown_1` · `outro_1..2`
Not found in any ref (so not in the kit): camera shutter, typing, cash register, crowd,
record scratch, tape stop, heartbeat, film projector, whoosh-on-move.

## 6 · Swapping sounds
Drop your own licensed sounds into `sfx/ev1kit/` under the same names to change the palette;
keep each transient at the same offset or update its pre-roll in `SND`. Click trains are
trivially rebuilt from a single licensed click placed per frame. Music: none ships — bring a
track you have the rights to.

## 7 · What a first draft gets wrong (ranked)
A typical first draft: synthetic 18 ms ticks on every pop, a low hit on every flash, a
keyboard sound on the terminal, a whoosh on the wall, one flat bed with a single drop.
1. **Clicks too quiet and too uniform** — the reference clicks are a broadband snap sitting
   only 2–7 dB under the voice, in regular trains locked to frames (1/frame on tile reveals,
   0.08 s on pops/strobes). Use `clicktrain_*`/`click_*` at the `SND` gains.
2. **A low "hit" on every flash/title** — the references almost never boom on a cut. Their
   weight comes from the BED: dips, a 20–33 dB swell that peaks on the cut, the beat slamming
   back after a silence. Replace most hits with swell-into-cut (`riser_1`) or nothing.
3. **A bed that never drops** — T1/T3 run the bed at voice level; T2 drops it under black
   cards and cuts it to silence under the punchline. Cut, don't duck: a full drop under a
   "nothing." line (voice alone, the beat re-entering on the next line), and pull the bed
   down under a black card.
4. **No swish into the hero title** — the title reveal gets `swish_1` peaking on the cut +
   `subtone_1` under the black/terminal card before it.
5. **No intro/ident shape** — the refs open on a beat from frame 0 (T1/T3) or on a sub rumble +
   click trains with the beat slamming on the first content cut (T2). Don't fade the bed in.
6. **Whoosh on the 3D wall** — the references' wall sweep is silent; drop the whoosh (or
   replace it with the click train of the cards landing).
7. **Keyboard on the terminal** — no typing sounds exist in the refs; a click per revealed
   line (or nothing) is closer.

## Appendix · event tables (from the event pass)

### T1  (narrator speech RMS -27.8 dBFS in the stem)

**Click trains** (≥4 clicks, gaps ≤0.12 s; >4 kHz transients <20 ms on the drums stem)

| t0–t1 (s) | clicks | gap (s) | said |
|---|---|---|---|
| 0.14–0.47 | 7 | 0.042 | This is the |
| 0.79–0.98 | 4 | 0.065 | most powerful |
| 1.89–2.25 | 10 | 0.042 | Silicon Valley |
| 3.06–3.39 | 9 | 0.042 | And he's |
| 16.36–16.53 | 5 | 0.030 | page they |
| 51.17–51.34 | 4 | 0.052 |  |

**Drops** (bed >14 dB under its 3 s median for ≥0.2 s)

| t0–t1 (s) | depth dB | music back on a cut | said |
|---|---|---|---|
| 16.50–16.70 | 20 | no |  |
| 54.35–54.65 | 16 | no | and |
| 67.00–67.25 | 19 | yes | startups |

**Swells into cuts** (bed rising ≥20 dB, peaking within 0.15 s of the cut)

| cut (s) | rise length (s) | rise dB | said |
|---|---|---|---|
| 17.38 | 0.95 | 24 | page they didn't like. But instead |
| 17.46 | 0.90 | 33 | they didn't like. But instead |
| 56.25 | 0.50 | 24 | them. And its |
| 56.33 | 0.65 | 26 | them. And its |
| 57.46 | 1.70 | 27 | them. And its first customer was the |
| 68.71 | 1.70 | 22 | startups on Earth even get to exist. |

### T2  (narrator speech RMS -29.9 dBFS in the stem)

**Click trains** (≥4 clicks, gaps ≤0.12 s; >4 kHz transients <20 ms on the drums stem)

| t0–t1 (s) | clicks | gap (s) | said |
|---|---|---|---|
| 0.09–0.41 | 6 | 0.079 | The worst |
| 0.54–0.85 | 6 | 0.077 | thing you |
| 1.01–1.27 | 6 | 0.040 | you can do |
| 1.97–2.08 | 4 | 0.036 | building a |
| 4.90–5.14 | 6 | 0.042 | being |
| 7.59–8.15 | 9 | 0.080 | wins. |
| 8.27–8.37 | 4 | 0.015 |  |
| 9.20–9.41 | 5 | 0.054 |  |
| 13.36–13.60 | 4 | 0.080 | worth owning. |
| 25.51–25.83 | 5 | 0.080 | badge. |
| 25.95–26.27 | 5 | 0.080 | A founder |
| 37.70–38.16 | 8 | 0.080 | landed in the |
| 63.04–63.48 | 8 | 0.079 | follows. |
| 71.53–71.86 | 5 | 0.080 | read the research. |
| 71.98–72.14 | 4 | 0.067 | research. |

**Drops** (bed >14 dB under its 3 s median for ≥0.2 s)

| t0–t1 (s) | depth dB | music back on a cut | said |
|---|---|---|---|
| 6.55–6.90 | 20 | yes | decides |
| 81.55–81.90 | 21 | no | to do |
| 82.90–83.30 | 17 | yes | They're |
| 87.55–87.80 | 22 | no |  |
| 87.85–88.15 | 24 | yes | never |
| 89.15–89.35 | 24 | no | what |
| 90.75–90.95 | 23 | yes | Link |
| 91.05–91.25 | 27 | no | in |
| 93.05–93.40 | 23 | no |  |

**Swells into cuts** (bed rising ≥20 dB, peaking within 0.15 s of the cut)

| cut (s) | rise length (s) | rise dB | said |
|---|---|---|---|
| 14.12 | 0.30 | 31 | owning. And |
| 24.40 | 0.65 | 23 | That's the whole power |
| 28.28 | 0.65 | 21 | by Y Combinator |
| 39.76 | 1.95 | 25 | landed in the New World and burned his own |
| 40.00 | 2.00 | 25 | landed in the New World and burned his own ships, |
| 49.40 | 0.35 | 24 | on his own credit |
| 57.00 | 0.30 | 25 | Last |
| 62.24 | 2.00 | 27 | into something, everyone else stops thinking |
| 79.88 | 0.30 | 32 | Notice |

### T3  (narrator speech RMS -21.3 dBFS in the stem)

**Click trains** (≥4 clicks, gaps ≤0.12 s; >4 kHz transients <20 ms on the drums stem)

| t0–t1 (s) | clicks | gap (s) | said |
|---|---|---|---|
| 0.01–0.21 | 4 | 0.080 | The best way to |
| 0.34–0.82 | 7 | 0.091 | way to build a startup |
| 6.14–6.35 | 4 | 0.076 | time. |
| 10.06–10.27 | 5 | 0.053 | survive |
| 15.78–15.97 | 5 | 0.053 | entire |
| 16.81–17.09 | 5 | 0.061 | sits in one |
| 18.76–19.78 | 15 | 0.080 | and one budget cut makes you |
| 23.27–23.51 | 5 | 0.060 | keep pulling |
| 24.51–25.51 | 16 | 0.080 | you're spending or not. Company |
| 29.22–29.62 | 7 | 0.061 | outlast |
| 30.54–30.84 | 5 | 0.080 | Cockroaches |
| 33.81–34.03 | 4 | 0.080 | when funding |
| 44.84–45.20 | 9 | 0.043 | we worked with |
| 45.34–45.44 | 4 | 0.023 | with had |
| 51.21–51.49 | 6 | 0.040 | actually |
| 51.89–52.17 | 6 | 0.040 | looks like. When |
| 55.10–56.42 | 23 | 0.051 | founders sold $40 cereal |
| 67.93–68.22 | 12 | 0.017 |  |

**Drops** (bed >14 dB under its 3 s median for ≥0.2 s)

| t0–t1 (s) | depth dB | music back on a cut | said |
|---|---|---|---|
| 69.80–70.45 | 25 | yes |  |

**Swells into cuts** (bed rising ≥20 dB, peaking within 0.15 s of the cut)

| cut (s) | rise length (s) | rise dB | said |
|---|---|---|---|
| 41.92 | 0.25 | 22 | The one |
### Measured sound events (47 candidates — the targets the synthesised kit was matched to; no audio ships)
Columns: label · class · ref · source seconds · stem · length ms · transient ms · 20 ms
RMS peak vs narrator (dB) · note. Not used as targets: `click_T2_7.83`, `click_T3_51.48`
(−23 to −29 dB, too weak), `click_T3_19.69`, `click_T3_56.30` (hat bleed), both `stutter_*`
(noisy), the beat-kick `impact_*` from T1 7.98, T2 22.26 / 52.98 / 88.06, T3 2.38 / 8.14.

| file | class | ref | s | recipe | ms | peak ms | dB vs voice | note |
|---|---|---|---|---|---|---|---|---|
| `click_T1_3.14.wav` | click | T1 | 3.14–3.21 | drums_hp1000 | 76 | 40 | -5.7 | train click on a visual change (17 ms) |
| `click_T1_2.22.wav` | click | T1 | 2.22–2.29 | drums_hp1000 | 76 | 0 | -5.6 | train click on a visual change (15 ms) |
| `click_T1_2.13.wav` | click | T1 | 2.13–2.21 | drums_hp1000 | 76 | 40 | -5.6 | train click on a visual change (15 ms) |
| `click_T1_0.17.wav` | click | T1 | 0.17–0.25 | drums_hp1000 | 76 | 5 | -4.5 | train click on a visual change (10 ms) |
| `click_T2_0.41.wav` | click | T2 | 0.41–0.48 | drums_hp1000 | 76 | 5 | -5.9 | train click on a visual change (14 ms) |
| `click_T2_0.77.wav` | click | T2 | 0.77–0.84 | drums_hp1000 | 76 | 0 | -7.2 | train click on a visual change (15 ms) |
| `click_T2_0.33.wav` | click | T2 | 0.33–0.40 | drums_hp1000 | 76 | 5 | -7.2 | train click on a visual change (14 ms) |
| `click_T2_7.83.wav` | click | T2 | 7.83–7.90 | drums_hp1000 | 76 | 65 | -29.1 | train click on a visual change (9 ms) |
| `click_T3_0.45.wav` | click | T3 | 0.45–0.53 | drums_hp1000 | 76 | 5 | -3.2 | train click on a visual change (25 ms) |
| `click_T3_19.69.wav` | click | T3 | 19.69–19.77 | drums_hp1000 | 76 | 35 | -2.6 | train click on a visual change (19 ms) |
| `click_T3_56.30.wav` | click | T3 | 56.30–56.37 | drums_hp1000 | 76 | 5 | -6.5 | train click on a visual change (18 ms) |
| `click_T3_51.48.wav` | click | T3 | 51.48–51.56 | drums_hp1000 | 76 | 50 | -23.0 | train click on a visual change (11 ms) |
| `clicktrain_T1_1.86.wav` | clicktrain | T1 | 1.86–2.30 | drums_hp1000 | 439 | 25 | -5.4 | tile reveal, 1/frame |
| `clicktrain_T1_3.03.wav` | clicktrain | T1 | 3.03–3.42 | drums_hp1000 | 390 | 20 | -5.5 | tile reveal, 1/frame |
| `clicktrain_T2_0.05.wav` | clicktrain | T2 | 0.05–0.90 | drums_hp1000 | 850 | 40 | -5.9 | photo pop-ins, 1 per 2 frames |
| `clicktrain_T2_7.55.wav` | clicktrain | T2 | 7.55–8.20 | drums_hp1000 | 649 | 20 | -7.0 | speedometer cuts |
| `clicktrain_T3_18.72.wav` | clicktrain | T3 | 18.72–19.84 | drums_hp1000 | 1120 | 10 | -1.6 | strobe on "one budget cut", 1 per 2 frames |
| `clicktrain_T3_24.47.wav` | clicktrain | T3 | 24.47–25.56 | drums_hp1000 | 1090 | 100 | -1.6 | money strobe, 1 per 2 frames |
| `clicktrain_T3_55.06.wav` | clicktrain | T3 | 55.06–56.46 | drums_hp1000 | 1400 | 30 | -0.7 | cash/cereal burst, 23 clicks |
| `stutter_T3_67.88.wav` | stutter | T3 | 67.88–68.28 | nv_hp600 | 400 | 10 | -14.6 | logo sting: 12 clicks at 17 ms |
| `stutter_T2_8.24.wav` | stutter | T2 | 8.24–8.42 | nv_hp600 | 180 | 30 | -7.3 | into the silence before the ident: 4 clicks at 15 ms |
| `subdrone_T2_0.00.wav` | subdrone | T2 | 0.00–1.06 | db_lp150 | 1044 | 835 | +15.9 | opening, under the photo pop-ins |
| `subdrone_T2_18.66.wav` | subdrone | T2 | 18.66–19.46 | bass_lp200 | 800 | 235 | -3.5 | under the "#1" black card |
| `swell_T1_16.50.wav` | swell | T1 | 16.50–17.48 | nv | 980 | 760 | +8.7 | into the cut on "But instead" (rise 33 dB / 0.9 s) |
| `swell_T1_55.75.wav` | swell | T1 | 55.75–57.48 | nv | 1730 | 595 | +11.3 | into "And its first customer" (27 dB / 1.7 s) |
| `swell_T2_8.20.wav` | swell | T2 | 8.20–8.67 | nv | 470 | 5 | +5.3 | swell into the ident silence |
| `swell_T2_61.20.wav` | swell | T2 | 61.20–62.26 | nv | 1060 | 650 | +10.5 | into "everyone else stops thinking" (27 dB / 2 s) |
| `swell_T2_69.95.wav` | swell | T2 | 69.95–71.18 | drums | 1201 | 535 | +5.4 | noise riser under the ChatGPT logo reveal |
| `swell_T2_37.90.wav` | swell | T2 | 37.90–40.02 | nv | 2120 | 395 | +6.0 | into "burned his own ships" (25 dB / 2 s) |
| `swish_T2_19.18.wav` | swish | T2 | 19.18–19.52 | drums | 340 | 270 | -3.9 | swish into "#1 Signaling" |
| `glitch_T1_7.93.wav` | glitch | T1 | 7.93–8.20 | nv | 269 | 170 | +9.3 | datamosh cut f192-195 |
| `explosion_T1_29.30.wav` | explosion | T1 | 29.30–30.45 | other | 1150 | 245 | +1.4 | explosion on white ground |
| `impact_T1_56.23.wav` | impact | T1 | 56.23–57.45 | db | 1220 | 115 | +11.1 | low-band jump 42 dB at the cut |
| `impact_T1_7.98.wav` | impact | T1 | 7.98–9.20 | db | 1219 | 115 | +9.0 | low-band jump 32 dB at the cut |
| `impact_T1_34.44.wav` | impact | T1 | 34.44–35.66 | db | 1219 | 35 | -1.8 | low-band jump 21 dB at the cut |
| `impact_T2_22.26.wav` | impact | T2 | 22.26–23.48 | db | 1220 | 105 | +3.5 | low-band jump 48 dB at the cut |
| `impact_T2_88.06.wav` | impact | T2 | 88.06–89.28 | db | 1220 | 135 | +1.1 | low-band jump 40 dB at the cut |
| `impact_T2_52.98.wav` | impact | T2 | 52.98–54.20 | db | 1220 | 30 | +3.0 | low-band jump 38 dB at the cut |
| `impact_T3_2.38.wav` | impact | T3 | 2.38–3.60 | db | 1220 | 35 | +10.3 | low-band jump 18 dB at the cut |
| `impact_T3_39.82.wav` | impact | T3 | 39.82–41.04 | db | 1220 | 110 | +4.2 | low-band jump 17 dB at the cut |
| `impact_T3_8.14.wav` | impact | T3 | 8.14–9.36 | db | 1220 | 515 | +9.4 | low-band jump 14 dB at the cut |
| `tailhit_T2_19.40.wav` | tailhit | T2 | 19.40–20.40 | drums | 1000 | 500 | +3.6 | "#1 Signaling" lands: hit + long tail |
| `tailhit_T2_9.00.wav` | tailhit | T2 | 9.00–9.90 | db | 900 | 5 | +6.6 | beat slams in after the ident |
| `logosting_T2_92.20.wav` | logosting | T2 | 92.20–93.55 | nv | 1350 | 665 | -0.5 | Link's in bio -> two-bar mark |
| `logosting_T3_66.90.wav` | logosting | T3 | 66.90–68.70 | nv | 1800 | 15 | +9.5 | Link's in bio -> two-bar mark |
| `logosting_T1_76.80.wav` | logosting | T1 | 76.80–78.38 | nv | 1580 | 85 | +14.0 | Link's in bio -> two-bar mark |
