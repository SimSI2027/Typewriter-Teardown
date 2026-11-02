#!/usr/bin/env node
// Look check: a fixed set of deterministic stills from the film page (the tour at a few moments, the main cameras)
// side by side in one sheet, so a material, light or framing change can be judged against the last one.
//   npm run build && node scripts/look.mjs --out .cache/look-a.jpg
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {openFilm} from './capture.mjs';

const argv = process.argv.slice(2);
const out = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : '.cache/look.jpg');
const dir = out.replace(/\.jpg$/, '-frames');
fs.mkdirSync(dir, {recursive: true});
const {page, close} = await openFilm({dprOverride: 1});
const SHOTS = [
  ['tour-1.2', (t) => SIM.render(t), 1.2],
  ['tour-8.5-basket', (t) => SIM.render(t), 8.5],
  ['operator', (t) => SIM.preview(t, {cam: 'operator'}), 3],
  ['typebars', (t) => SIM.preview(t, {cam: 'typebars'}), 3],
  ['keyboard', (t) => SIM.preview(t, {cam: 'keyboard'}), 3],
  ['side', (t) => SIM.preview(t, {cam: 'side'}), 3],
];
const files = [];
for (const [name, fn, t] of SHOTS) {
  await page.evaluate(`(${fn.toString()})(${t})`);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const f = path.join(dir, `${name}.png`);
  await page.screenshot({path: f});
  files.push(f);
}
await close();
const inputs = files.flatMap((f) => ['-i', f]);
const cols = 2;
const lay = files.map((_, k) => `${(k % cols) * 800}_${Math.floor(k / cols) * 450}`).join('|');
const filt = files.map((_, k) => `[${k}:v]scale=800:450[v${k}]`).join(';') + ';' + files.map((_, k) => `[v${k}]`).join('') + `xstack=inputs=${files.length}:layout=${lay}[o]`;
execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', filt, '-map', '[o]', '-frames:v', '1', '-q:v', '3', out]);
console.log(out);
