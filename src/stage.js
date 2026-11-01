// The studio: a warm pale backdrop, a soft shadow on an invisible floor, soft boxes in the environment for the gloss
// black to catch (rim light so the machine never sinks into its own black), optional GTAO, quality tiers.
// frame(cam) draws one frame from a camera spec (target mm, azimuth/elevation degrees, distance mm, screen shift px).
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';

export const BG = {top: '#f5f2ea', mid: '#eeeae0', low: '#e6e1d5'};
export const TIERS = {
  high: {label: 'HIGH', samples: 8, ao: true, shadow: 4096, pr: 2},
  balanced: {label: 'BALANCED', samples: 4, ao: false, shadow: 2048, pr: 1.5},
  low: {label: 'LOW', samples: 2, ao: false, shadow: 1024, pr: 1},
};
const D2R = Math.PI / 180;

export function createStage(canvas, machine, {capture = false} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: capture, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, BG.top);
    gr.addColorStop(0.55, BG.mid);
    gr.addColorStop(1, BG.low);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  const camera = new THREE.PerspectiveCamera(24, 16 / 9, 0.03, 30);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 8}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.7;
  gtao.updateGtaoMaterial({radius: 0.025, distanceExponent: 1.4, thickness: 0.4, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  composer.addPass(new Toggle(() => (shade.visible = false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(() => (shade.visible = true)));
  composer.addPass(new OutputPass());

  // environment: a big warm top softbox, two side strips for rim light, a low front fill
  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#d8d4cc');
    const box = (w, h, pos, k, col = '#ffffff') => {
      const mm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide}));
      mm.position.copy(pos);
      mm.lookAt(0, 0, 0);
      env.add(mm);
    };
    box(12, 12, new THREE.Vector3(0, 14, 2), 2.4, '#fff8ee');
    box(3, 14, new THREE.Vector3(-12, 4, 6), 3.2);
    box(3, 14, new THREE.Vector3(12, 4, -6), 2.4);
    box(3, 12, new THREE.Vector3(-4, 3, -13), 2.6);
    box(18, 2, new THREE.Vector3(0, 2, 14), 1.4, '#fff4e4');
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#cbc6bc', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 1.0;
    pm.dispose();
  }
  const sun = new THREE.DirectionalLight('#fffaf2', 2.3);
  sun.position.set(-0.9, 2.6, 1.3);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -0.55, right: 0.55, top: 0.55, bottom: -0.55, near: 0.5, far: 6});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 10;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.0015;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#ffffff', 0.9);
  rim.position.set(1.4, 1.2, -1.6);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight('#ffffff', '#d6d0c4', 0.75));

  const shade = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({color: '#5e5a52', opacity: 0.26, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0;
  shade.receiveShadow = true;
  scene.add(shade);
  scene.add(machine.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const placeCamera = (cam) => {
    const az = cam.az * D2R;
    const el = cam.el * D2R;
    const d = cam.d * 0.001;
    const tx = cam.tx * 0.001;
    const ty = cam.ty * 0.001;
    const tz = cam.tz * 0.001;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.near = Math.max(0.01, d * 0.05);
    camera.far = d + 4;
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  const frame = (cam) => {
    placeCamera(cam);
    composer.render();
  };
  const pv = new THREE.Vector3();
  /** machine millimetres (already in world after explode? pass a world point) → stage px */
  const projectWorld = (v) => {
    pv.copy(v).project(camera);
    if (pv.z > 1 || pv.z < -1) return null;
    return [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  let tier = 'high';
  const setQuality = (name) => {
    const q = TIERS[name] || TIERS.high;
    tier = name;
    for (const t of [composer.renderTarget1, composer.renderTarget2]) {
      t.samples = q.samples;
      t.dispose();
    }
    gtao.enabled = q.ao;
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.radius = q.shadow >= 4096 ? 10 : q.shadow >= 2048 ? 6 : 3;
    renderer.shadowMap.type = q.shadow >= 2048 ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    return q;
  };
  return {renderer, scene, camera, composer, gtao, sun, resize, frame, placeCamera, projectWorld, size, setQuality, get tier() {
    return tier;
  }};
}
