// Pure-model tests: no rendering. Run with `npm test`.
import assert from 'node:assert/strict';
import test from 'node:test';
import {CHAR_KEYS, charToKey, FN_KEYS, SLOT_KEY, slotDeg} from '../../src/keyboard.js';
import {BASKET, CARRIAGE, ESC, KEYS, LINE, PH, PITCH, PLATEN, RIBBON, T} from '../../src/params.js';
import {barDegAt, createSession, cuesBetween, driveDeg, keyLeverDeg, LINK_PULL, STRIKE_DEG, TIMING, toothDeg, typeText, ubOfBar} from '../../src/model.js';
import {barPose, slugFace, PRINT_POINT} from '../../src/kinematics.js';

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg ?? `${a} ≉ ${b} (±${eps})`);
const typed = (text, init) => {
  const S = createSession({initial: init});
  typeText(S, text);
  return S;
};

test('keyboard: 42 character keys, 84 characters, one slot each, unique', () => {
  assert.equal(CHAR_KEYS.length, 42);
  assert.equal(BASKET.count, 42);
  const chars = new Set(CHAR_KEYS.flatMap((k) => [k.lo, k.up]));
  assert.ok(chars.size >= 80, `distinct characters ${chars.size}`);
  const slots = new Set(CHAR_KEYS.map((k) => k.slot));
  assert.equal(slots.size, 42);
  for (let i = 0; i < 42; i++) assert.equal(CHAR_KEYS[SLOT_KEY[i]].slot, i);
  assert.equal(FN_KEYS.length, 5);
});

test('selected-key mapping: characters map to the right key and case', () => {
  assert.deepEqual(charToKey('a'), {key: CHAR_KEYS.find((k) => k.lo === 'a').id, upper: false});
  assert.equal(charToKey('A').upper, true);
  assert.equal(charToKey('A').key, charToKey('a').key);
  assert.equal(charToKey('$').key, charToKey('4').key);
  assert.equal(charToKey('1').key, charToKey('l').key, '1 is typed with lower-case l');
  assert.equal(charToKey('!'), null, 'no exclamation key');
  assert.equal(charToKey('é'), null);
});

test('deterministic: the same session gives identical states, in any query order', () => {
  const a = typed('Now is the time for all good men\n');
  const b = typed('Now is the time for all good men\n');
  const ts = [3.21, 0.5, 7.77, 0.01, 12.4, 5.5];
  const sa = ts.map((t) => JSON.stringify(a.stateAt(t)));
  const sb = [...ts].reverse().map((t) => JSON.stringify(b.stateAt(t))).reverse();
  assert.deepEqual(sa, sb);
  // repeated query of the same time is identical
  assert.equal(JSON.stringify(a.stateAt(4.2)), JSON.stringify(a.stateAt(4.2)));
});

test('normalized progress: every action runs p from 0 to 1 over its duration and never overlaps', () => {
  const S = typed('Ab c\n');
  let prevEnd = 0;
  for (const act of S.acts) {
    assert.ok(act.t0 >= prevEnd - 1e-9, 'actions do not overlap');
    near(S.stateAt(act.t0 + 1e-9).p, 0, 1e-6);
    near(S.stateAt(act.t0 + act.dur * 0.5).p, 0.5, 1e-9);
    prevEnd = act.t0 + act.dur;
  }
  assert.equal(S.stateAt(S.end + 1).action, null);
});

test('key travel: full dip at the bottom of the stroke, rest at the ends', () => {
  const S = typed('k');
  const a = S.acts[0];
  near(S.stateAt(a.t0).keyDepth, 0, 1e-9);
  near(S.stateAt(a.t0 + 0.37 * a.dur).keyDepth, KEYS.travel, 1e-9);
  near(S.stateAt(a.t0 + a.dur).keyDepth, 0, 1e-9);
  const row = CHAR_KEYS[a.key].row;
  near(keyLeverDeg(row, KEYS.travel), (Math.asin(KEYS.travel / (KEYS.rowZ[row] - KEYS.fulcrumZ)) * 180) / Math.PI, 1e-9);
});

test('key-to-typebar: the linkage drives the selected bar and only that bar', () => {
  const S = typed('q');
  const a = S.acts[0];
  const s = S.stateAt(a.t0 + 0.2 * a.dur);
  assert.equal(s.slot, CHAR_KEYS[a.key].slot);
  assert.ok(s.barDeg > BASKET.restDeg + 5);
  // heel follows the link linearly: drive angle at full key equals the configured drive angle
  near(driveDeg(1), TIMING.DRIVE_DEG, 1e-6);
  near(driveDeg(0), BASKET.restDeg, 1e-6);
  // monotone in key travel
  for (let k = 0; k < 1; k += 0.05) assert.ok(driveDeg(k + 0.05) > driveDeg(k));
  assert.ok(LINK_PULL > 6 && LINK_PULL < 12);
});

