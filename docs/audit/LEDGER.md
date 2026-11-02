# Audit ledger — audit, repair and polish pass (2026-11-01)

The single record of this pass: baseline, findings with evidence, decisions, repairs, tests and verification.
Specialist reviews (the twelve areas) were run as sequential passes by the chief of staff; nothing below was
implemented before the findings were consolidated here.

## 0. Safety reference and baseline

| Item | Value |
|---|---|
| HEAD at start | `3ed1e1e9644b6c18c9a5ee0e762bde86070914f3` (main = origin/main, tree clean, no stashes, no tags) |
| Backup | tag `backup/pre-audit-2026-11-01` at that commit |
| Toolchain | Node 24.19.0, Playwright 1.58.2 (Chromium), three 0.186.1, esbuild 0.28.1, ffmpeg 9.0.2, Python 3.12 |
| GPUs | AMD Radeon integrated (iGPU), NVIDIA RTX 4090 (dGPU) |
| `npm test` | 35 / 35 pass |
| `npm run build` | ok — `dist/index.html` 3.0 KB, `assets/app-e3dd2d47e5.js` 723 KB |
| `npm run test:e2e` (local, `/Typewriter-Teardown/` base) | 27 / 27 pass — `validation/audit/before/e2e-local.txt` |
| e2e against the live site | 26 / 26 pass — `validation/audit/before/e2e-live.txt` |
| Deployed build | `version.json` commit `3ed1e1e…`, bundle `app-e3dd2d47e5.js` = the local build byte-for-byte name (content hash) |
| Last Actions run | success (run 41363035964, commit 3ed1e1e) |
| Pages | build type `workflow`, https://simsi2027.github.io/Typewriter-Teardown/ |
| Perf (iGPU, 1600×900, tour) | HIGH 30.6 · BALANCED 85.3 · LOW 103.9 · AUTO 66.9 fps (settles BALANCED) |
| Perf (dGPU) | HIGH 298.3 · BALANCED 366.2 · LOW 490.7 · AUTO 315.6 fps |

Baseline artifacts (`validation/audit/before/`): `beats.jpg` (every tour beat), `cams.jpg` (13 cameras, x-ray,
cutaway), `subs.jpg` (16 subsystems × isolate / x-ray / cutaway), `actions.jpg` (strike, flight, ribbon rise,
carriage step, rigid dog, shift raised, bell, return lever, return mid-travel — tour view and hero view),
`trans-<sub>.jpg` (every teardown and reassemble at 0.2 s), `scrub-NN.jpg` (whole tour at 0.2 s),
`paper-table-side.png`, `collisions.json` (box audit), `obb-collisions.txt` (oriented-box audit),
`liveprobe.json` (live behaviour probes), `perf-*.txt`. Full-resolution frames are kept locally (git-ignored).

Audit tooling added (no product behaviour change): `scripts/audit.mjs` (captures and sheets), `SIM.view()` and
`SIM.boxes()` on the film page, `tests/model/obb.js` (the real geometry built headless in Node, oriented-box +
triangle interference test).

## 1. Configuration represented

