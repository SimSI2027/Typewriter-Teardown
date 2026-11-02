// The film: the automatic tour rendered as a pure function of time for frame-by-frame capture. window.SIM.render(t)
// draws tour second t from scratch (any order); window.SIM.renderAudio() renders the soundtrack offline from the same
// session's cues (machine time mapped back to tour time) and returns it as a base64 WAV.
import {createApp} from './app.js';
import {cuesBetween} from './model.js';
import {buildTourSession, CLICKS, DURATION, makeCursor, speedAt, tAtTau, tauAt, VIEW_EVENTS, BEATS} from './tour.js';
import {renderOffline} from './sound.js';

const speedText = (v) => (v >= 0.995 ? `${v.toFixed(1)}×` : `${v.toFixed(2)}×`);

export async function runFilm() {
  const app = createApp({capture: true});
  const {S, presses} = buildTourSession();
  const cursorAt = makeCursor(presses);
  const dpr = window.devicePixelRatio || 1;
  app.st.resize(1600, 900, dpr);
  if (new URLSearchParams(location.search).has('lo')) app.st.setQuality('balanced');
  const render = (t) => {
    t = Math.min(DURATION, Math.max(0, t));
    const tau = tauAt(t);
    const sp = speedAt(t);
    app.frame({
      S,
      tau,
      viewEvents: VIEW_EVENTS,
      viewT: t,
      cursor: (project) => cursorAt(t, app.ui.spot, project),
      ui: {
        paused: false,
        slow: sp < 0.7,
        muted: false,
        quality: 'high',
        panels: true,
        tour: true,
        sliders: {
          speed: {k: Math.min(1, sp / 2), text: speedText(sp)},
          time: {k: t / DURATION, text: `${t.toFixed(1)} / ${+DURATION.toFixed(1)} S`},
          vol: {k: 0.7, text: '70 %'},
        },
        viewSub: '',
        sound: 'on',
      },
    });
  };
  const cues = () => {
    const out = cuesBetween(S, 0, S.end + 1).map((c) => ({...c, t: tAtTau(c.t), dur: c.dur ? c.dur / Math.max(0.05, speedAt(tAtTau(c.t))) : c.dur}));
    for (const c of CLICKS) out.push({t: c.t, kind: 'ui', gain: 1, pitch: 1});
    return out.sort((a, b) => a.t - b.t);
  };
  window.SIM = {
    duration: DURATION,
    fps: 60,
    ready: true,
    render,
    beats: BEATS.map((b) => b.t),
    /** validation: the tour's machine at tour time t under any view (cam / sub / xray / cutaway) */
    preview(t, v) {
      app.frame({S, tau: tauAt(t), viewEvents: [{t: -99, ...v}], viewT: 99, cursor: null, ui: {sliders: {}, panels: true, tour: false}});
    },
    /** validation: the tour's machine at tour time t under a list of view events, seen at view time viewT
     *  (scrubs a view transition: events [{t:-99, ...from}, {t:0, ...to}], viewT = seconds since the change) */
    view(t, events, viewT, cam) {
      const camOverride = cam ? (c) => ({...c, sx: 0, sy: 0, ...cam}) : undefined;
      app.frame({S, tau: tauAt(t), viewEvents: events, viewT, camOverride, cursor: null, ui: {sliders: {}, panels: !cam, tour: false}});
    },
    /** validation: world-space boxes of every mesh (per instance for instanced meshes), grouped by assembly */
    boxes() {
      return app.boxes();
    },
    cues,
    async renderAudio() {
      const bytes = await renderOffline(cues(), DURATION);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
  };
  document.getElementById('boot')?.remove();
  render(0);
}
