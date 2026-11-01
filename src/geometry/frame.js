// The cast-iron frame: open side frames with their windows and keyboard cheeks, the stepped keyboard bed, the front
// rail with its gold lettering, the decal panel in front of the basket, the deck the typebars rise through, rear cross
// members, rubber feet, and the two carriage rails. All original geometry; proportions ESTIMATED from photographs.
import * as THREE from 'three';
import {BODY, CARRIAGE, KEYS} from '../params.js';
import {boxGeo, canvasTex, cylGeo, extrudeOutline, mesh, roundRect} from './util.js';

const GOLD = '#c9a24c';
const GOLD_DK = '#7d5f22';

/** gold lettering and pinstripes, drawn from code */
function decal(w, h, draw) {
  const t = canvasTex(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
  });
  return t;
}
const stripe = (g, x0, y0, x1, y1, lw = 3, r = 10) => {
  g.strokeStyle = GOLD;
  g.lineWidth = lw;
  g.beginPath();
  g.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  g.stroke();
};
const goldText = (g, txt, x, y, size, weight = 800, spacing = 0, font = 'Inter') => {
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.lineWidth = Math.max(2, size * 0.08);
  g.strokeStyle = GOLD_DK;
  g.strokeText(txt, x, y);
  const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  gr.addColorStop(0, '#e9cf86');
  gr.addColorStop(0.55, GOLD);
  gr.addColorStop(1, '#a8812f');
  g.fillStyle = gr;
  g.fillText(txt, x, y);
};

