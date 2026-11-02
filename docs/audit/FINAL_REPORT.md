# Final report — audit, repair and polish pass (2026-11-01/02)

Full record with evidence: [LEDGER.md](LEDGER.md). Artifacts: `validation/audit/before/`, `validation/audit/after/`,
`validation/audit/compare/` (left = before, right = after).

## 1. Initial baseline

- HEAD `3ed1e1e9644b6c18c9a5ee0e762bde86070914f3`, main = origin/main, clean tree; safety tag `backup/pre-audit-2026-11-01`.
- Build ok (bundle `app-e3dd2d47e5.js`, 723 KB); unit 35/35; e2e 27/27 local, 26/26 live; Actions green.
- Deployed site = HEAD (same bundle hash). Perf iGPU HIGH 30.6 / BALANCED 85.3 / LOW 103.9 / AUTO 66.9 fps; dGPU 298 / 366 / 491 / 316.
- Baseline artifacts: `validation/audit/before/` (beats, cams, subs, actions, trans-*, scrub-*, paper-table-side.png,
  obb-collisions.txt, liveprobe.json, e2e-local.txt, e2e-live.txt, perf-*.txt).

## 2. Audit findings by severity

CRITICAL 0 · HIGH 4 · MEDIUM 11 · LOW 8 (23 in total; 3 found during repair).

- HIGH: D-01 a mouse-clicked console button swallowed Space/Enter; D-02 paper table tilted the wrong way through the
  sheet; D-03 FULL EXPLODE parts through each other and out of frame; D-04 interferences in 8 subsystem views.
- MEDIUM: D-05 reduced motion still auto-started the tour; D-06 view change mid-transition jumped; D-07 tour hand-over
  snapped; D-08 callouts over the panels; D-09 three close-ups under the panels; D-10 cameras/explode/constants outside
  `params.js`; D-11 hood lettering 2.8× oversize; D-12 STENCIL unreachable; D-13 phone portrait unusable; D-14 charts
  rewritten every frame; D-20 paper table decal over the sheet.
- LOW: D-15 label overlaps; D-16 per-frame allocation; D-17 chart cache key; D-18 e2e never checked geometry; D-19
  legible slugs; D-21 return "silent" (= D-01); D-22 spool cup vs side frame; D-23 duration label rounding.

## 3. Repairs completed

All CRITICAL/HIGH fixed; MEDIUM fixed except D-13 (partly: hint added); LOW fixed except D-19 (deliberate) and D-22
(needs a part redesign). Commits: `502b0ac` baseline · `243949c` HIGH · `ee6a9b2` MEDIUM/LOW · `69da6d4` pacing,
artifacts, docs.

## 4. Enhancements completed

E-01 FULL EXPLODE holds 1.8 s (tour 36.5 s); E-02 staged explode paths; E-03 reproducible audit tooling
(`scripts/audit.mjs`, `collide.mjs`, `compare.mjs`, impact sheet scripted); E-04 social preview re-rendered.

## 5. Mechanical corrections

The machine model was found sound (escapement, pitch, bell, line lock, return, spacing, shift, ribbon timing, impact
alignment verified edge-on). Corrections: paper table now lies under the incoming sheet and rises to the rear (D-02,
D-20); the ribbon selector reaches stencil (no lift, no ink) (D-12); drive angle, universal-bar engagement and
space-bar phases moved to `params.js` with the same values (D-10).

## 6. Teardown and explosion corrections

Interference is measured on the real geometry, headless (oriented boxes, triangle-confirmed for concave parts) at 25,
50, 75 and 100 % of every teardown. Before: 8 of 16 views interfered (worst 14.2 mm). After: 0 in all 16, on the way
and apart. Explode paths can be staged (wait / leave the mount / slide) and reassembly retraces them; captive
assemblies stay with the frame by measurement (key-lever skeleton, links + universal bar, escapement drops 4 mm);
the nested carriage → platen → paper offsets were flattened so the full explode fits the frame. Every button meets
the acceptance rule — table in LEDGER §7. Reassembly returns every part home exactly (residual < 1e-9).

## 7. Visual and camera corrections

Hood decal to reference proportions (D-11); paper table decal readable from the front and covered by a loaded sheet;
FULL EXPLODE, CARRIAGE RETURN, LINE SPACING and PLATEN cameras re-aimed (D-09); callout label boxes measured and kept
between the panels in all 29 views (D-08); chart and schematic label collisions fixed (D-15).

