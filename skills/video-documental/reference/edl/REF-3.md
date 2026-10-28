# REF-3 — a company-origin story ("cockroach" startups) — frame-by-frame EDL

Source: 1916×1078, 25 fps, 70.48 s (1762 frames). Every frame was looked at in full-frame-rate strips
(detected cuts marked); detail frames at full res. Voice split with demucs 2-stem and 4-stem
(drums / bass / other / vocals). A per-cut sound table,
per-frame motion and row data. The raw analysis files (frames, stems) are not shipped.

## 1 · Shot-by-shot EDL
Frames are 25 fps indices (end exclusive). `n` = distinct images in the row (strobes are one row).
src: V video footage · I still image/illustration · G graphic/UI built in the edit. L/M/P = literal / metaphor / pun.
Move = global optical-flow fit over the row (push/pull %, pan % of width; rough on strobes and blur).

| # | time s | frames | dur | n | src | cat | ON SCREEN | words under it | L/M | move | treatment | on-screen text | transition in | sound at the cut |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0.00–1.28 | 0–32 | 1.28 | 9 | I+V | INT/PHO | FOUNDER STROBE: Altman (blue suit, wood room, talking) · young Jobs (cream shirt) · young Musk (T-shirt, hand behind head) · young Zuckerberg (desk) · Jobs · young Musk at an old PC · Altman · Zuckerberg · Musk | The best way to build a startup is | L "startup" | push +12% | natural, slight warm | small caps word-by-word "the best way to build a"; "startup" big white bold sans lands f21 on the word and HOLDS across the f24 cut | hard cut at f0 (cold open, no fade); 3-frame cuts | one click per cut in the drums stem; 808 + kick from frame 0 |
| 2 | 1.28–2.40 | 32–60 | 1.12 | 1 | I | ILL+GFX | white ground; blue particles (f33-38) assemble into an engraved cockroach inside typographic "( )"; f39-43 a founder photo-face is pasted on its head (blue-tinted, then natural); f44+ giant pale outlined serif "COCKROACH" across the bottom edge | to be a cockroach. | L "cockroach" | tilt up 5%H | engraving B&W on white, blue particle tint | small words in wide slots "is to be a"; ghost serif "COCKROACH" huge, cropped by the frame | hard cut to white; particle assemble 6f | no SFX transient; the beat carries it |
| 3 | 2.40–2.56 | 60–64 | 0.16 | 2 | G | PHO+GFX | black w/ tiny inset of a tower (f60-61) then 2f psychedelic RGB scanline bars (f62-63) | And | transition | static | RGB glitch | small "and" | cut to black + inset; glitch 2f | low hit +20ms on the cut (other-stem LOW +17dB, hi crack +19dB) |
| 4 | 2.56–2.96 | 64–74 | 0.40 | 2 | I | PHO | B&W skyscraper / vertical tower strip centred on black (f64-71); f72-73 the same as a white negative flash | the startups | M "startups" | pull -3% | B&W, then 2f inverted | small "and the startups" | hard cut; exits on a 2f invert | low hit at f72 (+23dB low band) |
| 5 | 2.96–3.28 | 74–82 | 0.32 | 1 | V | STK | night building w/ light-trail X streaks (moving) | that aren't | M "startups" | push +5% | dark, blue | small "the startups that" | hard cut | - |
| 6 | 3.28–3.44 | 82–86 | 0.16 | 1 | I | PHO | B&W cheetah photo on a grey screen-texture frame (looks printed/TV) | — | M "aren't (cockroaches)" | static | B&W + screen texture | small "that aren't" | hard cut | kick+snare on the cut |
| 7 | 3.44–4.36 | 86–109 | 0.92 | 1 | V | STK | cheetah running across savanna (moving, tracking shot) | cockroaches | M "cockroaches"(contrast: fast predator) | pull -9%, pan L→ 28%W, rot -5° | natural warm; 1-frame threshold-stencil negatives at f90, f95, f100 (black halftone cheetah on white) | "COCKROACHES" white Didone caps centre at f88, flickers white/red f97-100, holds RED f101-108 | hard cut | low hit f86 (+24dB) and f88 (+22dB): each stencil flash gets a low thump |
| 8 | 4.36–4.68 | 109–117 | 0.32 | 4 | G | GFX | black w/ small dark inset → 2f psychedelic pink/green pixel noise → dark inset → 2f giant mosaic pixel blocks (pixelate-resolve into next shot) | get killed | transition | static | datamosh / mosaic | small "get killed" | 8-frame glitch burst | low hit + hi crack at f111 |
| 9 | 4.68–5.16 | 117–129 | 0.48 | 1 | V | STK | dusty savanna ground, dust kicking up (the hunt, moving) | by the same | M "killed" | pan L→ 6%W | warm natural | small "get killed by the same" | mosaic resolve | - |
| 10 | 5.16–5.88 | 129–147 | 0.72 | 1 | V | STK | grey sky, small explosion that grows into a fireball (moving) | two things | M "two things" | pull -4%, pan L→ 3%W | desaturated sky | "2" white serif f129, alternates red/white EVERY FRAME f130-136, then "2 THINGS" red Didone f137, hold | hard cut | riser-in + low hit + hi crack at f129 (all three bands jump) |
| 11 | 5.88–6.84 | 147–171 | 0.96 | 1 | V | INT(news) | Antares 130 rocket explosion at night, network footage w/ "ANTARES 130" lower third kept; lens flare blooms f151-155; push-in | every single time. | M "every single time" | static | natural, flare | small "every" far LEFT and "time" far RIGHT (slots spread to the frame edges) | hard cut | low hit + hi crack + swell on the cut |
| 12 | 6.84–7.76 | 171–194 | 0.92 | 4 | V | ARC/STK | B&W grainy workshop: sparks, grinder, hands on machinery (4 cuts f171/176/181/186, moving) | Here's the system we | M "system" | pull -3% | B&W heavy grain | small "here's the system" | hard cuts | hi crack f171 (+23dB) |
| 13 | 7.76–8.16 | 194–204 | 0.40 | 1 | V | GFX+ARC | black ground, small B&W sparks clip in a centred window | build | L "we built" | pull -2% | B&W | "we" LEFT and "built" RIGHT of the window, white Didone serif (flank the window) | cut to black-ground window | swell building under (other +4dB) |
| 14 | 8.16–8.20 | 204–205 | 0.04 | 1 | G | GFX | 1-frame light-leak / lens-flare smear (blue-white) | — | transition | static | light leak | - | 1f flare | whoosh/swell out (other +11dB) |
| 15 | 8.20–9.88 | 205–247 | 1.68 | 12 | I | PHO | photos TUMBLE IN rotated from off-frame and pile into a collage on black (office interiors, desk/laptop, watch-gears top-down, people working) f205-215; full collage holds and slowly zooms | so your startup isn't one of them. First, | L "isn't (one of them)"/"system" | static | natural | "isn't" big white bold sans f222; small "one of them" f230+ | photos fly in one per 1-2f | swell/whoosh while the pile builds (other +11dB) |
| 16 (overlay) | 9.08–9.20 | 227–230 | 0.12 | 1 | G | GFX | 3f psychedelic RGB concentric-ring distortion over the collage (word warped) | — | emphasis on "isn't" | static | twirl/ripple RGB | "isn't" warped | overlay 3f | low hit f227 (+16dB) |
| 17 | 9.88–10.48 | 247–262 | 0.60 | 1 | I | STK | factory/scrapyard floor covered in silver scrap, people crouched sorting it (moving) | survive | M "survive" | pull -13% | natural, warm | red "#1" Didone wipes in with a horizontal red streak smear f249-253, solid f254 | hard cut | riser-in + low hit (+22dB) on the cut |
| 18 | 10.48–11.00 | 262–275 | 0.52 | 1 | I | STK | same plate, darker | without | L "survive" | pull -4% | darkened | "SURVIVE" white spaced Didone caps mid-size centre; "without" small sans under f271 | type swap | - |
| 19 | 11.00–11.76 | 275–294 | 0.76 | 1 | I | STK+GFX | same plate desaturated | the head. A | L "survive without the head" | static | desaturated | ZOOM-THROUGH: "SURVIVE" jumps to ~3x with motion blur f276-277 then keeps scaling (cropped "URVIVE"); "without the head" sans under, "head" flickers bold/light alternate frames | scale jump 2f + slow scale | short hit on the jump (mid +13dB) |
| 20 | 11.76–11.96 | 294–299 | 0.20 | 1 | G | GFX | radial zoom-blur burst (white core) 1f → pixel scatter + black glitch blocks 4f | cockroach | transition | static | zoom blur / pixel scatter | - | 5f burst | low hit (+10dB) |
| 21 | 11.96–12.72 | 299–318 | 0.76 | 8 | I | PHO+GFX | periwinkle pixel-mosaic ground (pale lavender + white pixel squares) with 6-8 small tilted photo cards of tech founders/magazine covers drifting; one card glitches blocky f305 | doesn't | L "a cockroach doesn't need one" | static | pixel-mosaic ground, cards natural | small words | pixel dissolve in | - |
| 22 | 12.72–13.24 | 318–331 | 0.52 | 1 | I | PHO | one card (Zuckerberg on red) flies forward to centre big; f319-320 a cyan censor bar flashes over his eyes | need one | M "doesn't need one (head)" | pull -3% | red card | "doesn't need one" mid-size white sans ON the card | card zoom-forward 2f | - |
| 23 | 13.24–13.84 | 331–346 | 0.60 | 3 | I | ILL | three encyclopedia plates on white, 5f each: roach head close-up in a framed box + paragraph; leg/antenna + "The DNA" label + leader line; wing texture + paragraph | because nothing | L "nothing critical" | static | engraving on white | small labels in the plates | hard cuts 5f | low hit f331 (+8dB) |
| 24 | 13.84–15.40 | 346–385 | 1.56 | 1 | I | ILL+GFX | full encyclopedia page: engraving boxes in corners joined by thin leader lines, paragraphs; centre blue particles assemble a full roach engraving (solid f360); f362-374 small black/white squares pop onto parts of its body; f379 a black block inverts its abdomen; slow push | critical sits in one place. But | L "nothing critical sits in one place" | static | engraving, blue particles | paragraph text (decor) | cut + particle assemble | hi crack f346 (+15dB) |
| 25 | 15.40–16.00 | 385–400 | 0.60 | 6 | I | PHO | black; small photo cards (storefronts, a Tesla showroom, streets) appear one by one around the centre | your startup's | L "your startup's entire reach" | rot +7° | natural | - | cards pop on black | - |
| 26 | 16.00–16.88 | 400–422 | 0.88 | 1 | I | PHO 3D | camera DOLLIES THROUGH a 3D field of floating photo cards; cards fly past the lens with motion blur | entire reach | L "entire reach" | static | motion blur | - | continuous | riser-in + swell (other +10dB) at f400 |
| 27 | 16.88–18.00 | 422–450 | 1.12 | 1 | I | PHO 3D+GFX | settled: cards ring a centre black box | sits in one place. Paid | L "sits in one place" | rot +4° | - | small "sits in one place." TYPES ON in the box | - | - |
| 28 | 18.00–18.76 | 450–469 | 0.76 | 3 | I | PHO | Times Square digital billboards ("The Sunset Tapes") f450; 3D anamorphic car billboard f453; billboard cards slide in from right f455-458; collage f459 | ads, and | L "paid ads" | pull -4% | natural | "PAID ADS" big white bold sans bottom-left f459, hard on | hard cuts + slide | low hit f450 (+9) and f459 (+25dB) |
| 29 | 18.76–19.80 | 469–495 | 1.04 | 10 | I | STK | MONEY STROBE: macro US banknote portraits $1 Washington, $100 Franklin, $5 Lincoln, $50 Grant, $10 Hamilton, $20 Jackson, 2-4f each, each slightly rotated/pushed | one budget cut | L "budget" | static | natural | small "and one budget cut" spread | 2-4f cuts | ONE CLICK PER CUT (drums-stem transients line up 1:1 with the cuts) |
| 30 | 19.80–21.36 | 495–534 | 1.56 | 1 | V | STK | orange fire embers / bokeh drifting on dark (moving) | makes you invisible overnight. | M "invisible overnight" | pull -15%, pan R→ 6%W, tilt down 22%H, rot -3° | warm, dark | small "makes you invisible overnight" set LEFT of centre at ~45% y | hard cut | breakdown: snare+hats drop out (s20 snare -65, hat -78 dB), bass out 20-23s |
| 31 | 21.36–23.32 | 534–583 | 1.96 | 1 | G | UI | white ground: ring of round social-account avatars spins in with rotational motion blur (f534-538), settles; slow push; a mouse cursor appears by one avatar f578 | So we build you accounts in your niche that | L "accounts in your niche" | push +6%, rot +12° | clean UI | "so we build you" small top-left typing; "accounts" big bold black sans TYPES letter by letter top-right; "in your niche" small centre | spin-in 5f | - |
| 32 | 23.32–23.60 | 583–590 | 0.28 | 1 | V | STK | black, tiny inset window of microscope cells; grows in 2-3f steps (black flash f587) to full frame by f590 | keep pulling | transition | static | - | small "that" | WINDOW-GROW 7f | hi crack +13dB at f583 |
| 33 | 23.60–24.48 | 590–612 | 0.88 | 1 | V | STK(science) | microscope: a neuron/amoeba-like cell pulling pink particles in (moving) | buyers in, | M "keep pulling buyers in" | static | pale blue natural | small "that keep pulling buyers in" | - | - |
| 34 | 24.48–25.80 | 612–645 | 1.32 | 16 | I | STK | BANKNOTE-CORNER STROBE: macro corners of $10/$20/$50/$100 then colourful foreign notes (10/50/500/100/1) on dark cloth, 2f each, small rotations | whether you're spending or not. Company | L "whether you're spending or not" | static | natural | small "whether you're spending or not" spread | 2f cuts | ONE CLICK PER CUT |
| 35 | 25.80–26.44 | 645–661 | 0.64 | 1 | G | UI | white ground: a small black profile pill (avatar + handle) with a mouse cursor; f658-660 the pill scales up with blur until it fills the frame black | pays | L "competitors" (their profile) | static | clean UI | - | PILL PUNCH-THROUGH 3f | broadband hit at f658 (mid +18, hi +24dB) |
| 36 | 26.44–27.60 | 661–690 | 1.16 | 1 | G | UI | black ground, thin purple ring, number COUNTS UP with digit scramble (2, 5, 1, 17, 12, 12>, 12,6 … 12,001) and settles on "12,000 impressions" f683; tiny profile pill under | to them $12,000 a month. | L "12,000 a month" | static | clean UI | number in white sans in the ring | emerges from the black pill | DIGITAL COUNTER TICK-BEEPS 26.45-27.35s (tone pips ~1.5k/3k/6k, ~25/s), stop exactly when the number settles |
| 37 | 27.60–29.00 | 690–725 | 1.40 | 1 | G | UI | electric-blue ground; "5 Million" SCRAMBLE-TYPES (7, 5X, 5M, 5Mi, 5Mit, 5Mill, 5Millj, 5Milliw, 5Milliop, 5 Million); client avatars drift at the edges; f708-709 2f defocus pulse | Ours do $5 million. | L "ours do 5 million" | pull -8%, tilt up 6%H | flat blue | white sans | hard cut black→blue | - |
| 38 | 29.00–29.60 | 725–740 | 0.60 | 1 | V | STK | man in an outdoor crowd w/ hands on head, palm trees (moving) | Second, outlast | M "outlast" | pull -8% | natural | red "#2" Didone writes in w/ red streak smear f727-731; disintegrates into particles f737-741 | hard cut | kick returns (s29 kick -34 after -51..-62) |
| 39 | 29.60–30.64 | 740–766 | 1.04 | 1 | V | STK+GFX | same plate dimmed | the winter. Cockroaches | L "outlast the winter" | pull -4% | desaturated | "OUTLAST" white spaced Didone f740 → ZOOM-THROUGH from f752 (same recipe as SURVIVE), "the winter" sans | type swap + scale jump | - |
| 40 | 30.64–31.12 | 766–778 | 0.48 | 1 | V | ARC | black, small inset of young Bill Gates (archival TV) f766 → bigger window f770 → full frame f774 w/ "BILL GATES ON TODAY" network lower third | — | L "cockroaches"(founders) | static | archival | small "cockroaches" | WINDOW-EXPAND in 4f steps | hi crack +16dB at f766 |
| 41 | 31.12–33.68 | 778–842 | 2.56 | 8 | V | ARC/INT | ARCHIVAL FOUNDERS: early office w/ beige PCs · young employee in early SpaceX office · young Bezos at early Amazon · early dorm-office w/ plant · young Larry Page on black · early Google guys · two founders at a whiteboard · Jensen Huang interview (19f) | survive conditions that kill everything around them. | L "cockroaches survive conditions" | tilt down 5%H | archival as-is | small "cockroaches survive conditions that kill everything around them" spread | hard cuts 6-14f | low hit + swell f778 |
| 42 | 33.68–35.12 | 842–878 | 1.44 | 1 | I | PHO+GFX | B&W aerial clouds full frame f842; f844-847 flips in 3D, shrinking into a small square card bottom-left; black ground | And when funding slows down, the | M "funding slows down"(winter) | push +3% | B&W | "FUNDING" white bold sans top-right f848, scales to huge across the top f858, "slows down" smaller under-right | 3D card flip 4f | low hit + hi crack f842 (+11/+20dB) |
| 43 | 35.12–36.00 | 878–900 | 0.88 | 5 | I | PHO/ARC | HQ/LOGO STROBE 4-5f each: dark warm lobby · Microsoft campus (Today-show lower third still on) · Airbnb HQ glass facade, pink sky, red logo · Apple store glass + logo · Meta HQ blue sign | startups that survive | L "the startups (that survive)" | push +3% | natural, slight push | small "the startups" | 4-5f cuts | - |
| 44 | 36.00–36.96 | 900–924 | 0.96 | 3 | I | ARC/PHO | B&W: Jobs & Wozniak 70s photo · Jobs with the original Macintosh (1984 portrait) · hands typing on an early terminal | are always the ones | L "that survive are always" | static | B&W | small | 8f cuts | low hit f900 (+12dB) |
| 45 | 36.96–37.28 | 924–932 | 0.32 | 1 | V | ARC | 90s founder at beige PC, pink wall, CNET bug | with | L "the ones" | static | archival | small | cut | - |
| 46 | 37.28–37.56 | 932–939 | 0.28 | 1 | V | PHO | 16:9 window inset on black: man on beige backdrop holding a banknote | a founder | L "with a" | static | window on black | small | cut to window | - |
| 47 | 37.56–38.96 | 939–974 | 1.40 | 4 | V | INT | Bezos on stage red curtain · Bill Gates (older) interview gesturing · young curly-haired founder in white tee, hands on head · Elon interview (Nat Geo bug, 15f) | people already trust. | L "founder people already trust" | static | natural | small "with a founder people already trust" | 6-8f cuts | - |
| 48 | 38.96–39.84 | 974–996 | 0.88 | 3 | V | STK | dark server room green LEDs · TURNTABLE / vinyl macro in red light (pun on "turn") · blue server rack | So we turn you into the | P "turn you into" | static | dark | small "so we turn you into the" | 8f cuts | noise burst / scratch into the drop at f982 (+14/+23dB) |
| 49 | 39.84–40.28 | 996–1007 | 0.44 | 1 | V | PHO | vintage reel-to-reel tape machine on dark | voice, your | L "voice" | static | dark | "VOICE" red Didone caps centre | hard cut | FULL DROP 40.0-40.9s: drums and bass out (kick -66, snare -79, bass -68 dB) |
| 50 | 40.28–41.20 | 1007–1030 | 0.92 | 5 | V | STK/ARC | B&W rapid: boxer slumped in ring corner · sculpted muscular back · white handheld mic in dark · night light-streaks · B&W night track w/ car silhouette (2-8f each) | niche actually listens | M "your niche" | push +7%, tilt down 3%H, rot +2° | B&W / dark | small "your niche actually" | 2-8f cuts | clicks on the cuts, music still dropped |
| 51 | 41.20–41.92 | 1030–1048 | 0.72 | 1 | V | STK | green CRT oscilloscope waveform jittering | to. | M "listens" | static | green on black | small "listens to" | hard cut | SUSTAINED TONE ~2-3kHz under the waveform 41.2-41.9 (a literal oscilloscope whine) |
| 52 | 41.92–43.16 | 1048–1079 | 1.24 | 3 | V | ARC | JFK: B&W at a podium · "Cuban Missile Crisis Address" TV (burned title kept) · colour at a podium w/ presidential seal, crowd, flags | The one people follow before | M "the one people follow"(a leader) | static | archival B&W then colour | small "the one people follow" | hard cuts | BEAT DROP back in at ~41.9s (kick -23, bass -25 dB from s42) |
| 53 | 43.16–43.56 | 1079–1089 | 0.40 | 1 | V | STK | bill-counting machine, bills fanning, motion blur | they ever | L "before they" | static | natural | small | hard cut | swell |
| 54 | 43.56–43.64 | 1089–1091 | 0.08 | 1 | G | GFX | 2f green light-leak overexposure | — | transition | static | light leak | - | flash | big hit: low +19 / mid +28 / hi +11 dB at f1089 |
| 55 | 43.64–44.48 | 1091–1112 | 0.84 | 8 | I | STK | $100 MACRO STROBE: "THE UNITED STATES OF AMERICA", Yellen signature, Federal Reserve seal, a 1f blue-tinted seal (f1108), flashes f1096 f1099; panning | need to buy. | L "ever need to buy" | push +7% | natural + 1f tint | small "ever need to buy" | 2-4f cuts | clicks on cuts |
| 56 | 44.48–45.68 | 1112–1142 | 1.20 | 4 | V | INT+GFX | Peter Thiel interview, background re-coloured pink/beige with horizontal PIXEL-SORT streaks (subject clean); f1124-1141 FACE-BOX SWAP: a square over his head cycles Bezos (red) → Zuckerberg (blur→sharp) → a third founder (purple) | One founder we worked with | L "one founder we worked with" | pull -3%, pan L→ 6%W, tilt up 8%H | pixel-sort background | ITALIC SERIF small 2-line caption left of the head "one founder / we worked with" | hard cut | low hit + short hit f1124 (+14/+22dB) |
| 57 | 45.68–47.52 | 1142–1188 | 1.84 | 1 | V | STK+GFX | cash-counting machine: white-gloved hands load $100s, bills riffle, LCD (moving) | had a 20,000 euro deal close in | L "a 20,000 euro deal close" | push +9% | natural | COUNT-UP TYPED: "€/" → "€ 20,000/" big white bold sans w/ blinking bar cursor, small "deal closed" under ~f1180 | hard cut | - |
| 58 | 47.52–48.40 | 1188–1210 | 0.88 | 1 | V | STK | night: horizontal rocket-engine plume igniting (blue/pink), whites out the frame f1193, blown-out white/pink fire | his first week | M "in his first week"(ignition) | pull -6% | blown highlights | small "in his first week" | hard cut | low hit + hi crack + swell at f1188 and riser-in + low hit at f1193 |
| 59 | 48.40–50.40 | 1210–1260 | 2.00 | 1 | V | MOV/ARC | trading floor: trader in a suit shouting into a phone, crowd (80s/90s film/archival, moving) | because buyers already felt like they knew him. That's | L "buyers already felt like they knew him" | push +7%, pan L→ 16%W | natural | small "because buyers already felt like they knew him" | hard cut | low hit + short hit f1210 |
| 60 | 50.40–51.12 | 1260–1278 | 0.72 | 1 | I | PHO→ILL | white ground: a tiny REAL brown cockroach, pushed in; at f1268 it becomes the black-ink engraving and keeps growing | what being a cockroach | L "that's what being a cockroach" | static | photo → engraving | small | hard cut to white | - |
| 61 | 51.12–51.48 | 1278–1287 | 0.36 | 9 | I | ILL | INVERT FLICKER: tiled engraving roaches (centre roach + ring) alternating black ground / white ground every 1-2f (B W W B W W B W W) | — | emphasis | static | negative flicker | - | 9f flicker | click on each flip (drums stem) |
| 62 | 51.48–52.00 | 1287–1300 | 0.52 | 11 | I | GFX/STK | ABSTRACT STROBE 1-2f each: pale blank · B&W swoosh · yellow-green paint · fire · a face warped behind glass · red eye macro · blue eye macro · red eye | actually | M "actually looks like" | static | mixed | - | 1-2f cuts | big hit at f1289 (low +17, mid +24 dB) |
| 63 | 52.00–52.60 | 1300–1315 | 0.60 | 1 | V | STK | a blue light burst, the iris resolves into EARTH FROM ORBIT (cyan white-out → ISS view of ocean + clouds) | looks like. When | transition (match cut) | static | cyan white-out | small "when" | circular MATCH CUT eye → Earth | riser-in + short hit |
| 64 | 52.60–53.80 | 1315–1345 | 1.20 | 1 | V | INT/ARC | black w/ window inset of the two Airbnb founders f1315 → bigger f1318 → full frame f1321: early Airbnb office, founders in chairs | Airbnb was broke | L "when Airbnb was broke" | static | archival | small; bold white sans LOCATION TAG bottom-left "Airbnb office, San Francisco, CA" | WINDOW-EXPAND | - |
| 65 | 53.80–55.00 | 1345–1375 | 1.20 | 2 | I | PHO | grey printout of number tables (.591 .733 1.32 / OBP SLG OPS TB GDP) panning down; f1365 garbled typewritten paper | and drowning in debt, | M "drowning in debt" | pull -3% | desaturated | small "and drowning in debt" | hard cut | - |
| 66 | 55.00–55.92 | 1375–1398 | 0.92 | 6 | V | STK | stacks of $100 bundles, handheld pans, cuts every 2-4f | the founders sold $40 | L "the founders sold" | static | natural teal-ish | small "the founders sold" | 2-4f cuts | low hit + hi crack f1375 |
| 67 | 55.92–56.32 | 1398–1408 | 0.40 | 1 | I | STK+GFX | fanned $100s | — | L "$40" | static | natural | "$40" big white ITALIC SERIF centre | hard cut | hi crack +29dB at f1398 |
| 68 | 56.32–56.68 | 1408–1417 | 0.36 | 2 | I | PHO | Obama O's cereal box product shot (white, OJ, bowl) · Cap'n McCain's red box cut out on black — the real Airbnb boxes | cereal | L "cereal boxes" | static | natural | "$40" held over them | hard cuts | - |
| 69 | 56.68–57.36 | 1417–1434 | 0.68 | 1 | V | STK | macro cereal loops falling, warm, defocused (moving) | boxes | L "cereal boxes" | static | warm blur | "$40" + small "cereal boxes" under | hard cut | - |
| 70 | 57.36–57.84 | 1434–1446 | 0.48 | 1 | I | ILL | white ground: engraved Creation of Adam hands with a small frame between the fingers → burst lines → a LIGHTBULB engraving between the hands | just to keep | M+P "keep the lights on" | static | engraving on white | - | hard cut | hi crack f1434 |
| 71 | 57.84–58.60 | 1446–1465 | 0.76 | 1 | V | ARC(home video) | archival home video: founder at a laptop by a window handling a cereal box | the lights on | L "keep the lights on" | pull -4%, pan R→ 11%W, tilt down 14%H, rot -6° | archival | small | hard cut | - |
| 72 | 58.60–60.24 | 1465–1506 | 1.64 | 3 | V | STK/INT(news) | rocket engine ignition close-up, smoke, orange fire · darker plume · aerial rocket lifting off the pad | because they understood that if nobody | M "they understood (if nobody)" | push +7% | natural fire | small "because they understood that if nobody" | hard cuts | low hit + hi crack + swell f1465 |
| 73 | 60.24–61.00 | 1506–1525 | 0.76 | 1 | V | STK(military) | night aircraft-carrier deck: fighter jet catapult launch, purple afterburner, deck crew in yellow; 1f RED flash frames at f1506 and f1516 | can find you, you're | M "can find you" | pull -14%, pan R→ 8%W, rot +6° | night, 1f red flashes | small "if nobody can find you" | cut on a 1f red frame | - |
| 74 | 61.00–62.00 | 1525–1550 | 1.00 | 1 | V | STK(news) | huge orange explosion fireball w/ spinning-globe news bug top-right | already dead. If | M "dead" | push +20%, pan R→ 4%W, tilt down 13%H | natural | "DEAD" red Didone caps lands f1534, flanked by small "you're" left and "already" right | hard cut | rise-in at f1525 |
| 75 | 62.00–63.28 | 1550–1582 | 1.28 | 1 | V | INT | Brian Chesky interview (black sweater, plant, windows) | you want to be the Airbnb | L "if you want to be the Airbnb" | static | natural | small; "AIRBNB" white condensed Didone caps left of his head f1569 | hard cut | hi crack f1550 |
| 76 | 63.28–63.92 | 1582–1598 | 0.64 | 1 | V | ARC | early Airbnb founders office footage | cockroach | L "the Airbnb cockroach" | static | archival | "AIRBNB" left + "COCKROACH" right, white Didone caps flanking | hard cut | - |
| 77 | 63.92–66.04 | 1598–1651 | 2.12 | 5 | V | STK | wide open-plan office of anonymous workers · traders at monitors · man on phone · hands on an old trading-turret keypad · teal close-up young man on phone | and not the startup, nobody remembers. Links | M "the startup nobody remembers" (anonymous people ON PURPOSE) | static | teal grade | small full sentence held | 5-20f cuts | - |
| 78 | 66.04–67.08 | 1651–1677 | 1.04 | 1 | G | GFX | black; white block cursor; "Link's" types small w/ block cursor; f1664-1666 blurs/scales up into "Link's in bio" medium white bold sans | in bio. | CTA | static | flat | "Link's in bio" | cut to black | low hit f1651, low hit f1664 |
| 79 | 67.08–70.48 | 1677–1762 | 3.40 | 1 | G | GFX | two white diagonal strokes grow from the bottom corners crossing as an X, then retract upward and collapse into the channel's two-chevron mark above the text (f1687); hold to f1760 | — | ident | pull -5% | flat | logo + "Link's in bio" | stroke animation 10f | music fades 67-70s |

