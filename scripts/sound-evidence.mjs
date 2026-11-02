#!/usr/bin/env node
// Sound evidence from the production build in a real (headed) Chromium with the autoplay policy on: records the exact
// mix handed to the audio device (a MediaStreamDestination fed by the same tap as scripts/audio-probe.js) while the
// tour plays, while the visitor types, returns the carriage and the tour rings the bell, then measures each clip with
// ffmpeg (EBU R128 loudness, true peak) and draws its waveform. It also checks the output device's clock advances
// (AudioContext.getOutputTimestamp), i.e. the hardware is consuming what the page plays.
//   npm run build && node scripts/sound-evidence.mjs [--url …] [--headless]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const argv = process.argv.slice(2);
const remote = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'validation/acceptance/sound');
const TMP = path.resolve('.cache/sound');
fs.mkdirSync(OUT, {recursive: true});
fs.mkdirSync(TMP, {recursive: true});
const FF = process.env.FFMPEG || 'ffmpeg';
const srv = remote ? null : await serve({dir: 'dist', base: '/Typewriter-Teardown/'});
const BASE = remote || srv.url;
const browser = await chromium.launch({headless: argv.includes('--headless'), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required']});
const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(fs.readFileSync(path.resolve('scripts/audio-probe.js'), 'utf8'));
// the recorder: everything the probe's analyser receives (= everything connected to the destination) → a stream
await page.addInitScript(() => {
  const Base = window.AudioContext;
  window.AudioContext = class extends Base {
    constructor(...a) {
      super(...a);
      this.__rec = this.createMediaStreamDestination();
      this.__an.connect(this.__rec);
      window.__REC_CTX = this;
    }
  };
  window.__record = (ms) =>
    new Promise((resolve) => {
      const ctx = window.__REC_CTX;
      const rec = new MediaRecorder(ctx.__rec.stream, {mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 256000});
      const parts = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = async () => {
        const b = new Uint8Array(await new Blob(parts).arrayBuffer());
        let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        resolve(btoa(s));
      };
      rec.start();
      setTimeout(() => rec.stop(), ms);
    });
});
await page.goto(BASE);
await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
const L = (f, a) => page.evaluate(f, a);
const report = {base: BASE, clips: {}};
report.beforeGesture = await L(() => ({status: LIVE.audio.status, contexts: __AUDIO.created}));
await page.locator('button[data-k="sound"]').click();
await page.waitForFunction(() => LIVE.audio.state === 'running');
const ctxInfo = await L(async () => {
  const c = window.__REC_CTX;
  const a = c.getOutputTimestamp();
  await new Promise((r) => setTimeout(r, 500));
  const b = c.getOutputTimestamp();
  return {state: c.state, sampleRate: c.sampleRate, baseLatency: c.baseLatency, outputLatency: c.outputLatency, sinkId: c.sinkId ?? null, deviceClockAdvance: +(b.contextTime - a.contextTime).toFixed(3)};
});
report.device = ctxInfo;
const clip = async (name, ms, during) => {
  const p = L((ms) => window.__record(ms), ms);
  if (during) await during();
  const b64 = await p;
  const webm = path.join(TMP, `${name}.webm`);
  fs.writeFileSync(webm, Buffer.from(b64, 'base64'));
  const wav = path.join(TMP, `${name}.wav`);
  execFileSync(FF, ['-y', '-v', 'error', '-i', webm, '-ar', '48000', wav]);
  const r128 = execFileSync(FF, ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).toString();
  let log = r128;
  try {
    execFileSync(FF, ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], {stdio: ['ignore', 'ignore', 'pipe']});
  } catch {
    /* ebur128 prints to stderr */
  }
  const res = (() => {
    const out = execFileSync(process.execPath, ['-e', `const {spawnSync}=require('child_process');const r=spawnSync(${JSON.stringify(FF)},['-hide_banner','-nostats','-i',${JSON.stringify(wav)},'-af','ebur128=peak=true','-f','null','-']);process.stdout.write(r.stderr.toString())`]).toString();
    const I = /I:\s+(-?[\d.]+) LUFS/.exec(out.split('Summary:')[1] || '')?.[1];
    const P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(out.split('Summary:')[1] || '')?.[1];
    return {integratedLUFS: I != null ? +I : null, truePeak_dBFS: P === '-inf' ? -Infinity : P != null ? +P : null};
  })();
  void log;
  execFileSync(FF, ['-y', '-v', 'error', '-i', wav, '-filter_complex', 'showwavespic=s=1600x240:split_channels=0:colors=#17181b', '-frames:v', '1', path.join(OUT, `${name}.png`)]);
  report.clips[name] = {seconds: ms / 1000, ...res};
  console.log(name, JSON.stringify(report.clips[name]));
};
// 1. the tour (keystrokes in slow motion and at speed)
await clip('tour-0-6s', 6000);
// 2. the visitor takes over by typing
await clip('manual-typing', 5000, async () => {
  await page.keyboard.type('the quick brown fox', {delay: 120});
});
// 3. carriage return: lever, platen ratchet, carriage run, margin stop
await clip('manual-return', 2500, async () => {
  await page.waitForFunction(() => LIVE.state.t >= LIVE.session.end - 1e-6);
  await page.locator('button[data-k="ret"]').click();
});
// 4. the tour's margin bell and return, resumed from a held point
await L(() => LIVE.restart());
await L(() => LIVE.seek(22.7));
await clip('tour-bell-return', 8000, async () => {
  await page.locator('button[data-k="tourMain"]').click();
});
// 5. muted: silence
await page.locator('button[data-k="sound"]').click();
await clip('muted', 2500);
report.byKind = await L(() => LIVE.audio.byKind);
report.errors = errors;
fs.writeFileSync(path.join(OUT, 'sound-evidence.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({device: report.device, beforeGesture: report.beforeGesture, errors}, null, 1));
await browser.close();
if (srv) await srv.close();
