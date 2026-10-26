---
name: pinterest-references
description: Research visual references on Pinterest before designing any UI (app, screen, landing page, dashboard, component, brand look), show them to the user, and distill them into a DESIGN.md that drives the build. Use whenever the user shares an app idea to design or build, asks for design inspiration, a moodboard, or mentions Pinterest references.
---

# Pinterest references

Good design starts from references, not from defaults. Before writing UI code for a new idea, go find what
good looks like, show it to the user, and turn it into concrete decisions.

Needs the `pinterest` MCP server (`pinterest_begin`, `pinterest_search`, `pinterest_save`, `pinterest_done`).
If a call fails with "No hay sesion", tell the user to run `npm run login` in `C:\dev\pinterest mcp` and stop there.

## 1. Read the idea

Call `pinterest_begin` right away with the idea in a line and the project path. It starts the timer that
measures this run.

Pull out: what the product is, who uses it, platform (mobile, web, desktop), the mood it should have, and the
2-4 screens that matter most. If the mood is not stated, infer it from the audience and say what you inferred.

## 2. Search

Write 3-5 queries **in English** (Pinterest indexes English best), each a different angle:

- the product plus the platform: `habit tracker mobile app ui`
- the mood or style: `calm minimal pastel app design`
- a key screen: `fitness app onboarding screen`
- optionally a pattern or component: `stats dashboard cards ui`, or a palette or type idea

Specific beats generic: `"banking app dark mode ui"`, not `"app"`. Call `pinterest_search` for **all queries in
parallel**, in one message with several tool calls (the default of 12 pins each is enough). If a query comes back
weak, rewrite it and search again.

## 3. Choose, looking at the images

You get thumbnails: look at them. Keep 12-20 pins across all searches. Throw out anything off-topic, blurry,
full of text, a stock photo when you needed UI, or near-duplicates. Aim for variety: layout, color,
typography, and details, not 15 copies of the same shot. Write a one-line `why` per pick, naming what to take
from it ("card radius and soft shadows", "the violet-to-coral gradient").

Call `pinterest_save` once with `project_dir` = the project's absolute path, a short `topic`, and the picks,
best first.

## 4. Show them to the user

In chat, render the saved images as Markdown images using the absolute paths the tool returned (up to ~12;
point to `moodboard.html` for the rest). Under them, in a few lines, say which direction you took and why. If
the user was only asking for inspiration, stop here. Otherwise, go on unless they push back.

## 5. Distill into DESIGN.md

Write `DESIGN.md` at the project root. That is what drives the build, not the images. Include:

- **Direction**: 2-3 sentences, plus the reference files that define it.
- **Palette**: background, surface, text, primary, accent, success, error, as hex values taken from the
  references and their `dominant_color`, with light/dark variants if they apply.
- **Typography**: font families (real Google Fonts or system fonts), size scale, weights.
- **Shape and space**: radius, spacing scale, shadows or borders, density.
- **Patterns**: layout of each key screen, components, and how imagery or illustration is used.
- **Avoid**: what the references do that does not fit this product.

Take principles, never a 1:1 copy of one design.

## 6. Close the measurement

Once `DESIGN.md` is written (or right after step 4 if the user only wanted inspiration), call `pinterest_done`
and show the user the time breakdown it returns, as-is.

## 7. Build from it

Build the UI from `DESIGN.md` (design tokens first). Only reopen a specific reference image when a detail
calls for it.
