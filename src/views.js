// Cameras and subsystem views. A view is data: a camera, which assemblies stay solid, which are cut or ghosted, how far
// each explodes. Transitions are pure functions of (from, to, seconds since the change), so the live page and the
// film blend views the same way. The accent (the part working now) is computed from the model state.
import {CAMS} from './params.js';

const ALL = ['frame', 'frameSides', 'hood', 'rails', 'keys', 'levers', 'linkage', 'spacebar', 'shift', 'backspace', 'segment', 'typebars', 'ubar', 'vibrator', 'ribbon', 'escapement', 'mainspring', 'bell', 'carriage', 'rack', 'platen', 'paper', 'return'];

// extra cameras for subsystem views (same form as params.CAMS)
const SUBCAM = {
  linkage: {t: [10, 115, 70], az: 64, el: 16, d: 920, sx: 0, sy: -20},
  ubar: {t: [0, 172, -10], az: 120, el: 30, d: 680, sx: 0, sy: -20},
  feed: {t: [0, 210, 40], az: 10, el: 56, d: 920, sx: 0, sy: -20},
  shift: {t: [10, 165, -20], az: 82, el: 12, d: 1120, sx: 0, sy: -20},
  backspace: {t: [50, 172, -80], az: 142, el: 24, d: 760, sx: 0, sy: -20},
  bell: {t: [-150, 140, -50], az: -80, el: 10, d: 720, sx: 0, sy: -20},
  ret: {t: [-120, 230, 0], az: -38, el: 24, d: 800, sx: 0, sy: -20},
  spacing: {t: [-150, 240, -20], az: -64, el: 20, d: 520, sx: 0, sy: -20},
  mainspring: {t: [-90, 190, -130], az: -150, el: 28, d: 900, sx: 0, sy: -20},
  explode: {t: [0, 210, 20], az: 36, el: 24, d: 2050, sx: 0, sy: -30},
  ribbonLift: {t: [0, 222, 12], az: 14, el: 20, d: 470, sx: 0, sy: -20},
};
export const CAMERA = {...CAMS, ...SUBCAM};
export const CAM_BUTTONS = ['hero', 'operator', 'keyboard', 'side', 'top', 'typebars', 'impact', 'escapement', 'ribbon', 'carriage', 'rear', 'platen', 'inside'];

// big surfaces (frame, hood, paper, paper table) ghost fainter than small mechanisms so they never wash the view out
const FAINT = ['frame', 'frameSides', 'hood', 'paper', 'platen', 'carriage'];
const ghostAll = (keep, o = 0.07) => Object.fromEntries(ALL.filter((a) => !keep.includes(a)).map((a) => [a, FAINT.includes(a) ? o * 0.45 : o]));

