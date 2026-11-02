# Typewriter-Teardown — permanent project rules

Interactive 3D teardown simulator of an **Underwood No. 5** desktop typewriter (representative c.1920–1932 US pica machine),
built in the spirit of the `teardown` skill (V8 / Cessna / Strandbeest examples).

## Non-negotiables

- **One authoritative model.** `src/model.js` (with `src/params.js`, `src/keyboard.js`) is the only source of machine
  state. Geometry, console numbers, charts, schematic, callouts, highlights, sound cues, camera beats, tour and video
  all read `stateAt(τ)`. Nothing that represents mechanical state is animated independently.
- **Deterministic.** State at machine time τ is a pure function of (session events, τ). No `Math.random`, no `Date`,
  no frame-delta integration in model code. The film `render(t)` is pure; frames can render in any order.
- **Centralized parameters.** All dimensions, clearances, pivots, timings, explosion vectors and camera targets live in
  `src/params.js`. Fix collisions by changing numbers there, never by hiding them with the camera.
- **Honest data.** Every dimension/claim in `params.js` and `docs/ASSUMPTIONS.md` is tagged VERIFIED / ESTIMATED /
  SIMPLIFIED. Never present an estimate as a verified historical specification.
- **No third-party imagery** in the app. `references/` photos are local study material only — never imported, bundled,
  embedded or deployed. All geometry, decals and textures are generated from code.
- **Look:** warm pale studio, gloss-black iron, one warm brass accent for the part working now, no neon, no emoji,
  no game icons, no long educational text. The machine is the hero (60–70 % of the primary view).
- Console layout is a fixed 1600×900 CSS stage scaled to fit; every number/chart/schematic redraws from frame state.

## Layout

```
src/params.js        parameter block (dims mm, timings s, explode, cameras)
src/keyboard.js      key layout, char→key, key→typebar slot
src/model.js         action/state model: events → snapshots → stateAt(τ); pure, no three.js
src/geometry/*.js    code-built parts (frame, keys, typebars, carriage, ribbon, escapement…)
src/machine.js       assembles geometry, poses it from state + view
src/stage.js         renderer, lights, post, quality tiers, warm-up
src/views.js         cameras, subsystem modes (isolate / explode / cutaway / x-ray), pure blends
src/console/*.js     overlay panels, charts, schematic, callouts
src/tour.js          deterministic tour script (operator moves + typed text), cursor path
src/sound.js         WebAudio synth; cues derived from model state (live + offline render for the film)
src/experience.js    visitor experience state machine (loading/tour/paused/manual/idle/complete); pure, unit-tested
src/live.js          interactive page; src/film.js capture page (window.SIM.render(t))
scripts/             build, dev, preview, capture (stills/sheets), video, validate
tests/model/         node:test unit tests of the pure model
tests/e2e/           Playwright production tests
validation/          kept stills, contact sheets, validation notes (no raw frame dumps)
```

## Commands

- `npm run dev` — build (debug) + local server. `npm run build` — production build into `dist/` (base path relative,
  works at `/Typewriter-Teardown/`). `npm run preview` — serve `dist/`.
- `npm test` — model unit tests. `npm run test:e2e` — Playwright against the production build (controls and layouts,
  then the visitor-experience acceptance suite with the real autoplay policy: `npm run test:acceptance`).
- `npm run validate` — beat stills + contact sheet + 0.2 s transition scrubs into `validation/`.
- `npm run video` — deterministic 1920×1080 60 fps H.264 tour with synced sound (`validation/video/`).

## Testing rules

- Run `npm test` and `npm run test:e2e` before every release commit. Do not commit with failing tests.
- After visual changes, render beat stills and read the contact sheet before calling anything done.
- Check browser console errors, failed requests and asset paths in the production build.
- Interaction or sound changes: run `node tests/e2e/acceptance.mjs --headed` too. Prove sound at the destination
  (`scripts/audio-probe.js`, `scripts/sound-evidence.mjs`), never only by counting scheduled cues. RESUME must
  continue from the held tour time; only RESTART TOUR may return to 0.

## Git & publishing

- Default branch `main`. Logical commits at stable milestones. Never commit node_modules, dist, caches, browser
  profiles, credentials, or raw frame sequences.
- Public GitHub repo `Typewriter-Teardown` (account SimSI2027). GitHub Pages deploys from GitHub Actions
  (`.github/workflows/pages.yml`) on pushes to `main` — keep Pages in sync with stable `main`.
- **Never deploy to Vercel.**
- If an optional feature threatens stability: finish, test, commit, push and deploy the stable simulator first.
