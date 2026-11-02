// The carriage: end plates and tie rods riding the two rails, the escapement rack under it, the margin rack with its
// two stops at the rear; and the subcarriage that lifts for upper case: platen, knobs, the 28-tooth line-space
// ratchet, feed rolls, paper table, paper bail, front scale, the sheet of paper (wrapped round the platen, fed by the
// platen's rotation), the carriage-return / line-space lever, its pawl and the spacing selector.
import * as THREE from 'three';
import {CARRIAGE, ESC, LINE, PAPER, PITCH, PLATEN, PRINT} from '../params.js';
import {RACK_Y} from '../kinematics.js';
import {boxGeo, canvasTex, cylGeo, extrudeOutline, gearGeo, mesh, roundRect} from './util.js';

const D2R = Math.PI / 180;
export const X_TRIP = -20; // bell trip on the frame (world x) the margin stops meet

/** paper path in the platen's (y,z) section, as a function of arc length s; the printing point is at s = S_PRINT */
const PR = PLATEN.r + 0.15;
const TABLE_A = 58 * D2R; // the paper table rises toward the rear at this angle
export const PAPER_PATH = (() => {
  // A: straight down the table into the rear-bottom tangent point; B: wrap under the platen to the front equator;
  // C: straight up past the bail, leaning back. The tangent point is where the circle's direction of travel matches
  // the table's forward-and-down direction: θ0 = −(90° + table angle).
  const lenA = 120;
  const wrap = Math.PI / 2 + TABLE_A;
  return {lenA, wrap, S_PRINT: lenA + wrap * PR, lean: 8 * D2R};
})();
/** (y, z) relative to the platen axis for arc length s along the sheet path */
export function paperPoint(s) {
  const {lenA, wrap, S_PRINT, lean} = PAPER_PATH;
  // angle θ about the axis measured from the front (z+), positive going up over the top… we go under: front = 0,
  // bottom = −90°, rear = −180°. The rear tangent point is at θ0 = −wrap.
  const th0 = -wrap;
  const tY = (th) => PR * Math.sin(th);
  const tZ = (th) => PR * Math.cos(th);
  if (s < lenA) {
    // along the tangent at θ0, heading backward and up away from the platen as s decreases
    const d = lenA - s;
    const y0 = tY(th0);
    const z0 = tZ(th0);
    // tangent direction of travel at θ0 (increasing θ): (cos θ, −sin θ) in (y, z)
    const ty = Math.cos(th0);
    const tz = -Math.sin(th0);
    return [y0 - d * ty, z0 - d * tz];
  }
  if (s < S_PRINT) {
    const th = th0 + (s - lenA) / PR;
    return [tY(th), tZ(th)];
  }
  const d = s - S_PRINT;
  return [d * Math.cos(lean), PR - d * Math.sin(lean)];
}

/**
 * the paper table: a plate under the incoming sheet, from just behind the platen up the paper's path. Returns its
 * tilt about x (its local z runs along the path, its local +y — the decal side — faces up and toward the operator),
 * its length and its centre (y, z relative to the platen axis).
 */
export function paperTable() {
  const [y0, z0] = paperPoint(PAPER_PATH.lenA - 20);
  const [y1, z1] = paperPoint(PAPER_PATH.lenA - 110);
  // rotating local z = (0,0,1) by θ about x gives (0, −sin θ, cos θ): parallel to the path (dy > 0, dz < 0) when
  // θ = atan2(dy, −dz). (The sign was inverted before the 2026-11 audit: the table crossed the sheet — D-02.)
  return {tilt: Math.atan2(y1 - y0, -(z1 - z0)), len: Math.hypot(y1 - y0, z1 - z0), mid: [(y0 + y1) / 2, (z0 + z1) / 2], from: [y0, z0], to: [y1, z1]};
}

