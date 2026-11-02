// The authoritative machine model. No three.js, no DOM, no clocks.
//
// A session is a list of operator actions (type a key, space, backspace, shift, lock, return, set spacing, ribbon
// colour, margin release). Actions never overlap: each starts at max(requested time, end of the previous one). The
// state after every completed action is kept as a snapshot, so the machine at any machine time τ is
//
//     stateAt(τ) = pose(snapshot before the active action, active action, its normalized progress p)
//
// a pure function of (session, τ). The film, the live page, the console, the schematic, the sound and the tests all
// read this one function.
import {charToKey, CHAR_KEYS, FN, glyphOf} from './keyboard.js';
import {BASKET, CARRIAGE, DRIVE, ESC, KEYS, LINE, MAINSPRING, PH, PITCH, PLATEN, RIBBON, SPACE_PH, T, BELL} from './params.js';

const D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const c01 = (x) => clamp(x, 0, 1);
export const smooth = (x) => {
  const u = c01(x);
  return u * u * (3 - 2 * u);
};
const smoother = (x) => {
  const u = c01(x);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const easeOut = (x) => 1 - (1 - c01(x)) ** 3;
const easeIn = (x) => c01(x) ** 2;
const span = (p, [a, b]) => c01((p - a) / (b - a));
// a damped settle: reaches 1 with a small overshoot (the carriage stepping onto the next tooth)
const settle = (x) => {
  const u = c01(x);
  if (u >= 1) return 1;
  return 1 - (1 - smoother(u)) + 0.06 * Math.sin(Math.PI * u) * u * (1 - u) * 4;
};

// ------------------------------------------------------------ derived geometry of the typebar linkage
const R0 = BASKET.restDeg * D2R;
const DRIVE_DEG = DRIVE.barDeg;
const RD = DRIVE_DEG * D2R;
export const STRIKE_DEG = BASKET.strikeDeg;
/** heel drop at full key travel = what the sublever link pulls (same for every key) */
export const LINK_PULL = BASKET.heelArm * (Math.sin(RD) - Math.sin(R0));
/** bar angle the linkage holds for key progress k (0..1): the heel follows the link linearly */
export const driveDeg = (k) => Math.asin(clamp(Math.sin(R0) + c01(k) * (Math.sin(RD) - Math.sin(R0)), -1, 1)) / D2R;
/** universal-bar travel 0..1 for a typebar angle: the heel meets the bar over the last 23° before the platen */
export const ubOfBar = (deg) => smooth((deg - DRIVE.ubFromDeg) / (STRIKE_DEG - DRIVE.ubFromDeg));

// key lever: the key end dips `travel`; each row's sublever lug sits where the lever moves LINK_PULL
export const lugZ = (row) => KEYS.fulcrumZ + (LINK_PULL / KEYS.travel) * (KEYS.rowZ[row] - KEYS.fulcrumZ);
export const keyLeverDeg = (row, depth) => Math.asin(clamp(depth / (KEYS.rowZ[row] - KEYS.fulcrumZ), -1, 1)) / D2R;

// ------------------------------------------------------------ action profiles: pure functions of p (0..1)
const keyDepthChar = (p) => (p < PH.keyHold[0] ? smooth(span(p, PH.keyDown)) : p < PH.keyUp[0] ? 1 : 1 - smooth(span(p, PH.keyUp)));
const FLIGHT = [PH.keyDown[1], PH.impact];
/** typebar angle (deg) through a character stroke */
export function barDegAt(p) {
  if (p <= 0 || p >= 1) return BASKET.restDeg;
  if (p < FLIGHT[0]) return driveDeg(keyDepthChar(p));
  if (p < FLIGHT[1]) return DRIVE_DEG + (STRIKE_DEG - DRIVE_DEG) * (0.35 * span(p, FLIGHT) + 0.65 * easeIn(span(p, FLIGHT)));
  const back = PH.impact + PH.dwell;
  if (p < back) return STRIKE_DEG - 0.4 * Math.sin(Math.PI * span(p, [PH.impact, back]));
  const k = keyDepthChar(p);
  const held = driveDeg(k);
  const reb = easeOut(span(p, [back, back + 0.11]));
  return STRIKE_DEG + (held - STRIKE_DEG) * reb;
}
const ubChar = (p) => ubOfBar(barDegAt(p));
// solve the trip and reset instants once (bisection on the monotone stretches)
const solve = (f, a, b, target, rising) => {
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    const v = f(m);
    if ((v < target) === rising) a = m;
    else b = m;
  }
  return (a + b) / 2;
};
export const P_TRIP = solve(ubChar, FLIGHT[0], PH.impact, ESC.tripAt, true);
export const P_RESET = solve(ubChar, PH.impact + PH.dwell, 0.6, ESC.resetAt, false);
// the loose-dog step waits for the slug to leave the paper (SIMPLIFIED: contact is instantaneous on the real machine)
const STEP1 = [Math.max(P_TRIP, PH.impact + PH.dwell), Math.max(P_TRIP, PH.impact + PH.dwell) + 0.02];
const STEP2 = [Math.max(P_RESET, STEP1[1] + 0.015), Math.max(P_RESET, STEP1[1] + 0.015) + 0.07];