One representative Underwood No. 5, US pica, 10-inch carriage, c.1920–1932 (four-bank 42-key keyboard with
nickel-rimmed glass-topped keys, front-strike basket of 42 bars, carriage shift, two-colour ribbon, left-hand
return lever, margin bell in the left side frame, open side frames with windows, gold "No 5 · UNDERWOOD STANDARD
TYPEWRITER · No 5" front rail). Matches the local reference photographs (front, both sides, rear, basket detail) and
`docs/ASSUMPTIONS.md`; classification VERIFIED / ESTIMATED / SIMPLIFIED is kept in `src/params.js` and
`docs/ASSUMPTIONS.md` and is unchanged by this pass except where noted below.

## 2. Checked and found sound (no action)

- One authoritative model: geometry, console, charts, schematic, callouts, accent, sound cues, tour and film all
  read `stateAt(τ)`; no `Math.random`/`Date` in model, view, tour or film code (`performance.now` only drives the
  live wall clock). Seeking and truncation are unit-tested.
- Impact alignment (edge-on and front close-ups at the "r" strike): the lower-case character on the slug sits on
  the printed baseline; the black half of the lifted ribbon covers the printing line; slug → ribbon → paper order;
  the glyph appears exactly at impact. Ribbon is up before impact and down after.
- Escapement two-step advance (0.22 + 0.78 tooth), one pitch per stroke, wheel never reverses, backspace and return
  freewheel the pinion; bell rings once at column 65 (7 before the lock); line lock and margin release; platen
  rotation = paper feed; shift raises the subcarriage 5 mm — all unit-tested and visible in the action stills.
- Every visible control responds (27 e2e tests), sound voices are created for a keystroke (37 voices for one
  "a"), no console errors or failed requests locally or live, base path works at `/Typewriter-Teardown/` and `/`.
- Capture: `window.SIM.render(t)` is pure; video pipeline (ffmpeg present) and offline score render from the same
  cues.

## 3. Findings

Severity as defined in the brief. Every entry has evidence; dispositions are filled in as work completes.

| ID | Sev | Area | Finding | Evidence | Proposed fix | Risk | Regression test | Disposition |
|---|---|---|---|---|---|---|---|---|
| D-01 | HIGH | Interaction | After a console button is clicked with the mouse it keeps focus, so Space and Enter re-activate that button instead of typing: typing `a b⏎` printed `ab`, no space, no return. | `liveprobe` focus probe: acts `char,char`, col 10→12, lines 0, view still `basket` | Console buttons, sliders and the chip do not take focus on a pointer press (keyboard Tab focus unchanged) | Keyboard navigation — Tab focus must still work | e2e: click a subsystem button, type `a b⏎` → `ab` + space + return | **fixed** — `console.js` `noPointerFocus` on buttons, sliders, chip; e2e "mouse-clicked console button keeps no focus" (types `char,space,char,ret`) |
| D-02 | HIGH | Geometry | Paper table rotated with the wrong sign (`carriage.js:196`): its long axis rises toward the front, crossing the incoming sheet in an X and leaning over the platen; its gold "Underwood" faces the rear (read mirrored from behind). | `before/paper-table-side.png`; `subs` carriage still (mirrored decal); axis (0, .85, +.53) vs paper path (0, .85, −.53) | Use `+atan2` so the table lies under the incoming paper, decal toward the operator | Table arms, paper path | unit: table axis ∥ incoming paper; decal normal toward +z | **fixed** — `carriage.js` `paperTable()` (+atan2); unit "paper table lies under the incoming sheet"; after: `after/paper-table-side.png` |
| D-03 | HIGH | Teardown | FULL EXPLODE intersects: shift lift rods through the deck strip 14.2 mm, space bar into feet/front rail 7.9 / 5.7 mm, segment into deck 5.1 mm, key row 1 through the exploded hood 3.4 mm (×22), universal bar into rear cross member 2.9 mm, shift vs backspace 2.5 mm; the stack leaves the frame (carriage and paper table cropped at the top, over the view title). | `obb-collisions.txt`; `subs/sub_explode.png` | Re-tune `EXPLODE` vectors in assembly order and the explode camera in `params.js` | Other views share the vectors | unit: no new interference > 1 mm in any subsystem pose; stills | **fixed** — staged explode paths (`EXPLODE` `{at: …}`), captive assemblies stay (see §4); unit "teardown FULL EXPLODE … on the way or apart" checks 25/50/75/100 % |
| D-04 | HIGH | Teardown | Subsystem poses create interferences: KEY LINKAGE levers↔sublevers/links 2.1 mm (×84); TYPEBAR BASKET segment↔deck 3.6, segment↔u-bar 1.9, u-bar↔escapement 1.5; RIBBON FEED spools↔return lever 4.4; UNIVERSAL BAR links↔u-bar 13.0 (×3), u-bar↔escapement 4.5; BACKSPACE link↔u-bar 3.3; MARGIN BELL margin rack↔carriage 1.4; ESCAPEMENT 1.0. | `obb-collisions.txt` | Explode the coupled parts together / along their own axes (numbers in `params.js`) | Teardown readability | same unit test as D-03 | **fixed** — `VIEW_EXPLODE` re-tuned per view (see §4); 16 unit tests, one per subsystem, at 25/50/75/100 % |
| D-05 | MEDIUM | Accessibility | With `prefers-reduced-motion: reduce` the tour does not start at load, but 25 s of inactivity starts it anyway. | `liveprobe.json` reducedMotion {atLoad false, afterIdle true} | No automatic (re)start under reduced motion; PLAY TOUR still works | none | e2e: reduced motion + idle → no tour | open |
| D-06 | MEDIUM | Views | A view change during a running transition pops: the camera jumps (distance 1464 → 780 mm) and the explode/fan jumps (0.19 → 1) in one frame, because the new transition starts from the previous view's end state. | `liveprobe.json` rapidSwitch | `viewAt` starts each transition from the blended state at the moment of the change (still a pure function of events and t) | Tour/film use events ≥ 1.25 s apart — unchanged | unit: viewAt continuous across a mid-transition event | open |
| D-07 | MEDIUM | Tour | Taking over during a tour view transition snaps to its end (camera 1520 → 920 mm, explode 0 → 1). | `liveprobe.json` takeoverMidTransition | Hand-over carries the tour's previous view and the change time | none | e2e: no jump at hand-over | open |
| D-08 | MEDIUM | Console | Callout labels overlap the side panels: the clamp limits the anchor of the label, not its text box (e.g. "Escapement" over the schematic in SIDE, "Spool"/"Feed ratchet" over machine state in RIBBON FEED). | `cams/cam_side.png`, `subs/sub_ribbonFeed.png` | Clamp the measured label box between the panels | none | e2e: label boxes never intersect panels across all views | open |
| D-09 | MEDIUM | Cameras | CARRIAGE RETURN, LINE SPACING and PLATEN close-ups put most of the mechanism under the right-hand panels / off frame; FULL EXPLODE crops the top (see D-03). | `subs` sheet | Re-aim those cameras (numbers in `params.js`) | none | stills | **fixed** — `SUBCAMS` ret / spacing / platen / explode re-aimed; explode stack flattened (offsets nest) |
| D-10 | MEDIUM | Architecture | Centralised-parameter rule broken: subsystem cameras and three explode vectors live in `views.js`; the typebar drive angle (88°), the universal-bar engagement angle (120°) and the space-bar phases live in `model.js`. | code | Move them to `params.js` with V/E/S tags (same numbers) | none | existing unit tests unchanged | **fixed** — `SUBCAMS`, `VIEW_EXPLODE`, `VIEW_SPREAD`, `VIEW_T`, `DRIVE`, `SPACE_PH` in `params.js`; unit suite unchanged (35 → still pass) |
| D-11 | MEDIUM | Fidelity | Hood lettering about 2.8× too large: "UNDERWOOD" spans ~60 % of the frame width vs ~21 % in the reference front photograph, where the name sits small under the basket arch; the "No 5" roundels are not on the reference hood. | `cams/cam_operator.png` vs local reference (front) | Redraw the hood decal from code: smaller name centred under the arch, pinstripe along the arch | none | stills | open |
| D-12 | MEDIUM | Model/UI | STENCIL (documented, modelled: no ribbon lift, no ink) cannot be reached: the RIBBON button toggles black/red only. | `model.js` resolve 'color'; README | Cycle black → red → stencil | e2e expects the old toggle | unit + e2e | open |
| D-13 | MEDIUM | Responsive | Phone portrait: the 1600×900 stage letterboxes to scale 0.24 — controls ~5 CSS px tall, machine ~9 % of the screen. | `validation/e2e/layout-phone-portrait.png` | A portrait console is a separate layout (conflicts with the fixed-stage rule); add a hint outside the stage to rotate the phone | none | e2e portrait | open |
| D-14 | MEDIUM | Performance | Both charts and the schematic rewrite their SVG every frame even when nothing changed (6 DOM writes per frame at rest). | `charts.js`, `schematic.js` | Write only when the markup changes | none | perf before/after | open |
| D-15 | LOW | Console | "CARRIAGE & ESCAPEMENT" header overlaps its status text; schematic labels LOOSE/RIGID overlap; FULCRUM clipped at the left edge. | `cams/cam_hero.png` | Layout numbers | none | stills | open |
| D-16 | LOW | Performance | `setGroupLook` allocates a `THREE.Color` per material per frame. | `materials.js` | Hoist the constant | none | — | open |
| D-17 | LOW | Charts | Chart sample cache key (session, index, t0) can collide after a scrub-back re-pushes an action at the same index and time. | `charts.js` | Key on type and key too | none | — | open |
| D-18 | LOW | Tests | The e2e subsystem test checks only `LIVE.view.sub`, never that the machine moved. | `tests/e2e/run.mjs` | Assert assemblies move on explode and return exactly on reassemble | none | itself | **fixed** — unit "every exploded view moves its assemblies, and reassembly returns every part exactly home" (residual < 1e-9) |
| D-19 | LOW | Fidelity | Slug legends read correctly from the operator side; real type faces are reversed and face the platen. | `before/` impact close-ups | Deliberate for legibility — record as SIMPLIFIED | none | — | open |

## 4. Teardown decisions (D-03, D-04)

Interference is measured on the real geometry (`tests/model/obb.js`): every mesh and instance as an oriented box,
hits on concave parts (extrusions with openings, the segment torus, lathed rims) confirmed triangle by triangle;
pairs that already touch at rest (joints, contacts) are excluded; curved strips (paper, ribbon) are not boxed. Round
parts are boxed square, so the test is conservative around cylinders. Every subsystem pose is checked at 25, 50, 75
and 100 % of its teardown (the way out, not only the end pose), tolerance 1 mm.

- Explode paths can be staged: `{at: [[k, [x, y, z]], …]}` in `params.EXPLODE` / `VIEW_EXPLODE`. A part waits for
  the ones in front of it or leaves its mount before it slides; reassembly retraces the path in reverse.
- Captive assemblies stay with the frame, by measurement, not by choice of camera: the key-lever skeleton (levers
  under their sublevers, the space bar's rear rod under every lever, the shift's lift rods between base, rail and
  deck), the links and the universal bar (interlocked), the escapement (rear cross member behind its foot, the
  universal-bar trip over its shaft — it drops 4 mm off its mount so the pinion leaves the rack).
- FULL EXPLODE order: hood forward over the resting keys (first 45 %); typebars up through the deck opening, then
  forward, fanned; keys lift off their stems after the hood has passed; return lever out to the left before rising;
  rails up off their brackets before going back; carriage → platen → paper as small nested steps (the offsets add).
- Views: KEY LINKAGE lifts the keys off their levers (levers stay on the fulcrum); TYPEBAR BASKET fans the bars on
  their own segment (fan 0.6 keeps the raised bars under the ribbon); RIBBON FEED moves spools and vibrator together
  forward past the return lever; CARRIAGE steps the vibrator down before lifting the carriage; PLATEN lifts the
  return lever out of the platen's way; UNIVERSAL BAR and RIBBON LIFT are isolations (hood/sides cut, rest ghosted)
  because those parts have under a millimetre of clearance on every side.
