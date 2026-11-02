// The experience state machine: pause, resume, takeover, idle, completion, restart, reduced motion.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createExperience, MODES} from '../../src/experience.js';

const TIMING = {idleHint: 8, idleResume: 25, completeHold: 8, resumeBlend: 1, dragStart: 4};
const D = 36.5;
const run = (X, T0, T1, opts, dt = 1 / 60) => {
  let T = T0;
  const evs = [];
  while (T < T1 - 1e-9) {
    const step = Math.min(dt, T1 - T);
    T += step;
    const e = X.tick(T, step, opts);
    if (e) evs.push(e);
  }
  return evs;
};

test('modes are explicit', () => {
  assert.deepEqual([...MODES], ['loading', 'tour', 'paused', 'manual', 'idle', 'complete']);
  const X = createExperience({duration: D, timing: TIMING});
  assert.equal(X.mode, 'loading');
  X.tick(1, 1);
  assert.equal(X.mode, 'loading', 'nothing runs before ready');
  assert.equal(X.tourT, 0);
});

test('PAUSE freezes the tour clock and RESUME continues from exactly there', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  assert.equal(X.mode, 'tour');
  assert.equal(X.entry, 'start');
  run(X, 0, 12.4);
  const t = X.tourT;
  assert.ok(Math.abs(t - 12.4) < 1e-9, `tourT ${t}`);
  X.pause(12.4);
  assert.equal(X.mode, 'paused');
  run(X, 12.4, 80); // a long pause: no automatic resume, the clock holds
  assert.equal(X.mode, 'paused');
  assert.equal(X.tourT, t);
  X.resume(80);
  assert.equal(X.mode, 'tour');
  assert.equal(X.entry, 'resume');
  assert.equal(X.tourT, t, 'resume does not move the clock');
  run(X, 80, 81);
  assert.ok(Math.abs(X.tourT - (t + 1)) < 1e-9);
});

test('a takeover holds the tour position; RESUME continues from it, not from zero', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  run(X, 0, 9.7);
  const t = X.tourT;
  const ev = X.takeover(9.7);
  assert.equal(ev.type, 'takeover');
  assert.equal(ev.tourT, t);
  assert.equal(X.mode, 'manual');
  run(X, 9.7, 15, {active: true}); // the visitor types for a while
  assert.equal(X.tourT, t, 'manual mode never moves the tour clock');
  X.resume(15);
  assert.equal(X.mode, 'tour');
  assert.equal(X.tourT, t);
  assert.equal(X.entry, 'resume');
});

test('takeover from a paused tour keeps the paused position', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  run(X, 0, 5);
  X.pause(5);
  run(X, 5, 7);
  X.takeover(7);
  assert.equal(X.mode, 'manual');
  assert.ok(Math.abs(X.tourT - 5) < 1e-9);
  X.resume(9);
  assert.ok(Math.abs(X.tourT - 5) < 1e-9);
});

test('idle: manual → idle after the hint, → tour resumed from the interruption after the full quiet', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  run(X, 0, 20);
  X.takeover(20);
  const t = X.tourT;
  run(X, 20, 27.9);
  assert.equal(X.mode, 'manual');
  run(X, 27.9, 28.1);
  assert.equal(X.mode, 'idle');
  assert.ok(Math.abs(X.autoIn(28.1) - 16.9) < 1e-6);
  const evs = run(X, 28.1, 45.1);
  assert.equal(X.mode, 'tour');
  assert.equal(X.entry, 'idle');
  assert.ok(evs.some((e) => e.type === 'resume' && e.entry === 'idle'));
  // the clock picked up exactly where the takeover left it (plus what has played since the resume)
  const resumedAt = evs.find((e) => e.type === 'resume').T;
  assert.ok(Math.abs(X.tourT - (t + (45.1 - resumedAt))) < 1e-6, `${X.tourT} vs ${t}`);
});

