// Cameras and subsystem views. A view is data: a camera, which assemblies stay solid, which are cut or ghosted, how far
// each explodes. Transitions are pure functions of (from, to, seconds since the change), so the live page and the
// film blend views the same way. The accent (the part working now) is computed from the model state.
import {CAMS, SUBCAMS, VIEW_EXPLODE, VIEW_SPREAD, VIEW_T} from './params.js';

const ALL = ['frame', 'frameSides', 'hood', 'rails', 'keys', 'levers', 'linkage', 'spacebar', 'shift', 'backspace', 'segment', 'typebars', 'ubar', 'vibrator', 'ribbon', 'escapement', 'mainspring', 'bell', 'carriage', 'rack', 'platen', 'paper', 'return'];

export const CAMERA = {...CAMS, ...SUBCAMS};
export const CAM_BUTTONS = ['hero', 'operator', 'keyboard', 'side', 'top', 'typebars', 'impact', 'escapement', 'ribbon', 'carriage', 'rear', 'platen', 'inside'];

// big surfaces (frame, hood, paper, paper table) ghost fainter than small mechanisms so they never wash the view out
const FAINT = ['frame', 'frameSides', 'hood', 'paper', 'platen', 'carriage'];
const ghostAll = (keep, o = 0.07) => Object.fromEntries(ALL.filter((a) => !keep.includes(a)).map((a) => [a, FAINT.includes(a) ? o * 0.45 : o]));

/** subsystem views */
export const SUBSYSTEMS = {
  linkage: {label: 'KEY LINKAGE', cam: 'linkage', keep: ['keys', 'levers', 'linkage', 'typebars', 'segment'], explode: VIEW_EXPLODE.linkage, ...VIEW_SPREAD.linkage},
  basket: {label: 'TYPEBAR BASKET', cam: 'typebars', keep: ['typebars', 'segment', 'ubar', 'linkage'], explode: VIEW_EXPLODE.basket, ...VIEW_SPREAD.basket},
  impact: {label: 'IMPACT', cam: 'impact', keep: ['typebars', 'vibrator', 'ribbon', 'platen', 'paper', 'segment'], cut: ['hood']},
  ribbonLift: {label: 'RIBBON LIFT', cam: 'ribbonLift', keep: ['vibrator', 'ribbon', 'typebars', 'platen', 'paper'], cut: ['hood'], explode: VIEW_EXPLODE.ribbonLift},
  ribbonFeed: {label: 'RIBBON FEED', cam: 'feed', keep: ['ribbon', 'vibrator'], explode: VIEW_EXPLODE.ribbonFeed},
  ubar: {label: 'UNIVERSAL BAR', cam: 'ubar', keep: ['ubar', 'typebars', 'escapement', 'segment', 'rack'], cut: ['hood', 'frameSides'], explode: VIEW_EXPLODE.ubar},
  escapement: {label: 'ESCAPEMENT', cam: 'escapement', keep: ['escapement', 'rack', 'ubar'], explode: VIEW_EXPLODE.escapement},
  carriage: {label: 'CARRIAGE', cam: 'carriage', keep: ['carriage', 'rack', 'rails', 'platen', 'paper', 'return', 'mainspring', 'bell'], explode: VIEW_EXPLODE.carriage},
  mainspring: {label: 'MAINSPRING', cam: 'mainspring', keep: ['mainspring', 'carriage', 'rails', 'platen', 'paper', 'return'], explode: VIEW_EXPLODE.mainspring},
  shift: {label: 'SHIFT', cam: 'shift', keep: ['shift', 'carriage', 'platen', 'paper', 'return', 'rails'], cut: ['frameSides']},
  backspace: {label: 'BACKSPACE', cam: 'backspace', keep: ['backspace', 'rack', 'escapement', 'carriage'], cut: ['frameSides'], explode: VIEW_EXPLODE.backspace},
  bell: {label: 'MARGIN BELL', cam: 'bell', keep: ['bell', 'carriage', 'rails'], cut: ['frameSides'], explode: VIEW_EXPLODE.bell},
  ret: {label: 'CARRIAGE RETURN', cam: 'ret', keep: ['return', 'carriage', 'platen', 'paper', 'rails', 'rack'], explode: VIEW_EXPLODE.ret},
  spacing: {label: 'LINE SPACING', cam: 'spacing', keep: ['return', 'platen', 'paper'], explode: VIEW_EXPLODE.spacing},
  platen: {label: 'PLATEN', cam: 'platen', keep: ['platen', 'paper', 'return'], explode: VIEW_EXPLODE.platen},
  explode: {label: 'FULL EXPLODE', cam: 'explode', keep: ALL, explode: Object.fromEntries(ALL.map((a) => [a, 1])), ...VIEW_SPREAD.explode},
};
export const SUB_BUTTONS = ['linkage', 'basket', 'impact', 'ribbonLift', 'ribbonFeed', 'ubar', 'escapement', 'carriage', 'mainspring', 'shift', 'backspace', 'bell', 'ret', 'spacing', 'platen', 'explode'];

