// The visitor experience as an explicit state machine. No DOM, no clocks: every call takes the wall time T (seconds the
// page has been visible), so the whole lifecycle is unit-testable and replayable.
//
//   mode      what is on screen                                   how it ends
//   loading   nothing yet (shaders compiling)                     ready() → tour, or manual under reduced motion
//   tour      the tour plays: tour clock tourT advances           pause() → paused · takeover() → manual · end → complete
//   paused    the tour frozen at tourT (camera, parts, cursor)    resume() → tour · takeover() → manual
//   manual    the visitor drives the machine; tourT is held       resume() → tour · quiet idleHint → idle
//   idle      manual, quiet: counting down to the resume          input → manual · quiet idleResume → tour (resumed)
//   complete  the tour has finished; the machine is the visitor's restart() → tour · quiet → tour from 0 (loop)
//
// tourT is the one tour position. It only moves while mode is 'tour' (or by an explicit scrub/step while paused), so
// PAUSE → RESUME, takeover → RESUME and idle → resume all continue from exactly where the tour stopped. restart() is
// the only transition that sets tourT to 0 (and the loop after 'complete', which is a restart by definition).
// `entry` records how the current (or last) tour run began: start · resume · idle · restart · loop.
// Reduced motion never starts or resumes the tour by itself; PLAY / RESUME / RESTART still work.
import {EXPERIENCE} from './params.js';

export const MODES = Object.freeze(['loading', 'tour', 'paused', 'manual', 'idle', 'complete']);

export function createExperience({duration, reduced = false, timing = EXPERIENCE} = {}) {
  if (!(duration > 0)) throw new Error('createExperience: duration required');
  let mode = 'loading';
  let tourT = 0;
  let entry = null;
  let started = false; // has the tour ever run (labels PLAY TOUR vs RESUME TOUR)
  let lastInput = -Infinity;
  let modeAt = 0;
  const log = []; // transitions, for tests and diagnostics: {T, from, to, type, tourT}
  const go = (T, to, type, extra = {}) => {
    const ev = {T, from: mode, to, type, tourT, ...extra};
    mode = to;
    modeAt = T;
    log.push(ev);
    if (log.length > 200) log.shift();
    return ev;
  };
  const runTour = (T, how) => {
    entry = how;
    started = true;
    return go(T, 'tour', how === 'restart' || how === 'loop' ? 'restart' : how === 'start' ? 'start' : 'resume', {entry: how});
  };

  const X = {
    get mode() {
      return mode;
    },
    get tourT() {
      return tourT;
    },
    get entry() {
      return entry;
    },
    get started() {
      return started;
    },
    get reduced() {
      return reduced;
    },
    get duration() {
      return duration;
    },
    get modeAt() {
      return modeAt;
    },
    get lastInput() {
      return lastInput;
    },
    get log() {
      return log;
    },
    /** the tour (running or frozen) is what the page draws */
    get showsTour() {
      return mode === 'tour' || mode === 'paused';
    },
    /** the visitor's own machine session is what the page draws */
    get showsVisitor() {
      return mode === 'manual' || mode === 'idle' || mode === 'complete';
    },
    /** seconds until the automatic resume (manual / idle) or loop (complete); null when none will happen */
    autoIn(T) {
      if (reduced) return null;
      if (mode === 'manual' || mode === 'idle') return Math.max(0, timing.idleResume - (T - lastInput));
      if (mode === 'complete') return Math.max(0, timing.completeHold - (T - modeAt), timing.idleResume - (T - lastInput));
      return null;
    },
    /** loading finished: the tour starts by itself unless the visitor prefers reduced motion */
    ready(T) {
      if (mode !== 'loading') return null;
      if (reduced) {
        lastInput = T;
        return go(T, 'manual', 'ready');
      }
      tourT = 0;
      return runTour(T, 'start');
    },
    /** any visitor activity (pointer, key, wheel) — resets the quiet timer, leaves idle */
    input(T) {
      lastInput = T;
      if (mode === 'idle') return go(T, 'manual', 'input');
      return null;
    },
    /** the visitor takes the machine (a key, a machine control, a view control, an orbit drag, a zoom) */
    takeover(T) {
      lastInput = T;
      if (mode === 'tour' || mode === 'paused') {
        started = true;
        return go(T, 'manual', 'takeover');
      }
      if (mode === 'idle') return go(T, 'manual', 'input');
      return null;
    },
    pause(T) {
      lastInput = T;
      if (mode !== 'tour') return null;
      return go(T, 'paused', 'pause');
    },
    /** continue the tour from tourT; a finished tour (or one at its end) restarts instead */
    resume(T, auto = false) {
      if (!auto) lastInput = T;
      if (mode === 'complete' || tourT >= duration) return X.restart(T, auto);
      if (mode === 'paused' || mode === 'manual' || mode === 'idle') return runTour(T, auto ? 'idle' : started ? 'resume' : 'start');
      return null;
    },
    /** the only way (besides the loop after 'complete') to play the tour from 0 */
    restart(T, auto = false) {
      if (!auto) lastInput = T;
      if (mode === 'loading') return null;
      tourT = 0;
      return runTour(T, auto ? 'loop' : 'restart');
    },
    /** the primary tour button: PAUSE while it plays, RESUME / PLAY when it does not, RESTART once complete */
    toggle(T) {
      if (mode === 'tour') return X.pause(T);
      return X.resume(T);
    },
    /** move the tour clock while the tour is on screen (timeline drag, step); it ends up paused */
    seek(T, t) {
      lastInput = T;
      if (!X.showsTour) return null;
      tourT = Math.min(duration, Math.max(0, t));
      if (mode === 'tour') return go(T, 'paused', 'pause');
      return null;
    },
    /**
     * advance by dt (wall seconds). active: the visitor is using the page right now (a held drag, a machine still
     * working through queued keystrokes); held: the visitor has paused their own machine clock (no automatic resume).
     * Returns the transition that happened, if any.
     */
    tick(T, dt, {active = false, held = false} = {}) {
      if (active) lastInput = T;
      if (mode === 'tour') {
        tourT = Math.min(duration, tourT + Math.max(0, dt));
        if (tourT >= duration) return go(T, 'complete', 'complete');
        return null;
      }
      if (reduced || held) {
        if (mode === 'idle') return go(T, 'manual', 'input');
        return null;
      }
      const quiet = T - lastInput;
      if (mode === 'manual' || mode === 'idle') {
        if (quiet >= timing.idleResume) return X.resume(T, true);
        if (mode === 'manual' && quiet >= timing.idleHint) return go(T, 'idle', 'idle');
        if (mode === 'idle' && quiet < timing.idleHint) return go(T, 'manual', 'input');
        return null;
      }
      if (mode === 'complete' && T - modeAt >= timing.completeHold && quiet >= timing.idleResume) return X.restart(T, true);
      return null;
    },
    /** a plain snapshot (tests, the console) */
    snapshot(T) {
      return {mode, tourT, entry, started, reduced, quiet: T - lastInput, autoIn: X.autoIn(T)};
    },
  };
  return X;
}
