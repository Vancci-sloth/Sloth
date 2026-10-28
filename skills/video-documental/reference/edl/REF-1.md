# REF-1 — a founders story ("the mafia") — frame-by-frame EDL

Source: 1916×1078 @24fps, 1881 frames, 78.38s (a 1280×720 copy is the same cut, frame-for-frame).
Method: full-frame-rate strips of every frame (5s each), HD detail frames and text crops, LK-flow
global motion per frame, a per-shot table, band-split onsets of the demucs music+SFX stem,
spectrograms with cut marks, and a verified shot list with categories. The raw analysis files
(frames, stems) are not shipped.
Frame numbers are 0-based at 24fps. "Move" figures are digital (constant per-frame scale, std < 0.002) unless
marked native. Sound: onset relative to the cut in ms, from the no_vocals stem.

---

## 1 · Shot-by-shot EDL

Legend — Cat: MOV movie/TV · INT interview/news/doc · PRO company promo / stock / CG footage · PH still photo ·
UI rebuilt UI or screenshot · GR pure graphic/type · COL collage of many sources · TR transition frames.
M = moving footage. Lit/Met = literal or metaphor (→ the word it illustrates).
Text tiers: cap = small white caption (~62px font @1080, cap-height 45px, centre of frame, one word at a time);
key = big Helvetica-Bold-like word (~115–150px font), often stacked one word per line beside the subject;
ink = same faces in near-black on a paper ground.

