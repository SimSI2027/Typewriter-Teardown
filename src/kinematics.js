// Pure 3D kinematics of the linkage, shared by the geometry, the callouts, the schematic and the tests. Millimetres,
// machine coordinates (see params.js). No three.js.
import {CHAR_KEYS, slotDeg} from './keyboard.js';
import {BASKET, KEYS, PRINT, RIBBON, ESC, CARRIAGE, PLATEN} from './params.js';
import {LINK_PULL, lugZ} from './model.js';

const D2R = Math.PI / 180;
export const PRINT_POINT = [0, PRINT.y, 0];
export const SEG_Y = PRINT.y - BASKET.segDrop;

/** a typebar at elevation deg (from outward horizontal, in its own radial plane) */
export function barPose(slot, deg) {
  const ph = slotDeg(slot) * D2R;
  const u = [Math.sin(ph), 0, Math.cos(ph)];
  const a = deg * D2R;
  const dir = [Math.cos(a) * u[0], Math.sin(a), Math.cos(a) * u[2]];
  const pivot = [BASKET.segR * u[0], SEG_Y, BASKET.segR * u[2]];
  const L = BASKET.L;
  return {
    u,
    dir,
    pivot,
    axis: [Math.cos(ph), 0, -Math.sin(ph)], // swing axis, normal to the bar's radial plane
    tip: [pivot[0] + L * dir[0], pivot[1] + L * dir[1], pivot[2] + L * dir[2]],
    heel: [pivot[0] - BASKET.heelArm * dir[0], pivot[1] - BASKET.heelArm * dir[1], pivot[2] - BASKET.heelArm * dir[2]],
    phi: ph,
    a,
  };
}
/** centre of the lower-case character on the slug face */
export const slugFace = (slot, deg) => barPose(slot, deg).tip;

/** key top centre for a character key at dip depth (mm) */
export const keyTop = (key, depth = 0) => [key.x, key.y - depth, key.z];

/** key lever: from the fulcrum (rear) to under the key, rotated by the dip */
export function keyLever(key, depth = 0) {
  const len = key.z - KEYS.fulcrumZ;
  const ang = Math.asin(Math.min(1, depth / len));
  const front = [key.x, KEYS.leverY - len * Math.sin(ang), KEYS.fulcrumZ + len * Math.cos(ang)];
  return {fulcrum: [key.x, KEYS.fulcrumY + (KEYS.leverY - KEYS.fulcrumY), KEYS.fulcrumZ], front, ang};
}

/** sublever: pivoted 22 mm behind its lug; the lug end is pressed down LINK_PULL × k */
export function sublever(key, k = 0) {
  const lz = lugZ(key.row);
  const y0 = KEYS.leverY + 2.2;
  const arm = KEYS.sublever.arm;
  const drop = LINK_PULL * k;
  const ang = Math.asin(Math.min(1, drop / arm));
  return {pivot: [key.x, y0, lz - arm], end: [key.x, y0 - arm * Math.sin(ang), lz - arm + arm * Math.cos(ang)], ang};
}

/** the wire link from the sublever end to the typebar heel */
export function link(key, k, barDeg) {
  const s = sublever(key, k);
  const b = barPose(key.slot, barDeg);
  return {a: s.end, b: b.heel};
}

/** ribbon centre-line at the printing point (lifted) */
export const ribbonTop = (lift) => PRINT.y + RIBBON.restTop + lift;

/** escapement rack pitch line (under the carriage) meshes with the pinion on the escapement shaft */
export const RACK_Y = ESC.axisY + ESC.pinionR;

/** platen axis in machine coordinates for a carriage column position and shift */
export const platenAxis = (colPos, shiftMM) => [CARRIAGE.x(colPos), PRINT.y + shiftMM, PLATEN.z];

export const keyById = (id) => CHAR_KEYS[id];
