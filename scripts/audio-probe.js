// Test-only audio probe, injected before the page loads (Playwright addInitScript). It wraps the page's AudioContext
// so every connection into ctx.destination is also routed into an AnalyserNode, then samples that analyser on every
// animation frame: window.__AUDIO.peak/rms windows show what really reaches the speakers, independently of the app's
// own bookkeeping. It also logs each context's state changes and every scheduled source start.
(() => {
  const A = (window.__AUDIO = {created: 0, log: [], starts: 0, frames: [], ctxs: []});
  const Base = window.AudioContext || window.webkitAudioContext;
  if (!Base) return;
  const now = () => +(performance.now() / 1000).toFixed(3);
  class Probe extends Base {
    constructor(...args) {
      super(...args);
      A.created++;
      A.ctxs.push(this);
      A.log.push({t: now(), ev: 'created', state: this.state, activation: navigator.userActivation ? navigator.userActivation.isActive : null});
      this.addEventListener('statechange', () => A.log.push({t: now(), ev: 'state', state: this.state}));
      this.__an = super.createAnalyser.call(this);
      this.__an.fftSize = 2048;
      this.__buf = new Float32Array(2048);
    }
  }
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (dst && dst === this.context.destination && this.context.__an && this !== this.context.__an) connect.call(this, this.context.__an);
    return connect.call(this, dst, ...rest);
  };
  // every voice start (buffer sources have their own start(), oscillators inherit the scheduled-source one)
  for (const P of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype, OscillatorNode.prototype]) {
    if (!Object.prototype.hasOwnProperty.call(P, 'start')) continue;
    const start = P.start;
    P.start = function (...a) {
      A.starts++;
      return start.apply(this, a);
    };
  }
  window.AudioContext = Probe;
  if (window.webkitAudioContext) window.webkitAudioContext = Probe;
  const tick = () => {
    for (const c of A.ctxs) {
      if (c.state !== 'running') continue;
      c.__an.getFloatTimeDomainData(c.__buf);
      let pk = 0;
      let ss = 0;
      for (const v of c.__buf) {
        pk = Math.max(pk, Math.abs(v));
        ss += v * v;
      }
      A.frames.push([now(), pk, Math.sqrt(ss / c.__buf.length)]);
      if (A.frames.length > 20000) A.frames.splice(0, 5000);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  /** peak and rms of what reached the destination between wall times a and b (seconds, performance clock) */
  A.window = (a, b) => {
    let pk = 0;
    let rms = 0;
    let n = 0;
    for (const [t, p, r] of A.frames)
      if (t >= a && t <= b) {
        pk = Math.max(pk, p);
        rms = Math.max(rms, r);
        n++;
      }
    return {peak: +pk.toFixed(4), rms: +rms.toFixed(4), samples: n};
  };
  A.now = now;
  A.state = () => A.ctxs.map((c) => c.state);
})();
