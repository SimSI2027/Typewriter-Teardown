# Final acceptance and repair pass (2026-11-02)

The previous audit ended on `6367226` with passing tests. Using the site exposed four defects the tests did not
represent: no sound, clicks stopping the experience, RESUME restarting the tour, and a look that was not polished
enough. This pass reproduced them, repaired them and verified the result locally and on GitHub Pages.

Safety tag: `backup/pre-acceptance-2026-11-02` (= `6367226`, pushed). Commits: `d53d7ad` reproduction tests and
the experience-state model · `b29d0f6` sound lifecycle · `6c61bd8` pause / resume / takeover / restart · `725f769`
visual polish · this report.

## Reproduction (baseline `6367226`, headed Chromium, real autoplay policy)

`scripts/repro-baseline.mjs` measured at the speakers with `scripts/audio-probe.js` →
`validation/acceptance/before/repro.json`:

| Observation | Measured |
|---|---|
| Sound during the tour | no AudioContext, peak 0.000, while the button read **SOUND ON** |
| Visitor clicks SOUND ON | the tour stopped and the sound was **muted** (label → SOUND OFF); typing then: peak 0.000 on a running context |
| One keystroke | **93** voices started (12 expected) |
| Subsystem click mid-tour, then RESUME | τ 5.21 s → **0.056 s** (restart) |
| PAUSE mid-tour | a takeover (tour off) plus a paused, blank visitor clock; PLAY ran an idle machine; RESUME → **0.062 s** |
| Idle resume after a takeover | → **0.208 s** (restart) |

The acceptance suite written for this pass fails 0 / 20 on the baseline (`results-baseline-6367226.json`).

## Root causes

1. **Silent sound.** The AudioContext was created lazily inside `takeOver()`, so the tour, the page's default state,
   was always silent, and nothing said so. The button rendered SOUND ON from a `muted = false` flag, not from the
   audio state, so the visitor's natural first click toggled mute **on** and, like every control, ended the tour.
   Separately, every cue was rescheduled on every frame: the window reset compared τ with a look-ahead that always
   lies ahead of τ, so voices stacked 3× at 60 Hz and about 8× at 144 Hz. The result was phasey, compressor-pumped
   clacks, not crisp ones.
2. **Stop on click.** Every console control (sound, volume, quality, panels, pause) and any `pointerdown` anywhere
   called `takeOver()`.
3. **Resume restarting.** RESUME, PLAY TOUR, idle and the end of the tour all called `startTour()`, which rebuilt the
   tour and set its clock origin to now (tour time 0). No interruption point was ever stored, and the one Boolean
   (`tour.on`) could not tell paused, manual, idle and complete apart.

## State machine (`src/experience.js`, pure, 9 unit tests)

`loading → tour ⇄ paused`; `tour | paused → manual` (takeover); `manual → idle` (8 s quiet, countdown shown) →
`tour` (25 s quiet, *resumed from the interruption*); `tour → complete` (hold the last frame, the machine is the
visitor's) → `tour` from 0 after 8 s and 25 s of quiet (loop). One tour clock `tourT` moves only in `tour` (or by an
explicit scrub / step while paused). RESUME continues from it; **RESTART TOUR is the only return to 0** (besides the
loop after completion). `entry` records start / resume / idle / restart / loop. Reduced motion: starts in `manual`,
never starts or resumes by itself, and holds the camera still. No automatic resume while a drag is held, while the
visitor's queued keystrokes are still running, or while they hold their own machine paused. A tour paused with PAUSE
stays paused.

Takeover comes only from the machine and its views: keys (keyboard or clicked), machine buttons, camera / subsystem /
x-ray / cutaway / reassemble, an orbit drag (after 4 px), a zoom. Sound, volume, quality, panels, Tab, Esc and the
tour transport never take over. A plain click on empty floor only wakes the sound. A takeover keeps the paper, the
view and an in-progress stroke (which completes). It also takes the machine before reading its shift state: the
first key typed over a tour capital printed a capital. The transport row drives what is on screen: PAUSE / RESUME /
STEP and the timeline scrub the tour while it is shown, and the visitor's machine otherwise. Resume and restart blend
camera and look from the visitor's view into the tour's (1.1 s) instead of cutting.

## Sound lifecycle (`src/sound.js`, `src/live.js`)

States `unavailable / locked / running / suspended`; the visitor-facing status is `on / off / locked / none`. The
context is created or resumed only during a user activation, from capture-phase listeners on every gesture, so there
is no autoplay warning and no takeover. Until then both sound buttons read **ENABLE SOUND**. The button acts on the
state at the start of the press: enable, mute or unmute. Mute and volume persist (localStorage, best effort) across
unlock, hidden tabs and reloads. A hidden tab suspends the context and visibility resumes it. Each cue is scheduled
exactly once, keyed by kind and machine time, with a bounded late window. +3 dB makeup into a limiter keeps the peak
at −1.1 dBFS at full volume; the carriage run is fuller. An analyser on the final mix and cue counters back
`LIVE.audio`.

## Visual improvements (`725f769`)

