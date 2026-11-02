// Materials. Every assembly gets its own clones (same shader programs, so no extra compiles) so x-ray, ghosting and
// the brass "working now" accent can be set per assembly without touching the rest of the machine.
import * as THREE from 'three';

export const ACCENT = new THREE.Color('#c8922e'); // warm brass: the part doing the work right now
const GHOST = new THREE.Color('#bdb7ab'); // the pale tint ghosted assemblies take

const BASE = {
  // gloss black japanning: a near-black base under a hard clearcoat that carries the softbox highlights
  iron: () => new THREE.MeshPhysicalMaterial({color: '#0b0b0d', roughness: 0.6, metalness: 0, specularIntensity: 0.12, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.8}),
  ironInner: () => new THREE.MeshStandardMaterial({color: '#1e1f22', roughness: 0.62, metalness: 0.15, envMapIntensity: 0.6}),
  nickel: () => new THREE.MeshStandardMaterial({color: '#dcdcd6', roughness: 0.24, metalness: 1, envMapIntensity: 0.9}),
  steel: () => new THREE.MeshStandardMaterial({color: '#b6babf', roughness: 0.34, metalness: 1, envMapIntensity: 0.85}),
  darkSteel: () => new THREE.MeshStandardMaterial({color: '#4a4d52', roughness: 0.5, metalness: 0.85, envMapIntensity: 0.6}),
  brass: () => new THREE.MeshStandardMaterial({color: '#b68a3e', roughness: 0.38, metalness: 1, envMapIntensity: 0.7}),
  rubber: () => new THREE.MeshStandardMaterial({color: '#1c1c1d', roughness: 0.82, metalness: 0, envMapIntensity: 0.5}),
  felt: () => new THREE.MeshStandardMaterial({color: '#5b3a2c', roughness: 0.95, metalness: 0}),
  paper: () => new THREE.MeshStandardMaterial({color: '#f3efe4', roughness: 0.92, metalness: 0, side: THREE.DoubleSide}),
  ribbon: () => new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.9, metalness: 0, side: THREE.DoubleSide}),
  keyCap: () => new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9}),
  decal: () => new THREE.MeshStandardMaterial({color: '#ffffff', roughness: 0.4, metalness: 0.55, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, envMapIntensity: 0.6}),
  chrome: () => new THREE.MeshStandardMaterial({color: '#e2e2de', roughness: 0.16, metalness: 1, envMapIntensity: 0.9}),
};

/** a material bank: m(group, kind) returns that group's clone of the base material */
export function createMaterials() {
  const bank = new Map();
  const byGroup = new Map();
  const m = (group, kind, extra) => {
    const key = `${group}:${kind}${extra ? ':' + extra.key : ''}`;
    let mat = bank.get(key);
    if (!mat) {
      mat = BASE[kind]();
      if (extra?.map) {
        mat.map = extra.map;
      }
      if (extra?.alphaMap) mat.alphaMap = extra.alphaMap;
      if (kind === 'ribbon' || kind === 'paper' || kind === 'decal') mat.userData.noAccent = true;
      mat.userData.base = {opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite, emissive: mat.emissive.clone()};
      bank.set(key, mat);
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group).push(mat);
    }
    return mat;
  };
  /** opacity 0..1 (x-ray / ghost) and accent 0..1 for one group */
  const setGroupLook = (group, {opacity = 1, accent = 0, ghost = 0} = {}) => {
    for (const mat of byGroup.get(group) || []) {
      const b = mat.userData.base;
      const o = b.opacity * opacity;
      const tr = b.transparent || o < 0.999;
      if (mat.transparent !== tr) {
        // an opaque program forces alpha to 1 (three's OPAQUE define): switch to the transparent variant. Both
        // variants are compiled during warm-up, so the switch is a cache lookup, not a compile.
        mat.transparent = tr;
        mat.needsUpdate = true;
      }
      mat.opacity = o;
      mat.depthWrite = tr ? o > 0.6 && b.depthWrite !== false : b.depthWrite;
      mat.emissive.copy(b.emissive).lerp(ACCENT, mat.userData.noAccent ? 0 : accent * 0.36);
      mat.emissiveIntensity = 1;
      if (mat.userData.ghostColor === undefined) mat.userData.ghostColor = mat.color.clone();
      mat.color.copy(mat.userData.ghostColor).lerp(GHOST, ghost * 0.35);
    }
  };
  return {m, setGroupLook, bank, byGroup};
}
