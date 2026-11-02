// Reproduces the user-observed defects of a build with the real autoplay policy, headed, and records them (old API:
// LIVE.tour / LIVE.state / the .chip). Used once on the baseline 6367226: DIST=<its dist> node scripts/repro-baseline.mjs
// → validation/acceptance/before/repro.json. It measures through scripts/audio-probe.js, independent of the app.
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {serve} from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'validation/acceptance/before');
fs.mkdirSync(OUT, {recursive: true});
const srv = await serve({dir: process.env.DIST || path.join(ROOT, 'dist'), base: '/Typewriter-Teardown/'});
const browser = await chromium.launch({headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required']});
const probe = fs.readFileSync(path.join(ROOT, 'scripts/audio-probe.js'), 'utf8');
const R = {};
async function open() {
  const ctx = await browser.newContext({viewport: {width: 1600, height: 900}});
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.addInitScript(probe);
  await page.goto(srv.url);
  await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
  return {page, ctx, logs};
}
const L = (page, f, a) => page.evaluate(f, a);
const snap = (page) => L(page, () => ({tour: LIVE.tour, tau: +LIVE.state.t.toFixed(3), paused: LIVE.paused, muted: LIVE.muted, cam: LIVE.view.camId, sub: LIVE.view.sub, ctx: __AUDIO.state(), created: __AUDIO.created, starts: __AUDIO.starts, chip: document.querySelector('.chip').textContent, mute: [...document.querySelectorAll('button')].find((b) => /SOUND/.test(b.textContent))?.textContent}));
const audio = (page, a, b) => L(page, ([a, b]) => __AUDIO.window(a, b), [a, b]);
const nowP = (page) => L(page, () => __AUDIO.now());

// 1. load: the tour runs; is there any sound, any affordance?
{
  const {page, ctx, logs} = await open();
  const t0 = await nowP(page);
  await page.waitForTimeout(4000);
  R.load = {...(await snap(page)), audio: await audio(page, t0, t0 + 10)};
  await page.screenshot({path: path.join(OUT, '01-load-tour-silent.jpg'), type: 'jpeg', quality: 82});
  // 2. the visitor clicks the sound button (it reads SOUND ON although no AudioContext exists)
  const tb = await snap(page);
  await page.getByRole('button', {name: 'SOUND ON', exact: true}).click();
  await page.waitForTimeout(300);
  R.clickSoundOn = {before: tb, after: await snap(page)};
  await page.screenshot({path: path.join(OUT, '02-after-sound-click.jpg'), type: 'jpeg', quality: 82});
  // the visitor types: muted by their own click
  const t1 = await nowP(page);
  await page.keyboard.type('abc');
  await page.waitForTimeout(1500);
  R.typeAfterSoundClick = {...(await snap(page)), audio: await audio(page, t1, t1 + 10)};
  R.load.logs = logs.slice();
  await ctx.close();
}
// 3. subsystem click mid-tour, then RESUME TOUR
{
  const {page, ctx, logs} = await open();
  await page.waitForFunction(() => LIVE.state.t > 5.2, null, {timeout: 30000});
  const before = await snap(page);
  await page.getByRole('button', {name: 'Subsystem escapement', exact: true}).click();
  await page.waitForTimeout(1500);
  const after = await snap(page);
  await page.screenshot({path: path.join(OUT, '03-after-subsystem-click.jpg'), type: 'jpeg', quality: 82});
  const tA = await L(page, () => LIVE.state.t);
  await page.waitForTimeout(1000);
  const tB = await L(page, () => LIVE.state.t);
  await page.locator('.chip').click();
  await page.waitForTimeout(50);
  const resumed = await snap(page);
  await page.screenshot({path: path.join(OUT, '04-after-resume-click.jpg'), type: 'jpeg', quality: 82});
  R.subsystemThenResume = {before, after, machineAdvancingAfterTakeover: +(tB - tA).toFixed(3), resumed, logs};
  await ctx.close();
}
// 4. PAUSE mid-tour, then RESUME (chip) and PLAY (transport)
{
  const {page, ctx, logs} = await open();
  await page.waitForFunction(() => LIVE.state.t > 6, null, {timeout: 30000});
  const before = await snap(page);
  await page.getByRole('button', {name: 'PAUSE', exact: true}).click();
  await page.waitForTimeout(800);
  const paused = await snap(page);
  await page.screenshot({path: path.join(OUT, '05-after-pause.jpg'), type: 'jpeg', quality: 82});
  await page.getByRole('button', {name: 'PLAY', exact: true}).click();
  await page.waitForTimeout(800);
  const played = await snap(page);
  await page.locator('.chip').click();
  await page.waitForTimeout(50);
  const resumed = await snap(page);
  R.pauseThenResume = {before, paused, playedTransport: played, resumedChip: resumed, logs};
  await ctx.close();
}
// 5. wheel first (not a user activation), then type
{
  const {page, ctx, logs} = await open();
  await page.waitForTimeout(1500);
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(300);
  const afterWheel = await snap(page);
  const t1 = await nowP(page);
  await page.keyboard.type('x');
  await page.waitForTimeout(1200);
  const s1 = await snap(page);
  R.wheelThenType = {afterWheel, afterType: s1, audio: await audio(page, t1, t1 + 10), log: await L(page, () => __AUDIO.log), logs};
  // duplicate scheduling: voices started by one character stroke (12 voices expected: see sound.js / actionCues)
  const n0 = await L(page, () => __AUDIO.starts);
  await page.keyboard.type('y');
  await page.waitForTimeout(1200);
  R.voicesPerChar = (await L(page, () => __AUDIO.starts)) - n0;
  // 6. idle after takeover: the tour comes back — from where?
  await L(page, () => LIVE.idleFor(30));
  await page.waitForTimeout(200);
  R.idleResume = await snap(page);
  await ctx.close();
}
fs.writeFileSync(path.join(OUT, 'repro.json'), JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await browser.close();
await srv.close();
