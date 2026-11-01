// Mechanical sound, synthesised (no samples). Every cue comes from the model's actions (model.actionCues), so a sound
// can only happen when the corresponding part moves: the key click when the key bottoms, the slug's clack at impact,
// the escapement tick when the loose dog lets go, the carriage step when the rigid dog lets go, the ratchet click per
// line-space tooth, the bell when the margin stop trips the hammer. The same voices play live (scheduled a few ms
// ahead) and offline (OfflineAudioContext) for the film's soundtrack.

// a deterministic noise buffer (mulberry32), shared by every voice
function noiseBuffer(ctx, seconds = 1.5) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 0x9e3779b9;
  for (let i = 0; i < n; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    d[i] = (((x ^ (x >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return b;
}

function voices(ctx, out) {
  const noise = noiseBuffer(ctx);
  let noiseOff = 0;
  const env = (g, t, a, peak, d, curve = 'exp') => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    else g.gain.linearRampToValueAtTime(0.0001, t + a + d);
  };
  const burst = (t, {f = 3000, q = 1, type = 'bandpass', a = 0.0008, d = 0.02, gain = 0.3, pan = 0}) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = ctx.createGain();
    env(g, t, a, gain, d);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(flt).connect(g);
    if (p) {
      p.pan.value = pan;
      g.connect(p).connect(out);
    } else g.connect(out);
    noiseOff = (noiseOff + 0.137) % 1.2;
    src.start(t, noiseOff, a + d + 0.02);
  };
  const tone = (t, {f = 200, f1 = null, a = 0.002, d = 0.05, gain = 0.3, type = 'sine', pan = 0}) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    const g = ctx.createGain();
    env(g, t, a, gain, d);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(g);
    if (p) {
      p.pan.value = pan;
      g.connect(p).connect(out);
    } else g.connect(out);
    o.start(t);
    o.stop(t + a + d + 0.03);
  };
  const V = {
    keyTouch: (t, g, k) => burst(t, {f: 3600 * k, q: 1.4, d: 0.012, gain: 0.16 * g}),
    keyBottom: (t, g) => {
      tone(t, {f: 210, f1: 140, d: 0.045, gain: 0.32 * g});
      burst(t, {f: 1400, q: 0.9, d: 0.03, gain: 0.16 * g});
    },
    linkage: (t, g) => burst(t, {f: 2300, q: 2.5, d: 0.03, gain: 0.07 * g}),
    impact: (t, g, k) => {
      // the clack: a sharp transient, a short resonant body, a low knock through the frame
      burst(t, {f: 5200 * k, q: 0.7, type: 'highpass', a: 0.0004, d: 0.012, gain: 0.55 * g});
      burst(t, {f: 1150 * k, q: 7, a: 0.0006, d: 0.07, gain: 0.5 * g});
      tone(t, {f: 120, f1: 80, a: 0.001, d: 0.06, gain: 0.42 * g});
    },
    escTick: (t, g, k) => burst(t, {f: 6200 * k, q: 9, a: 0.0004, d: 0.012, gain: 0.22 * g, pan: 0.1}),
    carriageStep: (t, g) => {
      burst(t, {f: 2600, q: 5, a: 0.0005, d: 0.02, gain: 0.22 * g, pan: -0.15});
      tone(t, {f: 330, f1: 240, a: 0.001, d: 0.03, gain: 0.16 * g, pan: -0.15});
    },
    ribbonFeed: (t, g) => burst(t, {f: 7600, q: 10, a: 0.0003, d: 0.006, gain: 0.12 * g}),
    barRest: (t, g) => tone(t, {f: 260, f1: 180, d: 0.03, gain: 0.12 * g}),
    spaceTouch: (t, g) => burst(t, {f: 1800, q: 1.2, d: 0.02, gain: 0.14 * g}),
    spaceRest: (t, g) => tone(t, {f: 150, f1: 110, d: 0.06, gain: 0.26 * g}),
    pawl: (t, g) => burst(t, {f: 4200, q: 8, d: 0.015, gain: 0.2 * g, pan: 0.2}),
    shiftThunk: (t, g, k) => {
      tone(t, {f: 95 * k, f1: 70 * k, a: 0.003, d: 0.1, gain: 0.45 * g});
      burst(t, {f: 900, q: 1.5, d: 0.06, gain: 0.18 * g});
    },
    latch: (t, g, k) => burst(t, {f: 2400 * k, q: 6, d: 0.014, gain: 0.18 * g}),
    leverGrab: (t, g) => burst(t, {f: 1600, q: 3, d: 0.025, gain: 0.12 * g, pan: -0.4}),
    ratchet: (t, g, k) => {
      burst(t, {f: 3400 * k, q: 12, a: 0.0004, d: 0.02, gain: 0.32 * g, pan: -0.45});
      burst(t + 0.006, {f: 5200 * k, q: 8, a: 0.0003, d: 0.01, gain: 0.16 * g, pan: -0.45});
    },
    carriageRun: (t, g, k, c) => {
      // the carriage running back on its rails, the pinion pawl clicking over the pinion teeth
      const dur = c.dur || 0.6;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.Q.value = 1.6;
      flt.frequency.setValueAtTime(520, t);
      flt.frequency.linearRampToValueAtTime(880, t + dur * 0.5);
      flt.frequency.linearRampToValueAtTime(640, t + dur);
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, t);
      gg.gain.linearRampToValueAtTime(0.13 * g, t + dur * 0.25);
      gg.gain.linearRampToValueAtTime(0.1 * g, t + dur * 0.8);
      gg.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.connect(flt).connect(gg).connect(out);
      src.start(t, 0.2, dur + 0.05);
      const clicks = Math.max(2, Math.round((c.travel || 30) / 3));
      for (let i = 0; i < clicks; i++) {
        // carriage travel eases in and out: clicks bunch in the middle, as the pinion spins fastest there
        const u = (i + 0.5) / clicks;
        const tt = t + dur * (0.5 - Math.cos(Math.PI * u) / 2) ** 0.9;
        burst(tt, {f: 4800, q: 9, a: 0.0003, d: 0.006, gain: 0.07 * g, pan: 0.05});
      }
    },
    marginStop: (t, g) => {
      tone(t, {f: 118, f1: 70, a: 0.002, d: 0.12, gain: 0.55 * g, pan: 0.3});
      burst(t, {f: 1200, q: 1.2, d: 0.05, gain: 0.25 * g, pan: 0.3});
    },
    leverBack: (t, g) => burst(t, {f: 2000, q: 3, d: 0.02, gain: 0.1 * g, pan: -0.4}),
    lockThud: (t, g) => tone(t, {f: 140, f1: 100, d: 0.05, gain: 0.25 * g}),
    bell: (t, g) => {
      // a struck steel dome: inharmonic partials, a long decay
      for (const [f, a, d] of [[2380, 0.32, 1.6], [2380 * 2.71, 0.12, 0.9], [2380 * 5.17, 0.05, 0.5], [2380 * 0.5, 0.05, 0.8]]) tone(t, {f, a: 0.0015, d, gain: a * g, pan: -0.5});
      burst(t, {f: 6000, q: 2, a: 0.0004, d: 0.01, gain: 0.12 * g, pan: -0.5});
    },
    ui: (t, g) => burst(t, {f: 3000, q: 4, d: 0.01, gain: 0.05 * g}),
  };
  return (c, when) => {
    const fn = V[c.kind];
    if (fn) fn(when, c.gain ?? 1, c.pitch ?? 1, c);
  };
}