test('idle never fires while the visitor is active, holds their machine paused, or under reduced motion', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  run(X, 0, 3);
  X.takeover(3);
  run(X, 3, 60, {active: true});
  assert.equal(X.mode, 'manual', 'active');
  run(X, 60, 120, {held: true});
  assert.equal(X.mode, 'manual', 'held');
  // input while idle returns to manual (releasing the hold is itself an input)
  X.input(120);
  run(X, 120, 129);
  assert.equal(X.mode, 'idle');
  X.input(129);
  assert.equal(X.mode, 'manual');
  const R = createExperience({duration: D, reduced: true, timing: TIMING});
  R.ready(0);
  assert.equal(R.mode, 'manual', 'reduced motion: the tour does not start by itself');
  assert.equal(R.started, false);
  run(R, 0, 200);
  assert.equal(R.mode, 'manual', 'reduced motion: no automatic resume');
  assert.equal(R.autoIn(200), null);
  R.resume(200);
  assert.equal(R.mode, 'tour', 'PLAY TOUR still works');
  assert.equal(R.entry, 'start');
  assert.equal(R.tourT, 0);
});

test('the tour completes, holds, then loops from 0 when quiet; RESTART is the only manual way back to 0', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  const evs = run(X, 0, D + 0.5);
  assert.equal(X.mode, 'complete');
  assert.equal(X.tourT, D);
  assert.ok(evs.some((e) => e.type === 'complete'));
  run(X, D + 0.5, D + 7.9);
  assert.equal(X.mode, 'complete', 'holds the last frame');
  run(X, D + 7.9, D + 8.2);
  assert.equal(X.mode, 'tour');
  assert.equal(X.entry, 'loop');
  assert.ok(X.tourT < 0.3);
  // RESUME after completion restarts (there is nothing left to resume)
  run(X, D + 8.2, 2 * D + 9);
  assert.equal(X.mode, 'complete');
  X.input(2 * D + 9); // the visitor is around: no loop until they have been quiet for idleResume
  run(X, 2 * D + 9, 2 * D + 30);
  assert.equal(X.mode, 'complete');
  X.resume(2 * D + 30);
  assert.equal(X.mode, 'tour');
  assert.equal(X.entry, 'restart');
  assert.equal(X.tourT, 0);
  // restart from the middle
  run(X, 2 * D + 30, 2 * D + 40);
  X.restart(2 * D + 40);
  assert.equal(X.tourT, 0);
  assert.equal(X.entry, 'restart');
});

test('seek (timeline / step) moves a shown tour and leaves it paused; it never touches a manual session', () => {
  const X = createExperience({duration: D, timing: TIMING});
  X.ready(0);
  run(X, 0, 4);
  X.seek(4, 17.25);
  assert.equal(X.mode, 'paused');
  assert.equal(X.tourT, 17.25);
  X.seek(5, 99);
  assert.equal(X.tourT, D);
  X.seek(5, 17.25);
  X.takeover(6);
  assert.equal(X.seek(7, 3), null);
  assert.equal(X.tourT, 17.25);
  X.toggle(8);
  assert.equal(X.mode, 'tour');
  X.toggle(9);
  assert.equal(X.mode, 'paused');
});

test('deterministic: the same inputs give the same transitions', () => {
  const script = (X) => {
    X.ready(0);
    run(X, 0, 6);
    X.pause(6);
    run(X, 6, 9);
    X.resume(9);
    run(X, 9, 14);
    X.takeover(14);
    run(X, 14, 50);
    return X.log.map((e) => `${e.type}:${e.from}>${e.to}@${e.T.toFixed(4)}/${e.tourT.toFixed(4)}`).join(' ');
  };
  const a = script(createExperience({duration: D, timing: TIMING}));
  const b = script(createExperience({duration: D, timing: TIMING}));
  assert.equal(a, b);
  assert.ok(/resume:paused>tour/.test(a) && /takeover:tour>manual/.test(a) && /resume:idle>tour/.test(a), a);
});
