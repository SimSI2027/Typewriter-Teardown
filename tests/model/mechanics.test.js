// Geometric checks of the mechanism against the parameter block: clearances, collisions, ratios. Pure math — the same
// kinematics.js functions pose the 3D parts, so a pass here is a pass for the rendered machine.
import assert from 'node:assert/strict';
import test from 'node:test';
import {CHAR_KEYS, slotDeg} from '../../src/keyboard.js';
import {barPose, sublever, keyLever} from '../../src/kinematics.js';
import {BASKET, BODY, CARRIAGE, ESC, EXPLODE, KEYS, PITCH, PLATEN, PRINT, RIBBON} from '../../src/params.js';
import {barDegAt, STRIKE_DEG, LINK_PULL} from '../../src/model.js';

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k);
/** minimum distance between segments p0-p1 and q0-q1 (sampled — robust and plenty precise at 0.5 mm) */
function segDist(p0, p1, q0, q1, n = 40) {
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    const p = add(p0, sub(p1, p0), i / n);
    const d = sub(q1, q0);
    const t = Math.max(0, Math.min(1, dot(sub(p, q0), d) / dot(d, d)));
    const q = add(q0, d, t);
    best = Math.min(best, Math.hypot(...sub(p, q)));
  }
  return best;
}
const ANGLES = (() => {
  const a = [];
  for (let p = 0; p <= 1; p += 0.004) a.push(barDegAt(p));
  return a;
})();

test('a moving typebar never touches its resting neighbours', () => {
  for (let i = 0; i < 42; i++) {
    for (const j of [i - 2, i - 1, i + 1, i + 2]) {
      if (j < 0 || j > 41) continue;
      const r = barPose(j, BASKET.restDeg);
      let min = Infinity;
      for (const a of ANGLES) {
        const b = barPose(i, a);
        // from just past the pivot (the slots themselves keep pivots apart) to the slug
        const p0 = add(b.pivot, b.dir, 3);
        min = Math.min(min, segDist(p0, b.tip, add(r.pivot, r.dir, 3), r.tip, 24));
      }
      assert.ok(min >= BASKET.barT, `slot ${i} vs ${j}: ${min.toFixed(2)} mm`);
    }
  }
});

test('resting typebars stay clear of each other (slot pitch on the segment)', () => {
  const pitch = (2 * Math.PI * BASKET.segR * (2 * BASKET.span)) / 360 / (BASKET.count - 1);
  assert.ok(pitch > BASKET.barT * 2, `slot pitch ${pitch.toFixed(2)} mm`);
});