test('typebar strike: the slug face reaches the printing point at impact for every slot', () => {
  near(barDegAt(PH.impact), STRIKE_DEG, 1e-6);
  for (let i = 0; i < 42; i++) {
    const f = slugFace(i, STRIKE_DEG);
    near(f[0], PRINT_POINT[0], 1e-6, `slot ${i} x`);
    near(f[1], PRINT_POINT[1], 1e-6, `slot ${i} y`);
    near(f[2], PRINT_POINT[2], 1e-6, `slot ${i} z`);
    // and never passes beyond the platen surface during the stroke
    for (let p = 0; p <= 1; p += 0.005) {
      const g = slugFace(i, barDegAt(p));
      const dz = g[2] - PLATEN.z;
      const dy = g[1] - PRINT_POINT[1];
      assert.ok(Math.hypot(dz, dy) >= PLATEN.r - 1e-6 || Math.abs(g[0]) > PLATEN.length / 2, `slot ${i} enters platen at p=${p}`);
    }
  }
  // resting bars stay in their slots: pivots on the segment arc
  for (let i = 0; i < 42; i++) {
    const b = barPose(i, BASKET.restDeg);
    near(Math.hypot(b.pivot[0], b.pivot[2]), BASKET.segR, 1e-9);
  }
  assert.ok(slotDeg(0) === -BASKET.span && Math.abs(slotDeg(41) - BASKET.span) < 1e-9);
});

test('ribbon vibrator: up before impact, down after, height by colour', () => {
  const S = typed('e');
  const a = S.acts[0];
  near(S.stateAt(a.t0 + PH.impact * a.dur).ribbonLift, RIBBON.lift.black, 1e-9);
  near(S.stateAt(a.t0 + 0.05 * a.dur).ribbonLift, 0, 1e-9);
  near(S.stateAt(a.t0 + 0.95 * a.dur).ribbonLift, 0, 1e-9);
  const R = createSession();
  R.push({type: 'color', value: 'red'});
  typeText(R, 'e');
  const b = R.acts[1];
  near(R.stateAt(b.t0 + PH.impact * b.dur).ribbonLift, RIBBON.lift.red, 1e-9);
  assert.equal(R.glyphs[0].color, 'red');
  const St = createSession();
  St.push({type: 'color', value: 'stencil'});
  typeText(St, 'e');
  near(St.stateAt(St.acts[1].t0 + PH.impact * St.acts[1].dur).ribbonLift, 0, 1e-9);
});

test('impact timing: the character appears exactly at impact, not before', () => {
  const S = typed('w');
  const a = S.acts[0];
  assert.equal(S.stateAt(a.t0 + PH.impact * a.dur - 1e-6).glyphCount, 0);
  assert.equal(S.stateAt(a.t0 + PH.impact * a.dur + 1e-6).glyphCount, 1);
  // the ribbon is fully up at impact and the bar is at the platen
  const s = S.stateAt(a.t0 + PH.impact * a.dur);
  near(s.barDeg, STRIKE_DEG, 1e-6);
  near(s.colPos, CARRIAGE.leftMargin, 1e-9, 'carriage has not moved at impact');
});

test('character placement: column and line come from the carriage and platen state', () => {
  const S = typed('ab cd\nef');
  const g = S.glyphs;
  assert.deepEqual(g.map((x) => x.ch).join(''), 'abcdef');
  assert.deepEqual(g.map((x) => x.col), [10, 11, 13, 14, 10, 11]);
  assert.deepEqual(g.map((x) => x.lines), [0, 0, 0, 0, 1, 1]);
  near(g[4].feed, LINE.pitch, 1e-9);
});