## 2 · Music map, second by second

One track, ~118.8 BPM (beat 0.505 s, phase 0.36 s), dark trap/phonk: 808 sub on a 2-beat pattern, kick, snare, hat rolls, a synth pad/stab layer ("other" stem). Bed sits **0.8 dB under the voice** overall. Levels are dBFS RMS per second per stem.

| s | kick | snare | hat | 808 | synth/other | voice | what happens |
|---|---|---|---|---|---|---|---|
| 0 | -25 | -24 | -36 | -21 | -38 | -20 | cold open ON the beat: kick + 808 + hats from frame 0; founder strobe clicks |
| 1 | -22 | -22 | -33 | -25 | -39 | -22 | 808 gaps every other beat (trap pattern); particle cockroach |
| 2 | -21 | -21 | -47 | -24 | -36 | -21 | glitch/tower: low hit +20 ms |
| 3 | -24 | -24 | -45 | -21 | -38 | -22 | cheetah: low thumps on stencil flashes |
| 4 | -23 | -23 | -42 | -56 | -40 | -22 | glitch burst |
| 5 | -23 | -23 | -46 | -21 | -36 | -20 | "2 THINGS": riser-in + low hit |
| 6 | -22 | -22 | -40 | -24 | -35 | -22 | Antares flare, synth stab |
| 7 | -22 | -21 | -46 | -25 | -26 | -21 | B&W sparks; a low swell starts building (other-stem band 150–250 Hz) |
| 8 | -26 | -25 | -50 | -21 | -24 | -22 | swell peaks under the photo-tumble collage |
| 9 | -23 | -23 | -40 | -30 | -39 | -21 | 0.5 s PRE-DROP: 808 out 9.25–9.75, kick dips |
| 10 | -27 | -27 | -43 | -21 | -23 | -22 | SLAM on "#1" (10.00: kick -21, 808 -19, synth -21); kick out 10.50–10.75 under "SURVIVE" |
| 11 | -23 | -22 | -33 | -26 | -28 | -23 | kick back on the zoom-through jump (11.00); 808 out 11.50 before the pixel burst |
| 12 | -24 | -23 | -33 | -24 | -34 | -20 | lavender founder cards |
| 13 | -25 | -24 | -35 | -21 | -36 | -20 | engraving plates |
| 14 | -21 | -20 | -35 | -33 | -40 | -21 | loud kick section |
| 15 | -22 | -22 | -41 | -21 | -32 | -23 | card field |
| 16 | -18 | -17 | -41 | -29 | -31 | -21 | dolly-through: riser/swell |
| 17 | -23 | -22 | -42 | -24 | -34 | -22 | cards settle, "sits in one place" types |
| 18 | -22 | -22 | -37 | -21 | -32 | -20 | money strobe: one click per cut, hat roll |
| 19 | -20 | -19 | -34 | -64 | -32 | -20 | 808 OUT from 19.0 (to 23.2) |
| 20 | -29 | -26 | -66 | -66 | -36 | -20 | BREAKDOWN under "makes you invisible overnight": 808 out, snare -65, hats -78 (the music goes invisible) |
| 21 | -20 | -18 | -40 | -66 | -33 | -21 | logo ring spins in; still no 808 |
| 22 | -33 | -32 | -41 | -66 | -30 | -20 | "accounts" types |
| 23 | -34 | -31 | -36 | -46 | -30 | -20 | 808 back 23.25 on the window-grow |
| 24 | -34 | -30 | -35 | -33 | -32 | -20 | kick OUT 23–28.9, hats + 808 carry; microscope; note-corner strobe clicks |
| 25 | -33 | -28 | -33 | -31 | -37 | -19 | note-corner strobe clicks |
| 26 | -33 | -30 | -38 | -30 | -33 | -19 | pill punch broadband hit; COUNTER TICK-BEEPS 26.45–27.35 |
| 27 | -33 | -31 | -39 | -31 | -33 | -20 | beeps stop when 12,000 settles; cut to blue "5 Million" |
| 28 | -32 | -27 | -32 | -32 | -34 | -21 | 5 Million scramble |
| 29 | -27 | -26 | -35 | -32 | -27 | -21 | "#2": kick returns, synth swell (other -23 at 29.25) |
| 30 | -29 | -27 | -36 | -31 | -34 | -21 | OUTLAST zoom-through |
| 31 | -32 | -29 | -36 | -30 | -38 | -20 | archival founders; kick low (31–38) |
| 32 | -32 | -28 | -35 | -31 | -38 | -20 | archival founders |
| 33 | -32 | -29 | -34 | -32 | -35 | -20 | Jensen |
| 34 | -33 | -28 | -37 | -32 | -38 | -20 | FUNDING slows down |
| 35 | -33 | -31 | -36 | -32 | -37 | -22 | HQ strobe |
| 36 | -39 | -33 | -35 | -31 | -34 | -21 | B&W Jobs/Mac |
| 37 | -62 | -33 | -34 | -31 | -32 | -22 | founders trust; hats lively |
| 38 | -22 | -21 | -33 | -34 | -32 | -23 | Elon |
| 39 | -24 | -24 | -47 | -52 | -26 | -18 | 808 out from 39.25 (turntable "turn") + noise burst/scratch |
| 40 | -44 | -44 | -76 | -67 | -30 | -19 | FULL DROP 40.0–41.5: kick -66/-68, 808 -68 — under "VOICE, your niche actually" |
| 41 | -23 | -22 | -41 | -32 | -29 | -21 | oscilloscope with a sustained ~2–3 kHz tone; beat SLAMS back at 41.75 (kick -17, 808 -26) |
| 42 | -17 | -17 | -38 | -24 | -32 | -20 | JFK "the one people follow" on the full beat |
| 43 | -15 | -15 | -40 | -26 | -31 | -21 | money: green light-leak hit (43.56) |
| 44 | -17 | -17 | -35 | -21 | -26 | -20 | Thiel pixel-sort |
| 45 | -19 | -18 | -37 | -22 | -38 | -22 | face-box swap; € count-up starts |
| 46 | -14 | -14 | -36 | -21 | -43 | -18 | € count-up |
| 47 | -17 | -17 | -36 | -23 | -26 | -21 | rocket ignition: low hit + swell, white-out |
| 48 | -15 | -15 | -38 | -22 | -23 | -21 | trading floor |
| 49 | -18 | -18 | -36 | -22 | -30 | -20 | trading floor |
| 50 | -16 | -16 | -36 | -19 | -46 | -21 | tiny real roach → engraving |
| 51 | -15 | -15 | -35 | -19 | -33 | -22 | invert flicker clicks; abstract strobe big hit 51.56 |
| 52 | -17 | -16 | -34 | -24 | -28 | -22 | eye → Earth |
| 53 | -18 | -18 | -37 | -24 | -50 | -19 | Airbnb founders + location tag |
| 54 | -14 | -14 | -37 | -25 | -52 | -20 | stats printout; synth thin (other -54) |
| 55 | -17 | -17 | -33 | -19 | -42 | -20 | cash bundles |
| 56 | -16 | -16 | -35 | -20 | -50 | -21 | $40 cereal boxes |
| 57 | -17 | -17 | -34 | -21 | -47 | -23 | Creation of Adam lightbulb |
| 58 | -15 | -15 | -39 | -24 | -27 | -21 | home video; low hit + swell at 58.6 (rocket) |
| 59 | -17 | -16 | -38 | -26 | -24 | -19 | rocket |
| 60 | -17 | -17 | -35 | -21 | -24 | -20 | carrier jet launch |
| 61 | -16 | -16 | -38 | -21 | -23 | -22 | "DEAD": loudest kick of the edit (-12 dB) |
| 62 | -14 | -14 | -41 | -20 | -27 | -19 | Chesky; synth drops out after 62.75 |
| 63 | -17 | -16 | -35 | -23 | -47 | -22 | AIRBNB COCKROACH; drums + 808 only |
| 64 | -17 | -16 | -38 | -22 | -47 | -21 | anonymous office |
| 65 | -19 | -18 | -40 | -24 | -50 | -22 | "nobody remembers" |
| 66 | -17 | -17 | -43 | -24 | -50 | -20 | Link's in bio types; low hits |
| 67 | -24 | -24 | -42 | -27 | -46 | -29 | logo strokes; kick + 808 still going |
| 68 | -30 | -30 | -50 | -35 | -69 | -27 | fade begins |
| 69 | -38 | -38 | -67 | -47 | -73 | -69 | fade |
| 70 | -87 | -69 | -89 | -65 | -75 | -70 | silence |

