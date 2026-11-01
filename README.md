# Underwood No. 5 — Teardown Simulator

An interactive 3D teardown of an **Underwood No. 5** desktop typewriter, built entirely from code. Type on it with your
keyboard or by clicking its glass keys; open any mechanism with one button; watch one deterministic machine model drive
the keys, linkage, typebars, ribbon, escapement, carriage, bell, platen and paper, while every gauge, chart and the live
schematic read that same model.

**Live demo:** https://simsi2027.github.io/Typewriter-Teardown/  
**Tour video (35 s, 1080p60, with sound):** [underwood-no5-tour.mp4](https://github.com/SimSI2027/Typewriter-Teardown/releases/download/v1.0.0/underwood-no5-tour.mp4)

![Underwood No. 5 teardown simulator](public/social-preview.png)

Left alone, the page tours itself with a visible cursor. Any click, drag, scroll, touch or key press hands you the
machine; after 25 s of quiet the tour resumes.

## What it does

- **Operates:** characters, space, backspace, shift (carriage shift: the subcarriage rises 5 mm), shift lock, margin
  release, carriage return with 1/2/3 line spacing, ribbon colour (black / red / stencil), margin bell 7 spaces
  before the line lock, line lock at the margin.
- **One model:** `src/model.js`. Every operator action is a normalized, deterministic stroke; the machine at any
  machine time τ is a pure function of the session and τ. Seeking, scrubbing, slow motion, the tour and the film all
  read it.
- **Console:** live column, readouts (key travel, typebar angle and speed, ribbon lift, universal bar, escapement phase,
  carriage travel, mainspring tension, platen angle, line, shift, margin, ribbon feed), the line on the paper, a
  key-to-strike chart, a carriage-and-escapement chart, and a side-section schematic with an escapement inset.
- **16 subsystem views** (isolate, cut away, explode along service directions), X-ray, cutaway, reassemble, 13 cameras,
  callouts with leaders that follow their parts.
- **Sound:** synthesised mechanical sounds, each scheduled from the action that moves the part.
- **Quality:** AUTO / HIGH / BALANCED / LOW (MSAA, GTAO, shadow-map size, pixel-ratio cap; AUTO steps down on slow GPUs).

## Controls

| Input | Action |
|---|---|
| Typing | characters (`1` types as a lower-case l, as on the period machine; unsupported characters are ignored) |
| Space / Backspace / Enter | space / backspace / carriage return |
| Shift (hold) / Caps Lock | shift / shift lock |
| Click a key, the space bar or the return lever | operate it |
| Drag / scroll | orbit / zoom |
| ← → | step machine time (pauses) |
| Esc | hide or show the panels |

## Development

```
npm install
npx playwright install chromium   # for tests, stills and video
npm run dev        # debug build + local server on http://127.0.0.1:5173/Typewriter-Teardown/
npm run build      # production build into dist/
npm run preview    # serve dist/
npm test           # model unit tests (node:test)
npm run test:e2e   # Playwright tests against the production build
npm run validate   # beat stills, contact sheet, views sheet, 0.2 s transition scrubs → validation/
npm run video      # deterministic 1920×1080 60 fps H.264 tour with sound → validation/video/
```

Source layout, rules and the testing policy are in [CLAUDE.md](CLAUDE.md). Sources and the VERIFIED / ESTIMATED /
SIMPLIFIED classification of every dimension: [docs/SOURCES.md](docs/SOURCES.md),
[docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md). Validation results: [docs/VALIDATION.md](docs/VALIDATION.md).

## Deployment

GitHub Pages via GitHub Actions (`.github/workflows/pages.yml`) on every push to `main`: install, unit tests,
production build, upload, deploy. Asset paths are relative, so the site works under `/Typewriter-Teardown/`.

## Credits

Built in the manner of the `teardown` skill (V8 / Cessna / Strandbeest examples); its shader warm-up module and
capture approach derive from [whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion) (MIT). See
[THIRD_PARTY.md](THIRD_PARTY.md). MIT licence.