// space bar: rocks the universal bar directly through its own links
const SP = SPACE_PH;
const spaceDepth = (p) => (p < SP.down[1] ? smooth(span(p, SP.down)) : p < SP.up[0] ? 1 : 1 - smooth(span(p, SP.up)));
const spaceTrip = solve((p) => spaceDepth(p), 0, SP.down[1], ESC.tripAt, true);
const spaceReset = solve((p) => spaceDepth(p), SP.up[0], SP.up[1], ESC.resetAt, false);
const SSTEP1 = [spaceTrip, spaceTrip + 0.03];
const SSTEP2 = [spaceReset, spaceReset + 0.09];

// generic key press for function keys
const pressDepth = (p, down = 0.35, hold = 0.5, up = 0.9) => (p < down ? smooth(p / down) : p < hold ? 1 : 1 - smooth((p - hold) / (up - hold)));

// ------------------------------------------------------------ ribbon spools (closed form wound radius and angle)
const RT = (Math.PI * (RIBBON.spoolFullR ** 2 - RIBBON.spoolCoreR ** 2)) / RIBBON.length; // ribbon thickness
export const spoolR = (L) => Math.sqrt(RIBBON.spoolCoreR ** 2 + (Math.max(0, L) * RT) / Math.PI);
const spoolTurn = (L) => ((2 * Math.PI) / RT) * (spoolR(L) - RIBBON.spoolCoreR); // radians to wind L

// ------------------------------------------------------------ the session
export const INITIAL = Object.freeze({
  col: CARRIAGE.leftMargin, // carriage column (integer at rest)
  wheel: 0, // escapement wheel: cumulative teeth advanced (only ever forward)
  lines: 0, // platen ratchet teeth turned (single lines)
  printLine: 0, // line count for the readout (one per return that spaced)
  shift: 0, // 0 lower case, 1 upper case (subcarriage up)
  lock: false,
  color: 'black',
  spacing: 1,
  ribbonPos: 3200, // mm of ribbon wound on the left spool
  ribbonDir: 1, // +1 winds onto the left spool
  release: false, // margin release active until the next return
  strokes: 0,
  bellAt: -1e9, // machine time of the last bell strike
  bells: 0,
});

export const DUR = {char: T.char, space: T.space, backspace: T.backspace, shiftDown: T.shiftDown, shiftUp: T.shiftUp, lock: T.lock, ret: T.ret, spacing: T.spacing, color: T.color, release: T.release, locked: T.lock, noop: 0.12};

export const lineLimit = (s) => (s.release ? Math.min(CARRIAGE.cols - 1, CARRIAGE.rightMargin + CARRIAGE.releaseExtra) : CARRIAGE.rightMargin);
export const bellCol = () => CARRIAGE.rightMargin - CARRIAGE.bellBefore;