(The "snare" column is the full drums stem level.)

**Section shape.** Intro on the beat from frame 0 → pre-drop gap 9.25–9.75 → slam on "#1" → kick drop-outs under
the big type → 808 out 19.0–23.2 (breakdown on "invisible") → no-kick groove 23–29 under the UI/number section →
kick back on "#2" (29.0) → low-kick archival stretch 31–38 → turntable + noise burst into a **full drop 40.0–41.5**
on "VOICE" → beat slams back 41.75 for "the one people follow" → full beat 42–62 (loudest at "DEAD") → synth out
62.75, drums + 808 into the CTA → fade 68–70.5.

**Cut ↔ music sync (measured):** cuts are NOT quantised to the beat — 23% of all 205 cuts sit within ±60 ms of a
beat (chance 24%), 47% within ±60 ms of an eighth (chance 48%). They follow the words weakly (66% of primary cuts
within ±80 ms of a word onset, chance 55%). The music is arranged around the script instead: drops and slams land
on chapter numbers and key words. Strobes carry their own clicks (one broadband transient per cut, visible 1:1 on
the drums-stem spectrogram at 18.5–20.5 s, 24.3–26.3 s, 51.1–51.5 s).

**Distinct SFX actually present** (most "sound" is the beat): per-cut click trains on strobes and flickers;
low thumps on 1-frame stencil/invert flashes; a riser + low hit into "2 THINGS" and the rocket white-out; a
swell under the photo-tumble collage (7.2–8.8); a noise burst/scratch on the turntable (39.3–39.9); a digital
counter tick-beep train under the 12,000 count-up (26.45–27.35, stops on the settle); a sustained oscilloscope
tone (41.2–41.9); green light-leak hit (43.56); big hit into the abstract strobe (51.56).

