// View blending: continuity when a change interrupts a running transition (D-06), and the tour's views unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import {viewAt, viewLook, blendLook, camAt, blendCam, TRANSITION, SUBSYSTEMS} from '../../src/views.js';
import {EXPLODE} from '../../src/params.js';
import {VIEW_EVENTS, DURATION} from '../../src/tour.js';

const flat = (v) => {
  const o = {d: v.cam.d, az: v.cam.az, el: v.cam.el, tx: v.cam.tx, ty: v.cam.ty, tz: v.cam.tz, fan: v.look.fan, rows: v.look.rows};
  for (const [a, x] of Object.entries(v.look.explode)) {
    const p = Array.isArray(x) ? x : [x, 0, 0];
    p.forEach((c, i) => (o[`x.${a}.${i}`] = c));
  }
  for (const [a, x] of Object.entries(v.look.opacity)) o[`o.${a}`] = x;
  return o;
};
const maxJump = (A, B) => {
  let m = 0;
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const d = k.startsWith("o.") ? 1 : 0; // a missing opacity is 1, a missing offset 0
    m = Math.max(m, Math.abs((A[k] ?? d) - (B[k] ?? d)));
  }
  return m;
};

test('a view change during a transition does not jump (D-06)', () => {
  const ev = [{t: -99, cam: 'hero'}, {t: 0, sub: 'basket'}, {t: 0.4, sub: 'escapement'}, {t: 0.7, sub: 'reassemble', cam: 'hero'}];
  for (const tc of [0, 0.4, 0.7]) {
    const a = flat(viewAt(ev, tc - 1e-6, EXPLODE));
    const b = flat(viewAt(ev, tc + 1e-6, EXPLODE));
    assert.ok(maxJump(a, b) < 0.05, `jump ${maxJump(a, b).toFixed(3)} at t=${tc}`);
  }
  // and it settles exactly on the last view
  const end = viewAt(ev, 0.7 + TRANSITION + 0.01, EXPLODE);
  assert.equal(end.sub, null);
  assert.equal(end.k, 1);
});

// the algorithm before the audit: blend from the previous view's settled state (correct when changes are ≥ TRANSITION
// apart, as in the tour). The tour must render exactly as before.
function viewAtBefore(events, t) {
  let cur = {cam: 'hero', sub: null, xray: false, cutaway: false, t: -1e9};
  let prev = cur;
  for (const e of events) {
    if (e.t > t) break;
    prev = cur;
    cur = {...cur, ...e, t: e.t};
    if (e.sub && !e.cam) cur.cam = SUBSYSTEMS[e.sub]?.cam || cur.cam;
    if (e.sub === 'reassemble') cur.sub = null;
  }
  const u = Math.min(1, Math.max(0, (t - cur.t) / TRANSITION));
  const k = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  const lookOf = (v) => viewLook(v.sub, v);
  const look = k >= 1 ? lookOf(cur) : blendLook(lookOf(prev), lookOf(cur), k, EXPLODE);
  const cam = k >= 1 ? camAt(cur.cam, t - cur.t) : blendCam(camAt(prev.cam, t - prev.t), camAt(cur.cam, t - cur.t), k);
  return {cam, look};
}

test('the tour views are unchanged by the continuity fix', () => {
  for (let i = 1; i < VIEW_EVENTS.length; i++) assert.ok(VIEW_EVENTS[i].t - VIEW_EVENTS[i - 1].t >= TRANSITION, 'tour view changes are a transition apart');
  for (let t = 0; t <= DURATION; t += 0.05) {
    const j = maxJump(flat(viewAt(VIEW_EVENTS, t, EXPLODE)), flat(viewAtBefore(VIEW_EVENTS, t)));
    assert.ok(j < 1e-9, `t=${t.toFixed(2)}: differs by ${j}`);
  }
});