/** resolve a requested action against the state before it: what the machine will actually do */
function resolve(req, s) {
  const a = {...req};
  switch (req.type) {
    case 'char': {
      if (a.key == null || !CHAR_KEYS[a.key]) return {...a, type: 'noop'};
      // upper case if the subcarriage is up (shift held or locked)
      a.upper = s.shift > 0.5;
      if (s.col >= lineLimit(s)) a.type = 'locked'; // line lock: the key levers are locked
      else a.glyph = glyphOf(a.key, a.upper);
      return a;
    }
    case 'space':
      if (s.col >= CARRIAGE.cols - 1) a.type = 'locked';
      return a;
    case 'backspace':
      if (s.col <= 0) a.blocked = true;
      return a;
    case 'shiftDown':
      if (s.shift > 0.5) return {...a, type: 'noop'};
      return a;
    case 'shiftUp':
      if (s.shift < 0.5 || s.lock) return {...a, type: 'noop'};
      return a;
    case 'lock':
      a.engage = !s.lock;
      return a;
    case 'ret': {
      const room = LINE.maxLines - s.lines;
      a.teeth = Math.max(0, Math.min(s.spacing, room));
      return a;
    }
    case 'spacing':
      a.value = [1, 2, 3].includes(req.value) ? req.value : (s.spacing % 3) + 1;
      return a;
    case 'color':
      a.value = ['black', 'red', 'stencil'].includes(req.value) ? req.value : s.color === 'black' ? 'red' : 'black';
      return a;
    case 'release':
      return a;
    default:
      return {...a, type: 'noop'};
  }
}

/** the state after an action completes */
function apply(a, s, tStart, dur) {
  const n = {...s};
  switch (a.type) {
    case 'char':
    case 'space': {
      n.col = s.col + 1;
      n.wheel = s.wheel + 1;
      if (a.type === 'char') {
        n.strokes = s.strokes + 1;
        let pos = s.ribbonPos + s.ribbonDir * RIBBON.feedPerStroke;
        let dir = s.ribbonDir;
        if (pos >= RIBBON.length - 200 || pos <= 200) dir = -dir; // automatic reverse near an empty spool
        pos = clamp(pos, 0, RIBBON.length);
        n.ribbonPos = pos;
        n.ribbonDir = dir;
      }
      if (n.col === bellCol()) {
        n.bellAt = tStart + (a.type === 'char' ? STEP2[1] : SSTEP2[1]) * dur;
        n.bells = s.bells + 1;
      }
      break;
    }
    case 'backspace':
      if (!a.blocked) n.col = s.col - 1;
      break;
    case 'shiftDown':
      n.shift = 1;
      break;
    case 'shiftUp':
      n.shift = 0;
      break;
    case 'lock':
      n.lock = a.engage;
      n.shift = a.engage ? 1 : 0;
      break;
    case 'ret':
      n.col = CARRIAGE.leftMargin;
      n.lines = s.lines + a.teeth;
      if (a.teeth) n.printLine = s.printLine + 1;
      n.release = false;
      break;
    case 'spacing':
      n.spacing = a.value;
      break;
    case 'color':
      n.color = a.value;
      break;
    case 'release':
      n.release = true;
      break;
    default:
      break;
  }
  return n;
}

/**
 * A session: append actions, read the state at any machine time.
 * opts.initial overrides INITIAL fields.
 */
