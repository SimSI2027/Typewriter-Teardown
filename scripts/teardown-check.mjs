#!/usr/bin/env node
// Visitor's-eye check of the production build in headed Chromium: the hero and tour states, the status bar in every
// mode, and the representative subsystem teardowns operated by hand (take over from the tour with the subsystem
// button, press keys / RETURN / SHIFT while it is open, then REASSEMBLE, the idle countdown and RESUME). Writes
// JPEG frames and one contact sheet per set, plus a JSON record of each step (mode, tour time, view, column, action).
//   npm run build && node scripts/teardown-check.mjs [--out validation/acceptance/teardown] [--url …] [--headless]
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {serve} from './serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const OUT = path.resolve(arg('--out', 'validation/acceptance/teardown'));
const remote = arg('--url', null);
fs.mkdirSync(OUT, {recursive: true});
const srv = remote ? null : await serve({dir: arg('--dist', 'dist'), base: '/Typewriter-Teardown/'});
const browser = await chromium.launch({headless: argv.includes('--headless'), args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required']});
const page = await (await browser.newContext({viewport: {width: 1600, height: 900}})).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(remote || srv.url);
// the loading screen, as the visitor first sees it
await page.waitForTimeout(250);
await page.screenshot({path: path.join(OUT, '00-loading.jpg'), type: 'jpeg', quality: 80});
await page.waitForFunction(() => window.LIVE && window.SIM_SHOWN, null, {timeout: 90000});
const loadMs = Date.now() - t0;
const L = (f, a) => page.evaluate(f, a);
const has = (k) => L((k) => !!document.querySelector(`button[data-k="${k}"]`), k);
const click = async (k, label) => {
  if (await has(k)) await page.locator(`button[data-k="${k}"]`).click();
  else await page.getByRole('button', {name: label, exact: true}).first().click();
};
const shot = (name) => page.screenshot({path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 84});
const rec = {loadMs, steps: []};
const note = async (name) => rec.steps.push({name, ...(await L(() => ({mode: window.LIVE.mode ?? (LIVE.tour ? 'tour' : 'manual'), tourT: LIVE.tourT ?? null, cam: LIVE.view.camId, sub: LIVE.view.sub, col: LIVE.state.col, action: LIVE.state.action})))});
const waitT = (t) => page.waitForFunction((t) => (LIVE.tourT ?? 0) >= t, t, {timeout: 60000});
const idle = () => page.waitForFunction(() => LIVE.state.t >= LIVE.session.end - 1e-6, null, {timeout: 20000});

// ------------------------------------------------------------ the tour as it plays
for (const [t, n] of [[1.2, '01-tour-hero'], [5.6, '02-tour-linkage'], [12.0, '03-tour-impact'], [15.6, '04-tour-escapement'], [32.6, '05-tour-explode']]) {
  if (await L(() => 'tourT' in LIVE)) await waitT(t);
  else await page.waitForTimeout(t === 1.2 ? 1200 : 3000);
  await shot(n);
  await note(n);
}
// ------------------------------------------------------------ the status bar in each mode
if (await has('tourMain')) {
  await L(() => LIVE.restart());
  await waitT(6.2);
  await click('tourMain');
  await page.waitForTimeout(300);
  await shot('10-paused');
  await note('10-paused');
  await click('tourMain');
  await waitT(9.9);
}
// ------------------------------------------------------------ subsystem teardowns, operated by hand
const SUBS = [
  ['linkage', 'Subsystem key linkage', 'f'],
  ['basket', 'Subsystem typebar basket', 'o'],
  ['impact', 'Subsystem impact', 'r'],
  ['ribbonFeed', 'Subsystem ribbon feed', 'a'],
  ['escapement', 'Subsystem escapement', 'l'],
  ['carriage', 'Subsystem carriage', ' '],
  ['shift', 'Subsystem shift', 'G'],
  ['ret', 'Subsystem carriage return', '\n'],
  ['platen', 'Subsystem platen', '\n'],
  ['explode', 'Subsystem full explode', 'k'],
];
let i = 20;
for (const [id, label, key] of SUBS) {
  await click('sub_' + id, label);
  await page.waitForTimeout(1700);
  await shot(`${i}-${id}-open`);
  await note(`${i}-${id}-open`);
  // operate it: the visitor's key while the teardown is open; the frame is caught mid-stroke
  if (key === '\n') await page.keyboard.press('Enter');
  else if (key === ' ') await page.keyboard.press('Space');
  else await page.keyboard.type(key);
  await page.waitForTimeout(key === '\n' ? 520 : 140);
  await shot(`${i}-${id}-working`);
  await note(`${i}-${id}-working`);
  await idle();
  i++;
}
// ------------------------------------------------------------ reassemble, resume
await click('reassemble', 'REASSEMBLE');
await page.waitForTimeout(1500);
await shot('40-reassembled');
await note('40-reassembled');
if (await has('tourMain')) {
  await L(() => LIVE.idleFor(12));
  await page.waitForTimeout(400);
  await shot('41-idle-countdown');
  await note('41-idle-countdown');
  await click('tourMain');
  await page.waitForTimeout(500);
  await shot('42-resumed');
  await note('42-resumed');
}
rec.errors = errors;
fs.writeFileSync(path.join(OUT, 'teardown-check.json'), JSON.stringify(rec, null, 1));
await browser.close();
if (srv) await srv.close();
// contact sheets
const files = fs.readdirSync(OUT).filter((f) => /^\d\d-.*\.jpg$/.test(f)).sort();
const sheet = (list, name, cols = 4) => {
  if (!list.length) return;
  const inputs = list.flatMap((f) => ['-i', path.join(OUT, f)]);
  const n = list.length;
  const rows = Math.ceil(n / cols);
  const pads = cols * rows - n;
  const filt = list.map((f, k) => `[${k}:v]scale=480:-1,drawtext=text='${f.replace('.jpg', '')}':x=6:y=6:fontsize=14:fontcolor=black:box=1:boxcolor=white@0.8[v${k}]`).join(';') + ';' + Array.from({length: pads}, (_, k) => `color=c=white:s=480x270:d=1[p${k}]`).join(';') + (pads ? ';' : '') + `${list.map((_, k) => `[v${k}]`).join('')}${Array.from({length: pads}, (_, k) => `[p${k}]`).join('')}xstack=inputs=${cols * rows}:layout=${Array.from({length: cols * rows}, (_, k) => `${(k % cols) * 480}_${Math.floor(k / cols) * 270}`).join('|')}[out]`;
  try {
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filt, '-map', '[out]', '-frames:v', '1', '-q:v', '3', path.join(OUT, name)]);
  } catch (e) {
    console.log('sheet failed', e.message.slice(0, 200));
  }
};
sheet(files.filter((f) => /^(0|1|4)/.test(f)), 'sheet-tour-status.jpg');
sheet(files.filter((f) => /^[23]\d-/.test(f)), 'sheet-teardowns.jpg', 4);
console.log(JSON.stringify({loadMs, errors, steps: rec.steps.length}));