export function buildFrame(mats, nodes) {
  const {m} = mats;
  const root = new THREE.Group();
  root.name = 'frame';
  nodes.frame.push(root);
  const iron = m('frame', 'iron');
  const inner = m('frame', 'ironInner');

  // ------------------------------------------------------------ side frames (profile in z,y; extruded along x)
  const R = BODY;
  const prof = [
    [R.rearZ, R.baseY],
    [R.railFrontZ, R.baseY],
    [R.railFrontZ, 44],
    [138, 124],
    [136, 190],
    [124, 200],
    [R.rearZ + 12, 200],
    [R.rearZ, 188],
  ];
  const holes = [
    roundRect(-128, 66, 80, 178, 14),
    [
      [100, 30],
      [100, 112],
      [128, 114],
      [212, 56],
      [212, 30],
    ],
  ];
  const sideGeo = extrudeOutline(prof, R.sideT, holes, 1.2, 8);
  // a gold pinstripe panel on the lower side, and on the upper rail
  const sideDecal = decal(1024, 256, (g, w, h) => {
    stripe(g, 18, 22, w - 18, h - 22, 4, 18);
    stripe(g, 34, 38, w - 34, h - 38, 1.5, 12);
  });
  for (const s of [-1, 1]) {
    const side = new THREE.Group();
    side.name = s < 0 ? 'sideL' : 'sideR';
    side.userData.mirror = s;
    nodes.frameSides.push(side);
    root.add(side);
    const x = s * (R.sideX + R.sideT / 2);
    mesh(sideGeo, m('frameSides', 'iron'), [x, 0, 0], [0, -Math.PI / 2, 0], side);
    // pinstripe decal on the outer face of the lower panel (z -128..80, y 22..62)
    const d = mesh(new THREE.PlaneGeometry(200, 38), m('frameSides', 'decal', {key: 'side', map: sideDecal}), [x + s * (R.sideT / 2 + 1.3), 42, -24], [0, (s * Math.PI) / 2, 0], side);
    d.castShadow = false;
    // rail brackets on top of each side frame
    for (const rz of CARRIAGE.railZ) mesh(boxGeo(16, 8, 16), m('frameSides', 'iron'), [s * (R.sideX - 2), 200 + 2, rz], null, side);
  }

  // ------------------------------------------------------------ base, keyboard bed, front rail
  mesh(boxGeo(R.sideX * 2, 5, R.railFrontZ - R.rearZ - 20), inner, [0, R.baseY + 2.5, (R.railFrontZ + R.rearZ) / 2 - 6], null, root);
  const railGeo = extrudeOutline(
    [
      [R.railFrontZ - 18, R.baseY],
      [R.railFrontZ, R.baseY],
      [R.railFrontZ, R.railTopY - 4],
      [R.railFrontZ - 6, R.railTopY],
      [R.railFrontZ - 18, R.railTopY],
    ],
    R.sideX * 2,
    [],
    1,
  );
  mesh(railGeo, iron, [0, 0, 0], [0, -Math.PI / 2, 0], root);
  const railDecal = decal(2048, 160, (g, w, h) => {
    stripe(g, 10, 14, w - 10, h - 14, 4, 10);
    goldText(g, 'No 5', 150, h / 2 + 2, 66, 800, 2);
    goldText(g, 'No 5', w - 150, h / 2 + 2, 66, 800, 2);
    goldText(g, 'UNDERWOOD STANDARD TYPEWRITER', w / 2, h / 2 + 2, 64, 700, 10);
    g.fillStyle = GOLD;
    for (const x of [270, w - 270]) g.fillRect(x, 26, 3, h - 52);
  });
  const rd = mesh(new THREE.PlaneGeometry(R.sideX * 2 - 8, R.railTopY - R.baseY - 6), m('frame', 'decal', {key: 'rail', map: railDecal}), [0, (R.railTopY + R.baseY) / 2 - 1, R.railFrontZ + 0.9], null, root);
  rd.castShadow = false;
  // key lever comb across the keyboard bed and the fulcrum rod at the rear
  mesh(boxGeo(R.sideX * 2, 10, 6), inner, [0, KEYS.leverY - 6, KEYS.combZ], null, root);
  mesh(cylGeo(2.2, 2.2, R.sideX * 2, 12), m('frame', 'steel'), [0, KEYS.fulcrumY + 4, KEYS.fulcrumZ], [0, 0, Math.PI / 2], root);
  mesh(boxGeo(R.sideX * 2, 18, 10), inner, [0, KEYS.fulcrumY - 6, KEYS.fulcrumZ - 4], null, root);

  // ------------------------------------------------------------ decal panel in front of the basket
  const hz = R.hoodZ;
  const ell = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    ell.push([150 * Math.cos(a), 196 - 46 * Math.sin(a)]);
  }
  const hoodOutline = [[-R.sideX, 124], [R.sideX, 124], [R.sideX, 196], ...ell.reverse(), [-R.sideX, 196]];
  // the outline above runs right along the top edge into the arch: build it explicitly in order
  const hoodPts = [[-R.sideX, 124], [R.sideX, 124], [R.sideX, 196]];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    hoodPts.push([150 * Math.cos(a), 196 - 46 * Math.sin(a)]);
  }
  hoodPts.push([-R.sideX, 196]);
  void hoodOutline;
  const hood = new THREE.Group();
  hood.name = 'hood';
  nodes.hood.push(hood);
  root.add(hood);
  mesh(extrudeOutline(hoodPts, 7, [], 1.2, 8), m('hood', 'iron'), [0, 0, hz], null, hood);
  const hoodDecal = decal(2048, 640, (g, w, h) => {
    // a gold border following the arch, the name in the band below it
    g.strokeStyle = GOLD;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(40, h - 40);
    g.lineTo(w - 40, h - 40);
    g.lineTo(w - 40, 30);
    g.lineTo(w - 140, 30);
    g.ellipse(w / 2, 30, w / 2 - 140, 300, 0, 0, Math.PI, false);
    g.lineTo(40, 30);
    g.closePath();
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(w / 2, 30, w / 2 - 170, 330, 0, 0.12, Math.PI - 0.12, false);
    g.stroke();
    goldText(g, 'UNDERWOOD', w / 2, h - 150, 150, 800, 18);
    // two small roundels left and right of the name
    for (const x of [300, w - 300]) {
      g.beginPath();
      g.ellipse(x, h - 150, 86, 56, 0, 0, Math.PI * 2);
      g.lineWidth = 4;
      g.stroke();
      goldText(g, 'No 5', x, h - 148, 46, 800, 2);
    }
  });
  const hd = mesh(new THREE.PlaneGeometry(R.sideX * 2, 72), m('hood', 'decal', {key: 'hood', map: hoodDecal}), [0, 160, hz + 4.6], null, hood);
  hd.castShadow = false;

  // ------------------------------------------------------------ deck: rear strip and two side pieces around the opening
  const OR = R.deckOpenR;
  mesh(boxGeo(R.sideX * 2 + 10, 6, 32), iron, [0, 197, -24], null, root);
  const zEnd = R.hoodZ;
  const xCut = Math.sqrt(OR * OR - zEnd * zEnd);
  for (const s of [-1, 1]) {
    const pts = [[s * (R.sideX + 5), -8], [s * OR, -8], [s * OR, 0]];
    for (let i = 1; i <= 16; i++) {
      const zz = (i / 16) * zEnd;
      pts.push([s * Math.sqrt(OR * OR - zz * zz), zz]);
    }
    pts.push([s * xCut, zEnd], [s * (R.sideX + 5), zEnd]);
    if (s > 0) pts.reverse();
    // shape coords (x, -z) and rotate so the extrusion runs along y
    const g = extrudeOutline(pts.map(([x, z]) => [x, -z]), 6, [], 0.8, 4);
    mesh(g, iron, [0, 197, 0], [-Math.PI / 2, 0, 0], root);
  }

  // ------------------------------------------------------------ rear cross members, feet
  mesh(boxGeo(R.sideX * 2, 26, 10), iron, [0, 30, R.rearZ + 5], null, root);
  mesh(boxGeo(R.sideX * 2, 14, 8), iron, [0, 150, R.rearZ + 6], null, root);
  const foot = m('frame', 'rubber');
  for (const sx of [-1, 1]) for (const z of [R.rearZ + 18, R.railFrontZ - 22]) mesh(cylGeo(13, 15, R.footH, 24), foot, [sx * 172, R.footH / 2, z], null, root);

  // ------------------------------------------------------------ carriage rails (their own assembly)
  const rails = new THREE.Group();
  rails.name = 'rails';
  nodes.rails.push(rails);
  for (const rz of CARRIAGE.railZ) mesh(cylGeo(3.6, 3.6, R.sideX * 2 + 24, 16), m('rails', 'steel'), [0, CARRIAGE.railY, rz], [0, 0, Math.PI / 2], rails);
  // ball races under the carriage shoes (visible from the rear)
  return {root, rails};
}
