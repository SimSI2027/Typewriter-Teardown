#!/usr/bin/env node
// Acceptance tests of the visitor experience, in Chromium with the real autoplay policy (audio needs a gesture):
// the experience state machine (tour · paused · manual · idle · complete), Pause / Resume / Restart semantics, the
// takeover from every kind of input, idle resume, reduced motion, hidden tabs, and the audio lifecycle measured at the
// speakers (scripts/audio-probe.js taps every connection into ctx.destination, independently of the app).
//   npm run build && node tests/e2e/acceptance.mjs [--headed] [--url https://…/Typewriter-Teardown/]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from '../../scripts/serve.mjs';

const argv = process.argv.slice(2);
const remote = argv.includes('--url') ? argv[argv.indexOf('--url') + 1] : null;
const headed = argv.includes('--headed');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const label = argv.includes('--label') ? argv[argv.indexOf('--label') + 1] : remote ? 'live' : 'local';
const ARGS = [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--autoplay-policy=user-gesture-required'];
const OUT = path.resolve('validation/acceptance');
fs.mkdirSync(path.join(OUT, 'shots'), {recursive: true});
fs.mkdirSync(path.resolve('.cache/acceptance-fail'), {recursive: true});
const PROBE = fs.readFileSync(path.resolve('scripts/audio-probe.js'), 'utf8');
const results = [];

let srv = null;
let BASE = remote;
if (!remote) {
  assert.ok(fs.existsSync('dist/index.html'), 'run npm run build first');
  srv = await serve({dir: 'dist', base: '/Typewriter-Teardown/'});
  BASE = srv.url;
}
const browser = await chromium.launch({headless: !headed, args: ARGS});

async function open(opts = {}) {
  const ctx = await browser.newContext({viewport: {width: 1600, height: 900}, reducedMotion: opts.reducedMotion || 'no-preference'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    // the browser's own autoplay complaint means the page tried to start audio without a gesture
    if (/AudioContext was not allowed to start/i.test(m.text())) errors.push('autoplay warning: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`HTTP ${r.status()}: ${r.url()}`));
  await page.addInitScript(PROBE);
  await page.goto(opts.url || BASE);
  await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
  return {page, ctx, errors};
}
async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  let o = null;
  try {
    await fn((x) => (o = x));
    if (o) assert.deepEqual(o.errors, [], 'console errors / failed requests');
    results.push({name, ok: true, ms: Date.now() - t0});
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push({name, ok: false, ms: Date.now() - t0, err: e.message});
    console.log(`✖ ${name}\n   ${e.message.split('\n').join('\n   ')}`);
    if (o) await o.page.screenshot({path: path.resolve('.cache/acceptance-fail', `${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`)}).catch(() => {});
  } finally {
    if (o) await o.ctx.close().catch(() => {});
  }
}
const L = (page, f, a) => page.evaluate(f, a);
const X = (page) => L(page, () => LIVE.experience);
const btn = (page, k) => page.locator(`button[data-k="${k}"]`);
const click = async (page, k) => {
  await btn(page, k).click();
  await page.waitForTimeout(40);
};
const until = (page, f, a, timeout = 30000) => page.waitForFunction(f, a, {timeout});
const tourAt = (page, t) => until(page, (t) => LIVE.mode === 'tour' && LIVE.tourT >= t, t);
/** stage px → page px */
const toPage = async (page, [x, y]) => {
  const r = await page.evaluate(() => document.getElementById('app').getBoundingClientRect().toJSON());
  const s = await L(page, () => LIVE.scale);
  return [r.left + x * s, r.top + y * s];
};
const waitIdle = (page) => until(page, () => LIVE.state.t >= LIVE.session.end - 1e-6, null, 20000);
/** the probe's view of the speakers between two performance-clock times (s) */
const speakers = (page, a, b) => L(page, ([a, b]) => __AUDIO.window(a, b), [a, b]);
const pnow = (page) => L(page, () => __AUDIO.now());
const lastOf = (page, type) => L(page, (type) => LIVE.transitions.filter((e) => e.type === type).at(-1) || null, type);
/** the core Resume contract: the run continues at exactly the held position */
async function resumesAt(page, held, how = 'tourMain') {
  if (how === 'idle') await L(page, () => LIVE.idleFor(30));
  else await click(page, how);
  await until(page, () => LIVE.mode === 'tour');
  const ev = await lastOf(page, 'resume');
  assert.ok(ev, 'a resume transition');
  assert.equal(ev.tourT, held, `resumed at ${ev.tourT}, held ${held}`);
  const x = await X(page);
  assert.ok(x.tourT >= held && x.tourT < held + 0.5, `tour time after resume ${x.tourT} (held ${held})`);
  assert.equal(x.entry, how === 'idle' ? 'idle' : 'resume');
  return x;
}
/** a takeover by some input, from a running tour, at a point well into it */
async function takeoverBy(page, input, at = 9.8) {
  await tourAt(page, at);
  const t0 = await L(page, () => LIVE.tourT);
  await input();
  await until(page, () => LIVE.mode === 'manual');
  const ev = await lastOf(page, 'takeover');
  assert.ok(ev && ev.tourT >= t0 && ev.tourT < t0 + 1.5, `takeover at ${ev?.tourT}, input at ${t0}`);
  // the tour clock holds while the visitor has the machine
  await page.waitForTimeout(700);
  assert.equal(await L(page, () => LIVE.tourT), ev.tourT, 'tour time held in manual mode');
  assert.equal(await L(page, () => LIVE.cursorShown), false, 'the operator cursor is gone in manual mode');
  return ev.tourT;
}
async function enableSound(page) {
  await click(page, 'sound');
  await until(page, () => LIVE.audio.state === 'running', null, 5000);
}

// ------------------------------------------------------------------ sound
await test('sound: locked until a gesture, says so, and never pretends to be on', async (keep) => {
  const o = await open();
  keep(o);
  await o.page.waitForTimeout(1500);
  const a = await L(o.page, () => ({audio: LIVE.audio, created: __AUDIO.created, top: document.querySelector('[data-k="sound"]').textContent, side: document.querySelector('[data-k="mute"]').textContent, mode: LIVE.mode}));
  assert.equal(a.mode, 'tour');
  assert.equal(a.audio.status, 'locked');
  assert.equal(a.created, 0, 'no AudioContext before a gesture');
  assert.equal(a.top, 'ENABLE SOUND');
  assert.equal(a.side, 'ENABLE SOUND');
  await o.page.screenshot({path: path.join(OUT, 'shots', 'sound-locked.jpg'), type: 'jpeg', quality: 82});
});

await test('sound: ENABLE SOUND starts audio without stopping the tour; the tour is audible at the speakers', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 1);
  await click(o.page, 'sound');
  await until(o.page, () => LIVE.audio.state === 'running', null, 5000);
  const x = await X(o.page);
  assert.equal(x.mode, 'tour', 'the tour keeps playing');
  assert.equal(await L(o.page, () => LIVE.audio.status), 'on');
  assert.equal(await btn(o.page, 'sound').textContent(), 'SOUND ON');
  assert.ok((await L(o.page, () => LIVE.audio.muted)) === false, 'enabling sound must not mute it');
  const p0 = await pnow(o.page);
  await o.page.waitForTimeout(2500);
  const sp = await speakers(o.page, p0, p0 + 99);
  const au = await L(o.page, () => LIVE.audio);
  assert.ok(au.byKind.impact > 0 && au.byKind.escTick > 0 && au.byKind.carriageStep > 0 && au.byKind.keyTouch > 0, JSON.stringify(au.byKind));
  assert.ok(sp.peak > 0.02, `speaker peak ${sp.peak}`);
  assert.ok(au.gain > 0.5, `master gain ${au.gain}`);
  assert.equal(await L(o.page, () => __AUDIO.created), 1, 'one AudioContext');
});

await test('sound: manual keys, space, return and the platen ratchet are audible; each cue plays once', async (keep) => {
  const o = await open();
  keep(o);
  await o.page.waitForTimeout(800);
  // the first gesture is a key press: it unlocks audio and takes over
  await o.page.keyboard.type('a');
  await until(o.page, () => LIVE.mode === 'manual' && LIVE.audio.state === 'running', null, 5000);
  await waitIdle(o.page);
  assert.equal(await L(o.page, () => LIVE.session.glyphs.at(-1).ch), 'a', 'the takeover keystroke prints what was typed');
  const n0 = await L(o.page, () => ({played: LIVE.audio.played, starts: __AUDIO.starts}));
  const p0 = await pnow(o.page);
  await o.page.keyboard.type('q');
  await waitIdle(o.page);
  await o.page.waitForTimeout(250);
  const n1 = await L(o.page, () => ({played: LIVE.audio.played, starts: __AUDIO.starts, kinds: LIVE.audio.byKind}));
  // one character stroke: keyTouch keyBottom linkage impact escTick carriageStep ribbonFeed barRest = 8 cues, 12 voices
  assert.equal(n1.played - n0.played, 8, `cues per stroke ${n1.played - n0.played}`);
  assert.equal(n1.starts - n0.starts, 12, `voices per stroke ${n1.starts - n0.starts} (36 before the fix)`);
  const sp = await speakers(o.page, p0, p0 + 99);
  assert.ok(sp.peak > 0.02, `speaker peak for a keystroke ${sp.peak}`);
  await o.page.keyboard.press('Space');
  await o.page.keyboard.press('Enter');
  await waitIdle(o.page);
  await o.page.waitForTimeout(300);
  const k = await L(o.page, () => LIVE.audio.byKind);
  for (const kind of ['keyTouch', 'impact', 'escTick', 'carriageStep', 'spaceTouch', 'ratchet', 'carriageRun', 'marginStop']) assert.ok(k[kind] > 0, `${kind} never played: ${JSON.stringify(k)}`);
});

await test('sound: the tour rings the margin bell, returns the carriage and turns the platen ratchet, audibly', async (keep) => {
  const o = await open();
  keep(o);
  await enableSound(o.page);
  await L(o.page, () => LIVE.seek(22.6));
  const p0 = await pnow(o.page);
  await click(o.page, 'tourMain');
  await tourAt(o.page, 30.1);
  const k = await L(o.page, () => LIVE.audio.byKind);
  for (const kind of ['bell', 'ratchet', 'carriageRun', 'marginStop', 'impact']) assert.ok(k[kind] > 0, `${kind}: ${JSON.stringify(k)}`);
  assert.ok((await speakers(o.page, p0, p0 + 99)).peak > 0.05);
});

await test('sound: mute and volume work, survive pause / resume / takeover / restart, and persist', async (keep) => {
  const o = await open();
  keep(o);
  await enableSound(o.page);
  // volume slider: a quarter
  const v = await o.page.locator('[aria-label="VOLUME"]').boundingBox();
  await o.page.mouse.click(v.x + v.width * 0.25, v.y + v.height / 2);
  await o.page.waitForTimeout(250);
  let a = await L(o.page, () => LIVE.audio);
  assert.ok(a.volume > 0.2 && a.volume < 0.3 && Math.abs(a.gain - a.volume) < 0.02, `volume ${a.volume} gain ${a.gain}`);
  assert.equal(await L(o.page, () => LIVE.mode), 'tour', 'the volume slider does not stop the tour');
  // mute: no voices, silent speakers, while the tour keeps playing
  await click(o.page, 'mute');
  assert.equal(await L(o.page, () => LIVE.audio.status), 'off');
  assert.equal(await btn(o.page, 'sound').textContent(), 'SOUND OFF');
  await o.page.waitForTimeout(300);
  const m0 = await L(o.page, () => LIVE.audio.played);
  const p0 = await pnow(o.page);
  await click(o.page, 'tourMain'); // pause
  await click(o.page, 'tourMain'); // resume
  await o.page.waitForTimeout(1800);
  assert.equal(await L(o.page, () => LIVE.audio.played), m0, 'muted: nothing scheduled');
  assert.ok((await speakers(o.page, p0 + 0.2, p0 + 99)).peak < 0.002, 'muted: silent at the speakers');
  // unmute after the resume: sound comes back with the tour
  await click(o.page, 'sound');
  const p1 = await pnow(o.page);
  await o.page.waitForTimeout(2200);
  a = await L(o.page, () => LIVE.audio);
  assert.equal(a.status, 'on');
  assert.ok(a.played > m0, 'unmuted: cues again');
  assert.ok((await speakers(o.page, p1, p1 + 99)).peak > 0.005, 'unmuted: audible');
  // takeover and restart keep the engine running
  await L(o.page, () => LIVE.takeOver());
  await o.page.keyboard.type('k');
  await waitIdle(o.page);
  await click(o.page, 'tourRestart');
  await o.page.waitForTimeout(600);
  a = await L(o.page, () => LIVE.audio);
  assert.equal(a.state, 'running');
  // settings persist across a reload (mute here)
  await click(o.page, 'mute');
  await o.page.reload();
  await o.page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
  a = await L(o.page, () => LIVE.audio);
  assert.equal(a.muted, true, 'mute persisted');
  assert.ok(a.volume > 0.2 && a.volume < 0.3, `volume persisted ${a.volume}`);
  assert.equal(await btn(o.page, 'sound').textContent(), 'SOUND OFF');
});

await test('sound: a hidden tab suspends audio and freezes the tour; showing it resumes both', async (keep) => {
  const o = await open();
  keep(o);
  await enableSound(o.page);
  await tourAt(o.page, 3);
  // hide the tab by bringing another one to the front (real visibility in a headed window; emulated otherwise)
  const other = await o.ctx.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await o.page.waitForTimeout(400);
  let hidden = await L(o.page, () => document.hidden);
  if (!hidden) {
    await L(o.page, () => {
      Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    hidden = true;
  }
  await o.page.waitForTimeout(300);
  const h0 = await L(o.page, () => ({t: LIVE.tourT, a: LIVE.audio.state}));
  await o.page.waitForTimeout(1200);
  const h1 = await L(o.page, () => LIVE.tourT);
  assert.equal(h0.a, 'suspended', `audio while hidden ${h0.a}`);
  assert.equal(h1, h0.t, 'the tour clock holds while hidden');
  await L(o.page, () => {
    if (Object.getOwnPropertyDescriptor(document, 'hidden')) {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
  await o.page.bringToFront();
  await other.close();
  await until(o.page, () => !document.hidden && LIVE.audio.state === 'running', null, 5000);
  const h2 = await L(o.page, () => LIVE.tourT);
  await o.page.waitForTimeout(600);
  const h3 = await L(o.page, () => LIVE.tourT);
  assert.ok(h2 >= h1 && h2 < h1 + 0.4, `no jump on return: ${h1} → ${h2}`);
  assert.ok(h3 > h2, 'the tour continues');
});

// ------------------------------------------------------------------ the experience state machine (reproduction matrix)
await test('M1 load → tour → PAUSE → RESUME: the paused frame holds; resume continues from it', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 7.9);
  await click(o.page, 'tourMain');
  const x0 = await X(o.page);
  assert.equal(x0.mode, 'paused');
  const s0 = await L(o.page, () => ({tau: LIVE.state.t, cam: LIVE.drawn.cam, sub: LIVE.drawn.sub, cursor: LIVE.cursorShown, col: LIVE.state.col}));
  await o.page.screenshot({path: path.join(OUT, 'shots', 'M1-paused.jpg'), type: 'jpeg', quality: 82});
  await o.page.waitForTimeout(1500);
  const s1 = await L(o.page, () => ({tau: LIVE.state.t, cam: LIVE.drawn.cam, sub: LIVE.drawn.sub, cursor: LIVE.cursorShown, col: LIVE.state.col, tourT: LIVE.tourT}));
  assert.equal(s1.tourT, x0.tourT, 'tour time frozen');
  assert.equal(s1.tau, s0.tau, 'machine frozen');
  assert.deepEqual(s1.cam, s0.cam, 'camera frozen');
  assert.equal(s1.sub, s0.sub);
  assert.equal(s1.cursor, true, 'the cursor stays on its paused spot');
  assert.equal(await o.page.locator('.bar .st').textContent(), `PAUSED · ${x0.tourT.toFixed(1)} / 36.5 S`);
  assert.equal(await btn(o.page, 'pause').textContent(), 'RESUME', 'the transport button agrees');
  await resumesAt(o.page, x0.tourT);
  assert.ok(x0.tourT > 7.8, 'not from zero');
});

await test('M2 load → tour → camera button → RESUME', async (keep) => {
  const o = await open();
  keep(o);
  const held = await takeoverBy(o.page, () => click(o.page, 'cam_side'));
  assert.equal(await L(o.page, () => LIVE.view.camId), 'side');
  await resumesAt(o.page, held);
});

await test('M3 load → tour → subsystem button: manual, the view opens, the machine keeps working → RESUME', async (keep) => {
  const o = await open();
  keep(o);
  // take over in the middle of the slow-motion keystroke so a stroke is in progress
  const held = await takeoverBy(o.page, () => click(o.page, 'sub_escapement'), 11.6);
  const a = await L(o.page, () => ({sub: LIVE.view.sub, tau: LIVE.state.t, action: LIVE.state.action}));
  assert.equal(a.sub, 'escapement');
  await o.page.waitForTimeout(500);
  const b = await L(o.page, () => ({tau: LIVE.state.t, sub: LIVE.drawn.sub}));
  assert.ok(b.tau > a.tau, 'the machine clock runs after the takeover (not frozen)');
  await waitIdle(o.page);
  // the machine is usable in the subsystem view
  const n = await L(o.page, () => LIVE.session.glyphs.length);
  await o.page.keyboard.type('xy');
  await waitIdle(o.page);
  assert.equal(await L(o.page, () => LIVE.session.glyphs.length), n + 2);
  await o.page.screenshot({path: path.join(OUT, 'shots', 'M3-manual-escapement.jpg'), type: 'jpeg', quality: 82});
  await resumesAt(o.page, held);
  // the tour is back on its own script at the held time (its view there is IMPACT: ESCAPEMENT comes at 13.5 s)
  assert.equal(await L(o.page, () => LIVE.view.sub), 'impact');
});

await test('M4 load → tour → click a visible key: the stroke completes → RESUME', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 1.5);
  const id = await L(o.page, () => LIVE.CHAR_KEYS.findIndex((k) => k.lo === 'm'));
  const held = await takeoverBy(
    o.page,
    async () => {
      const pt = await L(o.page, (i) => LIVE.keyScreen(i), id);
      const [x, y] = await toPage(o.page, pt);
      await o.page.mouse.click(x, y);
    },
    1.5,
  );
  await waitIdle(o.page);
  assert.equal(await L(o.page, () => LIVE.session.glyphs.at(-1).ch), 'm');
  await resumesAt(o.page, held);
});

await test('M5 load → tour → orbit drag → RESUME (the camera blends back, no cut)', async (keep) => {
  const o = await open();
  keep(o);
  const held = await takeoverBy(o.page, async () => {
    await o.page.mouse.move(760, 330);
    await o.page.mouse.down();
    await o.page.mouse.move(900, 380, {steps: 8});
    await o.page.mouse.up();
  });
  const off = await L(o.page, () => LIVE.offset);
  assert.ok(Math.abs(off.az) > 5, `orbit ${off.az}`);
  const before = await L(o.page, () => LIVE.drawn.cam);
  await click(o.page, 'tourMain');
  const after = await L(o.page, () => LIVE.drawn.cam);
  assert.ok(Math.abs(after.az - before.az) < 6, `first resumed frame continues the visitor's camera (Δaz ${after.az - before.az})`);
  assert.equal((await lastOf(o.page, 'resume')).tourT, held);
});

await test('M6 load → tour → scroll zoom → RESUME', async (keep) => {
  const o = await open();
  keep(o);
  const held = await takeoverBy(o.page, async () => {
    await o.page.mouse.move(800, 420);
    await o.page.mouse.wheel(0, 260);
  });
  assert.ok((await L(o.page, () => LIVE.offset.k)) > 1);
  await resumesAt(o.page, held);
});

await test('M7 load → tour → physical keyboard → RESUME', async (keep) => {
  const o = await open();
  keep(o);
  const held = await takeoverBy(o.page, () => o.page.keyboard.type('Hello'));
  await waitIdle(o.page);
  assert.equal(await L(o.page, () => LIVE.session.glyphs.slice(-5).map((g) => g.ch).join('')), 'Hello');
  await resumesAt(o.page, held);
});

await test('M8 interrupted → idle countdown → automatic continuation from the interruption (never mid-use)', async (keep) => {
  const o = await open();
  keep(o);
  const held = await takeoverBy(o.page, () => click(o.page, 'sub_basket'));
  // quiet past the hint: the status counts down
  await L(o.page, () => LIVE.idleFor(12));
  await until(o.page, () => LIVE.mode === 'idle');
  assert.match(await o.page.locator('.bar .st').textContent(), /^MANUAL · TOUR RESUMES IN \d+ S$/);
  // the visitor holds a drag: no resume
  await o.page.mouse.move(700, 350);
  await o.page.mouse.down();
  await L(o.page, () => LIVE.idleFor(40));
  await o.page.waitForTimeout(400);
  assert.notEqual(await L(o.page, () => LIVE.mode), 'tour', 'no resume while the visitor holds a drag');
  await o.page.mouse.up();
  await resumesAt(o.page, held, 'idle');
});

await test('M9 tour completes → holds → RESTART TOUR plays from zero (RESUME never does)', async (keep) => {
  const o = await open();
  keep(o);
  await L(o.page, () => LIVE.seek(35.6));
  await click(o.page, 'tourMain');
  await until(o.page, () => LIVE.mode === 'complete', null, 10000);
  const x = await X(o.page);
  assert.equal(x.tourT, 36.5);
  assert.equal(await btn(o.page, 'tourMain').textContent(), 'RESTART TOUR');
  assert.equal(await btn(o.page, 'tourRestart').isVisible(), false);
  // the machine is the visitor's at the end of the tour
  const n = await L(o.page, () => LIVE.session.glyphs.length);
  await o.page.keyboard.type('z');
  await waitIdle(o.page);
  assert.equal(await L(o.page, () => LIVE.session.glyphs.length), n + 1);
  assert.equal(await L(o.page, () => LIVE.mode), 'complete');
  await click(o.page, 'tourMain');
  const r = await X(o.page);
  assert.equal(r.mode, 'tour');
  assert.equal(r.entry, 'restart');
  assert.ok(r.tourT < 0.2, `restart at ${r.tourT}`);
  // and RESTART TOUR from the middle of a run
  await tourAt(o.page, 2);
  await click(o.page, 'tourRestart');
  assert.ok((await L(o.page, () => LIVE.tourT)) < 0.2);
  assert.equal((await X(o.page)).entry, 'restart');
});

await test('M10 PAUSE → manual interaction → RESUME continues from the paused time', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 14.9);
  await click(o.page, 'tourMain');
  const held = await L(o.page, () => LIVE.tourT);
  await o.page.keyboard.type('ok');
  await until(o.page, () => LIVE.mode === 'manual');
  await waitIdle(o.page);
  await resumesAt(o.page, held);
});

