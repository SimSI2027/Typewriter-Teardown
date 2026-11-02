// The live page. Left alone it plays the tour (its own deterministic session and script) with the operator's cursor;
// any click, drag, wheel, touch or key press hands the machine to the visitor, who continues from exactly where the
// tour left the paper. 25 s of quiet hands it back. The visitor's machine is a session too: inputs become actions at
// the current machine time τ; τ advances with the playback speed and can be paused, stepped and scrubbed.
import * as THREE from 'three';
import {createApp} from './app.js';
import {charToKey, CHAR_KEYS, FN_KEYS} from './keyboard.js';
import {createSession} from './model.js';
import {EXPLODE} from './params.js';
import {TIERS} from './stage.js';
import {createSound} from './sound.js';
import {buildTourSession, CLICKS, DURATION, makeCursor, speedAt, tauAt, VIEW_EVENTS} from './tour.js';
import {CAM_BUTTONS, SUB_BUTTONS, viewAt} from './views.js';
import {warmComposer} from './kit/warm.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const MAX_BACKLOG = 8; // seconds of queued machine time before further typing is refused
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];

export async function runLive() {
  const app = createApp({capture: false});
  const {st, ui, machine} = app;
  const sound = createSound();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

  // ------------------------------------------------------------ layout & quality
  let quality = 'auto';
  let tier = coarse ? 'low' : 'high';
  let scale = 1;
  const appEl = document.getElementById('app');
  // portrait phones letterbox the 1600 × 900 console to a sliver: say so, outside the stage, in readable type (D-13)
  const rotateHint = document.createElement('div');
  rotateHint.id = 'rotate-hint';
  rotateHint.setAttribute('role', 'note');
  rotateHint.textContent = 'Turn the phone sideways for the full console';
  rotateHint.style.cssText = 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translateX(-50%);display:none;padding:7px 12px;font:600 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:#5e5a52;background:rgba(255,255,255,.92);border:1px solid #e2ddd2;white-space:nowrap;pointer-events:none;z-index:5';
  document.body.appendChild(rotateHint);
  const fit = () => {
    rotateHint.style.display = innerHeight > innerWidth * 1.15 && innerWidth < 700 ? 'block' : 'none';
    scale = Math.min(innerWidth / W, innerHeight / H);
    appEl.style.transform = `translate(${((innerWidth - W * scale) / 2).toFixed(1)}px, ${((innerHeight - H * scale) / 2).toFixed(1)}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.6, TIERS[tier].pr));
  };
  const applyTier = () => {
    st.setQuality(tier);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = appEl.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  // ------------------------------------------------------------ state
  let T = 0; // wall clock (s), only advances while the page is visible
  let sid = 1;
  const tour = {on: !reduced, t0: 0, S: null, cursor: null};
  const newTour = () => {
    const {S, presses} = buildTourSession();
    tour.S = S;
    tour.cursor = makeCursor(presses);
  };
  newTour();
  let V = createSession();
  V.id = `v${sid}`;
  let tau = 0; // visitor machine time
  let paused = false;
  let speedI = 4;
  let slow = false;
  let panels = true;
  let VE = [{t: -99, cam: 'hero'}]; // visitor view events (wall time)
  const off = {az: 0, el: 0, k: 1};
  let lastInput = -1e9;
  let ring = {t: -9, x: 0, y: 0};
  let heard = {S: null, tau: 0};
  // catch-up: while keystrokes are queued, machine time runs faster (up to 5×) so a typist is never left behind;
  // with nothing queued it runs at the chosen speed. Slow motion and pause are never overridden.
  const rate = () => {
    if (paused) return 0;
    const base = SPEEDS[speedI] * (slow ? 0.25 : 1);
    if (slow || speedI < 4) return base;
    const backlog = Math.max(0, V.end - tau);
    return base * Math.min(5, 1 + backlog * 1.6);
  };

  const startTour = () => {
    newTour();
    tour.on = true;
    tour.t0 = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
    paused = false;
    heard = {S: null, tau: 0};
  };
  /** the visitor takes over: carry the tour's paper, carriage and current view into a visitor session */
  const takeOver = () => {
    lastInput = T;
    sound.unlock();
    if (!tour.on) return;
    tour.on = false;
    const t = Math.min(DURATION, T - tour.t0);
    const tt = tauAt(t);
    const s = tour.S.stateAt(tt);
    const i = tour.S.indexAt(tt);
    const done = i >= 0 ? (tt >= tour.S.acts[i].t0 + tour.S.acts[i].dur ? tour.S.acts[i].after : tour.S.acts[i].before) : tour.S.init;
    sid++;
    V = createSession({initial: {...done, bellAt: -1e9}});
    V.id = `v${sid}`;
    // the printed sheet carries over
    for (let g = 0; g < s.glyphCount; g++) V.glyphs.push({...tour.S.glyphs[g], t: -1});
    tau = 0;
    // an action in progress finishes in the visitor's session
    if (i >= 0 && tt < tour.S.acts[i].t0 + tour.S.acts[i].dur) {
      const a = tour.S.acts[i];
      const req = {type: a.type === 'locked' ? 'char' : a.type, key: a.key, value: a.value};
      V.push(req, -(tt - a.t0));
    }
    // the tour's view events so far, moved onto the wall clock: a transition in progress carries on (D-07)
    // (the tour's first event, at t = 0, sets the hero view; no extra start event, or the camera drift would restart)
    VE = VIEW_EVENTS.filter((e) => e.t <= t).map((e) => ({...e, t: T - (t - e.t)}));
    if (!VE.length) VE = [{t: -99, cam: 'hero'}];
    Object.assign(off, {az: 0, el: 0, k: 1});
    heard = {S: null, tau: 0};
  };
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => pulse(...ui.spot(k));
  const view = (e) => VE.push({t: T, ...e});
  const curView = () => viewAt(VE, T, EXPLODE);

  // ------------------------------------------------------------ actions from the visitor
  const act = (req) => {
    takeOver();
    if (V.end - tau > MAX_BACKLOG) return null; // too far ahead: refuse safely
    if (tau < V.end - 1e-6 && paused) V.truncate(tau); // typing after a scrub back replaces the future
    return V.push(req, tau);
  };
  const typeChar = (ch, physicalShift) => {
    const m = charToKey(ch);
    if (!m) return false;
    const shifted = V.last.shift > 0.5;
    if (m.upper && !shifted) {
      act({type: 'shiftDown'});
      act({type: 'char', key: m.key});
      if (!physicalShift) act({type: 'shiftUp'});
    } else if (!m.upper && shifted && !V.last.lock && !physicalShift) {
      act({type: 'shiftUp'});
      act({type: 'char', key: m.key});
    } else act({type: 'char', key: m.key});
    return true;
  };
  const fnKey = (k) => {
    if (k.id === 'shiftL' || k.id === 'shiftR') act({type: V.last.shift > 0.5 ? 'shiftUp' : 'shiftDown'});
    else if (k.id === 'lock') act({type: 'lock'});
    else if (k.id === 'back') act({type: 'backspace'});
    else if (k.id === 'mrel') act({type: 'release'});
  };

  // ------------------------------------------------------------ console buttons
  const B = ui.btn;
  const on = (k, fn) =>
    B[k]?.addEventListener('click', (e) => {
      e.stopPropagation();
      takeOver();
      pulseBtn(k);
      fn();
    });
  for (const k of CAM_BUTTONS) on('cam_' + k, () => {
    Object.assign(off, {az: 0, el: 0, k: 1});
    view({cam: k, sub: 'reassemble'});
  });
  for (const k of SUB_BUTTONS) on('sub_' + k, () => {
    Object.assign(off, {az: 0, el: 0, k: 1});
    view({sub: k, cam: undefined});
  });
  on('xray', () => view({xray: !curView().xray}));
  on('cutaway', () => view({cutaway: !curView().cutaway}));
  on('reassemble', () => view({sub: 'reassemble', xray: false, cutaway: false, cam: curView().camId}));
  on('ret', () => act({type: 'ret'}));
  on('spacing', () => act({type: 'spacing'}));
  on('color', () => act({type: 'color'}));
  on('lockBtn', () => act({type: 'lock'}));
  on('pause', () => (paused = !paused));
  on('stepB', () => {
    paused = true;
    tau = Math.max(0, tau - 1 / 120);
  });
  on('stepF', () => {
    paused = true;
    tau += 1 / 120;
  });
  on('reset', () => {
    sid++;
    V = createSession();
    V.id = `v${sid}`;
    tau = 0;
    paused = false;
    heard = {S: null, tau: 0};
  });
  on('slow', () => (slow = !slow));
  on('mute', () => sound.setMuted(!sound.muted));
  for (const q of ['auto', 'high', 'balanced', 'low'])
    on('q_' + q, () => {
      quality = q;
      tier = q === 'auto' ? (coarse ? 'low' : 'high') : q;
      perf.slow = 0;
      perf.age = 0;
      applyTier();
    });
  on('panels', () => (panels = !panels));
  B.tour.addEventListener('click', (e) => {
    e.stopPropagation();
    lastInput = T;
    sound.unlock();
    if (tour.on) takeOver();
    else startTour();
  });
  ui.chip.addEventListener('click', (e) => {
    e.stopPropagation();
    lastInput = T;
    sound.unlock();
    if (tour.on) takeOver();
    else startTour();
  });

  // sliders: drag along the track, or arrow keys when focused
  const timeRange = () => {
    const t1 = Math.max(V.end, tau, 0.001);
    return [Math.max(0, t1 - 30), t1];
  };
  const sliderDefs = {
    speed: {get: () => speedI / (SPEEDS.length - 1), set: (k) => (speedI = Math.round(k * (SPEEDS.length - 1)))},
    time: {
      get: () => {
        const [a, b] = timeRange();
        return (tau - a) / (b - a || 1);
      },
      set: (k) => {
        const [a, b] = timeRange();
        paused = true;
        tau = a + k * (b - a);
      },
    },
    vol: {get: () => sound.volume, set: (k) => sound.setVolume(k)},
  };
  for (const [k, def] of Object.entries(sliderDefs)) {
    const sl = ui.sliders[k];
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      def.set(clamp((x - sl.x) / sl.w, 0, 1));
      lastInput = T;
    };
    sl.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      takeOver();
      sl.el.setPointerCapture(e.pointerId);
      move(e);
      const mv = (ev) => move(ev);
      const up = () => {
        sl.el.removeEventListener('pointermove', mv);
        sl.el.removeEventListener('pointerup', up);
      };
      sl.el.addEventListener('pointermove', mv);
      sl.el.addEventListener('pointerup', up);
    });
    sl.el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      e.stopPropagation();
      takeOver();
      const step = k === 'time' ? 0.02 : k === 'speed' ? 1 / (SPEEDS.length - 1) : 0.05;
      def.set(clamp(def.get() + (e.key === 'ArrowRight' ? step : -step), 0, 1));
    });
  }

  // ------------------------------------------------------------ keyboard
  const physical = {shift: false};
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target;
    const onControl = tgt && (tgt.tagName === 'BUTTON' || tgt.getAttribute?.('role') === 'slider');
    if (onControl && (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow'))) {
      takeOver();
      return; // let the focused control handle it
    }
    if (e.key === 'Tab') {
      takeOver();
      return;
    }
    let handled = true;
    if (e.key === 'Shift') {
      if (!e.repeat && !physical.shift) {
        physical.shift = true;
        act({type: 'shiftDown'});
      }
    } else if (e.key === 'CapsLock') act({type: 'lock'});
    else if (e.key === 'Enter') act({type: 'ret'});
    else if (e.key === 'Backspace') act({type: 'backspace'});
    else if (e.key === ' ') act({type: 'space'});
    else if (e.key === 'Escape') {
      takeOver();
      panels = !panels;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      takeOver();
      paused = true;
      tau = Math.max(0, tau + (e.key === 'ArrowRight' ? 1 : -1) / 120);
    } else if (e.key.length === 1) {
      takeOver();
      typeChar(e.key, physical.shift);
    } else handled = false;
    if (handled) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Shift' && physical.shift) {
      physical.shift = false;
      act({type: 'shiftUp'});
    }
  });
  addEventListener('blur', () => {
    if (physical.shift) {
      physical.shift = false;
      act({type: 'shiftUp'});
    }
  });

  // ------------------------------------------------------------ pointer: orbit, zoom, click the machine
  const canvas = st.renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'grab';
  let drag = null;
  const ray = new THREE.Raycaster();
  const pickables = () => {
    const out = [];
    for (const row of machine.parts.keys.perRow) out.push(row.caps);
    machine.nodes.spacebar[0].traverse((o) => o.isMesh && out.push(o));
    machine.nodes.return[0].traverse((o) => o.isMesh && out.push(o));
    return out;
  };
  const pick = (cx, cy) => {
    const [x, y] = toStage(cx, cy);
    const nd = new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1);
    ray.setFromCamera(nd, st.camera);
    const hit = ray.intersectObjects(pickables(), false)[0];
    if (!hit) return null;
    if (hit.object.isInstancedMesh && hit.object.userData.keys) return {key: hit.object.userData.keys[hit.instanceId]};
    let o = hit.object;
    while (o) {
      if (o.name === 'spacebar') return {space: true};
      if (o.name === 'return') return {ret: true};
      o = o.parent;
    }
    return null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    takeOver();
    drag = {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false};
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) {
      // hover: show a pointer over clickable parts
      const p = e.pointerType === 'mouse' ? pick(e.clientX, e.clientY) : null;
      canvas.style.cursor = p ? 'pointer' : 'grab';
      return;
    }
    const dx = (e.clientX - drag.x) / scale;
    const dy = (e.clientY - drag.y) / scale;
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) drag.moved = true;
    if (drag.moved) {
      off.az -= dx * 0.3;
      off.el = clamp(off.el + dy * 0.2, -25, 55);
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    lastInput = T;
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && e.type === 'pointerup') {
      const p = pick(e.clientX, e.clientY);
      if (p?.key) {
        if (p.key.kind === 'char') act({type: 'char', key: p.key.id});
        else fnKey(p.key);
      } else if (p?.space) act({type: 'space'});
      else if (p?.ret) act({type: 'ret'});
    }
    drag = null;
    canvas.style.cursor = 'grab';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0011), 0.35, 2.4);
    },
    {passive: false},
  );
  addEventListener('pointerdown', (e) => {
    if (e.target === ui.chip || e.target === B.tour) return;
    takeOver();
  });
  addEventListener('touchstart', () => takeOver(), {passive: true});

  // ------------------------------------------------------------ visibility: stop work when hidden
  let hidden = document.hidden;
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden) sound.suspend();
    else {
      sound.resume();
      last = performance.now();
    }
  });

  // ------------------------------------------------------------ the frame
  const perf = {n: 0, sum: 0, slow: 0, age: 0, fps: 60};
  let last = performance.now();
  let frameNo = 0;
  const camOverride = (cam) => ({...cam, az: cam.az + off.az, el: clamp(cam.el + off.el, -15, 85), d: cam.d * off.k});
  const frame = (now) => {
    requestAnimationFrame(frame);
    if (hidden) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    frameNo++;
    // automatic quality: step down while frames are slow
    perf.age += dt;
    perf.sum += dt;
    perf.n++;
    if (perf.sum >= 0.5) {
      perf.fps = perf.n / perf.sum;
      if (quality === 'auto' && perf.age > 1.2 && tier !== 'low') {
        perf.slow = perf.fps < 42 ? perf.slow + 1 : 0;
        if (perf.slow >= 2) {
          tier = tier === 'high' ? 'balanced' : 'low';
          applyTier();
          perf.slow = 0;
          perf.age = 0;
        }
      }
      perf.sum = 0;
      perf.n = 0;
    }
    // with reduced motion the tour never starts by itself (PLAY TOUR still works) — D-05
    if (!tour.on && !reduced && T - lastInput > IDLE && !drag) startTour();

    let F;
    let S;
    let tauNow;
    let cueRate;
    if (tour.on) {
      let t = T - tour.t0;
      if (t > DURATION) {
        startTour();
        t = 0;
      }
      S = tour.S;
      tauNow = tauAt(t);
      cueRate = speedAt(t);
      const ringK = Math.max(0, 1 - (T - ring.t) / 0.55);
      F = {
        S,
        tau: tauNow,
        viewEvents: VIEW_EVENTS,
        viewT: t,
        camOverride: reduced ? (c) => c : undefined,
        cursor: (project) => {
          const c = tour.cursor(t, ui.spot, project);
          return ringK > c.ring ? {...c, ring: ringK, ringX: ring.x, ringY: ring.y} : c;
        },
        ui: {paused: false, slow: cueRate < 0.7, muted: sound.muted, quality, panels, tour: true, sliders: sliderVals(cueRate, t / DURATION, `${t.toFixed(1)} / ${DURATION.toFixed(0)} S`), viewSub: viewSub()},
      };
      // tour button clicks make the soft UI tick
      for (const c of CLICKS) if (c.t > t - dt && c.t <= t) sound.schedule([{kind: 'ui', gain: 1, pitch: 1, offset: 0}]);
    } else {
      tau += dt * rate();
      S = V;
      tauNow = tau;
      cueRate = rate();
      const [a, b] = timeRange();
      const ringK = Math.max(0, 1 - (T - ring.t) / 0.55);
      F = {
        S,
        tau,
        viewEvents: VE,
        viewT: T,
        camOverride,
        cursor: {x: -99, y: -99, press: false, ring: ringK, ringX: ring.x, ringY: ring.y},
        ui: {paused, slow, muted: sound.muted, quality, panels, tour: false, sliders: sliderVals(SPEEDS[speedI] * (slow ? 0.25 : 1), (tau - a) / (b - a || 1), `${tau.toFixed(2)} S`), viewSub: viewSub()},
      };
    }
    F.heavy = tier !== 'low' || frameNo % 2 === 0;
    app.frame(F);
    // sound: cues from the session between what was heard and a short look-ahead, at their machine times
    if (cueRate > 0) {
      const look = tauNow + 0.06 * cueRate;
      if (heard.S !== S || heard.tau > tauNow + 1e-6 || tauNow - heard.tau > 0.5) heard = {S, tau: tauNow};
      const cues = S.cuesBetween(heard.tau, look);
      if (cues.length) sound.schedule(cues.map((c) => ({...c, dur: c.dur ? c.dur / cueRate : c.dur, offset: (c.t - tauNow) / cueRate})));
      heard.tau = look;
    } else heard = {S, tau: tauNow};
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      document.getElementById('boot')?.remove();
    }
  };
  function sliderVals(sp, tk, ttext) {
    return {
      speed: {k: clamp(speedI / (SPEEDS.length - 1), 0, 1), text: `${sp >= 1 ? sp.toFixed(1) : sp.toFixed(2)}×`},
      time: {k: clamp(tk, 0, 1), text: ttext},
      vol: {k: sound.volume, text: `${Math.round(sound.volume * 100)} %`},
    };
  }
  function viewSub() {
    return tour.on ? '' : paused ? 'PAUSED · ARROWS STEP · DRAG THE TIMELINE TO SCRUB' : '';
  }

  // every shader compiles before the first frame (kit/warm.js): draw one frame of each look first so materials with
  // their final defines exist, then compile all programs in parallel
  // ghosted (transparent) variants first, then the solid machine
  app.frame({S: tour.S, tau: 0, viewEvents: [{t: -99, cam: 'hero', xray: true, sub: 'linkage'}], viewT: 0, cursor: null, ui: {sliders: {}, panels: true}});
  machine.setAllGhost(true);
  await warmComposer(st.renderer, st.composer, st.scene, st.camera).catch(() => {});
  machine.setAllGhost(false);
  app.frame({S: tour.S, tau: 0, viewEvents: [{t: -99, cam: 'hero'}], viewT: 0, cursor: null, ui: {sliders: {}, panels: true}});
  await warmComposer(st.renderer, st.composer, st.scene, st.camera).catch(() => {});
  if (!tour.on) lastInput = 0;
  tour.t0 = T;
  last = performance.now();
  requestAnimationFrame(frame);
  window.LIVE = {
    get state() {
      return (tour.on ? tour.S : V).stateAt(tour.on ? tauAt(T - tour.t0) : tau);
    },
    get tour() {
      return tour.on;
    },
    get tier() {
      return tier;
    },
    get quality() {
      return quality;
    },
    get fps() {
      return perf.fps;
    },
    get session() {
      return tour.on ? tour.S : V;
    },
    get view() {
      return tour.on ? viewAt(VIEW_EVENTS, T - tour.t0, EXPLODE) : curView();
    },
    get paused() {
      return paused;
    },
    get panels() {
      return panels;
    },
    get muted() {
      return sound.muted;
    },
    get volume() {
      return sound.volume;
    },
    get offset() {
      return {...off};
    },
    idleFor: (s) => (lastInput = T - s),
    get T() {
      return T;
    },
    takeOver,
    startTour,
    keyScreen: (id) => app.keyScreen(typeof id === 'number' ? CHAR_KEYS[id] : FN_KEYS.find((k) => k.id === id)),
    partScreen: (n) => app.partScreen(n),
    get scale() {
      return scale;
    },
    FN_KEYS,
    CHAR_KEYS,
  };
}