export function createSession(opts = {}) {
  const init = {...INITIAL, ...(opts.initial || {})};
  const acts = []; // {type, ..., t0, dur, before, after, glyphIdx?}
  const glyphs = []; // {ch, col, feed, color, upper, t}
  const S = {
    init,
    acts,
    glyphs,
    get end() {
      return acts.length ? acts[acts.length - 1].t0 + acts[acts.length - 1].dur : 0;
    },
    get last() {
      return acts.length ? acts[acts.length - 1].after : init;
    },
    /** queue an action requested at machine time t; returns the scheduled action (or null if refused) */
    push(req, t = 0) {
      const before = S.last;
      const a = resolve(req, before);
      if (a.type === 'noop' && !opts.keepNoop) return null;
      a.dur = DUR[a.type] ?? 0.2;
      a.t0 = acts.length ? Math.max(t, S.end) : t; // the first action may start before 0 (a hand-over mid-stroke)
      a.before = before;
      a.after = apply(a, before, a.t0, a.dur);
      if (a.type === 'char') {
        a.glyphIdx = glyphs.length;
        glyphs.push({ch: a.glyph, col: before.col, feed: feedOf(before.lines), lines: before.lines, color: before.color, upper: a.upper, t: a.t0 + PH.impact * a.dur, key: a.key});
      }
      acts.push(a);
      return a;
    },
    /** drop every action that starts at or after τ (a visitor typing after scrubbing back) */
    truncate(t) {
      while (acts.length && acts[acts.length - 1].t0 >= t - 1e-9) {
        const a = acts.pop();
        if (a.glyphIdx != null) glyphs.length = a.glyphIdx;
      }
    },
    /** index of the action active (or last completed) at τ: binary search */
    indexAt(t) {
      let lo = 0;
      let hi = acts.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (acts[m].t0 <= t) {
          ans = m;
          lo = m + 1;
        } else hi = m - 1;
      }
      return ans;
    },
    stateAt: (t) => stateAt(S, t),
    cuesBetween: (a, b) => cuesBetween(S, a, b),
    /** glyphs printed by τ (they are in time order) */
    visibleGlyphs(t) {
      let lo = 0;
      let hi = glyphs.length;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (glyphs[m].t <= t) lo = m + 1;
        else hi = m;
      }
      return lo;
    },
  };
  return S;
}

/** convenience: type a string as a sequence of actions (upper case inserts shift down / up around it) */
export function typeText(S, text, t0 = S.end, gap = 0) {
  let t = t0;
  for (const ch of text) {
    let a = null;
    if (ch === ' ') a = S.push({type: 'space'}, t);
    else if (ch === '\n') a = S.push({type: 'ret'}, t);
    else if (ch === '\b') a = S.push({type: 'backspace'}, t);
    else {
      const m = charToKey(ch);
      if (!m) continue;
      const sh = S.last.shift > 0.5;
      if (m.upper && !sh) S.push({type: 'shiftDown'}, t);
      if (!m.upper && sh && !S.last.lock) S.push({type: 'shiftUp'}, t);
      a = S.push({type: 'char', key: m.key}, t);
    }
    t = (a ? a.t0 + a.dur : S.end) + gap;
  }
  if (S.last.shift > 0.5 && !S.last.lock) S.push({type: 'shiftUp'}, t);
  return S.end;
}

export const feedOf = (lines) => lines * LINE.pitch;
export const toothDeg = 360 / PLATEN.teeth;

// ------------------------------------------------------------ the pose
const restPose = (s, t) => ({
  t,
  action: null,
  p: 0,
  phase: 'AT REST',
  activeKey: -1,
  activeFn: null,
  keyDepth: 0,
  keyLeverDeg: 0,
  sublever: 0, // 0..1 of LINK_PULL
  slot: -1,
  barDeg: BASKET.restDeg,
  barSpeed: 0,
  impact: 0, // 0..1 contact flash
  ub: 0,
  rockerDeg: 0,
  colPos: s.col,
  wheel: s.wheel,
  looseDog: 0, // 0 engaged, 1 out of the tooth plane
  rigidDog: 0, // 0 out, 1 in the tooth plane
  dogCarry: 0, // loose dog carried sideways by the tooth (fraction of a tooth)
  escPhase: 'HELD ON LOOSE DOG',
  shift: s.shift,
  lock: s.lock,
  shiftKey: 0,
  lockKey: 0,
  ribbonLift: 0,
  ribbonPos: s.ribbonPos,
  ribbonDir: s.ribbonDir,
  feeding: 0,
  color: s.color,
  lines: s.lines,
  printLine: s.printLine,
  spacing: s.spacing,
  spacingLever: 0,
  colorLever: 0,
  retLever: 0, // 0..1 lever throw
  pawl: 0, // line space pawl travel 0..1
  spaceDepth: 0,
  backDepth: 0,
  backPawl: 0,
  releaseKey: 0,
  release: s.release,
  lineLocked: s.col >= lineLimit(s),
  bellAt: s.bellAt,
  bells: s.bells,
  strokes: s.strokes,
});

