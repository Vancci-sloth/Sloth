# Editor V1 — finding the real material

The brief this style answers: understand on your own what the speaker is talking about and
get the picture references yourself. So sourcing is the job, not a garnish. For every line
in the transcript, ask: **what real thing is the speaker talking about, and where does its
own picture live?** Write the answer into `PLAN.md` as a table (line → thing → source URL →
licence → device) before building. `ejemplo/PLAN.md` shows the format.

## Moving footage first
`scripts/find-footage.py "<idea>" <outdir> --src archive,nasa,commons,mixkit,yt` writes a
numbered thumbnail sheet per idea — choose by LOOKING. Then `scripts/ev1_clip.py` cuts, fills
16:9, grades (natural/mono/teal/warm/cold/archive) and normalises (30fps CFR, -g 30).
What has worked:
- **Mixkit tag pages** (`/free-stock-video/<tag>/`, 1080/720 mp4 at assets.mixkit.co): drips,
  server rooms, an empty spotlit mic, a cash counter, glitch noise, light leaks.
- **archive.org Prelinger** (public domain): "Design for Dreaming" (1956) — GM Motorama crowds
  around new cars. Its full-text search is noisy; search the film by title.
- **Wikimedia Commons video** (licence per file): an aurora timelapse (CC BY 3.0), tumbleweeds.
- **The company's own film** via yt-dlp `--download-sections "*a-b" --force-keyframes-at-cuts`
  (a keynote: the logo, the room) — flag as commentary use.
- Mixkit search pages are client-rendered (no results over curl); NASA SVS's API ignores its
  query; Pexels returns 403.
- Pick the moment with a 2-3 fps scan of the clip (`scripts/clipsheet.py out.jpg clip1 clip2 …`),
  never the middle of the file: a tumbleweed may only roll in its first second, a tap only
  drips every 0.4 s.

## Where things live (in order of preference)
| the speaker talks about… | get it from | how |
|---|---|---|
| a company | its HQ / product photo on Wikimedia Commons; its own brand mark (SVG on Commons, usually PD for wordmarks) | Commons API `list=search&srnamespace=6`, then `prop=imageinfo&iiurlwidth=2600`. Send a User-Agent. Record licence + author (CC BY-SA needs credit in the description). |
| a product / model / price | the company's own docs, pricing, changelog, models pages | `scripts/capture.mjs` at dsf 2, then crop ≤ half the display width |
| something people posted | the post itself | `api.fxtwitter.com/<user>/status/<id>` (text, media `?name=orig`), card via `platform.twitter.com/embed/Tweet.html?id=<id>&theme=dark` in `capture.mjs` |
| an API response / error | the real response text from a source (screenshot, docs) | rebuild it: `terminal()` / `typewriter()` |
| space, earth, science | NASA Image and Video Library (public domain) | `images-api.nasa.gov/search?q=…&media_type=image` → `images-assets.nasa.gov/image/<id>/<id>~orig.jpg` (**https + -L**: the collection lists http URLs that 301) |
| a person who is the subject | interview/press footage of that person (yt-dlp sections) | flag rights; never a random person as filler |
| an abstract idea (perception, momentum) | public-domain art, NASA, Commons | one theme per strobe; each image a different treatment |

## Traps (each one produced a plausible blank)
- **Some sites sit behind Cloudflare** (openai.com did) — headless returns a "verify you are
  human" page. Drop it; the developer docs subdomain usually captures fine.
- **NASA collection URLs are http** — curl without -L saves the redirect HTML as `.jpg`.
  `file *.jpg` after every download.
- **X embeds render emojis as `<img>`** — `capture.mjs` hides them; check anyway. A
  screenshot *inside* a post with emoji marks and reaction rows: retype its text in
  `typewriter()` instead of showing it.
- **Cards come back on the embed's white page** — `trim_card` in
  `ejemplo/work/prep.py` finds the card's rows first, then its columns inside those rows.
- **Consent walls and scroll-reveal pages** return grey or half-empty captures —
  `capture.mjs` clicks Accept and walks the page first; look anyway.
- **Look at every capture** (contact sheet + one full-size) before it enters a build.

## Facts
Caption live numbers, flag single-source claims as single-source (a vendor's own count of
its models is the vendor's claim — use it for a rebuilt list, don't assert it in a caption).
Keep a `SOURCES` table in `PLAN.md` with URLs, licence and the date checked, and flag any
third-party clip whose rights are unclear before it reaches a render.
