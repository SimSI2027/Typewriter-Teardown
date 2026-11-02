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
  // drawn in millimetres on the panel (372 × 72 mm, top edge at y 196): a pinstripe that follows the arch and the
  // panel edge, and the name — small, centred under the arch between two gold scrolls, as on the reference machine
  // (the name spans about a fifth of the frame width there). ESTIMATED proportions — D-11.
  const HW = R.sideX * 2;
  const HH = 72;
  const hoodDecal = decal(2048, 640, (g, w, h) => {
    g.save();
    g.scale(w / HW, h / HH);
    g.strokeStyle = GOLD;
    g.lineCap = 'round';
    g.lineWidth = 0.7;
    // panel border, broken by the arch (arch: centre at the top edge, 150 × 46 mm; stripe 5 mm outside it)
    g.beginPath();
    g.moveTo(5, HH - 5);
    g.lineTo(5, 5);
    g.lineTo(HW / 2 - 155, 5);
    g.ellipse(HW / 2, 0, 155, 51, 0, Math.PI, 0, true);
    g.lineTo(HW - 5, 5);
    g.lineTo(HW - 5, HH - 5);
    g.closePath();
    g.stroke();
    // two scrolls rising from the name toward the arch
    g.lineWidth = 0.55;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(HW / 2 + sx * 50, 60);
      g.quadraticCurveTo(HW / 2 + sx * 74, 60, HW / 2 + sx * 86, 51);
      g.stroke();
      g.beginPath();
      g.arc(HW / 2 + sx * 86 + sx * 1.6, 51, 1.6, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    // the name: about 84 mm wide, 8 mm cap height, drawn in pixels so the letter shapes are not stretched
    const pxX = w / HW;
    const pxY = h / HH;
    g.save();
    g.translate(w / 2, 61 * pxY);
    g.scale(1, pxY / pxX);
    goldText(g, "UNDERWOOD", 0, 0, 10.5 * pxX, 800, 0.9 * pxX);
    g.restore();
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