test('escapement: loose dog, rigid dog, exactly one character per stroke', () => {
  const S = typed('m');
  const a = S.acts[0];
  const at = (p) => S.stateAt(a.t0 + p * a.dur);
  assert.equal(at(0.1).escPhase, 'HELD ON LOOSE DOG');
  near(at((TIMING.STEP1[1] + TIMING.STEP2[0]) / 2).colPos, CARRIAGE.leftMargin + ESC.looseFrac, 1e-9);
  assert.equal(at((TIMING.STEP1[1] + TIMING.STEP2[0]) / 2).escPhase, 'HELD ON RIGID DOG');
  near(at(0.99).colPos, CARRIAGE.leftMargin + 1, 1e-9);
  near(at(0.99).wheel, 1, 1e-9);
  assert.ok(TIMING.P_TRIP < TIMING.STEP2[0]);
  // carriage moves to the left as the column grows (writing point moves right on the paper)
  assert.ok(CARRIAGE.x(11) < CARRIAGE.x(10));
  near(CARRIAGE.x(10) - CARRIAGE.x(11), PITCH, 1e-12);
  // monotone advance, never overshooting by more than a few percent of a space
  let prev = -1;
  for (let p = 0; p <= 1; p += 0.002) {
    const c = at(p).colPos;
    assert.ok(c <= CARRIAGE.leftMargin + 1.06);
    if (p < TIMING.STEP2[0]) assert.ok(c >= prev - 1e-12);
    prev = c;
  }
});

test('spacebar: advances one space with no typebar and no glyph', () => {
  const S = typed(' ');
  const a = S.acts[0];
  assert.equal(a.type, 'space');
  for (let p = 0; p <= 1; p += 0.01) assert.equal(S.stateAt(a.t0 + p * a.dur).slot, -1);
  assert.equal(S.stateAt(S.end).col, CARRIAGE.leftMargin + 1);
  assert.equal(S.glyphs.length, 0);
});

test('backspace: one space back through the rack; the escapement wheel does not reverse', () => {
  const S = typed('ab\b');
  const end = S.stateAt(S.end + 0.1);
  assert.equal(end.col, CARRIAGE.leftMargin + 1);
  assert.equal(end.wheel, 2, 'escapement wheel only ever turns forward');
  // blocked at the carriage stop
  const B = createSession({initial: {col: 0}});
  B.push({type: 'backspace'});
  assert.equal(B.stateAt(B.end).col, 0);
});

test('shift: carriage shift raises the subcarriage; upper case prints from the upper character', () => {
  const S = typed('Ab');
  assert.equal(S.acts[0].type, 'shiftDown');
  assert.deepEqual(S.glyphs.map((g) => g.ch), ['A', 'b']);
  const mid = S.stateAt(S.acts[1].t0 + 0.2 * S.acts[1].dur);
  near(mid.shiftMM, CARRIAGE.shiftTravel, 1e-9);
  near(CARRIAGE.shiftTravel, BASKET.charSep, 1e-9, 'shift travel equals the slug character separation');
  near(S.stateAt(S.end + 0.1).shiftMM, 0, 1e-9);
  // shift lock keeps upper case until released
  const L = createSession();
  L.push({type: 'lock'});
  typeText(L, 'ab');
  assert.deepEqual(L.glyphs.map((g) => g.ch), ['A', 'B']);
  L.push({type: 'lock'});
  typeText(L, 'c');
  assert.equal(L.glyphs[2].ch, 'c');
});

test('margin bell: rings 7 spaces before the line lock, once per line, aligned to the carriage step', () => {
  const bc = CARRIAGE.rightMargin - CARRIAGE.bellBefore;
  const S = createSession({initial: {col: bc - 3}});
  typeText(S, 'abcdef');
  assert.equal(S.last.bells, 1);
  const ringAct = S.acts.find((x) => x.after.bells === 1 && x.before.bells === 0);
  assert.equal(ringAct.before.col, bc - 1);
  const s = S.stateAt(ringAct.after.bellAt + 0.01);
  assert.ok(s.bellRing > 0.9);
  near(s.colPos, bc, 0.08);
  const cues = cuesBetween(S, 0, S.end + 1).filter((c) => c.kind === 'bell');
  assert.equal(cues.length, 1);
});

test('line lock: keys lock at the right margin; margin release allows a few more', () => {
  const S = createSession({initial: {col: CARRIAGE.rightMargin - 1}});
  typeText(S, 'abc');
  assert.equal(S.glyphs.length, 1);
  assert.equal(S.acts[1].type, 'locked');
  assert.equal(S.last.col, CARRIAGE.rightMargin);
  S.push({type: 'release'});
  typeText(S, 'de');
  assert.equal(S.glyphs.length, 3);
});