test('slug paths clear the ribbon spools, the deck and the decal panel', () => {
  const spoolTop = RIBBON.spoolY + RIBBON.width + 4.5;
  for (let i = 0; i < 42; i++) {
    for (const a of ANGLES) {
      const b = barPose(i, a);
      for (const pt of [b.tip, add(b.pivot, b.dir, BASKET.L * 0.5)]) {
        const [x, y, z] = pt;
        // spools: cylinders of full radius (+2 mm) between their cup and their top flange
        for (const s of [-1, 1]) {
          const d = Math.hypot(x - s * RIBBON.spoolX, z - RIBBON.spoolZ);
          if (y > RIBBON.spoolY - 4 && y < spoolTop) assert.ok(d > RIBBON.spoolFullR + 2, `slot ${i} hits a spool (${d.toFixed(1)} mm)`);
        }
        // deck plate (y 194..203): only the opening of radius deckOpenR may be crossed
        if (y > 193 && y < 204) assert.ok(Math.hypot(x, z) < BODY.deckOpenR - 2, `slot ${i} crosses the deck at r=${Math.hypot(x, z).toFixed(1)}`);
        // decal panel (z hoodZ-1 .. hoodZ+8): crossed only inside the arch
        if (z > BODY.hoodZ - 1 && z < BODY.hoodZ + 8 && y > 124) {
          const inArch = Math.abs(x) < 150 && y > 196 - 46 * Math.sqrt(Math.max(0, 1 - (x / 150) ** 2));
          assert.ok(inArch, `slot ${i} passes through the decal panel at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        }
      }
    }
  }
});

test('the slug meets the platen squarely and clears the type guide', () => {
  for (let i = 0; i < 42; i++) {
    const b = barPose(i, STRIKE_DEG);
    // lower edge of the slug face sits above the type guide prongs (top at PRINT.y − 5)
    const slugBottom = b.tip[1] - 2;
    assert.ok(slugBottom > PRINT.y - 5, `slot ${i} slug bottom ${slugBottom}`);
  }
  // the type guide prongs straddle the slug: gap 6.4 − 1.6 = 4.8 mm > slug width
  assert.ok(6.4 - 1.6 > BASKET.slugW);
});

test('rack, pinion and star wheel: one wheel tooth is one pica space', () => {
  const pinionCirc = 2 * Math.PI * ESC.pinionR;
  assert.ok(Math.abs(pinionCirc / ESC.wheelTeeth - PITCH) < 1e-9);
  const rackPitch = (ESC.wheelTeeth * PITCH) / ESC.pinionTeeth;
  assert.ok(Math.abs(rackPitch - pinionCirc / ESC.pinionTeeth) < 1e-9);
  assert.ok(Math.abs(PITCH - 2.54) < 1e-12);
});

test('margins, bell and writing line are consistent', () => {
  assert.equal(CARRIAGE.rightMargin - CARRIAGE.bellBefore, 65);
  assert.ok(CARRIAGE.leftMargin >= 0 && CARRIAGE.rightMargin < CARRIAGE.cols);
  // carriage travel stays on the rails' supports
  const travel = Math.abs(CARRIAGE.x(0) - CARRIAGE.x(CARRIAGE.cols - 1));
  assert.ok(travel < CARRIAGE.frameLen + 2 * BODY.width, 'travel within reason');
});

test('keys: caps, rows and levers do not collide', () => {
  for (const a of CHAR_KEYS)
    for (const b of CHAR_KEYS) {
      if (a.id >= b.id) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (a.row === b.row) assert.ok(d >= 2 * KEYS.rimR + 1, `keys ${a.lo} ${b.lo}`);
    }
  // levers in the same row are spaced wider than their thickness; levers of different rows overlap in x only where
  // their lengths differ (they are separate bars at the same height in the comb — check pitch)
  assert.ok(KEYS.pitchX > KEYS.leverW * 3);
  // a fully depressed key's lever stays above the base plate
  for (const k of CHAR_KEYS) assert.ok(keyLever(k, KEYS.travel).front[1] - KEYS.leverH > BODY.baseY + 5);
  // the sublever end moves exactly the link pull
  const k = CHAR_KEYS[0];
  assert.ok(Math.abs(sublever(k, 0).end[1] - sublever(k, 1).end[1] - LINK_PULL) < 0.02);
});

test('exploded parts never go below the desk', () => {
  // lowest point of each assembly at rest (mm above the desk), from the geometry
  const minY = {levers: 23, linkage: 40, spacebar: 41, shift: 21, keys: 40, backspace: 33, ubar: 168, escapement: 130, mainspring: 160, segment: 170, typebars: 160, ribbon: 185, vibrator: 190, bell: 70, carriage: 196, rack: 186, platen: 206, paper: 150, return: 220, hood: 124, rails: 200, frame: 0, frameSides: 16};
  for (const [a, v] of Object.entries(EXPLODE)) {
    if (!(a in minY)) continue;
    // a straight vector, or every keyframe of a staged path
    for (const p of Array.isArray(v) ? [v] : v.at.map(([, q]) => q)) assert.ok(minY[a] + p[1] >= 0, `${a} would go ${-(minY[a] + p[1])} mm below the desk`);
  }
});

test('platen geometry: 28 teeth at 1/6 in per tooth', () => {
  assert.ok(Math.abs(2 * Math.PI * PLATEN.r - 28 * (25.4 / 6)) < 1e-9);
  assert.ok(Math.abs(PLATEN.z + PLATEN.r) < 1e-12, 'platen front face at the printing point');
});

test('slot angles span the segment symmetrically', () => {
  assert.equal(slotDeg(0), -BASKET.span);
  assert.ok(Math.abs(slotDeg(20.5) - 0) < 1e-9);
});