await test('M11 mute → RESUME → unmute (covered in the sound tests) and M12 unlock → PAUSE → RESUME keeps sound', async (keep) => {
  const o = await open();
  keep(o);
  await enableSound(o.page);
  await tourAt(o.page, 4);
  await click(o.page, 'tourMain');
  await o.page.waitForTimeout(500);
  const held = await L(o.page, () => LIVE.tourT);
  const p0 = await pnow(o.page);
  await resumesAt(o.page, held);
  await o.page.waitForTimeout(2500);
  assert.equal(await L(o.page, () => LIVE.audio.state), 'running');
  assert.ok((await speakers(o.page, p0, p0 + 99)).peak > 0.02, 'audible after resume');
});

await test('controls that are not the machine never stop the tour (sound, volume, quality, panels, focus)', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 1);
  for (const k of ['sound', 'q_balanced', 'q_auto', 'panels']) {
    await click(o.page, k);
    assert.equal(await L(o.page, () => LIVE.mode), 'tour', `${k} stopped the tour`);
  }
  assert.equal(await L(o.page, () => LIVE.panels), false);
  await o.page.keyboard.press('Escape'); // panels back: not a takeover either
  assert.equal(await L(o.page, () => LIVE.panels), true);
  // a plain click on empty floor only wakes the sound
  await o.page.mouse.click(1240, 140);
  await o.page.keyboard.press('Tab');
  await o.page.waitForTimeout(200);
  assert.equal(await L(o.page, () => LIVE.mode), 'tour');
  const t = await L(o.page, () => LIVE.tourT);
  await o.page.waitForTimeout(500);
  assert.ok((await L(o.page, () => LIVE.tourT)) > t + 0.3, 'still running');
});