## 3 · Device catalogue (REF-3), with frame recipes at 25 fps

**A · Cutting devices**
1. **Founder strobe with a held word** (0.00–1.28): 9 images × 3 f (0.12 s), cycling 4 founders and repeating them (Altman, Jobs, Musk, Zuckerberg, Jobs, Musk, Altman, Zuck, Musk). The big word "startup" lands on its spoken frame (f21) and stays put across the next cut. One click per cut.
2. **Semantic object strobe** (18.76–19.80 portraits on US notes, 10 imgs, 2–4 f; 24.48–25.76 note corners US→foreign, 16 imgs, 2 f; 43.64–44.44 $100 macros 8 imgs; 35.12–36.00 company HQ/logo strobe 5 × 4–5 f): one *category* of object per strobe, each frame a different instance, with small rotate/push variation and a click per cut.
3. **Archival montage** (31.12–33.68; 36.00–38.96): 6–14 f per shot of real founders at the time they were "cockroaches" (early offices, SpaceX, Amazon, Google, Jobs/Woz, Mac portrait), archival look kept (TV lower thirds left in).
4. **Abstract strobe → match cut** (51.56–52.60): 11 images at 1–2 f (paint, fire, a face behind glass, three eye macros), then a blue light burst where the iris becomes Earth from orbit (circular match cut, 15 f).
5. **Visual pun beats**: "turn you" → turntable (39.28, 6 f between two server-rack shots); "lights on" → engraved Creation-of-Adam hands with a lightbulb (57.36); "listens" → oscilloscope (41.20); "first week" → rocket ignition (47.52); "the one people follow" → JFK at a podium (41.92); "nobody remembers" → anonymous office workers (63.92).

