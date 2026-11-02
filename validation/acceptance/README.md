# Acceptance evidence (2026-11-02)

Visitor-experience acceptance of the live page: sound, pause / resume / takeover / restart, idle, reduced motion.

- `before/`: the baseline `6367226` reproduced in headed Chromium with Chrome's real autoplay policy
  (`scripts/repro-baseline.mjs`, measured at the speakers through `scripts/audio-probe.js`).
  `repro.json` holds the numbers. The JPEGs show a silent tour whose sound button claimed SOUND ON, the
  tour stopped by that button, and RESUME restarting from 0.
- `results-baseline-6367226.json`: `tests/e2e/acceptance.mjs` run against that baseline (0/20).
- `results-local*.json` / `results-live.json`: the same suite against the repaired production build (local, under the
  Pages base path, headless and headed) and against the deployed site.
- `shots/`: frames the acceptance suite keeps (paused tour, manual mode in a subsystem view, sound locked).
- `sound/`: `scripts/sound-evidence.mjs`, which records the exact mix handed to the audio device (MediaRecorder on
  the destination tap) during the tour, manual typing, a carriage return and the tour's bell and return, then while
  muted. `sound-evidence.json` holds EBU R128 loudness and true peak per clip, the device's output clock advancing,
  and the cue counts. The PNGs are the clips' waveforms.