/** the whole machine at machine time t */
export function stateAt(S, t) {
  const i = S.indexAt(t);
  if (i < 0) return finish(restPose(S.init, t), S, t);
  const a = S.acts[i];
  const p = (t - a.t0) / a.dur;
  if (p >= 1) return finish(restPose(a.after, t), S, t);
  const s = a.before;
  const o = restPose(s, t);
  o.bellAt = a.after.bellAt; // a bell this action rings (its time lies inside the action)
  o.action = a.type;
  o.p = p;
  o.actionIndex = i;
  switch (a.type) {
    case 'char': {
      const key = CHAR_KEYS[a.key];
      o.activeKey = a.key;
      o.slot = key.slot;
      const k = keyDepthChar(p);
      o.keyDepth = k * KEYS.travel;
      o.keyLeverDeg = keyLeverDeg(key.row, o.keyDepth);
      o.sublever = k;
      o.barDeg = barDegAt(p);
      const dp = 1e-3;
      o.barSpeed = (barDegAt(Math.min(1, p + dp)) - barDegAt(Math.max(0, p - dp))) / (2 * dp) / a.dur; // deg/s machine time
      o.impact = p >= PH.impact ? Math.max(0, 1 - (p - PH.impact) / 0.08) : 0;
      o.ub = ubOfBar(o.barDeg);
      escapement(o, s, p, STEP1, STEP2);
      o.ribbonLift = RIBBON.lift[s.color] * (p < PH.ribbonDown[0] ? smooth(span(p, PH.ribbonUp)) : 1 - smooth(span(p, PH.ribbonDown)));
      const f = smooth(span(p, PH.feed));
      o.feeding = p > PH.feed[0] && p < PH.feed[1] ? 1 : 0;
      o.ribbonPos = s.ribbonPos + s.ribbonDir * RIBBON.feedPerStroke * f;
      o.phase =
        p < PH.keyDown[1] ? 'KEY DOWN · BAR DRIVEN' : p < PH.impact ? 'BAR IN FLIGHT' : p < PH.impact + PH.dwell ? 'IMPACT' : p < P_RESET ? 'BAR REBOUND' : p < PH.keyUp[1] ? 'KEY RETURN' : 'BAR SETTLING';
      if (p < PH.keyDown[1] && o.ribbonLift > 0.2) o.phase = 'KEY DOWN · RIBBON RISING';
      break;
    }
    case 'locked': {
      const d = pressDepth(p, 0.3, 0.45, 0.9) * 0.22;
      if (a.key != null && CHAR_KEYS[a.key]) {
        const key = CHAR_KEYS[a.key];
        o.activeKey = a.key;
        o.keyDepth = d * KEYS.travel;
        o.keyLeverDeg = keyLeverDeg(key.row, o.keyDepth);
      } else o.spaceDepth = d * KEYS.spacebar.travel;
      o.phase = 'LINE LOCK';
      break;
    }
    case 'space': {
      const d = spaceDepth(p);
      o.spaceDepth = d * KEYS.spacebar.travel;
      o.activeFn = 'space';
      o.ub = d;
      escapement(o, s, p, SSTEP1, SSTEP2);
      o.phase = p < SSTEP1[0] ? 'SPACE BAR DOWN' : p < SSTEP2[0] ? 'ON RIGID DOG' : p < SSTEP2[1] ? 'CARRIAGE STEP' : 'SPACE BAR RETURN';
      break;
    }
    case 'backspace': {
      const d = pressDepth(p, 0.35, 0.5, 0.88);
      o.backDepth = d * KEYS.travel;
      o.activeFn = 'back';
      o.backPawl = d;
      const m = a.blocked ? 0 : smoother(span(p, [0.16, 0.46]));
      o.colPos = s.col - m;
      o.phase = a.blocked ? 'AT CARRIAGE STOP' : p < 0.16 ? 'PAWL ENTERS RACK' : p < 0.46 ? 'CARRIAGE BACK ONE SPACE' : 'KEY RETURN';
      o.escPhase = 'PINION FREEWHEELS';
      break;
    }
    case 'shiftDown':
    case 'shiftUp': {
      const up = a.type === 'shiftDown';
      const m = smoother(p / 0.8);
      o.shift = up ? m : 1 - m;
      o.shiftKey = up ? m : 1 - m;
      o.activeFn = 'shift';
      o.phase = up ? 'SUBCARRIAGE RISING' : 'SUBCARRIAGE DROPPING';
      break;
    }
    case 'lock': {
      const m = smoother(p / 0.8);
      o.shift = a.engage ? Math.max(s.shift, m) : Math.min(s.shift, 1 - m);
      o.lockKey = a.engage ? m : 1 - m;
      o.shiftKey = o.lockKey;
      o.activeFn = 'lock';
      o.phase = a.engage ? 'SHIFT LOCK ENGAGING' : 'SHIFT LOCK RELEASED';
      break;
    }
    case 'ret': {
      const lev = p < PH.retLeverBack[0] ? smooth(span(p, PH.retLever)) : 1 - smooth(span(p, PH.retLeverBack));
      o.retLever = lev;
      o.pawl = smooth(span(p, PH.retLever));
      o.lines = s.lines + a.teeth * smooth(span(p, [PH.retLever[0] + 0.03, PH.retLever[1]]));
      const travel = smoother(span(p, PH.retTravel));
      o.colPos = s.col + (CARRIAGE.leftMargin - s.col) * travel;
      o.activeFn = 'ret';
      o.escPhase = 'PINION FREEWHEELS';
      o.phase = p < PH.retLever[1] ? 'LINE SPACE: PLATEN TURNS' : p < PH.retTravel[1] ? 'CARRIAGE RETURNING' : 'LEVER RETURNS';
      if (p >= PH.retLever[1]) o.printLine = s.printLine + (a.teeth ? 1 : 0);
      break;
    }
    case 'spacing':
      o.spacingLever = pressDepth(p);
      o.phase = 'LINE SPACE SET';
      if (p > 0.5) o.spacing = a.value;
      break;
    case 'color':
      o.colorLever = pressDepth(p);
      o.phase = 'RIBBON COLOUR SET';
      if (p > 0.5) o.color = a.value;
      break;
    case 'release':
      o.releaseKey = pressDepth(p);
      o.activeFn = 'mrel';
      o.phase = 'MARGIN RELEASED';
      if (p > 0.5) o.release = true;
      break;
    default:
      break;
  }
  return finish(o, S, t);
}