/** the numbers a view contributes (camera excluded): explode, opacity, ghost, fan, rows */
export function viewLook(id, {xray = false, cutaway = false} = {}) {
  const v = SUBSYSTEMS[id];
  const look = {explode: {}, opacity: {}, ghost: {}, fan: 0, rows: 0};
  if (v) {
    Object.assign(look.explode, v.explode || {});
    look.fan = v.fan || 0;
    look.rows = v.rows || 0;
    if (id !== 'explode') {
      const g = ghostAll(v.keep);
      for (const [a, o] of Object.entries(g)) {
        look.opacity[a] = o;
        look.ghost[a] = 1;
      }
    }
    for (const a of v.cut || []) look.opacity[a] = 0.0;
  }
  if (cutaway) {
    look.opacity.hood = 0;
    look.opacity.frameSides = Math.min(look.opacity.frameSides ?? 1, 0.1);
  }
  if (xray) {
    for (const a of ['frame', 'frameSides', 'hood', 'carriage', 'platen']) look.opacity[a] = Math.min(look.opacity[a] ?? 1, a === 'platen' ? 0.35 : 0.14);
  }
  return look;
}

const ease = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
};
const mixNum = (a, b, k) => a + (b - a) * k;
/**
 * An explode spec for one assembly is a number (that far along the assembly's EXPLODE path), a vector (mm, straight
 * out) or a keyframed path {at: [[k, [x, y, z]], …]} (piecewise linear in the view's progress k, from the home
 * position at k = 0; a part can wait for others, or leave its mount before it slides). explodeAt(a, spec, k) is the
 * offset at progress k; reassembly retraces the path backwards, so the last part out is the first back.
 */
const keysOf = (a, spec, EXP) => {
  if (spec == null || spec === 0) return null;
  if (Array.isArray(spec)) return [[1, spec]];
  if (spec.at) return spec.at;
  const base = EXP[a];
  const ks = Array.isArray(base) ? [[1, base]] : base.at;
  return ks.map(([k, v]) => [k, v.map((c) => c * spec)]);
};
export function explodeAt(a, spec, k, EXP) {
  const ks = keysOf(a, spec, EXP);
  if (!ks) return null;
  let k0 = 0;
  let v0 = [0, 0, 0];
  for (const [k1, v1] of ks) {
    if (k <= k1) {
      const u = k1 > k0 ? Math.min(1, Math.max(0, (k - k0) / (k1 - k0))) : 1;
      return v0.map((c, i) => mixNum(c, v1[i], u));
    }
    k0 = k1;
    v0 = v1;
  }
  return v0.slice();
}
/** blend two looks: explode offsets follow their paths out (or back), everything else mixes linearly */
export function blendLook(A, B, k, EXP) {
  const out = {explode: {}, opacity: {}, ghost: {}, fan: mixNum(A.fan, B.fan, k), rows: mixNum(A.rows, B.rows, k)};
  const keys = new Set([...Object.keys(A.explode), ...Object.keys(B.explode)]);
  for (const a of keys) {
    const pa = explodeAt(a, A.explode[a], 1, EXP);
    const pb = explodeAt(a, B.explode[a], 1, EXP);
    if (!pa && !pb) continue;
    if (!pa) out.explode[a] = explodeAt(a, B.explode[a], k, EXP);
    else if (!pb) out.explode[a] = explodeAt(a, A.explode[a], 1 - k, EXP);
    else out.explode[a] = pa.map((c, i) => mixNum(c, pb[i], k));
  }
  for (const f of ['opacity', 'ghost']) {
    const ks = new Set([...Object.keys(A[f]), ...Object.keys(B[f])]);
    const def = f === 'opacity' ? 1 : 0;
    for (const a of ks) out[f][a] = mixNum(A[f][a] ?? def, B[f][a] ?? def, k);
  }
  return out;
}

