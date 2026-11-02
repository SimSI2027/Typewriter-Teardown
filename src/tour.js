// The automatic tour: a deterministic script in wall-clock seconds. It owns its own session (the actions it types),
// a playback-speed profile (slow motion where the mechanism needs watching), the view changes (clicks on the console's
// subsystem buttons), and the operator's cursor path. Everything is a pure function of tour time t, so the live page
// and the frame-by-frame film play it identically.
import {charToKey} from './keyboard.js';
import {createSession, typeText} from './model.js';

// beats: {t, click?: button key, view?: {...}, type?: text, speed?: number, press?: anchor}
export const BEATS = [
  {t: 0.0, view: {cam: 'hero'}, speed: 1.0},
  {t: 0.35, speed: 2.1, type: 'Now is the time'},
  {t: 3.15, click: 'sub_linkage', view: {sub: 'linkage'}, speed: 1.0, type: ' '},
  {t: 4.3, speed: 0.2, type: 'f', press: 'key'},
  {t: 6.55, click: 'sub_basket', view: {sub: 'basket'}, speed: 1.0},
  {t: 7.7, speed: 0.24, type: 'o', press: 'key'},
  {t: 9.6, click: 'sub_impact', view: {sub: 'impact'}, speed: 1.0},
  {t: 10.75, speed: 0.15, type: 'r', press: 'key'},
  {t: 13.5, click: 'sub_escapement', view: {sub: 'escapement'}, speed: 1.0},
  {t: 14.65, speed: 0.32, type: ' a', press: 'key'},
  {t: 16.95, click: 'sub_ribbonFeed', view: {sub: 'ribbonFeed'}, speed: 1.0},
  {t: 18.05, speed: 0.55, type: 'l'},
  {t: 19.15, click: 'sub_shift', view: {sub: 'shift'}, speed: 1.0},
  {t: 20.25, speed: 0.62, type: 'l G', press: 'shift'},
  {t: 22.85, click: 'sub_bell', view: {sub: 'bell'}, speed: 1.0},
  {t: 23.45, speed: 9.0, type: 'ood men to come to the aid o'},
  {t: 24.75, speed: 1.1},
  {t: 25.1, type: 'f the'},
  {t: 26.75, click: 'sub_ret', view: {sub: 'ret'}, speed: 1.0},
  {t: 27.8, speed: 0.6, type: '\n', press: 'lever'},
  {t: 30.2, click: 'sub_explode', view: {sub: 'explode'}, speed: 1.0},
  {t: 33.3, click: 'reassemble', view: {sub: 'reassemble', cam: 'hero'}, speed: 1.0}, // the staged explode holds ≥ 1.8 s
  {t: 34.55, speed: 1.9, type: 'country.'},
];
export const DURATION = 36.5;
const RAMP = 0.3;

// ------------------------------------------------------------ playback speed and machine time τ(t)
const SPEEDS = BEATS.filter((b) => b.speed != null).map((b) => [b.t, b.speed]);
export function speedAt(t) {
  let v = SPEEDS[0][1];
  for (let i = 1; i < SPEEDS.length; i++) {
    const [t0, s] = SPEEDS[i];
    if (t < t0) break;
    const k = Math.min(1, (t - t0) / RAMP);
    v = v + (s - v) * (k * k * (3 - 2 * k));
  }
  return v;
}
const DT = 1 / 600;
const TAU = new Float64Array(Math.ceil((DURATION + 2) / DT) + 2);
for (let i = 1; i < TAU.length; i++) TAU[i] = TAU[i - 1] + speedAt((i - 0.5) * DT) * DT;
/** machine time at tour time t */
export const tauAt = (t) => {
  const u = Math.max(0, Math.min(TAU.length - 2, t / DT));
  const i = Math.floor(u);
  return TAU[i] + (TAU[i + 1] - TAU[i]) * (u - i);
};
/** tour time at machine time τ (inverse, by bisection on the monotone table) */
export const tAtTau = (tau) => {
  let lo = 0;
  let hi = TAU.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (TAU[m] < tau) lo = m;
    else hi = m;
  }
  const k = (tau - TAU[lo]) / (TAU[hi] - TAU[lo] || 1);
  return (lo + k) * DT;
};