| # | time (s) · frames | dur | on screen | cat | M | lit/met | words under it | in-shot move | treatment | on-screen text (entry / exit) | transition IN (frame recipe) | sound at the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | 0.00–0.83 · f0–19 | 0.83 | Palmer Luckey in his Metal Gear "Quiet" cosplay with a woman cosplayer, street, still photo | PH | – | lit (Palmer) | "This is the most" | tile reveal; image drifts | 3×3 thirds grid (1px light lines) + panes show offset glass copies; halftone in shadows; bg blurred | cap "This" 0.125, "the", "most" accumulate L→R in fixed slots | from black (f0 dim): tile-flash, panes f3–f11, white pane 1f then picture, ~1 pane/frame | music enters 0.10s (bed −59→−22dB by 0.3); click train 0.09–0.85 (1 per pane) |
| S02 | 0.83–1.88 · f20–44 | 1.04 | same photo: Palmer **cut out** sharp with faint white edge; original darkened + blurred on the right | PH | – | lit | "most powerful man in" | pull-out −2.4%/s | subject isolation (bg −40% exposure + blur) | key-mid "powerful" (1.0), "man" (1.08) stacked right of him; cap "in" | f20 = 1 white overexposed motion-blurred frame (whip/bloom), f21–24 settle | soft whoosh +40ms (centroid 3.2k) |
| S03 | 1.88–3.17 · f45–75 | 1.29 | cut-out persists; world swaps to Golden Gate + SF skyline photo (teal water) | PH | – | lit ("Silicon Valley") | "Silicon Valley right now" | pull-out −4.0%/s | grid, halftone, teal | key "Silicon" 2.04 (2f blur-in) + "Valley" 2.21 (slides in with horizontal motion blur, 3f); cap "right now" under; text sits **in front** of Palmer | tile-flash f45–53: panes every 2f (45,47,49,51,53) white 1f → picture | click train 1.77–2.24, 13 clicks at 40ms (1/frame) |
| S04 | 3.17–4.38 · f76–104 | 1.21 | world swaps to snowy Alps photo; Palmer cut-out **cross-dissolves into RDJ** (Iron Man 2 Stark Expo cut-out, arms out) on the same bg 3.67–4.08 | PH→MOV | – | met → "Tony Stark" | "And he's basically" | pull-out −5.6%/s | cool desat | cap "And", "he's", "basically" | tile-flash f76–83 (two bursts 3.05–3.39, 3.70–3.89) | clicks 9 + 8 |
| S05 | 4.38–4.46 · f105–106 | 0.08 | **invert flash**: f105 half-inverted, f106 full negative (cyan) | TR | | | | | | | 2 frames | — |
| S06 | 4.46–5.83 · f107–140 | 1.38 | RDJ arms-out cut-out composited on the Alps (Iron Man 2) | MOV | ✓ | met → "Tony Stark" | "Tony Stark in real life" | push-in (native+digital, +36% over shot) | cool grade | **red** "Tony" left / "Stark" right, Helvetica Bold ~125px, #C52C34 with glow, **typed one letter per frame behind a white block cursor**; cap "in real life" under chin | hard cut | snare 5.14 |
| S07 | 5.83–5.92 · f140–141 | 0.08 | f141 negative (cyan "Tony Stark"), f142 overexposed white bloom | TR | | | | | | | invert 1f + bloom 1f | — |
| S08 | 5.92–8.00 · f142–191 | 2.08 | **The Avengers (2012)**: Tony Stark's "genius, billionaire, playboy, philanthropist" scene, RDJ close-up turning | MOV | ✓ | lit-quote | "Genius billionaire playboy philanthropist." | native camera | dark warm | key-mid (~117px) words **replace each other** on onsets: "Genius" 6.00, "Billionaire" 6.42, "Playboy" 6.92, "Philanthropist" 7.38 — each 2f blur-in, hard out | hard cut | words land on beat hits: snares 6.11/6.60/6.89/7.39 |
| S09 | 8.00–8.12 · f192–194 | 0.12 | **datamosh**: RGB-split slices of RDJ smearing into white | TR | | | | | | | 3 frames | low-mid thump +57ms (centroid 1.0k) |
| S10 | 8.12–8.96 · f195–214 | 0.84 | small card: Palmer on a boat with US flag (photo) on grey-vignetted paper | PH | – | lit | "His name's" | push-in +5.2%/s | paper ground | ink cap "His" left 8.33, "name's" right 8.50 | settles out of the datamosh | — |
| S11 | 8.96–9.04 · f215–216 | 0.08 | overexposed white + zoom-through into the card | TR | | | | | | | 2f: bloom + scale-through | low thump +36ms |
| S12 | 9.04–9.88 · f217–236 | 0.84 | same Palmer flag photo full frame | PH | – | lit | "Palmer Lucky," | static | natural | key "Palmer" 9.04 / "Luckey" 9.25 stacked beside his head | hard (out of the zoom-through) | — |
| S13 | 9.88–10.71 · f237–256 | 0.83 | Palmer smiling, Hawaiian shirt, garden bokeh (interview b-roll) | INT | ✓ | lit | "and the same company" | **rack focus in** ~9f | natural | caps "and/the/same/company" | hard cut onto a defocused frame | — |
| S14 | 10.71–12.21 · f257–292 | 1.50 | frame **shrinks to ~55% inside a white border while tiles slide in from the edges** (drones, desert, "Bolt", military, Palmer) = mosaic | COL | ✓ | lit-ish | "that made him a billionaire ended up" | pull-out (−56% over shot) | | key "Billionaire" 11.21 centre; caps "Ended", "up"; centre tile exposure-pulses 12.0–12.1 | mosaic pull-back 8 frames | clicks 8 in 11–12s (one per tile) |
| S15 | 12.21–13.00 · f293–311 | 0.79 | white card pops into the mosaic centre | COL | – | lit | "throwing him out" | pull-out −4.0%/s | | ink small "Throwing" 12.21, "him" 12.38, "out" 12.54 typed inside the card | card replaces centre tile in 1f | — |
| S16 | 13.00–13.17 · f312–315 | 0.17 | vertical whip: card smears up, receipt drops in with vertical motion blur | TR | | | | | | | 4f vertical motion-blur whip | low hit −79ms |
| S17 | 13.17–14.33 · f316–343 | 1.16 | **rebuilt PayPal receipt UI**: PayPal logo, spinner → check at 13.92, "You paid $10,000.00 USD", yellow marker wipes "$10,000" 13.96–14.08 (4f L→R) | UI | ✓ | lit | "all over a $10,000" | drifts down | light grey UI, slight blur | caps "all/over/a" inside the spinner | — | — |
| S18 | 14.33–14.42 · f344–345 | 0.08 | whip/zoom blur | TR | | | | | | | 2f | swish +44ms (centroid 4.5k) |
| S19 | 14.42–15.50 · f346–371 | 1.08 | **Trump holding up a signed paper (press photo) — the paper replaced by the PayPal receipt**, perspective-mapped with shadow | PH | – | joke composite | "donation he made" | rotates −6.8° + drift | warm | key "donation" / "he" / "made" stacked, right-aligned beside his face | hard | riser swell 15.1→15.6 (−32→−17dB) |
| S20 | 15.50–15.58 · f372–373 | 0.08 | motion smear toward his face | TR | | | | | | | 2f push smear | low hit −5ms |
| S21 | 15.58–16.50 · f374–395 | 0.92 | Trump close-up, top of his head **opened and filled with meme screenshots** that pop in 1–2f apart (15.71–16.0) | PH | – | met → "meme page" | "to a mean page" | push-in +12.5%/s | warm, soft | key "meme" left 15.88, "page" right 16.00 flanking the head | hard | bed falls to −51dB by 16.5 (silence gap) |
| S22 | 16.50–17.38 · f396–416 | 0.88 | B&W extreme close-up of Trump's eyes, a strip of meme cards ("IT'S TIME!") pasted across them | PH | – | met | "they didn't like." | push-in +8.0%/s | **B&W**, grain | key stacked left "they" / "didn't" / "like" on onsets | hard | silence → **sub boom 17.30** (−20dB) |
| S23 | 17.38–17.58 · f417–421 | 0.21 | dark stage wide (blue screen) 2f, then red-carpet stage wide 3f | INT | ✓ | lit | "But" | static | | cap "but", "instead" | **step-in jump cuts** 2f, 3f | kick 17.36; music drops to drone section |
| S24 | 17.58–17.96 · f422–430 | 0.38 | Palmer on stage (navy curtain), medium-wide 4f → medium 5f | INT | ✓ | lit | "instead of" | static | | cap | step-in 4f, 5f | — |
| S25 | 17.96–18.92 · f431–453 | 0.96 | Palmer on stage, close | INT | ✓ | lit | "apologizing" | pull −2.2%/s | navy | key "apologizing" 17.96 (2f blur-in) | hard | — |
| S26 | 18.92–19.21 · f454–460 | 0.29 | Palmer, pink shirt, eyes closed | INT | ✓ | lit | "or" | static | | cap | hard | — |
| S27 | 19.21–20.04 · f461–480 | 0.83 | Palmer interview, pale sky bg | INT | ✓ | lit | "quietly starting" | push-in +3.9%/s | | cap | hard | — |
| S28 | 20.04–20.71 · f481–496 | 0.67 | Palmer interview, green bokeh | INT | ✓ | lit | "another app," | push-in +5.8%/s | | cap | hard | — |
| S29 | 20.71–21.75 · f497–521 | 1.04 | Palmer in a warehouse (Anduril), jump-cut to tighter at 21.25 | INT | ✓ | lit | "he went and did the" | push-in +4.4 / +3.7%/s | | cap | hard + in-shot jump | — |
| S30 | 21.75–22.38 · f522–536 | 0.63 | closer Palmer, warehouse | INT | ✓ | lit | "one thing" | push-in +4.3%/s | | cap | hard | — |
| S31 | 22.38–22.58 · f537–541 | 0.21 | **datamosh on his face** 2f, then 2f clean | TR | ✓ | | | | | | 2f glitch | — |
| S32 | 22.58–22.79 · f542–546 | 0.21 | Elon Musk in academic robe, red curtain (commencement) | INT | ✓ | lit (the valley) | "the" | static | | cap | **name-drop burst** 5f | — |
| S33 | 22.79–22.96 · f547–550 | 0.17 | Bill Gates, Harvard commencement | INT | ✓ | lit | "whole" | static | | cap | 4f | — |
| S34 | 22.96–23.12 · f551–554 | 0.17 | Mark Zuckerberg, Harvard commencement | INT | ✓ | lit | "whole" | static | | cap | 4f | snare 22.95 |
| S35 | 23.12–23.38 · f555–560 | 0.25 | Steve Jobs, Stanford commencement | INT | ✓ | lit | "valley" | static | | cap | 6f | snare 23.12 |
| S36 | 23.38–25.33 · f561–607 | 1.96 | paper ground; the four commencement clips **pop in as playing tiles**, one every 2–3f, loose grid | COL | ✓ | lit | "was too squeamish to touch." | push-in +2.5%/s | paper | ink caps "valley/was/too/squeamish/to"; ink key "touch" 24.88 bottom centre | white 1f, tiles pop | snares 23.45, 23.66 on pops |
| S37 | 25.33–26.00 · f608–623 | 0.67 | FPV drone footage over terrain, teal mono; **circular HUD reticle ring** around the caption | PRO | ✓ | lit (drones) | "He started" | native | **teal** | cap inside ring | hard | — |
| S38 | 26.00–26.67 · f624–639 | 0.67 | Anduril sim/thermal footage, **B&W edge/high-pass** | PRO | ✓ | lit | "building" | pull −5.5%/s | B&W edge | cap | hard | — |
| S39 | 26.67–27.33 · f640–655 | 0.67 | same footage, **grade switched on the word** to teal-green-yellow false colour (Lattice HUD boxes "Ghost-X") | PRO | ✓ | lit | "weapons." | static | false colour | key "weapons" 26.67 | **grade cut** on the word | snare 26.78 |
| S40 | 27.33–28.00 · f656–671 | 0.67 | Anduril drone launching vertically, desert | PRO | ✓ | lit | "Autonomous" | native, rack in | warm olive | key "autonomous" 27.33, "drones" 27.54 offset 2nd line | hard onto defocus | — |
| S41 | 28.00–28.54 · f672–684 | 0.54 | aerial desert, drone tiny | PRO | ✓ | lit | "drones that" | native | warm brown | key holds | hard | — |
| S42 | 28.54–29.08 · f685–697 | 0.54 | grey sky, drone silhouette | PRO | ✓ | lit | "that hunt their" | native | desat | cap | hard | — |
| S43 | 29.08–30.79 · f698–738 | 1.71 | overexposed white sky; drone strikes → **fireball** | PRO | ✓ | lit | "own targets, the kind that fight" | native + push | blown highlights | cap (faint) | hard | explosion boom 29.59, crackle 30.1–30.4 |
| S44 | 30.79–31.88 · f739–764 | 1.08 | dusky brush, soldier with drone (combat footage) | PRO | ✓ | lit | "real wars." | push +4.0%/s | dark desat | key "real" 30.83 / "wars" 30.92 stacked | hard | — |
| S45 | 31.88–34.46 · f765–826 | 2.58 | Palmer interview (Anduril office) — **CG black chess rook rises into the foreground** (32.4–33.0), then the bg defocuses + darkens (33.7–34.4) | INT | ✓ | met → "side piece" | "But Palmer's only the side piece. He came out of a company" | pull −5.0%/s | | caps run | hard | pad/drone, chord step 32.8 |
| S46 | 34.46–36.79 · f827–882 | 2.33 | CG **white chess king** lit from above on navy; **"GOTHAM" UI lockup assembles** (glitch type-on 35.3–35.5) with Palantir ring icon + bracket, Palantir wordmark joins 36.5 | GR | ✓ | met (king) + lit (Gotham) | "that's quietly turned out some of the most" | push (+40%) | navy, glow | caps under the king | **match on the chess piece** (rook → king) through the defocus | sub thump on the cut 34.46 (chord change) |
| S47 | 36.79–37.33 · f883–895 | 0.54 | Palantir co-founder at a podium, blue screen | INT | ✓ | lit | "most powerful" | pull −6.6%/s | | key "powerful" | hard | — |
| S48 | 37.33–37.75 · f896–905 | 0.42 | co-founder on a podcast mic, plants window | INT | ✓ | lit | "people" | static | | cap | hard | — |
| S49 | 37.75–38.33 · f906–919 | 0.58 | man in suit + red tie (interview) | INT | ✓ | lit | "in tech," | static | | cap "in tech" | hard | snare 37.74 |
| S50 | 38.33–38.83 · f920–931 | 0.50 | black: **Palantir logo build** — white hairline grows (f920–923), "Palan…" types 38.42, full wordmark with glow 38.50, faint crosshair hairlines across frame | GR | – | lit | "a crew" | pull −5.9%/s | glow | cap "crew" under logo | hard to black | snare 38.33 |
| S51 | 38.83–40.08 · f932–961 | 1.25 | **logo stays as an overlay while the footage behind changes** (dark purple, a person's torso) | INT | ✓ | lit | "everyone now calls the" | pull −7.5%/s | dark | logo + caps under | bg cut under the logo | — |
| S52 | 40.08–41.90 · f962–1005 | 1.82 | **2×2 grid** of the four "mafia" interview clips (all playing), Palantir logo small centre | COL | ✓ | lit | "Palantir Mafia." | static | | cap "the / Palantir / Mafia" | hard | snare 40.07 |
| S53 | 41.90–45.88 · f1006–1100 | 3.98 | **grid tilts into 3D**, camera travels across an endless tilted wall: football broadcast, phone app, Red Bull F1 (Verstappen), Ferrari, PayPal page, Thiel on 60 Minutes… motion blur, lens flares (43.0) | COL | ✓ | lit-ish | "And it all traces back to the godfather of the PayPal Mafia. Thiel took the system" | 3D travel + rot +18° | | caps | grid → 3D (no cut) | **kicks return 41.81** → build; low −25dB |
| S54 | 45.88–46.62 · f1101–1118 | 0.74 | wall **lands on the 60 Minutes Thiel tile**, flattens, fills frame | COL | ✓ | lit | "PayPal built" | 3D land | | caps | 3D land-in (no cut) | whoosh 46.4–46.7 |
| S55 | 46.62–47.75 · f1119–1145 | 1.13 | Thiel, 60 Minutes interview ("60" bug) | INT | ✓ | lit | "to hunt down fraudsters" | native | | caps; key "fraudsters" 47.25 | (landed) | kick 46.59 |
| S56 | 47.75–48.54 · f1146–1164 | 0.79 | Thiel at a podium, salmon wall | INT | ✓ | lit | "and aimed it" | push +5.7%/s | | cap | hard | — |
| S57 | 48.54–49.04 · f1165–1176 | 0.50 | Thiel interview, window + trees | INT | ✓ | lit | "at hunting" | push +3.9%/s | | cap | hard | — |
| S58 | 49.04–49.67 · f1177–1191 | 0.63 | Thiel at SXSW | INT | ✓ | lit | "terrorists" | static | | cap | hard | — |
| S59 | 49.67–50.25 · f1192–1205 | 0.58 | tighter Thiel SXSW (jump-in) | INT | ✓ | lit | "instead." | push +4.5%/s | | cap | jump-in | — |
| S60 | 50.25–51.17 · f1206–1227 | 0.92 | paper ground: small dark square of a network graph **grows ×4.5** (~60→280px) ease-in; faint Palantir logo appears inside at 51.0 | GR | – | lit | "That became" | card grow | paper | ink "That" left, "became" right | hard | hits 51.04, 51.36 |
| S61 | 51.17–51.83 · f1228–1243 | 0.67 | card **snaps full frame**: radial network graph, Palantir wordmark glowing centre; RGB split on the logo 51.75–51.83 | GR | ✓ | lit | "Palantir." | push +9.6%/s | glow, chroma | logo | snap (1f) | clicks 7 |
| S62 | 51.83–52.00 · f1244–1247 | 0.17 | datamosh (pink/blue blocks) into Karp | TR | | | | | | | 4f | glitch burst −18ms (hi 0.45) |
| S63 | 52.00–54.83 · f1248–1315 | 2.83 | **Alex Karp** (white T, blue bg, mic) — the real "scare enemies… kill them" clip | INT | ✓ | lit-quote | "Palantir is here to scare enemies and" | static | | caps | (glitch) | **music fades out** 52.0→54.5 (−24→−59dB) |
| S64 | 54.83–56.25 · f1316–1349 | 1.42 | **digital punch-in** on Karp (~1.25×) | INT | ✓ | lit-quote | "on occasion kill them." | punch-in, drift up | | key stacked right-aligned "on" 55.00 / "occasion" 55.08 / "kill" 55.29 / "them" 55.38, each 2f blur-in | jump zoom 1f | **sub swell + falling pitch sweeps 54.9–55.9 (downlifter / tape-stop)**, silence |
| S65 | 56.25–56.33 · f1350–1351 | 0.08 | f1350 white flash, f1351 **blue light tunnel** (hyperspace zoom) | TR | | | | | | | 1f white + 1f tunnel | **IMPACT −8ms (bed −20dB), music slams back**: section D |
| S66 | 56.33–56.88 · f1352–1364 | 0.54 | CG military HUD flying forward over ocean | PRO | ✓ | met (CIA/defence) | "And its first" | native | teal | caps | (tunnel) | kicks 56.34/56.57/56.82 |
| S67 | 56.88–57.46 · f1365–1378 | 0.58 | CG drone-ops HUD (blue, red marker) | PRO | ✓ | met | "customer" | pull −7.5%/s | blue | cap | hard | — |
| S68 | 57.46–57.83 · f1379–1387 | 0.38 | black, glowing red/white hexagonal target-lock (CG) | PRO | ✓ | met | "was the" | push | red glow | cap | hard | snare 57.52 |
| S69 | 57.83–58.50 · f1388–1403 | 0.67 | CIA ops room: soldier silhouette before blue screens (film/stock) | MOV | ✓ | lit-ish | "CIA." | native | blue/gold | key "CIA" 57.96 | hard | snare 58.05 |
| S70 | 58.50–60.33 · f1404–1447 | 1.83 | **diagonal triptych**: Palmer (ANDURIL sign) / Karp with mic / Garry Tan, seams on diagonals, panels drifting | INT | ✓ | lit | "Now look at what that crew runs." | drift | | key-small "Now", caps | opens defocused → racks in | kick 58.40 |
| S71 | 60.33–60.88 · f1448–1460 | 0.54 | Palmer walking past the ANDURIL wall | INT | ✓ | lit | "One builds" | rack in | | caps spread across the frame | hard onto defocus | — |
| S72 | 60.88–61.67 · f1461–1479 | 0.79 | two jets/CCAs over clouds (Anduril promo) | PRO | ✓ | lit | "the weapons," | pull −9.8%/s | cool | caps spread "One builds the weapons" | hard | — |
| S73 | 61.67–62.33 · f1480–1495 | 0.67 | Karp on stage with mic, lavender | INT | ✓ | lit | "one runs the" | rack in | | caps | hard onto defocus | — |
| S74 | 62.33–63.29 · f1496–1518 | 0.96 | surveillance map UI: satellite city, "SIM CARD TRACKING", red pins | UI | ✓ | lit | "surveillance state," | pull −7.3%/s | teal | caps spread | hard | — |
| S75 | 63.29–64.12 · f1519–1538 | 0.83 | Garry Tan talking head | INT | ✓ | lit | "and one of them" | rack in | | caps | hard onto defocus | — |
| S76 | 64.12–65.04 · f1539–1560 | 0.92 | Garry Tan on stage, AI Engineer World's Fair (OpenAI/Akamai backdrop) | INT | ✓ | lit | "quietly took over" | static | | cap | hard | — |
| S77 | 65.04–66.04 · f1561–1584 | 1.00 | Garry Tan at YC (yellow wall) | INT | ✓ | lit | "the accelerator" | push +5.2%/s | | cap | hard | — |
| S78 | 66.04–66.62 · f1585–1598 | 0.58 | YC partner, library | INT | ✓ | lit | "that decides" | push +4.9%/s | | cap | hard | kick 66.14 |
| S79 | 66.62–67.33 · f1599–1615 | 0.71 | founder at a desk (red/purple art) | INT | ✓ | lit | "which startups" | push +4.7%/s | | cap | hard | — |
| S80 | 67.33–68.04 · f1616–1632 | 0.71 | founder in suit, office corridor | INT | ✓ | lit | "on Earth" | push +4.8%/s | | cap | hard | bass drop-out 67.0–67.2 |
| S81 | 68.04–68.71 · f1633–1648 | 0.67 | Brian Armstrong | INT | ✓ | lit | "even get" | push +3.7%/s | | cap | hard | — |
| S82 | 68.71–69.33 · f1649–1663 | 0.62 | Sam Altman on black | INT | ✓ | lit | "to exist." | push +4.2%/s | | cap | hard | — |
| S83 | 69.33–70.54 · f1664–1692 | 1.21 | paper ground: the 2007 "PayPal Mafia" photo in a frame **hanging on a nail** | PH | – | lit | "The PayPal mafia" | swing/drift | paper | ink "The" left, "paypal mafia" right | pops in with blur (2f) | kick 69.33 |
| S84 | 70.54–72.21 · f1693–1732 | 1.67 | the same photo **inside an X post screenshot** (replies column) | UI | – | lit | "built the internet you scroll all day." | push +2.1%/s | paper | ink column left: "built / the / internet / you / scroll / all / day." one per word, fading in grey | white flash 2f with colour bits | — |
| S85 | 72.21–72.62 · f1733–1742 | 0.42 | **letterbox squeeze**: black bars close from top/bottom, image shrinks to a small centred box | TR | | | "The" | | | | 10f | — |
| S86 | 72.62–74.00 · f1743–1775 | 1.38 | the 2×2 "Palantir Mafia" grid again (callback) | COL | ✓ | lit | "The Palantir Mafia" | rack in | | cap + logo | hard onto defocus | — |
| S87 | 74.00–74.79 · f1776–1794 | 0.79 | stock render: man in a chair on his phone, white room | PH | – | met → "you" | "built the thing" | slide | white | ink key stacked "Built / the / thing" (fading in) | hard | kick 74.27 |
| S88 | 74.79–76.71 · f1795–1840 | 1.92 | a **gold picture frame scales in from outside** — the scene becomes a painting in a gallery; a viewer walks in from the right (74.92); everything pulls back to a small centre | PH | – | met → "watching you" | "quietly watching you do it." | frame pull-back | white | ink "quietly watching you" **slides in from the left with motion blur** 75.38–75.58, "do it." right 75.58 | frame scale-in | — |
| S89 | 76.71–77.12 · f1841–1850 | 0.42 | **logo sting**: two black diagonal bars sweep in and cross over the fading scene, converge into the 3-bar mark | GR | | | | | | | 10f | **hit 76.9 (−15dB)** |
| S90 | 77.12–78.38 · f1851–1880 | 1.26 | mark holds on #F3F3F3, 2-frame fade at the end | GR | | | | | | | | music rings out, −67dB at 78.4 |

---

## 2 · Music map (no_vocals stem: band-split onsets and spectrograms)

| time | section | what the music does | how the cuts sit |
|---|---|---|---|
| 0.0–0.3 | intro | enters on frame ~2 (−59 → −22dB in 0.3s), no lead-in | first tile reveal rides the entry |
| 0.3–15.5 | **A — beat** | piano/string chords on a slow pulse, kick ~1/s (62 BPM half-time) + snare-like hits between; hi click trains layered on every tile reveal (9–13 clicks/s) | the "Genius/Billionaire/Playboy/Philanthropist" words land on snares (6.11/6.60/6.89/7.39) |
| 15.1–15.6 | swell | noise riser −32 → −17dB peaking **on** the cut into the Trump close-up | cut on the riser peak |
| 16.3–16.8 | **gap** | bed drops to −51dB (near silence) under "they didn't like" | B&W Trump sits in the hole |
| 17.30 | **sub boom** | one low hit (−20dB) | on "But" — the turn — the cut 17.38 |
| 17.4–41.8 | **B — drone** | no percussion; sustained pads + sub bass, chord changes on a ~1.72s grid (20.7, 22.4, 24.2, 25.9, 27.6, 29.3, 32.8, 34.5, 36.3, 38.0, 39.7) | big cuts (chess king 34.46) land on chord changes; the explosion 29.5–31.3 is the only transient |
| 41.8–52.7 | **C — build** | kicks return (41.81, 42.11, 42.46, 42.92…), low band up to −25dB, hi band rising | the 3D wall run starts exactly on the return |
| 52.0–55.9 | **DROP** | bed fades out to −59dB (54.5) — the Karp quote plays nearly dry; 54.9–55.9 sub swell + falling pitch sweeps (downlifter / tape-stop) | the punch-in + stacked "on occasion kill them" sit in the silence |
| 56.25 | **IMPACT** | white flash + tunnel; bed slams back at −20dB | music re-entry and the cut are the same frame |
| 56.3–77.6 | **D — drive** | fast trap-style beat: kicks every ~0.25–0.4s, claps/snares, hat streaks; one-beat bass drop-out 67.0–67.2 | talking-head montage at ~0.65s per face rides it; cuts within 60ms of a kick 19%, snare 24%, any hi click 32% overall |
| 76.9 | hit | sting hit (−15dB) as the logo bars cross | |
| 77.6–78.4 | out | ring-out to −67dB | 2-frame visual fade |

Music onsets/min overall 84; the bed sits only 3dB under the voice during speech (sections A, C, D).

---

## 3 · Device catalogue (exact recipes) — vs `editor-v1/reference/devices.md`

### NEW (not in devices.md)
1. **Type-on title with a white block cursor** — red Helvetica-Bold word typed 1 letter/frame, a white block at the insertion point, cursor vanishes 1f after the last letter (S06).
2. **Word-replace on a quote** — a quoted list; each key word replaces the previous on its onset (2f blur-in, hard out), timed to snares (S08).
3. **Stacked key words beside the subject** — 2–4 words, one per line, ~115–150px, line-height ~0.95, right-aligned when on the right of a face, left-aligned on the left; each word on its onset, 2f blur-in (S19, S22, S44, S64, S87). ~6 per minute.
4. **Subject isolation** — cut-out stays sharp, the original photo darkens ~40% and blurs (S02).
5. **Cut-out morph** — one cut-out cross-dissolves into another (Palmer → Tony Stark) over ~10f on the same background (S04).
6. **Joke composite** — a rebuilt UI perspective-mapped into a held object in a press photo (receipt in Trump's hand, S19); a collage *inside* a head (S21); a cut-paper strip across the eyes (S22).
7. **Step-in jump cuts** — 3–4 cuts of 2–5f each, each closer on the same event (S23–S25).
8. **Name-drop burst** — 4 famous people, 4–6f each, on one phrase ("the whole valley", S32–S35), then the same clips pop in as tiles on paper (S36).
9. **Grade cut on the word** — the same footage switches grade (B&W edge → false-colour) exactly on the key word (S38→S39).
10. **HUD reticle ring** around the caption over FPV footage (S37).
11. **Pun object** — a CG object for a pun ("side piece" → chess rook) rises into the foreground, the background defocuses, and the next scene shares the object (rook → king) (S45→S46).
12. **UI lockup assembly** — a product name type-on with glitch + icon + bracket (GOTHAM, S46).
13. **Logo build + persistent logo** — hairline grows, wordmark types, glow, crosshair hairlines; the logo then stays while the footage under it cuts (S50→S51).
14. **Grid → 3D wall → land** — a flat 2×2 grid tilts into a 3D plane, the camera travels ~4s with blur and flares, then lands on one tile and flattens it into the next full-frame shot (S52→S55). (devices.md has a wall, but not the entry from a grid, nor the landing.)
15. **Card grow → snap** — a small card on paper grows ×4.5 over 0.9s, then snaps to full frame in 1f (S60→S61).
16. **Quote drop** — music fades to silence under the key quote, digital punch-in on the speaker, stacked key words, downlifter, then **white flash + light-tunnel + impact + music slam** on the next cut (S63→S66).
17. **Diagonal triptych** — three subjects split by diagonal seams, opening defocused (S70).
18. **Rack-focus in on every new interview cut** — opens defocused, sharp in ~9f (S13, S40, S70, S71, S73, S75, S86).
19. **Face montage on the beat** — one face per spoken item, ~0.65s each, each with the same +4.7%/s push (S77–S82).
20. **Hanging frame** — a photo framed and hung on a nail on the paper ground (S83).
21. **Photo → its post** — the photo is revealed inside the X post that published it, with the line stacked as a left column (S84).
22. **Letterbox squeeze** — black bars close from top and bottom, the image shrinks into a small box (10f, S85).
23. **Gallery pull-back** — a gold frame scales in from outside; the scene becomes a painting a person walks up to (S88).
24. **Motion-blur slide-in words** — words slide in from the frame edge with horizontal blur (S03 "Valley", S88).
25. **Logo sting** — two diagonal bars cross and converge into the mark, hold ~1.3s, 2f fade (S89–S90).
26. **Constant digital move on every held shot** — push-in +4 to +6%/s on faces, pull-out −4 to −7.5%/s on composites/graphics, std < 0.002/frame (62 of 79 shots move).

### WRONG or incomplete in devices.md
- **Cut-out: "the big title sits BEHIND him."** In REF-1 the titles over the cut-out are *in front* ("Silicon Valley", "Palmer Luckey"); behind-the-head is REF-2's "#1 Signaling" only. Both exist; default to in front for names and places.
- **Display tiers.** REF-1 has no serif and no Didone at all; every key word is one bold grotesk (Helvetica-Bold-like, not Inter 700) in white, near-black ink on paper, or muted red #C52C34 with a type-on cursor. The red Didone "shock" tier is REF-3 only.
- **Caption size.** Tokens say 48px; REF-1 measures ~62px font (cap height 45px at 1078). Key words ~117px single, ~150px stacked.
- **Invert flash.** In REF-1 it is 1 negative frame followed by 1 overexposed bloom frame (f141–142), and a half-inverted lead-in frame (f105).
- **Pop collage.** REF-1's is on the *paper* ground with playing video tiles and ink captions (S36), not only on black.
- **3D wall.** 5.8s total (4.0s travel + 0.7s landing), entered from a grid and exited by landing on a tile; devices.md's 0.8–3.5s free-floating sweep misses both ends.
- **"Every image is treated."** REF-1 is 42% natural colour; treatments are per sequence (the drone run teal/edge/false-colour; Trump B&W; drones warm) and switch on words — not a filter on everything.
- **Strobe.** REF-1 has no 2-frame strobe; its burst is the name-drop (4–6f per famous face).
- **Missing entirely:** movie clips for pop-culture metaphors, interview footage of every person named, company promo footage, rack focus, step-ins, word-replace, stacked words, joke composites, and the music structure (drop → impact).

---

## 4 · Stats (from the verified shot list)

| | |
|---|---|
| shots (excl. transition frames) | **79** (+11 transition events) — **60 per minute** |
| median / mean shot | **0.79s / 0.97s** (longest single shot 2.83s Karp quote; the 3D wall 3.98s) |
| runtime by source | interview/news/doc **37%** · still photo 16% · collage 16% · company promo/stock/CG **11%** · graphic 8% · movie clips 5% · rebuilt UI/screenshot 5% · transitions 2% |
| moving footage | **75% of runtime** |
| distinct sources | ~60 primary (≈90 counting collage tiles) |
| metaphor shots | 12 of 79 = **15% of shots, 20% of runtime** (Tony Stark ×4, meme head ×2, chess ×2, CG HUD ×3, gallery ×2); everything else literal — the person named is on screen |
| in-shot move | **62 of 79** shots; digital push +4–6%/s, pull −4–7.5%/s; rack focus on 7 cuts |
| transitions (frame-level) | invert 2 · datamosh 3 · whip/smear 3 · white bloom/zoom-through 3 · letterbox 1 · tile reveals 4 · land-in/grid-to-3D 1 · match (chess) 1 · logo sting 1; the rest hard cuts |
| text | small caption on ~every word; key words ~16 events (~12/min), 6 stacked groups; red type-on 1 |
| sound | bed 3dB under voice; 4 music sections, 1 silence gap (16.3–16.8), 1 full drop (52–55.9), 1 riser, 2 sub booms, 1 impact slam, 1 sting hit; click trains only on tile reveals and tile pops |

---

## 5 · What makes it fire — and what a first draft lacks (ranked)

First draft = a 19.4s edit built from stills, screenshots and synthetic ticks, read at 2fps.

1. **It moves because the footage moves.** 75% of REF-1 is moving footage — the actual people talking, drones flying, an explosion, movie clips. The draft is ~25% moving (the speaker's camera only); everything else is a still (building photo 1.9s, aurora 4.3s, terminal 1.8s, pages). Source **clips** first: interviews/keynotes of whoever is named, company promo films, news footage, movie/TV scenes for pop-culture lines.
2. **Every named thing gets its own face/clip, fast.** Each person, company and place mentioned appears literally (Thiel ×5 different appearances, 6 YC faces, 4 commencement speeches in 0.8s). The draft shows "three posts" and stops.
3. **Imagination: visual puns and jokes (15% of shots).** Tony Stark for "billionaire playboy", a chess rook for "side piece", memes inside Trump's head, the receipt in his hand, a gallery viewer for "watching you". The draft has no metaphor and no joke; the aurora recolour is its only idea.
4. **Pace.** 60 shots/min, median 0.79s, nothing held over ~2.8s except the travelling 3D wall. The draft runs ~40 changes/min with a 4.3s aurora hold, a 2.2s B&W face and 1.8s terminal.
5. **Nothing sits still.** 62/79 shots carry a constant 4–7.5%/s push or pull, new interview cuts rack-focus in, and composites drift/rotate. The draft's stills push ~3%/s and the speaker's camera never moves.
6. **The music has a story.** Four sections, a riser into a reveal, a silence hole, a sub boom on "But", the bed pulled out completely under the key quote, then a white flash + tunnel + impact + slam back in. The draft's bed is flat with one drop.
7. **Sound effects are cinematic, not just ticks.** Risers, sub booms, a downlifter/tape-stop, whooshes on the wall, an explosion, an impact, a sting hit; click trains only where tiles pop. The draft's 68 cues are mostly synthetic ticks and one thump — it reads thin. (The cleanest examples in the REF-1 stem: silence+sub boom 16.3–17.4, downlifter→impact 54.9–56.4 — both nearly music-free.)
8. **Type is bigger and smarter.** ~62px captions on every word; key words stacked beside the subject ~6×/min; words replace each other on a quote; the red title types on behind a cursor. The draft's captions are 48px and it has 3 key words.
9. **Transitions are varied and 1–4 frames long** — invert+bloom, datamosh, whip, zoom-through, tunnel, letterbox squeeze, grid→3D→land, gallery pull-back. The draft repeats tile-reveal / datamosh / white flash.
10. **It ends.** A callback line over the same 2×2 grid, the gallery reveal, the logo sting and a 1.3s hold. The draft glitches to black.
