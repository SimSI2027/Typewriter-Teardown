// The typebar basket: the slotted segment (an arc of pivots about the printing point), 42 typebars with two-character
// slugs, the felt typebar rest, the universal bar on its frame arms, the type guide and the ribbon vibrator.
// Typebar poses come from kinematics.barPose — the same function the tests check against the printing point.
import * as THREE from 'three';
import {BASKET, PRINT, RIBBON} from '../params.js';
import {barPose, SEG_Y} from '../kinematics.js';
import {STRIKE_DEG} from '../model.js';
import {boxGeo, canvasTex, cylGeo, extrudeOutline, mesh, rodBetween} from './util.js';
import {CHAR_KEYS, SLOT_KEY} from '../keyboard.js';

const D2R = Math.PI / 180;
const arcBand = (r0, r1, a0, a1, n = 48) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    pts.push([r1 * Math.sin(a), -r1 * Math.cos(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (a0 + ((a1 - a0) * i) / n) * D2R;
    pts.push([r0 * Math.sin(a), -r0 * Math.cos(a)]);
  }
  return pts;
};

/** slug face texture strip: every slug's two characters (used as a tiny map on the slug face) */
function slugAtlas() {
  return canvasTex(
    1024,
    64,
    (g, w, h) => {
      g.fillStyle = '#b9bcc0';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a2c30';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 22px "JetBrains Mono"';
      for (let i = 0; i < 42; i++) {
        const k = CHAR_KEYS[SLOT_KEY[i]];
        const cx = (i + 0.5) * (w / 42);
        g.fillText(k.up, cx, h * 0.27);
        g.fillText(k.lo, cx, h * 0.75);
      }
    },
    {anisotropy: 4},
  );
}

export function buildBasket(mats, nodes) {
  const {m} = mats;
  // ------------------------------------------------------------ segment, pivot wire, typebar rest
  const segG = new THREE.Group();
  segG.name = 'segment';
  nodes.segment.push(segG);
  const span = BASKET.span + 7;
  const seg = mesh(extrudeOutline(arcBand(BASKET.segR - 7, BASKET.segR + 4, -span, span), 13, [], 0.8, 4), m('segment', 'iron'), [0, SEG_Y, 0], [-Math.PI / 2, 0, 0], segG);
  void seg;
  // the fulcrum wire through every pivot
  const wire = new THREE.TorusGeometry(BASKET.segR, 0.9, 6, 96, 2 * span * D2R);
  const w = mesh(wire, m('segment', 'steel'), [0, SEG_Y, 0], [Math.PI / 2, 0, (90 - span) * D2R], segG);
  void w;
  // felt rest under the slugs' rest positions, on a thin bracket arc
  const restR = BASKET.segR + BASKET.L * Math.cos(BASKET.restDeg * D2R);
  const restY = SEG_Y + BASKET.L * Math.sin(BASKET.restDeg * D2R) - BASKET.barH / 2 - 2.6;
  mesh(extrudeOutline(arcBand(restR - 12, restR + 2, -span, span), 3, [], 0.4, 4), m('segment', 'felt'), [0, restY, 0], [-Math.PI / 2, 0, 0], segG);
  mesh(extrudeOutline(arcBand(restR - 14, restR - 10, -span, span), 4, [], 0.3, 4), m('segment', 'ironInner'), [0, restY - 3.2, 0], [-Math.PI / 2, 0, 0], segG);

  // ------------------------------------------------------------ typebars and slugs (instanced, 42)
  const tbG = new THREE.Group();
  tbG.name = 'typebars';
  nodes.typebars.push(tbG);
  const L = BASKET.L;
  const barLen = L + BASKET.heelArm - BASKET.slugT * 0.5;
  const barGeo = boxGeo(barLen, BASKET.barH, BASKET.barT);
  barGeo.translate(barLen / 2 - BASKET.heelArm, 0, 0); // local x from the heel (−heelArm) to just behind the slug
  const bars = new THREE.InstancedMesh(barGeo, m('typebars', 'steel'), 42);
  const slugGeo = new THREE.BoxGeometry(BASKET.slugW, BASKET.slugLen, BASKET.slugT);
  // face on −z; move so the lower-case character centre sits at the local origin (upper one 5 mm above)
  slugGeo.translate(0, BASKET.charSep / 2, BASKET.slugT / 2);
  // per-instance UVs on the face: shift each slug to its own atlas cell
  const cell = new Float32Array(42 * 2);
  for (let i = 0; i < 42; i++) {
    cell[i * 2] = i / 42;
    cell[i * 2 + 1] = 0;
  }
  slugGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 2));
  const slugMat = m('typebars', 'nickel', {key: 'slug', map: slugAtlas()});
  slugMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute vec2 aCell;\nvoid main() {')
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = vec2(vMapUv.x * ${(1 / 42).toFixed(6)} + aCell.x, vMapUv.y);\n#endif`);
  };
  slugMat.customProgramCacheKey = () => 'slug-atlas';
  const slugs = new THREE.InstancedMesh(slugGeo, slugMat, 42);
  for (const im of [bars, slugs]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 42; i++) im.setColorAt(i, new THREE.Color('#ffffff'));
    tbG.add(im);
  }

  // ------------------------------------------------------------ universal bar on its frame arms and rear shaft
  const ubG = new THREE.Group();
  ubG.name = 'ubar';
  nodes.ubar.push(ubG);
  const UB_R = BASKET.segR + 9;
  const UB_Y = SEG_Y - 7;
  const ubSpan = 74;
  const ubBlade = new THREE.Group();
  ubG.add(ubBlade);
  mesh(extrudeOutline(arcBand(UB_R - 1.2, UB_R + 1.2, -ubSpan, ubSpan, 40), 5, [], 0.3, 4), m('ubar', 'steel'), [0, UB_Y, 0], [-Math.PI / 2, 0, 0], ubBlade);
  const UB_SHAFT = [0, 166, -98];
  mesh(cylGeo(2.2, 2.2, 160, 12), m('ubar', 'steel'), UB_SHAFT, [0, 0, Math.PI / 2], ubG);
  const ubArms = [-1, 1].map(() => mesh(boxGeo(3, 1, 4), m('ubar', 'darkSteel'), null, null, ubG));
  const ubEnds = [-1, 1].map((s) => [s * UB_R * Math.sin(ubSpan * D2R), UB_Y, UB_R * Math.cos(ubSpan * D2R)]);
  // the rocker arm on the shaft that presses the escapement trip screw
  const trip = mesh(boxGeo(4, 22, 4), m('ubar', 'darkSteel'), null, null, ubG);

  // ------------------------------------------------------------ type guide and ribbon vibrator
  const vbG = new THREE.Group();
  vbG.name = 'vibrator';
  nodes.vibrator.push(vbG);
  // type guide: a small fork just below the printing line that centres the slug at impact
  const guide = new THREE.Group();
  vbG.add(guide);
  for (const s of [-1, 1]) mesh(boxGeo(1.6, 9, 3), m('vibrator', 'nickel'), [s * 3.2, PRINT.y - 9.5, 4.6], null, guide);
  mesh(boxGeo(16, 3, 3), m('vibrator', 'nickel'), [0, PRINT.y - 15, 4.6], null, guide);
  mesh(boxGeo(4, 22, 3), m('vibrator', 'ironInner'), [0, PRINT.y - 27, 6], null, guide);
  // vibrator: the ribbon carrier rides up and down in front of the paper
  const vib = new THREE.Group();
  vbG.add(vib);
  const ribBot = PRINT.y + RIBBON.restTop - RIBBON.width;
  for (const s of [-1, 1]) {
    mesh(boxGeo(1.4, RIBBON.width + 5, 2.2), m('vibrator', 'nickel'), [s * 11, ribBot + RIBBON.width / 2, RIBBON.z + 1.6], null, vib);
    mesh(boxGeo(3.5, 1.2, 3.2), m('vibrator', 'nickel'), [s * 11, ribBot - 2.2, RIBBON.z + 1], null, vib);
  }
  mesh(boxGeo(24, 1.4, 2.2), m('vibrator', 'nickel'), [0, ribBot - 2.9, RIBBON.z + 1.6], null, vib);
  const vibStem = mesh(boxGeo(2.4, 1, 2.4), m('vibrator', 'steel'), null, null, vbG);
  const vibLever = mesh(boxGeo(3, 1, 3), m('vibrator', 'darkSteel'), null, null, vbG);
  const VIB_PIVOT = [0, 192, 26];

  const M = new THREE.Matrix4();
  const Mb = new THREE.Matrix4();
  const Ms = new THREE.Matrix4();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const P = new THREE.Vector3();
  const C_BASE = new THREE.Color('#ffffff');
  const C_ACC = new THREE.Color('#e3b366');
  // the slug's orientation at impact is the world frame (face −z, characters upright); at any other angle it is
  // carried round by the bar: R_slug(a) = R_bar(a) · R_bar(strike)⁻¹
  const barBasis = (b, out) => {
    X.set(b.dir[0], b.dir[1], b.dir[2]);
    Z.set(b.axis[0], b.axis[1], b.axis[2]);
    Y.crossVectors(Z, X);
    return out.makeBasis(X, Y, Z);
  };
  const strikeInv = [];
  for (let i = 0; i < 42; i++) strikeInv.push(barBasis(barPose(i, STRIKE_DEG), new THREE.Matrix4()).invert());

  function update(s, look) {
    for (let i = 0; i < 42; i++) {
      const deg = i === s.slot ? s.barDeg : look.restDeg(i);
      const b = barPose(i, deg);
      barBasis(b, Mb);
      M.copy(Mb).setPosition(b.pivot[0], b.pivot[1], b.pivot[2]);
      bars.setMatrixAt(i, M);
      Ms.multiplyMatrices(Mb, strikeInv[i]);
      Ms.setPosition(b.tip[0], b.tip[1], b.tip[2]);
      slugs.setMatrixAt(i, Ms);
      const hot = look.accentBars && i === s.slot && s.barDeg > BASKET.restDeg + 1;
      bars.setColorAt(i, hot ? C_ACC : C_BASE);
      slugs.setColorAt(i, hot ? C_ACC : C_BASE);
    }
    for (const im of [bars, slugs]) {
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor.needsUpdate = true;
    }
    // universal bar: pushed out by the heel near the end of the stroke (ub 0..1 → 2.6 mm)
    const ubT = s.ub * 2.6;
    ubBlade.position.set(0, 0, ubT);
    ubArms.forEach((a, k) => {
      const e = ubEnds[k];
      rodBetween(a, [e[0], e[1], e[2] + ubT], [e[0] * 0.9, UB_SHAFT[1], UB_SHAFT[2]], 1);
    });
    const tilt = Math.atan2(ubT, 100);
    trip.position.set(0, UB_SHAFT[1] - 11 * Math.cos(tilt), UB_SHAFT[2] - 11 * Math.sin(tilt) - 0.5);
    trip.rotation.set(-tilt, 0, 0);
    // vibrator
    vib.position.set(0, s.ribbonLift, 0);
    rodBetween(vibStem, [0, ribBot - 3 + s.ribbonLift, RIBBON.z + 2.5], [0, VIB_PIVOT[1] + 2, 8], 1);
    const la = Math.atan2(s.ribbonLift * 0.6, 18);
    rodBetween(vibLever, [0, VIB_PIVOT[1] + 2, 8], [0, VIB_PIVOT[1] - Math.sin(la) * 18, VIB_PIVOT[2] + 4], 1);
  }
  return {segG, tbG, ubG, vbG, update, bars, slugs};
}
