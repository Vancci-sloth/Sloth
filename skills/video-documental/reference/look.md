# Editor V1 — look, type, rhythm, layouts

## 1 · Treatments (`scripts/ev1_treat.py`)
| look | when | measured share |
|---|---|---|
| `teal` split (teal shadows, cream highlights, 40% toward grey) | places, buildings, establishing | REF-1 22% |
| `mono` hard B&W | documents, pricing, archival, a serious beat | REF-2 18% |
| `warm` amber/sepia | fire, money, history, war | 8–11% |
| `invert` negative | 1–2 frame flashes; a strobe image | — |
| `natural` + push + vignette | footage that is already good, the hero world | 32–42% |
| `recolor FROM-TO:TARGET` | when the speaker names a colour/variant of one thing | e.g. one aurora photo recoloured red / green / blue |
| `halftone` (0.16–0.35) | stills that would look like stock otherwise | REF-1 throughout |
`recolor` recolours fully then blends in RGB by the hue-band weight — rotating hues by the
weight paints rainbow fringes (it did, first try).

**Your face: NOT graded.** Your camera stays RAW on every face beat: no grade, no B&W, no LUT,
no vignette — the found material carries the colour. The matte RGB for the cut-out comes from
the raw plate too (`scripts/matte.py`). Re-time the camera only (`fps=30`, `-g 30`, no
filters). No grain and no lifted blacks on anything.

## 2 · Type
Three display tiers + one caption tier; never anything in between.
- caption 62px Inter 600 white (REF-1 at 16:9; REF-2's 4:3 frame reads 48px), soft dark
  shadow + faint bloom, centre of frame; over a rebuilt UI drop it to 86% so it never covers
  the evidence; on a light page it turns ink (`captions_switch`, `components/ev1_more.py`).
- key 150px Inter 700 · title 136px Playfair italic chrome · shock 176px Bodoni red caps.
- **mega** — the huge red word (Inter 900, `--ev1-red`, ~560px) set BEHIND the speaker's head,
  between the plate and the RVM matte, riding the same punch-in. The default treatment for
  the stressed word on a face beat.
- Words appear on their onsets in final slots; a phrase clears at the cut.

## 3 · Rhythm
Reference pace: held shot median 0.56–0.79s, strobe bursts on single words, a ground
change (black / paper / image / face) every few beats. For long-form: cold open and chapter
opens at reference pace, body at 1.2–2.0s per picture, your face 25–35% of runtime in
1.2–2.5s stretches, never two face beats in a row without material between.

## 4 · Layouts — your face
The references are faceless. A speaker on camera appears three ways:
1. **Face beat** (raw camera) — gestures, numbers on fingers, the conversational lines.
2. **Stressed face beat** (raw camera + the mega word behind the head via the matte) — the
   caveat, the serious line.
3. **Cut-out** — the hero device (`cutout_world`): matted, standing in front of a world that
   changes. One per chapter at most.
The 25–35% face share is a decision, not a measurement.
