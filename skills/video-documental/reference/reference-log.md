# Editor V1 — reference log (method and raw numbers)

The raw analysis data (downloads, every frame, stems, per-frame JSON, contact sheets) is not
shipped. Only the measurements are written down here and in `edl/`.

## The references
Three documentary-style short-form reels, faceless voice-over over real footage and images,
each ending on a "link in bio" card and the channel's mark.
| id | what | size | fps | dur |
|---|---|---|---|---|
| REF-1 | a founders story ("the mafia" of one company) | 1916×1078 (also a 1280×720 copy, same cut) | 24 | 78.4s |
| REF-2 | a game-theory explainer (signaling / burning the boats / information cascade) | 1440×1080 (also 960×720) | 25 | 93.6s |
| REF-3 | a company-origin story (cockroach startups / the cereal boxes) | 1916×1078 | 25 | 70.5s |

The method behind the skill: references → frame-by-frame analysis → a named style in a
library of reusable devices → Claude sources footage for every line.

## Method
1. Per frame: 96×54 grey diff to the previous frame, HSV-histogram Bhattacharyya distance,
   luma/saturation, colourfulness, hue histogram of saturated px.
2. A cut where the diff > max(14, 4× the local median) or hist distance > 0.5.
3. Contact sheets at 2fps over the whole runtime, full-frame-rate strips across every
   distinct transition, full-res stills for type, grid and texture.
4. `demucs --two-stems=vocals` → levels, spectral-flux onsets, onset↔cut sync, periodicity,
   and log-frequency spectrograms with cut markers.
5. Caption sync: count near-white px in the centre band per frame; jumps vs ASR word onsets.

## Numbers
**Cutting**
| | REF-1 | REF-2 | REF-3 |
|---|---|---|---|
| detected changes / min | 81 | 164 | 175 |
| held shots (≥0.25s) median | 0.79s | 0.56s | — |
| held shots p90 | 1.77s | 1.10s | — |
| strobe/flash (<0.17s) share of runtime | 3.7% | 13.2% | high |

**Look (share of held runtime)**
| | REF-1 | REF-2 |
|---|---|---|
| natural colour | 42% | 32% |
| teal/cyan cast | 22% | 7% |
| white/paper ground | 13% | 11% |
| warm/orange | 11% | 8% |
| B&W | 6% | 18% |
| black ground | 6% | 25% |
| vignette edge/centre luma (median) | 0.86 | 0.59 |
Hue mass of saturated pixels piles at 0–30° and 180–220° with almost nothing between:
teal-and-orange. REF-1 carries a halftone dot screen in the shadows and a thirds grid.

**Type** (720p measurements → 1080)
- caption: asc–desc extent 33px on 720 (4.6% H) → Inter 600 48px on REF-2's 4:3 frame;
  REF-1 at 16:9 reads ~62px (the token value). Centre 49–52% H, 51–53% W; words appear in
  pre-laid slots with wide gaps.
- key word: 71px x-height+ascender on 720 → ~150px at 1080.
- red shock word: #EC020B / #F60104 / #F30105 → token #F2030A.
- Caption onset vs spoken onset: "This" 0.16→0.125, "is" 0.40→0.417, "most" 0.80→0.792,
  "powerful" 0.96→1.0, "with" 82.04→82.0, "product" 82.44→82.48, "about" 83.40→83.48 —
  **±1 frame**.

**Sound** (demucs split)
| | REF-1 | REF-2 | REF-3 |
|---|---|---|---|
| bed under voice (during speech) | 3.0 dB | 13.5 dB | 0.8 dB |
| bed below −45 dB | 3% | 40% | 1% |
| SFX/music onsets / min | 84 | 78 | 113 |
| onsets within 2 frames of a cut | 24% | 46% | 69% |
| strongest periodicity | 62 BPM | 115 BPM | 125 BPM |
Click trains: REF-1 1.77–2.24s 13 clicks at 0.040s (1/frame during a tile reveal);
REF-2 0.09–1.27s 16 clicks at 0.078s (1 per pop-in). REF-1's bed is tonal (piano/strings
lines in the spectrogram) on a slow pulse; REF-2 opens on a sub drone and click trains,
then staccato hits with silence between, starting on the ident at 8.6s.

## What is not measured (decisions)
- The speaker on camera ~25–35% of runtime (the refs have no narrator on screen).
- The speaker's camera RAW — no grade, no B&W, no LUT, no vignette; the matte RGB from the
  raw plate too.
- Bed ~5.5 LU under the voice, cut (not ducked) on structure — between the references'
  0.8–3 dB and a quieter talking-head mix.
- 30fps output; frame counts converted.
