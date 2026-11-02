// Geometry checks on the real, code-built machine (built headless — see obb.js): the paper table, teardown poses
// free of interference, reassembly to the exact home pose. Added in the 2026-11 audit (D-02, D-03, D-04, D-18).
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildMachine, viewLook, obbs, newInterferences} from './obb.js';
import {paperTable, paperPoint, PAPER_PATH} from '../../src/geometry/carriage.js';
import {createSession, typeText} from '../../src/model.js';
import {SUB_BUTTONS, SUBSYSTEMS, blendLook} from '../../src/views.js';
import {EXPLODE} from '../../src/params.js';

test('paper table lies under the incoming sheet, decal toward the operator (D-02)', () => {
  const {tilt, from, to} = paperTable();
  // the table's long axis (local z after the tilt) is parallel to the paper's path down the table
  const axis = [-Math.sin(tilt), Math.cos(tilt)]; // (y, z)
  const path = [to[0] - from[0], to[1] - from[1]];
  const n = Math.hypot(...path);
  const cross = Math.abs(axis[0] * path[1] - axis[1] * path[0]) / n;
  assert.ok(cross < 1e-9, `table axis crosses the paper path (sin = ${cross.toFixed(3)})`);
  // its decal face (local +y) points up and toward the operator (+z)
  const normal = [Math.cos(tilt), Math.sin(tilt)];
  assert.ok(normal[0] > 0 && normal[1] > 0, `decal normal (y ${normal[0].toFixed(2)}, z ${normal[1].toFixed(2)})`);
  // the table rises toward the rear
  assert.ok(to[0] > from[0] && to[1] < from[1]);
  // and the paper's own path agrees: the sheet comes down the table into the rear of the platen
  const [ya, za] = paperPoint(0);
  const [yb, zb] = paperPoint(PAPER_PATH.lenA);
  assert.ok(ya > yb && za < zb);
});

// the machine posed with a typed line, at rest
const machine = buildMachine();
const S = createSession();
typeText(S, 'Now is the time for');
const s = S.stateAt(S.end + 1);
machine.update(s, S, {});
const REST = obbs(machine);
const homes = new Map();
machine.root.traverse((o) => homes.set(o, o.matrixWorld.clone()));

for (const id of SUB_BUTTONS) {
  test(`teardown ${SUBSYSTEMS[id].label}: no part passes through another, on the way or apart (D-03, D-04)`, () => {
    // the view change blends the explode linearly: check the way out as well as the exploded pose
    for (const k of [0.25, 0.5, 0.75, 1]) {
      machine.update(s, S, blendLook(viewLook(null), viewLook(id), k, EXPLODE));
      const hits = newInterferences(REST, obbs(machine), 1.0);
      assert.deepEqual(hits.slice(0, 6), [], `at ${k * 100} %: ${hits.length} interferences, worst: ${hits.slice(0, 6).map((h) => `${h.a} × ${h.b} ${h.pen} mm`).join('; ')}`);
    }
  });
}

test('every exploded view moves its assemblies, and reassembly returns every part exactly home (D-18)', () => {
  for (const id of SUB_BUTTONS) {
    const look = viewLook(id);
    machine.update(s, S, look);
    machine.root.updateMatrixWorld(true);
    const moved = Object.keys(look.explode).filter((a) => machine.nodes[a].some((n) => n.position.lengthSq() > 1));
    if (Object.keys(look.explode).length) assert.ok(moved.length > 0, `${id}: nothing moved`);
  }
  machine.update(s, S, viewLook(null));
  machine.root.updateMatrixWorld(true);
  let worst = 0;
  machine.root.traverse((o) => {
    const h = homes.get(o);
    if (!h) return;
    for (let i = 0; i < 16; i++) worst = Math.max(worst, Math.abs(h.elements[i] - o.matrixWorld.elements[i]));
  });
  assert.ok(worst < 1e-9, `residual offset ${worst}`);
});