**B · Transitions (frame-exact)**
6. **Window-expand steps** (30.64 Gates 4f/4f/full; 23.32 microscope 2/2/3/full; 52.60 Airbnb 3/3/full): a 16:9 window on black, centred, at 36–44 % width → 62–65 % → full frame, HARD steps (no tween), 2–4 f per step; a black frame may sit between steps (f587).
7. **Pill punch-through** (26.32): a small black UI pill scales ×1.07, 1.19, 1.6, 1.94, 2.4 per frame (f655–660, with blur) and becomes the black ground of the next shot (f661).
8. **3D card flip into a corner card** (33.76–33.92): a full-frame photo flips in 3D over 4 f, shrinking into a small square bottom-left, freeing the frame for big type.
9. **Photo tumble-in** (8.20–8.60): ~10 photos fly in from off-frame, rotated ±5–15°, overlapping, one per 1–2 f, until the frame is a pile.
10. **Dolly-through card field** (16.00–16.88): camera flies forward through floating photo cards in 3D, cards motion-blurred past the lens; settles into a ring around a centre box (16.88).
11. **Pixel burst / pixelate-resolve** (4.36–4.68: black inset → 2 f pink/green pixel noise → inset → 2 f giant mosaic blocks → next shot; 11.76: radial zoom-blur burst 1 f → pixel scatter + black glitch blocks 4 f → pixel-mosaic ground).
12. **Light-leak / overexposure flashes**: 1 f blue-white flare (8.16), 2 f green overexposure (43.56), 1 f red frames inside the carrier shot (60.24, 60.64), blue light burst (52.00).
13. **Invert flicker** (51.12–51.44): black ground ↔ white ground every 1–2 f in the pattern B W W B W W B W W (9 f) on a tiled engraving; a click per flip.
14. **1-frame threshold-stencil negatives inside a shot** (3.60, 3.80, 4.00): the cheetah becomes a black halftone stencil on white for 1 f, three times, each with a low thump.
15. **2-frame RGB concentric-ring distortion** (9.08–9.16) over the collage, warping the word "isn't" — an emphasis hit on one word, not a between-shot glitch.