await test('timeline and step scrub the tour (paused) and RESUME plays on from the scrubbed point', async (keep) => {
  const o = await open();
  keep(o);
  await tourAt(o.page, 1);
  const tl = await o.page.locator('[aria-label="TIMELINE"]').boundingBox();
  await o.page.mouse.click(tl.x + tl.width * 0.5, tl.y + tl.height / 2);
  let x = await X(o.page);
  assert.equal(x.mode, 'paused');
  assert.ok(Math.abs(x.tourT - 18.25) < 0.4, `scrubbed to ${x.tourT}`);
  await click(o.page, 'stepF');
  const x2 = await X(o.page);
  assert.ok(x2.tourT > x.tourT && x2.mode === 'paused');
  await resumesAt(o.page, x2.tourT, 'pause');
});

await test('M14 reduced motion: no autoplay, no idle resume, a still camera; PLAY TOUR still plays from 0', async (keep) => {
  const o = await open({reducedMotion: 'reduce'});
  keep(o);
  let x = await X(o.page);
  assert.equal(x.mode, 'manual');
  assert.equal(x.reduced, true);
  assert.equal(await o.page.locator('.bar .st').textContent(), 'MANUAL · REDUCED MOTION');
  assert.equal(await btn(o.page, 'tourMain').textContent(), 'PLAY TOUR');
  const c0 = await L(o.page, () => LIVE.drawn.cam);
  await L(o.page, () => LIVE.idleFor(60));
  await o.page.waitForTimeout(1200);
  x = await X(o.page);
  assert.equal(x.mode, 'manual', 'no automatic start');
  assert.deepEqual(await L(o.page, () => LIVE.drawn.cam), c0, 'no camera drift');
  await click(o.page, 'tourMain');
  x = await X(o.page);
  assert.equal(x.mode, 'tour');
  assert.equal(x.entry, 'start');
  assert.ok(x.tourT < 0.2);
});

await browser.close();
if (srv) await srv.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, `results-${label}.json`), JSON.stringify({date: new Date().toISOString(), base: BASE, headed, results}, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
