// Ribbon: two spools on vertical shafts in cups on the deck, the bichrome fabric ribbon running through guide posts and
// the vibrator at the printing point, the feed ratchet under the left cup, and the colour selector lever. The wound
// radius and spool angles come from the model (closed-form spiral), so the spools turn exactly as the ribbon feeds.
import * as THREE from 'three';
import {PRINT, RIBBON} from '../params.js';
import {canvasTex, cylGeo, gearGeo, mesh, spokedGeo, boxGeo} from './util.js';

const D2R = Math.PI / 180;

function ribbonTex() {
  return canvasTex(
    512,
    64,
    (g, w, h) => {
      // v = 1 (top) black half, v = 0 (bottom) red half; a faint weave
      g.fillStyle = '#17171a';
      g.fillRect(0, 0, w, h / 2);
      g.fillStyle = '#9b1f24';
      g.fillRect(0, h / 2, w, h / 2);
      for (let x = 0; x < w; x += 2) {
        g.fillStyle = `rgba(255,255,255,${0.025 + 0.02 * ((x * 37) % 5) / 5})`;
        g.fillRect(x, 0, 1, h);
      }
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, h / 2 - 1, w, 2);
    },
    {repeat: true},
  );
}

export function buildRibbon(mats, nodes) {
  const {m} = mats;
  const G = new THREE.Group();
  G.name = 'ribbon';
  nodes.ribbon.push(G);
  const X = RIBBON.spoolX;
  const Z = RIBBON.spoolZ;
  const Y = RIBBON.spoolY;
  const tex = ribbonTex();
  const ribMat = m('ribbon', 'ribbon', {key: 'fabric', map: tex});
  const spools = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(s * X, Y, Z);
    G.add(g);
    // cup on the deck
    mesh(cylGeo(RIBBON.spoolFullR + 3, RIBBON.spoolFullR + 2, 4, 36), m('ribbon', 'iron'), [0, -2, 0], null, g);
    mesh(cylGeo(2, 2, 22, 10), m('ribbon', 'steel'), [0, 9, 0], null, g);
    const turn = new THREE.Group();
    g.add(turn);
    const flange = spokedGeo(RIBBON.spoolFullR + 1, 3, 4, 5, 0.9);
    mesh(flange, m('ribbon', 'nickel'), [0, 1.2, 0], [-Math.PI / 2, 0, 0], turn);
    mesh(flange, m('ribbon', 'nickel'), [0, RIBBON.width + 3.4, 0], [-Math.PI / 2, 0, 0], turn);
    mesh(cylGeo(RIBBON.spoolCoreR, RIBBON.spoolCoreR, RIBBON.width + 2, 18), m('ribbon', 'steel'), [0, RIBBON.width / 2 + 2.3, 0], null, turn);
    // the wound ribbon: a cylinder scaled to the model's wound radius
    const wound = mesh(cylGeo(1, 1, RIBBON.width, 40), ribMat, [0, RIBBON.width / 2 + 2.3, 0], null, turn);
    return {g, turn, wound, s};
  });
  // feed ratchet under the left cup, on the spool shaft
  const ratchet = mesh(gearGeo(RIBBON.ratchetTeeth, 13, 11.6, 2, 2, 'ratchet'), m('ribbon', 'steel'), [-X, Y - 9, Z], [-Math.PI / 2, 0, 0], G);
  const pawl = mesh(boxGeo(10, 2, 2), m('ribbon', 'darkSteel'), null, null, G);
  // guide posts either side of the printing point
  for (const s of [-1, 1]) mesh(cylGeo(1.4, 1.4, 26, 10), m('ribbon', 'nickel'), [s * RIBBON.guideX, PRINT.y - 18, 6], null, G);
  // colour selector lever on the right of the deck
  const lever = new THREE.Group();
  lever.position.set(178, 203, 96);
  G.add(lever);
  mesh(boxGeo(4, 3, 26, 1), m('ribbon', 'nickel'), [0, 0, 10], null, lever);
  mesh(cylGeo(3.2, 3.2, 5, 14), m('ribbon', 'iron'), [0, 1, 22], [Math.PI / 2, 0, 0], lever);

  // ------------------------------------------------------------ the ribbon strip
  const SEG = 64;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((SEG + 1) * 2 * 3);
  const uv = new Float32Array((SEG + 1) * 2 * 2);
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const strip = new THREE.Mesh(geo, ribMat);
  strip.castShadow = true;
  strip.receiveShadow = true;
  strip.frustumCulled = false;
  G.add(strip);
  const restC = PRINT.y + RIBBON.restTop - RIBBON.width / 2; // ribbon centre-line at rest at the printing point
  const spoolC = Y + RIBBON.width / 2 + 2.3;

  // path in plan (x, z) with a height for the centre-line: spool tangent → guide → vibrator → guide → spool tangent
  const pathAt = (u, s) => {
    // u in [0,1] across the whole run
    const rL = s.spoolRL;
    const rR = s.spoolRR;
    const pts = [
      [-X + rL * 0.62, Z - rL * 0.78, spoolC, 0],
      [-RIBBON.guideX, 6, restC + 1.5, 0],
      [-14, RIBBON.z, restC, 0.6],
      [0, RIBBON.z, restC, 1],
      [14, RIBBON.z, restC, 0.6],
      [RIBBON.guideX, 6, restC + 1.5, 0],
      [X - rR * 0.62, Z - rR * 0.78, spoolC, 0],
    ];
    // cumulative plan length
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const target = u * L[L.length - 1];
    let i = 1;
    while (i < pts.length - 1 && L[i] < target) i++;
    const k = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
    const a = pts[i - 1];
    const b = pts[i];
    const kk = k * k * (3 - 2 * k);
    const lift = (a[3] + (b[3] - a[3]) * kk) * s.ribbonLift;
    return [a[0] + (b[0] - a[0]) * k, a[2] + (b[2] - a[2]) * kk + lift, a[1] + (b[1] - a[1]) * k, target];
  };

  function update(s) {
    for (const sp of spools) {
      const r = sp.s < 0 ? s.spoolRL : s.spoolRR;
      sp.wound.scale.set(r, 1, r);
      sp.turn.rotation.y = (sp.s < 0 ? s.spoolL : s.spoolR) * D2R;
    }
    ratchet.rotation.z = s.spoolL * D2R;
    const pa = s.feeding ? 1 : 0;
    pawl.position.set(-X + 16, Y - 9, Z + 8 - pa * 1.5);
    lever.rotation.y = (s.color === 'red' ? 18 : s.color === 'stencil' ? -18 : 0) * D2R + s.colorLever * 4 * D2R;
    const off = (s.ribbonPos / 10) % 1000;
    for (let i = 0; i <= SEG; i++) {
      const [x, yc, z, len] = pathAt(i / SEG, s);
      const o = i * 6;
      pos[o] = x;
      pos[o + 1] = yc + RIBBON.width / 2;
      pos[o + 2] = z;
      pos[o + 3] = x;
      pos[o + 4] = yc - RIBBON.width / 2;
      pos[o + 5] = z;
      const uu = (len + off) / 40;
      uv[i * 4] = uu;
      uv[i * 4 + 1] = 1;
      uv[i * 4 + 2] = uu;
      uv[i * 4 + 3] = 0;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return {G, update};
}