test('carriage return: back to the left margin, platen turns by the spacing, paper advances', () => {
  for (const sp of [1, 2, 3]) {
    const S = createSession();
    S.push({type: 'spacing', value: sp});
    typeText(S, 'hello\n');
    const e = S.stateAt(S.end + 0.01);
    assert.equal(e.col, CARRIAGE.leftMargin);
    assert.equal(e.lines, sp);
    near(e.platenDeg, sp * toothDeg, 1e-9);
    near(e.feed, sp * LINE.pitch, 1e-9);
    // platen rotation agrees with paper movement: arc length = feed
    near((e.platenDeg * Math.PI) / 180 * PLATEN.r, e.feed, 1e-9);
  }
});

test('line spacing: one ratchet tooth equals one line of 1/6 inch', () => {
  near((2 * Math.PI * PLATEN.r) / PLATEN.teeth, 25.4 / 6, 1e-9);
});

test('paper limits: no line feed past the end of the sheet', () => {
  const S = createSession({initial: {lines: LINE.maxLines - 1}});
  S.push({type: 'spacing', value: 3});
  S.push({type: 'ret'});
  assert.equal(S.last.lines, LINE.maxLines);
  S.push({type: 'ret'});
  assert.equal(S.last.lines, LINE.maxLines);
});

test('reset: a new session starts at the initial state', () => {
  const S = typed('abc\n');
  assert.notEqual(S.stateAt(S.end).lines, 0);
  const R = createSession();
  const s = R.stateAt(0);
  assert.equal(s.col, CARRIAGE.leftMargin);
  assert.equal(s.lines, 0);
  assert.equal(s.glyphCount, 0);
});

test('seeking and truncation: states are queryable anywhere; new input after a scrub drops the future', () => {
  const S = typed('abcdef');
  const t = S.acts[3].t0 + 0.01;
  const before = JSON.stringify(S.stateAt(t));
  S.stateAt(S.end);
  S.stateAt(0);
  assert.equal(JSON.stringify(S.stateAt(t)), before);
  S.truncate(t);
  assert.equal(S.acts.length, 4);
  assert.equal(S.glyphs.length, 4);
});

test('invalid input fails safely', () => {
  const S = createSession();
  assert.equal(S.push({type: 'char', key: 999}), null);
  assert.equal(S.push({type: 'bogus'}), null);
  assert.equal(S.push({type: 'shiftUp'}), null, 'shift up while not shifted does nothing');
  typeText(S, '!éabc');
  assert.equal(S.glyphs.map((g) => g.ch).join(''), 'abc');
  const sp = createSession();
  sp.push({type: 'spacing', value: 7});
  assert.equal(sp.last.spacing, 2, 'unknown spacing value cycles to the next setting');
  for (const t of [-5, NaN, 1e9]) assert.doesNotThrow(() => S.stateAt(t));
});

test('universal bar: travel follows the bar angle and trips near impact', () => {
  near(ubOfBar(STRIKE_DEG), 1, 1e-9);
  near(ubOfBar(100), 0, 1e-9);
  assert.ok(TIMING.P_TRIP > TIMING.FLIGHT[0] && TIMING.P_TRIP <= PH.impact);
});

test('sound cues come from the same actions (impact cue at the glyph time)', () => {
  const S = typed('ab\n');
  const cues = cuesBetween(S, 0, S.end + 1);
  const impacts = cues.filter((c) => c.kind === 'impact');
  assert.equal(impacts.length, 2);
  near(impacts[0].t, S.glyphs[0].t, 1e-9);
  assert.equal(cues.filter((c) => c.kind === 'ratchet').length, 1);
  assert.equal(cues.filter((c) => c.kind === 'marginStop').length, 1);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].t >= cues[i - 1].t);
});

test('timings are positive and phases ordered', () => {
  for (const v of Object.values(T)) assert.ok(v > 0);
  assert.ok(PH.ribbonUp[1] <= PH.impact, 'ribbon is up before impact');
  assert.ok(PH.keyDown[1] < PH.impact);
});

test('ribbon colour selector steps black → red → stencil → black; stencil lifts nothing (D-12)', () => {
  const S = createSession();
  const seen = [];
  for (let i = 0; i < 4; i++) {
    S.push({type: 'color'});
    seen.push(S.last.color);
  }
  assert.deepEqual(seen, ['red', 'stencil', 'black', 'red']);
  const St = createSession({initial: {color: 'stencil'}});
  const a = St.push({type: 'char', key: charToKey('e').key});
  for (let p = 0; p < 1; p += 0.05) assert.equal(St.stateAt(a.t0 + p * a.dur).ribbonLift, 0);
  assert.equal(St.glyphs[0].color, 'stencil');
});