**C · Type devices**
16. **Flanking words**: two words either side of a centred window or of the subject — "we | built" white Didone around a B&W window (7.76); "AIRBNB | COCKROACH" white condensed Didone caps over footage (63.28); small "you're" + red "DEAD" + small "already" (61.36); small "every … time" pushed to the frame edges (5.88).
17. **Red numeral write-in** (#1 at 9.96–10.12, #2 at 29.08–29.24): red Didone numeral enters with a horizontal red streak smear for 5 f, holds, and on exit disintegrates into particles (#2, f737–741).
18. **Word colour flicker**: "2" alternates red/white every frame for 7 f (5.20–5.44) before "2 THINGS" holds red; "COCKROACHES" white → red → white → red over 4 f, then holds red (3.88–4.04).
19. **Zoom-through** (SURVIVE 10.48→11.76; OUTLAST 29.60→30.64): spaced white Didone caps appear at ~45 % width and slowly SHRINK ~1.5 %/f for 8–12 f; then jump to ~2.3–2.5× over 2 f with motion blur (cropped by the frame), then ease back ~1 %/f; a small sans line under it scales with it ("without the head" with "head" flickering bold/light each frame; "the winter").
20. **Ghost outline word** (1.76–2.40): giant outlined caps "COCKROACH" (thin grey stroke, no fill), cropped by the bottom edge, behind the subject, plus big typographic parentheses "( )" around the engraving.
21. **Typed big word** ("accounts" letter by letter, 22.0–22.6, with motion-blur trail); **scramble-type** ("5 Million" decoding 7 → 5X → 5M … 27.60–28.08 on flat electric blue, then a 2 f defocus pulse); **count-up with digit scramble** ("12,000 impressions" in a purple ring, 26.44–27.32, tick-beeps under it, stops when it settles); **typed count-up with a bar cursor** ("€ 20,000|" over a real cash counter, 45.80–47.48, "deal closed" small under). Note: there is no "!" — the stroke after the number is a blinking cursor.
22. **Italic serif tier**: "$40" huge white italic Didone (55.92), and a small 2-line italic caption "one founder / we worked with" beside a head (44.48).
23. **Location tag**: bold white sans bottom-left, bleeding off the left edge — "Airbnb office, San Francisco, CA" (52.84).
24. **Small captions**: every spoken word, but the slots are NOT always centred — spread to the frame edges ("every … time"), set left of centre over clean dark areas ("makes you invisible overnight" at ~45 % y, 19.8 s), or in the top-left corner on UI ("so we build you").

**D · Image treatments**
25. **Particle assemble** (1.32–1.56 and 13.84–14.40): blue particles assemble into a black-ink engraving on white.
26. **Face composite on an insect** (1.56–2.40): a founder's photo face sits on the engraved cockroach's head (blue-tinted, then natural).
27. **Encyclopedia page** (13.24–15.40): engraving plates with paragraphs, 3 plates × 5 f, then a full page with corner boxes joined by thin leader lines; small black/white squares pop onto parts of the body; a black block inverts its abdomen.
28. **Real → engraving morph** (50.40–51.08): a tiny real cockroach photo pushes in and turns into the ink engraving at f1268.
29. **Pixel-sort background + face-box swap** (44.48–45.68): the interview background is re-coloured pink/beige with horizontal pixel-sort streaks while the subject stays clean; a square box over his head cycles other founders' faces (Bezos → Zuckerberg (blur → sharp) → a third), 4–10 f each.
30. **Pixel-mosaic ground with floating cards** (11.96–13.24): pale periwinkle + white pixel squares; 6–8 tilted founder cards drift; one card glitches; one card zooms to the centre and a cyan censor bar flashes over the eyes for 2 f.
31. **Grades by source, never one global grade**: archival kept as-is (B&W, TV bugs, lower thirds), money teal-ish, fire/rockets warm and blown, embers orange, UI flat white/black/electric blue, B&W for workshop/sparks and the "your niche" rapid run.

## 3b · Against `skills/editor-v1/reference/devices.md`

**NEW in REF-3 (missing from devices.md):** 1 founder strobe with held word · 2 semantic object strobes · 4 abstract strobe → circular match cut · 5 visual puns as a deliberate device · 6 window-expand steps · 7 pill punch-through · 8 3D card flip to corner · 9 photo tumble-in · 10 dolly-through card field + settle ring · 11 pixel burst / pixelate-resolve · 13 invert flicker pattern · 14 1-frame stencil negatives inside a shot · 16 flanking words · 17 red numeral write-in + disintegrate · 18 word colour flicker · 20 ghost outline word + parentheses · 21 scramble-type, count-up with tick-beeps, typed count-up with cursor · 23 location tag bleed · 25–30 particle assemble, face-on-insect composite, encyclopedia page, real→engraving morph, pixel-sort background + face-box swap, pixel-mosaic ground · the **music arrangement as a transition** (pre-drop gap before a chapter number, full drop on a key word, beat slam on the next sentence, breakdown under "invisible").

**WRONG or missing detail in devices.md:**
- §3 Pop collage cites "REF-3 12–13s (photos on lavender)" — REF-3 has no white-box pop-in there; that is a pixel-mosaic ground with drifting cards (device 30).
- §4 3D wall cites "REF-3 15.8–17.8s: photos floating at depth" as the same device — it is a different one: the camera dollies *through* the card field and settles into a ring (device 10), not a sweep across a tilted plane.
- §6 Strobe: "a small white/black square hopping across them" is REF-2 only. REF-3's strobes have no square; they are one object category each, 2–4 f, with a click per cut, and the most common strobe is money (3 strobes, 34 images).
- §10 Datamosh lists "REF-3 9.12s a psychedelic colour-cycle frame" — it is a 2–3 frame RGB concentric-ring distortion used as an emphasis hit on the word "isn't" over a held collage, not a datamosh between shots.
- §12 Display words: "shock … cuts on hard … Once or twice a minute, never more" — REF-3 uses the red Didone tier 6 times in 70 s (COCKROACHES, 2 THINGS, #1, #2, VOICE, DEAD ≈ 5/min), and only VOICE/DEAD cut on hard: COCKROACHES and "2" flicker red/white first, #1/#2 streak in over 5 f.
- §12 is missing a whole tier: **white Didone** (lowercase "we/built", spaced caps SURVIVE/OUTLAST, condensed caps AIRBNB/COCKROACH, italic "$40", small italic captions). REF-3 has no chrome-fill title at all.
- "Not yet built: Giant word zoom-through (REF-3 10.6–11.5 SURVIVE, 29.8–30.2 OUTLAST): a serif word scaling past the camera" — it does not scale past the camera: it shrinks slowly, jumps to ~2.4× in 2 blurred frames, then eases back down (recipe 19). SURVIVE appears at 10.48 and jumps at 11.04; OUTLAST appears at 29.60 and jumps at 30.08.
- "Count-up on footage (REF-3 46.2–47.2s '€ 20,000!')" — it runs 45.80–47.48, it is TYPED (€, 2, 0, ",", …) with a blinking bar cursor, and there is no "!".
- "Engraving plate (REF-3 13.4–15.4s)" — 13.24–15.40, and it includes three 5-frame plates before the page, particle assembly, and pop-on blocks.
- "End ident" — REF-3: "Link's" types behind a block cursor (66.20–66.52), blur-scales to "Link's in bio" (66.56–66.68), then two white diagonal strokes grow from the bottom corners crossing as an X (67.08–67.44) and collapse upward into the two-chevron mark (67.48); held ~3 s while the music fades.
- SKILL/reference-log "detected changes/min 175" counts flickers: REF-3 is **211 distinct images = 180/min**, but only **94 primary cuts (≥0.2 s apart) = 80/min**.
- reference-log sound row for REF-3: "onsets within 2 frames of a cut 69%" is not meaningful — drum-stem onset density is so high that 82% of random times have one within ±40 ms. Cuts are not beat-locked (23% vs chance 24%).

## 4 · Stats (REF-3, 70.48 s)

| measure | value |
|---|---|
| distinct images on screen | **211** (≈180/min) |
| primary cuts (≥0.2 s apart) | 94 (≈80/min) |
| per-image duration | median **0.18 s**, mean 0.34 s; longest single held image 2.0 s (trading floor), 1.96 s (avatar-ring UI) |
| source of runtime | **video footage 51 %** · still images 34 % · graphics/UI built in the edit 15 % |
| by source category | stock footage 36 % · still photos 18 % · archival film/TV 11 % · interview/news 10 % · pure graphics 9 % · rebuilt UI 7 % · illustrations/engravings 6 % · movie/drama 3 % |
| literal vs metaphor | literal 58 % · **metaphor 31 %** · transitions/CTA 9 % · explicit puns ≈5 beats (turntable, lightbulb, oscilloscope, ignition, JFK) |
| rows with an in-shot move (flow) | 35 of 78 (push/pull 3–20 %, pans 3–28 % of width, card rotations); every still is pushed, pulled or animated |
| people on screen | only named founders/subjects (Altman, Jobs, Musk, Zuckerberg, Gates, Bezos, Page, Huang, Thiel, Chesky, the Airbnb founders, JFK) — plus anonymous office workers used ON PURPOSE for "the startup nobody remembers" |
| big-type moments | 21: white bold sans ×8 (startup, isn't, PAID ADS, accounts, 5 Million, FUNDING slows down, € 20,000, Link's in bio) · white Didone ×6 · red Didone ×6 · ghost outline ×1 |
| narrator on screen | 0 % |
| music | one 118.8 BPM trap/phonk bed, 0.8 dB under the voice, 6 arrangement events (pre-drop, slam, kick drop-outs, 808 breakdown, full drop, slam back) placed on script pivots |

## 5 · What makes it fire — and what a first draft lacks (ranked)

First draft checked at 2 fps: 13 beats in 19.4 s.

1. **Image count.** REF-3 puts ~180 images a minute on screen (median 0.18 s); the draft shows ~13 images in 19.4 s (~40/min), with single held beats of 1.3–4.3 s (the aurora beat is one photo for 4.3 s). At REF-3's rate those 19 s would carry ~55 images.
2. **Moving footage.** Half of REF-3's runtime is real moving video — cheetahs, rockets, explosions, trading floors, archival interviews, money counters. The draft has zero moving footage except the speaker's own camera: every beat is a still screenshot or a dark docs page. That is the biggest look difference: it reads as a screen share, REF-3 reads as a film.
3. **Metaphor and puns.** 31 % of REF-3 is metaphor (cheetah for the startups that aren't cockroaches, explosions for "killed", embers for "invisible", microscope cells for "pulling buyers in", oscilloscope for "listens", turntable for "turn", lightbulb for "lights on"). The draft is 100 % literal: docs pages, posts, a terminal. "Leaked", "nothing", "nobody has used these models" — each had a metaphor waiting (a leaking pipe or a vault door, an empty room, a dead dial tone) and got a page or black.
4. **The music is the transition system.** REF-3's single beat drops out before chapter numbers, goes silent on "VOICE", and slams back on the next sentence, and its loudest kick sits under "DEAD". The draft's bed runs flat under everything with one drop on "nothing". There is no pre-drop gap, no slam, no breakdown placed on a word.
5. **Sound per image, not synthesized ticks.** REF-3's strobes carry a real click per cut, the count-up has its own counter beeps, the oscilloscope hums, the turntable scratches into a drop. The draft used three generic synthesized sounds (tick/hit/glitch) at one level, with no per-image click trains.
6. **Type does more jobs.** REF-3 uses flanking words around a window or a subject, red numerals that streak in and disintegrate, zoom-through words, colour flicker on a word, typed and scrambled numbers with real counter sounds, a location tag, and a ghost outline word. The draft has one chrome title device and centred small captions; nothing types, scrambles, counts or flickers except the 404 line.
7. **Transitions are built from frames, not from fades.** Window-expand steps, pill punch-through, 3D card flip, photo tumble-in, dolly-through, invert flicker, 1-frame stencil negatives, light leaks, eye → Earth match cut. The draft has the tile reveal, an invert-in and two datamoshes, and repeats the tile reveal three times in a row.
8. **Every source gets its own look.** REF-3 grades per source (archival kept as archival with its TV bugs, fire blown out, money teal, UI flat electric blue). The draft's pages are all near-black docs screenshots and blur together (models, pricing, changelog, terminal all look the same).
9. **Real evidence, cinematically.** REF-3's literal beats are the real objects — the actual Obama O's / Cap'n McCain's boxes, Airbnb HQ, the founders' own early footage — always intercut with metaphor footage. The draft's evidence (posts, pricing) is right but is the whole edit.
10. **Captions placed for the picture.** REF-3 moves the small words — to the frame edges, left of centre over a dark area, top-left on UI. The draft always centres them, including over the speaker's chin.

What the draft already gets right: real sourced material on every beat, word-onset captions, red Didone on a key word, the datamosh, the white paper card, a matte composite.
