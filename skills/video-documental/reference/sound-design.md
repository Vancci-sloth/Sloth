# Editor V1 — sound

> **The measured grammar is `edl/SOUND.md`; the roles are the `SND` table in
> `components/ev1_devices.py`.** Read those first. This page is the short version and the
> mixing recipe.

The references are dense: 78–113 SFX/music onsets a minute, and 24–69% of them land within
two frames of a cut. Sound is half of what makes the stream of pictures feel cut rather
than slid. The devices write their own cues (`Comp.cues` → `sfx-cues.txt`); do not cue by
hand, or the sound and the picture drift apart on the first re-time.

## The palette (`sfx/`)
The kit ships **no sounds taken from the references**. Every file in `sfx/ev1kit/` (22
names: `click_1..4`, `clicktrain_1..4`, `swish_1`, `glitch_1`, `riser_1..3`, `subtone_1..2`,
`subboom_1`, `impact_1..2`, `outro_1..2`, `explosion_1`, `sweepdown_1`) and `sfx/ev1/tick|hit|glitch`
is synthesised in code by `scripts/synth-sfx.py` (deterministic; rerun to restore), matched to
the measured length, transient offset and level of the reference sound of the same class —
so the `SND` gains and pre-rolls hold. `sfx/peaks.json` records each file's length and peak.
You may drop your own licensed sounds into `sfx/ev1kit/` under the same names; keep the
transient at the same offset or update the pre-roll in `SND`.

| role (`SND`) | file | gain | pre-roll | used by |
|---|---|---|---|---|
| train_tile / train_tile2 | `ev1kit/clicktrain_1` / `_2` | 0.39 / 0.40 | 17 / 12 ms | tile reveal, 1 click per pane per frame |
| train_pop | `ev1kit/clicktrain_3` | 0.34 | 32 ms | pop-ins, 1 click / 2 frames |
| train_strobe | `ev1kit/clicktrain_4` | 0.55 | 122 ms | strobe burst |
| click / click_soft | `ev1kit/click_3` / `click_1` | 0.42 / 0.30 | −8 ms | a single pop, cut in a run, marker |
| swish | `ev1kit/swish_1` | 0.20 | 270 ms | into a title: the transient is the cut |
| glitch | `ev1kit/glitch_1` | 0.40 | 170 ms | datamosh |
| riser | `ev1kit/riser_1` | 0.50 | 760 ms | swell that peaks ON the cut |
| subtone / subboom | `ev1kit/subtone_1` / `subboom_1` | 0.07 / 0.10 | 0 / 35 ms | under a black / UI card |
| impact | `ev1kit/impact_2` | 0.36 | 40 ms | the beat slamming back after a silence |
| hit | `ev1kit/impact_1` | 0.24 | 110 ms | a single cut that needs weight (rare) |
| outro | `ev1kit/outro_1` | 0.55 | 85 ms | the end card |
Pre-roll = file start → transient, minus the 4–14 ms the reference clicks LAG the picture.
Cue time in `sfx-cues.txt` is when the FILE starts. Clicks sit only 2–7 dB under the voice
in the references; that is what the gains reproduce against a −20 LUFS voice.

## Laying it (`scripts/bed-mix.py`, `scripts/sonido.py`)
1. `bed-mix.py` builds voice + bed: the bed pre-levelled ~**5.5 LU under the voice** with a
   fixed trim (never loudnorm — it flattens the build), then **cut, don't duck**: `--ramp a,b,dB`
   for each structural move. Ramps used on the worked example (`ejemplo/work/mix.py`):
   −8 dB under a black word card, −70 (a full cut) under the punchline and back on the next
   line, −4 under a rebuilt UI card, −2.5 settle after a slam, fade-in 0.02 s, ring-out 0.9 s.
2. `build.py` lays `sfx-cues.txt` over the premix (`sonido.py`) into `public/sonido.wav`, the one audio track of the Remotion project.
3. Check intelligibility by re-transcribing the final: at −4 LU a dense trap section turned
   "a leak" into "illegal"; −5.5 LU plus a −3 dB settle under the key phrase fixed it. Never
   put a drop or impact ON a short punchline word — it masks the consonant. Cut the bed under
   the punchline and slam back on the next line.

## Levels
- References: bed 0.8–3 dB under the voice (REF-1/3), 13.5 dB (REF-2).
- Recommended: ~5.5 LU under, cut (not ducked) on structure. Worked example: −18.9 LUFS
  integrated, true peak −3.3 dBTP.
- **Drop the bed on a "nothing" / black-card beat**: put the ramp start on the word.

## Music
None ships. Bring a track you have the rights to. Pick a cinematic bed with a section change
and place the change (or the drop) on the hero device or on the first content cut. Start on
the music (fade-in ≤ 0.05 s) — the references start on music from frame 0.
