// Test helpers: build the real machine geometry headless (a no-op 2D canvas stands in for the browser's) and measure
// part-to-part interference with oriented boxes (separating-axis test). Every mesh, and every instance of an instanced
// mesh, becomes the box of its geometry's bounds under its world matrix — so a rotated rod is a thin box along the rod,
// not the axis-aligned box around it.
import * as THREE from 'three';

// ------------------------------------------------------------ a canvas that accepts every call and draws nothing
function fakeCanvas() {
  const ctx = new Proxy(
    {},
    {
      get: (o, k) => (k in o ? o[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({addColorStop() {}}) : k === 'measureText' ? () => ({width: 10}) : () => {}),
      set: (o, k, v) => ((o[k] = v), true),
      has: () => true,
    },
  );
  return {width: 1, height: 1, getContext: () => ctx, style: {}};
}
if (!globalThis.document) globalThis.document = {createElement: () => fakeCanvas()};

const {buildMachine} = await import('../../src/machine.js');
const {viewLook} = await import('../../src/views.js');
const {EXPLODE} = await import('../../src/params.js');
export {buildMachine, viewLook, EXPLODE};

/** oriented boxes {asm, name, c, ax[3], h[3]} of every visible mesh (mm) */
export function obbs(machine) {
  machine.root.updateMatrixWorld(true);
  const out = [];
  const M = new THREE.Matrix4();
  const push = (asm, name, geo, mw, id) => {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const ctr = bb.getCenter(new THREE.Vector3());
    const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const e = mw.elements;
    const col = (i) => new THREE.Vector3(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]);
    const cols = [col(0), col(1), col(2)];
    const ax = cols.map((v) => v.clone().normalize());
    const h = [half.x * cols[0].length(), half.y * cols[1].length(), half.z * cols[2].length()];
    const c = ctr.applyMatrix4(mw);
    // the root is scaled to metres: report millimetres
    out.push({asm, name, id, geo, mw, c: c.multiplyScalar(1000), ax, h: h.map((v) => v * 1000)});
  };
  // an assembly's node can hold another assembly's node (the hood and side panels sit under the frame root, the rack
  // and platen under the carriage): each mesh belongs to the nearest assembly node above it
  const owner = new Map();
  for (const [asm, list] of Object.entries(machine.nodes)) for (const n of list) owner.set(n, asm);
  const walk = (o, asm) => {
    if (!o.visible) return;
    if (owner.has(o)) asm = owner.get(o);
    if (o.isMesh && o.geometry && !o.userData.noCollide && asm) {
      const tag = `${o.parent?.name || ''}:${o.geometry.type.replace('Geometry', '')}`;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, M);
          push(asm, `${o.name || tag}#${i}`, o.geometry, M.clone().premultiply(o.matrixWorld), `${o.id}#${i}`);
        }
      } else {
        const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).multiplyScalar(1000);
        push(asm, `${o.name || tag}@${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`, o.geometry, o.matrixWorld, String(o.id));
      }
    }
    for (const c of o.children) walk(c, asm);
  };
  walk(machine.root, null);
  return out;
}

/** penetration depth (mm) of two oriented boxes: the smallest overlap over the 15 separating axes; ≤ 0 means apart */
export function obbPen(A, B) {
  const axes = [...A.ax, ...B.ax];
  for (const a of A.ax) for (const b of B.ax) {
    const c = new THREE.Vector3().crossVectors(a, b);
    if (c.lengthSq() > 1e-8) axes.push(c.normalize());
  }
  const d = B.c.clone().sub(A.c);
  let best = Infinity;
  for (const L of axes) {
    const ra = A.h[0] * Math.abs(A.ax[0].dot(L)) + A.h[1] * Math.abs(A.ax[1].dot(L)) + A.h[2] * Math.abs(A.ax[2].dot(L));
    const rb = B.h[0] * Math.abs(B.ax[0].dot(L)) + B.h[1] * Math.abs(B.ax[1].dot(L)) + B.h[2] * Math.abs(B.ax[2].dot(L));
    const o = ra + rb - Math.abs(d.dot(L));
    if (o < best) best = o;
    if (best <= 0) return best;
  }
  return best;
}

/** world triangles (mm) of a box's mesh, cached */
const triCache = new WeakMap();
function tris(A) {
  if (triCache.has(A)) return triCache.get(A);
  const pos = A.geo.attributes.position;
  const idx = A.geo.index;
  const n = idx ? idx.count : pos.count;
  const m = A.mw.clone().premultiply(new THREE.Matrix4().makeScale(1000, 1000, 1000));
  const v = (i) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
  const out = [];
  for (let i = 0; i + 2 < n; i += 3) out.push([v(i), v(i + 1), v(i + 2)]);
  triCache.set(A, out);
  return out;
}
/** does a triangle cross an oriented box (half extents shrunk by tol)? separating axes in the box's frame */
function triHitsBox(t, B, tol) {
  const h = B.h.map((x) => Math.max(0, x - tol));
  const p = t.map((q) => {
    const d = q.clone().sub(B.c);
    return [d.dot(B.ax[0]), d.dot(B.ax[1]), d.dot(B.ax[2])];
  });
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const e = [sub3(p[1], p[0]), sub3(p[2], p[1]), sub3(p[0], p[2])];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], cross3(e[0], e[1])];
  for (const ei of e) for (const u of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) axes.push(cross3(u, ei));
  for (const L of axes) {
    if (Math.abs(L[0]) + Math.abs(L[1]) + Math.abs(L[2]) < 1e-9) continue;
    const ps = p.map((q) => dot3(q, L));
    const r = h[0] * Math.abs(L[0]) + h[1] * Math.abs(L[1]) + h[2] * Math.abs(L[2]);
    if (Math.min(...ps) > r || Math.max(...ps) < -r) return false;
  }
  return true;
}
/** confirm a box overlap at the surface when a part is a concave extrusion (a plate with an opening, an arch) */
const concave = (A) => A.geo.type === 'ExtrudeGeometry' || A.geo.type === 'TorusGeometry' || A.geo.type === 'LatheGeometry';
function confirm(A, B, tol) {
  if (!concave(A) && !concave(B)) return true;
  if (concave(A) && tris(A).some((t) => triHitsBox(t, B, tol))) return true;
  if (concave(B) && tris(B).some((t) => triHitsBox(t, A, tol))) return true;
  return false;
}

/** quick reject on bounding spheres */
const near = (A, B) => A.c.distanceTo(B.c) < Math.hypot(...A.h) + Math.hypot(...B.h);

/**
 * interferences that a pose creates: pairs of boxes from different assemblies that overlap by more than `tol` mm in
 * the pose but not at rest (pairs that already touch at rest are the machine's own joints and contacts)
 */
export function newInterferences(rest, pose, tol = 1) {
  const key = (a, b) => `${a.id}|${b.id}`;
  const restPairs = new Set();
  const pairs = (list, fn) => {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i];
        const B = list[j];
        if (A.asm === B.asm || !near(A, B)) continue;
        fn(A, B);
      }
  };
  pairs(rest, (A, B) => obbPen(A, B) > 0 && restPairs.add(key(A, B)));
  const hits = [];
  pairs(pose, (A, B) => {
    if (restPairs.has(key(A, B))) return;
    const p = obbPen(A, B);
    if (p > tol && confirm(A, B, tol)) hits.push({a: `${A.asm}/${A.name}`, b: `${B.asm}/${B.name}`, pen: +p.toFixed(1)});
  });
  return hits.sort((x, y) => y.pen - x.pen);
}
