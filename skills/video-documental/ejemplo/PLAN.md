# Style: **editor-v1** — WORKED EXAMPLE

The plan of the first full Editor V1 edit: the 45 s cold open of an "AI Editor Showdown" video
(1920×1080 @30, 44.97 s, a straight teleprompter read). Kept as a reference for how lines map to
devices and sources. Its media is not in the kit.

No tighten pass: the longest pause is 0.37 s. Timing is `work/tx/words.json` (three 20 s windows
stitched), with the first word after every real pause snapped to the pause's end (`snap-onsets.py`).
The take differs from the script in one word ("a single **line**", not "frame"): three passes agreed,
so the caption shows what was said.

## Beats (out time = source time, no cuts)

| t | said | device | real material |
|---|---|---|---|
| 0.00 | Right now, | tile reveal from black onto a race start | archival race start (PD film) |
| 0.48 | three AI companies | pop collage, one card per word, pulls out, white-block shatter | the three HQs |
| 1.52 | are in a race: | archival race, whip-carry zoom | archival harness race |
| 2.32 | Claude, ChatGPT, Gemini. | each company's own film, the cut on each name | the three companies' launch films |
| 4.64 | Billions | money strobe, 2 frames per note, a click per note | US banknote macros (PD) |
| 5.12 | of dollars, | headline strobe over a cash counter | real funding headlines |
| 5.76 | a new model every few weeks, | the real release calendar: names land on their dates | 12 releases, dated from the makers' own pages |
| 7.68 | and every single one of them | the three CEOs, rack-focus in, one per beat | official keynote footage |
| 9.20 | says it's the best. | their own pages, highlighter on the claim, red BEST | the three flagship announcement pages |
| 10.56 | Benchmark, charts, leaderboards. | a maker's own bar chart, then the 3D wall, landing on the leaderboard | announcement tables, public leaderboards |
| 12.80 | But none of that | datamosh to a black word card, the bed pulls down | — |
| 13.60 | answers the questions … care about. | the speaker, raw camera, punch on "really" | — |
| 15.84 | Which one can edit a video? | HERO: the speaker cut out, the world behind swaps company → company → archival film editing; red **EDIT** behind the head | company films + archival film-splicing footage |
| 18.16 | And yes, we've seen AI editors. | platform hop across the real AI-editor sites | the editors' own homepages |
| 20.56 | They cut your silence, | rebuilt waveform of THIS take; its real silences flag red and snap shut | the take's own audio |
| 21.76 | they slap some captions on, | pun: archival label-slapping machine + a cliché auto-caption (made for this video) | Prelinger industrial film |
| 23.04 | and that's it. | archival "THE END" card; the bed cuts out | PD film end title |
| 23.92 | I'm talking about real editing. | the speaker, raw, red **REAL** behind the head; the bed slams back | — |
| 25.84 | Fast cuts, | blade strobe (scissors, splicer, cutter), 2 frames each | stock / archival |
| 26.64 | transitions, | four transitions back to back in 19 frames | callback pictures |
| 27.28 | sound effects, | a Foley artist at work | archival |
| 28.08 | every picture, | every picture in this video, 2 frames each | this edit's own sources |
| 28.72 | every sound | speaker cones / scopes, shape-matched | stock |
| 29.68 | landing right on the word. | the rebuilt timeline of THIS edit: clips snap to the word onsets | this build's own data |
| 31.28 | So who wins? | photo finish (callback to the race) | archival triple dead heat |
| 32.56 | Honestly, you tell me. | a comment box, cursor blinking | rebuilt UI, no fake comments |
| 34.16 | But this video right here, | this very edit shrinks into a player window | pass 1's render of this video |
| 35.52 | the cuts, the transition, the sound effects, the music. | the machinery: every shot as a filmstrip, a transition, the real cue sheet, the bed's waveform | this build's own files |
| 38.32 | I didn't edit a single line of it. | the speaker, raw; "line" → the real build.py scrolling | this build's code |
| 40.72 | Claude did. | the bed CUTS OUT, the line plays dry over the Claude mark + the real render log | the mark, the session's render output |
| 41.68 | And this is just day one. | the song's drop slams in; sunrise from orbit | NASA (PD) |
| 43.04 | From here, it only gets better. | rocket liftoff → the speaker cut out in front of it | NASA (PD) |

## As built (46.4 s, 1392 frames, -18.9 LUFS, true peak -3.3 dBTP)
- The brand-film logo overlays were dropped: the films carry their own marks.
- A drop or impact ON "Claude" masked the consonant (a re-transcription heard "Flaw dead"). The fix is
  REF-2's punchline grammar: the bed cuts out on the flash into the mark, "Claude did." plays dry, and the
  drop slams in on the next line.
- Two passes: PASS=2 uses pass 1's render for the player window, the filmstrip, the timeline thumbs, a
  clean hero frame (captions hidden), and the real render line in the session log.
- Ends on a 1.4 s card: the three marks.

## Sources and licences (format to copy; checked on the day of the edit)
| beat | material | source | licence / flag |
|---|---|---|---|
| race start / race / dead heat | 1947 newsreel gate · harness race · 1953 triple dead heat | archive.org · mixkit.co · Wikimedia Commons | PD · Mixkit licence · PD |
| three companies | a company film frame · two HQ photos | YouTube (official) · Commons | commentary use · CC BY-SA 4.0 (credit the photographers in the description) |
| Claude / ChatGPT / Gemini | the three launch films | the companies' official channels | company films, commentary use: FLAG |
| Billions / of dollars | US notes · cash counter · funding posts/headlines · an SEC filing | Commons · Mixkit · first-party pages · press · sec.gov | PD · Mixkit · commentary use |
| new model every few weeks | 12 releases on a calendar | first-party release notes / changelogs | dates from the makers' own pages; where two pages disagree, say which one was used |
| the CEOs | three keynote clips | official channels | commentary use: FLAG; the people ARE the subject of the line |
| says it's the best | three announcement pages | the makers' own sites | first-party, quoted exactly, highlighter boxes measured by OCR |
| benchmarks / leaderboards | announcement charts · leaderboards (dated, "preliminary" noted) | as listed | commentary use |
| hero / blades / labels / Foley / speakers | archival films · stock clips | archive.org · mixkit.co | PD · Mixkit |
| AI editors | the editors' homepages | the sites, captured that day | first-party pages, commentary use |
| THE END | a 1945 film's end title | Commons | PD (copyright not renewed) |
| day one / from here | ISS sunrise · Saturn V | NASA | PD; don't imply NASA endorsement |
| sound | sfx/ev1kit | scripts/synth-sfx.py | made in code |
| bed | the creator's own track | their library | cleared for their videos |