/** subsystem views */
export const SUBSYSTEMS = {
  linkage: {label: 'KEY LINKAGE', cam: 'linkage', keep: ['keys', 'levers', 'linkage', 'typebars', 'segment'], explode: {frameSides: 1, keys: 0.25, levers: 0.18}, rows: 0.6},
  basket: {label: 'TYPEBAR BASKET', cam: 'typebars', keep: ['typebars', 'segment', 'ubar', 'linkage'], explode: {hood: 1, typebars: 0.25, segment: 0.25, ubar: 0.25}, fan: 1},
  impact: {label: 'IMPACT', cam: 'impact', keep: ['typebars', 'vibrator', 'ribbon', 'platen', 'paper', 'segment'], cut: ['hood']},
  ribbonLift: {label: 'RIBBON LIFT', cam: 'ribbonLift', keep: ['vibrator', 'ribbon', 'typebars', 'platen', 'paper'], cut: ['hood'], explode: {vibrator: 0.2, ribbon: [0, 10, 11]}},
  ribbonFeed: {label: 'RIBBON FEED', cam: 'feed', keep: ['ribbon', 'vibrator'], explode: {ribbon: 0.55, vibrator: [0, 47, 0]}},
  ubar: {label: 'UNIVERSAL BAR', cam: 'ubar', keep: ['ubar', 'typebars', 'escapement', 'segment', 'rack'], cut: ['hood', 'frameSides'], explode: {ubar: 0.3}},
  escapement: {label: 'ESCAPEMENT', cam: 'escapement', keep: ['escapement', 'rack', 'ubar'], explode: {escapement: 0.3, rack: [0, -3, -39]}},
  carriage: {label: 'CARRIAGE', cam: 'carriage', keep: ['carriage', 'rack', 'rails', 'platen', 'paper', 'return', 'mainspring', 'bell'], explode: {carriage: 0.45}},
  mainspring: {label: 'MAINSPRING', cam: 'mainspring', keep: ['mainspring', 'carriage', 'rails', 'platen', 'paper', 'return'], explode: {mainspring: 0.3}},
  shift: {label: 'SHIFT', cam: 'shift', keep: ['shift', 'carriage', 'platen', 'paper', 'return', 'rails'], cut: ['frameSides']},
  backspace: {label: 'BACKSPACE', cam: 'backspace', keep: ['backspace', 'rack', 'escapement', 'carriage'], cut: ['frameSides'], explode: {backspace: 0.25}},
  bell: {label: 'MARGIN BELL', cam: 'bell', keep: ['bell', 'carriage', 'rails'], cut: ['frameSides'], explode: {bell: 0.22}},
  ret: {label: 'CARRIAGE RETURN', cam: 'ret', keep: ['return', 'carriage', 'platen', 'paper', 'rails', 'rack'], explode: {}},
  spacing: {label: 'LINE SPACING', cam: 'spacing', keep: ['return', 'platen', 'paper'], explode: {return: 0.18}},
  platen: {label: 'PLATEN', cam: 'platen', keep: ['platen', 'paper', 'return'], explode: {platen: 0.25, paper: 0.12}},
  explode: {label: 'FULL EXPLODE', cam: 'explode', keep: ALL, explode: Object.fromEntries(ALL.map((a) => [a, 1])), fan: 1, rows: 1},
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
const mixVec = (a, b, k) => {
  if (!Array.isArray(a) && !Array.isArray(b)) return mixNum(a || 0, b || 0, k);
  return null;
};
/** blend two looks */
export function blendLook(A, B, k, EXP) {
  const out = {explode: {}, opacity: {}, ghost: {}, fan: mixNum(A.fan, B.fan, k), rows: mixNum(A.rows, B.rows, k)};
  const keys = new Set([...Object.keys(A.explode), ...Object.keys(B.explode)]);
  for (const a of keys) {
    const va = A.explode[a] ?? 0;
    const vb = B.explode[a] ?? 0;
    const m = mixVec(va, vb, k);
    if (m !== null) out.explode[a] = m;
    else {
      const ta = Array.isArray(va) ? va : EXP[a].map((c) => c * va);
      const tb = Array.isArray(vb) ? vb : EXP[a].map((c) => c * vb);
      out.explode[a] = ta.map((c, i) => mixNum(c, tb[i], k));
    }
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
export const TRANSITION = 1.25; // seconds for a view change

/**
 * The view at time t from a list of view events [{t, cam, sub, xray, cutaway}] (sorted). Each event may set any of
 * the fields; unset fields carry over. Returns {cam, look, camId, sub, xray, cutaway, k}.
 */
export function viewAt(events, t, EXP, camOverride) {
  let cur = {cam: 'hero', sub: null, xray: false, cutaway: false, t: -1e9};
  let prev = cur;
  for (const e of events) {
    if (e.t > t) break;
    prev = cur;
    cur = {...cur, ...e, t: e.t};
    if (e.sub && !e.cam) cur.cam = SUBSYSTEMS[e.sub]?.cam || cur.cam;
    if (e.sub === 'reassemble') cur.sub = null;
  }
  const k = ease((t - cur.t) / TRANSITION);
  const lookOf = (v) => viewLook(v.sub, v);
  const look = k >= 1 ? lookOf(cur) : blendLook(lookOf(prev), lookOf(cur), k, EXP);
  const ca = camAt(prev.cam, t - prev.t);
  const cb = camAt(cur.cam, t - cur.t);
  let cam = k >= 1 ? cb : blendCam(ca, cb, k);
  if (camOverride) cam = camOverride(cam, cur, k);
  return {cam, look, camId: cur.cam, sub: cur.sub, xray: cur.xray, cutaway: cur.cutaway, k, since: t - cur.t};
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
