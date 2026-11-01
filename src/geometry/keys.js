// Keyboard and linkage: glass-topped keys in nickel rims on stems, the key levers to the rear fulcrum, the sublevers,
// the wire links up to each typebar heel, the space bar on its arms, the shift keys with their rocking shaft and lift
// rods, the backspace lever and link. Repeated parts are instanced; every pose comes from model state through
// kinematics.js.
import * as THREE from 'three';
import {CHAR_KEYS, FN, FN_KEYS} from '../keyboard.js';
import {BODY, CARRIAGE, KEYS} from '../params.js';
import {barPose, keyLever, link, sublever} from '../kinematics.js';
import {boxGeo, canvasTex, cylGeo, mesh, rodMatrix, rodBetween} from './util.js';

const CELL = 8; // legend atlas: 8 × 8 cells
const ALL_KEYS = [...CHAR_KEYS, ...FN_KEYS];
const D2R = Math.PI / 180;

function legendAtlas() {
  const S = 1024;
  const c = S / CELL;
  return canvasTex(
    S,
    S,
    (g) => {
      g.fillStyle = '#e9e1cb';
      g.fillRect(0, 0, S, S);
      ALL_KEYS.forEach((k, i) => {
        const cx = (i % CELL) * c + c / 2;
        const cy = Math.floor(i / CELL) * c + c / 2;
        // cream legend card with a fine dark ring printed near the rim
        const gr = g.createRadialGradient(cx - 10, cy - 14, 6, cx, cy, c / 2);
        gr.addColorStop(0, '#f6f0de');
        gr.addColorStop(1, '#ddd2b5');
        g.fillStyle = gr;
        g.fillRect(cx - c / 2, cy - c / 2, c, c);
        g.strokeStyle = 'rgba(40,34,26,.55)';
        g.lineWidth = 2.2;
        g.beginPath();
        g.arc(cx, cy, c * 0.43, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#17140f';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        if (k.kind === 'fn') {
          g.font = `700 ${k.label.length > 4 ? 19 : 22}px Inter`;
          if ('letterSpacing' in g) g.letterSpacing = '1px';
          g.fillText(k.label, cx, cy + 1);
          return;
        }
        if ('letterSpacing' in g) g.letterSpacing = '0px';
        const letter = /[a-z]/.test(k.lo);
        if (letter) {
          g.font = '700 56px Inter';
          g.fillText(k.up, cx, cy + 3);
        } else {
          g.font = '700 38px Inter';
          g.fillText(k.up, cx, cy - 20);
          g.fillText(k.lo, cx, cy + 22);
        }
      });
    },
    {anisotropy: 8},
  );
}

/** a material whose map reads one atlas cell per instance */
function atlasMaterial(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec2 aCell;\nvoid main() {')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vMapUv * ${(1 / CELL).toFixed(6)} + aCell;\n#endif`);
  };
  mat.customProgramCacheKey = () => 'keycap-atlas';
  return mat;
}