/** camera parameters for a camera id with a slow drift (u seconds since it came on) */
export function camAt(id, u = 0, drift = 1) {
  const c = CAMERA[id] || CAMERA.hero;
  return {tx: c.t[0], ty: c.t[1], tz: c.t[2], az: c.az + drift * 2.2 * Math.sin(u * 0.16), el: c.el + drift * 0.8 * Math.sin(u * 0.11), d: c.d, sx: c.sx, sy: c.sy};
}
/** blend two cameras: eased, the azimuth the short way round, pulling back through a wide swing */
export function blendCam(a, b, k) {
  const o = {};
  const daz = ((((b.az - a.az) % 360) + 540) % 360) - 180;
  for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) o[key] = mixNum(a[key], b[key], k);
  o.az = a.az + daz * k;
  const swing = Math.min(1, Math.abs(daz) / 90);
  const far = Math.max(a.d, b.d) * (1 + 0.25 * swing);
  o.d += Math.max(0, far - o.d) * Math.sin(Math.PI * k) * 0.8;
  return o;
}
export const TRANSITION = VIEW_T; // seconds for a view change
/** the state-to-state easing every view change uses (exported for the resume blend) */
export const easeView = (x) => ease(x);

/**
 * The view at time t from a list of view events [{t, cam, sub, xray, cutaway}] (sorted). Each event may set any of
 * the fields; unset fields carry over. drift 0 holds every camera still (reduced motion). Returns {cam, look, camId, sub,
 * xray, cutaway, k}.
 */
export function viewAt(events, t, EXP, camOverride, drift = 1) {
  // the implicit starting view, anchored to the first event (so shifting every event in time shifts it too)
  let cur = {cam: 'hero', sub: null, xray: false, cutaway: false, t: (events.length ? events[0].t : 0) - 1e9};
  // where the running transition starts from: a settled view (its camera keeps drifting), or — when a change arrived
  // before the previous one finished — the blended look and camera of that instant, so nothing jumps (D-06)
  let from = {v: cur};
  const lookOf = (v) => viewLook(v.sub, v);
  const stateAt = (at) => {
    const k = ease((at - cur.t) / TRANSITION);
    const cb = camAt(cur.cam, at - cur.t, drift);
    if (k >= 1) return {k, look: lookOf(cur), cam: cb};
    const fl = from.v ? lookOf(from.v) : from.look;
    const fc = from.v ? camAt(from.v.cam, at - from.v.t, drift) : from.cam;
    return {k, look: blendLook(fl, lookOf(cur), k, EXP), cam: blendCam(fc, cb, k)};
  };
  for (const e of events) {
    if (e.t > t) break;
    if (e.t - cur.t >= TRANSITION) from = {v: cur};
    else {
      const st = stateAt(e.t);
      from = {look: st.look, cam: st.cam};
    }
    cur = {...cur, ...e, t: e.t};
    if (e.sub && !e.cam) cur.cam = SUBSYSTEMS[e.sub]?.cam || cur.cam;
    if (e.sub === 'reassemble') cur.sub = null;
  }
  const st = stateAt(t);
  let cam = st.cam;
  if (camOverride) cam = camOverride(cam, cur, st.k);
  return {cam, look: st.look, camId: cur.cam, sub: cur.sub, xray: cur.xray, cutaway: cur.cutaway, k: st.k, since: t - cur.t};
}

/** the working-now accent for each assembly, from the model state (0..1) */
export function accentOf(s) {
  const a = {};
  const on = (name, v) => (a[name] = Math.max(a[name] || 0, Math.min(1, v)));
  if (s.action === 'char') {
    on('keys', s.keyDepth > 0.1 ? 1 : 0);
    on('linkage', s.keyDepth > 0.1 ? 1 : 0);
    on('levers', s.keyDepth > 0.1 ? 1 : 0);
    on('typebars', s.barDeg > -10 ? 1 : 0);
  }
  if (s.ribbonLift > 0.3) on('vibrator', 1);
  if (s.ub > 0.04) on('ubar', 1);
  if (s.feeding) on('ribbon', 1);
  const moving = s.action && Math.abs(s.colPos - Math.round(s.colPos)) > 0.002;
  if (moving || s.ub > 0.04) on('escapement', 1);
  if (s.action === 'space') on('spacebar', s.spaceDepth > 0.2 ? 1 : 0);
  if (s.action === 'ret') {
    on('return', 1);
    on('platen', s.pawl > 0.02 && s.pawl < 0.98 ? 1 : 0);
    on('carriage', s.retLever > 0.5 ? 1 : 0);
    on('mainspring', s.retLever > 0.5 ? 1 : 0);
  }
  if (s.action === 'shiftDown' || s.action === 'shiftUp' || s.action === 'lock') on('shift', 1);
  if (s.action === 'backspace') on('backspace', 1);
  if (s.bellRing > 0.05 || s.bellHammer < -0.05) on('bell', 1);
  return a;
}