export function buildCarriage(mats, nodes) {
  const {m} = mats;
  const move = new THREE.Group(); // carriage x travel (no explode on this node)
  move.name = 'carriageMove';
  const car = new THREE.Group();
  car.name = 'carriage';
  nodes.carriage.push(car);
  move.add(car);
  const half = CARRIAGE.frameLen / 2;
  const iron = m('carriage', 'iron');
  // end plates (profile z,y extruded along x)
  const plate = extrudeOutline(
    [
      [-142, CARRIAGE.railY - 4],
      [16, CARRIAGE.railY - 4],
      [18, 222],
      [6, 244],
      [-30, 250],
      [-60, 238],
      [-142, 224],
    ],
    6,
    [roundRect(-118, 210, -72, 226, 5)],
    0.8,
  );
  for (const s of [-1, 1]) mesh(plate, iron, [s * half, 0, 0], [0, -Math.PI / 2, 0], car);
  // tie rods and rail shoes
  mesh(cylGeo(3, 3, 2 * half, 12), m('carriage', 'steel'), [0, CARRIAGE.railY + 4, 10], [0, 0, Math.PI / 2], car);
  mesh(boxGeo(2 * half, 8, 8, 1.5), iron, [0, CARRIAGE.railY + 12, -138], null, car);
  for (const s of [-1, 1]) for (const rz of CARRIAGE.railZ) mesh(boxGeo(26, 7, 12, 2), m('carriage', 'darkSteel'), [s * (half - 30), CARRIAGE.railY + 5.5, rz], null, car);
  // front scale (alignment scale with column ticks)
  const scaleTex = canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#d9d6cc';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#25231f';
    const pxPerMM = w / (2 * half);
    for (let c = 0; c <= CARRIAGE.cols; c++) {
      // paper column c sits at carriage-local x = (c − 42) × pitch
      const x = (half + (c - 42) * PITCH) * pxPerMM;
      const big = c % 10 === 0;
      g.fillRect(x - 1, 0, 2, big ? 30 : c % 5 === 0 ? 20 : 12);
      if (big) {
        g.font = '600 22px Inter';
        g.textAlign = 'center';
        g.fillText(String(c), x, 54);
      }
    }
  });
  const scale = mesh(new THREE.PlaneGeometry(2 * half - 16, 7), m('carriage', 'decal', {key: 'scale', map: scaleTex}), [0, CARRIAGE.railY + 9, 14.4], [-0.35, 0, 0], car);
  scale.castShadow = false;

  // ------------------------------------------------------------ escapement rack under the carriage
  const rackG = new THREE.Group();
  rackG.name = 'rack';
  nodes.rack.push(rackG);
  car.add(rackG);
  const rackLen = 2 * (half - 24);
  const toothP = (ESC.wheelTeeth * PITCH) / ESC.pinionTeeth; // rack pitch = pinion circular pitch
  {
    const pts = [[-rackLen / 2, 6]];
    for (let x = -rackLen / 2; x < rackLen / 2 - toothP; x += toothP) {
      pts.push([x, 0], [x + toothP * 0.3, -2.6], [x + toothP * 0.6, -2.6], [x + toothP * 0.9, 0]);
    }
    pts.push([rackLen / 2, 0], [rackLen / 2, 6]);
    mesh(extrudeOutline(pts, 5, [], 0.2, 1), m('rack', 'steel'), [0, RACK_Y + 1.3, ESC.pinionZ], null, rackG);
    for (const s of [-1, 1]) mesh(boxGeo(5, CARRIAGE.railY + 6 - RACK_Y, 5), m('rack', 'darkSteel'), [s * (rackLen / 2 - 6), (CARRIAGE.railY + RACK_Y) / 2 + 4, ESC.pinionZ], null, rackG);
  }

  // ------------------------------------------------------------ margin rack and stops (move with the carriage)
  const marG = new THREE.Group();
  marG.name = 'margin';
  nodes.bell.push(marG);
  car.add(marG);
  mesh(boxGeo(2 * half - 40, 5, 6), m('bell', 'steel'), [0, CARRIAGE.railY + 20, -140], null, marG);
  const stopX = (col) => X_TRIP - CARRIAGE.x(col);
  const stops = ['L', 'R'].map((n) => {
    const g = new THREE.Group();
    marG.add(g);
    mesh(boxGeo(9, 12, 10, 1.5), m('bell', 'nickel'), [0, 0, 0], null, g);
    mesh(cylGeo(3, 3, 6, 12), m('bell', 'iron'), [0, 8, 0], null, g);
    g.position.set(stopX(n === 'L' ? CARRIAGE.leftMargin : CARRIAGE.rightMargin), CARRIAGE.railY + 16, -133);
    return g;
  });

  // ------------------------------------------------------------ subcarriage (lifts by the shift travel)
  const sub = new THREE.Group();
  sub.name = 'subcarriage';
  car.add(sub);
  const plG = new THREE.Group();
  plG.name = 'platen';
  nodes.platen.push(plG);
  sub.add(plG);
  const axisY = PRINT.y;
  const axisZ = PLATEN.z;
  const platen = new THREE.Group();
  platen.position.set(0, axisY, axisZ);
  plG.add(platen);
  mesh(cylGeo(PLATEN.r, PLATEN.r, PLATEN.length, 64), m('platen', 'rubber'), [0, 0, 0], [0, 0, Math.PI / 2], platen);
  mesh(cylGeo(4, 4, 2 * half + 2 * PLATEN.knobLen + 8, 14), m('platen', 'steel'), [0, 0, 0], [0, 0, Math.PI / 2], platen);
  // knobs: ribbed black discs with nickel caps
  for (const s of [-1, 1]) {
    const k = mesh(gearGeo(30, PLATEN.knobR, PLATEN.knobR - 1.2, PLATEN.knobLen, 0, 'spur'), m('platen', 'iron'), [s * (half + 8 + PLATEN.knobLen / 2), 0, 0], [0, Math.PI / 2, 0], platen);
    void k;
    mesh(cylGeo(PLATEN.knobR * 0.55, PLATEN.knobR * 0.55, 3, 24), m('platen', 'nickel'), [s * (half + 8 + PLATEN.knobLen + 1), 0, 0], [0, 0, Math.PI / 2], platen);
  }
  // the line-space ratchet: one tooth per single line (28)
  const ratchetX = -(PLATEN.length / 2 + 6);
  mesh(gearGeo(PLATEN.teeth, PLATEN.r + 3.5, PLATEN.r + 0.6, 4, 4, 'ratchet'), m('platen', 'steel'), [ratchetX, 0, 0], [0, Math.PI / 2, 0], platen);
  // a line on the platen so its rotation reads
  mesh(boxGeo(PLATEN.length - 6, 0.6, 1.2), m('platen', 'darkSteel'), [0, PLATEN.r - 0.15, 0], null, platen);
  // feed rolls under the platen
  const feedRolls = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * 62, axisY - PLATEN.r - 4.5, axisZ - 4 + s * 0);
    plG.add(g);
    mesh(cylGeo(4.5, 4.5, 60, 20), m('platen', 'rubber'), [0, 0, 0], [0, 0, Math.PI / 2], g);
    mesh(boxGeo(54, 0.5, 1), m('platen', 'darkSteel'), [0, 4.4, 0], null, g);
    return g;
  });
  // paper table rising behind the platen, with the gold name
  const tableTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#121214';
    g.fillRect(0, 0, w, h);
    g.font = 'italic 700 110px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 5;
    g.strokeStyle = '#6e5320';
    g.strokeText('Underwood', w / 2, h / 2 + 6);
    const gr = g.createLinearGradient(0, 60, 0, 190);
    gr.addColorStop(0, '#ead08a');
    gr.addColorStop(1, '#a9812f');
    g.fillStyle = gr;
    g.fillText('Underwood', w / 2, h / 2 + 6);
    g.strokeStyle = '#c9a24c';
    g.lineWidth = 3;
    g.strokeRect(12, 12, w - 24, h - 24);
  });
  {
    const tableW = 2 * half - 14;
    const tg = new THREE.Group();
    // table plane: from just behind the platen along the paper's incoming direction
    const {tilt, len, mid} = paperTable();
    tg.position.set(0, axisY + mid[0] - 1.6, axisZ + mid[1] - 1);
    tg.rotation.x = tilt;
    plG.add(tg);
    mesh(boxGeo(tableW, 2.4, len, 1), m('platen', 'iron'), [0, 0, 0], null, tg);
    const d = mesh(new THREE.PlaneGeometry(130, 32), m('platen', 'decal', {key: 'table', map: tableTex}), [0, 1.4, 0], [-Math.PI / 2, 0, 0], tg);
    d.castShadow = false;
    // arms down to the end plates
    for (const s of [-1, 1]) mesh(boxGeo(4, 4, len * 0.6), m('platen', 'iron'), [s * (tableW / 2 - 2), -4, len * 0.12], null, tg);
  }
  // paper bail: a rod with two rubber rollers in front of the platen, above the printing line
  const bailY = axisY + 20;
  const bailZ = axisZ + 22;
  mesh(cylGeo(1.8, 1.8, 2 * half - 20, 12), m('platen', 'nickel'), [0, bailY, bailZ], [0, 0, Math.PI / 2], plG);
  for (const s of [-1, 1]) {
    mesh(cylGeo(4.2, 4.2, 18, 18), m('platen', 'rubber'), [s * 56, bailY, bailZ], [0, 0, Math.PI / 2], plG);
    mesh(boxGeo(3, 3, 26), m('platen', 'nickel'), [s * (half - 12), bailY - 6, bailZ - 12], [0.55, 0, 0], plG);
  }

  // ------------------------------------------------------------ paper (strip mesh following the path; text texture)
  const paG = new THREE.Group();
  paG.name = 'paper';
  nodes.paper.push(paG);
  plG.add(paG);
  const PW = PAPER.width;
  const NS = 140;
  const pgeo = new THREE.BufferGeometry();
  const ppos = new Float32Array((NS + 1) * 2 * 3);
  const puv = new Float32Array((NS + 1) * 2 * 2);
  const pidx = [];
  for (let i = 0; i < NS; i++) {
    const a = i * 2;
    pidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  pgeo.setIndex(pidx);
  pgeo.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
  pgeo.setAttribute('uv', new THREE.BufferAttribute(puv, 2));
  // the sheet's text: one canvas, redrawn only when the printed glyphs change
  const PXMM = 7;
  const paperTex = canvasTex(Math.round(PW * PXMM), Math.round(PAPER.length * PXMM), (g, w, h) => {
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, w, h);
  });
  paperTex.anisotropy = 8;
  const paperMat = m('paper', 'paper', {key: 'sheet', map: paperTex});
  const sheet = new THREE.Mesh(pgeo, paperMat);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  sheet.frustumCulled = false;
  sheet.userData.noCollide = true; // a curved strip: its box says nothing about contact (tests)
  paG.add(sheet);
  // paper left edge in carriage coordinates
  const paperX0 = (PAPER.leftEdgeCol - 42) * PITCH - PITCH / 2;
  let lastFeed = NaN;
  let lastSig = '';

  // ------------------------------------------------------------ carriage return / line space lever (left end)
  const retG = new THREE.Group();
  retG.name = 'return';
  nodes.return.push(retG);
  sub.add(retG);
  const lev = new THREE.Group();
  lev.position.set(-half - 9, axisY + 18, axisZ + 6);
  retG.add(lev);
  mesh(cylGeo(4, 4, 8, 14), m('return', 'nickel'), [0, 0, 0], null, lev);
  {
    // the lever arm sweeps forward and out to the left, a flat nickel handle at the end
    const arm = new THREE.Group();
    lev.add(arm);
    mesh(boxGeo(4, 3.2, 74, 1.2), m('return', 'nickel'), [-16, 2, 34], [0, -0.42, 0], arm);
    mesh(boxGeo(10, 5, 22, 2.2), m('return', 'nickel'), [-33, 3, 70], [0, -0.42, 0], arm);
  }
  // line-space pawl riding a plunger above the ratchet
  const pawl = mesh(boxGeo(3, 3, 12, 0.8), m('return', 'steel'), null, null, retG);
  // spacing selector (three positions)
  const spSel = new THREE.Group();
  spSel.position.set(-half - 2, axisY + 30, axisZ - 18);
  retG.add(spSel);
  mesh(boxGeo(3, 14, 3, 1), m('return', 'nickel'), [0, 7, 0], null, spSel);
  mesh(cylGeo(3, 3, 4, 12), m('return', 'iron'), [0, 14, 0], [0, 0, Math.PI / 2], spSel);

  function drawPaper(S, count) {
    const sig = `${S.id}:${count}`;
    if (sig === lastSig) return;
    lastSig = sig;
    const {ctx: g, canvas: c} = paperTex.userData;
    g.fillStyle = '#fbfaf6';
    g.fillRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const cw = PITCH * PXMM;
    g.font = `500 ${Math.round(cw * 1.62)}px "Courier New", "JetBrains Mono", monospace`;
    for (let i = 0; i < count; i++) {
      const gl = S.glyphs[i];
      if (!gl.ch || gl.color === 'stencil') continue;
      // a deterministic little irregularity per strike (ink density, a hair of offset)
      const h1 = Math.sin(i * 12.9898 + gl.col * 78.233) * 43758.5453;
      const r = h1 - Math.floor(h1);
      const x = (gl.col - PAPER.leftEdgeCol) * cw;
      const y = (PAPER.topMargin + gl.feed) * PXMM + cw * 0.55;
      g.fillStyle = gl.color === 'red' ? `rgba(160,28,34,${0.82 + 0.15 * r})` : `rgba(22,20,22,${0.8 + 0.18 * r})`;
      g.fillText(gl.ch, x, y + (r - 0.5) * 1.2);
    }
    paperTex.needsUpdate = true;
  }

  function update(s, S) {
    move.position.x = s.carriageX;
    sub.position.y = s.shiftMM;
    platen.rotation.x = -s.platenDeg * D2R;
    feedRolls.forEach((g) => (g.rotation.x = s.platenDeg * D2R * (PLATEN.r / 4.5)));
    // margin stops: fixed on the margin rack at their columns
    stops[0].position.x = stopX(CARRIAGE.leftMargin);
    stops[1].position.x = stopX(CARRIAGE.rightMargin);
    // return lever throw: rotates about its vertical pivot; the pawl turns the ratchet
    lev.rotation.y = -s.retLever * 26 * D2R;
    const pa = s.pawl;
    pawl.position.set(ratchetX, axisY + PLATEN.r + 6 - pa * 2, axisZ - 9 + pa * 4);
    pawl.rotation.set(-0.5 + pa * 0.3, 0, 0);
    spSel.rotation.x = ((s.spacing - 2) * 16 + s.spacingLever * 4) * D2R;
    // the sheet: the platen's rotation feeds it along its path; its column 0 is fixed on the carriage
    const feed = s.feed;
    if (feed !== lastFeed) {
      lastFeed = feed;
      const sTop = PAPER_PATH.S_PRINT + PAPER.topMargin + feed;
      for (let i = 0; i <= NS; i++) {
        const v = (i / NS) * PAPER.length; // distance down the sheet from its top edge
        const [py, pz] = paperPoint(sTop - v);
        const o = i * 6;
        ppos[o] = paperX0;
        ppos[o + 1] = axisY + py;
        ppos[o + 2] = axisZ + pz;
        ppos[o + 3] = paperX0 + PW;
        ppos[o + 4] = axisY + py;
        ppos[o + 5] = axisZ + pz;
        puv[i * 4] = 0;
        puv[i * 4 + 1] = 1 - v / PAPER.length;
        puv[i * 4 + 2] = 1;
        puv[i * 4 + 3] = 1 - v / PAPER.length;
      }
      pgeo.attributes.position.needsUpdate = true;
      pgeo.attributes.uv.needsUpdate = true;
      pgeo.computeVertexNormals();
    }
    drawPaper(S, s.glyphCount);
  }
  return {move, car, sub, plG, paG, retG, rackG, marG, update, stopX};
}
export {LINE};