/** the escapement through one space: loose dog lets go (wheel to rigid dog), rigid dog lets go (to the next tooth) */
function escapement(o, s, p, step1, step2) {
  const a1 = smooth(span(p, step1));
  const a2 = settle(span(p, step2));
  const adv = ESC.looseFrac * a1 + (1 - ESC.looseFrac) * a2;
  o.colPos = s.col + adv;
  o.wheel = s.wheel + adv;
  o.rockerDeg = o.ub * ESC.rockerTravel;
  // dog positions follow the rocker: the loose dog leaves the tooth plane as the rigid dog enters it
  o.looseDog = smooth((o.ub - 0.55) / (ESC.tripAt - 0.55));
  o.rigidDog = smooth((o.ub - 0.35) / (ESC.tripAt - 0.35));
  o.dogCarry = p >= step2[0] ? 0 : ESC.looseFrac * a1; // the loose dog springs back one tooth while it is out
  o.escPhase = p < step1[0] ? (o.ub > 0.05 ? 'ROCKER TILTING' : 'HELD ON LOOSE DOG') : p < step2[0] ? 'HELD ON RIGID DOG' : p < step2[1] ? 'ADVANCING ONE TOOTH' : 'HELD ON LOOSE DOG';
}

/** quantities every pose shares: carriage geometry, spools, bell, platen, readouts */
function finish(o, S, t) {
  o.col = Math.round(o.colPos);
  o.carriageX = CARRIAGE.x(o.colPos);
  o.carriageTravel = (o.colPos - CARRIAGE.leftMargin) * PITCH; // mm from the left margin
  o.pinionDeg = (o.colPos * 360) / ESC.wheelTeeth;
  o.wheelDeg = (o.wheel * 360) / ESC.wheelTeeth;
  o.platenDeg = o.lines * toothDeg;
  o.feed = feedOf(o.lines);
  o.shiftMM = o.shift * CARRIAGE.shiftTravel;
  const L = o.ribbonPos;
  o.spoolL = spoolTurn(L) / D2R;
  o.spoolR = -spoolTurn(RIBBON.length - L) / D2R;
  o.spoolRL = spoolR(L);
  o.spoolRR = spoolR(RIBBON.length - L);
  o.tension = MAINSPRING.tension0 - MAINSPRING.rate * (o.colPos * PITCH);
  o.drumDeg = (-(o.colPos * PITCH) / MAINSPRING.drumR) / D2R; // the band winds in as the carriage moves left
  o.marginDist = lineLimit(o) - o.colPos;
  o.bellCol = bellCol();
  // the bell hammer: cocked by the trip as the carriage crosses the last space before the bell column, then it
  // snaps against the dome and rebounds
  const since = t - o.bellAt;
  o.bellRing = since >= 0 && since < BELL.ringDur ? 1 - since / BELL.ringDur : 0;
  const approach = c01(o.colPos - (o.bellCol - 1));
  const cock = o.colPos < o.bellCol ? smooth(approach) : 0;
  o.bellHammer = since >= 0 && since < 0.25 ? Math.sin(Math.min(1, since / 0.04) * Math.PI * 0.5) * Math.max(0, 1 - since / 0.25) : -0.6 * cock;
  o.glyphCount = S.visibleGlyphs(t);
  o.lineLocked = o.colPos >= lineLimit(o) - 1e-6;
  return o;
}

