// Geometry helpers. Everything in millimetres.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const D2R = Math.PI / 180;
const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};

export const boxGeo = (w, h, d, r = 0) =>
  memo(`box${w},${h},${d},${r}`, () => (r > 0 ? roundedBox(w, h, d, r) : new THREE.BoxGeometry(w, h, d)));
export const cylGeo = (rt, rb, h, seg = 24, open = false) => memo(`cyl${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphereGeo = (r, seg = 20) => memo(`sph${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)));

function roundedBox(w, h, d, r) {
  // an extruded rounded rectangle (w × h), depth d along z, centred
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, {depth: d, bevelEnabled: false, curveSegments: 4});
  g.translate(0, 0, -d / 2);
  return g;
}

/** a mesh with shadows on */
export function mesh(geo, mat, pos, rot, parent) {
  const o = new THREE.Mesh(geo, mat);
  if (pos) o.position.set(pos[0], pos[1], pos[2]);
  if (rot) o.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, rot[3] || 'XYZ');
  o.castShadow = true;
  o.receiveShadow = true;
  if (parent) parent.add(o);
  return o;
}

/** extrude a 2D outline (array of [a,b]) with optional holes; depth along the third axis */
export function extrudeOutline(outline, depth, holes = [], bevel = 0.8, curveSegments = 6) {
  const s = new THREE.Shape(outline.map(([a, b]) => new THREE.Vector2(a, b)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([a, b]) => new THREE.Vector2(a, b))));
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments});
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** rounded rectangle outline points (for holes and plates) */
export function roundRect(x0, y0, x1, y1, r, seg = 5) {
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return pts;
}

/** a gear / star wheel blank in the XY plane, extruded along z */
export function gearGeo(teeth, rOut, rRoot, width, holeR = 0, profile = 'spur') {
  return memo(`gear${teeth},${rOut},${rRoot},${width},${holeR},${profile}`, () => {
    const sh = new THREE.Shape();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const da = (Math.PI * 2) / teeth;
      const pts =
        profile === 'ratchet'
          ? [[rRoot, a0], [rOut, a0 + da * 0.85], [rRoot, a0 + da * 0.92]]
          : profile === 'star'
          ? [[rRoot, a0], [rOut, a0 + da * 0.42], [rOut, a0 + da * 0.52], [rRoot, a0 + da * 0.62]]
          : [[rRoot, a0], [rRoot, a0 + da * 0.18], [rOut, a0 + da * 0.32], [rOut, a0 + da * 0.6], [rRoot, a0 + da * 0.74]];
      pts.forEach(([r, a], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(a), r * Math.sin(a)) : sh.lineTo(r * Math.cos(a), r * Math.sin(a))));
    }
    sh.closePath();
    if (holeR) {
      const h = new THREE.Path();
      h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
      sh.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.25, bevelSegments: 1, curveSegments: 3});
    g.translate(0, 0, -width / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** a spoked wheel (hand wheel / drum face) in XY, extruded along z */
export function spokedGeo(rOut, rim, hub, spokes, width) {
  return memo(`spoked${rOut},${rim},${hub},${spokes},${width}`, () => {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, rOut, 0, Math.PI * 2, false);
    const n = spokes;
    const rIn = rOut - rim;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.17;
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.17;
      const h = new THREE.Path();
      h.moveTo(rIn * Math.cos(a0), rIn * Math.sin(a0));
      h.absarc(0, 0, rIn, a0, a1, false);
      const b0 = a1 - 0.08;
      const b1 = a0 + 0.08;
      h.lineTo((hub + 2) * Math.cos(b0 - 0.25), (hub + 2) * Math.sin(b0 - 0.25));
      h.lineTo((hub + 2) * Math.cos(b1 + 0.25), (hub + 2) * Math.sin(b1 + 0.25));
      h.closePath();
      sh.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 1, curveSegments: 24});
    g.translate(0, 0, -width / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** a helical spring along +y, length 1 (scale y to stretch) */
export function springGeo(r, wire, turns, seg = 120) {
  return memo(`spring${r},${wire},${turns}`, () => {
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = u * turns * Math.PI * 2;
      pts.push(new V3(Math.cos(a) * r, u, Math.sin(a) * r));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, wire, 5, false);
  });
}

const _a = new V3();
const _b = new V3();
const _up = new V3(0, 1, 0);
const _q = new THREE.Quaternion();
/** pose a unit rod (cylinder of height 1 along y, centred) between two points */
export function rodBetween(obj, a, b, r = 1) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const len = _a.distanceTo(_b);
  obj.position.copy(_a).add(_b).multiplyScalar(0.5);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_up, _b);
  obj.quaternion.copy(_q);
  obj.scale.set(r, Math.max(1e-4, len), r);
}
/** the same into a matrix (for instancing) */
const _m = new THREE.Matrix4();
const _s = new V3();
const _p = new V3();
export function rodMatrix(a, b, r = 1, out = _m) {
  _a.set(a[0], a[1], a[2]);
  _b.set(b[0], b[1], b[2]);
  const len = _a.distanceTo(_b);
  _p.copy(_a).add(_b).multiplyScalar(0.5);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_up, _b);
  _s.set(r, Math.max(1e-4, len), r);
  return out.compose(_p, _q, _s);
}

/** a canvas texture */
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.anisotropy ?? 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.needsUpdate = true;
  t.userData = {canvas: c, ctx: g};
  return t;
}
