// The live page. The experience is an explicit state machine (src/experience.js): the tour plays by itself; PAUSE
// freezes it; any machine control, key, view control, orbit drag or zoom hands the machine to the visitor (manual)
// with the tour's position held; RESUME continues from exactly there; RESTART TOUR is the only way back to 0; 25 s of
// quiet resumes it; the finished tour holds, then loops. Sound, quality, panels and the tour transport never take
// over. The visitor's machine is a session too: inputs become actions at the current machine time τ; τ advances with
// the playback speed and can be paused, stepped and scrubbed.
import * as THREE from 'three';
import {createApp} from './app.js';
import {createExperience} from './experience.js';
import {charToKey, CHAR_KEYS, FN_KEYS} from './keyboard.js';
import {createSession} from './model.js';
import {EXPERIENCE, EXPLODE} from './params.js';
import {TIERS} from './stage.js';
import {createSound} from './sound.js';
import {buildTourSession, CLICKS, DURATION, makeCursor, speedAt, tauAt, VIEW_EVENTS} from './tour.js';
import {CAM_BUTTONS, easeView, SUB_BUTTONS, viewAt} from './views.js';
import {warmComposer} from './kit/warm.js';

const W = 1600;
const H = 900;
const MAX_BACKLOG = 8; // seconds of queued machine time before further typing is refused
const LOOK = 0.1; // s of wall time the sound is scheduled ahead
const LATE = 0.12; // s of wall time a cue may run late after a slow frame (it then plays at once)
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SPEEDS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
const DUR_TEXT = +DURATION.toFixed(1);

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
  const X = createExperience({duration: DURATION, reduced});
  // the tour: one immutable session, cursor and view script, built once (resume and restart only move the clock)
  const tour = (() => {
    const {S, presses} = buildTourSession();
    return {S, cursor: makeCursor(presses)};
  })();
  let sid = 1;
  let V = createSession();
  V.id = `v${sid}`;
  let tau = 0; // visitor machine time
  let machinePaused = false; // the visitor's machine clock (manual modes); never the tour's
  let speedI = 4;
  let slow = false;
  let panels = true;
  let VE = [{t: -99, cam: 'hero'}]; // visitor view events (wall time)
  const off = {az: 0, el: 0, k: 1};
  let ring = {t: -9, x: 0, y: 0};
  let heard = {S: null, at: 0, fresh: true, keys: new Map()};
  let blend = null; // {cam, look, T0}: the view a resumed / restarted tour blends in from
  let lastDrawn = null; // {cam, look, view, cursor} of the last frame drawn
  // catch-up: while keystrokes are queued, machine time runs faster (up to 5×) so a typist is never left behind;
  // with nothing queued it runs at the chosen speed. Slow motion and pause are never overridden.
  const rate = () => {
    if (machinePaused) return 0;
    const base = SPEEDS[speedI] * (slow ? 0.25 : 1);
    if (slow || speedI < 4) return base;
    const backlog = Math.max(0, V.end - tau);
    return base * Math.min(5, 1 + backlog * 1.6);
  };

  /** the visitor gets the machine as the tour left it at tour time t: paper, carriage, view (no jump anywhere) */
  const handOver = (t) => {
    const tt = tauAt(t);
    const S = tour.S;
    const s = S.stateAt(tt);
    const i = S.indexAt(tt);
    const inProgress = i >= 0 && tt < S.acts[i].t0 + S.acts[i].dur;
    const done = i >= 0 ? (inProgress ? S.acts[i].before : S.acts[i].after) : S.init;
    sid++;
    V = createSession({initial: {...done, bellAt: -1e9}});
    V.id = `v${sid}`;
    tau = 0;
    machinePaused = false;
    // the printed sheet carries over (a stroke in progress re-adds its own glyph when it completes below)
    const a = inProgress ? S.acts[i] : null;
    const carry = a && a.glyphIdx != null ? a.glyphIdx : s.glyphCount;
    for (let g = 0; g < carry; g++) V.glyphs.push({...S.glyphs[g], t: -1});
    // an action in progress finishes in the visitor's session
    if (a) V.push({type: a.type === 'locked' ? 'char' : a.type, key: a.key, value: a.value}, -(tt - a.t0));
    // the tour's view events so far, moved onto the wall clock: a transition in progress carries on (D-07)
    // (the tour's first event, at t = 0, sets the hero view; no extra start event, or the camera drift would restart)
    VE = VIEW_EVENTS.filter((e) => e.t <= t).map((e) => ({...e, t: T - (t - e.t)}));
    if (!VE.length) VE = [{t: -99, cam: 'hero'}];
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  /** side effects of an experience transition */
  const onTransition = (e) => {
    if (!e) return e;
    if (e.type === 'takeover' || e.type === 'complete') handOver(X.tourT);
    if ((e.type === 'resume' || e.type === 'restart') && lastDrawn) {
      // the tour's camera and look take over from whatever the visitor was looking at, without a cut
      blend = {cam: {...lastDrawn.cam}, look: structuredClone(lastDrawn.look), T0: T};
      Object.assign(off, {az: 0, el: 0, k: 1});
    }
    return e;
  };
  const takeOver = () => onTransition(X.takeover(T));
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => {
    ui.press(k);
    pulse(...ui.spot(k));
  };
  const view = (e) => VE.push({t: T, ...e});
  const curView = () => viewAt(VE, T, EXPLODE, undefined, reduced ? 0 : 1);

  // ------------------------------------------------------------ sound: every gesture may unlock it
  // (capture phase, so it runs before any handler; it never takes over and never changes the visitor's settings)
  let soundAtPress = sound.status; // the sound state when the current gesture began
  const gestureStart = () => {
    soundAtPress = sound.status;
    sound.unlock();
  };
  addEventListener('pointerdown', gestureStart, true);
  addEventListener('keydown', gestureStart, true);
  for (const ev of ['pointerup', 'touchend', 'click']) addEventListener(ev, () => sound.unlock(), true);
  const soundButton = () => {
    sound.unlock();
    if (soundAtPress === 'locked') return; // this press is the one that enabled sound
    if (soundAtPress === 'off') sound.setMuted(false);
    else if (soundAtPress === 'on') sound.setMuted(true);
  };

  // ------------------------------------------------------------ actions from the visitor
  const act = (req) => {
    takeOver();
    if (V.end - tau > MAX_BACKLOG) return null; // too far ahead: refuse safely
    if (tau < V.end - 1e-6 && machinePaused) V.truncate(tau); // typing after a scrub back replaces the future
    return V.push(req, tau);
  };
  const typeChar = (ch, physicalShift) => {
    const m = charToKey(ch);
    if (!m) return false;
    takeOver(); // first: the shift state below must be the machine the visitor is taking over
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
    takeOver();
    if (k.id === 'shiftL' || k.id === 'shiftR') act({type: V.last.shift > 0.5 ? 'shiftUp' : 'shiftDown'});
    else if (k.id === 'lock') act({type: 'lock'});
    else if (k.id === 'back') act({type: 'backspace'});
    else if (k.id === 'mrel') act({type: 'release'});
  };
  /** step: the tour's clock while the tour is on screen, the visitor's machine clock otherwise */
  const step = (dir) => {
    if (X.showsTour) onTransition(X.seek(T, X.tourT + dir / 60));
    else {
      machinePaused = true;
      tau = Math.max(0, tau + dir / 120);
    }
  };

  // ------------------------------------------------------------ console buttons
  const B = ui.btn;
  // kind: 'takeover' (the visitor takes the machine), 'keep' (the tour keeps playing)
  const on = (k, fn, kind = 'takeover') =>
    B[k]?.addEventListener('click', (e) => {
      e.stopPropagation();
      X.input(T);
      if (kind === 'takeover') takeOver();
      pulseBtn(k);
      fn();
    });
  for (const k of CAM_BUTTONS)
    on('cam_' + k, () => {
      Object.assign(off, {az: 0, el: 0, k: 1});
      view({cam: k, sub: 'reassemble'});
    });
  for (const k of SUB_BUTTONS)
    on('sub_' + k, () => {
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
  on('reset', () => {
    sid++;
    V = createSession();
    V.id = `v${sid}`;
    tau = 0;
    machinePaused = false;
  });
  on('slow', () => (slow = !slow));
  // the transport row drives whatever is playing: the tour while it is on screen, the visitor's machine otherwise
  on('pause', () => (X.showsTour ? onTransition(X.toggle(T)) : (machinePaused = !machinePaused)), 'keep');
  on('stepB', () => step(-1), 'keep');
  on('stepF', () => step(1), 'keep');
  on('mute', soundButton, 'keep');
  on('sound', soundButton, 'keep');
  for (const q of ['auto', 'high', 'balanced', 'low'])
    on(
      'q_' + q,
      () => {
        quality = q;
        tier = q === 'auto' ? (coarse ? 'low' : 'high') : q;
        perf.slow = 0;
        perf.age = 0;
        applyTier();
      },
      'keep',
    );
  on('panels', () => (panels = !panels), 'keep');
  on('tourMain', () => onTransition(X.toggle(T)), 'keep');
  on('tourRestart', () => onTransition(X.restart(T)), 'keep');

  // sliders: drag along the track, or arrow keys when focused
  const timeRange = () => {
    const t1 = Math.max(V.end, tau, 0.001);
    return [Math.max(0, t1 - 30), t1];
  };
  const sliderDefs = {
    speed: {kind: 'takeover', get: () => speedI / (SPEEDS.length - 1), set: (k) => (speedI = Math.round(k * (SPEEDS.length - 1)))},
    time: {
      kind: 'keep',
      get: () => {
        if (X.showsTour) return X.tourT / DURATION;
        const [a, b] = timeRange();
        return (tau - a) / (b - a || 1);
      },
      set: (k) => {
        if (X.showsTour) return onTransition(X.seek(T, k * DURATION)); // scrub the tour (it stays paused)
        const [a, b] = timeRange();
        machinePaused = true;
        tau = a + k * (b - a);
      },
    },
    vol: {kind: 'keep', get: () => sound.volume, set: (k) => sound.setVolume(k)},
  };
  for (const [k, def] of Object.entries(sliderDefs)) {
    const sl = ui.sliders[k];
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      def.set(clamp((x - sl.x) / sl.w, 0, 1));
      X.input(T);
    };
    sl.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      X.input(T);
      if (def.kind === 'takeover') takeOver();
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
      X.input(T);
      if (def.kind === 'takeover') takeOver();
      const stp = k === 'time' ? 0.02 : k === 'speed' ? 1 / (SPEEDS.length - 1) : 0.05;
      def.set(clamp(def.get() + (e.key === 'ArrowRight' ? stp : -stp), 0, 1));
    });
  }

  // ------------------------------------------------------------ keyboard
  const physical = {shift: false};
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    X.input(T);
    const tgt = e.target;
    const onControl = tgt && (tgt.tagName === 'BUTTON' || tgt.getAttribute?.('role') === 'slider');
    if (onControl && (e.key === 'Enter' || e.key === ' ' || e.key.startsWith('Arrow'))) return; // the focused control handles it
    if (e.key === 'Tab') return; // moving focus is not a takeover
    let handled = true;
    if (e.key === 'Shift') {
      if (!e.repeat && !physical.shift) {
        physical.shift = true;
        takeOver();
        if (V.last.shift < 0.5) act({type: 'shiftDown'});
      }
    } else if (e.key === 'CapsLock') act({type: 'lock'});
    else if (e.key === 'Enter') act({type: 'ret'});
    else if (e.key === 'Backspace') act({type: 'backspace'});
    else if (e.key === ' ') act({type: 'space'});
    else if (e.key === 'Escape') panels = !panels;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') step(e.key === 'ArrowRight' ? 1 : -1);
    else if (e.key.length === 1) typeChar(e.key, physical.shift);
    else handled = false;
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
  // A press on the machine is not yet a takeover: it becomes one when it turns into a drag (orbit) or lands on a key,
  // the space bar or the return lever. A plain click on empty space only wakes the sound.
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
    X.input(T);
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
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > EXPERIENCE.dragStart) {
      drag.moved = true;
      takeOver(); // an orbit drag is the visitor taking the camera
    }
    if (drag.moved) {
      off.az -= dx * 0.3;
      off.el = clamp(off.el + dy * 0.2, -25, 55);
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
    X.input(T);
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && e.type === 'pointerup') {
      const p = pick(e.clientX, e.clientY);
      if (p) pulse(...toStage(e.clientX, e.clientY));
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
  // moving the pointer over the page counts as using it (no automatic resume under an active visitor)
  addEventListener('pointermove', () => X.input(T), {passive: true});

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
  const cueKey = (c) => `${c.kind}@${c.t.toFixed(6)}`;
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
    // the experience clock: the tour advances, completes, or comes back after quiet (never mid-drag, never while the
    // visitor's own machine is still working through their keystrokes, never while they hold their machine paused)
    const busy = X.showsVisitor && !machinePaused && V.end > tau + 1e-6;
    onTransition(X.tick(T, dt, {active: !!drag || busy, held: X.showsVisitor && machinePaused}));

    let F;
    let S;
    let tauNow;
    let cueRate;
    const ringK = Math.max(0, 1 - (T - ring.t) / 0.55);
    if (X.showsTour) {
      const t = X.tourT;
      S = tour.S;
      tauNow = tauAt(t);
      cueRate = X.mode === 'tour' ? speedAt(t) : 0;
      F = {
        S,
        tau: tauNow,
        viewEvents: VIEW_EVENTS,
        viewT: t,
        drift: reduced ? 0 : 1,
        cursor: (project) => {
          const c = tour.cursor(t, ui.spot, project);
          return ringK > c.ring ? {...c, ring: ringK, ringX: ring.x, ringY: ring.y} : c;
        },
        ui: {slow: speedAt(t) < 0.7, quality, panels, tour: true, sliders: sliderVals(speedAt(t), t / DURATION, `${t.toFixed(1)} / ${DUR_TEXT} S`, speedAt(t) / 2), viewSub: viewSub()},
      };
      // the tour's button clicks make the soft UI tick
      if (X.mode === 'tour') for (const c of CLICKS) if (c.t > t - dt && c.t <= t) sound.schedule([{kind: 'ui', gain: 1, pitch: 1, offset: 0}]);
    } else {
      tau += dt * rate();
      S = V;
      tauNow = tau;
      cueRate = rate();
      const [a, b] = timeRange();
      F = {
        S,
        tau,
        viewEvents: VE,
        viewT: T,
        drift: reduced ? 0 : 1,
        camOverride,
        cursor: {x: -99, y: -99, press: false, ring: ringK, ringX: ring.x, ringY: ring.y},
        ui: {slow, quality, panels, tour: false, sliders: sliderVals(SPEEDS[speedI] * (slow ? 0.25 : 1), (tau - a) / (b - a || 1), `${tau.toFixed(2)} S`), viewSub: viewSub()},
      };
    }
    // a resumed / restarted tour blends in from the visitor's view (any mode: a takeover during the blend keeps it)
    if (blend) {
      const k = (T - blend.T0) / EXPERIENCE.resumeBlend;
      if (k >= 1) blend = null;
      else F.blend = {cam: blend.cam, look: blend.look, k: easeView(k)};
    }
    Object.assign(F.ui, {pauseLabel: pauseLabel(), sound: sound.status, status: status()});
    F.heavy = tier !== 'low' || frameNo % 2 === 0;
    const {v} = app.frame(F);
    lastDrawn = {cam: v.cam, look: v.look, view: v};
    // sound: every cue of the session from now to a short look-ahead, each scheduled exactly once at its machine time
    // (a new session or a jump back starts afresh; a jump forward — a scrub, a step, a long frame — skips what it
    // jumped over but keeps the record of what is already scheduled, so nothing ever plays twice)
    if (heard.S !== S || tauNow < heard.at - 1e-6) heard = {S, at: tauNow, fresh: true, keys: new Map()};
    else if ((cueRate === 0 && tauNow !== heard.at) || tauNow - heard.at > (LOOK + LATE) * Math.max(1, cueRate)) heard.fresh = true;
    if (cueRate > 0) {
      const from = heard.fresh ? tauNow : tauNow - LATE * cueRate;
      const cues = S.cuesBetween(from, tauNow + LOOK * cueRate).filter((c) => !heard.keys.has(cueKey(c)));
      for (const c of cues) heard.keys.set(cueKey(c), c.t);
      if (cues.length) sound.schedule(cues.map((c) => ({...c, dur: c.dur ? c.dur / cueRate : c.dur, offset: (c.t - tauNow) / cueRate})));
      for (const [k, t] of heard.keys) if (t < from - 1) heard.keys.delete(k);
      heard.fresh = false;
    }
    heard.at = tauNow;
    sound.sample();
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      document.getElementById('boot')?.remove();
    }
  };
  function sliderVals(sp, tk, ttext, spk = speedI / (SPEEDS.length - 1)) {
    return {
      speed: {k: clamp(spk, 0, 1), text: `${sp >= 1 ? sp.toFixed(1) : sp.toFixed(2)}×`},
      time: {k: clamp(tk, 0, 1), text: ttext},
      vol: {k: sound.volume, text: `${Math.round(sound.volume * 100)} %`},
    };
  }
  function pauseLabel() {
    if (X.showsTour) return X.mode === 'tour' ? 'PAUSE' : 'RESUME';
    return machinePaused ? 'PLAY' : 'PAUSE';
  }
  function status() {
    const m = X.mode;
    const t = X.tourT.toFixed(1);
    const auto = X.autoIn(T);
    const resumeLabel = X.started ? 'RESUME TOUR' : 'PLAY TOUR';
    if (m === 'tour') return {mode: m, text: `TOUR · ${t} / ${DUR_TEXT} S`, main: 'PAUSE TOUR', restart: true};
    if (m === 'paused') return {mode: m, text: `PAUSED · ${t} / ${DUR_TEXT} S`, main: 'RESUME TOUR', restart: true};
    if (m === 'idle') return {mode: m, text: `MANUAL · TOUR RESUMES IN ${Math.ceil(auto)} S`, main: resumeLabel, restart: true};
    if (m === 'complete') return {mode: m, text: auto != null && auto <= EXPERIENCE.completeHold ? `TOUR COMPLETE · AGAIN IN ${Math.ceil(auto)} S` : 'TOUR COMPLETE', main: 'RESTART TOUR', restart: false};
    if (m === 'manual') return {mode: m, text: X.started ? `MANUAL · TOUR HELD AT ${t} S` : reduced ? 'MANUAL · REDUCED MOTION' : 'MANUAL', main: resumeLabel, restart: X.started};
    return {mode: m, text: 'LOADING', main: 'PAUSE TOUR', restart: false};
  }
  function viewSub() {
    if (X.mode === 'paused') return 'TOUR PAUSED · ARROWS STEP · DRAG THE TIMELINE TO SCRUB';
    if (X.showsTour) return '';
    if (machinePaused) return 'MACHINE PAUSED · ARROWS STEP · DRAG THE TIMELINE TO SCRUB';
    if (V.end <= tau + 1e-6) return 'YOUR MACHINE · TYPE OR CLICK A KEY TO RUN IT';
    return '';
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
  onTransition(X.ready(T));
  last = performance.now();
  requestAnimationFrame(frame);
  window.LIVE = {
    get state() {
      return (X.showsTour ? tour.S : V).stateAt(X.showsTour ? tauAt(X.tourT) : tau);
    },
    /** the experience state machine: mode, tour position, how the tour run began, quiet time, countdown */
    get experience() {
      return {...X.snapshot(T), machinePaused, blending: !!blend};
    },
    get mode() {
      return X.mode;
    },
    get tourT() {
      return X.tourT;
    },
    get tour() {
      return X.mode === 'tour';
    },
    get transitions() {
      return X.log.map((e) => ({...e}));
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
      return X.showsTour ? tour.S : V;
    },
    get view() {
      return X.showsTour ? viewAt(VIEW_EVENTS, X.tourT, EXPLODE, undefined, reduced ? 0 : 1) : curView();
    },
    /** what the last frame actually drew (after any resume blend) */
    get drawn() {
      return lastDrawn ? {cam: {...lastDrawn.cam}, camId: lastDrawn.view.camId, sub: lastDrawn.view.sub, k: lastDrawn.view.k} : null;
    },
    get cursorShown() {
      const c = document.querySelector('.cur');
      return !!c && c.style.display !== 'none';
    },
    get machinePaused() {
      return machinePaused;
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
    /** the sound engine as the visitor would hear it: state, settings, cues played, the output meter */
    get audio() {
      return {state: sound.state, status: sound.status, muted: sound.muted, volume: sound.volume, gain: sound.gain, time: sound.time, ...sound.stats, byKind: {...sound.stats.byKind}};
    },
    get offset() {
      return {...off};
    },
    /** tests: pretend the visitor has been quiet for s seconds */
    idleFor: (s) => X.input(T - s),
    get T() {
      return T;
    },
    takeOver,
    pause: () => onTransition(X.pause(T)),
    resume: () => onTransition(X.resume(T)),
    restart: () => onTransition(X.restart(T)),
    seek: (t) => onTransition(X.seek(T, t)),
    keyScreen: (id) => app.keyScreen(typeof id === 'number' ? CHAR_KEYS[id] : FN_KEYS.find((k) => k.id === id)),
    partScreen: (n) => app.partScreen(n),
    get scale() {
      return scale;
    },
    FN_KEYS,
    CHAR_KEYS,
  };
}