## 8. Interaction and accessibility corrections

Console controls no longer take focus on a pointer press, so typing after a click works (D-01; Tab focus and the
visible focus ring unchanged); reduced motion never auto-starts the tour (D-05); portrait phones get a readable
"turn sideways" hint (D-13).

## 9. Sound and tour corrections

Return sound restored by D-01 (0 → 30 voices in the probe). View changes never jump, live or at hand-over (D-06,
D-07), with the tour's own views proven identical to before. Tour explode hold lengthened (E-01). Soundtrack impacts
measured 6–7 ms after the modelled impacts (the attack).

## 10. Performance (`scripts/perf.mjs`, 1600 × 900, tour running)

| GPU | HIGH | BALANCED | LOW | AUTO |
|---|---|---|---|---|
| iGPU before → after | 30.6 → 30.0 | 85.3 → 80.4 | 103.9 → 105.5 | 66.9 → 80.3 |
| dGPU before → after | 298 → 341 | 366 → 460 | 491 → 519 | 316 → 347 |

The dGPU (CPU-bound) gains 14–26 % from writing chart/schematic markup only on change and no per-frame allocation;
the iGPU is GPU-bound and within run-to-run noise.

## 11. Tests added and executed

Unit 56/56 (was 35): `geometry.test.js` (paper table; 16 teardown interference tests at four stages; exact
reassembly), `views.test.js` (continuity; tour views unchanged), stencil cycle in `model.test.js`, staged paths in the
desk test. E2E 30/30 local (was 27): typing after a mouse-clicked button, reduced motion after idle, hand-over
continuity, callout bounds in 29 views, rotate hint, colour cycle. Live site 29/29 (the root-path test is local
only).

## 12. Still-frame and transition validation

Final, from the release build: `validation/contact-sheet.png` (24 beats), `validation/scrub-01…05.png` (whole tour at
0.2 s, 183 frames), `validation/impact-sheet.png`, `validation/views-sheet.png`, `validation/audit/after/` (beats,
cams, subs × isolate/x-ray/cutaway, actions, `trans-<id>.jpg` for all 16 teardowns in and out at 0.2 s, scrubs).
Inspected for collisions, floating parts, impact alignment, ribbon timing, carriage agreement, clipping, contrast,
callout drift and explode clarity; page errors during all captures: none.

## 13. Before-and-after artifacts

`validation/audit/compare/`: D-02 paper table (side), D-03 full explode, D-04 × 9 views, D-08 callouts, D-09 × 3
cameras, D-11 hood decal, D-02/D-15 hero, and `transition-<id>.jpg` (before above, after below) for explode,
carriage, escapement, linkage, basket, ribbon feed.

## 14. Video

Pipeline working; FFmpeg 9.0.2 present. `npm run video` → `validation/video/underwood-no5-tour.mp4` (git-ignored,
≈ 44 MB): 36.5 s, 1920 × 1080, 60 fps, H.264 yuv420p, AAC 48 kHz, peak −1.3 dBFS; contact sheet of the encoded file:
`validation/video-contact-sheet.png`.

## 15. Remaining limitations and deferred items

- D-13: no portrait console layout (it would be a second layout of every panel, against the fixed-stage rule);
  portrait phones get a hint instead. Landscape phones work but the type is small.
- D-19: slug legends readable from the front (SIMPLIFIED, documented).
- D-22: the spool cups reach ~3 mm into the side frames' top edge; moving them inboard enough fails the typebar
  clearance test — needs a spool-cup redesign.
- Captive assemblies (key-lever skeleton, links, universal bar, escapement) stay with the frame in FULL EXPLODE; UNIVERSAL
  BAR and RIBBON LIFT are isolations — by measurement, documented in `docs/ASSUMPTIONS.md`.
- The oriented-box test is conservative around round parts (boxed square).

## 16–20. Release

- Repository: https://github.com/SimSI2027/Typewriter-Teardown
- GitHub Pages: https://simsi2027.github.io/Typewriter-Teardown/
- Release commit `69da6d4c37de592d8af437e69c4078debb9070f5`: Actions run 41387391328 **success**; live `version.json`
  = that commit, bundle `app-7a8e360634.js` = the local build; live e2e 29/29, no console errors or failed requests.
- This report and the live e2e screenshots are committed on top as a docs-only commit; its hash, Actions status and
  `git status` are given in the final message of the session.
