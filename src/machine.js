// The whole machine: builds every assembly from code and poses it for a model state and a view "look" (explode
// amounts, opacity/x-ray, accent, typebar fan). Built in millimetres under a root scaled to metres.
import * as THREE from 'three';
import {BASKET, EXPLODE, PITCH} from './params.js';
import {createMaterials} from './materials.js';
import {buildFrame} from './geometry/frame.js';
import {buildKeys} from './geometry/keys.js';
import {buildBasket} from './geometry/basket.js';
import {buildRibbon} from './geometry/ribbon.js';
import {buildCarriage} from './geometry/carriage.js';
import {buildRear} from './geometry/rear.js';
import {explodeAt} from './views.js';

export const ASSEMBLIES = ['frame', 'frameSides', 'hood', 'rails', 'keys', 'levers', 'linkage', 'spacebar', 'shift', 'backspace', 'segment', 'typebars', 'ubar', 'vibrator', 'ribbon', 'escapement', 'mainspring', 'bell', 'carriage', 'rack', 'platen', 'paper', 'return'];
// material groups: the frame side panels share the frame's materials
const MAT_OF = (a) => a;

export function buildMachine() {
  const mats = createMaterials();
  const nodes = Object.fromEntries(ASSEMBLIES.map((a) => [a, []]));
  const root = new THREE.Group();
  root.scale.setScalar(0.001);
  const frame = buildFrame(mats, nodes);
  const keys = buildKeys(mats, nodes);
  const basket = buildBasket(mats, nodes);
  const ribbon = buildRibbon(mats, nodes);
  const carriage = buildCarriage(mats, nodes);
  const rear = buildRear(mats, nodes);
  root.add(frame.root, frame.rails, keys.keysG, keys.levG, keys.linkG, keys.spG, keys.shG, keys.bsG, basket.segG, basket.tbG, basket.ubG, basket.vbG, ribbon.G, carriage.move, rear.esG, rear.msG, rear.beG);

  // the anchor point of each assembly (for callouts) in machine millimetres, before explode
  const restDeg = (fan) => (i) => BASKET.restDeg + fan * (i % 2 ? 26 : 8);

  /**
   * pose the machine.
   * look: {explode:{assembly:k|[x,y,z]}, opacity:{assembly:0..1}, accent:{assembly:0..1}, ghost:{assembly:0..1},
   *        fan:0..1, rows:0..1}
   */
  function update(s, S, look = {}) {
    const fan = look.fan || 0;
    const L = {
      restDeg: restDeg(fan),
      accentKeys: (look.accent?.keys ?? 1) > 0.05,
      accentLinkage: (look.accent?.linkage ?? 1) > 0.05,
      accentBars: (look.accent?.typebars ?? 1) > 0.05,
      // the backspace pawl travels with the rack while it pushes the carriage back one space
      backPawlX: s.action === 'backspace' ? (Math.ceil(s.colPos - 1e-9) - s.colPos) * PITCH : 0,
    };
    keys.update(s, L);
    basket.update(s, L);
    ribbon.update(s);
    carriage.update(s, S);
    rear.update(s);
    // explode: every node of an assembly moves along its vector (side panels mirrored)
    const ex = look.explode || {};
    for (const a of ASSEMBLIES) {
      const v = ex[a];
      const base = explodeAt(a, v, 1, EXPLODE);
      for (const n of nodes[a]) {
        if (!base) n.position.set(0, 0, 0);
        else n.position.set(base[0] * (n.userData.mirror ?? 1), base[1], base[2]);
      }
    }
    // key rows lift apart in order when the keys explode
    const rows = look.rows || 0;
    keys.rowNodes.forEach((g, r) => g.position.set(0, rows * r * 14, rows * r * 10));
    // looks
    const op = look.opacity || {};
    const ac = look.accent || {};
    const gh = look.ghost || {};
    for (const a of ASSEMBLIES) {
      // instanced assemblies light only the working instance (instance colour); the rest light as a whole
      const perInstance = a === 'keys' || a === 'levers' || a === 'linkage' || a === 'typebars';
      // large castings take a gentler accent so a moving carriage reads as warm, not as a brass block
      const weight = a === 'carriage' || a === 'platen' || a === 'frame' ? 0.35 : 1;
      mats.setGroupLook(MAT_OF(a), {opacity: op[a] ?? 1, accent: perInstance ? 0 : (ac[a] ?? 0) * weight * (1 - (gh[a] ?? 0)), ghost: gh[a] ?? 0});
    }
    // fully cut assemblies are hidden (no draw at all)
    for (const n of nodes.frameSides) n.visible = (op.frameSides ?? 1) > 0.02;
    for (const n of nodes.hood) n.visible = (op.hood ?? 1) > 0.02;
  }
  /** warm-up helper: every material transparent (true) or back to its own setting (false) */
  const setAllGhost = (on) => {
    for (const a of ASSEMBLIES) mats.setGroupLook(MAT_OF(a), {opacity: on ? 0.5 : 1});
  };
  return {root, nodes, mats, update, setAllGhost, parts: {frame, keys, basket, ribbon, carriage, rear}};
}