// ------------------------------------------------------------ sound cues: derived from the same actions
// Each cue: {t, kind, gain, pitch}. Times are machine time; the sound engine maps them to wall time.
export function actionCues(a) {
  const d = a.dur;
  const at = (p) => a.t0 + p * d;
  const out = [];
  switch (a.type) {
    case 'char': {
      const row = CHAR_KEYS[a.key].row;
      out.push({t: at(0.02), kind: 'keyTouch', gain: 0.5, pitch: 1 + row * 0.03});
      out.push({t: at(PH.keyDown[1]), kind: 'keyBottom', gain: 0.55, pitch: 1});
      out.push({t: at(0.12), kind: 'linkage', gain: 0.25, pitch: 1});
      out.push({t: at(PH.impact), kind: 'impact', gain: 1, pitch: a.upper ? 0.97 : 1});
      out.push({t: at(STEP1[0]), kind: 'escTick', gain: 0.45, pitch: 1.1});
      out.push({t: at(STEP2[0]), kind: 'carriageStep', gain: 0.6, pitch: 1});
      out.push({t: at(PH.feed[0] + 0.05), kind: 'ribbonFeed', gain: 0.18, pitch: 1});
      out.push({t: at(0.84), kind: 'barRest', gain: 0.22, pitch: 1});
      if (a.after.bellAt > a.before.bellAt) out.push({t: a.after.bellAt, kind: 'bell', gain: 0.8, pitch: 1});
      break;
    }
    case 'space':
      out.push({t: at(0.03), kind: 'spaceTouch', gain: 0.45, pitch: 0.8});
      out.push({t: at(SSTEP1[0]), kind: 'escTick', gain: 0.45, pitch: 1.1});
      out.push({t: at(SSTEP2[0]), kind: 'carriageStep', gain: 0.6, pitch: 1});
      out.push({t: at(0.8), kind: 'spaceRest', gain: 0.3, pitch: 0.8});
      if (a.after.bellAt > a.before.bellAt) out.push({t: a.after.bellAt, kind: 'bell', gain: 0.8, pitch: 1});
      break;
    case 'backspace':
      out.push({t: at(0.03), kind: 'keyTouch', gain: 0.45, pitch: 0.9});
      if (!a.blocked) out.push({t: at(0.18), kind: 'pawl', gain: 0.4, pitch: 1});
      if (!a.blocked) out.push({t: at(0.46), kind: 'carriageStep', gain: 0.55, pitch: 0.9});
      out.push({t: at(0.85), kind: 'barRest', gain: 0.2, pitch: 0.9});
      break;
    case 'shiftDown':
      out.push({t: at(0.05), kind: 'keyTouch', gain: 0.4, pitch: 0.8});
      out.push({t: at(0.78), kind: 'shiftThunk', gain: 0.7, pitch: 1});
      break;
    case 'shiftUp':
      out.push({t: at(0.78), kind: 'shiftThunk', gain: 0.6, pitch: 0.85});
      break;
    case 'lock':
      out.push({t: at(0.05), kind: 'keyTouch', gain: 0.4, pitch: 0.8});
      out.push({t: at(0.78), kind: 'shiftThunk', gain: 0.65, pitch: a.engage ? 1 : 0.85});
      out.push({t: at(0.8), kind: 'latch', gain: 0.35, pitch: 1});
      break;
    case 'ret': {
      out.push({t: at(0.01), kind: 'leverGrab', gain: 0.4, pitch: 1});
      for (let k = 0; k < a.teeth; k++) out.push({t: at(PH.retLever[0] + 0.03 + ((k + 0.7) / a.teeth) * (PH.retLever[1] - PH.retLever[0] - 0.03)), kind: 'ratchet', gain: 0.7, pitch: 1 + k * 0.04});
      out.push({t: at(PH.retTravel[0]), kind: 'carriageRun', gain: 0.55, pitch: 1, dur: (PH.retTravel[1] - PH.retTravel[0]) * d, travel: Math.abs(a.before.col - CARRIAGE.leftMargin)});
      out.push({t: at(PH.retTravel[1]), kind: 'marginStop', gain: 0.9, pitch: 1});
      out.push({t: at(0.98), kind: 'leverBack', gain: 0.3, pitch: 1});
      break;
    }
    case 'locked':
      out.push({t: at(0.05), kind: 'keyTouch', gain: 0.35, pitch: 0.7});
      out.push({t: at(0.28), kind: 'lockThud', gain: 0.4, pitch: 1});
      break;
    case 'spacing':
    case 'color':
      out.push({t: at(0.3), kind: 'latch', gain: 0.35, pitch: 1.2});
      break;
    case 'release':
      out.push({t: at(0.05), kind: 'keyTouch', gain: 0.4, pitch: 0.9});
      out.push({t: at(0.35), kind: 'latch', gain: 0.3, pitch: 1});
      break;
    default:
      break;
  }
  return out;
}

/** every cue with a ≤ t < b, in time order */
export function cuesBetween(S, a, b) {
  if (b <= a) return [];
  const out = [];
  let i = Math.max(0, S.indexAt(a) - 2);
  for (; i < S.acts.length; i++) {
    const act = S.acts[i];
    if (act.t0 > b) break;
    for (const c of actionCues(act)) if (c.t >= a && c.t < b) out.push(c);
  }
  return out.sort((x, y) => x.t - y.t);
}

export const TIMING = {P_TRIP, P_RESET, STEP1, STEP2, SSTEP1, SSTEP2, FLIGHT, DRIVE_DEG, LINK_PULL};