// ------------------------------------------------------------ the tour's session
export function buildTourSession() {
  const S = createSession();
  S.id = 'tour';
  const presses = [];
  for (const b of BEATS) {
    if (!b.type) continue;
    // a slow-motion beat starts its keystroke only once the speed ramp has settled
    const t0 = tauAt(b.t + (b.speed != null && b.t > 0 ? RAMP + 0.05 : 0));
    const before = S.acts.length;
    typeText(S, b.type, Math.max(t0, S.end));
    // remember which actions this beat started (for the cursor to press)
    if (b.press) for (let i = before; i < S.acts.length; i++) presses.push({beat: b, act: S.acts[i], t: tAtTau(S.acts[i].t0)});
  }
  return {S, presses};
}

/** view events in tour time (for views.viewAt) */
export const VIEW_EVENTS = BEATS.filter((b) => b.view).map((b) => ({t: b.click ? b.t + 0.12 : b.t, ...b.view}));

/** button clicks (for the console's pulse ring and the sound) */
export const CLICKS = BEATS.filter((b) => b.click).map((b) => ({t: b.t, key: b.click}));

// ------------------------------------------------------------ the operator's cursor
const REST = [[820, 640], [700, 600], [940, 660], [760, 560]];
/**
 * cursorAt(t, spot, project): spot(key) gives a console button's centre; project(anchor, act) gives the screen point
 * of a 3D part for a press (a key cap, the return lever). Returns {x, y, press, ring, ringX, ringY}.
 */
export function makeCursor(presses) {
  const ev = [];
  for (const c of CLICKS) ev.push({t: c.t, kind: 'click', key: c.key});
  for (const p of presses) {
    if (p.act.type === 'char' || p.act.type === 'space' || p.act.type === 'ret' || p.act.type === 'shiftDown') ev.push({t: p.t, kind: 'press', act: p.act, anchor: p.beat.press});
  }
  ev.sort((a, b) => a.t - b.t);
  return (t, spot, project) => {
    // waypoints around every event: arrive 0.42 s before, hold, leave toward a rest point
    const pos = (e) => (e.kind === 'click' ? spot(e.key) : project(e.anchor, e.act) || [800, 500]);
    let prev = null;
    let next = null;
    for (const e of ev) {
      if (e.t <= t) prev = e;
      else if (!next) next = e;
    }
    const restOf = (i) => REST[i % REST.length];
    let x;
    let y;
    const idx = prev ? ev.indexOf(prev) : -1;
    const from = prev ? (t - prev.t < 0.55 ? pos(prev) : restOf(idx)) : [980, 700];
    if (next && next.t - t < 0.6) {
      const k = Math.min(1, Math.max(0, 1 - (next.t - t - 0.12) / 0.48));
      const e = k * k * (3 - 2 * k);
      const to = pos(next);
      const a = prev && t - prev.t < 0.55 ? pos(prev) : prev ? restOf(idx) : [980, 700];
      x = a[0] + (to[0] - a[0]) * e;
      y = a[1] + (to[1] - a[1]) * e + Math.sin(Math.PI * e) * -14;
    } else if (prev && t - prev.t < 0.55) {
      [x, y] = pos(prev);
    } else if (prev) {
      const k = Math.min(1, (t - prev.t - 0.55) / 0.7);
      const e = k * k * (3 - 2 * k);
      const a = pos(prev);
      const b = restOf(idx);
      x = a[0] + (b[0] - a[0]) * e;
      y = a[1] + (b[1] - a[1]) * e;
    } else [x, y] = from;
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of ev) {
      if (t >= e.t - 0.06 && t < e.t + 0.12) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = pos(e);
      }
    }
    return {x, y, press, ring, ringX: rx, ringY: ry};
  };
}

/** the character keys the tour presses through the cursor */
export const keyOfChar = (ch) => charToKey(ch);