export function buildKeys(mats, nodes) {
  const {m} = mats;
  const keysG = new THREE.Group();
  keysG.name = 'keys';
  nodes.keys.push(keysG);
  // each key row is its own node so an explode can lift the rows apart in order
  const rowNodes = [0, 1, 2, 3].map((r) => {
    const g = new THREE.Group();
    g.name = `keyrow${r}`;
    keysG.add(g);
    return g;
  });
  const N = ALL_KEYS.length;

  // ------------------------------------------------------------ caps, rims, stems (instanced per row)
  const atlas = legendAtlas();
  const capMat = atlasMaterial(m('keys', 'keyCap', {key: 'atlas', map: atlas}));
  const rimMat = m('keys', 'nickel');
  const stemMat = m('keys', 'darkSteel');
  const capGeo = new THREE.CircleGeometry(KEYS.capR, 32);
  capGeo.rotateX(-Math.PI / 2);
  const rimGeo = (() => {
    const pts = [
      new THREE.Vector2(KEYS.capR - 0.2, 0.15),
      new THREE.Vector2(KEYS.rimR, 0.2),
      new THREE.Vector2(KEYS.rimR + 0.15, -0.6),
      new THREE.Vector2(KEYS.rimR - 0.25, -KEYS.capH),
      new THREE.Vector2(KEYS.stemR + 1.2, -KEYS.capH - 0.8),
    ];
    return new THREE.LatheGeometry(pts, 32);
  })();
  const stemGeo = cylGeo(KEYS.stemR, KEYS.stemR, 1, 10);
  const perRow = rowNodes.map((node, r) => {
    const list = ALL_KEYS.filter((k) => k.row === r);
    const cell = new Float32Array(list.length * 2);
    list.forEach((k, j) => {
      const i = ALL_KEYS.indexOf(k);
      cell[j * 2] = (i % CELL) / CELL;
      cell[j * 2 + 1] = 1 - (Math.floor(i / CELL) + 1) / CELL;
    });
    const cg = capGeo.clone();
    cg.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
    const caps = new THREE.InstancedMesh(cg, capMat, list.length);
    const rims = new THREE.InstancedMesh(rimGeo, rimMat, list.length);
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, list.length);
    for (const im of [caps, rims, stems]) {
      im.castShadow = true;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      node.add(im);
    }
    caps.userData.keys = list;
    rims.setColorAt(0, new THREE.Color('#ffffff'));
    return {list, caps, rims, stems};
  });

  // ------------------------------------------------------------ key levers, sublevers, links (instanced)
  const levG = new THREE.Group();
  levG.name = 'levers';
  nodes.levers.push(levG);
  const linkG = new THREE.Group();
  linkG.name = 'linkage';
  nodes.linkage.push(linkG);
  const nC = CHAR_KEYS.length;
  const leverGeo = boxGeo(KEYS.leverW, KEYS.leverH, 1);
  const levers = new THREE.InstancedMesh(leverGeo, m('levers', 'darkSteel'), nC);
  const subGeo = boxGeo(2.0, 4.2, KEYS.sublever.arm);
  const subs = new THREE.InstancedMesh(subGeo, m('linkage', 'steel'), nC);
  const links = new THREE.InstancedMesh(cylGeo(0.75, 0.75, 1, 6), m('linkage', 'steel'), nC);
  for (const im of [levers, subs, links]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < nC; i++) im.setColorAt(i, new THREE.Color('#ffffff'));
  }
  levG.add(levers);
  linkG.add(subs, links);
  // sublever combs (one per row, where the lugs are)
  const combMat = m('linkage', 'ironInner');
  for (let r = 0; r < 4; r++) {
    const k = CHAR_KEYS.find((x) => x.row === r);
    const s = sublever(k, 0);
    mesh(boxGeo(250, 4, 5), combMat, [0, s.pivot[1] - 4, s.pivot[2]], null, linkG);
  }

  // ------------------------------------------------------------ space bar
  const spG = new THREE.Group();
  spG.name = 'spacebar';
  nodes.spacebar.push(spG);
  const SB = KEYS.spacebar;
  const sbBar = mesh(boxGeo(SB.w, 5, 9, 2.4), m('spacebar', 'iron'), [0, SB.y, SB.z], null, spG);
  const sbArms = [-1, 1].map((s) => mesh(boxGeo(3, 1, 4), m('spacebar', 'darkSteel'), null, null, spG));
  const SHAFT = [0, 26, 132];
  mesh(cylGeo(2, 2, 2 * 175, 10), m('spacebar', 'steel'), SHAFT, [0, 0, Math.PI / 2], spG);
  const sbLink = mesh(cylGeo(1, 1, 1, 8), m('spacebar', 'steel'), null, null, spG);

  // ------------------------------------------------------------ shift: key levers, rocking shaft, lift rods
  const shG = new THREE.Group();
  shG.name = 'shift';
  nodes.shift.push(shG);
  const shLevers = ['shiftL', 'shiftR', 'lock'].map(() => mesh(boxGeo(KEYS.leverW + 0.6, KEYS.leverH, 1), m('shift', 'darkSteel'), null, null, shG));
  const SHIFT_SHAFT = [0, 24, -40];
  mesh(cylGeo(2.6, 2.6, 2 * 176, 12), m('shift', 'steel'), SHIFT_SHAFT, [0, 0, Math.PI / 2], shG);
  const liftRods = [-1, 1].map(() => mesh(cylGeo(2.2, 2.2, 1, 10), m('shift', 'steel'), null, null, shG));
  const liftArms = [-1, 1].map(() => mesh(boxGeo(3, 1, 5), m('shift', 'darkSteel'), null, null, shG));

  // ------------------------------------------------------------ backspace: key lever, bell crank, link to the pawl
  const bsG = new THREE.Group();
  bsG.name = 'backspace';
  nodes.backspace.push(bsG);
  const bsLever = mesh(boxGeo(KEYS.leverW + 0.6, KEYS.leverH, 1), m('backspace', 'darkSteel'), null, null, bsG);
  const bsLink = mesh(cylGeo(1.1, 1.1, 1, 8), m('backspace', 'steel'), null, null, bsG);
  const bsPawl = mesh(boxGeo(6, 10, 4), m('backspace', 'steel'), null, null, bsG);
  const mrLever = mesh(boxGeo(KEYS.leverW + 0.6, KEYS.leverH, 1), m('keys', 'darkSteel'), null, null, keysG);

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const P = new THREE.Vector3();
  const Sc = new THREE.Vector3();
  const E = new THREE.Euler();
  const C_BASE = new THREE.Color('#ffffff');
  const C_ACC = new THREE.Color('#e0b062');
  const leverPose = (obj, key, depth, extraW = 0) => {
    const L = keyLever(key, depth);
    const len = key.z - KEYS.fulcrumZ;
    obj.position.set(key.x, KEYS.leverY - KEYS.leverH / 2 - (len / 2) * Math.sin(L.ang), KEYS.fulcrumZ + (len / 2) * Math.cos(L.ang));
    obj.rotation.set(L.ang, 0, 0);
    obj.scale.set(1, 1, len);
    void extraW;
  };

  /** depth (mm) of every key for a state */
  const depthOf = (s, k) => {
    if (k.kind === 'char') return k.id === s.activeKey ? s.keyDepth : 0;
    // the shift keys sit down exactly as far as the subcarriage is lifted (held or locked)
    if (k.id === 'shiftL' || k.id === 'shiftR') return s.shift * KEYS.travel * 0.8;
    if (k.id === 'lock') return (s.action === 'lock' ? s.lockKey : s.lock ? 1 : 0) * KEYS.travel * 0.45;
    if (k.id === 'back') return s.backDepth;
    if (k.id === 'mrel') return s.releaseKey * KEYS.travel * 0.7;
    return 0;
  };

  function update(s, look) {
    // caps / rims / stems
    for (const row of perRow) {
      row.list.forEach((k, j) => {
        const d = depthOf(s, k);
        P.set(k.x, k.y - d, k.z);
        M.makeTranslation(P.x, P.y, P.z);
        row.caps.setMatrixAt(j, M);
        row.rims.setMatrixAt(j, M);
        const stemTop = k.y - d - KEYS.capH;
        const stemBot = KEYS.leverY - d;
        rodMatrix([k.x, stemTop, k.z], [k.x, stemBot, k.z], 1, M);
        row.stems.setMatrixAt(j, M);
        const hot = look.accentKeys && ((k.kind === 'char' && k.id === s.activeKey && s.keyDepth > 0.05) || (k.kind === 'fn' && d > 0.05));
        row.rims.setColorAt(j, hot ? C_ACC : C_BASE);
      });
      row.caps.instanceMatrix.needsUpdate = true;
      row.rims.instanceMatrix.needsUpdate = true;
      row.stems.instanceMatrix.needsUpdate = true;
      row.rims.instanceColor.needsUpdate = true;
    }
    // levers, sublevers, links
    for (const k of CHAR_KEYS) {
      const active = k.id === s.activeKey;
      const d = active ? s.keyDepth : 0;
      const kk = active ? s.sublever : 0;
      const L = keyLever(k, d);
      const len = k.z - KEYS.fulcrumZ;
      E.set(L.ang, 0, 0);
      Q.setFromEuler(E);
      P.set(k.x, KEYS.leverY - KEYS.leverH / 2 - (len / 2) * Math.sin(L.ang), KEYS.fulcrumZ + (len / 2) * Math.cos(L.ang));
      Sc.set(1, 1, len);
      M.compose(P, Q, Sc);
      levers.setMatrixAt(k.id, M);
      const sl = sublever(k, kk);
      E.set(sl.ang, 0, 0);
      Q.setFromEuler(E);
      const arm = KEYS.sublever.arm;
      P.set(k.x, sl.pivot[1] - (arm / 2) * Math.sin(sl.ang), sl.pivot[2] + (arm / 2) * Math.cos(sl.ang));
      Sc.set(1, 1, 1);
      M.compose(P, Q, Sc);
      subs.setMatrixAt(k.id, M);
      const bar = active ? s.barDeg : look.restDeg(k.slot);
      const ln = link(k, kk, bar);
      rodMatrix(ln.a, ln.b, 1, M);
      links.setMatrixAt(k.id, M);
      const hot = look.accentLinkage && active && s.keyDepth > 0.05;
      levers.setColorAt(k.id, hot ? C_ACC : C_BASE);
      subs.setColorAt(k.id, hot ? C_ACC : C_BASE);
      links.setColorAt(k.id, hot ? C_ACC : C_BASE);
    }
    for (const im of [levers, subs, links]) {
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }

    // space bar: rotates about its shaft
    const sd = s.spaceDepth;
    const armLen = SB.z - SHAFT[2];
    const ang = Math.asin(Math.min(1, sd / armLen));
    sbBar.position.set(0, SB.y - sd, SHAFT[2] + armLen * Math.cos(ang));
    sbArms.forEach((a, i) => {
      const x = (i ? 1 : -1) * (SB.w / 2 - 22);
      rodBetween(a, [x, SHAFT[1], SHAFT[2]], [x, SB.y - sd - 3, SHAFT[2] + armLen * Math.cos(ang)], 1);
      a.scale.set(1, a.scale.y, 1);
    });
    // link from the space bar shaft arm, up the right side, to the universal-bar shaft
    rodBetween(sbLink, [176, SHAFT[1] + 14 - sd * 0.4, SHAFT[2]], [76, 166 - s.ub * 1.2, -98], 1);

    // shift: key levers to the rocking shaft, the shaft's arms push the lift rods up by the shift travel
    const shiftDepth = Math.max(depthOf(s, FN.shiftL), depthOf(s, FN.shiftR));
    ['shiftL', 'shiftR', 'lock'].forEach((id, i) => {
      const k = FN[id];
      const d = id === 'lock' ? depthOf(s, k) : shiftDepth;
      const len = k.z - SHIFT_SHAFT[2];
      const a = Math.asin(Math.min(1, d / len));
      const o = shLevers[i];
      o.position.set(k.x, KEYS.leverY - 4 - (len / 2) * Math.sin(a), SHIFT_SHAFT[2] + (len / 2) * Math.cos(a));
      o.rotation.set(a, 0, 0);
      o.scale.set(1, 1, len);
    });
    liftRods.forEach((r, i) => {
      const x = (i ? 1 : -1) * 176;
      rodBetween(r, [x, 40 + s.shiftMM, -92], [x, CARRIAGE.railY - 6 + s.shiftMM, -92], 1);
    });
    liftArms.forEach((r, i) => {
      const x = (i ? 1 : -1) * 176;
      rodBetween(r, [x, SHIFT_SHAFT[1], SHIFT_SHAFT[2]], [x, 40 + s.shiftMM, -92], 1);
    });

    // backspace: lever to the rear, link up the right side to the pawl at the rack
    const bk = FN.back;
    {
      const len = bk.z - KEYS.fulcrumZ;
      const a = Math.asin(Math.min(1, s.backDepth / len));
      bsLever.position.set(bk.x, KEYS.leverY - 4 - (len / 2) * Math.sin(a), KEYS.fulcrumZ + (len / 2) * Math.cos(a));
      bsLever.rotation.set(a, 0, 0);
      bsLever.scale.set(1, 1, len);
      const carried = (s.col0 ?? 0) * 0; // the pawl travels with the rack while engaged
      void carried;
      const px = 34 + look.backPawlX;
      bsPawl.position.set(px, 180 + s.backPawl * 6, -104);
      rodBetween(bsLink, [bk.x, KEYS.leverY - 2 - s.backDepth * 0.7, KEYS.fulcrumZ - 6], [px, 175 + s.backPawl * 6, -104], 1);
    }
    {
      const k = FN.mrel;
      const len = k.z - KEYS.fulcrumZ;
      const a = Math.asin(Math.min(1, depthOf(s, k) / len));
      mrLever.position.set(k.x, KEYS.leverY - 4 - (len / 2) * Math.sin(a), KEYS.fulcrumZ + (len / 2) * Math.cos(a));
      mrLever.rotation.set(a, 0, 0);
      mrLever.scale.set(1, 1, len);
    }
  }

  return {keysG, rowNodes, levG, linkG, spG, shG, bsG, update, perRow, levers, D2R};
}
export {barPose};