Gloss japanning instead of matte charcoal: base specular 0.12 under a clearcoat of 1 at roughness 0.1, a darker
environment room with brighter soft boxes. Brighter, smoother steel and nickel. Hero camera pulled back 5 % and
lowered so the sheet clears the status bar; hero callouts beside the machine. An opaque loading card replaces the
visible shader warm-up (a ghosted x-ray machine under a console that read MANUAL / SOUND ON). The status bar
(mode · tour time, PAUSE / RESUME TOUR, RESTART TOUR, sound) replaces the chip; pressed buttons pulse; the title
reads REASSEMBLED instead of an internal camera id. Social preview re-rendered. Evidence:
`validation/acceptance/compare/` (hero, enamel, loading, explode, resume: before | after).

## Tests

- `tests/model/experience.test.js`: 9 (unit total 65 / 65).
- `tests/e2e/acceptance.mjs`: 20, in Chromium with `--autoplay-policy=user-gesture-required`, sound proved at the
  destination by the probe. Part of `npm run test:e2e`.
- `tests/e2e/run.mjs` updated to the corrected semantics: 30 / 30.
- `scripts/sound-evidence.mjs` (recorded mix + EBU R128), `scripts/teardown-check.mjs` (headed walkthrough),
  `scripts/look.mjs` (material and framing comparison).

## Reproduction matrix (all pass locally headless and headed, and on the live site headless and headed)

| # | Path | Verified |
|---|---|---|
| M1 | tour → PAUSE → RESUME | tour time, camera, sub, machine τ and cursor frozen for 1.5 s; resume event at exactly the held time |
| M2 | tour → camera button → RESUME | manual at the click, tour time held, resumes at it |
| M3 | tour → subsystem mid-stroke → RESUME | view opens, the machine clock keeps running, typing works in the view, resumes at the held time on the tour's own view |
| M4 | tour → click a key → RESUME | the stroke prints, resumes at the held time |
| M5 | tour → orbit drag → RESUME | takeover at drag start; the first resumed frame continues the visitor's camera (Δaz < 6°) |
| M6 | tour → zoom → RESUME | as above |
| M7 | tour → keyboard → RESUME | "Hello" printed, resumes at the held time |
| M8 | interruption → idle | countdown from 8 s; no resume while a drag is held; resumes at the interruption, entry `idle` |
| M9 | complete → RESTART TOUR | holds at 36.5 s, machine usable, main button reads RESTART TOUR; restart → 0, entry `restart`; RESTART mid-run → 0 |
| M10 | PAUSE → typing → RESUME | resumes at the paused time |
| M11 | mute → RESUME → unmute | muted: nothing scheduled, silent at the speakers; unmuted: cues and output return |
| M12 | unlock → PAUSE → RESUME | context stays running; audible after resume |
| M13 | tab hidden → shown | context suspended, tour clock frozen; on return running, no jump, tour continues |
| M14 | reduced motion | manual at load, no start after 60 s quiet, camera still, PLAY TOUR → 0, entry `start` |
| + | non-machine controls | sound, quality, panels, Esc, Tab, a click on empty floor: the tour keeps running |
| + | timeline / STEP | scrub and step the tour (paused); RESUME plays on from there |

No console errors or failed requests in any of them; the suite fails on any.

## Sound evidence (headed Chromium; the recorded mix is what the page hands the output device)

Local and live alike: no context before a gesture; after ENABLE SOUND the context runs at 48 kHz (output latency
40 ms) and the device clock advanced 0.448 s in 0.5 s. Tour −24.5 LUFS / −1.4 dBTP, visitor typing −23.4 / −2.0,
RETURN −26.5 / −5.3, tour bell and return −20.4 / −1.6, muted −70 (silence) (live run). Every cue kind played:
keyTouch, keyBottom, impact, escTick, carriageStep, ribbonFeed, barRest, spaceTouch, shiftThunk, leverGrab, ratchet,
carriageRun, marginStop, leverBack, bell. `validation/acceptance/sound/` and `validation/acceptance/live-sound/`.

## Teardowns (headed, local and live)

KEY LINKAGE, TYPEBAR BASKET, IMPACT, RIBBON FEED, ESCAPEMENT, CARRIAGE, SHIFT, CARRIAGE RETURN, PLATEN and FULL
EXPLODE were each opened by hand from a running tour and operated while open (a key, SPACE, SHIFT + G, RETURN).
Each separates or exposes its parts and ghosts or moves the body aside. The working part takes the brass accent
mid-stroke. The tour stays held at the interruption throughout, REASSEMBLE returns the machine, and RESUME continues
at the held time (`validation/acceptance/teardown/`, `validation/acceptance/live/`). Exact reassembly and
interference at four stages of every teardown remain covered by the unit tests (`geometry.test.js`).

## Limitations

- RESUME shows the tour's own machine at the held time. Text the visitor typed stays in their session and is replaced
  by the tour's sheet, and a stroke in progress at the takeover replays its tail.
- I cannot listen. Sound is proven by the recorded output stream, the device clock, the destination probe and
  loudness measurements, not by ear.
- Chromium only; Firefox and Safari were not run. Unlocking uses standard activation events, so iOS Safari should
  unlock on the first tap's touchend, but this is untested.
- Performance was not re-measured; the material types and shader programs are unchanged (clearcoat was already on).
- Earlier open items remain: D-13 (phone portrait letterboxes the console; a hint shows) and D-22 (a spool cup near the
  side frame).