export function createSound() {
  let ctx = null;
  let master = null;
  let play = null;
  let muted = false;
  let volume = 0.7;
  const ensure = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({latencyHint: 'interactive'});
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp).connect(ctx.destination);
    play = voices(ctx, master);
    return ctx;
  };
  return {
    /** call from a user gesture (browsers block audio until one) */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    get ready() {
      return !!ctx && ctx.state === 'running';
    },
    /** schedule cues; each cue's offset is seconds from now */
    schedule(cues) {
      if (!ctx || ctx.state !== 'running' || muted) return;
      const now = ctx.currentTime + 0.025;
      for (const c of cues) play(c, now + Math.max(0, c.offset));
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.setTargetAtTime(m ? 0 : volume, ctx.currentTime, 0.02);
    },
    setVolume(v) {
      volume = Math.min(1, Math.max(0, v));
      if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    suspend() {
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },
    resume() {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
  };
}

/** render cues [{t (seconds), kind, gain, pitch, ...}] to a 48 kHz stereo WAV (bytes) offline */
export async function renderOffline(cues, duration, sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  const play = voices(ctx, master);
  for (const c of cues) if (c.t >= 0 && c.t < duration) play(c, c.t);
  const buf = await ctx.startRendering();
  return wav(buf);
}

function wav(buf) {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Uint8Array(out.buffer);
}
