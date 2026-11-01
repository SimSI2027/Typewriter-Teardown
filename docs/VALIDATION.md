# Testing and validation

All results below come from the current `main` build (Chromium 145 via Playwright 1.58, Windows 11; GPUs: AMD Radeon
integrated graphics and NVIDIA RTX 4090).

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Model unit tests (deterministic state, progress, key mapping, key travel, key→typebar, strike position, ribbon, impact timing, character placement, escapement, one-space advance, space, backspace, shift and lock, bell threshold, line lock and release, return, spacing, platen/paper, paper limit, reset, seeking/truncation, invalid input, sound cues) | `npm test` | 25 / 25 |
| Mechanics (typebar sweeps vs neighbours, spools, deck, decal panel; type-guide clearance; rack/pinion/wheel ratio; keys and levers vs base; explode vectors stay above the desk; platen ratchet geometry) | `npm test` | 10 / 10 |
| Production e2e in Chromium (every console control, physical typing, clicking the machine's keys, shift/caps lock, invalid input, all 16 subsystem and 13 camera buttons, x-ray, cutaway, reassemble, return/spacing/colour/lock, pause/step/slow/speed/timeline scrub, reset, mute/volume, panels, all quality modes, orbit/zoom, tour hand-over, no resume mid-drag, resume after 25 s, keyboard focus, console errors/failed requests, local-path leaks, five layouts incl. phone portrait and landscape with touch, reduced motion, root vs `/Typewriter-Teardown/` base path) | `npm run test:e2e` | 27 / 27 |

The e2e suite also runs against the deployed site: `node tests/e2e/run.mjs --url https://simsi2027.github.io/Typewriter-Teardown/`.
Screenshots of every layout are written to `validation/e2e/`.

## Still-frame review

- `validation/contact-sheet.png`: one frame 0.9 s after every tour beat (24 beats).
- `validation/scrub-01…05.png`: the whole 35.5 s tour at 0.2 s intervals (178 frames), covering every transition.
- `validation/views-sheet.png`: all 13 cameras, all 16 subsystem views, x-ray and cutaway at the impact moment.
- `validation/impact-sheet.png`: the slow-motion strike around impact.
- `validation/video-contact-sheet.png`: frames decoded from the encoded video at every beat.

### Problems found and fixed

| Found | Fix |
|---|---|
| Key levers dipped 8 mm into the base plate at full travel (mechanics test) | lever line raised 34 → 44 mm in `params.js` |
| Explode vectors sent levers, sublevers and shift parts below the desk | vectors changed to lift-and-slide service directions; test added |
| Slow-motion beats started their keystroke during the 0.3 s speed ramp, so impacts ran nearly at full speed | strokes start after the ramp settles; beats retimed (impact of "r" now at 11.92 s in deep slow motion) |
| Ghosted assemblies rendered opaque and cream (three.js OPAQUE define) | programs switch to the transparent variant; both variants warmed before the first frame |
| Side panels kept a ghost colour after warm-up (cloned material) | side panels got their own material group |
| Brass accent tinted the ribbon orange and turned the whole carriage brass | fabric/paper/decals never take the accent; large castings take 35 % |
| Escapement bracket hid the dogs | replaced by thin bearing posts |
| Space bar hidden behind the front key row | space bar moved forward, front rail lowered |
| Rod parts built along the wrong axis (space bar arms sticking out) | geometry rebuilt along the rod axis |
| Paper entered the platen from the wrong side | wrap angle corrected: the sheet leaves the table at the platen's rear-bottom tangent |
| Charts followed shift actions instead of keystrokes | they follow the last stroke |
| Callout labels unreadable over dark parts; schematic cramped; gauge labels overlapping | pale label backing; schematic re-laid out; bell label above the gauge |
| Mobile: the 1600 px stage widened the layout viewport (page scroll) | fixed, clipped body |
| Typing at 1× overran the queue (last keys refused) | live machine time catches up (≤ 5×) while keys are queued |

### Checked and found sound

Keys stay on their stems and levers; each lever turns about the rear fulcrum; the link pull equals the sublever travel;
typebars stay on the segment arc and clear their neighbours through the whole stroke; every slug face reaches the
printing point at impact and never enters the platen; the ribbon is up before impact and down after; characters appear
exactly at impact, in the carriage's column and the platen's line; the carriage moves left one space per stroke in two
escapement steps (0.22 + 0.78 tooth); the escapement wheel only turns forward (backspace and return freewheel the
pinion); shift raises the subcarriage 5 mm; the bell rings once, 7 spaces before the lock, as the carriage arrives on
column 65; platen rotation equals paper travel (arc length); callout leaders end on their parts in every view.

## Video

`npm run video` → `validation/video/underwood-no5-tour.mp4` (git-ignored; attached to the GitHub release):
35.5 s, 1920 × 1080, 60 fps, H.264 yuv420p, faststart, AAC 48 kHz, peak −1.4 dBFS. Every frame is rendered by
`window.SIM.render(t)`; the soundtrack is rendered offline from the same session's cues. Audio onsets measured in the
soundtrack match the modelled impacts (f 5.26 s, o 8.56 s, r 11.92 s).

## Performance (`node scripts/perf.mjs`, 1600 × 900, tour running)

| GPU | HIGH | BALANCED | LOW | AUTO settles on |
|---|---|---|---|---|
| AMD Radeon (integrated) | 30 fps | 86 fps | 103 fps | BALANCED, 72 fps |
| NVIDIA RTX 4090 | 300 fps | 384 fps | 502 fps | HIGH, 311 fps |

Measures: one PCF shadow type for every tier (a tier change never recompiles), shadow map redrawn every 2nd/3rd
frame below HIGH, GTAO only on HIGH, MSAA 8/4/2, pixel ratio capped 2/1.25/1, instanced keys, levers, links, typebars
and slugs, shared geometries and per-assembly material clones that share programs, panels redrawn every other frame
on LOW, all shaders compiled in parallel before the first frame, rendering and audio stop while the tab is hidden.
